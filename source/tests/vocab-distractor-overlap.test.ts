import assert from "node:assert/strict";
import test from "node:test";
import type { VocabEntry, VocabLang, VocabQuestionType } from "../client/src/game-engine/vocab";
import {
  findTermInExample,
  generateVocabQuestion,
  meaningKeys,
  meaningsOverlap,
  termKey,
} from "../client/src/game-engine/vocab/questionGenerator";
import { VOCAB_EN } from "../client/src/data/vocabBank/vocab-en";
import { VOCAB_DE } from "../client/src/data/vocabBank/vocab-de";
import { VOCAB_FR } from "../client/src/data/vocabBank/vocab-fr";
import { overlapPairs, reportLines } from "../scripts/vocab-bank";
import { makeSyntheticBank, seededRng } from "./support/vocab-fixture";

/**
 * Jelentés-átfedés szabály (terv 4.3: „a rossz válasz nem lehet a helyes válasz szinonimája”; végrehajtás K.7.2/a,
 * S1 utójavítás 2026-11-16; a #427, #428, #431 review-jaiban reprodukált esetek).
 */
const TYPES: VocabQuestionType[] = ["hu-to-target", "target-to-hu", "cloze", "phrase-meaning"];

function optionOf(e: VocabEntry, type: VocabQuestionType): string {
  return type === "target-to-hu" ? e.hu : type === "phrase-meaning" ? e.exampleHu : e.term;
}

function applicable(e: VocabEntry, type: VocabQuestionType): boolean {
  if (type === "cloze") return findTermInExample(e) !== null;
  if (type === "phrase-meaning") return e.kind === "phrase" && e.level >= 2;
  return true;
}

test("meaningKeys: zárójel ki, darabolás , ; / mentén, kisbetű, szóköz-összevonás, szélső írásjelek le", () => {
  const cases: Array<[string, string[]]> = [
    ["dzseki, bomberdzseki", ["dzseki", "bomberdzseki"]],
    ["mennyibe kerül ez?", ["mennyibe kerül ez"]],
    ["óra (időegység)", ["óra"]],
    ["sok (valamiből)", ["sok"]],
    ["Ideges;  felbosszantott", ["ideges", "felbosszantott"]],
    ["motyog / mormol", ["motyog", "mormol"]],
    ["„Szia!”", ["szia"]],
    ["Hogy vagy…", ["hogy vagy"]],
    ["'kész.'", ["kész"]],
    ["ige idő", ["ige idő"]],
    ["a, , b", ["a", "b"]],
    ["dzseki, dzseki", ["dzseki"]],
    // Csupa zárójel: a teljes szöveg az egyetlen kulcs (különben a bejegyzésnek nem lenne összevethető jelentése).
    ["(köszönés)", ["(köszönés)"]],
    ["", []],
  ];
  for (const [hu, expected] of cases) assert.deepEqual(meaningKeys(hu), expected, hu);
});

test("meaningsOverlap: csak teljes kulcs-egyezés; a zárójeles pontosítás nem véd (dokumentált szándék)", () => {
  const cases: Array<[string, string, boolean]> = [
    ["dzseki, bomberdzseki", "dzseki", true],
    ["ideges, felbosszantott", "ideges", true],
    ["motyog, mormol", "mormol", true],
    ["mennyibe kerül ez?", "mennyibe kerül ez", true],
    ["Óra (időegység)", "óra", true],
    // „sok (valamiből)” → [„sok”]: ÁTFED a „sok”-kal — a zárójel csak pontosítás, a tanuló számára ugyanaz a válasz.
    ["sok (valamiből)", "sok", true],
    // Negatív esetek: részszó / szóelem nem egyezés.
    ["ág", "világ", false],
    ["arc", "arcfesték", false],
    ["ideges", "idegen", false],
    ["meglepett", "aggódó, gondterhelt", false],
    ["kutya", "", false],
  ];
  for (const [a, b, expected] of cases) {
    assert.equal(meaningsOverlap(a, b), expected, `${a} ↔ ${b}`);
    assert.equal(meaningsOverlap(b, a), expected, `${b} ↔ ${a} (szimmetrikus)`);
  }
});

test("termKey: kisbetű + szélső írásjelek le („How old are you?” = „how old are you”)", () => {
  assert.equal(termKey("How old are you?"), termKey("how old are you"));
  assert.equal(termKey("  Der Hund! "), "der hund");
  assert.equal(termKey("aujourd'hui"), "aujourd'hui", "a belső aposztróf marad");
  assert.notEqual(termKey("der Hund"), termKey("Hund"), "a névelő nélküli alakot nem veti össze");
});

/** Kitöltő bejegyzések az adott nyelven (szintetikus, „jelentés L-i” hu-val — egymással nem fednek át). */
function filler(lang: VocabLang, level: number, seed: number): VocabEntry[] {
  const perLevel = [0, 0, 0, 0, 0];
  perLevel[level] = 30;
  return makeSyntheticBank(lang, perLevel, seed);
}

type Scenario = { name: string; lang: VocabLang; pairs: Array<[VocabEntry, VocabEntry]>; bank: VocabEntry[] };

function word(id: string, term: string, hu: string, example: string, exampleHu: string, pos: VocabEntry["pos"] = "adj"): VocabEntry {
  const level = Number(id.charAt(2)) as VocabEntry["level"];
  const topic = id.split("-")[1] as VocabEntry["topic"];
  return { id, term, hu, kind: pos === "phrase" ? "phrase" : "word", level, topic, pos, example, exampleHu };
}

const blouson = word("fr1-clothes-901", "le blouson", "dzseki, bomberdzseki", "Il porte le blouson noir.", "A fekete dzsekit hordja.", "noun");
const veste = word("fr1-clothes-902", "la veste", "dzseki", "La veste est chaude.", "A dzseki meleg.", "noun");
const enerve = word("fr2-feelings-901", "énervé", "ideges, felbosszantott", "Mon frère est énervé ce soir.", "A bátyám ma este ideges.");
const nerveux = word("fr2-feelings-902", "nerveux", "ideges", "Je suis nerveux avant le test.", "Ideges vagyok a dolgozat előtt.");
const surpris = word("fr2-feelings-903", "surpris", "meglepett", "Il est très surpris.", "Nagyon meglepett.");
const etonne = word("fr2-feelings-904", "étonné", "meglepett, csodálkozó", "Il est étonné par la nouvelle.", "Meglepi a hír.");
const inquiet = word("fr2-feelings-905", "inquiet", "aggódó", "Mon père est inquiet pour moi.", "Apám aggódik értem.");
const soucieux = word("fr2-feelings-906", "soucieux", "aggódó, gondterhelt", "Le prof semble soucieux aujourd'hui.", "A tanár ma gondterheltnek tűnik.");
const mumble = word("en2-communication-901", "mumble", "motyog, mormol", "Please do not mumble in class.", "Kérlek, ne motyogj az órán!", "verb");
const murmur = word("en2-communication-902", "murmur", "mormol", "They murmur a quiet song.", "Halk dalt mormolnak.", "verb");
const mutter = word("en2-communication-903", "mutter", "motyog", "He began to mutter something.", "Valamit motyogni kezdett.", "verb");
const wasKostet = word("de2-shopping-901", "was kostet das", "mennyibe kerül ez?", "Entschuldigung, was kostet das?", "Elnézést, mennyibe kerül ez a táska?", "phrase");
const wieViel = word("de2-shopping-902", "wie viel kostet das", "mennyibe kerül ez", "Sag mir, wie viel kostet das?", "Mondd meg, mennyibe kerül ez a kabát?", "phrase");

const SCENARIOS: Scenario[] = [
  { name: "blouson/dzseki (#428)", lang: "fr", pairs: [[blouson, veste]], bank: [blouson, veste, ...filler("fr", 1, 31)] },
  {
    name: "ideges/felbosszantott, meglepett, aggódó (#428)", lang: "fr",
    pairs: [[enerve, nerveux], [surpris, etonne], [inquiet, soucieux]],
    bank: [enerve, nerveux, surpris, etonne, inquiet, soucieux, ...filler("fr", 2, 32)],
  },
  { name: "motyog/mormol (#431)", lang: "en", pairs: [[mumble, murmur], [mumble, mutter]], bank: [mumble, murmur, mutter, ...filler("en", 2, 33)] },
  { name: "árkérdés kérdőjellel / anélkül (#427)", lang: "de", pairs: [[wasKostet, wieViel]], bank: [wasKostet, wieViel, ...filler("de", 2, 34)] },
];

test("a négy review-forgatókönyv: 500 seeden egyszer sem kerül a szinonima az opciók közé (minden alkalmazható típusnál, mindkét irányban)", () => {
  for (const sc of SCENARIOS) {
    let asked = 0;
    for (const [x, y] of sc.pairs) {
      assert.equal(meaningsOverlap(x.hu, y.hu), true, `${sc.name}: a pár valóban átfed`);
      for (const [target, synonym] of [[x, y], [y, x]] as const) {
        for (const type of TYPES) {
          if (!applicable(target, type)) continue;
          for (let seed = 1; seed <= 500; seed++) {
            const q = generateVocabQuestion(target, sc.bank, type, seededRng(seed));
            assert.ok(q, `${sc.name}: ${target.id} ${type} seed ${seed}: null`);
            asked++;
            assert.ok(!q.options.includes(optionOf(synonym, type)), `${sc.name}: ${target.id} ${type} seed ${seed}: a szinonima (${synonym.id}) opció lett`);
            assertOptionInvariant(q.options, q.correctIndex, target, type, sc.bank);
          }
        }
      }
    }
    assert.ok(asked >= 500 * 2 * 3, `${sc.name}: legalább 3 típus × 2 irány × 500 kérdés (${asked})`);
  }
});

test("a csak záró írásjelben eltérő term-ek nem lehetnek egy kérdés opciói", () => {
  const howOld = word("en1-communication-901", "How old are you?", "hány éves vagy", "Tom, how old are you?", "Tom, hány éves vagy?", "phrase");
  const howOld2 = word("en1-communication-902", "how old are you", "mennyi idős vagy", "Grandma, how old are you?", "Nagyi, mennyi idős vagy?", "phrase");
  const bank = [howOld, howOld2, ...filler("en", 1, 41)];
  for (let seed = 1; seed <= 300; seed++) {
    const q = generateVocabQuestion(howOld, bank, "hu-to-target", seededRng(seed));
    assert.ok(q);
    assert.ok(!q.options.includes(howOld2.term), `seed ${seed}`);
  }
});

/**
 * Bank-szintű invariáns: a 4 opció bejegyzéseinek jelentés-kulcsai páronként diszjunktak, a `termKey`-ek különbözők.
 * Az opció-szövegből a bejegyzést a bank adja vissza (a term a validátor szerint nyelven belül egyedi; azonos hu /
 * exampleHu esetén az első, a többivel konzisztens jelölt).
 */
const optionIndexCache = new WeakMap<readonly VocabEntry[], Map<VocabQuestionType, Map<string, VocabEntry[]>>>();
/** Opció-szöveg → bejegyzések (bankonként és típusonként egyszer; a teljes bankon a lineáris keresés lassú volna). */
function optionIndex(bank: readonly VocabEntry[], type: VocabQuestionType): Map<string, VocabEntry[]> {
  let byType = optionIndexCache.get(bank);
  if (!byType) { byType = new Map(); optionIndexCache.set(bank, byType); }
  let index = byType.get(type);
  if (!index) {
    index = new Map();
    for (const e of bank) {
      const k = optionOf(e, type);
      const list = index.get(k);
      if (list) list.push(e); else index.set(k, [e]);
    }
    byType.set(type, index);
  }
  return index;
}

function assertOptionInvariant(options: string[], correctIndex: number, entry: VocabEntry, type: VocabQuestionType, bank: readonly VocabEntry[]): void {
  const used = new Set<string>();
  const terms = new Set<string>();
  const take = (e: VocabEntry, where: string) => {
    const keys = meaningKeys(e.hu);
    for (const k of keys) {
      if (used.has(k)) assert.fail(`${entry.id} ${type}: a(z) „${k}” jelentés két opcióban (${where}); opciók: ${options.join(" | ")}`);
    }
    const t = termKey(e.term);
    if (terms.has(t)) assert.fail(`${entry.id} ${type}: azonos term-kulcs (${t}); opciók: ${options.join(" | ")}`);
    keys.forEach(k => used.add(k));
    terms.add(t);
  };
  take(entry, "helyes");
  const index = optionIndex(bank, type);
  options.forEach((opt, i) => {
    if (i === correctIndex) return;
    const candidates = (index.get(opt) ?? []).filter(c => c.id !== entry.id && c.kind === entry.kind);
    if (candidates.length === 0) assert.fail(`${entry.id} ${type}: ismeretlen opció ${opt}`);
    const consistent = candidates.find(c => !meaningKeys(c.hu).some(k => used.has(k)) && !terms.has(termKey(c.term))) ?? candidates[0]!;
    take(consistent, opt);
  });
}

const TREE_BANKS: Array<[VocabLang, VocabEntry[]]> = [["en", VOCAB_EN], ["de", VOCAB_DE], ["fr", VOCAB_FR]];

/**
 * A futásidő-korlát teljesítmény-garancia (a generátor a teljes bankokon is gyors: #432), ezért a mérce a folyamat
 * CPU-ideje, nem a falióra (docs/specs/2026-11-19-idozitesfuggo-tesztek.md, kanban #205): terhelt gépen (két párhuzamos
 * teljes tesztkör) a falióra a CPU-sorban állással nő, a végzett munka nem — ugyanaz a 60 s-os korlát a munkát méri.
 * Mellette terhelés-tűrő falióra-felső korlát (vak ellenőr L1): a CPU-időt nem égető lassulást (szinkron alvás, blokkoló
 * I/O, várakozás) csak a falióra látja. Értéke 150 s — mérve: terheletlenül 11–22 s, a legerősebb mesterséges terhelésnél
 * (60 pörgető + 20 párhuzamos példány) legfeljebb 94,5 s, a két párhuzamos teljes kör alatti hamis bukás 60,7 s volt; az alvó
 * mutáns (1000 kérdésenként 1,5 s) 177,5 s-ot mért, és ezen bukik.
 */
const CPU_LIMIT_MS = 60_000;
const WALL_LIMIT_MS = 150_000;
test("bank-szintű invariáns minden fában lévő bankra: minden bejegyzés × minden generálható típus × 5 seed", (t) => {
  const wallStarted = performance.now();
  const cpuStarted = process.cpuUsage();
  for (const [lang, bank] of TREE_BANKS) {
    let made = 0;
    let nulls = 0;
    for (const entry of bank) {
      for (const type of TYPES) {
        if (!applicable(entry, type)) continue;
        for (let seed = 1; seed <= 5; seed++) {
          const q = generateVocabQuestion(entry, bank, type, seededRng(seed * 7919 + made));
          if (!q) { nulls++; continue; }
          made++;
          assert.equal(q.lang, lang);
          assertOptionInvariant(q.options, q.correctIndex, entry, type, bank);
        }
      }
    }
    assert.ok(made > 0, `${lang}: legalább egy kérdés készült`);
    // A null nem hiba (kevés jelölt a kind-ban), de a bankok többségéből kérdés kell, hogy legyen.
    assert.ok(nulls <= made, `${lang}: túl sok null (${nulls} / ${made + nulls})`);
  }
  const cpu = process.cpuUsage(cpuStarted);
  const cpuMs = Math.round((cpu.user + cpu.system) / 1000);
  const wallMs = Math.round(performance.now() - wallStarted);
  t.diagnostic(`a bank-szintű invariáns: CPU ${cpuMs} ms, falióra ${wallMs} ms`);
  assert.ok(cpuMs < CPU_LIMIT_MS, `a bank-szintű invariáns CPU-ideje ${cpuMs} ms (falióra ${wallMs} ms)`);
  assert.ok(wallMs < WALL_LIMIT_MS, `a bank-szintű invariáns falióra-ideje ${wallMs} ms (CPU ${cpuMs} ms): CPU nélküli várakozás`);
});

test("report: a jelentés-átfedő párok összesítő sora mindig ott van; --overlaps a párokat is listázza; nem hiba", () => {
  const bank = [blouson, veste, mumble, murmur, mutter, enerve, nerveux, ...filler("fr", 1, 51)];
  const pairs = overlapPairs(bank);
  const ids = pairs.map(p => `${p.a.id}↔${p.b.id}`);
  // Elvárás a szabályból: blouson↔veste (dzseki), mumble↔murmur (mormol), mumble↔mutter (motyog), énervé↔nerveux
  // (ideges); murmur↔mutter nem (mormol ≠ motyog); a szintetikus kitöltők egymással nem fednek át.
  assert.deepEqual(ids.sort(), [
    "en2-communication-901↔en2-communication-902",
    "en2-communication-901↔en2-communication-903",
    "fr1-clothes-901↔fr1-clothes-902",
    "fr2-feelings-901↔fr2-feelings-902",
  ]);
  // Szint±1 és azonos kind: L0 és L2 között nincs pár; word és phrase között sincs.
  const far = { ...veste, id: "fr3-clothes-903", level: 3 as const };
  const phrase = { ...veste, id: "fr1-clothes-904", term: "une veste chaude", kind: "phrase" as const, pos: "phrase" as const };
  assert.equal(overlapPairs([blouson, far, phrase]).length, 0);

  const plain = reportLines("fr", bank, "sample", false);
  assert.ok(plain.lines.includes("jelentés-átfedő párok (azonos szint±1, azonos kind): 4"), plain.lines.join("\n"));
  assert.ok(!plain.lines.some(l => l.includes("↔")), "--overlaps nélkül nincs lista");
  const listed = reportLines("fr", bank, "sample", false, true);
  assert.ok(listed.lines.includes("  fr1-clothes-901 — le blouson — dzseki, bomberdzseki ↔ fr1-clothes-902 — la veste — dzseki"), listed.lines.join("\n"));
  assert.deepEqual(listed.problems, plain.problems, "az átfedés nem hiba");
});
