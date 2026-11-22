#!/usr/bin/env node
// Záró hurok kapuja — a WEBSULI saját változata (docs/specs/2026-11-22-zaro-hurok-websuli.md, D1–D13).
// Minden lezárt feladat után: csapda → memória-rétegek (YAML / QMD / Cogni) → vektor → retró → kanban → skill → higiénia → tiszta fa.
// A kapu gépi bizonyíték: exit 0 csak akkor, ha egyik lépés sem FAIL. A higiénia alapból CSAK riport.
//
// Használat:
//   node scripts/qa/zaro-hurok.mjs check --since <ISO> [--json] [--kanban-file <út>]... [--no-vector] [--repo <út>]
//     (kanban: alapból ~/.claude/projects/<repó-név>/kanban/tapasztalat-kanban.md; CLAUDE_CONFIG_DIR felülírja a ~/.claude-t)
//   node scripts/qa/zaro-hurok.mjs hygiene [--apply] [--json] [--repo <út>]
//   node scripts/qa/zaro-hurok.mjs nincs-uj --kind trap,yaml,qmd,cogni,kanban [--repo <út>]
//   node scripts/qa/zaro-hurok.mjs konvergencia [--branch <ág> | --heads <h1,h2,…> | --reports <j1.md,…>] [--evidence <dir>] [--json]
//     (vak körök megállási szabálya, C-ZH-2: exit 0 = új kör indulhat, 1 = TILOS, megközelítésváltás kell, 2 = hibás hívás)

import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { evidenceDir, isMain, parseUnifiedZero } from './gates/lib.mjs';
import { checkSkills } from './gates/skills-sync-check.mjs';

export const TRAP_FILE = 'docs/agent-csapdak.md';
export const YAML_FILE = 'memory/manifest.yaml';
export const QMD_FILE = 'memory/index.qmd';
export const COGNI_FILES = ['project', 'modules', 'decisions', 'schema'].map((k) => `memory/.cogni/${k}.cogni.yaml`);
export const KINDS = ['trap', 'yaml', 'qmd', 'cogni', 'kanban'];
const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
const PROTECTED = new Set(['main', 'master']);

const norm = (s) => String(s).replace(/\r\n/g, '\n');

// ---- argumentumok -------------------------------------------------------------------------------------------------------

const ISO_RE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  if (!['check', 'hygiene', 'nincs-uj', 'konvergencia'].includes(cmd)) throw new Error(`ismeretlen alparancs: ${cmd ?? '(nincs)'} — check | hygiene | nincs-uj | konvergencia`);
  const out = { cmd, json: false, apply: false, noVector: false, kanbanFiles: [], kinds: [], repo: null, since: null, branch: null, heads: null, reports: null, evidence: null };
  const list = (v, name) => {
    const items = v.split(',').map((x) => x.trim()).filter(Boolean);
    if (!items.length) throw new Error(`üres lista: ${name}`);
    return items;
  };
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    const val = () => {
      if (i + 1 >= rest.length) throw new Error(`hiányzó érték: ${a}`);
      i += 1;
      return rest[i];
    };
    if (a === '--json') out.json = true;
    else if (a === '--apply') out.apply = true;
    else if (a === '--no-vector') out.noVector = true;
    else if (a === '--repo') out.repo = val();
    else if (a === '--kanban-file') out.kanbanFiles.push(val());
    else if (a === '--branch') out.branch = val();
    else if (a === '--evidence') out.evidence = val();
    else if (a === '--heads') out.heads = list(val(), '--heads');
    else if (a === '--reports') out.reports = list(val(), '--reports');
    else if (a === '--since') {
      const s = val();
      const d = new Date(s);
      if (!ISO_RE.test(s) || Number.isNaN(d.getTime())) throw new Error(`érvénytelen --since: ${s} (ISO 8601, pl. 2026-11-22T00:00:00+01:00)`);
      out.since = d;
    } else if (a === '--kind') {
      out.kinds = val().split(',').map((k) => k.trim()).filter(Boolean);
      const bad = out.kinds.filter((k) => !KINDS.includes(k));
      if (bad.length || !out.kinds.length) throw new Error(`érvénytelen --kind: ${bad.join(',') || '(üres)'} — megengedett: ${KINDS.join(',')}`);
    } else throw new Error(`ismeretlen kapcsoló: ${a}`);
  }
  if (cmd === 'check' && !out.since) throw new Error('a check-hez kötelező a --since <ISO> (a feladat kezdete)');
  if (cmd === 'nincs-uj' && !out.kinds.length) throw new Error('a nincs-uj-hoz kötelező a --kind <lista>');
  return out;
}

// ---- jelölők és ideiglenes csapdaszám ------------------------------------------------------------------------------------

const MARKER_RE = /zaro-hurok:\s*(\d{4}-\d{2}-\d{2}T[0-9:.]+(?:Z|[+-]\d{2}:\d{2})?)\s+nincs-uj(?:[ \t]+([a-z][a-z,]*))?/g;

/** @returns {{ iso: string, date: Date, kinds: string[] }[]} */
export function findMarkers(text) {
  return [...norm(text).matchAll(MARKER_RE)].map((m) => ({ iso: m[1], date: new Date(m[1]), kinds: m[2] ? m[2].split(',').filter(Boolean) : [] }));
}

/** Friss (≥ since) jelölő; `kind` nélkül csak a fajta nélküli (a fájl saját rétegének) jelölője számít. */
export function hasFreshMarker(text, since, kind = null) {
  return findMarkers(text).some((m) => m.date.getTime() >= since.getTime() && (kind ? m.kinds.includes(kind) : m.kinds.length === 0));
}

/** Ideiglenes csapdaszámok (D2): `C-<ág-rövidítés>-N`, a rövidítés betűvel kezdődik (a `C-61` és a „BY-NC-SA 4.0” nem illik rá). */
export function tempTrapIds(text) {
  return [...new Set([...norm(text).matchAll(/(?<![\w-])C-[A-Z][A-Z0-9]{0,7}-\d+(?![\w-])/g)].map((m) => m[0]))];
}

// ---- szűk YAML-ellenőrző (D6) -------------------------------------------------------------------------------------------

/** Megjegyzés levágása idézőjelen kívül; lezáratlan idézőjel / zárójel jelzése. */
function scanLine(s) {
  let q = null;
  let depth = 0;
  let neg = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (q === '"') {
      if (c === '\\') i += 1;
      else if (c === '"') q = null;
      continue;
    }
    if (q === "'") {
      if (c === "'") q = null;
      continue;
    }
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return { text: s.slice(0, i).trimEnd(), quote: false, bracket: depth !== 0 || neg };
    // Idézőjel csak érték / elem / kulcs elején nyit (a szó belsejében álló aposztróf literál).
    if ((c === '"' || c === "'") && (i === 0 || /[\s[{,:-]/.test(s[i - 1]))) q = c;
    else if (c === '[' || c === '{') depth += 1;
    else if (c === ']' || c === '}') { depth -= 1; if (depth < 0) neg = true; }
  }
  return { text: s.trimEnd(), quote: q !== null, bracket: depth !== 0 || neg };
}

/** A kulcs–érték határ: az első `:` (szóköz vagy sorvég előtt) idézőjelen kívül; -1, ha nincs. */
function keyColon(s) {
  let q = null;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (q) { if (c === '\\' && q === '"') i += 1; else if (c === q) q = null; continue; }
    if ((c === '"' || c === "'") && i === 0) { q = c; continue; }
    if (c === '[' || c === '{') return -1;
    if (c === ':' && (i + 1 === s.length || s[i + 1] === ' ')) return i;
  }
  return -1;
}

function checkValue(v) {
  if (!v) return null;
  if (v.startsWith('"')) return /^"(?:[^"\\]|\\.)*"$/.test(v) ? null : 'az idézőjeles érték után szöveg áll';
  if (v.startsWith("'")) return /^'(?:[^']|'')*'$/.test(v) ? null : 'az idézőjeles érték után szöveg áll';
  if (/^[[{]/.test(v)) return /[\]}]$/.test(v) ? null : 'a zárójeles érték után szöveg áll';
  if (/^[|>][-+]?\d?$/.test(v)) return null;
  if (/:\s/.test(v) || /:$/.test(v)) return 'idézőjel nélküli érték kettősponttal — tedd idézőjelbe';
  if (/^[@`]/.test(v)) return 'foglalt kezdőkarakter az értékben';
  return null;
}

/**
 * A memória-fájlok szűk YAML-részhalmazának szerkezeti ellenőrzése (blokk-leképezés, -sorozat, skalár, blokk-skalár, egysoros
 * `[]` / `{}`, megjegyzés). @returns {{ line: number, msg: string }[]}
 */
export function validateYamlSubset(text) {
  const errors = [];
  const lines = norm(text).split('\n');
  const stack = [{ indent: -1, kind: null, keys: new Set() }];
  let open = null; // { indent, allowSameSeq } — az előző sor blokkot nyitott
  let block = null; // blokk-skalár: a tulajdonos kulcs behúzása
  const err = (n, msg) => errors.push({ line: n, msg });

  const place = (n, indent, isSeq) => {
    if (open && (indent > open.indent || (indent === open.indent && isSeq && open.allowSameSeq))) {
      stack.push({ indent, kind: null, keys: new Set() });
      open = null;
      return true;
    }
    open = null;
    while (stack.length > 1 && stack[stack.length - 1].indent > indent) stack.pop();
    const top = stack[stack.length - 1];
    if (top.indent !== indent) {
      if (top.indent === -1 && stack.length === 1 && indent === 0) { stack.push({ indent: 0, kind: null, keys: new Set() }); return true; }
      err(n, `a behúzás (${indent}) nem illeszkedik egyik szinthez sem`);
      return false;
    }
    return true;
  };

  const handleMapping = (n, indent, body) => {
    const ci = keyColon(body);
    if (ci < 0) { err(n, `nem értelmezhető sor (nincs „kulcs: érték” alak): ${body.slice(0, 40)}`); return; }
    const key = body.slice(0, ci).trim();
    const value = body.slice(ci + 1).trim();
    if (!key || (!/^"(?:[^"\\]|\\.)*"$|^'(?:[^']|'')*'$/.test(key) && /^[\s#'"[\]{},&*!|>%@`-]|\s$/.test(key))) { err(n, `érvénytelen kulcs: ${key}`); return; }
    const top = stack[stack.length - 1];
    if (top.kind === 'seq') { err(n, 'leképezés és sorozat keveredik ugyanazon a szinten'); return; }
    top.kind = 'map';
    if (top.keys.has(key)) err(n, `duplikált kulcs: ${key}`);
    top.keys.add(key);
    const bad = checkValue(value);
    if (bad) err(n, bad);
    if (/^[|>][-+]?\d?$/.test(value)) block = indent;
    else if (!value) open = { indent, allowSameSeq: true };
  };

  for (let i = 0; i < lines.length; i += 1) {
    const n = i + 1;
    const raw = lines[i];
    if (block !== null) {
      if (!raw.trim()) continue;
      if (raw.match(/^ */)[0].length > block) continue;
      block = null;
    }
    if (!raw.trim()) continue;
    const lead = raw.match(/^[ \t]*/)[0];
    if (lead.includes('\t')) { err(n, 'tabulátor a behúzásban'); continue; }
    const sc = scanLine(raw.slice(lead.length));
    if (!sc.text) continue;
    if (sc.quote) { err(n, 'lezáratlan idézőjel'); continue; }
    if (sc.bracket) { err(n, 'kiegyensúlyozatlan zárójel ([] / {})'); continue; }
    let indent = lead.length;
    let body = sc.text;
    if (indent === 0 && (body === '---' || body === '...')) { stack.length = 1; open = null; continue; }

    if (body === '-' || body.startsWith('- ')) {
      if (!place(n, indent, true)) continue;
      const top = stack[stack.length - 1];
      if (top.kind === 'map') { err(n, 'leképezés és sorozat keveredik ugyanazon a szinten'); continue; }
      top.kind = 'seq';
      const restRaw = body.slice(1);
      const rest = restRaw.trim();
      if (!rest) { open = { indent, allowSameSeq: false }; continue; }
      const sub = indent + 1 + (restRaw.length - restRaw.trimStart().length);
      if (keyColon(rest) >= 0) {
        stack.push({ indent: sub, kind: null, keys: new Set() });
        handleMapping(n, sub, rest);
      } else {
        const bad = checkValue(rest);
        if (bad) err(n, bad);
      }
      continue;
    }
    if (!place(n, indent, false)) continue;
    handleMapping(n, indent, body);
  }
  return errors;
}

// ---- git-segédek ---------------------------------------------------------------------------------------------------------

function makeGit(cwd) {
  const run = (args, opts = {}) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, ...opts });
  return {
    out: (args) => norm(run(args)).trim(),
    tryOut: (args) => { try { return norm(run(args)).trim(); } catch { return null; } },
    ok: (args) => { try { run(args); return true; } catch { return false; } },
  };
}

const samePath = (a, b) => {
  const f = (p) => resolve(p).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? f(a).toLowerCase() === f(b).toLowerCase() : f(a) === f(b);
};

function repoInfo(repo) {
  const g = makeGit(repo);
  const top = g.out(['rev-parse', '--show-toplevel']);
  const common = resolve(top, g.out(['rev-parse', '--git-common-dir']));
  const mainRoot = basename(common) === '.git' ? dirname(common) : top;
  const branch = g.tryOut(['rev-parse', '--abbrev-ref', 'HEAD']) ?? '';
  return { g, top, mainRoot, branch };
}

/** A since előtti utolsó commit (D5); ha nincs, az üres fa. */
function sinceBase(g, since) {
  return g.tryOut(['rev-list', '-1', `--before=${since.toISOString()}`, 'HEAD']) || EMPTY_TREE;
}

function isTracked(g, file) {
  return g.ok(['ls-files', '--error-unmatch', '--', file]);
}

/** A since óta hozzáadott sorok (a munkafát is beleértve); a nem követett fájl minden sora új. */
function addedLines(ctx, file) {
  const abs = join(ctx.top, file);
  if (!existsSync(abs)) return [];
  if (!isTracked(ctx.g, file)) return norm(readFileSync(abs, 'utf8')).split('\n').map((text, i) => ({ file, line: i + 1, text }));
  const diff = ctx.g.tryOut(['diff', '-U0', '--no-color', '--no-ext-diff', ctx.base, '--', file]) ?? '';
  return parseUnifiedZero(diff);
}

function changedSince(ctx, file) {
  const abs = join(ctx.top, file);
  if (!existsSync(abs)) return false;
  if (!isTracked(ctx.g, file)) return true;
  return !ctx.g.ok(['diff', '--quiet', '--no-ext-diff', ctx.base, '--', file]);
}

function changedFiles(ctx) {
  const a = (ctx.g.tryOut(['diff', '--name-only', '--no-ext-diff', ctx.base]) ?? '').split('\n');
  const b = (ctx.g.tryOut(['ls-files', '--others', '--exclude-standard']) ?? '').split('\n');
  return [...new Set([...a, ...b].filter(Boolean))];
}

const readText = (ctx, file) => norm(readFileSync(join(ctx.top, file), 'utf8'));
const mtimeOk = (p, since) => { try { return statSync(p).mtime.getTime() >= since.getTime(); } catch { return false; } };

// ---- a lépések ------------------------------------------------------------------------------------------------------------

const S = (id, name, status, note, details = []) => ({ id, name, status, note, details });

function stepTrap(ctx) {
  const abs = join(ctx.top, TRAP_FILE);
  if (!existsSync(abs)) return S('csapda', '1. csapda', 'FAIL', `hiányzik: ${TRAP_FILE}`);
  const grew = addedLines(ctx, TRAP_FILE).filter((l) => l.text.trim()).length;
  const marker = hasFreshMarker(readText(ctx, TRAP_FILE), ctx.since);
  if (grew) return S('csapda', '1. csapda', 'PASS', `${TRAP_FILE} a since óta ${grew} sorral bővült`);
  if (marker) return S('csapda', '1. csapda', 'PASS', `friss nincs-uj jelölő: ${TRAP_FILE}`);
  return S('csapda', '1. csapda', 'FAIL', `${TRAP_FILE} a since óta nem bővült, és nincs friss <!-- zaro-hurok: <ISO> nincs-uj --> jelölője`,
    ['új csapda: bejegyzés ideiglenes C-<ág>-N sorszámmal; ha nincs: node scripts/qa/zaro-hurok.mjs nincs-uj --kind trap']);
}

function stepTrapIds(ctx) {
  const abs = join(ctx.top, TRAP_FILE);
  const ids = existsSync(abs) ? tempTrapIds(readText(ctx, TRAP_FILE)) : [];
  if (!ids.length) return S('csapda-sorszam', '1b. csapda-sorszám', 'PASS', 'nincs ideiglenes sorszám');
  if (PROTECTED.has(ctx.branch)) {
    return S('csapda-sorszam', '1b. csapda-sorszám', 'FAIL', `a főágon (${ctx.branch}) ideiglenes csapdaszám maradt — végleges C-NN kell`, ids);
  }
  return S('csapda-sorszam', '1b. csapda-sorszám', 'INFO', `ideiglenes sorszám (${ids.length}) — a merge ELŐTT végleges C-NN-re cserélendő`, ids);
}

function todoLines(text, yaml) {
  const out = [];
  const lines = norm(text).split('\n');
  let inComment = false;
  lines.forEach((l, i) => {
    let body = l;
    if (yaml) body = scanLine(l).text;
    else {
      // HTML-megjegyzés (a jelölő is ilyen) nem számít.
      body = '';
      let rest = l;
      while (rest) {
        if (inComment) {
          const e = rest.indexOf('-->');
          if (e < 0) { rest = ''; break; }
          inComment = false;
          rest = rest.slice(e + 3);
        } else {
          const s = rest.indexOf('<!--');
          if (s < 0) { body += rest; rest = ''; break; }
          body += rest.slice(0, s);
          inComment = true;
          rest = rest.slice(s + 4);
        }
      }
    }
    if (/\bTODO\b/.test(body)) out.push(i + 1);
  });
  return out;
}

function stepLayer(ctx, id, name, files, yaml) {
  const problems = [];
  for (const f of files) {
    const abs = join(ctx.top, f);
    if (!existsSync(abs)) { problems.push(`${f}: hiányzik`); continue; }
    const text = readText(ctx, f);
    if (!changedSince(ctx, f) && !hasFreshMarker(text, ctx.since)) problems.push(`${f}: a since óta nem változott, és nincs friss nincs-uj jelölője`);
    if (yaml) for (const e of validateYamlSubset(text)) problems.push(`${f}:${e.line}: ${e.msg}`);
    for (const n of todoLines(text, yaml)) problems.push(`${f}:${n}: TODO maradt a kitöltött részben`);
  }
  return problems.length
    ? S(id, name, 'FAIL', `${problems.length} probléma`, problems)
    : S(id, name, 'PASS', `${files.length} fájl rendben (friss / jelölt${yaml ? ', érvényes YAML' : ''}, TODO nélkül)`);
}

async function stepVector(ctx) {
  if (ctx.noVector) return S('vektor', '2b. vektoros réteg', 'N/A', 'kihagyva (--no-vector)');
  let up = false;
  try { up = await ctx.probeVector(); } catch { up = false; }
  return up
    ? S('vektor', '2b. vektoros réteg', 'INFO', 'helyi beágyazó elérhető; vektor-index építése nincs a WEBSULI hatókörében (D12)')
    : S('vektor', '2b. vektoros réteg', 'N/A', 'nem elérhető (nincs helyi beágyazó / Ollama) — nem buktat (D12)');
}

export async function defaultProbeVector() {
  try {
    const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(800) });
    return r.ok;
  } catch {
    return false;
  }
}

function stepRetro(ctx) {
  const files = changedFiles(ctx);
  const retros = files.filter((f) => /^docs\/handoffs\/[^/]+-retro\.md$/.test(f) && addedLines(ctx, f).some((l) => l.text.trim()));
  if (retros.length) return S('retro', '3. retró', 'PASS', `retró bővült: ${retros.join(', ')}`);
  const logs = files.filter((f) => /^docs\/specs\/[^/]+\.md$/.test(f) && existsSync(join(ctx.top, f))).filter((f) => {
    const idx = readText(ctx, f).split('\n').findIndex((l) => /^#{1,6}\s.*Állapotnapló/i.test(l));
    return idx >= 0 && addedLines(ctx, f).some((l) => l.line > idx + 1 && l.text.trim());
  });
  if (logs.length) return S('retro', '3. retró', 'PASS', `állapotnapló bővült: ${logs.join(', ')}`);
  return S('retro', '3. retró', 'FAIL', 'a since óta sem docs/handoffs/*-retro.md, sem egy docs/specs/*.md „Állapotnapló” fejezete nem bővült');
}

/** A Claude Code projektmappájának neve a repó útvonalából (`D:\repo\WEBSULI` → `D--repo-WEBSULI`). */
export function claudeProjectName(repoPath) {
  return resolve(repoPath).replace(/[\\/]+$/, '').replace(/[^A-Za-z0-9]/g, '-');
}

/** A repónkénti tapasztalat-kanban alapútja (D9): `<claude-home>/projects/<projektnév>/kanban/tapasztalat-kanban.md`. */
export function defaultKanbanFile(mainRoot, claudeHome = defaultClaudeHome()) {
  return join(claudeHome, 'projects', claudeProjectName(mainRoot), 'kanban', 'tapasztalat-kanban.md');
}

export function defaultClaudeHome() {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

function stepKanban(ctx) {
  const files = ctx.kanbanFiles.length
    ? ctx.kanbanFiles.map((f) => (isAbsolute(f) ? f : resolve(ctx.cwd, f)))
    : [defaultKanbanFile(ctx.mainRoot, ctx.claudeHome)];
  const seen = [];
  for (const p of files) {
    if (mtimeOk(p, ctx.since)) return S('kanban', '4. kanban', 'PASS', `a tapasztalat-kanban a since óta frissült: ${p}`);
    seen.push(`${p}: ${existsSync(p) ? 'régebbi a since-nél' : 'nincs'}`);
  }
  const man = join(ctx.top, YAML_FILE);
  if (existsSync(man) && hasFreshMarker(readText(ctx, YAML_FILE), ctx.since, 'kanban')) {
    return S('kanban', '4. kanban', 'PASS', `friss „nincs-uj kanban” jelölő: ${YAML_FILE}`);
  }
  return S('kanban', '4. kanban', 'FAIL',
    'a tapasztalat-kanban (Claude Code saját környezete) a since óta nem frissült, és nincs friss „# zaro-hurok: <ISO> nincs-uj kanban” jelölő', seen);
}

function stepSkill(ctx) {
  const problems = [];
  let names = [];
  const cfg = join(ctx.top, 'scripts', 'qa', 'gates', 'gates.config.json');
  if (existsSync(cfg)) {
    try { names = JSON.parse(readFileSync(cfg, 'utf8')).mirroredSkills ?? []; } catch (e) { problems.push(`gates.config.json olvashatatlan: ${e.message}`); }
  }
  for (const r of checkSkills({ root: ctx.top, names })) if (r.problem) problems.push(`tükör: ${r.name}: ${r.problem}`);
  if (existsSync(join(ctx.top, TRAP_FILE))) {
    const lines = readText(ctx, TRAP_FILE).split('\n');
    const heads = addedLines(ctx, TRAP_FILE).filter((l) => /^## C-/.test(l.text));
    for (const h of heads) {
      const start = h.line - 1;
      let end = lines.length;
      for (let j = start + 1; j < lines.length; j += 1) if (/^## /.test(lines[j])) { end = j; break; }
      const section = lines.slice(start, end).join('\n');
      if (!/(?:\.agents|\.claude)\/skills\/[\w-]+|nincs-skill:\s*\S/.test(section)) {
        problems.push(`új csapda skill-hivatkozás nélkül: ${h.text.slice(3, 60)} — írd be a skillt (.agents/skills/<név>/SKILL.md) vagy „nincs-skill: <indok>”`);
      }
    }
  }
  return problems.length
    ? S('skill', '5. skill', 'FAIL', `${problems.length} probléma`, problems)
    : S('skill', '5. skill', 'PASS', `tükör ép (${names.length} skill), az új csapdák skillre hivatkoznak`);
}

function stepHygiene(ctx) {
  try {
    const p = planHygiene({ repo: ctx.top });
    const removable = p.worktrees.remove.length + p.worktrees.prune.length + p.branches.remove.length;
    const details = [
      ...p.worktrees.remove.map((w) => `eltávolítható munkafa: ${w.path} [${w.branch}]`),
      ...p.worktrees.prune.map((w) => `árva munkafa-bejegyzés: ${w.path}`),
      ...p.branches.remove.map((b) => `törölhető (beolvasztott) ág: ${b}`),
      ...p.worktrees.keep.map((w) => `marad (riport): ${w.path} [${w.branch ?? 'detached'}] — ${w.reason}`),
      ...p.branches.keep.map((b) => `marad (riport): ${b.name} — ${b.reason}`),
    ];
    return S('higienia', '6. higiénia (csak riport)', 'INFO',
      `${removable} biztonságosan eltávolítható tétel (alap: ${p.base ?? 'nincs'}); alkalmazás: node scripts/qa/zaro-hurok.mjs hygiene --apply`, details);
  } catch (e) {
    return S('higienia', '6. higiénia (csak riport)', 'INFO', `a riport nem készült el: ${e.message}`);
  }
}

function stepClean(ctx) {
  const st = ctx.g.tryOut(['status', '--porcelain']) ?? '';
  const lines = st.split('\n').filter(Boolean);
  return lines.length
    ? S('tiszta-fa', '7. tiszta fa', 'FAIL', `${lines.length} commitolatlan / nem követett változás`, lines.slice(0, 30))
    : S('tiszta-fa', '7. tiszta fa', 'PASS', 'git status --porcelain üres');
}

/** A teljes záró kapu. */
export async function runCheck({ repo, since, kanbanFiles = [], noVector = false, probeVector = defaultProbeVector, cwd = process.cwd(), claudeHome = defaultClaudeHome() }) {
  const info = repoInfo(repo);
  const ctx = { ...info, since, kanbanFiles, noVector, probeVector, cwd, claudeHome, base: sinceBase(info.g, since) };
  const steps = [
    stepTrap(ctx),
    stepTrapIds(ctx),
    stepLayer(ctx, 'yaml', '2. YAML-réteg', [YAML_FILE], true),
    stepLayer(ctx, 'qmd', '2. QMD-réteg', [QMD_FILE], false),
    stepLayer(ctx, 'cogni', '2. Cogni-réteg', COGNI_FILES, true),
    await stepVector(ctx),
    stepRetro(ctx),
    stepKanban(ctx),
    stepSkill(ctx),
    stepHygiene(ctx),
    stepClean(ctx),
  ];
  return { ok: steps.every((s) => s.status !== 'FAIL'), since: since.toISOString(), branch: ctx.branch, base: ctx.base, steps };
}

// ---- higiénia (D11) -------------------------------------------------------------------------------------------------------

function parseWorktrees(porcelain) {
  const out = [];
  let cur = null;
  for (const l of norm(porcelain).split('\n')) {
    if (l.startsWith('worktree ')) { cur = { path: l.slice(9), branch: null, detached: false, prunable: false, locked: false }; out.push(cur); continue; }
    if (!cur) continue;
    if (l.startsWith('branch ')) cur.branch = l.slice(7).replace(/^refs\/heads\//, '');
    else if (l === 'detached') cur.detached = true;
    else if (l.startsWith('prunable')) cur.prunable = true;
    else if (l.startsWith('locked')) cur.locked = true;
  }
  return out;
}

/** Riport: mi távolítható el biztonságosan, és mi marad (okkal). Semmit nem módosít. */
export function planHygiene({ repo }) {
  const { g, top, mainRoot, branch: current } = repoInfo(repo);
  const base = g.ok(['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main']) ? 'origin/main'
    : g.ok(['rev-parse', '--verify', '--quiet', 'refs/heads/main']) ? 'main' : null;
  const merged = (ref) => base !== null && g.ok(['merge-base', '--is-ancestor', ref, base]);
  const plan = { base, worktrees: { remove: [], prune: [], keep: [] }, branches: { remove: [], keep: [] } };
  const wts = parseWorktrees(g.out(['worktree', 'list', '--porcelain']));
  const busy = new Set();
  for (const w of wts) {
    const isMainWt = samePath(w.path, mainRoot);
    const isCurrent = samePath(w.path, top);
    if (w.branch) busy.add(w.branch);
    if (isMainWt || isCurrent) continue;
    if (w.prunable) { plan.worktrees.prune.push({ path: w.path, branch: w.branch }); continue; }
    const keep = (reason) => plan.worktrees.keep.push({ path: w.path, branch: w.branch, reason });
    if (w.locked) { keep('zárolt munkafa'); continue; }
    if (w.detached || !w.branch) { keep('detached HEAD — csak riport'); continue; }
    if (PROTECTED.has(w.branch)) { keep('védett ág'); continue; }
    if (!merged(`refs/heads/${w.branch}`)) { keep(`nem beolvasztott ág (${base ?? 'nincs alapág'})`); continue; }
    const dirty = makeGit(w.path).tryOut(['status', '--porcelain']);
    if (dirty === null) { keep('az állapot nem olvasható'); continue; }
    if (dirty) { keep('commitolatlan / nem követett változás'); continue; }
    plan.worktrees.remove.push({ path: w.path, branch: w.branch });
  }
  const removingBranches = new Set(plan.worktrees.remove.map((w) => w.branch));
  for (const b of g.out(['for-each-ref', '--format=%(refname:short)', 'refs/heads']).split('\n').filter(Boolean)) {
    if (PROTECTED.has(b) || b === current || (base && b === base)) continue;
    if (busy.has(b)) {
      if (!removingBranches.has(b)) plan.branches.keep.push({ name: b, reason: 'munkafa használja' });
      continue;
    }
    if (merged(`refs/heads/${b}`)) plan.branches.remove.push(b);
    else plan.branches.keep.push({ name: b, reason: `nem beolvasztott (${base ?? 'nincs alapág'})` });
  }
  return plan;
}

/** Csak a terv biztonságos tételei: `git worktree remove` (--force nélkül), `git worktree prune`, `git branch -d` (soha -D). */
export function applyHygiene({ repo, plan }) {
  const { g } = repoInfo(repo);
  const res = { removed: { worktrees: [], branches: [], pruned: 0 }, errors: [] };
  const tryRun = (args, label) => {
    try { g.out(args); return true; } catch (e) { res.errors.push(`${label}: ${norm(e.stderr || e.message).trim().split('\n')[0]}`); return false; }
  };
  if (plan.worktrees.prune.length && tryRun(['worktree', 'prune'], 'worktree prune')) res.removed.pruned = plan.worktrees.prune.length;
  const freed = [];
  for (const w of plan.worktrees.remove) {
    if (tryRun(['worktree', 'remove', w.path], `worktree remove ${w.path}`)) { res.removed.worktrees.push(w.path); freed.push(w.branch); }
  }
  for (const b of [...plan.branches.remove, ...freed]) {
    if (PROTECTED.has(b)) continue;
    if (tryRun(['branch', '-d', b], `branch -d ${b}`)) res.removed.branches.push(b);
  }
  return res;
}

// ---- nincs-uj jelölők -----------------------------------------------------------------------------------------------------

function isoLocal(d) {
  const p = (n) => String(Math.abs(n)).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${off >= 0 ? '+' : '-'}${p(Math.trunc(off / 60))}:${p(off % 60)}`;
}

/** Fajtánként egyetlen friss jelölő a réteg fájljaiba (a régi cserélődik). @returns {string[]} az írt fájlok */
export function writeNoNewMarkers({ repo, kinds, now = new Date() }) {
  const iso = isoLocal(now);
  const targets = [];
  for (const k of kinds) {
    if (k === 'trap') targets.push([TRAP_FILE, 'md', null]);
    if (k === 'yaml') targets.push([YAML_FILE, 'yaml', null]);
    if (k === 'qmd') targets.push([QMD_FILE, 'md', null]);
    if (k === 'cogni') for (const f of COGNI_FILES) targets.push([f, 'yaml', null]);
    if (k === 'kanban') targets.push([YAML_FILE, 'yaml', 'kanban']);
  }
  const written = [];
  for (const [file, style, kind] of targets) {
    const abs = join(repo, file);
    if (!existsSync(abs)) throw new Error(`hiányzik: ${file}`);
    const raw = readFileSync(abs, 'utf8');
    const eol = raw.includes('\r\n') ? '\r\n' : '\n';
    const want = kind ? [kind] : [];
    const kept = norm(raw).split('\n').filter((l) => {
      const m = findMarkers(l);
      return !(m.length && m[0].kinds.join(',') === want.join(','));
    });
    while (kept.length && kept[kept.length - 1] === '') kept.pop();
    const tag = `zaro-hurok: ${iso} nincs-uj${kind ? ` ${kind}` : ''}`;
    kept.push(style === 'md' ? `<!-- ${tag} -->` : `# ${tag}`);
    writeFileSync(abs, kept.join(eol) + eol);
    written.push(file);
  }
  return [...new Set(written)];
}

// ---- konvergencia: a vak körök gépi megállási szabálya (C-ZH-2) ----------------------------------------------------------
// Új vak kör CSAK akkor indulhat, ha a blokkolók száma az utolsó két kör között szigorúan csökkent, és legfeljebb 2 egymást
// követő NEM után; különben megközelítésváltás (követelmény → hibaosztály-leltár → PR-bontás → szakmai forrás → tulajdonos).

const total = (counts, k) => Number((counts?.[k] ?? {}).total ?? 0);

/** Egy `blind-review-<fej>.json` bizonyítékból; befejezetlen futás → null. */
export function roundFromEvidence(obj, head) {
  if (!obj || obj.complete === false || !obj.verdict) return null;
  const c = obj.findings?.counts ?? {};
  return { head: String(head ?? obj.head ?? '').slice(0, 8), verdict: String(obj.verdict), blokkolo: total(c, 'blokkoló'), kozepes: total(c, 'közepes') };
}

/** A jelentés „## Ítélet:” fejlécéből és a leletszámokból (összegző sor vagy táblázat). */
export function roundFromReport(text, name) {
  const t = norm(text);
  const v = /^## Ítélet:\s*(.+)$/m.exec(t);
  const m = /leletek:\s*blokkoló\s+(\d+)[\s\S]*?közepes\s+(\d+)/.exec(t);
  const b = /\|\s*blokkoló\s*\|\s*(\d+)/.exec(t);
  const k = /\|\s*közepes\s*\|\s*(\d+)/.exec(t);
  const num = (x) => (x ? Number(x) : null);
  return {
    head: name,
    verdict: v ? v[1].trim() : null,
    blokkolo: m ? Number(m[1]) : num(b?.[1]),
    kozepes: m ? Number(m[2]) : num(k?.[1]),
  };
}

const isNo = (v) => /^NEM\b/i.test(String(v).trim());

/** @returns {{ code: 0 | 1, message: string, rounds: object[], nemStreak: number }} */
export function decideConvergence(input) {
  const rounds = input.filter((r) => r && r.verdict);
  let nemStreak = 0;
  for (let i = rounds.length - 1; i >= 0 && isNo(rounds[i].verdict); i -= 1) nemStreak += 1;
  const done = (code, message) => ({ code, message, rounds, nemStreak });
  if (rounds.length < 2) return done(0, `kevesebb mint 2 kör (${rounds.length}) — indulhat`);
  const last = rounds[rounds.length - 1];
  const prev = rounds[rounds.length - 2];
  if (!isNo(last.verdict)) return done(0, `az utolsó ítélet ${last.verdict} — nincs blokkoló miatti új kör`);
  const reasons = [];
  if (nemStreak >= 3) reasons.push(`${nemStreak} egymást követő NEM (legfeljebb 2 engedett megközelítésváltás nélkül)`);
  if (last.blokkolo != null && prev.blokkolo != null && !(last.blokkolo < prev.blokkolo)) {
    reasons.push(`a blokkolók száma nem csökkent szigorúan (${prev.blokkolo} → ${last.blokkolo})`);
  }
  if (reasons.length) {
    return done(1, `TILOS új vak kör: ${reasons.join('; ')} — kötelező megközelítésváltás: követelmény / invariáns egy mondatban → `
      + 'hibaosztály-leltár (minden előfordulás, közös segéddel) → PR-bontás ≤ ~400 sor → szakmai forrás → tulajdonosi döntés (C-ZH-2)');
  }
  return done(0, `konvergál (${prev.blokkolo} → ${last.blokkolo} blokkoló, ${nemStreak} NEM egymás után)`);
}

function readEvidenceRound(dir, head) {
  if (!existsSync(dir)) return null;
  const hits = readdirSync(dir).filter((f) => f.startsWith(`blind-review-${head}`) && f.endsWith('.json') && !f.includes('incomplete')).sort();
  for (let i = hits.length - 1; i >= 0; i -= 1) {
    try {
      const r = roundFromEvidence(JSON.parse(readFileSync(join(dir, hits[i]), 'utf8')), head);
      if (r) return r;
    } catch { /* sérült bizonyíték: a következő (régebbi) fájl jön; ha egy sincs, a kör hiányzik */ }
  }
  return null;
}

/**
 * A körök időrendben: a megadott fejek sorrendjében, vagy az ág (alapból HEAD) saját commitjainak sorrendjében
 * (`<alap>..<ág>`, alap = merge-base az `origin/main`-nel / `main`-nel). Hiányzó / befejezetlen bizonyítékú fej kimarad.
 */
export function collectRounds({ repo, branch = null, heads = null, evidenceDir: dir = null }) {
  const { g, top } = repoInfo(repo);
  const evDir = dir ? resolve(dir) : evidenceDir(resolve(top, g.out(['rev-parse', '--git-common-dir'])));
  let list = heads?.map((h) => g.tryOut(['rev-parse', '--verify', '--quiet', `${h}^{commit}`]) || h);
  if (!list) {
    const tip = branch ?? 'HEAD';
    const baseRef = g.ok(['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main']) ? 'origin/main' : 'main';
    const mb = g.tryOut(['merge-base', baseRef, tip]);
    list = (g.out(['rev-list', '--reverse', mb ? `${mb}..${tip}` : tip])).split('\n').filter(Boolean);
  }
  return list.map((h) => readEvidenceRound(evDir, h)).filter(Boolean);
}

// ---- CLI ------------------------------------------------------------------------------------------------------------------

function printHuman(res) {
  for (const s of res.steps) {
    process.stdout.write(`[zaro-hurok] ${s.status.padEnd(4)} ${s.name} — ${s.note}\n`);
    for (const d of s.details.slice(0, 40)) process.stdout.write(`             · ${d}\n`);
  }
  process.stdout.write(`[zaro-hurok] ${res.ok ? 'ZÖLD' : 'PIROS'} (since ${res.since}, ág: ${res.branch})\n`);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`[zaro-hurok] HIBA: ${e.message}\n`);
    process.exit(2);
  }
  let repo;
  try {
    repo = makeGit(args.repo ? resolve(args.repo) : process.cwd()).out(['rev-parse', '--show-toplevel']);
  } catch {
    process.stderr.write('[zaro-hurok] HIBA: nem git-tár\n');
    process.exit(2);
  }
  if (args.cmd === 'check') {
    const res = await runCheck({ repo, since: args.since, kanbanFiles: args.kanbanFiles, noVector: args.noVector });
    if (args.json) process.stdout.write(`${JSON.stringify(res, null, 2)}\n`);
    else printHuman(res);
    process.exit(res.ok ? 0 : 1);
  }
  if (args.cmd === 'hygiene') {
    const plan = planHygiene({ repo });
    const out = args.apply ? { ...plan, applied: applyHygiene({ repo, plan }) } : plan;
    if (args.json) process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    else {
      process.stdout.write(`[zaro-hurok] higiénia (alap: ${plan.base ?? 'nincs'})${args.apply ? ' — ALKALMAZVA' : ' — csak riport (--apply nélkül semmi nem változik)'}\n`);
      for (const w of plan.worktrees.remove) process.stdout.write(`  eltávolítható munkafa: ${w.path} [${w.branch}]\n`);
      for (const w of plan.worktrees.prune) process.stdout.write(`  árva munkafa-bejegyzés: ${w.path}\n`);
      for (const b of plan.branches.remove) process.stdout.write(`  törölhető ág: ${b}\n`);
      for (const w of plan.worktrees.keep) process.stdout.write(`  marad: ${w.path} [${w.branch ?? 'detached'}] — ${w.reason}\n`);
      for (const b of plan.branches.keep) process.stdout.write(`  marad: ${b.name} — ${b.reason}\n`);
      if (out.applied) for (const e of out.applied.errors) process.stdout.write(`  HIBA: ${e}\n`);
    }
    process.exit(out.applied?.errors.length ? 1 : 0);
  }
  if (args.cmd === 'konvergencia') {
    const rounds = args.reports
      ? args.reports.map((p) => roundFromReport(readFileSync(resolve(p), 'utf8'), basename(p)))
      : collectRounds({ repo, branch: args.branch, heads: args.heads, evidenceDir: args.evidence });
    const d = decideConvergence(rounds);
    if (args.json) process.stdout.write(`${JSON.stringify(d, null, 2)}\n`);
    else {
      for (const r of d.rounds) process.stdout.write(`  ${r.head}: ${r.verdict} — blokkoló ${r.blokkolo ?? '?'}, közepes ${r.kozepes ?? '?'}\n`);
      process.stdout.write(`[zaro-hurok] ${d.code === 0 ? 'INDULHAT: ' : ''}${d.message}\n`);
    }
    process.exit(d.code);
  }
  const files = writeNoNewMarkers({ repo, kinds: args.kinds });
  process.stdout.write(`[zaro-hurok] nincs-uj jelölő: ${files.join(', ')}\n`);
}

if (isMain(import.meta.url)) main();
