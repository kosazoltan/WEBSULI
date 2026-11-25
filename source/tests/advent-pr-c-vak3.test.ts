import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { QueryClient } from "@tanstack/react-query";

import * as sync from "../client/src/advent/sync";
import { adventRowIsSound } from "../server/advent/routes";
import type { AdventRow } from "../server/advent/store";

/**
 * Adventi naptár — a PR-C 3. vak körének (d53178ef) feltételei: L1–L4 tiszta logikája és forrás-őrei
 * (docs/specs/2026-11-18-adventi-naptar.md 22. 24–27.; végrehajtás: „2026-11-21 — S5 / S6 és a PR-C 3. vak körének feltételei”).
 * A böngészős út (késleltetett /adopt, 503 utáni „Újra”): tests/advent-calendar.spec.ts „PR-C 3. vak”; a sorőr HTTP-útja:
 * tests/advent-routes-db.integration.ts „PR-C 3. vak L4”.
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");

test("3. kör L1: a régebbi szerververziójú állás (késve érkező átvételi válasz) nem írja felül a már alkalmazott újabbat", async () => {
  const qc = new QueryClient();
  const g = sync.adventSubjectGeneration();
  const key = sync.adventStateKey(g);
  // A sikeres válasz utáni állás (újabb szerververzió).
  qc.setQueryData(key, { version: 2000, summary: { solved: 2 } });
  // A korábban feldolgozott, de később megérkező átvétel válasza (régebbi verzió): eldobjuk.
  assert.equal(await sync.applyAdventWrite(qc, g, () => ({ version: 1000, summary: { solved: 1 } })), false);
  assert.deepEqual(qc.getQueryData(key), { version: 2000, summary: { solved: 2 } }, "a megoldott ablak nem festődik vissza");
  // Az újabb (vagy azonos) verzió alkalmazódik — ha az átvételt a szerver a válasz UTÁN dolgozta fel, az a frissebb.
  assert.equal(await sync.applyAdventWrite(qc, g, () => ({ version: 3000, summary: { solved: 2 } })), true);
  assert.deepEqual(qc.getQueryData(key), { version: 3000, summary: { solved: 2 } });
  // A válasz eredménye a saját verzióját viszi az állapotba (a régi válasz így az újabb átvétel után sem írhat).
  const state = { version: 3000, doors: [{ day: 1, state: "open" }], summary: { solved: 2 }, closing: { kind: "keep" } };
  const next = sync.applyAnswerResult(state, { door: { day: 1, state: "solved" }, summary: { solved: 3 }, closing: { kind: "keep" }, version: 2500 } as never) as { version?: number };
  assert.equal(next.version, 2500);
  assert.equal(await sync.applyAdventWrite(qc, g, () => next), false, "a régebbi válasz-eredmény sem írja felül az újabb átvételt");
  // A szerver minden állapotban és válaszban adja a verziót (a sor utolsó módosításának ideje, írás-sorrendben növekvő óra).
  const routes = read("server/advent/routes.ts");
  assert.match(routes, /version: extra\.version \?\? \(row \? row\.updatedAt\.getTime\(\) : 0\)/);
  // S5/S6 1. vak L4 (dokumentált): a válasz a verzió mellett a szerverpillanatot (asOf) is viszi.
  assert.match(routes, /res\.json\(\{ \.\.\.result\.answer, version: row\.updatedAt\.getTime\(\), asOf: locals\.now\.getTime\(\) \}/);
  assert.match(read("server/advent/store.ts"), /updated_at = clock_timestamp\(\)/);
});

test("3. kör L2–L3: az „Újra” az eredeti, meghiúsult műveletet indítja újra — az átvételt (POST /adopt), illetve a főoldalról indított nyitást friss állapotból", () => {
  const page = read("client/src/pages/AdventCalendar.tsx");
  // A meghiúsult írás fajtája megmarad; az „Újra” ennek megfelelően dönt (nem csak állapotot olvas).
  assert.match(page, /const \[failedWrite, setFailedWrite\] = useState<"adopt" \| "auto-open" \| null>\(null\);/);
  assert.match(page, /if \(failed === "adopt"\) \{ void runAdopt\(\); return; \}/);
  assert.match(page, /if \(failed === "auto-open"\) \{ void retryAutoOpen\(\); return; \}/);
  // Az átvétel igazolt mentéséig látható a függő állapot.
  assert.match(page, /data-testid="advent-saving"/);
  // A nyitási szándék csak sikerrel (vagy szándékos megszakítással) fogy el: hibánál „auto-open” jelölés.
  assert.match(page, /if \(ok === false && isCurrent\(started\)\) setFailedWrite\("auto-open"\);/);
});

test("3. kör L4: a sorőr csak az 1…24 permutációját fogadja el ablakrácsként — tartományon kívüli, ismétlődő, hiányzó elem és üres tömb sérült", () => {
  const base = { id: "x", season: 2026, subjectKind: "device" as const, subjectId: "d", grade: 5, round: 1, finishedAt: null, passedAt: null, mailedTo: [], createdAt: new Date(0), updatedAt: new Date(0) };
  const days = Array.from({ length: 24 }, (_, i) => i + 1);
  const fullDoors = Object.fromEntries(days.map((d) => [d, ["q" + d]]));
  const withLayout = (layout: unknown) => adventRowIsSound({ ...base, plan: { 1: { round: 1, layout, doors: fullDoors, subjects: {} } }, doors: {} } as unknown as AdventRow);
  assert.equal(withLayout([...days].reverse()), true, "kevert, teljes rács");
  assert.equal(withLayout([...days.slice(0, 23), 25]), false, "tartományon kívüli elem (25)");
  assert.equal(withLayout([...days.slice(0, 23), 23]), false, "ismétlődő elem");
  assert.equal(withLayout(days.slice(0, 23)), false, "hiányzó elem (23 hosszú)");
  assert.equal(withLayout([]), false, "üres tömb");
  assert.equal(withLayout([...days.slice(0, 23), "24"]), false, "szöveg szám helyett");
  assert.equal(withLayout([...days.slice(0, 23), 0]), false, "nulla");
  assert.equal(withLayout([...days.slice(0, 23), 23.5]), false, "nem egész");
});
