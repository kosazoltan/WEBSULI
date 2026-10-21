import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Tulajdonosi kérés 2026-10-21: a kódban, a promptokban és az utasításkészletben ne legyen mojibake (rossz kódolásból eredő karakterszemét,
 * pl. „Ã©” az „é” helyett, „Å‘” az „ő” helyett). A minták karakterkódból épülnek, így maga a teszt nem tartalmaz mojibake-ot. Mért
 * állapot (2026-10-21): a repó, a leckék, a régi anyagok, a katalógus, a memóriakártyák és a promptok tiszták.
 */

const c = (...codes: number[]) => String.fromCharCode(...codes);
// UTF-8 bájtok Latin-1 / Windows-1252 / Latin-2 szerinti visszaolvasása — a magyar ékezetek és a tipográfiai jelek tipikus nyomai.
const PATTERNS: RegExp[] = [
  new RegExp(`${c(0xc3)}[${c(0x80)}-${c(0xbf)}${c(0xa9, 0xa1, 0xb3, 0xb6, 0xbc, 0xba)}]`), // Ã + második bájt (é, á, ó, ö, ü, ú…)
  new RegExp(`${c(0xc5)}[${c(0x2018, 0xb1, 0x90, 0xb0)}]`), // Å‘ (ő), Å± (ű)
  new RegExp(`${c(0xe2)}${c(0x20ac)}`), // â€ (tipográfiai idézőjel / gondolatjel)
  new RegExp(`${c(0x102)}[${c(0xa9, 0x15e, 0x2c7, 0xad)}]`), // Ă© (Latin-2 visszaolvasás)
  new RegExp(`${c(0x139)}[${c(0x2018, 0xb1)}]`), // Ĺ‘, Ĺ±
];
// A cserekép (U+FFFD) csak ott megengedett, ahol szándékos: a fél-karakter-védelemben.
const REPLACEMENT_ALLOWED = new Set(["source/scripts/content-review/lib.ts", "source/server/studio/single-run/conversation.ts"]);

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const DIRS = ["source/server", "source/shared", "source/client/src", "source/scripts", "docs", ".claude/skills"];
const FILES = ["AGENTS.md", "CLAUDE.md"];
const TEXT = /\.(ts|tsx|js|mjs|cjs|json|md|mdc|txt|html|css)$/;

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".git")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (TEXT.test(name) && st.size < 2_000_000) out.push(p);
  }
}

test("mojibake-őr: a kód, a promptok, a szabályok, a skillek és a dokumentáció mentes a kódolási szeméttől", () => {
  const files: string[] = [];
  for (const d of DIRS) walk(join(ROOT, d), files);
  for (const f of FILES) { try { statSync(join(ROOT, f)); files.push(join(ROOT, f)); } catch { /* nincs ilyen fájl */ } }
  assert.ok(files.length > 100, `előfeltétel: van mit vizsgálni (${files.length})`);
  const hits: string[] = [];
  for (const f of files) {
    const rel = relative(ROOT, f).replace(/\\/g, "/");
    const text = readFileSync(f, "utf8");
    text.split("\n").forEach((line, i) => {
      if (PATTERNS.some((p) => p.test(line))) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`);
      if (line.includes(c(0xfffd)) && !REPLACEMENT_ALLOWED.has(rel)) hits.push(`${rel}:${i + 1}: cserekép (U+FFFD)`);
    });
  }
  assert.deepEqual(hits, []);
});

test("mojibake-őr: a minták valóban elkapják a tipikus hibákat (önellenőrzés)", () => {
  const broken = Buffer.from("téli ő ű „idézet”", "utf8").toString("latin1");
  assert.ok(PATTERNS.some((p) => p.test(broken)), broken);
  assert.ok(!PATTERNS.some((p) => p.test("téli ő ű „idézet” — Ádám")), "a helyes magyar szöveg nem jelez");
});
