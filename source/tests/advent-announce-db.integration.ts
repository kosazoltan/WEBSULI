import { after, test } from "node:test";
import assert from "node:assert/strict";

// S8 (A37–A38) valódi Postgresen: a foglaló SQL (`ON CONFLICT … WHERE status = 'failed'`) — a száraz futás nem ír, kétszeri küldés
// nem dupláz, a hibás sor újrapróbálható. Guard BEFORE importing modules with a database connection. No production fallback.
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);
const { dbPool } = await import("../server/db");
const { announceAdvent } = await import("../server/advent/announce");

const SEASON_CLEANUP = "DELETE FROM advent_announcements WHERE season = 2091";
// A saját sorok törlődnek: az adventi adatmodell-tesztek (A24, E23) üres értesítő-táblát várnak.
after(async () => { await dbPool.query(SEASON_CLEANUP); await dbPool.end(); });

const SEASON = 2091;
const count = async (status?: string) => Number((await dbPool.query(
  `SELECT count(*)::int AS n FROM advent_announcements WHERE season = $1${status ? " AND status = $2" : ""}`, status ? [SEASON, status] : [SEASON])).rows[0].n);

test("száraz futás nem ír; az éles küldés címzettenként egy sort foglal, a második küldés nem dupláz; a hibás sor újrapróbálható", async () => {
  const sent: string[] = [];
  let failB = true;
  const deps = {
    db: dbPool, season: SEASON, baseUrl: "https://websuli.vip", secret: () => "teszt-titok",
    recipients: async () => ({ subscriptions: ["a@x.hu", "b@x.hu"], extras: ["c@x.hu", "A@x.hu"] }),
    send: async (to: string) => { if (failB && to === "b@x.hu") throw new Error("hálózat"); sent.push(to); },
  };
  await dbPool.query(SEASON_CLEANUP);
  const dry = await announceAdvent(deps, { dryRun: true });
  assert.ok(dry.status === 200 && dry.dryRun && dry.recipients === 3);
  assert.equal(await count(), 0);
  assert.equal((await announceAdvent(deps, { dryRun: false, confirmCount: 2 })).status, 409);
  assert.equal(await count(), 0);
  assert.deepEqual(await announceAdvent(deps, { dryRun: false, confirmCount: 3 }), { status: 200, dryRun: false, sent: 2, failed: 1, skipped: 0 });
  assert.equal(await count("sent"), 2); assert.equal(await count("failed"), 1);
  failB = false;
  assert.deepEqual(await announceAdvent(deps, { dryRun: false, confirmCount: 3 }), { status: 200, dryRun: false, sent: 1, failed: 0, skipped: 2 });
  assert.deepEqual(await announceAdvent(deps, { dryRun: false, confirmCount: 3 }), { status: 200, dryRun: false, sent: 0, failed: 0, skipped: 3 });
  assert.equal(await count("sent"), 3); assert.equal(await count(), 3);
  assert.deepEqual([...sent].sort(), ["a@x.hu", "b@x.hu", "c@x.hu"]);
  const hashes = (await dbPool.query("SELECT recipient_hash FROM advent_announcements WHERE season = $1", [SEASON])).rows.map((r) => String(r.recipient_hash));
  assert.ok(hashes.every((h) => /^[0-9a-f]{64}$/.test(h)), "csak kulcsolt lenyomat, cím nem");
});
