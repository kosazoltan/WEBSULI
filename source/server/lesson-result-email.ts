import { createHash } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { clientIpKey } from "./lib/client-ip";
import { partialLimiter, resultLimiter } from "./lesson-result-limits";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { arbiterVerdicts, lessonResultEmails, lessons, users } from "../shared/schema";
import { lessonSchema } from "../shared/lesson-schema";
import { buildResultEmail, GUEST_LEARNER, gradePartialQuiz, gradeQuiz, gradeTasks, resultRequestSchema, type GradedQuiz, type GradedTasks } from "../shared/lesson-result-email";
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
export async function sendLessonResult(input: SendInput, retry = true, gate?: SendGate): Promise<SendOutcome> {
  if (!gate) return attemptLessonResult(input, retry);
  try { return await gate(() => attemptLessonResult(input, retry, gate)); }
  catch (error) {
    // A kapu hibája (pl. az ellenőrző lekérdezésé) után nem küldünk vakon: a levél elmarad, a hiba osztálya naplózódik. Sosem dob.
    logger.error(`[LESSON-RESULT] a küldés előtti ellenőrzés nem sikerült: ${errorClass(error)}`);
    return { sent: 0, duplicate: false };
  }
}
async function attemptLessonResult(input: SendInput, retry: boolean, gate?: SendGate): Promise<SendOutcome> {
  try {
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
      if (retry) setTimeout(() => { void sendLessonResult(input, false, gate); }, retryDelayMs).unref?.();
    }
    return { sent: ok.length, duplicate: false };
  } catch (error) {
    // Review K3: csak a hiba osztálya / kódja — a lekérdezés hibaüzenete a paramétereket (e-mail-címet) is tartalmazná.
    logger.error(`[LESSON-RESULT] a küldés nem sikerült: ${errorClass(error)}${retry ? " — újrapróbálja" : ""}`);
    // Review (2026-11-17): a váratlan kivétel (az `allSettled`-en kívül: adatbázis, foglalás) után is egy újrapróba — levél ne vesszen el.
    if (retry) setTimeout(() => { void sendLessonResult(input, false, gate); }, retryDelayMs).unref?.();
    return { sent: 0, duplicate: false };
  }
}

async function learnerName(userId: string | undefined): Promise<string> {
  if (!userId) return GUEST_LEARNER;
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
const pendingPartials = new Map<string, { timer: ReturnType<typeof setTimeout>; owner: string; who: string; answered: number; send: () => Promise<unknown> }>();
/**
 * Terv R11 (második vak ellenőrzés K1/K2): a várakozó pillanatkép kulcsa a LECKE + KÖR (`lecke|körazonosító`), nem a tanuló-kulcs — így
 * ujjlenyomat nélküli → ujjlenyomatos, IP-váltásos, be- / kijelentkezéses esetben is körönként egy várakozó (és legfeljebb egy levél) van.
 * A körazonosítót a kliens választja, ezért a várakozót csak a kör ELSŐ rögzítőjével összeférő beküldő írhatja felül / törölheti, és a
 * véglegesítés is csak összeférő pillanatképet nyom el: ugyanaz a tanuló-kulcs, VAGY az első rögzítő vendég (a vendég azonosítója —
 * ujjlenyomat, IP — nem igazolt, a levél neve „Vendég tanuló”). Igazolt (fiók / párosított) tanuló körét így más nem írhatja felül.
 */
export function mayActOn(owner: string, who: string): boolean { return owner === who || owner.startsWith("guest:"); }
/** Terv R11: a pillanatkép körkulcsa a kézbesítés-nyilvántartásban — tanulótól független (lecke + kör: a sor maga is leckéhez kötött). */
export const partialRoundKeyOf = (roundId: string) => roundKeyOf("partial-round", "quiz-partial", roundId);
const MAX_PENDING_PARTIALS = 5000;
/** Review K1: tanulónként (fiók / párosítás / vendég) legfeljebb ennyi várakozó kör; a legrégebbi adja át a helyét. */
export const MAX_PENDING_PER_LEARNER = 3;
function cancelPartial(key: string): void {
  const entry = pendingPartials.get(key);
  if (entry) { clearTimeout(entry.timer); pendingPartials.delete(key); }
}
/**
 * Review K1: telítéskor a jogos pillanatkép NEM vész el csendben — a legrégebbi várakozó (először a tanulóé, aztán az összesé) adja át a
 * helyét, és ez naplózódik (azonosító nélkül).
 */
function schedulePartial(key: string, owner: string, who: string, answered: number, send: () => Promise<unknown>): boolean {
  // R7: körönként a LEGTÖBB választ tartalmazó pillanatkép marad — a később érkező, kevesebb válaszú (sorrendcsere, másik fül régebbi
  // állapota) nem írja felül a tartalmat; az időzítő ettől még újraindul (a tanuló az imént még aktív volt).
  const waiting = pendingPartials.get(key);
  const best = waiting && waiting.answered > answered ? { answered: waiting.answered, send: waiting.send, who: waiting.who, owner: waiting.owner } : { answered, send, who, owner };
  cancelPartial(key);
  const own = [...pendingPartials.entries()].filter(([, entry]) => entry.owner === best.owner).map(([k]) => k);
  if (own.length >= MAX_PENDING_PER_LEARNER) { cancelPartial(own[0]); logger.warn("[LESSON-RESULT] a tanuló legrégebbi várakozó félbehagyott köre kiszorult (tanulónkénti korlát)."); }
  if (pendingPartials.size >= MAX_PENDING_PARTIALS) { cancelPartial(pendingPartials.keys().next().value!); logger.warn("[LESSON-RESULT] a legrégebbi várakozó félbehagyott kör kiszorult (teljes korlát)."); }
  const timer = setTimeout(() => {
    pendingPartials.delete(key);
    // Review K4: csak a hiba osztálya / kódja (`errorClass`) — a lekérdezés hibaüzenete felhasználói azonosítót tartalmazhatna.
    void best.send().catch(error => logger.error(`[LESSON-RESULT] a félbehagyott kvíz küldése nem sikerült: ${errorClass(error)}`));
  }, partialDelayMs);
  timer.unref?.();
  pendingPartials.set(key, { timer, ...best });
  return true;
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
/** Terv R11: a véglegesítő tanuló-kulcsa is tárolódik — a véglegesítés csak az első rögzítővel összeférő pillanatképet nyomja el. */
const finalizedRounds = new Map<string, { until: number; who: string }>();
function markFinalized(lessonId: string, roundId: string, who: string, now = Date.now()): void {
  const key = `${lessonId}|${roundId}`;
  finalizedRounds.delete(key);
  if (finalizedRounds.size >= MAX_FINALIZED_ROUNDS) finalizedRounds.delete(finalizedRounds.keys().next().value!);
  finalizedRounds.set(key, { until: now + FINALIZED_TTL_MS, who });
}
/** `partialWho`: a pillanatkép rögzítője — a memóriabeli véglegesítés csak akkor számít, ha a véglegesítő vele összeférő (R11). */
async function roundFinalized(lessonId: string, whos: readonly string[], roundId: string, partialWho: string, now = Date.now()): Promise<boolean> {
  const key = `${lessonId}|${roundId}`;
  const finalized = finalizedRounds.get(key);
  if (finalized !== undefined) {
    if (finalized.until <= now) finalizedRounds.delete(key);
    else if (mayActOn(partialWho, finalized.who)) return true;
  }
  const rows = await db.select({ id: lessonResultEmails.id }).from(lessonResultEmails)
    .where(and(eq(lessonResultEmails.lessonId, lessonId), eq(lessonResultEmails.kind, "quiz"), inArray(lessonResultEmails.roundKey, whos.map(w => roundKeyOf(w, "quiz", roundId))))).limit(1);
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
export function clearPendingPartials(): void { for (const key of [...pendingPartials.keys()]) cancelPartial(key); }
/**
 * Terv R14 (második vak ellenőrzés K4): leállításkor a várakozó „félbehagyva” levelek a késleltetés kivárása nélkül kimennek, a szokott
 * kapun (kizárás + véglegesítés-ellenőrzés) át, legfeljebb `timeoutMs`-ig. Az időkorlát után visszatér (a leállás folytatódik). Sosem dob.
 */
export async function flushPendingPartials(timeoutMs: number): Promise<void> {
  const entries = [...pendingPartials.values()];
  for (const entry of entries) clearTimeout(entry.timer);
  pendingPartials.clear();
  if (!entries.length) return;
  const sending = Promise.allSettled(entries.map(entry => Promise.resolve().then(entry.send)));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<"timeout">(resolve => { timer = setTimeout(() => resolve("timeout"), timeoutMs); timer.unref?.(); });
  const outcome = await Promise.race([sending, limit]);
  clearTimeout(timer);
  if (outcome === "timeout") logger.warn(`[LESSON-RESULT] leállítás: ${entries.length} várakozó „félbehagyva” levél kiküldése nem fejeződött be ${timeoutMs} ms alatt.`);
}

/** POST /api/lessons/:lessonId/results — a feladatok / a helyi kvíz befejezésekor (vendég is). Mindig 202, ha a kérés érvényes. */
export const lessonResultsRouter = Router();
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
  const userId = (req.user as { id?: string } | undefined)?.id;
  // Tanulói profil (S2): a párosított eszköz tanulója (ellenőrzött token). Átfogó review: bejelentkezve is a tanuló naplójába kerül
  // (mint a régi anyagnál); a levél neve bejelentkezve a fiók neve marad.
  const paired = body.learner ? await resolveLearner(body.learner).catch(() => null) : null;
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
    // R5: a 7 napos szabály a szerveren is — az utolsó válasz (ennek hiányában a kezdés) idejéhez mérve. Mindkét időbélyeg a klienstől
    // jön: ez a becsületes (régi / hibás) klienst fogja meg, a szándékos hamisítást a keret korlátozza.
    const lastActivity = body.lastAnsweredAt ?? body.startedAt;
    if (lastActivity !== undefined && roundTooOld(lastActivity, body.clientNow ?? receivedAt)) return res.status(202).json({ queued: false, stale: true });
    // PR #510: a már véglegesített kör késői pillanatképe nem ütemeződik — a befejezett kör mellé nem mehet „félbehagyva” levél.
    if (await roundFinalized(lessonId, partialWhos, body.roundId, who)) return res.status(202).json({ queued: false, finalized: true });
    // R11: a kör első rögzítőjével össze nem férő beküldő nem írhatja felül a várakozót (a körazonosítót a kliens választja).
    const waiting = pendingPartials.get(lockKey);
    if (waiting && !mayActOn(waiting.who, who)) return res.status(202).json({ queued: false, partial: true, conflict: true });
    // R6 + R11: ha a körről már kiment (vagy éppen megy) „félbehagyva” levél — bármelyik tanuló-kulccsal —, újabb nem megy (körönként
    // legfeljebb egy); a válasz ezt mondja.
    const earlier = await db.select({ delivered: lessonResultEmails.delivered }).from(lessonResultEmails)
      .where(and(eq(lessonResultEmails.lessonId, lessonId), eq(lessonResultEmails.kind, "quiz"), eq(lessonResultEmails.roundKey, partialRoundKey)));
    if (earlier.some(sentRow => sentRow.delivered.length > 0)) return res.status(202).json({ queued: false, partial: true, alreadySent: true });
    const lastAnsweredOnServer = onServerClock(body.lastAnsweredAt);
    const partialGraded: GradedQuiz = { ...snapshot, meta: { ...snapshot.meta, ...(startedAtOnServer ? { startedAt: startedAtOnServer } : {}), ...(lastAnsweredOnServer ? { lastAnsweredAt: lastAnsweredOnServer } : {}) } };
    // R1: a kapu MINDEN kísérlet (az újrapróba is) előtt, a kör kizárása alatt nézi, hogy a kör közben véglegesült-e.
    const gate: SendGate = attempt => withRoundLock(lockKey, async () => ((await roundFinalized(lessonId, partialWhos, body.roundId, who)) ? { sent: 0, duplicate: true } : attempt()));
    const queued = schedulePartial(lockKey, `${lessonId}|${who}`, who, snapshot.meta?.partial?.answered ?? 0,
      async () => sendLessonResult({ lessonId, roundKey: partialRoundKey, learner: await nameOf(), ...attribution, graded: partialGraded }, true, gate));
    return res.status(202).json({ queued, partial: true });
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
    markFinalized(lessonId, body.roundId, who);
    // R11: a várakozót csak a kör első rögzítőjével összeférő végleges beküldés törli.
    const waiting = pendingPartials.get(lockKey);
    if (waiting && mayActOn(waiting.who, who)) cancelPartial(lockKey);
  }
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
  void Promise.all([paired && !userId ? Promise.resolve(paired.name) : learnerName(userId), superseding]).then(([learner, supersedesPartial]) => sendLessonResult({ lessonId: req.params.lessonId, roundKey, learner,
    ...(paired ? { learnerId: paired.id, ...(!userId ? { learnerFirst: paired.firstName } : {}) } : {}), guest: !userId && !paired,
    graded: supersedesPartial ? { ...finalGraded, meta: { ...finalGraded.meta, supersedesPartial: true } } : finalGraded }))
    .catch(error => logger.error("[LESSON-RESULT] háttérküldés hiba:", error));
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
