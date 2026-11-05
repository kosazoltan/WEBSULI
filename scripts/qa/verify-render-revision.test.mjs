// docs/specs/2026-11-05-render-telepites.md — a várt Render-revízió kiszámítása és összevetése.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { compareRevisions, deployPathspec } from './verify-render-revision.mjs';

test('összevetés: egyezés 0, eltérés 1, hiányzó adat 2', () => {
  assert.equal(compareRevisions({ expected: 'a'.repeat(40), live: 'a'.repeat(40), uptimeSec: 120 }).code, 0);
  assert.equal(compareRevisions({ expected: 'a'.repeat(40), live: 'b'.repeat(40) }).code, 1);
  assert.equal(compareRevisions({ expected: '', live: 'b'.repeat(40) }).code, 2);
});

test('a pathspec a source/-t nézi, a Render build-szűrő kizárt útvonalai nélkül', () => {
  const spec = deployPathspec();
  assert.equal(spec[0], 'source');
  for (const p of ['docs/**', '**/*.md', 'source/tests/**', '.github/**']) assert.ok(spec.includes(`:(exclude,glob)${p}`), p);
  // A git elfogadja a pathspecet (érvénytelen magic esetén hibával kilépne).
  execFileSync('git', ['log', '-1', '--format=%H', 'HEAD', '--', ...spec], { encoding: 'utf8' });
});
