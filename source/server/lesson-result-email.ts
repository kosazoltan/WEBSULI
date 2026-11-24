import { createHash } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { clientIpKey } from "./lib/client-ip";
import { partialLimiter, resultLimiter } from "./lesson-result-limits";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { arbiterVerdicts, lessonResultEmails, lessons, users } from "../shared/schema";
import { lessonSchema } from "../shared/lesson-schema";
import { buildCombinedResultEmail, buildResultEmail, GUEST_LEARNER, gradePartialQuiz, gradeQuiz, gradeTasks, resultRequestSchema, type GradedQuiz, type GradedTasks } from "../shared/lesson-result-email";
import { experienceRoundSizes } from "../shared/lesson-experience";
import { roundTooOld } from "../shared/quiz-round";
import { resolveAdminRecipients } from "./lib/material-result";
import { arbiterCacheKey } from "./arbiter/arbiter";
import { getMaterialPreviewUrl } from "./utils/config";
import type { AttemptAnswer, AttemptQuestion } from "../shared/lesson-attempt";
import { logger } from "./lib/logger";
import { recordLearnerActivity, resolveLearner } from "./learners";
import { contributorKey, maybeRelaxTightening, recordTaskResults } from "./task-results";
import { isTwoPartExperience, markPairDelivered, markPartDelivered, pairOrPark, resultCombinedEmailEnabled, takeParkedForLegacy, type PairedParts, type PendingLearner } from "./lesson-result-combine";

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
/** PR #577 review: a végleges levél felülírás-ellenőrzésének korlátos próbaszáma (átmeneti DB-hiba). */
const SUPERSEDE_CHECK_ATTEMPTS = 4;
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
 * Bontás B4a: a „félbehagyva” / körönként-egy-levél szerveroldal kapcsolója (`RESULT_PARTIAL_EMAIL=on`). Minden más érték vagy hiány = KI:
 * a főági viselkedés változatlan (a jelzősor sem íródik). Minden kérésnél frissen olvasva (a teszt és az élesítés is átállíthatja).
 */
export const resultPartialEmailEnabled = (env: NodeJS.ProcessEnv = process.env) => env.RESULT_PARTIAL_EMAIL === "on";
/**
 * #510 R18 / R27: a véglegesítés tartós, tanulófüggetlen jelzősora a kézbesítés-nyilvántartásban (sémaváltozás nélkül: ez a körkulcs, üres
 * `delivered`) — újraindítás után, más példányon és bármely kilétnél is megfogja ugyanannak a körnek az ismételt végleges beküldését.
 */
export const finalRoundKeyOf = (roundId: string, kind: "tasks" | "quiz" = "quiz") => roundKeyOf("final-round", kind, roundId);
/**
 * #510 R42: a jelzősor ELSŐ rögzítőjének álnevesített tulajdonos-sora (lecke + fajta + kör + kilét; üres kézbesítés), a jelzősorral egy
 * tranzakcióban — ha a kérés a jelzősor után, a 202 előtt megszakad, az eredeti beküldő ismétlése továbbmehet (más kilét duplikátum).
 */
export const finalOwnerKeyOf = (who: string, kind: "tasks" | "quiz", roundId: string) => roundKeyOf("final-owner", kind, roundId, who);
let finalMarkerFault: ((stage: "insert" | "ttl") => void) | null = null;
/** Teszthez: hibainjektálás a végleges jelzősor írása (`insert`) vagy élettartam-frissítése (`ttl`) elé; `null` kikapcsolja. */
export function setFinalMarkerFault(fault: ((stage: "insert" | "ttl") => void) | null): void { finalMarkerFault = fault; }
let ownerCheckFault: (() => void) | null = null;
/** Teszthez: hibainjektálás a végleges kör tulajdonos-lekérdezése elé. */
export function setOwnerCheckFault(fault: (() => void) | null): void { ownerCheckFault = fault; }
let finalClaimFault: (() => void) | null = null;
/** Teszthez (R42): a jelzősor UTÁN, a 202 előtt megszakadó kérés szimulálása. */
export function setFinalClaimFault(fault: (() => void) | null): void { finalClaimFault = fault; }
let pairingFault: (() => void) | null = null;
/** Teszthez (R47 szerver): a párosítás feloldásának átmeneti (adatbázis-) hibája. */
export function setPairingFault(fault: (() => void) | null): void { pairingFault = fault; }
let roundStateFault: ((stage: "finalized" | "partialSent") => void) | null = null;
/** Teszt-kampó (PR #577 review): a kör-állapot lekérdezéseinek (véglegesített? / kiment a részleges?) átmeneti hibája. */
export function setRoundStateFault(fault: ((stage: "finalized" | "partialSent") => void) | null): void { roundStateFault = fault; }

/**
 * #510 R27 + R42: a jelzősor és a tulajdonos-sor egy tranzakcióban. Igaz, ha ez az ELSŐ végleges beküldés a körre. Ismétlésnél a jelzősor
 * `created_at`-ja best effort frissül (R51 L2: a hibája nem kerüli meg a hívó tulajdonos-ellenőrzését); az írás hibája a hívóhoz jut (503).
 */
async function claimFinalRound(lessonId: string, kind: "tasks" | "quiz", roundId: string, percent: number, who: string): Promise<boolean> {
  finalMarkerFault?.("insert");
  const fresh = await db.transaction(async tx => {
    const marker = await tx.insert(lessonResultEmails).values({ lessonId, kind, roundKey: finalRoundKeyOf(roundId, kind), percent })
      .onConflictDoNothing().returning({ id: lessonResultEmails.id });
    if (marker.length) await tx.insert(lessonResultEmails).values({ lessonId, kind, roundKey: finalOwnerKeyOf(who, kind, roundId), percent }).onConflictDoNothing();
    return marker.length > 0;
  });
  if (fresh) return true;
  try {
    finalMarkerFault?.("ttl");
    await db.update(lessonResultEmails).set({ createdAt: sql`now()` })
      .where(and(eq(lessonResultEmails.lessonId, lessonId), eq(lessonResultEmails.kind, kind), eq(lessonResultEmails.roundKey, finalRoundKeyOf(roundId, kind))));
  } catch (error) { logger.error(`[LESSON-RESULT] a végleges jelző élettartama nem frissült: ${errorClass(error)}`); }
  return false;
}

/**
 * Küldés a címzettlistának; körönként (lecke, fajta, roundKey) egy levél címzettenként. Review #280: a kézbesítés címzettenként
 * nyilvántartott (`delivered`: kézbesítve VAGY éppen küldés alatt — a foglalás a küldés ELŐTT, atomi módosítással történik) — a
 * meghiúsult címzett a következő azonos hívással és egy 60 s-os automatikus újrapróbálással pótolódik, a már kézbesített (vagy más
 * hívás által éppen küldött) nem kap másodikat. Sosem dob — a hiba a naplóba megy.
 */
export async function sendLessonResult(input: { lessonId: string; roundKey: string; learner: string; learnerFirst?: string; learnerId?: string; guest?: boolean; graded: GradedTasks | GradedQuiz;
  /** U4b: összevont levél (a két rész egy levélben); a jelzősor a `graded` (feladat-) részé, a körkulcs a két körből képzett. */
  combined?: { tasks: GradedTasks | null; quiz: GradedQuiz | null } }, retry = true, report?: { failed: number }): Promise<{ sent: number; duplicate: boolean }> {
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
    const [claim] = await db.select({ id: lessonResultEmails.id, delivered: lessonResultEmails.delivered, createdAt: lessonResultEmails.createdAt }).from(lessonResultEmails)
      .where(and(eq(lessonResultEmails.lessonId, input.lessonId), eq(lessonResultEmails.kind, input.graded.kind), eq(lessonResultEmails.roundKey, input.roundKey)));
    const recipients = resolveAdminRecipients({ ADMIN_EMAILS: process.env.ADMIN_EMAILS, ADMIN_EMAIL: process.env.ADMIN_EMAIL });
    if (!recipients.length) { logger.warn("[LESSON-RESULT] nincs címzett (ADMIN_EMAILS)"); return { sent: 0, duplicate: false }; }
    const missing = recipients.filter(r => !claim.delivered.includes(r));
    if (!missing.length) return { sent: 0, duplicate: true };
    // Review K1: a levél a foglalás ELŐTT áll össze — ha az összeállítás dob, nincs mit felszabadítani.
    const common = { lessonTitle: lesson.data.title, classroom: lesson.data.classroom, learner: input.learner, learnerFirst: input.learnerFirst, guest: input.guest,
      // Codex-review #532: a „Beküldve” ideje a kör ELSŐ beküldéséé (a tárolt sor ideje) — az újrapróba levele így bájtra azonos, és az
      // idempotencia-kulccsal küldött ismétlést a levélszolgáltató nem utasítja el eltérő tartalom miatt.
      url: row.htmlFileId ? getMaterialPreviewUrl(row.htmlFileId) : "", sentAt: claim.createdAt };
    const mail = input.combined ? buildCombinedResultEmail({ ...common, tasks: input.combined.tasks, quiz: input.combined.quiz })
      : buildResultEmail({ ...common, graded: input.graded });
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
      if (retry) setTimeout(() => { void sendLessonResult(input, false); }, retryDelayMs).unref?.();
    }
    if (report) report.failed = claimed.length - ok.length;
    return { sent: ok.length, duplicate: false };
  } catch (error) {
    // Review K3: csak a hiba osztálya / kódja — a lekérdezés hibaüzenete a paramétereket (e-mail-címet) is tartalmazná.
    logger.error(`[LESSON-RESULT] a küldés nem sikerült: ${errorClass(error)}${retry ? " — újrapróbálja" : ""}`);
    // Review (2026-11-17): a váratlan kivétel (az `allSettled`-en kívül: adatbázis, foglalás) után is egy újrapróba — levél ne vesszen el.
    if (retry) setTimeout(() => { void sendLessonResult(input, false); }, retryDelayMs).unref?.();
    if (report) report.failed = -1;
    return { sent: 0, duplicate: false };
  }
}

/**
 * Eredmény-e-mail B5a-1 (#510 S1b; R1, R5–R7, R15, R18, R21): a FÉLBEHAGYOTT helyi kvíz. A kliens (B5b) a lap háttérbe kerülésekor a kör
 * pillanatképét küldi; itt körönként (lecke + kör) a LEGTÖBB választ tartalmazó pillanatkép vár memóriában, és csak akkor megy EGY
 * „félbehagyva” levél, ha a késleltetés alatt sem újabb pillanatkép, sem végleges beküldés nem érkezik. Vállalt korlát (spec): újraindításkor
 * a várakozó, még el nem küldött pillanatkép elvész; több példánynál a kizárás példányon belüli (kanban #135). Csak `RESULT_PARTIAL_EMAIL=on`.
 */
let partialDelayMs = 15 * 60 * 1000;
/** Teszthez: a késleltetés rövidítése; a korábbi értéket adja vissza. */
export function setPartialDelay(ms: number): number { const previous = partialDelayMs; partialDelayMs = ms; return previous; }
type PendingPartial = { timer: ReturnType<typeof setTimeout>; answered: number; owner: string; version: number; send: (version: number) => Promise<void> };
const pendingPartials = new Map<string, PendingPartial>();
const MAX_PENDING_PARTIALS = 5000;
/** Review K1 (#510): tanulónként legfeljebb ennyi várakozó kör; telítéskor a legrégebbi szorul ki (naplózva). */
export const MAX_PENDING_PER_LEARNER = 3;
/** R21: körönként az AKTUÁLIS pillanatkép változata — a régebbi változat (elavult időzítő / újrapróba) a kapuban megáll. */
const partialVersions = new Map<string, number>();
let partialVersionSeq = 0;
/** Teszthez: a várakozó pillanatképek száma. */
export function pendingPartialCount(): number { return pendingPartials.size; }
/** R11: a pillanatkép körkulcsa a kézbesítés-nyilvántartásban — tanulótól független (lecke + kör; a sor maga leckéhez kötött). */
export const partialRoundKeyOf = (roundId: string) => roundKeyOf("partial-round", "quiz-partial", roundId);
function cancelPartial(key: string): void {
  const entry = pendingPartials.get(key);
  if (entry) { clearTimeout(entry.timer); pendingPartials.delete(key); }
}
/** R15 / R18: a véglegesített körök (lecke + kör → lejárat) memóriában, 24 óráig, korlátos mérettel; a tartós forrás a B4a jelzősora. */
const FINALIZED_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_FINALIZED_ROUNDS = 20_000;
const finalizedRounds = new Map<string, number>();
function markFinalized(key: string, now = Date.now()): void {
  finalizedRounds.delete(key);
  if (finalizedRounds.size >= MAX_FINALIZED_ROUNDS) finalizedRounds.delete(finalizedRounds.keys().next().value!);
  finalizedRounds.set(key, now + FINALIZED_TTL_MS);
}
/** Teszthez (újraindítás szimulálása): a memóriabeli véglegesítés-jelzők törlése. */
export function clearFinalizedRounds(): void { finalizedRounds.clear(); }
async function roundFinalized(lessonId: string, roundId: string, now = Date.now()): Promise<boolean> {
  roundStateFault?.("finalized");
  const until = finalizedRounds.get(`${lessonId}|${roundId}`);
  if (until !== undefined && until > now) return true;
  const rows = await db.select({ createdAt: lessonResultEmails.createdAt }).from(lessonResultEmails)
    .where(and(eq(lessonResultEmails.lessonId, lessonId), eq(lessonResultEmails.kind, "quiz"), eq(lessonResultEmails.roundKey, finalRoundKeyOf(roundId, "quiz"))));
  return rows.some(row => now - row.createdAt.getTime() < FINALIZED_TTL_MS);
}
async function partialAlreadySent(lessonId: string, roundId: string): Promise<boolean> {
  roundStateFault?.("partialSent");
  const rows = await db.select({ delivered: lessonResultEmails.delivered }).from(lessonResultEmails)
    .where(and(eq(lessonResultEmails.lessonId, lessonId), eq(lessonResultEmails.kind, "quiz"), eq(lessonResultEmails.roundKey, partialRoundKeyOf(roundId))));
  return rows.some(row => row.delivered.length > 0);
}
/** R1: körönkénti (lecke + kör) kizárás a „félbehagyva” küldés és a véglegesítés felülírás-vizsgálata + levele között (példányon belül). */
const roundLocks = new Map<string, Promise<void>>();
async function withRoundLock<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = roundLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  const chained = previous.then(() => current);
  roundLocks.set(key, chained);
  await previous;
  try { return await run(); }
  finally { release(); if (roundLocks.get(key) === chained) roundLocks.delete(key); }
}
/**
 * PR #577 review (R7 a küldés és az újrapróba alatt is): körönként a LEGTÖBB választ tartalmazó pillanatkép — a várakozó törlése
 * (az időzítő lejárta, bukott küldés + függő újrapróba) után is megmarad, amíg a kör nem véglegesül / a részleges ki nem ment.
 */
const bestPartials = new Map<string, { answered: number; owner: string; send: (version: number) => Promise<void> }>();
function forgetPartial(key: string): void { bestPartials.delete(key); }
function schedulePartial(key: string, owner: string, answered: number, send: (version: number) => Promise<void>): void {
  // R7: a LEGTÖBB választ tartalmazó pillanatkép marad (sorrendcsere, két fül); az időzítő ettől még újraindul.
  const waiting = pendingPartials.get(key) ?? bestPartials.get(key);
  const keep = waiting && waiting.answered > answered ? { answered: waiting.answered, owner: waiting.owner, send: waiting.send } : { answered, owner, send };
  bestPartials.delete(key);
  if (bestPartials.size >= MAX_FINALIZED_ROUNDS) bestPartials.delete(bestPartials.keys().next().value!);
  bestPartials.set(key, keep);
  cancelPartial(key);
  const own = [...pendingPartials.entries()].filter(([, e]) => e.owner === keep.owner).map(([k]) => k);
  if (own.length >= MAX_PENDING_PER_LEARNER) { cancelPartial(own[0]); logger.warn("[LESSON-RESULT] a tanuló legrégebbi várakozó félbehagyott köre kiszorult (tanulónkénti korlát)."); }
  if (pendingPartials.size >= MAX_PENDING_PARTIALS) { cancelPartial(pendingPartials.keys().next().value!); logger.warn("[LESSON-RESULT] a legrégebbi várakozó félbehagyott kör kiszorult (teljes korlát)."); }
  const version = ++partialVersionSeq;
  partialVersions.delete(key);
  if (partialVersions.size >= MAX_FINALIZED_ROUNDS) partialVersions.delete(partialVersions.keys().next().value!);
  partialVersions.set(key, version);
  const timer = setTimeout(() => {
    const entry = pendingPartials.get(key);
    if (!entry || entry.version !== version) return;
    pendingPartials.delete(key);
    void entry.send(version).catch(error => logger.error(`[LESSON-RESULT] a félbehagyott kvíz küldése nem sikerült: ${errorClass(error)}`));
  }, partialDelayMs);
  timer.unref?.();
  pendingPartials.set(key, { timer, version, ...keep });
}
/**
 * A „félbehagyva” levél egy küldési kísérlete a kör kizárása ALATT: (R1 / R18) ha a kör közben véglegesült, (R21) ha újabb pillanatkép
 * ütemeződött, nem küld. A bukott kísérlet egyetlen újrapróbája ugyanezen a kapun megy át (E17: véglegesített körre az újrapróbából sem).
 */
async function attemptPartial(lessonId: string, roundId: string, version: number, input: Parameters<typeof sendLessonResult>[0], retryLeft: number): Promise<void> {
  const key = `${lessonId}|${roundId}`;
  // PR #577 review: a kapu (állapot-lekérdezés) átmeneti hibája is sikertelen kísérlet — az egyetlen újrapróba ugyanezen a kapun
  // (változat + véglegesítés) megy át újra, így a 202-vel nyugtázott pillanatkép nem vész el egy pillanatnyi DB-hiba miatt.
  const outcome = await withRoundLock(key, async () => {
    if (partialVersions.get(key) !== version) return null;
    if (await roundFinalized(lessonId, roundId)) { forgetPartial(key); return null; }
    const report = { failed: 0 };
    await sendLessonResult(input, false, report);
    if (report.failed === 0) forgetPartial(key);
    return report;
  }).catch((error) => { logger.warn(`[LESSON-RESULT] a félbehagyott kvíz kísérletének kapuja átmenetileg hibázott: ${errorClass(error)}`); return { failed: 1 }; });
  if (outcome && outcome.failed !== 0 && retryLeft > 0) {
    setTimeout(() => { void attemptPartial(lessonId, roundId, version, input, retryLeft - 1).catch(error => logger.error(`[LESSON-RESULT] a félbehagyott kvíz újrapróbája nem sikerült: ${errorClass(error)}`)); }, retryDelayMs).unref?.();
  }
}

async function learnerName(userId: string | undefined): Promise<string> {
  if (!userId) return GUEST_LEARNER;
  const [u] = await db.select({ first: users.firstName, last: users.lastName }).from(users).where(eq(users.id, userId));
  const name = `${u?.last ?? ""} ${u?.first ?? ""}`.trim();
  return name || "Bejelentkezett tanuló";
}

// Eredmény-e-mail B2 (#510 R9): a két eredménykeret (végleges / pillanatkép, 60 + 60 / 15 perc / IP) a `lesson-result-limits.ts`-ben.
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
  // B5a-0: a pillanatkép (`partial: true`) SOHA nem végleges beküldés — a „félbehagyva” út (B5a-1, kapcsoló mögött) nélkül csak nyugtázzuk:
  // nem pontozódik, nem foglal kör-kulcsot, levél nem megy (a kliens 2xx után nem küldi újra; a végleges beküldés ettől függetlenül megy).
  const partialOn = body.kind === "quiz" && body.partial === true && resultPartialEmailEnabled();
  if (body.kind === "quiz" && body.partial && !partialOn) return res.status(202).json({ queued: false, partial: true });
  const userId = (req.user as { id?: string } | undefined)?.id;
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
    if (partialOn) {
      // B5a-1 (R5): a 7 napnál régebbi utolsó tevékenységű pillanatkép nem fogadható el; az „összes” a szerveroldali körméret.
      // PR #577 review: csak az ISMERT utolsó válasz kora számít (shared/quiz-round.ts) — a kör kezdete nem; hiányában nem elavult.
      if (roundTooOld(body.lastAnsweredAt ?? 0, Date.now())) return res.status(202).json({ queued: false, partial: true, stale: true });
      const partialGraded = gradePartialQuiz(experience.quiz, body.picks, experienceRoundSizes(experience).quizRound);
      if (!partialGraded) return res.status(202).json({ queued: false, partial: true });
      graded = partialGraded;
    } else {
      if (!Object.keys(body.picks).length) return res.status(202).json({ queued: false });
      graded = gradeQuiz(experience.quiz, body.picks);
    }
  }
  // Bontás B1a: a kör kezdete a levél dátumsorához (a hihetőséget a levélépítő ellenőrzi; régi kliensnél hiányzik).
  if (body.startedAt !== undefined) graded = { ...graded, meta: { ...graded.meta, startedAt: body.startedAt } };
  if (partialOn && body.kind === "quiz" && body.lastAnsweredAt !== undefined) graded = { ...graded, meta: { ...graded.meta, lastAnsweredAt: body.lastAnsweredAt } };
  // Tanulói profil (S2): a párosított eszköz tanulója (ellenőrzött token). Átfogó review: bejelentkezve is a tanuló naplójába kerül
  // (mint a régi anyagnál); a levél neve bejelentkezve a fiók neve marad.
  // U4b: kétrészes leckénél (kapcsoló BE) a végleges rész párosítódik; a B4 tulajdonos-ellenőrzés ilyenkor a B5a kapcsolójától
  // függetlenül fut (review #583). A „félbehagyva” pillanatkép (partialOn) ettől független marad.
  const combinedOn = !partialOn && resultCombinedEmailEnabled() && isTwoPartExperience(experience);
  const once = resultPartialEmailEnabled() || combinedOn;
  let paired: Awaited<ReturnType<typeof resolveLearner>> = null;
  if (body.learner) {
    try { pairingFault?.(); paired = await resolveLearner(body.learner); }
    catch (error) {
      // B4a (#510 R47 szerver): az átmeneti feloldási hiba nem azonos az érvénytelen tokennel — BE állásban nem rögzül vendégként (se
      // jelzősor, se levél), hanem újrapróbálható 503-at kap; KI állásban a főági vendég-út.
      if (once) { logger.error(`[LESSON-RESULT] a párosítás feloldása átmenetileg nem sikerült: ${errorClass(error)}`); return res.status(503).json({ message: "Átmeneti hiba — próbáld újra." }); }
      paired = null;
    }
  }
  const who = userId ?? (paired ? `learner:${paired.id}` : `guest:${body.fingerprint ?? (clientIpKey(req) || "?")}`);
  const roundKey = roundKeyOf(who, body.kind, body.roundId);
  const lockKey = `${req.params.lessonId}|${body.roundId}`;
  if (partialOn) {
    // B5a-1: a pillanatkép — (P4 / R18) véglegesített körre nem ütemeződik; (R6) kiment „félbehagyva” levél után sem; különben (R7) ütemez.
    if (await roundFinalized(req.params.lessonId, body.roundId)) return res.status(202).json({ queued: false, partial: true, finalized: true });
    if (await partialAlreadySent(req.params.lessonId, body.roundId)) return res.status(202).json({ queued: false, partial: true, alreadySent: true });
    const partialGraded = graded as GradedQuiz;
    const lessonId = req.params.lessonId;
    const roundId = body.roundId;
    // PR #577 review: a név a küldési callbackben, hibakezelés alatt kérdeződik le (nincs kezeletlen elutasítás törölt várakozónál);
    // a tanulónkénti korlát leckénként számol (`lecke|tanuló`, #510 forrásspec 240–242).
    const pairedName = paired && !userId ? paired.name : null;
    schedulePartial(lockKey, `${lessonId}|${who}`, partialGraded.meta?.partial?.answered ?? 0, async version => {
      const learner = pairedName ?? await learnerName(userId);
      await attemptPartial(lessonId, roundId, version, { lessonId, roundKey: partialRoundKeyOf(roundId), learner,
        ...(paired && !userId ? { learnerFirst: paired.firstName } : {}), guest: !userId && !paired, graded: partialGraded }, 1);
    });
    return res.status(202).json({ queued: true, partial: true });
  }
  let duplicate = false;
  if (once) {
    // B4a (#510 R27, R42, R49 c): körönként egy végleges levél, kiléttől függetlenül. Létező jelzőnél csak a saját kézbesítési sor vagy a
    // saját (R42) tulajdonos-sor birtokosa folytathatja; más kilét duplikátum. A jelzősor írásának és a tulajdonos-lekérdezésnek az
    // átmeneti hibája 503 a 202 előtt (bizonyíthatatlan állapotban nem megy végleges levél).
    // PR #571 review: pontozott sor nélküli beküldés (csak ismeretlen azonosítók) nem foglalhatja le a kört.
    if (!graded.rows.length) return res.status(202).json({ queued: false });
    // Vállalt átmeneti korlát (PR #571 review): a garancia a BE állásban először véglegesített körökre szól. A KI alatt már elküldött körnek
    // nincs jelzője (a régi kézbesítési kulcs kilétfüggő, körszinten nem kereshető): ha ugyanazt a kört a bekapcsolás után más kilét küldi be,
    // az ő beküldése rögzíti a jelzőt (legfeljebb egy további levélpár), minden további kilét duplikátum; az eredeti kilét a saját során
    // csak a hiányzó címzettjeit pótolja. A bekapcsolás előtti körök a kliens „elküldve” jelzője miatt jellemzően nem jönnek újra.
    let first: boolean;
    try { first = await claimFinalRound(req.params.lessonId, body.kind, body.roundId, graded.summary.percent, who); }
    catch (error) { logger.error(`[LESSON-RESULT] a véglegesítés nyoma nem íródott: ${errorClass(error)}`); return res.status(503).json({ message: "Átmeneti hiba — próbáld újra." }); }
    if (!first) {
      let own: string[];
      try {
        ownerCheckFault?.();
        own = (await db.select({ roundKey: lessonResultEmails.roundKey }).from(lessonResultEmails)
          .where(and(eq(lessonResultEmails.lessonId, req.params.lessonId), eq(lessonResultEmails.kind, body.kind),
            inArray(lessonResultEmails.roundKey, [roundKey, finalOwnerKeyOf(who, body.kind, body.roundId)])))).map(row => row.roundKey);
      } catch (error) {
        logger.error(`[LESSON-RESULT] a végleges kör tulajdonosának ellenőrzése nem sikerült: ${errorClass(error)}`);
        return res.status(503).json({ message: "Átmeneti hiba — próbáld újra." });
      }
      duplicate = own.length === 0;
    }
    if (!duplicate) finalClaimFault?.();
  }
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
  // PR #571 review: a duplikátum csak a második levelet tiltja — a levéltől független feladatmérés (fent, saját idempotenciával és
  // közreműködőnkénti számlálással) ettől még fut.
  if (duplicate) return res.status(202).json({ queued: false, duplicate: true });
  // B5a-1 (R1, R15): a kvíz véglegesítése SZINKRON jelölődik (innentől „félbehagyva” kísérlet nem küld), a várakozó pillanatkép törlődik;
  // hogy a részleges levél korábban kiment-e (felülíró mondat), az a kör kizárása alatt dől el, a háttérben.
  const finalizing = once && graded.kind === "quiz";
  if (finalizing) { markFinalized(lockKey); cancelPartial(lockKey); partialVersions.delete(lockKey); forgetPartial(lockKey); }
  const lessonIdF = req.params.lessonId;
  // Review #586: vendégnél csak egyértelmű (ujjlenyomatos) kilét párosít — a közös tartalék-kilét (IP / „?”) nem keverheti össze
  // különböző vendégek eredményét; ilyenkor a régi egyrészes út megy.
  if (combinedOn && (userId || paired || body.fingerprint)) {
    const learner: PendingLearner = { learner: paired && !userId ? paired.name : await learnerName(userId),
      ...(paired ? { learnerId: paired.id, ...(!userId ? { learnerFirst: paired.firstName } : {}) } : {}), guest: !userId && !paired };
    let part: GradedTasks | GradedQuiz = graded;
    if (graded.kind === "quiz" && resultPartialEmailEnabled()) {
      // Review #586: mindkét kapcsoló BE — a korábban kiment „félbehagyva” levél felülírásának jelzése az összevont levélben is.
      let superseded: boolean | null = null;
      try { superseded = await partialAlreadySent(lessonIdF, body.roundId); } catch (error) { logger.warn(`[LESSON-RESULT] a felülírás-ellenőrzés hibázott: ${errorClass(error)}`); }
      const supersedes: boolean | "unknown" = superseded === null ? "unknown" : superseded;
      if (supersedes) part = { ...graded, meta: { ...graded.meta, supersedesPartial: supersedes } };
    }
    const outcome = await pairOrPark({ lessonId: lessonIdF, ownerKey: who, kind: part.kind, roundId: body.roundId, graded: part, learner });
    if (outcome.type === "alreadySent") {
      // Review #586: a kézbesítetlen pár (leállás, szolgáltatói hiba, nincs címzett) a kör ismételt beküldésére újra kézbesül.
      if (outcome.redeliver) void deliverCombined(lessonIdF, outcome.redeliver, false).catch(error => logger.error("[LESSON-RESULT] összevont újrakézbesítés hiba:", error));
      return res.status(202).json({ queued: false, alreadySent: true });
    }
    if (outcome.type === "parked") return res.status(202).json({ queued: false, awaiting: outcome.awaiting });
    void deliverCombined(lessonIdF, outcome, true).catch(error => logger.error("[LESSON-RESULT] összevont háttérküldés hiba:", error));
    return res.status(202).json({ queued: true, combined: true });
  }
  if (!combinedOn && isTwoPartExperience(experience)) {
    // Review #586 (kapcsoló-időszakok): KI állásban a korábban (BE alatt) félretett részek a régi úton, egyrészes levélként mennek.
    void takeParkedForLegacy(lessonIdF, who).then(parts => Promise.all(parts.map(async p => {
      const report = { failed: 0 };
      const r = await sendLessonResult({ lessonId: lessonIdF,
        roundKey: roundKeyOf(who, p.graded.kind, p.roundId), learner: p.learner.learner, ...(p.learner.learnerFirst ? { learnerFirst: p.learner.learnerFirst } : {}),
        ...(p.learner.learnerId ? { learnerId: p.learner.learnerId } : {}), guest: p.learner.guest, graded: p.graded }, true, report);
      // Review #586: a kézbesítés nyoma csak sikeres küldés után — a kézbesítetlen sort a söprő (U4c) pótolja.
      if (report.failed === 0 && (r.sent > 0 || r.duplicate)) await markPartDelivered(lessonIdF, who, p.roundId, p.graded.kind);
    })))
      .catch(error => logger.error("[LESSON-RESULT] félretett részek kiürítése hiba:", error));
  }
  // Nem várjuk meg: a tanuló felülete nem függ a levéltől.
  void (paired && !userId ? Promise.resolve(paired.name) : learnerName(userId)).then(learner => {
    const deliver = (g: GradedTasks | GradedQuiz) => sendLessonResult({ lessonId: lessonIdF, roundKey, learner,
      ...(paired ? { learnerId: paired.id, ...(!userId ? { learnerFirst: paired.firstName } : {}) } : {}), guest: !userId && !paired, graded: g });
    if (!finalizing) return deliver(graded);
    return withRoundLock(lockKey, async () => {
      // PR #577 review (R1 a / E10): ismeretlen állapotban NEM küldünk felülíró mondat nélkül — korlátos újrapróba a kizárás alatt;
      // ha az állapot végig bizonyíthatatlan, a végleges levél nem megy ki (naplózott hiba), mint a B4a 503-as elve.
      let superseded: boolean | null = null;
      for (let attempt = 0; attempt < SUPERSEDE_CHECK_ATTEMPTS && superseded === null; attempt++) {
        try { superseded = await partialAlreadySent(lessonIdF, body.roundId); }
        catch (error) {
          logger.warn(`[LESSON-RESULT] a felülírás-ellenőrzés átmenetileg hibázott (${attempt + 1}. próba): ${errorClass(error)}`);
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        }
      }
      // Helyi ellenőr 35501fd3: a végleges levél nem veszhet el (a 202 már kiment) — bizonyíthatatlan állapotban a FELTÉTELES felülíró
      // mondattal megy ki („ha … érkezett, ez lép a helyébe”), így sem a levél nem vész el, sem félrevezető állítás nem kerül bele.
      if (superseded === null) logger.error("[LESSON-RESULT] a felülírási állapot bizonyíthatatlan — a végleges levél feltételes mondattal megy ki.");
      forgetPartial(lockKey);
      const supersedes: boolean | "unknown" = superseded === null ? "unknown" : superseded;
      return deliver(supersedes ? { ...graded, meta: { ...graded.meta, supersedesPartial: supersedes } } : graded);
    });
  }).catch(error => logger.error("[LESSON-RESULT] háttérküldés hiba:", error));
  return res.status(202).json({ queued: true });
  } catch (error) { next(error); }
});

/**
 * A bejelentkezett tanuló szerveres kvízének első lezárása (finishPractice) — a szerver maga küld, kliens-beküldés nélkül.
 * A kör saját kérdés-pillanatképéből pontoz (nem a lecke esetleg azóta változott bankjából).
 */
export async function sendPracticeResult(input: { userId: string; attemptId: string; lessonId: string; questions: AttemptQuestion[]; answers: Record<string, AttemptAnswer> }): Promise<{ awaiting: "tasks" | "quiz" | null }> {
  const quiz = input.questions.map(q => ({ id: q.id, question: q.prompt, options: q.options, correctIndex: q.correctIndex }));
  // Review #280: a kör minden kérdése számít; a megválaszolatlan -1 (nulla pont, a hibásak között).
  const picks = Object.fromEntries(input.questions.map(q => [q.id, input.answers[q.id]?.pickedIndex ?? -1]));
  const graded = gradeQuiz(quiz, picks);
  const learner = await learnerName(input.userId);
  if (resultCombinedEmailEnabled()) {
    // U4b (E9): a fiókos gyakorlókör ugyanazon a párosítón megy át, a POST-tal azonos tulajdonoskulccsal (a fiók azonosítója).
    const [row] = await db.select({ json: lessons.json }).from(lessons).where(eq(lessons.id, input.lessonId));
    const lesson = row ? lessonSchema.safeParse(row.json) : null;
    if (lesson?.success && isTwoPartExperience(lesson.data.experience)) {
      // Review #586: az átmeneti DB-hiba nem veszítheti el a kész gyakorlókört — korlátos újrapróba (a hívó csak naplóz).
      const outcome = await pairWithRetry({ lessonId: input.lessonId, ownerKey: input.userId, kind: "quiz", roundId: input.attemptId, graded, learner: { learner, guest: false } });
      if (outcome.type === "parked") return { awaiting: outcome.awaiting };
      if (outcome.type === "paired") await deliverCombined(input.lessonId, outcome, true);
      if (outcome.type === "alreadySent" && outcome.redeliver) await deliverCombined(input.lessonId, outcome.redeliver, false);
      return { awaiting: null };
    }
  }
  await sendLessonResult({ lessonId: input.lessonId, roundKey: roundKeyOf("practice", input.attemptId), learner, graded });
  return { awaiting: null };
}

const PRACTICE_PAIR_ATTEMPTS = 3;

/** Korlátos újrapróba átmeneti DB-hibára (a gyakorlókör útja); az utolsó próba hibáját továbbdobja — sosem ad vissza üres eredményt. */
async function pairWithRetry(input: Parameters<typeof pairOrPark>[0]): Promise<Awaited<ReturnType<typeof pairOrPark>>> {
  for (let attempt = 1; ; attempt++) {
    try { return await pairOrPark(input); }
    catch (error) {
      logger.warn(`[LESSON-RESULT] gyakorlókör-párosítás átmeneti hiba (${attempt}. próba): ${errorClass(error)}`);
      if (attempt >= PRACTICE_PAIR_ATTEMPTS) throw error;
      await new Promise(resolve => setTimeout(resolve, retryDelayMs));
    }
  }
}

/**
 * U4b: a párosított két rész EGY levélben — a pár kulcsával (a tulajdonost is tartalmazza; idempotencia: ugyanaz a pár ugyanazt a
 * kulcsot adja, a kézbesítési napló és a szolgáltatói kulcs nem duplikál). A `delivered_at` csak a teljes kézbesítés után íródik
 * (review #586); kézbesítetlen pár a kör ismételt beküldésére és a söprővel (U4c) pótolható.
 */
export async function deliverCombined(lessonId: string, pair: PairedParts, firstTime: boolean) {
  // A levél neve: a kilétet hordozó rész (a fiókos / párosított adat elsőbbséget kap a vendéggel szemben).
  const who = pair.tasksLearner.learnerId || !pair.tasksLearner.guest ? pair.tasksLearner : pair.quizLearner;
  const report = { failed: 0 };
  const result = await sendLessonResult({ lessonId, roundKey: pair.pairKey, learner: who.learner,
    ...(who.learnerFirst ? { learnerFirst: who.learnerFirst } : {}), ...(pair.tasksLearner.learnerId ? { learnerId: pair.tasksLearner.learnerId } : {}),
    guest: who.guest, graded: pair.tasks, combined: { tasks: pair.tasks, quiz: pair.quiz } }, true, report);
  if (report.failed === 0 && (result.sent > 0 || result.duplicate)) await markPairDelivered(pair.pairKey);
  // Review #586: a kvízrész is a tanulói naplóba (a jelzősor a feladatrészé, az a sendLessonResult-ban naplózódik) — egyszer, a párosításkor.
  if (firstTime && pair.quizLearner.learnerId) await recordQuizActivity(lessonId, pair.quizLearner.learnerId, pair.quiz.summary.percent);
}

/**
 * U4c: egy tárolt `timeout` sor (kézbesítése). Ha a sor kulcsa a régi út körkulcsa (KI állású kiürítés, `takeParkedForLegacy`), a régi
 * egyrészes levél megy; különben (söprő: 7 nap pár nélkül) a jelölt részleges összevont levél. A kézbesítés nyoma csak siker után.
 */
export async function deliverStoredPart(lessonId: string, row: { id: string; owner_key: string; kind: "tasks" | "quiz"; round_id: string;
  graded: GradedTasks | GradedQuiz | null; learner: PendingLearner | null; pair_key: string | null }): Promise<boolean> {
  if (!row.graded || !row.learner || !row.pair_key) return false;
  const legacy = row.pair_key === roundKeyOf(row.owner_key, row.kind, row.round_id);
  const report = { failed: 0 };
  const r = await sendLessonResult({ lessonId, roundKey: row.pair_key, learner: row.learner.learner, ...(row.learner.learnerFirst ? { learnerFirst: row.learner.learnerFirst } : {}),
    ...(row.learner.learnerId ? { learnerId: row.learner.learnerId } : {}), guest: row.learner.guest, graded: row.graded,
    ...(legacy ? {} : { combined: row.graded.kind === "tasks" ? { tasks: row.graded as GradedTasks, quiz: null } : { tasks: null, quiz: row.graded as GradedQuiz } }) }, false, report);
  if (report.failed !== 0 || !(r.sent > 0 || r.duplicate)) return false;
  await db.execute(sql`UPDATE lesson_result_pending SET delivered_at = now() WHERE id = ${row.id} AND delivered_at IS NULL`);
  return true;
}

async function recordQuizActivity(lessonId: string, learnerId: string, percent: number) {
  const [row] = await db.select({ json: lessons.json, htmlFileId: lessons.htmlFileId }).from(lessons).where(eq(lessons.id, lessonId));
  const lesson = row ? lessonSchema.safeParse(row.json) : null;
  if (!row || !lesson?.success) return;
  await recordLearnerActivity({ learnerId, materialId: row.htmlFileId, kind: "result", percent, summary: `${lesson.data.title} — Kvíz` });
}
