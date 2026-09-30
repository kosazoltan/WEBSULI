import assert from "node:assert/strict";
import test from "node:test";

import {
  BANK_CHECK_LATE_SUBKIND,
  BANK_VERIFIER_NOTE_PREFIX,
  bankItemHash,
  bankVerifierChunks,
  buildBankVerifierPrompt,
  mergeBankVerifierNotes,
  mergeVerifierRetry,
  openChoiceFlags,
  parseBankVerifierErrors,
  runBankVerifier,
  SINGLE_CHOICE_NOTE_MARK,
} from "../server/studio/bank-verifier";
import { classifyNotes, type RawNote } from "../server/studio/lektor";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import type { BlindSolutions } from "../server/studio/blind-solver";

/** Spec 2026-09-24 (docs/specs/2026-09-24-bank-ellenor.md). */

const BLIND: BlindSolutions = { sourceHash: "h", model: "claude-opus-5-5", solutions: [{ task: "1. feladat", answer: "39" }] };

function twoSectionLesson() {
  const lesson = standardFusionFixture();
  const e = lesson.experience!;
  lesson.sections = [lesson.sections[0], { ...lesson.sections[0], heading: "Második fejezet" }];
  e.quiz = e.quiz.map((q, i) => (i < 2 ? { ...q, sectionIndex: 1 } : q));
  return lesson;
}

test("bank-ellenőr: fejezetenkénti darabok útvonallal, azonosítók nélkül; a hibátlannak talált tétel kimarad", () => {
  const lesson = twoSectionLesson();
  const e = lesson.experience!;
  const chunks = bankVerifierChunks(lesson);
  assert.deepEqual(chunks.map((c) => c.sectionIndex), [0, 1]);
  const total = e.methods.length + e.tasks.length + e.quiz.length;
  assert.equal(chunks.reduce((n, c) => n + c.items.length, 0), total);
  assert.deepEqual(chunks[1].items.map((i) => i.path), ["experience.quiz[0]", "experience.quiz[1]"]);
  for (const key of ["id", "sourceHash", "coversConceptIds", "sectionIndex"]) assert.equal(key in chunks[1].items[0].item, false, key);
  assert.equal(chunks[1].items[0].item.question, e.quiz[0].question);

  const cleared = new Set([bankItemHash(e.quiz[0] as unknown as Record<string, unknown>)]);
  const again = bankVerifierChunks(lesson, cleared);
  assert.deepEqual(again[1].items.map((i) => i.path), ["experience.quiz[1]"]);
  // A hash a tartalomhoz kötött: a változott tétel újra ellenőrzésre megy.
  const changed = { ...e.quiz[0], question: e.quiz[0].question + " (javítva)" };
  assert.notEqual(bankItemHash(changed as unknown as Record<string, unknown>), [...cleared][0]);
});

test("bank-ellenőr: csak a darab útvonala fogadható el; egy tételhez a KÜLÖNÁLLÓ kifogások megmaradnak, az azonos egyszer (U5/H48); hibás alak kivételt dob", () => {
  const allowed = new Set(["experience.quiz[0]", "experience.tasks[2]"]);
  const { errors, rejected } = parseBankVerifierErrors({ errors: [
    { path: "experience.quiz[0]", message: "Mi hamis: a | Bizonyíték: b | Javítás iránya: c" },
    { path: "experience.quiz[0]", message: "ismétlés" },
    { path: "experience.quiz[0]", message: "ismétlés" },
    { path: "experience.quiz[99]", message: "kitalált" },
  ] }, allowed);
  assert.deepEqual(errors.map((e) => e.path), ["experience.quiz[0]", "experience.quiz[0]"]);
  assert.deepEqual(rejected, ["experience.quiz[99]"]);
  assert.deepEqual(parseBankVerifierErrors({}, allowed).errors, []);
  assert.throws(() => parseBankVerifierErrors({ errors: "nem lista" }, allowed));
});

test("bank-ellenőr: a prompt a skill-lel indul, a vak megoldások és a tételek adatként szerepelnek", () => {
  const lesson = twoSectionLesson();
  const chunk = bankVerifierChunks(lesson)[1];
  const prompt = buildBankVerifierPrompt(chunk, BLIND, lesson);
  assert.match(prompt, /^=== TÁMOGATÓ SKILL: bank-verifier/);
  assert.match(prompt, /FÜGGETLEN VAK MEGOLDÁSOK[^]*"answer":"39"/);
  assert.match(prompt, /Második fejezet/);
  assert.match(prompt, /"path":"experience\.quiz\[1\]"/);
  assert.doesNotMatch(prompt, /"sourceHash"/);
});

test("bank-ellenőr: a bukott darab nem dob, a többi eredménye megmarad; a hibás tétel nem kerül a hibátlanok közé", async () => {
  const lesson = twoSectionLesson();
  const failures: number[] = [];
  const result = await runBankVerifier({
    lesson, blind: BLIND,
    call: async (system) => {
      // Spec 2026-09-29 (döntés 3): ítélet nélküli egyválasztós tétel nem „cleared” — a stub-modell helyes
      // opciónkénti ítéletet ad a két kvíztételre (a teszt szándéka változatlan: a hibás tétel nem cleared).
      const choices = [0, 1].map((i) => ({ path: `experience.quiz[${i}]`, truths: lesson.experience!.quiz[i].options.map((_, k) => k === lesson.experience!.quiz[i].correctIndex) }));
      if (system.includes("Második fejezet")) return { choices, errors: [{ path: "experience.quiz[1]", message: "Mi hamis: két igaz opció | Bizonyíték: 12 + 9 − 17 = 4 | Javítás iránya: 4" }] };
      throw new Error("időtúllépés");
    },
    onChunkError: (sectionIndex) => failures.push(sectionIndex),
  });
  assert.deepEqual(failures, [0]);
  assert.equal(result.failedChunks, 1);
  assert.equal(result.checked, 2);
  assert.deepEqual(result.notes, [{ kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.quiz[1]",
    message: BANK_VERIFIER_NOTE_PREFIX + "Mi hamis: két igaz opció | Bizonyíték: 12 + 9 − 17 = 4 | Javítás iránya: 4", itemId: lesson.experience!.quiz[1].id }]);
  assert.deepEqual(result.cleared, [bankItemHash(lesson.experience!.quiz[0] as unknown as Record<string, unknown>)]);
  assert.equal(classifyNotes(result.notes)[0].blocking, true);
});

test("bank-ellenőr: összefésülés (U5/H48) — azonos útvonalon csak az AZONOS kifogás olvad össze, az eltérő megmarad; nincs késői (bank_check_late) leminősítés", () => {
  const lektor: RawNote[] = [{ kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.quiz[0]", message: "a magyarázat téves" }];
  const verifier: RawNote[] = [
    { kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.quiz[0]", message: BANK_VERIFIER_NOTE_PREFIX + "a magyarázat téves" },
    { kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.quiz[0]", message: BANK_VERIFIER_NOTE_PREFIX + "a kulcs rossz" },
    { kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.tasks[3]", message: BANK_VERIFIER_NOTE_PREFIX + "új" },
  ];
  const blocking = mergeBankVerifierNotes(lektor, verifier, true);
  assert.deepEqual(blocking.map((n) => n.message.replace(BANK_VERIFIER_NOTE_PREFIX, "")), ["a magyarázat téves", "a kulcs rossz", "új"], "az azonos kifogás egyszer, a második tényhiba ugyanazon a tételen megmarad");
  assert.equal(classifyNotes(blocking).filter((n) => n.blocking).length, 3);
  const late = mergeBankVerifierNotes(lektor, verifier, false);
  assert.deepEqual(late.map((n) => n.subkind), ["contradicts_source", "contradicts_source", "contradicts_source"], "a keret elfogyása nem cáfolja a hibás tételt — a limit-tábla kezeli kivehető tételként");
  assert.ok(classifyNotes(late).every((n) => n.blocking));
});

/* Spec 2026-09-29 (docs/specs/2026-09-29-egy-helyes-valasz.md), döntés 3: opciónkénti ítélet, a KÓD dönt. */

const NINE = { question: "Melyik szám osztható 9-cel?", options: ["234", "567", "891", "648"], correctIndex: 0, feedbackPerOption: ["Igen.", "Nem.", "Nem.", "Nem."] };

function lessonWithCheck() {
  const lesson = standardFusionFixture();
  lesson.sections[0].blocks.push({ kind: "check", ...NINE, coversConceptIds: ["area"] });
  return lesson;
}

/** A helyes modell: minden választós tételre a kulcs szerinti ítélet; `override` útvonalanként felülír. */
function truthsFor(lesson: ReturnType<typeof lessonWithCheck>, override: Record<string, boolean[] | null>) {
  const e = lesson.experience!;
  const items: Array<[string, { options?: string[]; correctIndex?: number }]> = [
    ...e.quiz.map((q, i): [string, typeof q] => [`experience.quiz[${i}]`, q]),
    ...e.methods.map((m, i): [string, typeof m] => [`experience.methods[${i}]`, m]),
    ...lesson.sections.flatMap((s, i) => s.blocks.map((b, j): [string, { options?: string[]; correctIndex?: number }] => [`sections[${i}].blocks[${j}]`, b as { options?: string[]; correctIndex?: number }])),
  ];
  return items.filter(([, it]) => Array.isArray(it.options) && Number.isInteger(it.correctIndex)).flatMap(([path, it]) => {
    if (path in override) return override[path] ? [{ path, truths: override[path] }] : [];
    return [{ path, truths: it.options!.map((_, k) => k === it.correctIndex) }];
  });
}

test("egyválasztós: a darab a lecke check blokkjait is tartalmazza; a prompt kulcs nélkül, vak megoldás nélkül is épül", () => {
  const lesson = lessonWithCheck();
  const chunk = bankVerifierChunks(lesson)[0];
  const check = chunk.items.find((i) => i.path === "sections[0].blocks[4]");
  assert.ok(check, "a check blokk a darabban");
  assert.equal("coversConceptIds" in check.item, false);
  const prompt = buildBankVerifierPrompt(chunk, undefined, lesson);
  assert.match(prompt, /FÜGGETLEN VAK MEGOLDÁSOK[^\n]*\n\[\]/);
  assert.match(prompt, /"choices"/);
  assert.doesNotMatch(prompt, /"correctIndex"/, "a kulcs nem megy a modellnek");
  assert.doesNotMatch(prompt, /"feedbackPerOption"/, "a kulcsot eláruló visszajelzés sem");
  const gateMethod = lesson.experience!.methods.at(-1)!;
  assert.equal(gateMethod.kind, "gate");
  assert.doesNotMatch(prompt, new RegExp(gateMethod.answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "választós módszer answer-e sem");
  assert.match(prompt, /"question":"Melyik szám osztható 9-cel\?"/);
});

test("egyválasztós (E3): ≠1 igaz, nem a kulcs → blokkoló jegyzet; hosszeltérés (U5/H32) és hiányzó ítélet → eldöntetlen, nem cleared", async () => {
  const lesson = lessonWithCheck();
  const e = lesson.experience!;
  const result = await runBankVerifier({
    lesson, blind: undefined,
    call: async () => ({ errors: [{ path: "experience.quiz[1]", message: "Mi hamis: a magyarázat | Bizonyíték: x | Javítás iránya: y" }], choices: truthsFor(lesson, {
      "sections[0].blocks[4]": [true, true, true, true],
      "experience.quiz[1]": e.quiz[1].options.map((_, k) => k === (e.quiz[1].correctIndex + 1) % e.quiz[1].options.length),
      "experience.quiz[2]": [false, true],
      "experience.quiz[3]": null,
    }) }),
  });
  const byPath = new Map(result.notes.map((n) => [n.blockPath, n.message]));
  assert.match(byPath.get("sections[0].blocks[4]") ?? "", /^Bank-ellenőr: Egyválasztós tétel: 4 helyes opció/);
  assert.match(byPath.get("experience.quiz[1]") ?? "", /Egyválasztós tétel: .*nem a kulcs[^]*Mi hamis: a magyarázat/);
  assert.equal(byPath.has("experience.quiz[2]"), false, "U5/H32: a hibás hosszúságú ítélet ellenőrző-hiba → eldöntetlen, nem tartalmi jegyzet");
  assert.equal(byPath.has("experience.quiz[3]"), false, "hiányzó ítélet nem jegyzet ebben a körben");
  assert.deepEqual(result.unverifiedChoices.map((u) => u.path), ["experience.quiz[2]", "experience.quiz[3]"]);
  assert.ok(classifyNotes(result.notes).every((n) => n.blocking));
  const clearedSet = new Set(result.cleared);
  for (const path of ["sections[0].blocks[4]", "experience.quiz[1]", "experience.quiz[2]", "experience.quiz[3]"]) {
    const item = path.startsWith("sections") ? lesson.sections[0].blocks[4] : e.quiz[Number(path.match(/\d+/)![0])];
    assert.equal(clearedSet.has(bankItemHash(item as unknown as Record<string, unknown>)), false, path);
  }
  assert.equal(clearedSet.has(bankItemHash(e.quiz[4] as unknown as Record<string, unknown>)), true, "helyes ítélet → cleared");
});

test("egyválasztós: a jegyzet sosem késői figyelmeztetés — bank-tételnél a kapuhoz megy (choiceFlags), check blokknál blokkol", () => {
  const choiceBank: RawNote = { kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.quiz[0]", message: BANK_VERIFIER_NOTE_PREFIX + SINGLE_CHOICE_NOTE_MARK + "4 helyes opció" };
  const choiceCheck: RawNote = { ...choiceBank, blockPath: "sections[0].blocks[4]" };
  const plain: RawNote = { ...choiceBank, blockPath: "experience.tasks[1]", message: BANK_VERIFIER_NOTE_PREFIX + "más hiba" };
  const late = mergeBankVerifierNotes([], [choiceBank, choiceCheck, plain], false);
  assert.deepEqual(late.map((n) => [n.blockPath, n.subkind]), [["sections[0].blocks[4]", "contradicts_source"], ["experience.tasks[1]", "contradicts_source"]], "U5/H48: nincs késői leminősítés");
  assert.equal(classifyNotes(late)[0].blocking, true);
  const verifier = { notes: [choiceBank, choiceCheck, plain], cleared: [], checked: 3, failedChunks: 0, rejectedPaths: [], unverifiedChoices: [{ path: "experience.quiz[7]", hash: "h7" }], unverifiedOpen: [] };
  assert.deepEqual(openChoiceFlags(verifier, false).map((f) => f.path), ["experience.quiz[0]", "experience.quiz[7]"]);
  // Review R1(c) (spec „Review-javítás 2026-09-29”): az ítélet nélküli tétel javítható körben is nyitott jelzés.
  assert.deepEqual(openChoiceFlags(verifier, true).map((f) => f.path), ["experience.quiz[7]"],
    "javító kör jár: a jegyzet blokkolóként megy a csak-bank körbe; az ítélet nélküli tétel akkor is a kapuhoz megy");
  assert.equal(mergeBankVerifierNotes([], [choiceBank], true)[0].subkind, "contradicts_source");
});

/* Review-javítás 2026-09-29 (PR #134): R1 fail-open, R2 deduplikáció. */

test("review R1(a): az elbukott darab kulcsos tételei ítélet nélküliként megmaradnak (unverifiedChoices)", async () => {
  const lesson = twoSectionLesson();
  const result = await runBankVerifier({ lesson, call: async () => { throw new Error("időtúllépés"); } });
  assert.equal(result.failedChunks, 2);
  const e = lesson.experience!;
  const keyed = [...e.quiz.map((_, i) => `experience.quiz[${i}]`), ...e.methods.flatMap((m, i) => (m.options ? [`experience.methods[${i}]`] : []))].sort();
  assert.deepEqual(result.unverifiedChoices.map((u) => u.path).sort(), keyed);
  assert.equal(result.unverifiedChoices.some((u) => u.path.startsWith("experience.tasks")), false, "nyitott feladat nem egyválasztós");
  // Review #163 (P1): az elbukott darab NYÍLT tételei is eldöntetlenek, és a kapuhoz mennek (nem publikálhatók ellenőrizetlenül).
  const open = [...e.tasks.map((_, i) => `experience.tasks[${i}]`), ...e.methods.flatMap((m, i) => (m.options ? [] : [`experience.methods[${i}]`]))].sort();
  assert.deepEqual(result.unverifiedOpen.map((u) => u.path).sort(), open);
  assert.deepEqual(openChoiceFlags(result, true).map((f) => f.path).sort(), [...keyed, ...open].sort(), "javítható körben is kapu-jelzés — egyválasztós és nyílt tétel is");
});

test("review R1(b): onlyPaths — csak a kért útvonalak mennek a modellhez", async () => {
  const lesson = twoSectionLesson();
  const prompts: string[] = [];
  const result = await runBankVerifier({ lesson, onlyPaths: new Set(["experience.quiz[1]", "experience.quiz[3]"]), call: async (system) => { prompts.push(system); return { errors: [], choices: [] }; } });
  assert.equal(prompts.length, 2, "a két útvonal két fejezetben van");
  assert.equal(result.checked, 2);
  const all = prompts.join("\n");
  assert.match(all, /"path":"experience\.quiz\[1\]"/);
  assert.match(all, /"path":"experience\.quiz\[3\]"/);
  assert.doesNotMatch(all, /"path":"experience\.(quiz\[(0|2|4)\]|tasks|methods)/);
  assert.deepEqual(bankVerifierChunks(lesson, new Set(), new Set(["experience.quiz[3]"])).flatMap((c) => c.items.map((i) => i.path)), ["experience.quiz[3]"]);
});

test("review R1(b) + U5/H51: az újrafutás eredménye összefésülve — a második kör ítélete KIEGÉSZÍTI az elsőt, a korábbi tartalmi jegyzet nem törlődik", () => {
  const note = (path: string, message: string): RawNote => ({ kind: "source_conflict", subkind: "contradicts_source", blockPath: path, message });
  const first = { notes: [note("experience.quiz[0]", "első"), note("experience.quiz[2]", "szabad hiba")], cleared: ["a"], checked: 5, failedChunks: 1, rejectedPaths: ["x"],
    unverifiedChoices: [{ path: "experience.quiz[2]", hash: "h2" }, { path: "experience.quiz[3]", hash: "h3" }], unverifiedOpen: [] };
  const retry = { notes: [note("experience.quiz[2]", BANK_VERIFIER_NOTE_PREFIX + SINGLE_CHOICE_NOTE_MARK + "2 helyes opció")], cleared: ["h3", "h2"], checked: 2, failedChunks: 0, rejectedPaths: [], unverifiedChoices: [], unverifiedOpen: [] };
  const merged = mergeVerifierRetry(first, retry);
  assert.deepEqual(merged.notes.map((n) => [n.blockPath, n.message]), [["experience.quiz[0]", "első"], ["experience.quiz[2]", "szabad hiba"], ["experience.quiz[2]", BANK_VERIFIER_NOTE_PREFIX + SINGLE_CHOICE_NOTE_MARK + "2 helyes opció"]]);
  assert.ok(!merged.cleared.includes("h2"), "nyitott tartalmi jegyzettel a tétel nem lehet cleared az újrahívás után sem");
  assert.deepEqual(merged.cleared, ["a", "h3"]);
  assert.deepEqual(merged.unverifiedChoices, []);
  assert.equal(merged.failedChunks, 1);
  assert.deepEqual(merged.rejectedPaths, ["x"]);
});

test("review R2: a lektor ugyanazon útvonalú (warn) jegyzete nem fedi el az egyválasztós blokkolót", () => {
  const lektor: RawNote[] = [{ kind: "age", blockPath: "experience.quiz[0]", message: "Kicsit nehéz." }];
  const choice: RawNote = { kind: "source_conflict", subkind: "contradicts_source", blockPath: "experience.quiz[0]", message: BANK_VERIFIER_NOTE_PREFIX + SINGLE_CHOICE_NOTE_MARK + "4 helyes opció" };
  for (const blocking of [true, false]) {
    const merged = mergeBankVerifierNotes(lektor, [choice], blocking);
    if (blocking) {
      assert.deepEqual(merged.map((n) => n.message), ["Kicsit nehéz.", choice.message]);
      assert.equal(classifyNotes(merged).filter((n) => n.blocking).length, 1);
    }
  }
  const check = { ...choice, blockPath: "sections[0].blocks[4]" };
  const late = mergeBankVerifierNotes([{ ...lektor[0], blockPath: "sections[0].blocks[4]" }], [check], false);
  assert.equal(classifyNotes(late).filter((n) => n.blocking).length, 1, "check blokknál késői körben is blokkol");
});
