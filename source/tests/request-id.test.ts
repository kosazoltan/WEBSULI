import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";

import { requestIdMiddleware } from "../server/middleware/request-id";

/**
 * server/middleware/request-id.ts — the first middleware in the chain. It reflects the
 * caller's X-Request-ID back into the response and stores it on the request, from where
 * it reaches the logs and the error-report e-mail. That makes it attacker-influenced.
 */

function run(headerValue?: string | string[]): {
  requestId: string;
  responseHeader: unknown;
  nextCalled: boolean;
} {
  let nextCalled = false;
  const headers: Record<string, unknown> = {};
  if (headerValue !== undefined) headers["x-request-id"] = headerValue;

  const req = { headers } as unknown as Request;
  const setHeaders: Record<string, unknown> = {};
  const res = {
    setHeader(name: string, value: unknown) {
      setHeaders[name] = value;
    },
  } as unknown as Response;
  const next: NextFunction = () => {
    nextCalled = true;
  };

  requestIdMiddleware(req, res, next);
  return {
    requestId: (req as Request & { requestId: string }).requestId,
    responseHeader: setHeaders["X-Request-ID"],
    nextCalled,
  };
}

test("a request without the header gets a fresh UUID", () => {
  const { requestId, responseHeader, nextCalled } = run();
  assert.match(requestId, /^[0-9a-f-]{36}$/);
  assert.equal(responseHeader, requestId);
  assert.equal(nextCalled, true);
});

test("two requests get different ids", () => {
  assert.notEqual(run().requestId, run().requestId);
});

test("a well-formed caller-supplied id is preserved for trace correlation", () => {
  const { requestId, responseHeader } = run("trace-abc-123");
  assert.equal(requestId, "trace-abc-123");
  assert.equal(responseHeader, "trace-abc-123");
});

test("an empty header value falls back to a generated id", () => {
  const { requestId } = run("");
  assert.match(requestId, /^[0-9a-f-]{36}$/);
});

test("a repeated header (array) does not leak an array into the response", () => {
  const { requestId, responseHeader } = run(["a", "b"]);
  assert.equal(typeof requestId, "string");
  assert.equal(typeof responseHeader, "string");
});

test("an over-long caller-supplied id is not reflected verbatim", () => {
  // The value is echoed into a response header and stored in a varchar(100) column;
  // an unbounded value is a header-bloat and truncation hazard.
  const { requestId } = run("x".repeat(5000));
  assert.ok(requestId.length <= 200, `id length ${requestId.length}`);
});

test("a caller-supplied id with unsafe characters is rejected", () => {
  // Anything outside a conservative trace-id charset is replaced by a generated UUID
  // rather than being echoed into a header and into log lines.
  for (const bad of ["<script>", "a b", "a\tb", "ünïcode", 'a"b']) {
    const { requestId } = run(bad);
    assert.match(requestId, /^[0-9a-f-]{36}$/, `${JSON.stringify(bad)} → ${requestId}`);
  }
});

test("always calls next()", () => {
  assert.equal(run().nextCalled, true);
  assert.equal(run("abc").nextCalled, true);
  assert.equal(run("<bad>").nextCalled, true);
});
