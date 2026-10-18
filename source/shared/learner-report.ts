/**
 * Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S4): az admin-összesítő és a riasztás tiszta része — budapesti naptári
 * napok (`YYYY-MM-DD`), a levelek minden szövege escape-elve.
 */
export type LearnerResult = { title: string; percent: number | null; at: string };
export type LearnerReport = { name: string; grade: number; lastActive: string | null; activeDays7: number; views7: number; results: LearnerResult[] };

function shiftDay(iso: string, delta: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * Inaktív, ha az utolsó 3 tanítási napon (a mait is beleértve) nem volt tevékenység. Szünetben (30 napon belül nincs 3 tanítási
 * nap) nem inaktív; a soha nem aktív tanuló tanítási időben inaktív.
 */
export function isInactive(lastActive: string | null, today: string, isSchoolDay: (iso: string) => boolean): boolean {
  const school: string[] = [];
  for (let i = 0; i < 30 && school.length < 3; i++) {
    const day = shiftDay(today, -i);
    if (isSchoolDay(day)) school.push(day);
  }
  if (school.length < 3) return false;
  return lastActive === null || lastActive < school[2];
}

/** Az inaktivitási időszak kulcsa: az utolsó tevékenység ideje (új tevékenység = új időszak), vagy 'never'. */
export const alertPeriodKey = (lastActiveAt: Date | null) => (lastActiveAt ? lastActiveAt.toISOString() : "never");

/**
 * Review #304: időszakonként címzettenként egy riasztás — a már értesített admin nem kap újra, a kimaradt a következő futáskor
 * pótlódik; új időszakban (közbeni tevékenység után) mindenki újra értesül.
 */
export function pendingAlertRecipients(recipients: readonly string[], periodKey: string, stored: { key: string | null; to: readonly string[] }): string[] {
  const done = new Set(stored.key === periodKey ? stored.to : []);
  return recipients.filter((r) => !done.has(r));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const pct = (p: number | null) => (p === null ? "—" : `${p}%`);

function reportBlock(r: LearnerReport): string {
  const results = r.results.length
    ? `<ul>${r.results.map(x => `<li>${esc(x.at)} — ${esc(x.title)}: <strong>${pct(x.percent)}</strong></li>`).join("")}</ul>`
    : "<p><em>Nincs beküldött eredmény.</em></p>";
  return `<h3>${esc(r.name)} (${r.grade}. évfolyam)</h3>`
    + `<p>Aktív napok az elmúlt héten: <strong>${r.activeDays7}</strong> · megnyitott anyagok: <strong>${r.views7}</strong> · utolsó tevékenység: ${esc(r.lastActive ?? "még nincs")}</p>`
    + results;
}

export function weeklySummaryEmail(reports: readonly LearnerReport[], weekLabel: string): { subject: string; html: string } {
  return {
    subject: `[WebSuli] Heti tanulói összefoglaló — ${weekLabel}`,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5"><h2>Heti összefoglaló — ${esc(weekLabel)}</h2>${reports.map(reportBlock).join("<hr>")}</div>`,
  };
}

export function inactivityAlertEmail(report: LearnerReport): { subject: string; html: string } {
  return {
    subject: `[WebSuli] ${report.name} 3 tanítási napja nem tanult`,
    html: `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5"><p>${esc(report.name)} az utolsó 3 tanítási napon nem nyitott meg tananyagot.</p>${reportBlock(report)}</div>`,
  };
}
