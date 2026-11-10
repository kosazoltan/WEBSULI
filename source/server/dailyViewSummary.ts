import cron from "node-cron";
import { storage } from "./storage";
// BUGFIX: this used to import from ./gmail, whose sendAdminNotification is a deprecated
// stub that unconditionally throws — the daily summary e-mail could never be delivered
// (the throw was swallowed by the surrounding catch). Use the live Resend implementation.
import { sendAdminNotification } from "./resend";
import { getMaterialPreviewUrl } from "./utils/config";
import { sanitizeText } from "./utils/sanitize";
import type { MaterialView, HtmlFile } from "@shared/schema";
import { logger } from "./lib/logger";

const SUMMARY_TIMEZONE = "Europe/Budapest";

/** Egy időpont budapesti falióra-összetevői (év, hónap, nap, óra, perc, mp). */
function budapestWall(ms: number): { y: number; mo: number; d: number; h: number; mi: number; s: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: SUMMARY_TIMEZONE, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(new Date(ms)).map(p => [p.type, Number(p.value)]));
  return { y: parts.year, mo: parts.month, d: parts.day, h: parts.hour, mi: parts.minute, s: parts.second };
}

/** A budapesti falióra-idő (a naptári nap eltolható) UTC pillanata; az óraátállítás alatt is determinisztikus. */
function budapestWallToInstant(y: number, mo: number, d: number, h: number, mi: number, s: number): number {
  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi, s);
  let guess = wallAsUtc;
  for (let i = 0; i < 3; i++) {
    const w = budapestWall(guess);
    const offset = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(guess / 1000) * 1000;
    guess = wallAsUtc - offset;
  }
  return guess;
}

/**
 * Hibavadászat B2: az összesítő ablaka — `end` = most, `start` = az előző budapesti naptári nap ugyanazon falióra-időpontja
 * (óraátállításkor 23 / 25 óra), így két egymást követő futás ablaka hézag és átfedés nélkül illeszkedik.
 */
export function summaryWindow(now: Date): { start: Date; end: Date } {
  const w = budapestWall(now.getTime());
  const prev = new Date(Date.UTC(w.y, w.mo - 1, w.d - 1));
  const start = budapestWallToInstant(prev.getUTCFullYear(), prev.getUTCMonth() + 1, prev.getUTCDate(), w.h, w.mi, w.s);
  return { start: new Date(start), end: new Date(now.getTime()) };
}

/**
 * Daily summary email for material views
 * Sends one email per day (at 20:00 Budapest time) with all views since the previous run
 */
export function setupDailyViewSummary() {
  // Run every day at 20:00 (8 PM) Budapest time — a szerver UTC-ben fut, ezért az időzóna kötelező
  cron.schedule("0 20 * * *", async () => {
    try {
      logger.info('[DAILY SUMMARY] Starting daily view summary email generation...');

      // Views since the previous run (previous day 20:00 → now, Budapest time)
      const { start, end } = summaryWindow(new Date());

      // AUDIT 2026-09-01: dátumszűrt lekérdezés a globális 1000-es limit helyett
      const todayViews: Array<MaterialView & { material?: HtmlFile }> =
        await storage.getMaterialViewsBetween(start, end);

      // If no views in the window, skip email
      if (todayViews.length === 0) {
        logger.info('[DAILY SUMMARY] No views in the window, skipping email.');
        return;
      }
      
      // Group views by material
      type ViewGroup = { material?: HtmlFile; views: Array<MaterialView & { material?: HtmlFile }> };
      const viewsByMaterial = todayViews.reduce((acc: Record<string, ViewGroup>, view: MaterialView & { material?: HtmlFile }) => {
        const materialId = view.materialId;
        if (!acc[materialId]) {
          acc[materialId] = {
            material: view.material,
            views: []
          };
        }
        acc[materialId].views.push(view);
        return acc;
      }, {});
      
      // Build email body
      const materialSections = Object.entries(viewsByMaterial)
        .map(([materialId, data]: [string, ViewGroup]) => {
          const material = data.material;
          const viewCount = data.views.length;
          const materialUrl = getMaterialPreviewUrl(materialId);
          const classroom = material?.classroom ? `${material.classroom}. osztály` : 'Osztály nélkül';
          
          const safeTitle = sanitizeText(material?.title || 'Ismeretlen anyag');
          const safeClassroom = sanitizeText(classroom);
          
          return `
            <div style="background: #F3F4F6; padding: 15px; border-radius: 8px; margin: 10px 0;">
              <h3 style="margin-top: 0; color: #1F2937;">${safeTitle}</h3>
              <p style="color: #6B7280; margin: 5px 0;">
                <strong>Osztály:</strong> ${safeClassroom}
              </p>
              <p style="color: #6B7280; margin: 5px 0;">
                <strong>Megtekintések:</strong> ${viewCount}×
              </p>
              <a href="${materialUrl}" 
                 style="display: inline-block; background: #4F46E5; color: white; padding: 8px 16px; 
                        text-decoration: none; border-radius: 4px; margin-top: 8px; font-size: 14px;">
                Megtekintés
              </a>
            </div>
          `;
        })
        .join('');
      
      const emailSubject = `📊 Napi összesítő: ${todayViews.length} megtekintés`;
      const emailBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">📚 Anyag megtekintések az előző összesítő óta</h2>
          <p>Az előző összesítő óta összesen <strong>${todayViews.length} megtekintés</strong> történt ${Object.keys(viewsByMaterial).length} különböző anyagon.</p>
          
          <div style="margin: 20px 0;">
            ${materialSections}
          </div>
          
          <p style="color: #9CA3AF; font-size: 12px; margin-top: 30px;">
            Ez egy automatikus napi összesítő az Anyagok Profiknak platformról.
          </p>
        </div>
      `;
      
      // Send to all admins from environment variable (comma-separated)
      const adminEmailsEnv = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || '';
      const adminEmails = adminEmailsEnv.split(',').map(e => e.trim()).filter(Boolean);
      
      for (const adminEmail of adminEmails) {
        await sendAdminNotification(emailSubject, emailBody, adminEmail);
        logger.info(`[DAILY SUMMARY] Email sent to: ${adminEmail}`);
      }
      
      logger.info('[DAILY SUMMARY] Daily summary emails sent successfully.');
    } catch (error: unknown) {
      logger.error('[DAILY SUMMARY] Error sending daily summary:', error);
    }
  }, { timezone: "Europe/Budapest" });

  logger.info("Daily view summary email job started (runs daily at 20:00)");
}
