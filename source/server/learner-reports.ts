import cron from "node-cron";
import { eq, lt, sql } from "drizzle-orm";
import { db } from "./db";
import { learnerActivity, learners } from "../shared/schema";
import { alertPeriodKey, inactivityAlertEmail, isInactive, pendingAlertRecipients, weeklySummaryEmail, type LearnerReport } from "../shared/learner-report";
import { isSchoolDay } from "../shared/school-calendar";
import { resolveAdminRecipients } from "./lib/material-result";
import { logger } from "./lib/logger";

/**
 * Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S4): tanulónkénti összesítő az adminnak, heti összefoglaló, inaktivitás-
 * riasztás és a 365 napos megőrzés. A gyerekek neve csak a levélbe és az admin felületre kerül, naplóba nem.
 */
const TZ = "Europe/Budapest";
const dayOf = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(d);
const schoolDayIso = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return isSchoolDay(new Date(y, m - 1, d));
};

export type LearnerOverview = { id: string; name: string; grade: number; tokenVersion: number; createdAt: Date; emails: number; lastActiveAt: Date | null; alertKey: string | null; alertedTo: string[]; report: LearnerReport };

export async function buildLearnerReports(now = new Date()): Promise<LearnerOverview[]> {
  // Review #304: a „7 nap” a budapesti naptár 7 napja (ma és az előző 6), nem 168 óra.
  const weekStart = dayOf(new Date(now.getTime() - 6 * 86_400_000));
  const rows = await db.execute<{ id: string; name: string; grade: number; token_version: number; created_at: Date; alert_key: string | null; alerted_to: string[] | null; last_at: Date | null; active7: number; views7: number; emails: number }>(sql`
    SELECT l.id, l.name, l.grade, l.token_version, l.created_at, l.inactivity_alert_key AS alert_key, l.inactivity_alerted_to AS alerted_to,
      (SELECT max(a.created_at) FROM learner_activity a WHERE a.learner_id = l.id) AS last_at,
      (SELECT count(DISTINCT (a.created_at AT TIME ZONE 'Europe/Budapest')::date)::int FROM learner_activity a WHERE a.learner_id = l.id AND (a.created_at AT TIME ZONE 'Europe/Budapest')::date >= ${weekStart}::date) AS active7,
      (SELECT count(*)::int FROM learner_activity a WHERE a.learner_id = l.id AND a.kind = 'view' AND (a.created_at AT TIME ZONE 'Europe/Budapest')::date >= ${weekStart}::date) AS views7,
      (SELECT count(*)::int FROM extra_email_addresses e WHERE e.learner_id = l.id) AS emails
    FROM learners l ORDER BY l.grade DESC, l.name`);
  // Review #304: tanulónként a valóban legutolsó 10 eredmény (a megőrzött 365 napból), időkorlát nélkül.
  const resultRows = await db.execute<{ learner_id: string; summary: string | null; percent: number | null; created_at: Date }>(sql`
    SELECT learner_id, summary, percent, created_at FROM (
      SELECT learner_id, summary, percent, created_at, row_number() OVER (PARTITION BY learner_id ORDER BY created_at DESC) AS rn
      FROM learner_activity WHERE kind = 'result') t
    WHERE rn <= 10 ORDER BY created_at DESC`);
  const results = resultRows.rows.map((x) => ({ learnerId: x.learner_id, summary: x.summary, percent: x.percent, createdAt: new Date(x.created_at) }));
  // Review #304: a cím nélküli tanuló is szerepel (a párosítása visszavonható); a levelek csak a címmel rendelkezőkről szólnak.
  return rows.rows.map((r) => {
    const lastActiveAt = r.last_at ? new Date(r.last_at) : null;
    return {
      id: r.id, name: r.name, grade: r.grade, tokenVersion: r.token_version, createdAt: new Date(r.created_at), emails: r.emails, lastActiveAt, alertKey: r.alert_key, alertedTo: r.alerted_to ?? [],
      report: {
        name: r.name, grade: r.grade, lastActive: lastActiveAt ? dayOf(lastActiveAt) : null, activeDays7: r.active7, views7: r.views7,
        results: results.filter((x) => x.learnerId === r.id).slice(0, 10).map((x) => ({ title: x.summary ?? "Tananyag", percent: x.percent, at: dayOf(x.createdAt) })),
      },
    };
  });
}

type Send = (subject: string, html: string, to: string) => Promise<unknown>;
async function defaultSend(subject: string, html: string, to: string) {
  const { sendAdminNotification } = await import("./resend");
  return sendAdminNotification(subject, html, to, { quiet: true });
}
const recipients = () => resolveAdminRecipients({ ADMIN_EMAILS: process.env.ADMIN_EMAILS, ADMIN_EMAIL: process.env.ADMIN_EMAIL });

// Review #304: több szerverpéldány esetén a feladat egyszer fut — tranzakciós tanácsadó zár; aki nem kapja meg, kihagyja.
async function withJobLock<T>(key: number, run: () => Promise<T>): Promise<T | null> {
  return db.transaction(async (tx) => {
    const locked = await tx.execute<{ ok: boolean }>(sql`SELECT pg_try_advisory_xact_lock(${key}) AS ok`);
    return locked.rows[0]?.ok ? run() : null;
  });
}
const WEEKLY_LOCK = 7_204_319;
const ALERT_LOCK = 7_204_320;

export async function runWeeklySummary(now = new Date(), send: Send = defaultSend): Promise<{ sent: number }> {
  const reports = (await buildLearnerReports(now)).filter((o) => o.emails > 0).map((o) => o.report);
  const list = recipients();
  if (!reports.length || !list.length) return { sent: 0 };
  const mail = weeklySummaryEmail(reports, `${dayOf(new Date(now.getTime() - 6 * 86_400_000))} – ${dayOf(now)}`);
  let sent = 0;
  for (const to of list) { try { await send(mail.subject, mail.html, to); sent++; } catch (e) { logger.warn("[LEARNER-REPORT] heti összefoglaló hiba", { error: String(e) }); } }
  // Review #304: teljes kézbesítési kudarc nem „siker” — a hívó (cron / admin végpont) hibaága fusson.
  if (sent === 0) throw new Error("A heti összefoglaló egyik címzettnek sem ment el.");
  return { sent };
}

export async function runInactivityAlerts(now = new Date(), send: Send = defaultSend): Promise<{ alerted: number }> {
  const today = dayOf(now);
  if (!schoolDayIso(today)) return { alerted: 0 };
  let alerted = 0;
  for (const o of (await buildLearnerReports(now)).filter((x) => x.emails > 0)) {
    // Átfogó review: új tanulónál / bevezetéskor a felvétel napja számít kezdőpontnak — nincs riasztás 3 tanítási nap előtt.
    const since = [o.report.lastActive, dayOf(o.createdAt)].filter((d): d is string => Boolean(d)).sort().pop() ?? null;
    if (!isInactive(since, today, schoolDayIso)) continue;
    const key = alertPeriodKey(o.lastActiveAt);
    const list = recipients();
    const pending = pendingAlertRecipients(list, key, { key: o.alertKey, to: o.alertedTo });
    if (!pending.length) continue;
    const mail = inactivityAlertEmail(o.report);
    const delivered = new Set(o.alertKey === key ? o.alertedTo : []);
    for (const to of pending) { try { await send(mail.subject, mail.html, to); delivered.add(to); } catch (e) { logger.warn("[LEARNER-REPORT] riasztás hiba", { error: String(e) }); } }
    // Review #304: címzettenkénti állapot — a kimaradt admin a következő futáskor pótlódik, a többiek nem kapnak duplikátumot.
    const complete = list.every((r) => delivered.has(r));
    await db.update(learners).set({ inactivityAlertKey: key, inactivityAlertedTo: [...delivered], inactivityAlertedAt: complete ? now : null }).where(eq(learners.id, o.id));
    if (delivered.size > 0) alerted++;
  }
  return { alerted };
}

export async function pruneLearnerActivity(now = new Date()): Promise<void> {
  await db.delete(learnerActivity).where(lt(learnerActivity.createdAt, new Date(now.getTime() - 365 * 86_400_000)));
}

export function setupLearnerReports(): void {
  if (process.env.NODE_ENV !== "production") return;
  const safe = (name: string, run: () => Promise<unknown>) => () => { void run().catch((e: unknown) => logger.warn(`[LEARNER-REPORT] ${name} hiba`, { error: String(e) })); };
  cron.schedule("0 18 * * 0", safe("heti összefoglaló", () => withJobLock(WEEKLY_LOCK, () => runWeeklySummary())), { timezone: TZ });
  cron.schedule("0 18 * * 1-5", safe("riasztás", () => withJobLock(ALERT_LOCK, () => runInactivityAlerts())), { timezone: TZ });
  // Review #304: a 365 napos megőrzés minden nap (hétvégén is) érvényesül.
  cron.schedule("30 3 * * *", safe("törlés", () => pruneLearnerActivity()), { timezone: TZ });
}
