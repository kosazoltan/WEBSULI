import { ATOM, EXPR, SIGN, evaluateExpression } from "./arithmetic-expression";

/**
 * Spec 2026-09-29 (docs/specs/2026-09-29-egy-helyes-valasz.md), döntés 1: determinisztikus egy-helyes-válasz őr.
 *
 * Tulajdonosi hibajelzés: egy feladatlap 8. kérdésénél („Melyik szám osztható 9-cel?”) mind a négy opció
 * (234, 567, 891, 648) helyes volt. Egyválasztós tételben PONTOSAN EGY opció lehet igaz, és az a kulcs. Ez az őr a
 * biztosan kiszámolható osztályokat nézi (oszthatóság, tiszta számtani kérdés, egyenértékű opciók); minden más
 * esetben hallgat (üres lista) — a nem kiszámolható tartalmat a bank-ellenőr opciónkénti ítélete fedi.
 */

export type SingleChoiceItem = { prompt: string; options: readonly string[]; correctIndex: number };

const norm = (s: string) => s.normalize("NFC").toLocaleLowerCase("hu").replace(/\s+/g, " ").trim();
const textKey = (s: string) => norm(s).replace(/[.!?;:,]+$/u, "").trim();
const INTEGER = new RegExp(`^(${SIGN})?(\\d{1,3}(?:[ \\u00a0\\u202f]\\d{3})+|\\d+)$`);
/** Egyetlen szám (egész, tizedes, tört, vegyes tört), előjellel. */
const LONE_NUMBER = new RegExp(`^(?:${SIGN})?(?:${ATOM})$`);

/** Egész opció („648”, „1 024”, „−12”); `null`, ha nem egész szám. */
function integerOf(option: string): number | null {
  const t = option.normalize("NFC").trim();
  const m = t.match(INTEGER);
  if (!m) return null;
  const n = Number(m[2].replace(/[ \u00a0\u202f]/g, ""));
  return Number.isSafeInteger(n) ? (m[1] ? -n : n) : null;
}

/** Számopció értéke: egész, tizedes (vesszővel is), tört, vegyes tört; `null`, ha nem biztosan szám. */
function numberOf(option: string): number | null {
  const t = option.normalize("NFC").trim();
  // „1.000” — ponttal tagolt ezres vagy tizedes? Nem olvasható biztosan.
  if (/^[-−–]?\d{1,3}(?:\.\d{3})+$/.test(t)) return null;
  if (!LONE_NUMBER.test(t)) return null;
  return evaluateExpression(t);
}

const listed = (options: readonly string[], indexes: number[]) => indexes.map((i) => `„${options[i].trim()}”`).join(", ");

/** Ahol a kérdés a szám ALAKJÁRÓL szól (egyszerűsítés, bővítés, írásmód), az egyenlő értékű opciók jogosak. */
const ABOUT_FORM = /egyszerűs|bővít|alak|formá|írásmód|felír|tizedes tört|közönséges tört|vegyes tört|vegyes szám/u;
/** Spec 2026-10-05-s3-katalogus-bank (mérve a szülő-ellenőrzött korpuszon): „Melyik NEM egyenlő 1/2-vel?” — itt az egyenértékű
 *  disztraktorok (2/4, 3/6, 4/8) SZÁNDÉKOSAK; az érték-egyezés nem hiba (a szó szerinti ismétlődés továbbra is az). */
const NEGATED_EQUALITY = /(?<!\p{L})nem\s+(?:egyenlő|egyenértékű|ugyanannyi|ugyanakkora|azonos értékű)/u;
/** Spec 2026-10-05-s3-katalogus-bank (mérve: „24/36 = ?” → 4/6 | 2/3 | 12/18 | „Mind helyes”): ha van gyűjtő-opció, az egyenértékű
 *  alakok SZÁNDÉKOSAK (épp az a kérdés, hogy mindegyik helyes-e). */
const AGGREGATE_OPTION = /^(?:mind(?:egyik|en|három|kettő|négy)?\s+(?:helyes|igaz|jó)|mindegyik|mindhárom|mindkettő|egyik sem)/u;

function duplicateProblems(prompt: string, options: readonly string[]): string[] {
  const problems: string[] = [];
  const byText = new Map<string, number>();
  const byValue = new Map<number, number>();
  const compareValues = !ABOUT_FORM.test(norm(prompt)) && !NEGATED_EQUALITY.test(norm(prompt)) && !options.some((o) => AGGREGATE_OPTION.test(norm(o)));
  options.forEach((option, i) => {
    const key = textKey(option);
    const value = compareValues ? numberOf(option) : null;
    const twin = byText.get(key) ?? (value === null ? undefined : byValue.get(value));
    if (twin !== undefined) problems.push(`a(z) ${listed(options, [twin, i])} opció ugyanazt jelenti — az opciók legyenek különbözők.`);
    if (!byText.has(key)) byText.set(key, i);
    if (value !== null && !byValue.has(value)) byValue.set(value, i);
  });
  return problems;
}

/** A pontosan-egy szabály egy kiszámolt teljesítő-listára. */
function exactlyOne(item: SingleChoiceItem, satisfying: number[], what: string): string[] {
  if (satisfying.length !== 1) {
    return [`${satisfying.length} opció ${what}${satisfying.length ? `: ${listed(item.options, satisfying)}` : ""} — pontosan egy helyes opció kell.`];
  }
  if (satisfying[0] !== item.correctIndex) {
    return [`a kulcs „${item.options[item.correctIndex]?.trim()}”, de csak „${item.options[satisfying[0]].trim()}” ${what}.`];
  }
  return [];
}

/** Oszthatóság: „Melyik szám osztható 9-cel?”, „Melyik szám NEM osztható 3-mal?”, „Válaszd ki a 4-gyel osztható számot!”. */
function divisibilityProblems(item: SingleChoiceItem): string[] {
  const p = norm(item.prompt);
  if ((p.match(/oszthat/g) ?? []).length !== 1) return [];
  if (!/(?<!\p{L})melyik(?!\p{L})|válaszd ki|jelöld|karikázd/u.test(p)) return [];
  // További feltétel vagy más kérdésfajta → nem biztosan kiszámolható (hallgat).
  if (/(?<![\p{L}\d])(?:hány|mennyi|ha|és|de|vagy|valamint|illetve|páros|páratlan|prím\p{L}*|négyzetszám|maradék\p{L}*|között)(?![\p{L}\d])|(?<!\p{L})leg\p{L}+|jegy/u.test(p)) return [];
  const m = p.match(/(\d+)\s*-\s*\p{L}{2,4}\s+(?:nem\s+)?oszthat|oszthat[óo]k?\s+(\d+)\s*-\s*\p{L}{2,4}(?!\p{L})/u);
  if (!m) return [];
  const divisor = Number(m[1] ?? m[2]);
  if (!Number.isSafeInteger(divisor) || divisor < 2) return [];
  const numbersInPrompt = p.match(/\d+/g) ?? [];
  if (numbersInPrompt.some((n) => Number(n) !== divisor)) return [];
  const values = item.options.map(integerOf);
  if (values.some((v) => v === null)) return [];
  // Review R3 (2026-09-29): a tagadás csak az állításhoz kötve érvényes („nem osztható”, „NEM 3-mal osztható”) —
  // egy szabad „Nem kell indokolni.” mondat nem fordítja meg a kérdést.
  const negated = /(?<!\p{L})nem\s+(?:\d+\s*-\s*\p{L}{2,4}\s+)?oszthat/u.test(p);
  const satisfying = values.flatMap((v, i) => ((v! % divisor === 0) !== negated ? [i] : []));
  const suffix = (m[0].match(/-\s*(\p{L}{2,4})/u) ?? [])[1] ?? "";
  return exactlyOne(item, satisfying, `${negated ? "NEM osztható" : "osztható"} ${divisor}-${suffix}`);
}

const LEAD = "(?:mennyi(?:\\s+(?:az?\\s+)?(?:eredménye|értéke))?|számold\\s+ki|számítsd\\s+ki)";
const ARITHMETIC = new RegExp(`^(?:${LEAD}\\s*:?\\s*)?(${EXPR})\\s*(?:=\\s*)?\\??\\s*$`, "iu");

/** Tiszta számtani kérdés: „Mennyi 12 · 3?”, „7 + 8 = ?”, „Számold ki: 3/4 + 1/4 =”. */
function arithmeticProblems(item: SingleChoiceItem): string[] {
  const m = item.prompt.normalize("NFC").trim().match(ARITHMETIC);
  // Egy magányos szám vagy tört nem számítási kérdés.
  if (!m || LONE_NUMBER.test(m[1].trim())) return [];
  const result = evaluateExpression(m[1]);
  if (result === null) return [];
  const values = item.options.map(numberOf);
  if (values.some((v) => v === null)) return [];
  const satisfying = values.flatMap((v, i) => (Math.abs(v! - result) < 1e-6 ? [i] : []));
  return exactlyOne(item, satisfying, `egyenlő a helyes eredménnyel (${m[1].trim()} = ${result})`);
}

/** Every provable violation of "exactly one option is true and it is the key"; [] when not computable. */
export function singleChoiceProblems(item: SingleChoiceItem): string[] {
  if (typeof item.prompt !== "string" || !Array.isArray(item.options) || !item.options.every((o) => typeof o === "string")) return [];
  const duplicates = duplicateProblems(item.prompt, item.options);
  if (duplicates.length) return duplicates.map((d) => `Egyválasztós tétel: ${d}`);
  return [...divisibilityProblems(item), ...arithmeticProblems(item)].map((d) => `Egyválasztós tétel: ${d}`);
}

type ChoiceLike = { id?: string; question?: string; prompt?: string; options?: unknown; correctIndex?: unknown };
export type SingleChoiceFinding = { path: string; id?: string; problems: string[] };

function asItem(raw: ChoiceLike, promptKey: "question" | "prompt"): SingleChoiceItem | null {
  const prompt = raw[promptKey];
  if (typeof prompt !== "string" || !Array.isArray(raw.options) || !Number.isInteger(raw.correctIndex)) return null;
  if (!raw.options.every((o): o is string => typeof o === "string")) return null;
  return { prompt, options: raw.options, correctIndex: raw.correctIndex as number };
}

/** A lecke minden egyválasztós tétele útvonallal: check blokkok, kvíz, választós módszerek. */
export function lessonSingleChoiceProblems(lesson: {
  sections?: ReadonlyArray<{ blocks: ReadonlyArray<{ kind?: string } & ChoiceLike> }>;
  experience?: { quiz?: ReadonlyArray<ChoiceLike>; methods?: ReadonlyArray<ChoiceLike> } | null;
}): SingleChoiceFinding[] {
  const found: SingleChoiceFinding[] = [];
  const add = (path: string, item: SingleChoiceItem | null, id?: string) => {
    const problems = item ? singleChoiceProblems(item) : [];
    if (problems.length) found.push({ path, ...(id ? { id } : {}), problems });
  };
  lesson.sections?.forEach((section, i) => section.blocks.forEach((block, j) => {
    if (block.kind === "check") add(`sections[${i}].blocks[${j}]`, asItem(block, "question"));
  }));
  lesson.experience?.quiz?.forEach((q, k) => add(`experience.quiz[${k}]`, asItem(q, "question"), q.id));
  lesson.experience?.methods?.forEach((m, k) => add(`experience.methods[${k}]`, asItem(m, "prompt"), m.id));
  return found;
}
