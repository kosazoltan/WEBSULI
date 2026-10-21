import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Tulajdonosi kérés 2026-10-21: a kódban, a promptokban és az utasításkészletben ne legyen mojibake (rossz kódolásból eredő karakterszemét,
 * pl. az „é” helyett U+00C3 + U+00A9). A minták karakterkódból épülnek, és a teszt a saját könyvtárát is vizsgálja (review #355),
 * így maga a teszt sem tartalmazhat mojibake-ot — a példák csak kódpontként szerepelnek. Mért
 * állapot (2026-10-21): a repó, a leckék, a régi anyagok, a katalógus, a memóriakártyák és a promptok tiszták.
 */

const c = (...codes: number[]) => String.fromCharCode(...codes);
// UTF-8 bájtok Latin-1 / Windows-1252 / Latin-2 szerinti visszaolvasása — a magyar ékezetek és a tipográfiai jelek tipikus nyomai.
const PATTERNS: RegExp[] = [
  new RegExp(`${c(0xc3)}[${c(0x80)}-${c(0xbf)}${c(0xa9, 0xa1, 0xb3, 0xb6, 0xbc, 0xba)}]`), // U+00C3 + második bájt (é, á, ó, ö, ü, ú…)
  new RegExp(`${c(0xc5)}[${c(0x2018, 0xb1, 0x90, 0xb0)}]`), // U+00C5 + második jel (ő, ű)
  new RegExp(`${c(0xe2)}${c(0x20ac)}`), // U+00E2 + U+20AC (tipográfiai idézőjel / gondolatjel)
  new RegExp(`${c(0x102)}[${c(0xa9, 0x15e, 0x2c7, 0xad)}]`), // U+0102 + második jel (Latin-2 visszaolvasás)
  new RegExp(`${c(0x139)}[${c(0x2018, 0xb1)}]`), // U+0139 + második jel (Latin-2: ő, ű)
];
// A cserekép (U+FFFD) csak ott megengedett, ahol szándékos: a fél-karakter-védelemben.
const REPLACEMENT_ALLOWED = new Set(["source/scripts/content-review/lib.ts", "source/server/studio/single-run/conversation.ts"]);

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const DIRS = ["source/server", "source/shared", "source/client/src", "source/scripts", "source/tests", "docs", ".claude/skills"];
// Review #355: a vezérlőfájlok bárhol a repóban (beágyazott AGENTS.md / CLAUDE.md is).
const RULE_FILES = new Set(["AGENTS.md", "CLAUDE.md"]);
const SKIP = (name: string) => name === "node_modules" || name === "dist" || name.startsWith(".git") || name.startsWith(".wt-");
const TEXT = /\.(ts|tsx|js|mjs|cjs|json|md|mdc|txt|html|css)$/;

function findRuleFiles(dir: string, out: string[]): void {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (SKIP(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) findRuleFiles(p, out);
    else if (RULE_FILES.has(name)) out.push(p);
  }
}

function walk(dir: string, out: string[]): void {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (SKIP(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (TEXT.test(name) && st.size < 2_000_000) out.push(p);
  }
}

test("mojibake-őr: a kód, a promptok, a szabályok, a skillek és a dokumentáció mentes a kódolási szeméttől", () => {
  const files: string[] = [];
  for (const d of DIRS) walk(join(ROOT, d), files);
  findRuleFiles(ROOT, files);
  assert.ok(files.some((f) => /AGENTS.md$/.test(f)), "előfeltétel: a gyökér AGENTS.md is vizsgálva");
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
