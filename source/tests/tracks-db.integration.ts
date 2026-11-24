/**
 * 6-osztályos gimnáziumi felvételi csoport (docs/specs/2026-11-24-gimi-felveteli-csoport.md; #1986) — eldobható Postgresen,
 * valódi HTTP-n. E1 (a lista viszi a csoportot), E2 (fiók-hozzárendelés a fiókkulcson át, Google- és játékos-munkamenettel),
 * E3 (admin mentés), E4 (a migráció additív, hozzárendelést NEM ír), E5 (admin Csoport-hozzárendelések: felvétel / lista / törlés).
 * A címek szintetikusak (a repó nyilvános — no-real-emails-guard).
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import { Client, dbPool, injectSession, startApp } from "./support/authz-db-harness";

const { GIMI6_TRACK } = await import("../shared/tracks");
const ADMIN_EMAIL = "tr-admin@websuli.example";
const ADMIN_PASSWORD = `pw-${Math.random().toString(36).slice(2)}-A1!`;

let app: Awaited<ReturnType<typeof startApp>>;

before(async () => {
  await dbPool.query(`INSERT INTO users (id, email, password, is_admin, is_banned) VALUES ('tr-admin', $1, $2, true, false),
    ('tr-marcel', 'kis.diak+2@gmail.com', NULL, false, false), ('tr-other', 'tr-other@websuli.example', NULL, false, false)`,
  [ADMIN_EMAIL, await bcrypt.hash(ADMIN_PASSWORD, 4)]);
  await dbPool.query(`INSERT INTO html_files (id, title, content, classroom, tracks) VALUES
    ('tr-gimi-math', 'Gimi felvételi — törtek', '<p>x</p>', 6, ARRAY['gimi6']), ('tr-plain-6', 'Sima 6. osztályos', '<p>x</p>', 6, '{}')`);
  await dbPool.query(`INSERT INTO player_accounts (id, email) VALUES ('tr-player-marcel', 'kisdiak+5@gmail.com'), ('tr-player-other', 'tr-p@websuli.example')`);
  app = await startApp();
  // A munkamenet-tábla (connect-pg-simple) az első mentett munkamenettel jön létre — a beültetett munkamenetek előtt.
  await new Client(app.base).fetchCsrf();
});
after(async () => { await app?.close(); });

describe("gimi felvételi csoport (#1986)", () => {
  it("E4: a migráció additív — html_files.tracks alapértéke üres tömb; hozzárendelést nem ír (valódi cím nincs a repóban)", async () => {
    const { rows } = await dbPool.query<{ tracks: string[] }>(`INSERT INTO html_files (id, title, content, classroom) VALUES ('tr-default', 'x', 'x', 3) RETURNING tracks`);
    assert.deepEqual(rows[0]!.tracks, []);
    assert.equal((await dbPool.query(`SELECT 1 FROM track_assignments`)).rowCount, 0);
  });

  it("E1: a nyilvános lista anyagonként viszi a csoportot", async () => {
    const r = await new Client(app.base).request("GET", "/api/html-files");
    assert.equal(r.status, 200);
    const files = r.json as Array<{ id: string; tracks?: string[] }>;
    assert.deepEqual(files.find((f) => f.id === "tr-gimi-math")?.tracks, [GIMI6_TRACK]);
    assert.deepEqual(files.find((f) => f.id === "tr-plain-6")?.tracks, []);
  });

  it("E5: admin Csoport-hozzárendelések — felvétel a fiókkulcson (gmail: pontok/+címke nélkül), lista, ismétlés idempotens, hibás bemenet 400, nem admin tiltva", async () => {
    const admin = new Client(app.base);
    await admin.fetchCsrf();
    assert.equal((await admin.request("POST", "/api/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })).status, 200);
    await admin.fetchCsrf();
    const add = await admin.request("POST", "/api/admin/track-assignments", { track: GIMI6_TRACK, email: "  Kis.Diak+2@gmail.com " });
    assert.equal(add.status, 200, add.text);
    assert.deepEqual(add.json, { track: GIMI6_TRACK, emailKey: "kisdiak@gmail.com" });
    assert.equal((await admin.request("POST", "/api/admin/track-assignments", { track: GIMI6_TRACK, email: "kisdiak@gmail.com" })).status, 200, "ismétlés idempotens");
    const list = await admin.request("GET", "/api/admin/track-assignments");
    assert.equal(list.status, 200, list.text);
    assert.deepEqual((list.json as Array<{ track: string; emailKey: string }>).map((r) => [r.track, r.emailKey]), [[GIMI6_TRACK, "kisdiak@gmail.com"]]);
    assert.equal((await admin.request("POST", "/api/admin/track-assignments", { track: "ismeretlen", email: "kisdiak@gmail.com" })).status, 400);
    assert.equal((await admin.request("POST", "/api/admin/track-assignments", { track: GIMI6_TRACK, email: "nem-cim" })).status, 400);
    const user = new Client(app.base, await injectSession({ passport: { user: "tr-other" } }));
    await user.fetchCsrf();
    const denied = await user.request("POST", "/api/admin/track-assignments", { track: GIMI6_TRACK, email: "tr-other@websuli.example" });
    assert.ok(denied.status === 401 || denied.status === 403, `nem admin: ${denied.status}`);
    const deniedList = await user.request("GET", "/api/admin/track-assignments");
    assert.ok(deniedList.status === 401 || deniedList.status === 403, `nem admin lista: ${deniedList.status}`);
  });

  it("E2: /api/tracks/mine — vendég és más fiók: []; a hozzárendelt Google-fiók és az azonos postafiókú játékos: [gimi6]", async () => {
    const mine = async (session: Record<string, unknown> | null) => {
      const r = await new Client(app.base, session ? await injectSession(session) : null).request("GET", "/api/tracks/mine");
      assert.equal(r.status, 200, r.text);
      return (r.json as { tracks: string[] }).tracks;
    };
    assert.deepEqual(await mine(null), []);
    assert.deepEqual(await mine({ passport: { user: "tr-other" } }), []);
    assert.deepEqual(await mine({ player: { id: "tr-player-other", at: Date.now() } }), []);
    assert.deepEqual(await mine({ passport: { user: "tr-marcel" } }), [GIMI6_TRACK], "Google-fiók (pontos, +címkés gmail-cím is)");
    assert.deepEqual(await mine({ player: { id: "tr-player-marcel", at: Date.now() } }), [GIMI6_TRACK], "játékos-fiók: pontok és +címke nélkül ugyanaz a postafiók");
  });

  it("E3: az admin a csoportba teszi és kiveszi az anyagot; nem admin nem írhat; ismeretlen csoport 400", async () => {
    const admin = new Client(app.base);
    await admin.fetchCsrf();
    const login = await admin.request("POST", "/api/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
    assert.equal(login.status, 200, login.text);
    await admin.fetchCsrf();
    const put = await admin.request("PUT", "/api/html-files/tr-plain-6/tracks", { tracks: [GIMI6_TRACK] });
    assert.equal(put.status, 200, put.text);
    assert.deepEqual((await dbPool.query<{ tracks: string[] }>(`SELECT tracks FROM html_files WHERE id = 'tr-plain-6'`)).rows[0]!.tracks, [GIMI6_TRACK]);
    const listed = (await new Client(app.base).request("GET", "/api/html-files")).json as Array<{ id: string; tracks?: string[] }>;
    assert.deepEqual(listed.find((f) => f.id === "tr-plain-6")?.tracks, [GIMI6_TRACK], "a gyorsítótárazott lista is frissül");
    assert.equal((await admin.request("PUT", "/api/html-files/tr-plain-6/tracks", { tracks: ["ismeretlen"] })).status, 400);
    assert.equal((await admin.request("PUT", "/api/html-files/tr-plain-6/tracks", { tracks: [] })).status, 200);
    assert.deepEqual((await dbPool.query<{ tracks: string[] }>(`SELECT tracks FROM html_files WHERE id = 'tr-plain-6'`)).rows[0]!.tracks, []);
    const user = new Client(app.base, await injectSession({ passport: { user: "tr-other" } }));
    await user.fetchCsrf();
    const denied = await user.request("PUT", "/api/html-files/tr-plain-6/tracks", { tracks: [GIMI6_TRACK] });
    assert.ok(denied.status === 401 || denied.status === 403, `nem admin: ${denied.status}`);
  });

  it("E6: az admin törli a hozzárendelést → a fiók csoportjai üresek", async () => {
    const admin = new Client(app.base);
    await admin.fetchCsrf();
    assert.equal((await admin.request("POST", "/api/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })).status, 200);
    await admin.fetchCsrf();
    const del = await admin.request("DELETE", "/api/admin/track-assignments", { track: GIMI6_TRACK, emailKey: "kisdiak@gmail.com" });
    assert.equal(del.status, 200, del.text);
    assert.equal((await dbPool.query(`SELECT 1 FROM track_assignments`)).rowCount, 0);
    const r = await new Client(app.base, await injectSession({ passport: { user: "tr-marcel" } })).request("GET", "/api/tracks/mine");
    assert.deepEqual((r.json as { tracks: string[] }).tracks, []);
  });
});
