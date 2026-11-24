import { createHash } from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { clientIpKey } from "./lib/client-ip";
import { partialLimiter, resultLimiter } from "./lesson-result-limits";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { arbiterVerdicts, lessonResultEmails, lessons, users } from "../shared/schema";
import { lessonSchema } from "../shared/lesson-schema";
import { buildResultEmail, GUEST_LEARNER, gradeQuiz, gradeTasks, resultRequestSchema, type GradedQuiz, type GradedTasks } from "../shared/lesson-result-email";
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
export async function sendLessonResult(input: { lessonId: string; roundKey: string; learner: string; learnerFirst?: string; learnerId?: string; guest?: boolean; graded: GradedTasks | GradedQuiz }, retry = true): Promise<{ sent: number; duplicate: boolean }> {
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
    const mail = buildResultEmail({ lessonTitle: lesson.data.title, classroom: lesson.data.classroom, learner: input.learner, learnerFirst: input.learnerFirst, guest: input.guest,
      // Codex-review #532: a „Beküldve” ideje a kör ELSŐ beküldéséé (a tárolt sor ideje) — az újrapróba levele így bájtra azonos, és az
      // idempotencia-kulccsal küldött ismétlést a levélszolgáltató nem utasítja el eltérő tartalom miatt.
      url: row.htmlFileId ? getMaterialPreviewUrl(row.htmlFileId) : "", graded: input.graded, sentAt: claim.createdAt });
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
    return { sent: ok.length, duplicate: false };
  } catch (error) {
    // Review K3: csak a hiba osztálya / kódja — a lekérdezés hibaüzenete a paramétereket (e-mail-címet) is tartalmazná.
    logger.error(`[LESSON-RESULT] a küldés nem sikerült: ${errorClass(error)}${retry ? " — újrapróbálja" : ""}`);
    // Review (2026-11-17): a váratlan kivétel (az `allSettled`-en kívül: adatbázis, foglalás) után is egy újrapróba — levél ne vesszen el.
    if (retry) setTimeout(() => { void sendLessonResult(input, false); }, retryDelayMs).unref?.();
    return { sent: 0, duplicate: false };
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
    if (!Object.keys(body.picks).length) return res.status(202).json({ queued: false });
    graded = gradeQuiz(experience.quiz, body.picks);
  }
  // Bontás B1a: a kör kezdete a levél dátumsorához (a hihetőséget a levélépítő ellenőrzi; régi kliensnél hiányzik).
  if (body.startedAt !== undefined) graded = { ...graded, meta: { startedAt: body.startedAt } };
  // Tanulói profil (S2): a párosított eszköz tanulója (ellenőrzött token). Átfogó review: bejelentkezve is a tanuló naplójába kerül
  // (mint a régi anyagnál); a levél neve bejelentkezve a fiók neve marad.
  const once = resultPartialEmailEnabled();
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
  if (once) {
    // B4a (#510 R27, R42, R49 c): körönként egy végleges levél, kiléttől függetlenül. Létező jelzőnél csak a saját kézbesítési sor vagy a
    // saját (R42) tulajdonos-sor birtokosa folytathatja; más kilét duplikátum. A jelzősor írásának és a tulajdonos-lekérdezésnek az
    // átmeneti hibája 503 a 202 előtt (bizonyíthatatlan állapotban nem megy végleges levél).
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
      if (!own.length) return res.status(202).json({ queued: false, duplicate: true });
    }
    finalClaimFault?.();
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
  // Nem várjuk meg: a tanuló felülete nem függ a levéltől.
  void (paired && !userId ? Promise.resolve(paired.name) : learnerName(userId)).then(learner => sendLessonResult({ lessonId: req.params.lessonId, roundKey, learner,
    ...(paired ? { learnerId: paired.id, ...(!userId ? { learnerFirst: paired.firstName } : {}) } : {}), guest: !userId && !paired, graded }))
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
