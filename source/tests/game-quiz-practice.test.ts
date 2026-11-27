import assert from "node:assert/strict";
import test from "node:test";

import { collectQuizBank, validateGeneratedQuizItems } from "../server/gameQuizValidation";
import { teachableQuizSource } from "../server/gameQuizSource";

/** TG-P5a (docs/specs/2026-11-27-tananyag-gyakorlati-p5a-vegrehajtas.md): a külön játékkvíz-generátor gyakorlatias szabálya. */

const item = (prompt: string, i = 0) => ({
  prompt,
  options: [`a${i}`, `b${i}`, `c${i}`, `d${i}`],
  correctIndex: 1,
  topic: "hungarian",
  explanation: "Rövid magyarázat a helyes válaszhoz.",
});
const META_SCORE = { ...item("Hány pontot ér a feladatlapon a 3. feladat?"), options: ["1 pont", "2 pont", "3 pont", "4 pont"] };
const META_TYPE = { ...item("Melyik feladattípus szerepel a feladatlapon?"), options: ["párosítás", "kiegészítés", "igaz-hamis", "esszé"] };
const IDIOM = { ...item("Egészítsd ki a szólást: Lassan járj, tovább ___!"), options: ["érsz", "futsz", "mész", "látsz"], correctIndex: 0 };
const practical = (n: number, from = 0) => Array.from({ length: n }, (_, i) => item(`Egészítsd ki a ${from + i + 1}. mondatot: A kutya ___ ugat.`, from + i));

test("TG-P5a: a meta-kérdés (pontozás, feladattípus) kiesik, tételes okkal; a szóláskiegészítés marad", () => {
  const { valid, skipped, rejected } = validateGeneratedQuizItems([META_SCORE, META_TYPE, IDIOM]);
  assert.deepEqual(valid.map((v) => v.prompt), [IDIOM.prompt]);
  assert.equal(skipped, 2);
  assert.equal(rejected.length, 2);
  assert.match(rejected[0], /^#1: .*feladatlap/u);
  assert.match(rejected[1], /^#2: .*feladatlap/u);
});

test("TG-P5a: a formai hiba is tételes okot kap", () => {
  const { rejected } = validateGeneratedQuizItems([{ ...IDIOM, options: ["a", "b"] }, "nem objektum"]);
  assert.equal(rejected.length, 2);
  assert.match(rejected[0], /^#1: /u);
  assert.match(rejected[1], /^#2: /u);
});

const PREAMBLE = Array.from({ length: 300 }, (_, i) => `<p>${i + 1}. feladat (2 pont). Összesen 20 pont. Időkeret: 45 perc.</p>`).join("");
const HTML = `<html><head><style>.x{color:red}</style><script>var menu = "Főoldal";</script></head><body>
<header>WEBSULI — Főoldal | Bejelentkezés</header><nav>Menü: Tananyagok Játékok</nav>
<h1>Szólások</h1>${PREAMBLE}
<h2>Példa</h2><p>Lassan járj, tovább érsz: aki megfontoltan halad, hamarabb célba ér.</p>
<p>Elfogadható: Budapest — 1 pont</p>
<h2>Késői fejezet</h2><p>A vak tyúk is talál szemet: a szerencse a kevésbé ügyesnek is kedvez néha.</p>
<footer>Minden jog fenntartva</footer></body></html>`;

test("TG-P5a: a kivonat a tanítható szöveget adja — a pontozási előszó, a menü és a fejléc kimarad, a késői fejezet is bekerül", () => {
  const src = teachableQuizSource(HTML, 2000);
  assert.ok(src, "van tanítható tartalom");
  assert.match(src.text, /Lassan járj, tovább érsz/u);
  assert.match(src.text, /A vak tyúk is talál szemet/u);
  assert.match(src.text, /Budapest/u, "a vegyes sor tanítható része marad");
  assert.doesNotMatch(src.text, /Időkeret|Összesen 20 pont|\d+\. feladat/u);
  assert.doesNotMatch(src.text, /Főoldal|Bejelentkezés|Menü|Minden jog|color:red/u);
  assert.ok(src.text.length <= 2000);
});

test("TG-P5a: a keret a fejezetek között oszlik el — hosszú első fejezet mellett a késői fejezet is helyet kap", () => {
  const long = `<h1>Első</h1>${Array.from({ length: 400 }, (_, i) => `<p>A ${i}. példamondat a kutyáról szól, amely hangosan ugat.</p>`).join("")}`;
  const src = teachableQuizSource(`${long}<h2>Második</h2><p>A macska dorombol, ha jól érzi magát a meleg kályha mellett.</p>`, 3000);
  assert.ok(src);
  assert.match(src.text, /A macska dorombol/u);
  assert.equal(src.sections, 2);
});

test("TG-P5a: csak fejlécből / pontozásból álló anyag → null (a modellhívás előtt megáll)", () => {
  const html = `<header>WEBSULI</header><nav>Menü</nav><h1>Feladatlap</h1>${PREAMBLE}<footer>©</footer>`;
  assert.equal(teachableQuizSource(html), null);
});

test("TG-P5a: hiányos első válasznál legfeljebb egy célzott pótlás, a pontos darabszámmal és az okokkal", async () => {
  for (const count of [3, 10, 20]) {
    const asks: Array<{ n: number; note: string }> = [];
    const bank = await collectQuizBank(count, async (n, note) => {
      asks.push({ n, note });
      return asks.length === 1 ? [...practical(count - 2), META_SCORE, META_TYPE] : practical(n, 100);
    });
    assert.equal(bank.complete, true, `${count}`);
    assert.equal(bank.items.length, count);
    assert.equal(asks.length, 2);
    assert.equal(asks[1].n, 2, "csak a hiányzó darab");
    assert.match(asks[1].note, /feladatlap/u, "a pótlás megkapja az elutasítás okát");
    assert.equal(validateGeneratedQuizItems(bank.items).rejected.length, 0, "nulla meta");
  }
});

test("TG-P5a: teljes első válasznál nincs pótlás; a többletet és az ismétlődő kérdést levágja", async () => {
  let calls = 0;
  const bank = await collectQuizBank(3, async () => { calls++; return [...practical(3), practical(1)[0], ...practical(2, 50)]; });
  assert.equal(calls, 1);
  assert.equal(bank.complete, true);
  assert.equal(bank.items.length, 3);
  assert.equal(new Set(bank.items.map((i) => i.prompt)).size, 3);
});

test("TG-P5a: 10 kért, 1 átment (a pótlás után is hiányos) → nem teljes, a régi készlet marad", async () => {
  let calls = 0;
  const bank = await collectQuizBank(10, async () => { calls++; return calls === 1 ? [IDIOM, ...Array(9).fill(META_SCORE)] : [META_TYPE]; });
  assert.equal(calls, 2, "legfeljebb egy pótlás");
  assert.equal(bank.complete, false);
  assert.equal(bank.items.length, 1);
  assert.ok(bank.rejected.length >= 10);
});

test("review #634: tartalomhiánynál a generate-quiz a munkafolyamat előtt, hibaüzenettel áll meg (nem 500)", async () => {
  const { generateMaterialQuiz } = await import("../server/gameQuizGeneratorService");
  const html = `<header>WEBSULI</header><h1>Feladatlap</h1>${PREAMBLE}`;
  const result = await generateMaterialQuiz("m1", 10, "owner", { materialExists: async () => true, materialContent: async () => html });
  assert.equal(result.inserted, 0);
  assert.match(result.errors.join(" "), /Elégtelen tanítható tartalom/u);
});

test("review #634: a számolós (főként számokból álló) anyag tanítható tartalom", () => {
  const src = teachableQuizSource(`<h1>Összeadás</h1><p>12 + 8 = 20</p><p>35 + 15 = 50</p><p>7 · 6 = 42</p><p>81 : 9 = 9</p><p>100 − 37 = 63</p><p>245 + 155 = 400</p><p>1200 − 450 = 750</p><p>36 · 12 = 432</p>`);
  assert.ok(src, "a számolós anyag nem minősül üresnek");
});

test("review #634: a csak szóközből álló opció érvénytelen (a játék úgyis eldobná)", () => {
  const { rejected } = validateGeneratedQuizItems([{ ...IDIOM, options: [" ", "futsz", "mész", "látsz"] }]);
  assert.equal(rejected.length, 1);
});
