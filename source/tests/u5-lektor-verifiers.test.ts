import { test } from "node:test";
import assert from "node:assert/strict";
import { illustrationFacts, lektorLessonView } from "../server/studio/lektor-view";
import { figureCheck, FIGURE_CHECK_VERSION } from "../server/studio/figure-check";
import { buildLektorPrompt, LEKTOR_SOLUTIONS_MAX, lektorReportSchema, parseLektorResponse, TEACHING_CONTRACT } from "../server/studio/step-io";
import {
  BANK_VERIFIER_NOTE_PREFIX, SINGLE_CHOICE_NOTE_MARK, bankItemHash, buildBankVerifierPrompt, bankVerifierChunks, choiceVerdictProblem, clearedWithoutOpen,
  complaintKey, mergeBankVerifierNotes, mergeVerifierRetry, parseBankVerifierErrors, runBankVerifier,
} from "../server/studio/bank-verifier";
import { blindSolutionsPromptBlock, NOT_ENOUGH, parseBlindSolverAnswer } from "../server/studio/blind-solver";
import { SUPPORT_SKILLS } from "../server/studio/support-skills";
import type { RawNote } from "../server/studio/lektor";
import { LESSON_QUALITY_CONTRACT } from "../shared/lesson-quality";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import type { Lesson } from "../shared/lesson-schema";

/* Spec 2026-09-30-utasitasrendszer-rendbetetel (U5): C5/H8, C6/H15, H32, H45/C18, H48, H49, H51, ábra-kapu, H37. */

const SVG = '<svg viewBox="0 0 800 520"><rect x="1" y="1" width="10" height="10"/><text x="10" y="20">Nílus</text><text x="10" y="40">2500 km</text><path d="M0 0"/></svg>';

test("C5/H8: a lektor bemenete kiírt útvonalas, tömör nézet — SVG-törzs nélkül, az ábra ellenőrizhető tényeivel, az igazolt tételek jelölve", () => {
  const lesson = standardFusionFixture();
  lesson.sections[0].blocks.push({ kind: "animate", animKind: "illustration", params: { svg: SVG }, caption: "A Nílus hossza.", coversConceptIds: ["area"] } as never);
  const facts = illustrationFacts(SVG);
  assert.deepEqual(facts.labels, ["Nílus", "2500 km"]); assert.deepEqual(facts.numbers, ["2500"]); assert.equal(facts.elements, 4);
  const view = lektorLessonView(lesson, { verifiedPaths: new Set(["experience.quiz[1]", "experience.tasks[0]"]) });
  assert.doesNotMatch(view, /<svg|<rect|<path/, "az SVG-törzs nem a lektor bemenete");
  assert.match(view, /animate\/illustration: caption: A Nílus hossza\. \| feliratok: „Nílus”, „2500 km” \| számok: 2500 \| elemek: 4/);
  assert.match(view, /^sections\[0\]\.heading: /m);
  assert.match(view, /^sections\[0\]\.blocks\[0\] explain\(core\) \[area\]: /m);
  assert.match(view, /^experience\.tasks\[0\] \[area\] s0 (oral|written): /m);
  assert.match(view, /^experience\.quiz\[0\] \[area\] s0 (recall|apply)?: .* \| helyes: \d/m);
  assert.match(view, /IGAZOLT TÉTELEK .*: experience\.quiz\[1\], experience\.tasks\[0\]/);
  const prompt = buildLektorPrompt(lesson, { title: "T", subject: "m", classroom: 5, concepts: [] }, [], undefined, undefined, new Set(["experience.quiz[1]"]));
  assert.doesNotMatch(prompt, /"blocks": \[/, "nincs behúzott JSON-lecke");
  assert.match(prompt, /IGAZOLT TÉTELEK/);
  assert.equal(prompt.split("TANÍTÁSI SZERZŐDÉS").length - 1, 1, "a tanítási szerződés egyszer");
  assert.ok(!prompt.includes(LESSON_QUALITY_CONTRACT), "a minőségi szerződést a runbook adja — a promptban nem ismétlődik (H8: 3× volt)");
  assert.ok(prompt.includes(TEACHING_CONTRACT));
  assert.match(prompt, /üres notes CSAK reviewedAll: true mellett/);
});

test("H45/C18/H49: a lektori jelentés modell-határa — {} érvénytelen, üres notes csak reviewedAll mellett, 200 fölött jelölt csonkolás; a tárolt régi jelentés olvasható marad", () => {
  assert.equal(parseLektorResponse({}).ok, false);
  assert.match((parseLektorResponse({}) as { reason: string }).reason, /notes/);
  assert.equal(parseLektorResponse({ notes: [] }).ok, false, "üres jelentés kimondás nélkül");
  assert.equal(parseLektorResponse({ notes: [], reviewedAll: true }).ok, true);
  assert.equal(parseLektorResponse({ solutions: [], notes: [{ kind: "language", message: "x" }] }).ok, true);
  assert.equal(parseLektorResponse("nem objektum").ok, false);
  const many = Array.from({ length: LEKTOR_SOLUTIONS_MAX + 7 }, (_, i) => ({ task: `f${i}`, own: "1", lesson: "1", match: true }));
  const truncated = parseLektorResponse({ solutions: many, notes: [], reviewedAll: true });
  assert.equal(truncated.ok, true);
  if (truncated.ok) { assert.equal(truncated.report.solutions?.length, LEKTOR_SOLUTIONS_MAX); assert.equal(truncated.report.solutionsTruncated, 7); }
  assert.equal(lektorReportSchema.safeParse({ notes: [] }).success, true, "tárolt (régi) jelentés: lenient séma");
});

test("H32/H48/H51: tételenkénti ítélet — nyílt tétel csak kimondott igazolással cleared; hosszeltérés eldöntetlen; több különálló kifogás megmarad; az újrahívás nem törli a korábbi tartalmi jegyzetet", async () => {
  const lesson = standardFusionFixture();
  const e = lesson.experience!;
  const chunk = bankVerifierChunks(lesson)[0];
  const openPaths = chunk.items.filter((i) => !i.key).map((i) => i.path);
  const keyed = chunk.items.filter((i) => i.key);
  assert.ok(openPaths.length >= 2 && keyed.length >= 2);
  const concepts = [{ localId: "area", term: "terület", quote: "A háromszög területe az alap és a magasság szorzatának fele." }];
  const prompt = buildBankVerifierPrompt(chunk, undefined, lesson, concepts);
  assert.match(prompt, /A FEJEZET TANÍTÁSA/); assert.match(prompt, /FORRÁS-IDÉZETEI[^]*area \(terület\): „A háromszög területe/);
  assert.match(prompt, /"verified": \["experience\.tasks\[1\]"\]/); assert.match(prompt, /MINDEN tételről ítélet kell/);
  const [open0, open1] = openPaths;
  const result = await runBankVerifier({ lesson, concepts, call: async () => ({
    errors: [{ path: open0, message: "Mi hamis: a minta rossz | Bizonyíték: x | Javítás iránya: y" }, { path: open0, message: "Mi hamis: a rubrika hibás értéket is elfogad | Bizonyíték: z | Javítás iránya: w" }, { path: open0, message: "Mi hamis: a minta rossz | Bizonyíték: x | Javítás iránya: y" }],
    choices: keyed.map((k, n) => ({ path: k.path, truths: n === 0 ? [...k.key!.options.map(() => false), true] : k.key!.options.map((_, i) => i === k.key!.correctIndex) })),
    verified: [open1],
  }) });
  const byPath = new Map(result.notes.map((n) => [n.blockPath, n]));
  assert.match(byPath.get(open0)!.message, /a minta rossz \| .* \| Mi hamis: a rubrika hibás értéket/, "két különálló kifogás egy jegyzetben, az azonos kifogás egyszer");
  assert.ok(byPath.get(open0)!.itemId, "stabil tétel-azonosító a leleten");
  assert.equal(result.unverifiedChoices.map((u) => u.path)[0], keyed[0].path, "hosszeltérés = ellenőrző-hiba → eldöntetlen, nem tartalmi jegyzet");
  assert.equal(byPath.has(keyed[0].path), false);
  const undecidedOpen = openPaths.filter((p) => p !== open0 && p !== open1);
  assert.deepEqual(result.unverifiedOpen.map((u) => u.path).sort(), undecidedOpen.sort(), "a fel nem sorolt nyílt tétel eldöntetlen");
  const hashOf = (path: string) => chunk.items.find((i) => i.path === path)!.hash;
  assert.ok(result.cleared.includes(hashOf(open1)), "kimondott igazolás → cleared");
  assert.ok(!result.cleared.includes(hashOf(open0)) && undecidedOpen.every((p) => !result.cleared.includes(hashOf(p))));
  // H51: az újrahívás összefésülése csak az ítélethiányt pótolja — ugyanazon a tételen a másik hiba nyitott marad
  const first = { ...result, notes: [...result.notes], unverifiedChoices: [{ path: open0, hash: hashOf(open0) }], unverifiedOpen: [] };
  const retry = { notes: [{ kind: "source_conflict", subkind: "contradicts_source", blockPath: open0, message: `${BANK_VERIFIER_NOTE_PREFIX}Mi hamis: a rubrika hibás értéket is elfogad | Bizonyíték: z | Javítás iránya: w` } as RawNote], cleared: [hashOf(open0)], checked: 1, failedChunks: 0, rejectedPaths: [], unverifiedChoices: [], unverifiedOpen: [] };
  const merged = mergeVerifierRetry(first, retry);
  assert.ok(merged.notes.some((n) => n.blockPath === open0 && /a minta rossz/.test(n.message)), "az első kör kifogása megmarad");
  assert.ok(!merged.cleared.includes(hashOf(open0)), "nyitott lelettel a tétel nem lehet cleared");
  assert.deepEqual(clearedWithoutOpen(lesson, [hashOf(open0), hashOf(open1)], new Set([open0])), [hashOf(open1)]);
  assert.equal(complaintKey("p", `${BANK_VERIFIER_NOTE_PREFIX}Mi hamis: X`), complaintKey("p", "Mi hamis: X"));
  assert.deepEqual(choiceVerdictProblem({ options: ["a", "b"], correctIndex: 0 }, [true]), { kind: "undecidable", reason: "az opciónkénti ítélet 1 opcióra szól, a tételben 2 van — az ítélet nem értékelhető." });
  assert.equal(choiceVerdictProblem({ options: ["a", "b"], correctIndex: 0 }, [true, false]), null);
  const { verified, errors } = parseBankVerifierErrors({ errors: [], verified: [open1, "experience.quiz[99]"] }, new Set([open1]));
  assert.deepEqual([...verified], [open1]); assert.deepEqual(errors, []);
  // H48: azonos útvonalon csak az azonos kifogás olvad össze; nincs bank_check_late leminősítés
  const lektor: RawNote[] = [{ kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.quiz[0]", message: "a magyarázat téves" }];
  const verifierNotes: RawNote[] = [
    { kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.quiz[0]", message: `${BANK_VERIFIER_NOTE_PREFIX}a magyarázat téves` },
    { kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.quiz[0]", message: `${BANK_VERIFIER_NOTE_PREFIX}a kulcs rossz` },
    { kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.tasks[2]", message: `${BANK_VERIFIER_NOTE_PREFIX}${SINGLE_CHOICE_NOTE_MARK}2 helyes opció` },
  ];
  const mergedNotes = mergeBankVerifierNotes(lektor, verifierNotes, false);
  assert.deepEqual(mergedNotes.map((n) => [n.blockPath, n.subkind]), [["experience.quiz[0]", "contradicts_source"], ["experience.quiz[0]", "contradicts_source"]], "az azonos kifogás egyszer, a másik kifogás megmarad blokkolóként; a nyitott egyválasztós bank-jelzés a kapué");
  assert.equal(bankItemHash(e.quiz[0] as unknown as Record<string, unknown>).length, 24);
});

test("C6/H15: vak megoldó — elemenkénti sémahiba → az elem kimarad (partial), a „NINCS ELÉG ADAT” megőrizve és a lektor látja; saját skill", () => {
  const answer = parseBlindSolverAnswer({ solutions: [
    { task: "Téglatest: élek", answer: "a = 7, b = 11, c = 6 egység" },
    { task: "Piac: Piri", answer: NOT_ENOUGH },
    { task: "", answer: "hibás elem" },
    { task: "Réka", answer: "nincs elég adat" },
  ] });
  assert.deepEqual(answer.solutions.map((s) => s.task), ["Téglatest: élek"]);
  assert.deepEqual(answer.notEnough, ["Piac: Piri", "Réka"]);
  assert.equal(answer.partial, true);
  assert.deepEqual(parseBlindSolverAnswer({ solutions: [{ task: "a", answer: "1" }] }), { solutions: [{ task: "a", answer: "1" }], notEnough: [], partial: false });
  const block = blindSolutionsPromptBlock({ sourceHash: "h", model: "m", solutions: answer.solutions, notEnough: answer.notEnough, partial: true }).join("\n");
  assert.match(block, /„NINCS ELÉG ADAT”-nak jelölte .*Piac: Piri; Réka/);
  assert.match(block, /RÉSZLEGES/);
  assert.match(blindSolutionsPromptBlock({ sourceHash: "h", model: "m", solutions: [], notEnough: ["x"] }).join("\n"), /egyetlen forrásfeladatot sem tudott megoldani/);
  for (const must of ["NINCS ELÉG ADAT", "hibás alakú elem kimarad", "tananyag ismerete NÉLKÜL"]) assert.ok(SUPPORT_SKILLS["blind-solver"].includes(must), must);
  assert.ok(SUPPORT_SKILLS["blind-solver"].length < 2800);
});

test("ábra-kapu (determinisztikus rész): a fejezetből nem levezethető felirat figyelmeztetés, a megalapozott ábra átmegy", () => {
  const lesson = standardFusionFixture();
  const grounded = { ...lesson, sections: lesson.sections.map((s, i) => (i === 0 ? { ...s, blocks: [...s.blocks, { kind: "animate", animKind: "illustration", params: { svg: '<svg viewBox="0 0 800 520"><text>terület</text><text>alap</text></svg>' }, caption: "A háromszög területe.", coversConceptIds: ["area"] }] } : s)) } as unknown as Lesson;
  assert.deepEqual(figureCheck(grounded), []);
  const alien = { ...lesson, sections: lesson.sections.map((s, i) => (i === 0 ? { ...s, blocks: [...s.blocks, { kind: "animate", animKind: "illustration", params: { svg: '<svg viewBox="0 0 800 520"><text>Nílus</text><text>terület</text></svg>' }, caption: "Terület.", coversConceptIds: ["area"] }] } : s)) } as unknown as Lesson;
  const findings = figureCheck(alien);
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].ungrounded, ["Nílus"]);
  assert.match(findings[0].message, new RegExp(`${FIGURE_CHECK_VERSION}.*figyelmeztetés`));
  const structured = { ...lesson, sections: lesson.sections.map((s, i) => (i === 0 ? { ...s, blocks: [...s.blocks, { kind: "animate", animKind: "process", params: { steps: ["Az alapot megszorozzuk a magassággal", "Piramis"] }, caption: "Lépések.", coversConceptIds: ["area"] }] } : s)) } as unknown as Lesson;
  assert.deepEqual(figureCheck(structured), [], "strukturált fajta (process): a params a lektor kiírt nézetében áll, itt nem mérjük");
});
