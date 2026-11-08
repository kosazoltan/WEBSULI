import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAuthorPrompt, buildLektorPrompt } from "../server/studio/step-io";
import { bankStaticPrefix } from "../server/studio/experience-builder";
import { lessonHtmlSpecParts } from "../server/ai/lesson-html-spec";
import { webLessonAuthorPrompt } from "../server/studio/web-research-agent";
import { lessonOpenerEnabled } from "../server/studio/lesson-opener-flag";
import {
  LESSON_OPENER_HTML_CONTRACT, LESSON_OPENER_LEKTOR_CHECKLIST, OPENER_LEARNING_THEMES, OPENER_STAGES, PLAYFUL_AUTHOR_RULES, PLAYFUL_QUESTIONING_CONTRACT,
  learningThemesFor, lessonOpenerContract, lessonOpenerStageLine, openerStageForClassroom,
} from "../shared/lesson-opener";
import { standardFusionFixture } from "../shared/fixtures/lesson-fusion";
import { stripOpenerGoalLabel } from "../shared/lesson-opener";
import { descriptionAfterLessonChange, lessonTeaser, teaserFromText } from "../shared/lesson-teaser";

/* Spec 2026-11-08-nyitomese-jatekos-kerdezes (S2): Célkártya, 5 mondatos mini mese és játékos (IQ-) kérdezés — szerződések és kapcsoló. */

/** A kapcsolót állítja (undefined = nincs beállítva), a végén visszaállítja az előző értéket. */
function withFlag<T>(value: string | undefined, fn: () => T): T {
  const previous = process.env.STUDIO_LESSON_OPENER;
  try {
    if (value === undefined) delete process.env.STUDIO_LESSON_OPENER;
    else process.env.STUDIO_LESSON_OPENER = value;
    return fn();
  } finally {
    if (previous === undefined) delete process.env.STUDIO_LESSON_OPENER;
    else process.env.STUDIO_LESSON_OPENER = previous;
  }
}

const map = { title: "T", subject: "matek", classroom: 6, concepts: [{ localId: "c1", examWeight: "core" as const, term: "terület" }] };
const sections = [{ heading: "H", conceptIds: ["c1"], plannedBlocks: ["explain" as const], animationSuggestions: [] as string[] }];

test("A2: az évfolyam → lépcső leképezés (0, határok, érvénytelen értékek)", () => {
  const expected: Array<[number, string]> = [
    [0, "L4"], [1, "L1"], [2, "L1"], [3, "L2"], [4, "L2"], [5, "L3"], [6, "L3"], [7, "L4"], [8, "L4"], [9, "L5"], [10, "L5"], [11, "L6"], [12, "L6"], [-1, "L4"], [13, "L6"], [Number.NaN, "L4"],
  ];
  for (const [classroom, stage] of expected) assert.equal(openerStageForClassroom(classroom), stage, `classroom=${classroom}`);
});

test("A2: lépcsőspecifikáció és a tanulási témák évfolyam szerinti szűrése", () => {
  const stages = ["L1", "L2", "L3", "L4", "L5", "L6"] as const;
  assert.deepEqual(stages.map((s) => OPENER_STAGES[s].maxSentenceWords), [10, 12, 15, 18, 22, 22]);
  for (const s of stages) assert.equal(OPENER_STAGES[s].goalLabels.length, 4, `${s} Célkártya-címkék`);
  const first = learningThemesFor(1);
  assert.ok(!first.includes("időbeosztás"));
  assert.ok(!first.includes("döntés bizonytalanságban"));
  const last = learningThemesFor(12);
  assert.equal(OPENER_LEARNING_THEMES.length, 24);
  for (const t of OPENER_LEARNING_THEMES) assert.ok(last.includes(t.theme), `12. évfolyam: ${t.theme}`);
  const programming = learningThemesFor(0);
  assert.ok(programming.includes("forráskritika, álhírek"));
  assert.ok(!programming.includes("döntés bizonytalanságban"));
});

test("A3: a kapcsoló alapból KI, csak az „on” (szóközzel, kisbetű/nagybetű függetlenül) kapcsolja be", () => {
  assert.equal(lessonOpenerEnabled({}), false);
  assert.equal(lessonOpenerEnabled({ STUDIO_LESSON_OPENER: "on" }), true);
  assert.equal(lessonOpenerEnabled({ STUDIO_LESSON_OPENER: " ON " }), true);
  assert.equal(lessonOpenerEnabled({ STUDIO_LESSON_OPENER: "1" }), false);
});

test("A3: szerzői prompt — kapcsoló nélkül bájtra változatlan, bekapcsolva pontosan a szerződésekkel bővül", () => {
  const off = withFlag(undefined, () => buildAuthorPrompt(sections, map, []));
  const on = withFlag("on", () => buildAuthorPrompt(sections, map, []));
  assert.equal(on.replace("\n" + lessonOpenerContract(6, { section0InScope: true }) + "\n" + PLAYFUL_AUTHOR_RULES, ""), off);
  assert.ok(!off.includes("CÉLKÁRTYA"));
  assert.ok(on.includes("CÉLKÁRTYA"));
});

test("A4: szerzői prompt tartalma évfolyamonként (6. és 11. osztály)", () => {
  const on6 = withFlag("on", () => buildAuthorPrompt(sections, map, []));
  for (const needle of [
    "Lépcső: L3", "Célunk", "Ami nehezítheti", "Hogyan győzd le?", "PONTOSAN 5 mondat", "legfeljebb 15 szó", "Új tény NEM kerülhet be", "term",
    "recap blokkjának ELSŐ pontja", "1–6. évfolyamon tilos", "legalább egy check IQ-formájú", "A hint (ha adsz) irányt mutat",
  ]) assert.ok(on6.includes(needle), `6. osztály: ${needle}`);
  const on11 = withFlag("on", () => buildAuthorPrompt(sections, { ...map, classroom: 11 }, []));
  for (const needle of ["Lépcső: L6", "Tipikus buktató", "7–12. évfolyamon"]) assert.ok(on11.includes(needle), `11. osztály: ${needle}`);
  assert.ok(!on11.includes("mit érez a hős"));
});

test("A5: célzott javításnál a Célkártya és a mese csak akkor kerül a promptba, ha az 1. fejezet (0. index) a hatókör", () => {
  const outside = withFlag("on", () => buildAuthorPrompt(sections, map, [], { targetSections: [1] }));
  assert.ok(outside.includes("most nincs Célkártya és mini mese"));
  const inside = withFlag("on", () => buildAuthorPrompt(sections, map, [], { targetSections: [0] }));
  assert.ok(inside.includes("Lépcső: L3"));
});

test("A3/A4: lektori prompt — kapcsoló nélkül változatlan, bekapcsolva az ellenőrzőlistával bővül", () => {
  const lesson = standardFusionFixture();
  const off = withFlag(undefined, () => buildLektorPrompt(lesson, map));
  const on = withFlag("on", () => buildLektorPrompt(lesson, map));
  assert.equal(on.replace("\n" + LESSON_OPENER_LEKTOR_CHECKLIST, ""), off);
  for (const needle of ["NYITÓMESE-BIZTONSÁG:", "ne adj not_in_map jegyzetet", "pontosan 5 mondat"]) assert.ok(on.includes(needle), needle);
});

test("A3/A4: bank statikus előtag — bekapcsolva pontosan a játékos kérdezési szerződéssel bővül", () => {
  const off = withFlag(undefined, () => bankStaticPrefix());
  const on = withFlag("on", () => bankStaticPrefix());
  assert.equal(on, off + "\n" + PLAYFUL_QUESTIONING_CONTRACT);
  for (const needle of ["legalább EGY IQ-formájú kvízkérdés", "Melyik állítás hamis?", "mit kérdezett valójában"]) assert.ok(on.includes(needle), needle);
});

test("A3/A3b/A4: önálló HTML-út — a statikus spec évfolyamfüggetlen, a lépcső a téma-részbe kerül", () => {
  const input5 = { classroom: 5, seed: "Vulkánok", subjectHint: "földrajz" };
  const input9 = { classroom: 9, seed: "Petőfi", subjectHint: "irodalom" };
  const off = withFlag(undefined, () => lessonHtmlSpecParts(input5));
  const on = withFlag("on", () => lessonHtmlSpecParts(input5));
  assert.equal(on.spec, off.spec + "\n\n" + LESSON_OPENER_HTML_CONTRACT + "\n\n" + PLAYFUL_QUESTIONING_CONTRACT);
  assert.equal(on.theme, off.theme + "\n" + lessonOpenerStageLine(5));
  const on9 = withFlag("on", () => lessonHtmlSpecParts(input9));
  assert.equal(on9.spec, on.spec);
  assert.equal(on.spec.match(/Lépcső: L[1-6]/g)?.length, 6);
});

test("Review #403: a két nyitóblokk kivétel a szó szerinti term-szabály alól; a conflict minden évfolyamon kötelező", () => {
  const on = withFlag("on", () => buildAuthorPrompt(sections, map, []));
  assert.ok(on.includes("erre a két nyitóblokkra NEM vonatkozik"));
  assert.ok(on.includes("A TÖMÖRÍTÉS NEM BONT KAPUT"), "a hivatkozott későbbi szabály a promptban van");
  assert.ok(PLAYFUL_QUESTIONING_CONTRACT.includes("conflict = MINDEN évfolyamon kötelező"));
  assert.ok(!PLAYFUL_QUESTIONING_CONTRACT.includes("conflict = dilemma (7. évfolyamtól)"));
});

test("Review #403: a Célkártya célcímkéje nem marad a kártyaleírás egyetlen mondata", () => {
  assert.equal(stripOpenerGoalLabel("Mit tanulunk ma? Ma megismered a növény részeit."), "Ma megismered a növény részeit.");
  assert.equal(stripOpenerGoalLabel("Célunk: a lecke végére felismered az egyenlő törteket."), "A lecke végére felismered az egyenlő törteket.");
  assert.equal(stripOpenerGoalLabel("Cél: érteni Newton II. törvényét."), "Érteni Newton II. törvényét.");
  assert.equal(stripOpenerGoalLabel("Célunk az egyenlő törtek felismerése."), "Célunk az egyenlő törtek felismerése.", "kettőspont nélkül a címke a mondat része");
  assert.equal(stripOpenerGoalLabel("A vulkánok a Föld belsejéből törnek elő."), "A vulkánok a Föld belsejéből törnek elő.");
  const longGoal = `**Mit tanulunk ma?** Ma megismered a növény öt fő részét, a gyökeret, a szárat, a levelet, a virágot és a termést, és megtanulod, melyik rész mire való a növény életében.\n\n**Mi lehet nehéz?** Összekeverni.`;
  const teaser = teaserFromText(longGoal)!;
  assert.ok(!teaser.startsWith("Mit tanulunk ma?"), teaser);
  assert.ok(teaser.startsWith("Ma megismered"), teaser);
  assert.ok(teaser.length <= 160);
});

test("Review #403: a címkeleválasztás előtt automatikusan mentett leírás javításkor frissül (rövid és levágott célbekezdés)", () => {
  const lessonWithText = (text: string) => ({ sections: [{ blocks: [{ kind: "explain", text }] }] });
  // Rövid: a régi automatikus leírás a címkével együtt mentődött.
  const prevShort = lessonWithText("**Cél:** Megérted a törtek bővítését.\n\n**Tipikus buktató:** csak a számláló.");
  const next = lessonWithText("**Cél:** Megérted a törtek egyszerűsítését.\n\n**Tipikus buktató:** csak a nevező.");
  assert.equal(descriptionAfterLessonChange("Cél: Megérted a törtek bővítését.", prevShort, next), lessonTeaser(next));
  assert.equal(lessonTeaser(next), "Megérted a törtek egyszerűsítését.");
  // Levágott: a régi rövidítés a címkés, 160 karakternél hosszabb bekezdésből készült.
  const longGoal = "Mit tanulunk ma? Ma megismered a növény öt fő részét, a gyökeret, a szárat, a levelet, a virágot és a termést. Megtanulod azt is, melyik rész mire való a növény életében, és hogyan segítik egymást.";
  const prevLong = lessonWithText(longGoal);
  const legacy = "Mit tanulunk ma? Ma megismered a növény öt fő részét, a gyökeret, a szárat, a levelet, a virágot és a termést.";
  assert.equal(descriptionAfterLessonChange(legacy, prevLong, next), lessonTeaser(next));
  // A kézzel írt leírás továbbra is érintetlen.
  assert.equal(descriptionAfterLessonChange("Kézzel írt kártyaszöveg.", prevShort, next), undefined);
});

test("A3/A4: webes szerzői prompt — kapcsoló nélkül nincs Célkártya, bekapcsolva a HTML-szerződés és a lépcső-sor bekerül", () => {
  const off = withFlag(undefined, () => webLessonAuthorPrompt(5, "Törtek — 5. osztály"));
  const on = withFlag("on", () => webLessonAuthorPrompt(5, "Törtek — 5. osztály"));
  assert.ok(!off.includes("CÉLKÁRTYA"));
  assert.ok(on.includes(LESSON_OPENER_HTML_CONTRACT));
  assert.ok(on.includes("Nyitány — Lépcső: L3"));
});
