// docs/specs/2026-11-25-feladat-nyilvantartas.md „Integráció”: a gate:pr / gate:merge végén a feladat-nyilvántartás
// szinkronja NEM blokkoló lépés — hiba, időtúllépés, hiányzó DB vagy Python sosem dob, és a kapu eredményét nem érinti.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { feladatSzinkron } from './feladat-szinkron.mjs';

function dbFile() {
  const dir = mkdtempSync(join(tmpdir(), 'feladat-szinkron-'));
  const p = join(dir, 'kov.db');
  writeFileSync(p, '');
  return p;
}

test('kikapcsolva (FELADAT_SZINKRON=off) → nem fut', () => {
  const calls = [];
  const r = feladatSzinkron({ root: 'R', env: { FELADAT_SZINKRON: 'off', KOVETELMENY_DB: dbFile() }, exec: (...a) => { calls.push(a); return { code: 0 }; } });
  assert.equal(r.ran, false);
  assert.match(r.note, /kikapcsolva/);
  assert.equal(calls.length, 0);
});

test('nincs DB (pl. CI) → nem fut, nem hoz létre', () => {
  const calls = [];
  const r = feladatSzinkron({ root: 'R', env: { KOVETELMENY_DB: join(tmpdir(), 'nincs-ilyen-db-xyz.db') }, exec: (...a) => { calls.push(a); return { code: 0 }; } });
  assert.equal(r.ran, false);
  assert.match(r.note, /nincs/);
  assert.equal(calls.length, 0);
});

test('sikeres futás → ok, a szinkron szkriptet a DB-vel és a repóval hívja (-B: nincs __pycache__)', () => {
  const db = dbFile();
  const calls = [];
  const r = feladatSzinkron({ root: 'R', env: { KOVETELMENY_DB: db }, exec: (cmd, args, opts) => { calls.push({ cmd, args, opts }); return { code: 0, stdout: 'szinkron: változás 3\n', stderr: '' }; } });
  assert.equal(r.ran, true);
  assert.equal(r.ok, true);
  assert.match(r.note, /változás 3/);
  const a = calls[0].args;
  assert.ok(a.includes('-B'));
  assert.ok(a.some((x) => /feladat\.py$/.test(x)));
  assert.deepEqual(a.slice(a.indexOf('--db'), a.indexOf('--db') + 2), ['--db', db]);
  assert.ok(a.includes('szinkron'));
  assert.ok(calls[0].opts.timeoutMs > 0);
});

test('hiányzó python3 → a következő jelölttel próbálkozik', () => {
  const db = dbFile();
  const tried = [];
  const r = feladatSzinkron({ root: 'R', env: { KOVETELMENY_DB: db }, exec: (cmd) => { tried.push(cmd); return cmd === 'python3' ? { code: 127, stdout: '', stderr: 'ENOENT' } : { code: 0, stdout: 'ok', stderr: '' }; } });
  assert.equal(r.ok, true);
  assert.deepEqual(tried.slice(0, 2), ['python3', 'py']);
});

test('hibás futás vagy kivétel → ok=false, de nem dob', () => {
  const db = dbFile();
  const r1 = feladatSzinkron({ root: 'R', env: { KOVETELMENY_DB: db }, exec: () => ({ code: 1, stdout: '', stderr: 'valami hiba\nmásodik sor' }) });
  assert.equal(r1.ok, false);
  assert.match(r1.note, /valami hiba/);
  const r2 = feladatSzinkron({ root: 'R', env: { KOVETELMENY_DB: db }, exec: () => { throw new Error('robbant'); } });
  assert.equal(r2.ok, false);
  assert.match(r2.note, /robbant/);
});

test('időtúllépés (realExec: 127 + ETIMEDOUT) → nem próbál másik értelmezőt, egyszeri nem blokkoló hiba', () => {
  const db = dbFile();
  const tried = [];
  const r = feladatSzinkron({ root: 'R', env: { KOVETELMENY_DB: db }, exec: (cmd) => { tried.push(cmd); return { code: 127, stdout: '', stderr: 'spawnSync python3 ETIMEDOUT' }; } });
  assert.deepEqual(tried, ['python3']);
  assert.equal(r.ok, false);
  assert.match(r.note, /időtúllépés/);
});
