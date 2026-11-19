import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";

import { adventClock } from "../server/advent/clock";
import { ADVENT_LIMITS, ADVENT_ROUND_WORST, ADVENT_SCHOOL_KIDS, ADVENT_WRITES_PER_KID, createWindowCounter, type AdventLimits } from "../server/advent/limits";
import { createAdventRouter } from "../server/advent/routes";
import { doorScore, mergeAdoption, orderKeyFor, type AdoptionContext } from "../server/advent/adoption";
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
  app.use((req, _res, next) => {
    const id = req.get("x-test-session");
    if (id) Object.assign(req, { session: {}, sessionID: id });
    next();
  });
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
  const post = async (path: string, device: string, ip: string, data: Record<string, unknown> = {}, session?: string) => {
    const res = await fetch(`${base}/api/advent${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip, ...(session ? { "x-test-session": session } : {}) }, body: JSON.stringify({ device, ...data }) });
    return { status: res.status, body: (await res.json()) as { limit?: string }, retryAfter: res.headers.get("retry-after") };
  };
  /** Nyers (akár érvénytelen) törzs. */
  const raw = async (path: string, ip: string, body: string) => (await fetch(`${base}/api/advent${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body })).status;
  const state = async (ip: string) => (await fetch(`${base}/api/advent/state`, { headers: { "x-forwarded-for": ip, "x-advent-device": A } })).status;
  return { round, status, post, raw, state, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("a korlátok egy helyen állnak, és iskolai legrosszabb esetre méretezettek: 4 osztály teljes december 24-i pótlása, két teljes kör egy alanynál (vak ellenőr K2, k2)", () => {
  assert.deepEqual(ADVENT_LIMITS, {
    subjectWrites: { limit: 290, windowMs: 900_000 },
    ipWrites: { limit: 14_160, windowMs: 900_000 },
    ipReads: { limit: 1200, windowMs: 60_000 },
    newDeviceRows: { limit: 240, windowMs: 3_600_000 },
    sessionNewRows: { limit: 3, windowMs: 3_600_000 },
    ipInvalid: { limit: 120, windowMs: 60_000 },
  });
  // A képlet: 120 gyerek × (évfolyam + 24 × (megnyitás + válasz) + 5 javítás × 2) × 2 tartalék.
  assert.equal(ADVENT_SCHOOL_KIDS, 120);
  assert.equal(ADVENT_WRITES_PER_KID, 59);
  assert.equal(ADVENT_LIMITS.ipWrites.limit, ADVENT_SCHOOL_KIDS * ADVENT_WRITES_PER_KID * 2);
  // Egy alany két teljes kört végigjátszhat (2 × 144 + évfolyam + új kör) — a 2. kör 10. ablakánál sem fogy el.
  assert.equal(ADVENT_ROUND_WORST, 144);
  assert.ok(ADVENT_LIMITS.subjectWrites.limit >= 2 * ADVENT_ROUND_WORST + 2);
  // Az ellenőr pótlási esete: 90 gyerek december 14-én, hibátlanul (1 + 14 × 2 = 29 írás) — 2610 írás bőven belefér.
  assert.ok(ADVENT_LIMITS.ipWrites.limit >= 90 * 29 * 2);
  assert.ok(ADVENT_LIMITS.newDeviceRows.limit >= 8 * 30);
  assert.ok(ADVENT_LIMITS.sessionNewRows.limit < ADVENT_LIMITS.newDeviceRows.limit / 10, "egy kliens a hálózat új-sor keretének töredékét fogyaszthatja");
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

test("új névtelen sor kerete PÁRHUZAMOS kérésekkel sem léphető túl: 120 egyidejű létrehozás egy címről, 90-es kerettel → pontosan 90 sor (review U1)", async () => {
  // Mutációs ellenpróba a számlálón: a régi rend (előbb kérdez, a várakozás UTÁN számol) mind a 120-at átengedi.
  const naive = createWindowCounter(ADVENT_LIMITS.newDeviceRows);
  const passed = await Promise.all(Array.from({ length: 120 }, async () => { if (naive.full("ip")) return false; await tick(); naive.hit("ip"); return true; }));
  assert.equal(passed.filter(Boolean).length, 120, "a régi rend túllépi a keretet — ezt zárja ki a foglalás");

  const memory = memoryStore();
  const app = await serve({ store: memory.store, limits: { ...ADVENT_LIMITS, newDeviceRows: { limit: 90, windowMs: 3_600_000 } } });
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

test("olvasási keret: a hálózat kerete utáni állapot-olvasás 429, másik hálózat nem érintett; az alapérték 1200 / perc (vak ellenőr K2)", async () => {
  const limits: AdventLimits = { ...ADVENT_LIMITS, ipReads: { limit: 3, windowMs: 60_000 } };
  const app = await serve({ limits });
  try {
    for (let i = 1; i <= 3; i++) assert.equal(await app.state("10.7.0.1"), 200, i + ". olvasás a keretben");
    assert.equal(await app.state("10.7.0.1"), 429);
    assert.equal(await app.state("10.7.0.2"), 200, "másik hálózat kerete független");
    // Az olvasás nem fogyasztja az írási keretet.
    assert.equal((await app.round(A, "10.7.0.1")).status, 409);
  } finally { await app.close(); }
  // Alapértékkel: 1200 olvasás egy címről mind átmegy, az 1201. nem.
  const real = await serve({});
  try {
    const statuses: number[] = [];
    // 24 × 50-es hullám: a helyi szerver fogadósorát egyetlen nagy löket túltöltené.
    for (let wave = 0; wave < 24; wave++) statuses.push(...(await Promise.all(Array.from({ length: 50 }, () => real.state("10.7.1.1")))));
    assert.equal(statuses.length, 1200);
    assert.ok(statuses.every((code) => code === 200), "az első 1200 a keretben");
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

test("IP-korlát: csak a SIKERES írás számít; a keret utáni kérés 429 (limit: ip) Retry-After-rel, más hálózatról ugyanaz az alany mehet (review C1, vak ellenőr K1)", async () => {
  const limits: AdventLimits = { ...ADVENT_LIMITS, subjectWrites: { limit: 100, windowMs: 60_000 }, ipWrites: { limit: 4, windowMs: 60_000 } };
  const memory = memoryStore();
  const app = await serve({ limits, store: memory.store });
  try {
    // Elutasított írások (409: nincs mit új körre váltani) — ezek NEM fogyasztják a hálózat keretét.
    for (let i = 0; i < 10; i++) assert.equal((await app.round(A, "10.2.0.1")).status, 409);
    for (const device of [A, B, A, B]) assert.equal((await app.post("/grade", device, "10.2.0.1", { grade: 5 })).status, 200);
    const blocked = await app.post("/grade", A, "10.2.0.1", { grade: 5 });
    assert.deepEqual({ status: blocked.status, limit: blocked.body.limit }, { status: 429, limit: "ip" });
    assert.ok(Number(blocked.retryAfter) > 0, "Retry-After a 429-en");
    assert.equal((await app.post("/grade", B, "10.2.0.1", { grade: 5 })).status, 429, "a hálózat minden alanya áll");
    assert.equal((await app.post("/grade", A, "10.2.0.9", { grade: 5 })).status, 200, "másik hálózatról megy");
  } finally { await app.close(); }
});

test("az alapértelmezett alanyi kerettel a 291. írás 429 (alany), előtte egy sem — két teljes kör belefér (A49 felső határa, vak ellenőr k2)", async () => {
  // Az elutasított (409) kérés az érvénytelen-keretbe is számít (vak ellenőr KICSI-4) — itt azt kitágítjuk, hogy az alanyi keret határát mérjük.
  const app = await serve({ limits: { ...ADVENT_LIMITS, ipInvalid: { limit: 100_000, windowMs: 60_000 } } });
  try {
    const statuses: number[] = [];
    for (let i = 0; i < 291; i++) statuses.push((await app.round(A, "10.3.0.1")).status);
    assert.ok(statuses.slice(0, 290).every((code) => code === 409), "az első 290 a keretben");
    assert.equal(statuses[290], 429);
  } finally { await app.close(); }
});

test("a vak ellenőr három támadása után ugyanarról a címről egy másik, szabályos gyerek új naptárat kezdhet és írhat (vak ellenőr K1)", async () => {
  const memory = memoryStore();
  const app = await serve({ store: memory.store });
  const school = "10.20.0.1";
  const kid = (i: number) => "aaaaaaaa-0000-4000-8000-" + String(i).padStart(12, "0");
  try {
    // 1) 1500 érvénytelen törzsű írás (50-es hullámokban): egyik sem fogyasztja a hálózat írási keretét. 120 után az ÉRVÉNYTELEN
    //    kérés 429 (limit: invalid) — de csak az.
    const statuses: number[] = [];
    for (let wave = 0; wave < 30; wave++) statuses.push(...(await Promise.all(Array.from({ length: 50 }, () => app.raw("/grade", school, "[]")))));
    assert.equal(statuses.filter((code) => code === 400).length, 120);
    assert.equal(statuses.filter((code) => code === 429).length, 1380);
    // 2) 405 állapot-olvasás.
    for (let wave = 0; wave < 9; wave++) await Promise.all(Array.from({ length: 45 }, () => app.state(school)));
    // 3) Egy munkamenetből 95 új eszköz: a 4.-től a munkamenet kerete fog (Retry-After-rel), a hálózaté nem fogy el.
    const attacker: Array<{ status: number; limit?: string; retryAfter: string | null }> = [];
    for (let i = 0; i < 95; i++) { const r = await app.post("/grade", kid(i), school, { grade: 5 }, "tamado-munkamenet"); attacker.push({ status: r.status, limit: r.body.limit, retryAfter: r.retryAfter }); }
    assert.equal(attacker.filter((r) => r.status === 200).length, 3, "egy munkamenet 3 új naptárat kezdhet");
    assert.ok(attacker.slice(3).every((r) => r.status === 429 && r.limit === "new-row-session" && Number(r.retryAfter) > 0), JSON.stringify(attacker[3]));
    // Az osztálytárs (másik munkamenet, ugyanaz a cím): állapotot olvas, új naptárat kezd, és ír.
    assert.equal(await app.state(school), 200);
    const victim = await app.post("/grade", kid(1000), school, { grade: 3 }, "osztalytars");
    assert.equal(victim.status, 200, JSON.stringify(victim.body));
    assert.equal((await app.post("/grade", kid(1000), school, { grade: 4 }, "osztalytars")).status, 200, "a meglévő naptárába is ír");
    // Szabályos kérés az érvénytelen-keret betelte után sem kap 429-et.
    assert.equal((await app.post("/grade", kid(1001), school, { grade: 2 }, "masik-osztalytars")).status, 200);
  } finally { await app.close(); }
});

test("a hálózat új-sor keretének 429-e is Retry-After-t küld (vak ellenőr K1)", async () => {
  const memory = memoryStore();
  const app = await serve({ store: memory.store, limits: { ...ADVENT_LIMITS, newDeviceRows: { limit: 2, windowMs: 3_600_000 } } });
  try {
    assert.equal((await app.post("/grade", "bbbbbbbb-0000-4000-8000-000000000001", "10.21.0.1", { grade: 5 }, "s1")).status, 200);
    assert.equal((await app.post("/grade", "bbbbbbbb-0000-4000-8000-000000000002", "10.21.0.1", { grade: 5 }, "s2")).status, 200);
    const third = await app.post("/grade", "bbbbbbbb-0000-4000-8000-000000000003", "10.21.0.1", { grade: 5 }, "s3");
    assert.deepEqual({ status: third.status, limit: third.body.limit }, { status: 429, limit: "new-row" });
    const wait = Number(third.retryAfter);
    assert.ok(wait > 3500 && wait <= 3600, "Retry-After: " + third.retryAfter);
    // A munkamenet foglalása visszajár, ha a hálózat kerete fogott: ugyanez a munkamenet később (más hálózatról) kezdhet.
    assert.equal((await app.post("/grade", "bbbbbbbb-0000-4000-8000-000000000004", "10.21.0.9", { grade: 5 }, "s3")).status, 200);
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

test("névtelen → párosított: ABLAKONKÉNTI egyesítés — minden ablaknál a jobb eredmény marad, semmi nem vész el a tanuló sorából (tulajdonosi döntés 2026-11-19; terv 21.)", () => {
  const attempt = (questionId: string, correct: boolean) => ({ questionId, pick: 1, correct, at: "" });
  const row = (kind: "device" | "learner", round: number, doors: Record<number, boolean[]>, extra: Partial<AdventRow> = {}): AdventRow => ({
    id: kind, season: 2026, subjectKind: kind, subjectId: kind, grade: 5, round,
    plan: { [round]: { round, layout: [], doors: Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 1, [kind + "-q" + (i + 1)]])), subjects: {}, seedKey: kind + ":seed" } as never },
    doors: { [round]: Object.fromEntries(Object.entries(doors).map(([day, list]) => [day, { attempts: list.map((c) => attempt(kind + "-q" + day, c)) }])) },
    finishedAt: null, passedAt: null, mailedTo: [], createdAt: new Date(0), updatedAt: new Date(0), ...extra,
  });
  const ctx: AdoptionContext = {
    learnerId: "L", deviceKey: "device:D", learnerKey: "learner:L", learnerGrade: 3, maxRepairs: () => 2, now: new Date("2026-12-05T10:00:00Z"),
    buildPlan: (_row, round, grade) => ({ round, layout: [], doors: Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 1, ["new-q" + (i + 1)]])), subjects: {}, grade, seedKey: "learner:L" }) as never,
  };
  assert.deepEqual([doorScore(undefined), doorScore({ attempts: [attempt("q", false)] }), doorScore({ attempts: [attempt("q", false), attempt("r", true)] })], [0, 1, 2]);
  // Válasz nélküli eszköz-sor: nincs mit átvinni.
  assert.equal(mergeAdoption(null, row("device", 1, {}), ctx), null);
  // Nincs tanulói sor: új sor a tanuló PROFILJÁNAK évfolyamára (3., nem a vendég 5.-e), az eszköz ablakai átkerülnek, saját magjukkal.
  const fresh = mergeAdoption(null, row("device", 1, { 1: [true], 2: [false] }), ctx)!;
  assert.equal(fresh.grade, 3, "a vendég évfolyama nem írja felül a profilt (vak ellenőr KICSI-6)");
  assert.deepEqual(Object.keys(fresh.doors[1]!).sort(), ["1", "2"]);
  assert.deepEqual(fresh.plan[1]!.doors[1], ["device-q1"]);
  assert.deepEqual(fresh.plan[1]!.doors[3], ["new-q3"], "a többi ablak a tanuló saját tervéből");
  assert.equal(orderKeyFor(fresh.plan[1], 1, "x"), "device:seed", "az átvett ablak a vendég sorrendjével jelölődik (vak ellenőr K1)");
  assert.equal(orderKeyFor(fresh.plan[1], 3, "x"), "learner:L");
  // Van tanulói sor (2. kör, levél-foglalással, megfeleléssel): körszám, korábbi kör, foglalás, megfelelés MARAD (vak ellenőr K2);
  // ablakonként a jobb: 1. ablak tanuló megoldotta → marad; 2. ablak tanuló rontott, vendég megoldotta → vendégé; 3. ablak csak a
  // vendégnél → vendégé; 4. ablak egyenlő (mindkettő rontott) → tanulóé.
  const learner = row("learner", 2, { 1: [true], 2: [false], 4: [false] }, { mailedTo: ["1:final:abc"], passedAt: new Date("2026-12-04T10:00:00Z"), grade: 6 });
  learner.doors[1] = { 1: { attempts: [attempt("old-q1", false)] } };
  learner.plan[1] = { round: 1, layout: [], doors: {}, subjects: {} } as never;
  const merged = mergeAdoption(learner, row("device", 1, { 1: [false], 2: [true], 3: [false], 4: [false] }), ctx)!;
  assert.equal(merged.round, 2);
  assert.deepEqual(merged.mailedTo, ["1:final:abc"]);
  assert.equal(merged.passedAt?.toISOString(), "2026-12-04T10:00:00.000Z");
  assert.equal(merged.grade, 6, "a tanuló rögzített évfolyama marad");
  assert.deepEqual(merged.doors[1], learner.doors[1], "a korábbi kör érintetlen");
  assert.equal(merged.doors[2]![1]!.attempts[0]!.questionId, "learner-q1");
  assert.equal(merged.doors[2]![2]!.attempts[0]!.questionId, "device-q2");
  assert.equal(merged.doors[2]![3]!.attempts[0]!.questionId, "device-q3");
  assert.equal(merged.doors[2]![4]!.attempts[0]!.questionId, "learner-q4");
  assert.deepEqual(merged.plan[2]!.doors[2], ["device-q2"]);
  assert.deepEqual(merged.plan[2]!.doors[4], ["learner-q4"]);
  // Az eszköz KORÁBBI köreinek jobb ablakai sem vesznek el: ablakonként az eszköz összes körének legjobbja számít (egyenlőségnél
  // az eszköz aktuális köre), a saját kérdéssorával és sorrend-magjával.
  const multi = row("device", 2, { 6: [false] });
  multi.doors[1] = { 6: { attempts: [attempt("dev-r1-q6", true)] }, 7: { attempts: [attempt("dev-r1-q7", false), attempt("dev-r1-q7", true)] } };
  multi.plan[1] = { round: 1, layout: [], doors: { 6: ["dev-r1-q6"], 7: ["dev-r1-q7"] }, subjects: {}, seedKey: "device:r1" } as never;
  const best = mergeAdoption(null, multi, ctx)!;
  assert.equal(best.doors[1]![6]!.attempts[0]!.questionId, "dev-r1-q6", "az 1. körben megoldott ablak, nem a 2. körben rontott");
  assert.equal(best.doors[1]![7]!.attempts.length, 2);
  assert.deepEqual(best.plan[1]!.doors[6], ["dev-r1-q6"]);
  assert.equal(orderKeyFor(best.plan[1], 6, "x"), "device:r1");
  // Megnyitott, még meg nem válaszolt ablak (0–0): azonos évfolyamnál a vendég kérdéssora és magja marad — a gyereknek mutatott kérdésre
  // érkező válasz így nem 409; eltérő évfolyamnál a tanuló saját terve.
  const sameGrade = mergeAdoption(null, row("device", 1, { 1: [true] }, { grade: 3 }), ctx)!;
  assert.deepEqual(sameGrade.plan[1]!.doors[2], ["device-q2"]);
  assert.equal(orderKeyFor(sameGrade.plan[1], 2, "x"), "device:seed");
  assert.deepEqual(fresh.plan[1]!.doors[2], ["device-q2"], "a 2. ablakot a vendég próbálta (1 > 0)");
  assert.deepEqual(fresh.plan[1]!.doors[5], ["new-q5"], "eltérő évfolyam (vendég 5., profil 3.): a tanuló saját terve");
});

test("az elutasított (409) kérés is a rövid ablakú érvénytelen-keretbe számít: egy címről 300 véletlen eszközzel → 120 után 429 (vak ellenőr KICSI-4)", async () => {
  const app = await serve({});
  try {
    const statuses: number[] = [];
    for (let wave = 0; wave < 6; wave++) statuses.push(...(await Promise.all(Array.from({ length: 50 }, (_, i) => app.round("cccccccc-0000-4000-8000-" + String(wave * 50 + i).padStart(12, "0"), "10.30.0.1").then((r) => r.status)))));
    assert.equal(statuses.filter((code) => code === 409).length, 120);
    assert.equal(statuses.filter((code) => code === 429).length, 180);
    // Másik cím szabályos (itt is 409-es) kérése nem érintett.
    assert.equal((await app.round(A, "10.30.0.2")).status, 409);
  } finally { await app.close(); }
});
