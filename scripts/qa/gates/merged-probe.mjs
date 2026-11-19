// Gépi összefésült próba (docs/specs/2026-11-19-kapu-gyorsitas.md A; C-61): egy ideiglenes, leválasztott munkafában a megadott fej
// + a friss main összefésült állapotán. A push-kapu (`head: 'HEAD'`), a merge-kapu (`head: <PR feje>`) és a bizonyíték-átvitel
// ugyanezt hívja. Fail-closed: hiányzó node_modules, ütközés, hiányzó / kevesebb tesztet futtató őr, piros teszt, 0 teszt, időtúllépés
// → FAIL.
//
// Hatókör (vak review L2, L4 — tulajdonosi döntés 2026-11-19):
//   (a) MINDEN őr-teszt (`source/tests/*-guard.test.ts`); alsó korlát a main: a mainen létező minden őrnek léteznie és futnia kell, és
//       őr-fájlonként nem futhat kevesebb teszt, mint a mainen;
//   (b) ha a PR VAGY a main elmozdulása `scripts/qa/`, `.github/workflows/`, `.claude/` vagy `.agents/skills/` alatti fájlt érint: a
//       TELJES `scripts/qa` tesztkör + `skills-sync-check` + `three-phase-check` (ha a mainen léteznek); különben a PR által módosított
//       `scripts/qa` tesztfájlok;
//   (c) ha a PR és a main elmozdulása egyaránt érinti a `source/`-t: a TELJES egységteszt-kör (`tests/*.test.ts`); különben a PR által
//       módosított `source/tests/*.test.ts`.
// A tesztfolyamat szűrt környezettel fut (vak review L3): kulcs / token / adatbázis-cím nem jut át.

import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { STATUS, writeLog } from './lib.mjs';
import { listFiles } from './stage-gate.mjs';

export const PROBE_TIMEOUT_MS = 10 * 60_000;
export const QA_SCOPE = /^(?:scripts\/qa\/|\.github\/workflows\/|\.claude\/|\.agents\/skills\/)/;

/**
 * A tesztfolyamat környezete: engedőlista (PATH, rendszerváltozók, ideiglenes mappa, saját mappa, NODE_*, CI-jelzők); a titok-gyanús
 * nevek (KEY / TOKEN / SECRET / PASSWORD / CREDENTIAL / DATABASE_URL) az engedőlistás előtag mellett sem.
 */
export function probeEnv(src = process.env) {
  const allow = /^(?:PATH|PATHEXT|SYSTEMROOT|SYSTEMDRIVE|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|HOME|USERPROFILE|HOMEDRIVE|HOMEPATH|APPDATA|LOCALAPPDATA|PROGRAMDATA|PROGRAMFILES|PROGRAMFILES\(X86\)|NUMBER_OF_PROCESSORS|PROCESSOR_ARCHITECTURE|OS|LANG|LC_[A-Z]+|TZ|CI|GITHUB_ACTIONS|NODE_[A-Z0-9_]+)$/i;
  const secret = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|DATABASE_URL/i;
  // a szülő tesztfuttató változói (NODE_TEST_CONTEXT: a gyerek `node --test` különben nem TAP-ot ír, hanem a szülőnek jelent)
  const parentRunner = /^NODE_(?:TEST_|CHANNEL_|UNIQUE_ID)/i;
  const out = {};
  for (const [k, v] of Object.entries(src)) if (allow.test(k) && !secret.test(k) && !parentRunner.test(k)) out[k] = v;
  return out;
}

/** A próba hatóköre a PR és a main elmozdulásának fájllistájából (tiszta függvény, lásd a fejléc (b), (c) pontját). */
export function probeScope({ prFiles = [], mainFiles = [] }) {
  const all = [...prFiles, ...mainFiles];
  const qaFull = all.some((f) => QA_SCOPE.test(f));
  const unitFull = prFiles.some((f) => f.startsWith('source/')) && mainFiles.some((f) => f.startsWith('source/'));
  return { qaFull, unitFull };
}

/**
 * A PR által MÓDOSÍTOTT tesztfájlok (a szűkített hatókörhöz): a `source/tests/` közvetlen `*.test.ts` egységtesztjei (az őr mindig
 * fut; integrációs, böngészős, alkönyvtári teszt nem) és a `scripts/qa` alatti `*.test.mjs`. Csak az összefésült fában létező fájl.
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

/**
 * A node:test kimenetének UTOLSÓ összesítője (TAP: `# pass N`; JUnit: `<!-- pass N -->`): `{ tests, pass, fail }`, vagy null.
 */
export function tapCounts(out) {
  const s = String(out ?? '');
  const last = (k) => { const all = [...s.matchAll(new RegExp(`^\\s*(?:#|<!--) ${k} (\\d+)`, 'gm'))]; return all.length ? Number(all[all.length - 1][1]) : null; };
  const pass = last('pass');
  const fail = last('fail');
  if (pass == null && fail == null) return null;
  return { tests: last('tests'), pass, fail };
}

/**
 * A lefutott tesztek fájlonként a node:test JUnit-kimenetéből (`<testcase … file="…">`; a TAP a sikeres tesztnél nem ír helyet):
 * `{ '<fájlnév>': darab }`.
 */
export function tapCountsByFile(out) {
  const by = {};
  for (const m of junitCases(out)) {
    if (m.pseudo) continue;
    by[m.file] = (by[m.file] ?? 0) + 1;
  }
  return by;
}

/**
 * A JUnit `<testcase>` elemei. `pseudo`: a teszt nélküli fájl helyett a node:test egy, a fájl nevét viselő „tesztet” ír (mérve,
 * Node 24) — ez NEM lefutott teszt (vak review L6: „0 teszt → FAIL”).
 */
export function junitCases(out) {
  const cases = [];
  for (const m of String(out ?? '').matchAll(/<testcase\b([^>]*?)(\/?)>/g)) {
    const attr = (k) => new RegExp(`\\b${k}="([^"]*)"`).exec(m[1])?.[1] ?? null;
    const path = attr('file');
    if (path == null) continue;
    const file = basename(path.replace(/\\/g, '/'));
    // az álteszt neve a futtatónak átadott (relatív) út, pl. `tests\e-guard.test.ts`
    const name = attr('name');
    cases.push({ file, name, pseudo: name != null && basename(name.replace(/\\/g, '/')) === file, passed: m[2] === '/' });
  }
  return cases;
}

/** Az őrök alsó korlátja a main szerint: hiányzó őr, vagy fájlonként kevesebb lefutott teszt → a hibák listája. */
export function guardShortfall(mainGuards, mainCounts, mergedGuards, mergedCounts) {
  const problems = [];
  for (const g of mainGuards) {
    const f = basename(g);
    if (!mergedGuards.some((x) => basename(x) === f)) { problems.push(`${f}: a mainen létező őr hiányzik az összefésült állapotból — őr törléséhez új CI + tulajdonosi döntés kell`); continue; }
    if ((mergedCounts[f] ?? 0) < (mainCounts[f] ?? 0)) problems.push(`${f}: ${mergedCounts[f] ?? 0} teszt futott, a mainen ${mainCounts[f]} — kiüresített / szűkített őr`);
  }
  return problems;
}

/**
 * Az összefésült próba. @returns {Promise<{ status, note, detail?, tree?, counts?, scope?, ms }>}
 * @param {object} ctx makeContext()-ből: exec, git, src, node, evDir
 * @param {{ head?: string, base: string, label?: string, timeoutMs?: number, env?: object }} opts
 */
export async function mergedProbe(ctx, { head = 'HEAD', base, label = 'merged-probe', timeoutMs = PROBE_TIMEOUT_MS, env = probeEnv() }) {
  const { exec, git, src, node } = ctx;
  const t0 = Date.now();
  const done = (r) => ({ ...r, ms: Date.now() - t0 });
  const left = () => Math.max(1_000, timeoutMs - (Date.now() - t0));
  const hr = git.run(['rev-parse', '--verify', '--quiet', `${head}^{commit}`]);
  const headSha = hr.code === 0 ? hr.stdout.trim() : null;
  if (!headSha) return done({ status: STATUS.FAIL, note: `a fej (${head}) nem oldható fel` });
  if (!existsSync(join(src, 'node_modules'))) return done({ status: STATUS.FAIL, note: 'nincs source/node_modules a futtató munkafában — előbb `npm.cmd ci` (a próba nem futtatható)' });
  // A munkafák szokásos, gitignore-olt helyén (a fő checkout .claude/worktrees/ mappájában), NEM az os.tmpdir() alatt: ott a
  // Windows 8.3-as rövid útja (`KSAZOL~1`) a `new URL(...).pathname`-t használó őr-segédeket (%7E) elrontotta (mérve 2026-11-17).
  const common = git.commonDir();
  const parent = basename(common) === '.git' ? join(dirname(common), '.claude', 'worktrees') : tmpdir();
  mkdirSync(parent, { recursive: true });
  const tmp = mkdtempSync(join(parent, '_gate-merge-'));
  const link = join(tmp, 'source', 'node_modules');
  const unlink = () => { try { if (lstatSync(link, { throwIfNoEntry: false })) unlinkSync(link); } catch { /* lent kezelve */ } };
  const cleanup = () => {
    // Előbb a csomópont-hivatkozás (soha nem rekurzív törlés rajta át!), aztán a munkafa. A fő munkafában semmit nem abortálunk.
    unlink();
    if (lstatSync(link, { throwIfNoEntry: false })) {
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
  const run = (cmd, args, cwd) => exec(cmd, args, { cwd, env, timeoutMs: left() });
  const g = (args) => exec('git', args, { cwd: tmp });
  let log = '';
  try {
    const add = git.run(['worktree', 'add', '--detach', tmp, base]);
    if (add.code !== 0) return done({ status: STATUS.FAIL, note: 'ideiglenes munkafa nem jött létre', detail: add.stderr });
    if (!existsSync(join(tmp, 'source'))) return done({ status: STATUS.FAIL, note: 'az összefésült fában nincs source/ mappa — a próba nem futtatható' });
    symlinkSync(join(src, 'node_modules'), link, 'junction');
    // 1) Az őrök a MAIN-en: az alsó korlát (lista + fájlonkénti darabszám).
    const mainGuards = listFiles(join(tmp, 'source', 'tests'), /-guard\.test\.ts$/).map((f) => `tests/${f}`);
    let mainCounts = {};
    if (mainGuards.length) {
      const mg = run(node, ['--import', 'tsx', '--test', '--test-reporter=junit', ...mainGuards], join(tmp, 'source'));
      log += `== main őrök ==\n${mg.stdout}\n${mg.stderr}\n`;
      mainCounts = tapCountsByFile(mg.stdout);
    }
    // 2) A fej + a main összefésülése.
    unlink();
    const co = g(['checkout', '-q', '--detach', headSha]);
    if (co.code !== 0) return done({ status: STATUS.FAIL, note: `a fej (${head}) nem tölthető be`, detail: co.stderr });
    const m = exec('git', ['-c', 'user.name=gate', '-c', 'user.email=gate@pelda.hu', 'merge', '--no-commit', '--no-ff', base], { cwd: tmp });
    if (m.code !== 0) {
      g(['merge', '--abort']);
      return done({ status: STATUS.FAIL, note: `a ${base} beolvasztása ütközik — olvaszd be a maint (git merge ${base}), oldd fel, és futtasd újra`, detail: `${m.stdout}\n${m.stderr}` });
    }
    const wt = g(['write-tree']);
    const tree = wt.code === 0 ? wt.stdout.trim() : null;
    if (!tree) return done({ status: STATUS.FAIL, note: 'az összefésült fa azonosítója nem állapítható meg', detail: wt.stderr });
    if (!existsSync(join(tmp, 'source'))) return done({ status: STATUS.FAIL, note: 'az összefésült fában nincs source/ mappa — a próba nem futtatható', tree });
    symlinkSync(join(src, 'node_modules'), link, 'junction');
    // a main sha-ja a munkafából (ha a fej már tartalmazza, nincs MERGE_HEAD)
    const baseSha = g(['rev-parse', `${base}^{commit}`]).stdout.trim();
    const mb = g(['merge-base', 'HEAD', baseSha]).stdout.trim();
    const names = (a, z) => g(['-c', 'core.quotePath=false', 'diff', '--name-only', a, z]).stdout.split('\n').map((s) => s.trim()).filter(Boolean);
    const prFiles = names(mb, 'HEAD');
    const mainFiles = names(mb, baseSha);
    const scope = probeScope({ prFiles, mainFiles });
    const exists = (p) => existsSync(join(tmp, p));
    const sel = selectProbeTests(prFiles, exists);
    // 3) Őrök az összefésült fán + az egységtesztek (teljes kör vagy a PR által módosítottak).
    const guards = listFiles(join(tmp, 'source', 'tests'), /-guard\.test\.ts$/).map((f) => `tests/${f}`);
    if (!guards.length) return done({ status: STATUS.FAIL, note: 'az összefésült fában nincs egyetlen őr-teszt sem — nem értékelhető', tree, scope });
    const unit = scope.unitFull
      ? listFiles(join(tmp, 'source', 'tests'), /\.test\.ts$/).filter((f) => !/-guard\.test\.ts$/.test(f)).map((f) => `tests/${f}`)
      : sel.unit;
    const r = run(node, ['--import', 'tsx', '--test', '--test-reporter=junit', ...guards, ...unit], join(tmp, 'source'));
    log += `== összefésült: őrök + egységtesztek ==\n${r.stdout}\n${r.stderr}\n`;
    const counts = tapCounts(r.stdout) ?? { tests: 0, pass: 0, fail: 0 };
    // a teszt nélküli fájl álteszte nem számít lefutott tesztnek (L6)
    const pseudo = junitCases(r.stdout).filter((c) => c.pseudo && c.passed).length;
    counts.pass = Math.max(0, (counts.pass ?? 0) - pseudo);
    counts.tests = Math.max(0, (counts.tests ?? 0) - pseudo);
    const addCounts = (c) => { if (!c) return; counts.tests = (counts.tests ?? 0) + (c.tests ?? 0); counts.pass = (counts.pass ?? 0) + (c.pass ?? 0); counts.fail = (counts.fail ?? 0) + (c.fail ?? 0); };
    const short = guardShortfall(mainGuards, mainCounts, guards, tapCountsByFile(r.stdout));
    const what = `${guards.length} őr + ${scope.unitFull ? `teljes egységteszt-kör (${unit.length} fájl)` : `${unit.length} PR-egységteszt`} + ${scope.qaFull ? 'teljes scripts/qa kör' : `${sel.qa.length} PR scripts/qa teszt`}`;
    const fail = (note) => { writeLog(ctx.evDir, label, 'merged-probe', log); return done({ status: STATUS.FAIL, note, detail: log, tree, counts, scope }); };
    if (r.code !== 0) return fail(`az összefésült állapoton (${headSha.slice(0, 12)} + ${base}) bukik egy teszt vagy lejárt az időkorlát (${what}) — olvaszd be a maint és javítsd (C-61)`);
    if (short.length) return fail(`az őrök alsó korlátja (a main) sérül: ${short.join('; ')}`);
    // 4) scripts/qa: teljes kör + a két CI-lépés, vagy a PR által módosított tesztfájlok.
    const qa = scope.qaFull
      ? ['', 'gates', 'hooks'].flatMap((sub) => listFiles(join(tmp, 'scripts', 'qa', sub), /\.test\.mjs$/).map((f) => `scripts/qa/${sub ? `${sub}/` : ''}${f}`))
      : sel.qa;
    if (qa.length) {
      const q = run(node, ['--test', '--test-reporter=tap', ...qa], tmp);
      log += `== scripts/qa ==\n${q.stdout}\n${q.stderr}\n`;
      addCounts(tapCounts(q.stdout));
      if (q.code !== 0) return fail(`az összefésült állapoton bukik egy scripts/qa teszt (${what})`);
    }
    if (scope.qaFull) {
      for (const [script, args] of [['scripts/qa/gates/skills-sync-check.mjs', []], ['scripts/qa/three-phase-check.mjs', ['--base', base]]]) {
        if (!exists(script)) continue;
        const s = run(node, [script, ...args], tmp);
        log += `== ${script} ==\n${s.stdout}\n${s.stderr}\n`;
        if (s.code !== 0) return fail(`az összefésült állapoton bukik: ${script}`);
      }
    }
    writeLog(ctx.evDir, label, 'merged-probe', log);
    if (!counts.pass) return done({ status: STATUS.FAIL, note: `az összefésült próba nem futtatott tesztet (${what}) — nem értékelhető`, detail: log, tree, counts, scope });
    return done({ status: STATUS.PASS, note: `${what} az összefésült állapoton zöld (${counts.pass} teszt, fa ${tree.slice(0, 12)})`, tree, counts, scope });
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    cleanup();
  }
}
