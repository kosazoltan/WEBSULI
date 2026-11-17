#!/usr/bin/env node
// Push előtti kapu (docs/minosegkapuk.md; terv E5, E6, D10). Zöld esetben bizonyítékot ír a fej-commitra
// (`<git-common-dir>/websuli-qa-evidence/pre-push-<fej>.json`), amelyet a `check-quality-gates` hook a `git push` előtt olvas.
//
// Használat: node scripts/qa/gates/pre-push-gate.mjs [--base origin/main] [--slice]
//   --slice  szelet-mód: a közös modulok (gates.config.json sliceSharedPatterns) érintése is figyelmeztet

import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import {
  STATUS, argValue, cmdResult, createGate, isMain, makeContext, writeEvidence, writeLog,
} from './lib.mjs';
import { runLintSteps } from './lint-gate.mjs';
import { listFiles } from './stage-gate.mjs';

export const NATIVE_ARCH_TEST = 'native-arch.test.ts';

/** A TAP-kimenet legfelső szintű bukásai fájlnév szerint (a `location` mezőből; betöltési hibánál a teszt neve a fájl). */
export function parseTapFailures(tap) {
  const lines = String(tap).replace(/\r\n/g, '\n').split('\n');
  const files = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^not ok \d+ - (.*)$/.exec(lines[i]);
    if (!m) continue;
    let file = null;
    for (let j = i + 1; j < lines.length && !/^(?:not )?ok \d+ /.test(lines[j]); j += 1) {
      const loc = /^ {2}location: '(.+?):\d+:\d+'\s*$/.exec(lines[j]);
      if (loc) { file = basename(loc[1].replace(/\\\\/g, '/').replace(/\\/g, '/')); break; }
    }
    if (!file && /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(m[1].trim())) file = basename(m[1].trim().replace(/\\/g, '/'));
    files.add(file ?? `? ${m[1].trim()}`);
  }
  return [...files].sort();
}

/**
 * D10 — ismert helyi kivétel: CSAK a `native-arch.test.ts` bukik ÉS a `doctor:arch` is bukik → KIVÉTEL; minden más FAIL.
 * @returns {{ status: string, note: string }}
 */
export function decideNativeArch({ failures, doctorCode }) {
  if (!failures.length) return { status: STATUS.FAIL, note: 'a tesztfutás bukott, de a bukó teszt nem azonosítható (nézd a naplót)' };
  if (failures.length === 1 && failures[0] === NATIVE_ARCH_TEST) {
    if (doctorCode !== 0) {
      return { status: STATUS.EXCEPTION, note: 'ismert helyi kivétel: native-arch (C-38) — a doctor:arch is bukik (a natív kötés helyben nem épült fel); a CI native-arch jobja x64-en és ARM64-en futtatja' };
    }
    return { status: STATUS.FAIL, note: 'a native-arch teszt bukik, de a doctor:arch zöld — ez NEM az ismert környezeti hiba' };
  }
  return { status: STATUS.FAIL, note: `bukó tesztfájl(ok): ${failures.join(', ')}` };
}

/** Közös / tiltott fájlok érintése (mindig a sharedFiles; szelet-módban a sliceSharedPatterns előtagok is). */
export function sharedTouched(changed, cfg, slice) {
  const hits = changed.filter((f) => (cfg.sharedFiles ?? []).includes(f));
  if (slice) for (const f of changed) if ((cfg.sliceSharedPatterns ?? []).some((p) => f.startsWith(p)) && !hits.includes(f)) hits.push(f);
  return hits;
}

/** A `.audit-ok` jelzőfájlok frissessége (a `check-audit-ok.mjs` szabálya). */
export function auditStatus({ paths, now, maxAgeMinutes, mtimeOf }) {
  const stale = [];
  for (const p of paths) {
    const m = mtimeOf(p);
    if (m == null || (now - m) / 60000 > maxAgeMinutes) stale.push(p);
  }
  return stale;
}

/** A távoli fej CI-állapota a `statusCheckRollup` alapján: 'green' | 'pending' | 'red' | 'none'. */
export function rollupState(rollup) {
  const items = Array.isArray(rollup) ? rollup : [];
  if (!items.length) return 'none';
  const st = items.map((c) => {
    if (c.__typename === 'StatusContext' || c.state) {
      const s = String(c.state ?? '').toUpperCase();
      return s === 'SUCCESS' ? 'ok' : s === 'PENDING' || s === 'EXPECTED' ? 'pending' : 'bad';
    }
    if (String(c.status ?? '').toUpperCase() !== 'COMPLETED') return 'pending';
    const k = String(c.conclusion ?? '').toUpperCase();
    return ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(k) ? 'ok' : 'bad';
  });
  if (st.includes('bad')) return 'red';
  if (st.includes('pending')) return 'pending';
  return 'green';
}

function readAuditCfg(root, cfg) {
  let sentinel = cfg.auditSentinel ?? '.audit-ok';
  let maxAge = cfg.auditMaxAgeMinutes ?? 10;
  const p = join(root, '.agentic-qa-kit.json');
  if (existsSync(p)) {
    try {
      const j = JSON.parse(readFileSync(p, 'utf8'));
      if (j.audit?.sentinel) sentinel = j.audit.sentinel;
      if (j.audit?.maxAgeMinutes) maxAge = j.audit.maxAgeMinutes;
    } catch { /* hibás konfig → alapérték, mint a hookban */ }
  }
  return { sentinel, maxAge };
}

/** C-61: az őr-tesztek a HEAD + friss origin/main összefésült állapotán, ideiglenes leválasztott munkafában. */
async function mergedGuardCheck(ctx) {
  const { exec, git, src, base, node } = ctx;
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
      process.stderr.write(`[pre-push-gate] FIGYELEM: a csomópont-hivatkozás nem törölhető, az ideiglenes munkafa megmarad: ${tmp}\n`);
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
    const add = git.run(['worktree', 'add', '--detach', tmp, 'HEAD']);
    if (add.code !== 0) return { status: STATUS.FAIL, note: 'ideiglenes munkafa nem jött létre', detail: add.stderr };
    const m = exec('git', ['-c', 'user.name=gate', '-c', 'user.email=gate@pelda.hu', 'merge', '--no-commit', '--no-ff', base], { cwd: tmp });
    if (m.code !== 0) {
      exec('git', ['merge', '--abort'], { cwd: tmp });
      return { status: STATUS.FAIL, note: `a ${base} beolvasztása ütközik — olvaszd be a maint (git merge ${base}), oldd fel, és futtasd újra`, detail: `${m.stdout}\n${m.stderr}` };
    }
    symlinkSync(join(src, 'node_modules'), link, 'junction');
    const guards = listFiles(join(tmp, 'source', 'tests'), /-guard\.test\.ts$/).map((f) => `tests/${f}`);
    const r = exec(node, ['--import', 'tsx', '--test', ...guards], { cwd: join(tmp, 'source') });
    writeLog(ctx.evDir, 'pre-push-gate', 'merged-guards', `${r.stdout}\n${r.stderr}`);
    if (r.code !== 0) return { status: STATUS.FAIL, note: `az összefésült állapoton (HEAD + ${base}) bukik egy repó-szintű őr — olvaszd be a maint és javítsd (C-61)`, detail: `${r.stdout}\n${r.stderr}` };
    return { status: STATUS.PASS, note: `${guards.length} őr-teszt az összefésült állapoton zöld` };
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    cleanup();
  }
}

/** A push előtti kapu lépései (a PR előtti kapu is ezt hívja). */
export async function runPrePushSteps({ gate, ctx, slice = false }) {
  const { exec, git, root, src, base, cfg, node } = ctx;

  await gate.step('tiszta munkafa (nincs commitolatlan és nem követett fájl)', () => {
    const d = git.trackedDirty();
    // Review J7: a nem követett fájl a helyi tsc-t / tesztet zöldre viheti, miközben a commitban nincs benne → csak a CI bukna.
    const u = git.untracked();
    if (!d.length && !u.length) return { status: STATUS.PASS };
    return {
      status: STATUS.FAIL,
      note: `${d.length ? 'commitolatlan változás' : ''}${d.length && u.length ? ' + ' : ''}${u.length ? 'nem követett fájl (git add, .gitignore, vagy a scratchpadba vele)' : ''} — a bizonyíték a fej-commitra szól`,
      detail: [...d, ...u.map((f) => `?? ${f}`)].join('\n'),
    };
  });

  await gate.step(`git fetch (${base})`, () => {
    const remote = base.split('/')[0];
    const r = git.run(['fetch', remote, '--quiet']);
    return r.code === 0 ? { status: STATUS.PASS } : { status: STATUS.FAIL, note: 'a fetch nem sikerült (hálózat?) — friss main nélkül nem igazolható', detail: r.stderr };
  });

  const { changed } = await runLintSteps({ gate, ctx, mode: 'full' });

  await gate.step('teljes egységteszt (npm test)', () => {
    if (!existsSync(join(src, 'node_modules'))) return { status: STATUS.FAIL, note: 'nincs source/node_modules' };
    const r = exec(node, ['--import', 'tsx', '--test', '--test-reporter=tap', 'tests/*.test.ts'], { cwd: src, timeoutMs: 40 * 60_000 });
    writeLog(ctx.evDir, 'pre-push-gate', 'npm-test', `${r.stdout}\n${r.stderr}`);
    const total = /^# tests (\d+)/m.exec(r.stdout)?.[1];
    if (r.code === 0) return { status: STATUS.PASS, note: total ? `${total} teszt` : '' };
    const failures = parseTapFailures(r.stdout);
    let doctorCode = 0;
    if (failures.length === 1 && failures[0] === NATIVE_ARCH_TEST) doctorCode = exec('npm', ['run', 'doctor:arch'], { cwd: src }).code;
    const d = decideNativeArch({ failures, doctorCode });
    return { ...d, detail: d.status === STATUS.FAIL ? `${r.stdout}\n${r.stderr}` : '' };
  });

  if (changed.some((f) => f.startsWith('scripts/qa/'))) {
    // Review J13: a scripts/qa saját tesztjei a push előtt is (a CI „Háromfázisú rend” jobja futtatja őket).
    await gate.step('scripts/qa saját tesztjei', () => {
      const files = ['', 'gates', 'hooks'].flatMap((sub) => listFiles(join(root, 'scripts', 'qa', sub), /\.test\.mjs$/).map((f) => `scripts/qa/${sub ? `${sub}/` : ''}${f}`));
      const r = exec(node, ['--test', ...files], { cwd: root });
      writeLog(ctx.evDir, 'pre-push-gate', 'qa-tests', `${r.stdout}\n${r.stderr}`);
      return cmdResult(r, `${files.length} fájl`);
    });
  }

  await gate.step('háromfázisú rend (three-phase-check)', () => cmdResult(exec(node, [join(root, 'scripts/qa/three-phase-check.mjs'), '--base', base], { cwd: root })));

  await gate.step('PR-méret (pr-size-check)', () => {
    const r = exec(node, [join(root, 'scripts/qa/pr-size-check.mjs'), '--base', base], { cwd: root });
    const line = r.stdout.split('\n').find((l) => l.includes('[pr-size]')) ?? '';
    if (r.code !== 0) return cmdResult(r);
    return /FIGYELMEZTETÉS|TÚLLÉPÉS/.test(r.stdout)
      ? { status: STATUS.WARN, note: `${line.replace(/^\[pr-size\]\s*/, '')} — bontsd szeletekre, vagy indokold a PR-ban` }
      : { status: STATUS.PASS, note: line.replace(/^\[pr-size\]\s*/, '') };
  });

  await gate.step(`friss ${base} beolvasztva (C-61)`, async () => {
    const r = git.run(['merge-base', '--is-ancestor', base, 'HEAD']);
    if (r.code === 0) return { status: STATUS.PASS, note: 'a friss main a HEAD őse' };
    const merged = await mergedGuardCheck(ctx);
    if (merged.status === STATUS.PASS) return { status: STATUS.WARN, note: `a ${base} nincs beolvasztva (git merge ${base} ajánlott); ${merged.note}` };
    return merged;
  });

  await gate.step('közös / tiltott fájlok érintése', () => {
    const hits = sharedTouched(changed, cfg, slice);
    return hits.length
      ? { status: STATUS.WARN, note: `${hits.length} közös fájl — csak a feladat kifejezett része lehet (párhuzamos szeletek ütközése)`, detail: hits.join('\n') }
      : { status: STATUS.PASS };
  });

  await gate.step('.audit-ok frissessége', () => {
    const { sentinel, maxAge } = readAuditCfg(root, cfg);
    const common = git.commonDir();
    const mainRoot = basename(common) === '.git' ? dirname(common) : null;
    const paths = [join(root, sentinel)];
    if (mainRoot && mainRoot.replace(/\\/g, '/').toLowerCase() !== root.replace(/\\/g, '/').toLowerCase()) paths.push(join(mainRoot, sentinel));
    const stale = auditStatus({ paths, now: Date.now(), maxAgeMinutes: maxAge, mtimeOf: (p) => (existsSync(p) ? statSync(p).mtimeMs : null) });
    return stale.length
      ? { status: STATUS.WARN, note: `közvetlenül a push előtt, KÜLÖN parancsban frissítsd (a check-audit-ok hook ${maxAge} percet enged): ${stale.map((p) => `touch "${p.replace(/\\/g, '/')}"`).join(' && ')}` }
      : { status: STATUS.PASS, note: `friss (≤ ${maxAge} perc)` };
  });

  await gate.step('zöld CI utáni push (C-62)', () => {
    const v = exec('gh', ['--version'], { cwd: root, timeoutMs: 15_000 });
    if (v.code !== 0) return { status: STATUS.SKIP, note: 'a gh nem érhető el — kihagyva' };
    const br = git.branch();
    const l = exec('gh', ['pr', 'list', '--head', br, '--state', 'open', '--json', 'number,headRefOid', '--limit', '1'], { cwd: root, timeoutMs: 30_000 });
    if (l.code !== 0) return { status: STATUS.SKIP, note: 'a gh pr list nem sikerült — kihagyva' };
    const prs = JSON.parse(l.stdout || '[]');
    if (!prs.length) return { status: STATUS.PASS, note: 'nincs nyitott PR ehhez az ághoz' };
    const v2 = exec('gh', ['pr', 'view', String(prs[0].number), '--json', 'statusCheckRollup,headRefOid'], { cwd: root, timeoutMs: 30_000 });
    if (v2.code !== 0) return { status: STATUS.SKIP, note: 'a PR CI-állapota nem olvasható — kihagyva' };
    const j = JSON.parse(v2.stdout);
    const state = rollupState(j.statusCheckRollup);
    if (state === 'green') return { status: STATUS.WARN, note: `A #${prs[0].number} TÁVOLI FEJÉNEK CI-JA ZÖLD — EZ A PUSH ÚJRAINDÍTJA AZ ~1 ÓRÁS PLAYWRIGHT E2E-T (C-62). CSAK VALÓDI JAVÍTÁSÉRT, EGY PUSHBAN.` };
    if (state === 'pending') return { status: STATUS.WARN, note: `a #${prs[0].number} CI-ja még fut — a push újraindítja; a javításokat egy pushban küldd` };
    return { status: STATUS.PASS, note: `#${prs[0].number}: a távoli fej CI-ja ${state === 'red' ? 'piros — a javító push indokolt' : 'még nem futott'}` };
  });

  return { changed };
}

export function evidenceRecord(kind, head, gate, extra = {}) {
  return {
    kind, head, ok: !gate.failed(), at: new Date().toISOString(),
    steps: gate.results.map((r) => ({ name: r.name, status: r.status })), ...extra,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const ctx = makeContext({ base: argValue(args, '--base') });
  const gate = createGate('pre-push-gate');
  const head = ctx.git.head();
  await runPrePushSteps({ gate, ctx, slice: args.includes('--slice') });
  const code = gate.finish();
  const p = writeEvidence(ctx.evDir, `pre-push-${head}`, evidenceRecord('pre-push', head, gate));
  gate.log(`[pre-push-gate] bizonyíték: ${p.replace(/\\/g, '/')} (ok=${code === 0})`);
  process.exit(code);
}

if (isMain(import.meta.url)) main();
