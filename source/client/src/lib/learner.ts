/**
 * A nyilvános oldal tanulója (docs/specs/2026-10-18-nyilvanos-oldal-udvozlo.md): a név csak a böngészőben él
 * (`localStorage`), a szerverre nem kerül. Bejelentkezett tanulónál a fiók keresztneve az elsődleges.
 */
export const LEARNER_NAME_KEY = "websuli.learnerName";
export const WELCOME_DISMISSED_KEY = "websuli.welcomeDismissed";
export const LEARNER_NAME_MAX = 40;

export function normalizeLearnerName(raw: string | null | undefined): string | null {
  const name = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, LEARNER_NAME_MAX).trim();
  return name ? name : null;
}

export function loadLearnerName(): string | null {
  try {
    return normalizeLearnerName(window.localStorage.getItem(LEARNER_NAME_KEY));
  } catch {
    return null;
  }
}

export function saveLearnerName(raw: string): string | null {
  const name = normalizeLearnerName(raw);
  if (!name) return null;
  try {
    window.localStorage.setItem(LEARNER_NAME_KEY, name);
  } catch {
    // privát mód: a név csak erre az oldalbetöltésre él
  }
  return name;
}

export function clearLearnerName(): void {
  try {
    window.localStorage.removeItem(LEARNER_NAME_KEY);
  } catch {
    // nincs tárhely — nincs mit törölni
  }
}

export const MOTIVATION_LINES = [
  "Ma is egy lépéssel okosabb leszel — kezdjük!",
  "Minden nagy tudás egy kis kíváncsisággal kezdődik.",
  "Tíz figyelmes perc többet ér egy fáradt órányinál. Hajrá!",
  "A hibák a tanulás lépcsőfokai — bátran próbálkozz!",
  "Ami ma nehéz, holnap már könnyen megy.",
  "Nézd meg az újdonságokat, és szerezz egy kis sikerélményt!",
  "Lépésről lépésre — és egyszer csak érteni fogod.",
  "Büszke lehetsz magadra, hogy itt vagy. Folytassuk!",
] as const;

/** Naponta rögzített (determinisztikus) lelkesítő mondat — egy napon belül nem változik újratöltésre. */
export function motivationFor(name: string, date: Date): string {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return MOTIVATION_LINES[(day + name.length) % MOTIVATION_LINES.length];
}

export const NEW_WINDOW_DAYS = 30;
type Dated = { classroom: number; createdAt: string };

/**
 * A legújabb anyagok a tanulónak: az évfolyamáról (ha van, és van ott anyag), különben mindből; `createdAt` szerint csökkenő.
 * Előnyben a 30 napnál frissebbek; ha nincs ilyen, a legfrissebbek.
 */
export function newestMaterials<T extends Dated>(files: readonly T[], grade: number | null, now: Date, limit = 3): { files: T[]; isNew: (file: T) => boolean } {
  const cutoff = now.getTime() - NEW_WINDOW_DAYS * 86_400_000;
  const isNew = (file: T) => new Date(file.createdAt).getTime() >= cutoff;
  const own = grade == null ? [] : files.filter(f => f.classroom === grade);
  const pool = (own.length ? own : [...files]).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const fresh = pool.filter(isNew);
  return { files: (fresh.length ? fresh : pool).slice(0, limit), isNew };
}
