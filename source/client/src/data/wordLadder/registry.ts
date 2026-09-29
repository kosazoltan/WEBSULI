import { WORD_LADDER_EN } from "./en";
import type { LadderBanks } from "./banks";
import type { LadderItem } from "./types";

/**
 * Szólétra — a nyelvi bankok regisztere (spec 2026-09-29-palyak-szoletra-nyelvek, 4–5. döntés; B szelet).
 *
 * A német és a francia bank (`de.ts` → `WORD_LADDER_DE`, `fr.ts` → `WORD_LADDER_FR`) külön szeletben készül. A
 * Vite-glob csak a létező fájlt veszi fel, így a menü addig csak az angolt kínálja, amíg a másik bank nem exportál
 * tételt — az egyesítéshez nem kell kódot módosítani. Csak a lap használja (a node-tesztek a `banks.ts`-t).
 */
const foreign: Record<string, Record<string, unknown>> = import.meta.glob<Record<string, unknown>>(["./de.ts", "./fr.ts"], {
  eager: true,
});

const exported = (path: string, name: string): LadderItem[] | undefined => {
  const value = foreign[path]?.[name];
  return Array.isArray(value) ? (value as LadderItem[]) : undefined;
};

export const WORD_LADDER_BANKS: LadderBanks = {
  en: WORD_LADDER_EN,
  de: exported("./de.ts", "WORD_LADDER_DE"),
  fr: exported("./fr.ts", "WORD_LADDER_FR"),
};
