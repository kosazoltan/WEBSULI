import { test } from "node:test";
import assert from "node:assert/strict";
import { applySourceCorrections, explicitClassroomOf, filterSourceCorrections, acceptedClassroom, correctionPromptLines } from "../server/studio/source-corrections";
import { buildAuthorPrompt, buildLektorPrompt, buildPedagoguePrompt, D1_RULE_TEXT, TRANSCRIPTION_RULE_TEXT } from "../server/studio/step-io";
import { normalizeOwnerInstruction } from "../shared/owner-instruction";
import { adjudicationStaysInDispute, dualReadOcr, ocrDisagreements } from "../server/studio/ocr";
import { ROLE_SKILLS } from "../server/studio/role-skills";
import { buildStructuredImprovement } from "../server/studio/structured-improvement";
import { fusionFixture, standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/** Spec 2026-09-23 — mért eset: map 2c43327f (kézírásos történelemfüzet, OCR-hibák). */
const concepts = [
  { localId: "c2", term: "holdnaptár", definition: "A föld-változása nyomán az ősök holdnaptárt készítettek.", quote: "föld-változása – holdnaptár készítése az ősökben", examWeight: "supporting" as const },
  { localId: "c25", term: "bódex", definition: "Bézzel írt, latin nyelvű könyv a középkorban.", quote: "bódex: bézzel írt, latin nyelvű könyv (középkorban)", examWeight: "core" as const },
  { localId: "c12", term: "őskor", definition: "A kezdetektől kb. Kr.e. 5000-ig tart.", quote: "őskor - a kezdetektől kb. Kr.e. 5000-ig.", examWeight: "core" as const },
];
const OWNER = "Itt nem okosítani kell a tananyagot, hanem a kódex. Ezt Bodexnek írja, illetve ez nem hetedik osztályos, hanem ötödik osztályos történelem. A holdváltozásához köti a holdnaptár, ez igaz: nem a földváltozás, hanem a holdváltozás.";

test("EARS 3: a szűrő a tanári és az átírási helyesbítést elfogadja, a kitalált tartalmat eldobja", () => {
  const raw = { corrections: [
    { localId: "c25", term: "kódex", definition: "Kézzel írt, latin nyelvű könyv a középkorban.", basis: "transcription", reason: "betűhiba" },
    { localId: "c2", definition: "A Hold változása nyomán az ősök holdnaptárt készítettek.", basis: "owner", reason: "tanári kérés" },
    { localId: "c12", definition: "A kezdetektől Kr. e. 3000-ig tart.", basis: "owner", reason: "okosítás" },
    { localId: "c99", term: "nincs ilyen", basis: "owner", reason: "" },
  ], classroom: 5 };
  const photo = filterSourceCorrections(raw, concepts, { instruction: OWNER, transcript: true });
  assert.deepEqual(photo.corrections.map(c => [c.localId, c.term ?? c.definition]), [["c25", "kódex"], ["c2", "A Hold változása nyomán az ősök holdnaptárt készítettek."]]);
  assert.equal(photo.corrections[0].from.term, "bódex", "a régi alak az auditban megmarad");
  assert.equal(photo.classroom, 5);
  assert.ok(photo.rejected.some(r => r.startsWith("c12")), "a kérésben nem szereplő új szám/tény nem kerülhet be");
  assert.ok(photo.rejected.some(r => r.startsWith("c99")));
  // Nem fotóforrás: átírási alap nem használható — csak a kérés igazol.
  const text = filterSourceCorrections({ corrections: [{ localId: "c25", term: "kódex", basis: "transcription", reason: "" }] }, concepts, { transcript: false });
  assert.equal(text.corrections.length, 0);
  // Háromnál több betűs eltérés nem „betűhiba”.
  const far = filterSourceCorrections({ corrections: [{ localId: "c25", term: "pergamen", basis: "transcription", reason: "" }] }, concepts, { transcript: true });
  assert.equal(far.corrections.length, 0);
});

test("a helyesbítés az idézetet sosem írja át", () => {
  const fixed = applySourceCorrections(concepts, [{ localId: "c25", term: "kódex", basis: "transcription", reason: "", from: { term: "bódex" } }]);
  assert.equal(fixed[1].term, "kódex");
  assert.equal(fixed[1].quote, concepts[1].quote);
});

test("EARS 2: az évfolyamot csak a tanár kifejezett, nem tagadott megnevezése adja", () => {
  assert.equal(explicitClassroomOf(OWNER), 5, "a „nem hetedik” tagadott, az „ötödik” érvényes");
  assert.equal(explicitClassroomOf("Kérlek 5. osztályos szinten, röviden."), 5);
  assert.equal(explicitClassroomOf("7-es évfolyam"), 7);
  assert.equal(explicitClassroomOf("rövidítsd le"), undefined);
  assert.equal(acceptedClassroom(5, OWNER), 5);
  assert.equal(acceptedClassroom(6, OWNER), undefined);
  assert.equal(acceptedClassroom(5, "rövidebb legyen"), undefined);
});

test("EARS 1 + 4: a kérés és a helyesbítés-lista a tervkészítő, a szerző és a lektor promptjában", () => {
  const instruction = normalizeOwnerInstruction("  Rövidebb magyarázatokat kérek, 5. osztályos szinten.  ")!;
  const corrections = [{ localId: "c25", term: "kódex", basis: "transcription" as const, reason: "betűhiba", from: { term: "bódex" } }];
  const map = { subject: "Történelem", classroom: 5, concepts };
  const outline = [{ heading: "Kódexek", conceptIds: ["c25"], plannedBlocks: ["explain"], animationSuggestions: [] }];
  const owner = { instruction, corrections };
  for (const prompt of [buildPedagoguePrompt(map, undefined, owner), buildAuthorPrompt(outline, map, [], undefined, owner), buildLektorPrompt(fusionFixture(), map, [], owner)]) {
    assert.match(prompt, /A TANÁR KÉRÉSE/);
    assert.ok(prompt.includes(instruction));
    assert.match(prompt, /FORRÁS-HELYESBÍTÉSEK/);
    assert.match(prompt, /„bódex” → „kódex”/);
  }
  const lektor = buildLektorPrompt(fusionFixture(), map);
  assert.ok(lektor.includes(D1_RULE_TEXT), "a D1 változatlanul benne van");
  assert.ok(lektor.includes(TRANSCRIPTION_RULE_TEXT));
  assert.match(lektor, /föld-változása – holdnaptár készítése/, "a mért hamis blokkoló kalibráló példa");
  assert.doesNotMatch(lektor, /A TANÁR KÉRÉSE/, "kérés nélkül nincs kérés-blokk (régi prompt-hash)");
  assert.match(ROLE_SKILLS.lektor, /Átírási hiba/);
  assert.match(ROLE_SKILLS.ocr, /Magyar kézírás/);
  assert.deepEqual(correctionPromptLines(undefined), []);
  assert.equal(normalizeOwnerInstruction("   "), undefined);
});

test("EARS 5: javításnál a kérés helyesbítést és évfolyamot hoz, és mindhárom szerep megkapja", async () => {
  const original = fusionFixture(); const e = standardFusionFixture().experience!;
  const source = { subject: original.subject, classroom: original.classroom, concepts: [{ localId: "area", term: "terület", definition: "Az alap és a magasság szorzatának fele.", examWeight: "core" as const }] };
  const instruction = `A terület definícióját pontosítsd; ${original.classroom === 6 ? 5 : 6}. osztályos szinten.`;
  const grade = original.classroom === 6 ? 5 : 6;
  const seen: Record<string, string[]> = { pedagogue: [], author: [], lektor: [] };
  let authorCalls = 0;
  const result = await buildStructuredImprovement(original, source, async (step, system, user) => {
    seen[step].push(system + "\n" + user);
    if (step === "pedagogue") return { corrections: [], classroom: grade };
    if (step === "lektor") return { notes: [] };
    return authorCalls++ === 0 ? { ...original, classroom: grade } : { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] };
  }, instruction);
  assert.equal(seen.pedagogue.length, 1, "a helyesbítő hívás a szerző előtt fut");
  assert.equal(result.candidate.classroom, grade, "a kért évfolyam elfogadott");
  assert.equal(result.owner.classroom, grade);
  assert.ok(seen.author[0].includes(instruction) && seen.lektor[0].includes(instruction));
  // Kérés nélkül az évfolyam változatlan marad (a régi szerződés).
  await assert.rejects(buildStructuredImprovement(original, source, async (step) => step === "lektor" ? { notes: [] } : { ...original, classroom: grade }), /bankgyártás nem indult/);
});

test("kettős OCR: szószintű eltérés, a döntés csak a vitatott helyen változtathat", async () => {
  const first = "kódex: bézzel írt, latin nyelvű könyv";
  const second = "kódex: kézzel írt, latin nyelvű könyv";
  const disputes = ocrDisagreements(first, second);
  assert.deepEqual(disputes, [{ first: "bézzel", second: "kézzel" }]);
  assert.equal(adjudicationStaysInDispute(first, second, disputes), true);
  assert.equal(adjudicationStaysInDispute(first, "kódex: kézzel írt, görög nyelvű könyv", disputes), false, "vitán kívüli átírás tilos");
  const image = { name: "a.jpg", kind: "image" as const, content: "data:image/jpeg;base64,AA" };
  let adjudicated = 0;
  const dual = dualReadOcr(async () => first, async () => second, async () => { adjudicated++; return second; });
  assert.equal(await dual(image), second);
  assert.equal(adjudicated, 1);
  const rogue = dualReadOcr(async () => first, async () => second, async () => "teljesen más szöveg");
  assert.equal(await rogue(image), first, "a vitán kívül változtató döntés helyett az első olvasat marad");
  const agree = dualReadOcr(async () => first, async () => first, async () => { throw new Error("nem hívható"); });
  assert.equal(await agree(image), first, "egyező olvasatnál nincs döntő hívás");
  const secondDown = dualReadOcr(async () => first, async () => { throw new Error("429"); }, async () => second);
  assert.equal(await secondDown(image), first, "a második olvasó hibája nem állítja meg az OCR-t");
});

test("tananyagjavító skill: elöl a skill, a kérés végén az ellenőrzés, a bennmaradt régi alak javító kört vált ki", async () => {
  const { REPAIR_SKILL, staleFormProblems, staleForms, withRepairSkill } = await import("../server/studio/repair-skill");
  const { ROLE_SKILL_REQUIRED_HEADINGS } = await import("../server/studio/role-skills");
  for (const heading of ROLE_SKILL_REQUIRED_HEADINGS) assert.ok(REPAIR_SKILL.includes(heading), heading);
  for (const guard of [/Teljes bejárás/, /Tényforrás/, /Minimális beavatkozás/, /Belső igazság/]) assert.match(REPAIR_SKILL, guard);
  assert.equal(withRepairSkill(withRepairSkill("x")), withRepairSkill("x"), "idempotens");
  const fix = [{ localId: "area", term: "terület", basis: "owner" as const, reason: "", from: { term: "terlet" } }];
  assert.deepEqual(staleForms(fix), ["terlet"]);
  const lesson = fusionFixture();
  const dirty = structuredClone(lesson);
  dirty.sections.at(-1)!.blocks.push({ kind: "recap", bullets: ["A terlet képlete."] });
  assert.equal(staleFormProblems(lesson, fix).length, 0);
  assert.match(staleFormProblems(dirty, fix)[0], /régi alak/);

  const e = standardFusionFixture().experience!;
  const source = { subject: lesson.subject, classroom: lesson.classroom, concepts: [{ localId: "area", term: "terlet", definition: "Az alap és a magasság szorzatának fele.", examWeight: "core" as const }] };
  const systems: string[] = []; const users: string[] = []; let authorCalls = 0;
  await buildStructuredImprovement(lesson, source, async (step, system, user) => {
    if (step === "pedagogue") return { corrections: [{ localId: "area", term: "terület", basis: "owner", reason: "elírás" }] };
    if (step === "lektor") { assert.match(system, /SZAKASZ-SKILL: lektor/); return { notes: [] }; }
    if (!system.includes("TANANYAGJAVÍTÓ SKILL")) return { methods: e.methods, tasks: e.tasks, quiz: e.quiz, glossary: [] };
    systems.push(system); users.push(user);
    return authorCalls++ === 0 ? dirty : lesson;
  }, "A terlet szó elírás, helyesen terület.");
  assert.equal(systems.length, 2, "a bennmaradt régi alak miatt egy javító kör futott");
  assert.ok(systems[0].startsWith("=== TANANYAGJAVÍTÓ SKILL"), "a skill a rendszerutasítás elején");
  assert.match(systems[0], /SZAKASZ-SKILL: author/);
  assert.match(users[0].slice(-600), /ZÁRÓ ELLENŐRZÉS[\s\S]*„terlet”/, "az ellenőrző lista a kérés végén");
  assert.match(users[1], /régi alak/);
});

test("Tananyagjavító menü: a javító út szerep-skilljei verzióval", async () => {
  const { repairRoleSkills } = await import("../server/studio/role-skills");
  const roles = repairRoleSkills();
  assert.deepEqual(roles.map(r => r.role), ["author", "lektor", "bank", "ocr"]);
  for (const r of roles) { assert.match(r.version, /^[a-f0-9]{12}$/); assert.match(r.text, /## Tilalmak/); }
});
