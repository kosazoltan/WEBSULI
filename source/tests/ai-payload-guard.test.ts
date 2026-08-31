import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";

import { aiPayloadGuard } from "../server/lib/ai-payload-guard";

/**
 * server/lib/ai-payload-guard.ts — the cost/prompt-injection guard mounted on /api/ai/*.
 * Oversized inputs are rejected with 413; long-but-harmless inputs are trimmed instead.
 */

interface Captured {
  status?: number;
  body?: unknown;
  nextCalled: boolean;
}

function run(body: unknown, limits = {}): { captured: Captured; body: unknown } {
  const captured: Captured = { nextCalled: false };
  const req = { body } as unknown as Request;
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(payload: unknown) {
      captured.body = payload;
      return this;
    },
  } as unknown as Response;
  const next: NextFunction = () => {
    captured.nextCalled = true;
  };

  aiPayloadGuard(limits)(req, res, next);
  return { captured, body: req.body };
}

// ------------------------------------------------------------------ pass-through

test("a request with no body passes through", () => {
  const { captured } = run(undefined);
  assert.equal(captured.nextCalled, true);
  assert.equal(captured.status, undefined);
});

test("a small, well-formed payload passes through untouched", () => {
  const payload = {
    files: [{ content: "hello" }],
    customPrompt: "Készíts kvízt",
    conversationHistory: [{ role: "user", content: "szia" }],
  };
  const { captured, body } = run(payload);
  assert.equal(captured.nextCalled, true);
  assert.deepEqual(body, payload);
});

// ------------------------------------------------------------------------ files

test("too many files are rejected with 413", () => {
  const files = Array.from({ length: 21 }, () => ({ content: "x" }));
  const { captured } = run({ files });
  assert.equal(captured.status, 413);
  assert.equal(captured.nextCalled, false);
  assert.match(String((captured.body as { error: string }).error), /Too many files/);
});

test("exactly the file limit is accepted", () => {
  const files = Array.from({ length: 20 }, () => ({ content: "x" }));
  const { captured } = run({ files });
  assert.equal(captured.nextCalled, true);
});

test("an oversized file is rejected with 413", () => {
  const { captured } = run({ files: [{ content: "x".repeat(256 * 1024 + 1) }] });
  assert.equal(captured.status, 413);
  assert.equal(captured.nextCalled, false);
});

test("file size is measured in bytes, not characters", () => {
  // "é" is 2 bytes in UTF-8, so 200k of them exceed a 256KB byte budget while being
  // only 200k characters long.
  const { captured } = run({ files: [{ content: "é".repeat(200_000) }] });
  assert.equal(captured.status, 413, "multi-byte content must be measured as bytes");
});

test("a file entry without content is treated as empty rather than crashing", () => {
  const { captured } = run({ files: [{}, null] });
  assert.equal(captured.nextCalled, true);
});

test("a non-array `files` value is ignored", () => {
  const { captured } = run({ files: "not-an-array" });
  assert.equal(captured.nextCalled, true);
});

// ---------------------------------------------------------------- customPrompt

test("an over-long customPrompt is rejected with 413", () => {
  const { captured } = run({ customPrompt: "x".repeat(2001) });
  assert.equal(captured.status, 413);
  assert.equal(captured.nextCalled, false);
});

test("a customPrompt at the limit is accepted", () => {
  const { captured } = run({ customPrompt: "x".repeat(2000) });
  assert.equal(captured.nextCalled, true);
});

// -------------------------------------------------------------- soft trimming

test("an over-long extractedText is truncated instead of rejected", () => {
  const { captured, body } = run({ extractedText: "x".repeat(60_000) });
  assert.equal(captured.nextCalled, true);
  assert.equal((body as { extractedText: string }).extractedText.length, 50_000);
});

test("a long conversationHistory keeps only the most recent turns", () => {
  const history = Array.from({ length: 30 }, (_, i) => ({ role: "user", content: `m${i}` }));
  const { captured, body } = run({ conversationHistory: history });
  assert.equal(captured.nextCalled, true);
  const kept = (body as { conversationHistory: Array<{ content: string }> }).conversationHistory;
  assert.equal(kept.length, 20);
  assert.equal(kept[0].content, "m10", "oldest turns must be dropped, not newest");
  assert.equal(kept[kept.length - 1].content, "m29");
});

// -------------------------------------------------------------- custom limits

test("the limits are configurable", () => {
  const { captured } = run({ files: [{ content: "x" }, { content: "y" }] }, { maxFiles: 1 });
  assert.equal(captured.status, 413);
});
