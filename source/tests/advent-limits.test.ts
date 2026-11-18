import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";

import { adventClock } from "../server/advent/clock";
import { ADVENT_LIMITS, createWindowCounter, type AdventLimits } from "../server/advent/limits";
import { createAdventRouter } from "../server/advent/routes";
import type { AdventStore } from "../server/advent/store";

/**
 * Adventi naptár — kéréskorlátok és az óra HTTP-szinten, adatbázis nélkül (docs/specs/2026-11-18-adventi-naptar.md 16.1, 18.2,
 * 16.5; A49, A51; review C1, C4, K2). A router valódi Express-alkalmazásban fut; a tároló csonk (a `/round` meglévő sor nélkül
 * 409-et ad, sort nem ír), a korlátok kisebb, injektált értékek.
 */
const emptyStore = { read: async () => null } as unknown as AdventStore;

async function serve(opts: { limits?: AdventLimits; clock?: Parameters<typeof createAdventRouter>[0]["clock"] }) {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/api/advent", createAdventRouter({
    store: emptyStore, bank: [], christmas: [],
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
  return { round, status, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("a korlátok egy helyen állnak, és a szabályos legrosszabb eset (144 írás) belefér az alanyonkénti keretbe", () => {
  assert.deepEqual(ADVENT_LIMITS, {
    subjectWrites: { limit: 200, windowMs: 900_000 },
    ipWrites: { limit: 1500, windowMs: 900_000 },
    ipReads: { limit: 120, windowMs: 60_000 },
    newDeviceRows: { limit: 90, windowMs: 3_600_000 },
  });
  assert.ok(ADVENT_LIMITS.subjectWrites.limit >= 24 * 3 * 2);
  assert.ok(ADVENT_LIMITS.ipWrites.limit > ADVENT_LIMITS.subjectWrites.limit);
  // Iskolai méret (tulajdonosi döntés 2026-11-18): három 30 fős osztály egy órán belül, egy osztály 15 nyitható ablakkal pótolva.
  assert.ok(ADVENT_LIMITS.newDeviceRows.limit >= 3 * 30);
  assert.ok(ADVENT_LIMITS.ipWrites.limit >= 30 * (1 + 2 * 15));
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
