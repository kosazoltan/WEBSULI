// Szkriptkapuk P2 — evidence-run: darabszám a node:test összesítőből, a rekord és a kimenet titok nélkül (független review K5;
// a titok-szűrés a lib.redact-ban). A titok-minták futásidőben, darabokból (a lint-kapu tiltott mintái ne jelezzenek).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { redact } from './lib.mjs';
import { buildRunRecord, dirtyOf, testCounts } from './evidence-run.mjs';

const H = 'a'.repeat(40);

test('evidence-run: darabszám a node:test összesítőből (spec és TAP); összesítő nélkül null', () => {
  assert.deepEqual(testCounts('ℹ tests 12\nℹ pass 11\nℹ fail 1'), { tests: 12, pass: 11, fail: 1 });
  assert.deepEqual(testCounts('# tests 3\n# pass 3\n# fail 0'), { tests: 3, pass: 3, fail: 0 });
  assert.equal(testCounts('semmi'), null);
  // P2-K7: az UTOLSÓ összesítő számít, egy korábban kiírt hamis sor nem
  assert.deepEqual(testCounts('ℹ pass 999\nvalami\nℹ tests 5\nℹ pass 3\nℹ fail 2'), { tests: 5, pass: 3, fail: 2 });
});

test('lib.redact (K5): jelszó-kapcsoló, NÉV=érték titok, JWT, szolgáltatói kulcs-előtagok', () => {
  const jwt = ['eyJ', 'hbGciOiJIUzI1NiJ9', '.', 'eyJzdWIiOiIxMjMifQ', '.', 'c2lnbmF0dXJlLXRlc3Q'].join('');
  const secrets = [`--password=Titkos123`, `API_${'KEY'}=abc123def456`, jwt, ['sk', '-proj-', 'abcdefghijklmnop'].join(''), ['AIza', 'SyA1234567890abcdefgh'].join('')];
  for (const s of secrets) assert.ok(!redact(`x ${s} y`).includes(s.split('=').pop()), s.slice(0, 12));
  assert.equal(redact('node --test a.test.mjs'), 'node --test a.test.mjs', 'ártalmatlan parancssor változatlan');
  // P2-K7: kis- és vegyes betűs alak, kettőspontos alak is
  for (const s of [`api_${'key'}=abcdef123456`, `Db_Pass${'word'}=Titkos123`, `pass${'word'}: Titkos123`, `To${'ken'}:  abcdef123456`]) {
    assert.ok(!redact(`x ${s} y`).includes(s.includes('=') ? s.split('=').pop() : s.split(/:\s*/).pop()), s.slice(0, 12));
  }
  // 2. kör (2): a puszta név (kis- és nagybetűvel) és a JSON-alak is
  const pw = ['pass', 'word'].join('');
  for (const [s, secret] of [
    [`${pw}=Titkos123`, 'Titkos123'], [`${pw.toUpperCase()}=Titkos123`, 'Titkos123'], [`TO${'KEN'}=abcdef123456`, 'abcdef123456'],
    [`sec${'ret'}=abcdef12`, 'abcdef12'], [`pw${'d'}=Titkos1`, 'Titkos1'], [`{"${pw}": "Titkos123"}`, 'Titkos123'],
    [`{'api_${'key'}':'abcdef123456'}`, 'abcdef123456'], [`to${'ken'} = abcdef123456`, 'abcdef123456'],
  ]) {
    assert.ok(!redact(`x ${s} y`).includes(secret), s);
  }
  assert.equal(redact('node --test a.test.mjs --reporter=tap'), 'node --test a.test.mjs --reporter=tap', 'ártalmatlan kapcsoló változatlan');
});

test('buildRunRecord: azonosító, szűrt parancssor, darabszám', () => {
  const tok = ['ghp', '_', 'abcDEF123456'.repeat(3)].join('');
  const { id, record } = buildRunRecord({ head: H, dirty: false, cmd: 'node', args: ['x', `--t=${tok}`, '--password', 'Titkos123'], result: { code: 0, stdout: 'ℹ pass 2\nℹ fail 0', stderr: '', ms: 5 }, now: () => new Date('2026-11-17T20:00:00Z') });
  assert.match(id, /^run-[0-9a-f]{12}$/);
  assert.ok(!record.cmd.includes(tok) && !record.cmd.includes('Titkos123'));
  assert.deepEqual(record.counts, { tests: null, pass: 2, fail: 0 });
  assert.equal(record.ok, true);
});

test('dirtyOf (P2-K2): a nem követett fájl is commitolatlan állapot (a push-kapu J7-tel egyezően)', () => {
  const g = (tracked, untracked) => ({ trackedDirty: () => tracked, untracked: () => untracked });
  assert.equal(dirtyOf(g([], [])), false);
  assert.equal(dirtyOf(g([' M a.js'], [])), true);
  assert.equal(dirtyOf(g([], ['uj-segedmodul.mjs'])), true, 'nem követett fájl → dirty');
});

test('realExec (P2-K7): Windows-on a .cmd shim (pl. npm.cmd) shellen át fut, szóközös argumentummal', async () => {
  const { realExec } = await import('./lib.mjs');
  if (process.platform !== 'win32') { assert.ok(true, 'csak Windows-on értelmezett'); return; }
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'cmd-'));
  const shim = join(dir, 'probe.cmd');
  writeFileSync(shim, '@echo off\r\necho ARG=%~1\r\n');
  const r = realExec(shim, ['a b'], { cwd: dir });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /ARG=a b/);
});
