import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * #185 — a higiéniai söprés 29 halott VPS/Hostinger memóriafájlt archivált, és
 * az index.yml-t kézzel írtuk újra. Semmi nem őrizte, hogy az index a VALÓSÁGRA
 * mutasson: a `npm test` egyetlen tesztje sem olvasta sem az index.yml-t, sem a
 * .gitignore-t, így egy halott útvonalra mutató index végig zöld maradt volna.
 *
 * Ez a kapu a repo bevált parse-alapú mintáját követi (vercel-lesson-csp,
 * studio-hook-order-guard): nincs YAML-függőség, a szűk alakot magunk olvassuk.
 */

const ROOT = join(import.meta.dirname, "..", "..");
const INDEX = join(ROOT, "memory", "indexes", "index.yml");

/** A `collections:` blokk `path:` + `files:` párjai, és az `archived:` blokk. */
function parseIndex(src: string) {
  const collections: Array<{ path: string; files: string[] }> = [];
  let archivedPath = "";
  let archivedCount = -1;
  let cur: { path: string; files: string[] } | null = null;
  let inFiles = false;

  for (const raw of src.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (!line.trim()) continue;

    const path = /^\s{4}path:\s*(\S+)/.exec(line);
    if (path) {
      cur = { path: path[1], files: [] };
      collections.push(cur);
      inFiles = false;
      continue;
    }
    if (/^\s{4}files:\s*$/.test(line)) { inFiles = true; continue; }
    if (/^\s{4}\w+:/.test(line)) inFiles = false;

    const item = /^\s{6}-\s+(\S+)/.exec(line);
    if (item && inFiles && cur) cur.files.push(item[1]);

    const ap = /^\s{2}path:\s*(\S+)/.exec(line);
    if (ap) archivedPath = ap[1];
    const ac = /^\s{2}count:\s*(\d+)/.exec(line);
    if (ac) archivedCount = Number(ac[1]);
  }
  // Az `archived:` blokk `path:`-ja 2 szóközzel áll, a gyűjteményeké 4-gyel —
  // az utóbbi tévedésből ne kerüljön a gyűjtemények közé.
  return { collections, archivedPath, archivedCount };
}

const idx = parseIndex(readFileSync(INDEX, "utf8"));

test("index.yml: minden hivatkozott memóriafájl létezik (#185)", () => {
  assert.ok(idx.collections.length > 0, "a parser talált gyűjteményeket");
  const missing = idx.collections.flatMap((c) =>
    c.files.filter((f) => !existsSync(join(ROOT, c.path, f))).map((f) => c.path + f),
  );
  assert.deepEqual(missing, [], `halott útvonal az indexben:\n${missing.join("\n")}`);
});

test("index.yml: nincs indexeletlen élő memóriafájl (#185)", () => {
  const listed = new Set(idx.collections.flatMap((c) => c.files.map((f) => c.path + f)));
  const onDisk: string[] = [];
  const walk = (dir: string, rel: string) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(dir, e.name), `${rel}${e.name}/`);
      else if (e.name.endsWith(".md")) onDisk.push(rel + e.name);
    }
  };
  walk("memory", "memory/");
  const orphans = onDisk.filter((f) => !listed.has(f));
  assert.deepEqual(orphans, [], `indexből kimaradt fájl:\n${orphans.join("\n")}`);
});

test("index.yml: az archívum darabszáma egyezik a valósággal (#185)", () => {
  assert.ok(idx.archivedCount >= 0, "van deklarált archívum-darabszám");
  const actual = readdirSync(join(ROOT, idx.archivedPath)).length;
  assert.equal(actual, idx.archivedCount, "a deklarált és a tényleges archívum eltér");
});

test("a kapu kiszúrja a halott útvonalat (önellenőrzés, #185)", () => {
  const bad = parseIndex(
    ["collections:", "  x:", "    path: memory/nincs/", "    files:", "      - nincs.md"].join("\n"),
  );
  const missing = bad.collections.flatMap((c) =>
    c.files.filter((f) => !existsSync(join(ROOT, c.path, f))),
  );
  assert.equal(missing.length, 1, "a hamis bejegyzést hiányzóként jelenti");
});
