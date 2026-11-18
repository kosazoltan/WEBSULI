import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { VocabWiringCase } from "./support/vocab-wiring-case";

/**
 * Szóbank-bekötés őr (terv A7, A8; végrehajtás S1/12. lépés és „vocab-game-wiring.test.ts”).
 * Esetenként a lap forrásán (kommentek nélkül, #183):
 *  - mindig: a kézi bank megmaradt;
 *  - `wired: true`: `useVocabQuizSource(` + `@/game-engine/vocab` import + `markExternal(`; a tananyag-ág a
 *    szóbank-hívás (`vocab….next(` / `vocab….buildPool(`) ELŐTT; a Szólétrán `buildPool(` és `markAsked(` is.
 */
const root = fileURLToPath(new URL("..", import.meta.url));
const casesDir = join(root, "tests", "vocab-wiring-cases");

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** A szóbank-forrás hívása: a változó neve „vocab”-bal kezdődik (pl. `vocab.next(`, `vocabRef.current?.next(`). */
const VOCAB_CALL = /\bvocab[\w.]*\??\.(?:next|buildPool)\(/;
const DEFAULT_MATERIAL_FIRST = /pickUnseenMaterial\(/;

export function wiringProblems(c: VocabWiringCase, pageSrc: string, materialSrc: string, ladder: boolean): string[] {
  const problems: string[] = [];
  const page = stripComments(pageSrc);
  if (!c.manualBank.test(page)) problems.push(`a kézi bank (${c.manualBank}) eltűnt a lapról`);
  if (!c.wired) return problems;
  if (!/useVocabQuizSource\(/.test(page)) problems.push("nincs useVocabQuizSource( hívás");
  if (!/from\s+["']@\/game-engine\/vocab["']/.test(page)) problems.push("nincs @/game-engine/vocab import");
  if (!/markExternal\(/.test(page)) problems.push("nincs markExternal( hívás (kézi kérdés helyes válasza a naplóba)");
  if (ladder) {
    if (!/buildPool\(/.test(page)) problems.push("Szólétra: nincs buildPool( hívás (A7)");
    if (!/markAsked\(/.test(page)) problems.push("Szólétra: nincs markAsked( hívás (A7)");
  }
  const material = stripComments(materialSrc);
  const mat = (c.materialFirst ?? DEFAULT_MATERIAL_FIRST).exec(material);
  const call = VOCAB_CALL.exec(material);
  if (!mat) problems.push(`a tananyag-ág (${c.materialFirst ?? DEFAULT_MATERIAL_FIRST}) nem található`);
  if (!call) problems.push("a szóbank-hívás (vocab….next( / vocab….buildPool() nem található a sorrend-fájlban");
  if (mat && call && mat.index > call.index) problems.push("a szóbank-hívás a tananyag-ág ELŐTT áll (A8: tananyag-elsőbbség)");
  return problems;
}

async function loadCases(): Promise<Array<{ file: string; c: VocabWiringCase }>> {
  const files = readdirSync(casesDir).filter(f => f.endsWith(".ts")).sort();
  const out: Array<{ file: string; c: VocabWiringCase }> = [];
  for (const file of files) {
    const mod = (await import(pathToFileURL(join(casesDir, file)).href)) as { CASE?: VocabWiringCase };
    assert.ok(mod.CASE, `${file}: nincs CASE export`);
    out.push({ file, c: mod.CASE });
  }
  return out;
}

test("a hat nyelvi játék esetfájlja megvan", async () => {
  const cases = await loadCases();
  assert.deepEqual(cases.map(x => x.file), [
    "block-craft-quiz.ts", "brain-rot-steal.ts", "space-asteroid-quiz.ts", "tornado-hunter-200.ts", "tsunami-english.ts", "word-ladder-hu-en.ts",
  ]);
});

test("szóbank-bekötés őr: minden esetfájl a lap valós forrásán (A7, A8)", async () => {
  for (const { file, c } of await loadCases()) {
    const pageSrc = readFileSync(join(root, "client", "src", "pages", c.page), "utf8");
    const materialSrc = c.materialFirstFile ? readFileSync(join(root, "client", "src", c.materialFirstFile), "utf8") : pageSrc;
    assert.deepEqual(wiringProblems(c, pageSrc, materialSrc, file === "word-ladder-hu-en.ts"), [], `${file} (${c.page}, wired=${c.wired})`);
  }
});

test("az őr maga: bekötött lapon a hiányokat és a rossz sorrendet jelzi", () => {
  const c: VocabWiringCase = { page: "X.tsx", wired: true, manualBank: /QUIZ_BANK\b/ };
  const good = [
    'import { useVocabQuizSource, vocabLevelForGrade } from "@/game-engine/vocab";',
    "const QUIZ_BANK = [];",
    "const vocab = useVocabQuizSource(\"en\");",
    "const material = pickUnseenMaterial(items, seen);",
    "const q = material ?? vocab?.next(vocabLevelForGrade(grade, band)) ?? pick(QUIZ_BANK);",
    "vocab?.markExternal(q.options[q.correctIndex]);",
  ].join("\n");
  assert.deepEqual(wiringProblems(c, good, good, false), []);
  // Rossz sorrend: a szóbank a tananyag előtt.
  const wrongOrder = good.replace("const material = pickUnseenMaterial(items, seen);\n", "") + "\nconst m = pickUnseenMaterial(items, seen);";
  assert.ok(wiringProblems(c, wrongOrder, wrongOrder, false).some(p => p.includes("ELŐTT")));
  // Kommentben álló hívás nem számít.
  const commented = good.replace("vocab?.markExternal(q.options[q.correctIndex]);", "// vocab?.markExternal(x);");
  assert.ok(wiringProblems(c, commented, commented, false).some(p => p.includes("markExternal")));
  // Eltűnt kézi bank.
  const noBank = good.replace(/QUIZ_BANK/g, "OTHER");
  assert.ok(wiringProblems(c, noBank, noBank, false).some(p => p.includes("kézi bank")));
  // Szólétra: buildPool + markAsked kell.
  assert.ok(wiringProblems(c, good, good, true).some(p => p.includes("buildPool")));
  const ladder = `${good}\nconst pool = vocabSource.buildPool(tier, 40);\nvocabSource.markAsked(item);`;
  assert.deepEqual(wiringProblems(c, ladder, ladder, true), []);
});
