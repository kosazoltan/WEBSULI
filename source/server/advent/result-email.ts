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
 *
 * Kézbesítési jelölők a `mailed_to` listában (`sent:` és `check:` a >24h bizonytalan kézbesítés ellen):
 *  - `want:<h>` — terv (kinek kell levelet kapnia),
 *  - `pending:<h>@<ms>` — lejáró bérlet a küldés idejére,
 *  - `sent:<h>@<ms>` — a szolgáltató elfogadta, de a `finishMail` nem sikerült (≤24h a Resend idempotencia-ablakban),
 *  - `final:<h>` — kézbesítve (a szolgáltató elfogadta ÉS rögzítve),
 *  - `check:<h>` — a szolgáltató elfogadta >24h-ja, de a `finishMail` nem sikerült; ellenőrizendő, NEM automatikusan újraküldendő.
 */
import { createHash, createHmac } from "node:crypto";
import type { AdventPhase } from "../../shared/advent/calendar";
import { ADVENT_DOORS, adventSummary, doorState, limitsForGrade, type AdventSummary } from "../../shared/advent/rules";
import { learnerLinkSecret } from "../lib/learner-token";
import { isE2eMode } from "../lib/e2e-mode";
import { logger } from "../lib/logger";
import { resolveAdminRecipients } from "../lib/material-result";
import { ADVENT_MAIL_LEASE_MS, type AdventRow, type AdventStore } from "./store";

/**
 * A levélmód (tulajdonosi P-056, 2026-11-23: „Levélküldés csak száraz összesítő után, külön jóváhagyással”). Alapból SZÁRAZ FUTÁS:
 * a végleges eredmény nem foglal (`mailed_to` érintetlen) és nem küld — így a jóváhagyás után a takarító pótlása (`deliverAdventMail`)
 * a már végleges eredményekről is kiküldi az egyetlen levelet. Valódi küldés KIZÁRÓLAG a pontos `ADVENT_RESULT_EMAIL_MODE=send`
 * értékkel (kis- / nagybetű és szóköz mindegy); minden más (hiányzó, elírt, „on”, „1”) száraz futás. A száraz összesítő:
 * `adventMailReport` (admin-végpont: `/api/admin/advent/mail-report`).
 */
export type AdventMailMode = "dry-run" | "send";
export function adventMailMode(env: Record<string, string | undefined> = process.env): AdventMailMode {
  return env.ADVENT_RESULT_EMAIL_MODE?.trim().toLowerCase() === "send" ? "send" : "dry-run";
}

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

/** A tárgyak magyar neve a levélben (a kliens SUBJECT_LABEL-jével egyező). */
const SUBJECT_LABEL: Record<string, string> = {
  christmas: "Karácsony", math: "Matematika", english: "Angol", hungarian: "Magyar nyelv", science: "Természetismeret", history: "Történelem",
};

/** A legjobb kör tantárgyankénti bontása (S5/S6 1. vak L7; terv 4.1 (e), 12.3): tárgy → megoldott / megválaszolt ablak. */
export function adventSubjectBreakdown(row: AdventRow, round: number): { subject: string; label: string; solved: number; total: number }[] {
  const { maxRepairs } = limitsForGrade(row.grade ?? 5);
  const subjects = (row.plan[round]?.subjects ?? {}) as Record<number, string>;
  const out = new Map<string, { solved: number; total: number }>();
  for (const [dayKey, record] of Object.entries(row.doors[round] ?? {})) {
    const attempts = record?.attempts ?? [];
    if (attempts.length === 0) continue;
    const subject = subjects[Number(dayKey)] ?? "egyeb";
    const entry = out.get(subject) ?? { solved: 0, total: 0 };
    entry.total++;
    if (doorState({ unlocked: true, attempts, maxRepairs }) === "solved") entry.solved++;
    out.set(subject, entry);
  }
  // Karácsony elöl, utána a többi a magyar név szerint.
  return [...out.entries()]
    .map(([subject, v]) => ({ subject, label: SUBJECT_LABEL[subject] ?? "Egyéb", ...v }))
    .sort((a, b) => (a.subject === "christmas" ? -1 : b.subject === "christmas" ? 1 : a.label.localeCompare(b.label, "hu")));
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
  for (const part of adventSubjectBreakdown(input.row, bestRound)) rows.push([`${part.label}`, `${part.solved} / ${part.total} megoldva`]);
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
/**
 * A szolgáltatónak adott idempotencia-kulcs: soronként, címzettenként STABIL (Thread 2/6 javítás).
 *
 * A kulcs NEM tartalmazza a levél tartalmát (tárgyát), mert:
 * - Az „évadonként, címzettenként pontosan EGY levél" szerződés a `mailed_to` lista `final:<hash>` bejegyzésével érvényesül (DB-szintű dedup).
 * - A Resend idempotencia-kulcs csak 24 órás biztonsági háló a `send` ↔ `finishMail` közötti szűk ablakra.
 * - Ha a kulcs tartalomfüggő lenne, a tartalom változása (23→24 megoldott) új kulcsot adna, és a Resend is elfogadná a második levelet.
 *
 * A >24h lejárat kezelése: ha a szolgáltató elfogadta a levelet, de a `finishMail` nem mentette a `final:` jelölést, és a pótlás
 * >24 óra múlva fut, a Resend kulcs már lejárt. Ezt a `sent:<hash>@<ms>` jelölő kezeli: a `recoverSent` ≤24h-nál `final:`-ra,
 * >24h-nál `check:`-ra alakítja (ellenőrizendő, nem automatikusan újraküldendő). A `check:` jelölő megakadályozza a bérletszerzést.
 */
export function adventIdempotencyKey(rowId: string, to: string): string {
  return `advent-result/${createHash("sha256").update([rowId, "final", to.trim().toLowerCase()].join("|")).digest("hex")}`;
}

/** A bérlet hossza: ennyi ideig egy címzett küldése egy feldolgozóé; leállás után ennyi idő múlva folytatható. */
export { ADVENT_MAIL_LEASE_MS };
/** A `server/resend.ts` hibaneve, ha az idempotencia-kulccsal 24 órán belül már ment levél (Resend `invalid_idempotent_request`). */
export const ADVENT_IDEMPOTENCY_CONFLICT = "ResendIdempotencyConflict";

type MailStore = Pick<AdventStore, "planMail" | "leaseMail" | "finishMail" | "releaseLease" | "markSent">;

/**
 * A levél elküldése, ha az eredmény végleges (18.1). Tartós kézbesítés (S5/S6 1. vak L1): az első döntéskor rögzül a kézbesítési
 * terv (`want:` — a címzettek lenyomata), utána címzettenként bérlet → küldés (stabil idempotencia-kulccsal) → `final:` rögzítése.
 * Küldési hibánál a bérlet felszabadul (egy késleltetett újrapróba + a takarító pótlása); ha a szolgáltató elfogadta, de a rögzítés
 * elmaradt (leállás), a bérlet lejárta után a pótlás ugyanazzal a kulccsal küld (a szolgáltató deduplikálja) — de csak az első
 * kísérlettől számított `ADVENT_RESEND_WINDOW_MS`-en belül; utána a címzett `check:` (ellenőrizendő), automatikus levél nem megy. Sosem dob.
 */
export async function sendAdventResult(input: { store: MailStore; row: AdventRow; phase: AdventPhase; firstName: string | null; nowMs?: number }, retry = true): Promise<{ sent: number; failed: number; skipped?: "dry-run" | "no-recipients" | "no-secret" }> {
  try {
    const reason = adventResultFinal(input.row, input.phase);
    if (!reason) return { sent: 0, failed: 0 };
    // P-056: száraz futásban se foglalás, se küldés — a tétel a száraz összesítőben látszik, a jóváhagyás után a pótlás küldi.
    if (adventMailMode() !== "send") return { sent: 0, failed: 0, skipped: "dry-run" };
    const recipients = resolveAdminRecipients({ ADMIN_EMAILS: process.env.ADMIN_EMAILS, ADMIN_EMAIL: process.env.ADMIN_EMAIL });
    // A modul naplója csak a hiba osztályát írja (A22 forrás-őr): a kihagyás okát a visszatérési érték mondja meg.
    if (!recipients.length) return { sent: 0, failed: 0, skipped: "no-recipients" };
    const secret = learnerLinkSecret();
    if (!secret) return { sent: 0, failed: 0, skipped: "no-secret" };
    const hashOf = (to: string) => adventMailKey(secret, to).slice("final:".length);
    const planned = new Set(await input.store.planMail(input.row.id, recipients.map((to) => `want:${hashOf(to)}`)));
    const { subject, html } = buildAdventResultEmail({ firstName: input.firstName, grade: input.row.grade, season: input.row.season, reason, row: input.row });
    let sent = 0;
    let failed = 0;
    // Futó óra (Thread 8): a megadott `nowMs`-től (pótlás, tesztek) a valós eltelt idővel halad, így hosszú körben sem avul el a
    // bérlet ideje, és a befecskendezett időpont (pl. lejárt bérlet, letelt idempotencia-ablak) is érvényesül.
    const startedAt = Date.now();
    const clock = () => (input.nowMs ?? startedAt) + (Date.now() - startedAt);
    for (const to of recipients) {
      const hash = hashOf(to);
      if (!planned.has(`want:${hash}`)) continue;
      // A bérlet a futó órához kötött (Thread 8): hosszú kézbesítési körben a késői bérletek sem születnek lejárt időponttal.
      if (!(await input.store.leaseMail(input.row.id, hash, clock(), ADVENT_MAIL_LEASE_MS))) continue;
      try {
        await send(subject, html, to, adventIdempotencyKey(input.row.id, to));
      } catch (error) {
        // A szolgáltató 409-cel jelzi, hogy ezzel a kulccsal (más tartalommal — pl. a pótlásig változott az eredmény) 24 órán belül
        // már küldött levelet: ez kézbesítés, nem hiba — ugyanúgy rögzítjük, második levél nem megy (#562 A2, Vercel-szál).
        if (errorClass(error) !== ADVENT_IDEMPOTENCY_CONFLICT) {
          failed++;
          logger.error(`[ADVENT] szülői levél küldési hiba: ${errorClass(error)}`);
          await input.store.releaseLease(input.row.id, hash).catch((error: unknown) => logger.error(`[ADVENT] a levél-bérlet felszabadítása nem sikerült: ${errorClass(error)}`));
          continue;
        }
        logger.warn(`[ADVENT] a szolgáltató ezzel a kulccsal már küldött levelet, kézbesítettként rögzítve: ${errorClass(error)}`);
      }
      // A szolgáltató elfogadta: azonnal jelöljük `sent:`-tel, mielőtt a `finishMail` meghiúsulhatna (Thread 7 javítás).
      // Ha a `markSent` is hibázik (pl. teljes DB-kiesés), a levél elment de nincs DB-bejegyzés — a `failed` számláló nő,
      // és az újrapróba a stabil idempotencia-kulccsal deduplikál a Resend-nél (Thread 2 javítás: a vak küldés `failed`).
      try {
        await input.store.markSent(input.row.id, hash, clock());
      } catch (error) {
        // A levél elment, de nincs sem `sent:`, sem `final:` jelölő: a `finishMail` is hiába próbálkozna (ugyanaz a DB).
        // A pótlás az első kísérlettől (`try:`) számított ablakon belül ugyanazzal a kulccsal próbál (a szolgáltató deduplikál);
        // az ablak letelte után a `leaseMail` nem ad bérletet, a pótlás `check:`-re jelöli (ellenőrizendő, nincs második levél).
        // A `failed` számlálóba kerül: a hívó naplózza, az adminnak a report mutatja (Thread 2 javítás).
        logger.error(`[ADVENT] sent jelölő mentése nem sikerült — a levél elment, de nincs DB-bejegyzés: ${errorClass(error)}`);
        // A bérletet felszabadítjuk, hogy a következő pótlás újra próbálhassa (a Resend 24h-n belül deduplikál).
        await input.store.releaseLease(input.row.id, hash).catch((error: unknown) => logger.error(`[ADVENT] bérlet felszabadítása nem sikerült: ${errorClass(error)}`));
        failed++;
        continue;
      }
      try {
        await input.store.finishMail(input.row.id, hash);
        sent++;
      } catch (error) {
        // A szolgáltató elfogadta, a `final:` rögzítése elmaradt, de a `sent:` jelölő megvédi az újraküldéstől.
        // A következő pótláskor a `recoverSentMail` megpróbálja a `finishMail`-t újra.
        logger.error(`[ADVENT] a kézbesítés rögzítése nem sikerült (sent: jelölő megőrzi): ${errorClass(error)}`);
      }
    }
    if (failed > 0 && retry) {
      const timer = setTimeout(() => { void sendAdventResult({ ...input, nowMs: undefined }, false); }, retryDelayMs);
      timer.unref?.();
    }
    return { sent, failed };
  } catch (error) {
    logger.error(`[ADVENT] szülői levél hiba: ${errorClass(error)}`);
    return { sent: 0, failed: 0 };
  }
}

type DeliverStore = MailStore & Pick<AdventStore, "mailCandidates" | "recoverSent">;

/**
 * Tartós pótlás (a takarító hívja indításkor és rendszeresen, csak bekapcsolt naptárnál): minden kézbesítetlen tervezett címzett, és a
 * terv nélküli végleges eredmények (pl. leállás a válasz és a levél között); lezárt évadban a megkezdett, levél nélküli tanulói sorok is
 * (18.1 3. pont). A küldött levelek száma. ELŐTTE a `sent:` jelölők helyreállítása (`recoverSent`).
 */
export async function deliverAdventMail(store: DeliverStore, at: { season: number; phase: AdventPhase }, nowMs: number = Date.now()): Promise<number> {
  // Thread 7 javítás: a `sent:` jelölők → `final:` (a szolgáltató már elfogadta, csak a DB-rögzítés maradt el).
  await recoverSentMail(store, nowMs);
  let sent = 0;
  for (const { row, firstName } of await store.mailCandidates(at.season, at.phase === "closed")) {
    sent += (await sendAdventResult({ store, row, phase: at.phase, firstName, nowMs }, false)).sent;
  }
  return sent;
}

/**
 * A `sent:` jelölők helyreállítása: a szolgáltató elfogadta a levelet, de a `finishMail` nem sikerült.
 * A `sent:` → `final:` átalakítás (Thread 7 javítás): a levelet NEM küldi újra.
 */
async function recoverSentMail(store: Pick<AdventStore, "recoverSent">, nowMs: number): Promise<number> {
  try {
    return await store.recoverSent(nowMs);
  } catch (error) {
    logger.error(`[ADVENT] sent → final helyreállítás hiba: ${errorClass(error)}`);
    return 0;
  }
}

/** Évadzárás (18.1 3. pont): csak lezárt fázisban — a pótlás lezárt évadra. */
export async function closeAdventSeason(store: DeliverStore, at: { season: number; phase: AdventPhase }, nowMs: number = Date.now()): Promise<number> {
  if (at.phase !== "closed") return 0;
  return deliverAdventMail(store, at, nowMs);
}

/** A száraz összesítő egy tétele (P-056): a tanuló keresztneve és eredménye — e-mail-cím, token, eszközazonosító nélkül. */
export type AdventMailReportItem = {
  firstName: string | null; grade: number | null; reason: AdventFinalReason; bestRound: number; rounds: number; solved: number; firstTry: number;
  passed: boolean; pendingRecipients: number;
};
export type AdventMailReport = {
  mode: AdventMailMode; season: number; phase: AdventPhase;
  /** A címzettek SZÁMA (az `ADMIN_EMAILS` listából; maguk a címek nem kerülnek az összesítőbe). */
  recipients: number;
  /** Van-e a lenyomatokhoz titok (nélküle „send” módban sem menne levél). */
  secretConfigured: boolean;
  results: AdventMailReportItem[];
  totals: { results: number; mails: number; passed: number; lastRound: number; seasonClosed: number };
};

/**
 * Száraz összesítő (P-056): mely tanulókról menne most levél, ha a küldés be lenne kapcsolva — a takarító pótlásával azonos jelöltekből
 * (`mailCandidates`) és azonos döntéssel (`adventResultFinal`), csak olvasva (a `mailed_to` érintetlen). Részben kézbesített sornál
 * (korábbi „send” mód) a még kézbesítetlen tervezett címzettek száma számít.
 */
export async function adventMailReport(store: Pick<AdventStore, "mailCandidates">, at: { season: number; phase: AdventPhase }): Promise<AdventMailReport> {
  const currentRecipients = resolveAdminRecipients({ ADMIN_EMAILS: process.env.ADMIN_EMAILS, ADMIN_EMAIL: process.env.ADMIN_EMAIL });
  const recipients = currentRecipients.length;
  const secret = learnerLinkSecret();
  const results: AdventMailReportItem[] = [];
  for (const { row, firstName } of await store.mailCandidates(at.season, at.phase === "closed")) {
    const reason = adventResultFinal(row, at.phase);
    if (!reason) continue;
    const wants = row.mailedTo.filter((k) => k.startsWith("want:")).map((k) => k.slice("want:".length));
    const finals = new Set(row.mailedTo.filter((k) => k.startsWith("final:")).map((k) => k.slice("final:".length)));
    // A `sent:` jelölő is kézbesítettnek számít (a szolgáltató elfogadta; Thread 7 javítás).
    const sentHashes = new Set(row.mailedTo.filter((k) => k.startsWith("sent:")).map((k) => k.slice("sent:".length).split("@")[0]!));
    // A `check:` jelölő is kézbesítettnek számít (>24h bizonytalan, de a szolgáltató elfogadta; Thread 7 >24h javítás).
    const checkHashes = new Set(row.mailedTo.filter((k) => k.startsWith("check:")).map((k) => k.slice("check:".length)));
    const delivered = new Set([...finals, ...sentHashes, ...checkHashes]);
    // Thread 9: a tervezett címzetteket a jelenlegi ADMIN_EMAILS-szel metszve számoljuk; a már eltávolított címzett `want:` bejegyzése
    // nem számít kiküldendőnek (a küldő is csak a jelenlegi listáról dolgozik — sendAdventResult L175).
    let pendingRecipients: number;
    if (wants.length && secret) {
      // A jelenlegi címzettek hash-eiből csak azokat számoljuk, amelyekre van `want:` és nincs `final:` vagy `sent:`.
      const currentHashes = new Set(currentRecipients.map((to) => adventMailKey(secret, to).slice("final:".length)));
      pendingRecipients = wants.filter((h) => currentHashes.has(h) && !delivered.has(h)).length;
    } else {
      pendingRecipients = wants.length ? wants.filter((h) => !delivered.has(h)).length : recipients;
    }
    if (pendingRecipients === 0) continue;
    const { bestRound, best, rounds, passed } = adventResultSummary(row);
    results.push({ firstName, grade: row.grade, reason, bestRound, rounds, solved: best.solved, firstTry: best.firstTry, passed, pendingRecipients });
  }
  const count = (reason: AdventFinalReason) => results.filter((r) => r.reason === reason).length;
  return {
    mode: adventMailMode(), season: at.season, phase: at.phase, recipients, secretConfigured: Boolean(learnerLinkSecret()), results,
    totals: { results: results.length, mails: results.reduce((n, r) => n + r.pendingRecipients, 0), passed: count("passed"), lastRound: count("last-round"), seasonClosed: count("season-closed") },
  };
}
