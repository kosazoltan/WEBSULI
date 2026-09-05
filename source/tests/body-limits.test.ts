import assert from "node:assert/strict";
import test from "node:test";

import { LARGE_BODY_PREFIXES, needsLargeBody } from "../server/lib/body-limits";

/**
 * #162 — the 413 trap (measured from the prod screenshot: ERR_413 on
 * /api/studio/maps/extract). The large-body route list did NOT include
 * /api/studio/, so a 5-JPEG extract request (base64 data URLs, several MB)
 * hit the 1 MB standard limit and died before reaching the handler.
 * The model was never the problem: gpt-5.6-terra takes image input.
 */

function req(path: string, cookie?: string) {
  return { method: "POST", path, headers: cookie ? { cookie } : {} } as unknown as Parameters<typeof needsLargeBody>[0];
}

const SID = "connect.sid=abc123";

test("a /api/studio/ útvonal session-sütivel NAGY limitet kap (extract képekkel)", () => {
  assert.equal(needsLargeBody(req("/api/studio/maps/extract", SID)), true);
});

test("a /api/studio/ session-süti NÉLKÜL standard limitet kap (DoS-védelem marad)", () => {
  assert.equal(needsLargeBody(req("/api/studio/maps/extract")), false);
});

test("a korábbi nagy-body útvonalak változatlanul nagyok", () => {
  for (const p of ["/api/html-files", "/api/ai/improve", "/api/admin/backup"]) {
    assert.equal(needsLargeBody(req(p, SID)), true, p);
  }
});

test("publikus olcsó útvonal sütivel SEM kap nagy limitet", () => {
  assert.equal(needsLargeBody(req("/api/materials/x/likes", SID)), false);
});

test("a prefix-lista tartalmazza a /api/studio/-t (ratchet)", () => {
  assert.ok(LARGE_BODY_PREFIXES.includes("/api/studio/"));
});

/* Audit 2026-09-05 (szelet D): a süti-előszűrő hamisítható (`Cookie: connect.sid=x`) —
 * a nagy parser csak body-t hordozó metóduson futhat; GET/DELETE mindig standard. */
function reqM(method: string, path: string, cookie?: string) {
  return { method, path, headers: cookie ? { cookie } : {} } as unknown as Parameters<typeof needsLargeBody>[0];
}

test("GET a nagy-body prefixen hamis sütivel is standard limitet kap", () => {
  assert.equal(needsLargeBody(reqM("GET", "/api/studio/maps", "connect.sid=forged")), false);
  assert.equal(needsLargeBody(reqM("DELETE", "/api/admin/backups/1", SID)), false);
});

test("POST/PUT/PATCH a nagy-body prefixen sütivel nagy limitet kap", () => {
  assert.equal(needsLargeBody(reqM("POST", "/api/studio/maps/extract", SID)), true);
  assert.equal(needsLargeBody(reqM("PUT", "/api/html-files/1", SID)), true);
  assert.equal(needsLargeBody(reqM("PATCH", "/api/admin/x", SID)), true);
});
