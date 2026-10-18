import cron from "node-cron";
import { eq, lt, sql } from "drizzle-orm";
import { db } from "./db";
import { learnerActivity, learners } from "../shared/schema";
import { inactivityAlertEmail, isInactive, shouldAlert, weeklySummaryEmail, type LearnerReport } from "../shared/learner-report";
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

export type LearnerOverview = { id: string; name: string; grade: number; tokenVersion: number; emails: number; lastActiveAt: Date | null; alertedAt: Date | null; report: LearnerReport };

export async function buildLearnerReports(now = new Date()): Promise<LearnerOverview[]> {
  // Review #304: a „7 nap” a budapesti naptár 7 napja (ma és az előző 6), nem 168 óra.
  const weekStart = dayOf(new Date(now.getTime() - 6 * 86_400_000));
  const rows = await db.execute<{ id: string; name: string; grade: number; token_version: number; alerted: Date | null; last_at: Date | null; active7: number; views7: number; emails: number }>(sql`
    SELECT l.id, l.name, l.grade, l.token_version, l.inactivity_alerted_at AS alerted,
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
  return rows.rows.filter((r) => r.emails > 0).map((r) => {
    const lastActiveAt = r.last_at ? new Date(r.last_at) : null;
    return {
      id: r.id, name: r.name, grade: r.grade, tokenVersion: r.token_version, emails: r.emails, lastActiveAt, alertedAt: r.alerted ? new Date(r.alerted) : null,
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

export async function runWeeklySummary(now = new Date(), send: Send = defaultSend): Promise<{ sent: number }> {
  const reports = (await buildLearnerReports(now)).map((o) => o.report);
  if (!reports.length) return { sent: 0 };
  const mail = weeklySummaryEmail(reports, `${dayOf(new Date(now.getTime() - 6 * 86_400_000))} – ${dayOf(now)}`);
  let sent = 0;
  for (const to of recipients()) { try { await send(mail.subject, mail.html, to); sent++; } catch (e) { logger.warn("[LEARNER-REPORT] heti összefoglaló hiba", { error: String(e) }); } }
  return { sent };
}

export async function runInactivityAlerts(now = new Date(), send: Send = defaultSend): Promise<{ alerted: number }> {
  const today = dayOf(now);
  if (!schoolDayIso(today)) return { alerted: 0 };
  let alerted = 0;
  for (const o of await buildLearnerReports(now)) {
    if (!shouldAlert(o.lastActiveAt, o.alertedAt, isInactive(o.report.lastActive, today, schoolDayIso))) continue;
    const mail = inactivityAlertEmail(o.report);
    // Review #304: csak akkor zárul le az időszak, ha minden admin megkapta — különben a következő futás pótolja.
    const list = recipients();
    let delivered = 0;
    for (const to of list) { try { await send(mail.subject, mail.html, to); delivered++; } catch (e) { logger.warn("[LEARNER-REPORT] riasztás hiba", { error: String(e) }); } }
    if (list.length > 0 && delivered === list.length) { await db.update(learners).set({ inactivityAlertedAt: now }).where(eq(learners.id, o.id)); alerted++; }
  }
  return { alerted };
}

export async function pruneLearnerActivity(now = new Date()): Promise<void> {
  await db.delete(learnerActivity).where(lt(learnerActivity.createdAt, new Date(now.getTime() - 365 * 86_400_000)));
}

export function setupLearnerReports(): void {
  if (process.env.NODE_ENV !== "production") return;
  const safe = (name: string, run: () => Promise<unknown>) => () => { void run().catch((e: unknown) => logger.warn(`[LEARNER-REPORT] ${name} hiba`, { error: String(e) })); };
  cron.schedule("0 18 * * 0", safe("heti összefoglaló", () => runWeeklySummary()), { timezone: TZ });
  cron.schedule("0 18 * * 1-5", safe("riasztás", () => runInactivityAlerts()), { timezone: TZ });
  // Review #304: a 365 napos megőrzés minden nap (hétvégén is) érvényesül.
  cron.schedule("30 3 * * *", safe("törlés", () => pruneLearnerActivity()), { timezone: TZ });
}
