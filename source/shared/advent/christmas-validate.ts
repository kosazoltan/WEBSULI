/**
 * Adventi naptár — a karácsonyi kérdéskészlet gépi validátora (docs/specs/2026-11-18-adventi-naptar.md 12.2, 16.4; A33).
 * Tiszta függvény: a hibák listáját adja vissza (üres lista = rendben). A tényszerűséget NEM tudja ellenőrizni — azt a
 * független ellenőr tételenkénti tényellenőrzése végzi.
 */
import { normalizePrompt, type ChristmasItem } from "./assignment";
import { ADVENT_DOORS, ADVENT_CHRISTMAS_DAYS, ADVENT_MAX_GRADE, ADVENT_MIN_GRADE, isLowGrade, limitsForGrade } from "./rules";

/** Az 1–2. évfolyamra érvényes kérdés legfeljebb ennyi karakter (kezdő olvasók). */
export const LOW_GRADE_PROMPT_MAX = 80;
export const EXPLANATION_MIN = 30;
export const EXPLANATION_MAX = 300;
/** A helyes válasz egyik helyen sem állhat a tételek ennél nagyobb hányadában. */
export const CORRECT_INDEX_MAX_SHARE = 0.4;

/** Hány érvényes tétel kell az évfolyamnak: karácsonyi ablakok × (1 + javítások) × körök. */
export function christmasItemsNeeded(grade: number): number {
  const { maxRepairs, maxRounds } = limitsForGrade(grade);
  const doors = isLowGrade(grade) ? ADVENT_DOORS : ADVENT_CHRISTMAS_DAYS.length;
  return doors * (1 + maxRepairs) * maxRounds;
}

/** Ékezet- és írásjel-független szóalak; a legalább 4 betűs szavak számítanak (a toldalék miatt a szó eleje dönt). */
function contentWords(text: string): string[] {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").split(" ")
    .filter((w) => w.length >= 4);
}

/**
 * A-5 (#151): válasz-szivárgás a témacsaládon belül. Egy tag helyes válaszának bármely tartalmi szava (szótő: a szó eleje, a
 * toldalék nélkül, legalább 4 betű) nem állhat egy MÁSIK tag kérdésében, és két tag helyes válasza nem lehet azonos.
 */
export function christmasAnswerLeaks(items: readonly ChristmasItem[]): string[] {
  const errors: string[] = [];
  const families = new Map<string, ChristmasItem[]>();
  for (const item of items) if (item.family) families.set(item.family, [...(families.get(item.family) ?? []), item]);
  for (const [family, members] of families) {
    for (const a of members) {
      const answer = String(a.options[a.correctIndex] ?? "");
      const stems = contentWords(answer).map((w) => w.slice(0, Math.max(4, w.length - 2)));
      for (const b of members) {
        if (a === b) continue;
        if (normalizePrompt(answer) === normalizePrompt(String(b.options[b.correctIndex] ?? ""))) {
          if (a.id < b.id) errors.push(`${a.id} és ${b.id} (${family}): azonos a helyes válasz („${answer}”)`);
          continue;
        }
        const words = contentWords(b.prompt);
        const leak = stems.find((stem) => words.some((w) => w.startsWith(stem)));
        if (leak) errors.push(`${a.id} (${family}): a helyes válasz („${answer}”) a(z) ${b.id} kérdésében áll`);
      }
    }
  }
  return errors;
}

export function validateChristmasBank(items: readonly ChristmasItem[], gradeBankPrompts: Iterable<string> = []): string[] {
  const errors: string[] = [...christmasAnswerLeaks(items)];
  const ids = new Set<string>();
  const prompts = new Map<string, string>();
  const foreign = new Set([...gradeBankPrompts].map(normalizePrompt));
  const places = [0, 0, 0, 0];
  for (const item of items) {
    const at = item.id || "(azonosító nélkül)";
    if (!/^xmas-\d{3}$/.test(item.id)) errors.push(`${at}: az azonosító alakja xmas-NNN`);
    if (ids.has(item.id)) errors.push(`${at}: ismétlődő azonosító`);
    ids.add(item.id);
    const prompt = normalizePrompt(item.prompt ?? "");
    if (prompt.length < 8) errors.push(`${at}: túl rövid kérdés`);
    if (prompts.has(prompt)) errors.push(`${at}: azonos kérdés, mint ${prompts.get(prompt)}`);
    prompts.set(prompt, at);
    if (foreign.has(prompt)) errors.push(`${at}: a kérdés a közös évfolyam-bankban is szerepel`);
    if (!Number.isInteger(item.minGrade) || !Number.isInteger(item.maxGrade) || item.minGrade < ADVENT_MIN_GRADE || item.maxGrade > ADVENT_MAX_GRADE || item.minGrade > item.maxGrade) {
      errors.push(`${at}: érvénytelen évfolyamsáv (${item.minGrade}–${item.maxGrade})`);
    } else if (item.minGrade <= 2 && item.prompt.length > LOW_GRADE_PROMPT_MAX) {
      errors.push(`${at}: az 1–2. évfolyamra érvényes kérdés legfeljebb ${LOW_GRADE_PROMPT_MAX} karakter (${item.prompt.length})`);
    }
    const options = Array.isArray(item.options) ? item.options : [];
    if (options.length !== 4) errors.push(`${at}: pontosan 4 válasz kell`);
    if (options.some((o) => typeof o !== "string" || !o.trim())) errors.push(`${at}: üres válasz`);
    if (new Set(options.map((o) => normalizePrompt(String(o)))).size !== options.length) errors.push(`${at}: ismétlődő válasz`);
    if (!Number.isInteger(item.correctIndex) || item.correctIndex < 0 || item.correctIndex > 3) errors.push(`${at}: a helyes válasz indexe 0–3`);
    else places[item.correctIndex]!++;
    const explanation = (item.explanation ?? "").trim();
    if (explanation.length < EXPLANATION_MIN || explanation.length > EXPLANATION_MAX) {
      errors.push(`${at}: a magyarázat ${EXPLANATION_MIN}–${EXPLANATION_MAX} karakter legyen (${explanation.length})`);
    }
    if (/[|\t]/.test(`${item.prompt}${options.join("")}${explanation}`)) errors.push(`${at}: tiltott karakter (| vagy tabulátor)`);
  }
  for (let grade = ADVENT_MIN_GRADE; grade <= ADVENT_MAX_GRADE; grade++) {
    const have = items.filter((c) => c.minGrade <= grade && grade <= c.maxGrade).length;
    const need = christmasItemsNeeded(grade);
    if (have < need) errors.push(`${grade}. évfolyam: ${have} érvényes tétel van, ${need} kell`);
  }
  if (items.length > 0) {
    places.forEach((count, index) => {
      if (count / items.length > CORRECT_INDEX_MAX_SHARE) errors.push(`a helyes válasz túl gyakran áll a(z) ${index + 1}. helyen (${count} / ${items.length})`);
    });
  }
  return errors;
}

/** E fölött figyelmeztetünk: a helyes válasz ilyen arányban a (szigorúan) leghosszabb a négy közül (véletlenül 25% lenne). */
export const LONGEST_CORRECT_WARN_SHARE = 0.3;

/** Azok a tételek, amelyekben a helyes válasz szigorúan hosszabb mind a három rossznál. */
export function longestCorrectItems(items: readonly ChristmasItem[]): ChristmasItem[] {
  return items.filter((item) => {
    const correct = item.options[item.correctIndex]?.length ?? 0;
    return item.options.every((option, index) => index === item.correctIndex || option.length < correct);
  });
}

/**
 * Figyelmeztetések (nem hibák): ha a helyes válasz feltűnően gyakran a leghosszabb, a gyerek a hosszból is kitalálhatja.
 * Sávonként (a tétel alsó évfolyama szerint: 1–4., 5–8., 9–12.) számol.
 */
export function christmasBankWarnings(items: readonly ChristmasItem[]): string[] {
  const bands: Array<[string, (item: ChristmasItem) => boolean]> = [
    ["1–4. évfolyam", (item) => item.minGrade <= 4],
    ["5–8. évfolyam", (item) => item.minGrade >= 5 && item.minGrade <= 8],
    ["9–12. évfolyam", (item) => item.minGrade >= 9],
  ];
  const warnings: string[] = [];
  for (const [name, inBand] of bands) {
    const band = items.filter(inBand);
    if (band.length === 0) continue;
    const longest = longestCorrectItems(band).length;
    if (longest / band.length > LONGEST_CORRECT_WARN_SHARE) {
      warnings.push(`${name}: a helyes válasz ${longest} / ${band.length} tételben a leghosszabb (${Math.round((100 * longest) / band.length)}%, a küszöb ${Math.round(100 * LONGEST_CORRECT_WARN_SHARE)}%)`);
    }
  }
  return warnings;
}
