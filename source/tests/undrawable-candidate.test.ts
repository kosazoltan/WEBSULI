import test from "node:test";
import assert from "node:assert/strict";
import { fusionFixture, standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { lessonSchema, type Lesson } from "../shared/lesson-schema";
import { sourceVisualProblems } from "../shared/lesson-visual-params";
import { LessonConversation, type ModelClient, type Turn } from "../server/studio/single-run/conversation";
import { singleRunSystemPrompt } from "../server/studio/single-run/engine";
import { fixConceptInConversation, type ConceptFixSource } from "../server/studio/single-run/concept-fix";
import { buildStructuredImprovement } from "../server/studio/structured-improvement";
import { SOURCE_VISUALS_ENV } from "../server/studio/source-visuals-flag";
import { drawableCandidate, withDropReason } from "../server/studio/undrawable-visuals";

/* #515 review (2026-11-18): BE állapotban a leckejavítás és a fogalomjavítás a HIBÁS paraméterű új fajtájú ábrablokkot (a séma elfogadja,
   a megosztott `sourceVisualProblems` kirajzolhatatlannak ítéli, a lejátszó elrejti) menthetőnek minősítette. A két út a jelölt
   elfogadása ELŐTT ugyanazt a megosztott szűrőt futtatja, mint a szerzői állomás; KI állapotban a viselkedés a főágé. */

/** Hibás paraméterű (fejléc nélküli) táblázat és tónus nélküli szabálydoboz — a séma elfogadja, a rajzoló semmit nem rajzol belőle. */
const BROKEN_TABLE = { kind: "animate", animKind: "table", params: { columns: ["mennyiség"], rows: [{ a: 1 }] }, caption: "A terület mértékegysége.", coversConceptIds: ["area"] };
const VALID_TABLE = { kind: "animate", animKind: "table", params: { headers: ["mennyiség", "mértékegység"], rows: [["terület", "négyzetcentiméter"]] }, caption: "A terület mértékegysége.", coversConceptIds: ["area"] };
const beforeRecap = <L extends { sections: Array<{ blocks: unknown[] }> }>(lesson: L, block: unknown): L =>
  ({ ...lesson, sections: lesson.sections.map((s, i) => (i ? s : { ...s, blocks: [...s.blocks.slice(0, -1), block, ...s.blocks.slice(-1)] })) });
const hasKind = (lesson: unknown, animKind: string) => JSON.stringify(lesson).includes(`"animKind":"${animKind}"`);
const undrawable = (lesson: { sections: Array<{ blocks: unknown[] }> }) => lesson.sections.flatMap((s) => s.blocks).filter((b) => sourceVisualProblems(b));

async function withFlag<T>(value: string | undefined, body: () => Promise<T>): Promise<T> {
  const prev = process.env[SOURCE_VISUALS_ENV];
  if (value === undefined) delete process.env[SOURCE_VISUALS_ENV]; else process.env[SOURCE_VISUALS_ENV] = value;
  try { return await body(); }
  finally { if (prev === undefined) delete process.env[SOURCE_VISUALS_ENV]; else process.env[SOURCE_VISUALS_ENV] = prev; }
}

test("a jelölt szűrője: a kirajzolhatatlan blokk kimarad (naplózva, számlálva); érvényes és régi blokk érintetlen; kiürülő fejezetnél megnevezett hiba", () => {
  const base = lessonSchema.parse({ ...standardFusionFixture(), mapId: "m1", sourceOnly: true });
  // Nincs mit kivenni: ugyanaz az objektum, üres jegyzet (KI állapotban és régi leckén mindig ez az ág).
  const same = drawableCandidate(base);
  assert.equal(same.lesson, base);
  assert.deepEqual([same.dropped.length, same.notes.length], [0, 0]);
  const withValid = lessonSchema.parse(beforeRecap(base, VALID_TABLE));
  assert.equal(drawableCandidate(withValid).lesson, withValid, "az érvényes új fajtájú blokk megmarad");
  // Hibás paraméterű blokk: kimarad, a többi blokk változatlan.
  const logs: string[] = [];
  const drawn = drawableCandidate(lessonSchema.parse(beforeRecap(withValid, BROKEN_TABLE)), (l) => logs.push(l), "Javítás");
  assert.deepEqual(drawn.dropped.map((d) => [d.path, d.animKind]), [[`sections[0].blocks[${base.sections[0].blocks.length}]`, "table"]]);
  assert.deepEqual(drawn.lesson, withValid);
  assert.equal(undrawable(drawn.lesson).length, 0);
  assert.equal(logs.filter((l) => l.includes("kirajzolhatatlan ábrablokk kivéve a jelöltből: sections[0].blocks[")).length, 1);
  assert.ok(logs.some((l) => l.includes("1 kirajzolhatatlan ábrablokk kimaradt")), "a darabszám a naplóban");
  assert.match(drawn.notes[0], /^A program KIVETTE a\(z\) sections\[0\]\.blocks\[\d+\] ábrablokkot \(animKind: table\), mert a paraméterei hibásak: /);
  assert.equal(withDropReason(drawn.notes, "Hiba."), `${drawn.notes[0]} Hiba.`);
  assert.equal(withDropReason([], "Hiba."), "Hiba.");
  // A kiesés után érvénytelen jelölt (kiürülő fejezet): kivétel a kiesés okával ÉS a sémahibával — a hívó meglévő hibaútjára.
  const emptied = lessonSchema.parse({ ...base, sections: [{ ...base.sections[0], heading: "Csak ábra", blocks: [BROKEN_TABLE] }, ...base.sections] });
  assert.throws(() => drawableCandidate(emptied), (error: unknown) => {
    const message = (error as Error).message;
    assert.match(message, /A program KIVETTE a\(z\) sections\[0\]\.blocks\[0\] ábrablokkot \(animKind: table\)/);
    assert.match(message, /A kiesés után a jelölt érvénytelen: sections\.0\.blocks: /);
    return true;
  });
});

/* Fogalomjavítás — motor-szint (forgatókönyves modell, adatbázis nélkül). */
const fixture = standardFusionFixture();
const fixSource: ConceptFixSource = { subject: fixture.subject, classroom: fixture.classroom,
  concepts: [{ id: "c1", localId: "area", term: "terület", definition: "A síkidom által lefedett rész nagysága.", quote: "A téglalap területe az oldalak szorzata.", examWeight: "core" }] };
function fixClient(firstFix: unknown) {
  const calls: string[] = [], requests: string[] = [];
  const { experience: _bank, ...teaching } = fixture;
  let fixes = 0;
  const model: ModelClient = { model: "claude-opus-5-5", async complete(_system, turns: Turn[]) {
    const t = turns.at(-1)!.blocks.map((b) => (b.type === "text" ? b.text : "")).join("\n");
    let json: unknown = {};
    if (/^FOGALOMJAVÍTÁS|A PROGRAM ELLENŐRZÉSE \(fogalomjavítás\)/.test(t)) { calls.push("fix"); requests.push(t); json = fixes++ === 0 ? firstFix : teaching; }
    else if (/5\. ÁLLOMÁS/.test(t)) { calls.push("bank"); json = structuredClone(fixture.experience); }
    else if (/(^|\n)LEKTORÁLÁS|A PROGRAM ELLENŐRZÉSE \(a javítás lektorálása\)/.test(t)) { calls.push("lektor"); json = { solutions: [], notes: [], reviewedAll: true }; }
    else calls.push("?");
    return { text: JSON.stringify(json), model: "claude-opus-5-5", truncated: false };
  } };
  return { model, calls, requests };
}
const runFix = (fake: ReturnType<typeof fixClient>, sourceVisuals: boolean, logs: string[] = []) => fixConceptInConversation({ original: fixture, source: fixSource, conceptId: "area", sourceVisuals,
  conversation: new LessonConversation(singleRunSystemPrompt(), fake.model, null), fresh: (s) => new LessonConversation(s, fake.model, null), log: (m) => logs.push(m) });

test("fogalomjavítás (BE): a jelölt hibás paraméterű táblázata nem mentődik — kimarad, javító forduló nélkül; a jelöltben nincs kirajzolhatatlan blokk", async () => {
  const { experience: _bank, ...teaching } = fixture;
  const fake = fixClient(beforeRecap(teaching, BROKEN_TABLE));
  const logs: string[] = [];
  const result = await runFix(fake, true, logs);
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 400));
  const candidate = (result as { candidate: Lesson }).candidate;
  assert.equal(hasKind(candidate, "table"), false, "a hibás táblázat nincs az elfogadott jelöltben");
  assert.equal(undrawable(candidate).length, 0);
  assert.equal(fake.calls.filter((c) => c === "fix").length, 1, "a kiesés önmagában nem indít új (fizetős) kört");
  assert.equal(logs.filter((l) => l.includes("Fogalomjavítás: kirajzolhatatlan ábrablokk kivéve a jelöltből")).length, 1);
});

test("fogalomjavítás (BE): ha a kiesés miatt a jelölt érvénytelen, a MEGLÉVŐ javító forduló kapja a kiesés okát; KI állapotban a régi sémahiba megy", async () => {
  const { experience: _bank, ...teaching } = fixture;
  const emptied = { ...teaching, sections: [{ ...teaching.sections[0], heading: "Csak ábra", blocks: [BROKEN_TABLE] }, ...teaching.sections] };
  const on = fixClient(emptied);
  const result = await runFix(on, true);
  assert.equal(result.ok, true, JSON.stringify(result).slice(0, 400));
  assert.equal(on.calls.filter((c) => c === "fix").length, 2, "pontosan egy javító forduló (a meglévő hibaút)");
  assert.match(on.requests[1], /A program KIVETTE a\(z\) sections\[0\]\.blocks\[0\] ábrablokkot \(animKind: table\)/);
  assert.match(on.requests[1], /A kiesés után a jelölt érvénytelen/);
  // KI állapot (a főág viselkedése): az új fajta a sémán sem jut át — a hiba a régi felsorolásos sémahiba, „KIVETTE” nélkül.
  const off = fixClient(beforeRecap(teaching, BROKEN_TABLE));
  const offResult = await runFix(off, false);
  assert.equal(offResult.ok, true);
  assert.match(off.requests[1], /animKind: Invalid enum value\. Expected 'numberLine' \| /);
  assert.ok(!off.requests[1].includes("KIVETTE"));
});

/* Leckejavítás — motor-szint (`buildStructuredImprovement`, forgatókönyves hívással, adatbázis nélkül). */
const repairSource = { subject: "matematika", classroom: 7, concepts: [{ localId: "area", term: "terület", definition: "Az alap és a magasság szorzatának fele.", examWeight: "core" as const }] };
function repairCall(firstAuthor: (original: Lesson) => unknown) {
  const e = standardFusionFixture().experience!;
  const original = fusionFixture();
  const authorRequests: string[] = [];
  let authors = 0;
  const call = async (step: string, _system: string, user: string) => {
    if (step === "lektor") return { notes: [] };
    // A szerzői (javító) kérés a korábbi leckét adatként viszi — a bankkérés nem.
    if (user.includes("Korábbi lecke (adat):")) { authorRequests.push(user); return authors++ === 0 ? firstAuthor(original) : original; }
    return { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] };
  };
  return { original, call: call as never, authorRequests };
}

test("leckejavítás (BE): a jelölt hibás paraméterű táblázata nem mentődik — kimarad, újrapróba nélkül; érvénytelenné váló jelöltnél a meglévő újrapróba kapja az okot", async () => {
  await withFlag("on", async () => {
    const a = repairCall((original) => beforeRecap(original, BROKEN_TABLE));
    const result = await buildStructuredImprovement(a.original, repairSource, a.call);
    assert.equal(hasKind(result.candidate, "table"), false, "a hibás táblázat nincs az elfogadott jelöltben");
    assert.equal(undrawable(result.candidate).length, 0);
    assert.equal(a.authorRequests.length, 1, "a kiesés önmagában nem indít újrapróbát");
    // Az érvényes táblázat megmarad.
    const b = repairCall((original) => beforeRecap(original, VALID_TABLE));
    assert.equal(hasKind((await buildStructuredImprovement(b.original, repairSource, b.call)).candidate, "table"), true);
    // Kiürülő fejezet: a meglévő (egyetlen) újrapróba kérése megnevezi a kiesést; a jó jelölttel a javítás elkészül.
    const c = repairCall((original) => ({ ...original, sections: [{ ...original.sections[0], heading: "Csak ábra", blocks: [BROKEN_TABLE] }, ...original.sections] }));
    const fixed = await buildStructuredImprovement(c.original, repairSource, c.call);
    assert.equal(c.authorRequests.length, 2);
    assert.match(c.authorRequests[1], /Ellenőrzési hibák: A program KIVETTE a\(z\) sections\[0\]\.blocks\[0\] ábrablokkot \(animKind: table\)/);
    assert.equal(undrawable(fixed.candidate).length, 0);
    // A kiesés UTÁN bukó tanítás-ellenőrzés (hiányzó nyitó magyarázat): az újrapróba a kiesés okát ÉS az ellenőrzés hibáját is megkapja.
    const d = repairCall((original) => { const bad = beforeRecap(structuredClone(original), BROKEN_TABLE); bad.sections[0].blocks.shift(); return bad; });
    await buildStructuredImprovement(d.original, repairSource, d.call);
    assert.equal(d.authorRequests.length, 2);
    const errors = d.authorRequests[1].split("Ellenőrzési hibák: ")[1].split("\nElőző jelölt")[0];
    assert.match(errors, /^A program KIVETTE a\(z\) sections\[0\]\.blocks\[\d+\] ábrablokkot \(animKind: table\)/);
    assert.ok(!errors.includes("A kiesés után a jelölt érvénytelen") && errors.replace(/^A program KIVETTE[^—]*— az alábbi hibák ennek a következményei lehetnek\. Javítsd a blokk paramétereit, vagy tanítsd ugyanezt másik blokkal\. /, "").length > 10, "a tanítás-ellenőrzés saját hibája is ott van: " + errors.slice(0, 400));
  });
});

test("leckejavítás (KI — a főág viselkedése): az új fajtájú blokk a sémán sem jut át; a hiba a régi sémahiba, kiesés és „KIVETTE” nélkül", async () => {
  await withFlag(undefined, async () => {
    const a = repairCall((original) => beforeRecap(original, BROKEN_TABLE));
    const result = await buildStructuredImprovement(a.original, repairSource, a.call);
    assert.equal(a.authorRequests.length, 2, "sémahiba → a meglévő újrapróba");
    assert.match(a.authorRequests[1], /Invalid enum value/);
    assert.ok(!a.authorRequests[1].includes("KIVETTE"));
    assert.equal(hasKind(result.candidate, "table"), false);
  });
});
