import {
  LADDER_CATEGORIES,
  LADDER_CATEGORY_MINIMUMS,
  LADDER_TIER_MINIMUMS,
  type LadderItem,
  type LadderTier,
  type WordLadderLanguage,
} from "./types";

/** Magyar feladat-utasítás (nem célszó): „Melyik …”, „Mit mondasz …”, „Egészítsd ki …”, „… helyes mondat”. */
const FOCUS_INSTRUCTION = /(^|[\s„])(Melyik|Mit mondasz|Mit kérdezel|Mit válaszolsz|Hogyan mondod|Egészítsd ki|helyes mondat)/u;
/** Célnyelvi kérdő mondat kezdete (angol / német / francia): az ilyen célrész a záró „?”-lel együtt teljes. */
const FOCUS_QUESTION_START = /^(What|What's|Where|Where's|When|Who|Whose|Why|How|Could|Can|Would|Will|Shall|Should|May|Do|Does|Did|Is|Are|Was|Were|Have|Has|Wie|Was|Wo|Wann|Warum|Wer|Kannst|Können|Haben|Hast|Bist|Ist|Sind|Gibt|Möchten|Qu'est-ce|Quel|Quelle|Comment|Où|Quand|Pourquoi|Qui|Est-ce|As-tu|Peux-tu|Pouvez-vous|Combien)(?![\p{L}'])/u;

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
    if (/(?:^|[^\p{L}])(első|második|harmadik|negyedik)\s+(válasz|opció|lehetőség)|(?:^|[^\p{L}])[ABCD]\)/u.test(why)) {
      problems.push(`${at}: a magyarázat sorrendre hivatkozik`);
    }
    // Célrész (docs/specs/2026-11-17-szoletra-olvashatosag.md D): a kérdés-sáv ezt emeli ki — a prompt rész-szövege.
    const blank = /_{3,}/u.test(item.prompt);
    // A kettőspont utáni rész: ha az maga a feladat-utasítás (helyzetleírás + „Melyik a helyes …?”), nincs célszó.
    const afterColon = item.prompt.includes(": ") ? item.prompt.slice(item.prompt.indexOf(": ") + 2) : "";
    if (item.focus !== undefined) {
      if (item.focus.trim().length === 0) problems.push(`${at}: üres célrész (focus)`);
      else if (!item.prompt.includes(item.focus)) problems.push(`${at}: a célrész (focus) nem rész-szövege a promptnak`);
      else if (blank && !/_{3,}/u.test(item.focus)) problems.push(`${at}: hiányos mondatnál a célrész tartalmazza a hiányt`);
      else if (FOCUS_INSTRUCTION.test(item.focus) && !item.prompt.includes(`„${item.focus}”`)) {
        problems.push(`${at}: a célrész feladat-utasítást tartalmaz (a célrész a kérdezett szó / mondat, nem az utasítás)`);
      } else if (item.prompt.endsWith(`${item.focus}?`) && (/_{3,}/u.test(item.focus) || FOCUS_QUESTION_START.test(item.focus))) {
        problems.push(`${at}: a kérdő mondat záró „?”-e a célrésszel marad (nem a keretsorba)`);
      }
    } else if (item.prompt.includes("„") || (/: \S/u.test(item.prompt) && !FOCUS_INSTRUCTION.test(afterColon))) {
      problems.push(`${at}: hiányzik a célrész (focus) — idézőjeles / kettőspontos kérdés`);
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
