import cron from "node-cron";
import { storage } from "./storage";
import { sendAdminNotification } from "./gmail";
import { getMaterialPreviewUrl } from "./utils/config";
import { sanitizeText } from "./utils/sanitize";
import type { MaterialView, HtmlFile } from "@shared/schema";

/**
 * Daily summary email for material views
 * Sends one email per day (at 20:00) with all views from that day
 */
export function setupDailyViewSummary() {
  // Run every day at 20:00 (8 PM)
  cron.schedule("0 20 * * *", async () => {
    try {
      console.log('[DAILY SUMMARY] Starting daily view summary email generation...');
      
      // Get today's material views
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      // Get recent views (last 1000) - includes material data
      const allViews = await storage.getRecentMaterialViews(1000);
      
      // Filter views from today
      const todayViews = allViews.filter((view: MaterialView & { material?: HtmlFile }) => {
        const viewDate = new Date(view.viewedAt);
        return viewDate >= today && viewDate < tomorrow;
      });
      
      // If no views today, skip email
      if (todayViews.length === 0) {
        console.log('[DAILY SUMMARY] No views today, skipping email.');
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
          <h2 style="color: #4F46E5;">📚 Mai anyag megtekintések</h2>
          <p>Ma összesen <strong>${todayViews.length} megtekintés</strong> történt ${Object.keys(viewsByMaterial).length} különböző anyagon.</p>
          
          <div style="margin: 20px 0;">
            ${materialSections}
          </div>
          
          <p style="color: #9CA3AF; font-size: 12px; margin-top: 30px;">
            Ez egy automatikus napi összesítő az Anyagok Profiknak platformról.
          </p>
        </div>
      `;
      
      // Send to all admins
      const adminEmails = [
        process.env.ADMIN_EMAIL || 'kosa.zoltan.ebc@gmail.com',
        'mszilva78@gmail.com'
      ].filter(Boolean);
      
      for (const adminEmail of adminEmails) {
        await sendAdminNotification(emailSubject, emailBody, adminEmail);
        console.log(`[DAILY SUMMARY] Email sent to: ${adminEmail}`);
      }
      
      console.log('[DAILY SUMMARY] Daily summary emails sent successfully.');
    } catch (error: any) {
      console.error('[DAILY SUMMARY] Error sending daily summary:', error);
    }
  });

  console.log("Daily view summary email job started (runs daily at 20:00)");
}
