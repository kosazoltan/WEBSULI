#!/usr/bin/env node
// Szakasz utáni kapu (docs/minosegkapuk.md; terv E4): MINDEN fejlesztési szakasz után, továbblépés előtt.
// lint-gate --fast + a változott fájlokhoz tartozó egységtesztek + minden *-guard.test.ts (+ scripts/qa tesztek, ha érintett).
//
// Használat: node scripts/qa/gates/stage-gate.mjs [--base origin/main]

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { STATUS, argValue, cmdResult, createGate, isMain, makeContext, writeLog } from './lib.mjs';
import { runLintSteps } from './lint-gate.mjs';
import { appendRecord } from './evidence-chain.mjs';

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[_\s]+/g, '-').toLowerCase();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A fájl törzse kiterjesztés nélkül (`questionDirector.ts` → `questionDirector`; `index.ts` → a szülőmappa neve). */
export function stemOf(file) {
  const parts = file.split('/');
  let b = parts[parts.length - 1].replace(/\.[^.]+$/, '');
  if (b === 'index' && parts.length > 1) b = parts[parts.length - 2];
  return b;
}

/**
 * Determinisztikus leképezés: változott fájl → érintett `source/tests/*.test.ts`.
 * (a) névtő: a teszt neve tartalmazza a törzset (kebab vagy kisbetűs); (b) import: a teszt szövegében `/<törzs>"|'|.ts|.js`;
 * (c) játék-csoport: a fájl útja illik egy játék kulcsszavára → a kulcsszavas nevű tesztek; közös játékmotor → minden játék.
 * @returns {{ tests: string[], unmapped: string[] }} — a tesztek `tests/<név>` alakban (a `source/`-hoz relatív)
 */
export function mapTests({ changed, testFiles, readTest, games = {}, sharedGamePatterns = [] }) {
  const tests = new Set();
  const unmapped = [];
  const gameRes = Object.values(games).map((k) => new RegExp(k, 'i'));
  for (const file of changed) {
    if (!file.startsWith('source/')) continue;
    if (/^source\/tests\/[^/]+\.test\.ts$/.test(file)) { tests.add(file.replace(/^source\//, '')); continue; }
    if (!/\.(?:ts|tsx|js|mjs|cjs|jsx)$/.test(file) || /^source\/tests\//.test(file)) continue;
    const stem = stemOf(file);
    const k = kebab(stem);
    const low = stem.toLowerCase();
    const importRe = new RegExp(`/${escapeRe(stem)}(?:["'\`]|\\.(?:ts|tsx|js|mjs)\\b)`);
    const hits = new Set();
    for (const t of testFiles) {
      const name = basename(t).replace(/\.test\.ts$/, '').toLowerCase();
      if ((k.length >= 4 && name.includes(k)) || (low.length >= 4 && name.replace(/-/g, '').includes(low.replace(/-/g, '')))) hits.add(t);
      else if (stem.length >= 3 && importRe.test(readTest(t))) hits.add(t);
    }
    const sharedGame = sharedGamePatterns.some((p) => file.startsWith(p));
    for (const re of gameRes) {
      if (sharedGame || re.test(file)) for (const t of testFiles) if (re.test(basename(t))) hits.add(t);
    }
    if (hits.size) for (const h of hits) tests.add(h);
    else unmapped.push(file);
  }
  return { tests: [...tests].sort(), unmapped };
}

export function listFiles(dir, re) {
  return existsSync(dir) ? readdirSync(dir).filter((f) => re.test(f)).sort() : [];
}

/** A szakasz-kapu lépései (a lint kapu gyors módja után). */
export async function runStageSteps({ gate, ctx, changed }) {
  const { exec, src, root, cfg, node } = ctx;
  const testDir = join(src, 'tests');
  const testFiles = listFiles(testDir, /\.test\.ts$/).map((f) => `tests/${f}`);
  const cache = new Map();
  const readTest = (t) => {
    if (!cache.has(t)) { try { cache.set(t, readFileSync(join(src, t), 'utf8')); } catch { cache.set(t, ''); } }
    return cache.get(t);
  };
  const { tests, unmapped } = mapTests({ changed, testFiles, readTest, games: cfg.games, sharedGamePatterns: cfg.sharedGamePatterns });
  const guards = testFiles.filter((t) => /-guard\.test\.ts$/.test(t));
  const all = [...new Set([...tests, ...guards])];

  await gate.step('célzott teszt-leképezés', () => (unmapped.length
    ? { status: STATUS.WARN, note: `${unmapped.length} változott fájlhoz nincs célzott teszt ehhez a fájlhoz — írj tesztet, vagy nevezd meg a PR-ban`, detail: unmapped.join('\n') }
    : { status: STATUS.PASS, note: `${tests.length} célzott teszt` }));

  await gate.step(`egységtesztek: ${tests.length} célzott + ${guards.length} őr`, () => {
    if (!existsSync(join(src, 'node_modules'))) return { status: STATUS.FAIL, note: 'nincs source/node_modules — npm.cmd ci --prefix source --ignore-scripts (C-38)' };
    const r = exec(node, ['--import', 'tsx', '--test', ...all], { cwd: src });
    writeLog(ctx.evDir, 'stage-gate', 'unit', `${r.stdout}\n${r.stderr}`);
    return cmdResult(r, `${all.length} fájl`);
  });

  if (changed.some((f) => f.startsWith('scripts/qa/'))) {
    await gate.step('scripts/qa saját tesztjei', () => {
      const files = [
        ...listFiles(join(root, 'scripts', 'qa'), /\.test\.mjs$/).map((f) => `scripts/qa/${f}`),
        ...listFiles(join(root, 'scripts', 'qa', 'gates'), /\.test\.mjs$/).map((f) => `scripts/qa/gates/${f}`),
        ...listFiles(join(root, 'scripts', 'qa', 'hooks'), /\.test\.mjs$/).map((f) => `scripts/qa/hooks/${f}`),
      ];
      const r = exec(node, ['--test', ...files], { cwd: root });
      writeLog(ctx.evDir, 'stage-gate', 'qa-tests', `${r.stdout}\n${r.stderr}`);
      return cmdResult(r, `${files.length} fájl`);
    });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const ctx = makeContext({ base: argValue(args, '--base') });
  const gate = createGate('stage-gate');
  const { changed } = await runLintSteps({ gate, ctx, mode: 'fast' });
  await runStageSteps({ gate, ctx, changed });
  const code = gate.finish();
  // S2 (terv 6.1): láncolt bizonyíték a fejre — a commitolatlan változással futott szakasz-kaput a `dirty` jelzi.
  try {
    const head = ctx.git.head();
    appendRecord(ctx.evDir, `stage-${head}`, {
      kind: 'stage', head, ok: code === 0, dirty: ctx.git.trackedDirty().length > 0 || ctx.git.untracked().length > 0,
      at: new Date().toISOString(), steps: gate.results.map((r) => ({ name: r.name, status: r.status })),
    });
  } catch { /* a bizonyíték írása nem dönti el a kaput */ }
  process.exit(code);
}

if (isMain(import.meta.url)) main();
