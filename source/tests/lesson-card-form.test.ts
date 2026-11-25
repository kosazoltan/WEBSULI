import test from "node:test";
import assert from "node:assert/strict";
import { CARD_FORMS, RECAP_FORMS, avoidSeriesRepeat, cardFormProblems, pickVarietyAxes, varietyAxesContract, recapFormById } from "../shared/lesson-variety-axes";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

/** V3b (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): kártyaformák a gyártásban. */

test("kártyaforma-tengely: determinisztikus, 200 magon mind a négy előfordul", () => {
  assert.deepEqual(CARD_FORMS.map((c) => c.id), ["flipCard", "stepReveal", "didYouKnow", "decision"]);
  const seen = new Set<string>();
  for (let s = 0; s < 200; s++) {
    const a = pickVarietyAxes(s, 5);
    assert.deepEqual(a, pickVarietyAxes(s, 5));
    seen.add(a.cardForm.id);
  }
  assert.equal(seen.size, 4);
});

test("sorozatszabály: az előzővel azonos kártyaforma a következőre lép", () => {
  const picked = { openingForm: "x", ...pickVarietyAxes(3, 5) };
  const next = avoidSeriesRepeat(picked, { cardForm: picked.cardForm.id }, 5);
  assert.notEqual(next.cardForm.id, picked.cardForm.id);
  assert.equal(avoidSeriesRepeat(picked, { cardForm: "más" }, 5).cardForm.id, picked.cardForm.id);
});

test("szerződés: a kiosztott kártya a pontos tryKind-dal és spec-alakkal; villámkártya-összefoglaló", () => {
  for (const card of CARD_FORMS) {
    const c = varietyAxesContract({ ...pickVarietyAxes(1, 4), cardForm: card }, 900);
    assert.match(c, /KÁRTYA/);
    assert.ok(c.includes(`"tryKind":"${card.id}"`), card.id);
  }
  const flash = recapFormById("villamkartya");
  assert.ok(flash && RECAP_FORMS.includes(flash));
  assert.match(varietyAxesContract({ ...pickVarietyAxes(1, 4), recapForm: flash! }, 900), /flashcards/);
});

test("kapu: ≥ 4 fejezetnél a kiosztott kártya nem első fejezetben kötelező", () => {
  const lesson = structuredClone(fusionFixture());
  while (lesson.sections.length < 4) lesson.sections.push(structuredClone(lesson.sections[lesson.sections.length - 1]));
  const card = CARD_FORMS.find((c) => c.id === "didYouKnow")!;
  const concept = (lesson.sections[1].blocks.find((b) => "coversConceptIds" in b) as { coversConceptIds: string[] }).coversConceptIds.slice(0, 1);
  assert.ok(cardFormProblems(lesson, card).length > 0, "hiányzik");
  const first = structuredClone(lesson);
  first.sections[0].blocks.push({ kind: "try", tryKind: "didYouKnow", spec: { fact: "f" }, coversConceptIds: concept } as never);
  assert.ok(cardFormProblems(first, card).length > 0, "csak az első fejezetben");
  const ok = structuredClone(lesson);
  ok.sections[2].blocks.push({ kind: "try", tryKind: "didYouKnow", spec: { fact: "f" }, coversConceptIds: concept } as never);
  assert.deepEqual(cardFormProblems(ok, card), []);
  const short = structuredClone(lesson); short.sections = short.sections.slice(0, 3);
  assert.deepEqual(cardFormProblems(short, card), [], "< 4 fejezet: nincs megkötés");
  assert.deepEqual(cardFormProblems(lesson, undefined), [], "kiosztás nélkül nincs megkötés");
});

test("sorozat-előzmény: a mentett kártyaforma (camelCase) visszaolvasható", async () => {
  const { seriesPreviousOf } = await import("../server/studio/pipeline-store");
  assert.equal(seriesPreviousOf({ cardForm: "didYouKnow" })?.cardForm, "didYouKnow");
  assert.equal(seriesPreviousOf({ cardForm: "rossz érték!" }), undefined);
});

test("a szerzői katalógus a kártyák spec-alakját is közli", async () => {
  const { AUTHOR_BLOCK_CATALOG } = await import("../server/studio/step-io");
  for (const [k, f] of [["flipCard", "front"], ["stepReveal", "steps"], ["didYouKnow", "fact"], ["decision", "consequence"], ["flashcards", "cards"]]) {
    assert.ok(AUTHOR_BLOCK_CATALOG.includes(`${k}:`) && AUTHOR_BLOCK_CATALOG.includes(`"${f}"`), k);
  }
});
