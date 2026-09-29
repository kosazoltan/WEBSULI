import {
  LADDER_CATEGORIES,
  LADDER_CATEGORY_MINIMUMS,
  LADDER_TIER_MINIMUMS,
  type LadderItem,
  type LadderTier,
  type WordLadderLanguage,
} from "./types";

/**
 * Egy nyelv Szólétra-bankjának minden szerkezeti hibája (spec 2026-09-29-palyak-szoletra-nyelvek, 5. döntés).
 * `[]` = megfelel. A tartalmi helyességet (pontosan egy igaz opció) ezen felül a vak megoldó ellenőrzi.
 */
export function ladderBankProblems(items: readonly LadderItem[], lang: WordLadderLanguage, { checkMinimums = true } = {}): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const prompts = new Set<string>();
  const idPattern = new RegExp(`^${lang}[0-4]-\\d{3,4}$`);
  for (const item of items) {
    const at = item.id;
    if (!idPattern.test(item.id)) problems.push(`${at}: az azonosító alakja ${lang}<szint>-<sorszám> legyen`);
    else if (Number(item.id[lang.length]) !== item.tier) problems.push(`${at}: az azonosító szintje eltér a tier mezőtől`);
    if (ids.has(item.id)) problems.push(`${at}: ismétlődő azonosító`);
    ids.add(item.id);
    const promptKey = item.prompt.normalize("NFC").trim().toLocaleLowerCase("hu");
    if (prompts.has(promptKey)) problems.push(`${at}: ismétlődő kérdés`);
    prompts.add(promptKey);
    if (!(LADDER_CATEGORIES as readonly string[]).includes(item.category)) problems.push(`${at}: ismeretlen kategória`);
    if (item.options.length !== 4) problems.push(`${at}: pontosan 4 opció kell`);
    const opts = item.options.map((o) => o.normalize("NFC").trim().toLocaleLowerCase());
    if (opts.some((o) => !o)) problems.push(`${at}: üres opció`);
    if (new Set(opts).size !== opts.length) problems.push(`${at}: ismétlődő opció`);
    if (!Number.isInteger(item.correctIndex) || item.correctIndex < 0 || item.correctIndex >= item.options.length) {
      problems.push(`${at}: a helyes index a tartományon kívül esik`);
      continue;
    }
    const why = item.explanation ?? "";
    if (why.length < 30 || why.length > 300) problems.push(`${at}: a magyarázat 30–300 karakter legyen`);
    const key = item.options[item.correctIndex].normalize("NFC").toLocaleLowerCase();
    const keyWords = key.split(/[\s,.;:!?'’()„”"«»-]+/u).filter((w) => w.length >= 2);
    const whyLower = why.normalize("NFC").toLocaleLowerCase();
    if (!keyWords.some((w) => whyLower.includes(w))) problems.push(`${at}: a magyarázat nem említi a helyes választ („${item.options[item.correctIndex]}”)`);
    if (/(?<!\p{L})(első|második|harmadik|negyedik)\s+(válasz|opció|lehetőség)|(?<![\p{L}])[ABCD]\)/u.test(why)) {
      problems.push(`${at}: a magyarázat sorrendre hivatkozik`);
    }
  }
  if (checkMinimums) {
    for (const tier of [0, 1, 2, 3, 4] as LadderTier[]) {
      const n = items.filter((i) => i.tier === tier).length;
      if (n < LADDER_TIER_MINIMUMS[tier]) problems.push(`${lang}: a(z) ${tier}. szinten ${n} tétel (legalább ${LADDER_TIER_MINIMUMS[tier]})`);
    }
    for (const category of LADDER_CATEGORIES) {
      const n = items.filter((i) => i.category === category).length;
      if (n < LADDER_CATEGORY_MINIMUMS[category]) problems.push(`${lang}: „${category}” kategóriában ${n} tétel (legalább ${LADDER_CATEGORY_MINIMUMS[category]})`);
    }
  }
  return problems;
}
