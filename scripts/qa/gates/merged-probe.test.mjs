// Kapu-gyorsítás (docs/specs/2026-11-19-kapu-gyorsitas.md A): az összefésült próba tesztválasztása és darabszáma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectProbeTests, tapCounts } from './merged-probe.mjs';

test('selectProbeTests: a PR-ből a node-os egységtesztek és a scripts/qa tesztek; őr, integrációs, e2e és törölt fájl nem', () => {
  const files = [
    'source/tests/a.test.ts', 'source/tests/b-guard.test.ts', 'source/tests/c.integration.ts', 'source/tests/d.spec.ts',
    'source/tests/sub/e.test.ts', 'scripts/qa/gates/x.test.mjs', 'scripts/qa/y.test.mjs', 'scripts/qa/gates/x.mjs', 'docs/a.md',
    'source/tests/torolt.test.ts',
  ];
  const exists = (p) => p !== 'source/tests/torolt.test.ts';
  assert.deepEqual(selectProbeTests(files, exists), {
    unit: ['tests/a.test.ts'],
    qa: ['scripts/qa/gates/x.test.mjs', 'scripts/qa/y.test.mjs'],
  });
  assert.deepEqual(selectProbeTests([], exists), { unit: [], qa: [] });
});

test('tapCounts: az UTOLSÓ TAP-összesítő; összesítő nélkül null', () => {
  assert.deepEqual(tapCounts('# pass 999\nx\n# tests 5\n# pass 4\n# fail 1'), { tests: 5, pass: 4, fail: 1 });
  assert.equal(tapCounts('semmi'), null);
});
