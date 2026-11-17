// docs/specs/2026-11-17-minosegkapuk.md E5, E6, D10: a push előtti kapu döntései.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS, loadConfig } from './lib.mjs';
import { auditStatus, decideNativeArch, parseTapFailures, rollupState, runPrePushSteps, sharedTouched, NATIVE_ARCH_TEST } from './pre-push-gate.mjs';
import { fakeCtx, statusOf } from './_fake.mjs';

const TAP = [
  'TAP version 13',
  '# Subtest: jó', 'ok 1 - jó',
  '# Subtest: a natív függőségek', 'not ok 2 - a natív függőségek az aktuális architektúrához települtek', '  ---', '  duration_ms: 12',
  "  location: 'D:\\\\repo\\\\WEBSULI\\\\source\\\\tests\\\\native-arch.test.ts:12:1'", '  failureType: testCodeFailure', '  ...',
  '# Subtest: belső', '    not ok 1 - beágyazott (nem legfelső szint)',
  'ok 3 - más',
].join('\n');

test('parseTapFailures: a legfelső szintű bukás fájlja a location-ből; betöltési hibánál a név', () => {
  assert.deepEqual(parseTapFailures(TAP), [NATIVE_ARCH_TEST]);
  assert.deepEqual(parseTapFailures('not ok 1 - tests/broken-load.test.ts\nok 2 - x'), ['broken-load.test.ts']);
  const two = `${TAP}\nnot ok 4 - más bukás\n  ---\n  location: '/home/r/source/tests/coupon-clock.test.ts:3:1'\n  ...`;
  assert.deepEqual(parseTapFailures(two), ['coupon-clock.test.ts', NATIVE_ARCH_TEST]);
});

test('decideNativeArch (D10): csak native-arch + bukó doctor:arch → KIVÉTEL; minden más → FAIL', () => {
  assert.equal(decideNativeArch({ failures: [NATIVE_ARCH_TEST], doctorCode: 1 }).status, STATUS.EXCEPTION);
  assert.match(decideNativeArch({ failures: [NATIVE_ARCH_TEST], doctorCode: 1 }).note, /C-38/);
  assert.equal(decideNativeArch({ failures: [NATIVE_ARCH_TEST], doctorCode: 0 }).status, STATUS.FAIL, 'zöld doctor:arch mellett nem kivétel');
  assert.equal(decideNativeArch({ failures: [NATIVE_ARCH_TEST, 'coupon-clock.test.ts'], doctorCode: 1 }).status, STATUS.FAIL, 'más bukás mellett nem kivétel');
  assert.equal(decideNativeArch({ failures: [], doctorCode: 1 }).status, STATUS.FAIL);
});

test('sharedTouched: a közös fájl mindig, a szelet-modul csak --slice mellett', () => {
  const cfg = loadConfig();
  const changed = ['docs/agent-csapdak.md', 'source/client/src/game-engine/play/x.ts', 'source/server/a.ts'];
  assert.deepEqual(sharedTouched(changed, cfg, false), ['docs/agent-csapdak.md']);
  assert.deepEqual(sharedTouched(changed, cfg, true), ['docs/agent-csapdak.md', 'source/client/src/game-engine/play/x.ts']);
});

test('auditStatus: hiányzó vagy 10 percnél régebbi jelzőfájl elavult', () => {
  const now = 1_000_000_000;
  const m = { a: now - 5 * 60000, b: now - 11 * 60000, c: null };
  assert.deepEqual(auditStatus({ paths: ['a', 'b', 'c'], now, maxAgeMinutes: 10, mtimeOf: (p) => m[p] }), ['b', 'c']);
});

test('rollupState: zöld / fut / piros / nincs', () => {
  const ok = { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' };
  assert.equal(rollupState([ok, { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SKIPPED' }, { __typename: 'StatusContext', state: 'SUCCESS' }]), 'green');
  assert.equal(rollupState([ok, { __typename: 'CheckRun', status: 'IN_PROGRESS', conclusion: '' }]), 'pending');
  assert.equal(rollupState([ok, { __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'FAILURE' }]), 'red');
  assert.equal(rollupState([]), 'none');
});

function prePushFake({ respond, ...rest } = {}) {
  return fakeCtx({
    changed: ['docs/a.md'],
    ...rest,
    respond: (cmd, args) => {
      const own = respond?.(cmd, args);
      if (own) return own;
      if (cmd === 'gh' && args[0] === '--version') return { code: 0 };
      if (cmd === 'gh' && args[1] === 'list') return { code: 0, stdout: JSON.stringify([{ number: 42, headRefOid: 'e'.repeat(40) }]) };
      if (cmd === 'gh' && args[1] === 'view') return { code: 0, stdout: JSON.stringify({ statusCheckRollup: [{ __typename: 'CheckRun', status: 'COMPLETED', conclusion: 'SUCCESS' }] }) };
      return undefined;
    },
  });
}

test('runPrePushSteps: zöld CI-jű nyitott PR → NAGYBETŰS figyelmeztetés; gh nélkül SKIP', async () => {
  const { ctx, gate } = prePushFake();
  await runPrePushSteps({ gate, ctx });
  const r = gate.results.find((x) => x.name.startsWith('zöld CI utáni push'));
  assert.equal(r.status, STATUS.WARN);
  assert.match(r.note, /ÚJRAINDÍTJA AZ ~1 ÓRÁS PLAYWRIGHT E2E-T/);
  const g2 = fakeCtx({ changed: ['docs/a.md'], respond: (cmd) => (cmd === 'gh' ? { code: 127, stderr: 'nincs gh' } : undefined) });
  await runPrePushSteps({ gate: g2.gate, ctx: g2.ctx });
  assert.equal(statusOf(g2.gate, 'zöld CI utáni push'), STATUS.SKIP);
});

test('runPrePushSteps: commitolatlan változás → FAIL; bukó háromfázisú ellenőrzés → FAIL', async () => {
  const { ctx, gate } = prePushFake({
    dirty: [' M source/server/x.ts'],
    respond: (cmd, args) => (cmd === 'node' && String(args[0]).endsWith('three-phase-check.mjs') ? { code: 1, stdout: '[három-fázis] HIBA: Nincs végrehajtási utasítás' } : undefined),
  });
  await runPrePushSteps({ gate, ctx });
  assert.equal(statusOf(gate, 'tiszta munkafa'), STATUS.FAIL);
  assert.equal(statusOf(gate, 'háromfázisú rend'), STATUS.FAIL);
  assert.equal(gate.finish(), 1);
});

test('review J7 / J13: nem követett fájl → FAIL; scripts/qa változásnál a saját tesztek is futnak', async () => {
  const { ctx, gate, calls } = prePushFake({ changed: ['scripts/qa/gates/lib.mjs'], untracked: ['uj-modul.ts'] });
  await runPrePushSteps({ gate, ctx });
  assert.equal(statusOf(gate, 'tiszta munkafa'), STATUS.FAIL);
  assert.match(gate.results.find((r) => r.name.startsWith('tiszta munkafa')).note, /nem követett fájl/);
  assert.equal(statusOf(gate, 'scripts/qa saját tesztjei'), STATUS.PASS);
  assert.ok(calls.some((c) => c.cmd === 'node' && c.args[0] === '--test'));
});

test('runPrePushSteps: native-arch az egyetlen bukás + bukó doctor:arch → KIVÉTEL, a kapu zöld marad', async () => {
  const { ctx, gate } = prePushFake({
    respond: (cmd, args) => {
      if (cmd === 'node' && args.includes('--test-reporter=tap')) return { code: 1, stdout: TAP };
      if (cmd === 'npm' && args.join(' ') === 'run doctor:arch') return { code: 1 };
      return undefined;
    },
  });
  await runPrePushSteps({ gate, ctx });
  assert.equal(statusOf(gate, 'teljes egységteszt'), STATUS.EXCEPTION);
  assert.equal(gate.finish(), 0);
});
