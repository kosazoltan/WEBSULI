// docs/specs/2026-11-05-render-telepites.md — a várt Render-revízió kiszámítása és összevetése.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { argValue, compareRevisions, deployPathspec, expectedRevisionArgs } from './verify-render-revision.mjs';

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

// Review #401 (Copilot): hiányzó kapcsolóérték → tartalék, nem undefined.
test('kapcsolóérték: megadott, hiányzó, másik kapcsoló utána', () => {
  assert.equal(argValue(['node', 's', '--url', 'https://x/h'], '--url', 'D'), 'https://x/h');
  assert.equal(argValue(['node', 's', '--url'], '--url', 'D'), 'D');
  assert.equal(argValue(['node', 's', '--url', '--ref', 'main'], '--url', 'D'), 'D');
  assert.equal(argValue(['node', 's'], '--url', 'D'), 'D');
});

// Review #401 (Codex P2, Vercel): merge committal összevont source/-változásnál a merge commit a várt revízió.
test('merge commit: a main merge commitja a várt revízió, nem az oldalágé', () => {
  const dir = mkdtempSync(join(tmpdir(), 'render-rev-'));
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('commit', '-q', '--allow-empty', '-m', 'init');
  git('switch', '-q', '-c', 'f');
  mkdirSync(join(dir, 'source'));
  writeFileSync(join(dir, 'source', 'x.ts'), 'a');
  git('add', '.');
  git('commit', '-q', '-m', 'side');
  git('switch', '-q', 'main');
  git('merge', '-q', '--no-ff', 'f', '-m', 'merge');
  const merge = git('rev-parse', 'HEAD');
  assert.equal(execFileSync('git', expectedRevisionArgs('main'), { cwd: dir, encoding: 'utf8' }).trim(), merge);
});
