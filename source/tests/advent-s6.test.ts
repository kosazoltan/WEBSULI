import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { previewDateFrom } from "../server/advent/preview";
import { ADVENT_SWEEP_INTERVAL_MS, startAdventSweeper } from "../server/advent/sweeper";

/**
 * Adventi naptár S6 — az admin-előnézet órája, a takarító ütemezése és a bekötések forrás-őrei
 * (docs/specs/2026-11-18-adventi-naptar.md 16.5, E23, A16; végrehajtás „S6”). A HTTP-út: tests/advent-routes-db.integration.ts
 * „admin-előnézet”; a böngészős út: tests/advent-calendar.spec.ts „admin-előnézet (A16, S6)”; az admin-őr: tests/admin-route-guard.test.ts.
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");

test("S6: az előnézet órája a megadott budapesti nap 12:00-ja; csak ÉÉÉÉ-HH-NN alakú, létező nap", () => {
  assert.equal(previewDateFrom("2026-12-10")?.toISOString(), "2026-12-10T11:00:00.000Z", "téli idő: 12:00 Budapest = 11:00 UTC");
  assert.equal(previewDateFrom("2026-07-01")?.toISOString(), "2026-07-01T10:00:00.000Z", "nyári idő: 12:00 Budapest = 10:00 UTC");
  assert.equal(previewDateFrom("2027-01-07")?.toISOString(), "2027-01-07T11:00:00.000Z");
  for (const bad of ["", "2026-12-1", "2026-13-01", "2026-02-30", "2026-12-10T10:00", " 2026-12-10", "1999-12-10", "2101-01-01", 20261210, null, undefined, ["2026-12-10"]]) {
    assert.equal(previewDateFrom(bad), null, `érvénytelen: ${JSON.stringify(bad)}`);
  }
});

test("S6: a takarító induláskor azonnal fut, utána 24 óránként, unref()-elt időzítővel; a hibát elnyeli (a következő kör újra próbál)", async () => {
  const calls: { now: string; season: number }[] = [];
  let intervalMs = 0;
  let unrefed = false;
  let tick: (() => void) | null = null;
  const timers = { setInterval: (fn: () => void, ms: number) => { tick = fn; intervalMs = ms; return { unref: () => { unrefed = true; } }; } };
  let fail = true;
  const run = startAdventSweeper({
    sweep: async (now, season) => {
      calls.push({ now: now.toISOString(), season });
      if (fail) { fail = false; throw new Error("átmeneti DB-hiba"); }
      return { devices: 1, previews: 0, announcements: 0 };
    },
  }, timers, () => new Date("2027-01-08T03:00:00Z"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1, "induláskor egyszer lefut");
  assert.equal(calls[0]!.season, 2026, "január 8-án a 2026-os évad a jelenlegi");
  assert.equal(intervalMs, ADVENT_SWEEP_INTERVAL_MS);
  assert.equal(ADVENT_SWEEP_INTERVAL_MS, 24 * 60 * 60_000);
  assert.equal(unrefed, true, "az időzítő nem tartja életben a folyamatot");
  tick!();
  await run();
  assert.equal(calls.length, 3, "a hiba után a következő kör is fut");
});

test("S6: bekötés — az előnézet az admin-őr mögött, a kapcsoló nélkül; a takarító E2E-ben nem indul", () => {
  const routes = read("server/routes.ts");
  assert.match(routes, /app\.use\("\/api\/admin\/advent\/preview", isAuthenticatedAdmin, createAdventPreviewRouter\(\{/);
  const preview = read("server/advent/preview.ts");
  assert.match(preview, /enabled: \(\) => true,/, "a kapcsolótól független (terv 16.5)");
  assert.doesNotMatch(preview, /onAnswer/, "az előnézetről levél nem megy");
  const index = read("server/index.ts");
  const block = index.slice(index.indexOf("if (!e2e) {"), index.indexOf("// Express error handler"));
  assert.match(block, /startAdventSweeper\(\{\s+sweep: \(now, season\) => adventStore\.sweep\(now, season\)/, "a takarító csak az E2E-n kívüli ágban indul");
  // A kliens előnézeti útja: 401 / 403 → normál naptár; a sáv és a törlés gombja.
  const hook = read("client/src/advent/useAdvent.ts");
  assert.match(hook, /if \(refusedPreview\(res\.status\)\) \{ refuseAdventPreview\(\); return fetchAdventState\(createDevice, signal\); \}/);
  const page = read("client/src/pages/AdventCalendar.tsx");
  assert.match(page, /data-testid="advent-preview-banner"/);
  assert.match(page, /data-testid="advent-preview-reset"/);
});
