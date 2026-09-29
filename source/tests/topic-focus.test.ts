import assert from "node:assert/strict";
import test from "node:test";

import type { MapConcept } from "../server/studio/coverage";
import { applyTopicFocus, decideTopicFocus, validateTopicFocus } from "../server/studio/topic-focus";

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
  assert.deepEqual(validateTopicFocus(concepts, { focusIds: ["c3", "c9", "s1", "kitalalt"] }), { localIds: ["c3", "c9", "s1"], demoted: 2 });
  assert.equal(validateTopicFocus(concepts, { focusIds: ["s1", "x1"] }), null, "core nélkül nincs fókusz");
  assert.equal(validateTopicFocus(concepts, { focusIds: concepts.map(c => c.localId) }), null, "minden fogalom = nincs szűkítés");
  assert.equal(validateTopicFocus(concepts, { focusIds: "c3" }), null, "hibás alak");
  assert.equal(validateTopicFocus(concepts, null), null);
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
  assert.equal(await decideTopicFocus("   ", concepts, async () => { calls++; return {}; }), null);
  assert.equal(calls, 0);
  assert.equal(await decideTopicFocus("Oszthatóság 3-mal és 9-cel", concepts, async () => { throw new Error("modell nem elérhető"); }), null);
  let prompt = "";
  const focus = await decideTopicFocus("Oszthatóság 3-mal és 9-cel", concepts, async (_system, user) => { prompt = user; return { focusIds: ["c3", "c9", "s1"] }; });
  assert.deepEqual(focus, { localIds: ["c3", "c9", "s1"], demoted: 2 });
  assert.match(prompt, /Oszthatóság 3-mal és 9-cel/);
  assert.match(prompt, /c3/);
});
