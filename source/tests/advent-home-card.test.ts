import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ADVENT_ART } from "../shared/advent/art-manifest";
import { ADVENT_ART_SPECS, ADVENT_DOOR_MOTIFS, doorArtId } from "../shared/advent/art";
import type { AdventDoorView, AdventState } from "../shared/advent/contract";
import { articleFor, daySuffix, homeCardReserve, homeCardStatus, nextDoorToOpen } from "../shared/advent/home-card";
import { adventSummary, type DoorState } from "../shared/advent/rules";

/**
 * Adventi naptár — a főoldali kártya, a „következő ablak” és a képhelyek tiszta logikája
 * (docs/specs/2026-11-18-adventi-naptar.md 13.3, 13.7, 14.; A40, A44–A47).
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

test("névelő és dátumrag: az 1., az 5., a 2.; 1-jén, 2-án, 4-én, 13-án, 20-án, 24-én", () => {
  assert.deepEqual([1, 2, 5, 11, 15, 24].map(articleFor), ["az", "a", "az", "a", "a", "a"]);
  const want: Record<number, string> = { 1: "-jén", 2: "-án", 3: "-án", 4: "-én", 5: "-én", 6: "-án", 7: "-én", 8: "-án", 9: "-én", 10: "-én", 11: "-én", 12: "-én", 13: "-án", 14: "-én", 15: "-én", 16: "-án", 17: "-én", 18: "-án", 19: "-én", 20: "-án", 21: "-én", 22: "-én", 23: "-án", 24: "-én" };
  for (let day = 1; day <= 24; day++) assert.equal(daySuffix(day), want[day], `december ${day}`);
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

test("a soron következő ablak: mai → legkorábbi nyitható → első javítható → nincs (terv 14.1, A45)", () => {
  assert.equal(nextDoorToOpen(stateOf("open", 5, solved([1, 2]))), 5, "a mai megválaszolatlan ablak az első");
  assert.equal(nextDoorToOpen(stateOf("open", 5, solved([1, 5]))), 2, "a mai megvan: a legkorábbi pótolható");
  assert.equal(nextDoorToOpen(stateOf("open", 5, { ...solved([1, 2, 4, 5]), 3: "repairable" })), 3, "csak javítható maradt");
  assert.equal(nextDoorToOpen(stateOf("open", 5, { ...solved([1, 2, 4, 5]), 3: "failed" })), null);
  assert.equal(nextDoorToOpen(stateOf("catchup", 24, solved(range(1, 22)))), 23);
  assert.equal(nextDoorToOpen(stateOf("teaser", 0, {})), null);
  assert.equal(nextDoorToOpen(stateOf("closed", 0, { 3: "repairable" })), null);
});

test("képhelyek: mind a 30 tételnek van mérete; a 24 ablak magyar alt szöveget és helyőrző jelet kap; a díszek alt-ja üres (A40)", () => {
  assert.equal(Object.keys(ADVENT_ART_SPECS).length, 30);
  assert.equal(ADVENT_DOOR_MOTIFS.length, 24);
  for (let day = 1; day <= 24; day++) {
    const spec = ADVENT_ART_SPECS[doorArtId(day)];
    assert.ok(spec, doorArtId(day));
    assert.deepEqual([spec.width, spec.height], [256, 256]);
    assert.ok(spec.alt.length > 3 && spec.alt.endsWith("."), `${day}. ablak alt`);
    assert.ok(spec.placeholder.length > 0, `${day}. ablak helyőrző`);
  }
  for (const id of ["advent-bg-portrait", "advent-bg-landscape", "advent-home-banner", "advent-garland", "advent-frame"]) assert.equal(ADVENT_ART_SPECS[id]!.alt, "", id);
  assert.deepEqual([ADVENT_ART_SPECS["advent-home-banner"]!.width, ADVENT_ART_SPECS["advent-home-banner"]!.height], [1600, 400]);
  for (const [id, spec] of Object.entries(ADVENT_ART_SPECS)) assert.ok(spec.width > 0 && spec.height > 0, id);
  // A készlet-leíró (képgyártó) azonosítói és a képhelyek azonosítói ugyanazok.
  const manifest = JSON.parse(read("design-assets/advent/prompts.json")) as { items: Array<{ id: string }> };
  assert.deepEqual(manifest.items.map((i) => i.id).sort(), Object.keys(ADVENT_ART_SPECS).sort());
  // A kész képek jegyzékében csak ismert azonosító lehet.
  for (const id of Object.keys(ADVENT_ART)) assert.ok(ADVENT_ART_SPECS[id], `ismeretlen kép a jegyzékben: ${id}`);
});

test("a naptár 2D és könnyű: nincs three.js, jelenet-import és képkocka-hurok a naptár kliensfájljaiban (A31)", () => {
  const files = ["client/src/pages/AdventCalendar.tsx", "client/src/advent/AdventArt.tsx", "client/src/advent/Snowfall.tsx", "client/src/advent/useAdvent.ts", "client/src/components/AdventHomeCard.tsx"];
  for (const file of files) {
    const text = read(file);
    assert.doesNotMatch(text, /from "three|game-engine\/scenes|@react-three/, `${file}: 3D-import`);
    assert.doesNotMatch(text, /requestAnimationFrame/, `${file}: képkocka-hurok`);
  }
  const css = read("client/src/advent/advent.css");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /font-size:\s*(?:[0-9]|1[01])px/, "12 képpontnál kisebb betű");
});

test("a szó szerinti üzenet a kliensben csak a szerver állapotából jelenik meg — nincs újragépelve (A8)", () => {
  for (const file of ["client/src/pages/AdventCalendar.tsx", "client/src/components/AdventHomeCard.tsx"]) {
    assert.doesNotMatch(read(file), /apukádhoz/, file);
  }
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
