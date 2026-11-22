import { createHash, createHmac } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { clientIpKey } from "./lib/client-ip";
import { partialLimiter, resultLimiter } from "./lesson-result-limits";
import { and, eq, gt, inArray, like, lt, or, sql } from "drizzle-orm";
import cron from "node-cron";
import { db } from "./db";
import { arbiterVerdicts, lessonResultEmails, lessons, users } from "../shared/schema";
import { lessonSchema } from "../shared/lesson-schema";
import { buildResultEmail, GUEST_LEARNER, gradePartialQuiz, gradeQuiz, gradeTasks, resultRequestSchema, roundClaimSchema, type GradedQuiz, type GradedTasks } from "../shared/lesson-result-email";
import { claimLimiter } from "./lesson-result-limits";
import { experienceRoundSizes } from "../shared/lesson-experience";
import { roundTooOld } from "../shared/quiz-round";
import { resolveAdminRecipients } from "./lib/material-result";
import { arbiterCacheKey } from "./arbiter/arbiter";
import { getMaterialPreviewUrl } from "./utils/config";
import type { AttemptAnswer, AttemptQuestion } from "../shared/lesson-attempt";
import { logger } from "./lib/logger";
import { recordLearnerActivity, resolveLearner } from "./learners";
import { contributorKey, maybeRelaxTightening, recordTaskResults } from "./task-results";

/**
 * Tanulói eredmény e-mailben az adminoknak (docs/specs/2026-10-17-eredmeny-email.md) — „motorháztető alatt”: a tanuló felülete
 * nem függ tőle. Körönként egy levél (lesson_result_emails egyedi kulcs), a pontozás a szerveren fut (a kliens pontszámát nem
 * fogadjuk), a címzettek az ADMIN_EMAILS listája.
 */
export type Sender = (subject: string, html: string, to: string, idempotencyKey: string) => Promise<unknown>;
let sender: Sender | null = null;
/** Teszthez: a valódi Resend-küldő helyett. */
export function setResultSender(next: Sender | null) { sender = next; }
async function send(subject: string, html: string, to: string, idempotencyKey: string) {
  if (sender) return sender(subject, html, to, idempotencyKey);
  // Biztonság: tesztfuttatásban (NODE_ENV=test) valódi levél sosem megy, csak a teszt által beállított küldőn át.
  if (process.env.NODE_ENV === "test") throw new Error("Tesztkörnyezetben nincs valódi e-mail-küldés.");
  const { sendAdminNotification } = await import("./resend");
  // Átfogó review: a tárgy a tanuló keresztnevét tartalmazhatja — csendes küldés (a név nem kerül a naplóba).
  return sendAdminNotification(subject, html, to, { quiet: true, idempotencyKey });
}

/** Review K3: a naplóba csak a hiba osztálya és (ha van) kódja kerül — üzenet, paraméter, cím nem. */
export function errorClass(error: unknown): string {
  const e = error as { name?: unknown; code?: unknown; cause?: { name?: unknown; code?: unknown } } | null;
  const name = typeof e?.name === "string" && /^[A-Za-z0-9_]{1,60}$/.test(e.name) ? e.name : "Error";
  const code = [e?.code, e?.cause?.code].find(c => (typeof c === "string" || typeof c === "number") && /^[A-Za-z0-9_]{1,40}$/.test(String(c)));
  return code === undefined ? name : `${name} (${code})`;
}

/**
 * Review (2026-11-17): a szolgáltatónak adott idempotencia-kulcs — ugyanarra a körre és címzettre mindig ugyanaz (az időkorlát utáni
 * újrapróba így nem kézbesít másodszor, ha az első küldés mégis célba ért), más körre / fajtára / címzettre más. Lenyomat: a kulcsban
 * nincs e-mail-cím.
 */
export function resultIdempotencyKey(lessonId: string, kind: string, roundKey: string, to: string): string {
  return `lesson-result/${createHash("sha256").update([lessonId, kind, roundKey, to.trim().toLowerCase()].join("|")).digest("hex")}`;
}
/**
 * Terv R31 (review 4642333188): a munkamenet fiókjának álnevesített kilét-címkéje — a `GET /api/csrf-token` adja a kliensnek, a kliens a
 * kimenő bejegyzésbe írja (`subject`). Fiók nélkül `anon`; fiókkal a SESSION_SECRET-tel kulcsolt HMAC rövid lenyomata (nem visszafejthető,
 * fiókonként más). A beküldés, ha a címke nem egyezik a mostani munkamenetével, a munkamenet fiókját nem használja.
 */
export function resultSubjectOf(userId: string | undefined): string {
  if (!userId) return "anon";
  return createHmac("sha256", process.env.SESSION_SECRET || "websuli-result-subject").update(`result-subject|${userId}`).digest("base64url").slice(0, 22);
}
/** Az újrapróba késleltetése (a meghiúsult címzett és a váratlan kivétel után is). */
let retryDelayMs = 60_000;
/** Teszthez: a késleltetés rövidítése; a korábbi értéket adja vissza. */
export function setRetryDelay(ms: number): number { const previous = retryDelayMs; retryDelayMs = ms; return previous; }

/**
 * PR #495 (Codex P2): a foglalás felszabadítása korlátozott újrapróbával — ha a küldés bukik ÉS az első `array_remove` is átmeneti
 * adatbázishibát kap, a címzett különben végleg a `delivered` listában ragadna, és minden későbbi hívás ismétlődésnek venné. A végleg
 * sikertelen felszabadítás csak a hiba osztályával naplózódik; ezt a (nem helyreállítható) esetet a kanban #128 fedi.
 */
const RELEASE_ATTEMPTS = 3;
let releaseBackoffMs = 200;
let releaseFault: (() => void) | null = null;
/** Teszthez: hibainjektálás a felszabadítás kísérletei elé (dobhat), és a kísérletek közti várakozás. */
export function setReleaseFault(fault: (() => void) | null, backoffMs = 200): void { releaseFault = fault; releaseBackoffMs = backoffMs; }
async function releaseClaim(id: string, to: string): Promise<boolean> {
  for (let attempt = 1; attempt <= RELEASE_ATTEMPTS; attempt++) {
    try {
      releaseFault?.();
      await db.update(lessonResultEmails).set({ delivered: sql`array_remove(${lessonResultEmails.delivered}, ${to})` }).where(eq(lessonResultEmails.id, id));
      return true;
    } catch (error) {
      if (attempt === RELEASE_ATTEMPTS) {
        logger.error(`[LESSON-RESULT] a foglalás felszabadítása ${RELEASE_ATTEMPTS} kísérlet után sem sikerült (kanban #128): ${errorClass(error)}`);
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, releaseBackoffMs * attempt));
    }
  }
  return false;
}

/** Review K2: a levélküldés időkorlátja (a szolgáltató hívása nem tarthatja korlátlanul a kézbesítés-foglalást). */
let sendTimeoutMs = 30_000;
/** Teszthez: az időkorlát rövidítése; a korábbi értéket adja vissza. */
export function setSendTimeout(ms: number): number { const previous = sendTimeoutMs; sendTimeoutMs = ms; return previous; }
class SendTimeoutError extends Error { constructor() { super("A levélküldés időkorlátja lejárt."); this.name = "SendTimeoutError"; } }
function withSendTimeout<T>(sending: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new SendTimeoutError()), sendTimeoutMs); timer.unref?.(); });
  return Promise.race([sending, limit]).finally(() => clearTimeout(timer));
}

export const roundKeyOf = (...parts: string[]) => createHash("sha256").update(parts.join("|")).digest("hex");

/**
 * Küldés a címzettlistának; körönként (lecke, fajta, roundKey) egy levél címzettenként. Review #280: a kézbesítés címzettenként
 * nyilvántartott (`delivered`: kézbesítve VAGY éppen küldés alatt — a foglalás a küldés ELŐTT, atomi módosítással történik) — a
 * meghiúsult címzett a következő azonos hívással és egy 60 s-os automatikus újrapróbálással pótolódik, a már kézbesített (vagy más
 * hívás által éppen küldött) nem kap másodikat. Sosem dob — a hiba a naplóba megy.
 */
export type SendOutcome = { sent: number; duplicate: boolean };
/**
 * Spec 2026-11-17-eredmeny-email-kviz (R1): küldés előtti KAPU — MINDEN küldési kísérletet körbevesz (az első küldést és a 60 s-os
 * újrapróbát is). A „félbehagyva” levél kapuja a körönkénti kizárás alatt ellenőrzi, hogy a kör közben véglegesült-e; ha igen, a
 * kísérlet el sem indul (véglegesített körre részleges levél az újrapróbából sem megy ki).
 */
export type SendGate = (attempt: () => Promise<SendOutcome>) => Promise<SendOutcome>;
type SendInput = { lessonId: string; roundKey: string; learner: string; learnerFirst?: string; learnerId?: string; guest?: boolean; graded: GradedTasks | GradedQuiz };
/**
 * Terv R38 (6. kör L5): a bemenet késleltetett is lehet — a feloldása (pl. a tanuló nevének lekérdezése) a küldési kísérleten BELÜL fut,
 * így a hibája ugyanúgy egy újrapróbát kap, mint a küldésé, és a ciklus végén az `onSettled` lefut.
 */
type SendSource = SendInput | (() => Promise<SendInput>);
/**
 * Terv R34 (review 4642333345): `onSettled` akkor hívódik (egyszer), amikor a küldési ciklus véget ért — az utolsó kísérlet lefutott, és
 * további újrapróba már nem ütemeződik. A „félbehagyva” levél első rögzítőjének kiléte eddig őrződik.
 */
/**
 * Terv R41 (7. vak kör L3): az újrapróba ütemezője — alapból `setTimeout`; a „félbehagyva” út a sajátját adja, hogy a halasztott
 * újrapróba nyilvántartott legyen, és leállításkor előrehozható.
 */
export type RetryScheduler = (run: () => Promise<unknown>, delayMs: number) => void;
export async function sendLessonResult(input: SendSource, retry = true, gate?: SendGate, onSettled?: () => void, schedule?: RetryScheduler): Promise<SendOutcome> {
  let rescheduled = false;
  const again = () => {
    rescheduled = true;
    const run = () => sendLessonResult(input, false, gate, onSettled, schedule);
    if (schedule) schedule(run, retryDelayMs);
    else setTimeout(() => { void run(); }, retryDelayMs).unref?.();
  };
  try {
    if (!gate) return await attemptLessonResult(input, retry, again);
    try { return await gate(() => attemptLessonResult(input, retry, again)); }
    catch (error) {
      // A kapu hibája (pl. az ellenőrző lekérdezés átmeneti adatbázishibája) után nem küldünk vakon. Terv R19 (Vercel-szál 4626976445): a
      // levél ettől nem veszhet el — EGY újrapróba ütemeződik a szokott késleltetéssel, ugyanazon a kapun át (véglegesített körre így sem
      // megy ki részleges levél). Az újrapróba hibája után nincs további; a napló csak a hiba osztályát írja. Sosem dob.
      logger.error(`[LESSON-RESULT] a küldés előtti ellenőrzés nem sikerült: ${errorClass(error)}${retry ? " — újrapróbálja" : ""}`);
      if (retry) again();
      return { sent: 0, duplicate: false };
    }
  } finally {
    if (!rescheduled) onSettled?.();
  }
}
async function attemptLessonResult(source: SendSource, retry: boolean, again: () => void): Promise<SendOutcome> {
  try {
    const input = typeof source === "function" ? await source() : source;
    const [row] = await db.select({ json: lessons.json, htmlFileId: lessons.htmlFileId }).from(lessons).where(eq(lessons.id, input.lessonId));
    const lesson = row ? lessonSchema.safeParse(row.json) : null;
    if (!row || !lesson?.success) return { sent: 0, duplicate: false };
    const fresh = await db.insert(lessonResultEmails)
      .values({ lessonId: input.lessonId, kind: input.graded.kind, roundKey: input.roundKey, percent: input.graded.summary.percent })
      .onConflictDoNothing().returning({ id: lessonResultEmails.id });
    // Tanulói profil (S2): a kör első beküldésekor a párosított tanuló tevékenységnaplójába (az újrapróba nem duplikál).
    if (fresh.length && input.learnerId) {
      await recordLearnerActivity({ learnerId: input.learnerId, materialId: row.htmlFileId, kind: "result", percent: input.graded.summary.percent,
        summary: `${lesson.data.title} — ${input.graded.kind === "tasks" ? "Feladatok" : "Kvíz"}` });
    }
    const [claim] = await db.select({ id: lessonResultEmails.id, delivered: lessonResultEmails.delivered }).from(lessonResultEmails)
      .where(and(eq(lessonResultEmails.lessonId, input.lessonId), eq(lessonResultEmails.kind, input.graded.kind), eq(lessonResultEmails.roundKey, input.roundKey)));
    const recipients = resolveAdminRecipients({ ADMIN_EMAILS: process.env.ADMIN_EMAILS, ADMIN_EMAIL: process.env.ADMIN_EMAIL });
    if (!recipients.length) { logger.warn("[LESSON-RESULT] nincs címzett (ADMIN_EMAILS)"); return { sent: 0, duplicate: false }; }
    const missing = recipients.filter(r => !claim.delivered.includes(r));
    if (!missing.length) return { sent: 0, duplicate: true };
    // Review K1: a levél a foglalás ELŐTT áll össze — ha az összeállítás dob, nincs mit felszabadítani.
    const mail = buildResultEmail({ lessonTitle: lesson.data.title, classroom: lesson.data.classroom, learner: input.learner, learnerFirst: input.learnerFirst, guest: input.guest,
      url: row.htmlFileId ? getMaterialPreviewUrl(row.htmlFileId) : "", graded: input.graded });
    // Spec 2026-11-17-eredmeny-email-foglalas: atomi FOGLALÁS a küldés előtt — a címzett csak akkor kerül a `delivered` listába, ha még
    // nincs benne; a sorzár miatt két egyidejű hívásból pontosan egy kap sort vissza, az küld (nincs dupla levél).
    const claimed: string[] = [];
    const ok: string[] = [];
    try {
      for (const to of missing) {
        const got = await db.update(lessonResultEmails).set({ delivered: sql`array_append(${lessonResultEmails.delivered}, ${to})` })
          .where(and(eq(lessonResultEmails.id, claim.id), sql`NOT (${to} = ANY(${lessonResultEmails.delivered}))`)).returning({ id: lessonResultEmails.id });
        if (got.length) claimed.push(to);
      }
      if (!claimed.length) return { sent: 0, duplicate: true };
      // Review K2: a lefagyott küldés nem tarthatja a foglalást — időkorlát után bukottnak számít (felszabadul, az újrapróba pótolja).
      const results = await Promise.allSettled(claimed.map(to => withSendTimeout(send(mail.subject, mail.html, to, resultIdempotencyKey(input.lessonId, input.graded.kind, input.roundKey, to)))));
      ok.push(...claimed.filter((_, i) => results[i].status === "fulfilled"));
    } finally {
      // Review K1: a felszabadítás `finally` ágban — bármilyen kivétel (adatbázis, küldő) után a nem kézbesített címzett foglalása
      // felszabadul: a következő azonos hívás vagy az újrapróba pótolja (review #280), levél nem ragad be.
      for (const to of claimed.filter(to => !ok.includes(to))) await releaseClaim(claim.id, to);
    }
    if (ok.length < claimed.length) {
      logger.warn(`[LESSON-RESULT] ${claimed.length - ok.length} címzettnek nem ment el${retry ? " — 60 s múlva újrapróbálja" : ""}.`);
      if (retry) again();
    }
    return { sent: ok.length, duplicate: false };
  } catch (error) {
    // Review K3: csak a hiba osztálya / kódja — a lekérdezés hibaüzenete a paramétereket (e-mail-címet) is tartalmazná.
    logger.error(`[LESSON-RESULT] a küldés nem sikerült: ${errorClass(error)}${retry ? " — újrapróbálja" : ""}`);
    // Review (2026-11-17): a váratlan kivétel (az `allSettled`-en kívül: adatbázis, foglalás) után is egy újrapróba — levél ne vesszen el.
    if (retry) again();
    return { sent: 0, duplicate: false };
  }
}

async function learnerName(userId: string | undefined): Promise<string> {
  if (!userId) return GUEST_LEARNER;
  attributionFault?.();
  const [u] = await db.select({ first: users.firstName, last: users.lastName }).from(users).where(eq(users.id, userId));
  const name = `${u?.last ?? ""} ${u?.first ?? ""}`.trim();
  return name || "Bejelentkezett tanuló";
}

// R9 (tulajdonosi döntés, 2026-11-18): a keretek egy helyen, `server/lesson-result-limits.ts` (egy osztályra méretezve, 60 / 15 perc / IP).
export { RESULT_RATE_LIMIT, partialLimiter, resetPartialLimiter, resultLimiter } from "./lesson-result-limits";

/**
 * Spec 2026-11-17-eredmeny-email-kviz (S1b): a FÉLBEHAGYOTT helyi kvíz. A kliens a lap háttérbe kerülésekor a kör pillanatképét küldi; itt
 * körönként a LEGUTOLSÓ pillanatkép vár (memóriában), és csak akkor megy „félbehagyva” levél, ha a késleltetés alatt sem újabb pillanatkép,
 * sem végleges beküldés nem érkezik — így körönként legfeljebb egy, a legutolsó állapotot mutató levél megy, és a befejezett kör mellé nem
 * megy ellentmondó. Vállalt korlát: újraindításkor a várakozó (még el nem küldött) pillanatkép elvész; a végleges levelet ez nem érinti.
 */
let partialDelayMs = 15 * 60 * 1000;
/** Teszthez: a késleltetés rövidítése; a korábbi értéket adja vissza. */
export function setPartialDelay(ms: number): number { const previous = partialDelayMs; partialDelayMs = ms; return previous; }
/**
 * Várakozó pillanatképek: kulcs → időzítő, a tanuló (a tanulónkénti korláthoz), a megválaszolt kérdések száma és a küldő. A Map beszúrási
 * sorrendje = életkor.
 */
const pendingPartials = new Map<string, { timer: ReturnType<typeof setTimeout>; owner: string; who: string; answered: number; version: number; send: () => Promise<unknown> }>();
/**
 * Terv R21 (gépi vak ellenőrzés L2): körönként (lecke + kör) az AKTUÁLIS pillanatkép változata. Minden küldési kísérlet — az időzítő első
 * küldése, a 60 s-os újrapróba és az R19 kapu-újrapróba — a saját változatát a kapu alatt veti össze ezzel: ha közben újabb pillanatkép
 * ütemeződött, a régi kísérlet nem küld (az újabb megy ki a saját időzítőjén). Korlátos méretű; a véglegesítés törli.
 */
const partialVersions = new Map<string, number>();
const MAX_PARTIAL_VERSIONS = 20_000;
let partialVersionSeq = 0;
function setCurrentPartialVersion(key: string, version: number): void {
  partialVersions.delete(key);
  if (partialVersions.size >= MAX_PARTIAL_VERSIONS) partialVersions.delete(partialVersions.keys().next().value!);
  partialVersions.set(key, version);
}
/**
 * Terv R11 (második vak ellenőrzés K1/K2): a várakozó pillanatkép kulcsa a LECKE + KÖR (`lecke|körazonosító`), nem a tanuló-kulcs — így
 * ujjlenyomat nélküli → ujjlenyomatos, IP-váltásos, be- / kijelentkezéses esetben is körönként egy várakozó (és legfeljebb egy levél) van.
 * A körazonosítót a kliens választja, ezért a várakozó pillanatkép TARTALMÁT csak a kör ELSŐ rögzítőjével összeférő beküldő írhatja
 * felül: ugyanaz a tanuló-kulcs, VAGY az első rögzítő vendég (a vendég azonosítója — ujjlenyomat, IP — nem igazolt). Igazolt (fiók /
 * párosított) tanuló pillanatképét így más nem írhatja felül a saját válaszaival. Terv R15: az ELNYOMÁS (véglegesítés) viszont bárkié —
 * az ártalmatlan irány (legfeljebb egy „félbehagyva” levél marad el), az elmaradása pedig ellentmondó levélpárt adna (fiók → vendég).
 */
export function mayActOn(owner: string, who: string): boolean { return owner === who || owner.startsWith("guest:"); }
/** Terv R11: a pillanatkép körkulcsa a kézbesítés-nyilvántartásban — tanulótól független (lecke + kör: a sor maga is leckéhez kötött). */
export const partialRoundKeyOf = (roundId: string) => roundKeyOf("partial-round", "quiz-partial", roundId);
const MAX_PENDING_PARTIALS = 5000;
/** Review K1: tanulónként (fiók / párosítás / vendég) legfeljebb ennyi várakozó kör; a legrégebbi adja át a helyét. */
export const MAX_PENDING_PER_LEARNER = 3;
/**
 * Terv R34 (review 4642333345): a KÜLDÉS ALATT álló kör első rögzítője (lecke + kör → kilét, változat) — az időzítő lejártától addig, amíg
 * a küldési kísérlet és minden újrapróbája véget nem ér (`onSettled`), vagy a kör nem véglegesül. A pillanatkép-felvétel az első rögzítő
 * vizsgálatát (R11 / R22) erre is elvégzi: a kapuhibás / bukott első küldés után a vendég pillanatképe nem veheti át a kört. Korlátos.
 */
const sendingPartials = new Map<string, { who: string; version: number }>();
function markSending(key: string, who: string, version: number): void {
  sendingPartials.delete(key);
  if (sendingPartials.size >= MAX_PENDING_PARTIALS) sendingPartials.delete(sendingPartials.keys().next().value!);
  sendingPartials.set(key, { who, version });
}
/** Teszthez (R45): a kör „küldés alatt” nyilvántartott első rögzítője (vagy `undefined`). */
export function sendingPartialWho(lessonId: string, roundId: string): string | undefined { return sendingPartials.get(`${lessonId}|${roundId}`)?.who; }
function settleSending(key: string, version: number): void {
  if (sendingPartials.get(key)?.version === version) sendingPartials.delete(key);
}
/**
 * Terv R41 (7. vak kör L3): a „félbehagyva” levél éppen FUTÓ küldési kísérletei (az időzítő lejártától / az újrapróba indulásától a
 * végéig) és a HALASZTOTT újrapróbái (60 s-os, R19 kapu-újrapróba) — a leállítás ürítése innen is dolgozik: a halasztottat előrehozza
 * (ugyanazon a kapun át), a futókat megvárja. Az ürítés alatt keletkező újrapróba azonnal fut.
 */
const activePartialSends = new Set<Promise<unknown>>();
const deferredPartialRetries = new Map<number, { timer: ReturnType<typeof setTimeout>; run: () => Promise<unknown> }>();
let deferredPartialSeq = 0;
/**
 * Terv R45 (8. vak kör L3): a leállítás állapota — `running`: az ürítés fut (az újonnan befogadott pillanatkép és minden újrapróba
 * azonnal, követve indul, az ürítés megvárja); `done`: az ürítés lezárult (új pillanatképet a szerver nem fogad el: 503, a kliens nem
 * jelöli elküldöttnek, a következő alkalommal újra küldi). Csak a teszt-segéd állítja vissza.
 */
let partialShutdown: "running" | "done" | null = null;
/** R45: a leállítás ürítése lezárult — a pillanatkép-felvétel ilyenkor nem fogad el új állapotot. */
export function partialIntakeClosed(): boolean { return partialShutdown === "done"; }
function trackPartialSend(sending: Promise<unknown>): Promise<unknown> {
  const tracked = sending.catch(error => logger.error(`[LESSON-RESULT] a félbehagyott kvíz küldése nem sikerült: ${errorClass(error)}`));
  activePartialSends.add(tracked);
  void tracked.finally(() => activePartialSends.delete(tracked));
  return tracked;
}
const schedulePartialRetry: RetryScheduler = (run, delayMs) => {
  if (partialShutdown !== null) { void trackPartialSend(Promise.resolve().then(run)); return; }
  const id = ++deferredPartialSeq;
  const timer = setTimeout(() => { deferredPartialRetries.delete(id); void trackPartialSend(run()); }, delayMs);
  timer.unref?.();
  deferredPartialRetries.set(id, { timer, run });
};
function cancelPartial(key: string): void {
  const entry = pendingPartials.get(key);
  if (entry) { clearTimeout(entry.timer); pendingPartials.delete(key); }
}
/**
 * Review K1: telítéskor a jogos pillanatkép NEM vész el csendben — a legrégebbi várakozó (először a tanulóé, aztán az összesé) adja át a
 * helyét, és ez naplózódik (azonosító nélkül).
 */
function schedulePartial(key: string, owner: string, who: string, answered: number, version: number, send: () => Promise<unknown>): boolean {
  // R7: körönként a LEGTÖBB választ tartalmazó pillanatkép marad — a később érkező, kevesebb válaszú (sorrendcsere, másik fül régebbi
  // állapota) nem írja felül a tartalmat; az időzítő ettől még újraindul (a tanuló az imént még aktív volt).
  const waiting = pendingPartials.get(key);
  const best = waiting && waiting.answered > answered ? { answered: waiting.answered, send: waiting.send, who: waiting.who, owner: waiting.owner, version: waiting.version } : { answered, send, who, owner, version };
  cancelPartial(key);
  const own = [...pendingPartials.entries()].filter(([, entry]) => entry.owner === best.owner).map(([k]) => k);
  if (own.length >= MAX_PENDING_PER_LEARNER) { cancelPartial(own[0]); logger.warn("[LESSON-RESULT] a tanuló legrégebbi várakozó félbehagyott köre kiszorult (tanulónkénti korlát)."); }
  if (pendingPartials.size >= MAX_PENDING_PARTIALS) { cancelPartial(pendingPartials.keys().next().value!); logger.warn("[LESSON-RESULT] a legrégebbi várakozó félbehagyott kör kiszorult (teljes korlát)."); }
  const timer = setTimeout(() => startPartial(key), partialDelayMs);
  timer.unref?.();
  pendingPartials.set(key, { timer, ...best });
  // R21: a megtartott állapot változata az aktuális (a kiszorított vagy elavult kísérletek a kapuban megállnak).
  setCurrentPartialVersion(key, best.version);
  // R45: leállítás közben befogadott pillanatkép nem marad a (le nem futó) időzítőn — azonnal, követve indul.
  if (partialShutdown !== null) startPartial(key);
  return true;
}
/**
 * R45 (8. vak kör L3): a várakozó kör küldésének EGYETLEN indító útja — az időzítő lejártakor és a leállítás ürítésekor is. R34: a kör
 * első rögzítője a küldési ciklus végéig őrződik (a várakozók közül kikerül, a „küldés alatt” nyilvántartásba kerül); R41: a futó küldés
 * nyilvántartott (a leállítás ürítése megvárja). Review K4: a hiba naplója csak a hiba osztálya (`trackPartialSend`).
 */
function startPartial(key: string): void {
  const entry = pendingPartials.get(key);
  if (!entry) return;
  clearTimeout(entry.timer);
  markSending(key, entry.who, entry.version);
  pendingPartials.delete(key);
  void trackPartialSend(Promise.resolve().then(entry.send));
}
/** Teszthez: a várakozó pillanatképek száma. */
export function pendingPartialCount(): number { return pendingPartials.size; }
/**
 * PR #510 (Codex P2): a VÉGLEGESÍTETT kör késve érkező pillanatképe nem küldhet „félbehagyva” levelet (a kliens kérései sorrendet
 * cserélhetnek, két fül is küldhet). Két forrás: (1) memóriában a véglegesített körök (lecke + körazonosító — a vendég eltérő kulcsát
 * is fedi; a körazonosító a kör kérdéseinek és kezdetének lenyomata), 24 óráig, korlátos mérettel; (2) a kézbesítés-nyilvántartás
 * végleges sora (újraindítás után is, ha a kulcs egyezik).
 */
const FINALIZED_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_FINALIZED_ROUNDS = 20_000;
/** Terv R15: a véglegesítés-jelző tanulófüggetlen (lecke + kör → lejárat) — bármely véglegesítés elnyomja a kör „félbehagyva” levelét. */
const finalizedRounds = new Map<string, number>();
function markFinalized(lessonId: string, roundId: string, now = Date.now()): void {
  const key = `${lessonId}|${roundId}`;
  finalizedRounds.delete(key);
  if (finalizedRounds.size >= MAX_FINALIZED_ROUNDS) finalizedRounds.delete(finalizedRounds.keys().next().value!);
  finalizedRounds.set(key, now + FINALIZED_TTL_MS);
}
/**
 * Terv R18 (negyedik vak ellenőrzés M1): a véglegesítés TARTÓS, tanulófüggetlen nyoma a kézbesítés-nyilvántartásban (sémaváltozás nélkül:
 * `kind = 'quiz'`, ez a körkulcs, üres `delivered`) — újraindítás után, más példányon és bármely kilétnél is megfogja a késői
 * pillanatképet. Korlátos élettartam: `FINALIZED_TTL_MS` (24 óra) a `created_at`-tól.
 */
export const finalRoundKeyOf = (roundId: string, kind: "tasks" | "quiz" = "quiz") => roundKeyOf("final-round", kind, roundId);
/**
 * Terv R27 (gépi vak ellenőrzés, 3. célzott kör L3): a tanulófüggetlen végleges-jelzősor mindkét fajtánál — a kvízé egyben az R18 nyoma.
 * Igaz, ha ez az ELSŐ végleges beküldés a körre; ismétlésnél a jelzősor `created_at`-ja frissül (az R18 élettartama), és hamis.
 */
/**
 * Terv R42 (7. vak kör L4): a jelzősor ELSŐ rögzítőjének álnevesített tulajdonos-sora (lecke + fajta + kör + kilét; üres kézbesítés). A
 * jelzősorral egy tranzakcióban jön létre, így ha a kérés a jelzősor után, a saját sor és a 202 előtt megszakad, az eredeti beküldő
 * ismétlése továbbmehet (más kilét továbbra is duplikátum).
 */
export const finalOwnerKeyOf = (who: string, kind: "tasks" | "quiz", roundId: string) => roundKeyOf("final-owner", kind, roundId, who);
let finalMarkerFault: ((stage: "insert" | "ttl") => void) | null = null;
/** Teszthez (R51 / L2): hibainjektálás a végleges jelzősor írása (`insert`) vagy élettartam-frissítése (`ttl`) elé; `null` kikapcsolja. */
export function setFinalMarkerFault(fault: ((stage: "insert" | "ttl") => void) | null): void { finalMarkerFault = fault; }
async function claimFinalRound(lessonId: string, kind: "tasks" | "quiz", roundId: string, percent: number, who: string): Promise<boolean> {
  finalMarkerFault?.("insert");
  const fresh = await db.transaction(async tx => {
    const marker = await tx.insert(lessonResultEmails).values({ lessonId, kind, roundKey: finalRoundKeyOf(roundId, kind), percent })
      .onConflictDoNothing().returning({ id: lessonResultEmails.id });
    if (marker.length) await tx.insert(lessonResultEmails).values({ lessonId, kind, roundKey: finalOwnerKeyOf(who, kind, roundId), percent }).onConflictDoNothing();
    return marker.length > 0;
  });
  if (fresh) return true;
  // R51 / L2: a meglévő jelző élettartam-frissítése best effort — a hibája nem változtat azon, hogy a jelző MEGVAN (a hívó a pozitív
  // tulajdonos-ellenőrzést futtatja); a jelzősor írásának hibája (fent) viszont a hívóhoz jut (bizonyíthatatlan állapot: 503).
  try {
    finalMarkerFault?.("ttl");
    await db.update(lessonResultEmails).set({ createdAt: sql`now()` })
      .where(and(eq(lessonResultEmails.lessonId, lessonId), eq(lessonResultEmails.kind, kind), eq(lessonResultEmails.roundKey, finalRoundKeyOf(roundId, kind))));
  } catch (error) { logger.error(`[LESSON-RESULT] a végleges jelző élettartama nem frissült: ${errorClass(error)}`); }
  return false;
}
/**
 * Terv R51 (tulajdonosi döntés 2026-11-22, „Szerver rögzíti a kilétet”): a kör kiléte a SZERVEREN rögzül — a kör első beérkező kérésénél
 * (a kliens az első válasznál kilét-rögzítő kérést küld) a szerver saját munkamenetéből (fiók) és a párosító token általa ellenőrzött
 * állapotából. Tanulófüggetlen jelzősor (`round-claim`) + a rögzített kilét álnevesített sora (`round-owner`), egy tranzakcióban (a meglévő
 * táblán, sémaváltozás nélkül). Igaz, ha a mostani kilét a rögzítettel azonos (vagy most rögzült).
 */
// R52: a kilét-rögzítő sorok kulcsa felismerhető előtagot visz (`rc:` jelzősor, `ro:` tulajdonos; a többi körkulcs tiszta hex), így
// korlátos élettartammal takaríthatók; a tulajdonos-kulcs eleje a kört azonosítja (a kör minden tulajdonos-sora előtaggal megtalálható).
const roundIdentityPart = (kind: "tasks" | "quiz", roundId: string) => roundKeyOf("round-identity", kind, roundId);
const roundClaimKeyOf = (kind: "tasks" | "quiz", roundId: string) => `rc:${roundIdentityPart(kind, roundId).slice(0, 61)}`;
const roundOwnerKeyOf = (kind: "tasks" | "quiz", roundId: string, owner: string) => `ro:${roundIdentityPart(kind, roundId).slice(0, 29)}${roundKeyOf("round-owner", owner).slice(0, 32)}`;
/** Teszthez (R52): a kör kilét-rögzítő sorainak kulcs-előtagjai (jelzősor; tulajdonos-sorok). */
export const roundIdentityKeysOf = (kind: "tasks" | "quiz", roundId: string) => [roundClaimKeyOf(kind, roundId), `ro:${roundIdentityPart(kind, roundId).slice(0, 29)}`];
/**
 * Terv R52: a kilét-rögzítés élettartama — a le nem zárt kör 7 napos korhatára (R2 / R5) után egy nap tartalékkal. Ezután a sorok
 * törlődnek (`pruneRoundIdentity`), és a kör késői első kérése sem kap kilétet: a kör első tevékenysége a rögzítési élettartamon túl
 * volt, a kilét nem igazolható (vendégként fut). A végleges jelző és tulajdonos-sora (duplikátum-védelem, R27 / R42) külön, nem érintett.
 */
export const ROUND_IDENTITY_TTL_MS = 8 * 86_400_000;
const PRUNE_BATCH = 1000;
const PRUNE_MAX_BATCHES = 50;
/** R52: a lejárt kilét-rögzítő sorok adagos törlése (legfeljebb `PRUNE_MAX_BATCHES` adag futásonként); a törölt sorok számát adja. */
export async function pruneRoundIdentity(now = new Date(), batch = PRUNE_BATCH): Promise<number> {
  const before = new Date(now.getTime() - ROUND_IDENTITY_TTL_MS);
  let removed = 0;
  for (let i = 0; i < PRUNE_MAX_BATCHES; i++) {
    const victims = db.select({ id: lessonResultEmails.id }).from(lessonResultEmails)
      .where(and(lt(lessonResultEmails.createdAt, before), or(like(lessonResultEmails.roundKey, "rc:%"), like(lessonResultEmails.roundKey, "ro:%")))).limit(batch);
    const gone = await db.delete(lessonResultEmails).where(inArray(lessonResultEmails.id, victims)).returning({ id: lessonResultEmails.id });
    removed += gone.length;
    if (gone.length < batch) break;
  }
  return removed;
}
/** R52: a kilét-rögzítés napi takarítása (csak élesben, E2E-ben nem; a leállítás a cron-feladatokat leállítja). */
export function setupResultHousekeeping(): void {
  if (process.env.NODE_ENV !== "production") return;
  cron.schedule("40 3 * * *", () => { void pruneRoundIdentity().catch(error => logger.warn(`[LESSON-RESULT] a kilét-rögzítés takarítása nem sikerült: ${errorClass(error)}`)); }, { timezone: "Europe/Budapest" });
}
async function claimRoundOwner(lessonId: string, kind: "tasks" | "quiz", roundId: string, owner: string): Promise<boolean> {
  return db.transaction(async tx => {
    const claim = await tx.insert(lessonResultEmails).values({ lessonId, kind, roundKey: roundClaimKeyOf(kind, roundId), percent: 0 })
      .onConflictDoNothing().returning({ id: lessonResultEmails.id });
    if (claim.length) { await tx.insert(lessonResultEmails).values({ lessonId, kind, roundKey: roundOwnerKeyOf(kind, roundId, owner), percent: 0 }).onConflictDoNothing(); return true; }
    const own = await tx.select({ id: lessonResultEmails.id }).from(lessonResultEmails)
      .where(and(eq(lessonResultEmails.lessonId, lessonId), eq(lessonResultEmails.kind, kind), eq(lessonResultEmails.roundKey, roundOwnerKeyOf(kind, roundId, owner)))).limit(1);
    return own.length > 0;
  });
}
/** `foreign`: a kérés kiléte nem a kör szerveres rögzítése (a kérés kilét nélkül fut, és létező végleges jelzőnél duplikátum, R27). */
type Identity = { userId: string | undefined; paired: Awaited<ReturnType<typeof resolveLearner>>; foreign: boolean };
/**
 * R51: a kérés kilétének EGYETLEN meghatározása — a munkamenet fiókja (R31: eltérő kliens-címkénél nem), a párosító token szerveres
 * ellenőrzése (R47 / L3: átmeneti hiba → dob), majd a kör szerveres kilét-rögzítéséhez vetés: ha a mostani kilét nem a rögzített, a kérés
 * kilét nélkül (vendégként) fut. A hívó a dobásra 503-at ad (nincs rögzítés, nincs 202).
 */
async function establishIdentity(req: Request, lessonId: string, kind: "tasks" | "quiz", roundId: string, learnerToken: string | undefined, subject: string | undefined, roundActivityAt?: number): Promise<Identity> {
  const sessionUserId = (req.user as { id?: string } | undefined)?.id;
  const userId = subject !== undefined && subject !== resultSubjectOf(sessionUserId) ? undefined : sessionUserId;
  let paired: Identity["paired"] = null;
  if (learnerToken) { learnerResolveFault?.(); paired = await resolveLearner(learnerToken); }
  // R52: ha a kör UTOLSÓ tevékenysége is a rögzítési élettartamon túl van, az első tevékenység biztosan — a most születő rögzítés nem
  // igazolhatja az akkori kilétet: vendégként rögzül (meglévő rögzítésnél a meglévő számít).
  const stale = roundActivityAt !== undefined && Date.now() - roundActivityAt > ROUND_IDENTITY_TTL_MS;
  const owner = stale ? "guest" : userId ? `user:${userId}` : paired ? `learner:${paired.id}` : "guest";
  if (!(await claimRoundOwner(lessonId, kind, roundId, owner))) return { userId: undefined, paired: null, foreign: true };
  // A visszaadott kilét mindig a rögzítettnek felel meg (a „vendég” rögzítés — pl. lejárt kör — fiókot / párosítást nem ad).
  return owner === "guest" ? { userId: undefined, paired: null, foreign: false } : { userId, paired, foreign: false };
}
let finalizedCheckFault: (() => void) | null = null;
let partialIntakeHook: ((who: string) => Promise<void>) | null = null;
let gateCheckHook: ((lockKey: string) => Promise<void>) | null = null;
let partialScheduleHook: ((who: string) => Promise<void>) | null = null;
let attributionFault: (() => void) | null = null;
let finalClaimFault: (() => void) | null = null;
let learnerResolveFault: (() => void) | null = null;
let ownerCheckFault: (() => void) | null = null;
/** Teszthez (R49 / L3): hibainjektálás a végleges duplikátum-vizsgálat tulajdonos-lekérdezése elé; `null` kikapcsolja. */
export function setOwnerCheckFault(fault: (() => void) | null): void { ownerCheckFault = fault; }
/** Teszthez (R47 / L3): hibainjektálás a párosítás feloldása elé (átmeneti DB-hiba utánzása); `null` kikapcsolja. */
export function setLearnerResolveFault(fault: (() => void) | null): void { learnerResolveFault = fault; }
/** Teszthez (R42): hibainjektálás a végleges jelzősor rögzítése UTÁN, a háttérküldés és a 202 ELŐTT (megszakadt kérés); `null` kikapcsolja. */
export function setFinalClaimFault(fault: (() => void) | null): void { finalClaimFault = fault; }
/** Teszthez (R36): a pillanatkép-felvételben a „már kiment” lekérdezés UTÁN hívódik; `null` kikapcsolja. */
export function setPartialScheduleHook(hook: ((who: string) => Promise<void>) | null): void { partialScheduleHook = hook; }
/** Teszthez (R38): hibainjektálás a tanuló nevének lekérdezése elé; `null` kikapcsolja. */
export function setAttributionFault(fault: (() => void) | null): void { attributionFault = fault; }
/** Teszthez: a „félbehagyva” levél kapujában, a véglegesítés-ellenőrzés UTÁN hívódik (lassú adatbázis utánzása); `null` kikapcsolja. */
export function setGateCheckHook(hook: ((lockKey: string) => Promise<void>) | null): void { gateCheckHook = hook; }
/** Teszthez: a pillanatkép-ág UTOLSÓ várakozása után hívódik (párhuzamos felvétel utánzása); `null` kikapcsolja. */
export function setPartialIntakeHook(hook: ((who: string) => Promise<void>) | null): void { partialIntakeHook = hook; }
/** Teszthez: hibainjektálás a véglegesítés-ellenőrzés elé (átmeneti adatbázishiba utánzása); `null` kikapcsolja. */
export function setFinalizedCheckFault(fault: (() => void) | null): void { finalizedCheckFault = fault; }
async function roundFinalized(lessonId: string, whos: readonly string[], roundId: string, now = Date.now()): Promise<boolean> {
  finalizedCheckFault?.();
  const key = `${lessonId}|${roundId}`;
  const until = finalizedRounds.get(key);
  if (until !== undefined) { if (until > now) return true; finalizedRounds.delete(key); }
  // A nyilvántartás: a tanulófüggetlen jelzősor (R18, 24 órán belül) VAGY a kör végleges sora a pillanatkép tanuló-kulcsain.
  const rows = await db.select({ id: lessonResultEmails.id }).from(lessonResultEmails)
    .where(and(eq(lessonResultEmails.lessonId, lessonId), eq(lessonResultEmails.kind, "quiz"), or(
      and(eq(lessonResultEmails.roundKey, finalRoundKeyOf(roundId)), gt(lessonResultEmails.createdAt, new Date(now - FINALIZED_TTL_MS))),
      inArray(lessonResultEmails.roundKey, whos.map(w => roundKeyOf(w, "quiz", roundId)))))).limit(1);
  return rows.length > 0;
}
/**
 * R1 (vak ellenőrzés K1 + S1): körönkénti KIZÁRÁS a „félbehagyva” levél küldési kísérletei és a végleges beküldés felülírás-vizsgálata
 * között (kulcs: lecke + körazonosító — a vendég eltérő kulcsait is fedi). A részleges kísérlet a kizárás alatt ellenőriz és küld; a
 * végleges beküldés a kört ELŐBB (szinkron) véglegesítettnek jelöli, majd a kizárás alatt olvassa ki, kiment-e részleges levél. Így a
 * végleges vagy a már LEZÁRULT részleges küldést látja (felülíró mondat), vagy a részleges kísérlet a véglegesítést (nem küld) — a kettő
 * közti ablak megszűnik. Példányon belüli (a nyilvántartás-ellenőrzés több példánynál is fut; kanban #135). Ígéretlánc: a várakozók
 * érkezési sorrendben futnak, a hiba nem akasztja meg a sort, az utolsó után a bejegyzés törlődik.
 */
const roundLocks = new Map<string, Promise<void>>();
async function withRoundLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = roundLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const mine = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => mine);
  roundLocks.set(key, tail);
  await previous;
  try { return await run(); }
  finally { release(); if (roundLocks.get(key) === tail) roundLocks.delete(key); }
}
/** Teszthez: a véglegesített körök memóriájának ürítése (az újraindítás utáni állapot utánzása). */
export function clearFinalizedRounds(): void { finalizedRounds.clear(); }

/** Teszthez: a várakozó pillanatképek eldobása (küldés nélkül). */
export function clearPendingPartials(): void {
  for (const key of [...pendingPartials.keys()]) cancelPartial(key);
  sendingPartials.clear();
  for (const retry of deferredPartialRetries.values()) clearTimeout(retry.timer);
  deferredPartialRetries.clear();
  // A futó kísérletek nyilvántartása is ürül (a kísérlet maga lefut; egy korábbi, lefagyott küldés nem tartja a következő ürítést).
  activePartialSends.clear();
  partialShutdown = null;
}
/**
 * Terv R14 (második vak ellenőrzés K4): leállításkor a várakozó „félbehagyva” levelek a késleltetés kivárása nélkül kimennek, a szokott
 * kapun (kizárás + véglegesítés-ellenőrzés) át, legfeljebb `timeoutMs`-ig. Az időkorlát után visszatér (a leállás folytatódik). Sosem dob.
 */
export async function flushPendingPartials(timeoutMs: number): Promise<void> {
  // R41 + R45: az ürítés alatt keletkező újrapróba és az ekkor befogadott pillanatkép azonnal fut (nyilvántartva), nem halasztódik a
  // leállás utánra; a várakozók ugyanazon az indító úton (első rögzítő átadásával) indulnak, mint az időzítőből.
  partialShutdown = "running";
  try {
    for (const key of [...pendingPartials.keys()]) startPartial(key);
    // R41: a halasztott újrapróbák előrehozva — a korábbi időzítő törlődik, a kísérlet ugyanazon a kapun és záron megy.
    const deferred = [...deferredPartialRetries.values()];
    deferredPartialRetries.clear();
    for (const retry of deferred) { clearTimeout(retry.timer); void trackPartialSend(Promise.resolve().then(retry.run)); }
    if (!activePartialSends.size) return;
    const total = activePartialSends.size;
    // A futó kísérletek (és az általuk ütemezett, azonnal induló újrapróbák) végéig, legfeljebb a határidőig.
    const sending = (async () => { while (activePartialSends.size) await Promise.allSettled([...activePartialSends]); })();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const limit = new Promise<"timeout">(resolve => { timer = setTimeout(() => resolve("timeout"), timeoutMs); timer.unref?.(); });
    const outcome = await Promise.race([sending, limit]);
    clearTimeout(timer);
    if (outcome === "timeout") logger.warn(`[LESSON-RESULT] leállítás: ${total} „félbehagyva” levél kiküldése nem fejeződött be ${timeoutMs} ms alatt.`);
  } finally { partialShutdown = "done"; }
}

/** R51: POST /api/lessons/:lessonId/results/claim — a kör kilét-rögzítése az első válasznál (csak közzétett leckére; 503 átmeneti hibánál). */
export const lessonResultClaimHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = roundClaimSchema.safeParse(req.body);
    if (!parsed.success || !/^[A-Za-z0-9_-]{1,64}$/.test(req.params.lessonId)) return res.status(400).json({ message: "Érvénytelen kérés." });
    const [row] = await db.select({ publishedAt: lessons.publishedAt }).from(lessons).where(eq(lessons.id, req.params.lessonId));
    if (!row?.publishedAt) return res.status(404).json({ message: "Ez a lecke nem érhető el." });
    let identity: Identity;
    try { identity = await establishIdentity(req, req.params.lessonId, parsed.data.kind, parsed.data.roundId, parsed.data.learner, undefined); }
    catch (error) {
      logger.error(`[LESSON-RESULT] a kilét rögzítése nem sikerült: ${errorClass(error)}`);
      return res.status(503).json({ message: "Átmeneti hiba — próbáld újra." });
    }
    return res.status(202).json({ claimed: true, owner: identity.userId !== undefined || identity.paired !== null });
  } catch (error) { next(error); }
};
/** POST /api/lessons/:lessonId/results — a feladatok / a helyi kvíz befejezésekor (vendég is). Mindig 202, ha a kérés érvényes. */
export const lessonResultsRouter = Router();
lessonResultsRouter.post("/:lessonId/results/claim", claimLimiter, lessonResultClaimHandler);
lessonResultsRouter.post("/:lessonId/results", resultLimiter, partialLimiter, async (req: Request, res: Response, next: NextFunction) => {
  // Review #280: az Express 4 nem továbbítja az async hibát — a handler maga adja át (next).
  try {
  const parsed = resultRequestSchema.safeParse(req.body);
  if (!parsed.success || !/^[A-Za-z0-9_-]{1,64}$/.test(req.params.lessonId)) return res.status(400).json({ message: "Érvénytelen beküldés." });
  const [row] = await db.select({ json: lessons.json, publishedAt: lessons.publishedAt }).from(lessons).where(eq(lessons.id, req.params.lessonId));
  const lesson = row?.publishedAt ? lessonSchema.safeParse(row.json) : null;
  const experience = lesson?.success ? lesson.data.experience : undefined;
  if (!experience) return res.status(404).json({ message: "Ez a lecke nem érhető el." });
  const body = parsed.data;
  // Terv R31 + R47 + R51: a kilét a szerveren dől el (munkamenet, ellenőrzött párosítás, a kör szerveres kilét-rögzítése); a kliens címkéje
  // legfeljebb csökkentheti (eltérésnél fiók nélkül), kilétet nem adhat. Tanulói profil (S2): bejelentkezve is a tanuló naplójába kerül, a
  // levél neve bejelentkezve a fiók neve marad. A kilét-feloldás átmeneti hibája (párosítás, rögzítés) → 503, rögzítés és 202 nélkül.
  let identity: Identity;
  // R52: a kör UTOLSÓ tevékenysége a szerver órájára számolva (R13: a kliens órájának eltérése a `clientNow`-ból).
  const lastActivity = (body.kind === "quiz" ? body.lastAnsweredAt : undefined) ?? body.startedAt;
  const roundActivityAt = lastActivity !== undefined ? lastActivity + (body.clientNow ? Date.now() - body.clientNow : 0) : undefined;
  try { identity = await establishIdentity(req, req.params.lessonId, body.kind, body.roundId, body.learner, body.subject, roundActivityAt); }
  catch (error) {
    logger.error(`[LESSON-RESULT] a kilét feloldása nem sikerült: ${errorClass(error)}`);
    return res.status(503).json({ message: "Átmeneti hiba — próbáld újra." });
  }
  const { userId, paired } = identity;
  const who = userId ?? (paired ? `learner:${paired.id}` : `guest:${body.fingerprint ?? (clientIpKey(req) || "?")}`);
  const lessonId = req.params.lessonId;
  const nameOf = () => (paired && !userId ? Promise.resolve(paired.name) : learnerName(userId));
  const attribution = { ...(paired && !userId ? { learnerFirst: paired.firstName } : {}), guest: !userId && !paired };
  // Review B1: vendégnél a pillanatkép és a végleges beküldés azonosítója eltérhet (az ujjlenyomat a lap elhagyásakor még hiányozhat →
  // IP-alapú kulcs). A végleges beküldés MINDKÉT vendég-kulcsot nézi (ujjlenyomat és IP), így a várakozót biztosan törli.
  const guestIp = `guest:${clientIpKey(req) || "?"}`;
  const partialWhos = [...new Set(userId || paired ? [who] : [who, guestIp])];
  // Terv R11: a várakozó pillanatkép, a kizárás és a véglegesített körök kulcsa a lecke + kör; a nyilvántartásbeli körkulcs is tanulófüggetlen.
  const lockKey = `${lessonId}|${body.roundId}`;
  const partialRoundKey = partialRoundKeyOf(body.roundId);
  // Terv R13 (K7): a kliens órájának eltérése — a kliens a saját „most” idejét küldi; a szerver az időbélyegeket a saját órájára számolja
  // át, és a 7 napos határt a kliens két időbélyegének különbségéből méri. `clientNow` nélkül (régi kliens) a szerver órája számít.
  const receivedAt = Date.now();
  const clockSkew = body.clientNow ? receivedAt - body.clientNow : 0;
  const onServerClock = (t: number | undefined) => (t === undefined ? undefined : t + clockSkew);
  const startedAtOnServer = onServerClock(body.startedAt);
  // S1b: a le nem zárt kvíz pillanatképe — nem küld azonnal, csak várakozik (a legtöbb választ tartalmazó állapot marad).
  if (body.kind === "quiz" && body.partial) {
    // R5: az „összes” a SZERVER által ismert körméret — a kliens rövidebb azonosítólistájával nem váltható ki „2 / 2 félbehagyva” levél.
    const snapshot = gradePartialQuiz(experience.quiz, body.picks, experienceRoundSizes(experience).quizRound);
    if (!snapshot) return res.status(202).json({ queued: false });
    // R17 (K5): a körmérettel egyenlő számú válasz nem „félbehagyott” kör — részleges levél nem ütemeződik (a becsületes kliens ilyenkor
    // végleges beküldést küld).
    if ((snapshot.meta?.partial?.answered ?? 0) >= experienceRoundSizes(experience).quizRound) return res.status(202).json({ queued: false, partial: true, complete: true });
    // R5: a 7 napos szabály a szerveren is — az utolsó válasz (ennek hiányában a kezdés) idejéhez mérve. Mindkét időbélyeg a klienstől
    // jön: ez a becsületes (régi / hibás) klienst fogja meg, a szándékos hamisítást a keret korlátozza.
    const lastActivity = body.lastAnsweredAt ?? body.startedAt;
    if (lastActivity !== undefined && roundTooOld(lastActivity, body.clientNow ?? receivedAt)) return res.status(202).json({ queued: false, stale: true });
    // PR #510: a már véglegesített kör késői pillanatképe nem ütemeződik — a befejezett kör mellé nem mehet „félbehagyva” levél.
    if (await roundFinalized(lessonId, partialWhos, body.roundId)) return res.status(202).json({ queued: false, finalized: true });
    if (partialIntakeHook) await partialIntakeHook(who);
    // R25 (gépi vak ellenőrzés, 2. célzott kör L3): a felvétel záró szakasza — a „már kiment” vizsgálat (R6), a várakozó beolvasása, az
    // első rögzítő (R11 / R22) és az ütemezés — ugyanazon a körönkénti kizáráson megy át, mint a „félbehagyva” levél küldési kísérlete:
    // vagy a régi küldés fejeződik be előbb (és ez a pillanatkép igaz `alreadySent` választ kap), vagy ez váltja le a régit (és a régi
    // kísérlet a változat-ellenőrzésen megáll). Elfogadott új állapot mellett régi levél nem megy ki.
    const outcome = await withRoundLock(lockKey, async () => {
      // R29 (3. célzott kör L5): a felvétel közben véglegesített körre nem keletkezik várakozó, és a válasz ezt mondja.
      // R6 + R11: ha a körről már kiment (vagy éppen megy) „félbehagyva” levél — bármelyik tanuló-kulccsal —, újabb nem megy (körönként
      // legfeljebb egy); a válasz ezt mondja.
      const earlier = await db.select({ delivered: lessonResultEmails.delivered }).from(lessonResultEmails)
        .where(and(eq(lessonResultEmails.lessonId, lessonId), eq(lessonResultEmails.kind, "quiz"), eq(lessonResultEmails.roundKey, partialRoundKey)));
      if (earlier.some(sentRow => sentRow.delivered.length > 0)) return { queued: false, partial: true, alreadySent: true };
      if (partialScheduleHook) await partialScheduleHook(who);
      // R36 (6. kör L3): a véglegesítés az UTOLSÓ várakozás után, közvetlenül az ütemezés előtt nézve (az R29 helye) — a lekérdezés alatt
      // véglegesített körre sem keletkezik várakozó. Innentől az ütemezésig nincs várakozás.
      const finalizedUntil = finalizedRounds.get(lockKey);
      if (finalizedUntil !== undefined && finalizedUntil > Date.now()) return { queued: false, finalized: true };
      // R11 + R22: a várakozó beolvasása és az első rögzítő vizsgálata az utolsó várakozás után, szinkron az ütemezéssel. A kör első
      // rögzítőjével össze nem férő beküldő nem írhatja felül a várakozót (a körazonosítót a kliens választja).
      // R34: a várakozó mellett a KÜLDÉS ALATT álló kör első rögzítője is számít (kapuhiba / bukott küldés utáni újrapróba alatt).
      const waiting = pendingPartials.get(lockKey) ?? sendingPartials.get(lockKey);
      if (waiting && !mayActOn(waiting.who, who)) return { queued: false, partial: true, conflict: true };
      const lastAnsweredOnServer = onServerClock(body.lastAnsweredAt);
      const partialGraded: GradedQuiz = { ...snapshot, meta: { ...snapshot.meta, ...(startedAtOnServer ? { startedAt: startedAtOnServer } : {}), ...(lastAnsweredOnServer ? { lastAnsweredAt: lastAnsweredOnServer } : {}) } };
      // R16: ha a kört vendég rögzítette és most más veszi át (pl. a kör közben bejelentkező tanuló), a kör vendég kör marad — a levél
      // attribúciója „Vendég tanuló”, és az első rögzítő is a vendég (a többi vendég-beküldő továbbra is összefér vele).
      const guestTakeover = waiting !== undefined && waiting.who.startsWith("guest:") && waiting.who !== who;
      const recorder = guestTakeover ? waiting.who : who;
      const sender = async () => (guestTakeover ? { learner: GUEST_LEARNER, guest: true } : { learner: await nameOf(), ...attribution });
      // R1 + R21: a kapu MINDEN kísérlet (az újrapróba is) előtt, a kör kizárása alatt nézi, hogy a kör közben véglegesült-e, és hogy a
      // kísérlet még az aktuális pillanatkép-változatra vonatkozik-e.
      const version = ++partialVersionSeq;
      const gate: SendGate = attempt => withRoundLock(lockKey, async () => {
        if (partialVersions.get(lockKey) !== version || await roundFinalized(lessonId, partialWhos, body.roundId)) return { sent: 0, duplicate: true };
        if (gateCheckHook) await gateCheckHook(lockKey);
        if (partialVersions.get(lockKey) !== version) return { sent: 0, duplicate: true };
        return attempt();
      });
      // R45: a leállítás ürítése már lezárult — az állapotot nem fogadjuk el (nem kap 202-t; a kliens a következő alkalommal újra küldi).
      if (partialShutdown === "done") return { closed: true as const };
      const queued = schedulePartial(lockKey, `${lessonId}|${recorder}`, recorder, snapshot.meta?.partial?.answered ?? 0, version,
        // R38: a név feloldása a küldési kísérleten belül (hibája újrapróbát kap, a ciklus végén az első rögzítő felszabadul).
        // R41: az újrapróba nyilvántartott ütemezőn át (leállításkor előrehozható).
        async () => sendLessonResult(async () => ({ lessonId, roundKey: partialRoundKey, ...(await sender()), graded: partialGraded }), true, gate, () => settleSending(lockKey, version), schedulePartialRetry));
      return { queued, partial: true };
    });
    if ("closed" in outcome) return res.status(503).json({ message: "A szerver éppen újraindul." });
    return res.status(202).json(outcome);
  }
  let graded: GradedTasks | GradedQuiz;
  if (body.kind === "tasks") {
    if (!Object.values(body.answers).some(a => a.trim())) return res.status(202).json({ queued: false });
    // A döntőbíró gyorsítótára (ha a tanuló felülete már kérte): az ítélet csak emelhet, mint a képernyőn.
    const keys = Object.entries(body.answers).flatMap(([tid, a]) => { const t = experience.tasks.find(x => x.id === tid); return t && a.trim() ? [[tid, arbiterCacheKey(t, a.trim())] as const] : []; });
    const cached = keys.length ? await db.select({ key: arbiterVerdicts.cacheKey, state: arbiterVerdicts.state, score: arbiterVerdicts.score }).from(arbiterVerdicts).where(inArray(arbiterVerdicts.cacheKey, keys.map(k => k[1]))) : [];
    const byKey = new Map(cached.map(c => [c.key, c]));
    graded = gradeTasks(experience.tasks, body.answers, (task, answer) => {
      const hit = byKey.get(arbiterCacheKey(task, answer));
      return hit ? { state: hit.state as "ok" | "partial" | "fail", score: hit.score } : null;
    });
  } else {
    if (!Object.keys(body.picks).length) return res.status(202).json({ queued: false });
    graded = gradeQuiz(experience.quiz, body.picks);
    // R1: a véglegesítés SZINKRON (await nélkül) jelölődik — innentől egyetlen „félbehagyva” kísérlet (újrapróba sem) indul el — és a
    // várakozó pillanatkép törlődik. Hogy a részleges levél korábban kiment-e (felülíró mondat), az lent, a kör kizárása alatt dől el.
    markFinalized(lessonId, body.roundId);
    // R15: a kör várakozó pillanatképét BÁRMELY véglegesítés törli (a beküldő kilététől függetlenül).
    cancelPartial(lockKey);
    partialVersions.delete(lockKey);
    sendingPartials.delete(lockKey);
  }
  // R18 + R27: tartós, tanulófüggetlen végleges-jelzősor (mindkét fajtánál). Ha a kör végleges beküldése már megtörtént, és a mostani
  // beküldő saját végleges sora még nincs meg, ez ugyanannak a körnek MÁS kiléttel ismételt beküldése (pl. elveszett 202 után fiókba lépve):
  // második levél és más név nem megy. Ugyanazon kilét ismétlése a meglévő címzettenkénti pótlásra fut. A jelzősor hibája nem akasztja meg
  // a beküldést (a memóriabeli véglegesítés véd; a hiba osztálya naplózódik).
  // R51 / L2: a jelzősor állapota nem bizonyítható (az írás hibázott) → 503 a 202 előtt; létező jelzőnél a tulajdonos-ellenőrzés mindig fut.
  let firstFinal: boolean;
  try { firstFinal = await claimFinalRound(lessonId, body.kind, body.roundId, graded.summary.percent, who); }
  catch (error) {
    logger.error(`[LESSON-RESULT] a véglegesítés nyoma nem íródott: ${errorClass(error)}`);
    return res.status(503).json({ message: "Átmeneti hiba — próbáld újra." });
  }
  if (firstFinal === false) {
    // R42: a saját végleges sor VAGY az első rögzítő tulajdonos-sora (a 202 előtt megszakadt első kérés ismétlése). Terv R49 (10. vak kör
    // L3): létező jelzősor mellett csak POZITÍVAN igazolt tulajdonos folytathatja — a tulajdonos-lekérdezés átmeneti hibája újrapróbálható
    // 503 (a 202 előtt), nem végleges küldés (különben más kézbesítési kulcson második levél mehetne).
    let own: Array<{ id: string }>;
    try {
      ownerCheckFault?.();
      own = await db.select({ id: lessonResultEmails.id }).from(lessonResultEmails)
        .where(and(eq(lessonResultEmails.lessonId, lessonId), eq(lessonResultEmails.kind, body.kind),
          inArray(lessonResultEmails.roundKey, [roundKeyOf(who, body.kind, body.roundId), finalOwnerKeyOf(who, body.kind, body.roundId)]))).limit(1);
    } catch (error) {
      logger.error(`[LESSON-RESULT] a végleges kör tulajdonosának ellenőrzése nem sikerült: ${errorClass(error)}`);
      return res.status(503).json({ message: "Átmeneti hiba — próbáld újra." });
    }
    // R51: a kör szerveres kilét-rögzítésével nem egyező (idegen) kérés létező végleges jelzőnél duplikátum — akkor is, ha a lefokozott
    // (vendég) kulcsa egyezne az eredeti vendég-beküldőével (pl. ugyanazon az eszközön fiókba lépve).
    if (!own.length || identity.foreign) return res.status(202).json({ queued: false, duplicate: true });
  }
  finalClaimFault?.();
  if (startedAtOnServer) graded = { ...graded, meta: { ...graded.meta, startedAt: startedAtOnServer } };
  const roundKey = roundKeyOf(who, body.kind, body.roundId);
  // Spec 2026-10-20-s4 (S4b + S4c): feladatszintű, névtelen eredmény (a levéltől független), utána a szigorítás automatikus lazítása. Nem
  // várjuk meg; a hiba csak napló.
  if (graded.kind === "tasks") {
    const tasksGraded = graded;
    const tightened = experience.tasks.filter(t => (t.tightened?.length || t.tightenedPhrases?.length || t.tightenedOrder) && tasksGraded.rows.some(r => r.taskId === t.id)).map(t => t.id);
    // Review #340 (P1): a közreműködő a szerver által ismert identitás (a kliens ujjlenyomata nem — azt szabadon választhatja).
    const contributor = contributorKey(userId ? `user:${userId}` : paired ? `learner:${paired.id}` : `ip:${clientIpKey(req) || "?"}`);
    void recordTaskResults(req.params.lessonId, roundKey, contributor, tasksGraded.rows)
      .then(() => maybeRelaxTightening(req.params.lessonId, tightened))
      .catch(error => logger.error("[S4] feladatszintű eredmény / lazítás hiba:", error));
  }
  // R1: a végleges kvíz a kör kizárása ALATT nézi meg, kiment-e már „félbehagyva” levél — az éppen futó részleges kísérlet végét megvárja
  // (legfeljebb a küldés időkorlátjáig), így a foglalás és a kézbesítés közti állapotot sosem látja. Ha a vizsgálat hibázik, a végleges
  // levél felülíró mondat nélkül megy (a levél nem maradhat el).
  const finalGraded = graded;
  const superseding: Promise<boolean> = body.kind !== "quiz" ? Promise.resolve(false) : withRoundLock(lockKey, async () => {
    // R11: a lecke + kör körkulcsán — a más tanuló-kulccsal (IP / ujjlenyomat) kiment részleges levelet is látja.
    const partialRows = await db.select({ delivered: lessonResultEmails.delivered }).from(lessonResultEmails)
      .where(and(eq(lessonResultEmails.lessonId, lessonId), eq(lessonResultEmails.kind, "quiz"), eq(lessonResultEmails.roundKey, partialRoundKey)));
    return partialRows.some(partialRow => partialRow.delivered.length > 0);
  }).catch(error => { logger.error(`[LESSON-RESULT] a felülírás-vizsgálat nem sikerült: ${errorClass(error)}`); return false; });
  // Nem várjuk meg: a tanuló felülete nem függ a levéltől.
  // R38: a név feloldása a végleges levélnél is a küldési kísérleten belül fut (a hibája újrapróbát kap, nem veszíti el a levelet).
  void sendLessonResult(async () => {
    const [learner, supersedesPartial] = await Promise.all([paired && !userId ? Promise.resolve(paired.name) : learnerName(userId), superseding]);
    return { lessonId: req.params.lessonId, roundKey, learner, ...(paired ? { learnerId: paired.id, ...(!userId ? { learnerFirst: paired.firstName } : {}) } : {}), guest: !userId && !paired,
      graded: supersedesPartial ? { ...finalGraded, meta: { ...finalGraded.meta, supersedesPartial: true } } : finalGraded };
  }).catch(error => logger.error("[LESSON-RESULT] háttérküldés hiba:", error));
  return res.status(202).json({ queued: true });
  } catch (error) { next(error); }
});

/**
 * A bejelentkezett tanuló szerveres kvízének első lezárása (finishPractice) — a szerver maga küld, kliens-beküldés nélkül.
 * A kör saját kérdés-pillanatképéből pontoz (nem a lecke esetleg azóta változott bankjából).
 */
export async function sendPracticeResult(input: { userId: string; attemptId: string; lessonId: string; questions: AttemptQuestion[]; answers: Record<string, AttemptAnswer> }) {
  const quiz = input.questions.map(q => ({ id: q.id, question: q.prompt, options: q.options, correctIndex: q.correctIndex }));
  // Review #280: a kör minden kérdése számít; a megválaszolatlan -1 (nulla pont, a hibásak között).
  const picks = Object.fromEntries(input.questions.map(q => [q.id, input.answers[q.id]?.pickedIndex ?? -1]));
  await sendLessonResult({ lessonId: input.lessonId, roundKey: roundKeyOf("practice", input.attemptId), learner: await learnerName(input.userId), graded: gradeQuiz(quiz, picks) });
}
