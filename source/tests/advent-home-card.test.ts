import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { AdventDoorView, AdventState } from "../shared/advent/contract";
import { homeCardReserve, homeCardStatus } from "../shared/advent/home-card";
import { adventSummary, type DoorState } from "../shared/advent/rules";

/**
 * Adventi naptár — a főoldali kártya tiszta logikája és elhelyezésének forrás-őre
 * (docs/specs/2026-11-18-adventi-naptar.md 14.; A44–A47). A naptároldal logikája: tests/advent-calendar-client.test.ts.
 */
// A forrás-állítások LF-re normalizált szövegen futnak (a munkafa CRLF is lehet).
const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");

function stateOf(phase: AdventState["phase"], openDay: number, states: Partial<Record<number, DoorState>>, daysUntilStart = 0) {
  const doors: AdventDoorView[] = Array.from({ length: 24 }, (_, i) => {
    const day = i + 1;
    const fallback: DoorState = (phase === "open" || phase === "catchup") && day <= openDay ? "open" : "locked";
    return { day, state: states[day] ?? fallback, subject: null, repairsLeft: 0 };
  });
  const records = Object.fromEntries(doors.filter((d) => d.state === "solved" || d.state === "repairable" || d.state === "failed")
    .map((d) => [d.day, { attempts: d.state === "solved" ? [{ questionId: "q", pick: 0, correct: true, at: "" }] : Array.from({ length: d.state === "failed" ? 3 : 1 }, () => ({ questionId: "q", pick: 0, correct: false, at: "" })) }]));
  return { phase, openDay, daysUntilStart, doors, summary: adventSummary(records, 2) };
}
const solved = (days: number[]) => Object.fromEntries(days.map((d) => [d, "solved" as DoorState]));
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

test("a kártya helyfoglalása a böngésző órájából: november 24. – január 6. igen, máskor nem (A44, A46, A47)", () => {
  for (const [iso, want] of [
    ["2026-11-23T12:00:00Z", false], ["2026-11-23T23:00:00Z", true], ["2026-11-30T12:00:00Z", true], ["2026-12-01T00:00:00Z", true],
    ["2026-12-24T20:00:00Z", true], ["2027-01-06T22:59:59Z", true], ["2027-01-06T23:00:00Z", false], ["2026-07-01T10:00:00Z", false],
  ] as const) assert.equal(homeCardReserve(new Date(iso)), want, iso);
});

test("a kártya állapota egy pillantásra (terv 14.3)", () => {
  assert.deepEqual(homeCardStatus(null), { text: "Nyisd ki a mai ablakot!", cta: "Kinyitom" });
  assert.deepEqual(homeCardStatus(stateOf("teaser", 0, {}, 2)), { text: "Hamarosan: december 1. — még 2 nap", cta: null });
  assert.deepEqual(homeCardStatus(stateOf("open", 1, {})), { text: "Ma az 1. ablak nyílik", cta: "Kinyitom" });
  assert.deepEqual(homeCardStatus(stateOf("open", 3, solved([1, 2]))), { text: "Ma a 3. ablak nyílik", cta: "Kinyitom" });
  assert.deepEqual(homeCardStatus(stateOf("open", 5, solved([1, 2]))), { text: "Ma az 5. ablak nyílik — és még 2 vár rád", cta: "Kinyitom" });
  assert.deepEqual(homeCardStatus(stateOf("open", 5, { ...solved([1, 2, 5]), 3: "repairable" })), { text: "2 ablak vár rád", cta: "Kinyitom" });
  assert.deepEqual(homeCardStatus(stateOf("open", 4, solved([1, 2, 3, 4]))), { text: "Mára kész! Holnap nyílik az 5. ablak", cta: "Megnézem" });
  assert.deepEqual(homeCardStatus(stateOf("catchup", 24, solved(range(1, 20)))), { text: "4 ablak vár rád", cta: "Kinyitom" });
  assert.deepEqual(homeCardStatus(stateOf("catchup", 24, { ...solved(range(1, 23)), 24: "failed" })), { text: "Végigértél: 23 / 24 ablak világít", cta: "Megnézem" });
  assert.deepEqual(homeCardStatus(stateOf("open", 24, solved(range(1, 24)))), { text: "Végigértél: 24 / 24 ablak világít", cta: "Megnézem" });
  assert.equal(homeCardStatus(stateOf("closed", 0, {})).cta, null);
});

test("a kártya is 2D és könnyű, és az ajándék-üzenetet nem gépeli újra (A8, A31)", () => {
  const text = read("client/src/components/AdventHomeCard.tsx");
  assert.doesNotMatch(text, /from "three|game-engine\/scenes|@react-three/);
  assert.doesNotMatch(text, /requestAnimationFrame/);
  assert.doesNotMatch(text, /apukádhoz/);
});

test("a naptár NEM kerül a játékok közé: a játéklista és a főoldali játék-rács nem hivatkozik rá (A46)", () => {
  for (const file of ["client/src/pages/Games.tsx", "client/src/components/HomePracticeGames.tsx"]) {
    assert.doesNotMatch(read(file), /advent/i, file);
  }
  const list = read("client/src/components/UserFileList.tsx");
  // A kártya közvetlenül a Hero után, a támogatói sáv és a szűrő előtt áll.
  const hero = list.indexOf("<HeroSection", list.indexOf("{connectionError}"));
  const card = list.indexOf("<AdventHomeCard />", hero);
  assert.ok(hero > 0 && card > hero, "a kártya a Hero után");
  assert.ok(card < list.indexOf("<SponsorBar />", hero), "a kártya a támogatói sáv előtt");
  assert.ok(card < list.indexOf("data-testid=\"button-filter-all\"", hero), "a kártya a szűrő előtt");
});
