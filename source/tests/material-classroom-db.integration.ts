/**
 * Következetes évfolyam-módosítás (docs/specs/2026-11-16-tananyag-evfolyam-modositas.md) — eldobható Postgresen, valódi HTTP-n
 * (a szerverrel azonos felcsatolás, admin /api/login, CSRF). A Studio-lecke évfolyama a `html_files`, a `lessons.json` és a
 * `knowledge_maps` sorban is egyezzen; hiba esetén semmi nem íródik; nem admin nem írhat.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import { Client, databaseFingerprint, dbPool, injectSession, startApp } from "./support/authz-db-harness";
import { fusionFixture } from "../shared/fixtures/lesson-fusion";

const ADMIN_EMAIL = "mc-admin@websuli.example";
const ADMIN_PASSWORD = `pw-${Math.random().toString(36).slice(2)}-A1!`;
const P = "mc-"; // saját azonosító-előtag (a DB-t más integrációs fájlok is használják)

let app: Awaited<ReturnType<typeof startApp>>;
let admin: Client;

async function seedLesson(fileId: string, mapId: string, lessonId: string, classroom: number, opts: { fileClassroom?: number } = {}) {
  const json = { ...fusionFixture(), classroom };
  await dbPool.query(`INSERT INTO knowledge_maps (id, title, subject, classroom, source_files, input_hash) VALUES ($1, 'Próba', 'matematika', $2, '[]', $1) ON CONFLICT (id) DO NOTHING`, [mapId, classroom]);
  await dbPool.query(`INSERT INTO html_files (id, title, content, classroom, content_type) VALUES ($1, $2, '<p>lecke</p>', $3, 'lesson')`, [fileId, `Lecke ${fileId}`, opts.fileClassroom ?? classroom]);
  await dbPool.query(`INSERT INTO lessons (id, html_file_id, map_id, json, version, published_at) VALUES ($1, $2, $3, $4, 1, now())`, [lessonId, fileId, mapId, JSON.stringify(json)]);
}

async function state(fileId: string) {
  const { rows } = await dbPool.query<{ html: number; json: number; map: number; version: number; sections: string }>(
    `SELECT h.classroom AS html, (l.json->>'classroom')::int AS json, k.classroom AS map, l.version, md5((l.json->'sections')::text) AS sections
       FROM html_files h JOIN lessons l ON l.html_file_id = h.id JOIN knowledge_maps k ON k.id = l.map_id WHERE h.id = $1`, [fileId]);
  return rows[0]!;
}
const htmlClassroom = async (id: string) => (await dbPool.query<{ c: number }>(`SELECT classroom AS c FROM html_files WHERE id = $1`, [id])).rows[0]?.c;

before(async () => {
  await dbPool.query(`INSERT INTO users (id, email, password, is_admin, is_banned) VALUES ('mc-admin', $1, $2, true, false), ('mc-user', 'mc-user@websuli.example', NULL, false, false)`,
    [ADMIN_EMAIL, await bcrypt.hash(ADMIN_PASSWORD, 4)]);
  await seedLesson(`${P}arena`, `${P}map-arena`, `${P}lesson-arena`, 2);
  await seedLesson(`${P}github`, `${P}map-github`, `${P}lesson-github`, 8);
  await seedLesson(`${P}bulk-lesson`, `${P}map-bulk`, `${P}lesson-bulk`, 4);
  await dbPool.query(`INSERT INTO html_files (id, title, content, classroom) VALUES ('mc-plain', 'Sima HTML', '<p>x</p>', 5), ('mcLegacyNanoId_x-Y', 'Régi azonosítójú', '<p>x</p>', 6)`);
  // Futó gyártás alatt álló lecke.
  await seedLesson(`${P}busy`, `${P}map-busy`, `${P}lesson-busy`, 5);
  await dbPool.query(`INSERT INTO studio_jobs (lesson_id, map_id, step, status, input_hash) VALUES ('mc-lesson-busy', 'mc-map-busy', 'author', 'running', 'mc')`);
  // Review #465: publikált lecke forrásjegyzékéből indított, még csak map_id-s gyártás; és egy futó egylépéses gyártás.
  await seedLesson(`${P}frommap`, `${P}map-frommap`, `${P}lesson-frommap`, 4);
  await dbPool.query(`INSERT INTO studio_jobs (id, map_id, step, status, input_hash) VALUES ('mc-job-frommap', 'mc-map-frommap', 'pedagogue', 'running', 'mc-fm')`);
  await seedLesson(`${P}onestep`, `${P}map-onestep`, `${P}lesson-onestep`, 4);
  await dbPool.query(`INSERT INTO one_step_runs (id, phase, map_id) VALUES ('mc-run-onestep', 'author', 'mc-map-onestep')`);
  // Megosztott forrásjegyzék: két különböző anyag leckéje ugyanazon a jegyzéken.
  await seedLesson(`${P}shared-a`, `${P}map-shared`, `${P}lesson-shared-a`, 6);
  await seedLesson(`${P}shared-b`, `${P}map-shared`, `${P}lesson-shared-b`, 6);
  app = await startApp();
  admin = new Client(app.base);
  const login = await admin.request("POST", "/api/login", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  assert.equal(login.status, 200, `admin-belépés: ${login.text}`);
  await admin.fetchCsrf();
});

after(async () => {
  await app?.close();
  await dbPool.end();
  // A sikeres PATCH a meglévő eseményalapú mentést indítja (server/autoBackup.ts, 5 perces debounce-időzítő, nincs leállító API) —
  // az időzítő nyitva tartaná a tesztfolyamatot. Az eredmények kiírása után kilépünk (a node:test a bukást az exitCode-ban jelzi).
  setTimeout(() => process.exit(process.exitCode ?? 0), 1000).unref();
});

describe("szerkesztő (PATCH /api/html-files/:id)", () => {
  it("Studio-lecke 2 → 3: mindhárom hely 3, verzió +1, a lecke tartalma változatlan, a lecke oldala a 3-at kapja", async () => {
    const before = await state(`${P}arena`);
    const r = await admin.request("PATCH", `/api/html-files/${P}arena`, { classroom: 3, title: "Matek Aréna" });
    assert.equal(r.status, 200, r.text);
    assert.equal((r.json as { classroom: number; title: string }).classroom, 3);
    assert.equal((r.json as { title: string }).title, "Matek Aréna");
    const after = await state(`${P}arena`);
    assert.deepEqual({ html: after.html, json: after.json, map: after.map }, { html: 3, json: 3, map: 3 });
    assert.equal(after.version, before.version + 1);
    assert.equal(after.sections, before.sections, "a lecke szekciói nem változhatnak");
    const page = await new Client(app.base).request("GET", `/api/lessons/by-file/${P}arena`);
    assert.equal(page.status, 200, page.text);
    assert.equal(JSON.stringify(page.json).includes('"classroom":3'), true, "a lecke oldala az új évfolyamot kapja");
  });

  it("0-ra (Programozási alapismeretek): csak a html_files változik, a lecke és a forrásjegyzék a tartalmi évfolyamot tartja", async () => {
    const before = await state(`${P}github`);
    const r = await admin.request("PATCH", `/api/html-files/${P}github`, { classroom: 0 });
    assert.equal(r.status, 200, r.text);
    const after = await state(`${P}github`);
    assert.deepEqual({ html: after.html, json: after.json, map: after.map, version: after.version }, { html: 0, json: 8, map: 8, version: before.version });
  });

  it("érvénytelen évfolyam → 400, semmi nem íródik", async () => {
    const fp = await databaseFingerprint();
    for (const classroom of [13, -1, "x"]) {
      const r = await admin.request("PATCH", `/api/html-files/${P}bulk-lesson`, { classroom });
      assert.equal(r.status, 400, `${classroom}: ${r.text}`);
    }
    assert.deepEqual(await databaseFingerprint(), fp);
  });

  it("futó gyártás alatt → 409, semmi nem íródik (a cím sem)", async () => {
    const fp = await databaseFingerprint();
    const r = await admin.request("PATCH", `/api/html-files/${P}busy`, { classroom: 7, title: "Új cím" });
    assert.equal(r.status, 409, r.text);
    assert.deepEqual(await databaseFingerprint(), fp);
  });
});

describe("futó munka a forrásjegyzéken (review #465)", () => {
  it("csak map_id-s futó gyártás → 409 érthető üzenettel, semmi nem íródik; a gyártás lezárása után sikerül", async () => {
    const fp = await databaseFingerprint();
    const r = await admin.request("PATCH", `/api/html-files/${P}frommap`, { classroom: 6 });
    assert.equal(r.status, 409, r.text);
    assert.match((r.json as { message: string }).message, /épp gyártás, javítás vagy okosítás fut/);
    assert.deepEqual(await databaseFingerprint(), fp);
    await dbPool.query(`UPDATE studio_jobs SET status = 'ok', finished_at = now() WHERE id = 'mc-job-frommap'`);
    const ok = await admin.request("PATCH", `/api/html-files/${P}frommap`, { classroom: 6 });
    assert.equal(ok.status, 200, ok.text);
    const s = await state(`${P}frommap`);
    assert.deepEqual({ html: s.html, json: s.json, map: s.map }, { html: 6, json: 6, map: 6 });
  });

  it("futó egylépéses gyártás a forrásjegyzéken → 409; tömegesen egyetlen érintett tétel miatt az egész visszagörög", async () => {
    const fp = await databaseFingerprint();
    assert.equal((await admin.request("PATCH", `/api/html-files/${P}onestep`, { classroom: 6 })).status, 409);
    const bulk = await admin.request("POST", "/api/admin/materials/bulk-move", { materialIds: ["mc-plain", `${P}bulk-lesson`, `${P}onestep`], classroom: 11 });
    assert.equal(bulk.status, 409, bulk.text);
    assert.deepEqual(await databaseFingerprint(), fp, "a nem érintett tételek sem íródhatnak");
  });
});

describe("tömeges áthelyezés (POST /api/admin/materials/bulk-move)", () => {
  it("lecke + sima HTML + régi (nem UUID) azonosító → mind 9, a lecke mindhárom helye egyezik", async () => {
    const r = await admin.request("POST", "/api/admin/materials/bulk-move", { materialIds: [`${P}bulk-lesson`, "mc-plain", "mcLegacyNanoId_x-Y"], classroom: 9 });
    assert.equal(r.status, 200, r.text);
    assert.equal((r.json as { movedCount: number }).movedCount, 3);
    const s = await state(`${P}bulk-lesson`);
    assert.deepEqual({ html: s.html, json: s.json, map: s.map }, { html: 9, json: 9, map: 9 });
    assert.equal(await htmlClassroom("mc-plain"), 9);
    assert.equal(await htmlClassroom("mcLegacyNanoId_x-Y"), 9);
  });

  it("részleges hiba (nem létező azonosító / futó gyártás / megosztott forrásjegyzék / érvénytelen évfolyam) → teljes visszagörgetés", async () => {
    const cases: Array<[unknown, number]> = [
      [{ materialIds: ["mc-plain", `${P}does-not-exist`], classroom: 2 }, 404],
      [{ materialIds: ["mc-plain", `${P}busy`], classroom: 2 }, 409],
      [{ materialIds: ["mc-plain", `${P}shared-a`], classroom: 2 }, 409],
      [{ materialIds: ["mc-plain"], classroom: 13 }, 400],
      [{ materialIds: ["../x"], classroom: 2 }, 400],
    ];
    for (const [body, status] of cases) {
      const fp = await databaseFingerprint();
      const r = await admin.request("POST", "/api/admin/materials/bulk-move", body);
      assert.equal(r.status, status, `${JSON.stringify(body)}: ${r.text}`);
      assert.deepEqual(await databaseFingerprint(), fp, `${JSON.stringify(body)}: nem íródhat semmi`);
    }
  });

  it("a megosztott forrásjegyzék minden anyaga együtt áthelyezhető", async () => {
    const r = await admin.request("POST", "/api/admin/materials/bulk-move", { materialIds: [`${P}shared-a`, `${P}shared-b`], classroom: 7 });
    assert.equal(r.status, 200, r.text);
    for (const id of [`${P}shared-a`, `${P}shared-b`]) {
      const s = await state(id);
      assert.deepEqual({ html: s.html, json: s.json, map: s.map }, { html: 7, json: 7, map: 7 });
    }
  });
});

describe("jogosultság", () => {
  it("vendég és nem admin felhasználó → 401 / 403, az adatbázis változatlan", async () => {
    const guest = new Client(app.base);
    await guest.fetchCsrf();
    const user = new Client(app.base, await injectSession({ passport: { user: "mc-user" } }));
    await user.fetchCsrf();
    for (const c of [guest, user]) {
      const fp = await databaseFingerprint();
      const a = await c.request("PATCH", `/api/html-files/${P}arena`, { classroom: 5 });
      const b = await c.request("POST", "/api/admin/materials/bulk-move", { materialIds: [`${P}arena`], classroom: 5 });
      assert.ok([401, 403].includes(a.status), `PATCH: ${a.status}`);
      assert.ok([401, 403].includes(b.status), `bulk-move: ${b.status}`);
      assert.deepEqual(await databaseFingerprint(), fp);
    }
  });
});
