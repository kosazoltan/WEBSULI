// docs/specs/2026-11-17-minosegkapuk.md E4: a szakasz-kapu teszt-leképezése és futása.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STATUS, loadConfig } from './lib.mjs';
import { finalizeStage, mapTests, runStageSteps, stemOf } from './stage-gate.mjs';
import { fakeCtx, statusOf } from './_fake.mjs';

const cfg = loadConfig();
const TESTS = ['tests/question-director.test.ts', 'tests/tsunami-core.test.ts', 'tests/tornado-math4.test.ts', 'tests/coupon-clock.test.ts',
  'tests/import-only.test.ts', 'tests/mojibake-guard.test.ts'];
const TEXT = { 'tests/import-only.test.ts': 'import { x } from "../server/gameQuizBankService";' };
const read = (t) => TEXT[t] ?? '';
const map = (changed) => mapTests({ changed, testFiles: TESTS, readTest: read, games: cfg.games, sharedGamePatterns: cfg.sharedGamePatterns });

test('stemOf: törzs kiterjesztés nélkül; index → a mappa neve', () => {
  assert.equal(stemOf('source/client/src/game-engine/play/questionDirector.ts'), 'questionDirector');
  assert.equal(stemOf('source/server/realtime/index.ts'), 'realtime');
});

test('mapTests: névtő (kebab), import-keresés, változott teszt önmaga', () => {
  assert.deepEqual(map(['source/client/src/game-engine/play/questionDirector.ts']).tests.includes('tests/question-director.test.ts'), true);
  assert.deepEqual(map(['source/server/gameQuizBankService.ts']).tests, ['tests/import-only.test.ts']);
  assert.deepEqual(map(['source/tests/coupon-clock.test.ts']).tests, ['tests/coupon-clock.test.ts']);
});

test('mapTests: játék-csoport — a játék fájlja a játék tesztjeit hozza; a közös játékmotor minden játékét', () => {
  assert.deepEqual(map(['source/client/src/pages/TsunamiEscapeEnglish.tsx']).tests, ['tests/tsunami-core.test.ts']);
  const shared = map(['source/client/src/game-engine/mobile/layout.ts']).tests;
  assert.ok(shared.includes('tests/tsunami-core.test.ts') && shared.includes('tests/tornado-math4.test.ts'));
});

test('mapTests: teszt nélküli fájl → unmapped (figyelmeztetés); a nem-source fájl nem számít', () => {
  const r = map(['source/server/ujModulXyz.ts', 'docs/a.md', 'source/client/src/index.css']);
  assert.deepEqual(r.unmapped, ['source/server/ujModulXyz.ts']);
  assert.deepEqual(r.tests, []);
});

test('runStageSteps: célzott + minden őr-teszt egy futásban; hiányzó leképezés WARN; scripts/qa érintésnél a saját tesztek is', async () => {
  const { ctx, calls, gate, root } = fakeCtx({ changed: ['source/server/ujModulXyz.ts', 'source/tests/coupon-clock.test.ts', 'scripts/qa/gates/lib.mjs'] });
  for (const t of ['coupon-clock.test.ts', 'mojibake-guard.test.ts', 'other.test.ts']) writeFileSync(join(root, 'source', 'tests', t), '');
  await runStageSteps({ gate, ctx, changed: ['source/server/ujModulXyz.ts', 'source/tests/coupon-clock.test.ts', 'scripts/qa/gates/lib.mjs'] });
  assert.equal(statusOf(gate, 'célzott teszt-leképezés'), STATUS.WARN);
  const unit = calls.find((c) => c.cmd === 'node' && c.args.includes('--import'));
  assert.deepEqual(unit.args.slice(3).sort(), ['tests/coupon-clock.test.ts', 'tests/mojibake-guard.test.ts']);
  assert.ok(calls.some((c) => c.cmd === 'node' && c.args[0] === '--test'), 'scripts/qa tesztek');
  assert.equal(gate.finish(), 0);
});

test('runStageSteps: bukó egységteszt → FAIL', async () => {
  const { ctx, gate } = fakeCtx({ changed: ['source/tests/coupon-clock.test.ts'], respond: (cmd, args) => (cmd === 'node' && args.includes('--import') ? { code: 1, stdout: 'not ok 1 - x' } : undefined) });
  await runStageSteps({ gate, ctx, changed: ['source/tests/coupon-clock.test.ts'] });
  assert.equal(statusOf(gate, 'egységtesztek'), STATUS.FAIL);
  assert.equal(gate.finish(), 1);
});

test('finalizeStage (szkriptkapuk P2, vak review P2-K8): a stage-<fej> rekord íródik; írási hibánál nem nulla kód', () => {
  const H = 'c'.repeat(40);
  const calls = [];
  const ok = finalizeStage({ evDir: 'ev', head: H, code: 0, dirty: true, results: [{ name: 'a', status: 'PASS' }], append: (d, n, r) => calls.push([n, r]), now: () => new Date('2026-11-19T00:00:00Z') });
  assert.deepEqual(ok, { code: 0 });
  assert.equal(calls.length, 1, 'a rekord íródik');
  assert.equal(calls[0][0], `stage-${H}`);
  assert.deepEqual([calls[0][1].ok, calls[0][1].dirty, calls[0][1].steps], [true, true, [{ name: 'a', status: 'PASS' }]]);
  const bad = finalizeStage({ evDir: 'ev', head: H, code: 0, dirty: false, results: [], append: () => { throw new Error('lemez tele\nx'); } });
  assert.deepEqual(bad, { code: 2, error: 'lemez tele' });
  assert.equal(finalizeStage({ evDir: 'ev', head: H, code: 1, dirty: false, results: [], append: () => { throw new Error('x'); } }).code, 1, 'bukott kapu kódja marad');
});
