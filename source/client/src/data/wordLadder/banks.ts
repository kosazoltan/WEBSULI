import { WORD_LADDER_LANGUAGES, type LadderItem, type WordLadderLanguage } from "./types";

/**
 * Szólétra — nyelvek és bankok (spec 2026-09-29-palyak-szoletra-nyelvek, 4. döntés; B szelet). Tiszta modul: a
 * Vite-függő betöltés a `registry.ts`-ben van, ez node-tesztből is használható.
 */

export type LadderBanks = Partial<Record<WordLadderLanguage, readonly LadderItem[] | undefined>>;

export const LADDER_LANG_STORAGE_KEY = "websuli.wordladder.lang";

/** A választható nyelvek a menü sorrendjében: csak az, amelyiknek a bankja legalább egy tételt exportál. */
export function availableLadderLanguages(banks: LadderBanks): WordLadderLanguage[] {
  return WORD_LADDER_LANGUAGES.filter((lang) => (banks[lang]?.length ?? 0) > 0);
}

/** A bank öt szintje (0 = A1 … 4 = B2) a `tier` mező szerint. */
export function ladderTiersFromBank(items: readonly LadderItem[]): LadderItem[][] {
  const tiers: LadderItem[][] = [[], [], [], [], []];
  for (const item of items) tiers[item.tier]?.push(item);
  return tiers;
}

type LangStorage = Pick<Storage, "getItem" | "setItem">;

const browserStorage = (): LangStorage | null => {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** A tárolt nyelv, ha elérhető; különben az első elérhető (az angol). A tárolási hiba nem dob. */
export function loadLadderLanguage(available: readonly WordLadderLanguage[], storage: LangStorage | null = browserStorage()): WordLadderLanguage {
  const fallback = available[0] ?? "en";
  try {
    const raw = storage?.getItem(LADDER_LANG_STORAGE_KEY);
    return available.find((lang) => lang === raw) ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveLadderLanguage(lang: WordLadderLanguage, storage: LangStorage | null = browserStorage()): void {
  try {
    storage?.setItem(LADDER_LANG_STORAGE_KEY, lang);
  } catch {
    /* a tárolás hiánya nem állíthatja meg a játékot */
  }
}
