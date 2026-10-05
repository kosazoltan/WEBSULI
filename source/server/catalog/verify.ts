import { singleChoiceProblems } from "../../shared/single-choice-check";
import { evaluateExpression } from "../../shared/arithmetic-expression";
import { falseArithmeticClaims } from "../studio/tools/arithmetic-claims";
import type { CatalogItemDraft } from "./catalog-item";

/**
 * Spec 2026-10-05-s3-katalogus-bank: a katalógus-tétel DETERMINISZTIKUS ellenőrzése a meglévő őrökkel (egy-helyes-válasz,
 * hamis egyenlőség, szerkezet). Tulajdonosi döntés: a szülő-ellenőrzött anyagon ez JELÖL, nem dob ki — a jelölt tétel
 * admin-átnézésig szó szerint nem vehető át. Csak a biztosan kiszámolható esetben szól; a többi tartalomról hallgat.
 */
export type VerifyResult = { ok: boolean; problems: string[] };

const norm = (s: string) => s.normalize("NFC").toLocaleLowerCase("hu").replace(/\s+/g, " ").trim();

/** Tiszta számtani kérdés („840 + 40 = ?”, „96 : 11 = ? (hányados)” nélkül) értéke; különben null. */
function pureArithmeticValue(prompt: string): number | null {
  const m = prompt.replace(/🔢|✏️?/gu, "").match(/^\s*(?:Számold ki:?\s*)?([\d\s+\-−–·×*:÷/().,]+?)\s*=\s*\?\s*$/u);
  return m ? evaluateExpression(m[1].trim()) : null;
}
const numberOf = (s: string): number | null => {
  const t = s.trim().replace(/\s+/g, "").replace(",", ".");
  return /^[+-−–]?\d+(?:\.\d+)?$/.test(t) ? Number(t.replace(/[−–]/, "-")) : null;
};

export function verifyItem(item: CatalogItemDraft): VerifyResult {
  const problems: string[] = [];
  if (item.kind === "quiz") {
    const options = item.options ?? [];
    if (typeof item.correctIndex !== "number" || item.correctIndex < 0 || item.correctIndex >= options.length) problems.push("a helyes kulcs nem a válaszlehetőségek egyikére mutat");
    if (new Set(options.map(norm)).size !== options.length) problems.push("ismétlődő válaszlehetőség");
    if (typeof item.correctIndex === "number" && item.correctIndex >= 0 && item.correctIndex < options.length) {
      problems.push(...singleChoiceProblems({ prompt: item.prompt, options, correctIndex: item.correctIndex }));
    }
  }
  if (item.kind === "short_answer") {
    const expected = pureArithmeticValue(item.prompt);
    const values = (item.accepted ?? []).map(numberOf).filter((v): v is number => v !== null);
    if (expected !== null && values.length && !values.some((v) => Math.abs(v - expected) < 1e-9)) problems.push(`a kiszámolt érték (${expected}) nincs az elfogadott válaszok közt`);
  }
  // hamis egyenlőség bármely szövegben (kérdés, helyes opció, minta/magyarázat, lépések)
  // A „Melyik állítás HAMIS?” típusú kérdés kulcsa SZÁNDÉKOSAN hamis állítás — azt nem ellenőrizzük (mért: „1/3 = 0.5” kulcs).
  const asksForFalse = /(?<!\p{L})(?:hamis|nem igaz|téves|helytelen|rossz|hibás)(?!\p{L})/iu.test(item.prompt);
  const texts = [item.prompt, item.body ?? "", ...(item.steps ?? []), ...(item.kind === "quiz" && typeof item.correctIndex === "number" && !asksForFalse ? [item.options?.[item.correctIndex] ?? ""] : [])];
  // Soronként: a HTML-ből kinyert szövegben a sor a vizuális egység; a sorokon átnyúló „egyenlőség” a markup terméke (mérve: egymás
  // alá írt tört „4⏎8⏎=⏎1⏎2”, két levezetés-sor összeolvadása) — nem állítás.
  for (const t of texts) for (const line of t.split(/\r?\n/)) for (const bad of falseArithmeticClaims(line)) problems.push(`hamis egyenlőség: ${bad}`);
  return { ok: problems.length === 0, problems: [...new Set(problems)] };
}
