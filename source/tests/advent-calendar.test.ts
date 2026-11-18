import assert from "node:assert/strict";
import test from "node:test";

import { adventNow, budapestMidnightUtc, budapestParts, isAdventWritable, isDoorUnlocked, isValidDate } from "../shared/advent/calendar";

/** Adventi naptár — idő és fázis (docs/specs/2026-11-18-adventi-naptar.md R5, E4, E6–E9; A12–A14). Az időpontok UTC-ben. */

const at = (iso: string) => adventNow(new Date(iso));

test("budapesti nap: decemberben CET (UTC+1) — a nap UTC 23:00-kor vált", () => {
  assert.deepEqual(budapestParts(new Date("2026-12-04T22:59:59Z")), { year: 2026, month: 12, day: 4, hour: 23, minute: 59 });
  assert.deepEqual(budapestParts(new Date("2026-12-04T23:00:00Z")), { year: 2026, month: 12, day: 5, hour: 0, minute: 0 });
  assert.equal(budapestMidnightUtc(2026, 12, 5).toISOString(), "2026-12-04T23:00:00.000Z");
  // Nyári időben (CEST, UTC+2) is a helyi éjfélt adja.
  assert.equal(budapestMidnightUtc(2026, 7, 1).toISOString(), "2026-06-30T22:00:00.000Z");
});

test("november: 23-án még semmi, 24–30. „Hamarosan” visszaszámlálással", () => {
  const before = at("2026-11-23T12:00:00Z");
  assert.equal(before.phase, "before");
  assert.equal(before.season, 2026);
  const teaser = at("2026-11-24T00:30:00Z");
  assert.equal(teaser.phase, "teaser");
  assert.equal(teaser.openDay, 0);
  assert.equal(teaser.daysUntilStart, 7);
  assert.equal(teaser.nextOpensAt, "2026-11-30T23:00:00.000Z");
  assert.equal(at("2026-11-30T12:00:00Z").daysUntilStart, 1);
  // November 23. 23:30 budapesti idő szerint még 23-a (UTC 22:30).
  assert.equal(at("2026-11-23T22:30:00Z").phase, "before");
  assert.equal(at("2026-11-23T23:00:00Z").phase, "teaser");
});

test("éjféli határ: november 30. 23:59:59 még „Hamarosan”, december 1. 00:00:00 már az 1. ablak", () => {
  const last = at("2026-11-30T22:59:59Z");
  assert.equal(last.phase, "teaser");
  assert.equal(isDoorUnlocked(1, last), false);
  const first = at("2026-11-30T23:00:00Z");
  assert.equal(first.phase, "open");
  assert.equal(first.today, "2026-12-01");
  assert.equal(first.openDay, 1);
  assert.equal(first.nextOpensAt, "2026-12-01T23:00:00.000Z");
  assert.equal(isDoorUnlocked(1, first), true);
  assert.equal(isDoorUnlocked(2, first), false);
});

test("december n.: az 1…n. ablak nyitható, az n+1…24. zárt (A12, A13)", () => {
  for (let n = 1; n <= 24; n++) {
    const now = at(`2026-12-${String(n).padStart(2, "0")}T11:00:00Z`);
    assert.equal(now.phase, "open");
    assert.equal(now.openDay, n);
    for (let day = 1; day <= 24; day++) assert.equal(isDoorUnlocked(day, now), day <= n, `december ${n}., ${day}. ablak`);
  }
  const evening = at("2026-12-04T22:59:59Z");
  assert.equal(isDoorUnlocked(5, evening), false);
  assert.equal(isDoorUnlocked(5, at("2026-12-04T23:00:00Z")), true);
  assert.equal(at("2026-12-24T12:00:00Z").nextOpensAt, null);
});

test("pótlási időszak: december 25. – január 6. mind nyitható; január 7-től lezárt (A14, E7, E8)", () => {
  const xmas = at("2026-12-25T08:00:00Z");
  assert.equal(xmas.phase, "catchup");
  assert.equal(xmas.season, 2026);
  for (let day = 1; day <= 24; day++) assert.equal(isDoorUnlocked(day, xmas), true);
  const january = at("2027-01-03T10:00:00Z");
  assert.equal(january.phase, "catchup");
  assert.equal(january.season, 2026, "januárban az évad az előző év");
  const lastDay = at("2027-01-06T22:59:59Z");
  assert.equal(lastDay.phase, "catchup");
  const closed = at("2027-01-06T23:00:00Z");
  assert.equal(closed.phase, "closed");
  assert.equal(closed.season, 2026);
  assert.equal(isDoorUnlocked(1, closed), false);
  assert.equal(isAdventWritable("closed"), false);
  assert.equal(isAdventWritable("teaser"), false);
  assert.equal(isAdventWritable("open"), true);
  assert.equal(isAdventWritable("catchup"), true);
});

test("az évszám nincs beégetve: 2026–2030 mindegyikében ugyanígy működik", () => {
  for (let year = 2026; year <= 2030; year++) {
    assert.equal(at(`${year}-06-15T10:00:00Z`).phase, "closed");
    assert.equal(at(`${year}-06-15T10:00:00Z`).season, year - 1);
    assert.equal(at(`${year}-11-01T10:00:00Z`).phase, "before");
    assert.equal(at(`${year}-11-27T10:00:00Z`).phase, "teaser");
    const mid = at(`${year}-12-12T10:00:00Z`);
    assert.equal(mid.phase, "open");
    assert.equal(mid.season, year);
    assert.equal(mid.openDay, 12);
    assert.equal(at(`${year}-12-31T22:59:59Z`).season, year);
    assert.equal(at(`${year}-12-31T23:00:00Z`).season, year, "január 1. budapesti idő szerint: még az előző évad");
  }
});

test("érvénytelen ablakszám soha nem nyitható", () => {
  const now = at("2026-12-25T08:00:00Z");
  for (const day of [0, 25, -1, 1.5, Number.NaN]) assert.equal(isDoorUnlocked(day, now), false);
});

test("december 24. → 25. éjféli határ: 23:59:59-kor még „open”, 00:00:00-kor „catchup” (review A4)", () => {
  const last = at("2026-12-24T22:59:59Z");
  assert.equal(last.phase, "open");
  assert.equal(last.today, "2026-12-24");
  assert.equal(last.openDay, 24);
  assert.equal(last.nextOpensAt, null);
  const first = at("2026-12-24T23:00:00Z");
  assert.equal(first.phase, "catchup");
  assert.equal(first.today, "2026-12-25");
  assert.equal(first.openDay, 24);
});

test("érvénytelen időpont: érthető hiba, nem csendes rossz eredmény (review A7)", () => {
  assert.equal(isValidDate(new Date("2026-12-01T00:00:00Z")), true);
  for (const bad of [new Date(Number.NaN), new Date("nem dátum"), "2026-12-01", null, undefined, 0]) assert.equal(isValidDate(bad), false);
  assert.throws(() => budapestParts(new Date(Number.NaN)), /érvénytelen időpont/);
  assert.throws(() => adventNow(new Date("x")), RangeError);
});
