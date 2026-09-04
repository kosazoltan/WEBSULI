import assert from "node:assert/strict";
import test from "node:test";

import { createPromptStore } from "../server/lib/prompt-store";

/**
 * LS-0d — prompt store with a hard-coded fallback.
 *
 * Prompts move from string literals in routes.ts into the `system_prompts` table so the
 * owner can edit them without a deploy. The store must be FAIL-OPEN: if the row is not
 * seeded yet, or the database is unreachable, the request must still run on the original
 * inline text. A prompt lookup is never a reason to 500 an AI endpoint.
 */

test("returns the stored prompt when the row exists", async () => {
  const store = createPromptStore({
    load: async () => "DB verzió",
    now: () => 0,
  });
  assert.equal(await store.get("legacy.htmlFix.v1", "beégetett"), "DB verzió");
});

test("falls back to the inline text when the row is missing", async () => {
  const store = createPromptStore({
    load: async () => null,
    now: () => 0,
  });
  assert.equal(await store.get("legacy.htmlFix.v1", "beégetett"), "beégetett");
});

test("falls back to the inline text when the database throws", async () => {
  const store = createPromptStore({
    load: async () => {
      throw new Error("connection refused");
    },
    now: () => 0,
  });
  assert.equal(await store.get("legacy.htmlFix.v1", "beégetett"), "beégetett");
});

test("an empty or whitespace-only row does not silently blank the prompt", async () => {
  const store = createPromptStore({ load: async () => "   ", now: () => 0 });
  assert.equal(await store.get("legacy.htmlFix.v1", "beégetett"), "beégetett");
});

test("a hit is cached for the TTL and the loader is not called again", async () => {
  let calls = 0;
  let clock = 0;
  const store = createPromptStore({
    load: async () => {
      calls += 1;
      return `v${calls}`;
    },
    now: () => clock,
    ttlMs: 60_000,
  });

  assert.equal(await store.get("p", "fallback"), "v1");
  clock = 59_000;
  assert.equal(await store.get("p", "fallback"), "v1", "still cached");
  assert.equal(calls, 1);

  clock = 61_000;
  assert.equal(await store.get("p", "fallback"), "v2", "reloaded after TTL");
  assert.equal(calls, 2);
});

test("a failed load is not cached as a permanent fallback", async () => {
  // A transient DB blip must not pin the process to the inline text for the whole TTL.
  let calls = 0;
  const store = createPromptStore({
    load: async () => {
      calls += 1;
      if (calls === 1) throw new Error("blip");
      return "DB verzió";
    },
    now: () => 0,
    ttlMs: 60_000,
  });

  assert.equal(await store.get("p", "fallback"), "fallback");
  assert.equal(await store.get("p", "fallback"), "DB verzió");
});
