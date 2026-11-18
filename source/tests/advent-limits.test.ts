import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";

import { adventClock } from "../server/advent/clock";
import { ADVENT_LIMITS, createWindowCounter, type AdventLimits } from "../server/advent/limits";
import { createAdventRouter } from "../server/advent/routes";
import type { AdventRow, AdventStore } from "../server/advent/store";

/**
 * Adventi naptár — kéréskorlátok és az óra HTTP-szinten, adatbázis nélkül (docs/specs/2026-11-18-adventi-naptar.md 16.1, 18.2,
 * 16.5; A49, A51; review C1, C4, K2). A router valódi Express-alkalmazásban fut; a tároló csonk (a `/round` meglévő sor nélkül
 * 409-et ad, sort nem ír), a korlátok kisebb, injektált értékek.
 */
const emptyStore = { read: async () => null } as unknown as AdventStore;

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/**
 * Memóriabeli tároló VÁRAKOZÁSSAL az olvasás és az írás körül (mint a valódi adatbázis-körök): a párhuzamos kérések így
 * tényleg összefésülődnek. A „létrejött-e” döntés és a beírás között nincs várakozás (a valódi tároló ezt sorzárral adja).
 */
function memoryStore() {
  const rows = new Map<string, AdventRow>();
  const store = {
    read: async (_season: number, subject: { id: string }) => { await tick(); return rows.get(subject.id) ?? null; },
    mutate: async (season: number, subject: { kind: AdventRow["subjectKind"]; id: string }, fn: (row: AdventRow, created: boolean) => { patch: Partial<AdventRow> | null; result: unknown }) => {
      await tick();
      const existing = rows.get(subject.id);
      const blank: AdventRow = { id: subject.id, season, subjectKind: subject.kind, subjectId: subject.id, grade: null, round: 1, plan: {}, doors: {}, finishedAt: null, passedAt: null, mailedTo: [], createdAt: new Date(), updatedAt: new Date() };
      const { patch, result } = fn(existing ?? blank, !existing); // dobhat: akkor sor nem jön létre
      const row = { ...(existing ?? blank), ...(patch ?? {}) };
      rows.set(subject.id, row);
      await tick();
      return { row, created: !existing, result };
    },
  };
  return { rows, store: store as unknown as AdventStore };
}

async function serve(opts: { limits?: AdventLimits; clock?: Parameters<typeof createAdventRouter>[0]["clock"]; store?: AdventStore }) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/api/advent", createAdventRouter({
    store: opts.store ?? emptyStore, bank: [], christmas: [],
    enabled: () => true,
    clock: opts.clock ?? (() => new Date("2026-12-05T10:00:00Z")),
    resolve: async (_req, input) => ({ subject: typeof input.device === "string" ? { kind: "device", id: input.device, grade: null, firstName: null } : null, pairing: "none" }),
    limits: opts.limits,
  }));
  const server = await new Promise<import("node:http").Server>((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const round = async (device: string, ip: string) => {
    const res = await fetch(`${base}/api/advent/round`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ device }) });
    return { status: res.status, body: (await res.json()) as { limit?: string } };
  };
  const status = async (headers: Record<string, string> = {}) => (await (await fetch(`${base}/api/advent/status`, { headers })).json()) as { enabled: boolean; phase?: string; openDay?: number };
  const post = async (path: string, device: string, ip: string, data: Record<string, unknown> = {}) => {
    const res = await fetch(`${base}/api/advent${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ device, ...data }) });
    return { status: res.status, body: (await res.json()) as { limit?: string } };
  };
  const state = async (ip: string) => (await fetch(`${base}/api/advent/state`, { headers: { "x-forwarded-for": ip, "x-advent-device": A } })).status;
  return { round, status, post, state, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("a korlátok egy helyen állnak, és a szabályos legrosszabb eset (144 írás) belefér az alanyonkénti keretbe", () => {
  assert.deepEqual(ADVENT_LIMITS, {
    subjectWrites: { limit: 200, windowMs: 900_000 },
    ipWrites: { limit: 1500, windowMs: 900_000 },
    ipReads: { limit: 400, windowMs: 60_000 },
    newDeviceRows: { limit: 90, windowMs: 3_600_000 },
  });
  assert.ok(ADVENT_LIMITS.subjectWrites.limit >= 24 * 3 * 2);
  assert.ok(ADVENT_LIMITS.ipWrites.limit > ADVENT_LIMITS.subjectWrites.limit);
  // Iskolai méret (tulajdonosi döntés 2026-11-18): három 30 fős osztály egy órán belül, egy osztály 15 nyitható ablakkal pótolva.
  assert.ok(ADVENT_LIMITS.newDeviceRows.limit >= 3 * 30);
  assert.ok(ADVENT_LIMITS.ipWrites.limit >= 30 * (1 + 2 * 15));
  // Olvasás: négy 30 fős osztály egy percen belül, fejenként három állapot-olvasással (kártya, naptároldal, egy frissítés).
  assert.ok(ADVENT_LIMITS.ipReads.limit >= 4 * 30 * 3);
});

test("csúszóablakos számláló: a keret betelik, az ablak után felszabadul; a kulcsok függetlenek (review K2)", () => {
  let now = 1_000_000;
  const counter = createWindowCounter({ limit: 3, windowMs: 1000 }, () => now);
  assert.equal(counter.full("a"), false);
  counter.hit("a"); counter.hit("a");
  assert.equal(counter.full("a"), false);
  counter.hit("a");
  assert.equal(counter.full("a"), true);
  assert.equal(counter.full("b"), false, "másik kulcs kerete érintetlen");
  // A `full` kérdezése önmagában nem számít eseménynek (a kísérlet nem fogyaszt keretet).
  for (let i = 0; i < 10; i++) counter.full("b");
  assert.equal(counter.count("b"), 0);
  now += 1001;
  assert.equal(counter.full("a"), false);
  assert.equal(counter.count("a"), 0);
});

test("foglalás: ellenőrzés és rögzítés egy lépésben, a visszaadott hely újra kiadható; a nem kérdezett kulcsok is kiürülnek (review U1, U2)", () => {
  let now = 5_000_000;
  const counter = createWindowCounter({ limit: 2, windowMs: 1000 }, () => now);
  const first = counter.reserve("a");
  const second = counter.reserve("a");
  assert.ok(first !== null && second !== null);
  assert.equal(counter.reserve("a"), null, "a betelt keret nem ad helyet");
  counter.release("a", first!);
  assert.equal(counter.count("a"), 1);
  assert.notEqual(counter.reserve("a"), null, "a visszaadott hely újra kiadható");
  counter.release("a", 123);
  counter.release("nincs", 1); // ismeretlen jegy / kulcs: nem hiba, nem töröl mást
  assert.equal(counter.count("a"), 2);
  // U2: 500 különböző kulcs, amelyet többé senki nem kérdez — az ablak után egy MÁSIK kulcs eseménye kisöpri őket.
  for (let i = 0; i < 500; i++) counter.hit(`ip-${i}`);
  assert.equal(counter.size(), 501);
  now += 1001;
  counter.hit("uj");
  assert.equal(counter.size(), 1, "csak az élő kulcs marad");
  // Egy ablakon belül a söprés nem fut újra (nem jár be mindent minden eseménynél), de a kulcs kérdezése továbbra is takarít.
  now += 10;
  counter.hit("masik");
  assert.equal(counter.size(), 2);
});

test("új névtelen sor kerete PÁRHUZAMOS kérésekkel sem léphető túl: 120 egyidejű létrehozás egy címről → pontosan 90 sor (review U1)", async () => {
  // Mutációs ellenpróba a számlálón: a régi rend (előbb kérdez, a várakozás UTÁN számol) mind a 120-at átengedi.
  const naive = createWindowCounter(ADVENT_LIMITS.newDeviceRows);
  const passed = await Promise.all(Array.from({ length: 120 }, async () => { if (naive.full("ip")) return false; await tick(); naive.hit("ip"); return true; }));
  assert.equal(passed.filter(Boolean).length, 120, "a régi rend túllépi a keretet — ezt zárja ki a foglalás");

  const memory = memoryStore();
  const app = await serve({ store: memory.store });
  try {
    const device = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    const results = await Promise.all(Array.from({ length: 120 }, (_, i) => app.post("/grade", device(i), "10.9.0.1", { grade: 5 })));
    assert.equal(results.filter((r) => r.status === 200).length, 90);
    assert.equal(results.filter((r) => r.status === 429 && r.body.limit === "new-row").length, 30);
    assert.equal(memory.rows.size, 90, "legfeljebb a keretnyi sor jött létre");
    // Meglévő sor nem fogyaszt keretet: a már létrejött eszköz a betelt keret mellett is írhat.
    const existing = [...memory.rows.keys()][0]!;
    assert.equal((await app.post("/grade", existing, "10.9.0.1", { grade: 6 })).status, 200);
    // Másik hálózat kerete független.
    assert.equal((await app.post("/grade", device(500), "10.9.0.2", { grade: 5 })).status, 200);
  } finally { await app.close(); }
});

test("a foglalás visszajár, ha a sor nem jött létre: sikertelen módosítás és ugyanazon eszköz párhuzamos kérései nem fogyasztanak keretet (review U1, K2)", async () => {
  const limits: AdventLimits = { ...ADVENT_LIMITS, newDeviceRows: { limit: 3, windowMs: 60_000 } };
  const memory = memoryStore();
  const app = await serve({ store: memory.store, limits });
  try {
    // Évfolyam nélküli megnyitás: 409, sor nem jön létre — 20 párhuzamos kísérlet után a keret üres marad.
    const failed = await Promise.all(Array.from({ length: 20 }, (_, i) => app.post("/doors/1/open", `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`, "10.8.0.1")));
    assert.ok(failed.every((r) => r.status === 409 || r.status === 429), JSON.stringify(failed.map((r) => r.status)));
    assert.equal(memory.rows.size, 0);
    // Ugyanaz az eszköz 10 párhuzamos kéréssel: egy sor, egy hely.
    const same = await Promise.all(Array.from({ length: 10 }, () => app.post("/grade", A, "10.8.0.1", { grade: 5 })));
    assert.ok(same.some((r) => r.status === 200));
    assert.equal(memory.rows.size, 1);
    // A keretből (3) így még kettő kiadható, a következő már nem.
    assert.equal((await app.post("/grade", B, "10.8.0.1", { grade: 5 })).status, 200);
    assert.equal((await app.post("/grade", "33333333-3333-4333-8333-333333333333", "10.8.0.1", { grade: 5 })).status, 200);
    const blocked = await app.post("/grade", "44444444-4444-4444-8444-444444444444", "10.8.0.1", { grade: 5 });
    assert.deepEqual({ status: blocked.status, limit: blocked.body.limit }, { status: 429, limit: "new-row" });
    assert.equal(memory.rows.size, 3);
  } finally { await app.close(); }
});

test("olvasási keret: a hálózat kerete utáni állapot-olvasás 429, másik hálózat nem érintett; az alapérték 400 / perc (S3 K4, tulajdonosi döntés)", async () => {
  const limits: AdventLimits = { ...ADVENT_LIMITS, ipReads: { limit: 3, windowMs: 60_000 } };
  const app = await serve({ limits });
  try {
    for (let i = 1; i <= 3; i++) assert.equal(await app.state("10.7.0.1"), 200, i + ". olvasás a keretben");
    assert.equal(await app.state("10.7.0.1"), 429);
    assert.equal(await app.state("10.7.0.2"), 200, "másik hálózat kerete független");
    // Az olvasás nem fogyasztja az írási keretet.
    assert.equal((await app.round(A, "10.7.0.1")).status, 409);
  } finally { await app.close(); }
  // Alapértékkel: 400 olvasás egy címről mind átmegy, a 401. nem.
  const real = await serve({});
  try {
    const statuses: number[] = [];
    // 8 × 50-es hullám: a helyi szerver fogadósorát egyetlen 400-as löket túltöltené.
    for (let wave = 0; wave < 8; wave++) statuses.push(...(await Promise.all(Array.from({ length: 50 }, () => real.state("10.7.1.1")))));
    assert.equal(statuses.length, 400);
    assert.ok(statuses.every((code) => code === 200), "az első 400 a keretben");
    assert.equal(await real.state("10.7.1.1"), 429);
  } finally { await real.close(); }
});

test("alanyonkénti korlát: a keret utáni kérés 429 (limit: subject); másik alany ugyanarról a hálózatról nem érintett (review C1)", async () => {
  const limits: AdventLimits = { ...ADVENT_LIMITS, subjectWrites: { limit: 3, windowMs: 60_000 }, ipWrites: { limit: 100, windowMs: 60_000 } };
  const app = await serve({ limits });
  try {
    for (let i = 1; i <= 3; i++) assert.equal((await app.round(A, "10.1.0.1")).status, 409, `${i}. kérés: a keretben (a végpont maga 409-et ad sor nélkül)`);
    const blocked = await app.round(A, "10.1.0.1");
    assert.deepEqual({ status: blocked.status, limit: blocked.body.limit }, { status: 429, limit: "subject" });
    // Mutációs ellenpróba: ha a kulcs közös (pl. IP) volna, a másik alany is 429-et kapna.
    assert.equal((await app.round(B, "10.1.0.1")).status, 409);
    // Az alany kerete nem az IP-hez kötött: másik hálózatról is foglalt marad.
    assert.equal((await app.round(A, "10.1.0.2")).status, 429);
  } finally { await app.close(); }
});

test("IP-korlát: a hálózat kerete utáni kérés 429 (limit: ip), más hálózatról ugyanaz az alany még mehet (review C1)", async () => {
  const limits: AdventLimits = { ...ADVENT_LIMITS, subjectWrites: { limit: 100, windowMs: 60_000 }, ipWrites: { limit: 4, windowMs: 60_000 } };
  const app = await serve({ limits });
  try {
    for (const device of [A, B, A, B]) assert.equal((await app.round(device, "10.2.0.1")).status, 409);
    const blocked = await app.round(A, "10.2.0.1");
    assert.deepEqual({ status: blocked.status, limit: blocked.body.limit }, { status: 429, limit: "ip" });
    assert.equal((await app.round(B, "10.2.0.1")).status, 429, "a hálózat minden alanya áll");
    assert.equal((await app.round(A, "10.2.0.9")).status, 409, "másik hálózatról megy");
  } finally { await app.close(); }
});

test("az alapértelmezett korlátokkal a 201. írás 429 (alany), előtte egy sem (A49 felső határa)", async () => {
  const app = await serve({});
  try {
    const statuses: number[] = [];
    for (let i = 0; i < 201; i++) statuses.push((await app.round(A, "10.3.0.1")).status);
    assert.ok(statuses.slice(0, 200).every((s) => s === 409), "az első 200 a keretben");
    assert.equal(statuses[200], 429);
  } finally { await app.close(); }
});

test("óra NEM e2e-módban, valódi HTTP-n: a tesztidő-fejléc hatástalan, a szerver órája dönt (review C4)", async () => {
  const real = new Date("2026-12-10T08:00:00Z");
  const app = await serve({ clock: (req) => adventClock(req, { NODE_ENV: "production" }, () => real) });
  try {
    const plain = await app.status();
    assert.deepEqual({ enabled: plain.enabled, phase: plain.phase, openDay: plain.openDay }, { enabled: true, phase: "open", openDay: 10 });
    const spoofed = await app.status({ "x-advent-test-now": "2026-12-24T10:00:00Z" });
    assert.equal(spoofed.openDay, 10, "a fejléc nem nyit ki későbbi ablakot");
  } finally { await app.close(); }
  // E2E-módban ugyanez a bekötés fejléc nélkül kikapcsolt, érvényes fejléccel a fejléc ideje számít.
  const e2e = await serve({ clock: (req) => adventClock(req, { WEBSULI_E2E: "1" }, () => real) });
  try {
    assert.deepEqual(await e2e.status(), { enabled: false });
    assert.equal((await e2e.status({ "x-advent-test-now": "2026-12-24T10:00:00Z" })).openDay, 24);
  } finally { await e2e.close(); }
});
