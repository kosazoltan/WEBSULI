// ARM64 + x64: the native dependencies must be installed for the CPU this Node runs on.
// A node_modules copied between machines (e.g. win32-arm64 -> win32-x64) breaks every tsx test
// with "You installed esbuild for another platform". This check loads each native module for real.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(sourceDir, "package.json"));

function firstLine(error) {
  return String(error?.message ?? error).split("\n").find((line) => line.trim()) ?? "ismeretlen hiba";
}

function probe(name, run) {
  try {
    return { name, ok: true, detail: String(run() ?? "betöltve") };
  } catch (error) {
    return { name, ok: false, detail: firstLine(error) };
  }
}

export function checkNativeArch() {
  const target = `${process.platform}-${process.arch}`;
  const results = [
    probe("esbuild", () => require("esbuild").transformSync("let a = 1").code.length > 0 && require("esbuild").version),
  ];

  const tsxDir = path.dirname(require.resolve("tsx/package.json"));
  if (fs.existsSync(path.join(tsxDir, "node_modules", "esbuild"))) {
    const tsxRequire = createRequire(path.join(tsxDir, "package.json"));
    results.push(probe("tsx/esbuild", () => tsxRequire("esbuild").transformSync("let a = 1").code.length > 0 && tsxRequire("esbuild").version));
  }

  results.push(
    probe("rollup", () => require("rollup/parseAst").parseAst("1").type),
    probe("sharp", () => require("sharp").versions.sharp),
    probe("better-sqlite3", () => {
      const Database = require("better-sqlite3");
      const db = new Database(":memory:");
      try {
        return db.prepare("select 1 as x").get().x;
      } finally {
        db.close();
      }
    }),
  );

  return { target, results };
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
