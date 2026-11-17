// docs/specs/2026-11-17-kapuk-beepites.md 6. pont: az opt-in git pre-push hook és a telepítője.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HOOK_BODY, MARKER, apply, decide } from './install-git-hooks.mjs';
import { checkPushes, parsePushLines } from './git-pre-push.mjs';

const A = 'a'.repeat(40);
const B = 'b'.repeat(40);
const Z = '0'.repeat(40);

test('parsePushLines: a törlő sor (csupa nulla helyi sha) kimarad, a többi kimenő commit megmarad', () => {
  const p = parsePushLines(`refs/heads/x ${A} refs/heads/x ${Z}\n(delete) ${Z} refs/heads/y ${B}\n\n`);
  assert.deepEqual(p, [{ ref: 'refs/heads/x', sha: A }]);
});

test('checkPushes: zöld pre-push vagy pre-pr → mehet; hiányzó / bukott → hiba a teendővel', () => {
  const ev = { [`pre-push-${A}`]: { ok: true }, [`pre-pr-${B}`]: { ok: false, at: 't' } };
  const read = (n) => ev[n] ?? null;
  assert.deepEqual(checkPushes([{ ref: 'r', sha: A }], read), []);
  const e = checkPushes([{ ref: 'r', sha: B }, { ref: 's', sha: 'c'.repeat(40) }], read);
  assert.equal(e.length, 2);
  assert.ok(e.every((m) => m.includes('npm run gate:push')));
  const pr = checkPushes([{ ref: 'r', sha: B }], (n) => (n === `pre-pr-${B}` ? { ok: true } : null));
  assert.deepEqual(pr, [], 'a zöld pre-pr bizonyíték is elég (a gate:pr a push-kapu lépéseit is futtatja)');
});

test('decide: idegen hook és core.hooksPath mellett nem ír; saját hookot frissít; status nem módosít', () => {
  assert.equal(decide({ action: 'install', hooksPath: '', existing: null }).op, 'write');
  assert.deepEqual([decide({ action: 'install', hooksPath: '', existing: '#!/bin/sh\nmás\n' }).code, decide({ action: 'install', hooksPath: '', existing: '#!/bin/sh\nmás\n' }).op], [1, 'none']);
  assert.equal(decide({ action: 'install', hooksPath: '.husky', existing: null }).code, 1);
  assert.equal(decide({ action: 'install', hooksPath: '', existing: HOOK_BODY }).op, 'none');
  assert.equal(decide({ action: 'install', hooksPath: '', existing: `# ${MARKER} régi` }).op, 'write');
  assert.equal(decide({ action: 'uninstall', hooksPath: '', existing: '#!/bin/sh\nmás\n' }).code, 1);
  assert.equal(decide({ action: 'status', hooksPath: '.husky', existing: null }).op, 'none');
});

test('apply: telepítés, majd eltávolítás archiválással (semmi nem törlődik)', () => {
  const common = mkdtempSync(join(tmpdir(), 'githooks-'));
  const r1 = apply({ action: 'install', commonDir: common, hooksPath: '' });
  assert.equal(r1.code, 0);
  assert.equal(readFileSync(join(common, 'hooks', 'pre-push'), 'utf8'), HOOK_BODY);
  const r2 = apply({ action: 'uninstall', commonDir: common, hooksPath: '', now: new Date('2026-11-17T12:00:00Z') });
  assert.equal(r2.code, 0);
  assert.ok(!existsSync(join(common, 'hooks', 'pre-push')));
  assert.ok(readdirSync(join(common, 'hooks')).some((f) => f.startsWith('pre-push.bak-')), 'archivált példány megmarad');
});

test('apply: idegen hook érintetlen marad', () => {
  const common = mkdtempSync(join(tmpdir(), 'githooks-'));
  mkdirSync(join(common, 'hooks'));
  writeFileSync(join(common, 'hooks', 'pre-push'), '#!/bin/sh\necho idegen\n');
  const r = apply({ action: 'install', commonDir: common, hooksPath: '' });
  assert.equal(r.code, 1);
  assert.equal(readFileSync(join(common, 'hooks', 'pre-push'), 'utf8'), '#!/bin/sh\necho idegen\n');
});
