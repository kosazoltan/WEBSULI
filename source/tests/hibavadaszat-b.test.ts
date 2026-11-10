import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { NextFunction, Request, Response } from "express";

import { asyncRoute } from "../server/lib/async-route";

// Spec 2026-11-10-hibavadaszat, B szelet (szerver).
const serverDir = join(fileURLToPath(new URL(".", import.meta.url)), "..", "server");
const read = (rel: string): string => readFileSync(join(serverDir, rel), "utf8");

test("B1 · asyncRoute: az elutasított ígéret next(err)-be kerül, a sikeres kezelő érintetlen", async () => {
  const boom = new Error("adatbázis-hiba");
  const seen: unknown[] = [];
  const next = ((err?: unknown) => { seen.push(err); }) as NextFunction;
  asyncRoute(async () => { throw boom; })({} as Request, {} as Response, next);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(seen, [boom]);

  let handled = false;
  asyncRoute(async () => { handled = true; })({} as Request, {} as Response, next);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(handled, true);
  assert.deepEqual(seen, [boom], "sikernél a next nem hívódik");

  // a szinkron dobás is next(err)-be kerül
  asyncRoute(() => { throw boom; })({} as Request, {} as Response, next);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(seen, [boom, boom]);
});

test("B2 · summaryWindow: normál nap 24 óra, óraátállításkor 23 / 25 óra", async () => {
  const { summaryWindow } = await import("../server/dailyViewSummary");
  const hours = (now: string) => {
    const w = summaryWindow(new Date(now));
    assert.equal(w.end.toISOString(), new Date(now).toISOString());
    return (w.end.getTime() - w.start.getTime()) / 3_600_000;
  };
  // 20:00 budapesti idő: nyáron 18:00Z, télen 19:00Z
  assert.equal(hours("2026-06-15T18:00:00Z"), 24);
  assert.equal(hours("2026-01-15T19:00:00Z"), 24);
  assert.equal(hours("2026-03-29T18:00:00Z"), 23, "tavaszi óraátállítás");
  assert.equal(hours("2026-10-25T19:00:00Z"), 25, "őszi óraátállítás");
  // az ablak kezdete az előző nap 20:00-ja (budapesti)
  assert.equal(summaryWindow(new Date("2026-03-29T18:00:00Z")).start.toISOString(), "2026-03-28T19:00:00.000Z");
  assert.equal(summaryWindow(new Date("2026-10-25T19:00:00Z")).start.toISOString(), "2026-10-24T18:00:00.000Z");
});

test("B1-B3 · forrásőrök", () => {
  assert.match(read("dailyViewSummary.ts"), /timezone: "Europe\/Budapest"/);
  assert.doesNotMatch(read("routes.ts"), /req\.ip/);
  assert.doesNotMatch(read("lesson-result-email.ts"), /req\.ip/);
  assert.match(read("index.ts"), /process\.on\("unhandledRejection"/);
  assert.doesNotMatch(read("arbiter/routes.ts"), /CURRENT_DATE/);
});
