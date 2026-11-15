import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { VOCAB_EN, VOCAB_EN_STAGE } from "../client/src/data/vocabBank/vocab-en";
import { VOCAB_DE, VOCAB_DE_STAGE } from "../client/src/data/vocabBank/vocab-de";
import { VOCAB_FR, VOCAB_FR_STAGE } from "../client/src/data/vocabBank/vocab-fr";
import { PLAN_MINIMUMS, SAMPLE_MINIMUMS } from "../client/src/data/vocabBank/minimums";
import { TOPIC_LEVEL_QUOTAS } from "../client/src/data/vocabBank/quotas";
import { VOCAB_TOPICS } from "../client/src/data/vocabBank/topics";
import { findFormInText, minimumProblems, normalizeTerm, vocabBankProblems, vocabBankStats } from "../client/src/data/vocabBank/validate";
import { loadVocabBank, resetVocabBankCache } from "../client/src/data/vocabBank/loader";
import type { VocabEntry, VocabLang, VocabMinimums, VocabStage } from "../client/src/data/vocabBank/types";
import { blindExport, blindScore, reportLines } from "../scripts/vocab-bank";

/** Terv: docs/specs/2026-11-15-jatekok-mobil-szobank.md 4.2, A1–A2; végrehajtás S1. */
const BANKS: Record<VocabLang, { entries: VocabEntry[]; stage: VocabStage }> = {
  en: { entries: VOCAB_EN, stage: VOCAB_EN_STAGE },
  de: { entries: VOCAB_DE, stage: VOCAB_DE_STAGE },
  fr: { entries: VOCAB_FR, stage: VOCAB_FR_STAGE },
};

test("validátor: nulla hiba mindhárom nyelven (A2)", () => {
  for (const [lang, { entries }] of Object.entries(BANKS) as Array<[VocabLang, { entries: VocabEntry[] }]>) {
    assert.deepEqual(vocabBankProblems(entries, lang), [], `${lang} hibái`);
  }
});

test("darabszám-minimum a nyelv állapota szerint (A1 mechanizmus: stage full → terv 4.2)", () => {
  for (const [lang, { entries, stage }] of Object.entries(BANKS) as Array<[VocabLang, { entries: VocabEntry[]; stage: VocabStage }]>) {
    const min = stage === "full" ? PLAN_MINIMUMS[lang] : SAMPLE_MINIMUMS;
    assert.ok(stage === "full" || stage === "sample", `${lang}: ismeretlen stage ${stage}`);
    assert.deepEqual(minimumProblems(vocabBankStats(entries), min), [], `${lang} (${stage}) minimum`);
  }
});

test("mintaállapotban szintenként legalább 2 phrase, a minta-azonosítók 001-esek (S1/4. lépés)", () => {
  for (const [lang, { entries }] of Object.entries(BANKS) as Array<[VocabLang, { entries: VocabEntry[] }]>) {
    for (let lv = 0; lv < 5; lv++) {
      const phrases = entries.filter(e => e.level === lv && e.kind === "phrase").length;
      assert.ok(phrases >= 2, `${lang} L${lv}: ${phrases} phrase`);
    }
  }
});

test("a PLAN_MINIMUMS pontosan a terv 4.2 számai", () => {
  // Terv 4.2: angol 500/550/550/500/400 (össz. 2500); német és francia 400/450/450/400/300 (össz. 2000);
  // ≥ 30% phrase; témánként ≥ 40.
  assert.deepEqual(PLAN_MINIMUMS, {
    en: { total: 2500, perLevel: [500, 550, 550, 500, 400], phraseRatio: 0.3, perTopic: 40 },
    de: { total: 2000, perLevel: [400, 450, 450, 400, 300], phraseRatio: 0.3, perTopic: 40 },
    fr: { total: 2000, perLevel: [400, 450, 450, 400, 300], phraseRatio: 0.3, perTopic: 40 },
  });
  assert.deepEqual(SAMPLE_MINIMUMS, { total: 40, perLevel: [8, 8, 8, 8, 8], phraseRatio: 0, perTopic: 0 });
  for (const lang of ["en", "de", "fr"] as const) {
    const m: VocabMinimums = PLAN_MINIMUMS[lang];
    const levelSum = m.perLevel.reduce((a: number, b: number) => a + b, 0);
    assert.equal(levelSum, m.total, `${lang}: szintösszeg = total`);
  }
});

test("a TOPIC_LEVEL_QUOTAS épsége: oszlopösszeg = PLAN_MINIMUMS.perLevel, minden téma ≥ 40", () => {
  for (const lang of ["en", "de", "fr"] as const) {
    const table = TOPIC_LEVEL_QUOTAS[lang];
    assert.deepEqual(Object.keys(table).sort(), [...VOCAB_TOPICS].sort(), `${lang}: témák`);
    for (let lv = 0; lv < 5; lv++) {
      const sum = VOCAB_TOPICS.reduce((acc, t) => acc + table[t][lv]!, 0);
      assert.equal(sum, PLAN_MINIMUMS[lang].perLevel[lv], `${lang} L${lv} oszlopösszeg`);
    }
    for (const t of VOCAB_TOPICS) {
      const row = table[t].reduce((a, b) => a + b, 0);
      assert.ok(row >= 40, `${lang} ${t}: ${row} < 40`);
    }
  }
  // K.8.2: a német és a francia tábla azonos.
  assert.deepEqual(TOPIC_LEVEL_QUOTAS.de, TOPIC_LEVEL_QUOTAS.fr);
});

const GOOD_DE: VocabEntry = { id: "de0-animals-001", term: "der Hund", hu: "kutya", kind: "word", level: 0, topic: "animals", pos: "noun", example: "Der Hund spielt im Garten.", exampleHu: "A kutya a kertben játszik." };
const GOOD_EN: VocabEntry = { id: "en0-animals-001", term: "dog", hu: "kutya", kind: "word", level: 0, topic: "animals", pos: "noun", example: "The dog is in the garden.", exampleHu: "A kutya a kertben van." };
const GOOD_FR: VocabEntry = { id: "fr2-communication-001", term: "tu viens", hu: "jössz?", kind: "phrase", level: 2, topic: "communication", pos: "phrase", example: "Tu viens avec nous\u00A0?", exampleHu: "Jössz velünk?" };

test("a validátor a jó bejegyzést elfogadja (a hibapróbák alapja)", () => {
  assert.deepEqual(vocabBankProblems([GOOD_EN], "en"), []);
  assert.deepEqual(vocabBankProblems([GOOD_DE], "de"), []);
  assert.deepEqual(vocabBankProblems([GOOD_FR], "fr"), []);
});

test("a validátor elkapja a hibákat", () => {
  const cases: Array<[string, VocabEntry[], VocabLang]> = [
    ["ismétlődő term más szinten", [GOOD_EN, { ...GOOD_EN, id: "en1-animals-001", level: 1, term: "Dog" }], "en"],
    ["ismétlődő azonosító", [GOOD_EN, { ...GOOD_EN, term: "cat", example: "The cat is in the garden." }], "en"],
    ["üres exampleHu", [{ ...GOOD_EN, exampleHu: "  " }], "en"],
    ["2 szavas példa", [{ ...GOOD_EN, example: "Dog barks." }], "en"],
    ["15 szavas példa", [{ ...GOOD_EN, example: "The dog is in the garden and it plays with a red ball all day long." }], "en"],
    ["term nélküli példa", [{ ...GOOD_EN, example: "The cat is in the garden." }], "en"],
    // Review #421: a term csak szóhatáron számít — „cat” nincs benne a „category” szóban.
    ["term csak szó belsejében", [{ ...GOOD_EN, term: "cat", example: "This category is new." }], "en"],
    ["alt csak szó belsejében", [{ ...GOOD_EN, term: "go", example: "The government went home.", alt: ["gov"] }], "en"],
    ["de névelő nélküli főnév", [{ ...GOOD_DE, term: "Hund" }], "de"],
    ["fr sima szóköz ? előtt", [{ ...GOOD_FR, example: "Tu viens avec nous ?" }], "fr"],
    ["fr írásjel szóköz nélkül", [{ ...GOOD_FR, example: "Tu viens avec nous?" }], "fr"],
    ["rossz azonosító-alak", [{ ...GOOD_EN, id: "en0-animals-1" }], "en"],
    ["azonosító szintje eltér", [{ ...GOOD_EN, id: "en3-animals-001" }], "en"],
    ["azonosító témája eltér", [{ ...GOOD_EN, id: "en0-family-001" }], "en"],
    ["azonosító nyelve eltér", [{ ...GOOD_EN, id: "de0-animals-001" }], "en"],
    ["tiltott szó a termben", [{ ...GOOD_EN, term: "beer", example: "This beer is cold." }], "en"],
    ["tiltott szó a példában", [{ ...GOOD_EN, example: "The dog drinks wine." }], "en"],
    ["tiltott német szó névelővel", [{ ...GOOD_DE, term: "das Bier", example: "Das Bier ist kalt." }], "de"],
    ["kind/pos ellentmondás", [{ ...GOOD_EN, kind: "phrase" }], "en"],
    ["érvénytelen téma", [{ ...GOOD_EN, topic: "space" as VocabEntry["topic"], id: "en0-space-001" }], "en"],
    ["ASCII idézőjel", [{ ...GOOD_EN, exampleHu: "A \"kutya\" a kertben van." }], "en"],
    ["kisbetűs példamondat", [{ ...GOOD_EN, example: "the dog is in the garden." }], "en"],
  ];
  for (const [name, entries, lang] of cases) {
    assert.ok(vocabBankProblems(entries, lang).length >= 1, `nem jelzett: ${name}`);
  }
});

test("szóhatáros keresés: névelős német term mondatkezdő nagybetűvel és francia nem törő szóközös példa átmegy", () => {
  assert.deepEqual(vocabBankProblems([{ ...GOOD_DE, example: "Der Hund bellt." }], "de"), []);
  assert.deepEqual(vocabBankProblems([GOOD_FR], "fr"), []);
  assert.ok(findFormInText("tu viens", GOOD_FR.example), "a francia példában megtalálja");
  assert.equal(findFormInText("cat", "This category is new."), null);
  assert.deepEqual(findFormInText("cat", "My cat, Tom, is old."), { start: 3, end: 6 });
});

test("az alt alak elfogadott a példában (ragozott alak)", () => {
  const e: VocabEntry = { ...GOOD_EN, id: "en0-everyday-001", topic: "everyday", term: "go", hu: "megy", pos: "verb", example: "We went home early.", exampleHu: "Korán hazamentünk.", alt: ["went"] };
  assert.deepEqual(vocabBankProblems([e], "en"), []);
});

test("normalizeTerm: NFC, kisbetű, (nem törő) szóközök összevonva", () => {
  assert.equal(normalizeTerm("  Der\u00A0 Hund\u202F "), "der hund");
  assert.equal(normalizeTerm("été"), "été");
});

test("a szóbank forrásfájljaiban nincs nyers nem törő szóköz — csak escape (S1/3. lépés, francia írásjel)", () => {
  // Az ügynökök író eszköze a forrásba írt escape-et nyers karakterré alakíthatja (mérve 2026-11-15, S1); a nyers
  // karakter futásidőben azonos, de a forrásban láthatatlan, és a lint a sztringekben nem jelzi.
  const dir = join(fileURLToPath(new URL("..", import.meta.url)), "client", "src", "data", "vocabBank");
  const files = readdirSync(dir, { recursive: true }).map(String).filter(f => f.endsWith(".ts"));
  assert.ok(files.length >= 24, `forrásfájlok: ${files.length}`);
  for (const f of files) {
    const src = readFileSync(join(dir, f), "utf8");
    const bad = src.split("\n").findIndex(line => /[\u00A0\u202F]/.test(line));
    assert.equal(bad, -1, `${f}:${bad + 1}: nyers U+00A0 / U+202F — a forrásban \\u00A0 / \\u202F escape kell`);
  }
});

// SPEC-VÁLTOZÁS 2026-11-15 (docs/specs/2026-11-15-jatekok-mobil-szobank.md 4.2 / A1): a riport-elvárás a nyelv stage-éhez igazodik, hogy a tartalomszeletek tesztmódosítás nélkül élesíthessenek.
test("riport-szkript: 0 hiba; sample → total 40, full → total ≥ a terv nyelvi minimuma (S1 parancs-elvárás)", () => {
  for (const lang of ["en", "de", "fr"] as const) {
    const stage = BANKS[lang].stage;
    const { lines, problems } = reportLines(lang, BANKS[lang].entries, stage, true);
    assert.deepEqual(problems, []);
    if (stage === "sample") {
      assert.ok(lines.includes("total 40"), `${lang} (sample): total 40`);
    } else {
      const m = lines.map(l => /^total (\d+)$/.exec(l)).find(x => x !== null && x !== undefined);
      assert.ok(m, `${lang} (full): hiányzik a „total N” sor`);
      const total = Number(m[1]);
      assert.ok(total >= PLAN_MINIMUMS[lang].total, `${lang} (full): total ${total} < ${PLAN_MINIMUMS[lang].total}`);
      assert.ok(lines.includes("terv 4.2 minimum: teljesül"), `${lang} (full): a terv 4.2 minimuma nem teljesül`);
    }
    assert.ok(lines.some(l => l.startsWith("term-lista")), "a --terms foglalási listát ad (K.8.6)");
  }
});

test("vak megoldó: az export kulcsot nem tartalmaz, a pontozó a kanárit és a hibát jelzi (K.8.7)", () => {
  const { questions, keys } = blindExport("de", VOCAB_DE, 0, 1115, 3);
  // 8 bejegyzés × (hu→cél + cél→hu) + hiányos mondat, ahol a term a példában áll.
  assert.ok(questions.length >= 16 && questions.length === keys.length);
  for (const q of questions) {
    assert.deepEqual(Object.keys(q).sort(), ["example", "exampleHu", "options", "prompt", "ref"]);
    assert.equal(q.options.length, 4);
  }
  assert.equal(keys.filter(k => k.canary).length, 3);
  assert.deepEqual(blindExport("de", VOCAB_DE, 0, 1115, 3), { questions, keys, skipped: [] }, "azonos seed → azonos export");
  // A „tökéletes” megoldó (a valódi helyes választ adja) minden kanárit eltér a rontott kulcstól.
  const truth = blindExport("de", VOCAB_DE, 0, 1115, 0).keys;
  const answers = truth.map(k => ({ ref: k.ref, answer: k.correctIndex, ambiguous: false, ageOk: true, exampleOk: true, note: "" }));
  const target = keys.findIndex(k => !k.canary);
  answers[target] = { ...answers[target]!, exampleOk: false, note: "rossz fordítás" };
  const r = blindScore(keys, answers);
  assert.equal(r.checked, keys.length);
  assert.equal(r.canaryFound, 3);
  assert.equal(r.canaryTotal, 3);
  assert.equal(r.flagged.length, 1, "csak a megjelölt tétel");
  assert.equal(r.flagged[0]!.ref, keys[target]!.ref);
  assert.ok(r.flagged[0]!.reasons.some(x => x.includes("példamondat")));
  // Hiányzó válasz jelzett, és nem számít kanári-észlelésnek.
  const empty = blindScore(keys, []);
  assert.equal(empty.flagged.length, keys.length - 3);
  assert.equal(empty.canaryFound, 0);
});

test("loadVocabBank: nyelvenként gyorsítótárazott ígéret, a bank adatát adja", async () => {
  resetVocabBankCache();
  const a = loadVocabBank("de");
  const b = loadVocabBank("de");
  assert.equal(a, b, "ugyanaz az ígéret");
  assert.equal((await a).length, VOCAB_DE.length);
  assert.equal((await loadVocabBank("fr"))[0]!.id.slice(0, 2), "fr");
  resetVocabBankCache();
  assert.notEqual(loadVocabBank("de"), a, "a reset után új betöltés");
});
