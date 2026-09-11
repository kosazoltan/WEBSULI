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
  await pool.end(); pool = undefined;
  console.log("Disposable PostgreSQL 17 ready; real application schema loaded.");
  const code = await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, ["--import", "tsx", "--test", "tests/learning-db.integration.ts", "tests/workflow-db.integration.ts"], {
      cwd, env: { ...env, DATABASE_URL: databaseUrl, NODE_ENV: "test", WEBSULI_DISPOSABLE_DB: name },
      windowsHide: true, stdio: "inherit",
    });
    const timeout = setTimeout(() => { child.kill(); reject(new Error("Database integration tests timed out")); }, 120_000);
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
