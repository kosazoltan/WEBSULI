import { test } from "node:test";
import assert from "node:assert/strict";
import { CLASSIFIER_MODELS, buildClassificationPrompt, classificationInput, classifyLesson, classifyWithConsensus, parseClassification, type ClassificationInput } from "../server/catalog/classify";
import { CATALOG_SUBJECTS, LESSON_TYPES } from "../shared/catalog-taxonomy";
import { PROMPT_ROLES } from "../shared/instruction-bundles/roles";
import { SUPPORT_SKILLS } from "../server/studio/support-skills";
import type { CatalogItemDraft } from "../server/catalog/catalog-item";

/* Spec 2026-10-05-s2-tartalom-besorolas — tartalom alapú besorolás, külön bank minden tantárgynak és ágnak. */

const input: ClassificationInput = { provenance: "legacy_html:x", title: "8. osztályos hőtan", classroom: 8, headings: ["Halmazállapotok"], teachingText: "A hő az energia egyik formája…", sampleItems: ["quiz: Mi a halmazállapot?"] };
const good = { subject: "fizika", secondarySubjects: [], grade: 7, topicArea: "Hőtan", topic: "Halmazállapot-változások", lessonType: "fogalomtanito", confidence: "high", evidence: "Halmazállapotok fejezet" };

test("taxonómia: minden természettudományi ág és a magyar nyelvtan/irodalom külön bank (tulajdonosi döntés)", () => {
  for (const s of ["biologia", "kemia", "fizika", "foldrajz", "termeszetismeret", "kornyezetismeret", "magyar-nyelvtan", "magyar-irodalom", "angol", "nemet", "francia"]) assert.ok((CATALOG_SUBJECTS as readonly string[]).includes(s), s);
  assert.equal(new Set(CATALOG_SUBJECTS).size, CATALOG_SUBJECTS.length);
});

test("prompt: a taxonómia minden kulcsa benne van; a megadott évfolyamot kéri vissza; a tartalom dönt", () => {
  const { system, user } = buildClassificationPrompt(input);
  for (const s of CATALOG_SUBJECTS) assert.ok(system.includes(`- ${s}:`), s);
  for (const t of LESSON_TYPES) assert.ok(system.includes(`- ${t}:`), t);
  assert.match(system, /Skill: katalógus-besoroló/);
  assert.match(user, /Megadott évfolyam \(ezt add vissza\): 8/);
  assert.match(buildClassificationPrompt({ ...input, classroom: 0 }).user, /Évfolyam nincs megadva/);
});

test("séma: a megadott évfolyam elsőbbsége; listán kívüli tantárgy hiba; a fő tantárgy nem lehet mellék", () => {
  assert.equal(parseClassification(good, input).grade, 8, "a lecke évfolyam-mezője nyer");
  assert.equal(parseClassification({ ...good, grade: 7 }, { ...input, classroom: null }).grade, 7);
  assert.throws(() => parseClassification({ ...good, subject: "termeszettudomany" }, input));
  assert.deepEqual(parseClassification({ ...good, secondarySubjects: ["fizika", "kemia"] }, input).secondarySubjects, ["kemia"]);
});

test("pilot-lelet (2026-10-05): hosszú indoklás levágva, ékezetes/szóközös kulcs normalizálva — de találgatás nincs", () => {
  const long = parseClassification({ ...good, evidence: "x".repeat(450), topic: "t".repeat(120) }, input);
  assert.equal(long.evidence.length, 300);
  assert.equal(long.topic.length, 80);
  assert.equal(parseClassification({ ...good, subject: "Történelem", lessonType: "Fogalomtanito" }, input).subject, "tortenelem");
  assert.equal(parseClassification({ ...good, subject: "magyar nyelvtan" }, input).subject, "magyar-nyelvtan");
  assert.throws(() => parseClassification({ ...good, subject: "természettudomány" }, input), "nem kulcs — nincs szinonima-hozzárendelés");
  assert.deepEqual(parseClassification({ ...good, secondarySubjects: ["Kémia", "kitalált"] }, input).secondarySubjects, ["kemia"]);
});

test("tartalék-lánc: érvénytelen válasz → következő modell; egyik sem → unclassified (nem kitalált érték)", async () => {
  const calls: string[] = [];
  const ok = await classifyLesson(input, ["a", "b"], async (model) => { calls.push(model); return model === "a" ? { json: { subject: "kitalalt" } } : { json: good, usage: { promptTokens: 10, completionTokens: 5 } }; });
  assert.deepEqual(calls, ["a", "b"]);
  assert.ok(ok.ok && ok.model === "b" && ok.classification.subject === "fizika");
  const bad = await classifyLesson(input, ["a"], async () => { throw new Error("időtúllépés"); });
  assert.ok(!bad.ok && /unclassified/.test(bad.reason));
});

test("konszenzus (pilot-lelet: futásonként eltérő tantárgy): egyező → agreed; eltérő → review mindkét jelölttel; egy érvényes → review", async () => {
  const fixed = (by: Record<string, unknown>) => async (model: string) => ({ json: by[model] });
  const agreed = await classifyWithConsensus(input, ["a", "b"], fixed({ a: good, b: { ...good, lessonType: "gyakorlo-feladatlap" } }));
  assert.ok(agreed.status === "agreed" && agreed.classification.subject === "fizika" && agreed.classification.confidence === "low", "típus-eltérés: alacsony bizonyosság");
  const review = await classifyWithConsensus(input, ["a", "b"], fixed({ a: { ...good, subject: "tortenelem" }, b: { ...good, subject: "termeszetismeret" } }));
  assert.ok(review.status === "review" && review.candidates.length === 2 && /eltérő tantárgy/.test(review.reason));
  const one = await classifyWithConsensus(input, ["a", "b"], fixed({ a: good, b: { subject: "nincs" } }));
  assert.ok(one.status === "review" && one.candidates.length === 1);
  const none = await classifyWithConsensus(input, ["a", "b"], fixed({ a: {}, b: {} }));
  assert.equal(none.status, "unclassified");
  // mért (pilot): hibás válasznál/szolgáltatói hibánál a harmadik modell lép be — két KÜLÖNBÖZŐ modell érvényes ítélete kell
  const third = await classifyWithConsensus(input, ["a", "b", "c"], fixed({ a: good, b: { subject: "nincs" }, c: good }));
  assert.ok(third.status === "agreed" && third.models.join(",") === "a,c");
});

test("pilot-lelet: a `{\"answer\": {...}}` burok determinisztikusan kibontva; a modell-lista a v4.1-flash-sel", () => {
  assert.equal(parseClassification({ answer: good }, input).subject, "fizika");
  assert.throws(() => parseClassification({ answer: good, extra: 1 }, input), "csak egykulcsos burok bontható ki");
  assert.deepEqual([...CLASSIFIER_MODELS], ["z-ai/glm-5.3-flash", "deepseek/deepseek-v4.1-flash", "deepseek/deepseek-v4-flash"]);
});

test("bemenet: a tétel-minta a lecke egészéből (eleje, közepe, vége), a fejezetcímek egyediek", () => {
  const items = Array.from({ length: 60 }, (_, i) => ({ kind: i < 5 ? "section" : "quiz", prompt: i < 5 ? `Fejezet ${i % 2}` : `Kérdés ${i}`, body: "szöveg", provenance: "p", fingerprint: String(i), lessonTitle: "T", classroom: 5 })) as Array<CatalogItemDraft & { lessonTitle: string; classroom: number | null }>;
  const ci = classificationInput(items);
  assert.deepEqual(ci.headings, ["Fejezet 0", "Fejezet 1"]);
  assert.equal(ci.sampleItems.length, 12);
  assert.ok(ci.sampleItems.at(-1)!.includes("Kérdés 5") === false, "nem csak az elejéről");
});

test("a szerep és a skill regisztrálva (nincs skill nélküli új szerep)", () => {
  assert.ok((PROMPT_ROLES as readonly string[]).includes("catalog-classifier"));
  assert.ok("catalog-classifier" in SUPPORT_SKILLS);
});
