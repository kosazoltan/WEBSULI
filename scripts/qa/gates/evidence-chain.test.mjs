// S2 — láncolt bizonyíték (független review M2, M3): azonosító-szűrés, láncon kívüli / átírt / lánc nélküli rekord, párhuzamos írás
// zárral (8 író × 200 rekord → 0 törés), elárvult zár, javítás (archivál + naplóz, nem simít).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CHAIN_FILE, LOCK_FILE, LOCK_MAX_AGE_MS, LOCK_STALE_MS, LOCK_TIMEOUT_MS, REPAIR_LOG, appendRecord, lastChainLine, pidAlive, chainStatus, linkRecord, repairChain, validId, verifyChain, withLock } from './evidence-chain.mjs';

const H = 'a'.repeat(40);
const tmp = () => mkdtempSync(join(tmpdir(), 'ev-chain-'));

test('validId: csak [a-z0-9-]; útvonal-elem, nagybetű, üres tilos', () => {
  for (const ok of ['run-0123456789ab', `stage-${H}`, 'pre-push-abc']) assert.equal(validId(ok), true, ok);
  for (const bad of ['../r-forged', 'run/x', 'RUN-1', '', 'a', '..']) assert.equal(validId(bad), false, bad);
  assert.throws(() => appendRecord(tmp(), '../kint', { head: H }), /érvénytelen/);
});

test('chainStatus: ok / láncon kívüli / lánc nélküli / átírt / hiányzó — és a máshol lévő törés független rekordot nem buktat', () => {
  const dir = tmp();
  appendRecord(dir, 'stage-x1', { head: H, ok: true });
  appendRecord(dir, 'run-y00000000001', { head: H, ok: true });
  assert.equal(chainStatus(dir, 'stage-x1').status, 'ok');
  writeFileSync(join(dir, 'run-kezi0000001.json'), JSON.stringify({ head: H, ok: true }));
  assert.equal(chainStatus(dir, 'run-kezi0000001').status, 'not-in-chain', 'kézzel írt rekord');
  writeFileSync(join(dir, 'run-y00000000001.json'), JSON.stringify({ head: H, ok: true, hamis: 1 }));
  assert.equal(chainStatus(dir, 'run-y00000000001').status, 'mismatch', 'átírt rekord');
  assert.equal(chainStatus(dir, 'stage-x1').status, 'ok', 'egy másik rekord átírása nem érinti');
  assert.equal(chainStatus(dir, 'nincs-ilyen-rekord').status, 'missing');
  const lines = readFileSync(join(dir, CHAIN_FILE), 'utf8').split('\n').filter(Boolean);
  writeFileSync(join(dir, CHAIN_FILE), `${lines.slice(1).join('\n')}\n`); // az első sor kivágva → törés
  const v = verifyChain(dir);
  assert.equal(v.breaks.length, 1);
  const s = chainStatus(dir, 'run-y00000000001');
  assert.equal(s.breaks, 1, 'a törés jelezve');
  const dir2 = tmp();
  appendRecord(dir2, 'stage-x2', { head: H, ok: true });
  writeFileSync(join(dir2, CHAIN_FILE), '');
  assert.equal(chainStatus(dir2, 'stage-x2').status, 'not-in-chain', 'kiürített lánc: a rekord láncon kívüli');
});

test('chainStatus: a chain.jsonl TÖRLÉSE után a rekord „no-chain” (nem „üres lánc, minden rendben”)', async () => {
  const dir = tmp();
  appendRecord(dir, 'stage-x3', { head: H, ok: true });
  const { rmSync } = await import('node:fs');
  rmSync(join(dir, CHAIN_FILE));
  assert.equal(chainStatus(dir, 'stage-x3').status, 'no-chain');
});

test('withLock: az elárvult (régi) zárat törli és naplózza; a friss zárnál időtúllépéssel kivételt dob', () => {
  const dir = tmp();
  writeFileSync(join(dir, LOCK_FILE), '999\n');
  const old = new Date(Date.now() - 120_000);
  utimesSync(join(dir, LOCK_FILE), old, old);
  assert.equal(withLock(dir, () => 42, { staleMs: 30_000, alive: () => false }), 42);
  assert.match(readFileSync(join(dir, REPAIR_LOG), 'utf8'), /elárvult zár törölve/);
  writeFileSync(join(dir, LOCK_FILE), '999\n');
  assert.throws(() => withLock(dir, () => 1, { timeoutMs: 50, staleMs: 60_000, alive: () => false }), /sem szabadult fel/);
});

test('withLock (R2): a régi zárat NEM veszi el, ha a benne álló PID él; a várakozási idő alapból nagyobb az elárvulási küszöbnél', () => {
  const dir = tmp();
  writeFileSync(join(dir, LOCK_FILE), '4242\n');
  // a küszöb (30 s) és a felső korlát (40 s) közötti korú zár: élő PID mellett nem vehető el
  const old = new Date(Date.now() - (LOCK_STALE_MS + LOCK_MAX_AGE_MS) / 2);
  utimesSync(join(dir, LOCK_FILE), old, old);
  assert.throws(() => withLock(dir, () => 1, { timeoutMs: 50, staleMs: 30_000, alive: (p) => p === 4242 }), /sem szabadult fel/);
  assert.ok(existsSync(join(dir, LOCK_FILE)), 'az élő író zárja megmaradt');
  assert.equal(withLock(dir, () => 7, { staleMs: 30_000, alive: () => false }), 7, 'halott PID: átveszi');
  assert.ok(LOCK_TIMEOUT_MS > LOCK_STALE_MS, 'a várakozó a saját időtúllépése előtt átveszi az elárvult zárat');
  // F2: élő IDEGEN PID-et hordozó, a felső korlátnál öregebb zár (PID-újrahasznosítás / beragadt folyamat) elvehető, naplózva
  writeFileSync(join(dir, LOCK_FILE), '4242\n');
  const older = new Date(Date.now() - LOCK_MAX_AGE_MS - 5_000);
  utimesSync(join(dir, LOCK_FILE), older, older);
  assert.equal(withLock(dir, () => 9, { timeoutMs: 50, alive: () => true }), 9);
  assert.match(readFileSync(join(dir, REPAIR_LOG), 'utf8'), /felső korlát fölött, a PID 4242 él/);
  assert.ok(LOCK_MAX_AGE_MS < LOCK_TIMEOUT_MS && LOCK_MAX_AGE_MS > LOCK_STALE_MS, 'a várakozó a korlát után mindig bejut');
  assert.equal(pidAlive(process.pid), true);
  assert.equal(pidAlive(0), false);
});

test('repairChain: a törött láncot archiválja, újat indít (repair: true), naplóz — a rekordok utána „ok, javított”', () => {
  const dir = tmp();
  appendRecord(dir, 'stage-r1', { head: H, ok: true });
  appendRecord(dir, 'stage-r2', { head: H, ok: true });
  writeFileSync(join(dir, CHAIN_FILE), `${readFileSync(join(dir, CHAIN_FILE), 'utf8')}{nem json\n`);
  assert.equal(verifyChain(dir).ok, false);
  const r = repairChain(dir, { now: () => new Date('2026-11-17T21:00:00Z') });
  assert.equal(r.relinked, 2);
  assert.ok(existsSync(join(dir, r.archived)), 'a régi lánc archiválva, nem törölve');
  assert.equal(verifyChain(dir).ok, true);
  const s = chainStatus(dir, 'stage-r1');
  assert.equal(s.status, 'ok');
  assert.equal(s.repaired, true);
  assert.match(readFileSync(join(dir, REPAIR_LOG), 'utf8'), /lánc-javítás/);
  linkRecord(dir, 'stage-r1');
  assert.equal(chainStatus(dir, 'stage-r1').repaired, false, 'egy újabb rendes írás után már nem „javított”');
});

test('M3: 8 párhuzamos író × 200 rekord egy tárba → 0 törés, 1600 sor', async () => {
  const dir = tmp();
  const mod = pathToFileURL(join(import.meta.dirname, 'evidence-chain.mjs')).href;
  const writer = (w) => new Promise((done, fail) => {
    const code = `const { appendRecord } = await import(${JSON.stringify(mod)}); for (let i = 0; i < 200; i += 1) appendRecord(${JSON.stringify(dir)}, 'run-w${w}-' + String(i).padStart(4, '0'), { head: '${H}', ok: true, i });`;
    const p = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (c) => (c === 0 ? done() : fail(new Error(`író ${w}: kód ${c} ${err}`))));
  });
  await Promise.all(Array.from({ length: 8 }, (_, w) => writer(w)));
  const v = verifyChain(dir);
  assert.equal(v.breaks.length, 0, v.problems.slice(0, 5).join('\n'));
  assert.equal(v.last.size, 1600);
  assert.equal(v.ok, true);
});

test('lastChainLine (P2): a lánc utolsó sora a fájl végéről — 64 KB-nál hosszabb láncnál, sorvégi üres sorral és ékezettel is', () => {
  const dir = tmp();
  assert.equal(lastChainLine(dir), null, 'nincs lánc');
  const lines = Array.from({ length: 3000 }, (_, i) => JSON.stringify({ name: `run-${i}`, megjegyzés: 'árvíztűrő tükörfúrógép' }));
  writeFileSync(join(dir, CHAIN_FILE), `${lines.join('\n')}\n\n`);
  assert.equal(lastChainLine(dir), lines[lines.length - 1]);
  writeFileSync(join(dir, CHAIN_FILE), lines[0]);
  assert.equal(lastChainLine(dir), lines[0], 'egyetlen, sortörés nélküli sor');
  // a hozzáfűzés a végéről olvasott sorra köt: a teljes lánc ép marad
  const d2 = tmp();
  for (let i = 0; i < 5; i += 1) appendRecord(d2, `run-x-${i}`, { head: H, i });
  assert.equal(verifyChain(d2).ok, true);
});
