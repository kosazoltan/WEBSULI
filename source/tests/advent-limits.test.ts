import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";

import { adventClock } from "../server/advent/clock";
import { ADVENT_LIMITS, ADVENT_ROUND_WORST, ADVENT_SCHOOL_KIDS, ADVENT_WRITES_PER_KID, createWindowCounter, type AdventLimits } from "../server/advent/limits";
import { createAdoptionContext, doorRank, mergeAdoption, orderKeyFor, withPlanMeta, type AdoptionContext } from "../server/advent/adoption";
import { adventRowIsSound, createAdventRouter } from "../server/advent/routes";
import { buildAdventPlan, findAdventItem, normalizePrompt } from "../shared/advent/assignment";
import { CHRISTMAS_ITEMS } from "../shared/advent/christmasBank/index";
import { GRADE_QUIZ_ITEMS } from "../client/src/data/gradeQuizBank/index";
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
    ipConflicts: { limit: 720, windowMs: 60_000 },
  });
  // Elutasított (409) kérés: 120 gyerek × 3 szabályos 409 / perc (lejárt link, elavult kérdés, „előbb nyisd ki”) × 2 tartalék (vak ellenőr 3. kör KICSI-B).
  assert.equal(ADVENT_LIMITS.ipConflicts.limit, ADVENT_SCHOOL_KIDS * 3 * 2);
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
  // Mutációs ellenpróba a számlálón UGYANAZZAL a 90-es kerettel (GPT-vak 3. kör L6): a régi rend (előbb kérdez, a várakozás UTÁN
  // számol) túllépi a keretet, a foglalás (egy lépésben ellenőriz és rögzít) pontosan 90-et enged át.
  const rule = { limit: 90, windowMs: 3_600_000 };
  const naive = createWindowCounter(rule);
  const passed = await Promise.all(Array.from({ length: 120 }, async () => { if (naive.full("ip")) return false; await tick(); naive.hit("ip"); return true; }));
  assert.ok(passed.filter(Boolean).length > rule.limit, "a régi rend túllépi a 90-es keretet — ezt zárja ki a foglalás");
  const reserving = createWindowCounter(rule);
  const reserved = await Promise.all(Array.from({ length: 120 }, async () => { const ticket = reserving.reserve("ip"); await tick(); return ticket !== null; }));
  assert.equal(reserved.filter(Boolean).length, rule.limit, "a foglalás pontosan a keretet engedi át");

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
  // Az elutasított (409) kérésnek saját kerete van (vak ellenőr KICSI-4, 3. kör KICSI-B) — itt azt kitágítjuk, hogy az alanyi keret határát mérjük.
  const app = await serve({ limits: { ...ADVENT_LIMITS, ipConflicts: { limit: 100_000, windowMs: 60_000 } } });
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

test("névtelen → párosított: ABLAKONKÉNTI egyesítés — megoldott > érintetlen / még javítható > végleg elbukott; csak az eszköz AKTUÁLIS köre; semmi nem vész el a tanuló sorából (tulajdonosi döntés 2026-11-19; vak ellenőr 3. kör KÖZEPES-A; terv 21.)", () => {
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
  const FAILED = [false, false, false]; // 2 javítás után végleg elbukott
  // A rang: végleg elbukott (0) < érintetlen vagy még javítható (1) < megoldott (2).
  assert.deepEqual([doorRank(undefined, 2), doorRank({ attempts: [attempt("q", false)] }, 2), doorRank({ attempts: FAILED.map((c) => attempt("q", c)) }, 2), doorRank({ attempts: [attempt("q", false), attempt("r", true)] }, 2)], [1, 1, 0, 2]);
  // Válasz nélküli eszköz-sor: nincs mit átvinni.
  assert.equal(mergeAdoption(null, row("device", 1, {}), ctx), null);
  // Nincs tanulói sor: új sor a tanuló PROFILJÁNAK évfolyamára (3., nem a vendég 5.-e); a megoldott ablak saját magjával átkerül, a vendég
  // még javítható (rontott) próbája NEM (az érintetlen ablak legalább ugyanolyan jó).
  const fresh = mergeAdoption(null, row("device", 1, { 1: [true], 2: [false] }), ctx)!;
  assert.equal(fresh.grade, 3, "a vendég évfolyama nem írja felül a profilt (vak ellenőr KICSI-6)");
  assert.deepEqual(Object.keys(fresh.doors[1]!).sort(), ["1"]);
  assert.deepEqual(fresh.plan[1]!.doors[1], ["device-q1"]);
  assert.deepEqual(fresh.plan[1]!.doors[2], ["new-q2"], "a rontott vendég-ablak a tanuló saját tervéből");
  assert.equal(orderKeyFor(fresh.plan[1], 1, "x"), "device:seed", "az átvett ablak a vendég sorrendjével jelölődik (vak ellenőr K1)");
  assert.equal(orderKeyFor(fresh.plan[1], 3, "x"), "learner:L");
  // Van tanulói sor (2. kör, levél-foglalással, megfeleléssel): körszám, korábbi kör, foglalás, megfelelés MARAD (vak ellenőr K2).
  // 1: tanuló megoldotta → marad; 2: tanuló rontott (javítható), vendég megoldotta → vendégé; 3: csak a vendég rontott → NEM kerül át;
  // 4: mindkettő rontott → tanulóé; 5: tanuló végleg elbukott, vendég még javítható → a tanulóé marad (orkesztrátori döntés 2026-11-19); 6: tanuló érintetlen, vendég végleg
  // elbukott → érintetlen marad (V5: más gyerek kudarca nem rontja a gyerekét); 7: tanuló végleg elbukott, vendég érintetlen → a
  // tanuló saját kudarca marad (az érintetlen eszköz-ablak nem töröl).
  const learner = row("learner", 2, { 1: [true], 2: [false], 4: [false], 5: FAILED, 7: FAILED }, { mailedTo: ["1:final:abc"], passedAt: new Date("2026-12-04T10:00:00Z"), grade: 6 });
  learner.doors[1] = { 1: { attempts: [attempt("old-q1", false)] } };
  learner.plan[1] = { round: 1, layout: [], doors: {}, subjects: {} } as never;
  const merged = mergeAdoption(learner, row("device", 1, { 1: [false], 2: [true], 3: [false], 4: [false], 5: [false], 6: FAILED }), ctx)!;
  assert.equal(merged.round, 2);
  assert.deepEqual(merged.mailedTo, ["1:final:abc"]);
  assert.equal(merged.passedAt?.toISOString(), "2026-12-04T10:00:00.000Z");
  assert.equal(merged.grade, 6, "a tanuló rögzített évfolyama marad");
  assert.deepEqual(merged.doors[1], learner.doors[1], "a korábbi kör érintetlen");
  const now = merged.doors[2]!;
  assert.equal(now[1]!.attempts[0]!.questionId, "learner-q1");
  assert.equal(now[2]!.attempts[0]!.questionId, "device-q2");
  assert.equal(now[3], undefined, "a vendég rontott próbája nem jobb az érintetlen ablaknál");
  assert.equal(now[4]!.attempts[0]!.questionId, "learner-q4");
  assert.deepEqual([now[5]!.attempts.length, now[5]!.attempts[0]!.questionId], [3, "learner-q5"], "a tanuló végleg elbukott ablakát csak MEGOLDOTT ablak írhatja felül — a vendég javítható próbája nem (nincs „visszaállítás”)");
  assert.deepEqual(merged.plan[2]!.doors[5], ["learner-q5"]);
  assert.equal(now[6], undefined, "a vendég végleges kudarca nem kerül a gyerek érintetlen ablakába (V5)");
  assert.equal(now[7]!.attempts.length, 3, "a tanuló saját kudarcát az érintetlen eszköz-ablak nem törli");
  assert.deepEqual(merged.plan[2]!.doors[2], ["device-q2"]);
  assert.deepEqual(merged.plan[2]!.doors[4], ["learner-q4"]);
  // Csak az eszköz AKTUÁLIS köre egyesül (vak ellenőr 3. kör, Forgatókönyv 2): az eszköz 1. körének 24 végleges kudarca nem kerül a
  // tanuló friss 2. körébe; az eszköz korábbi körének megoldott ablaka sem (más kör kérdéssora).
  const oldFails = row("device", 2, { 6: [true] });
  oldFails.doors[1] = Object.fromEntries(Array.from({ length: 24 }, (_, i) => [i + 1, { attempts: FAILED.map((c) => attempt("dev-r1-q" + (i + 1), c)) }]));
  oldFails.doors[1]![7] = { attempts: [attempt("dev-r1-q7", true)] };
  const fresh2 = row("learner", 2, { 1: [true] });
  const mergedRounds = mergeAdoption(fresh2, oldFails, ctx)!;
  assert.deepEqual(Object.keys(mergedRounds.doors[2]!).sort(), ["1", "6"], "csak a tanuló saját ablaka és az eszköz aktuális körének megoldása");
  assert.equal(mergedRounds.doors[1], undefined, "az eszköz korábbi köre nem kerül a tanulóhoz");
  // Megnyitott, még meg nem válaszolt ablak (0–0): azonos évfolyamnál a vendég kérdéssora és magja marad — a gyereknek mutatott kérdésre
  // érkező válasz így nem 409; eltérő évfolyamnál a tanuló saját terve.
  const sameGrade = mergeAdoption(null, row("device", 1, { 1: [true] }, { grade: 3 }), ctx)!;
  assert.deepEqual(sameGrade.plan[1]!.doors[2], ["device-q2"]);
  assert.equal(orderKeyFor(sameGrade.plan[1], 2, "x"), "device:seed");
  assert.deepEqual(fresh.plan[1]!.doors[5], ["new-q5"], "eltérő évfolyam (vendég 5., profil 3.): a tanuló saját terve");
});

test("az elutasított (409) kérésnek saját, iskolai méretű kerete van: egy osztálynyi szabályos 409 (2 / gyerek) átmegy, a visszaélés 720 után 429 (vak ellenőr KICSI-4, 3. kör KICSI-B)", async () => {
  const wave = async (app: Awaited<ReturnType<typeof serve>>, from: number, count: number, ip: string) => {
    const statuses: number[] = [];
    for (let at = from; at < from + count; at += 50) statuses.push(...(await Promise.all(Array.from({ length: Math.min(50, from + count - at) }, (_, i) => app.round("cccccccc-0000-4000-8000-" + String(at + i).padStart(12, "0"), ip).then((r) => r.status)))));
    return statuses;
  };
  const app = await serve({});
  try {
    // Szabályos osztályforgalom egy iskolai címről: 120 gyerek × 2 elutasított kérés egy percen belül — egy sem kap 429-et.
    const legit = await wave(app, 0, 240, "10.30.0.1");
    assert.deepEqual([legit.filter((c) => c === 409).length, legit.filter((c) => c === 429).length], [240, 0]);
    // Visszaélés: összesen 800 elutasított kérés → 720 után 429.
    const abuse = await wave(app, 240, 560, "10.30.0.1");
    assert.deepEqual([abuse.filter((c) => c === 409).length, abuse.filter((c) => c === 429).length], [480, 80]);
    // Másik cím szabályos (itt is 409-es) kérése nem érintett.
    assert.equal((await app.round(A, "10.30.0.2")).status, 409);
  } finally { await app.close(); }
});

test("egyesítés után a tanuló aktuális körében nincs ismétlődő kérdés (azonosító és normalizált szöveg) — két, eredetileg egyedi tervben közös kérdéssel; a megválaszolt kérdések védettek (GPT-vak L3)", () => {
  const season = 2026; const grade = 1;
  const learnerKey = "learner:L"; const deviceKey = "device:D";
  const learnerPlan = withPlanMeta(buildAdventPlan({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, grade, season, round: 1, subjectKey: learnerKey }), grade, learnerKey);
  const devicePlan = withPlanMeta(buildAdventPlan({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, grade, season, round: 1, subjectKey: deviceKey }), grade, deviceKey);
  // Egy közös kérdés: a tanuló A. ablakának első kérdése a vendég B. ablakában is szerepel (A ≠ B).
  let common: { a: number; b: number; id: string } | null = null;
  for (let a = 1; a <= 24 && !common; a++) for (let b = 1; b <= 24 && !common; b++) {
    if (a !== b && devicePlan.doors[b]!.includes(learnerPlan.doors[a]![0]!)) common = { a, b, id: learnerPlan.doors[a]![0]! };
  }
  assert.ok(common, "a két terv közös kérdést tartalmaz");
  const solvedDevice = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24].find((d) => d !== common!.a && d !== common!.b)!;
  const attempt = (questionId: string) => ({ questionId, pick: 0, correct: true, at: "" });
  const row = (kind: "learner" | "device", plan: typeof learnerPlan, solvedDay: number): AdventRow => ({
    id: kind, season, subjectKind: kind, subjectId: kind, grade, round: 1, plan: { 1: plan },
    doors: { 1: { [solvedDay]: { attempts: [attempt(plan.doors[solvedDay]![0]!)] } } },
    finishedAt: null, passedAt: null, mailedTo: [], createdAt: new Date(0), updatedAt: new Date(0),
  });
  // A tanuló a közös kérdést (A. ablak) megválaszolta; a vendég egy harmadik ablakot oldott meg, a B. ablaka érintetlen (azonos évfolyam →
  // a vendég kérdéssora maradna, benne a közös kérdéssel).
  const ctx = createAdoptionContext({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, season, learnerId: "L", learnerGrade: grade, deviceId: "D", now: new Date("2026-12-22T10:00:00Z") });
  const merged = mergeAdoption(row("learner", learnerPlan, common!.a), row("device", devicePlan, solvedDevice), ctx)!;
  const plan = merged.plan[1]!;
  const ids = Object.values(plan.doors).flat();
  assert.equal(new Set(ids).size, ids.length, "nincs ismétlődő azonosító");
  const prompts = ids.map((id) => normalizePrompt(findAdventItem(id, GRADE_QUIZ_ITEMS, CHRISTMAS_ITEMS)!.prompt));
  assert.equal(new Set(prompts).size, prompts.length, "nincs ismétlődő (normalizált) kérdésszöveg");
  // A megválaszolt kérdések helye és azonosítója változatlan.
  assert.equal(plan.doors[common!.a]![0], common!.id);
  assert.equal(merged.doors[1]![common!.a]!.attempts[0]!.questionId, common!.id);
  assert.equal(plan.doors[solvedDevice]![0], devicePlan.doors[solvedDevice]![0]);
  // Determinisztikus: ugyanabból a bemenetből ugyanaz.
  assert.deepEqual(mergeAdoption(row("learner", learnerPlan, common!.a), row("device", devicePlan, solvedDevice), ctx)!.plan[1], plan);
});

test("a sorőr a próbák és a terv belső alakját is nézi: [null], hiányzó / rossz típusú mező, nem szöveg azonosító → sérült (GPT-vak L4)", () => {
  const base = { id: "x", season: 2026, subjectKind: "device" as const, subjectId: "d", grade: 5, round: 1, finishedAt: null, passedAt: null, mailedTo: [], createdAt: new Date(0), updatedAt: new Date(0) };
  const ok = { ...base, plan: { 1: { round: 1, layout: [1], doors: { 1: ["q1"] }, subjects: {} } }, doors: { 1: { 1: { attempts: [{ questionId: "q1", pick: 0, correct: true, at: "" }] } } } } as unknown as AdventRow;
  assert.equal(adventRowIsSound(ok), true);
  const bad = (doors: unknown, plan: unknown = ok.plan) => adventRowIsSound({ ...ok, doors, plan } as unknown as AdventRow);
  assert.equal(bad({ 1: { 1: { attempts: [null] } } }), false);
  assert.equal(bad({ 1: { 1: { attempts: [{ questionId: "q1" }] } } }), false);
  assert.equal(bad({ 1: { 1: { attempts: [{ questionId: 5, pick: 0, correct: true, at: "" }] } } }), false);
  assert.equal(bad({ 1: { 1: { attempts: [{ questionId: "q1", pick: "0", correct: true, at: "" }] } } }), false);
  assert.equal(bad({ 1: { 1: { attempts: [{ questionId: "q1", pick: 0, correct: "igen", at: "" }] } } }), false);
  assert.equal(bad(ok.doors, { 1: { round: 1, layout: [1], doors: { 1: [null] }, subjects: {} } }), false);
});

test("két MEGVÁLASZOLT példány ugyanabból a kérdésből (tanuló az A., vendég a B. ablakban): mindkét megoldás megmarad, de a játszható terv egyedi, és nem tartalmaz korábbi körös kérdést (GPT-vak 3. kör L2)", () => {
  const season = 2026; const grade = 1;
  const learnerKey = "learner:L"; const deviceKey = "device:D";
  const learnerPlan = withPlanMeta(buildAdventPlan({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, grade, season, round: 1, subjectKey: learnerKey }), grade, learnerKey);
  const devicePlan = withPlanMeta(buildAdventPlan({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, grade, season, round: 1, subjectKey: deviceKey }), grade, deviceKey);
  // Közös kérdés: a tanuló A. ablakának ELSŐ kérdése a vendég B. ablakának ELSŐ kérdése is (mindkettő megválaszolt lesz).
  let pair: { a: number; b: number; id: string } | null = null;
  for (let a = 1; a <= 24 && !pair; a++) for (let b = 1; b <= 24 && !pair; b++) {
    if (a !== b && devicePlan.doors[b]![0] === learnerPlan.doors[a]![0]) pair = { a, b, id: learnerPlan.doors[a]![0]! };
  }
  if (!pair) {
    // Ha a véletlen terv nem ad ilyen párt, a vendég B. ablakának első helyére tesszük a tanuló A. kérdését (a többi a valódi terv).
    const a = 1; const b = 2;
    devicePlan.doors[b] = [learnerPlan.doors[a]![0]!, ...devicePlan.doors[b]!.slice(1)];
    pair = { a, b, id: learnerPlan.doors[a]![0]! };
  }
  const solved = (id: string) => ({ attempts: [{ questionId: id, pick: 0, correct: true, at: "" }] });
  const learnerRow: AdventRow = { id: "l", season, subjectKind: "learner", subjectId: "L", grade, round: 1, plan: { 1: learnerPlan }, doors: { 1: { [pair.a]: solved(pair.id) } }, finishedAt: null, passedAt: null, mailedTo: [], createdAt: new Date(0), updatedAt: new Date(0) };
  const deviceRow: AdventRow = { ...learnerRow, id: "d", subjectKind: "device", subjectId: "D", plan: { 1: devicePlan }, doors: { 1: { [pair.b]: solved(pair.id) } } };
  const ctx = createAdoptionContext({ bank: GRADE_QUIZ_ITEMS, christmas: CHRISTMAS_ITEMS, season, learnerId: "L", learnerGrade: grade, deviceId: "D", now: new Date("2026-12-22T10:00:00Z") });
  const merged = mergeAdoption(learnerRow, deviceRow, ctx)!;
  // Mindkét megoldott állapot és a hozzá tartozó (történeti) kérdés megmarad.
  assert.equal(merged.doors[1]![pair.a]!.attempts[0]!.questionId, pair.id);
  assert.equal(merged.doors[1]![pair.b]!.attempts[0]!.questionId, pair.id);
  // A terv egyedi: azonosító és normalizált szöveg szerint is legfeljebb egyszer szerepel minden kérdés.
  const ids = Object.values(merged.plan[1]!.doors).flat();
  assert.equal(new Set(ids).size, ids.length, "a terv azonosítói egyediek");
  const prompts = ids.map((id) => normalizePrompt(findAdventItem(id, GRADE_QUIZ_ITEMS, CHRISTMAS_ITEMS)!.prompt));
  assert.equal(new Set(prompts).size, prompts.length, "a terv kérdésszövegei egyediek");

  // Korábbi körrel való egyezés: a tanuló 2. körében a játszható helyek nem tartalmazzák az 1. kör kérdéseit.
  const round2Learner: AdventRow = { ...learnerRow, round: 2, plan: { 1: learnerPlan }, doors: { 1: { [pair.a]: solved(pair.id) } } };
  const round1Ids = new Set(Object.values(learnerPlan.doors).flat());
  const leaking: typeof devicePlan = { ...devicePlan, doors: { ...devicePlan.doors, 5: [learnerPlan.doors[7]![0]!, ...devicePlan.doors[5]!.slice(1)] } };
  const device2: AdventRow = { ...deviceRow, plan: { 1: leaking }, doors: { 1: { 3: solved(leaking.doors[3]![0]!) } } };
  const merged2 = mergeAdoption(round2Learner, device2, ctx)!;
  const played = merged2.doors[2] ?? {};
  for (const [day, ids2] of Object.entries(merged2.plan[2]!.doors)) {
    const historical = new Set((played[Number(day)]?.attempts ?? []).map((t) => t.questionId));
    for (const id of ids2) if (!historical.has(id)) assert.ok(!round1Ids.has(id), `a ${day}. ablak játszható helyén korábbi körös kérdés: ${id}`);
  }
});

test("a sorőr a terv subjects mezőjét is megköveteli (objektum, szöveges értékekkel) — hiányában 409 corrupt, nem kivétel (GPT-vak 3. kör L4)", () => {
  const base = { id: "x", season: 2026, subjectKind: "device" as const, subjectId: "d", grade: 5, round: 1, finishedAt: null, passedAt: null, mailedTo: [], createdAt: new Date(0), updatedAt: new Date(0) };
  const doors = { 1: { 1: { attempts: [{ questionId: "q1", pick: 0, correct: true, at: "" }] } } };
  const withPlan = (plan: unknown) => adventRowIsSound({ ...base, plan: { 1: plan }, doors } as unknown as AdventRow);
  assert.equal(withPlan({ round: 1, layout: [1], doors: { 1: ["q1"] }, subjects: { 1: "matek" } }), true);
  assert.equal(withPlan({ round: 1, layout: [1], doors: { 1: ["q1"] } }), false, "hiányzó subjects");
  assert.equal(withPlan({ round: 1, layout: [1], doors: { 1: ["q1"] }, subjects: [] }), false, "tömb subjects");
  assert.equal(withPlan({ round: 1, layout: [1], doors: { 1: ["q1"] }, subjects: { 1: 5 } }), false, "nem szöveges tárgy");
});
