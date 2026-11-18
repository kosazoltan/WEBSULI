#!/usr/bin/env node
// Lint kapu (docs/minosegkapuk.md; terv: docs/specs/2026-11-17-minosegkapuk.md, E1–E3).
// Bármilyen kibocsátás (commit-sorozat lezárása, push, PR, merge, telepítés) előtt fut.
//
// Használat: node scripts/qa/gates/lint-gate.mjs [--fast|--full] [--base origin/main]
//   --fast  csak a változott fájlok (szakaszonként; cél < 60 s)
//   --full  minden (alap): teljes `npm run lint`, mindkét tsc
// Kilépési kód: 0 = zöld, 1 = bármely lépés FAIL.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  STATUS, argValue, cmdResult, createGate, isMain, makeContext, writeLog,
} from './lib.mjs';

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const LINTABLE = /^source\/(?:client\/src|server)\/.+\.(?:ts|tsx|js|jsx)$/;
const SOURCE_TS = /^source\/.+\.(?:ts|tsx)$/;
const SCRIPT_FILE = /^(?:scripts|source\/scripts)\/|\.(?:sh|ps1|cmd|bat)$|(?:^|\/)package\.json$|^\.github\/|^\.claude\/settings/;
const SKIP_SCAN = /(?:^|\/)package-lock\.json$|\.(?:png|jpe?g|gif|webp|ico|woff2?|ttf|pdf|zip|mp3|mp4|wasm)$/i;

const ONLY_SKIP = [
  /\b(?:it|test|describe|suite)\.(?:only|skip|fixme)\s*\(/,
  /\b(?:xit|xdescribe|xtest)\s*\(/,
  /\{\s*(?:only|skip)\s*:\s*true\b/,
];
const NO_VERIFY = /\bgit\b[^\n]*--no-verify\b/;
const PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const AWS_KEY = /\bAKIA[0-9A-Z]{16}\b/;
const TOKEN = /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-ant-[A-Za-z0-9_-]{20,}|xox[abp]-[A-Za-z0-9-]{20,})\b/;
const DB_URL = /postgres(?:ql)?:\/\/([^:/\s@'"`]+):([^@\s'"`]+)@([^/:\s?'"`]+)/;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', 'postgres', 'db', 'host']);
const PLACEHOLDER = /^[<$]|\$\{|^(?:password|pass|secret|x+|\*+|changeme|postgres)$/i;

/**
 * A diff hozzáadott soraiban keresett tiltott minták. Érték SOHA nem kerül a leletbe, csak fájl:sor és a szabály neve.
 * @param {{file:string,line:number,text:string}[]} lines
 */
export function scanAddedLines(lines) {
  const findings = [];
  for (const { file, line, text } of lines) {
    if (SKIP_SCAN.test(file)) continue;
    const add = (rule) => findings.push({ file, line, rule, level: STATUS.FAIL });
    if (TEST_FILE.test(file) && ONLY_SKIP.some((re) => re.test(text))) add('teszt kihagyása / szűkítése (.only / .skip / fixme) — tilos');
    if (SCRIPT_FILE.test(file) && !TEST_FILE.test(file) && !file.endsWith('.md') && NO_VERIFY.test(text)) add('hook-megkerülés (--no-verify) szkriptben');
    if (PRIVATE_KEY.test(text)) add('privát kulcs blokk');
    if (AWS_KEY.test(text)) add('AWS-hozzáférési kulcs minta');
    if (TOKEN.test(text)) add('ismert token-előtag (GitHub / Anthropic / Slack)');
    const db = DB_URL.exec(text);
    if (db && !LOOPBACK.has(db[3].toLowerCase()) && !PLACEHOLDER.test(db[2])) add('jelszavas adatbázis-URL nem-loopback gépre');
  }
  return findings;
}

/** Az `enforce-repo-rules` hook kimenetének besorolása: a heurisztikus titok-gyanú WARN (emberi ellenőrzés), DENY → FAIL. */
export function classifyHookOutput(stdout) {
  if (!stdout || !stdout.trim()) return null;
  let j;
  // Kanban #100: értelmezhetetlen, nem üres hook-kimenet nem nyelhető el csendben → WARN (emberi átnézés).
  try { j = JSON.parse(stdout); } catch { return { level: STATUS.WARN, msg: `értelmezhetetlen hook-kimenet: ${String(stdout).slice(0, 120)}` }; }
  const deny = j?.hookSpecificOutput?.permissionDecision === 'deny';
  const msg = String(j?.hookSpecificOutput?.permissionDecisionReason ?? j?.systemMessage ?? '').replace(/^\[agentic-qa-kit\]\s*/, '');
  return { level: deny ? STATUS.FAIL : STATUS.WARN, msg };
}

/** A `scripts/qa/repo-rules.json` Edit|Write szabályai egy fájl hozzáadott szövegére. */
export function applyRepoRules(rules, text, file = '') {
  const hits = [];
  for (const r of rules) {
    if (r.tool && r.tool !== 'Edit|Write' && r.tool !== 'Write' && r.tool !== 'Edit') continue;
    // A diff hozzáadott sorai alapján az eltávolítás nem ítélhető meg (a `removes`-szabályt a hook Edit / Write-ra méri);
    // a `path`-szabály csak az ilyen útvonalú fájlra vonatkozik (docs/specs/2026-11-18-hook-onfailure.md L2).
    if (r.removes) continue;
    if (r.path && !new RegExp(r.path, 'i').test(String(file).replace(/\\/g, '/'))) continue;
    try {
      if (new RegExp(r.pattern, r.flags || '').test(text)) hits.push({ level: r.level === 'deny' ? STATUS.FAIL : STATUS.WARN, msg: r.message || r.pattern });
    } catch { /* hibás szabály: a repo-rules.test.mjs felel érte */ }
  }
  return hits;
}

function groupByFile(lines) {
  const m = new Map();
  for (const l of lines) {
    if (!m.has(l.file)) m.set(l.file, []);
    m.get(l.file).push(l);
  }
  return m;
}

/**
 * A lint kapu lépései egy meglévő kapuhoz adva (a stage / push / PR kapu is ezt hívja).
 * @param {{ gate: ReturnType<typeof createGate>, ctx: ReturnType<typeof makeContext>, mode: 'fast'|'full' }} p
 */
export async function runLintSteps({ gate, ctx, mode }) {
  const { exec, git, root, src, base, node } = ctx;
  const changed = git.changedFiles(base, root);
  const lintable = changed.filter((f) => LINTABLE.test(f));
  const tsChanged = changed.some((f) => SOURCE_TS.test(f));
  const testsChanged = changed.some((f) => /^source\/tests\//.test(f));
  const eslintBin = join(src, 'node_modules', 'eslint', 'bin', 'eslint.js');
  const needModules = () => (existsSync(join(src, 'node_modules'))
    ? null
    : { status: STATUS.FAIL, note: 'nincs source/node_modules — futtasd: npm.cmd ci --prefix source --ignore-scripts (C-38)' });
  const log = (step, r) => writeLog(ctx.evDir, 'lint-gate', step, `${r.stdout}\n${r.stderr}`);

  gate.log(`[lint-gate] mód: ${mode}; ${changed.length} változott fájl a ${base} óta (munkafával együtt)`);

  await gate.step('git diff --check', () => {
    const mb = git.mergeBase(base);
    const r = git.run(['diff', '--check', mb]);
    return r.code === 0 ? { status: STATUS.PASS } : { status: STATUS.FAIL, note: 'whitespace-hiba / ütközésjel a diffben', detail: r.stdout };
  });

  await gate.step('nem követett fájlok', () => {
    const u = git.untracked();
    return u.length
      ? { status: STATUS.WARN, note: `${u.length} nem követett fájl — az e-mail-őr és a commit nem látja; \`git add\` vagy .gitignore`, detail: u.join('\n') }
      : { status: STATUS.PASS };
  });

  await gate.step('ESLint (változott fájlok)', () => {
    if (!lintable.length) return { status: STATUS.SKIP, note: 'nincs változott lintelhető fájl' };
    const nm = needModules();
    if (nm) return nm;
    const rel = lintable.map((f) => f.replace(/^source\//, ''));
    const r = exec(node, [eslintBin, '--max-warnings', '0', ...rel], { cwd: src });
    log('eslint-changed', r);
    return cmdResult(r, `${rel.length} fájl`);
  });

  if (mode === 'full') {
    await gate.step('npm run lint (teljes, max-warnings 0)', () => {
      const nm = needModules();
      if (nm) return nm;
      const r = exec('npm', ['run', 'lint'], { cwd: src });
      log('lint', r);
      return cmdResult(r);
    });
  }

  await gate.step('npm run check (tsc)', () => {
    if (mode === 'fast' && !tsChanged) return { status: STATUS.SKIP, note: 'gyors mód: nincs változott .ts/.tsx' };
    const nm = needModules();
    if (nm) return nm;
    const r = exec('npm', ['run', 'check'], { cwd: src });
    log('check', r);
    return cmdResult(r);
  });

  await gate.step('npm run check:test (tsc, tesztek)', () => {
    if (mode === 'fast' && !testsChanged) return { status: STATUS.SKIP, note: 'gyors mód: nincs változott tesztfájl' };
    const nm = needModules();
    if (nm) return nm;
    const r = exec('npm', ['run', 'check:test'], { cwd: src });
    log('check-test', r);
    return cmdResult(r);
  });

  const added = git.addedLines(base, root);
  const byFile = groupByFile(added);

  await gate.step('repó-szabályok a diffre', () => {
    const rulesPath = join(root, 'scripts', 'qa', 'repo-rules.json');
    const rules = existsSync(rulesPath) ? (JSON.parse(readFileSync(rulesPath, 'utf8')).rules ?? []) : [];
    const hook = join(root, 'scripts', 'qa', 'hooks', 'enforce-repo-rules.mjs');
    const hits = [];
    for (const [file, ls] of byFile) {
      if (SKIP_SCAN.test(file)) continue;
      const text = ls.map((l) => l.text).join('\n');
      for (const h of applyRepoRules(rules, text, file)) hits.push({ ...h, file });
      if (existsSync(hook)) {
        const r = exec(node, [hook], { cwd: root, input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: file, content: text, diff_scan: true } }), timeoutMs: 20_000 });
        const c = classifyHookOutput(r.stdout);
        if (c) hits.push({ ...c, file });
      }
    }
    if (!hits.length) return { status: STATUS.PASS, note: `${byFile.size} fájl` };
    const fail = hits.some((h) => h.level === STATUS.FAIL);
    return {
      status: fail ? STATUS.FAIL : STATUS.WARN,
      note: `${hits.length} jelzés${fail ? '' : ' (heurisztikus — nézd át; a valódi titok-mintát a következő lépés bukásra viszi)'}`,
      detail: hits.map((h) => `${h.level} ${h.file}: ${h.msg}`).join('\n'),
    };
  });

  await gate.step('tiltott minták a diffben', () => {
    const f = scanAddedLines(added);
    return f.length
      ? { status: STATUS.FAIL, note: `${f.length} lelet`, detail: f.map((x) => `${x.file}:${x.line} — ${x.rule}`).join('\n') }
      : { status: STATUS.PASS, note: `${added.length} hozzáadott sor` };
  });

  await gate.step('valódi e-mail-cím őr (no-real-emails-guard)', () => {
    const nm = needModules();
    if (nm) return nm;
    const r = exec(node, ['--import', 'tsx', '--test', 'tests/no-real-emails-guard.test.ts'], { cwd: src });
    log('no-real-emails', r);
    return cmdResult(r);
  });

  if (changed.some((f) => /^\.(?:agents|claude)\/skills\//.test(f))) {
    await gate.step('skill-tükör (.agents ↔ .claude)', () => {
      const r = exec(node, [join(root, 'scripts', 'qa', 'gates', 'skills-sync-check.mjs')], { cwd: root });
      return cmdResult(r);
    });
  }

  return { changed };
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args.includes('--fast') ? 'fast' : 'full';
  const ctx = makeContext({ base: argValue(args, '--base') });
  const gate = createGate('lint-gate');
  await runLintSteps({ gate, ctx, mode });
  process.exit(gate.finish());
}

if (isMain(import.meta.url)) main();
