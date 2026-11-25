/**
 * J3a / D-04 (terv: docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md, J3a „D-04”) — valódi, eldobható Postgres
 * (run-learning-db-tests). Új pontkulcs: a régi Kockavadász-rekord nem kerül az új ranglistára, és nem vész el.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";

// Guard BEFORE importing modules with a database connection. No production fallback.
const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.pathname, "/websuli_test");
assert.match(process.env.WEBSULI_DISPOSABLE_DB ?? "", /^websuli-learning-test-[a-f0-9]{12}$/);

const { dbPool } = await import("../server/db");
const { getLeaderboard, listGamesCatalog, submitGameScore } = await import("../server/gameScoreService");
const { BLOCK_CRAFT_LEGACY_SCORE_KEY: LEGACY, BLOCK_CRAFT_SCORE_KEY: NEW } = await import("../shared/game-score-keys");

const tag = randomUUID().slice(0, 8);
const oldPlayer = `qa-d04-old-${tag}`;
const newPlayer = `qa-d04-new-${tag}`;

// A közös, eldobható DB-n más tesztfájlok (pl. learning-db) ütközés-kezelés nélkül töltik a katalógust: a teszt csak a
// saját maga által létrehozott katalógussorokat takarítja el, így a futási sorrendtől függetlenül tiszta állapotot hagy.
const createdCatalogIds: string[] = [];

after(async () => {
  await dbPool.query("DELETE FROM game_scores WHERE user_id = ANY($1)", [[oldPlayer, newPlayer]]);
  await dbPool.query("DELETE FROM users WHERE id = ANY($1)", [[oldPlayer, newPlayer]]);
  if (createdCatalogIds.length > 0) {
    await dbPool.query("DELETE FROM games_catalog WHERE id = ANY($1)", [createdCatalogIds]);
  }
  await dbPool.end();
});

test("D-04: a migráció kétszer futtatható, a pontkulcs nem külön játék a lobbiban", async () => {
  const existing = (await dbPool.query("SELECT id FROM games_catalog WHERE id = ANY($1)", [[LEGACY, NEW]])).rows.map((r) => r.id);
  createdCatalogIds.push(...[LEGACY, NEW].filter((id) => !existing.includes(id)));
  // A régi játék sora (a séma-export katalógussorokat nem tölt; az éles adatbázisban a 0003 tette be).
  await dbPool.query(
    `INSERT INTO games_catalog (id, title, description, sort_order) VALUES ($1, 'Kockavadász kvíz', 'régi', 4) ON CONFLICT (id) DO NOTHING`,
    [LEGACY],
  );
  const migration = await readFile(new URL("../migrations/0044_games_catalog_block_craft_v2.sql", import.meta.url), "utf8");
  await dbPool.query(migration);
  await dbPool.query(migration);
  const { rows } = await dbPool.query("SELECT id FROM games_catalog WHERE id = ANY($1) ORDER BY id", [[LEGACY, NEW]]);
  assert.deepEqual(rows.map((r) => r.id), [LEGACY, NEW]);
  const lobby = (await listGamesCatalog()).map((g) => g.id);
  assert.ok(lobby.includes(LEGACY));
  assert.ok(!lobby.includes(NEW), "a pontkulcs nem jelenhet meg második játékként");
});

test("D-04: régi rekord + új menet → az új ranglista csak az új sort adja, a régi sor érintetlen", async () => {
  await dbPool.query("INSERT INTO users (id, is_admin) VALUES ($1, false), ($2, false)", [oldPlayer, newPlayer]);
  // Régi pontskálájú rekord a régi kulcson (a beolvasztás előtti kliens írta).
  await submitGameScore({ userId: oldPlayer, gameId: LEGACY, difficulty: "normal", runXp: 9_000, runStreak: 40, runSeconds: 600 });
  const before = (await dbPool.query("SELECT * FROM game_scores WHERE user_id = $1 AND game_id = $2", [oldPlayer, LEGACY])).rows[0];

  // Új Rúnabánya-menetek az új kulcson — a régi játékos is játszik újat.
  await submitGameScore({ userId: newPlayer, gameId: NEW, difficulty: "normal", runXp: 120, runStreak: 3, runSeconds: 90 });
  await submitGameScore({ userId: oldPlayer, gameId: NEW, difficulty: "normal", runXp: 80, runStreak: 2, runSeconds: 70 });

  const fresh = await getLeaderboard(NEW, "normal", 50);
  const freshXp = fresh.map((r) => r.bestRunXp);
  assert.ok(!freshXp.includes(9_000), "a régi rekord nem kerülhet az új listára");
  assert.deepEqual(freshXp.filter((x) => x === 120 || x === 80), [120, 80]);

  const afterRow = (await dbPool.query("SELECT * FROM game_scores WHERE user_id = $1 AND game_id = $2", [oldPlayer, LEGACY])).rows[0];
  assert.deepEqual(afterRow, before, "a régi rekord nem veszhet el és nem változhat (nincs nullázás, nincs átváltás)");

  const archive = (await getLeaderboard(LEGACY, "normal", 50)).map((r) => r.bestRunXp);
  assert.ok(archive.includes(9_000));
  assert.ok(!archive.includes(120) && !archive.includes(80), "az új menet nem kerül a régi listára");
});
