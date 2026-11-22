import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Záró hurok 2/3 — a memória-rétegek (manifest, QMD, Cogni) hibaosztály-őre (vak körök 2026-11-22, L1–L8):
 *  (A) hivatkozás csak a Gitben KÖVETETT fájlra / könyvtárra (a fej fája, nem a helyi lemez), `npm run` csak létező parancsra;
 *      gyökérfájlok és csupasz, backtickes fájlnevek is; „tervezett” jelölés nem ment fel.
 *  (B) minden `source` mező `<követett fájl>[:<kezdő>[-<záró>]]` (1 ≤ kezdő ≤ záró); a döntés-napló bejegyzésenként: egyedi `id`,
 *      saját `quote` + `source`.
 *  (C) minden `quote` szó szerint (szóköz-normalizálva) megtalálható a megnevezett FÁJLBAN — értelmezés nem kerülhet be.
 *  (D) a séma-snapshot csak a forrás-mutatót és táblanevek halmazát tartja; minden állított tábla létezik a sémában.
 * INVARIÁNS (#527 push-kapu, 2026-11-22): az őr nem bukhat el amiatt, hogy egy MÁSIK PR a hivatkozott forrásfájlt szabályosan
 * módosítja — ezért a sorszám csak tájékoztató tipp (nem mérjük a fájl hosszához), és új tábla a sémában nem bukás.
 * A YAML-t a szűk részhalmazra írt saját elemző olvassa (nincs YAML-függőség, mint a memory-index-guard-nál).
 */

const ROOT = join(import.meta.dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");

// ---- szűk YAML-elemző ---------------------------------------------------------------------------------------------------

type Y = string | Y[] | { [k: string]: Y };

function stripComment(s: string): string {
  let q: string | null = null;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (q) {
      if (q === '"' && c === "\\") i += 1;
      else if (c === q) q = null;
      continue;
    }
    if ((c === '"' || c === "'") && (i === 0 || /[\s:[{,-]/.test(s[i - 1]))) q = c;
    else if (c === "#" && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i).trimEnd();
  }
  if (q) throw new Error(`lezáratlan idézőjel: ${s}`);
  return s.trimEnd();
}

function scalar(v: string, n: number): Y {
  if (v.startsWith('"')) {
    if (!/^"(?:[^"\\]|\\.)*"$/.test(v)) throw new Error(`${n}: hibás idézőjeles érték`);
    return JSON.parse(v) as string;
  }
  if (v.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(v)) throw new Error(`${n}: hibás idézőjeles érték`);
    return v.slice(1, -1).replace(/''/g, "'");
  }
  if (v === "[]") return [];
  if (v === "{}") return {};
  if (/^[|>[{&*!%@`]/.test(v)) throw new Error(`${n}: nem támogatott YAML-alak: ${v}`);
  if (/:\s/.test(v)) throw new Error(`${n}: idézőjel nélküli érték kettősponttal`);
  return v;
}

/** A memória-rétegek szűk YAML-részhalmaza: blokk-leképezés, -sorozat, egysoros skalár, `[]`, `{}`. Hibára dob. */
export function parseYaml(text: string): Y {
  const lines: { n: number; ind: number; s: string }[] = [];
  text.replace(/\r\n/g, "\n").split("\n").forEach((raw, i) => {
    if (/^\t| \t/.test(raw.match(/^\s*/)![0])) throw new Error(`${i + 1}: tabulátor a behúzásban`);
    const s = stripComment(raw);
    if (s.trim() && s.trim() !== "---") lines.push({ n: i + 1, ind: s.match(/^ */)![0].length, s: s.trim() });
  });
  let pos = 0;
  const block = (ind: number): Y => {
    if (pos >= lines.length) return {};
    if (lines[pos].ind !== ind) throw new Error(`${lines[pos].n}: váratlan behúzás`);
    if (lines[pos].s.startsWith("- ") || lines[pos].s === "-") {
      const arr: Y[] = [];
      while (pos < lines.length && lines[pos].ind === ind && (lines[pos].s.startsWith("- ") || lines[pos].s === "-")) {
        const ln = lines[pos];
        const rest = ln.s.slice(1).trim();
        if (!rest) { pos += 1; arr.push(pos < lines.length && lines[pos].ind > ind ? block(lines[pos].ind) : ""); continue; }
        if (/^[^"'][^:]*:(\s|$)/.test(rest) || /^"[^"]*":(\s|$)/.test(rest)) {
          const sub = ind + 2;
          lines[pos] = { n: ln.n, ind: sub, s: rest };
          arr.push(block(sub));
        } else { arr.push(scalar(rest, ln.n)); pos += 1; }
      }
      if (pos < lines.length && lines[pos].ind > ind) throw new Error(`${lines[pos].n}: váratlan behúzás`);
      return arr;
    }
    const obj: { [k: string]: Y } = {};
    while (pos < lines.length && lines[pos].ind === ind) {
      const ln = lines[pos];
      if (ln.s.startsWith("- ")) throw new Error(`${ln.n}: leképezés és sorozat keveredik`);
      const m = /^("[^"]*"|[^\s"'#][^:]*?):(?:\s+(.*))?$/.exec(ln.s);
      if (!m) throw new Error(`${ln.n}: nem értelmezhető sor: ${ln.s}`);
      const key = m[1].replace(/^"|"$/g, "");
      if (key in obj) throw new Error(`${ln.n}: duplikált kulcs: ${key}`);
      pos += 1;
      if (m[2] !== undefined && m[2] !== "") obj[key] = scalar(m[2], ln.n);
      else if (pos < lines.length && (lines[pos].ind > ind || (lines[pos].ind === ind && lines[pos].s.startsWith("- ")))) obj[key] = block(lines[pos].ind);
      else obj[key] = "";
    }
    if (pos < lines.length && lines[pos].ind > ind) throw new Error(`${lines[pos].n}: váratlan behúzás`);
    return obj;
  };
  const out = block(lines.length ? lines[0].ind : 0);
  if (pos < lines.length) throw new Error(`${lines[pos].n}: a behúzás nem illeszkedik`);
  return out;
}

// ---- hivatkozások -------------------------------------------------------------------------------------------------------

const PATH_RE = /(?<![\w./~-])((?:source|scripts|docs|memory|\.agents|\.claude|\.github|\.hermes)\/[\w./-]*[\w-]\/?)/g;

/** A sor repó-útvonal hivatkozásai (a helyőrzős / mintás utak — `*` vagy `<` követi — nélkül). */
export function pathRefs(line: string): string[] {
  return [...line.matchAll(PATH_RE)].filter((m) => !/[*<]/.test(line[(m.index ?? 0) + m[0].length] ?? "")).map((m) => m[1]);
}
/** Backtickes csupasz fájlnevek (`main.tsx`) és a gyökérfájl-alakú nevek (AGENTS.md, RUNBOOK.md). */
export function nameRefs(line: string): string[] {
  const bare = [...line.matchAll(/`([\w.-]+\.[A-Za-z]{1,5})`/g)].map((m) => m[1]);
  const root = [...line.matchAll(/(?<![\w./-])([A-Z][A-Z0-9_-]+\.md)(?![\w-])/g)].map((m) => m[1]);
  return [...new Set([...bare, ...root])];
}
export function npmRefs(line: string): string[] {
  return [...line.matchAll(/npm(?:\.cmd)? run ([\w:-]+)/g)].map((m) => m[1]);
}
export function isTracked(ref: string, tracked: Set<string>): boolean {
  const r = ref.replace(/\/$/, "");
  if (tracked.has(r)) return true;
  for (const t of tracked) if (t.startsWith(`${r}/`)) return true;
  return false;
}
/** YAML-skalár, amely fájlútnak látszik (szóköz és kettőspont nélkül, ismert kiterjesztéssel) — gyökérfájl is (package.json). */
const FILE_SCALAR_RE = /^[\w.\/-]+\.(?:json|ya?ml|md|qmd|mjs|cjs|js|ts|tsx|sql|toml|txt)\/?$/;
export function yamlFileRefs(y: Y, path = "$"): { path: string; ref: string }[] {
  if (typeof y === "string") return FILE_SCALAR_RE.test(y.trim()) ? [{ path, ref: y.trim() }] : [];
  if (Array.isArray(y)) return y.flatMap((v, i) => yamlFileRefs(v, `${path}[${i}]`));
  return Object.entries(y).flatMap(([k, v]) => yamlFileRefs(v, `${path}.${k}`));
}
const basenames = (tracked: Set<string>) => new Set([...tracked].map((t) => t.split("/").pop()!));

// ---- forrás és idézet ---------------------------------------------------------------------------------------------------

const norm = (s: string) => s.replace(/^\s*>\s?/gm, "").replace(/[`*„”"]/g, "").replace(/\s+/g, " ").trim();

/** `source` → hiba szövege vagy null. */
const SOURCE_RE = /^([\w./-]+)(?::(\d+)(?:-(\d+))?)?$/;

/** `source` → hiba szövege vagy null. A sorszám csak tipp: az alakját nézzük, a fájl hosszához nem mérjük (invariáns). */
export function checkSource(src: unknown, deps: { tracked: Set<string>; lines: (p: string) => string[] }): string | null {
  if (typeof src !== "string") return "nincs source";
  const m = SOURCE_RE.exec(src);
  if (!m) return `hibás source-alak: ${src}`;
  if (m[2] !== undefined) {
    const a = Number(m[2]);
    const b = m[3] === undefined ? a : Number(m[3]);
    if (!(a >= 1 && a <= b)) return `hibás source-alak (1 ≤ kezdő ≤ záró): ${src}`;
  }
  if (!deps.tracked.has(m[1])) return `nem követett fájl: ${m[1]}`;
  return null;
}
/** Az idézetnek a megnevezett fájlban kell szó szerint (szóköz-normalizálva) szerepelnie; a sorszám nem számít. */
export function checkQuote(quote: unknown, src: string, deps: { lines: (p: string) => string[] }): string | null {
  if (typeof quote !== "string" || !norm(quote)) return "üres quote (normalizálás után)";
  const file = SOURCE_RE.exec(src)![1];
  return norm(deps.lines(file).join("\n")).includes(norm(quote)) ? null : `a quote nem szó szerinti a(z) ${file} fájlban: ${quote.slice(0, 60)}`;
}
/** A Drizzle-séma táblanevei (`pgTable("név"`). */
export function schemaTables(schema: string): string[] {
  return [...schema.matchAll(/export const \w+ = pgTable\(\s*"([^"]+)"/g)].map((m) => m[1]);
}
/** A snapshot által állított, de a sémában NEM létező táblák (a sémában lévő új tábla nem bukás). */
export function checkSchemaSnapshot(tables: string[], schema: string): string[] {
  const real = new Set(schemaTables(schema));
  return tables.filter((t) => !real.has(t));
}
/** Bejárás: minden `source`-os objektum forrása érvényes; ha `quote` is van, szó szerinti. */
export function checkSourcedObjects(y: Y, deps: { tracked: Set<string>; lines: (p: string) => string[] }, path = "$"): string[] {
  const out: string[] = [];
  if (Array.isArray(y)) y.forEach((v, i) => out.push(...checkSourcedObjects(v, deps, `${path}[${i}]`)));
  else if (y && typeof y === "object") {
    if ("source" in y) {
      const e = checkSource(y.source, deps);
      if (e) out.push(`${path}: ${e}`);
      else if ("quote" in y) { const q = checkQuote(y.quote, y.source as string, deps); if (q) out.push(`${path}: ${q}`); }
    } else if ("quote" in y) out.push(`${path}: quote source nélkül`);
    for (const [k, v] of Object.entries(y)) out.push(...checkSourcedObjects(v, deps, `${path}.${k}`));
  }
  return out;
}
/** A döntés-napló bejegyzésenként: egyedi id, saját quote + source. */
export function checkDecisions(y: Y, deps: { tracked: Set<string>; lines: (p: string) => string[] }): string[] {
  const list = (y as any)?.cogni?.decisions;
  if (!Array.isArray(list) || !list.length) return ["nincs decisions lista"];
  const out: string[] = [];
  const ids = new Set<string>();
  list.forEach((d: any, i: number) => {
    const where = `decisions[${i}]${d?.id ? ` (${d.id})` : ""}`;
    if (!d || typeof d !== "object" || Array.isArray(d)) { out.push(`${where}: nem leképezés`); return; }
    if (typeof d.id !== "string" || !d.id) out.push(`${where}: nincs id`);
    else if (ids.has(d.id)) out.push(`${where}: duplikált id`);
    else ids.add(d.id);
    if (!("source" in d)) out.push(`${where}: nincs saját source`);
    if (!("quote" in d)) out.push(`${where}: nincs saját quote`);
  });
  return [...out, ...checkSourcedObjects(list, deps, "decisions")];
}

// ---- valódi repó --------------------------------------------------------------------------------------------------------

const TRACKED = new Set(execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean));
const LINES = new Map<string, string[]>();
const lines = (p: string) => { if (!LINES.has(p)) LINES.set(p, read(p).split("\n")); return LINES.get(p)!; };
const DEPS = { tracked: TRACKED, lines };
const YAMLS = ["memory/manifest.yaml", ...readdirSync(join(ROOT, "memory", ".cogni")).filter((f) => f.endsWith(".yaml")).map((f) => `memory/.cogni/${f}`)];
const LAYERS = [...YAMLS, "memory/index.qmd", ".agents/skills/websuli-zaro-hurok/SKILL.md"].filter((f) => existsSync(join(ROOT, f)));

test("parseYaml: érvényes alakok; hibás behúzás, duplikált kulcs, blokk-skalár → hiba", () => {
  assert.deepEqual(parseYaml('a:\n  b: "x: y" # m\n  c: []\nl:\n  - id: 1\n    q: "z"\n  - w\nm:\n- k\n'), { a: { b: "x: y", c: [] }, l: [{ id: "1", q: "z" }, "w"], m: ["k"] });
  assert.throws(() => parseYaml("a:\n  b: 1\n   c: 2\n"), /behúzás/);
  assert.throws(() => parseYaml("a: 1\na: 2\n"), /duplikált kulcs/);
  assert.throws(() => parseYaml("a: |\n  x\n"), /nem támogatott/);
  assert.throws(() => parseYaml('a: "nyitott\n'), /idézőjel/);
});

test("pathRefs / nameRefs / npmRefs / isTracked", () => {
  assert.deepEqual(pathRefs("`source/shared/schema.ts`, docs/handoffs/*-retro.md, ~/.claude/projects/x"), ["source/shared/schema.ts"]);
  assert.deepEqual(nameRefs("1. `AGENNTS.md` — szabályok; RUNBOOK.md, `main.tsx`"), ["AGENNTS.md", "main.tsx", "RUNBOOK.md"]);
  assert.deepEqual(npmRefs('"npm run gate:pr -- --body-file x"; npm.cmd run zaro:check'), ["gate:pr", "zaro:check"]);
  const t = new Set(["a/b/c.ts", "AGENTS.md"]);
  assert.equal(isTracked("a/b/", t), true);
  assert.equal(isTracked("a/b/c.ts", t), true);
  assert.equal(isTracked("a/x.ts", t), false, "a helyben létező, de nem követett fájl nem elég");
});

test("checkDecisions: áthelyezett forrás, hibás sorszám-alak, nem követett fájl, duplikált id, hamis idézet → hiba", () => {
  const deps = { tracked: new Set(["F.md"]), lines: () => ["első sor", "második: a döntés szövege", "harmadik"] };
  const ok = parseYaml('cogni:\n  decisions:\n    - id: D1\n      quote: "a döntés szövege"\n      source: "F.md:2"\n');
  assert.deepEqual(checkDecisions(ok, deps), []);
  const moved = parseYaml('cogni:\n  source: "F.md:2"\n  decisions:\n    - id: D1\n      quote: "a döntés szövege"\n');
  assert.match(checkDecisions(moved, deps).join("\n"), /nincs saját source/);
  const cases: [string, RegExp][] = [
    ['"F.md:0"', /source-alak/], ['"G.md:1"', /nem követett/], ['"F.md:3-2"', /source-alak/], ['"F.md x"', /source-alak/],
  ];
  for (const [src, re] of cases) {
    const y = parseYaml(`cogni:\n  decisions:\n    - id: D1\n      quote: "a döntés szövege"\n      source: ${src}\n`);
    assert.match(checkDecisions(y, deps).join("\n"), re, src);
  }
  const dup = parseYaml('cogni:\n  decisions:\n    - id: D1\n      quote: "első sor"\n      source: "F.md:1"\n    - id: D1\n      quote: "harmadik"\n      source: "F.md:3"\n');
  assert.match(checkDecisions(dup, deps).join("\n"), /duplikált id/);
  const fake = parseYaml('cogni:\n  decisions:\n    - id: D1\n      quote: "nem hangzott el"\n      source: "F.md:1-3"\n');
  assert.match(checkDecisions(fake, deps).join("\n"), /nem szó szerinti/);
});

// Invariáns (2026-11-22, #527 push-kapu): a memória-rétegek őre nem bukhat el amiatt, hogy egy MÁSIK PR a hivatkozott forrásfájlt
// szabályosan módosítja. A sorszám csak tájékoztató tipp; az idézetnek a megnevezett, követett FÁJLBAN kell szó szerint szerepelnie.
test("sorszám-tűrés: a forrás elejére szúrt sorok nem buktatnak; a hamis idézet és a sor nélküli forrás-alak kezelése", () => {
  const before = ["első sor", "második: a döntés szövege", "harmadik"];
  const after = ["# új bevezető 1", "# új bevezető 2", "# új bevezető 3", ...before];
  const y = parseYaml('cogni:\n  decisions:\n    - id: D1\n      quote: "a döntés szövege"\n      source: "F.md:2"\n');
  assert.deepEqual(checkDecisions(y, { tracked: new Set(["F.md"]), lines: () => before }), []);
  assert.deepEqual(checkDecisions(y, { tracked: new Set(["F.md"]), lines: () => after }), [], "a beszúrás után is zöld");
  const far = parseYaml('cogni:\n  decisions:\n    - id: D1\n      quote: "a döntés szövege"\n      source: "F.md:900"\n');
  assert.deepEqual(checkDecisions(far, { tracked: new Set(["F.md"]), lines: () => after }), [], "a fájl végén túli sorszám-tipp sem bukás");
  const fake = parseYaml('cogni:\n  decisions:\n    - id: D1\n      quote: "ilyen mondat nincs a fájlban"\n      source: "F.md:2"\n');
  assert.match(checkDecisions(fake, { tracked: new Set(["F.md"]), lines: () => after }).join("\n"), /nem szó szerinti/);
  const bare = parseYaml('cogni:\n  decisions:\n    - id: D1\n      quote: "a döntés szövege"\n      source: "F.md"\n');
  assert.deepEqual(checkDecisions(bare, { tracked: new Set(["F.md"]), lines: () => after }), [], "sorszám nélküli forrás is elfogadott");
});

test("séma-halmaz: új tábla a sémában nem buktat; a snapshot csak létező táblát állíthat", () => {
  const schema = 'export const a = pgTable("alfa", {});\nexport const b = pgTable(\n  "beta", {});\n';
  assert.deepEqual(schemaTables(schema), ["alfa", "beta"]);
  assert.deepEqual(checkSchemaSnapshot(["alfa"], schema), [], "a sémában lévő új tábla (beta) nem bukás");
  assert.deepEqual(checkSchemaSnapshot(["alfa", "beta"], `// új sor\n${schema}`), [], "sorbeszúrás sem bukás");
  assert.deepEqual(checkSchemaSnapshot(["alfa", "gamma"], schema), ["gamma"], "nem létező tábla állítása bukás");
});

test("memória-rétegek: érvényes YAML (szűk részhalmaz)", () => {
  for (const f of YAMLS) assert.doesNotThrow(() => parseYaml(read(f)), f);
});

test("memória-rétegek: minden hivatkozás a Gitben követett fájlra / parancsra mutat (A)", () => {
  const scripts = Object.keys(JSON.parse(read("package.json")).scripts ?? {});
  const names = basenames(TRACKED);
  const dead: string[] = [];
  for (const f of LAYERS) {
    read(f).split("\n").forEach((line, i) => {
      for (const p of pathRefs(line)) if (!isTracked(p, TRACKED)) dead.push(`${f}:${i + 1}: ${p}`);
      for (const nm of nameRefs(line)) {
        // Gyökérfájl-alakú név (AGENTS.md): a teljes követett útnak kell egyeznie, nem elég egy azonos basename máshol.
        const ok = /^[A-Z][A-Z0-9_-]+\.md$/.test(nm) ? TRACKED.has(nm) : names.has(nm);
        if (!ok) dead.push(`${f}:${i + 1}: ${nm}`);
      }
      for (const s of npmRefs(line)) if (!scripts.includes(s)) dead.push(`${f}:${i + 1}: npm run ${s}`);
    });
  }
  assert.deepEqual(dead, [], `nem követett / nem létező hivatkozás:\n${dead.join("\n")}`);
});

test("YAML-skalár fájlhivatkozások: a teljes út a Gitben követett (gyökérfájl is) — Copilot #527", () => {
  assert.deepEqual(yamlFileRefs(parseYaml('a:\n  b: memory/index.qmd\n  l:\n    - package.json\n    - "x y.md"\n  c: "F.md:2"\n')), [
    { path: "$.a.b", ref: "memory/index.qmd" },
    { path: "$.a.l[0]", ref: "package.json" },
  ]);
  const refs = yamlFileRefs(parseYaml('e:\n  - package.json\n  - nemletezo-package.json\n  - "van szóköz.md"\n  - "F.md:2"\n')).map((r) => r.ref);
  assert.deepEqual(refs, ["package.json", "nemletezo-package.json"]);
  assert.equal(isTracked("nemletezo-package.json", TRACKED), false);
  const dead = YAMLS.flatMap((f) => yamlFileRefs(parseYaml(read(f)), f).filter((r) => !isTracked(r.ref, TRACKED)).map((r) => `${r.path}: ${r.ref}`));
  assert.deepEqual(dead, [], `nem követett YAML-fájlhivatkozás:\n${dead.join("\n")}`);
});

test("checkQuote: a normalizálás után üres idézet (pl. ***) nem igazol — Copilot #527", () => {
  const deps = { lines: () => ["bármilyen forrás"] };
  assert.match(checkQuote("***", "F.md:1", deps) ?? "", /üres quote/);
  assert.match(checkQuote("  `` ", "F.md:1", deps) ?? "", /üres quote/);
  assert.equal(checkQuote("forrás", "F.md:1", deps), null);
});

test("döntés-napló és minden source / quote: követett fájl, érvényes alak, a fájlban szó szerinti idézet (B, C)", () => {
  assert.deepEqual(checkDecisions(parseYaml(read("memory/.cogni/decisions.cogni.yaml")), DEPS), []);
  const bad = YAMLS.flatMap((f) => checkSourcedObjects(parseYaml(read(f)), DEPS, f));
  assert.deepEqual(bad, []);
});

test("séma-snapshot: csak a forrás-mutató és a táblanevek halmaza; minden állított tábla létezik (D)", () => {
  const snap = parseYaml(read("memory/.cogni/schema.cogni.yaml")) as any;
  assert.equal(snap.cogni.source_file, "source/shared/schema.ts");
  assert.ok(TRACKED.has(snap.cogni.source_file));
  assert.deepEqual(Object.keys(snap.cogni).sort(), ["kind", "name", "source_file", "tables"], "nincs sor-, idézet- vagy darabszám-másolat");
  const tables = snap.cogni.tables as string[];
  assert.ok(Array.isArray(tables) && tables.length > 0 && tables.every((t) => typeof t === "string"));
  assert.deepEqual(checkSchemaSnapshot(tables, read("source/shared/schema.ts")), []);
});
