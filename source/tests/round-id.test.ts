import assert from "node:assert/strict";
import test from "node:test";

import { experienceFingerprint } from "../shared/experience-fingerprint";
import { legacyRoundIdOf, newRoundNonce, roundIdOf, sentFlagsOf } from "../shared/round-id";

/** B8 (docs/specs/2026-11-25-eredmeny-email-b8.md): nagy entrópiájú, tároló-kompatibilis körazonosító. */
const round = { ids: ["q1", "q2"], startedAt: 1700000000000 };

test("B8: nonce nélkül a régi azonosító (round-<lenyomat>), érvényes nonce-szal r2-<nonce>", () => {
  assert.equal(legacyRoundIdOf(round), `round-${experienceFingerprint({ ids: round.ids, startedAt: round.startedAt })}`);
  assert.equal(roundIdOf(round), legacyRoundIdOf(round));
  const nonce = "0123456789abcdef0123456789abcdef";
  assert.equal(roundIdOf({ ...round, nonce }), `r2-${nonce}`);
  assert.match(roundIdOf({ ...round, nonce }), /^[a-z0-9-]{4,64}$/, "a szerver mostani sémájába belefér");
  for (const bad of ["", "ABCDEF0123456789abcdef0123456789", "123", "g".repeat(32)]) assert.equal(roundIdOf({ ...round, nonce: bad }), legacyRoundIdOf(round), bad);
});

test("B8: a jelzők — új azonosítónál az új és a régi is; régi körnél csak a régi", () => {
  const nonce = "fedcba9876543210fedcba9876543210";
  assert.deepEqual(sentFlagsOf("k", "quiz", { ...round, nonce }), [`k:quiz:sent:r2-${nonce}`, `k:quiz:sent:${legacyRoundIdOf(round)}`]);
  assert.deepEqual(sentFlagsOf("k", "tasks", round), [`k:tasks:sent:${legacyRoundIdOf(round)}`]);
});

test("B8: newRoundNonce — 32 hexa jegy, ismétlés nélkül", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 2000; i++) { const n = newRoundNonce(); assert.match(n, /^[0-9a-f]{32}$/); seen.add(n); }
  assert.equal(seen.size, 2000);
});

test("B8: a kliens lenyomat-függvénye a közös modulé (a régi azonosító bájtra azonos marad)", async () => {
  const client = await import("node:fs").then(fs => fs.readFileSync(new URL("../client/src/lesson-runtime/useExperienceRound.ts", import.meta.url), "utf8"));
  assert.match(client, /export \{ experienceFingerprint \} from "@shared\/experience-fingerprint";/);
  assert.equal(experienceFingerprint({ ids: ["a"], startedAt: 0 }), (() => {
    let hash = 2166136261;
    for (const c of JSON.stringify({ ids: ["a"], startedAt: 0 })) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
    return (hash >>> 0).toString(36);
  })());
});
