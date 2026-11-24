import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { QueryClient } from "@tanstack/react-query";

import * as sync from "../client/src/advent/sync";
import { previewDateFrom } from "../server/advent/preview";
import { buildAdventResultEmail } from "../server/advent/result-email";
import type { AdventRow } from "../server/advent/store";

/**
 * Adventi naptár — az S5 / S6 szelet 1. vak körének (b0bbadf1) feltételei: L2, L4, L6, L7 tiszta logikája és L3 forrás-őre
 * (docs/specs/2026-11-18-adventi-naptar.md 22. 29–36.; végrehajtás: „2026-11-22 — S5/S6 1. vak köre (b0bbadf1)”). A tartós
 * levélkézbesítés (L1), az ablaknyitással mentett végleges átvétel (L5) és a státusz dátuma (L8): tests/advent-routes-db.integration.ts
 * „S5/S6 1. vak”; a böngészős út (L2, L3): tests/advent-calendar.spec.ts „S5/S6 1. vak”.
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");

test("1. vak L2: az állapot gyorsítótár-kulcsa a módot (normál / előnézeti nap) is hordozza; az írás csak a saját módja bejegyzésébe kerül", async () => {
  const g = sync.adventSubjectGeneration();
  const keyOf = sync.adventStateKey as unknown as (generation: number, mode?: string) => readonly unknown[];
  assert.deepEqual(keyOf(g), ["advent-state", g, "normal"], "alapértelmezésben a normál mód");
  assert.notDeepEqual(keyOf(g, "2026-12-10"), keyOf(g, "normal"), "az előnézet külön bejegyzés");
  const qc = new QueryClient();
  qc.setQueryData(keyOf(g, "normal"), { version: 1, openDay: 5 });
  qc.setQueryData(keyOf(g, "2026-12-10"), { version: 1, openDay: 10 });
  const apply = sync.applyAdventWrite as unknown as (q: QueryClient, generation: number, update: (c: unknown) => unknown, mode?: string) => Promise<boolean>;
  assert.equal(await apply(qc, g, () => ({ version: 2, openDay: 10, solved: 1 }), "2026-12-10"), true);
  assert.deepEqual(qc.getQueryData(keyOf(g, "normal")), { version: 1, openDay: 5 }, "az előnézeti írás nem kerül a normál nézetbe");
  // A főoldali kártya és a naptár a módot a címből veszi; a naptár módváltáskor újraépül (nincs régi előnézeti helyi állapot).
  const hook = read("client/src/advent/useAdvent.ts");
  assert.match(hook, /queryKey: adventStateKey\(generation, mode\)/);
  const page = read("client/src/pages/AdventCalendar.tsx");
  assert.match(page, /return <AdventCalendarView key=\{mode\} \/>;/);
  assert.match(page, /refetch, generation, mode \} = useAdventState\(\);/, "az írások a lekérdezés aktuális módjába kerülnek (elutasított előnézet után a normálba)");
});

test("1. vak L4: egyenlő sorverziónál a régebbi szerverpillanat (asOf) is régebbi — a zárás előtti késői válasz nem írja vissza a lezárt nézetet", async () => {
  assert.equal(sync.isOlderAdventState({ version: 2, asOf: 100 }, { version: 2, asOf: 200 }), true);
  assert.equal(sync.isOlderAdventState({ version: 2, asOf: 200 }, { version: 2, asOf: 200 }), false);
  assert.equal(sync.isOlderAdventState({ version: 3, asOf: 100 }, { version: 2, asOf: 200 }), false, "az újabb sorverzió nyer");
  const state = { version: 2, asOf: 200, phase: "closed", doors: [{ day: 1, state: "failed" }], summary: {}, closing: { kind: "closed" } };
  const next = sync.applyAnswerResult(state, { door: { day: 1, state: "repairable" }, summary: {}, closing: { kind: "repair" }, version: 2, asOf: 100 } as never) as { asOf?: number };
  assert.equal(next.asOf, 100, "a válasz a saját pillanatát viszi");
  const qc = new QueryClient();
  const g = sync.adventSubjectGeneration();
  const key = sync.adventStateKey(g);
  qc.setQueryData(key, state);
  assert.equal(await sync.applyAdventWrite(qc, g, () => next), false);
  assert.equal((qc.getQueryData(key) as { closing: { kind: string } }).closing.kind, "closed");
  assert.match(read("server/advent/routes.ts"), /asOf: extra\.asOf \?\? 0,/);
});

test("1. vak L6: az előnézet órája óraátállítás napján is a budapesti 12:00", () => {
  assert.equal(previewDateFrom("2026-03-29")?.toISOString(), "2026-03-29T10:00:00.000Z", "tavaszi átállás: 12:00 CEST");
  assert.equal(previewDateFrom("2026-10-25")?.toISOString(), "2026-10-25T11:00:00.000Z", "őszi átállás: 12:00 CET");
  assert.equal(previewDateFrom("2026-12-10")?.toISOString(), "2026-12-10T11:00:00.000Z");
});

test("1. vak L7: a szülői levél a legjobb kör tantárgyankénti bontását is mutatja, Karácsony sorral", () => {
  const ok = { questionId: "q", pick: 0, correct: true, at: "" };
  const bad = { questionId: "q", pick: 1, correct: false, at: "" };
  const subjects: Record<number, string> = {};
  const doors: Record<number, { attempts: typeof ok[] }> = {};
  for (let day = 1; day <= 24; day++) {
    subjects[day] = day % 3 === 0 ? "christmas" : day % 2 === 0 ? "math" : "hungarian";
    doors[day] = { attempts: day === 2 ? [bad, bad, bad] : [ok] };
  }
  const row: AdventRow = { id: "r", season: 2026, subjectKind: "learner", subjectId: "L", grade: 5, round: 1, plan: { 1: { round: 1, layout: [], doors: {}, subjects } as never }, doors: { 1: doors }, finishedAt: null, passedAt: new Date(), mailedTo: [], createdAt: new Date(0), updatedAt: new Date(0) };
  const { html } = buildAdventResultEmail({ firstName: "Panni", grade: 5, season: 2026, reason: "passed", row });
  assert.match(html, /Karácsony[^<]*<\/td><td[^>]*><strong>8 \/ 8/);
  assert.match(html, /Matematika[^<]*<\/td><td[^>]*><strong>7 \/ 8/);
  assert.match(html, /Magyar nyelv[^<]*<\/td><td[^>]*><strong>8 \/ 8/);
});

test("1. vak L3: az átvétel hibájánál az összesítő modálban is van mentetlen-jelzés és működő „Újra”", () => {
  const page = read("client/src/pages/AdventCalendar.tsx");
  assert.match(page, /data-testid="advent-summary-retry" onClick=\{retryFailed\}/);
  assert.match(page, /data-testid="advent-summary-saving"/);
});
