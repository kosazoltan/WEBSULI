#!/usr/bin/env node
// agentic-qa-kit — PR/branch diff-méret őr (TECH-053, CIT-megelőzés)
// A feature branch diffjét méri a base-hez képest (merge-base ... HEAD),
// lockfile-ok és generált fájlok nélkül. Küszöb felett figyelmeztet
// (--strict módban exit 1).
//
// Használat: node scripts/qa/pr-size-check.mjs [--base origin/main] [--limit 400] [--strict]

import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
function argOf(name, def) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
}
const strict = args.includes('--strict');
const limit = parseInt(argOf('--limit', '400'), 10);
let base = argOf('--base', '');

// execFileSync argumentum-tömbbel: nincs shell, nincs string-interpoláció -> injekció-mentes.
function git(argv) {
  return execFileSync('git', argv, { encoding: 'utf8' }).trim();
}

try {
  if (!base) {
    for (const cand of ['origin/main', 'origin/master', 'main', 'master']) {
      try { git(['rev-parse', '--verify', cand]); base = cand; break; } catch { /* next */ }
    }
  }
  if (!base) {
    console.log('[pr-size] Nincs base ág — kihagyva.');
    process.exit(0);
  }

  const head = git(['branch', '--show-current']) || 'HEAD';
  if (head === base.replace(/^origin\//, '')) {
    console.log(`[pr-size] A ${head} maga a base — kihagyva.`);
    process.exit(0);
  }

  const numstat = git(['diff', '--numstat', `${base}...HEAD`]);
  const EXCLUDE = /(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|\.snap$|dist\/|build\/|coverage\/|\.min\.(js|css)$)/;
  let add = 0, del = 0, fileCount = 0;
  for (const line of numstat.split('\n').filter(Boolean)) {
    const [a, d, file] = line.split('\t');
    if (EXCLUDE.test(file)) continue;
    fileCount++;
    if (a !== '-') add += parseInt(a, 10) || 0;
    if (d !== '-') del += parseInt(d, 10) || 0;
  }
  const total = add + del;
  const status = total > limit ? (strict ? 'TÚLLÉPÉS' : 'FIGYELMEZTETÉS') : 'OK';
  console.log(`[pr-size] ${base}...HEAD: ${fileCount} fájl, +${add}/-${del} = ${total} sor (limit: ${limit}) → ${status}`);
  if (total > limit) {
    console.log('[pr-size] Javaslat: bontsd a változást kisebb, önállóan reviewolható szeletekre (TECH-053).');
    if (strict) process.exit(1);
  }
  process.exit(0);
} catch (e) {
  console.log(`[pr-size] Kihagyva (git-hiba): ${e.message.split('\n')[0]}`);
  process.exit(0);
}
