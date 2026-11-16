/**
 * JM0: a pontbeküldés runId-ja és újrapróba-szabályai (client/src/lib/gameScoreRetry.ts), a #443 review-leletei alapján.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import {
  MAX_RETRY_WAIT_MS,
  isValidRunId,
  newScoreRunId,
  retryDelayMs,
  sendScoreWithRetry,
  type ScoreRetryDeps,
} from "../client/src/lib/gameScoreRetry";

const RUN_ID = "0b2f9c1e-3d4a-4f5b-8c6d-7e8f9a0b1c2d";

function harness(opts: { failures: unknown[]; abortDuringWait?: boolean }) {
  const sent: Array<Record<string, unknown>> = [];
  const waits: number[] = [];
  const controller = new AbortController();
  let call = 0;
  const send = async (payload: Record<string, unknown>) => {
    sent.push(payload);
    const failure = opts.failures[call++];
    if (failure !== undefined) throw failure;
    return { ok: true };
  };
  const deps: ScoreRetryDeps = {
    signal: controller.signal,
    jitterMs: () => 250,
    wait: async (ms) => {
      waits.push(ms);
      if (opts.abortDuringWait) {
        controller.abort();
        return false;
      }
      return true;
    },
  };
  return { send, deps, sent, waits, controller };
}

describe("JM0 — runId képzés", () => {
  it("randomUUID elérhető: érvényes UUID", () => {
    const id = newScoreRunId({ randomUUID: () => RUN_ID });
    assert.equal(id, RUN_ID);
  });

  it("randomUUID nélkül getRandomValues-ból szabályos UUID v4, amit a szerver zod .uuid() validátora elfogad", () => {
    const fake = { getRandomValues: <T extends ArrayBufferView | null>(a: T): T => { (a as unknown as Uint8Array).fill(0xff); return a; } };
    const id = newScoreRunId(fake);
    assert.ok(id && isValidRunId(id), `érvénytelen: ${id}`);
    assert.equal(z.string().uuid().safeParse(id).success, true);
    assert.match(id!, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("valódi véletlennel is érvényes és egyedi", () => {
    const ids = new Set(Array.from({ length: 50 }, () => newScoreRunId({ getRandomValues: (a) => { require_fill(a as unknown as Uint8Array); return a; } })));
    assert.equal(ids.size, 50);
    for (const id of ids) assert.equal(z.string().uuid().safeParse(id).success, true);
  });

  it("kriptográfiai véletlen nélkül nincs runId", () => {
    assert.equal(newScoreRunId({}), undefined);
    assert.equal(newScoreRunId(null as never), undefined);
    assert.equal(newScoreRunId({ randomUUID: () => { throw new Error("x"); } }), undefined);
  });
});

function require_fill(bytes: Uint8Array): void {
  for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
}

describe("JM0 — újrapróba-szabályok", () => {
  it("429 + Retry-After: 5 → egy újrapróba legalább 5 mp után, ugyanazzal a runId-val, siker", async () => {
    const h = harness({ failures: [{ status: 429, retryAfterSec: 5 }] });
    const payload = { runXp: 10, runId: RUN_ID };
    const result = await sendScoreWithRetry(h.send, payload, h.deps);
    assert.deepEqual(result, { ok: true });
    assert.equal(h.sent.length, 2);
    assert.equal(h.sent[1]!.runId, RUN_ID);
    assert.deepEqual(h.sent[0], h.sent[1]);
    assert.ok(h.waits[0]! >= 5000 && h.waits[0]! <= 6000, `várakozás: ${h.waits[0]}`);
  });

  it("429 + Retry-After: 600 → nincs vak újrapróba", async () => {
    const h = harness({ failures: [{ status: 429, retryAfterSec: 600 }] });
    await assert.rejects(sendScoreWithRetry(h.send, { runId: RUN_ID }, h.deps));
    assert.equal(h.sent.length, 1);
    assert.equal(h.waits.length, 0);
  });

  it("429 Retry-After nélkül → nincs újrapróba; a plafon (30 mp) még belefér", () => {
    assert.equal(retryDelayMs({ status: 429 }, 0), null);
    assert.equal(retryDelayMs({ status: 429, retryAfterSec: MAX_RETRY_WAIT_MS / 1000 }, 0), MAX_RETRY_WAIT_MS);
    assert.equal(retryDelayMs({ status: 429, retryAfterSec: MAX_RETRY_WAIT_MS / 1000 + 1 }, 0), null);
  });

  it("hálózati hiba / 5xx → egy újrapróba ugyanazzal a runId-val; ha az is elbukik, a hiba a hívóhoz kerül, további próba nincs", async () => {
    const net = harness({ failures: [new TypeError("Failed to fetch")] });
    await sendScoreWithRetry(net.send, { runId: RUN_ID }, net.deps);
    assert.equal(net.sent.length, 2);

    const twice = harness({ failures: [{ status: 503 }, { status: 503 }, { status: 503 }] });
    await assert.rejects(sendScoreWithRetry(twice.send, { runId: RUN_ID }, twice.deps));
    assert.equal(twice.sent.length, 2);
  });

  it("4xx (400, 403, 409) → nincs újrapróba", async () => {
    for (const status of [400, 403, 409]) {
      const h = harness({ failures: [{ status }] });
      await assert.rejects(sendScoreWithRetry(h.send, { runId: RUN_ID }, h.deps));
      assert.equal(h.sent.length, 1, `status ${status}`);
    }
  });

  it("runId nélkül (vagy érvénytelen runId-val) soha nincs újrapróba", async () => {
    for (const payload of [{ runXp: 1 }, { runXp: 1, runId: undefined }, { runXp: 1, runId: "nem-uuid" }]) {
      for (const failure of [new TypeError("Failed to fetch"), { status: 503 }, { status: 429, retryAfterSec: 1 }]) {
        const h = harness({ failures: [failure] });
        await assert.rejects(sendScoreWithRetry(h.send, payload, h.deps));
        assert.equal(h.sent.length, 1);
        assert.equal(h.waits.length, 0);
      }
    }
  });

  it("az oldal elhagyásakor (megszakítás) a várakozás véget ér, nincs újraküldés", async () => {
    const h = harness({ failures: [{ status: 429, retryAfterSec: 5 }], abortDuringWait: true });
    await assert.rejects(sendScoreWithRetry(h.send, { runId: RUN_ID }, h.deps), (e: unknown) => (e as { status?: number }).status === 429);
    assert.equal(h.sent.length, 1);

    const pre = harness({ failures: [{ status: 503 }] });
    pre.controller.abort();
    await assert.rejects(sendScoreWithRetry(pre.send, { runId: RUN_ID }, pre.deps));
    assert.equal(pre.sent.length, 1);
    assert.equal(pre.waits.length, 0);
  });
});
