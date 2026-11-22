import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Záró hurok 2/3 — vak kör L1–L4 (2026-11-22) hibaosztály-őre. A memória-rétegek (manifest, QMD, Cogni) két hibaosztálya:
 *  (A) ezen a fejen NEM létező hivatkozás aktív lépésként (fájl, `npm run` parancs);
 *  (B) forrás nélküli döntés a döntés-naplóban;
 *  (+) a séma-snapshot elcsúszása a valódi Drizzle-sémától (táblanév, sorszám).
 * A még nem szállított elemek CSAK „tervezett” jelöléssel szerepelhetnek (azon a soron). Nincs YAML-függőség: a szűk alakot
 * magunk olvassuk (mint a memory-index-guard).
 */

const ROOT = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const LAYERS = [
  "memory/manifest.yaml",
  "memory/index.qmd",
  ...readdirSync(join(ROOT, "memory", ".cogni")).filter((f) => f.endsWith(".yaml")).map((f) => `memory/.cogni/${f}`),
];
const PLANNED = /tervezett/i;
const PATH_RE = /(?<![\w./~-])((?:source|scripts|docs|memory|\.agents|\.claude|\.github|\.hermes)\/[\w./-]*[\w-]\/?)/g;

/** A sor repó-útvonal hivatkozásai (helyőrzős / mintás utak nélkül). */
export function pathRefs(line: string): string[] {
  return [...line.matchAll(PATH_RE)]
    .filter((m) => !/[*<]/.test(line[(m.index ?? 0) + m[0].length] ?? ""))
    .map((m) => m[1]);
}

/** A sor `npm run <parancs>` hivatkozásai. */
export function npmRefs(line: string): string[] {
  return [...line.matchAll(/npm(?:\.cmd)? run ([\w:-]+)/g)].map((m) => m[1]);
}

test("pathRefs / npmRefs: a minta a valódi alakokat fogja, a helyőrzőt és a ~/.claude-ot nem", () => {
  assert.deepEqual(pathRefs("forrás: `source/shared/schema.ts`, docs/handoffs/*-retro.md, ~/.claude/projects/x"), ["source/shared/schema.ts"]);
  assert.deepEqual(pathRefs("skills: .agents/skills/  # tükör: .claude/skills/"), [".agents/skills/", ".claude/skills/"]);
  assert.deepEqual(npmRefs('pr: "npm run gate:pr -- --body-file x"; npm.cmd run zaro:check'), ["gate:pr", "zaro:check"]);
});

test("memória-rétegek: minden aktív fájl- és npm-hivatkozás létezik ezen a fejen (A)", () => {
  const scripts = Object.keys(JSON.parse(read("package.json")).scripts ?? {});
  const dead: string[] = [];
  for (const f of LAYERS) {
    read(f).split("\n").forEach((line, i) => {
      if (PLANNED.test(line)) return;
      for (const p of pathRefs(line)) if (!existsSync(join(ROOT, p.replace(/\/$/, "")))) dead.push(`${f}:${i + 1}: ${p}`);
      for (const s of npmRefs(line)) if (!scripts.includes(s)) dead.push(`${f}:${i + 1}: npm run ${s}`);
    });
  }
  assert.deepEqual(dead, [], `nem létező hivatkozás (jelöld „tervezett”-ként, vagy szállítsd vele):\n${dead.join("\n")}`);
});

test("döntés-napló: minden döntésnek követett, létező fájl:sor forrása van (B)", () => {
  const src = read("memory/.cogni/decisions.cogni.yaml");
  const ids = [...src.matchAll(/^\s*- id: (\S+)/gm)].map((m) => m[1]);
  const sources = [...src.matchAll(/^\s*source: "?([^"\n]+)"?$/gm)].map((m) => m[1].trim());
  assert.ok(ids.length > 0, "van döntés");
  assert.equal(sources.length, ids.length, "minden döntésnek pontosan egy source mezője van");
  const bad = sources.filter((s) => {
    const m = /^([\w./-]+):(\d+)(?:-(\d+))?$/.exec(s);
    if (!m || !existsSync(join(ROOT, m[1]))) return true;
    const n = read(m[1]).split("\n").length;
    return Number(m[2]) > n || (m[3] !== undefined && (Number(m[3]) > n || Number(m[3]) < Number(m[2])));
  });
  assert.deepEqual(bad, [], `forrás nélküli / nem létező fájl:sor forrás:\n${bad.join("\n")}`);
});

test("séma-snapshot: a táblanevek és a sorszámok egyeznek a source/shared/schema.ts-sel", () => {
  const schema = read("source/shared/schema.ts");
  const real = [...schema.matchAll(/export const (\w+) = pgTable\(\s*"([^"]+)"/g)].map((m) => ({
    table: m[2], symbol: m[1], line: schema.slice(0, m.index).split("\n").length,
  }));
  const snap = read("memory/.cogni/schema.cogni.yaml");
  const listed = [...snap.matchAll(/- table: (\S+)\n\s+symbol: (\S+)\n\s+line: (\d+)/g)].map((m) => ({ table: m[1], symbol: m[2], line: Number(m[3]) }));
  assert.deepEqual(listed, real);
  assert.match(snap, new RegExp(`table_count: ${real.length}\\b`));
});
