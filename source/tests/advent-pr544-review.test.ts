import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import express from "express";

import { homeCardBoundary, homeCardBoundaryCrossed, homeCardTickDelay, homeCardWantsPersonal, HOME_CARD_TICK_MS } from "../shared/advent/home-card";
import { watchAdventClock } from "../client/src/advent/clock-tick";
import { usedForRepair } from "../server/advent/adoption";
import { createAdventRouter } from "../server/advent/routes";
import type { AdventBankItem } from "../shared/advent/assignment";
import type { AdventRow, AdventStore } from "../server/advent/store";

/**
 * PR #544 review-szálai (adventi naptár, főoldali kártya és átvétel utáni pótlás):
 * - a főoldali kártya és foglalata nem ragad be a fázishatáron (november 24., december 1., január 7.), ha a lap nyitva marad;
 * - a bejelentkezett játékos új böngészőben is személyes állapotot kap (eszközazonosító létrehozása nélkül);
 * - átvétel után a bankból eltűnt kérdés pótlása nem adhatja vissza az aktuális kör lecserélt (`retired`) kérdését.
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");

test("a kártya órája a fázishatárnál újra ránéz: a következő váltásig (legfeljebb percenként), és a határ átlépése észlelhető", () => {
  // November 30., 23:59:30 Budapest (UTC+1) → 30 mp múlva december 1.: a következő ránézés a határ után, de egy percen belül.
  const beforeDec1 = new Date("2026-11-30T22:59:30Z");
  const delay = homeCardTickDelay(beforeDec1);
  assert.ok(delay > 30_000 && delay <= 31_000, `a határ után közvetlenül: ${delay}`);
  assert.equal(homeCardTickDelay(new Date("2026-12-03T10:00:00Z")), HOME_CARD_TICK_MS, "napközben percenként");
  assert.equal(homeCardTickDelay(null), HOME_CARD_TICK_MS, "kártya nélkül is percenként (pl. november 23. → 24.)");
  assert.equal(HOME_CARD_TICK_MS, 60_000);

  // A határ kulcsa: fázis + budapesti nap. A „Hamarosan” → nyitás, a napváltás és a január 7-i zárás is váltás.
  const teaser = homeCardBoundary(beforeDec1);
  const open = homeCardBoundary(new Date("2026-11-30T23:00:00Z"));
  assert.equal(teaser, "teaser/2026-11-30");
  assert.equal(open, "open/2026-12-01");
  assert.equal(homeCardBoundary(new Date("2027-01-06T23:00:00Z")), null, "január 7-től nincs kártya");
  assert.equal(homeCardBoundary(new Date("2026-11-23T12:00:00Z")), null, "november 24. előtt nincs kártya");
  assert.equal(homeCardBoundary(null), null);
  assert.equal(homeCardBoundaryCrossed(teaser, open), true);
  assert.equal(homeCardBoundaryCrossed(open, open), false);
  assert.equal(homeCardBoundaryCrossed(null, open), false, "az első kiértékelés nem váltás (a lekérdezés amúgy is indul)");
  assert.equal(homeCardBoundaryCrossed(open, null), false, "a kártya eltűnik — nincs mit újrakérni");
});

test("az óra-figyelő: időzítő a következő ránézésig, újraütemezés, láthatóvá váló lap és fókusz is jelez; leiratkozás után csend", () => {
  const timers = new Map<number, { fn: () => void; ms: number }>();
  let nextId = 1;
  const listeners = { win: new Map<string, () => void>(), doc: new Map<string, () => void>() };
  const doc = {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: (name: string, fn: () => void) => { listeners.doc.set(name, fn); },
    removeEventListener: (name: string) => { listeners.doc.delete(name); },
  };
  const win = {
    setTimeout: (fn: () => void, ms: number) => { const id = nextId++; timers.set(id, { fn, ms }); return id; },
    clearTimeout: (id: number) => { timers.delete(id); },
    addEventListener: (name: string, fn: () => void) => { listeners.win.set(name, fn); },
    removeEventListener: (name: string) => { listeners.win.delete(name); },
  };
  let ticks = 0;
  const stop = watchAdventClock({ win, doc }, () => new Date("2026-11-30T22:59:30Z"), () => { ticks++; });
  assert.equal(timers.size, 1);
  const [first] = [...timers.entries()][0]!;
  assert.ok(timers.get(first)!.ms > 30_000 && timers.get(first)!.ms <= 31_000);
  timers.get(first)!.fn();
  timers.delete(first);
  assert.equal(ticks, 1, "az időzítő jelez");
  assert.equal(timers.size, 1, "és újraütemez");
  doc.visibilityState = "hidden";
  listeners.doc.get("visibilitychange")!();
  assert.equal(ticks, 1, "rejtett lapon nem jelez");
  doc.visibilityState = "visible";
  listeners.doc.get("visibilitychange")!();
  assert.equal(ticks, 2, "a láthatóvá váló lap jelez (pl. altatott gép ébredése)");
  listeners.win.get("focus")!();
  assert.equal(ticks, 3, "a fókusz jelez");
  stop();
  assert.equal(timers.size, 0, "leiratkozás: nincs függő időzítő");
  assert.equal(listeners.doc.size + listeners.win.size, 0, "leiratkozás: nincs figyelő");
});

test("személyes állapot: meglévő azonosító VAGY bejelentkezett, nem tiltott játékos (új böngészőben is) — azonosító létrehozása nélkül", () => {
  assert.equal(homeCardWantsPersonal({ identity: true, player: null, banned: false }), true);
  assert.equal(homeCardWantsPersonal({ identity: false, player: { id: "p" }, banned: false }), true, "bejelentkezett játékos új böngészőben");
  assert.equal(homeCardWantsPersonal({ identity: false, player: null, banned: false }), false, "névtelen látogató: nincs lekérés");
  assert.equal(homeCardWantsPersonal({ identity: false, player: null, banned: true }), false, "tiltott fiók nem játékos");
  assert.equal(homeCardWantsPersonal({ identity: false, player: { id: "p" }, banned: true }), false);
});

test("a főoldali kártya és foglalata az órát újraértékeli; a státusz fókuszra és fázishatáron frissül; a játékos is személyes állapotot kap (őr)", () => {
  const card = read("client/src/components/AdventHomeCard.tsx");
  assert.match(card, /useAdventClockTick\(adventCardNow\)/);
  assert.doesNotMatch(card, /\}, \[\]\);/, "nincs egyszer kiszámolt (üres függőségű) óra vagy azonosító");
  assert.match(card, /queryKey: ADVENT_STATUS_KEY[^\n]*refetchOnWindowFocus: true/);
  assert.match(card, /homeCardBoundaryCrossed\(/);
  assert.match(card, /invalidateQueries\(\{ queryKey: ADVENT_STATUS_KEY \}\)/);
  assert.match(card, /usePlayer\(\)/);
  assert.match(card, /homeCardWantsPersonal\(/);
  // Az azonosítót csak kikukucskáljuk: a főoldal nem hoz létre eszközazonosítót.
  assert.match(card, /useAdventState\([^)]*, false\)/);
  const slot = read("client/src/components/AdventHomeSlot.tsx");
  assert.match(slot, /useAdventClockTick\(adventCardNow\)/);
  assert.doesNotMatch(slot, /\}, \[\]\);/);
});

// --- Átvétel utáni pótlás (E14) -------------------------------------------------------------------------------------------------

const item = (id: string, prompt: string): AdventBankItem => ({ id, grade: 5, subject: "matek", tier: 1, prompt, options: ["a", "b", "c", "d"], correctIndex: 0 });
const DEVICE = "11111111-1111-4111-8111-111111111111";

function rowWithRetired(): AdventRow {
  // Az 1. ablak még meg nem válaszolt kérdése („gone”) közben eltűnt a bankból; ugyanebben a körben az átvétel a tanuló „a-retired”
  // próbáját lecserélte (a vendég jobb eredményére) — az a kérdés a bankban van, és azonosító szerint ELSŐ pótlási jelölt lenne.
  const doors = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 1, [`other-${i + 1}`]]));
  doors[1] = ["gone"];
  // Ép ablakrács (1…24 permutáció): a PR-C 3. vak L4 sorőre a csonka `layout`-ot sérültnek (409) veszi.
  const plan = { round: 1, layout: Array.from({ length: 24 }, (_, i) => i + 1), doors, subjects: { 1: "matek" }, grade: 5, seedKey: `device:${DEVICE}`, retired: ["a-retired"] };
  return {
    id: "r", season: 2026, subjectKind: "device", subjectId: DEVICE, grade: 5, round: 1, plan: { 1: plan }, doors: { 1: {} },
    finishedAt: null, passedAt: null, mailedTo: [], createdAt: new Date(0), updatedAt: new Date(0),
  };
}

test("usedForRepair: az aktuális kör lecserélt kérdései (azonosító és szöveg) kizártak, de az ismétlési sorrendbe nem kerülnek", () => {
  const bank = [item("a-retired", "Mennyi 2+2?"), item("b-fresh", "Mennyi 3+3?")];
  const row = rowWithRetired();
  const used = usedForRepair(row, 1, row.plan[1], bank, []);
  assert.ok(used.usedIds.has("a-retired"));
  assert.ok(used.usedPrompts.has("mennyi 2+2?") || [...used.usedPrompts].some((p) => p.includes("2+2")), "a szövege is kizárt");
  assert.deepEqual(used.repeatable, [], "az ismétlési sorrend csak a korábbi körökből jön");
});

test("átvétel után a bankból eltűnt kérdés pótlása NEM adja vissza az aktuális kör lecserélt (retired) kérdését (HTTP, /doors/1/open)", async () => {
  const bank = [item("a-retired", "Mennyi 2+2?"), item("b-fresh", "Mennyi 3+3?")];
  const rows = new Map<string, AdventRow>([[DEVICE, rowWithRetired()]]);
  const store = {
    read: async (_season: number, subject: { id: string }) => rows.get(subject.id) ?? null,
    mutate: async (_season: number, subject: { id: string }, fn: (row: AdventRow, created: boolean) => { patch: Partial<AdventRow> | null; result: unknown }) => {
      const existing = rows.get(subject.id)!;
      const { patch, result } = fn(existing, false);
      const row = { ...existing, ...(patch ?? {}) };
      rows.set(subject.id, row);
      return { row, created: false, result };
    },
  } as unknown as AdventStore;
  const app = express();
  app.use(express.json());
  app.use("/api/advent", createAdventRouter({
    store, bank, christmas: [], enabled: () => true, clock: () => new Date("2026-12-05T10:00:00Z"),
    resolve: async (_req, input) => ({ subject: typeof input.device === "string" ? { kind: "device", id: input.device, grade: null, firstName: null } : null, pairing: "none" }),
  }));
  const server = await new Promise<import("node:http").Server>((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const res = await fetch(`${base}/api/advent/doors/1/open`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ device: DEVICE }) });
    const body = (await res.json()) as { question?: { id: string } | null };
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.question?.id, "b-fresh", "a lecserélt kérdés nem jöhet vissza");
    assert.deepEqual(rows.get(DEVICE)!.plan[1]!.doors[1], ["b-fresh"]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
