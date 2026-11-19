#!/usr/bin/env node
// Memória-ellenőrző (docs/minosegkapuk.md „Állapot-ellenőrzők”; terv: docs/specs/2026-11-17-allapot-ellenorok.md).
// Csak olvas. A memória-könyvtár: --dir <út> | WEBSULI_MEMORY_DIR | a Claude Code alapútja (~/.claude/projects/<repó-kód>/memory).
//
// Használat: node scripts/qa/checks/memory-check.mjs [--dir <út>] [--repo <út>] [--gh] [--json]
// Kilépés: 0 = nincs FAIL, 1 = FAIL, 2 = nem tudott futni (pl. nincs memória-könyvtár).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CannotRun, LEVELS, argValue, createReport, isMainModule, loadChecksConfig, realRun, repoPaths, runMain } from './lib.mjs';

const { FAIL, WARN, INFO, SKIP } = LEVELS;
const INDEX_LINE = /^- \[[^\]]+\]\(([^)]+)\)\s*(?:—|-)\s*\S/;
const PLACEHOLDER = /[<>*…{}$|]/;

/** A Claude Code projekt-könyvtárának neve: az abszolút út minden nem alfanumerikus karaktere „-”. */
export function claudeProjectKey(absPath) {
  return absPath.replace(/[^A-Za-z0-9]/g, '-');
}

export function defaultMemoryDir(mainRoot, env = process.env, home = homedir()) {
  if (env.WEBSULI_MEMORY_DIR) return env.WEBSULI_MEMORY_DIR;
  return join(home, '.claude', 'projects', claudeProjectKey(mainRoot), 'memory');
}

/** Frontmatter: name, description, metadata.type (egyszerű, a memória-formátumhoz elég olvasó). */
export function parseFrontmatter(text) {
  const t = text.replace(/\r\n/g, '\n');
  if (!t.startsWith('---\n')) return null;
  const end = t.indexOf('\n---', 4);
  if (end < 0) return null;
  const fm = t.slice(4, end);
  const pick = (re) => (re.exec(fm)?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
  return { name: pick(/^name:\s*(.+)$/m), description: pick(/^description:\s*(.+)$/m), type: pick(/^\s+type:\s*(\S+)/m), bodyStart: t.slice(0, end + 4).split('\n').length };
}

/** A törzsben hivatkozott repó-útvonalak és `npm run` nevek, soronként. */
export function extractRefs(text, prefixes) {
  const pre = prefixes.map((p) => p.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')).join('|');
  const pathRe = new RegExp(`(?:^|[\\s\`(\\[„"'])((?:${pre})[^\\s\`)\\]"'„”,;]+)`, 'g');
  const npmRe = /\bnpm(?:\.cmd)? run ([a-z0-9][a-z0-9:_-]*)/g;
  const out = [];
  text.replace(/\r\n/g, '\n').split('\n').forEach((line, i) => {
    for (const m of line.matchAll(pathRe)) {
      const p = m[1].replace(/[.:]+$/, '');
      out.push({ kind: 'path', value: p, line: i + 1, placeholder: PLACEHOLDER.test(p) });
    }
    for (const m of line.matchAll(npmRe)) out.push({ kind: 'npm', value: m[1], line: i + 1, placeholder: false });
  });
  return out;
}

function npmScripts(repo) {
  const names = new Set();
  for (const f of ['package.json', join('source', 'package.json')]) {
    try { Object.keys(JSON.parse(readFileSync(join(repo, f), 'utf8')).scripts ?? {}).forEach((n) => names.add(n)); } catch { /* nincs */ }
  }
  return names;
}

/**
 * @param {{ dir: string, repo: string, cfg: object, gh?: boolean, run?: Function }} p
 */
export function checkMemory({ dir, repo, cfg, gh = false, run = realRun }) {
  const report = createReport('memory-check');
  if (!existsSync(dir)) throw new CannotRun(`nincs memória-könyvtár (add meg: --dir <út> vagy WEBSULI_MEMORY_DIR)`);
  const indexPath = join(dir, 'MEMORY.md');
  if (!existsSync(indexPath)) throw new CannotRun('nincs MEMORY.md a memória-könyvtárban');
  const files = readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'MEMORY.md').sort();
  const index = readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n');

  // (a) index
  const listed = new Map();
  index.split('\n').forEach((line, i) => {
    if (!line.trim()) return;
    const m = INDEX_LINE.exec(line);
    if (!m) { report.add(WARN, 'index-forma', `MEMORY.md:${i + 1}`, 'nem „- [cím](fájl.md) — kampó” alakú sor'); return; }
    const f = m[1];
    if (listed.has(f)) report.add(FAIL, 'index-duplikalt', `MEMORY.md:${i + 1}`, `${f} kétszer szerepel (először: ${listed.get(f)}. sor)`);
    else listed.set(f, i + 1);
    if (!existsSync(join(dir, f))) report.add(FAIL, 'index-halott', `MEMORY.md:${i + 1}`, `${f} nem létezik`);
    if ([...line].length > cfg.indexLineMax) report.add(WARN, 'index-hosszu', `MEMORY.md:${i + 1}`, `${[...line].length} karakter (keret: ${cfg.indexLineMax})`);
  });
  for (const f of files) if (!listed.has(f)) report.add(FAIL, 'index-hianyzik', f, 'a memóriafájl nincs a MEMORY.md-ben');

  // (b)–(e) fájlonként
  const slugs = new Set(files.map((f) => f.replace(/\.md$/, '')));
  const scripts = npmScripts(repo);
  const timeRes = cfg.timeBoundPatterns.map((p) => new RegExp(p, 'i'));
  const prs = new Map();
  let total = index.length;
  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    total += text.length;
    const slug = f.replace(/\.md$/, '');
    const fm = parseFrontmatter(text);
    if (!fm) { report.add(FAIL, 'frontmatter', `${f}:1`, 'nincs frontmatter (--- … ---)'); continue; }
    if (fm.name !== slug) report.add(FAIL, 'frontmatter-name', `${f}:2`, `name: „${fm.name}” ≠ fájlnév-slug „${slug}”`);
    if (!fm.description) report.add(FAIL, 'frontmatter-description', `${f}:1`, 'hiányzik a description');
    if (!cfg.types.includes(fm.type)) report.add(FAIL, 'frontmatter-type', `${f}:1`, `metadata.type „${fm.type}” nem ${cfg.types.join(' | ')}`);
    if (text.length > cfg.fileCharsWarn) report.add(WARN, 'meret-fajl', f, `${text.length} karakter (keret: ${cfg.fileCharsWarn})`);
    const lines = text.replace(/\r\n/g, '\n').split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(/\[\[([a-z0-9-]+)\]\]/g)) {
        if (!slugs.has(m[1])) report.add(WARN, 'hivatkozas-slug', `${f}:${i + 1}`, `[[${m[1]}]] nem létező memória`);
      }
      if (i + 1 > fm.bodyStart) {
        for (const re of timeRes) if (re.test(line)) report.add(WARN, 'idohoz-kotott', `${f}:${i + 1}`, `időhöz kötött állítás („${re.source}”) — ellenőrizd, igaz-e még`);
        for (const m of line.matchAll(/(?:^|[\s(])#(\d{3,4})\b/g)) if (!prs.has(m[1])) prs.set(m[1], `${f}:${i + 1}`);
      }
    });
    const histRes = (cfg.historicalPatterns ?? []).map((p) => new RegExp(p, 'i'));
    for (const r of extractRefs(lines.slice(fm.bodyStart).join('\n'), cfg.repoPathPrefixes)) {
      const lineNo = r.line + fm.bodyStart;
      const where = `${f}:${lineNo}`;
      const text = lines[lineNo - 1] ?? '';
      if (r.placeholder) continue;
      if (r.kind === 'path' && !existsSync(join(repo, r.value))) {
        if (histRes.some((re) => re.test(text))) report.add(INFO, 'torteneti-utvonal', where, `${r.value} nem létezik — a sor történetiként jelöli (törölve / kivezetve)`);
        else if (timeRes.some((re) => re.test(text))) report.add(WARN, 'idohoz-kotott-utvonal', where, `${r.value} még nem létezik — a sor „készül”-ként jelöli; ellenőrizd, elkészült-e`);
        else report.add(FAIL, 'elavult-utvonal', where, `${r.value} nem létezik a repóban`);
      }
      if (r.kind === 'npm' && !scripts.has(r.value)) report.add(FAIL, 'elavult-npm', where, `npm run ${r.value} — nincs ilyen szkript (gyökér / source)`);
    }
  }

  if (total > cfg.totalCharsWarn) report.add(WARN, 'meret-osszes', dir, `${total} karakter (keret: ${cfg.totalCharsWarn})`);
  const indexTokens = Math.round(index.length / 4);
  report.add(indexTokens > cfg.indexTokensWarn ? WARN : INFO, 'betoltodik', 'MEMORY.md', `minden ülésben ~${indexTokens} token (karakter / 4); összesen ${files.length} memória, ${total} karakter`);

  if (!gh) {
    report.add(SKIP, 'pr-letezes', '', `${prs.size} hivatkozott PR-szám nem ellenőrzött (--gh kapcsolóval a gh-val ellenőrizhető)`);
  } else if (run('gh', ['--version']).code !== 0) {
    report.add(SKIP, 'pr-letezes', '', 'nincs gh — a PR-számok nem ellenőrzöttek');
  } else {
    for (const [n, where] of [...prs].slice(0, 60)) {
      const r = run('gh', ['pr', 'view', n, '--json', 'number'], { cwd: repo, timeoutMs: 15_000 });
      if (r.code !== 0) report.add(WARN, 'pr-nem-talalhato', where, `#${n} nem PR (lehet kanban-jegy vagy issue) — nézd meg`);
    }
  }
  return report;
}

if (isMainModule(import.meta.url)) {
  await runMain('memory-check', (args) => {
    const paths = repoPaths();
    const repo = argValue(args, '--repo') ?? paths.mainRoot;
    const dir = argValue(args, '--dir') ?? defaultMemoryDir(paths.mainRoot);
    return checkMemory({ dir, repo, cfg: loadChecksConfig().memory, gh: args.includes('--gh') });
  });
}
