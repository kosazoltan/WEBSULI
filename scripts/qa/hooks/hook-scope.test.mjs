// docs/specs/2026-11-23-h0-dontesek-atvezetese.md H3 (P-057, tulajdonosi döntés 2026-11-23): a projekt-helyi .claude/settings.json
// verziókezelt marad; a hookok szűk matcherrel futnak; egy hook hibája csak a saját lépését tilthatja (onFailure csak a kapu-hookon).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hookScopeViolations, settingsTracked } from './hook-scope.mjs';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const settings = JSON.parse(readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'));
const clone = () => JSON.parse(JSON.stringify(settings));

test('P-057: a valódi .claude/settings.json megfelel — szűk matcherek, onFailure csak a kapu-hookon', () => {
  assert.deepEqual(hookScopeViolations(settings), []);
});

test('P-057: a .claude/settings.json verziókezelt és nem ignorált', () => {
  assert.deepEqual(settingsTracked(repoRoot), { tracked: true, ignored: false });
});

test('P-057 mutációk: üres, helyettesítő karakteres és ismeretlen eszközös matcher jelzett', () => {
  for (const matcher of ['', '*', '.*', 'Bash|.*', 'Read', 'mcp__.*', undefined]) {
    const s = clone();
    if (matcher === undefined) delete s.hooks.PreToolUse[0].matcher; else s.hooks.PreToolUse[0].matcher = matcher;
    const v = hookScopeViolations(s);
    assert.ok(v.some((x) => /matcher/.test(x)), `nem jelzett matcher: ${JSON.stringify(matcher)}`);
  }
});

test('P-057 mutáció: onFailure más hookon (a hibája minden munkát megállítana) jelzett; a kapu-hookon nem', () => {
  const s = clone();
  const destructive = s.hooks.PreToolUse.find((g) => g.hooks.some((h) => /check-destructive\.mjs/.test(h.command)));
  destructive.hooks[0].onFailure = 'block';
  assert.ok(hookScopeViolations(s).some((x) => /onFailure/.test(x) && /check-destructive/.test(x)));
});

test('P-057 mutáció: a PostToolUse-on álló hook is szűk matchert kér', () => {
  const s = clone();
  s.hooks.PostToolUse = [{ matcher: '.*', hooks: [{ type: 'command', command: 'node x.mjs' }] }];
  assert.ok(hookScopeViolations(s).some((x) => /PostToolUse/.test(x) && /matcher/.test(x)));
});
