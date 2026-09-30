import assert from "node:assert/strict";
import test from "node:test";

import type { MapConcept } from "../server/studio/coverage";
import { applyTopicFocus, decideTopicFocus, topicFocusModels, validateTopicFocus } from "../server/studio/topic-focus";

// Spec 2026-09-30 (docs/specs/2026-09-30-temafokusz-kesleltetes.md): mérve a Mezopotámia-térképen (55 fogalom), az
// éles úton — deepseek-v4-flash 1/5 döntés 60 s-on belül, glm-5.3-flash 5/5, 11–53 s. A glm megy elöl.
test("topicFocusModels: a mérten megbízható glm-5.3-flash az első, a gateHelper-modell (deepseek) a tartalék", () => {
  assert.deepEqual(topicFocusModels({}), ["z-ai/glm-5.3-flash", "deepseek/deepseek-v4-flash"]);
  assert.deepEqual(topicFocusModels({ STUDIO_MODEL_GATE_HELPER: "z-ai/glm-5.3-flash" }), ["z-ai/glm-5.3-flash"], "azonos modell kétszer nem hívódik");
});

/* Spec 2026-09-29 (docs/specs/2026-09-29-tanari-temafokusz.md): a tanári kérés a jobban szűkíti a kötelező
 * lefedettséget — a kérésen kívüli fogalmak `extra` súlyt kapnak a job saját térkép-másolatában. */

const concepts: MapConcept[] = [
  { localId: "c3", examWeight: "core", term: "3-mal való oszthatóság", definition: "A számjegyek összege osztható 3-mal." },
  { localId: "c9", examWeight: "core", term: "9-cel való oszthatóság", definition: "A számjegyek összege osztható 9-cel." },
  { localId: "s1", examWeight: "supporting", term: "számjegyösszeg", definition: "A szám jegyeinek összege." },
  { localId: "c2", examWeight: "core", term: "2-vel való oszthatóság", definition: "Az utolsó jegy páros." },
  { localId: "c5", examWeight: "core", term: "5-tel való oszthatóság", definition: "Az utolsó jegy 0 vagy 5." },
  { localId: "x1", examWeight: "extra", term: "érdekesség", definition: "…" },
];

test("validateTopicFocus: ismert azonosítók, legalább egy core, nem minden fogalom", () => {
  assert.deepEqual(validateTopicFocus(concepts, { narrow: true, focusIds: ["c3", "c9", "s1", "kitalalt"] }), { localIds: ["c3", "c9", "s1"], demoted: 2 });
  assert.equal(validateTopicFocus(concepts, { narrow: true, focusIds: ["s1", "x1"] }), null, "core nélkül nincs fókusz");
  assert.equal(validateTopicFocus(concepts, { narrow: true, focusIds: concepts.map(c => c.localId) }), null, "minden fogalom = nincs szűkítés");
  assert.equal(validateTopicFocus(concepts, { narrow: true, focusIds: "c3" }), null, "hibás alak");
  assert.equal(validateTopicFocus(concepts, null), null);
});

/* PR #132 review (Codex P1): a kérés nem mindig témakérés (terjedelem, évfolyam, elírás) — csak kifejezett
 * résztéma-kérésnél szűkítünk. (Copilot): a fókusz csak kötelezővé tehető (nem extra) fogalmakat számol. */
test("validateTopicFocus: csak narrow=true esetén szűkít; az eleve extra fogalom nem számít a fókuszba", () => {
  assert.equal(validateTopicFocus(concepts, { narrow: false, focusIds: ["c3", "c9"] }), null, "nem témakérés → nincs szűkítés");
  assert.equal(validateTopicFocus(concepts, { focusIds: ["c3", "c9"] }), null, "hiányzó narrow → nincs szűkítés");
  assert.deepEqual(validateTopicFocus(concepts, { narrow: true, focusIds: ["c3", "x1"] }), { localIds: ["c3"], demoted: 4 }, "c9, s1, c2, c5 kiegészítő lesz; az x1 eleve az");
});

test("applyTopicFocus: a fókuszon kívüli core/supporting extra lesz — másolatban, az eredeti érintetlen", () => {
  const map = { meta: { id: "m" }, concepts };
  const before = JSON.stringify(map);
  const focused = applyTopicFocus(map, { localIds: ["c3", "c9", "s1"], demoted: 2 });
  assert.deepEqual(focused.concepts.map(c => [c.localId, c.examWeight]), [["c3", "core"], ["c9", "core"], ["s1", "supporting"], ["c2", "extra"], ["c5", "extra"], ["x1", "extra"]]);
  assert.equal(JSON.stringify(map), before, "a közös térkép nem módosul");
  assert.equal(applyTopicFocus(map, null), map);
  assert.equal(applyTopicFocus(map, undefined), map);
});

test("decideTopicFocus: üres kérésnél nincs hívás; hibánál nincs fókusz; érvényes válasznál van", async () => {
  let calls = 0;
  assert.equal(await decideTopicFocus("   ", concepts, [async () => { calls++; return {}; }]), null);
  assert.equal(calls, 0);
  assert.equal(await decideTopicFocus("Oszthatóság 3-mal és 9-cel", concepts, [async () => { throw new Error("modell nem elérhető"); }]), null);
  let prompt = "";
  const focus = await decideTopicFocus("Oszthatóság 3-mal és 9-cel", concepts, [async (_system, user) => { prompt = user; return { narrow: true, focusIds: ["c3", "c9", "s1"] }; }]);
  assert.deepEqual(focus, { localIds: ["c3", "c9", "s1"], demoted: 2 });
  assert.match(prompt, /Oszthatóság 3-mal és 9-cel/);
  assert.match(prompt, /c3/);
});

/* Spec 2026-09-29, 2. kör (élő mérés): a fókusz-hívás egyszer 180 s-ig akadt, és nem volt tartalék. */
test("decideTopicFocus: az első hívó hibája vagy használhatatlan válasza után a következő dönt", async () => {
  const good = async () => ({ narrow: true, focusIds: ["c3", "c9", "s1"] });
  assert.deepEqual(await decideTopicFocus("3 és 9", concepts, [async () => { throw new Error("időtúllépés"); }, good]), { localIds: ["c3", "c9", "s1"], demoted: 2 });
  assert.deepEqual(await decideTopicFocus("3 és 9", concepts, [async () => ({ narrow: true, focusIds: ["s1"] }), good]), { localIds: ["c3", "c9", "s1"], demoted: 2 }, "core nélküli válasz után a tartalék");
  const order: string[] = [];
  assert.equal(await decideTopicFocus("3 és 9", concepts, [
    async () => { order.push("a"); throw new Error("első", { cause: new Error("ETIMEDOUT") }); },
    async () => { order.push("b"); throw new Error("második"); },
  ]), null);
  assert.deepEqual(order, ["a", "b"]);
});

test("a fókusz-prompt a szabályokat, példákat és előfeltételeket is kéri, kétes esetben bevételt", async () => {
  const { TOPIC_FOCUS_SYSTEM } = await import("../server/studio/topic-focus");
  assert.match(TOPIC_FOCUS_SYSTEM, /előfeltétel/);
  assert.match(TOPIC_FOCUS_SYSTEM, /példa/);
  assert.match(TOPIC_FOCUS_SYSTEM, /kétes/i);
  assert.match(TOPIC_FOCUS_SYSTEM, /"narrow"/, "a modell dönti el, kér-e résztémát a tanár");
});

/* PR #132 review (Copilot): a bérletvesztés nem modellhiba — nem nyelhetjük el, különben egy lecserélt munkás folytatná. */
test("decideTopicFocus: a workflow-ütközést és -várakozást továbbdobja, nem próbál tartalékot", async () => {
  const { WorkflowConflict, WorkflowWaiting } = await import("../server/workflows/engine");
  let second = 0;
  const next = async () => { second++; return { narrow: true, focusIds: ["c3"] }; };
  await assert.rejects(decideTopicFocus("3 és 9", concepts, [async () => { throw new WorkflowConflict("elavult végrehajtó"); }, next]), WorkflowConflict);
  await assert.rejects(decideTopicFocus("3 és 9", concepts, [async () => { throw new WorkflowWaiting("várakozás"); }, next]), WorkflowWaiting);
  assert.equal(second, 0);
});
