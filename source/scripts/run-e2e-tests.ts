/**
 * Playwright e2e on a disposable PostgreSQL (docs/specs/2026-10-17-e2e-eldobhato-adatbazis.md).
 * Never loads project ENV files: its own postgres:17 container on loopback, migrations + e2e seed, then the Playwright suite
 * with WEBSULI_E2E=1. Extra arguments go to `playwright test` (e.g. `npm run test:e2e -- tests/websuli.spec.ts`).
 */
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import pg from "pg";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const docker = process.platform === "win32" ? "docker.exe" : "docker";
const name = `websuli-e2e-${randomBytes(6).toString("hex")}`;
const password = randomBytes(24).toString("hex");
const env: NodeJS.ProcessEnv = { ...process.env, POSTGRES_PASSWORD: password };
delete env.DATABASE_URL; delete env.DEV_DATABASE_URL; delete env.NEON_DATABASE_URL;
function command(file: string, args: string[]) {
  return execFileSync(file, args, { cwd, env, encoding: "utf8", windowsHide: true, timeout: 60_000, maxBuffer: 8 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function run(args: string[], childEnv: NodeJS.ProcessEnv, timeoutMs: number, label: string) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd, env: childEnv, windowsHide: true, stdio: "inherit" });
    const timeout = setTimeout(() => {
      // On Windows child.kill() ends only the CLI and orphans the web server and workers: end the whole tree.
      if (process.platform === "win32" && child.pid) {
        try { execFileSync("taskkill.exe", ["/T", "/F", "/PID", String(child.pid)], { windowsHide: true, stdio: "ignore" }); }
        catch { child.kill(); }
      } else child.kill();
      reject(new Error(`${label} timed out`));
    }, timeoutMs);
    child.once("error", error => { clearTimeout(timeout); reject(error); });
    child.once("exit", status => { clearTimeout(timeout); resolve(status ?? 1); });
  });
}
/** A free local port for the e2e web server, so a server another checkout left on 5000 cannot block the run. */
function freePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() => typeof address === "object" && address ? resolve(address.port) : reject(new Error("No free port")));
    });
  });
}
let containerId = "";
let pool: pg.Pool | undefined;
try {
  containerId = command(docker, ["run", "--rm", "-d", "--name", name, "-e", "POSTGRES_PASSWORD", "-e", "POSTGRES_DB=websuli_e2e", "-p", "127.0.0.1::5432", "postgres:17"]);
  if (!/^[a-f0-9]{64}$/.test(containerId)) throw new Error("Unexpected container identity");
  const address = command(docker, ["port", containerId, "5432/tcp"]);
  if (!/^127\.0\.0\.1:\d+$/.test(address)) throw new Error("Database must bind only to loopback");
  const databaseUrl = `postgresql://postgres:${password}@${address}/websuli_e2e`;
  pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 1000 });
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    try { await pool.query("select 1"); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  if (!ready) throw new Error("Disposable PostgreSQL did not become ready");
  await pool.end(); pool = undefined;
  console.log(`[E2E-HARNESS] Disposable PostgreSQL 17 ready: container ${name}, ${address} (loopback only).`);
  const dbEnv: NodeJS.ProcessEnv = { ...env, DATABASE_URL: databaseUrl, WEBSULI_DISPOSABLE_DB: name };
  // Same schema path as CI: the migration runner on an empty database, then the e2e seed.
  if (await run(["--import", "tsx", "server/migrate.ts"], dbEnv, 120_000, "Migrations") !== 0) throw new Error("Migrations failed");
  if (await run(["--import", "tsx", "tests/e2e-seed.ts"], dbEnv, 60_000, "E2E seed") !== 0) throw new Error("E2E seed failed");
  process.exitCode = await run(["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], {
    ...dbEnv, WEBSULI_E2E: "1", WEBSULI_E2E_PORT: String(await freePort()), SESSION_SECRET: randomBytes(32).toString("hex"), PW_TEST_HTML_REPORT_OPEN: "never",
  }, 60 * 60_000, "Playwright");
} catch (error) {
  // Do not print an error object that could include a child environment/connection URL.
  console.error(error instanceof Error ? error.message.replaceAll(password, "[redacted]") : "E2E harness failed");
  process.exitCode = 1;
} finally {
  await pool?.end();
  if (/^[a-f0-9]{64}$/.test(containerId)) {
    command(docker, ["stop", "--time", "2", containerId]);
    console.log("[E2E-HARNESS] Owned disposable database removed.");
  }
}
