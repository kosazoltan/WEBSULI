// docs/specs/2026-10-17-e2e-eldobhato-adatbazis.md: in e2e mode the server never reaches a non-loopback database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertE2eDatabaseUrl, describeE2eDatabase, isE2eMode, isLoopbackDatabaseUrl } from "../server/lib/e2e-mode";

const root = fileURLToPath(new URL("../", import.meta.url));
const SECRET = "s3cr3t-pw-should-never-print";
const REMOTE = `postgresql://owner:${SECRET}@ep-example-123.eu-central-1.aws.neon.tech/neondb?sslmode=require`;

test("csak literális loopback IP-jű postgres URL fogadható el", () => {
  assert.equal(isLoopbackDatabaseUrl(`postgresql://postgres:${SECRET}@127.0.0.1:55432/websuli_e2e`), true);
  assert.equal(isLoopbackDatabaseUrl("postgres://postgres:postgres@127.0.0.1:5432/websuli"), true);
  assert.equal(isLoopbackDatabaseUrl("postgres://postgres:postgres@[::1]:5432/websuli"), true);
  for (const rejected of [
    REMOTE,
    "postgres://postgres:postgres@localhost:5432/websuli",
    "postgres://postgres:postgres@127.0.0.1.evil.example:5432/db",
    "postgres://postgres:postgres@127.0.0.1:5432/db?host=ep-x.neon.tech",
    "postgres://postgres:postgres@127.0.0.1:5432/db?hostaddr=10.0.0.5",
    "mysql://root:root@127.0.0.1:3306/db",
    "",
    undefined,
    "not a url",
  ]) assert.equal(isLoopbackDatabaseUrl(rejected), false, String(rejected));
});

test("az őr elutasít, és az üzenetben nincs se jelszó, se hoszt", () => {
  assert.throws(() => assertE2eDatabaseUrl(REMOTE), (error: Error) =>
    /indulás megtagadva/.test(error.message) && !error.message.includes(SECRET) && !error.message.includes("neon.tech"));
  assert.throws(() => assertE2eDatabaseUrl(undefined));
  assert.doesNotThrow(() => assertE2eDatabaseUrl("postgres://postgres:postgres@127.0.0.1:5432/websuli"));
  assert.equal(describeE2eDatabase(`postgresql://postgres:${SECRET}@127.0.0.1:55432/websuli_e2e`), "127.0.0.1:55432/websuli_e2e");
  assert.equal(describeE2eDatabase(REMOTE), "nem loopback (elutasítva)");
  assert.equal(isE2eMode({ WEBSULI_E2E: "1" }), true);
  assert.equal(isE2eMode({}), false);
});

// The probes may run outside source/ (temp cwd), so tsx is passed by absolute URL.
const tsx = import.meta.resolve("tsx");

function childEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.DATABASE_URL; delete env.DEV_DATABASE_URL; delete env.WEBSULI_E2E;
  return { ...env, ...extra };
}

test("e2e módban a db.ts nem-loopback URL-lel a pool létrehozása előtt kilép, a titok nem jelenik meg", () => {
  const dbModule = pathToFileURL(join(root, "server", "db.ts")).href;
  const result = spawnSync(process.execPath, ["--import", tsx, "--input-type=module", "-e",
    `await import(${JSON.stringify(dbModule)}); console.log("POOL_CREATED");`], {
    cwd: root, encoding: "utf8", timeout: 60_000, windowsHide: true,
    env: childEnv({ WEBSULI_E2E: "1", DATABASE_URL: REMOTE, NODE_ENV: "production" }),
  });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(output, /POOL_CREATED/);
  assert.match(output, /indulás megtagadva/);
  assert.equal(output.includes(SECRET), false);
  assert.equal(output.includes("neon.tech"), false);
});

test("e2e módban a .env nem töltődik be, enélkül igen", () => {
  const dir = mkdtempSync(join(tmpdir(), "websuli-e2e-env-"));
  try {
    writeFileSync(join(dir, ".env"), `DATABASE_URL=${REMOTE}\nDEV_DATABASE_URL=${REMOTE}\n`);
    const loader = pathToFileURL(join(root, "server", "lib", "load-env.ts")).href;
    const probe = (extra: Record<string, string>) => spawnSync(process.execPath, ["--import", tsx, "--input-type=module", "-e",
      `await import(${JSON.stringify(loader)}); console.log("LOADED=" + Boolean(process.env.DATABASE_URL) + "," + Boolean(process.env.DEV_DATABASE_URL));`], {
      cwd: dir, encoding: "utf8", timeout: 60_000, windowsHide: true, env: childEnv(extra),
    });
    const e2e = probe({ WEBSULI_E2E: "1" });
    assert.equal(e2e.status, 0, e2e.stderr);
    assert.match(e2e.stdout, /LOADED=false,false/);
    const normal = probe({});
    assert.equal(normal.status, 0, normal.stderr);
    assert.match(normal.stdout, /LOADED=true,true/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
