import { test } from "node:test";
import assert from "node:assert/strict";
import { introducesNewProperNoun, rewriteSourceReferences } from "../server/studio/source-reference";
import { groundingReport } from "../server/studio/grounding";
import { targetedRepairSections } from "../server/studio/section-patch";
import {
  TEACHING_CONTRACT, OUTLINE_LIMITS, buildAuthorPrompt, buildPedagoguePrompt, buildSchemaRetryUser, checkAnimatorResult,
  dropClampedKeyPhrases, outlineClamps, outlineSchema,
} from "../server/studio/step-io";
import { LESSON_TEXT_LIMITS, lessonSchema, type Lesson } from "../shared/lesson-schema";
import { LESSON_QUALITY_CONTRACT } from "../shared/lesson-quality";
import { ROLE_SKILLS } from "../server/studio/role-skills";
import { SUPPORT_SKILLS } from "../server/studio/support-skills";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";

/* Spec 2026-09-30-utasitasrendszer-rendbetetel (U4): C3/H20/H33, C4/H5, H6 sectionIdx, H39, H50, H12, H13. */

const lessonWith = (explain: string): Lesson => ({
  title: "Mezopotámia", subject: "történelem", classroom: 5, mapId: "m1", sourceOnly: true, misconceptions: [],
  sections: [{ heading: "Babilon", probaEnabled: false, blocks: [{ kind: "explain", text: explain, depth: "core", readAloud: true, coversConceptIds: ["c1"] }] }],
} as unknown as Lesson);

test("H33 (C3): jelentésőrző átírás — a hivatkozó keret törlése átmegy, az új tulajdonnév vagy a needsSource-jelzett mondat az eredeti marad", async () => {
  // regressziós mondatpárok: (eredeti, javasolt átírás, elfogadható?)
  const pairs: Array<[string, string, boolean]> = [
    ["A forrás Istárt a szerelem istenének nevezi.", "Istár a szerelem istene.", true],
    ["A füzet szerint a Nílus évente árad.", "A Nílus évente árad.", true],
    ["Babilon városa Kr. e. 2500 körül szerepel a füzetben.", "Babilon városát Kr. e. 2500 körül Hammurapi alapította.", false], // új tulajdonnév = új tény
    ["A forrás szerint a piramisokat rabszolgák építették.", "A piramisokat 20 000 munkás építette.", false],                      // új szám
  ];
  for (const [before, after, ok] of pairs) {
    const L = lessonWith(before);
    const result = await rewriteSourceReferences(L, async () => ({ items: [{ path: "sections[0].blocks[0].text", text: after }] }));
    assert.equal((result.lesson.sections[0].blocks[0] as { text: string }).text, ok ? after : before, `${before} → ${after}`);
    assert.deepEqual([result.rewritten, result.rejected], ok ? [1, 0] : [0, 1], before);
  }
  assert.equal(introducesNewProperNoun("A forrás Istárt a szerelem istenének nevezi.", "Istár a szerelem istene."), false, "ragozott alak az eredetiben");
  assert.equal(introducesNewProperNoun("Babilon városa szerepel a füzetben.", "Babilon városát Hammurapi alapította."), true);
  // needsSource: a modell jelzi, hogy a hivatkozás maga az állítmány — az eredeti marad, külön számolva
  const kept = await rewriteSourceReferences(lessonWith("Babilon városa Kr. e. 2500 körül szerepel a füzetben."), async () => ({ items: [{ path: "sections[0].blocks[0].text", text: "Babilon városa Kr. e. 2500 körül szerepel a füzetben.", needsSource: true }] }));
  assert.equal((kept.lesson.sections[0].blocks[0] as { text: string }).text, "Babilon városa Kr. e. 2500 körül szerepel a füzetben.");
  assert.deepEqual([kept.rewritten, kept.rejected, kept.needsSource], [0, 0, 1]);
  for (const must of ["needsSource", "Csak a hivatkozó tagmondatot", "Új igét, évszámot, okot NEM találsz ki"]) assert.ok(SUPPORT_SKILLS["kid-text-fixer"].includes(must), must);
  assert.doesNotMatch(SUPPORT_SKILLS["kid-text-fixer"], /„Babilon városa Kr\. e\. 2500 körül szerepel a füzetben” → „Babilon városa Kr\. e\. 2500 körül jött létre”/, "a H33 hibás példa (új tény) törölve");
});

test("H6 (C4): a megalapozatlan címke lelete fejezettel érkezik (sectionIdx), és a célzott javítás abból dolgozik", () => {
  const concepts = [{ localId: "c1", examWeight: "core" as const, term: "háromszög területe", definition: "x", quote: "y" }];
  const blocks = [
    { kind: "explain", text: "A négyzet kerülete négyszer az oldal.", coversConceptIds: ["c1"] },
    { kind: "explain", text: "A háromszög területe az alap és a magasság szorzatának fele.", coversConceptIds: ["c1"] },
  ];
  const report = groundingReport(blocks, concepts, [0, 1]);
  assert.equal(report.ungrounded.length, 1);
  assert.equal(report.ungrounded[0].sectionIdx, 0);
  assert.equal(groundingReport(blocks, concepts).ungrounded[0].sectionIdx, undefined, "fejezetlista nélkül nincs sectionIdx (régi hívó)");
  const previous = { sections: [{ blocks: [{}] }, { blocks: [{}, {}] }] } as unknown as Lesson;
  assert.deepEqual(targetedRepairSections(previous, [], { ok: false, reasons: ["x"], ungrounded: [{ blockIndex: 99, sectionIdx: 1, conceptId: "c1" }] } as never), [1], "a sectionIdx erősebb a lapított indexnél");
  assert.deepEqual(targetedRepairSections(previous, [], { ok: false, reasons: ["x"], ungrounded: [{ blockIndex: 2, conceptId: "c1" }] } as never), [1], "régi kapujelentés: lapított indexből");
});

test("H39: az ábratervező hatókör-őre a fejezetcímet, a Próbát, az emojit és a tévhitlistát is méri", () => {
  const original = standardFusionFixture();
  const heading = checkAnimatorResult(original, { ...original, sections: original.sections.map((s, i) => (i === 0 ? { ...s, heading: `${s.heading} (átírva)` } : s)) });
  assert.equal(heading.ok, false); assert.match(heading.reasons.join(" "), /1\. szakasz fejléce/);
  const proba = checkAnimatorResult(original, { ...original, sections: original.sections.map((s, i) => (i === 0 ? { ...s, probaEnabled: !s.probaEnabled } : s)) });
  assert.equal(proba.ok, false);
  const emoji = checkAnimatorResult(original, { ...original, sections: original.sections.map((s, i) => (i === 0 ? { ...s, emoji: "🦖" } : s)) });
  assert.equal(emoji.ok, false);
  const misc = checkAnimatorResult(original, { ...original, misconceptions: [...original.misconceptions, { conceptId: "area", text: "Új tévhit." }] });
  assert.equal(misc.ok, false); assert.match(misc.reasons.join(" "), /misconceptions/);
  assert.equal(checkAnimatorResult(original, structuredClone(original)).ok, true);
});

test("H50: a vázlat korláton túli mezői jelölt állapot; a vágott kulcskifejezés kiesik a kötelező kiemelésből; a prompt kimondja a korlátokat", () => {
  const long = "x".repeat(OUTLINE_LIMITS.keyPhrase + 5);
  const raw = { sections: [
    { heading: "A", conceptIds: ["c1"], plannedBlocks: ["explain"], animationSuggestions: ["a".repeat(OUTLINE_LIMITS.animationSuggestion + 1)], keyPhrases: ["rövid", long, "b", "c", "d", "e"], emoji: "🙂🙂🙂🙂🙂" },
    { heading: "B", conceptIds: ["c1"], plannedBlocks: ["explain"], animationSuggestions: [], keyPhrases: ["ok"] },
  ], misconceptions: [] };
  const clamps = outlineClamps(raw);
  assert.deepEqual(clamps.map((c) => [c.section, c.field]), [[0, "animationSuggestions"], [0, "keyPhrases"], [0, "keyPhrases"], [0, "emoji"]]);
  assert.match(clamps[1].detail, /elhagyva, nem kötelező kiemelés/);
  const parsed = outlineSchema.parse(raw);
  assert.equal(parsed.sections[0].keyPhrases!.length, 4, "a séma vág (4 elem, 40 karakter)");
  const cleaned = dropClampedKeyPhrases(parsed, raw);
  assert.deepEqual(cleaned.sections[0].keyPhrases, ["rövid", "b", "c", "d"], "a vágott kifejezés kiesik, a többiből az első 4 marad");
  assert.deepEqual(cleaned.sections[1].keyPhrases, ["ok"]);
  assert.deepEqual(outlineClamps({ sections: "nem tömb" }), []);
  const prompt = buildPedagoguePrompt({ subject: "matek", classroom: 5, concepts: [{ localId: "c1", examWeight: "core" }] });
  assert.match(prompt, new RegExp(`emoji legfeljebb ${OUTLINE_LIMITS.emoji} karakter; keyPhrases legfeljebb ${OUTLINE_LIMITS.keyPhrases} elem, elemenként ${OUTLINE_LIMITS.keyPhrase} karakter`));
  assert.match(prompt, /kivéve a záró „A leggyakoribb hibák” és „Ellenőrzés” fejezetet/, "H12: a záró fejezetek fogalomismétlése nem duplikáció");
  assert.match(ROLE_SKILLS.pedagogue, /KIVÉVE a záró „A leggyakoribb hibák” és „Ellenőrzés” fejezet/);
});

test("H13/B4: a szerzői prompt magyar, a TANÍTÁSI SZERZŐDÉS a séma számaival egyszer, a minőségi szerződés nem ismétlődik; célzott újrakérés folt-alakot kér", () => {
  const map = { title: "T", subject: "matek", classroom: 6, concepts: [{ localId: "c1", examWeight: "core" as const, term: "terület" }] };
  const sections = [{ heading: "H", conceptIds: ["c1"], plannedBlocks: ["explain" as const], animationSuggestions: [] as string[] }];
  const prompt = buildAuthorPrompt(sections, map, []);
  assert.match(prompt, /^Te vagy a SZERZŐ/);
  assert.match(prompt, /Korosztály: /);
  assert.doesNotMatch(prompt, /You are the lesson author|Hard rules|Age band/);
  assert.equal(prompt.split("TANÍTÁSI SZERZŐDÉS").length - 1, 1, "a tanítási szerződés pontosan egyszer");
  assert.equal(prompt.split(LESSON_QUALITY_CONTRACT).length - 1, 1, "a minőségi szerződés csak a közös módszer-szerződésen belül (a runbook adja külön)");
  assert.doesNotMatch(prompt, /reportba|say so in the report|mapId változatlan/);
  assert.match(TEACHING_CONTRACT, new RegExp(`explain\\.text ${LESSON_TEXT_LIMITS.explain}; example\\.problem ${LESSON_TEXT_LIMITS.problem}`));
  assert.match(TEACHING_CONTRACT, /UGYANABBAN a fejezetben egy explain már megalapozta/);
  assert.match(TEACHING_CONTRACT, /nem hivatkozik a forrásra, füzetre/);
  const tooLong = lessonWith("x".repeat(LESSON_TEXT_LIMITS.explain + 1));
  assert.equal(lessonSchema.safeParse(tooLong).success, false, "a szerződés száma a séma száma");
  assert.equal(lessonSchema.safeParse(lessonWith("x".repeat(LESSON_TEXT_LIMITS.explain))).success, true);
  const retry = buildSchemaRetryUser("hiba", { targetSections: [1, 3] });
  assert.match(retry, /FOLT-ALAKBAN/); assert.match(retry, /2, 4\. fejezetet/); assert.match(retry, /teljes lecke itt hiba/);
  assert.match(buildSchemaRetryUser("hiba"), /TELJES leckét/);
  assert.match(ROLE_SKILLS.author, /TANÍTÁSI SZERZŐDÉS \(rendszerutasítás\) a mérce/);
  assert.match(ROLE_SKILLS.author, /teljes lecke ott hiba/);
});
