import { curriculumSort, type CurriculumHint } from "./curriculum-order";

/**
 * Napi tananyag-emlékeztető (docs/specs/2026-10-18-napi-emlekezteto.md) — tiszta függvények: keresztnév, a nap anyaga,
 * a levél tárgya és HTML-je. A küldés és az ismétlésvédelem a `server/daily-reminder.ts`-ben.
 */

/** Magyar névsorrend: „Kósa Kristóf Máté” → „Kristóf”; egytagú névnél maga a név. */
export function firstNameOf(full: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return parts.length >= 2 ? parts[1] : parts[0] ?? "";
}

export type ReminderMaterial = { id: string; title: string; classroom: number; createdAt?: string | Date | null; curriculum?: CurriculumHint };

/**
 * Az évfolyam anyagai közül a tanmenet szerint a mai naphoz legközelebbi, amelyet a tanuló mostanában nem kapott meg.
 * Ha minden anyag szerepelt már, a legközelebbi; ha az évfolyamon nincs anyag, `null`.
 */
export function pickDailyMaterial<T extends ReminderMaterial>(files: readonly T[], grade: number, today: number, recentIds: ReadonlySet<string>): T | null {
  const ordered = curriculumSort(files.filter(f => f.classroom === grade), today);
  return ordered.find(f => !recentIds.has(f.id)) ?? ordered[0] ?? null;
}

/** A tanmenet-címke emberi alakja: a belső OH-kód és a felesleges írásjelek nélkül (docs/specs/2026-10-18-emlekezteto-probalevel.md). */
export function displayTopic(label: string | null | undefined): string | null {
  if (!label) return null;
  const out = label
    .replace(/\s*\(OH-[A-Z0-9-]+\)/g, "")
    .replace(/—\s*\.\s*/g, "— ")
    .replace(/^\s*\.\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  return out || null;
}

export const reminderSubject = (first: string, title: string) => `${first}, a mai tananyagod: ${title}`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function reminderHtml(input: { first: string; title: string; topic?: string | null; url: string; motivation: string }): string {
  const { first, title, topic, url, motivation } = input;
  return `<!doctype html><html lang="hu"><body style="margin:0;background:#0A0E27;font-family:Arial,Helvetica,sans-serif;color:#f8fafc">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:22px;font-weight:bold;margin:0 0 8px">Szia, ${esc(first)}!</p>
<p style="font-size:16px;margin:0 0 20px;color:#e2e8f0">${esc(motivation)}</p>
<div style="background:#1e1b4b;border:1px solid #fb923c;border-radius:16px;padding:20px">
<p style="font-size:13px;margin:0 0 6px;color:#fcd34d;font-weight:bold">A MAI TANANYAGOD</p>
<p style="font-size:20px;font-weight:bold;margin:0 0 6px;color:#fdba74">${esc(title)}</p>
${topic ? `<p style="font-size:14px;margin:0 0 16px;color:#cbd5e1">Ezt tanuljátok most: ${esc(topic)}</p>` : ""}
<a href="${esc(url)}" style="display:inline-block;background:#fb923c;color:#0f172a;font-weight:bold;font-size:17px;text-decoration:none;padding:14px 24px;border-radius:999px">Megnyitom a tananyagot</a>
</div>
<p style="font-size:12px;color:#94a3b8;margin:20px 0 0">Ezt a levelet a WebSuli küldi minden tanítási reggel. Jó tanulást!</p>
</div></body></html>`;
}
