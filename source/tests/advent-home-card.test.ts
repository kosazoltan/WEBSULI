import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { AdventDoorView, AdventState } from "../shared/advent/contract";
import { homeCardClock, homeCardReserve, homeCardStatus } from "../shared/advent/home-card";
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
  // A kártya a lusta foglalatán át kerül a lapra (vak ellenőr K1: külön darab) — a helye ugyanaz.
  const card = list.indexOf("<AdventHomeSlot />", hero);
  assert.ok(hero > 0 && card > hero, "a kártya a Hero után");
  // SPEC-VÁLTOZÁS 2026-11-24 (tulajdonosi kérés, #1984; docs/specs/2026-11-24-fooldal-felso-regio.md): a támogatói csempe a Hero
  // MELLÉ került (azonos sorban), ezért a kártya a csempe UTÁN, a „Szia” kártya és a szűrő előtt áll.
  assert.ok(card > list.indexOf("<SponsorBar variant=\"tile\" />", hero), "a kártya a Hero melletti támogatói csempe után");
  assert.ok(card < list.indexOf("<WelcomeCard", hero), "a kártya a Szia-kártya előtt");
  assert.ok(card < list.indexOf("data-testid=\"button-filter-all\"", hero), "a kártya a szűrő előtt");
});

test("a kártya „mostja”: kikapcsolt kapcsolónál nincs; teszt-buildben csak beadott, érvényes tesztidővel; éles buildben a valódi idő (terv 20.)", () => {
  const realNow = new Date("2026-12-03T10:00:00Z");
  // Kikapcsolt kapcsoló: soha.
  assert.equal(homeCardClock({ flag: false, testHooks: false, hookValue: undefined, realNow }), null);
  assert.equal(homeCardClock({ flag: false, testHooks: true, hookValue: "2026-12-03T10:00:00Z", realNow }), null);
  // Éles build: a valódi idő — a kampó értéke ott SEMMIT nem számít (mutációs ellenpróba a „tesztidő élesben” ellen).
  assert.equal(homeCardClock({ flag: true, testHooks: false, hookValue: undefined, realNow }), realNow);
  assert.equal(homeCardClock({ flag: true, testHooks: false, hookValue: "2030-01-01T00:00:00Z", realNow }), realNow);
  // Teszt-build: csak érvényes, beadott idővel; nélküle a kártya „kikapcsolt” (a többi főoldali teszt helyzete a szezonban is).
  assert.equal(homeCardClock({ flag: true, testHooks: true, hookValue: undefined, realNow }), null);
  assert.equal(homeCardClock({ flag: true, testHooks: true, hookValue: "2026-12-05T10:00:00Z", realNow })?.toISOString(), "2026-12-05T10:00:00.000Z");
  for (const bad of ["", "holnap", "2026-12-05", "2026-13-45T10:00:00Z", 1764928800000, null, {}]) assert.equal(homeCardClock({ flag: true, testHooks: true, hookValue: bad, realNow }), null, String(bad));
});

test("a tesztidő-kampót CSAK a teszt-kampós ág olvassa; a kártya a kapcsolóból és az órából dönt, helyi „már láttam” jelző nélkül (terv 20., őr)", () => {
  const flag = read("client/src/advent/season-flag.ts");
  assert.match(flag, /import\.meta\.env\.VITE_ADVENT_CALENDAR === "on"/);
  assert.match(flag, /const TEST_HOOKS = import\.meta\.env\.VITE_ENABLE_GAME_TEST_HOOKS === "1";/);
  // A kampó neve a kódban egyetlen helyen fordul elő, és az a sor a TEST_HOOKS feltétel mögött áll.
  const uses = flag.split("\n").filter((line) => line.includes("__websuliAdventTestNow") && !line.trim().startsWith("*"));
  assert.equal(uses.length, 1);
  assert.match(uses[0]!, /^\s*if \(TEST_HOOKS\) hookValue = /);
  const card = read("client/src/components/AdventHomeCard.tsx");
  assert.match(card, /adventCardNow\(\)/);
  assert.doesNotMatch(card, /new Date\(\)/, "a kártya nem olvas közvetlenül órát");
  assert.doesNotMatch(card, /localStorage|cardSeen/, "nincs helyi „már láttam” jelző");
  for (const file of ["client/src/pages/AdventCalendar.tsx", "client/src/advent/useAdvent.ts", "client/src/components/AdventHomeCard.tsx"]) {
    assert.doesNotMatch(read(file), /__websuliAdventTestNow/, file);
  }
  assert.match(read("package.json"), /"build:e2e": "[^"]*VITE_ADVENT_CALENDAR=on[^"]*vite build/);
  assert.doesNotMatch(read("package.json"), /"build(:client)?": "[^"]*VITE_ADVENT_CALENDAR/, "az éles build parancsa nem égeti be a kapcsolót — azt a Vercel környezete adja");
});
