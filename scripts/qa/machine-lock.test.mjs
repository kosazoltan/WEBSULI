// Gépi zár tesztjei (docs/specs/2026-11-19-gepi-zar.md, A1–A13). Valódi `node` gyerekfolyamatokkal, ideiglenes zár-mappában;
// a gyerekek környezetéből a CI- és a zár-változók törölve, rövid lekérdezési idővel.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  decideReentry, isCiEnv, isStaleEntry, isStaleOwner, pidAlive, readStatus, relaunchUnderMachineLock, resolveLockDir, run,
} from './machine-lock.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'machine-lock.mjs');
const NODE = process.execPath;
const IS_WIN = process.platform === 'win32';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freshDir() {
  return mkdtempSync(join(tmpdir(), 'websuli-gepzar-'));
}

function baseEnv(lockDir, extra = {}) {
  const env = { ...process.env };
  for (const k of ['CI', 'GITHUB_ACTIONS', 'WEBSULI_MACHINE_LOCK_HELD', 'WEBSULI_MACHINE_LOCK_GRACE_MIN']) delete env[k];
  return { ...env, WEBSULI_MACHINE_LOCK_DIR: lockDir, WEBSULI_MACHINE_LOCK_POLL_MS: '50', ...extra };
}

/** Gyerek-szkript: a naplóba ír kezdés / vég jelet, közben vár. */
function worker(log, label, ms) {
  return `const fs=require('fs');fs.appendFileSync(${JSON.stringify(log)},'start ${label}\\n');setTimeout(()=>{fs.appendFileSync(${JSON.stringify(log)},'end ${label}\\n')},${ms});`;
}

function startCli(args, env) {
  const child = spawn(NODE, [SCRIPT, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const done = new Promise((resolve) => child.on('close', (code) => resolve({ code, out })));
  return { child, done };
}

function runCli(args, env) {
  const r = spawnSync(NODE, [SCRIPT, ...args], { env, encoding: 'utf8', windowsHide: true, timeout: 60_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

async function waitFor(pred, what, ms = 15_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (pred()) return;
    await sleep(25);
  }
  throw new Error(`nem teljesült ${ms} ms alatt: ${what}`);
}

const ownerFile = (dir) => join(dir, 'lock', 'owner.json');
const queueEntries = (dir) => (existsSync(join(dir, 'queue')) ? readdirSync(join(dir, 'queue')).filter((f) => f.endsWith('.json')) : []);
const deadPid = () => {
  const r = spawnSync(NODE, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
  return Number(r.stdout);
};

// ---- Tiszta függvények -----------------------------------------------------------------------------------------------

test('isCiEnv: üres / false / 0 nem CI, minden más igen', () => {
  assert.equal(isCiEnv({}), false);
  assert.equal(isCiEnv({ CI: '' }), false);
  assert.equal(isCiEnv({ CI: 'false' }), false);
  assert.equal(isCiEnv({ CI: 'FALSE' }), false);
  assert.equal(isCiEnv({ CI: '0' }), false);
  assert.equal(isCiEnv({ CI: 'true' }), true);
  assert.equal(isCiEnv({ CI: '1' }), true);
});

test('resolveLockDir: a változó elsőbbsége, különben <git-common-dir>/websuli-machine-lock', () => {
  const base = freshDir();
  assert.equal(resolveLockDir({ env: { WEBSULI_MACHINE_LOCK_DIR: join(base, 'z') } }), join(base, 'z'));
  assert.equal(resolveLockDir({ env: {}, gitCwd: base, gitCommonDir: () => '.git' }), join(base, '.git', 'websuli-machine-lock'));
  assert.equal(resolveLockDir({ env: {}, gitCwd: base, gitCommonDir: () => join(base, 'k') }), join(base, 'k', 'websuli-machine-lock'));
  assert.equal(resolveLockDir({ env: {}, gitCwd: base, gitCommonDir: () => null }), null);
});

test('resolveLockDir: alapértelmezés a valódi repóban a közös git-könyvtár', () => {
  const r = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd: dirname(SCRIPT), encoding: 'utf8' });
  const got = resolveLockDir({ env: {} });
  assert.equal(got, join(resolve(dirname(SCRIPT), r.stdout.trim()), 'websuli-machine-lock'));
});

test('isStaleOwner: halott PID (ugyanazon a gépen) elavult; élő gazda / élő gyerek / más gép nem', () => {
  const now = Date.parse('2026-11-19T12:00:00Z');
  const owner = { pid: 11, childPid: 12, host: 'gep', startedUtc: '2026-11-19T11:30:00.000Z', timeoutMin: 60 };
  assert.equal(isStaleOwner({ owner, nowMs: now, host: 'gep', alive: () => false, graceMin: 10 }).stale, true);
  assert.equal(isStaleOwner({ owner, nowMs: now, host: 'gep', alive: (p) => p === 11, graceMin: 10 }).stale, false);
  assert.equal(isStaleOwner({ owner, nowMs: now, host: 'gep', alive: (p) => p === 12, graceMin: 10 }).stale, false);
  assert.equal(isStaleOwner({ owner, nowMs: now, host: 'masik', alive: () => false, graceMin: 10 }).stale, false);
});

test('isStaleOwner: az időkorlát + türelmi idő határa (élő gazdánál is)', () => {
  const owner = { pid: 11, host: 'gep', startedUtc: '2026-11-19T10:00:00.000Z', timeoutMin: 60 };
  const at = (iso) => isStaleOwner({ owner, nowMs: Date.parse(iso), host: 'gep', alive: () => true, graceMin: 10 }).stale;
  assert.equal(at('2026-11-19T11:09:59Z'), false);
  assert.equal(at('2026-11-19T11:10:01Z'), true);
  assert.equal(isStaleOwner({ owner, nowMs: Date.parse('2026-11-19T11:10:01Z'), host: 'masik', alive: () => true, graceMin: 10 }).stale, true);
});

test('isStaleOwner: gazda-fájl nélküli zár csak 60 s után elavult', () => {
  assert.equal(isStaleOwner({ owner: null, nowMs: 0, lockAgeMs: 59_000 }).stale, false);
  assert.equal(isStaleOwner({ owner: null, nowMs: 0, lockAgeMs: 61_000 }).stale, true);
});

test('isStaleEntry: halott PID vagy 5 percnél régebbi életjel', () => {
  const now = Date.parse('2026-11-19T12:00:00Z');
  const e = { pid: 5, host: 'gep', heartbeatUtc: '2026-11-19T11:59:00.000Z' };
  assert.equal(isStaleEntry({ entry: e, nowMs: now, host: 'gep', alive: () => true }), false);
  assert.equal(isStaleEntry({ entry: e, nowMs: now, host: 'gep', alive: () => false }), true);
  assert.equal(isStaleEntry({ entry: e, nowMs: now, host: 'masik', alive: () => false }), false);
  assert.equal(isStaleEntry({ entry: { ...e, heartbeatUtc: '2026-11-19T11:54:00.000Z' }, nowMs: now, host: 'gep', alive: () => true }), true);
});

test('decideReentry: csak a jelenlegi gazda tokenjével és élő gazdával', () => {
  const owner = { token: 'abc', pid: 1, host: 'gep' };
  assert.equal(decideReentry({ heldToken: 'abc', owner, host: 'gep', alive: () => true }).reenter, true);
  assert.equal(decideReentry({ heldToken: 'abc', owner, host: 'gep', alive: () => false }).reenter, false);
  assert.equal(decideReentry({ heldToken: 'xyz', owner, host: 'gep', alive: () => true }).reenter, false);
  assert.equal(decideReentry({ heldToken: 'abc', owner: null, host: 'gep', alive: () => true }).reenter, false);
  assert.equal(decideReentry({ heldToken: '', owner, host: 'gep', alive: () => true }).reenter, false);
});

test('pidAlive: a saját folyamat él, egy kilépett nem', () => {
  assert.equal(pidAlive(process.pid), true);
  assert.equal(pidAlive(deadPid()), false);
  assert.equal(pidAlive(0), false);
});

// ---- CLI -------------------------------------------------------------------------------------------------------------

test('CLI-hibák: hiányzó --name / --timeout-min / parancs → 2, a zár nem jön létre', () => {
  const dir = freshDir();
  const env = baseEnv(dir);
  assert.equal(runCli(['run', '--timeout-min', '1', '--', NODE, '-e', '0'], env).code, 2);
  assert.equal(runCli(['run', '--name', 'x', '--', NODE, '-e', '0'], env).code, 2);
  assert.equal(runCli(['run', '--name', 'x', '--timeout-min', '1', '--'], env).code, 2);
  assert.equal(runCli(['ismeretlen'], env).code, 2);
  assert.equal(existsSync(join(dir, 'lock')), false);
});

test('kilépési kód továbbadása; utána a zár szabad, a sor üres', () => {
  const dir = freshDir();
  const r = runCli(['run', '--name', 'hetes', '--timeout-min', '1', '--', NODE, '-e', 'process.exit(7)'], baseEnv(dir));
  assert.equal(r.code, 7, r.out);
  assert.equal(existsSync(join(dir, 'lock')), false, 'a zár elengedve');
  assert.deepEqual(queueEntries(dir), []);
  const ok = runCli(['run', '--name', 'nulla', '--timeout-min', '1', '--', NODE, '-e', 'process.exit(0)'], baseEnv(dir));
  assert.equal(ok.code, 0, ok.out);
});

test('nem indítható parancs → 127, a zár elengedve', () => {
  const dir = freshDir();
  const r = runCli(['run', '--name', 'nincs', '--timeout-min', '1', '--', 'websuli-nem-letezo-parancs-xyz'], baseEnv(dir));
  assert.equal(r.code, 127, r.out);
  assert.equal(existsSync(join(dir, 'lock')), false);
});

test('FIFO + egyszerre egy futás: A fut, B majd C sorba áll; C (gyorsabb lekérdezéssel sem) előzi meg B-t', async () => {
  const dir = freshDir();
  const log = join(dir, 'futas.log');
  const a = startCli(['run', '--name', 'A', '--timeout-min', '1', '--', NODE, '-e', worker(log, 'A', 1500)], baseEnv(dir));
  await waitFor(() => existsSync(log), 'A elindult');
  const b = startCli(['run', '--name', 'B', '--timeout-min', '1', '--', NODE, '-e', worker(log, 'B', 300)], baseEnv(dir, { WEBSULI_MACHINE_LOCK_POLL_MS: '400' }));
  await waitFor(() => queueEntries(dir).length === 1, 'B a sorban');
  const c = startCli(['run', '--name', 'C', '--timeout-min', '1', '--', NODE, '-e', worker(log, 'C', 300)], baseEnv(dir, { WEBSULI_MACHINE_LOCK_POLL_MS: '10' }));
  await waitFor(() => queueEntries(dir).length === 2, 'C a sorban');
  const [ra, rb, rc] = await Promise.all([a.done, b.done, c.done]);
  assert.deepEqual([ra.code, rb.code, rc.code], [0, 0, 0], `${ra.out}\n${rb.out}\n${rc.out}`);
  assert.deepEqual(readFileSync(log, 'utf8').trim().split(/\r?\n/), ['start A', 'end A', 'start B', 'end B', 'start C', 'end C']);
  assert.equal(existsSync(join(dir, 'lock')), false);
  assert.deepEqual(queueEntries(dir), []);
});

test('két egyszerre indított futás időben nem fedi egymást', async () => {
  const dir = freshDir();
  const log = join(dir, 'futas.log');
  const p = startCli(['run', '--name', 'P', '--timeout-min', '1', '--', NODE, '-e', worker(log, 'P', 400)], baseEnv(dir));
  const q = startCli(['run', '--name', 'Q', '--timeout-min', '1', '--', NODE, '-e', worker(log, 'Q', 400)], baseEnv(dir));
  const [rp, rq] = await Promise.all([p.done, q.done]);
  assert.deepEqual([rp.code, rq.code], [0, 0], `${rp.out}\n${rq.out}`);
  const lines = readFileSync(log, 'utf8').trim().split(/\r?\n/);
  assert.equal(lines.length, 4);
  assert.match(lines[0], /^start (P|Q)$/);
  assert.equal(lines[1], lines[0].replace('start', 'end'), lines.join(' | '));
});

test('időtúllépés: a saját gyerek leállítva, 124, a zár szabad', async () => {
  const dir = freshDir();
  const pidFile = join(dir, 'gyerek.pid');
  const script = `require('fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setTimeout(()=>{},60000);`;
  const t0 = Date.now();
  const r = runCli(['run', '--name', 'lassu', '--timeout-min', '0.01', '--', NODE, '-e', script], baseEnv(dir));
  assert.equal(r.code, 124, r.out);
  assert.ok(Date.now() - t0 < 30_000);
  const pid = Number(readFileSync(pidFile, 'utf8'));
  await waitFor(() => !pidAlive(pid), 'a gyerek leállt', 15_000);
  assert.equal(existsSync(join(dir, 'lock')), false);
  assert.match(r.out, /IDŐTÚLLÉPÉS/);
});

test('UTC: a gazda-fájl és a sorbejegyzés időbélyegei Z végűek; a status kiírja a gazdát és a sort', async () => {
  const dir = freshDir();
  const log = join(dir, 'futas.log');
  const a = startCli(['run', '--name', 'gazda-A', '--timeout-min', '1', '--', NODE, '-e', worker(log, 'A', 1200)], baseEnv(dir));
  await waitFor(() => existsSync(log) && existsSync(ownerFile(dir)), 'A fut');
  const b = startCli(['run', '--name', 'varo-B', '--timeout-min', '1', '--', NODE, '-e', worker(log, 'B', 10)], baseEnv(dir));
  await waitFor(() => queueEntries(dir).length === 1, 'B a sorban');
  const owner = JSON.parse(readFileSync(ownerFile(dir), 'utf8'));
  assert.match(owner.startedUtc, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
  assert.equal(owner.name, 'gazda-A');
  assert.equal(owner.host, hostname());
  assert.equal(owner.timeoutMin, 1);
  const entry = JSON.parse(readFileSync(join(dir, 'queue', queueEntries(dir)[0]), 'utf8'));
  assert.match(entry.joinedUtc, /Z$/);
  assert.match(entry.heartbeatUtc, /Z$/);
  const st = runCli(['status'], baseEnv(dir));
  assert.equal(st.code, 0);
  assert.match(st.out, /gazda-A/);
  assert.match(st.out, /varo-B/);
  const js = JSON.parse(runCli(['status', '--json'], baseEnv(dir)).out);
  assert.equal(js.owner.name, 'gazda-A');
  assert.equal(js.ownerAlive, true);
  assert.equal(js.entries.length, 1);
  assert.equal(js.entries[0].name, 'varo-B');
  assert.equal((await a.done).code, 0);
  assert.equal((await b.done).code, 0);
  const free = JSON.parse(runCli(['status', '--json'], baseEnv(dir)).out);
  assert.equal(free.owner, null);
  assert.deepEqual(free.entries, []);
});

test('elavult zár (halott PID ugyanazon a gépen): visszavéve és naplózva', () => {
  const dir = freshDir();
  mkdirSync(join(dir, 'lock'), { recursive: true });
  writeFileSync(ownerFile(dir), JSON.stringify({ name: 'halott', pid: deadPid(), childPid: null, host: hostname(), startedUtc: new Date().toISOString(), timeoutMin: 60, token: 'regi' }));
  const r = runCli(['run', '--name', 'uj', '--timeout-min', '1', '--max-wait-min', '0.2', '--', NODE, '-e', 'process.exit(0)'], baseEnv(dir));
  assert.equal(r.code, 0, r.out);
  assert.match(readFileSync(join(dir, 'events.log'), 'utf8'), /visszaveve.*halott/);
  assert.equal(existsSync(join(dir, 'lock')), false);
});

test('élő gazda zárát nem veszi el: várakozási korlát → 75, a zár és a gazda érintetlen', async () => {
  const dir = freshDir();
  const holder = spawn(NODE, ['-e', 'setTimeout(()=>{},30000)'], { stdio: 'ignore' });
  try {
    mkdirSync(join(dir, 'lock'), { recursive: true });
    const owner = { name: 'elo', pid: holder.pid, childPid: null, host: hostname(), startedUtc: new Date().toISOString(), timeoutMin: 60, token: 'elo-token' };
    writeFileSync(ownerFile(dir), JSON.stringify(owner));
    const r = runCli(['run', '--name', 'turelmetlen', '--timeout-min', '1', '--max-wait-min', '0.01', '--', NODE, '-e', 'process.exit(0)'], baseEnv(dir));
    assert.equal(r.code, 75, r.out);
    assert.equal(JSON.parse(readFileSync(ownerFile(dir), 'utf8')).token, 'elo-token');
    assert.equal(pidAlive(holder.pid), true, 'a gazda folyamatát nem állította le');
    assert.deepEqual(queueEntries(dir), [], 'a sorból kilépett');
  } finally {
    holder.kill();
  }
});

test('lejárt időkorlát + türelmi idő: a zár visszavehető, az élő folyamatot nem öli meg', () => {
  const dir = freshDir();
  const holder = spawn(NODE, ['-e', 'setTimeout(()=>{},30000)'], { stdio: 'ignore' });
  try {
    mkdirSync(join(dir, 'lock'), { recursive: true });
    const started = new Date(Date.now() - 3 * 60_000).toISOString();
    writeFileSync(ownerFile(dir), JSON.stringify({ name: 'lejart', pid: holder.pid, childPid: null, host: hostname(), startedUtc: started, timeoutMin: 1, token: 't' }));
    const r = runCli(['run', '--name', 'utodja', '--timeout-min', '1', '--max-wait-min', '0.2', '--', NODE, '-e', 'process.exit(0)'], baseEnv(dir, { WEBSULI_MACHINE_LOCK_GRACE_MIN: '1' }));
    assert.equal(r.code, 0, r.out);
    assert.equal(pidAlive(holder.pid), true);
    assert.match(readFileSync(join(dir, 'events.log'), 'utf8'), /visszaveve.*lejart/);
  } finally {
    holder.kill();
  }
});

test('CI-mód: zár nélkül fut, a kilépési kód átjön; CI=false nem CI-mód', () => {
  const dir = freshDir();
  const marker = join(dir, 'lock-latszott');
  const probe = `const fs=require('fs');if(fs.existsSync(${JSON.stringify(join(dir, 'lock'))}))fs.writeFileSync(${JSON.stringify(marker)},'1');process.exit(5)`;
  const ci = runCli(['run', '--name', 'ci', '--timeout-min', '1', '--', NODE, '-e', probe], baseEnv(dir, { CI: 'true' }));
  assert.equal(ci.code, 5, ci.out);
  assert.equal(existsSync(marker), false, 'CI-ben nincs zár');
  const nem = runCli(['run', '--name', 'nemci', '--timeout-min', '1', '--', NODE, '-e', probe], baseEnv(dir, { CI: 'false' }));
  assert.equal(nem.code, 5, nem.out);
  assert.equal(existsSync(marker), true, 'CI=false mellett a zár alatt fut');
});

test('újrabelépés: a gyerek a kapott tokennel azonnal fut; hamis tokennel sorba áll', () => {
  const dir = freshDir();
  const inner = [SCRIPT, 'run', '--name', 'belso', '--timeout-min', '1', '--max-wait-min', '0.02', '--', NODE, '-e', 'process.exit(0)'];
  const script = `const r=require('child_process').spawnSync(${JSON.stringify(NODE)},${JSON.stringify(inner)},{stdio:'inherit'});process.exit(r.status)`;
  const ok = runCli(['run', '--name', 'kulso', '--timeout-min', '1', '--', NODE, '-e', script], baseEnv(dir));
  assert.equal(ok.code, 0, ok.out);
  const forged = `process.env.WEBSULI_MACHINE_LOCK_HELD='hamis';${script}`;
  const bad = runCli(['run', '--name', 'kulso2', '--timeout-min', '1', '--', NODE, '-e', forged], baseEnv(dir));
  assert.equal(bad.code, 75, bad.out);
  assert.match(bad.out, /nem a jelenlegi gazdáé/);
});

test('megszakítás futás közben: a saját gyerek leáll, a zár szabad, kód 143', { timeout: 45_000 }, async () => {
  const dir = freshDir();
  const pidFile = join(dir, 'gyerek.pid');
  const ac = new AbortController();
  const logs = [];
  const p = run({ name: 'megszakitott', timeoutMin: 1, command: [NODE, '-e', `require('fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setTimeout(()=>{},60000)`],
    env: baseEnv(dir), lockDir: dir, pollMs: 50, signal: ac.signal, log: (s) => logs.push(s) });
  await waitFor(() => existsSync(pidFile), 'a gyerek fut');
  const pid = Number(readFileSync(pidFile, 'utf8'));
  const t0 = Date.now();
  ac.abort('SIGTERM');
  assert.equal(await p, 143, logs.join('\n'));
  assert.ok(Date.now() - t0 < 20_000, `a megszakítás ${Date.now() - t0} ms-ig tartott — a gyereket nem állította le`);
  await waitFor(() => !pidAlive(pid), 'a gyerek leállt');
  assert.equal(existsSync(join(dir, 'lock')), false);
});

test('megszakítás várakozás közben: a sorból kilép, a futó gazdát nem zavarja', { timeout: 45_000 }, async () => {
  const dir = freshDir();
  const pidFile = join(dir, 'gazda.pid');
  const acA = new AbortController();
  const acB = new AbortController();
  const a = run({ name: 'A', timeoutMin: 1, command: [NODE, '-e', `require('fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setTimeout(()=>{},60000)`],
    env: baseEnv(dir), lockDir: dir, pollMs: 50, signal: acA.signal, log: () => {} });
  await waitFor(() => existsSync(pidFile), 'A fut');
  const b = run({ name: 'B', timeoutMin: 1, command: [NODE, '-e', '0'], env: baseEnv(dir), lockDir: dir, pollMs: 50, signal: acB.signal, log: () => {} });
  await waitFor(() => queueEntries(dir).length === 1, 'B a sorban');
  const t0 = Date.now();
  acB.abort('SIGINT');
  assert.equal(await b, 130);
  assert.ok(Date.now() - t0 < 10_000, 'a várakozó megszakítása azonnali');
  assert.deepEqual(queueEntries(dir), []);
  assert.equal(pidAlive(Number(readFileSync(pidFile, 'utf8'))), true, 'A gyereke fut tovább');
  acA.abort('SIGTERM');
  assert.equal(await a, 143);
  assert.equal(existsSync(join(dir, 'lock')), false);
});

test('valódi jel a run folyamatnak (POSIX SIGTERM; Windows-on a megszakítás a fenti, közvetlen úton)', async () => {
  if (IS_WIN) {
    // Windows-on a Node a SIGTERM-et nem kézbesíti (TerminateProcess) — ott az elavult-PID visszavétel fedi a kemény leállítást.
    assert.equal(typeof run, 'function');
    return;
  }
  const dir = freshDir();
  const pidFile = join(dir, 'gyerek.pid');
  const cli = startCli(['run', '--name', 'jelzett', '--timeout-min', '1', '--', NODE, '-e', `require('fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));setTimeout(()=>{},60000)`], baseEnv(dir));
  await waitFor(() => existsSync(pidFile), 'a gyerek fut');
  cli.child.kill('SIGTERM');
  const r = await cli.done;
  assert.equal(r.code, 143, r.out);
  await waitFor(() => !pidAlive(Number(readFileSync(pidFile, 'utf8'))), 'a gyerek leállt');
  assert.equal(existsSync(join(dir, 'lock')), false);
});

test('relaunchUnderMachineLock: zár alatt újraindít; CI-ben és érvényes örökölt tokennel nem', () => {
  const dir = freshDir();
  const calls = [];
  const exits = [];
  const fake = (file, args, opts) => { calls.push({ file, args, opts }); return { status: 9 }; };
  const argv = [NODE, 'scripts/qa/gates/pre-pr-gate.mjs', '--body-file', 'x.md'];
  const r = relaunchUnderMachineLock({ name: 'gate-pr', timeoutMin: 300, env: baseEnv(dir), argv, execPath: NODE, spawnSyncImpl: fake, exit: (c) => exits.push(c) });
  assert.equal(r, true);
  assert.deepEqual(exits, [9], 'a gyerek kódjával lép ki');
  assert.deepEqual(calls[0].args, [SCRIPT, 'run', '--name', 'gate-pr', '--timeout-min', '300', '--', NODE, 'scripts/qa/gates/pre-pr-gate.mjs', '--body-file', 'x.md']);
  assert.equal(relaunchUnderMachineLock({ name: 'gate-pr', timeoutMin: 300, env: baseEnv(dir, { CI: 'true' }), argv, execPath: NODE, spawnSyncImpl: fake, exit: (c) => exits.push(c) }), false);
  mkdirSync(join(dir, 'lock'), { recursive: true });
  writeFileSync(ownerFile(dir), JSON.stringify({ name: 'szulo', pid: process.pid, host: hostname(), startedUtc: new Date().toISOString(), timeoutMin: 60, token: 'tok' }));
  assert.equal(relaunchUnderMachineLock({ name: 'gate-pr', timeoutMin: 300, env: baseEnv(dir, { WEBSULI_MACHINE_LOCK_HELD: 'tok' }), argv, execPath: NODE, spawnSyncImpl: fake, exit: (c) => exits.push(c) }), false);
  assert.equal(relaunchUnderMachineLock({ name: 'gate-pr', timeoutMin: 300, env: baseEnv(dir, { WEBSULI_MACHINE_LOCK_HELD: 'hamis' }), argv, execPath: NODE, spawnSyncImpl: fake, exit: (c) => exits.push(c) }), true);
  assert.equal(calls.length, 2);
});

test('readStatus: elavult gazda jelölve, a fájlokat nem módosítja', () => {
  const dir = freshDir();
  mkdirSync(join(dir, 'lock'), { recursive: true });
  writeFileSync(ownerFile(dir), JSON.stringify({ name: 'halott', pid: deadPid(), host: hostname(), startedUtc: new Date().toISOString(), timeoutMin: 60, token: 'x' }));
  const st = readStatus(dir);
  assert.equal(st.owner.name, 'halott');
  assert.equal(st.ownerAlive, false);
  assert.equal(st.ownerStale, true);
  assert.equal(existsSync(ownerFile(dir)), true);
  rmSync(dir, { recursive: true, force: true });
});
