import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ADVENT_TEST_NOW_HEADER, adventClock, adventEnabled } from "../server/advent/clock";

/**
 * Adventi naptár — forrás- és óra-őr (docs/specs/2026-11-18-adventi-naptar.md R9, 16.5; A22, A23, A51).
 * A forrás-állítások LF-re normalizált szövegen futnak (a munkafa CRLF is lehet).
 */
const dir = fileURLToPath(new URL("../server/advent/", import.meta.url));
const sources = readdirSync(dir).filter((f) => f.endsWith(".ts")).map((f) => ({ name: f, text: readFileSync(`${dir}${f}`, "utf8").replace(/\r\n/g, "\n") }));
const req = (value?: string) => ({ get: (name: string) => (name.toLowerCase() === ADVENT_TEST_NOW_HEADER ? value : undefined) });
const REAL = new Date("2026-12-10T08:00:00.000Z");

test("flag: csak a pontos on / 1 / true kapcsol be (A23)", () => {
  for (const on of ["on", "1", "true", " ON ", "True"]) assert.equal(adventEnabled({ ADVENT_CALENDAR: on }), true, on);
  for (const off of [undefined, "", "off", "0", "false", "yes", "igen", "enabled"]) assert.equal(adventEnabled({ ADVENT_CALENDAR: off }), false, String(off));
});

test("óra élesben: mindig a szerver órája — a tesztidő-fejléc hatástalan (R9)", () => {
  assert.equal(adventClock(req("2026-12-24T10:00:00Z"), {}, () => REAL)?.toISOString(), REAL.toISOString());
  assert.equal(adventClock(req(), { NODE_ENV: "production" }, () => REAL)?.toISOString(), REAL.toISOString());
  assert.equal(adventClock(req("2030-01-01T00:00:00Z"), { WEBSULI_E2E: "0" }, () => REAL)?.toISOString(), REAL.toISOString());
});

test("óra e2e-módban: fejléc nélkül vagy hibás fejléccel NINCS idő (a naptár kikapcsolt); érvényes fejléccel az számít (A51)", () => {
  const e2e = { WEBSULI_E2E: "1" };
  assert.equal(adventClock(req(), e2e, () => REAL), null, "decemberi rendszeridővel is kikapcsolt");
  for (const bad of ["", "2026-12-05", "holnap", "2026-13-45T10:00:00Z", "2026-12-05T10:00:00+01:00", "2026-12-05 10:00:00Z", "1733392800000"]) {
    assert.equal(adventClock(req(bad), e2e, () => REAL), null, bad);
  }
  assert.equal(adventClock(req("2026-12-05T10:00:00Z"), e2e, () => REAL)?.toISOString(), "2026-12-05T10:00:00.000Z");
  assert.equal(adventClock(req("2026-12-05T10:00:00.250Z"), e2e, () => REAL)?.toISOString(), "2026-12-05T10:00:00.250Z");
});

test("a tesztidő-fejlécet egyetlen hely olvassa, az e2e-ellenőrzés UTÁN", () => {
  const readers = sources.filter((s) => s.text.includes("ADVENT_TEST_NOW_HEADER") || s.text.includes("x-advent-test-now"));
  assert.deepEqual(readers.map((s) => s.name), ["clock.ts"]);
  const clock = readers[0]!.text;
  const body = clock.slice(clock.indexOf("export function adventClock("));
  assert.ok(body.indexOf("if (!isE2eMode(env)) return realNow();") > 0);
  assert.ok(body.indexOf("if (!isE2eMode(env)) return realNow();") < body.indexOf("req.get(ADVENT_TEST_NOW_HEADER)"));
});

test("a szerver-modulok naplója nem tartalmazhat tokent, eszközazonosítót, nevet vagy hibaüzenetet (A22)", () => {
  let calls = 0;
  for (const source of sources) {
    for (const line of source.text.split("\n")) {
      if (!/\blogger\.(info|warn|error|debug)\(/.test(line)) continue;
      calls++;
      assert.match(line, /logger\.(warn|error)\(`\[ADVENT\] [^$`]*: \$\{errorClass\(error\)\}`\)/, `${source.name}: csak a hiba osztálya naplózható — ${line.trim()}`);
    }
    assert.doesNotMatch(source.text, /console\.(log|info|warn|error)\(/, `${source.name}: console-hívás`);
  }
  assert.ok(calls >= 2, "a végpontok hibái naplózódnak (osztály szerint)");
});

test("az azonosítók nem kerülnek URL-be: a végpontok a tokent és az eszközazonosítót fejlécből / törzsből olvassák", () => {
  const routes = sources.find((s) => s.name === "routes.ts")!.text;
  assert.doesNotMatch(routes, /req\.query/);
  assert.match(routes, /req\.get\("x-learner-token"\)/);
  assert.match(routes, /req\.get\("x-advent-device"\)/);
  assert.match(routes, /learnerToken: body\.learner, device: body\.device/);
});
