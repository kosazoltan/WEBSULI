#!/usr/bin/env node
// Háromfázisú rend CI-ellenőrzése (docs/specs/2026-10-15-haromfazis-ci-ellenorzes.md; tulajdonosi döntés 2026-10-15).
// Terv → végrehajtási utasítás → kód: érdemi kódváltozás csak akkor, ha a PR-ben van végrehajtási utasítás, az létező tervre hivatkozik,
// és a kód nem korábbi commitban készült, mint a végrehajtási utasítás. Az utasítás tartalmát és a tervet az ELSŐ KÓDCOMMIT állapotán igazolja
// (review #236). Egysoros, egyfájlos javítás kivétel (figyelmeztetéssel; docs/agent-haromfazisu-munka.md).
//
// Használat: node scripts/qa/three-phase-check.mjs [--base origin/main]

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CODE = /^source\/(server|shared|client\/src)\//;
const EXEC = /^docs\/specs\/[^/]+-vegrehajtas\.md$/;

export const isCode = (path) => CODE.test(path) && !/\.test\.[cm]?[jt]sx?$/.test(path);

/**
 * Tiszta döntés: a diff-fájlok, az időrendi commitok és a commit-állapot szerinti fájlolvasás alapján (`readFileAt(path, sha)`,
 * `existsAt(path, sha)`; `sha = null` → HEAD).
 */
export function decideThreePhase({ files, commits, readFileAt, existsAt }) {
  const code = files.filter((f) => isCode(f.path));
  if (!code.length) return { ok: true, reason: 'Nincs kódváltozás (dokumentum, teszt, szkript vagy workflow).' };
  const lines = code.reduce((n, f) => n + (f.added || 0) + (f.deleted || 0), 0);
  // Review #236 (P1): a szabály „egy soros, egy fájlos” kivétele — legfeljebb 1 hozzáadott és 1 törölt sor.
  if (code.length === 1 && (code[0].added || 0) <= 1 && (code[0].deleted || 0) <= 1) {
    return { ok: true, reason: `Egysoros javítás (${code[0].path}).`, warning: 'A kis javítás terve a commit-üzenetben / a chatben legyen (docs/agent-haromfazisu-munka.md).' };
  }
  const execs = files.map((f) => f.path).filter((p) => EXEC.test(p));
  if (!execs.length) {
    return { ok: false, reason: `Nincs végrehajtási utasítás: ${code.length} kódfájl, ${lines} sor változott, de a PR nem tartalmaz docs/specs/*-vegrehajtas.md fájlt.` };
  }
  // Review #236 (P1): az utasításnak és a tervnek az első kódcommit idején kellett léteznie (egy utólag kitöltött utasítás nem elég).
  const firstCode = commits.findIndex((c) => c.files.some(isCode));
  const at = firstCode >= 0 ? commits[firstCode].sha : null;
  const withPlan = execs.filter((p) => {
    const text = readFileAt(p, at) ?? '';
    const refs = [...text.matchAll(/docs\/specs\/([^\s`)]+?\.md)/g)].map((m) => `docs/specs/${m[1]}`).filter((r) => !EXEC.test(r));
    return refs.some((r) => existsAt(r, at));
  });
  if (!withPlan.length) {
    const when = at ? ` az első kódcommit (${at.slice(0, 7)}) idején` : '';
    return { ok: false, reason: `A végrehajtási utasítás (${execs.join(', ')})${when} nem hivatkozik létező tervfájlra (docs/specs/<név>.md).` };
  }
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
  const readFileAt = (p, sha) => { try { return execFileSync('git', ['show', `${sha ?? 'HEAD'}:${p}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
  const existsAt = (p, sha) => readFileAt(p, sha) !== null;
  const result = decideThreePhase({ files, commits, readFileAt, existsAt });
  if (result.warning) console.log(`[három-fázis] Figyelmeztetés: ${result.warning}`);
  console.log(`[három-fázis] ${result.ok ? 'OK' : 'HIBA'}: ${result.reason}`);
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
