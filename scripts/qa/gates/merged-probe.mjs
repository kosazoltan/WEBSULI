// Gépi összefésült próba (docs/specs/2026-11-19-kapu-gyorsitas.md A; C-61): egy ideiglenes, leválasztott munkafában a megadott fej
// + a friss main összefésült állapotán az összes őr-teszt és a PR által érintett node-os tesztek. A push-kapu (`head: 'HEAD'`) és
// a merge-kapu (`head: <PR feje>`) ugyanezt hívja. Fail-closed: ütközés, piros teszt, futtathatatlanság → FAIL.

import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { STATUS, writeLog } from './lib.mjs';
import { listFiles } from './stage-gate.mjs';

/**
 * A PR fájljaiból a próbában futtatandó tesztek: a `source/tests/` közvetlen `*.test.ts` egységtesztjei (az őr-teszt mindig fut; az
 * integrációs, a böngészős és az alkönyvtári teszt nem — azok a CI dolgai) és a `scripts/qa` alatti `*.test.mjs`. Csak az összefésült
 * fában létező fájl (a törölt kimarad).
 */
export function selectProbeTests(files, exists) {
  const unit = [];
  const qa = [];
  for (const f of files ?? []) {
    if (!exists(f)) continue;
    if (/^source\/tests\/[^/]+\.test\.ts$/.test(f) && !/-guard\.test\.ts$/.test(f)) unit.push(f.replace(/^source\//, ''));
    else if (/^scripts\/qa\/.+\.test\.mjs$/.test(f)) qa.push(f);
  }
  return { unit, qa };
}

/** A node:test TAP-kimenetének UTOLSÓ összesítője: `{ tests, pass, fail }`, vagy null. */
export function tapCounts(out) {
  const s = String(out ?? '');
  const last = (re) => { const all = [...s.matchAll(re)]; return all.length ? Number(all[all.length - 1][1]) : null; };
  const pass = last(/^# pass (\d+)/gm);
  const fail = last(/^# fail (\d+)/gm);
  if (pass == null && fail == null) return null;
  return { tests: last(/^# tests (\d+)/gm), pass, fail };
}

/**
 * Az összefésült próba. @returns {Promise<{ status, note, detail?, tree?, counts?, ms }>}
 * @param {object} ctx makeContext()-ből: exec, git, src, node, evDir
 * @param {{ head?: string, base: string, files?: string[], label?: string }} opts
 */
export async function mergedProbe(ctx, { head = 'HEAD', base, files = [], label = 'merged-probe' }) {
  const { exec, git, src, node } = ctx;
  const t0 = Date.now();
  const done = (r) => ({ ...r, ms: Date.now() - t0 });
  // A munkafák szokásos, gitignore-olt helyén (a fő checkout .claude/worktrees/ mappájában), NEM az os.tmpdir() alatt: ott a
  // Windows 8.3-as rövid útja (`KSAZOL~1`) a `new URL(...).pathname`-t használó őr-segédeket (%7E) elrontotta (mérve 2026-11-17).
  const common = git.commonDir();
  const parent = basename(common) === '.git' ? join(dirname(common), '.claude', 'worktrees') : tmpdir();
  mkdirSync(parent, { recursive: true });
  const tmp = mkdtempSync(join(parent, '_gate-merge-'));
  const link = join(tmp, 'source', 'node_modules');
  const cleanup = () => {
    // Előbb a csomópont-hivatkozás (soha nem rekurzív törlés rajta át!), aztán a munkafa. A fő munkafában semmit nem abortálunk.
    const linkGone = () => !lstatSync(link, { throwIfNoEntry: false });
    try { if (!linkGone()) unlinkSync(link); } catch { /* lent kezelve */ }
    if (!linkGone()) {
      process.stderr.write(`[${label}] FIGYELEM: a csomópont-hivatkozás nem törölhető, az ideiglenes munkafa megmarad: ${tmp}\n`);
      return;
    }
    git.run(['worktree', 'remove', '--force', tmp]);
    if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
    git.run(['worktree', 'prune']);
  };
  // Review J11: Ctrl-C / SIGTERM esetén is takarítson (különben a csomópont-hivatkozás ottmarad egy későbbi rekurzív törlés útjában).
  const onSignal = (sig) => { cleanup(); process.exit(sig === 'SIGINT' ? 130 : 143); };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    const add = git.run(['worktree', 'add', '--detach', tmp, head]);
    if (add.code !== 0) return done({ status: STATUS.FAIL, note: 'ideiglenes munkafa nem jött létre', detail: add.stderr });
    const m = exec('git', ['-c', 'user.name=gate', '-c', 'user.email=gate@pelda.hu', 'merge', '--no-commit', '--no-ff', base], { cwd: tmp });
    if (m.code !== 0) {
      exec('git', ['merge', '--abort'], { cwd: tmp });
      return done({ status: STATUS.FAIL, note: `a ${base} beolvasztása ütközik — olvaszd be a maint (git merge ${base}), oldd fel, és futtasd újra`, detail: `${m.stdout}\n${m.stderr}` });
    }
    const wt = exec('git', ['write-tree'], { cwd: tmp });
    const tree = wt.code === 0 ? wt.stdout.trim() : null;
    if (!tree) return done({ status: STATUS.FAIL, note: 'az összefésült fa azonosítója nem állapítható meg', detail: wt.stderr });
    symlinkSync(join(src, 'node_modules'), link, 'junction');
    const guards = listFiles(join(tmp, 'source', 'tests'), /-guard\.test\.ts$/).map((f) => `tests/${f}`);
    const sel = selectProbeTests(files, (p) => existsSync(join(tmp, p)));
    const r = exec(node, ['--import', 'tsx', '--test', '--test-reporter=tap', ...guards, ...sel.unit], { cwd: join(tmp, 'source') });
    let out = `${r.stdout}\n${r.stderr}`;
    let counts = tapCounts(r.stdout) ?? { tests: null, pass: null, fail: null };
    let code = r.code;
    if (code === 0 && sel.qa.length) {
      const q = exec(node, ['--test', '--test-reporter=tap', ...sel.qa], { cwd: tmp });
      out += `\n${q.stdout}\n${q.stderr}`;
      const qc = tapCounts(q.stdout) ?? { tests: null, pass: null, fail: null };
      counts = { tests: (counts.tests ?? 0) + (qc.tests ?? 0), pass: (counts.pass ?? 0) + (qc.pass ?? 0), fail: (counts.fail ?? 0) + (qc.fail ?? 0) };
      code = q.code;
    }
    writeLog(ctx.evDir, label, 'merged-probe', out);
    const what = `${guards.length} őr-teszt + ${sel.unit.length} egységteszt-fájl + ${sel.qa.length} scripts/qa tesztfájl`;
    if (code !== 0) return done({ status: STATUS.FAIL, note: `az összefésült állapoton (${head.slice(0, 12)} + ${base}) bukik egy teszt (${what}) — olvaszd be a maint és javítsd (C-61)`, detail: out, tree, counts });
    if (!counts.pass) return done({ status: STATUS.FAIL, note: `az összefésült próba nem futtatott tesztet (${what}) — nem értékelhető`, detail: out, tree, counts });
    return done({ status: STATUS.PASS, note: `${what} az összefésült állapoton zöld (${counts.pass} teszt, fa ${tree.slice(0, 12)})`, tree, counts });
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    cleanup();
  }
}
