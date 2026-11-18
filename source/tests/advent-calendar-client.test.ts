import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { ADVENT_BUSY_FAILED_TEXT, ADVENT_BUSY_WAIT_MS, adventErrorText, isAdventBusy, retryWhenBusy } from "../client/src/advent/busy";
import { ADVENT_ART } from "../shared/advent/art-manifest";
import { ADVENT_ART_SPECS, ADVENT_DOOR_MOTIFS, doorArtId } from "../shared/advent/art";
import type { AdventDoorView, AdventState } from "../shared/advent/contract";
import { articleFor, daySuffix, nextDoorToOpen } from "../shared/advent/home-card";
import { adventSummary, type DoorState } from "../shared/advent/rules";

/**
 * Adventi naptár — a naptároldal tiszta logikája és forrás-őrei: névelő / dátumrag, a soron következő ablak, képhelyek,
 * 2D-s könnyű kliens, az üzenet nincs újragépelve (docs/specs/2026-11-18-adventi-naptar.md 13.3, 13.7, 14.1; A8, A31, A40, A45).
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

test("névelő és dátumrag: az 1., az 5., a 2.; 1-jén, 2-án, 4-én, 13-án, 20-án, 24-én", () => {
  assert.deepEqual([1, 2, 5, 11, 15, 24].map(articleFor), ["az", "a", "az", "a", "a", "a"]);
  const want: Record<number, string> = { 1: "-jén", 2: "-án", 3: "-án", 4: "-én", 5: "-én", 6: "-án", 7: "-én", 8: "-án", 9: "-én", 10: "-én", 11: "-én", 12: "-én", 13: "-án", 14: "-én", 15: "-én", 16: "-án", 17: "-én", 18: "-án", 19: "-én", 20: "-án", 21: "-én", 22: "-én", 23: "-án", 24: "-én" };
  for (let day = 1; day <= 24; day++) assert.equal(daySuffix(day), want[day], `december ${day}`);
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
  // (A képgyártó készlet-leírójával — `design-assets/advent/prompts.json`, S3c-0 ág — való azonosító-egyezést az S3c teszteli,
  // ahol a két fájl már együtt van; ez a szelet a képgyártó ágtól függetlenül épül.)
  // A kész képek jegyzékében csak ismert azonosító lehet.
  for (const id of Object.keys(ADVENT_ART)) assert.ok(ADVENT_ART_SPECS[id], `ismeretlen kép a jegyzékben: ${id}`);
});

test("a naptár 2D és könnyű: nincs three.js, jelenet-import és képkocka-hurok a naptár kliensfájljaiban (A31)", () => {
  const files = ["client/src/pages/AdventCalendar.tsx", "client/src/advent/AdventArt.tsx", "client/src/advent/Snowfall.tsx", "client/src/advent/useAdvent.ts"];
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
  assert.doesNotMatch(read("client/src/pages/AdventCalendar.tsx"), /apukádhoz/);
});

test("429 („most sokan vagyunk”, pl. limit: new-row): egy újrapróba rövid várakozás után; más hiba azonnal megy tovább (S2b M1)", async () => {
  const busy = Object.assign(new Error("Túl sok új naptár erről a hálózatról — próbáld újra később."), { status: 429 });
  const other = Object.assign(new Error("Az évfolyam az első válasz után már nem módosítható."), { status: 409 });
  assert.equal(isAdventBusy(busy), true);
  assert.equal(isAdventBusy(other), false);
  assert.equal(isAdventBusy(new Error("hálózat")), false);
  assert.ok(ADVENT_BUSY_WAIT_MS >= 2000 && ADVENT_BUSY_WAIT_MS <= 8000, "rövid, de nem azonnali várakozás");

  // 1) Első hívás 429, a második sikerül: pontosan egy várakozás, a jelzés be-, majd kikapcsol.
  const log: string[] = [];
  let calls = 0;
  const ok = await retryWhenBusy(async () => { calls++; if (calls === 1) throw busy; return "kész"; },
    { onWait: (w) => log.push(w ? "vár" : "vége"), sleep: async (ms) => { log.push(`alszik ${ms}`); } });
  assert.equal(ok, "kész");
  assert.equal(calls, 2);
  assert.deepEqual(log, ["vár", `alszik ${ADVENT_BUSY_WAIT_MS}`, "vége"]);

  // 2) Kétszer 429: nincs harmadik próba, a hiba kimegy, a jelzés kikapcsol; a gyerek barátságos szöveget kap, nem a nyers üzenetet.
  calls = 0; log.length = 0;
  await assert.rejects(retryWhenBusy(async () => { calls++; throw busy; }, { onWait: (w) => log.push(w ? "vár" : "vége"), sleep: async () => {} }), (e) => e === busy);
  assert.equal(calls, 2);
  assert.deepEqual(log, ["vár", "vége"]);
  assert.equal(adventErrorText(busy, "alap"), ADVENT_BUSY_FAILED_TEXT);
  assert.doesNotMatch(ADVENT_BUSY_FAILED_TEXT, /hálózat|429|hiba/i);

  // 3) Más hiba: nincs várakozás, nincs újrapróba; a szerver üzenete marad.
  calls = 0; log.length = 0;
  await assert.rejects(retryWhenBusy(async () => { calls++; throw other; }, { onWait: (w) => log.push(w ? "vár" : "vége"), sleep: async () => { log.push("alszik"); } }), (e) => e === other);
  assert.equal(calls, 1);
  assert.deepEqual(log, []);
  assert.equal(adventErrorText(other, "alap"), other.message);
  assert.equal(adventErrorText("valami", "alap"), "alap");
});
