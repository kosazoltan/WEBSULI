import test from "node:test";
import assert from "node:assert/strict";
import { CARD_FORMS, RECAP_FORMS, avoidSeriesRepeat, cardFormProblems, cardFormForLength, pickVarietyAxes, varietyAxesContract, recapFlashcardProblems, recapFormById } from "../shared/lesson-variety-axes";
import { seriesPreviousOf } from "../server/studio/pipeline-store";
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

test("a szerzői katalógus (BE változatosság) a kártyák spec-alakját is közli", async () => {
  const { AUTHOR_BLOCK_CATALOG_VARIETY: AUTHOR_BLOCK_CATALOG } = await import("../server/studio/step-io");
  for (const [k, f] of [["flipCard", "front"], ["stepReveal", "steps"], ["didYouKnow", "fact"], ["decision", "consequence"], ["flashcards", "cards"]]) {
    assert.ok(AUTHOR_BLOCK_CATALOG.includes(`${k}:`) && AUTHOR_BLOCK_CATALOG.includes(`"${f}"`), k);
  }
});
test("review #612: placeVarietyCards — a kártya egy nem első (és villámkártyás összefoglalónál nem utolsó) fejezet try-helyére kerül; a villámkártya az utolsó fejezet recap-ja elé; idempotens; < 4 fejezetnél nincs kártya", async () => {
  const { placeVarietyCards } = await import("../shared/lesson-variety-axes");
  const sec = (blocks: string[], tryKind?: string) => ({ plannedBlocks: blocks, ...(tryKind ? { tryKind } : {}) });
  const card = CARD_FORMS[3];
  const plain = recapFormById(RECAP_FORMS.find((r) => r.id !== "villamkartya")!.id)!;
  const flash = recapFormById("villamkartya")!;
  // Nincs try sehol: a kártya az 1. fejezetbe, a check elé kerül.
  const noTry = [sec(["explain", "check"]), sec(["explain", "example", "check"]), sec(["explain", "check"]), sec(["explain", "check", "recap"])];
  const a = placeVarietyCards(noTry, { cardForm: card, recapForm: plain });
  assert.deepEqual(a[1], sec(["explain", "example", "try", "check"], card.id));
  assert.deepEqual(a[0], noTry[0], "az első fejezet érintetlen");
  assert.deepEqual(placeVarietyCards(a, { cardForm: card, recapForm: plain }), a, "idempotens");
  // Van try egy nem első fejezetben: annak a fajtája lesz a kártya (nincs plusz blokk).
  const withTry = [sec(["explain", "try", "check"], "match"), sec(["explain", "check"]), sec(["explain", "try", "check"], "fillBlank"), sec(["explain", "recap"])];
  const b = placeVarietyCards(withTry, { cardForm: card, recapForm: plain });
  assert.deepEqual(b[2], sec(["explain", "try", "check"], card.id));
  assert.deepEqual(b[0], withTry[0]);
  assert.deepEqual(b[1], withTry[1]);
  // Villámkártyás összefoglaló: az utolsó fejezetben a recap elé egy flashcards try; a kártya nem az utolsóba kerül.
  const c = placeVarietyCards(noTry, { cardForm: card, recapForm: flash });
  assert.deepEqual(c[3], sec(["explain", "check", "try", "recap"], "flashcards"));
  assert.equal(c.slice(1, 3).filter((s) => s.tryKind === card.id).length, 1);
  assert.deepEqual(placeVarietyCards(c, { cardForm: card, recapForm: flash }), c, "idempotens");
  // < 4 fejezet: nincs kártya (a kapu sem méri).
  const three = noTry.slice(0, 3);
  assert.deepEqual(placeVarietyCards(three, { cardForm: card, recapForm: plain }), three);
});

test("review #612: a kártya-szerződés csak ≥ 4 fejezetnél kerül a promptba (a kapuval egyezően)", () => {
  for (const n of [1, 2, 3]) assert.equal(/KÁRTYA/.test(varietyAxesContract({ ...pickVarietyAxes(1, n), cardForm: CARD_FORMS[0] }, 900)), false, `${n} fejezet`);
  assert.match(varietyAxesContract({ ...pickVarietyAxes(1, 4), cardForm: CARD_FORMS[0] }, 900), /KÁRTYA/);
});

// Review #647 (Sourcery): kártya-kapu és sorozatszabály szigorítása.
const L = (...kinds: Array<string | null>) => ({ sections: kinds.map((k) => ({ blocks: k ? [{ kind: "try", tryKind: k }] : [{ kind: "text" }] })) });

test("review #647: a kiosztott kártya PONTOSAN egyszer, nem az első fejezetben — duplikált vagy első fejezetbeli is hiba", () => {
  const card = CARD_FORMS[0];
  assert.deepEqual(cardFormProblems(L(null, card.id, null, null), card), []);
  assert.ok(cardFormProblems(L(null, card.id, card.id, null), card).length > 0, "kétszer");
  assert.ok(cardFormProblems(L(card.id, null, card.id, null), card).length > 0, "az első fejezetben is");
});

test("review #647: a TERVEZETT fejezetszám dönt — rövidebb kimenet nem kerüli meg a kártya-kaput", () => {
  const card = CARD_FORMS[1];
  assert.ok(cardFormProblems(L(null, null, null), card, 4).length > 0);
  assert.deepEqual(cardFormProblems(L(null, null, null), card), [], "terv nélkül a kimenet hossza");
});

test("review #647: villámkártyás összefoglalónál az utolsó fejezetben flashcards try blokk kell", () => {
  const flash = recapFormById("villamkartya")!;
  assert.ok(recapFlashcardProblems(L(null, null, null, null), flash).length > 0);
  assert.deepEqual(recapFlashcardProblems(L(null, null, null, "flashcards"), flash), []);
  assert.deepEqual(recapFlashcardProblems(L(null, null), RECAP_FORMS.find((r) => r.id !== "villamkartya")!), []);
});

test("review #647: a sorozatszabály a SORRENDBEN következő kártyára lép (körbe)", () => {
  for (let i = 0; i < CARD_FORMS.length; i++) {
    const picked = { openingForm: "x", ...pickVarietyAxes(3, 5), cardForm: CARD_FORMS[i] };
    assert.equal(avoidSeriesRepeat(picked, { cardForm: CARD_FORMS[i].id }, 5).cardForm.id, CARD_FORMS[(i + 1) % CARD_FORMS.length].id);
  }
});

test("review #647: a szerződés a kártya TELJES spec-alakját közli", () => {
  for (const card of CARD_FORMS) assert.ok(varietyAxesContract({ ...pickVarietyAxes(1, 4), cardForm: card }, 900).includes(card.spec), card.id);
});

test("review #647: 4-nél rövidebb leckénél nincs mentett kártyaforma (nem fogyasztja a sorozat-forgást)", () => {
  assert.equal(cardFormForLength(3, CARD_FORMS[0]), undefined);
  assert.equal(cardFormForLength(4, CARD_FORMS[0]), CARD_FORMS[0]);
});

test("review #647: a sorozat-előzmény blokkváza az elhelyezés ELŐTTI (mentett seriesShape) alak", () => {
  const prev = seriesPreviousOf({ seriesShape: "text>check|text>try>recap", outline: { sections: [{ plannedBlocks: ["text", "check"] }, { plannedBlocks: ["text", "try", "try", "recap"] }] } });
  assert.equal(prev?.shapeSignature, "text>check|text>try>recap");
});
