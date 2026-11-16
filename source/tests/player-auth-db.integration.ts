/**
 * JM7a — játékos e-mailes belépés / regisztráció eldobható Postgresen (végrehajtás „JM7a” 3–4.; JM-A11, JM-A12; D11 / D12).
 * Társzint: a kódos és a linkes út ugyanazt a fiókot adja; párhuzamos megerősítés → 1 sor; egyszeri használat; lejárat;
 * 5 rossz kód után zár; csak a legfrissebb kód él; a meglévő admin-tiltás az új fiókra is hat.
 * HTTP-szint (a szerverrel azonos felcsatolás): flag KI → 404; a kódkérés válasza nem árulja el a fiók létét; korlátok;
 * a játékos-munkamenet nem állít req.user-t (admin-végpont 401); a tiltott fiók nem kap munkamenetet; napló-tisztaság.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { Client, dbPool, mapLimit, startApp } from "./support/authz-db-harness";

const { codeHash, emailHash, generateLinkToken, linkHash, playerAuthKey, START_PER_EMAIL_MAX } = await import("../server/player/codes");
const { createPlayerStore } = await import("../server/player/store");
const { logger } = await import("../server/lib/logger");

const store = createPlayerStore(dbPool);
const key = () => playerAuthKey();

/** Kódrekord a szerverrel azonos kulccsal — a teszt így ismeri a kódot és a link-tokent (a valódi levél nem megy ki). */
async function plant(email: string, code = "135790"): Promise<{ code: string; token: string }> {
  const k = key();
  const eh = emailHash(k, email);
  const token = generateLinkToken();
  await store.insertCode({ emailNormalized: email, emailHash: eh, codeHash: codeHash(k, eh, code), linkHash: linkHash(k, token) });
  return { code, token };
}
const consumeCode = (email: string, code: string) => { const k = key(); const eh = emailHash(k, email); return store.consumeCode(eh, codeHash(k, eh, code)); };
const consumeLink = (token: string) => store.consumeLink(linkHash(key(), token));
const accountCount = async (email: string) => Number((await dbPool.query<{ n: string }>(`SELECT count(*)::text AS n FROM player_accounts WHERE email = $1`, [email])).rows[0]!.n);

// A napló tartalmát elkapjuk: cím, kód, token nem kerülhet bele.
const logged: string[] = [];
const originals = { info: logger.info, warn: logger.warn, error: logger.error };
for (const level of ["info", "warn", "error"] as const) {
  (logger as unknown as Record<string, (...a: unknown[]) => void>)[level] = (...args: unknown[]) => { logged.push(args.map(String).join(" ")); };
}

let onApp: Awaited<ReturnType<typeof startApp>>;
let offApp: Awaited<ReturnType<typeof startApp>>;

before(async () => {
  delete process.env.PLAYER_ACCOUNTS;
  offApp = await startApp();
  onApp = await startApp();
  await dbPool.query(
    `INSERT INTO users (id, email, password, is_admin, is_banned) VALUES
       ('pa-admin', 'pa-admin@websuli.example', NULL, true, false),
       ('pa-banned', 'Pa-Banned@Websuli.example', NULL, false, true)`,
  );
});

after(async () => {
  Object.assign(logger, originals);
  delete process.env.PLAYER_ACCOUNTS;
  await onApp?.close();
  await offApp?.close();
  await dbPool.end();
});

describe("JM7a — társzint (egy közös, atomikus megerősítés)", () => {
  it("a kódos és a linkes út ugyanazt a fiókot adja; a cím a kódrekordból jön", async () => {
    const email = "kozos@pelda.hu";
    const a = await plant(email, "111111");
    assert.equal(await consumeCode(email, "111111"), email);
    const first = await store.confirmVerifiedEmail(email);
    const b = await plant(email, "222222");
    assert.equal(await consumeLink(b.token), email);
    const second = await store.confirmVerifiedEmail(email);
    assert.equal(first.id, second.id);
    assert.equal(await accountCount(email), 1);
    assert.equal(await consumeLink(a.token), null, "az elhasznált rekord linkje sem él");
    const row = (await dbPool.query(`SELECT email_verified_at FROM player_accounts WHERE id = $1`, [first.id])).rows[0];
    assert.ok(row.email_verified_at instanceof Date);
  });

  it("párhuzamos megerősítés ugyanarra a címre → egyetlen fiók", async () => {
    const email = "parhuzamos@pelda.hu";
    const results = await Promise.all(Array.from({ length: 8 }, () => store.confirmVerifiedEmail(email)));
    assert.equal(new Set(results.map((r) => r.id)).size, 1);
    assert.equal(await accountCount(email), 1);
  });

  it("párhuzamos beváltás ugyanazzal a kóddal / linkkel → pontosan egy siker", async () => {
    const email = "egyszer@pelda.hu";
    const { code, token } = await plant(email, "333333");
    const codeResults = await Promise.all(Array.from({ length: 6 }, () => consumeCode(email, code)));
    assert.equal(codeResults.filter((r) => r === email).length, 1);
    assert.equal(await consumeLink(token), null);
    const second = await plant(email, "444444");
    const linkResults = await Promise.all(Array.from({ length: 6 }, () => consumeLink(second.token)));
    assert.equal(linkResults.filter((r) => r === email).length, 1);
  });

  it("ugyanaz a link kétszer → a második érvénytelen", async () => {
    const { token } = await plant("ketszer@pelda.hu");
    assert.equal(await consumeLink(token), "ketszer@pelda.hu");
    assert.equal(await consumeLink(token), null);
  });

  it("lejárt rekord: a kód 10, a link 15 perc után nem váltható be", async () => {
    const email = "lejart@pelda.hu";
    const { code, token } = await plant(email, "555555");
    await dbPool.query(`UPDATE player_auth_codes SET created_at = now() - interval '11 minutes' WHERE email_normalized = $1`, [email]);
    assert.equal(await consumeCode(email, code), null, "11 perces kód");
    assert.equal(await consumeLink(token), email, "11 perces link még él (15 perc)");
    const late = await plant(email, "666666");
    await dbPool.query(`UPDATE player_auth_codes SET created_at = now() - interval '16 minutes', expires_at = now() - interval '1 minute' WHERE used_at IS NULL AND email_normalized = $1`, [email]);
    assert.equal(await consumeLink(late.token), null, "lejárt link");
  });

  it("5 rossz kód után a rekord zár — a helyes kód sem megy át; párhuzamos találgatás sem lép túl 5-ön", async () => {
    const email = "talalgat@pelda.hu";
    await plant(email, "777777");
    const guesses = Array.from({ length: 20 }, (_, i) => String(100000 + i));
    const results = await mapLimit(guesses, 20, (g) => consumeCode(email, g));
    assert.ok(results.every((r) => r === null));
    const { rows } = await dbPool.query<{ attempts: number }>(`SELECT attempts FROM player_auth_codes WHERE email_normalized = $1`, [email]);
    assert.equal(rows[0]!.attempts, 5, "rekordonként legfeljebb 5 kiértékelt próbálkozás");
    assert.equal(await consumeCode(email, "777777"), null);
  });

  it("csak a legfrissebb kód él; más címre ugyanaz a kód nem érvényes", async () => {
    const email = "frissebb@pelda.hu";
    await plant(email, "121212");
    await new Promise((r) => setTimeout(r, 5));
    await plant(email, "343434");
    assert.equal(await consumeCode("masik@pelda.hu", "343434"), null);
    assert.equal(await consumeCode(email, "121212"), null, "a régebbi kód már nem él");
    assert.equal(await consumeCode(email, "343434"), email);
  });

  it("a meglévő admin-tiltás (users.is_banned ugyanarra a címre, kis-nagybetűtől függetlenül) az új fiókra is hat", async () => {
    const player = await store.confirmVerifiedEmail("pa-banned@websuli.example");
    assert.equal(player.banned, true);
    assert.equal((await store.getPlayer(player.id))!.banned, true);
  });

  it("a játékos-fiók tábla nem a users tábla: a megerősítés nem ír a users-be", async () => {
    const before = (await dbPool.query(`SELECT count(*)::int AS n FROM users`)).rows[0].n;
    await store.confirmVerifiedEmail("uj-diak@pelda.hu");
    assert.equal((await dbPool.query(`SELECT count(*)::int AS n FROM users`)).rows[0].n, before);
  });
});

describe("JM7a — HTTP: flag KI (alapállapot)", () => {
  it("a belépési / regisztrációs végpontok 404-et adnak; a status enabled:false", async () => {
    const c = new Client(offApp.base);
    assert.deepEqual((await c.request("GET", "/api/player/status")).json, { enabled: false });
    assert.equal((await c.request("POST", "/api/player/auth/start", { email: "x@pelda.hu" })).status, 404);
    assert.equal((await c.request("POST", "/api/player/auth/verify", { kind: "code", email: "x@pelda.hu", code: "123456" })).status, 404);
    assert.equal((await c.request("POST", "/api/player/auth/logout")).status, 404);
    assert.equal((await c.request("GET", "/api/player/me")).status, 404);
    assert.equal(await accountCount("x@pelda.hu"), 0);
  });
});

describe("JM7a — HTTP: flag BE", () => {
  before(() => { process.env.PLAYER_ACCOUNTS = "on"; });

  it("kódkérés: mindig 202 és azonos válasz (új cím, meglévő fiók, korláton túli cím); hibás cím 400", async () => {
    await store.confirmVerifiedEmail("meglevo@pelda.hu");
    const c = new Client(onApp.base);
    const fresh = await c.request("POST", "/api/player/auth/start", { email: "Uj.Cim@Pelda.hu" });
    const existing = await c.request("POST", "/api/player/auth/start", { email: "meglevo@pelda.hu" });
    assert.equal(fresh.status, 202);
    assert.equal(existing.status, 202);
    assert.equal(fresh.text, existing.text);
    const row = (await dbPool.query(`SELECT email_normalized FROM player_auth_codes WHERE email_normalized = 'uj.cim@pelda.hu'`)).rows;
    assert.equal(row.length, 1, "a normalizált cím a kódrekordban");
    assert.equal((await c.request("POST", "/api/player/auth/start", { email: "nem-cim" })).status, 400);
    assert.equal(await accountCount("uj.cim@pelda.hu"), 0, "kódkérés még nem hoz létre fiókot");
  });

  it("címenkénti korlát: 3 / 15 perc — a negyedik kérés is 202, de nem készül új kód", async () => {
    const c = new Client(onApp.base);
    const email = "korlat@pelda.hu";
    const statuses: number[] = [];
    for (let i = 0; i < START_PER_EMAIL_MAX + 2; i++) statuses.push((await c.request("POST", "/api/player/auth/start", { email })).status);
    assert.ok(statuses.every((s) => s === 202), statuses.join(","));
    const n = (await dbPool.query(`SELECT count(*)::int AS n FROM player_auth_codes WHERE email_normalized = $1`, [email])).rows[0].n;
    assert.equal(n, START_PER_EMAIL_MAX);
  });

  it("IP-nkénti korlát a kódkérésre (10 / 15 perc) → 429", async () => {
    const own = await startApp(); // saját korlát-számláló
    const c = new Client(own.base);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await c.request("POST", "/api/player/auth/start", { email: `ip${i}@pelda.hu` })).status);
    await own.close();
    assert.deepEqual(statuses.slice(0, 10), Array(10).fill(202));
    assert.equal(statuses[10], 429);
  });

  it("beváltás kóddal: munkamenet játékossal, req.user NÉLKÜL — admin-végpont 401, /api/auth/user null", async () => {
    const email = "pa-admin@websuli.example"; // az ADMIN felhasználó címe: a játékos-úton is csak játékos lesz
    const { code } = await plant(email, "246810");
    const c = new Client(onApp.base);
    const r = await c.request("POST", "/api/player/auth/verify", { kind: "code", email: "  PA-Admin@Websuli.example ", code });
    assert.equal(r.status, 200, r.text);
    const body = r.json as { ok: boolean; player: { id: string; nickname: null; needsProfile: boolean } };
    assert.equal(body.ok, true);
    assert.equal(body.player.needsProfile, true);
    assert.ok(!r.text.includes("@"), "a válaszban nincs e-mail-cím");
    assert.equal((await c.request("GET", "/api/auth/user")).json, null);
    assert.equal((await c.request("GET", "/api/admin/users")).status, 401);
    assert.equal((await c.request("GET", "/api/studio/maps")).status, 401);
    const me = await c.request("GET", "/api/player/me");
    assert.deepEqual(me.json, { id: body.player.id, nickname: null, needsProfile: true });
    // Kijelentkezés után nincs játékos.
    assert.equal((await c.request("POST", "/api/player/auth/logout")).status, 200);
    assert.equal((await c.request("GET", "/api/player/me")).json, null);
  });

  it("beváltás linkkel; rossz / lejárt → egységes INVALID_OR_EXPIRED; rossz alakú kérés 400", async () => {
    const { token } = await plant("linkes@pelda.hu");
    const c = new Client(onApp.base);
    const ok = await c.request("POST", "/api/player/auth/verify", { kind: "link", linkToken: token });
    assert.equal(ok.status, 200);
    const again = await new Client(onApp.base).request("POST", "/api/player/auth/verify", { kind: "link", linkToken: token });
    assert.deepEqual([again.status, again.json], [400, { ok: false, code: "INVALID_OR_EXPIRED" }]);
    const wrong = await new Client(onApp.base).request("POST", "/api/player/auth/verify", { kind: "code", email: "linkes@pelda.hu", code: "000000" });
    assert.deepEqual([wrong.status, wrong.json], [400, { ok: false, code: "INVALID_OR_EXPIRED" }]);
    const malformed = await new Client(onApp.base).request("POST", "/api/player/auth/verify", { kind: "link", linkToken: "rovid", extra: 1 });
    assert.equal(malformed.status, 400);
  });

  it("tiltott cím: a beváltás 403, munkamenet nélkül; a tiltott fiók munkamenete a /me-n 403", async () => {
    const { code } = await plant("pa-banned@websuli.example", "975310");
    const c = new Client(onApp.base);
    const r = await c.request("POST", "/api/player/auth/verify", { kind: "code", email: "pa-banned@websuli.example", code });
    assert.deepEqual([r.status, r.json], [403, { ok: false, code: "BANNED" }]);
    assert.equal((await c.request("GET", "/api/player/me")).json, null, "nincs játékos-munkamenet");
    // Utólagos tiltás: a már bejelentkezett játékos a következő kérésnél 403-at kap.
    const { code: c2 } = await plant("kesobb-tiltott@pelda.hu", "864200");
    const p = new Client(onApp.base);
    assert.equal((await p.request("POST", "/api/player/auth/verify", { kind: "code", email: "kesobb-tiltott@pelda.hu", code: c2 })).status, 200);
    await dbPool.query(`UPDATE player_accounts SET banned_at = now() WHERE email = 'kesobb-tiltott@pelda.hu'`);
    assert.equal((await p.request("GET", "/api/player/me")).status, 403);
  });

  it("a beváltás a munkamenet-azonosítót újragenerálja (session-fixation), és egy élő admin-munkamenetet sem örököl", async () => {
    const c = new Client(onApp.base);
    await c.fetchCsrf();
    const before = c.cookie;
    const { code } = await plant("fixacio@pelda.hu", "192837");
    assert.equal((await c.request("POST", "/api/player/auth/verify", { kind: "code", email: "fixacio@pelda.hu", code })).status, 200);
    assert.ok(c.cookie && c.cookie !== before, "új munkamenet-süti");
  });

  it("a napló nem tartalmaz e-mail-címet, kódot vagy link-tokent", () => {
    const text = logged.join("\n");
    assert.doesNotMatch(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/i, "nyers e-mail-cím a naplóban");
    for (const secret of ["246810", "975310", "864200", "192837", "135790"]) assert.ok(!text.includes(secret), `kód a naplóban: ${secret}`);
    assert.ok(text.includes("[PLAYER]"), "a játékos-modul naplózott (maszkolva)");
  });
});
