/** Read-only release checkpoint; credentials stay in the child environment, never argv/logs. */
import "dotenv/config";
import { mkdirSync, openSync, closeSync, statSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const folder = fileURLToPath(new URL("../../tmp/release/", import.meta.url));
mkdirSync(folder, { recursive: true });
const connection = new URL(process.env.DATABASE_URL ?? "");
if (connection.protocol !== "postgresql:" && connection.protocol !== "postgres:") throw new Error("PostgreSQL configuration required");
const env = { ...process.env, PGHOST: connection.hostname, PGPORT: connection.port || "5432", PGDATABASE: connection.pathname.slice(1), PGUSER: decodeURIComponent(connection.username), PGPASSWORD: decodeURIComponent(connection.password), PGSSLMODE: "require" };
const docker = process.platform === "win32" ? "docker.exe" : "docker";
const name = `before-release-${new Date().toISOString().replaceAll(/[:.]/g, "-")}.dump`;
const file = `${folder}/${name}`;
const fd = openSync(file, "wx", 0o600);
let dump;
try { dump = spawnSync(docker, ["run", "--rm", ...["PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGSSLMODE"].flatMap(key => ["-e", key]), "postgres:17-alpine", "pg_dump", "--format=custom", "--no-owner", "--no-privileges"], { env, windowsHide: true, timeout: 180000, stdio: ["ignore", fd, "pipe"] }); }
finally { closeSync(fd); }
if (dump.status !== 0) throw new Error("Read-only database backup failed; partial file retained, no database changed.");
const input = openSync(file, "r");
let check;
try { check = spawnSync(docker, ["run", "--rm", "-i", "postgres:17-alpine", "pg_restore", "--list"], { windowsHide: true, timeout: 30000, stdio: [input, "pipe", "pipe"], encoding: "utf8" }); }
finally { closeSync(input); }
if (check.status !== 0 || !check.stdout.includes("TABLE DATA")) throw new Error("Backup archive validation failed.");
const evidence = { createdAt: new Date().toISOString(), file: name, bytes: statSync(file).size, archiveReadable: true, tableDataEntries: check.stdout.split("\n").filter(line => line.includes("TABLE DATA")).length, databaseWrites: 0 };
writeFileSync(`${folder}/database-backup-evidence.json`, JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence));
