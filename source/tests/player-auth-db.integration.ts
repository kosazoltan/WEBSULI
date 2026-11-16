/**
 * JM7a — játékos e-mailes belépés / regisztráció eldobható Postgresen (végrehajtás „JM7a” 3–4.; JM-A11, JM-A12; D11 / D12;
 * biztonsági review #445: K1, K2, K3, A3, A4, üzemeltetés).
 * Társzint: a kódos és a linkes út ugyanazt a fiókot adja; párhuzamos megerősítés → 1 sor; egyszeri használat; lejárat;
 * rekordonként 5, fiókonként naponta 10 hibás próba; csak a legfrissebb kód él; a cím beváltáskor / lejáratkor törlődik.
 * HTTP-szint (a szerverrel azonos felcsatolás): flag KI → 404; a kódkérés válasza nem árulja el a fiók létét; korlátok
 * (alias-kulcs, napi, globális, IP); élő admin-munkamenet mellett nincs beváltás; napló-tisztaság.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import { Client, dbPool, mapLimit, startApp } from "./support/authz-db-harness";

const {
  codeHash, emailHash, generateLinkToken, limitHash, linkHash, playerAuthKey, MAX_FAILED_ATTEMPTS_PER_DAY,
  START_PER_EMAIL_DAILY_MAX, START_PER_EMAIL_MAX, START_PER_IP_MAX,
} = await import("../server/player/codes");
const { createPlayerStore } = await import("../server/player/store");
const { createPlayerRouter } = await import("../server/player/auth-routes");
const { default: express } = await import("express");
type Server = import("node:http").Server;
type AddressInfo = import("node:net").AddressInfo;
const { logger } = await import("../server/lib/logger");

const store = createPlayerStore(dbPool);
const key = () => playerAuthKey();
const ADMIN_PASSWORD = `pw-${Math.random().toString(36).slice(2)}-A1!`;

/** Kódrekord a szerverrel azonos kulccsal — a teszt így ismeri a kódot és a link-tokent (a valódi levél nem megy ki). */
async function plant(email: string, code = "13579024"): Promise<{ code: string; token: string }> {
  const k = key();
  const eh = emailHash(k, email);
  const token = generateLinkToken();
  await store.insertCode({ emailNormalized: email, emailHash: eh, limitHash: limitHash(k, email), codeHash: codeHash(k, eh, code), linkHash: linkHash(k, token) });
  return { code, token };
}
const consumeCode = (email: string, code: string) => { const k = key(); const eh = emailHash(k, email); return store.consumeCode(eh, codeHash(k, eh, code)); };
const consumeLink = (token: string) => store.consumeLink(linkHash(key(), token));
const accountCount = async (email: string) => Number((await dbPool.query<{ n: string }>(`SELECT count(*)::text AS n FROM player_accounts WHERE email = $1`, [email])).rows[0]!.n);
const codeRows = async (limitOf: string) => Number((await dbPool.query<{ n: string }>(`SELECT count(*)::text AS n FROM player_auth_codes WHERE limit_hash = $1`, [limitHash(key(), limitOf)])).rows[0]!.n);

/** A valódi útvonal-kezelő saját (megszámolt) levélküldővel és alapcímmel. */
async function routerApp(opts: { baseUrl?: () => string | null } = {}) {
  const sent: string[] = [];
  const app = express();
  app.use(express.json());
  app.use("/api/player", createPlayerRouter({ store, mailer: async (to) => { sent.push(to); }, baseUrl: opts.baseUrl ?? (() => "https://websuli.vip") }));
  const server: Server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const start = (email: string) => fetch(`${base}/api/player/auth/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) })
    .then(async (r) => ({ status: r.status, text: await r.text() }));
  const close = async () => { await new Promise((r) => setTimeout(r, 50)); await new Promise<void>((resolve) => server.close(() => resolve())); };
  return { sent, start, close };
}

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
       ('pa-admin', 'pa-admin@websuli.example', $1, true, false),
       ('pa-banned', 'Pa-Banned@Websuli.example', NULL, false, true)`,
    [await bcrypt.hash(ADMIN_PASSWORD, 4)],
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
  it("a kódos és a linkes út ugyanazt a fiókot adja; a cím a kódrekordból jön, beváltáskor törlődik a rekordból (A3)", async () => {
    const email = "kozos@pelda.hu";
    const a = await plant(email, "11111111");
    assert.equal(await consumeCode(email, "11111111"), email);
    const first = await store.confirmVerifiedEmail(email);
    const b = await plant(email, "22222222");
    assert.equal(await consumeLink(b.token), email);
    const second = await store.confirmVerifiedEmail(email);
    assert.equal(first.id, second.id);
    assert.equal(await accountCount(email), 1);
    assert.equal(await consumeLink(a.token), null, "az elhasznált rekord linkje sem él");
    const row = (await dbPool.query(`SELECT email_verified_at FROM player_accounts WHERE id = $1`, [first.id])).rows[0];
    assert.ok(row.email_verified_at instanceof Date);
    const left = await dbPool.query(`SELECT email_normalized FROM player_auth_codes WHERE email_hash = $1`, [emailHash(key(), email)]);
    assert.ok(left.rows.length === 2 && left.rows.every((r) => r.email_normalized === ""), "a beváltott rekordokban nincs nyílt cím");
  });

  it("párhuzamos megerősítés ugyanarra a címre → egyetlen fiók", async () => {
    const email = "parhuzamos@pelda.hu";
    const results = await Promise.all(Array.from({ length: 8 }, () => store.confirmVerifiedEmail(email)));
    assert.equal(new Set(results.map((r) => r.id)).size, 1);
    assert.equal(await accountCount(email), 1);
  });

  it("párhuzamos beváltás ugyanazzal a kóddal / linkkel → pontosan egy siker", async () => {
    const email = "egyszer@pelda.hu";
    const { code, token } = await plant(email, "33333333");
    const codeResults = await Promise.all(Array.from({ length: 6 }, () => consumeCode(email, code)));
    assert.equal(codeResults.filter((r) => r === email).length, 1);
    assert.equal(await consumeLink(token), null);
    const second = await plant(email, "44444444");
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
    const { code, token } = await plant(email, "55555555");
    await dbPool.query(`UPDATE player_auth_codes SET created_at = now() - interval '11 minutes' WHERE email_normalized = $1`, [email]);
    assert.equal(await consumeCode(email, code), null, "11 perces kód");
    assert.equal(await consumeLink(token), email, "11 perces link még él (15 perc)");
    const late = await plant(email, "66666666");
    await dbPool.query(`UPDATE player_auth_codes SET created_at = now() - interval '16 minutes', expires_at = now() - interval '1 minute' WHERE used_at IS NULL AND email_normalized = $1`, [email]);
    assert.equal(await consumeLink(late.token), null, "lejárt link");
  });

  it("5 rossz kód után a rekord zár — a helyes kód sem megy át; párhuzamos találgatás sem lép túl 5-ön", async () => {
    const email = "talalgat@pelda.hu";
    await plant(email, "77777777");
    const guesses = Array.from({ length: 20 }, (_, i) => String(10000000 + i));
    const results = await mapLimit(guesses, 20, (g) => consumeCode(email, g));
    assert.ok(results.every((r) => r === null));
    const { rows } = await dbPool.query<{ attempts: number }>(`SELECT attempts FROM player_auth_codes WHERE email_normalized = $1`, [email]);
    assert.equal(rows[0]!.attempts, 5, "rekordonként legfeljebb 5 kiértékelt hibás próba");
    assert.equal(await consumeCode(email, "77777777"), null);
  });

  it("review #445 (K1): fiókonként naponta legfeljebb 10 hibás próba — utána a helyes kód sem megy át, a LINK igen", async () => {
    const email = "napi-plafon@pelda.hu";
    // Két egymást követő kódkérési ablak szimulálva (a régebbi rekord 20 perccel korábbi), mindegyiken 5 rossz próba.
    await plant(email, "12340000");
    for (let i = 0; i < 5; i++) assert.equal(await consumeCode(email, String(20000000 + i)), null);
    await dbPool.query(`UPDATE player_auth_codes SET created_at = now() - interval '20 minutes', expires_at = now() + interval '1 minute' WHERE email_hash = $1`, [emailHash(key(), email)]);
    await plant(email, "12341111");
    for (let i = 0; i < 5; i++) assert.equal(await consumeCode(email, String(30000000 + i)), null);
    const third = await plant(email, "12342222");
    assert.equal(MAX_FAILED_ATTEMPTS_PER_DAY, 10);
    assert.equal(await consumeCode(email, "12342222"), null, "a 11. próbálkozás a helyes kóddal is elutasítva");
    const attempts = (await dbPool.query(`SELECT sum(attempts)::int AS n FROM player_auth_codes WHERE email_hash = $1`, [emailHash(key(), email)])).rows[0].n;
    assert.equal(attempts, 10, "a zárolt próbálkozás nem is értékelődik ki");
    assert.equal(await consumeLink(third.token), email, "a linkes út a zárolás alatt is működik");
  });

  it("csak a legfrissebb kód él; más címre ugyanaz a kód nem érvényes", async () => {
    const email = "frissebb@pelda.hu";
    await plant(email, "12121212");
    await new Promise((r) => setTimeout(r, 5));
    await plant(email, "34343434");
    assert.equal(await consumeCode("masik@pelda.hu", "34343434"), null);
    assert.equal(await consumeCode(email, "12121212"), null, "a régebbi kód már nem él");
    assert.equal(await consumeCode(email, "34343434"), email);
  });

  it("review #445 (A3): a takarító a lejárt rekordból a címet, a 24 óránál régebbit teljesen törli — kódkérés nélkül", async () => {
    const expired = "lejart-takarit@pelda.hu";
    const old = "regi-takarit@pelda.hu";
    await plant(expired);
    await plant(old);
    await dbPool.query(`UPDATE player_auth_codes SET expires_at = now() - interval '1 minute' WHERE email_normalized = $1`, [expired]);
    await dbPool.query(`UPDATE player_auth_codes SET created_at = now() - interval '25 hours', expires_at = now() - interval '24 hours' WHERE email_normalized = $1`, [old]);
    const [blanked, deleted] = await store.purgeOldCodes();
    assert.ok(blanked >= 1 && deleted >= 1);
    const rows = (await dbPool.query(`SELECT email_hash, email_normalized FROM player_auth_codes WHERE email_hash = ANY($1)`, [[emailHash(key(), expired), emailHash(key(), old)]])).rows;
    assert.deepEqual(rows.map((r) => [r.email_hash === emailHash(key(), expired), r.email_normalized]), [[true, ""]]);
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
    assert.equal((await c.request("POST", "/api/player/auth/link-info", { linkToken: generateLinkToken() })).status, 404);
    assert.equal((await c.request("POST", "/api/player/auth/verify", { kind: "code", email: "x@pelda.hu", code: "12345678" })).status, 404);
    assert.equal((await c.request("POST", "/api/player/auth/logout")).status, 404);
    assert.equal((await c.request("GET", "/api/player/me")).status, 404);
    assert.equal(await accountCount("x@pelda.hu"), 0);
  });
});

describe("JM7a — HTTP: flag BE", () => {
  before(() => { process.env.PLAYER_ACCOUNTS = "on"; });

  it("kódkérés: mindig 202 és azonos válasz (új cím, meglévő fiók); hibás cím 400", async () => {
    await store.confirmVerifiedEmail("meglevo@pelda.hu");
    const c = new Client(onApp.base);
    const fresh = await c.request("POST", "/api/player/auth/start", { email: "Uj.Cim@Pelda.hu" });
    const existing = await c.request("POST", "/api/player/auth/start", { email: "meglevo@pelda.hu" });
    assert.equal(fresh.status, 202);
    assert.equal(existing.status, 202);
    assert.equal(fresh.text, existing.text);
    const row = (await dbPool.query(`SELECT email_normalized FROM player_auth_codes WHERE email_normalized = 'uj.cim@pelda.hu'`)).rows;
    assert.equal(row.length, 1, "a normalizált cím a kódrekordban");
    for (const bad of ["nem-cim", "a<b@c.hu>", "Anna <anna@pelda.hu>", "a,b@c.hu", "a;b@c.hu", "a\"b\"@c.hu", "a b@c.hu", "a\r\nbcc:x@c.hu", "a@b@c.hu"]) {
      assert.equal((await c.request("POST", "/api/player/auth/start", { email: bad })).status, 400, JSON.stringify(bad));
    }
    assert.equal(await accountCount("uj.cim@pelda.hu"), 0, "kódkérés még nem hoz létre fiókot");
  });

  it("címenkénti korlát: 3 / 15 perc — a negyedik kérés is 202, de nem készül új kód", async () => {
    const { sent, start, close } = await routerApp();
    const email = "korlat@pelda.hu";
    const statuses: number[] = [];
    for (let i = 0; i < START_PER_EMAIL_MAX + 2; i++) statuses.push((await start(email)).status);
    await close();
    assert.ok(statuses.every((s) => s === 202), statuses.join(","));
    assert.equal(await codeRows(email), START_PER_EMAIL_MAX);
    assert.equal(sent.length, START_PER_EMAIL_MAX);
  });

  it("review #445: 10 PÁRHUZAMOS kódkérés ugyanarra a címre → legfeljebb 3 kódrekord és 3 levél; minden válasz azonos 202", async () => {
    const { sent, start, close } = await routerApp();
    const email = "bomba@pelda.hu";
    const responses = await Promise.all(Array.from({ length: 10 }, () => start(email)));
    await close();
    assert.deepEqual(new Set(responses.map((r) => `${r.status} ${r.text}`)), new Set(['202 {"ok":true}']));
    assert.equal(await codeRows(email), START_PER_EMAIL_MAX, "legfeljebb a keretnyi kódrekord");
    assert.equal(sent.length, START_PER_EMAIL_MAX, "legfeljebb a keretnyi levél");
  });

  it("review #445 (K2): Gmail-aliasok (pontok, +címke, googlemail) KÖZÖS keretből fogyasztanak, de külön fiókok maradnak", async () => {
    const { sent, start, close } = await routerApp();
    const aliases = ["kisdiak+1@gmail.com", "kis.diak+2@gmail.com", "k.i.s.diak@googlemail.com", "kisdiak@gmail.com", "kisdiak+5@gmail.com"];
    for (const a of aliases) assert.equal((await start(a)).status, 202);
    await close();
    assert.equal(await codeRows("kisdiak@gmail.com"), START_PER_EMAIL_MAX, "a kanonizált kulcson legfeljebb 3 kód");
    assert.equal(sent.length, START_PER_EMAIL_MAX);
    // A fiók a megadott (normalizált) cím: két alias két külön fiók lehet.
    const a = await store.confirmVerifiedEmail("a.b+x@gmail.com");
    const b = await store.confirmVerifiedEmail("ab@gmail.com");
    assert.notEqual(a.id, b.id);
  });

  it("review #445 (K2): korlát-kulcsonként naponta legfeljebb 10 kódkérés (az ablakok kitolásával sem több)", async () => {
    const email = "napi-keret@pelda.hu";
    for (let i = 0; i < START_PER_EMAIL_DAILY_MAX; i++) await plant(email);
    await dbPool.query(`UPDATE player_auth_codes SET created_at = now() - interval '2 hours' WHERE limit_hash = $1`, [limitHash(key(), email)]);
    const { sent, start, close } = await routerApp();
    assert.equal((await start(email)).status, 202);
    await close();
    assert.equal(sent.length, 0, "a napi keret felett nincs levél");
    assert.equal(await codeRows(email), START_PER_EMAIL_DAILY_MAX);
  });

  it("review #445 (K2): a szerverszintű napi plafon (PLAYER_LOGIN_EMAIL_DAILY_MAX) elérésekor 202, levél nélkül, figyelmeztetéssel", async () => {
    const current = Number((await dbPool.query(`SELECT count(*)::int AS n FROM player_auth_codes WHERE created_at > now() - interval '24 hours'`)).rows[0].n);
    process.env.PLAYER_LOGIN_EMAIL_DAILY_MAX = String(current);
    try {
      const { sent, start, close } = await routerApp();
      const r = await start("globalis-plafon@pelda.hu");
      await close();
      assert.equal(r.status, 202);
      assert.equal(sent.length, 0);
      assert.equal(await codeRows("globalis-plafon@pelda.hu"), 0);
      assert.ok(logged.some((l) => l.includes("napi szerverszintű plafonja")), "figyelmeztető napló");
    } finally {
      delete process.env.PLAYER_LOGIN_EMAIL_DAILY_MAX;
    }
  });

  it("review #445 (üzemeltetés): érvényes FRONTEND_URL nélkül a flag mellett sem megy levél, és kód sem készül", async () => {
    const { sent, start, close } = await routerApp({ baseUrl: () => null });
    const r = await start("nincs-alapcim@pelda.hu");
    await close();
    assert.equal(r.status, 202);
    assert.equal(sent.length, 0);
    assert.equal(await codeRows("nincs-alapcim@pelda.hu"), 0);
    assert.ok(logged.some((l) => l.includes("FRONTEND_URL")), "hibanapló (maszkolt címmel)");
  });

  it(`review #445 (A4): IP-nkénti korlát a kódkérésre (${START_PER_IP_MAX} / 15 perc) → utána 429`, async () => {
    const own = await startApp(); // saját korlát-számláló
    const c = new Client(own.base);
    const statuses: number[] = [];
    for (let i = 0; i <= START_PER_IP_MAX; i++) statuses.push((await c.request("POST", "/api/player/auth/start", { email: `ip${i}@pelda.hu` })).status);
    await own.close();
    assert.deepEqual(statuses.slice(0, START_PER_IP_MAX), Array(START_PER_IP_MAX).fill(202));
    assert.equal(statuses[START_PER_IP_MAX], 429);
  });

  it("beváltás kóddal: munkamenet játékossal, req.user NÉLKÜL — admin-végpont 401, /api/auth/user null", async () => {
    const email = "pa-admin@websuli.example"; // az ADMIN felhasználó címe: a játékos-úton is csak játékos lesz
    const { code } = await plant(email, "24681024");
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

  it("review #445 (K3): a link-info beváltás NÉLKÜL maszkolt címet ad, és jelzi a meglévő munkamenetet", async () => {
    const { token } = await plant("link-info@pelda.hu");
    const guest = new Client(onApp.base);
    const info = await guest.request("POST", "/api/player/auth/link-info", { linkToken: token });
    assert.deepEqual(info.json, { ok: true, maskedEmail: "l***@p***.hu", current: "none", accountSession: false });
    // Nem váltotta be: a link utána is működik, és a játékos „same”-et lát.
    assert.equal((await guest.request("POST", "/api/player/auth/verify", { kind: "link", linkToken: token })).status, 200);
    const { token: again } = await plant("link-info@pelda.hu");
    assert.equal(((await guest.request("POST", "/api/player/auth/link-info", { linkToken: again })).json as { current: string }).current, "same");
    const { token: other } = await plant("masik-fiok@pelda.hu");
    assert.equal(((await guest.request("POST", "/api/player/auth/link-info", { linkToken: other })).json as { current: string }).current, "other");
    assert.deepEqual((await guest.request("POST", "/api/player/auth/link-info", { linkToken: generateLinkToken() })).json, { ok: false, code: "INVALID_OR_EXPIRED" });
  });

  it("review #445 (K3): élő ADMIN-munkamenet mellett a beváltás 409 — az admin bent marad, a kód / link nem használódik el", async () => {
    const admin = new Client(onApp.base);
    assert.equal((await admin.request("POST", "/api/login", { email: "pa-admin@websuli.example", password: ADMIN_PASSWORD })).status, 200);
    const { code, token } = await plant("admin-mellett@pelda.hu", "86420864");
    const info = await admin.request("POST", "/api/player/auth/link-info", { linkToken: token });
    assert.equal((info.json as { accountSession: boolean }).accountSession, true);
    const viaLink = await admin.request("POST", "/api/player/auth/verify", { kind: "link", linkToken: token });
    const viaCode = await admin.request("POST", "/api/player/auth/verify", { kind: "code", email: "admin-mellett@pelda.hu", code });
    assert.deepEqual([viaLink.status, viaLink.json], [409, { ok: false, code: "ACCOUNT_SESSION" }]);
    assert.deepEqual([viaCode.status, viaCode.json], [409, { ok: false, code: "ACCOUNT_SESSION" }]);
    const me = await admin.request("GET", "/api/auth/user");
    assert.equal((me.json as { isAdmin: boolean }).isAdmin, true, "az admin-munkamenet érintetlen");
    assert.equal(await consumeLink(token), "admin-mellett@pelda.hu", "a link nem használódott el");
  });

  it("idegen Origin-ről a beváltás és a link-info is 403 (az /auth/* kivétel csak az engedélyezett eredetet engedi)", async () => {
    const { token } = await plant("idegen@pelda.hu");
    for (const path of ["/api/player/auth/verify", "/api/player/auth/link-info"]) {
      const body = path.endsWith("verify") ? { kind: "link", linkToken: token } : { linkToken: token };
      const res = await fetch(`${onApp.base}${path}`, { method: "POST", headers: { "content-type": "application/json", origin: "https://tamado.example" }, body: JSON.stringify(body) });
      assert.equal(res.status, 403, path);
    }
    assert.equal(await consumeLink(token), "idegen@pelda.hu");
  });

  it("beváltás linkkel; rossz / lejárt → egységes INVALID_OR_EXPIRED; rossz alakú kérés 400", async () => {
    const { token } = await plant("linkes@pelda.hu");
    const c = new Client(onApp.base);
    const ok = await c.request("POST", "/api/player/auth/verify", { kind: "link", linkToken: token });
    assert.equal(ok.status, 200);
    const again = await new Client(onApp.base).request("POST", "/api/player/auth/verify", { kind: "link", linkToken: token });
    assert.deepEqual([again.status, again.json], [400, { ok: false, code: "INVALID_OR_EXPIRED" }]);
    const wrong = await new Client(onApp.base).request("POST", "/api/player/auth/verify", { kind: "code", email: "linkes@pelda.hu", code: "00000000" });
    assert.deepEqual([wrong.status, wrong.json], [400, { ok: false, code: "INVALID_OR_EXPIRED" }]);
    const malformed = await new Client(onApp.base).request("POST", "/api/player/auth/verify", { kind: "link", linkToken: "rovid", extra: 1 });
    assert.equal(malformed.status, 400);
    const sixDigits = await new Client(onApp.base).request("POST", "/api/player/auth/verify", { kind: "code", email: "linkes@pelda.hu", code: "123456" });
    assert.equal(sixDigits.status, 400, "a kód 8 jegyű");
  });

  it("tiltott cím: a beváltás 403, munkamenet nélkül; a tiltott fiók munkamenete a /me-n 403", async () => {
    const { code } = await plant("pa-banned@websuli.example", "97531097");
    const c = new Client(onApp.base);
    const r = await c.request("POST", "/api/player/auth/verify", { kind: "code", email: "pa-banned@websuli.example", code });
    assert.deepEqual([r.status, r.json], [403, { ok: false, code: "BANNED" }]);
    assert.equal((await c.request("GET", "/api/player/me")).json, null, "nincs játékos-munkamenet");
    const { code: c2 } = await plant("kesobb-tiltott@pelda.hu", "86420086");
    const p = new Client(onApp.base);
    assert.equal((await p.request("POST", "/api/player/auth/verify", { kind: "code", email: "kesobb-tiltott@pelda.hu", code: c2 })).status, 200);
    await dbPool.query(`UPDATE player_accounts SET banned_at = now() WHERE email = 'kesobb-tiltott@pelda.hu'`);
    assert.equal((await p.request("GET", "/api/player/me")).status, 403);
  });

  it("a beváltás a munkamenet-azonosítót újragenerálja (session-fixation)", async () => {
    const c = new Client(onApp.base);
    await c.fetchCsrf();
    const before = c.cookie;
    const { code } = await plant("fixacio@pelda.hu", "19283746");
    assert.equal((await c.request("POST", "/api/player/auth/verify", { kind: "code", email: "fixacio@pelda.hu", code })).status, 200);
    assert.ok(c.cookie && c.cookie !== before, "új munkamenet-süti");
  });

  it("a napló nem tartalmaz e-mail-címet, kódot vagy link-tokent", () => {
    const text = logged.join("\n");
    assert.doesNotMatch(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}/i, "nyers e-mail-cím a naplóban");
    for (const secret of ["24681024", "97531097", "86420086", "19283746", "13579024", "86420864"]) assert.ok(!text.includes(secret), `kód a naplóban: ${secret}`);
    assert.ok(text.includes("[PLAYER]"), "a játékos-modul naplózott (maszkolva)");
  });
});
