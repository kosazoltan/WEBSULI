import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { QueryClient } from "@tanstack/react-query";

import { createAdoptionContext, mergeAdoption, usedInEarlierRounds, withPlanMeta } from "../server/advent/adoption";
import type { AdventRow } from "../server/advent/store";
import { buildAdventPlan, findAdventItem } from "../shared/advent/assignment";
import { CHRISTMAS_ITEMS } from "../shared/advent/christmasBank/index";
import { GRADE_QUIZ_ITEMS } from "../client/src/data/gradeQuizBank/index";
import { applyAnswerResult } from "../client/src/advent/sync";
import * as sync from "../client/src/advent/sync";

/**
 * Adventi naptár — a PR-C vak körének (efa4c580) leletei: L1, L3–L8 tiszta logikája és forrás-őrei
 * (docs/specs/2026-11-18-adventi-naptar.md 21., 22., 13.7; végrehajtás: „2026-11-21 — a PR-C vak köre”).
 * Az L1 és L2 teljes HTTP-útja: tests/advent-routes-db.integration.ts; az L4, L7, L8 böngészős útja: tests/advent-calendar.spec.ts.
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
type Fn = (...args: never[]) => unknown;
const api = sync as unknown as Record<string, Fn | undefined>;
const need = <T extends Fn>(name: string): T => {
  const f = api[name];
  assert.equal(typeof f, "function", `${name} hiányzik a client/src/advent/sync.ts-ből`);
  return f as T;
};

const season = 2026;
const NOW = new Date("2026-12-24T10:00:00Z");
const emptyRow = (over: Partial<AdventRow>): AdventRow => ({
  id: "x", season, subjectKind: "learner", subjectId: "L", grade: null, round: 1, plan: {}, doors: {}, finishedAt: null, passedAt: null,
  mailedTo: [], createdAt: new Date(0), updatedAt: new Date(0), ...over,
});

/** Az L1 forgatókönyve: elsős, a tableten mind a 24 ablak végleg elbukva; a telefonon vendégként `deviceDays` ablak megoldva `tries` próbával. */
function l1Scenario(tries: 1 | 3, deviceDays: number[]) {
  const grade = 1;
  const learnerPlan = withPlanMeta(buildAdventPlan({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, grade, season, round: 1, subjectKey: "learner:L" }), grade, "learner:L");
  const devicePlan = withPlanMeta(buildAdventPlan({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, grade, season, round: 1, subjectKey: "device:D" }), grade, "device:D");
  const failed = (ids: string[]) => ({ attempts: ids.map((questionId) => ({ questionId, pick: 0, correct: false, at: "" })) });
  const learner = emptyRow({ grade, plan: { 1: learnerPlan }, doors: { 1: Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 1, failed(learnerPlan.doors[i + 1]!)])) } });
  const solvedOn = (ids: string[]) => ({ attempts: ids.slice(0, tries).map((questionId, i) => ({ questionId, pick: 0, correct: i === tries - 1, at: "" })) });
  const device = emptyRow({ id: "d", subjectKind: "device", subjectId: "D", grade, plan: { 1: devicePlan }, doors: { 1: Object.fromEntries(deviceDays.map((d) => [d, solvedOn(devicePlan.doors[d]!)])) } });
  const ctx = createAdoptionContext({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, season, learnerId: "L", learnerGrade: grade, deviceId: "D", now: NOW });
  return { merged: mergeAdoption(learner, device, ctx)!, grade };
}

test("L1: a korábbi kör kizárólistája a MEGMUTATOTT kérdésekből áll (próbák + lecserélt próbák), nem a fel nem használt foglalásokból — az átvétel utáni 2. kör felépíthető", () => {
  const { merged, grade } = l1Scenario(1, [1, 2, 3, 4]);
  const shown = new Set<string>();
  for (const round of Object.values(merged.doors)) for (const door of Object.values(round)) for (const a of door.attempts) shown.add(a.questionId);
  for (const id of (merged.plan[1] as { retired?: string[] }).retired ?? []) shown.add(id);
  const used = usedInEarlierRounds({ ...merged, round: 2 }, 2, GRADE_QUIZ_ITEMS, CHRISTMAS_ITEMS);
  assert.deepEqual([...used.usedIds].sort(), [...shown].sort(), "a kizárólista pontosan a megmutatott kérdések");
  const next = buildAdventPlan({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, grade, season, round: 2, subjectKey: "learner:L", ...used });
  const ids = Object.values(next.doors).flat();
  assert.equal(ids.length, 72);
  assert.ok(ids.every((id) => !shown.has(id)), "a 2. körben nincs már látott kérdés");
});

test("L1 (tulajdonosi döntés 2026-11-21: „Ismétlés a legrégebbiekből”): a kapacitáson túli 2. kör is felépül — a hiányzó helyeken a legrégebben megmutatott kérdések ismétlődnek (legrégebbi elöl, determinisztikusan), a többi hely új", () => {
  const grade = 1;
  const learnerPlan = withPlanMeta(buildAdventPlan({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, grade, season, round: 1, subjectKey: "learner:L" }), grade, "learner:L");
  const devicePlan = withPlanMeta(buildAdventPlan({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, grade, season, round: 1, subjectKey: "device:D" }), grade, "device:D");
  const days = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
  // A tablet (tanuló) minden ablakot végleg elbuk; a 23–24. ablak próbái a LEGKÉSŐBBIEK (december 20.), hogy az időrend ne a napok
  // sorrendje legyen. A telefon (vendég) a 1–22. ablakot a 3. próbára oldja meg, december 10-én (napról napra későbbi percben).
  const learnerAt = (day: number) => (day >= 23 ? `2026-12-20T10:${String(day).padStart(2, "0")}:00.000Z` : "2026-12-01T10:00:00.000Z");
  const failed = (day: number) => ({ attempts: learnerPlan.doors[day]!.map((questionId) => ({ questionId, pick: 0, correct: false, at: learnerAt(day) })) });
  const learner = emptyRow({ grade, plan: { 1: learnerPlan }, doors: { 1: Object.fromEntries(days(1, 24).map((d) => [d, failed(d)])) } });
  const deviceAt = (day: number, i: number) => `2026-12-10T${String(10 + Math.floor(day / 10)).padStart(2, "0")}:${String((day % 10) * 5 + i).padStart(2, "0")}:00.000Z`;
  const solvedOn3 = (day: number) => ({ attempts: devicePlan.doors[day]!.slice(0, 3).map((questionId, i) => ({ questionId, pick: 0, correct: i === 2, at: deviceAt(day, i) })) });
  const device = emptyRow({ id: "d", subjectKind: "device", subjectId: "D", grade, plan: { 1: devicePlan }, doors: { 1: Object.fromEntries(days(1, 22).map((d) => [d, solvedOn3(d)])) } });
  const ctx = createAdoptionContext({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, season, learnerId: "L", learnerGrade: grade, deviceId: "D", now: NOW });
  const merged = mergeAdoption(learner, device, ctx)!;
  // A várt időrend a tesztben, a megvalósítástól függetlenül: a lecserélt próbák (időpontjuk nincs tárolva → a legrégebbiek), majd a
  // tárolt próbák időrendben (egyenlő időnél a kör, a nap és a próba sorrendje); egy kérdés az első előfordulásánál számít.
  const retired = (merged.plan[1] as { retired?: string[] }).retired ?? [];
  const timed: { id: string; at: string; day: number; i: number }[] = [];
  for (const [day, door] of Object.entries(merged.doors[1]!)) door.attempts.forEach((a, i) => timed.push({ id: a.questionId, at: a.at, day: Number(day), i }));
  timed.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.day - b.day || a.i - b.i));
  const expectedOrder = [...new Set([...retired, ...timed.map((t) => t.id)])];
  const shown = new Set(expectedOrder);
  const unseen = CHRISTMAS_ITEMS.filter((c) => c.minGrade <= grade && grade <= c.maxGrade && !shown.has(c.id)).length;
  assert.ok(unseen < 72, `szélső eset: ${unseen} új kérdés marad 72 helyre`);
  const used = usedInEarlierRounds({ ...merged, round: 2 }, 2, GRADE_QUIZ_ITEMS, CHRISTMAS_ITEMS);
  assert.deepEqual((used as { repeatable?: string[] }).repeatable, expectedOrder, "az ismételhető kérdések sorrendje: legrégebbi elöl");
  const build = () => buildAdventPlan({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, grade, season, round: 2, subjectKey: "learner:L", ...used });
  const next = build();
  const ids = Object.values(next.doors).flat();
  assert.equal(ids.length, 72);
  assert.equal(new Set(ids).size, 72, "a 2. körön belül nincs ismétlés");
  const repeated = ids.filter((id) => shown.has(id));
  assert.equal(repeated.length, 72 - unseen, "csak a hiányzó helyeken ismétel; minden új kérdés felhasználva");
  assert.deepEqual(new Set(repeated), new Set(expectedOrder.slice(0, 72 - unseen)), "a legrégebben látott kérdések ismétlődnek");
  assert.deepEqual(build(), next, "determinisztikus");
  // Ahol van elég új kérdés, ugyanaz a terv, mint ismétlési lista nélkül (a döntés csak a hiányt pótolja).
  const { merged: fine } = l1Scenario(1, [1, 2, 3, 4]);
  const usedFine = usedInEarlierRounds({ ...fine, round: 2 }, 2, GRADE_QUIZ_ITEMS, CHRISTMAS_ITEMS);
  const withList = buildAdventPlan({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, grade, season, round: 2, subjectKey: "learner:L", ...usedFine });
  const withoutList = buildAdventPlan({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, grade, season, round: 2, subjectKey: "learner:L", usedIds: usedFine.usedIds, usedPrompts: usedFine.usedPrompts });
  assert.deepEqual(withList, withoutList);
  const routes = read("server/advent/routes.ts");
  assert.match(routes, /const nextRoundPlan = /, "a router a következő kör tervét előre megépíti");
  assert.match(routes, /patch: \{ round: current\.round \+ 1, finishedAt: null, plan: /, "a körváltás az új tervet ugyanabban a tranzakcióban menti");
});

test("L3: a tanulói kapcsolat / token változása új alany-generációt ad — a régi gyorsítótár-kulcs és a késve érkező régi írás nem érvényes", async () => {
  const generation = need<() => number>("adventSubjectGeneration");
  const keyOf = need<(g?: number) => readonly unknown[]>("adventStateKey");
  const watch = need<(target: EventTarget, tokenKey: string, eventName: string) => () => void>("watchAdventSubject");
  const setIfCurrent = need<(qc: QueryClient, g: number, next: unknown) => boolean>("setAdventStateIfCurrent");
  const qc = new QueryClient();
  const g0 = generation();
  qc.setQueryData(keyOf(g0), { firstName: "Előző Gyerek" });
  const target = new EventTarget();
  const stop = watch(target, "websuli.learnerToken", "websuli:learner-token-changed");
  // Másik lapon változott a tanulói token (storage esemény).
  target.dispatchEvent(Object.assign(new Event("storage"), { key: "websuli.learnerToken" }));
  const g1 = generation();
  assert.notEqual(g1, g0, "a token változása új generáció");
  assert.notDeepEqual(keyOf(g1), keyOf(g0), "új generáció → új kulcs, a korábbi tanuló adata nem látszik");
  assert.equal(qc.getQueryData(keyOf(g1)), undefined);
  // Ugyanebben a lapon törölt / elutasított token (saját esemény).
  target.dispatchEvent(new Event("websuli:learner-token-changed"));
  assert.notEqual(generation(), g1);
  // Más kulcsú storage-esemény nem vált alanyt.
  const g2 = generation();
  target.dispatchEvent(Object.assign(new Event("storage"), { key: "valami.mas" }));
  assert.equal(generation(), g2);
  stop();
  // A régi generációval indult írás eredménye nem kerül a gyorsítótárba.
  assert.equal(setIfCurrent(qc, g0, { firstName: "Késve" }), false);
  assert.deepEqual(qc.getQueryData(keyOf(g0)), { firstName: "Előző Gyerek" }, "a késve érkező írás nem írta felül");
  assert.equal(setIfCurrent(qc, generation(), { firstName: "Most" }), true);
  assert.deepEqual(qc.getQueryData(keyOf(generation())), { firstName: "Most" });
  // A clearAdventCache (be- / kilépés, kapcsolat bontása) is új generáció.
  const before = generation();
  await sync.clearAdventCache(qc);
  assert.notEqual(generation(), before);
  // Bekötés.
  assert.match(read("client/src/lib/learnerProfile.ts"), /dispatchEvent\(new Event\(LEARNER_TOKEN_CHANGED_EVENT\)\)/, "a token törlése / eltárolása jelez");
  assert.match(read("client/src/pages/PlayerAccount.tsx"), /await clearAdventCache\(queryClient\)/, "a tanulói kapcsolat változása üríti az adventi állapotot");
  const hook = read("client/src/advent/useAdvent.ts");
  // S5/S6 1. vak L2 (dokumentált): a kulcs a generáció mellett a módot (normál / előnézeti nap) is hordozza.
  assert.match(hook, /queryKey: adventStateKey\(generation, mode\)/, "a lekérdezés kulcsa a generációt is hordozza");
  assert.match(hook, /watchAdventSubject\(window, LEARNER_TOKEN_KEY, LEARNER_TOKEN_CHANGED_EVENT\)/);
  const page = read("client/src/pages/AdventCalendar.tsx");
  // (2026-11-21, PR-C 2. vak L2: az írás a versenyhelyzet-álló applyAdventWrite-on át megy, amely a setAdventStateIfCurrent-et hívja.)
  assert.match(page, /applyAdventWrite\(queryClient, generation, /, "a POST-eredmény csak az indításkori generációra íródik");
  assert.doesNotMatch(page, /setQueryData\(ADVENT_STATE_KEY/, "nincs generáció nélküli írás");
});

test("L4: a szerveróra-minta horgonya a minta érkezése — a válasz helyi állapotírása (applyAnswerResult) nem tolja el az éjféli frissítést", () => {
  type Anchor = { wait: number | null; at: number };
  const anchorOf = need<(prev: Anchor | null, wait: number | null, receivedAt: number) => Anchor>("nextRefreshAnchor");
  const T2300 = 1_000_000;
  const state = { nextOpensInMs: 3_600_000, doors: [{ day: 1, state: "open" }], summary: {}, closing: {} };
  let anchor = anchorOf(null, state.nextOpensInMs, T2300);
  // 23:55-kor válasz: a helyi írás megőrzi a régi várakozást, a react-query új dataUpdatedAt-et ad.
  const T2355 = T2300 + 55 * 60_000;
  const afterAnswer = applyAnswerResult(state as never, { door: { day: 1, state: "solved" }, summary: {}, closing: {} } as never) as typeof state;
  anchor = anchorOf(anchor, afterAnswer.nextOpensInMs, T2355);
  assert.equal(anchor.at, T2300, "a horgony a GET érkezése marad");
  assert.equal(sync.refreshDelayMs({ nextOpensInMs: anchor.wait }, anchor.at, T2355), 5 * 60_000 + 1000, "éjfél + 1 mp, nem 00:55");
  // Új szerverminta (új várakozás) → új horgony.
  const fresh = anchorOf(anchor, 120_000, T2355 + 1);
  assert.deepEqual(fresh, { wait: 120_000, at: T2355 + 1 });
  assert.match(read("client/src/advent/useAdvent.ts"), /nextRefreshAnchor\(anchorRef\.current, nextOpensInMs, query\.dataUpdatedAt\)/);
});

test("L5: más évfolyamú vendégablak átvételekor csak az eredmény (és a sorrend magja) kerül át — a vendég fel nem használt kérdéssora és tárgya nem", () => {
  const vendorPlan = withPlanMeta(buildAdventPlan({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, grade: 4, season, round: 1, subjectKey: "device:D" }), 4, "device:D");
  const learnerPlan = withPlanMeta(buildAdventPlan({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, grade: 5, season, round: 1, subjectKey: "learner:L" }), 5, "learner:L");
  const guestQ = vendorPlan.doors[1]![0]!;
  const learner = emptyRow({ grade: null, plan: { 1: learnerPlan } });
  const device = emptyRow({ id: "d", subjectKind: "device", subjectId: "D", grade: 4, plan: { 1: vendorPlan }, doors: { 1: { 1: { attempts: [{ questionId: guestQ, pick: 0, correct: true, at: "" }] } } } });
  const ctx = createAdoptionContext({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, season, learnerId: "L", learnerGrade: 5, deviceId: "D", now: NOW });
  const merged = mergeAdoption(learner, device, ctx)!;
  const plan = merged.plan[1]! as typeof learnerPlan;
  assert.equal(merged.doors[1]![1]!.attempts[0]!.questionId, guestQ, "az eredmény átkerült");
  assert.equal(plan.doors[1]![0], guestQ, "a történeti hely a próba kérdése");
  assert.equal(plan.subjects[1], learnerPlan.subjects[1], "a tárgy a tanuló (ötödikes) tervéé");
  for (const id of plan.doors[1]!.slice(1)) {
    const item = findAdventItem(id, GRADE_QUIZ_ITEMS, CHRISTMAS_ITEMS)!;
    assert.ok(!("grade" in item) || (item as { grade: number }).grade === 5, `negyedikes kérdés a tervben: ${id}`);
  }
  for (const id of vendorPlan.doors[1]!.slice(1)) assert.ok(!plan.doors[1]!.includes(id), `a vendég fel nem használt kérdése bekerült: ${id}`);
  assert.equal((plan as { doorSeeds?: Record<number, string> }).doorSeeds?.[1], "device:D", "a sorrend magja a vendégé (a jelölés változatlan)");
});

test("L6: minden író belépő szinkron őre: a lejárt párosítás (állapot, munkameneti jelző, választási kényszer) bármelyike tiltja az írást", () => {
  const blocked = need<(input: { mustChoose: boolean; lost: boolean; pairing: string | null | undefined }) => boolean>("adventWriteBlocked");
  assert.equal(blocked({ mustChoose: false, lost: false, pairing: "ok" }), false);
  assert.equal(blocked({ mustChoose: false, lost: false, pairing: "invalid" }), true, "a GET már érvénytelen párosítást jelzett, a jelző még nem állt be");
  assert.equal(blocked({ mustChoose: false, lost: true, pairing: "none" }), true, "a profil-lekérdezés már törölte a tokent");
  assert.equal(blocked({ mustChoose: true, lost: false, pairing: "none" }), true);
  const page = read("client/src/pages/AdventCalendar.tsx");
  // Az automatikus nyitás a döntésig nem fogyasztja el a szándékot, és az őrt a szándék elfogyasztása ELŐTT hívja.
  assert.match(page, /if \(!state \|\| !wantsAuto\.current \|\| state\.needsGrade \|\| writeBlocked\(\)\) return;\n\s+wantsAuto\.current = false;/);
  assert.match(page, /const openDoor = useCallback\(async \(day: number, opener: HTMLElement \| null, repair = false\) => \{\n\s+if \(writeBlocked\(\)\) \{ say\(CHOOSE_FIRST_TEXT\); return; \}/);
});

test("L7: sérült mentés (409 corrupt) az állapot-olvasásnál célzott, gondozóhoz irányító hiba — nem hálózati újrapróba", async () => {
  const errorOf = need<(res: { status: number; json: () => Promise<unknown> }) => Promise<Error & { status?: number; corrupt?: boolean }>>("adventStateError");
  const corrupt = await errorOf({ status: 409, json: async () => ({ message: "A naptárad mentésében hibát találtunk…", corrupt: true }) });
  assert.equal(corrupt.status, 409);
  assert.equal(corrupt.corrupt, true);
  const busy = await errorOf({ status: 429, json: async () => ({ message: "Túl sok kérés." }) });
  assert.equal(busy.corrupt, false);
  const html = await errorOf({ status: 502, json: async () => { throw new SyntaxError("nem JSON"); } });
  assert.equal(html.status, 502);
  assert.equal(html.corrupt, false);
  assert.match(read("client/src/advent/useAdvent.ts"), /if \(!res\.ok\) throw await adventStateError\(res\);/);
  assert.match(read("client/src/pages/AdventCalendar.tsx"), /data-testid="advent-corrupt"/);
});

test("L8: a karácsonyfa csillaga a 24. ablak megoldását követi (nem a pontszámot), egyszeri felfényléssel; csökkentett mozgásnál animáció nélkül világít", () => {
  const page = read("client/src/pages/AdventCalendar.tsx");
  assert.match(page, /data-testid="advent-tree-star" data-lit=\{starLit \? "true" : "false"\}/);
  assert.match(page, /const starLit = state\.doors\[23\]\?\.state === "solved";/);
  const css = read("client/src/advent/advent.css");
  assert.match(css, /\.advent-tree-star\[data-flash="true"\] \{[^}]*animation: advent-star 1\.2s ease-out 1;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\n[^}]*\.advent-tree-star/);
});

test("L2: a függő átvétel jelzése és a megtekintési útról induló kifejezett átvétel (a kliens oldala)", () => {
  const should = need<(state: { adoptionPending?: boolean; identity: string | null } & Record<string, unknown>, ui: { summaryOpen: boolean; roundOver: boolean; blocked: boolean }) => boolean>("shouldAdopt");
  const st = { adoptionPending: true, identity: "learner" };
  assert.equal(should(st, { summaryOpen: true, roundOver: false, blocked: false }), true, "az összesítés megnyitása átvesz");
  assert.equal(should(st, { summaryOpen: false, roundOver: true, blocked: false }), true, "végigjátszott kör: nincs más író út");
  assert.equal(should(st, { summaryOpen: false, roundOver: false, blocked: false }), false, "folyamatban lévő körben a következő írás veszi át");
  assert.equal(should({ ...st, adoptionPending: false }, { summaryOpen: true, roundOver: true, blocked: false }), false);
  assert.equal(should({ ...st, identity: "device" }, { summaryOpen: true, roundOver: true, blocked: false }), false);
  assert.equal(should(st, { summaryOpen: true, roundOver: true, blocked: true }), false, "lejárt párosításnál nincs írás");
  // S6 (2026-11-21, dokumentált): a cím az `adventUrl`-ből jön (admin-előnézetben az előnézeti út), különben változatlanul /api/advent/adopt.
  const hook = read("client/src/advent/useAdvent.ts");
  assert.match(hook, /adopt: \(\) => \{ const url = adventUrl\("\/adopt"\); return previewAware\(\(\) => apiRequest<AdventState>\("POST", url, identity\(\)/);
  assert.match(hook, /return date \? `\/api\/admin\/advent\/preview\$\{path\}\?date=\$\{date\}` : `\/api\/advent\$\{path\}`;/);
  assert.match(read("shared/advent/contract.ts"), /adoptionPending: boolean;/);
});
