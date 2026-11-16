/**
 * Review #474 (Codex P2 + vercel): a `server/scripts/setAdmin.ts` a meglévő fiókot kis- / nagybetűtől függetlenül találja meg,
 * azt emeli adminná (azonosító szerint), új sort nem hoz létre mellé, és a tárolt cím írásmódját nem írja át. Több illeszkedő
 * sornál érthető hibával megáll, és nem módosít semmit. Eldobható Postgresen (npm run test:learning-db), valódi szkript-futtatással.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { after, before, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import pg from "pg";

if (!process.env.WEBSULI_DISPOSABLE_DB || !process.env.DATABASE_URL) throw new Error("Csak a saját eldobható adatbázison fut (npm run test:learning-db).");

const SOURCE = fileURLToPath(new URL("..", import.meta.url));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const q = async (sql: string, params: unknown[] = []) => (await pool.query(sql, params)).rows as Record<string, unknown>[];

function setAdmin(email: string) {
  return spawnSync(process.execPath, ["--import", "tsx", "server/scripts/setAdmin.ts", email], {
    cwd: SOURCE, encoding: "utf8", timeout: 60_000, env: { ...process.env, LOG_LEVEL: "debug" },
  });
}

before(async () => {
  await q(`DELETE FROM users WHERE lower(email) LIKE 'setadmin-%@pelda.hu'`);
  await q(`INSERT INTO users (id, email, is_admin, first_name) VALUES
    ('setadmin-mixed', 'SetAdmin-Vegyes@Pelda.HU', false, 'Meglévő'),
    ('setadmin-dup-1', 'setadmin-dupla@pelda.hu', false, NULL),
    ('setadmin-dup-2', 'SETADMIN-DUPLA@pelda.hu', false, NULL)`);
});
after(async () => {
  await q(`DELETE FROM users WHERE lower(email) LIKE 'setadmin-%@pelda.hu'`);
  await pool.end();
});

describe("setAdmin szkript — eldobható adatbázison", () => {
  it("nagybetűs írásmóddal tárolt fiók: azt emeli, új sor nem jön létre, a tárolt cím változatlan", async () => {
    const r = setAdmin("setadmin-vegyes@pelda.hu");
    assert.equal(r.status, 0, r.stderr);
    const rows = await q(`SELECT id, email, is_admin, first_name FROM users WHERE lower(email) = 'setadmin-vegyes@pelda.hu'`);
    assert.equal(rows.length, 1, "új sor nem jöhet létre");
    assert.deepEqual(rows[0], { id: "setadmin-mixed", email: "SetAdmin-Vegyes@Pelda.HU", is_admin: true, first_name: "Meglévő" });
  });

  it("több kis- / nagybetű szerint illeszkedő fiók: exit 1, érthető hiba, semmi nem módosul", async () => {
    const r = setAdmin("Setadmin-Dupla@pelda.hu");
    assert.equal(r.status, 1, r.stderr);
    assert.match(`${r.stdout}${r.stderr}`, /2 fiók illik erre a címre/);
    const rows = await q(`SELECT is_admin FROM users WHERE lower(email) = 'setadmin-dupla@pelda.hu'`);
    assert.equal(rows.length, 2);
    assert.ok(rows.every((x) => x.is_admin === false));
  });

  it("nem létező cím: új admin-sor jön létre a megadott írásmóddal (a régi viselkedés), név nélkül", async () => {
    const r = setAdmin("setadmin-uj@pelda.hu");
    assert.equal(r.status, 0, r.stderr);
    const rows = await q(`SELECT email, is_admin, first_name, last_name FROM users WHERE lower(email) = 'setadmin-uj@pelda.hu'`);
    assert.deepEqual(rows, [{ email: "setadmin-uj@pelda.hu", is_admin: true, first_name: null, last_name: null }]);
    // Ismételt futás: ugyanazt a sort találja, nem hoz létre másodikat.
    assert.equal(setAdmin("SETADMIN-UJ@pelda.hu").status, 0);
    assert.equal((await q(`SELECT 1 FROM users WHERE lower(email) = 'setadmin-uj@pelda.hu'`)).length, 1);
  });
});
