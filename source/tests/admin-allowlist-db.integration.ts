/**
 * JM7c-1 — hibrid jogosultság (terv 10.4a): admin = users.is_admin ÉS engedélylista ÉS nem tiltott. Eldobható Postgresen, a
 * szerverrel AZONOS útvonal-felcsatolással, valódi HTTP-n. A Google hálózati része csonkolt (tests/support/player-google-stub.ts):
 * a szerver valódi admin-stratégiája fut, `state` + PKCE ellenőrzéssel.
 *
 * Regressziók: a MEGLÉVŐ admin belép jelszóval és Google-lel (ADMIN_EMAIL alapértékkel — a telepítéshez nincs teendő), a
 * meglévő nem admin Google-felhasználó belépése változatlan (users sora megmarad, nem admin). Új jog csak listás címnek;
 * listáról levétel a következő kérésnél hat; a kizárás elleni őr a meglévő admint nem zárja ki.
 */
import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import { Client, dbPool, startApp } from "./support/authz-db-harness";
import { adminGoogleLogin } from "./support/player-google-stub";

const OWNER = "jm7c-owner@websuli.example"; // a „mostani” admin: ADMIN_EMAIL
const SECOND = "jm7c-second@websuli.example"; // második listás admin (a levételi próbához)
const OLD_ADMIN = "jm7c-old-admin@websuli.example"; // is_admin = true, de nincs a listán
const PARENT = "jm7c-parent@websuli.example"; // meglévő nem admin Google-felhasználó (szülő / tanuló)
const PASSWORD = `pw-${Math.random().toString(36).slice(2)}-C3!`;

let app: Awaited<ReturnType<typeof startApp>>;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await dbPool.query(sql, params)).rows as T[];
const verified = (email: string, id: string) => ({ id, emails: [{ value: email, verified: true }] });

async function login(email: string): Promise<{ client: Client; body: { isAdmin?: boolean } }> {
  const c = new Client(app.base);
  const r = await c.request("POST", "/api/login", { email, password: PASSWORD });
  assert.equal(r.status, 200, `${email}: ${r.text}`);
  await c.fetchCsrf();
  return { client: c, body: r.json as { isAdmin?: boolean } };
}
const me = async (c: Client) => (await c.request("GET", "/api/auth/user")).json as { isAdmin: boolean } | null;
const adminStatus = async (c: Client) => (await c.request("GET", "/api/admin/users")).status;

before(async () => {
  app = await startApp();
  await new Client(app.base).fetchCsrf(); // munkamenet-tábla
  const hash = await bcrypt.hash(PASSWORD, 4);
  await dbPool.query(
    `INSERT INTO users (id, email, password, is_admin, is_banned, google_id, first_name) VALUES
       ('jm7c-owner', $1, $5, true, false, NULL, NULL),
       ('jm7c-second', $2, $5, true, false, NULL, NULL),
       ('jm7c-old-admin', $3, $5, true, false, NULL, NULL),
       ('jm7c-parent', $4, NULL, false, false, 'g-jm7c-parent', 'Szülő')`,
    [OWNER, SECOND, OLD_ADMIN, PARENT, hash],
  );
});

beforeEach(() => {
  delete process.env.ADMIN_ALLOWLIST;
  process.env.ADMIN_EMAIL = OWNER;
});

after(async () => {
  delete process.env.ADMIN_ALLOWLIST;
  delete process.env.ADMIN_EMAIL;
  await app?.close();
  await dbPool.end();
});

describe("JM7c-1 — a meglévő admin beállítás nélkül admin marad (ADMIN_EMAIL alapérték)", () => {
  it("jelszavas belépés: a válasz isAdmin=true, az admin-végpont elérhető; a listán kívüli régi admin nem admin", async () => {
    const owner = await login(OWNER);
    assert.equal(owner.body.isAdmin, true);
    assert.equal((await me(owner.client))?.isAdmin, true);
    assert.equal(await adminStatus(owner.client), 200);
    const old = await login(OLD_ADMIN); // a belépés sikerül, admin-jog nincs
    assert.equal(old.body.isAdmin, false);
    assert.equal((await me(old.client))?.isAdmin, false);
    assert.equal(await adminStatus(old.client), 403);
  });

  it("Google-belépés (state + PKCE): a meglévő admin → /admin és admin; a returnTo megmarad", async () => {
    const c = new Client(app.base);
    const run = await adminGoogleLogin(c, verified(OWNER, "g-jm7c-owner"));
    assert.deepEqual(run.callback, { status: 302, location: "/admin" });
    await c.fetchCsrf();
    assert.equal((await me(c))?.isAdmin, true);
    assert.equal(await adminStatus(c), 200);
    const c2 = new Client(app.base);
    const run2 = await adminGoogleLogin(c2, verified(OWNER, "g-jm7c-owner"), { returnTo: "/games" });
    assert.equal(run2.callback?.location, "/games");
  });

  it("hamis / hiányzó / idegen state → senki nem lép be, érthető hibaoldalra (/login?hiba=google)", async () => {
    for (const state of ["tampered", "missing"] as const) {
      const c = new Client(app.base);
      const run = await adminGoogleLogin(c, verified(OWNER, "g-jm7c-owner"), { state });
      assert.deepEqual(run.callback, { status: 302, location: "/login?hiba=google" }, state);
      assert.equal(await me(c), null, state);
    }
    const other = new Client(app.base);
    const otherStart = await adminGoogleLogin(other, verified(OWNER, "g-jm7c-owner"), { state: "missing" });
    const victim = new Client(app.base);
    const run = await adminGoogleLogin(victim, verified(OWNER, "g-jm7c-owner"), { state: { value: otherStart.state! } });
    assert.equal(run.callback?.location, "/login?hiba=google", "más munkamenet state-je");
    assert.equal(await me(victim), null);
    // A Google-oldali tokencsere hibája (pl. elutasított PKCE / újratöltött kód) sem hibaoldal, hanem újrapróba.
    const tokenFail = new Client(app.base);
    const tf = await adminGoogleLogin(tokenFail, verified(OWNER, "g-jm7c-owner"), { tokenError: true });
    assert.deepEqual(tf.callback, { status: 302, location: "/login?hiba=google" });
    assert.equal(await me(tokenFail), null);
  });

  it("review #462 A2: a visszahívás ?error= paramétere szűretlenül nem kerül a naplóba (naplósor-hamisítás ellen)", async () => {
    const { logger } = await import("../server/lib/logger");
    const lines: string[] = [];
    const orig = logger.warn;
    (logger as unknown as { warn: (...a: unknown[]) => void }).warn = (...a: unknown[]) => { lines.push(a.map(String).join(" ")); };
    try {
      const c = new Client(app.base);
      const res = await fetch(`${app.base}/auth/google/callback?error=${encodeURIComponent("server_error\n[ADMIN] hamis sor")}`, { redirect: "manual" });
      assert.equal(res.status, 302);
      assert.equal(res.headers.get("location"), "/login?hiba=google");
      const ok = await fetch(`${app.base}/auth/google/callback?error=temporarily_unavailable`, { redirect: "manual" });
      assert.equal(ok.headers.get("location"), "/login?hiba=google");
      assert.equal(await me(c), null);
    } finally {
      (logger as unknown as { warn: typeof orig }).warn = orig;
    }
    const cb = lines.filter((l) => l.includes("Google callback error"));
    assert.equal(cb.length, 2, lines.join("\n"));
    assert.ok(cb[0]!.includes("(egyeb)") && !cb[0]!.includes("hamis sor") && !cb[0]!.includes("\n"), cb[0]);
    assert.ok(cb[1]!.includes("(temporarily_unavailable)"), cb[1]);
  });

  it("a meglévő nem admin Google-felhasználó belépése változatlan: belép, /games, users sora megmarad, nem admin", async () => {
    const c = new Client(app.base);
    const run = await adminGoogleLogin(c, verified(PARENT, "g-jm7c-parent"));
    assert.deepEqual(run.callback, { status: 302, location: "/games" });
    await c.fetchCsrf();
    assert.equal((await me(c))?.isAdmin, false);
    assert.equal(await adminStatus(c), 403);
    const rows = await q<{ id: string; is_admin: boolean }>(`SELECT id, is_admin FROM users WHERE email = $1`, [PARENT]);
    assert.deepEqual(rows, [{ id: "jm7c-parent", is_admin: false }]);
  });
});

describe("JM7c-1 — új admin-jog csak listás címnek", () => {
  it("új Google-felhasználó: listán kívül nem kap jelzőt; listán (megerősített címmel) igen", async () => {
    process.env.ADMIN_ALLOWLIST = `${OWNER}, jm7c-new-admin@websuli.example`;
    const outsider = new Client(app.base);
    await adminGoogleLogin(outsider, verified("jm7c-new-user@websuli.example", "g-jm7c-new-user"));
    const listed = new Client(app.base);
    const run = await adminGoogleLogin(listed, verified("jm7c-new-admin@websuli.example", "g-jm7c-new-admin"));
    assert.equal(run.callback?.location, "/admin");
    const rows = await q<{ email: string; is_admin: boolean }>(`SELECT email, is_admin FROM users WHERE email LIKE 'jm7c-new-%' ORDER BY email`);
    assert.deepEqual(rows, [{ email: "jm7c-new-admin@websuli.example", is_admin: true }, { email: "jm7c-new-user@websuli.example", is_admin: false }]);
    await outsider.fetchCsrf();
    assert.equal(await adminStatus(outsider), 403);
  });

  it("Felhasználók fül: listán kívüli cím nem tehető adminná (érthető hiba); listás igen; a saját jog nem vehető el", async () => {
    process.env.ADMIN_ALLOWLIST = `${OWNER}, ${PARENT}`;
    const owner = (await login(OWNER)).client;
    const refused = await owner.request("PUT", "/api/admin/users/jm7c-new-user-placeholder/toggle-admin", { isAdmin: true });
    assert.equal(refused.status, 404);
    const [outsiderRow] = await q<{ id: string }>(`SELECT id FROM users WHERE email = 'jm7c-new-user@websuli.example'`);
    const r1 = await owner.request("PUT", `/api/admin/users/${outsiderRow!.id}/toggle-admin`, { isAdmin: true });
    assert.equal(r1.status, 400);
    assert.match((r1.json as { message: string }).message, /nincs az admin-engedélylistán/);
    assert.deepEqual(await q(`SELECT is_admin FROM users WHERE id = $1`, [outsiderRow!.id]), [{ is_admin: false }], "nincs írás");
    const r2 = await owner.request("PUT", "/api/admin/users/jm7c-parent/toggle-admin", { isAdmin: true });
    assert.equal(r2.status, 200, r2.text);
    const list = (await owner.request("GET", "/api/admin/users")).json as { id: string; isAdmin: boolean }[];
    assert.equal(list.find((u) => u.id === "jm7c-parent")?.isAdmin, true);
    assert.equal(list.find((u) => u.id === "jm7c-old-admin")?.isAdmin, false, "a lista a SZÁMOLT jogot mutatja");
    const self = await owner.request("PUT", "/api/admin/users/jm7c-owner/toggle-admin", { isAdmin: false });
    assert.equal(self.status, 400);
    await owner.request("PUT", "/api/admin/users/jm7c-parent/toggle-admin", { isAdmin: false });
  });
});

describe("JM7c-1 / review #462 — a nem érvényes, tárolt admin-jelző látszik és elvehető", () => {
  it("tiltott + is_admin és listán kívüli + is_admin sor: a lista külön mutatja a jelzőt és az okot; a jelző elvehető", async () => {
    const BANNED = "jm7c-banned-admin@websuli.example";
    await dbPool.query(`INSERT INTO users (id, email, password, is_admin, is_banned) VALUES ('jm7c-banned-admin', $1, NULL, true, true)`, [BANNED]);
    process.env.ADMIN_ALLOWLIST = `${OWNER}, ${BANNED}`;
    const owner = (await login(OWNER)).client;
    type Row = { id: string; isAdmin: boolean; storedIsAdmin: boolean; adminInactiveReason: string | null };
    const list = async () => (await owner.request("GET", "/api/admin/users")).json as Row[];
    const pick = (rows: Row[], id: string) => { const r = rows.find((u) => u.id === id)!; return { isAdmin: r.isAdmin, storedIsAdmin: r.storedIsAdmin, adminInactiveReason: r.adminInactiveReason }; };
    let rows = await list();
    assert.deepEqual(pick(rows, "jm7c-banned-admin"), { isAdmin: false, storedIsAdmin: true, adminInactiveReason: "tiltott" });
    assert.deepEqual(pick(rows, "jm7c-old-admin"), { isAdmin: false, storedIsAdmin: true, adminInactiveReason: "nincs-a-listan" });
    assert.deepEqual(pick(rows, "jm7c-owner"), { isAdmin: true, storedIsAdmin: true, adminInactiveReason: null });
    assert.deepEqual(pick(rows, "jm7c-parent"), { isAdmin: false, storedIsAdmin: false, adminInactiveReason: null });
    for (const id of ["jm7c-banned-admin", "jm7c-old-admin"]) {
      const r = await owner.request("PUT", `/api/admin/users/${id}/toggle-admin`, { isAdmin: false });
      assert.equal(r.status, 200, `${id}: ${r.text}`);
    }
    rows = await list();
    assert.deepEqual(pick(rows, "jm7c-banned-admin"), { isAdmin: false, storedIsAdmin: false, adminInactiveReason: null });
    assert.deepEqual(pick(rows, "jm7c-old-admin"), { isAdmin: false, storedIsAdmin: false, adminInactiveReason: null });
    // A listán kívüli címre a jelző visszaadása továbbra sem engedett; a régi admin a többi teszthez visszaáll.
    const regrant = await owner.request("PUT", "/api/admin/users/jm7c-old-admin/toggle-admin", { isAdmin: true });
    assert.equal(regrant.status, 400);
    await dbPool.query(`UPDATE users SET is_admin = true WHERE id = 'jm7c-old-admin'`);
  });
});

describe("JM7c-1 — listáról levétel és kizárás elleni őr", () => {
  it("listáról levett admin a KÖVETKEZŐ kérésénél már nem admin (újra-belépés nélkül)", async () => {
    process.env.ADMIN_ALLOWLIST = `${OWNER},${SECOND}`;
    const second = (await login(SECOND)).client;
    assert.equal(await adminStatus(second), 200);
    process.env.ADMIN_ALLOWLIST = OWNER;
    assert.equal(await adminStatus(second), 403);
    assert.equal((await me(second))?.isAdmin, false);
    process.env.ADMIN_ALLOWLIST = `${OWNER},${SECOND}`;
    assert.equal(await adminStatus(second), 200, "visszavéve újra admin");
  });

  it("elírt lista (egyetlen létező adminra sem illik) → a meglévő admin NINCS kizárva; jelző nélküli továbbra sem admin", async () => {
    process.env.ADMIN_ALLOWLIST = "jm7c-elgepelt-tulaj@websuli.example";
    const owner = await login(OWNER);
    assert.equal(owner.body.isAdmin, true);
    assert.equal(await adminStatus(owner.client), 200);
    const parent = new Client(app.base);
    await adminGoogleLogin(parent, verified(PARENT, "g-jm7c-parent"));
    await parent.fetchCsrf();
    assert.equal(await adminStatus(parent), 403);
  });

  it("semmilyen konfiguráció (sem ADMIN_ALLOWLIST, sem ADMIN_EMAIL) → a meglévő jelző marad, új jog nem adható", async () => {
    delete process.env.ADMIN_EMAIL;
    const owner = (await login(OWNER)).client;
    assert.equal(await adminStatus(owner), 200);
    const r = await owner.request("PUT", "/api/admin/users/jm7c-parent/toggle-admin", { isAdmin: true });
    assert.equal(r.status, 400);
    assert.deepEqual(await q(`SELECT is_admin FROM users WHERE id = 'jm7c-parent'`), [{ is_admin: false }]);
  });
});
