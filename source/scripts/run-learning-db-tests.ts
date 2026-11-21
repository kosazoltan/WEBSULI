/** Disposable PostgreSQL integration harness. Never loads project ENV files. */
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import pg from "pg";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const docker = process.platform === "win32" ? "docker.exe" : "docker";
const name = `websuli-learning-test-${randomBytes(6).toString("hex")}`;
const password = randomBytes(24).toString("hex");
const env: NodeJS.ProcessEnv = { ...process.env, POSTGRES_PASSWORD: password };
delete env.DATABASE_URL; delete env.DEV_DATABASE_URL;
function command(file: string, args: string[]) {
  return execFileSync(file, args, { cwd, env, encoding: "utf8", windowsHide: true, timeout: 60_000, maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
}
let containerId = "";
let pool: pg.Pool | undefined;
try {
  containerId = command(docker, ["run", "--rm", "-d", "--name", name, "-e", "POSTGRES_PASSWORD", "-e", "POSTGRES_DB=websuli_test", "-p", "127.0.0.1::5432", "postgres:17"]);
  if (!/^[a-f0-9]{64}$/.test(containerId)) throw new Error("Unexpected container identity");
  const address = command(docker, ["port", containerId, "5432/tcp"]);
  if (!/^127\.0\.0\.1:\d+$/.test(address)) throw new Error("Database must bind only to loopback");
  const databaseUrl = `postgresql://postgres:${password}@${address}/websuli_test`;
  pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 1000 });
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { await pool.query("select 1"); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready");
  const ddl = command(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "export", "--dialect=postgresql", "--schema=./shared/schema.ts"]);
  await pool.query(ddl);
  // This database was created above, has no external data, and is owned by this run.
  // Exercise the additive migration from the preceding schema, then its repeatability.
  await pool.query("DROP TABLE lesson_attempts");
  const migration = await readFile(new URL("../migrations/0016_lesson_attempts.sql", import.meta.url), "utf8");
  await pool.query(migration);
  await pool.query(migration);
  await pool.query("ALTER TABLE coupons DROP COLUMN quiz_snapshot, DROP COLUMN quiz_answers");
  const couponMigration = await readFile(new URL("../migrations/0017_coupon_quiz_answers.sql", import.meta.url), "utf8");
  await pool.query(couponMigration);
  await pool.query(couponMigration);
  await pool.query("ALTER TABLE knowledge_maps DROP COLUMN classification");
  const sourceMigration = await readFile(new URL("../migrations/0018_source_classification.sql", import.meta.url), "utf8");
  await pool.query(sourceMigration);
  await pool.query(sourceMigration);
  const workflowMigration = await readFile(new URL("../migrations/0019_lesson_workflow_runs.sql", import.meta.url), "utf8");
  await pool.query(workflowMigration);
  await pool.query(workflowMigration);
  const skillMigration = await readFile(new URL("../migrations/0020_lesson_skill_learning.sql", import.meta.url), "utf8");
  await pool.query(skillMigration);
  await pool.query(skillMigration);
  // Erőforrás S2b: a futás→job keresés generált oszlopa (0036) a migrációs fájlból, kétszer — idempotens.
  const resourceIdMigration = await readFile(new URL("../migrations/0036_workflow_resource_id.sql", import.meta.url), "utf8");
  await pool.query(resourceIdMigration);
  await pool.query(resourceIdMigration);
  // S8: the outcome table from the migration file itself (not the schema export), twice.
  await pool.query("DROP TABLE catalog_item_outcomes");
  const outcomeMigration = await readFile(new URL("../migrations/0023_catalog_item_outcomes.sql", import.meta.url), "utf8");
  await pool.query(outcomeMigration);
  await pool.query(outcomeMigration);
  // Websuli Design §7: the review tables from the migration file itself (not the schema export), twice.
  await pool.query("DROP TABLE review_events; DROP TABLE review_states");
  const reviewMigration = await readFile(new URL("../migrations/0027_review_states.sql", import.meta.url), "utf8");
  await pool.query(reviewMigration);
  await pool.query(reviewMigration);
  // Ikonkészlet: the design_assets table from the migration file itself (not the schema export), twice.
  await pool.query("DROP TABLE design_assets");
  const designMigration = await readFile(new URL("../migrations/0028_design_assets.sql", import.meta.url), "utf8");
  await pool.query(designMigration);
  await pool.query(designMigration);
  // Arculati bank: 0029 (topic + bővített kind CHECK) a 0028 után, kétszer — idempotens.
  const topicMigration = await readFile(new URL("../migrations/0029_design_assets_topic.sql", import.meta.url), "utf8");
  await pool.query(topicMigration);
  await pool.query(topicMigration);
  // Tanulói eredmény e-mail: 0030 a migrációs fájlból (nem a séma-exportból), kétszer — idempotens.
  await pool.query("DROP TABLE lesson_result_emails");
  const resultMigration = await readFile(new URL("../migrations/0030_lesson_result_emails.sql", import.meta.url), "utf8");
  await pool.query(resultMigration);
  await pool.query(resultMigration);
  // Napi emlékeztető: 0031 (tanulónév-oszlop + ismétlésvédelmi tábla) a migrációs fájlból, kétszer — idempotens.
  await pool.query("DROP TABLE daily_reminder_emails; ALTER TABLE extra_email_addresses DROP COLUMN student_name");
  const reminderMigration = await readFile(new URL("../migrations/0031_daily_reminders.sql", import.meta.url), "utf8");
  await pool.query(reminderMigration);
  await pool.query(reminderMigration);
  // S4b: a feladatszintű eredmény táblája (0037) a migrációs fájlból (nem a séma-exportból), kétszer — idempotens.
  await pool.query("DROP TABLE task_results");
  const taskResultsMigration = await readFile(new URL("../migrations/0037_task_results.sql", import.meta.url), "utf8");
  await pool.query(taskResultsMigration);
  await pool.query(taskResultsMigration);
  // Adventi naptár S2a: az adventi táblák (0042) a player_accounts-ra hivatkoznak, ezért az eldobható adatbázisban előbb ezek
  // törlődnek; a 0040 után a 0042 migrációs fájl hozza létre őket újra.
  await pool.query("DROP TABLE advent_announcements; DROP TABLE advent_progress");
  // JM7a: a játékos-fiók táblái (0040) a migrációs fájlból (nem a séma-exportból), kétszer — idempotens.
  await pool.query("DROP TABLE player_auth_codes; DROP TABLE player_accounts");
  const playerMigration = await readFile(new URL("../migrations/0040_player_accounts.sql", import.meta.url), "utf8");
  await pool.query(playerMigration);
  await pool.query(playerMigration);
  // Adventi naptár S2a: az előrehaladás és az értesítő-foglalás táblái (0042) a migrációs fájlból, kétszer — idempotens.
  const adventMigration = await readFile(new URL("../migrations/0042_advent_progress.sql", import.meta.url), "utf8");
  await pool.query(adventMigration);
  await pool.query(adventMigration);
  // S8b: a leckehangok táblája (0043) a migrációs fájlból (nem a séma-exportból), kétszer — idempotens.
  await pool.query("DROP TABLE lesson_tts_audio");
  const ttsAudioMigration = await readFile(new URL("../migrations/0043_lesson_tts_audio.sql", import.meta.url), "utf8");
  await pool.query(ttsAudioMigration);
  await pool.query(ttsAudioMigration);
  await pool.end(); pool = undefined;
  console.log("Disposable PostgreSQL 17 ready; real application schema loaded.");
  const code = await new Promise<number>((resolve, reject) => {
    // The reconciler intentionally scans all workflow rows; isolate suite-owned lifecycle tests.
    const child = spawn(process.execPath, ["--import", "tsx", "--test", "--test-concurrency=1", "tests/learning-db.integration.ts", "tests/workflow-db.integration.ts", "tests/lesson-skill-db.integration.ts", "tests/lesson-draft-db.integration.ts", "tests/review-db.integration.ts", "tests/design-assets-db.integration.ts", "tests/lesson-result-email-db.integration.ts", "tests/daily-reminder-db.integration.ts", "tests/newsletter-db.integration.ts", "tests/admin-authz-matrix-db.integration.ts", "tests/player-auth-db.integration.ts", "tests/player-account-db.integration.ts", "tests/material-classroom-db.integration.ts", "tests/admin-allowlist-db.integration.ts", "tests/set-admin-script-db.integration.ts", "tests/quiz-bank-scale-db.integration.ts", "tests/advent-db.integration.ts", "tests/advent-routes-db.integration.ts", "tests/tts-audio-db.integration.ts", "tests/lesson-clips-db.integration.ts"], {
      cwd, env: { ...env, DATABASE_URL: databaseUrl, NODE_ENV: "test", WEBSULI_DISPOSABLE_DB: name },
      windowsHide: true, stdio: "inherit",
    });
    // JM7a: az admin-jogosultsági mátrix (~110 végpont × 7 szerep × 2 menet, valódi HTTP) miatt 120 s → 300 s.
    // Adventi naptár S2b: a kör az S2a után 286 s volt (mérve, 2026-11-18); a végpont-tesztek (valódi HTTP, a 144 írásos
    // legrosszabb esettel) ~50 s-ot adnak hozzá → 300 s → 480 s. Mérve 2026-11-18 (S2b 2. visszanézés után, terheletlen gépen):
    // 226 teszt 300 s (a teljes parancs 306 s) → 37% tartalék. Ha a tartalék 15% alá megy, a teszteket kell gyorsítani
    // (kevesebb kliens azonos fedéssel, párhuzamos kérések), NEM a korlátot emelni.
    const timeout = setTimeout(() => { child.kill(); reject(new Error("Database integration tests timed out")); }, 480_000);
    child.once("error", error => { clearTimeout(timeout); reject(error); });
    child.once("exit", status => { clearTimeout(timeout); resolve(status ?? 1); });
  });
  process.exitCode = code;
} catch (error) {
  // Do not print an error object that could include a child environment/connection URL.
  console.error(error instanceof Error ? error.message.replaceAll(password, "[redacted]") : "Database test harness failed");
  process.exitCode = 1;
} finally {
  await pool?.end();
  if (/^[a-f0-9]{64}$/.test(containerId)) {
    command(docker, ["stop", "--time", "2", containerId]);
    console.log("Owned disposable database removed.");
  }
}
