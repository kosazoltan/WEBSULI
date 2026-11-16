/**
 * JM7b — játékos Google-út, „kis fiók”, tanulói összekapcsolás, adatletöltés, fióktörlés, admin-tiltás eldobható Postgresen,
 * a szerverrel AZONOS útvonal-felcsatolással (`mountAppRoutes`), valódi HTTP-n (süti, CSRF-token, munkamenet-tár).
 * Terv 10.4 (D11, D12), tulajdonosi G11; JM-A11, JM-A12 (Google-ág), JM-A15. A Google hálózati része helyettesítve
 * (tests/support/player-google-stub.ts) — a szerver saját stratégiája, state- / PKCE-ellenőrzése és visszahívása fut.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import { Client, dbPool, injectSession, startApp } from "./support/authz-db-harness";
import { getNoFollow, installAdminGoogleStub, playerGoogleLogin } from "./support/player-google-stub";

const { emailHash, playerAuthKey, codeHash, limitHash, deleteLimitHash, linkHash, generateLinkToken, purposeEmailHash, allPurposeEmailHashes, MAX_FAILED_ATTEMPTS_PER_DAY } = await import("../server/player/codes");
const { createPlayerStore } = await import("../server/player/store");
const { banFingerprint, normalizeEmail } = await import("../server/player/codes");
const { createPlayerAccountStore } = await import("../server/player/account-store");
const { learnerTokenFor, rotateLearnerToken } = await import("../server/learners");
const { logger } = await import("../server/lib/logger");

const ADMIN_EMAIL = "jm7b-admin@websuli.example";
const ADMIN_PASSWORD = `pw-${Math.random().toString(36).slice(2)}-B2!`;
const verified = (email: string, id: string) => ({ id, emails: [{ value: email, verified: true }] });

const logged: string[] = [];
const originals = { info: logger.info, warn: logger.warn, error: logger.error };
for (const level of ["info", "warn", "error"] as const) {
  (logger as unknown as Record<string, (...a: unknown[]) => void>)[level] = (...args: unknown[]) => { logged.push(args.map(String).join(" ")); };
}

let app: Awaited<ReturnType<typeof startApp>>;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await dbPool.query(sql, params)).rows as T[];
const usersSnapshot = () => q(`SELECT id, email, is_admin, google_id, is_banned FROM users ORDER BY id`);

async function adminClient(): Promise<Client> {
  const c = new Client(app.base);
  const r = await c.request("POST", "/api/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  assert.equal(r.status, 200, `admin-belépés: ${r.text}`);
  await c.fetchCsrf();
  return c;
}

/** Játékos valódi e-mailes kódbeváltással (friss `at` a munkamenetben). */
async function emailPlayer(email: string): Promise<Client> {
  const key = playerAuthKey();
  const eh = emailHash(key, email);
  await createPlayerStore(dbPool).insertCode({ emailNormalized: email, emailHash: eh, limitHash: limitHash(key, email), codeHash: codeHash(key, eh, "24682468"), linkHash: linkHash(key, generateLinkToken()) });
  const c = new Client(app.base);
  const r = await c.request("POST", "/api/player/auth/verify", { kind: "code", email, code: "24682468" });
  assert.equal(r.status, 200, r.text);
  await c.fetchCsrf();
  return c;
}

async function googlePlayer(email: string, sub: string): Promise<{ client: Client; id: string }> {
  const c = new Client(app.base);
  const run = await playerGoogleLogin(c, verified(email, sub), { returnTo: "/fiok" });
  assert.deepEqual(run.callback, { status: 302, location: "/fiok" });
  await c.fetchCsrf();
  const me = await c.request("GET", "/api/player/me");
  return { client: c, id: (me.json as { id: string }).id };
}

before(async () => {
  process.env.PLAYER_ACCOUNTS = "on";
  process.env.ADMIN_EMAIL = ADMIN_EMAIL; // az admin-út ezzel adna jogot — a játékos-úton NEM szabad
  app = await startApp();
  await new Client(app.base).fetchCsrf(); // munkamenet-tábla létrehozása
  await dbPool.query(
    `INSERT INTO users (id, email, password, is_admin, is_banned, google_id) VALUES ('jm7b-admin', $1, $2, true, false, 'g-admin-own')`,
    [ADMIN_EMAIL, await bcrypt.hash(ADMIN_PASSWORD, 4)],
  );
});

after(async () => {
  Object.assign(logger, originals);
  delete process.env.PLAYER_ACCOUNTS;
  delete process.env.ADMIN_EMAIL;
  await app?.close();
  await dbPool.end();
});

describe("JM7b — játékos Google-út: elválasztás az admin-úttól (G11 / D12)", () => {
  it("az ADMIN_EMAIL-lel egyező Google-fiók a játékos-úton CSAK játékos-munkamenetet kap: /api/auth/user null, admin-végpont 401, users változatlan", async () => {
    const usersBefore = await usersSnapshot();
    const c = new Client(app.base);
    const run = await playerGoogleLogin(c, verified(ADMIN_EMAIL, "g-sub-admin-as-player"), { returnTo: "/fiok" });
    assert.equal(run.start.status, 302);
    assert.deepEqual(run.callback, { status: 302, location: "/fiok" });
    await c.fetchCsrf();
    assert.equal((await c.request("GET", "/api/auth/user")).json, null, "nincs req.user");
    const me = await c.request("GET", "/api/player/me");
    assert.equal(me.status, 200);
    assert.ok((me.json as { id: string }).id, "játékos-munkamenet él");
    for (const path of ["/api/admin/users", "/api/admin/game-accounts", "/api/studio/workflows"]) {
      assert.equal((await c.request("GET", path)).status, 401, `${path}: játékos-munkamenettel 401`);
    }
    assert.equal((await c.request("POST", "/api/admin/game-accounts/x/ban", {})).status, 401);
    assert.deepEqual(await usersSnapshot(), usersBefore, "a users tábla változatlan (nincs új sor, nincs jogváltozás)");
    const [acc] = await q<{ email: string; google_sub: string }>(`SELECT email, google_sub FROM player_accounts WHERE google_sub = 'g-sub-admin-as-player'`);
    assert.deepEqual(acc, { email: ADMIN_EMAIL, google_sub: "g-sub-admin-as-player" });
    // A munkamenet-sorban csak játékos-kulcs van (Passport-kulcs nincs), és a Google-profil neve / képe sehol nem tárolódik.
    const sessions = await q<{ sess: Record<string, unknown> }>(`SELECT sess FROM session WHERE sess -> 'player' ->> 'id' = $1`, [(me.json as { id: string }).id]);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]!.sess.passport, undefined);
    const dump = JSON.stringify(await q(`SELECT * FROM player_accounts WHERE google_sub = 'g-sub-admin-as-player'`));
    assert.ok(!dump.includes("Valódi") && !dump.includes("kep.example"), "név / profilkép nem tárolódik");
  });

  it("login-CSRF: hamis / hiányzó state → nincs belépés, nincs fiók; a state egyszer használható (visszajátszás bukik)", async () => {
    const c = new Client(app.base);
    const bad = await playerGoogleLogin(c, verified("csrf-aldozat@pelda.hu", "g-csrf"), { tamperState: true });
    assert.deepEqual(bad.callback, { status: 302, location: "/belepes?hiba=google" });
    assert.equal((await c.request("GET", "/api/player/me")).json, null);
    assert.equal((await q(`SELECT 1 FROM player_accounts WHERE email = 'csrf-aldozat@pelda.hu'`)).length, 0);

    const good = new Client(app.base);
    const first = await playerGoogleLogin(good, verified("replay@pelda.hu", "g-replay"));
    assert.equal(first.callback?.location, "/fiok");
    // Másik böngésző (a támadó) a sikeres belépés state-jével: nála nincs ilyen state → bukik.
    const attacker = new Client(app.base);
    await playerGoogleLogin(attacker, verified("replay@pelda.hu", "g-replay"), { skipCallback: true });
    const replay = await playerGoogleLogin(attacker, verified("replay@pelda.hu", "g-replay"), { reuse: first });
    assert.equal(replay.callback?.location, "/belepes?hiba=google");
    assert.equal((await attacker.request("GET", "/api/player/me")).json, null);
  });

  it("a Google által nem megerősített cím → elutasítás, fiók nem jön létre", async () => {
    const c = new Client(app.base);
    const r = await playerGoogleLogin(c, { id: "g-unverified", emails: [{ value: "nemjo@pelda.hu", verified: false }] });
    assert.equal(r.callback?.location, "/belepes?hiba=nincs-megerositve");
    assert.equal((await q(`SELECT 1 FROM player_accounts WHERE email = 'nemjo@pelda.hu'`)).length, 0);
  });

  it("élő admin-munkamenet mellett az út el sem indul, és a visszahívás sem cseréli le — az admin bent marad", async () => {
    const admin = await adminClient();
    const r = await playerGoogleLogin(admin, verified("adminbongeszo@pelda.hu", "g-in-admin-browser"));
    assert.deepEqual(r.start, { status: 302, location: "/belepes?hiba=fiok-munkamenet" });
    assert.equal((await admin.request("GET", "/api/auth/user")).json && ((await admin.request("GET", "/api/auth/user")).json as { isAdmin: boolean }).isAdmin, true);

    // Félbehagyott játékos-indítás, közben ugyanebben a munkamenetben admin-belépés állapota (szimulálva a tárban) → a visszahívás nem léptet be.
    const c = new Client(app.base);
    const started = await playerGoogleLogin(c, verified("kozben@pelda.hu", "g-kozben"), { skipCallback: true });
    const sid = decodeURIComponent(c.cookie!.split("=")[1]!).slice(2).split(".")[0]!;
    await dbPool.query(`UPDATE session SET sess = jsonb_set(sess::jsonb, '{passport}', '{"user":"jm7b-admin"}')::json WHERE sid = $1`, [sid]);
    const cb = await playerGoogleLogin(c, verified("kozben@pelda.hu", "g-kozben"), { reuse: started });
    assert.equal(cb.callback?.location, "/belepes?hiba=fiok-munkamenet");
    assert.equal(((await c.request("GET", "/api/auth/user")).json as { isAdmin: boolean }).isAdmin, true, "az admin-munkamenet érintetlen");
    assert.equal((await q(`SELECT 1 FROM player_accounts WHERE email = 'kozben@pelda.hu'`)).length, 0);
  });

  it("nyílt átirányítás ellen: külső / admin cél helyett /fiok; engedett játékoldal megmarad", async () => {
    for (const [target, expected] of [["https://evil.example", "/fiok"], ["//evil.example", "/fiok"], ["/admin", "/fiok"], ["/games/tsunami-english", "/games/tsunami-english"]] as const) {
      const c = new Client(app.base);
      const r = await playerGoogleLogin(c, verified(`redir${expected.length}${target.length}@pelda.hu`, `g-redir-${target}`), { returnTo: target });
      assert.equal(r.callback?.location, expected, target);
    }
  });

  it("e-mailes fiók + ugyanaz a cím Google-lal → UGYANAZ a fiók; más Google-fiók ugyanarra a címre → ütközés, belépés nélkül", async () => {
    const byCode = await emailPlayer("kozos-cim@pelda.hu");
    const codeId = ((await byCode.request("GET", "/api/player/me")).json as { id: string }).id;
    const g = await googlePlayer("kozos-cim@pelda.hu", "g-kozos-1");
    assert.equal(g.id, codeId);
    const other = new Client(app.base);
    const r = await playerGoogleLogin(other, verified("kozos-cim@pelda.hu", "g-kozos-2"));
    assert.equal(r.callback?.location, "/belepes?hiba=utkozes");
    assert.equal((await other.request("GET", "/api/player/me")).json, null);
  });

  it("review #449 A1: párhuzamos admin- és játékos-folyamat egy munkamenetben — az admin-visszahívás admint, a játékosé játékost ad; hamis / idegen state → senki", async () => {
    // 1) admin-indítás, közben játékos-indítás → az ADMIN visszahívása admin-belépést ad.
    // SPEC-VÁLTOZÁS 2026-11-16 (terv 10.4a, JM7c-1 — review #449 K3): az admin-út is state-es; a visszahívás az indításkor
    // kapott `a.` state-tel érkezik (state nélküli admin-visszahívás már senkit nem léptet be — lásd a 4. pontot).
    const c1 = new Client(app.base);
    const adminStart = await getNoFollow(c1, "/auth/google");
    assert.equal(adminStart.status, 302);
    const adminState = new URL(adminStart.location!).searchParams.get("state");
    assert.ok(adminState?.startsWith("a."), "az admin-indítás `a.` state-et küld");
    const p1 = await playerGoogleLogin(c1, verified("parhuzamos1@pelda.hu", "g-par-1"), { skipCallback: true });
    assert.ok(p1.state?.startsWith("p."));
    installAdminGoogleStub({ id: "g-admin-own", emails: [{ value: ADMIN_EMAIL, verified: true }] });
    const adminCb = await getNoFollow(c1, `/auth/google/callback?code=admin-code-1&state=${encodeURIComponent(adminState!)}`);
    assert.equal(adminCb.status, 302);
    assert.notEqual(adminCb.location?.startsWith("/belepes"), true, "az admin-belépést a függő játékos-folyamat nem hiúsítja meg");
    assert.equal(((await c1.request("GET", "/api/auth/user")).json as { isAdmin: boolean }).isAdmin, true);
    assert.equal((await c1.request("GET", "/api/player/me")).json, null, "játékos-munkamenet nem jött létre");

    // 2) admin-indítás, közben játékos-indítás → a JÁTÉKOS visszahívása csak játékost ad (req.user nélkül).
    const c2 = new Client(app.base);
    await getNoFollow(c2, "/auth/google");
    const p2 = await playerGoogleLogin(c2, verified("parhuzamos2@pelda.hu", "g-par-2"), { skipCallback: true });
    const playerCb = await playerGoogleLogin(c2, verified("parhuzamos2@pelda.hu", "g-par-2"), { reuse: p2 });
    assert.equal(playerCb.callback?.location, "/fiok");
    await c2.fetchCsrf();
    assert.equal((await c2.request("GET", "/api/auth/user")).json, null);
    assert.ok(((await c2.request("GET", "/api/player/me")).json as { id?: string } | null)?.id);

    // 3) hamisított (jó alakú, de a munkamenetben nem létező) és idegen munkamenet state-je → senki nem lép be.
    const c3 = new Client(app.base);
    await playerGoogleLogin(c3, verified("hamis@pelda.hu", "g-hamis"), { skipCallback: true });
    const forged = await getNoFollow(c3, `/auth/google/callback?code=x&state=p.${"A".repeat(32)}`);
    assert.equal(forged.location, "/belepes?hiba=google");
    const foreign = new Client(app.base);
    const p4 = await playerGoogleLogin(foreign, verified("idegen@pelda.hu", "g-idegen"), { skipCallback: true });
    const swapped = await getNoFollow(c3, `/auth/google/callback?code=y&state=${encodeURIComponent(p4.state!)}`);
    assert.equal(swapped.location, "/belepes?hiba=google");
    assert.equal((await c3.request("GET", "/api/player/me")).json, null);
    assert.equal((await c3.request("GET", "/api/auth/user")).json, null);

    // 4) JM7c-1: a játékos `p.` state-je az admin-ágon sem, az admin `a.` state-je más munkamenetben sem léptet be; state
    // nélküli admin-visszahívás → érthető hibaoldal (/login?hiba=google), belépés nélkül.
    const c4 = new Client(app.base);
    await getNoFollow(c4, "/auth/google");
    installAdminGoogleStub({ id: "g-admin-own", emails: [{ value: ADMIN_EMAIL, verified: true }] });
    const stateless = await getNoFollow(c4, "/auth/google/callback?code=admin-code-2");
    assert.equal(stateless.location, "/login?hiba=google");
    const foreignAdmin = new Client(app.base);
    const fStart = await getNoFollow(foreignAdmin, "/auth/google");
    const fState = new URL(fStart.location!).searchParams.get("state")!;
    const stolen = await getNoFollow(c4, `/auth/google/callback?code=admin-code-3&state=${encodeURIComponent(fState)}`);
    assert.equal(stolen.location, "/login?hiba=google");
    assert.equal((await c4.request("GET", "/api/auth/user")).json, null);
  });

  it("flag KI: a játékos Google-út 404, a visszahívás nem léptet be", async () => {
    process.env.PLAYER_ACCOUNTS = "off";
    try {
      const c = new Client(app.base);
      const r = await playerGoogleLogin(c, verified("flagki@pelda.hu", "g-flag"), { skipCallback: true });
      assert.equal(r.start.status, 404);
    } finally {
      process.env.PLAYER_ACCOUNTS = "on";
    }
  });
});

describe("JM7b — kis fiók: becenév, avatar (JM-A11)", () => {
  it("fiók-nézet: maszkolt cím, becenév nélkül needsProfile; szűrt becenév, ütközésnél 409 + szabad #1234 javaslat", async () => {
    const a = await emailPlayer("nev-a@pelda.hu");
    const view = await a.request("GET", "/api/player/account");
    assert.equal(view.status, 200);
    assert.equal((view.json as { maskedEmail: string }).maskedEmail, "n***@p***.hu");
    assert.equal((view.json as { needsProfile: boolean }).needsProfile, true);
    assert.ok(!view.text.includes("nev-a@pelda.hu"), "a teljes cím a fiók-nézetben sincs");

    const bad = await a.request("POST", "/api/player/profile", { nickname: "4dm1n" });
    assert.equal(bad.status, 400);
    assert.deepEqual((bad.json as { problems: string[] }).problems, ["RESERVED"]);
    const xss = await a.request("POST", "/api/player/profile", { nickname: "<img src=x onerror=alert(1)>" });
    assert.equal(xss.status, 400);
    assert.equal((await a.request("POST", "/api/player/profile", { nickname: "Villám Róka" })).status, 200);

    const b = await emailPlayer("nev-b@pelda.hu");
    const taken = await b.request("POST", "/api/player/profile", { nickname: "villam roka" });
    assert.equal(taken.status, 409, "kis-/nagybetűtől és ékezettől független foglaltság");
    const suggestion = (taken.json as { suggestion: string }).suggestion;
    assert.match(suggestion, /^villam roka#\d{4}$/, "a javaslat a játékos SAJÁT beírt alakjára épül, megkülönböztetővel");
    assert.equal((await b.request("POST", "/api/player/profile", { nickname: suggestion })).status, 200);
    // A saját, változatlan becenév újramentése nem ütközés.
    assert.equal((await a.request("POST", "/api/player/profile", { nickname: "Villám Róka" })).status, 200);
  });

  it("versenyhelyzet: két játékos egyszerre ugyanarra a becenévre → pontosan egy nyer (egyedi index)", async () => {
    const players = await Promise.all(["verseny-1@pelda.hu", "verseny-2@pelda.hu", "verseny-3@pelda.hu"].map(emailPlayer));
    const results = await Promise.all(players.map((p) => p.request("POST", "/api/player/profile", { nickname: "Gyors Gepárd" })));
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409, 409]);
    assert.equal((await q(`SELECT 1 FROM player_accounts WHERE nickname = 'Gyors Gepárd'`)).length, 1);
  });

  it("avatar csak a zárt készletből; ajánlott becenevek szabadok és szűrtek", async () => {
    const c = await emailPlayer("avatar@pelda.hu");
    assert.equal((await c.request("POST", "/api/player/profile", { avatar: "https://kep.example/x.png" })).status, 400);
    assert.equal((await c.request("POST", "/api/player/profile", { avatar: "star-sun" })).status, 200);
    assert.equal(((await c.request("GET", "/api/player/account")).json as { avatar: string }).avatar, "star-sun");
    const s = await c.request("GET", "/api/player/nickname-suggestions");
    assert.equal(s.status, 200);
    assert.ok((s.json as { suggestions: string[] }).suggestions.length >= 1);
  });

  it("írások CSRF-tokenesek és Origin-ellenőrzöttek; munkamenet nélkül 401; flag KI → 404", async () => {
    const c = await emailPlayer("csrf@pelda.hu");
    const noToken = new Client(app.base, c.cookie);
    assert.equal((await noToken.request("POST", "/api/player/profile", { nickname: "Okos Bagoly" })).status, 403);
    const res = await fetch(`${app.base}/api/player/profile`, { method: "POST", headers: { "content-type": "application/json", cookie: c.cookie!, "x-csrf-token": c.csrf!, origin: "https://evil.example" }, body: JSON.stringify({ nickname: "Okos Bagoly" }) });
    assert.equal(res.status, 403, "idegen Origin");
    const guest = new Client(app.base);
    await guest.fetchCsrf();
    for (const [m, p] of [["GET", "/api/player/account"], ["POST", "/api/player/profile"], ["POST", "/api/player/export"], ["POST", "/api/player/account/delete"], ["POST", "/api/player/link-learner"]] as const) {
      assert.equal((await guest.request(m, p, m === "GET" ? undefined : {})).status, 401, `${m} ${p}`);
    }
    process.env.PLAYER_ACCOUNTS = "off";
    try {
      assert.equal((await c.request("GET", "/api/player/account")).status, 404);
      assert.equal((await c.request("POST", "/api/player/export", {})).status, 404);
    } finally {
      process.env.PLAYER_ACCOUNTS = "on";
    }
  });
});

describe("JM7b — tanulói profil összekapcsolása (review #445 K3)", () => {
  it("csak érvényes, aláírt tanulói tokennel ÉS kifejezett megerősítéssel; egy tanuló egy fiókhoz; a válasz tanulói adatot nem ad", async () => {
    await dbPool.query(`INSERT INTO learners (id, name, grade) VALUES ('jm7b-learner-1', 'Teszt Tanuló Anna', 5), ('jm7b-learner-2', 'Teszt Tanuló Béla', 6)`);
    const token = learnerTokenFor("jm7b-learner-1", 1)!;
    const forged = `${token.slice(0, -4)}AAAA`;
    const otherLearnerWithMySig = token.replace("jm7b-learner-1", "jm7b-learner-2");
    const a = await emailPlayer("link-a@pelda.hu");
    const withToken = async (c: Client, t: string | null, body: unknown) => {
      const headers: Record<string, string> = { "content-type": "application/json", origin: app.base, cookie: c.cookie!, "x-csrf-token": c.csrf! };
      if (t) headers["x-learner-token"] = t;
      const r = await fetch(`${app.base}/api/player/link-learner`, { method: "POST", headers, body: JSON.stringify(body) });
      return { status: r.status, text: await r.text() };
    };
    assert.equal((await withToken(a, null, { confirm: true })).status, 400, "token nélkül");
    assert.equal((await withToken(a, forged, { confirm: true })).status, 400, "hamis aláírás");
    assert.equal((await withToken(a, otherLearnerWithMySig, { confirm: true })).status, 400, "más tanuló azonosítója a saját aláírással");
    assert.equal((await withToken(a, token, {})).status, 400, "megerősítés nélkül");
    assert.equal((await withToken(a, token, { confirm: "yes" })).status, 400);
    const okLink = await withToken(a, token, { confirm: true });
    assert.equal(okLink.status, 200);
    assert.ok(!okLink.text.includes("Anna") && !okLink.text.includes("jm7b-learner"), "a válaszban nincs tanulói adat");
    const [row] = await q<{ linked_learner_id: string }>(`SELECT linked_learner_id FROM player_accounts WHERE email = 'link-a@pelda.hu'`);
    assert.equal(row!.linked_learner_id, "jm7b-learner-1");
    // Amíg A-hoz kötött: B (közös eszköz, ugyanazzal a tokennel) 409-et kap.
    const b = await emailPlayer("link-b@pelda.hu");
    assert.equal((await withToken(b, token, { confirm: true })).status, 409, "a tanuló már másik fiókhoz kapcsolt");
    // Review #449 (K2): régi belépésű (nyitva hagyott) munkamenetből nem köthető.
    const bId = ((await b.request("GET", "/api/player/me")).json as { id: string }).id;
    const staleB = new Client(app.base, await injectSession({ player: { id: bId } }));
    await staleB.fetchCsrf();
    const staleLink = await withToken(staleB, token, { confirm: true });
    assert.deepEqual([staleLink.status, JSON.parse(staleLink.text).code], [401, "REAUTH_REQUIRED"]);
    // Review #449 (K2): az újrapárosítás (tokenrotáció) a régi tokennel kötött kapcsolatot BONTJA; a régi token érvénytelen,
    // az új, érvényes tokennel érkező köthet.
    await rotateLearnerToken("jm7b-learner-1");
    const [afterRotate] = await q<{ linked_learner_id: string | null }>(`SELECT linked_learner_id FROM player_accounts WHERE email = 'link-a@pelda.hu'`);
    assert.equal(afterRotate!.linked_learner_id, null, "a rotáció bontotta a kapcsolatot");
    assert.equal(((await a.request("GET", "/api/player/account")).json as { learnerLinked: boolean }).learnerLinked, false);
    assert.equal((await withToken(b, token, { confirm: true })).status, 400, "visszavont token");
    const fresh = learnerTokenFor("jm7b-learner-1", 2)!;
    assert.equal((await withToken(b, fresh, { confirm: true })).status, 200, "az új tokennel köthető");
    // A saját kapcsolat bármikor bontható; az admin is bonthatja.
    assert.equal((await b.request("POST", "/api/player/unlink-learner", {})).status, 200);
    assert.equal((await withToken(b, fresh, { confirm: true })).status, 200);
    const admin = await adminClient();
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${bId}/unlink-learner`, {})).status, 200);
    assert.equal(((await b.request("GET", "/api/player/account")).json as { learnerLinked: boolean }).learnerLinked, false, "admin-bontás");
    assert.equal((await b.request("POST", `/api/admin/game-accounts/${bId}/unlink-learner`, {})).status, 401, "játékos nem éri el az admin-bontást");
    assert.ok(!logged.some((l) => l.includes(token) || l.includes(fresh) || l.includes("Anna")), "token / tanulónév nem kerül naplóba");
  });
});

describe("JM7b — adatletöltés és fióktörlés (JM-A15)", () => {
  it("export: csak a saját adatok (a saját teljes címmel), letöltésként, más játékos adata nélkül", async () => {
    const other = await emailPlayer("masik-exporthoz@pelda.hu");
    await other.request("POST", "/api/player/profile", { nickname: "Titkos Holló" });
    const c = await emailPlayer("export@pelda.hu");
    await c.request("POST", "/api/player/profile", { nickname: "Export Panda", avatar: "hex-lime" });
    const res = await fetch(`${app.base}/api/player/export`, { method: "POST", headers: { "content-type": "application/json", origin: app.base, cookie: c.cookie!, "x-csrf-token": c.csrf! }, body: "{}" });
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-disposition") ?? "", /attachment; filename="websuli-fiokom\.json"/);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const text = await res.text();
    const data = JSON.parse(text) as { format: string; account: Record<string, unknown>; gameRuns: unknown[] };
    assert.equal(data.format, "websuli-player-export-v1");
    assert.equal(data.account.email, "export@pelda.hu");
    assert.equal(data.account.nickname, "Export Panda");
    assert.equal(data.account.avatar, "hex-lime");
    assert.ok(!text.includes("masik-exporthoz") && !text.includes("Titkos Holló"), "más játékos adata nincs benne");
    // Review #449 (A2): engedélylistás séma — belső azonosító (fiók, Google, tanuló, foglaltsági kulcs) nincs benne.
    // SPEC-VÁLTOZÁS 2026-11-16 (végrehajtás „JM7b-utójavítás K1” 6. lépés): + `retentionNote` — statikus adatvédelmi tájékoztató
    // szöveg a tiltás-ujjlenyomatról; az engedélylista továbbra is pontos, és a szöveg semmilyen személyes adatot nem tartalmaz.
    assert.deepEqual(Object.keys(data).sort(), ["account", "exportedAt", "format", "gameRuns", "loginCodes", "retentionNote"]);
    const note = (data as unknown as { retentionNote: string }).retentionNote;
    assert.ok(/ujjlenyomat/.test(note) && !note.includes("@") && !note.includes("export"), "statikus, PII nélküli tájékoztató");
    assert.deepEqual(Object.keys(data.account).sort(), ["avatar", "bannedAt", "createdAt", "email", "emailVerifiedAt", "googleLinked", "lastSeenAt", "learnerProfileLinked", "nickname"]);
    const ownId = ((await c.request("GET", "/api/player/me")).json as { id: string }).id;
    assert.ok(!text.includes(ownId), "a fiók belső azonosítója nincs az exportban");
    assert.ok(!/nicknameKey|linkedLearnerId|googleAccountId|friendCode/.test(text));
  });

  it("törlés: megerősítő szó + a fiók címére küldött EGYSZERI kód kell (review #449 A3); utána a fiók, a kódrekordok és MINDEN munkamenet törlődik, a tanuló marad, értesítő megy", async () => {
    await dbPool.query(`INSERT INTO learners (id, name, grade) VALUES ('jm7b-learner-del', 'Törlés Teszt', 4)`);
    const email = "torles@pelda.hu";
    const c = await emailPlayer(email);
    const id = ((await c.request("GET", "/api/player/me")).json as { id: string }).id;
    await dbPool.query(`UPDATE player_accounts SET linked_learner_id = 'jm7b-learner-del', nickname = 'Törlendő Teknős', nickname_key = 'torlendoteknos' WHERE id = $1`, [id]);
    // Egy második eszköz (nyitva hagyott) munkamenete.
    const second = new Client(app.base, await injectSession({ player: { id } }));
    await second.fetchCsrf();
    const key = playerAuthKey();
    const eh = emailHash(key, email);
    const mailWarns = () => logged.filter((l) => l.includes("belépő levél nem küldhető")).length;
    const before = mailWarns();
    assert.equal((await c.request("POST", "/api/player/account/delete/start", {})).status, 202, "a kódkérés mindig 202");
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(mailWarns(), before + 1, "a törlési kód levele kiküldésre került (a tesztben Resend nélkül)");
    // A teszt ismert kódot ültet el a szerverrel azonos, CÉLHOZ KÖTÖTT hash-sel (a valódi levél nem megy ki).
    const deh = purposeEmailHash(key, email, "delete");
    const plantDel = (code: string) => createPlayerStore(dbPool).insertCode({ emailNormalized: email, emailHash: deh, limitHash: limitHash(key, email), codeHash: codeHash(key, deh, `del:${code}`), linkHash: linkHash(key, generateLinkToken()) });
    await plantDel("55556666");

    assert.equal((await c.request("POST", "/api/player/account/delete", {})).status, 400);
    assert.equal((await c.request("POST", "/api/player/account/delete", { confirm: "torlom", code: "55556666" })).status, 400);
    const noCode = await second.request("POST", "/api/player/account/delete", { confirm: "TÖRLÖM", code: "" });
    assert.deepEqual([noCode.status, (noCode.json as { code: string }).code], [400, "CODE_INVALID"], "nyitva hagyott munkamenetből kód nélkül nem törölhető");
    assert.equal((await second.request("POST", "/api/player/account/delete", { confirm: "TÖRLÖM", code: "00000000" })).status, 400, "rossz kóddal nem törölhető");
    // Egy BELÉPŐ kód (cél nélküli hash) törlésre nem jó.
    await createPlayerStore(dbPool).insertCode({ emailNormalized: email, emailHash: eh, limitHash: limitHash(key, email), codeHash: codeHash(key, eh, "77778888"), linkHash: linkHash(key, generateLinkToken()) });
    assert.equal((await c.request("POST", "/api/player/account/delete", { confirm: "TÖRLÖM", code: "77778888" })).status, 400, "belépőkód törlésre nem használható");
    assert.equal((await q(`SELECT 1 FROM player_accounts WHERE id = $1`, [id])).length, 1, "eddig semmi nem törlődött");
    await plantDel("12341234");
    const beforeDelete = mailWarns();
    const del = await c.request("POST", "/api/player/account/delete", { confirm: "TÖRLÖM", code: "1234 1234" });
    assert.equal(del.status, 200, del.text);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(mailWarns(), beforeDelete + 1, "az értesítő levél kiküldésre került");
    const deleted = (del.json as { deleted: { account: number; codes: number; sessions: number } }).deleted;
    assert.equal(deleted.account, 1);
    assert.ok(deleted.codes >= 2, "a belépéskori és a függő kódrekord is");
    assert.ok(deleted.sessions >= 2, "mindkét eszköz munkamenete");
    assert.equal((await q(`SELECT 1 FROM player_accounts WHERE id = $1`, [id])).length, 0);
    assert.equal((await q(`SELECT 1 FROM player_auth_codes WHERE email_hash = ANY($1::text[])`, [allPurposeEmailHashes(key, email)])).length, 0, "mindkét cél kódrekordjai törlődtek");
    assert.equal((await q(`SELECT 1 FROM session WHERE sess -> 'player' ->> 'id' = $1`, [id])).length, 0);
    assert.equal((await q(`SELECT 1 FROM learners WHERE id = 'jm7b-learner-del'`)).length, 1, "a tanulói profil megmarad");
    assert.equal((await second.request("GET", "/api/player/me")).json, null, "a másik eszköz is kilépett");
    // A becenév felszabadul.
    const n = await emailPlayer("uj-tulaj@pelda.hu");
    assert.equal((await n.request("POST", "/api/player/profile", { nickname: "Törlendő Teknős" })).status, 200);
    assert.ok(!logged.some((l) => l.includes(email)), "a törölt cím nem kerül naplóba");
  });
});

describe("JM7b — review #449: belépő- és törlési kód cél szerint elkülönítve", () => {
  const store = createPlayerStore(dbPool);
  const key = () => playerAuthKey();
  const plant = (email: string, purpose: "login" | "delete", code: string, ageMs = 0) => {
    const k = key();
    const h = purposeEmailHash(k, email, purpose);
    return store.insertCode({ emailNormalized: email, emailHash: h, limitHash: limitHash(k, email), codeHash: codeHash(k, h, purpose === "delete" ? `del:${code}` : code), linkHash: linkHash(k, generateLinkToken()) })
      .then(async () => { if (ageMs) await dbPool.query(`UPDATE player_auth_codes SET created_at = now() - ($1::int * interval '1 millisecond') WHERE email_hash = $2`, [ageMs, h]); });
  };

  it("törlési kóddal NEM lehet belépni; belépőkóddal NEM lehet törölni (mindkét keresztirány)", async () => {
    const email = "kereszt@pelda.hu";
    await emailPlayer(email); // fiók
    await plant(email, "delete", "31313131");
    const guest = new Client(app.base);
    const r = await guest.request("POST", "/api/player/auth/verify", { kind: "code", email, code: "31313131" });
    assert.deepEqual([r.status, r.json], [400, { ok: false, code: "INVALID_OR_EXPIRED" }], "törlési kód belépésre");
    const c = await emailPlayer(email);
    await plant(email, "login", "42424243");
    assert.equal((await c.request("POST", "/api/player/account/delete", { confirm: "TÖRLÖM", code: "42424243" })).status, 400, "belépőkód törlésre");
    assert.equal((await q(`SELECT 1 FROM player_accounts WHERE email = $1`, [email])).length, 1);
  });

  it("egy újabb belépőkód nem érvényteleníti a függő törlési kódot, és fordítva", async () => {
    const email = "fuggo@pelda.hu";
    const c = await emailPlayer(email);
    await plant(email, "delete", "50505050");
    await plant(email, "login", "60606060"); // a törlési kód UTÁN kért belépőkód
    // A belépőkód is működik (a törlési kód nem „legutóbbi”-ja a belépésnek).
    const other = new Client(app.base);
    assert.equal((await other.request("POST", "/api/player/auth/verify", { kind: "code", email, code: "60606060" })).status, 200);
    // …és a korábbi törlési kód is beváltható.
    assert.equal((await c.request("POST", "/api/player/account/delete", { confirm: "TÖRLÖM", code: "50505050" })).status, 200);
  });

  it("a törlési kód a kérő munkamenet játékosához kötött: más fiók munkamenetéből nem váltható be", async () => {
    const a = "kotott-a@pelda.hu";
    await emailPlayer(a);
    await plant(a, "delete", "70707070");
    const b = await emailPlayer("kotott-b@pelda.hu");
    assert.equal((await b.request("POST", "/api/player/account/delete", { confirm: "TÖRLÖM", code: "70707070" })).status, 400);
    assert.equal((await q(`SELECT 1 FROM player_accounts WHERE email IN ($1, $2)`, [a, "kotott-b@pelda.hu"])).length, 2);
  });

  it("a törlési kód hibás próbái a cím közös napi plafonjába számítanak (utána a helyes belépőkód sem megy át)", async () => {
    const email = "plafon-kozos@pelda.hu";
    const k = key();
    const deh = purposeEmailHash(k, email, "delete");
    const eh = emailHash(k, email);
    const scope = allPurposeEmailHashes(k, email);
    for (let rec = 0; rec < Math.ceil(MAX_FAILED_ATTEMPTS_PER_DAY / 5); rec++) {
      await plant(email, "delete", `8888000${rec}`);
      for (let i = 0; i < 5; i++) assert.equal(await store.consumeCode(deh, codeHash(k, deh, "del:00000000"), scope), null);
    }
    await plant(email, "login", "12121212");
    assert.equal(await store.consumeCode(eh, codeHash(k, eh, "12121212"), scope), null, "a közös plafon betelt");
  });

  it("a levélkeret célonként összesítve: a törlési kódkérések a belépő levelek címenkénti keretét is fogyasztják", async () => {
    const email = "keret-kozos@pelda.hu";
    const k = key();
    const reserve = (purpose: "login" | "delete") => {
      const h = purposeEmailHash(k, email, purpose);
      return store.reserveCode({ emailNormalized: email, emailHash: h, limitHash: limitHash(k, email), codeHash: codeHash(k, h, "x"), linkHash: linkHash(k, generateLinkToken()) });
    };
    assert.deepEqual([await reserve("delete"), await reserve("delete"), await reserve("delete")], ["OK", "OK", "OK"]);
    assert.equal(await reserve("login"), "KEY_LIMIT", "a törlési kérések után a belépő levél kerete is betelt");
  });

  it("N3: idegen kimeríti a belépő levélkeretet ÉS a belépési hibás-próba plafont → a tulajdonos élő munkamenetből kér és bevált törlési kódot", async () => {
    const email = "n3-idegen@pelda.hu";
    const k = key();
    const owner = await emailPlayer(email);
    const attacker = new Client(app.base);
    const wrongLogin = async () => assert.equal((await attacker.request("POST", "/api/player/auth/verify", { kind: "code", email, code: "00000000" })).status, 400);
    // Idegen: kódkérés + 5 rossz próba, újabb kódkérés + 5 rossz próba (a valódi végpontokon), majd a keret kimerítése.
    for (let round = 0; round < 2; round++) {
      assert.equal((await attacker.request("POST", "/api/player/auth/start", { email })).status, 202);
      for (let i = 0; i < 5; i++) await wrongLogin();
    }
    for (let i = 0; i < 3; i++) assert.equal((await attacker.request("POST", "/api/player/auth/start", { email })).status, 202);
    const loginReserve = () => store.reserveCode(
      { emailNormalized: email, emailHash: emailHash(k, email), limitHash: limitHash(k, email), codeHash: codeHash(k, emailHash(k, email), "x"), linkHash: linkHash(k, generateLinkToken()) },
      {}, [limitHash(k, email), deleteLimitHash(k, email)],
    );
    assert.equal(await loginReserve(), "KEY_LIMIT", "a belépő levélkeret betelt");
    await plant(email, "login", "13571357");
    assert.equal((await new Client(app.base).request("POST", "/api/player/auth/verify", { kind: "code", email, code: "13571357" })).status, 400, "a belépési plafon betelt (helyes kóddal is)");
    // A tulajdonos: a törlési kódkérés rekordot foglal (saját keret), és a törlési kód beváltható (saját plafon).
    const deh = purposeEmailHash(k, email, "delete");
    assert.equal((await owner.request("POST", "/api/player/account/delete/start", {})).status, 202);
    assert.equal((await q(`SELECT 1 FROM player_auth_codes WHERE email_hash = $1`, [deh])).length, 1, "a törlési kód elkészült (nem akadt el a belépő kereten)");
    await plant(email, "delete", "24682468");
    const del = await owner.request("POST", "/api/player/account/delete", { confirm: "TÖRLÖM", code: "24682468" });
    assert.equal(del.status, 200, del.text);
    assert.equal((await q(`SELECT 1 FROM player_accounts WHERE email = $1`, [email])).length, 0);
  });

  it("N3 fordítva: a törlési hibák NEM nyitnak többlet-próbát a belépésre (közös 10), a törlés saját plafonja pedig a belépéstől független", async () => {
    const email = "n3-fordit@pelda.hu";
    const owner = await emailPlayer(email);
    await plant(email, "delete", "11223344");
    for (let i = 0; i < 5; i++) assert.equal((await owner.request("POST", "/api/player/account/delete", { confirm: "TÖRLÖM", code: "00000000" })).status, 400);
    await plant(email, "login", "55667788");
    const guest = new Client(app.base);
    for (let i = 0; i < 5; i++) assert.equal((await guest.request("POST", "/api/player/auth/verify", { kind: "code", email, code: "00000000" })).status, 400);
    await plant(email, "login", "99887766");
    assert.equal((await guest.request("POST", "/api/player/auth/verify", { kind: "code", email, code: "99887766" })).status, 400,
      "5 törlési + 5 belépési hiba = a belépés napi plafonja (helyes kóddal is zárva)");
    // A törlés saját tartományában csak 5 hiba van: a friss törlési kód működik.
    await plant(email, "delete", "44332211");
    assert.equal((await owner.request("POST", "/api/player/account/delete", { confirm: "TÖRLÖM", code: "44332211" })).status, 200);
  });

  it("N3: a törlés saját napi plafonja is 10 hibás próba (a tulajdonos munkamenetéből sem korlátlan)", async () => {
    const email = "n3-sajat@pelda.hu";
    const k = key();
    const deh = purposeEmailHash(k, email, "delete");
    const loginScope = allPurposeEmailHashes(k, email);
    for (let rec = 0; rec < Math.ceil(MAX_FAILED_ATTEMPTS_PER_DAY / 5); rec++) {
      await plant(email, "delete", `7777000${rec}`);
      for (let i = 0; i < 5; i++) assert.equal(await store.consumeCode(deh, codeHash(k, deh, "del:00000000"), [deh], loginScope), null);
    }
    await plant(email, "delete", "65656565");
    assert.equal(await store.consumeCode(deh, codeHash(k, deh, "del:65656565"), [deh], loginScope), null, "a törlés saját plafonja betelt");
  });

  it("a takarítás mindkét cél régi rekordjait törli", async () => {
    const email = "takaritas@pelda.hu";
    await plant(email, "delete", "90909090", 25 * 60 * 60_000);
    await plant(email, "login", "91919191", 25 * 60 * 60_000);
    await store.purgeOldCodes();
    assert.equal((await q(`SELECT 1 FROM player_auth_codes WHERE email_hash = ANY($1::text[])`, [allPurposeEmailHashes(key(), email)])).length, 0);
  });
});

describe("JM7b — admin „Játékosok”: lista, tiltás, azonnali hatás", () => {
  it("lista maszkolt címmel; teljes cím csak külön admin-kérésre; tiltás a belépett játékosra azonnal hat, feloldás visszaadja", async () => {
    const admin = await adminClient();
    const p = await emailPlayer("tiltando@pelda.hu");
    await p.request("POST", "/api/player/profile", { nickname: "Tiltandó Tigris" });
    const id = ((await p.request("GET", "/api/player/me")).json as { id: string }).id;
    const list = await admin.request("GET", "/api/admin/game-accounts?q=tiltand");
    assert.equal(list.status, 200);
    const row = (list.json as { players: { id: string; maskedEmail: string; nickname: string; banned: boolean }[] }).players.find((x) => x.id === id)!;
    assert.deepEqual([row.maskedEmail, row.nickname, row.banned], ["t***@p***.hu", "Tiltandó Tigris", false]);
    assert.ok(!list.text.includes("tiltando@pelda.hu"), "a listában nincs teljes cím");
    assert.equal(((await admin.request("GET", `/api/admin/game-accounts/${id}/email`)).json as { email: string }).email, "tiltando@pelda.hu");

    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${id}/ban`, {})).status, 200);
    const blocked = await p.request("GET", "/api/player/account");
    assert.deepEqual([blocked.status, (blocked.json as { code: string }).code], [403, "BANNED"], "a már belépett játékos azonnal kizárva");
    assert.equal((await p.request("POST", "/api/player/profile", { nickname: "Más Név" })).status, 403);
    assert.equal((await p.request("GET", "/api/player/me")).status, 403);
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${id}/unban`, {})).status, 200);
    assert.equal((await p.request("GET", "/api/player/account")).status, 200);
    assert.equal((await admin.request("POST", "/api/admin/game-accounts/nincs-ilyen/ban", {})).status, 404);
    assert.ok(!logged.some((l) => l.includes("tiltando@pelda.hu")), "a napló maszkolt");
  });

  it("nem admin (játékos, vendég) nem éri el az admin „Játékosok” végpontjait", async () => {
    const p = await emailPlayer("kivancsi@pelda.hu");
    for (const [m, path] of [["GET", "/api/admin/game-accounts"], ["GET", "/api/admin/game-accounts/x/email"], ["POST", "/api/admin/game-accounts/x/ban"]] as const) {
      assert.equal((await p.request(m, path, m === "GET" ? undefined : {})).status, 401);
    }
  });
});

describe("JM7b-utójavítás N2 — tiltott játékos saját adatai, admin végleges törlés (tulajdonosi döntés 2026-11-16)", () => {
  const plantDelete = (email: string, code: string) => {
    const k = playerAuthKey();
    const deh = purposeEmailHash(k, email, "delete");
    return createPlayerStore(dbPool).insertCode({ emailNormalized: email, emailHash: deh, limitHash: limitHash(k, email), codeHash: codeHash(k, deh, `del:${code}`), linkHash: linkHash(k, generateLinkToken()) });
  };
  /** Tiltott fiók VALÓDI kódos beváltása: 403 BANNED + korlátozott munkamenet. */
  async function bannedLogin(email: string): Promise<Client> {
    const key = playerAuthKey();
    const eh = emailHash(key, email);
    await createPlayerStore(dbPool).insertCode({ emailNormalized: email, emailHash: eh, limitHash: limitHash(key, email), codeHash: codeHash(key, eh, "36925814"), linkHash: linkHash(key, generateLinkToken()) });
    const c = new Client(app.base);
    const r = await c.request("POST", "/api/player/auth/verify", { kind: "code", email, code: "36925814" });
    assert.deepEqual([r.status, r.json], [403, { ok: false, code: "BANNED", restricted: true }]);
    await c.fetchCsrf();
    return c;
  }

  it("a tiltott játékos (friss, korlátozott belépéssel) letölti az adatait és törli a fiókját; minden más fiók-végpont 403", async () => {
    const admin = await adminClient();
    const email = "n2-tiltott@pelda.hu";
    const p = await emailPlayer(email);
    assert.equal((await p.request("POST", "/api/player/profile", { nickname: "Tiltott Teknős" })).status, 200);
    const id = ((await p.request("GET", "/api/player/me")).json as { id: string }).id;
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${id}/ban`, {})).status, 200);
    const b = await bannedLogin(email);
    // Minden más tiltva marad.
    for (const [m, path, body] of [
      ["GET", "/api/player/me", undefined], ["GET", "/api/player/account", undefined], ["GET", "/api/player/nickname-suggestions", undefined],
      ["POST", "/api/player/profile", { nickname: "Más Név" }], ["POST", "/api/player/link-learner", { confirm: true }], ["POST", "/api/player/unlink-learner", {}],
    ] as const) {
      const r = await b.request(m, path, body);
      assert.deepEqual([r.status, (r.json as { code?: string }).code], [403, "BANNED"], `${m} ${path}`);
    }
    assert.equal((await q<{ nickname: string }>(`SELECT nickname FROM player_accounts WHERE id = $1`, [id]))[0]!.nickname, "Tiltott Teknős", "a becenév nem változott");
    // Adatletöltés: csak a saját adatok, a tiltás ténye is benne.
    const exp = await b.request("POST", "/api/player/export", {});
    assert.equal(exp.status, 200, exp.text);
    const data = exp.json as { account: { email: string; nickname: string; bannedAt: string | null } };
    assert.deepEqual([data.account.email, data.account.nickname, data.account.bannedAt !== null], [email, "Tiltott Teknős", true]);
    // Törlés: ugyanazokkal a védelmekkel (kódkérés a fiók címére, megerősítő szó, célhoz kötött kód).
    assert.equal((await b.request("POST", "/api/player/account/delete/start", {})).status, 202);
    assert.equal((await q(`SELECT 1 FROM player_auth_codes WHERE email_hash = $1`, [purposeEmailHash(playerAuthKey(), email, "delete")])).length, 1, "a törlési kód elkészült");
    await plantDelete(email, "14725836");
    assert.equal((await b.request("POST", "/api/player/account/delete", { confirm: "TÖRLÖM", code: "00000000" })).status, 400, "rossz kóddal nem");
    assert.equal((await b.request("POST", "/api/player/account/delete", { confirm: "torlom", code: "14725836" })).status, 400, "megerősítő szó nélkül nem");
    const del = await b.request("POST", "/api/player/account/delete", { confirm: "TÖRLÖM", code: "14725836" });
    assert.equal(del.status, 200, del.text);
    assert.equal((await q(`SELECT 1 FROM player_accounts WHERE id = $1`, [id])).length, 0);
    assert.equal((await q(`SELECT 1 FROM session WHERE sess -> 'player' ->> 'id' = $1`, [id])).length, 0, "minden munkamenet törölve");
  });

  it("korlátozott munkamenet nélkül (vendég) a saját-adat végpontok 401-et adnak", async () => {
    const guest = new Client(app.base);
    await guest.fetchCsrf();
    for (const path of ["/api/player/export", "/api/player/account/delete/start", "/api/player/account/delete"]) {
      assert.equal((await guest.request("POST", path, path.endsWith("/delete") ? { confirm: "TÖRLÖM", code: "12345678" } : {})).status, 401, path);
    }
  });

  it("admin VÉGLEGES törlés: megerősítő szó nélkül semmi; megerősítéssel a saját törléssel azonos hatás; napló maszkolt", async () => {
    await dbPool.query(`INSERT INTO learners (id, name, grade) VALUES ('n2-learner', 'N2 Teszt', 5) ON CONFLICT DO NOTHING`);
    const admin = await adminClient();
    const email = "n2-admin-torol@pelda.hu";
    const p = await emailPlayer(email);
    const id = ((await p.request("GET", "/api/player/me")).json as { id: string }).id;
    await dbPool.query(`UPDATE player_accounts SET linked_learner_id = 'n2-learner' WHERE id = $1`, [id]);
    await plantDelete(email, "25836914"); // függő kódrekord
    for (const body of [{}, { confirm: "torles" }, { confirm: "TÖRLÉS", extra: 1 }]) {
      assert.equal((await admin.request("POST", `/api/admin/game-accounts/${id}/delete`, body)).status, 400, JSON.stringify(body));
    }
    assert.equal((await q(`SELECT 1 FROM player_accounts WHERE id = $1`, [id])).length, 1, "megerősítés nélkül semmi nem törlődött");
    assert.equal((await admin.request("POST", "/api/admin/game-accounts/nincs-ilyen/delete", { confirm: "TÖRLÉS" })).status, 404);
    const r = await admin.request("POST", `/api/admin/game-accounts/${id}/delete`, { confirm: "TÖRLÉS" });
    assert.equal(r.status, 200, r.text);
    const deleted = (r.json as { deleted: { account: number; codes: number; sessions: number } }).deleted;
    assert.deepEqual([deleted.account, deleted.codes >= 2, deleted.sessions >= 1], [1, true, true]);
    assert.equal((await q(`SELECT 1 FROM player_accounts WHERE id = $1`, [id])).length, 0);
    assert.equal((await q(`SELECT 1 FROM player_auth_codes WHERE email_hash = ANY($1::text[])`, [allPurposeEmailHashes(playerAuthKey(), email)])).length, 0);
    assert.equal((await p.request("GET", "/api/player/me")).json, null, "a játékos munkamenete megszűnt");
    assert.equal((await q(`SELECT 1 FROM learners WHERE id = 'n2-learner'`)).length, 1, "a tanulói profil megmarad");
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${id}/delete`, { confirm: "TÖRLÉS" })).status, 404, "másodszor nincs mit törölni");
    assert.ok(!logged.some((l) => l.includes(email)), "a napló maszkolt");
  });

  it("játékos, tiltott játékos és vendég NEM éri el az admin-törlést (401), és semmi nem törlődik", async () => {
    const admin = await adminClient();
    const victimEmail = "n2-aldozat@pelda.hu";
    const victim = await emailPlayer(victimEmail);
    const victimId = ((await victim.request("GET", "/api/player/me")).json as { id: string }).id;
    const player = await emailPlayer("n2-jatekos@pelda.hu");
    const bannedEmail = "n2-tiltott2@pelda.hu";
    const bp = await emailPlayer(bannedEmail);
    const bannedId = ((await bp.request("GET", "/api/player/me")).json as { id: string }).id;
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${bannedId}/ban`, {})).status, 200);
    const banned = await bannedLogin(bannedEmail);
    const guest = new Client(app.base);
    await guest.fetchCsrf();
    for (const [name, c] of [["játékos", player], ["tiltott játékos", banned], ["vendég", guest]] as const) {
      for (const target of [victimId, bannedId]) {
        assert.equal((await c.request("POST", `/api/admin/game-accounts/${target}/delete`, { confirm: "TÖRLÉS" })).status, 401, `${name} → ${target}`);
      }
    }
    assert.equal((await q(`SELECT 1 FROM player_accounts WHERE id IN ($1, $2)`, [victimId, bannedId])).length, 2);
  });
});

describe("JM7b-utójavítás K1 — a tiltás megmarad a fiók törlése után (ujjlenyomat; tulajdonosi döntés 2026-11-16)", () => {
  const fp = (email: string) => banFingerprint(playerAuthKey(), normalizeEmail(email)!);
  const fpRows = async (email: string) => q(`SELECT 1 FROM player_ban_fingerprints WHERE fingerprint = $1`, [fp(email)]);
  /** VALÓDI kódos beváltás tetszőleges (nem normalizált) címmel; a státuszt és a választ adja vissza. */
  async function codeLogin(raw: string): Promise<{ client: Client; status: number; body: unknown }> {
    const key = playerAuthKey();
    const email = normalizeEmail(raw)!;
    const eh = emailHash(key, email);
    await createPlayerStore(dbPool).insertCode({ emailNormalized: email, emailHash: eh, limitHash: limitHash(key, email), codeHash: codeHash(key, eh, "75319864"), linkHash: linkHash(key, generateLinkToken()) });
    const c = new Client(app.base);
    const r = await c.request("POST", "/api/player/auth/verify", { kind: "code", email: raw, code: "75319864" });
    await c.fetchCsrf();
    return { client: c, status: r.status, body: r.json };
  }
  const BANNED_BODY = { ok: false, code: "BANNED", restricted: true };
  async function selfDelete(c: Client, email: string) {
    const k = playerAuthKey();
    const deh = purposeEmailHash(k, normalizeEmail(email)!, "delete");
    await createPlayerStore(dbPool).insertCode({ emailNormalized: normalizeEmail(email)!, emailHash: deh, limitHash: limitHash(k, email), codeHash: codeHash(k, deh, "del:86429753"), linkHash: linkHash(k, generateLinkToken()) });
    const r = await c.request("POST", "/api/player/account/delete", { confirm: "TÖRLÖM", code: "86429753" });
    assert.equal(r.status, 200, r.text);
  }
  const idOf = async (email: string) => (await q<{ id: string }>(`SELECT id FROM player_accounts WHERE email = $1`, [normalizeEmail(email)!]))[0]?.id;

  it("tiltott saját törlés → ugyanaz a cím (és kis- / nagybetű, gmail-pont, +alias változata) újra belépve TILTOTT marad", async () => {
    const admin = await adminClient();
    const email = "k1.tiltott@gmail.com";
    const first = await codeLogin(email);
    assert.equal(first.status, 200);
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${await idOf(email)}/ban`, {})).status, 200);
    const restricted = await codeLogin(email);
    assert.deepEqual([restricted.status, restricted.body], [403, BANNED_BODY]);
    await selfDelete(restricted.client, email);
    assert.equal((await fpRows(email)).length, 1, "az ujjlenyomat megmaradt");
    assert.deepEqual(Object.keys((await q(`SELECT * FROM player_ban_fingerprints WHERE fingerprint = $1`, [fp(email)]))[0]!).sort(), ["banned_at", "created_at", "fingerprint"], "cím nem tárolódik");
    for (const variant of [email, "K1.Tiltott@Gmail.com", "k1tiltott@gmail.com", "k1.tiltott+uj@gmail.com"]) {
      const again = await codeLogin(variant);
      assert.deepEqual([again.status, again.body], [403, BANNED_BODY], variant);
      assert.equal((await again.client.request("POST", "/api/player/profile", { nickname: "Újra Itt" })).status, 403, `${variant}: profil tiltva`);
      const row = (await q<{ banned_at: Date | null }>(`SELECT banned_at FROM player_accounts WHERE email = $1`, [normalizeEmail(variant)!]))[0]!;
      assert.ok(row.banned_at !== null, `${variant}: az új fiók tiltottként jött létre`);
    }
  });

  it("admin-törlés után ugyanez — a Google-úton létrejövő új fiók is tiltott; idegen cím érintetlen", async () => {
    const admin = await adminClient();
    const email = "k1-admin-torles@pelda.hu";
    assert.equal((await codeLogin(email)).status, 200);
    const id = (await idOf(email))!;
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${id}/ban`, {})).status, 200);
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${id}/delete`, { confirm: "TÖRLÉS" })).status, 200);
    assert.equal((await fpRows(email)).length, 1);
    const google = await createPlayerAccountStore(dbPool).upsertGooglePlayer("g-sub-k1", email);
    assert.deepEqual([google.kind, google.kind === "OK" && google.banned], ["OK", true], "Google-úton is tiltott");
    const stranger = await codeLogin("k1-idegen@pelda.hu");
    assert.equal(stranger.status, 200, "idegen címre nincs hatás");
  });

  it("NEM tiltott fiók törlése nem hagy ujjlenyomatot; újra belépve rendes fiók", async () => {
    const email = "k1-rendes@pelda.hu";
    const c = await codeLogin(email);
    assert.equal(c.status, 200);
    await selfDelete(c.client, email);
    assert.equal((await fpRows(email)).length, 0);
    assert.equal((await codeLogin(email)).status, 200);
  });

  it("feloldás: a „törölt, de tiltva maradt” bejegyzés cím nélkül listázódik és feloldható; élő fiók feloldása is törli az ujjlenyomatot", async () => {
    const admin = await adminClient();
    const email = "k1-feloldas@pelda.hu";
    assert.equal((await codeLogin(email)).status, 200);
    let id = (await idOf(email))!;
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${id}/ban`, {})).status, 200);
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${id}/delete`, { confirm: "TÖRLÉS" })).status, 200);
    const list = await admin.request("GET", "/api/admin/game-accounts/deleted-bans");
    assert.equal(list.status, 200);
    const entries = (list.json as { entries: { ref: string; bannedAt: string; deletedAt: string }[] }).entries;
    const mine = entries.find((e) => fp(email).startsWith(e.ref));
    assert.ok(mine, "a bejegyzés listázódik");
    assert.deepEqual(Object.keys(mine).sort(), ["bannedAt", "deletedAt", "ref"]);
    assert.ok(!list.text.includes("k1-feloldas") && !list.text.includes("pelda.hu") && !list.text.includes(fp(email)), "se cím, se maszk, se teljes ujjlenyomat");
    assert.equal((await admin.request("POST", "/api/admin/game-accounts/deleted-bans/zz/unban", {})).status, 400);
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/deleted-bans/${"0".repeat(16)}/unban`, {})).status, 404);
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/deleted-bans/${mine.ref}/unban`, {})).status, 200);
    assert.equal((await fpRows(email)).length, 0);
    assert.equal((await codeLogin(email)).status, 200, "feloldás után rendes fiók");
    // Élő fiók: tiltott törlés → tiltottként újra létrejön → az élő fiók feloldása az ujjlenyomatot is viszi.
    id = (await idOf(email))!;
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${id}/ban`, {})).status, 200);
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${id}/delete`, { confirm: "TÖRLÉS" })).status, 200);
    assert.equal((await codeLogin(email)).status, 403);
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${(await idOf(email))!}/unban`, {})).status, 200);
    assert.equal((await fpRows(email)).length, 0, "az élő fiók feloldása az ujjlenyomatot is törölte");
    assert.ok(!logged.some((l) => l.includes(email)), "a napló maszkolt");
  });

  // #471 review (1.): a törlés és a létrehozás közös címenkénti zárral sorosított.
  const LOCK_SQL = `SELECT pg_advisory_xact_lock(hashtextextended($1, 7041))`;
  const settled = <T>(p: Promise<T>) => { const s = { done: false }; void p.then(() => { s.done = true; }, () => { s.done = true; }); return s; };
  const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
  async function bannedRow(email: string): Promise<string> {
    const { rows } = await dbPool.query<{ id: string }>(`INSERT INTO player_accounts (email, email_verified_at, banned_at) VALUES ($1, now(), now()) RETURNING id`, [email]);
    return rows[0]!.id;
  }

  it("verseny (1. sorrend): a nem commitolt tiltott-törlés alatt induló létrehozás VÁR, és tiltottként jön létre (kód / link és Google)", async () => {
    for (const via of ["code", "google"] as const) {
      const email = `k1-verseny-a-${via}@pelda.hu`;
      await bannedRow(email);
      const c1 = await dbPool.connect();
      try {
        await c1.query("BEGIN");
        await c1.query(LOCK_SQL, [fp(email)]);
        await c1.query(`INSERT INTO player_ban_fingerprints (fingerprint, banned_at) VALUES ($1, now())`, [fp(email)]);
        await c1.query(`DELETE FROM player_accounts WHERE email = $1`, [email]);
        const creating = via === "code"
          ? createPlayerStore(dbPool).confirmVerifiedEmail(email).then((r) => r.banned)
          : createPlayerAccountStore(dbPool).upsertGooglePlayer(`g-sub-race-${email}`, email).then((r) => r.kind === "OK" && r.banned);
        const state = settled(creating);
        await pause(300);
        assert.equal(state.done, false, `${via}: a létrehozás a törlés commitjáig vár`);
        await c1.query("COMMIT");
        assert.equal(await creating, true, `${via}: tiltottként jött létre`);
      } finally {
        c1.release();
      }
      assert.ok((await q<{ banned_at: Date | null }>(`SELECT banned_at FROM player_accounts WHERE email = $1`, [email]))[0]!.banned_at !== null);
    }
  });

  it("verseny (2. sorrend): a folyamatban lévő létrehozás alatt induló törlés VÁR; utána a törlés tiltott fióknál ujjlenyomatot hagy", async () => {
    const email = "k1-verseny-b@pelda.hu";
    const id = await bannedRow(email);
    const c1 = await dbPool.connect();
    try {
      await c1.query("BEGIN");
      await c1.query(LOCK_SQL, [fp(email)]);
      const deleting = createPlayerAccountStore(dbPool).deleteAccount(id, (e) => allPurposeEmailHashes(playerAuthKey(), e));
      const state = settled(deleting);
      await pause(300);
      assert.equal(state.done, false, "a törlés a létrehozó zárjáig vár");
      await c1.query("COMMIT");
      assert.equal((await deleting)!.account, 1);
    } finally {
      c1.release();
    }
    assert.equal((await fpRows(email)).length, 1);
  });

  it("verseny, sokszor ismételve (valódi párhuzamos törlés + létrehozás): soha nem marad tiltás nélküli fiók", async () => {
    const accounts = createPlayerAccountStore(dbPool);
    const store = createPlayerStore(dbPool);
    for (let i = 0; i < 25; i++) {
      const email = `k1-ismetelt-${i}@pelda.hu`;
      const id = await bannedRow(email);
      const create = i % 2 === 0 ? store.confirmVerifiedEmail(email) : accounts.upsertGooglePlayer(`g-sub-rep-${i}`, email);
      await Promise.all([accounts.deleteAccount(id, (e) => allPurposeEmailHashes(playerAuthKey(), e)), create]);
      const rows = await q<{ banned_at: Date | null }>(`SELECT banned_at FROM player_accounts WHERE email = $1`, [email]);
      assert.ok(rows.every((r) => r.banned_at !== null), `${i}: tiltás nélküli fiók maradt`);
      assert.equal((await fpRows(email)).length, 1, `${i}: az ujjlenyomat megmaradt`);
    }
  });

  it("#471 review (2.): tiltás → törlés → újrabelépés (tiltott) → a törölt-tiltott feloldása az élő fiókot is feloldja; utána a törlés nyomtalan", async () => {
    const admin = await adminClient();
    const email = "k1.felold2@gmail.com";
    assert.equal((await codeLogin(email)).status, 200);
    let id = (await idOf(email))!;
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${id}/ban`, {})).status, 200);
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${id}/delete`, { confirm: "TÖRLÉS" })).status, 200);
    const variant = "k1felold2+x@gmail.com";
    const again = await codeLogin(variant);
    assert.deepEqual([again.status, again.body], [403, BANNED_BODY], "a változattal újra létrejött fiók tiltott");
    assert.equal((await fpRows(email)).length, 1, "az ujjlenyomat megmarad (egy MÁSIK változat is tiltott maradjon)");
    assert.deepEqual([(await codeLogin("k1.felold2@gmail.com")).status], [403], "a harmadik változat is tiltott");
    const ref = fp(email).slice(0, 16);
    const unban = await admin.request("POST", `/api/admin/game-accounts/deleted-bans/${ref}/unban`, {});
    assert.deepEqual([unban.status, (unban.json as { unbannedAccounts: number }).unbannedAccounts], [200, 2], "mindkét élő változat feloldva");
    const normal = await codeLogin(variant);
    assert.equal(normal.status, 200, "a játékos rendesen belép");
    assert.equal((await normal.client.request("POST", "/api/player/profile", { nickname: "Feloldott Fóka" })).status, 200);
    id = (await idOf(variant))!;
    await selfDelete(normal.client, variant);
    assert.equal((await fpRows(email)).length, 0, "feloldás után a törlés nem hagy ujjlenyomatot");
    assert.equal((await q(`SELECT 1 FROM player_accounts WHERE id = $1`, [id])).length, 0);
  });

  it("K1-b (#469/#471 review): ÉLŐ tiltott fióknál a cím-változatok (gmail-pont, +alias, googlemail) és a Google-út is tiltott; a korábbi alias-fiók is; a feloldás mindet visszaadja", async () => {
    const admin = await adminClient();
    const email = "aliasproba@gmail.com";
    const older = await codeLogin("aliasproba+regi@gmail.com"); // a tiltás ELŐTT nyitott alias-fiók
    assert.equal(older.status, 200);
    assert.equal((await codeLogin(email)).status, 200);
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${await idOf(email)}/ban`, {})).status, 200);
    assert.equal((await fpRows(email)).length, 1, "az ujjlenyomat már a tiltáskor létrejön");
    assert.equal((await older.client.request("GET", "/api/player/me")).status, 403, "a korábbi alias-fiók élő munkamenete is tiltott");
    for (const variant of ["alias.proba+2@gmail.com", "aliasproba@googlemail.com", "Alias.Proba@Gmail.com", "a.l.i.a.s.proba@gmail.com"]) {
      const r = await codeLogin(variant);
      assert.deepEqual([r.status, r.body], [403, BANNED_BODY], variant);
    }
    const google = await createPlayerAccountStore(dbPool).upsertGooglePlayer("g-sub-alias", "alias.proba+g@gmail.com");
    assert.deepEqual([google.kind, google.kind === "OK" && google.banned], ["OK", true], "Google-úton is tiltott");
    const listed = ((await admin.request("GET", "/api/admin/game-accounts/deleted-bans")).json as { entries: { ref: string }[] }).entries;
    assert.ok(!listed.some((e) => fp(email).startsWith(e.ref)), "élő tiltott fiók ujjlenyomata nem a „törölt” listán van");
    // Feloldás az élő fiókon: minden változat és az ujjlenyomat egyszerre.
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${await idOf(email)}/unban`, {})).status, 200);
    assert.equal((await fpRows(email)).length, 0);
    assert.equal((await older.client.request("GET", "/api/player/me")).status, 200, "a régi alias-fiók is feloldva");
    for (const variant of ["alias.proba+2@gmail.com", "aliasproba@googlemail.com"]) assert.equal((await codeLogin(variant)).status, 200, variant);
  });

  it("K1-c: megőrzési idő — a lejárt (élő fiók nélküli) ujjlenyomat törlődik, a friss marad, az élő tiltás nem jár le; a takarító is futtatja", async () => {
    const admin = await adminClient();
    const accounts = createPlayerAccountStore(dbPool);
    const oldGone = "k1-lejart@pelda.hu", fresh = "k1-friss@pelda.hu", liveOld = "k1-elo-regi@pelda.hu";
    await dbPool.query(`INSERT INTO player_ban_fingerprints (fingerprint, banned_at) VALUES ($1, now() - interval '13 months'), ($2, now() - interval '1 month')`, [fp(oldGone), fp(fresh)]);
    assert.equal((await codeLogin(liveOld)).status, 200);
    const liveId = (await idOf(liveOld))!;
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${liveId}/ban`, {})).status, 200);
    await dbPool.query(`UPDATE player_ban_fingerprints SET banned_at = now() - interval '13 months' WHERE fingerprint = $1`, [fp(liveOld)]);
    await dbPool.query(`UPDATE player_accounts SET banned_at = now() - interval '13 months' WHERE id = $1`, [liveId]);
    const [, , purged] = await createPlayerStore(dbPool).purgeOldCodes();
    assert.ok(purged >= 1, `a takarító törölt: ${purged}`);
    assert.equal((await fpRows(oldGone)).length, 0, "a 12 hónapnál régebbi, élő fiók nélküli ujjlenyomat törlődött");
    assert.equal((await fpRows(fresh)).length, 1, "a friss megmaradt");
    assert.equal((await fpRows(liveOld)).length, 1, "élő tiltott fiók ujjlenyomata nem jár le");
    assert.ok((await q<{ banned_at: Date | null }>(`SELECT banned_at FROM player_accounts WHERE id = $1`, [liveId]))[0]!.banned_at !== null, "az élő tiltás érintetlen");
    assert.equal(await accounts.purgeExpiredBanFingerprints(12), 0, "újrafuttatva nincs több");
    assert.equal((await codeLogin(oldGone)).status, 200, "a lejárt tiltás után rendes fiók");
  });

  it("SESSION_SECRET-rotáció után önjavító: az élő tiltott fiók ujjlenyomata a következő belépéskor újraképződik", async () => {
    const admin = await adminClient();
    const email = "k1-onjavito@pelda.hu";
    assert.equal((await codeLogin(email)).status, 200);
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${await idOf(email)}/ban`, {})).status, 200);
    await dbPool.query(`DELETE FROM player_ban_fingerprints WHERE fingerprint = $1`, [fp(email)]); // a régi kulcsú ujjlenyomat „elveszett”
    assert.equal((await codeLogin(email)).status, 403);
    assert.equal((await fpRows(email)).length, 1, "a belépéskor újraképződött");
    assert.equal((await codeLogin("k1-onjavito+x@pelda.hu")).status, 403, "és az alias-változat ismét tiltott");
  });

  it("a kódkérési korlát kulcsa a kanonikus cím: alias-címekkel nem sokszorozható", async () => {
    const guest = new Client(app.base);
    for (const v of ["limitp@gmail.com", "limit.p@gmail.com", "limitp+1@gmail.com", "limitp@googlemail.com", "LIMIT.P+2@gmail.com"]) {
      assert.equal((await guest.request("POST", "/api/player/auth/start", { email: v })).status, 202, v);
    }
    const n = (await q(`SELECT 1 FROM player_auth_codes WHERE limit_hash = $1`, [limitHash(playerAuthKey(), "limitp@gmail.com")])).length;
    assert.equal(n, 3, "a kanonikus címre 15 percenként legfeljebb 3 kód készült");
  });

  it("nem admin (játékos, vendég) nem éri el a törölt-tiltott végpontokat, és semmi nem törlődik", async () => {
    const admin = await adminClient();
    const email = "k1-vedett@pelda.hu";
    assert.equal((await codeLogin(email)).status, 200);
    const id = (await idOf(email))!;
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${id}/ban`, {})).status, 200);
    assert.equal((await admin.request("POST", `/api/admin/game-accounts/${id}/delete`, { confirm: "TÖRLÉS" })).status, 200);
    const ref = fp(email).slice(0, 16);
    const player = (await codeLogin("k1-kivancsi@pelda.hu")).client;
    const guest = new Client(app.base);
    await guest.fetchCsrf();
    for (const c of [player, guest]) {
      assert.equal((await c.request("GET", "/api/admin/game-accounts/deleted-bans")).status, 401);
      assert.equal((await c.request("POST", `/api/admin/game-accounts/deleted-bans/${ref}/unban`, {})).status, 401);
    }
    assert.equal((await fpRows(email)).length, 1);
  });
});

describe("JM7b — napló-tisztaság", () => {
  it("a teljes futás naplójában nincs teljes e-mail-cím", () => {
    const leaked = logged.filter((l) => /[a-z0-9.-]+@(pelda\.hu|websuli\.example)/i.test(l));
    assert.deepEqual(leaked, []);
  });
});
