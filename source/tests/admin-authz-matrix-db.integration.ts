/**
 * JM7a — admin-jogosultsági MÁTRIX (docs/specs/2026-11-16-jatekok-jatekelmeny.md 10.4 (a), JM-A12; tulajdonosi G11 / D12:
 * „Az admin felülethez senki nem férhet hozzá, csak az adminok.”). Eldobható Postgresen, valódi HTTP-n.
 *
 * Végpontlista: a szerverrel azonos felcsatolás (`mountAppRoutes`) router-vermének bejárásából GENERÁLVA — minden végpont,
 * amelynek láncában `isAuthenticatedAdmin` van, vagy az admin előtagok (`/api/admin`, `/api/studio`) alatt áll. Új végpont
 * így nem maradhat ki.
 * Szerepek: vendég (munkamenettel, CSRF-tokennel), e-mail-kódos játékos (VALÓDI beváltással), e-mail-kódos játékos az admin
 * címével, Google-os játékos (JM7b előtt munkamenet-szinten szimulálva), tiltott játékos, nem admin Google-felhasználó
 * (`users.is_admin=false`), tiltott admin, admin (valódi /api/login).
 *
 * Két menet:
 *  (1) „őr-menet”: a végpontok VÉGSŐ üzleti kezelője csonkolva (299 + jelölő), minden előtte álló réteg valódi (munkamenet,
 *      Passport, CSRF, útvonal- / router- / előtag-őr). Elvárás: csak az admin éri el a csonkot; mindenki más az őr 401 / 403
 *      válaszát kapja. Az admin-oldal így mellékhatás nélkül bizonyított (nem indul gyártás, mentés, levél).
 *  (2) „valódi menet” a nem admin szerepekkel, csonkolás NÉLKÜL: ugyanaz a 401 / 403, és az adatbázis tartalma a menet előtt és
 *      után bitre azonos (nem admin kérés semmilyen írást nem okoz).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import { Client, databaseFingerprint, dbPool, injectSession, mapLimit, startApp } from "./support/authz-db-harness";
import { isUnderAdminPrefix, routeInventory, samplePath, type Endpoint } from "./support/route-inventory";

const { isAuthenticatedAdmin } = await import("../server/auth");

const ADMIN_EMAIL = "authz-admin@websuli.example";
const ADMIN_PASSWORD = `pw-${Math.random().toString(36).slice(2)}-A1!`;
const GUARD_BODIES = new Set(['{"message":"Unauthorized"}', '{"message":"Forbidden - Admin access required"}']);
const STUB_STATUS = 299;
const VICTIM = "authz-probe"; // minden :param ide mutat — a valódi menetben egy létező sor (írás látszana)

type Role = { name: string; client: Client };

let stubApp: Awaited<ReturnType<typeof startApp>>;
let realApp: Awaited<ReturnType<typeof startApp>>;
let adminEndpoints: Endpoint[] = [];
const roles: Role[] = [];
let admin: Client;

async function sessionClient(base: string, data: Record<string, unknown>): Promise<Client> {
  const c = new Client(base, await injectSession(data));
  await c.fetchCsrf();
  return c;
}

before(async () => {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 4);
  await dbPool.query(
    `INSERT INTO users (id, email, password, is_admin, is_banned) VALUES
       ('authz-admin', $1, $2, true, false),
       ('authz-user', 'authz-user@websuli.example', NULL, false, false),
       ('authz-banned-admin', 'authz-banned@websuli.example', NULL, true, true),
       ($3, 'authz-victim@websuli.example', NULL, false, false)`,
    [ADMIN_EMAIL, hash, VICTIM],
  );
  await dbPool.query(`UPDATE users SET google_id = 'g-authz-user' WHERE id = 'authz-user'`);
  await dbPool.query(`INSERT INTO html_files (id, title, content, classroom) VALUES ($1, 'Mátrix-áldozat', '<p>x</p>', 3)`, [VICTIM]);

  stubApp = await startApp((app) => {
    adminEndpoints = routeInventory(app).filter((e) => isUnderAdminPrefix(e.path) || e.chain.includes(isAuthenticatedAdmin));
    for (const e of adminEndpoints) {
      e.finalLayer.handle = (_req, res) => { res.status(STUB_STATUS).json({ reached: true }); };
    }
  });
  realApp = await startApp();
  // A connect-pg-simple a munkamenet-táblát az első használatkor hozza létre.
  await new Client(stubApp.base).fetchCsrf();

  admin = new Client(stubApp.base);
  const login = await admin.request("POST", "/api/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  assert.equal(login.status, 200, `admin-belépés: ${login.status}`);
  await admin.fetchCsrf();

  const guest = new Client(stubApp.base);
  await guest.fetchCsrf();
  roles.push({ name: "vendég", client: guest });
  roles.push({ name: "e-mail-kódos játékos (szimulált munkamenet)", client: await sessionClient(stubApp.base, { player: { id: "authz-email-player" } }) });
  roles.push({ name: "Google-os játékos (szimulált, JM7b)", client: await sessionClient(stubApp.base, { player: { id: "authz-google-player" } }) });
  roles.push({ name: "tiltott játékos", client: await sessionClient(stubApp.base, { player: { id: "authz-banned-player" } }) });
  roles.push({ name: "nem admin Google-felhasználó", client: await sessionClient(stubApp.base, { passport: { user: "authz-user" } }) });
  roles.push({ name: "tiltott admin", client: await sessionClient(stubApp.base, { passport: { user: "authz-banned-admin" } }) });
});

after(async () => {
  await stubApp?.close();
  await realApp?.close();
  await dbPool.end();
});

const label = (e: Endpoint) => `${e.method} ${e.path}`;

describe("JM7a — admin-jogosultsági mátrix", () => {
  it("a generált végpontlista lefedi az admin felületet", () => {
    assert.ok(adminEndpoints.length >= 100, `legalább 100 adminvégpont várt, ennyi lett: ${adminEndpoints.length}`);
    const keys = new Set(adminEndpoints.map(label));
    for (const k of ["GET /api/admin/users", "PUT /api/admin/users/:id/toggle-admin", "POST /api/studio/lessons/one-step", "POST /api/html-files", "GET /download-source-static", "GET /api/static-audit"]) {
      assert.ok(keys.has(k), `hiányzik: ${k}`);
    }
    // Írja ki a lefedettséget (a záró jelentéshez): végpontok × szerepek.
    console.log(`[authz-matrix] ${adminEndpoints.length} adminvégpont × ${roles.length + 1} szerep (${roles.length} nem admin + admin)`);
  });

  it("őr-menet: csak az admin éri el a végpontokat; minden más szerep az őr 401 / 403 válaszát kapja", async () => {
    const failures: string[] = [];
    await mapLimit(adminEndpoints, 6, async (e) => {
      const path = samplePath(e.path, VICTIM);
      const body = e.method === "GET" ? undefined : {};
      const a = await admin.request(e.method, path, body);
      if (a.status !== STUB_STATUS) failures.push(`admin ${label(e)} → ${a.status} ${a.text.slice(0, 80)}`);
      for (const role of roles) {
        const r = await role.client.request(e.method, path, body);
        if (!(r.status === 401 || r.status === 403) || !GUARD_BODIES.has(r.text)) failures.push(`${role.name} ${label(e)} → ${r.status} ${r.text.slice(0, 80)}`);
      }
    });
    assert.deepEqual(failures, []);
  });

  it("valódi menet (csonkolás nélkül): nem admin kérésre 401 / 403, és az adatbázisban semmi nem változik", async () => {
    const realRoles = roles.map((r) => ({ name: r.name, client: new Client(realApp.base, r.client.cookie) }));
    for (const r of realRoles) r.client.csrf = roles.find((x) => x.name === r.name)!.client.csrf;
    const beforeState = await databaseFingerprint();
    const failures: string[] = [];
    await mapLimit(adminEndpoints, 6, async (e) => {
      const path = samplePath(e.path, VICTIM);
      const body = e.method === "GET" ? undefined : {};
      for (const role of realRoles) {
        const r = await role.client.request(e.method, path, body);
        if (!(r.status === 401 || r.status === 403) || !GUARD_BODIES.has(r.text)) failures.push(`${role.name} ${label(e)} → ${r.status} ${r.text.slice(0, 80)}`);
      }
    });
    const afterState = await databaseFingerprint();
    assert.deepEqual(failures, []);
    const changed = Object.keys(afterState).filter((t) => afterState[t] !== beforeState[t]);
    assert.deepEqual(changed, [], "nem admin kérés után változott tábla");
  });

  it("a játékos-munkamenet nem állít req.user-t: /api/auth/user null; a nem admin felhasználó nem admin", async () => {
    for (const role of roles) {
      const r = await role.client.request("GET", "/api/auth/user");
      assert.equal(r.status, 200);
      if (role.name === "nem admin Google-felhasználó") assert.equal((r.json as { isAdmin: boolean }).isAdmin, false);
      else assert.equal(r.json, null, `${role.name}: /api/auth/user`);
    }
    const a = await admin.request("GET", "/api/auth/user");
    assert.equal((a.json as { isAdmin: boolean }).isAdmin, true);
  });
});
