// docs/specs/2026-11-18-vak-hibakereso-ellenor.md V10: a PR-leírás ítélet-sora a jelenlegi fejre (CI-ba köthető szkript).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPrVerdict, prFromEvent } from './pr-verdict-check.mjs';

const HEAD = '0123456789abcdef0123456789abcdef01234567';
const OTHER = 'fedcba9876543210fedcba9876543210fedcba98';
const line = (v, h = HEAD) => `Független ellenőr ítélete: ${v} (fej: ${h.slice(0, 12)})`;
const script = fileURLToPath(new URL('./pr-verdict-check.mjs', import.meta.url));

test('IGEN / IGEN, FELTÉTELLEL a jelenlegi fejre → ok', () => {
  assert.equal(checkPrVerdict({ body: `# PR\n\n${line('IGEN')}\n`, head: HEAD }).ok, true);
  assert.equal(checkPrVerdict({ body: line('IGEN, FELTÉTELLEL'), head: HEAD }).ok, true);
});

test('hiányzó sor, régi fejre szóló sor, NEM ítélet, hiányzó / hibás fej → nem ok, teendővel', () => {
  for (const [body, head] of [['nincs ítélet', HEAD], [line('IGEN', OTHER), HEAD], [line('NEM'), HEAD], [null, HEAD], [line('IGEN'), null], [line('IGEN'), 'abc']]) {
    const r = checkPrVerdict({ body, head });
    assert.equal(r.ok, false, JSON.stringify({ body, head }));
    assert.ok(r.note.length > 10);
  }
  assert.match(checkPrVerdict({ body: 'x', head: HEAD }).note, /Vak hibakereső ellenőr/);
  // több sor esetén a jelenlegi fejre szóló utolsó számít
  assert.equal(checkPrVerdict({ body: `${line('IGEN', OTHER)}\n${line('NEM')}`, head: HEAD }).ok, false);
});

test('prFromEvent: a pull_request esemény leírása és fej-SHA-ja', () => {
  assert.deepEqual(prFromEvent({ pull_request: { body: 'b', head: { sha: HEAD } } }), { body: 'b', head: HEAD });
  assert.deepEqual(prFromEvent({}), { body: '', head: null });
});

test('folyamat-szinten: --event fájlból; 0 / 1 / 2 kilépés', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pvc-'));
  const ev = (obj) => { const p = join(dir, `${Math.random()}.json`); writeFileSync(p, JSON.stringify(obj)); return p; };
  const run = (args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  assert.equal(run(['--event', ev({ pull_request: { body: line('IGEN'), head: { sha: HEAD } } })]).status, 0);
  const bad = run(['--event', ev({ pull_request: { body: line('IGEN', OTHER), head: { sha: HEAD } } })]);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /BUKOTT/);
  assert.equal(run(['--event', join(dir, 'nincs.json')]).status, 2);
  assert.equal(run(['--event', ev({ push: {} })]).status, 0, 'nem PR-esemény: nincs mit ellenőrizni');
  assert.ok(execFileSync(process.execPath, ['--check', script]) !== undefined);
});
