import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RESULT_OUTBOX_KEY, STALE_ROUND_DAYS } from "../shared/quiz-round";

/**
 * Terv R30 / R32 (PR #510, review 4642268402 / 4642333249): a tartós kimenő sor tiszta tárolórétege (`shared/result-outbox.ts`) —
 * bejegyzésenkénti kulcs (fülbiztos), memóriasor írhatatlan tárolónál (R28), korhatár. A böngésző `localStorage`-a helyett egy
 * modellezett tároló: két fül egymás írását csak késleltetve, kulcsonként látja (mint a több folyamatú böngészőben).
 */
type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void; key(i: number): string | null; readonly length: number };
function tabStorage(): Store & { map: Map<string, string>; outgoing: Array<[string, string | null]> } {
  const map = new Map<string, string>();
  const outgoing: Array<[string, string | null]> = [];
  return {
    map, outgoing,
    getItem: k => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); outgoing.push([k, v]); },
    removeItem: k => { map.delete(k); outgoing.push([k, null]); },
    key: i => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}
/** A két fül írásainak késleltetett, kulcsonkénti átvitele (az utolsó író nyer kulcsonként). */
function sync(a: ReturnType<typeof tabStorage>, b: ReturnType<typeof tabStorage>) {
  const fromA = a.outgoing.splice(0), fromB = b.outgoing.splice(0);
  for (const [k, v] of fromA) { if (v === null) b.map.delete(k); else b.map.set(k, v); }
  for (const [k, v] of fromB) { if (v === null) a.map.delete(k); else a.map.set(k, v); }
}
const entry = (id: string, activityAt = Date.now()) => ({ id, lessonId: "l1", kind: "quiz" as const, body: { kind: "quiz", roundId: id }, flag: `f:${id}`, partialKey: `p:${id}`, activityAt });

test("R32: két fül egyidejű felvétele — egyik bejegyzés sem vész el (bejegyzésenkénti kulcs, közös lista írása nincs)", async () => {
  const { createOutboxStore, outboxKeyOf } = await import("../shared/result-outbox");
  const tabA = tabStorage(), tabB = tabStorage();
  const storeA = createOutboxStore(() => tabA), storeB = createOutboxStore(() => tabB);
  // Mindkét fül a másik írása ELŐTT olvas és ír (a régi, közös listás sor itt az egyiket elvesztette volna).
  assert.deepEqual(storeA.read(), []);
  assert.deepEqual(storeB.read(), []);
  storeA.add(entry("a"));
  storeB.add(entry("b"));
  sync(tabA, tabB);
  for (const store of [storeA, storeB]) assert.deepEqual(store.read().map(e => e.id).sort(), ["a", "b"], "mindkét fül mindkét bejegyzést látja");
  // A közös kulcsot a sor nem írja; minden bejegyzés a saját kulcsán.
  for (const tab of [tabA, tabB]) {
    assert.equal(tab.map.has(RESULT_OUTBOX_KEY), false);
    assert.deepEqual([...tab.map.keys()].sort(), [outboxKeyOf("a"), outboxKeyOf("b")]);
  }
  // A törlés is csak a saját kulcsot érinti: az egyik fül törlése és a másik egyidejű felvétele együtt is megmarad.
  storeA.remove("a");
  storeB.add(entry("c"));
  sync(tabA, tabB);
  for (const store of [storeA, storeB]) assert.deepEqual(store.read().map(e => e.id).sort(), ["b", "c"]);
});

test("R32: ugyanaz a bejegyzés kétszer nem kerül a sorba; az idegen / sérült kulcs nem bejegyzés", async () => {
  const { createOutboxStore, outboxKeyOf } = await import("../shared/result-outbox");
  const tab = tabStorage();
  const store = createOutboxStore(() => tab);
  store.add(entry("a"));
  store.add({ ...entry("a"), body: { masik: true } });
  assert.equal(store.read().length, 1);
  assert.deepEqual(store.read()[0].body, { kind: "quiz", roundId: "a" }, "az első felvétel marad");
  tab.setItem(outboxKeyOf("hibas"), "{nem json");
  tab.setItem(outboxKeyOf("hianyos"), JSON.stringify({ id: "hianyos" }));
  tab.setItem("mas:kulcs", JSON.stringify(entry("idegen")));
  assert.deepEqual(store.read().map(e => e.id), ["a"]);
});

test("R28 + R32: írhatatlan tárolónál a bejegyzés memóriában marad és olvasható; a törlés onnan is kiveszi", async () => {
  const { createOutboxStore } = await import("../shared/result-outbox");
  const tab = tabStorage();
  tab.setItem = () => { throw new Error("QuotaExceededError"); };
  const store = createOutboxStore(() => tab);
  store.add(entry("a"));
  assert.deepEqual(store.read().map(e => e.id), ["a"]);
  store.remove("a");
  assert.deepEqual(store.read(), []);
  // Olvashatatlan tároló (privát mód: a hozzáférés dob) mellett is működik, csak memóriából.
  const broken = createOutboxStore(() => { throw new Error("SecurityError"); });
  broken.add(entry("b"));
  assert.deepEqual(broken.read().map(e => e.id), ["b"]);
});

test("R30: a 7 napnál régebbi tevékenységű bejegyzés lejárt; a frissebb nem", async () => {
  const { outboxEntryExpired } = await import("../shared/result-outbox");
  const DAY = 86_400_000, now = Date.parse("2026-11-20T12:00:00Z");
  assert.equal(STALE_ROUND_DAYS, 7);
  assert.equal(outboxEntryExpired({ activityAt: now - 7 * DAY }, now), false, "pontosan 7 nap még megy");
  assert.equal(outboxEntryExpired({ activityAt: now - 7 * DAY - 1 }, now), true);
  assert.equal(outboxEntryExpired({ activityAt: now - 60_000 }, now), false);
  // Időbélyeg nélküli (sérült) bejegyzés nem bejegyzés: az olvasás kiszűri, így nem ragadhat örökre a sorban.
  const { createOutboxStore, outboxKeyOf } = await import("../shared/result-outbox");
  const tab = tabStorage();
  const { activityAt: _drop, ...noTime } = entry("ido-nelkul");
  tab.setItem(outboxKeyOf("ido-nelkul"), JSON.stringify(noTime));
  assert.deepEqual(createOutboxStore(() => tab).read(), []);
});

test("R30 + R31 + R32: a beküldő a tárolóréteget használja — a lejárt bejegyzés küldés nélkül kikerül, a bejegyzés kilétet visz", () => {
  const source = readFileSync(new URL("../client/src/lesson-runtime/resultReport.ts", import.meta.url), "utf8");
  assert.match(source, /createOutboxStore\(/);
  assert.match(source, /if \(outboxEntryExpired\(entry, now\)\) \{ outbox\.remove\(entry\.id\); continue; \}/);
  assert.doesNotMatch(source, /localStorage\.setItem\(RESULT_OUTBOX_KEY/, "a közös lista írása megszűnt");
  assert.match(source, /subject: resultSubject\(\)/);
});

test("R31: a régi alak (R10) a kilét-címkét sem küldi; a szerver a CSRF-token mellett adja a címkét", async () => {
  const { legacyResultBody } = await import("../shared/result-compat");
  assert.deepEqual(legacyResultBody({ kind: "quiz", roundId: "r", picks: { q1: 0 }, subject: "anon", clientNow: 5 }), { kind: "quiz", roundId: "r", picks: { q1: 0 } });
  assert.deepEqual(legacyResultBody({ kind: "tasks", roundId: "r", answers: { t1: "x" }, subject: "abc" }), { kind: "tasks", roundId: "r", answers: { t1: "x" } });
  const routes = readFileSync(new URL("../server/routes.ts", import.meta.url), "utf8");
  assert.match(routes, /res\.json\(\{ csrfToken, resultApi: RESULT_API_VERSION, resultSubject: resultSubjectOf\(/);
  const client = readFileSync(new URL("../client/src/lib/queryClient.ts", import.meta.url), "utf8");
  assert.match(client, /export function resultSubject\(\): string \| null/);
});

test("R32: az alkalmazás induláskor a bejegyzésenkénti kulcsokat nézi — a függő bejegyzés miatt betölti a beküldőt és üríti a sort", async () => {
  const { createOutboxStore, hasPendingOutbox } = await import("../shared/result-outbox");
  const tab = tabStorage();
  assert.equal(hasPendingOutbox(tab), false, "üres sor");
  tab.setItem("mas:kulcs", "1");
  assert.equal(hasPendingOutbox(tab), false, "idegen kulcs nem függő bejegyzés");
  createOutboxStore(() => tab).add(entry("a"));
  assert.equal(hasPendingOutbox(tab), true, "a bejegyzés saját kulcson áll, és az induló ellenőrzés látja");
  assert.equal(hasPendingOutbox(null), false);
  const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /pending = hasPendingOutbox\(localStorage\);/);
  assert.doesNotMatch(app, /localStorage\.getItem\(RESULT_OUTBOX_KEY\)/, "a régi, közös kulcs ellenőrzése megszűnt");
});
