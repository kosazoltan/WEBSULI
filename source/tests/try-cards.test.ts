import test from "node:test";
import assert from "node:assert/strict";
import { lessonSchema, PROMPT_TRY_KINDS, TRY_KINDS } from "../shared/lesson-schema";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";
import { scoreDecision, trySpecProblems } from "../shared/try-scoring";

/** V3a (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): kártyaformák és döntés–következmény. */

const GOOD: Record<string, unknown> = {
  flipCard: { front: "Mi a fotoszintézis?", back: "A növény fényből és szén-dioxidból cukrot készít." },
  stepReveal: { title: "Így oldd meg", steps: ["Írd fel az adatokat.", "Válaszd ki a képletet.", "Számolj."] },
  didYouKnow: { fact: "A méhek táncolva mutatják az irányt." },
  decision: { situation: "Esik az eső, és túrázni indulnál.", options: [{ text: "Esőkabátot viszek", consequence: "Száraz maradsz.", best: true }, { text: "Póló elég", consequence: "Megázol.", best: false }] },
  flashcards: { cards: [{ front: "kutya", back: "dog" }, { front: "macska", back: "cat" }] },
};
const BAD: Record<string, unknown> = {
  flipCard: { front: "csak eleje" },
  stepReveal: { steps: ["egy lépés"] },
  didYouKnow: { fact: "" },
  decision: { situation: "x", options: [{ text: "a", consequence: "b", best: true }, { text: "c", consequence: "d", best: true }] },
  flashcards: { cards: [{ front: "egy", back: "one" }] },
};

test("az öt kártyafajta a sémában; a modellnek nem hirdetve", () => {
  for (const k of Object.keys(GOOD)) assert.ok((TRY_KINDS as readonly string[]).includes(k), k);
  for (const k of Object.keys(GOOD)) assert.ok(!(PROMPT_TRY_KINDS as readonly string[]).includes(k), `${k}: a kártyát a V3b hirdeti`);
});

test("séma: a helyes kártya átmegy, a hibás elutasítva", () => {
  for (const k of Object.keys(GOOD)) {
    assert.deepEqual(trySpecProblems(k, GOOD[k]), [], `${k}: helyes`);
    assert.ok(trySpecProblems(k, BAD[k]).length > 0, `${k}: hibás`);
    const l = structuredClone(fusionFixture()) as { sections: Array<{ blocks: Array<Record<string, unknown>> }> };
    const concept = (l.sections[0].blocks.find((b) => Array.isArray(b.coversConceptIds))!.coversConceptIds as string[]).slice(0, 1);
    l.sections[0].blocks.push({ kind: "try", tryKind: k, spec: GOOD[k], coversConceptIds: concept });
    assert.equal(lessonSchema.safeParse(l).success, true, `${k}: séma`);
  }
});

test("döntés–következmény pontozása: a legjobb lehetőség 1 pont (teljes), más 0 (rossz), választás nélkül 0", () => {
  assert.deepEqual(scoreDecision(GOOD.decision, 0), { points: 1, max: 1, verdict: "teljes" });
  assert.deepEqual(scoreDecision(GOOD.decision, 1), { points: 0, max: 1, verdict: "rossz" });
  assert.deepEqual(scoreDecision(GOOD.decision, null), { points: 0, max: 1, verdict: "rossz" });
});
test("review #619: a hiányos elemet tartalmazó lépéssor, döntés és villámkártya-csomag érvénytelen (nem tűnhet el csendben a megjelenítőben)", () => {
  assert.ok(trySpecProblems("stepReveal", { steps: ["Első lépés", null, "Harmadik lépés"] }).length > 0, "üres lépés");
  assert.ok(trySpecProblems("stepReveal", { steps: ["Első lépés", "  ", "Harmadik lépés"] }).length > 0, "üres szöveg");
  assert.ok(trySpecProblems("decision", { situation: "Esik.", options: [{ text: "A", consequence: "a", best: true }, { text: "B", consequence: "b", best: false }, { text: "C", best: true }] }).length > 0, "következmény nélküli lehetőség");
  assert.ok(trySpecProblems("flashcards", { cards: [{ front: "a", back: "b" }, { front: "c", back: "d" }, { front: "e" }] }).length > 0, "hátoldal nélküli kártya");
  for (const k of ["stepReveal", "decision", "flashcards"]) assert.deepEqual(trySpecProblems(k, GOOD[k]), [], `${k}: helyes`);
});
