import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { STALE_ROUND_DAYS } from "../shared/quiz-round";

/**
 * B7 (docs/specs/2026-11-25-eredmeny-email-b7.md; #510 R28, R30, R32): a tartós kimenő sor tiszta tárolórétege (`shared/result-outbox.ts`).
 * A böngésző `localStorage`-a helyett modellezett tároló: két fül egymás írását csak késleltetve, kulcsonként látja.
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
function sync(a: ReturnType<typeof tabStorage>, b: ReturnType<typeof tabStorage>) {
  const fromA = a.outgoing.splice(0), fromB = b.outgoing.splice(0);
  for (const [k, v] of fromA) { if (v === null) b.map.delete(k); else b.map.set(k, v); }
  for (const [k, v] of fromB) { if (v === null) a.map.delete(k); else a.map.set(k, v); }
}
const entry = (id: string, activityAt = Date.now()) => ({ id, lessonId: "l1", kind: "quiz" as const, body: { kind: "quiz", roundId: id, picks: {} },
  flag: `f:${id}`, partialKey: `p:${id}`, ownerKey: `o:${id}`, owner: { learnerTag: null }, activityAt });

test("B7 / R32: két fül egyidejű felvétele — egyik bejegyzés sem vész el (bejegyzésenkénti kulcs)", async () => {
  const { createOutboxStore, outboxKeyOf, RESULT_OUTBOX_PREFIX } = await import("../shared/result-outbox");
  const tabA = tabStorage(), tabB = tabStorage();
  const storeA = createOutboxStore(() => tabA), storeB = createOutboxStore(() => tabB);
  assert.deepEqual(storeA.read(), []);
  assert.deepEqual(storeB.read(), []);
  storeA.add(entry("a"));
  storeB.add(entry("b"));
  sync(tabA, tabB);
  for (const store of [storeA, storeB]) assert.deepEqual(store.read().map(e => e.id).sort(), ["a", "b"]);
  for (const tab of [tabA, tabB]) assert.deepEqual([...tab.map.keys()].sort(), [outboxKeyOf("a"), outboxKeyOf("b")]);
  assert.equal(outboxKeyOf("a"), `${RESULT_OUTBOX_PREFIX}a`);
  storeA.remove("a");
  storeB.add(entry("c"));
  sync(tabA, tabB);
  for (const store of [storeA, storeB]) assert.deepEqual(store.read().map(e => e.id).sort(), ["b", "c"]);
});

test("B7 / R32: ugyanaz a bejegyzés kétszer nem kerül a sorba; az idegen / sérült kulcs nem bejegyzés", async () => {
  const { createOutboxStore, outboxKeyOf } = await import("../shared/result-outbox");
  const tab = tabStorage();
  const store = createOutboxStore(() => tab);
  assert.equal(store.add(entry("a")), true);
  assert.equal(store.add({ ...entry("a"), body: { masik: true } }), false);
  assert.equal(store.read().length, 1);
  assert.deepEqual(store.read()[0].body, { kind: "quiz", roundId: "a", picks: {} }, "az első felvétel marad");
  tab.setItem(outboxKeyOf("hibas"), "{nem json");
  tab.setItem(outboxKeyOf("hianyos"), JSON.stringify({ id: "hianyos" }));
  tab.setItem(outboxKeyOf("rossz-kilet"), JSON.stringify({ ...entry("rossz-kilet"), owner: { learnerTag: 5 } }));
  tab.setItem(outboxKeyOf("mas-azonosito"), JSON.stringify(entry("x")));
  tab.setItem("mas:kulcs", JSON.stringify(entry("idegen")));
  assert.deepEqual(store.read().map(e => e.id), ["a"]);
});

test("B7 / R28: írhatatlan tárolónál a bejegyzés memóriában marad és olvasható; elérhetetlen tárolónál is működik", async () => {
  const { createOutboxStore } = await import("../shared/result-outbox");
  const tab = tabStorage();
  tab.setItem = () => { throw new Error("QuotaExceededError"); };
  const store = createOutboxStore(() => tab);
  store.add(entry("a"));
  assert.deepEqual(store.read().map(e => e.id), ["a"]);
  store.remove("a");
  assert.deepEqual(store.read(), []);
  const broken = createOutboxStore(() => { throw new Error("SecurityError"); });
  broken.add(entry("b"));
  assert.deepEqual(broken.read().map(e => e.id), ["b"]);
  const none = createOutboxStore(() => null);
  none.add(entry("c"));
  assert.deepEqual(none.read().map(e => e.id), ["c"], "KI kapcsoló (nincs tároló): csak memóriában");
});

test("B7 / R30: a 7 napnál régebbi tevékenységű bejegyzés lejárt; időbélyeg nélküli nem bejegyzés", async () => {
  const { outboxEntryExpired, createOutboxStore, outboxKeyOf } = await import("../shared/result-outbox");
  const DAY = 86_400_000, now = Date.parse("2026-11-20T12:00:00Z");
  assert.equal(STALE_ROUND_DAYS, 7);
  assert.equal(outboxEntryExpired({ activityAt: now - 7 * DAY }, now), false, "pontosan 7 nap még megy");
  assert.equal(outboxEntryExpired({ activityAt: now - 7 * DAY - 1 }, now), true);
  const tab = tabStorage();
  const { activityAt: _drop, ...noTime } = entry("ido-nelkul");
  tab.setItem(outboxKeyOf("ido-nelkul"), JSON.stringify(noTime));
  assert.deepEqual(createOutboxStore(() => tab).read(), []);
});

test("B7 / R32: az induló ellenőrzés a bejegyzésenkénti kulcsokat nézi", async () => {
  const { createOutboxStore, hasPendingOutbox } = await import("../shared/result-outbox");
  const tab = tabStorage();
  assert.equal(hasPendingOutbox(tab), false);
  tab.setItem("mas:kulcs", "1");
  assert.equal(hasPendingOutbox(tab), false);
  createOutboxStore(() => tab).add(entry("a"));
  assert.equal(hasPendingOutbox(tab), true);
  assert.equal(hasPendingOutbox(null), false);
  assert.equal(hasPendingOutbox({ ...tab, key: () => { throw new Error("x"); }, get length() { return 1; } } as Store), false, "olvashatatlan tároló: nincs függő");
});

test("B7: a kapcsoló alapból KI — élesben csak a build-idejű VITE_RESULT_OUTBOX_ENABLED=1, a futásidejű horog csak az e2e-buildben", () => {
  const flag = readFileSync(new URL("../client/src/lib/resultOutboxFlag.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const body = flag.slice(flag.indexOf("export function resultOutboxEnabled"));
  assert.match(body, /if \(import\.meta\.env\.VITE_RESULT_OUTBOX_ENABLED === "1"\) return true;\n\s*if \(import\.meta\.env\.VITE_ENABLE_RUNTIME_PROBE !== "1"\) return false;/);
  assert.equal((body.match(/return true/g) ?? []).length, 1, "egyetlen bekapcsoló ág");
  const source = readFileSync(new URL("../client/src/lesson-runtime/resultReport.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(source, /const outbox = createOutboxStore\(\(\) => \(resultOutboxEnabled\(\) \? localStorage : null\)\);/);
  const app = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  assert.match(app, /if \(!resultOutboxEnabled\(\)\) return;/);
});
