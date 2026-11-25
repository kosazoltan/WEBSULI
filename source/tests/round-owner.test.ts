import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRoundOwners, isFreshRound, learnerTagOf, roundHasActivity } from "../shared/round-owner";
import { sha256Hex } from "../shared/sha256";

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

test("B4b (PR #574 review): SHA-256 — szabványos tesztvektorok; a tokenlenyomat előtagos, 64 hex", () => {
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"), "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  assert.equal(sha256Hex("árvíztűrő"), sha256Hex("árvíztűrő"));
  assert.match(learnerTagOf("token-AAA"), /^s256:[0-9a-f]{64}$/);
  assert.notEqual(learnerTagOf("token-AAA"), learnerTagOf("token-AAB"));
});

test("B4b (PR #574 review): a korábbi rövid lenyomatú rekord ismeretlennek számít (alapértelmezett lenyomattal)", () => {
  const storage = memoryStorage();
  storage.setItem("k:quiz:owner:old", JSON.stringify({ learnerTag: "1abc2de" }));
  const owners = createRoundOwners(() => storage, () => "token-OLD");
  assert.deepEqual(owners.bind("k:quiz:owner:old", true), { learnerTag: null });
  const fresh = owners.bind("k:quiz:owner:new", true);
  assert.equal(owners.learnerFor(fresh), "token-OLD");
});

test("B4b (PR #574 review): isFreshRound — csak el nem kezdett, tevékenység nélküli kör; a kiürített, megkezdett kör és a mintamegtekintés nem friss", () => {
  assert.equal(isFreshRound("tasks", { picks: {}, answers: {}, sampleViewed: [], startedAt: 0 }), true);
  assert.equal(isFreshRound("tasks", { picks: {}, answers: { a: "" }, sampleViewed: [], startedAt: 1_790_000_000_000 }), false, "visszatöltött, kiürített kör");
  assert.equal(isFreshRound("tasks", { picks: {}, answers: {}, sampleViewed: ["a"], startedAt: 0 }), false, "megnézett minta");
  assert.equal(roundHasActivity("tasks", { picks: {}, answers: {}, sampleViewed: ["a"] }), true);
  assert.equal(isFreshRound("quiz", { picks: { a: 0 }, answers: {}, startedAt: 0 }), false);
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
  assert.match(source, /ownerBinding \? roundOwners\.learnerFor\(owner\) : getLearnerToken\(\)/, "KI állásban (képességjelzés nélkül) a főági viselkedés");
  assert.match(source, /sentInMemory\.add\(flag\)/, "memóriabeli sikerjelző a tároló írása előtt");
  assert.match(source, /seenFresh\.current\.add\(/);
  assert.match(source, /roundOwners\.clear\(ownerKey\)/);
});
