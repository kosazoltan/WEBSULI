import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isRetryableRequestError } from "../shared/request-retry";

// Spec 2026-11-10-gyartas-meres (J5).
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("J5 — isRetryableRequestError: a becsomagolt hálózati hiba és időtúllépés is újrapróbálható; 4xx nem", () => {
  const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
  assert.equal(isRetryableRequestError(new TypeError("Failed to fetch")), true);
  assert.equal(isRetryableRequestError(new TypeError("Load failed")), true, "Safari");
  assert.equal(isRetryableRequestError(abort), true);
  // az apiRequest így csomagol:
  assert.equal(isRetryableRequestError(new Error("Hálózati hiba: Nincs internetkapcsolat vagy a szerver nem érhető el.", { cause: new TypeError("Failed to fetch") })), true);
  assert.equal(isRetryableRequestError(new Error("A kérés túllépte az időkorlátot (60s).", { cause: abort })), true);
  const http = (status: number) => Object.assign(new Error(`${status}`), { status });
  for (const status of [500, 502, 503, 504]) assert.equal(isRetryableRequestError(http(status)), true, String(status));
  for (const status of [400, 401, 403, 404, 409, 422, 429]) assert.equal(isRetryableRequestError(http(status)), false, String(status));
  assert.equal(isRetryableRequestError(new Error("valami más")), false);
  assert.equal(isRetryableRequestError("szöveg"), false);
  assert.equal(isRetryableRequestError(undefined), false);
  // a státuszos hiba dönt, akkor is, ha az oka hálózati lenne
  assert.equal(isRetryableRequestError(Object.assign(new Error("404", { cause: new TypeError("x") }), { status: 404 })), false);
  // körkörös ok-lánc nem akaszt
  const a = new Error("a"), b = new Error("b", { cause: a });
  (a as { cause?: unknown }).cause = b;
  assert.equal(isRetryableRequestError(a), false);
});

test("J5 — forrásőr: az eredménybeküldés újrapróbál, az apiRequest a becsomagolt hibát is felismeri", () => {
  const report = source("../client/src/lesson-runtime/resultReport.ts");
  assert.match(report, /export const RESULT_REPORT_RETRIES = [1-5];/);
  assert.match(report, /\/results`, body, \{ retries: RESULT_REPORT_RETRIES \}\)/);
  const client = source("../client/src/lib/queryClient.ts");
  assert.match(client, /isRetryableRequestError\(error\)/);
  // az írási műveletek alapértéke változatlanul 0 újrapróbálás (duplikáció ellen)
  assert.match(client, /const retries = options\?\.retries \?\? 0;/);
});
