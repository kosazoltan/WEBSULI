import assert from "node:assert/strict";
import test from "node:test";

import { buildClientErrorRequest, CLIENT_ERROR_LIMITS, KEEPALIVE_MAX_BYTES } from "../client/src/lib/client-error-body";

/** Review #309: a keepalive-törzs 64 KiB-os korlátja (kanban #127). */

const bytes = (s: string) => new TextEncoder().encode(s).length;

test("33 000 karakteres üzenet: a szerver korlátjára vágva, keepalive-val megy", () => {
  const long = "x".repeat(33_000);
  const { body, keepalive } = buildClientErrorRequest({
    errorType: "UnhandledError",
    message: long,
    url: "https://websuli.vip/",
    breadcrumbs: [{ type: "error", message: `Error: ${long}` }],
  });
  const parsed = JSON.parse(body);
  assert.equal(parsed.message.length, CLIENT_ERROR_LIMITS.message);
  assert.equal(parsed.breadcrumbs[0].message.length, CLIENT_ERROR_LIMITS.crumbMessage);
  assert.equal(keepalive, true);
  assert.ok(bytes(body) <= KEEPALIVE_MAX_BYTES);
});

test("többbájtos, maximális törzs: 60 000 bájt fölött keepalive nélkül megy (nem dobja el a böngésző)", () => {
  const o = "ő".repeat(20_000);
  const { body, keepalive } = buildClientErrorRequest({
    errorType: "UnhandledError",
    message: o,
    stack: o,
    url: "https://websuli.vip/",
    breadcrumbs: Array.from({ length: 50 }, () => ({ type: "error", message: o })),
  });
  assert.ok(bytes(body) > KEEPALIVE_MAX_BYTES);
  assert.equal(keepalive, false);
});

test("a breadcrumb `data` mezője nem megy át (csak type, timestamp, message)", () => {
  const { body } = buildClientErrorRequest({
    errorType: "E",
    message: "m",
    url: "u",
    breadcrumbs: [{ type: "click", message: "c", timestamp: "t", data: { secret: "s" } }],
  });
  assert.deepEqual(JSON.parse(body).breadcrumbs, [{ type: "click", timestamp: "t", message: "c" }]);
});
