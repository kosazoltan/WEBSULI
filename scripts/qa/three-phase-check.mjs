#!/usr/bin/env node
// Háromfázisú rend CI-ellenőrzése (docs/specs/2026-10-15-haromfazis-ci-ellenorzes.md; tulajdonosi döntés 2026-10-15).
// Terv → végrehajtási utasítás → kód: érdemi kódváltozás csak akkor, ha a PR-ben van végrehajtási utasítás, az létező tervre hivatkozik,
// és a kód nem korábbi commitban készült, mint a végrehajtási utasítás. Kis (≤ 1 fájl, ≤ 20 sor) javítás kivétel (figyelmeztetéssel).
//
// Használat: node scripts/qa/three-phase-check.mjs [--base origin/main]

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CODE = /^source\/(server|shared|client\/src)\//;
const EXEC = /^docs\/specs\/[^/]+-vegrehajtas\.md$/;
const SMALL_FILES = 1;
const SMALL_LINES = 20;

export const isCode = (path) => CODE.test(path) && !/\.test\.[cm]?[jt]sx?$/.test(path);

/** Tiszta döntés: a diff-fájlok, az időrendi commitok és a fájlolvasás alapján. */
export function decideThreePhase({ files, commits, readFile, exists }) {
  const code = files.filter((f) => isCode(f.path));
  if (!code.length) return { ok: true, reason: 'Nincs kódváltozás (dokumentum, teszt, szkript vagy workflow).' };
  const lines = code.reduce((n, f) => n + (f.added || 0) + (f.deleted || 0), 0);
  if (code.length <= SMALL_FILES && lines <= SMALL_LINES) {
    return { ok: true, reason: `Kis javítás (${code.length} kódfájl, ${lines} sor).`, warning: 'A kis javítás terve a commit-üzenetben / a chatben legyen (docs/agent-haromfazisu-munka.md).' };
  }
  const execs = files.map((f) => f.path).filter((p) => EXEC.test(p));
  if (!execs.length) {
    return { ok: false, reason: `Nincs végrehajtási utasítás: ${code.length} kódfájl, ${lines} sor változott, de a PR nem tartalmaz docs/specs/*-vegrehajtas.md fájlt.` };
  }
  const withPlan = execs.filter((p) => {
    const text = readFile(p) ?? '';
    const refs = [...text.matchAll(/docs\/specs\/([^\s`)]+?\.md)/g)].map((m) => `docs/specs/${m[1]}`).filter((r) => !EXEC.test(r));
    return refs.some((r) => exists(r));
  });
  if (!withPlan.length) return { ok: false, reason: `A végrehajtási utasítás (${execs.join(', ')}) nem hivatkozik létező tervfájlra (docs/specs/<név>.md).` };
  const firstCode = commits.findIndex((c) => c.files.some(isCode));
  const firstExec = commits.findIndex((c) => c.files.some((p) => withPlan.includes(p)));
  if (firstExec === -1 || (firstCode !== -1 && firstCode < firstExec)) {
    const sha = firstCode >= 0 ? commits[firstCode].sha.slice(0, 7) : '?';
    return { ok: false, reason: `Sorrend: a kód (${sha}) korábbi commitban készült, mint a végrehajtási utasítás (${withPlan.join(', ')}).` };
  }
  return { ok: true, reason: `Rendben: terv + végrehajtási utasítás (${withPlan.join(', ')}), a kód utána.` };
}

function git(argv) {
  return execFileSync('git', argv, { encoding: 'utf8' }).trim();
}

function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--base');
  const base = i >= 0 ? args[i + 1] : 'origin/main';
  const mergeBase = git(['merge-base', base, 'HEAD']);
  const files = git(['diff', '--numstat', `${mergeBase}...HEAD`]).split('\n').filter(Boolean).map((line) => {
    const [added, deleted, path] = line.split('\t');
    return { path, added: Number(added) || 0, deleted: Number(deleted) || 0 };
  });
  const log = git(['log', '--reverse', '--no-merges', '--name-only', '--format=@@%H', `${mergeBase}..HEAD`]);
  const commits = log.split('@@').filter(Boolean).map((chunk) => {
    const [sha, ...rest] = chunk.trim().split('\n');
    return { sha, files: rest.filter(Boolean) };
  });
  const result = decideThreePhase({ files, commits, readFile: (p) => (existsSync(p) ? readFileSync(p, 'utf8') : null), exists: (p) => existsSync(p) });
  if (result.warning) console.log(`[három-fázis] Figyelmeztetés: ${result.warning}`);
  console.log(`[három-fázis] ${result.ok ? 'OK' : 'HIBA'}: ${result.reason}`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
