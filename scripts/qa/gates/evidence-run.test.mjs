// Szkriptkapuk P2 — evidence-run: darabszám a node:test összesítőből, a rekord és a kimenet titok nélkül (független review K5;
// a titok-szűrés a lib.redact-ban). A titok-minták futásidőben, darabokból (a lint-kapu tiltott mintái ne jelezzenek).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redact } from './lib.mjs';
import { buildRunRecord, testCounts } from './evidence-run.mjs';

const H = 'a'.repeat(40);

test('evidence-run: darabszám a node:test összesítőből (spec és TAP); összesítő nélkül null', () => {
  assert.deepEqual(testCounts('ℹ tests 12\nℹ pass 11\nℹ fail 1'), { tests: 12, pass: 11, fail: 1 });
  assert.deepEqual(testCounts('# tests 3\n# pass 3\n# fail 0'), { tests: 3, pass: 3, fail: 0 });
  assert.equal(testCounts('semmi'), null);
});

test('lib.redact (K5): jelszó-kapcsoló, NÉV=érték titok, JWT, szolgáltatói kulcs-előtagok', () => {
  const jwt = ['eyJ', 'hbGciOiJIUzI1NiJ9', '.', 'eyJzdWIiOiIxMjMifQ', '.', 'c2lnbmF0dXJlLXRlc3Q'].join('');
  const secrets = [`--password=Titkos123`, `API_${'KEY'}=abc123def456`, jwt, ['sk', '-proj-', 'abcdefghijklmnop'].join(''), ['AIza', 'SyA1234567890abcdefgh'].join('')];
  for (const s of secrets) assert.ok(!redact(`x ${s} y`).includes(s.split('=').pop()), s.slice(0, 12));
  assert.equal(redact('node --test a.test.mjs'), 'node --test a.test.mjs', 'ártalmatlan parancssor változatlan');
});

test('buildRunRecord: azonosító, szűrt parancssor, darabszám', () => {
  const tok = ['ghp', '_', 'abcDEF123456'.repeat(3)].join('');
  const { id, record } = buildRunRecord({ head: H, dirty: false, cmd: 'node', args: ['x', `--t=${tok}`, '--password', 'Titkos123'], result: { code: 0, stdout: 'ℹ pass 2\nℹ fail 0', stderr: '', ms: 5 }, now: () => new Date('2026-11-17T20:00:00Z') });
  assert.match(id, /^run-[0-9a-f]{12}$/);
  assert.ok(!record.cmd.includes(tok) && !record.cmd.includes('Titkos123'));
  assert.deepEqual(record.counts, { tests: null, pass: 2, fail: 0 });
  assert.equal(record.ok, true);
});
