/**
 * Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S3): a napi tanulási sorozat — tiszta függvények, budapesti naptári
 * napokkal (`YYYY-MM-DD`).
 */
export type LearningStreak = { days: number; today: boolean };

function previousDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Az egymást követő tevékenységnapok száma, amely ma vagy tegnap végződik; különben 0. */
export function learningStreak(days: Iterable<string>, today: string): LearningStreak {
  const set = new Set(days);
  const activeToday = set.has(today);
  let cursor = activeToday ? today : previousDay(today);
  let count = 0;
  while (set.has(cursor)) {
    count++;
    cursor = previousDay(cursor);
  }
  return { days: count, today: activeToday };
}

export function streakMessage(streak: LearningStreak | null | undefined): string | null {
  if (!streak || streak.days <= 0) return null;
  if (!streak.today) return `${streak.days} napos sorozatod van — ma is folytasd!`;
  return streak.days === 1 ? "Ma már tanultál — szuper!" : `${streak.days} napja tanulsz egymás után!`;
}
