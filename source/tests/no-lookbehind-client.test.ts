import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// Spec 2026-11-10-hibavadaszat, C szelet: a Safari < 16.4 a regex-visszatekintést (lookbehind) szintaktikai hibának veszi,
// így egy ilyen minta az egész JS-csomagot (chunk) betöltésképtelenné teszi. A klienscsomagból elérhető egyetlen forrásfájlban
// sem állhat ilyen minta. A keresett jelsorokat összefűzéssel építjük, hogy ez a fájl maga se tartalmazza őket.

const SOURCE_ROOT = path.resolve(import.meta.dirname, "..");
const CLIENT_SRC = path.join(SOURCE_ROOT, "client", "src");
const SHARED = path.join(SOURCE_ROOT, "shared");
const NEEDLES = ["(" + "?<" + "!", "(" + "?<" + "="];
const EXTENSIONS = [".ts", ".tsx"];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return EXTENSIONS.includes(path.extname(entry.name)) ? [full] : [];
  });
}

function resolveSpecifier(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@shared/")) base = path.join(SHARED, specifier.slice("@shared/".length));
  else if (specifier.startsWith("@/")) base = path.join(CLIENT_SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = path.resolve(path.dirname(from), specifier);
  else return null; // csomag (node_modules) — nem a repo forrása
  const candidates = [base, ...EXTENSIONS.map((e) => base + e), ...EXTENSIONS.map((e) => path.join(base, "index" + e))];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile() && EXTENSIONS.includes(path.extname(c))) ?? null;
}

// `import x from "y"`, `import "y"`, `export … from "y"`, `import("y")`; a `import type …` / `export type … from` kimarad.
const IMPORT_RE = /(?:^|[\n;])\s*(import|export)\s+(type\s+)?(?:[^"';]*?\sfrom\s*)?["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g;

function importsOf(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(IMPORT_RE)) {
    if (m[3] !== undefined) {
      if (m[2]) continue; // type-only
      found.push(m[3]);
    } else if (m[4] !== undefined) found.push(m[4]);
  }
  return found;
}

function reachableFiles(): string[] {
  const seen = new Set<string>();
  const queue = walk(CLIENT_SRC);
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const spec of importsOf(fs.readFileSync(file, "utf8"))) {
      const target = resolveSpecifier(file, spec);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return [...seen].sort();
}

test("a klienscsomagból elérhető forrásokban nincs regex-visszatekintés (régi Safari)", () => {
  const files = reachableFiles();
  assert.ok(files.length > 50, "a bejárásnak a klienskód nagy részét el kell érnie");
  assert.ok(files.some((f) => f.startsWith(SHARED)), "a közös (shared) fájlokat is el kell érni");
  const offenders: string[] = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (NEEDLES.some((n) => line.includes(n))) offenders.push(`${path.relative(SOURCE_ROOT, file)}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [], `visszatekintő minta a klienscsomagból elérhető fájlban: ${offenders.join(", ")}`);
});

test("az importbejárás felismeri a típus-importot és a feloldható importot", () => {
  assert.deepEqual(importsOf(`import type { A } from "@shared/a";\nimport { B } from "@shared/b";\nexport type { C } from "./c";\nexport { D } from "./d";\nimport "./e";\nconst x = import("./f");`),
    ["@shared/b", "./d", "./e", "./f"]);
  assert.ok(resolveSpecifier(path.join(CLIENT_SRC, "x.ts"), "@shared/option-order"));
});
