import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRoundOwners, roundHasActivity } from "../shared/round-owner";

/**
 * Eredmény-e-mail B4b (#510 R47 kliens, R49 b, R50; docs/specs/2026-11-22-eredmeny-email-bontas-vegrehajtas.md 4. pont): a kör párosítási
 * kiléte a kör ELSŐ tevékenységekor rögzül (a párosító token lenyomata, nem a titok), és minden tényleges kérés előtt a MOSTANI token
 * ehhez vetődik — eltérésnél (újrapárosítás) a kérés párosítás nélkül megy. Rekord nélkül helyreállított, már megkezdett kör: ismeretlen.
 */
const memoryStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};
const tagOf = (t: string) => `tag-${t.length}-${t.slice(-3)}`;

test("B4b (R47): az első tevékenységkor rögzített párosítás küldéskor nem cserélhető — újrapárosítás után a kérés párosítás nélkül megy", () => {
  const storage = memoryStorage();
  let token: string | null = "token-AAA";
  const owners = createRoundOwners(() => storage, () => token, tagOf);
  const owner = owners.bind("k:quiz:owner:r1", true);
  assert.deepEqual(owner, { learnerTag: tagOf("token-AAA") });
  assert.ok(![...storage.m.values()].some(v => v.includes("token-AAA")), "a tárolóba csak a lenyomat kerül, a titok nem");
  assert.equal(owners.learnerFor(owner), "token-AAA");
  token = "token-BBB";
  assert.equal(owners.learnerFor(owner), undefined, "R49 b: a mostani token minden kérés előtt a rögzítetthez vetődik");
  assert.deepEqual(owners.bind("k:quiz:owner:r1", true), owner, "a rögzített rekord nem íródik felül");
  token = null;
  assert.equal(owners.learnerFor(owner), undefined);
});

test("B4b (R47): párosítás nélkül kezdett kör később párosított eszközön sem kap tanulót", () => {
  const storage = memoryStorage();
  let token: string | null = null;
  const owners = createRoundOwners(() => storage, () => token, tagOf);
  const owner = owners.bind("k:tasks:owner:r2", true);
  token = "token-CCC";
  assert.equal(owners.learnerFor(owner), undefined);
});

test("B4b (R50): rekord nélkül helyreállított, már megkezdett kör kiléte ismeretlen (párosítás nélkül); a rekord a tárolóból visszaolvasható", () => {
  const storage = memoryStorage();
  const owners = createRoundOwners(() => storage, () => "token-DDD", tagOf);
  assert.deepEqual(owners.bind("k:quiz:owner:r3", false), { learnerTag: null });
  assert.equal(owners.learnerFor(owners.bind("k:quiz:owner:r3", true)), undefined);
  const fresh = createRoundOwners(() => storage, () => "token-DDD", tagOf);
  owners.bind("k:quiz:owner:r4", true);
  assert.equal(fresh.learnerFor(fresh.bind("k:quiz:owner:r4", false)), "token-DDD", "újratöltés után a tárolt rekord számít, nem az R50 ág");
  fresh.clear("k:quiz:owner:r4");
  assert.equal(storage.getItem("k:quiz:owner:r4"), null, "a végleges siker után törlődik");
});

test("B4b: írhatatlan / dobó tároló — a rekord memóriában él; sérült tárolt érték nem rekord", () => {
  const throwing = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => { throw new Error("x"); } };
  const owners = createRoundOwners(() => throwing, () => "token-EEE", tagOf);
  const owner = owners.bind("k:quiz:owner:r5", true);
  assert.equal(owners.learnerFor(owners.bind("k:quiz:owner:r5", false)), "token-EEE");
  void owner;
  const storage = memoryStorage();
  storage.setItem("k:quiz:owner:r6", JSON.stringify({ learnerTag: 5 }));
  assert.deepEqual(createRoundOwners(() => storage, () => "token-FFF", tagOf).bind("k:quiz:owner:r6", false), { learnerTag: null });
});

test("B4b: roundHasActivity — kvíz: van válasz; feladat: van nem üres válasz", () => {
  assert.equal(roundHasActivity("quiz", { picks: {}, answers: {} }), false);
  assert.equal(roundHasActivity("quiz", { picks: { a: 0 }, answers: {} }), true);
  assert.equal(roundHasActivity("tasks", { picks: {}, answers: { a: "  " } }), false);
  assert.equal(roundHasActivity("tasks", { picks: {}, answers: { a: "x" } }), true);
});

test("B4b: a beküldő a rögzített kilétet használja — tokent minden kísérlet előtt a rekordon át, a kör tevékenység nélküli látását dokumentumonként jegyzi", () => {
  const source = readFileSync(new URL("../client/src/lesson-runtime/resultReport.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /const learner = getLearnerToken\(\);/, "a nyers mostani token nem mehet közvetlenül a kérésbe");
  assert.match(source, /roundOwners\.learnerFor\(owner\)/);
  assert.match(source, /seenFresh\.current\.add\(/);
  assert.match(source, /roundOwners\.clear\(ownerKey\)/);
});
