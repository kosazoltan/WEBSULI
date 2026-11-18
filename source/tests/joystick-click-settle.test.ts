// A joystick-mérő „kattintás, majd nyugvás” segédje szimulált órával (review #514, P2; docs/specs/2026-11-18-joystick-tsunami-stabil.md).
import assert from "node:assert/strict";
import { test } from "node:test";

import { clickThenSettle, type Clock } from "./support/click-settle";

/** Szimulált óra: az `advance` és a `sleep` léptet; a `slept` az alvások listája. */
function fakeClock(): Clock & { advance: (ms: number) => void; slept: number[]; t: () => number } {
  let now = 0;
  const slept: number[] = [];
  return {
    now: () => now,
    sleep: async (ms) => {
      slept.push(ms);
      now += ms;
    },
    advance: (ms) => {
      now += ms;
    },
    slept,
    t: () => now,
  };
}

test("lassú kattintás: a kattintásra várás NEM számít bele a nyugvásba (700 ms kattintás + 900 ms kijelzés → még 600 ms)", async () => {
  const c = fakeClock();
  const ok = await clickThenSettle(
    async () => c.advance(700),
    async () => c.advance(900),
    1500,
    c,
  );
  assert.equal(ok, true);
  assert.deepEqual(c.slept, [600]);
  // A sikeres kattintás vége (700) után pontosan 1500 ms telt el — mint a javítás előtti `click()` + `waitForTimeout(1500)`-nál.
  assert.equal(c.t(), 700 + 1500);
});

test("ha az állapotra várás tovább tart a nyugvásnál, nincs további alvás", async () => {
  const c = fakeClock();
  await clickThenSettle(async () => c.advance(100), async () => c.advance(2000), 1500, c);
  assert.deepEqual(c.slept, []);
  assert.equal(c.t(), 2100);
});

test("a kártyabezárás 500 ms-a ugyanígy a kattintás végétől számít", async () => {
  const c = fakeClock();
  await clickThenSettle(async () => c.advance(450), async () => c.advance(100), 500, c);
  assert.deepEqual(c.slept, [400]);
  assert.equal(c.t(), 450 + 500);
});

test("sikertelen kattintás (a cél közben eltűnt / letiltódott): false, nincs állapotra várás és alvás", async () => {
  const c = fakeClock();
  let waited = false;
  const ok = await clickThenSettle(
    async () => {
      c.advance(2000);
      throw new Error("locator.click: Timeout 2000ms exceeded");
    },
    async () => {
      waited = true;
    },
    1500,
    c,
  );
  assert.equal(ok, false);
  assert.equal(waited, false);
  assert.deepEqual(c.slept, []);
});
