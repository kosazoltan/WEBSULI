// ARM64 + x64: the native dependencies must be installed for the CPU this Node runs on.
// A node_modules copied between machines (e.g. win32-arm64 -> win32-x64) breaks every tsx test
// with "You installed esbuild for another platform". This check loads each native module for real.
//
// Every module is probed in its own Node process. Loading both esbuild services, rollup's addon and
// sharp/better-sqlite3 into ONE process crashed it at exit on Windows x64 (0xC0000374 heap corruption,
// ~25% of runs, PR #391) — an artefact of the checker, not of the install; isolated probes are exact per module.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Each probe prints one detail line on success. `req` resolves from source/package.json.
const PRELUDE = `const { createRequire } = require("node:module"); const path = require("node:path");
const req = createRequire(path.join(process.cwd(), "package.json"));`;
const PROBES = [
  ["esbuild", `const e = req("esbuild"); e.transformSync("let a = 1"); console.log(e.version);`],
  // A missing tsx (incomplete install) is a diagnosis too, not a crash before the npm ci hint (review #391).
  ["tsx", `console.log(path.dirname(req.resolve("tsx/package.json")) ? "feloldva" : "");`],
  ["tsx/esbuild", `const fs = require("node:fs"); const dir = path.dirname(req.resolve("tsx/package.json"));
    if (!fs.existsSync(path.join(dir, "node_modules", "esbuild"))) { console.log("nincs saját esbuild (a gyökérét használja)"); }
    else { const e = createRequire(path.join(dir, "package.json"))("esbuild"); e.transformSync("let a = 1"); console.log(e.version); }`],
  ["rollup", `console.log(req("rollup/parseAst").parseAst("1").type);`],
  ["sharp", `console.log(req("sharp").versions.sharp);`],
  ["better-sqlite3", `const D = req("better-sqlite3"); const db = new D(":memory:"); console.log(db.prepare("select 1 as x").get().x); db.close();`],
];

function firstLine(text) {
  return String(text).split("\n").map((line) => line.trim()).find((line) => line && !line.startsWith("at ")) ?? "";
}

function probe(name, code) {
  const run = spawnSync(process.execPath, ["-e", `${PRELUDE}\n${code}`], { cwd: sourceDir, encoding: "utf8", timeout: 60_000 });
  const detail = firstLine(run.stdout);
  if (run.status === 0 && detail) return { name, ok: true, detail };
  const reason = firstLine(String(run.stderr).split("\n").filter((line) => /Error|error|not found|Cannot/.test(line)).join("\n"))
    || firstLine(run.stderr) || run.error?.message || `kilépési kód ${run.status ?? run.signal}`;
  return { name, ok: false, detail: reason };
}

export function checkNativeArch() {
  return { target: `${process.platform}-${process.arch}`, results: PROBES.map(([name, code]) => probe(name, code)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { target, results } = checkNativeArch();
  console.log(`Natív függőségek — cél: ${target}`);
  for (const r of results) console.log(`${r.ok ? "OK  " : "HIBA"} ${r.name} — ${r.detail}`);
  if (results.some((r) => !r.ok)) {
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    console.error(`\nA node_modules nem ehhez az architektúrához (${target}) települt, vagy hiányos.`);
    console.error(`Javítás: a source/ mappában futtasd: ${npm} ci  (node_modules-t gépek között ne másolj)`);
    process.exit(1);
  }
}
