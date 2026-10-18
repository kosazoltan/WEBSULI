/**
 * A nyilvános oldal tanulója (docs/specs/2026-10-18-nyilvanos-oldal-udvozlo.md): a név csak a böngészőben él
 * (`localStorage`), a szerverre nem kerül. Bejelentkezett tanulónál a fiók keresztneve az elsődleges.
 */
export const LEARNER_NAME_KEY = "websuli.learnerName";
export const WELCOME_DISMISSED_KEY = "websuli.welcomeDismissed";
export const LEARNER_NAME_MAX = 40;
/** Bejelentkezett tanuló kézi névfelülírása — fiókhoz kötve, hogy fiókváltáskor ne öröklődjön (review #289). */
export const LEARNER_NAME_OVERRIDE_KEY = "websuli.learnerNameOverride";

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

export function loadNameOverride(accountId: string): string | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(LEARNER_NAME_OVERRIDE_KEY) ?? "null") as { accountId?: unknown; name?: unknown } | null;
    return raw && raw.accountId === accountId && typeof raw.name === "string" ? normalizeLearnerName(raw.name) : null;
  } catch {
    return null;
  }
}

export function saveNameOverride(accountId: string, raw: string): string | null {
  const name = normalizeLearnerName(raw);
  if (!name) return null;
  try {
    window.localStorage.setItem(LEARNER_NAME_OVERRIDE_KEY, JSON.stringify({ accountId, name }));
  } catch {
    // privát mód: csak erre az oldalbetöltésre él
  }
  return name;
}

/** A megjelenített név: fióknál a kézi felülírás, különben a fiók keresztneve; fiók nélkül a böngészőben tárolt név. */
export function resolveLearnerName(account: { id: string; firstName?: string | null } | null | undefined, stored: string | null, override: string | null): string | null {
  if (account) return override ?? normalizeLearnerName(account.firstName) ?? stored;
  return stored;
}

export function clearLearnerName(): void {
  try {
    window.localStorage.removeItem(LEARNER_NAME_KEY);
  } catch {
    // nincs tárhely — nincs mit törölni
  }
}

// A lelkesítő mondatok a közös modulban (a napi e-mail is ezt használja — docs/specs/2026-10-18-napi-emlekezteto.md).
export { MOTIVATION_LINES, motivationFor } from "@shared/motivation";

export const NEW_WINDOW_DAYS = 30;
type Dated = { classroom: number; createdAt: string };

/**
 * A legújabb anyagok a tanulónak: az évfolyamáról (ha van, és van ott anyag), különben mindből; `createdAt` szerint csökkenő.
 * Előnyben a 30 napnál frissebbek; ha nincs ilyen, a legfrissebbek.
 */
export function newestMaterials<T extends Dated>(files: readonly T[], grade: number | null, now: Date, limit = 3): { files: T[]; isNew: (file: T) => boolean; fromGrade: boolean } {
  const cutoff = now.getTime() - NEW_WINDOW_DAYS * 86_400_000;
  const isNew = (file: T) => new Date(file.createdAt).getTime() >= cutoff;
  const own = grade == null ? [] : files.filter(f => f.classroom === grade);
  const pool = (own.length ? own : [...files]).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const fresh = pool.filter(isNew);
  // fromGrade: a lista valóban a tanuló évfolyamáról való (különben a cím nem nevezheti meg az évfolyamot — review #289)
  return { files: (fresh.length ? fresh : pool).slice(0, limit), isNew, fromGrade: own.length > 0 };
}
