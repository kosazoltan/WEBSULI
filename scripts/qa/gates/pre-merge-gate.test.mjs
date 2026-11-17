// docs/specs/2026-11-17-minosegkapuk.md E9: a merge előtti kapu döntése hamis gh / futásőr / rt-adatokkal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS, loadConfig } from './lib.mjs';
import { decideMerge, requiredChecks } from './pre-merge-gate.mjs';

const cfg = loadConfig();
const HEAD = 'a'.repeat(40);
const MAIN = 'b'.repeat(40);
const REQUIRED = ['Háromfázisú rend', 'Lint & Typecheck', 'Unit Tests', 'Playwright E2E'];
const run = (name, conclusion = 'success', status = 'completed', id = 1) => ({ name, status, conclusion, id });

function base(over = {}) {
  return {
    pr: { state: 'OPEN', isDraft: false, mergeStateStatus: 'CLEAN', headRefOid: HEAD, baseRefOid: MAIN },
    required: REQUIRED,
    checkRuns: REQUIRED.map((n) => run(n)),
    statuses: [],
    threads: [{ isResolved: true }],
    mainSha: MAIN,
    ciBaseSha: MAIN,
    files: ['source/server/a.ts'],
    verdict: { verdict: 'IGEN', source: 'helyi bizonyíték' },
    guard: { code: 0, summary: 'AKTIV=0' },
    rt: { json: { mode: 'off', activeMatches: 0 } },
    repoWidePatterns: cfg.repoWidePatterns,
    ...over,
  };
}
const st = (res, prefix) => res.find((r) => r.name.startsWith(prefix))?.status;

test('decideMerge: minden zöld → nincs FAIL; a source/ változás „telepítést indít” jelzést kap', () => {
  const res = decideMerge(base());
  assert.ok(!res.some((r) => r.status === STATUS.FAIL), JSON.stringify(res.filter((r) => r.status === STATUS.FAIL)));
  assert.match(res.find((r) => r.name === 'telepítés').note, /TELEPÍTÉST INDÍT/);
  assert.equal(st(res, 'külső (Gemini)'), STATUS.WARN, 'a külső jelentés hiánya csak figyelmeztetés');
  assert.equal(st(decideMerge(base({ external: { head: HEAD, status: 'ok', model: 'm' } })), 'külső (Gemini)'), STATUS.PASS);
});

test('decideMerge: nem CLEAN / piszkozat / zárt → FAIL', () => {
  assert.equal(st(decideMerge(base({ pr: { ...base().pr, mergeStateStatus: 'BLOCKED' } })), 'PR állapota'), STATUS.FAIL);
  assert.equal(st(decideMerge(base({ pr: { ...base().pr, isDraft: true } })), 'PR állapota'), STATUS.FAIL);
  assert.equal(st(decideMerge(base({ pr: { ...base().pr, state: 'MERGED' } })), 'PR állapota'), STATUS.FAIL);
});

test('requiredChecks: hiányzó, futó, bukott kötelező ellenőrzés; azonos névnél a legutóbbi számít', () => {
  assert.deepEqual(requiredChecks(['A', 'B', 'C'], [run('A'), run('B', null, 'in_progress')]), ['B: még fut (in_progress)', 'C: nem futott a jelenlegi fejre']);
  assert.deepEqual(requiredChecks(['A'], [run('A', 'failure', 'completed', 1), run('A', 'success', 'completed', 2)]), []);
  assert.deepEqual(requiredChecks(['A'], [run('A', 'success', 'completed', 1), run('A', 'failure', 'completed', 2)]), ['A: failure']);
  assert.deepEqual(requiredChecks(['S'], [], [{ context: 'S', state: 'success' }]), []);
  assert.equal(st(decideMerge(base({ checkRuns: [run('Unit Tests')] })), 'kötelező'), STATUS.FAIL);
  assert.equal(st(decideMerge(base({ required: [] })), 'kötelező'), STATUS.FAIL);
});

test('decideMerge: nyitott review-szál → FAIL (ellenpróba)', () => {
  const res = decideMerge(base({ threads: [{ isResolved: true }, { isResolved: false }] }));
  assert.equal(st(res, 'lezáratlan'), STATUS.FAIL);
  assert.match(res.find((r) => r.name.startsWith('lezáratlan')).note, /1 nyitott szál/);
});

test('decideMerge (C-61): a main elmozdult + repó-szintű őr / ellenőrzés → FAIL; csak elmozdult → WARN', () => {
  const moved = { mainSha: 'c'.repeat(40) };
  assert.equal(st(decideMerge(base({ ...moved, files: ['source/tests/no-real-emails-guard.test.ts'] })), 'main elmozdulása'), STATUS.FAIL);
  assert.equal(st(decideMerge(base({ ...moved, files: ['scripts/qa/gates/lib.mjs'] })), 'main elmozdulása'), STATUS.FAIL);
  assert.equal(st(decideMerge(base({ ...moved, files: ['source/server/a.ts'] })), 'main elmozdulása'), STATUS.WARN);
  assert.equal(st(decideMerge(base({ ciBaseSha: null, pr: { ...base().pr, baseRefOid: MAIN } })), 'main elmozdulása'), STATUS.PASS, 'tartalék: baseRefOid');
});

test('decideMerge: hiányzó / NEM ítélet → FAIL; FELTÉTELLEL → WARN', () => {
  assert.equal(st(decideMerge(base({ verdict: null })), 'független'), STATUS.FAIL);
  assert.equal(st(decideMerge(base({ verdict: { verdict: 'NEM', source: 'x' } })), 'független'), STATUS.FAIL);
  assert.equal(st(decideMerge(base({ verdict: { verdict: 'IGEN, FELTÉTELLEL', source: 'x' } })), 'független'), STATUS.WARN);
});

test('decideMerge: futásőr 1 / 2 → FAIL', () => {
  assert.equal(st(decideMerge(base({ guard: { code: 1, summary: 'AKTIV=2' } })), 'futásőr'), STATUS.FAIL);
  assert.equal(st(decideMerge(base({ guard: { code: 2, summary: 'GUARD_ERROR' } })), 'futásőr'), STATUS.FAIL);
});

test('decideMerge: /api/rt/status — hálózati hiba FAIL, off PASS, aktív meccs FAIL', () => {
  assert.equal(st(decideMerge(base({ rt: { error: 'fetch failed' } })), 'valós idejű'), STATUS.FAIL);
  assert.equal(st(decideMerge(base({ rt: { json: { mode: 'on', activeMatches: 0 } } })), 'valós idejű'), STATUS.PASS);
  assert.equal(st(decideMerge(base({ rt: { json: { mode: 'admin', activeMatches: 2 } } })), 'valós idejű'), STATUS.FAIL);
});
