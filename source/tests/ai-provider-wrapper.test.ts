import assert from "node:assert/strict";
import test from "node:test";

import { AIProviderError, withAIProvider } from "../server/lib/ai-provider-wrapper";

/**
 * server/lib/ai-provider-wrapper.ts — bounds every upstream AI call (timeout + retry) and
 * maps failures to a safe, non-leaking client error.
 */

test("a successful call returns its result and does not retry", async () => {
  let calls = 0;
  const out = await withAIProvider(async () => {
    calls++;
    return "ok";
  });
  assert.equal(out, "ok");
  assert.equal(calls, 1);
});

test("the callback receives an AbortSignal", async () => {
  await withAIProvider(async (signal) => {
    assert.ok(signal instanceof AbortSignal);
    assert.equal(signal.aborted, false);
    return null;
  });
});

test("a transient failure is retried and can then succeed", async () => {
  let calls = 0;
  const out = await withAIProvider(
    async () => {
      calls++;
      if (calls === 1) throw new Error("socket hang up");
      return "recovered";
    },
    { retries: 1, retryDelayMs: 1 },
  );
  assert.equal(out, "recovered");
  assert.equal(calls, 2);
});

test("retries are bounded and the raw upstream message is not leaked", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withAIProvider(
        async () => {
          calls++;
          throw new Error("upstream said: API key sk-live-secret is invalid");
        },
        { retries: 2, retryDelayMs: 1 },
      ),
    (err: unknown) => {
      assert.ok(err instanceof AIProviderError);
      assert.equal(err.code, "UPSTREAM_ERROR");
      assert.equal(err.statusHint, 502);
      assert.equal(err.message, "AI provider error");
      assert.ok(!err.message.includes("sk-live-secret"));
      return true;
    },
  );
  assert.equal(calls, 3, "initial attempt + 2 retries");
});

test("a rate limit is surfaced as 429 and never retried", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withAIProvider(
        async () => {
          calls++;
          throw new Error("Request failed with status 429 rate limit exceeded");
        },
        { retries: 3, retryDelayMs: 1 },
      ),
    (err: unknown) => {
      assert.ok(err instanceof AIProviderError);
      assert.equal(err.code, "RATE_LIMITED");
      assert.equal(err.statusHint, 429);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test("a hung call is aborted and reported as TIMEOUT", async () => {
  await assert.rejects(
    () =>
      withAIProvider(
        (signal) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => {
              const err = new Error("aborted");
              err.name = "AbortError";
              reject(err);
            });
          }),
        { timeoutMs: 20, retries: 0 },
      ),
    (err: unknown) => {
      assert.ok(err instanceof AIProviderError);
      assert.equal(err.code, "TIMEOUT");
      assert.equal(err.statusHint, 504);
      return true;
    },
  );
});

test("the timeout signal actually fires on the callback", async () => {
  let sawAbort = false;
  await assert.rejects(() =>
    withAIProvider(
      (signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            sawAbort = true;
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
      { timeoutMs: 20, retries: 0 },
    ),
  );
  assert.equal(sawAbort, true);
});

test("an already-mapped AIProviderError is not retried", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withAIProvider(
        async () => {
          calls++;
          throw new AIProviderError("nope", "UNKNOWN", 500);
        },
        { retries: 3, retryDelayMs: 1 },
      ),
    (err: unknown) => err instanceof AIProviderError,
  );
  assert.equal(calls, 1, "isTransient() must treat a mapped error as final");
});

test("the timer is cleared so a fast call does not keep the process alive", async () => {
  // A leaked setTimeout would hold the event loop open for timeoutMs after every call.
  const before = process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;
  await withAIProvider(async () => "fast", { timeoutMs: 60_000 });
  const after = process.getActiveResourcesInfo().filter((r) => r === "Timeout").length;
  assert.ok(after <= before, `timer leaked: ${before} → ${after}`);
});
