// docs/specs/2026-11-23-vak-kor-kivezetes.md: a helyi (GPU) ellenőr tiszta függvényei.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPrompt, decideVerdict, findingId, parseFindings, riskyFiles, splitDiff } from './local-review.mjs';

const DIFF = [
  'diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -1 +1 @@', '-x', '+y',
  'diff --git a/package-lock.json b/package-lock.json', '--- a/package-lock.json', '+++ b/package-lock.json', '@@', '-1', '+2',
  'diff --git a/server/db/migrations/0001.sql b/server/db/migrations/0001.sql', '+++ b/x', '+alter table',
].join('\n');

test('splitDiff: fájlonként bont, a zárfájlt kihagyja, a nagy diffet darabolja', () => {
  const c = splitDiff(DIFF);
  assert.deepEqual(c.map((x) => x.file), ['src/a.ts', 'server/db/migrations/0001.sql']);
  assert.equal(splitDiff(DIFF, 20).filter((x) => x.file === 'src/a.ts').length > 1, true);
});

test('riskyFiles: a migráció kockázatos, a sima forrás és a dokumentáció nem', () => {
  assert.deepEqual(riskyFiles(splitDiff(DIFF)), ['server/db/migrations/0001.sql']);
  assert.deepEqual(riskyFiles([{ file: 'docs/specs/email-terv.md' }]), []);
});

test('buildPrompt: angol megbízás, JSON-válasz, fájlnév benne', () => {
  const p = buildPrompt({ file: 'src/a.ts', text: '+y' });
  assert.match(p, /Reply with JSON only/);
  assert.match(p, /FILE: src\/a\.ts/);
});

test('parseFindings: hibatűrő (szöveggel körülvett JSON, rossz súlyosság → low, üres lelet kiesik)', () => {
  const f = parseFindings('ok: {"verdict":"CONCERNS","findings":[{"line":"3","severity":"HUGE","issue":"x breaks"},{"issue":" "}]}', 'a.ts');
  assert.deepEqual(f, [{ file: 'a.ts', line: 3, severity: 'low', issue: 'x breaks' }]);
  assert.deepEqual(parseFindings('nem json', 'a.ts'), []);
  const cut = '{"verdict":"BLOCK","findings":[{"line":4,"severity":"high","issue":"guard removed"},{"line":9,"severity":"low","iss';
  assert.deepEqual(parseFindings(cut, 'b.ts'), [{ file: 'b.ts', line: 4, severity: 'high', issue: 'guard removed' }]);
});

test('decideVerdict: high → NEM, cáfolt high nem számít, csak low → FELTÉTELLEL, semmi → IGEN', () => {
  const hi = { file: 'a', line: 1, severity: 'high', issue: 'h' };
  hi.id = findingId(hi);
  const lo = { file: 'a', line: 2, severity: 'low', issue: 'l', id: 'x' };
  assert.equal(decideVerdict([hi, lo]), 'NEM');
  assert.equal(decideVerdict([hi, lo], new Set([hi.id])), 'IGEN, FELTÉTELLEL');
  assert.equal(decideVerdict([]), 'IGEN');
});
