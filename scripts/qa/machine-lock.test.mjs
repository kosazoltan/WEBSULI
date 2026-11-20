// Gépi zár tesztjei (docs/specs/2026-11-19-gepi-zar.md, A1–A13). Valódi `node` gyerekfolyamatokkal, ideiglenes zár-mappában;
// a gyerekek környezetéből a CI- és a zár-változók törölve, rövid lekérdezési idővel.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  cleanupNewContainers, decideReentry, hashToken, installSignalHandlers, isCiEnv, isStaleEntry, isStaleOwner, pidAlive, readStatus,
  relaunchUnderMachineLock, resolveLockDir, run,
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
  return { ...env, WEBSULI_MACHINE_LOCK_DIR: lockDir, WEBSULI_MACHINE_LOCK_POLL_MS: '50', WEBSULI_MACHINE_LOCK_DOCKER_CLEANUP: '0', ...extra };
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

test('decideReentry: csak a jelenlegi gazda tokenjével (a gazda-fájlban csak a lenyomata), élő és nem lejárt gazdával', () => {
  const nowMs = Date.parse('2026-11-19T12:00:00Z');
  const owner = { tokenHash: hashToken('abc'), pid: 1, host: 'gep', startedUtc: '2026-11-19T11:30:00.000Z', timeoutMin: 60 };
  const d = (o) => decideReentry({ heldToken: 'abc', owner, host: 'gep', alive: () => true, nowMs, graceMin: 10, ...o }).reenter;
  assert.equal(d({}), true);
  assert.equal(d({ alive: () => false }), false);
  assert.equal(d({ heldToken: 'xyz' }), false);
  assert.equal(d({ owner: null }), false);
  assert.equal(d({ heldToken: '' }), false);
  assert.equal(d({ heldToken: hashToken('abc') }), false, 'a lenyomat maga nem token');
  assert.equal(d({ owner: { ...owner, token: 'abc', tokenHash: undefined } }), false, 'nyers token a gazda-fájlban nem érvényes');
  assert.equal(d({ nowMs: Date.parse('2026-11-19T12:41:00Z') }), false, 'lejárt (időkorlát + türelmi idő) gazdához nincs újrabelépés');
});

test('L6: a CLI-jelkezelők — SIGINT / SIGTERM / SIGHUP (Windows-on SIGBREAK is) megszakítást kérnek a jel nevével', () => {
  const handlers = new Map();
  const fakeProc = { on: (s, fn) => handlers.set(s, fn) };
  const ac = new AbortController();
  installSignalHandlers(ac, fakeProc, 'win32');
  assert.deepEqual([...handlers.keys()].sort(), ['SIGBREAK', 'SIGHUP', 'SIGINT', 'SIGTERM']);
  handlers.get('SIGINT')();
  assert.equal(ac.signal.reason, 'SIGINT');
  const posix = new Map();
  installSignalHandlers(new AbortController(), { on: (s, fn) => posix.set(s, fn) }, 'linux');
  assert.deepEqual([...posix.keys()].sort(), ['SIGHUP', 'SIGINT', 'SIGTERM']);
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

test('valódi SIGTERM a run folyamatnak (csak POSIX-on fut; Windows-on NEM FUT — ott a jelkezelők bekötését az L6-teszt méri)', async (t) => {
  if (IS_WIN) {
    // Windows-on a Node a SIGTERM-et nem kézbesíti (TerminateProcess) — itt nincs mit mérni; a jelregisztrációt az L6-teszt fedi.
    t.diagnostic('NEM FUTOTT: Windows — valódi POSIX-jel nem küldhető');
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
  writeFileSync(ownerFile(dir), JSON.stringify({ name: 'szulo', pid: process.pid, host: hostname(), startedUtc: new Date().toISOString(), timeoutMin: 60, tokenHash: hashToken('tok') }));
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

// ---- Vak review (GPT-6.2 Sol, 747ebb20) leletei: L1–L7 ---------------------------------------------------------------------

const aliveSrc = 'const alive=(p)=>{try{process.kill(p,0);return true}catch(e){return e.code==="EPERM"}};';

test('L1: az elengedés a közös mutex alatt dönt — a régi gazda nem bontja le az új gazda zárát', async () => {
  const dir = freshDir();
  mkdirSync(join(dir, 'lock'), { recursive: true });
  writeFileSync(ownerFile(dir), JSON.stringify({ name: 'A', pid: process.pid, host: hostname(), startedUtc: new Date().toISOString(), timeoutMin: 60, tokenHash: hashToken('A-token') }));
  // „B” épp a mutex alatt veszi vissza a zárat (a mutex élő gazdája a tesztfolyamat).
  mkdirSync(join(dir, 'state.mutex'));
  writeFileSync(join(dir, 'state.mutex', 'holder.json'), JSON.stringify({ pid: process.pid, host: hostname(), atUtc: new Date().toISOString() }));
  const src = `const m=await import(${JSON.stringify(pathToFileURL(SCRIPT).href)});m.releaseLock(${JSON.stringify(dir)},'A-token',()=>{});`;
  const a = spawn(NODE, ['--input-type=module', '-e', src], { stdio: 'ignore' });
  const aDone = new Promise((r) => a.on('close', r));
  await sleep(700);
  // B befejezi a visszavételt: új gazda-fájl, majd elengedi a mutexet.
  writeFileSync(ownerFile(dir), JSON.stringify({ name: 'B', pid: process.pid, host: hostname(), startedUtc: new Date().toISOString(), timeoutMin: 60, tokenHash: hashToken('B-token') }));
  rmSync(join(dir, 'state.mutex'), { recursive: true, force: true });
  await aDone;
  assert.equal(existsSync(ownerFile(dir)), true, 'B zára megmaradt');
  assert.equal(JSON.parse(readFileSync(ownerFile(dir), 'utf8')).name, 'B');
});

test('L2: a zár csak a saját folyamatfa (újrabelépő gyerekekkel együtt) leállása után szabadul fel', { timeout: 90_000 }, async () => {
  const dir = freshDir();
  const g1 = join(dir, 'g1.pid');
  const g2 = join(dir, 'g2.pid');
  const result = join(dir, 'b.json');
  const stubborn = (f) => `process.on('SIGTERM',()=>{});require('fs').writeFileSync(${JSON.stringify(f)},String(process.pid));setInterval(()=>{},1000);`;
  const childSrc = `const {spawn}=require('child_process');spawn(${JSON.stringify(NODE)},['-e',${JSON.stringify(stubborn(g1))}],{stdio:'ignore'});`
    + `spawn(${JSON.stringify(NODE)},${JSON.stringify([SCRIPT, 'run', '--name', 'belso', '--timeout-min', '1', '--', NODE, '-e', stubborn(g2)])},{stdio:'ignore'});setInterval(()=>{},1000);`;
  const env = baseEnv(dir, { WEBSULI_MACHINE_LOCK_KILL_GRACE_MS: '1500' });
  const a = startCli(['run', '--name', 'A', '--timeout-min', '0.08', '--', NODE, '-e', childSrc], env);
  await waitFor(() => existsSync(g1) && existsSync(g2), 'a leszármazottak futnak', 30_000);
  const pids = [Number(readFileSync(g1, 'utf8')), Number(readFileSync(g2, 'utf8'))];
  const bSrc = `${aliveSrc}require('fs').writeFileSync(${JSON.stringify(result)},JSON.stringify(${JSON.stringify(pids)}.map(alive)));`;
  const b = startCli(['run', '--name', 'B', '--timeout-min', '1', '--', NODE, '-e', bSrc], env);
  try {
    const [ra, rb] = await Promise.all([a.done, b.done]);
    assert.equal(ra.code, 124, ra.out);
    assert.equal(rb.code, 0, rb.out);
    assert.deepEqual(JSON.parse(readFileSync(result, 'utf8')), [false, false], 'B indulásakor egyetlen leszármazott sem élt');
  } finally {
    for (const p of pids) if (pidAlive(p)) { try { process.kill(p, 'SIGKILL'); } catch { /* már nem él */ } }
  }
});

test('L3: kényszerleállítás után a futás alatt keletkezett saját eldobható konténer leáll, a korábbi megmarad', async () => {
  const stops = [];
  assert.deepEqual(cleanupNewContainers({
    before: [{ id: 'a1', name: 'websuli-e2e-regi' }],
    after: [{ id: 'a1', name: 'websuli-e2e-regi' }, { id: 'b2', name: 'websuli-e2e-uj' }, { id: 'c3', name: 'websuli-learning-test-uj' }, { id: 'd4', name: 'mas-projekt' }],
    stop: (id) => { stops.push(id); return true; }, say: () => {},
  }), ['b2', 'c3']);
  assert.deepEqual(stops, ['b2', 'c3']);
  assert.deepEqual(cleanupNewContainers({ before: null, after: [{ id: 'x', name: 'websuli-e2e-x' }], stop: () => true, say: () => {} }), [], 'előzetes pillanatkép nélkül nincs takarítás');

  const dir = freshDir();
  const calls = [];
  let n = 0;
  const docker = {
    ps: () => (n++ === 0 ? [{ id: 'a1', name: 'websuli-e2e-regi' }] : [{ id: 'a1', name: 'websuli-e2e-regi' }, { id: 'b2', name: 'websuli-e2e-uj' }]),
    stop: (id) => { calls.push(id); return true; },
  };
  const code = await run({ name: 'kenyszer', timeoutMin: 0.01, command: [NODE, '-e', 'setTimeout(()=>{},60000)'], env: baseEnv(dir), lockDir: dir, pollMs: 50, log: () => {}, docker });
  assert.equal(code, 124);
  assert.deepEqual(calls, ['b2']);
  n = 0;
  calls.length = 0;
  assert.equal(await run({ name: 'rendes', timeoutMin: 1, command: [NODE, '-e', '0'], env: baseEnv(dir), lockDir: dir, pollMs: 50, log: () => {}, docker }), 0);
  assert.deepEqual(calls, [], 'rendes kilépésnél a harness maga takarít');
});

test('L3 valódi Dockerrel (ha van helyi node:24-alpine kép): időtúllépés után a saját konténer eltűnik, a másik futásé megmarad', { timeout: 180_000 }, async (t) => {
  const has = spawnSync('docker', ['image', 'inspect', 'node:24-alpine'], { stdio: 'ignore', timeout: 20_000 }).status === 0;
  if (!has) { t.diagnostic('NEM FUTOTT: nincs Docker vagy helyi node:24-alpine kép'); return; }
  const tag = Math.random().toString(36).slice(2, 8);
  const other = `websuli-e2e-masik-${tag}`;
  const own = `websuli-e2e-sajat-${tag}`;
  assert.equal(spawnSync('docker', ['run', '--rm', '-d', '--name', other, 'node:24-alpine', 'sleep', '300'], { stdio: 'ignore' }).status, 0);
  try {
    const dir = freshDir();
    const childSrc = `require('child_process').spawnSync('docker',['run','--rm','-d','--name',${JSON.stringify(own)},'node:24-alpine','sleep','300'],{stdio:'ignore'});setInterval(()=>{},1000);`;
    const r = runCli(['run', '--name', 'docker-a', '--timeout-min', '0.5', '--', NODE, '-e', childSrc], baseEnv(dir, { WEBSULI_MACHINE_LOCK_DOCKER_CLEANUP: '1' }));
    assert.equal(r.code, 124, r.out);
    const names = spawnSync('docker', ['ps', '--format', '{{.Names}}'], { encoding: 'utf8' }).stdout.split(/\r?\n/);
    assert.equal(names.includes(own), false, 'a saját konténer leállt');
    assert.equal(names.includes(other), true, 'a másik futás konténere megmaradt');
  } finally {
    spawnSync('docker', ['rm', '-f', other, own], { stdio: 'ignore' });
  }
});

test('L4: a token nem kerül a gazda-fájlba és a státuszba (sem szöveges, sem JSON); L7: a JSON számolt futás- és várakozási időt ad', async () => {
  const dir = freshDir();
  const heldFile = join(dir, 'held.txt');
  const go = join(dir, 'go');
  const aSrc = `const fs=require('fs');fs.writeFileSync(${JSON.stringify(heldFile)},process.env.WEBSULI_MACHINE_LOCK_HELD||'');const t=setInterval(()=>{if(fs.existsSync(${JSON.stringify(go)})){clearInterval(t)}},50);`;
  const a = startCli(['run', '--name', 'A', '--timeout-min', '1', '--', NODE, '-e', aSrc], baseEnv(dir));
  await waitFor(() => existsSync(heldFile), 'A fut');
  const b = startCli(['run', '--name', 'B', '--timeout-min', '1', '--', NODE, '-e', '0'], baseEnv(dir));
  await waitFor(() => queueEntries(dir).length === 1, 'B a sorban');
  const held = readFileSync(heldFile, 'utf8');
  assert.ok(held.length >= 16, 'a gyerek megkapta a tokent');
  assert.equal(readFileSync(ownerFile(dir), 'utf8').includes(held), false, 'a gazda-fájlban nincs nyers token');
  const raw = runCli(['status', '--json'], baseEnv(dir)).out;
  const text = runCli(['status'], baseEnv(dir)).out;
  assert.equal(raw.includes(held), false);
  assert.equal(text.includes(held), false);
  const js = JSON.parse(raw);
  assert.equal('token' in js.owner, false);
  assert.equal('tokenHash' in js.owner, false);
  assert.match(js.nowUtc, /Z$/);
  assert.equal(typeof js.owner.ranMinutes, 'number');
  assert.ok(js.owner.ranMinutes >= 0);
  assert.equal(typeof js.entries[0].waitedMinutes, 'number');
  writeFileSync(go, '1');
  assert.equal((await a.done).code, 0);
  assert.equal((await b.done).code, 0);
});

test('L5: lejárt várakozási idő után a parancs nem indul el, akkor sem, ha közben felszabadul a zár', { timeout: 60_000 }, async () => {
  const dir = freshDir();
  const started = join(dir, 'a-fut');
  const go = join(dir, 'go');
  const marker = join(dir, 'b-indult');
  const aSrc = `const fs=require('fs');fs.writeFileSync(${JSON.stringify(started)},'1');const t=setInterval(()=>{if(fs.existsSync(${JSON.stringify(go)})){clearInterval(t)}},20);`;
  const a = startCli(['run', '--name', 'A', '--timeout-min', '1', '--', NODE, '-e', aSrc], baseEnv(dir));
  await waitFor(() => existsSync(started), 'A fut');
  const b = startCli(['run', '--name', 'B', '--timeout-min', '1', '--max-wait-min', '0.02', '--', NODE, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)},'1')`], baseEnv(dir, { WEBSULI_MACHINE_LOCK_POLL_MS: '4000' }));
  await waitFor(() => queueEntries(dir).length === 1, 'B a sorban (az első lekérdezés után alszik)');
  await sleep(400);
  writeFileSync(go, '1');
  assert.equal((await a.done).code, 0);
  const rb = await b.done;
  assert.equal(rb.code, 75, rb.out);
  assert.equal(existsSync(marker), false, 'B parancsa nem indult el');
});
