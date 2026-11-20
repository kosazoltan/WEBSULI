import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { QueryClient } from "@tanstack/react-query";

import { createAdoptionContext, mergeAdoption, planGradeOf, withPlanMeta } from "../server/advent/adoption";
import type { AdventRow } from "../server/advent/store";
import { adventNow } from "../shared/advent/calendar";
import { buildAdventPlan, findAdventItem } from "../shared/advent/assignment";
import { CHRISTMAS_ITEMS } from "../shared/advent/christmasBank/index";
import { GRADE_QUIZ_ITEMS } from "../client/src/data/gradeQuizBank/index";
import * as sync from "../client/src/advent/sync";

/**
 * Adventi naptár — élesítés előtti javítások (docs/specs/2026-11-18-adventi-naptar.md 22.; a 3/3 PR GPT-vak L1–L6). A kliensoldali
 * logika a tiszta \${BT}client/src/advent/sync.ts\${BT}-ben van (a Vite-os modulok node-ból nem tölthetők be); a bekötést forrás-őr nézi.
 */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8").replace(/\r\n/g, "\n");
type Sync = {
  refreshDelayMs?: (state: { nextOpensInMs?: number | null } | null, receivedAt: number, now: number) => number | null;
  statusFromResponse?: (res: { ok: boolean; status: number; json: () => Promise<unknown> }) => Promise<unknown>;
  clearAdventCache?: (queryClient: QueryClient) => Promise<void>;
  applyAnswerResult?: <T extends { doors: unknown[]; summary: unknown; closing: unknown }>(state: T, result: { doors?: unknown[]; door: { day: number; [key: string]: unknown }; summary: unknown; closing: unknown }) => T;
  ADVENT_STATE_KEY?: readonly string[];
};
const fn = sync as unknown as Sync;

test("L1: rögzítetlen évfolyamnál az átvétel a FRISS profil évfolyamát használja; a más évfolyamú, válasz nélküli saját terv újraépül", () => {
  const season = 2026;
  const learnerKey = "learner:L";
  const oldPlan = withPlanMeta(buildAdventPlan({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, grade: 4, season, round: 1, subjectKey: learnerKey }), 4, learnerKey);
  const devicePlan = withPlanMeta(buildAdventPlan({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, grade: 5, season, round: 1, subjectKey: "device:D" }), 5, "device:D");
  const learner: AdventRow = { id: "l", season, subjectKind: "learner", subjectId: "L", grade: null, round: 1, plan: { 1: oldPlan }, doors: {}, finishedAt: null, passedAt: null, mailedTo: [], createdAt: new Date(0), updatedAt: new Date(0) };
  const device: AdventRow = { ...learner, id: "d", subjectKind: "device", subjectId: "D", grade: 5, plan: { 1: devicePlan }, doors: { 1: { 1: { attempts: [{ questionId: devicePlan.doors[1]![0]!, pick: 0, correct: true, at: "" }] } } } };
  // A profil közben ötödikesre javult (a friss profil: 5).
  const ctx = createAdoptionContext({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, season, learnerId: "L", learnerGrade: 5, deviceId: "D", now: new Date("2026-12-02T10:00:00Z") });
  const merged = mergeAdoption(learner, device, ctx)!;
  assert.equal(merged.grade, 5, "a mentett évfolyam a friss profilé");
  assert.equal(planGradeOf(merged.plan[1]), 5, "a terv az új évfolyamra készült");
  // A saját bankos ablakok kérdései az 5. évfolyaméi (a 2–24. ablak bármelyik nem karácsonyi kérdése).
  const gradesOf = Object.entries(merged.plan[1]!.doors).filter(([d]) => d !== "1").flatMap(([, ids]) => ids).map((id) => findAdventItem(id, GRADE_QUIZ_ITEMS, CHRISTMAS_ITEMS)!)
    .filter((item) => "grade" in item).map((item) => (item as { grade: number }).grade);
  assert.ok(gradesOf.length > 0 && gradesOf.every((g) => g === 5), "nincs negyedikes kérdés a tervben");
  assert.equal(merged.doors[1]![1]!.attempts[0]!.correct, true, "a vendég megoldása átkerült");
});

test("L2: be- / kilépéskor az adventi állapot törlődik, és a függőben lévő régi kérés nem töltheti vissza", async () => {
  assert.equal(typeof fn.clearAdventCache, "function", "clearAdventCache hiányzik");
  const qc = new QueryClient();
  const key = fn.ADVENT_STATE_KEY ?? ["advent-state"];
  qc.setQueryData(key, { firstName: "Előző Gyerek" });
  // Késleltetett, régi kérés a kijelentkezés pillanatában.
  let release!: (v: unknown) => void;
  const pending = qc.fetchQuery({ queryKey: key, queryFn: () => new Promise((r) => { release = r; }), staleTime: 0 }).catch(() => undefined);
  await fn.clearAdventCache!(qc);
  release({ firstName: "Előző Gyerek (késve)" });
  await pending;
  assert.equal(qc.getQueryData(key), undefined, "nincs előző gyerek a gyorsítótárban");
  // A bekötés: a játékos be- és kilépésekor futó gyorsítótár-törlés az adventit is üríti.
  assert.match(read("client/src/hooks/usePlayer.ts"), /await clearAdventCache\(queryClient\);/);
  // A lekérdezés a megszakító jelet továbbadja (a régi kérés valóban megszakad).
  assert.match(read("client/src/advent/useAdvent.ts"), /queryFn: \(\{ signal \}\) => fetchAdventState\(createDevice, signal\)/);
});

test("L4: az éjféli frissítés a szerver által adott várakozásból, a válasz érkezésétől ütemeződik — az eszköz órája nem számít", () => {
  assert.equal(typeof fn.refreshDelayMs, "function", "refreshDelayMs hiányzik");
  // A szerver: még 2 perc a nyitásig; a válasz most érkezett. Az eszköz órája bármi lehet (itt 3 perccel siet) — a késleltetés pozitív.
  const receivedAt = 1_000_000;
  assert.equal(fn.refreshDelayMs!({ nextOpensInMs: 120_000 }, receivedAt, receivedAt), 121_000);
  assert.equal(fn.refreshDelayMs!({ nextOpensInMs: 120_000 }, receivedAt, receivedAt + 30_000), 91_000, "eltelt idő levonva");
  assert.equal(fn.refreshDelayMs!({ nextOpensInMs: null }, receivedAt, receivedAt), null);
  assert.equal(fn.refreshDelayMs!({ nextOpensInMs: 10_000 }, receivedAt, receivedAt + 60_000), 1000, "lekésett határ: azonnali (1 mp) frissítés");
  // A szerver számolja: adventNow(...).nextOpensInMs a szerver órájából.
  const at = adventNow(new Date("2026-12-04T22:58:00Z")) as unknown as { nextOpensInMs?: number };
  assert.equal(at.nextOpensInMs, 120_000);
  assert.match(read("server/advent/routes.ts"), /nextOpensInMs: at\.nextOpensInMs/);
});

test("L5: a státusz HTTP-hibája nem azonos a hiteles „kikapcsolt” válasszal — hibát dob (újrapróbálható), a kártya a helyén marad", async () => {
  assert.equal(typeof fn.statusFromResponse, "function", "statusFromResponse hiányzik");
  const res = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  assert.deepEqual(await fn.statusFromResponse!(res(200, { enabled: false })), { enabled: false });
  await assert.rejects(fn.statusFromResponse!(res(502, "<html>Bad Gateway</html>")), /502/);
  await assert.rejects(fn.statusFromResponse!(res(500, {})), /500/);
  const card = read("client/src/components/AdventHomeCard.tsx");
  assert.match(card, /const serverSaysOff = status\.isSuccess && /, "csak sikeres válasz csukja össze");
  assert.match(card, /retry: 3/);
});

test("L6: a válasz teljes ablaklistája az összesítéssel együtt cserélődik (két eszköz, egy tanuló)", () => {
  assert.equal(typeof fn.applyAnswerResult, "function", "applyAnswerResult hiányzik");
  const state = { doors: [{ day: 1, state: "open" }, { day: 2, state: "open" }], summary: { solved: 0 }, closing: { kind: "none" } };
  const result = { door: { day: 2, state: "solved" }, doors: [{ day: 1, state: "solved" }, { day: 2, state: "solved" }], summary: { solved: 2 }, closing: { kind: "none" } };
  const next = fn.applyAnswerResult!(state, result);
  assert.deepEqual(next.doors, result.doors, "a másik eszközön megoldott ablak is világít");
  assert.deepEqual(next.summary, { solved: 2 });
  // Régi szerverválasz (doors nélkül): csak a megválaszolt ablak cserélődik.
  const legacy = fn.applyAnswerResult!(state, { door: { day: 2, state: "solved" }, summary: { solved: 1 }, closing: { kind: "none" } });
  assert.deepEqual(legacy.doors, [{ day: 1, state: "open" }, { day: 2, state: "solved" }]);
  assert.match(read("client/src/pages/AdventCalendar.tsx"), /applyAnswerResult\(current, result\)/);
});
