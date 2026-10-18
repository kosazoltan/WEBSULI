import cron from "node-cron";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "./db";
import { dailyReminderEmails } from "../shared/schema";
import { storage } from "./storage";
import { withCurriculum } from "./curriculum";
import { loadCurriculumContent } from "./curriculum/load";
import { getMaterialPreviewUrl } from "./utils/config";
import { isSchoolDay, schoolYearPosition } from "../shared/school-calendar";
import { firstNameOf, pickDailyMaterial, reminderHtml, reminderSubject } from "../shared/daily-reminder";
import { motivationFor } from "../shared/motivation";
import { logger } from "./lib/logger";

/**
 * Napi tananyag-emlékeztető a regisztrált tanulóknak (docs/specs/2026-10-18-napi-emlekezteto.md): minden tanítási reggel
 * egy, a tanmenet szerint aktuális anyag a nevesített címekre. Címenként naponta legfeljebb egy levél (daily_reminder_emails).
 * A tulajdonos döntése szerint leiratkozás nincs — a küldést az admin a név törlésével vagy a cím inaktiválásával állítja le.
 */
export type ReminderSender = (subject: string, html: string, to: string) => Promise<unknown>;
let sender: ReminderSender | null = null;
/** Teszthez: a valódi Resend-küldő helyett. */
export function setReminderSender(next: ReminderSender | null) { sender = next; }
async function send(subject: string, html: string, to: string) {
  if (sender) return sender(subject, html, to);
  if (process.env.NODE_ENV === "test") throw new Error("Tesztkörnyezetben nincs valódi e-mail-küldés.");
  const { sendAdminNotification } = await import("./resend");
  return sendAdminNotification(subject, html, to);
}

export const REMINDER_TIMEZONE = "Europe/Budapest";
const RECENT_DAYS = 14; // ~10 tanítási nap: ennyi ideig nem ismétlődik ugyanaz az anyag
const MAX_ATTEMPTS = 2;

/** A magyar naptári nap (a szerver UTC-ben fut): „YYYY-MM-DD” és helyi éjféli Date a naptár-függvényekhez. */
export function budapestDay(now: Date): { iso: string; date: Date } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: REMINDER_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now).map(p => [p.type, p.value]));
  const iso = `${parts.year}-${parts.month}-${parts.day}`;
  return { iso, date: new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) };
}

export type PlannedReminder = { email: string; studentName: string; grade: number; materialId: string; title: string; topic: string | null; url: string };

/** A mai tervezett levelek (küldés nélkül) — az admin előnézet és a küldés közös alapja. */
export async function planDailyReminders(now: Date): Promise<PlannedReminder[]> {
  const { iso, date } = budapestDay(now);
  const recipients = (await storage.getActiveExtraEmails())
    .filter(r => r.studentName?.trim() && Array.isArray(r.classrooms) && r.classrooms.length > 0);
  if (!recipients.length) return [];
  const files = await withCurriculum(await storage.getAllHtmlFiles(), loadCurriculumContent);
  const since = new Date(date.getTime() - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const recentRows = await db.select({ email: dailyReminderEmails.email, materialId: dailyReminderEmails.materialId })
    .from(dailyReminderEmails)
    .where(and(inArray(dailyReminderEmails.email, recipients.map(r => r.email)), gte(dailyReminderEmails.day, since), sql`${dailyReminderEmails.day} < ${iso}`));
  const today = schoolYearPosition(date);
  const out: PlannedReminder[] = [];
  for (const r of recipients) {
    const grade = r.classrooms[0];
    const recent = new Set(recentRows.filter(x => x.email === r.email).map(x => x.materialId));
    const pick = pickDailyMaterial(files, grade, today, recent);
    if (!pick) continue;
    out.push({ email: r.email, studentName: r.studentName!.trim(), grade, materialId: pick.id, title: pick.title, topic: pick.curriculum?.label ?? null, url: getMaterialPreviewUrl(pick.id) });
  }
  return out;
}

export type ReminderRun = { day: string; skipped?: string; sent: number; failed: number; duplicate: number };

/** A mai levelek kiküldése — címenként naponta egyszer (a sikertelen egyszer újrapróbálható). Sosem dob. */
export async function runDailyReminders(now: Date, opts: { pauseMs?: number } = {}): Promise<ReminderRun> {
  const { iso, date } = budapestDay(now);
  const result: ReminderRun = { day: iso, sent: 0, failed: 0, duplicate: 0 };
  try {
    if (!isSchoolDay(date)) return { ...result, skipped: "nem tanítási nap" };
    const plan = await planDailyReminders(now);
    const motivationDate = date;
    for (const p of plan) {
      // Foglalás: új sor, vagy a sikertelen sor újrapróbája — a már kiküldött / folyamatban lévő nap nem kap második levelet.
      const claimed = await db.insert(dailyReminderEmails)
        .values({ email: p.email, day: iso, materialId: p.materialId, status: "pending", attempts: 1 })
        .onConflictDoUpdate({
          target: [dailyReminderEmails.email, dailyReminderEmails.day],
          set: { status: "pending", attempts: sql`${dailyReminderEmails.attempts} + 1`, error: null },
          setWhere: sql`${dailyReminderEmails.status} = 'failed' AND ${dailyReminderEmails.attempts} < ${MAX_ATTEMPTS}`,
        })
        .returning({ id: dailyReminderEmails.id, materialId: dailyReminderEmails.materialId });
      if (!claimed.length) { result.duplicate++; continue; }
      const first = firstNameOf(p.studentName);
      try {
        await send(reminderSubject(first, p.title), reminderHtml({ first, title: p.title, topic: p.topic, url: p.url, motivation: motivationFor(first, motivationDate) }), p.email);
        await db.update(dailyReminderEmails).set({ status: "sent", sentAt: new Date(), materialId: p.materialId }).where(eq(dailyReminderEmails.id, claimed[0].id));
        result.sent++;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await db.update(dailyReminderEmails).set({ status: "failed", error: message.slice(0, 500) }).where(eq(dailyReminderEmails.id, claimed[0].id));
        result.failed++;
        logger.warn(`[DAILY-REMINDER] küldési hiba (${p.studentName}): ${message}`);
      }
      // Resend: legfeljebb 2 kérés/másodperc.
      if (opts.pauseMs !== 0) await new Promise(r => setTimeout(r, opts.pauseMs ?? 600));
    }
    logger.info(`[DAILY-REMINDER] ${iso}: elküldve ${result.sent}, hiba ${result.failed}, már kiküldve ${result.duplicate}`);
  } catch (error) {
    logger.error("[DAILY-REMINDER] a futás nem sikerült:", error);
  }
  return result;
}

/** Minden tanítási nap 6:45-kor, magyar idő szerint; csak éles környezetben. Hiba esetén 7:15-kor egy pótfutás. */
export function setupDailyReminders(): void {
  if (process.env.NODE_ENV !== "production") return;
  cron.schedule("45 6 * * 1-5", () => { void runDailyReminders(new Date()); }, { timezone: REMINDER_TIMEZONE });
  cron.schedule("15 7 * * 1-5", () => { void runDailyReminders(new Date()); }, { timezone: REMINDER_TIMEZONE });
  logger.info("[DAILY-REMINDER] ütemezve: tanítási napokon 6:45 (pótfutás 7:15), Europe/Budapest");
}
