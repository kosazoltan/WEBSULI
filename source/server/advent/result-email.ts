/**
 * Adventi naptár — szülői (admin) levél a végén (docs/specs/2026-11-18-adventi-naptar.md 12.1 (e) E1, 18.1 — felülírja a 16.3-at;
 * A25, A50; végrehajtás „S5”, „Kiegészítés 5”, „Kiegészítés 6”).
 *
 * Egy tanulóról évadonként, címzettenként pontosan EGY levél megy az `ADMIN_EMAILS` listára, a VÉGLEGES eredménykor — a három feltétel
 * közül annál, amelyik előbb teljesül: (1) megfelelt (bármelyik körben); (2) az utolsó megengedett körben mind a 24 ablak megválaszolt, és
 * nincs javítható ablak; (3) az évad lezárult (január 7-től; a takarító egyszer végigmegy a levél nélküli, megkezdett tanulói sorokon).
 * Névtelen (eszköz-), játékos- és előnézeti sorról SOHA. A foglalás a küldés ELŐTT a sor `mailed_to` listájában: `final:<HMAC(cím)>`.
 *
 * Valódi levél csak a bekapcsolt naptár útjain indulhat (a nyilvános router és a takarító évadzáró lépése a kapcsoló mögött); teszt- és
 * e2e-módban CSAK a teszt által beállított hamis küldőn át (`setAdventSender`). A levélben token, eszközazonosító, link-paraméter nincs;
 * a naplóba cím és név nem kerül.
 */
import { createHash, createHmac } from "node:crypto";
import type { AdventPhase } from "../../shared/advent/calendar";
import { ADVENT_DOORS, adventSummary, limitsForGrade, type AdventSummary } from "../../shared/advent/rules";
import { learnerLinkSecret } from "../lib/learner-token";
import { isE2eMode } from "../lib/e2e-mode";
import { logger } from "../lib/logger";
import { resolveAdminRecipients } from "../lib/material-result";
import type { AdventRow, AdventStore } from "./store";

export type AdventSender = (subject: string, html: string, to: string, idempotencyKey: string) => Promise<unknown>;
let sender: AdventSender | null = null;
/** Teszthez: a valódi Resend-küldő helyett (a `setResultSender` mintája). */
export function setAdventSender(next: AdventSender | null): void { sender = next; }

let retryDelayMs = 60_000;
/** Teszthez: az újrapróba késleltetése; a korábbi értéket adja vissza. */
export function setAdventRetryDelay(ms: number): number { const previous = retryDelayMs; retryDelayMs = ms; return previous; }

async function send(subject: string, html: string, to: string, idempotencyKey: string): Promise<unknown> {
  if (sender) return sender(subject, html, to, idempotencyKey);
  // Biztonság: teszt- és e2e-futásban valódi levél sosem megy, csak a teszt által beállított küldőn át.
  if (process.env.NODE_ENV === "test" || isE2eMode()) throw new Error("Teszt- / e2e-környezetben nincs valódi e-mail-küldés.");
  const { sendAdminNotification } = await import("../resend");
  // A tárgy a tanuló keresztnevét tartalmazza — csendes küldés (a név és a cím nem kerül a naplóba).
  return sendAdminNotification(subject, html, to, { quiet: true, idempotencyKey });
}

const errorClass = (error: unknown): string => {
  const name = (error as { name?: unknown } | null)?.name;
  return typeof name === "string" && /^[A-Za-z0-9_]{1,60}$/.test(name) ? name : "Error";
};

export type AdventFinalReason = "passed" | "last-round" | "season-closed";

const anyAttempt = (row: AdventRow): boolean => Object.values(row.doors).some((round) => Object.values(round).some((door) => door.attempts.length > 0));

/** A végleges eredmény oka (terv 18.1), vagy `null`, ha még nem végleges / nem tanulói sor / nincs válasz. Tiszta függvény. */
export function adventResultFinal(row: AdventRow, phase: AdventPhase): AdventFinalReason | null {
  if (row.subjectKind !== "learner" || !anyAttempt(row)) return null;
  const { maxRepairs, maxRounds } = limitsForGrade(row.grade ?? 5);
  const current = adventSummary(row.doors[row.round] ?? {}, maxRepairs);
  if (row.passedAt || current.passed) return "passed";
  if (row.round >= maxRounds && current.answered === ADVENT_DOORS && current.repairable === 0) return "last-round";
  if (phase === "closed") return "season-closed";
  return null;
}

/** Az összes kör összefoglalója: a legjobb kör (több megoldott, egyenlőnél több elsőre jó), a körök száma, megfelelt-e. */
export function adventResultSummary(row: AdventRow): { bestRound: number; best: AdventSummary; rounds: number; passed: boolean } {
  const { maxRepairs } = limitsForGrade(row.grade ?? 5);
  let bestRound = row.round;
  let best = adventSummary(row.doors[row.round] ?? {}, maxRepairs);
  const rounds = Object.keys(row.doors).map(Number).filter((r) => Number.isInteger(r) && r > 0).sort((a, b) => a - b);
  for (const round of rounds) {
    const s = adventSummary(row.doors[round] ?? {}, maxRepairs);
    if (s.solved > best.solved || (s.solved === best.solved && s.firstTry > best.firstTry)) { best = s; bestRound = round; }
  }
  const passed = row.passedAt !== null || rounds.some((r) => adventSummary(row.doors[r] ?? {}, maxRepairs).passed);
  return { bestRound, best, rounds: Math.max(row.round, rounds.length ? rounds[rounds.length - 1]! : 1), passed };
}

const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** A levél tárgya és törzse (tiszta függvény). A név HTML-escape-elve; token, eszközazonosító, link nincs benne. */
export function buildAdventResultEmail(input: { firstName: string | null; grade: number | null; season: number; reason: AdventFinalReason; row: AdventRow }): { subject: string; html: string } {
  const name = input.firstName?.trim() || "A tanuló";
  const { bestRound, best, rounds, passed } = adventResultSummary(input.row);
  const subject = input.reason === "season-closed"
    ? `Adventi naptár: ${name} — az évad lezárult, ${best.solved} / ${ADVENT_DOORS}`
    : `Adventi naptár: ${name} végigért — ${best.solved} / ${ADVENT_DOORS}`;
  const why = input.reason === "passed" ? "Teljesítette a naptárat (legalább 23 megoldott ablak)."
    : input.reason === "last-round" ? "Végigjátszotta az utolsó kört is; több lehetősége az idén nincs."
    : "Az idei naptár január 7-én lezárult; ez a lezáráskori állás.";
  const rows: [string, string][] = [
    ["Tanuló", name],
    ["Évfolyam", input.grade ? `${input.grade}.` : "—"],
    ["Legjobb kör", `${bestRound}. kör (összesen ${rounds} kör)`],
    ["Megoldott ablakok", `${best.solved} / ${ADVENT_DOORS} (${best.percent}%)`],
    ["Elsőre jó", `${best.firstTry} / ${ADVENT_DOORS}`],
    ["Megfelelt", passed ? "igen" : "nem"],
  ];
  const table = rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555">${escapeHtml(k)}</td><td style="padding:4px 0"><strong>${escapeHtml(v)}</strong></td></tr>`).join("");
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#222">`
    + `<h2 style="margin:0 0 8px">Adventi naptár ${escapeHtml(String(input.season))} — ${escapeHtml(name)}</h2>`
    + `<p style="margin:0 0 12px">${escapeHtml(why)}</p><table style="border-collapse:collapse">${table}</table>`
    + `<p style="margin:16px 0 0;color:#777;font-size:13px">Ez az évad egyetlen levele erről a tanulóról. (A naptár „baráti” védelmű: azt igazolja, hogy a naptárat végigjátszották, azt nem, hogy segítség nélkül.)</p></div>`;
  return { subject, html };
}

/** A foglalás kulcsa a `mailed_to`-ban: `final:<HMAC-SHA-256(titok, cím)>` (a cím maga nem tárolódik). */
export function adventMailKey(secret: string, to: string): string {
  return `final:${createHmac("sha256", secret).update(to.trim().toLowerCase()).digest("hex").slice(0, 32)}`;
}
/** A szolgáltatónak adott idempotencia-kulcs: soronként és címzettenként mindig ugyanaz (cím nélkül). */
export function adventIdempotencyKey(rowId: string, to: string): string {
  return `advent-result/${createHash("sha256").update([rowId, "final", to.trim().toLowerCase()].join("|")).digest("hex")}`;
}

/**
 * A levél elküldése, ha az eredmény végleges (18.1). Címzettenként: foglalás (`claimMail`) → küldés; hibánál a foglalás felszabadul, és
 * egy késleltetett újrapróba pótolja (egyszer). A már foglalt / kézbesített címzett nem kap másodikat. Sosem dob.
 */
export async function sendAdventResult(input: { store: Pick<AdventStore, "claimMail" | "releaseMail">; row: AdventRow; phase: AdventPhase; firstName: string | null }, retry = true): Promise<{ sent: number; failed: number; skipped?: "no-recipients" | "no-secret" }> {
  try {
    const reason = adventResultFinal(input.row, input.phase);
    if (!reason) return { sent: 0, failed: 0 };
    const recipients = resolveAdminRecipients({ ADMIN_EMAILS: process.env.ADMIN_EMAILS, ADMIN_EMAIL: process.env.ADMIN_EMAIL });
    // A modul naplója csak a hiba osztályát írja (A22 forrás-őr): a kihagyás okát a visszatérési érték mondja meg.
    if (!recipients.length) return { sent: 0, failed: 0, skipped: "no-recipients" };
    const secret = learnerLinkSecret();
    if (!secret) return { sent: 0, failed: 0, skipped: "no-secret" };
    const { subject, html } = buildAdventResultEmail({ firstName: input.firstName, grade: input.row.grade, season: input.row.season, reason, row: input.row });
    let sent = 0;
    let failed = 0;
    for (const to of recipients) {
      const key = adventMailKey(secret, to);
      if (input.row.mailedTo.includes(key)) continue;
      if (!(await input.store.claimMail(input.row.id, key))) continue;
      try {
        await send(subject, html, to, adventIdempotencyKey(input.row.id, to));
        sent++;
      } catch (error) {
        failed++;
        logger.error(`[ADVENT] szülői levél küldési hiba: ${errorClass(error)}`);
        await input.store.releaseMail(input.row.id, key).catch((error: unknown) => logger.error(`[ADVENT] a levél-foglalás felszabadítása nem sikerült: ${errorClass(error)}`));
      }
    }
    if (failed > 0 && retry) {
      const timer = setTimeout(() => { void sendAdventResult({ ...input, row: { ...input.row, mailedTo: [] } }, false); }, retryDelayMs);
      timer.unref?.();
    }
    return { sent, failed };
  } catch (error) {
    logger.error(`[ADVENT] szülői levél hiba: ${errorClass(error)}`);
    return { sent: 0, failed: 0 };
  }
}

/**
 * Évadzárás (18.1 3. pont; a takarító hívja, csak bekapcsolt naptárnál): lezárt fázisban a megkezdett, MÉG LEVÉL NÉLKÜLI (egyetlen
 * `final:` foglalása sincs) tanulói sorokra egyszer elmegy a levél. A már levelet kapott sor kimarad — egy később felvett új címzett sem
 * kap utólag levelet a régi évadról. A küldött levelek száma.
 */
export async function closeAdventSeason(store: Pick<AdventStore, "claimMail" | "releaseMail" | "unmailedLearnerRows">, at: { season: number; phase: AdventPhase }): Promise<number> {
  if (at.phase !== "closed") return 0;
  let sent = 0;
  for (const { row, firstName } of await store.unmailedLearnerRows(at.season)) {
    sent += (await sendAdventResult({ store, row, phase: "closed", firstName })).sent;
  }
  return sent;
}
