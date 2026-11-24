import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const ci = readFileSync(new URL('../../../.github/workflows/ci.yml', import.meta.url), 'utf8').replaceAll('\r', '');
const job = name => ci.split(`\n  ${name}:\n`)[1]?.split(/\n  [\w-]+:\n/)[0] ?? '';
test('egyetlen x64 Windows runner teljes telepítéssel és natív próbával', () => {
  const n = job('native-arch');
  assert.match(n, /runs-on: windows-latest\n/);
  assert.doesNotMatch(n, /matrix:/);
  for (const step of ['architecture: x64', "process.arch !== 'x64'", 'run: npm ci', 'run: npm run doctor:arch', 'run: npm test', 'run: npm run build']) assert.ok(n.includes(step), step);
});
test('a kötelező E2E összesítő nem lehet zöld sikertelen natív futás mellett', () => {
  const n = job('e2e-tests');
  assert.match(n, /needs: \[[^\]]*native-arch[^\]]*\]/);
  assert.ok(n.includes('NATIVE_RESULT: ${{ needs.native-arch.result }}'));
  assert.ok(n.includes('test "$NATIVE_RESULT" = "success"'));
});
