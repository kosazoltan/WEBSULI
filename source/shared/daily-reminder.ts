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

/**
 * Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S5): okos választás a párosított tanulónak — 1) a 70% alatti, 7–30 napos
 * eredmény ismétlése (ha az elmúlt 14 napban nem ment ki), 2) a tanmenet szerint első, még meg nem nyitott anyag, 3) a régi választás.
 */
export type LearnerHistory = { seenIds: ReadonlySet<string>; weak: ReadonlyArray<{ materialId: string; percent: number }> };
/** A tanuló naplójából: a látott anyagok, és az anyagonként legutolsó, 70% alatti, 7–30 napos eredmények (a legrégebbi elöl). */
export function learnerHistoryFrom(rows: ReadonlyArray<{ materialId: string | null; kind: string; percent: number | null; createdAt: Date }>, now: Date): LearnerHistory {
  const seenIds = new Set<string>();
  const latest = new Map<string, { percent: number | null; at: Date }>();
  for (const r of rows) {
    if (!r.materialId) continue;
    seenIds.add(r.materialId);
    if (r.kind !== "result") continue;
    const prev = latest.get(r.materialId);
    if (!prev || r.createdAt > prev.at) latest.set(r.materialId, { percent: r.percent, at: r.createdAt });
  }
  const day = 86_400_000;
  const weak = [...latest.entries()]
    .filter(([, v]) => v.percent !== null && v.percent < 70 && now.getTime() - v.at.getTime() >= 7 * day && now.getTime() - v.at.getTime() <= 30 * day)
    .sort((a, b) => a[1].at.getTime() - b[1].at.getTime())
    .map(([materialId, v]) => ({ materialId, percent: v.percent! }));
  return { seenIds, weak };
}

export function pickSmartMaterial<T extends ReminderMaterial>(files: readonly T[], grade: number, today: number, recentIds: ReadonlySet<string>, learner?: LearnerHistory | null): { file: T; repeatPercent?: number } | null {
  if (learner) {
    for (const w of learner.weak) {
      // Review #305: az ismétlés is a tanuló évfolyamán belül marad.
      const file = files.find(f => f.id === w.materialId && f.classroom === grade);
      if (file && !recentIds.has(file.id)) return { file, repeatPercent: w.percent };
    }
    const fresh = curriculumSort(files.filter(f => f.classroom === grade), today).find(f => !recentIds.has(f.id) && !learner.seenIds.has(f.id));
    if (fresh) return { file: fresh };
  }
  const file = pickDailyMaterial(files, grade, today, recentIds);
  return file ? { file } : null;
}

/** A tanmenet-címke emberi alakja: a belső OH-kód és a felesleges írásjelek nélkül (docs/specs/2026-10-18-emlekezteto-probalevel.md). */
export function displayTopic(label: string | null | undefined): string | null {
  if (!label) return null;
  const out = label
    // Review #294: a tárolt alakok mind: szóköz a zárójel előtt, „/” és „_”, hiányzó nyitó zárójel.
    .replace(/\s*\(?\s*OH-[A-Za-z0-9_/-]+\s*\)/g, "")
    .replace(/—\s*\.\s*/g, "— ")
    .replace(/^\s*\.\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  return out || null;
}

export const reminderSubject = (first: string, title: string, repeat = false) => repeat ? `${first}, ismételjük: ${title}` : `${first}, a mai tananyagod: ${title}`;

/** Spec 2026-10-22-uj-lecke-ertesito: az új Stúdió-lecke értesítőjének tárgya és címkéje. */
export const newLessonSubject = (first: string, title: string) => `${first}, új tananyagod érkezett: ${title}`;
export const NEW_LESSON_LABEL = "ÚJ TANANYAG";
/** Review #365: az új-lecke értesítő nem reggeli levél — a lábléc az elkészülést nevezi meg. */
export const NEW_LESSON_FOOTER = "Ezt a levelet a WebSuli akkor küldi, amikor elkészül egy új tananyag az évfolyamodnak. Jó tanulást!";

/** Spec 2026-10-22-uj-lecke-ertesito: az ütemezett reggeli levél csak az ismétlést ajánlja (a 70% alatti eredmény újra). */
export function repeatOnlyPlan<T extends { repeatPercent?: number }>(plan: readonly T[]): T[] {
  return plan.filter((p) => p.repeatPercent !== undefined);
}

/** Spec 2026-10-22-uj-lecke-ertesito: az új lecke címzettjei — aktív, nevesített tanulói cím, amelynek évfolyama a leckéé. */
export function newLessonRecipients<T extends { email: string; studentName?: string | null; isActive?: boolean | null; classrooms?: readonly number[] | null }>(rows: readonly T[], classroom: number): T[] {
  return rows.filter((r) => r.isActive !== false && Boolean(r.studentName?.trim()) && Array.isArray(r.classrooms) && r.classrooms[0] === classroom);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function reminderHtml(input: { first: string; title: string; topic?: string | null; url: string; motivation: string; repeatPercent?: number | null; label?: string; footer?: string }): string {
  const { first, title, topic, url, motivation, repeatPercent } = input;
  const label = input.label ?? (typeof repeatPercent === "number" ? `ISMÉTLÉS — MÚLTKOR ${Math.round(repeatPercent)}% LETT` : "A MAI TANANYAGOD");
  return `<!doctype html><html lang="hu"><body style="margin:0;background:#0A0E27;font-family:Arial,Helvetica,sans-serif;color:#f8fafc">
<div style="max-width:560px;margin:0 auto;padding:24px">
<p style="font-size:22px;font-weight:bold;margin:0 0 8px">Szia, ${esc(first)}!</p>
<p style="font-size:16px;margin:0 0 20px;color:#e2e8f0">${esc(motivation)}</p>
<div style="background:#1e1b4b;border:1px solid #fb923c;border-radius:16px;padding:20px">
<p style="font-size:13px;margin:0 0 6px;color:#fcd34d;font-weight:bold">${esc(label)}</p>
<p style="font-size:20px;font-weight:bold;margin:0 0 6px;color:#fdba74">${esc(title)}</p>
${topic ? `<p style="font-size:14px;margin:0 0 16px;color:#cbd5e1">Ezt tanuljátok most: ${esc(topic)}</p>` : ""}
<a href="${esc(url)}" style="display:inline-block;background:#fb923c;color:#0f172a;font-weight:bold;font-size:17px;text-decoration:none;padding:14px 24px;border-radius:999px">Megnyitom a tananyagot</a>
</div>
<p style="font-size:12px;color:#94a3b8;margin:20px 0 0">${esc(input.footer ?? "Ezt a levelet a WebSuli küldi minden tanítási reggel. Jó tanulást!")}</p>
</div></body></html>`;
}
