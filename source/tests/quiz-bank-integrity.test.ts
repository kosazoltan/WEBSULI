import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * G-14 — a kvíz-tételek SZERKEZETI épsége.
 *
 * A magyarázatok írása közben (2026-09-07) derült ki, hogy a beégetett bankokban
 * olyan tételek is vannak, amelyek a helyes válaszért is büntethetik a gyereket:
 * két azonos opció, két egyaránt helyes opció, vagy olyan opció, amelyik zárójelben
 * elárulja a megoldást („játszanak (helyes)").
 *
 * Ez rosszabb, mint a hiányzó magyarázat: a gyerek jól gondolkodik, és a játék
 * mégis elveszi az életét. Egy ilyen kérdés bizalmat rombol, nem tanít.
 *
 * A teszt forrásból méri a lapokba és adatfájlokba égetett bankokat — ezek
 * React-lapok, node-tesztből nem importálhatók.
 */

const FILES = [
  "client/src/pages/BrainRotSteal.tsx",
  "client/src/pages/BlockCraftQuiz.tsx",
  "client/src/pages/SpaceAsteroidQuiz.tsx",
  "client/src/pages/WordLadderHuEn.tsx",
  "client/src/data/englishGameQuizExtras.ts",
  "client/src/data/tsunamiSubjectQuizBanks.ts",
];

type Item = { file: string; line: number; prompt: string; options: string[]; correctIndex: number };

/** Egy sorban álló `{ ... prompt: "…", options: [...], correctIndex: n ... }` tételek. */
function collect(file: string): Item[] {
  const path = fileURLToPath(new URL(`../${file}`, import.meta.url));
  const out: Item[] = [];

  readFileSync(path, "utf8").split("\n").forEach((raw, i) => {
    if (!/options:\s*\[/.test(raw) || !/correctIndex:\s*\d/.test(raw)) return;

    const optionsRaw = /options:\s*\[([^\]]*)\]/.exec(raw)?.[1] ?? "";
    const options = [...optionsRaw.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) =>
      m[1]!.replace(/\\"/g, '"'),
    );
    if (options.length < 2) return;

    out.push({
      file,
      line: i + 1,
      prompt: (/prompt:\s*"((?:[^"\\]|\\.)*)"/.exec(raw)?.[1] ?? "").replace(/\\"/g, '"'),
      options,
      correctIndex: Number(/correctIndex:\s*(\d+)/.exec(raw)![1]),
    });
  });

  return out;
}

const ITEMS = FILES.flatMap(collect);
const where = (q: Item) => `${q.file}:${q.line} „${q.prompt}"`;

test("van mit mérni: a bankok tételei megtalálhatók", () => {
  assert.ok(ITEMS.length >= 400, `csak ${ITEMS.length} tétel — a minta elavult`);
});

test("a helyes index a válaszok között van", () => {
  const bad = ITEMS.filter((q) => q.correctIndex >= q.options.length).map(where);
  assert.deepEqual(bad, [], `a helyes index a tömbön kívülre mutat:\n${bad.join("\n")}`);
});

test("egy tételen belül nincs két azonos válasz", () => {
  // Élesben mért eset: a „A gyerekek ___ a parkban." kérdésnél a „játszanak"
  // KÉTSZER szerepelt — a gyerek a jó szót választva is hibázhatott.
  const bad = ITEMS.filter((q) => {
    const seen = q.options.map((o) => o.trim().toLowerCase());
    return new Set(seen).size !== seen.length;
  }).map((q) => `${where(q)} → ${q.options.join(" | ")}`);

  assert.deepEqual(bad, [], `azonos válaszlehetőségek:\n${bad.join("\n")}`);
});

test("egyik válasz sem árulja el zárójelben a megoldást", () => {
  const LEAK = /\((helyes|jó|ez a jó|megoldás|correct)\)/i;
  const bad = ITEMS.filter((q) => q.options.some((o) => LEAK.test(o))).map(
    (q) => `${where(q)} → ${q.options.join(" | ")}`,
  );

  assert.deepEqual(bad, [], `a válasz elárulja magát:\n${bad.join("\n")}`);
});

test("nincs üres vagy csupa szóköz válaszlehetőség", () => {
  const bad = ITEMS.filter((q) => q.options.some((o) => o.trim().length === 0)).map(where);
  assert.deepEqual(bad, [], `üres válasz:\n${bad.join("\n")}`);
});

/* -------------------- számolható tételek: a válasz stimmel-e -------------------- */

/** `a + b`, `a - b`, `a x b`, `a / b` alakú kérdések tényleges eredménye. */
function arithmeticAnswer(prompt: string): number | null {
  const m = /(-?\d+)\s*([+\-x*×/:])\s*(-?\d+)\s*=/.exec(prompt);
  if (!m) return null;
  const [a, op, b] = [Number(m[1]), m[2]!, Number(m[3])];
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "x" || op === "*" || op === "×") return a * b;
  return b === 0 ? null : a / b;
}

/** Angol számnevek — a BlockCraft „english-math" tételei szóval írják a választ. */
const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

/**
 * A megjelölt válasz számértéke, vagy `null`, ha nem szám.
 *
 * Az első próbám itt hibázott: a „five" szóból a nem-számjegyek kiszűrése üres
 * sztringet adott, a `Number("")` pedig NULLA — így hat HELYES tétel bukott meg
 * hamis riasztással. Ezért a számjegyes ág csak akkor fut, ha van benne számjegy.
 */
function numericValue(option: string): number | null {
  const word = NUMBER_WORDS[option.trim().toLowerCase()];
  if (word !== undefined) return word;

  if (!/\d/.test(option)) return null;
  const cleaned = option.replace(",", ".").replace(/[^\d.-]/g, "");
  const value = Number(cleaned);
  return cleaned.length > 0 && Number.isFinite(value) ? value : null;
}

test("a számolós kérdések helyes válasza tényleg a helyes eredmény", () => {
  const bad: string[] = [];
  let checked = 0;

  for (const q of ITEMS) {
    const expected = arithmeticAnswer(q.prompt);
    if (expected === null) continue;
    const marked = numericValue(q.options[q.correctIndex] ?? "");
    if (marked === null) continue;
    checked += 1;
    if (Math.abs(marked - expected) > 1e-9) {
      bad.push(`${where(q)} → megjelölve ${marked}, valójában ${expected}`);
    }
  }

  // Mérve 2026-09-07: 19 tétel számolható ki a promptból. Ha ez nullára esik,
  // a minta romlott el, nem a bankok javultak meg.
  assert.ok(checked >= 15, `csak ${checked} tételt sikerült kiszámolni — a minta elavult`);
  assert.deepEqual(bad, [], `rossz eredmény van helyesnek jelölve:\n${bad.join("\n")}`);
});

test("az önellenőrzés: a szóval írt számot is felismeri", () => {
  assert.equal(numericValue("five"), 5);
  assert.equal(numericValue("eleven"), 11);
  assert.equal(numericValue("16 cm²"), 16);
  assert.equal(numericValue("0,75"), 0.75);
  assert.equal(numericValue("kutya"), null, "szóból nem lehet nulla — ez volt az első hibám");
});
