import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { SUBJECT_KIND_HINTS, describedKinds, kindShareProblems, subjectKindHintLine, visualKindCounts, withKindShareNotes } from "../shared/visual-kind-plan";
import { VISUAL_PARAMS_CONTRACT } from "../shared/lesson-visual-params";
import { PROMPT_ANIM_KINDS } from "../shared/lesson-schema";
import { CATALOG_SUBJECTS } from "../shared/catalog-taxonomy";

// Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (14. szakasz, S6c-1; V23 ajánlótábla, V24).

const lesson = (kinds: Array<string | { animKind: string; sourceVisualId: string }>) => ({
  sections: [{ blocks: [{ kind: "explain" }, ...kinds.map((k) => (typeof k === "string" ? { kind: "animate", animKind: k } : { kind: "animate", ...k }))] }],
});

test("V23: az ajánlótábla minden katalógus-tantárgyra legalább két, a sémában létező fajtát ad", () => {
  for (const subject of CATALOG_SUBJECTS) {
    const kinds = SUBJECT_KIND_HINTS[subject];
    assert.ok(kinds && kinds.length >= 2, subject);
    for (const k of kinds) assert.ok((PROMPT_ANIM_KINDS as readonly string[]).includes(k), `${subject}: ${k} nincs a hirdetett fajták között`);
  }
});

test("V23: az ajánlósor CSAK a szerződésben leírt fajtát nevezi meg; kettőnél kevesebb ajánlható fajtánál nincs sor", () => {
  assert.deepEqual(describedKinds(VISUAL_PARAMS_CONTRACT, ["cycle", "timeline", "process", "fraction", "map", "wordBuilder", "sentenceParts"]), ["cycle", "timeline", "process"],
    "a négy leíratlan fajta ma nincs a szerződésben");
  // 1. vak kör L2: a „params:” alakú leírás (decisionStory) is leírt fajta; a részszó nem.
  assert.deepEqual(describedKinds("decisionStory params: {title}", ["decisionStory"]), ["decisionStory"]);
  assert.deepEqual(describedKinds("előprocess — x; micro_map — y", ["process", "map"]), []);
  const math = subjectKindHintLine("Matematika", VISUAL_PARAMS_CONTRACT);
  assert.match(math, /TANTÁRGYI ÁBRA-AJÁNLÁS \(matematika\)/u);
  assert.match(math, /numberLine, labeledShape, barChart, venn/u);
  assert.doesNotMatch(math, /fraction/u, "leíratlan fajta nem kerül a promptba");
  // 1. vak kör L1: egyetlen ajánlható fajta is ajánlás (magyar nyelvtan → venn; angol / német / francia → timeline).
  assert.match(subjectKindHintLine("magyar nyelvtan", VISUAL_PARAMS_CONTRACT), /— venn\./u);
  for (const subject of ["angol", "német", "francia"]) assert.match(subjectKindHintLine(subject, VISUAL_PARAMS_CONTRACT), /— timeline\./u, subject);
  // Minden katalógus-tantárgy kap ajánlást a mai szerződéssel is.
  for (const subject of CATALOG_SUBJECTS) assert.notEqual(subjectKindHintLine(subject, VISUAL_PARAMS_CONTRACT), "", subject);
  // 1. vak kör L3: a modellnek mondott cél a szerver mérési szabályát követi (legalább öt saját ábránál), nem kötelező 40% minden leckére.
  assert.match(math, /legalább öt saját \(nem forrásból átvett\) ábra/u);
  assert.doesNotMatch(math, /legfeljebb az ábrák 40%-a/u);
  assert.equal(subjectKindHintLine("ismeretlen tárgy", VISUAL_PARAMS_CONTRACT), "");
  // Ha a szerződés később leírja a fajtát (S6c-2), az ajánlás magától bővül.
  const extended = `${VISUAL_PARAMS_CONTRACT}\nfraction — tört\nwordBuilder — szóépítés\nsentenceParts — mondatrészek`;
  assert.match(subjectKindHintLine("Matematika", extended), /fraction, numberLine/u);
  assert.match(subjectKindHintLine("magyar nyelvtan", extended), /sentenceParts, wordBuilder, venn/u);
  // A fajta neve csak önállóan számít leírtnak.
  assert.deepEqual(describedKinds("subprocess — x", ["process"]), []);
});

test("V23: az ábrakészítő kérése a FUTÁS állapotát követi — KI bájtra a régi (BE környezetben is), BE az ajánlósorral (KI környezetben is)", async () => {
  const { buildAnimatorPrompt } = await import("../server/studio/step-io");
  const { runWithLessonVariety } = await import("../server/studio/lesson-variety-flag");
  const { standardFusionFixture } = await import("../shared/fixtures/lesson-fusion");
  const fixture = standardFusionFixture();
  const map = { title: "T", subject: "matematika", classroom: 5, concepts: [{ localId: "area", examWeight: "core" as const, term: "terület" }] };
  const saved = process.env.STUDIO_LESSON_VARIETY;
  try {
    delete process.env.STUDIO_LESSON_VARIETY;
    const off = buildAnimatorPrompt(fixture, map);
    assert.doesNotMatch(off, /TANTÁRGYI ÁBRA-AJÁNLÁS/u);
    process.env.STUDIO_LESSON_VARIETY = "on";
    const on = buildAnimatorPrompt(fixture, map);
    assert.match(on, /TANTÁRGYI ÁBRA-AJÁNLÁS \(matematika\)/u);
    assert.equal(on.replace(`\n${subjectKindHintLine("matematika", VISUAL_PARAMS_CONTRACT)}`, ""), off, "BE: egyetlen sorral több, a szerződés szövege változatlan");
    assert.equal(await runWithLessonVariety(false, async () => buildAnimatorPrompt(fixture, map)), off, "KI futás BE környezetben");
    delete process.env.STUDIO_LESSON_VARIETY;
    assert.equal(await runWithLessonVariety(true, async () => buildAnimatorPrompt(fixture, map)), on, "BE futás KI környezetben");
    // 1. vak kör L1 + L2: a magyar nyelvtan BE állapotban is kap ajánlást; a magyar irodalom ajánlásában ott a decisionStory (külön leírás).
    assert.match(await runWithLessonVariety(true, async () => buildAnimatorPrompt(fixture, { ...map, subject: "magyar nyelvtan" })), /TANTÁRGYI ÁBRA-AJÁNLÁS \(magyar-nyelvtan\)/u);
    assert.match(await runWithLessonVariety(true, async () => buildAnimatorPrompt(fixture, { ...map, subject: "magyar irodalom" })), /— timeline, decisionStory, illustration\./u);
  } finally {
    if (saved === undefined) delete process.env.STUDIO_LESSON_VARIETY; else process.env.STUDIO_LESSON_VARIETY = saved;
  }
});

test("V24: fajta-arány — a forráshoz kötött ábra nem számít; 5 ábra alatt nincs jelzés; pontosan 40% megfelel, fölötte jelez", () => {
  assert.deepEqual(visualKindCounts(lesson(["process", "process", "cycle", { animKind: "table", sourceVisualId: "v1" }])), { process: 2, cycle: 1 });
  assert.deepEqual(kindShareProblems(lesson(["process", "process", "process", "process"])), [], "4 ábra: nincs jelzés");
  assert.deepEqual(kindShareProblems(lesson(["process", "process", "cycle", "venn", "barChart"])), [], "2/5 = 40%: megfelel");
  const over = kindShareProblems(lesson(["process", "process", "process", "cycle", "venn"]));
  assert.equal(over.length, 1);
  assert.match(over[0], /5 ábrájából 3 „process” fajtájú \(60%\)/u);
  assert.deepEqual(kindShareProblems(lesson(["process", "process", "process", "cycle", "venn", { animKind: "process", sourceVisualId: "v1" }])).length, 1, "a forráshoz kötött ábra a nevezőbe sem számít");
});

test("vak L6: a jelzés a VÉGLEGES leckére szól — a korábbi jelzés lecserélődik vagy törlődik, a többi megmarad; a motor a publikált leckén mér", () => {
  const other = { reason: "length_over_budget", note: "hosszú", round: 0 };
  const stale = { reason: "visual_kind_share", note: "régi", round: 0 };
  assert.deepEqual(withKindShareNotes([other, stale], lesson(["process", "process", "cycle", "venn", "barChart"])), [other], "a lektori csere után megfelel → a régi jelzés törlődik");
  const still = withKindShareNotes([other, stale], lesson(["process", "process", "process", "cycle", "venn"]));
  assert.equal(still.length, 2);
  assert.equal(still[0], other);
  assert.notEqual((still[1] as { note: string }).note, "régi");
  assert.deepEqual(withKindShareNotes([], lesson(["process"])), []);
  const engine = readFileSync(new URL("../server/studio/single-run/engine.ts", import.meta.url), "utf8");
  assert.ok(engine.includes("telemetry.gates.visualKinds = visualKindCounts(publishable);"), "a telemetria a publikált leckéből");
  assert.ok(engine.includes("withKindShareNotes(withTryShareNote("), "a jelzés a publikált leckéből, a többi jelzés megtartásával");
  const start = engine.indexOf("telemetry.gates.visualKinds = visualKindCounts(publishable);");
  assert.ok(engine.lastIndexOf("if (varietyOn) {", start) > 0 && start - engine.lastIndexOf("if (varietyOn) {", start) < 800, "csak a futásra rögzített BE állapotnál");
  assert.equal(engine.includes("lessonVarietyEnabled()) {"), false, "a motor futás közben nem olvas környezetet");
});
