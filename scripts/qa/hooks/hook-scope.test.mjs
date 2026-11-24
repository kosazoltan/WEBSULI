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

test('P-057 mutáció (PR #548 Sourcery): a disableAllHooks: true jelzett — minden biztonsági hook kikapcsolna', () => {
  const s = clone();
  s.disableAllHooks = true;
  assert.ok(hookScopeViolations(s).some((x) => /disableAllHooks/.test(x)));
});

test('P-057 mutáció (PR #548 Sourcery): a romboló/audit/kapu hook PreToolUse-ról áthelyezve jelzett (utólag már nem állít meg)', () => {
  for (const name of ['check-destructive.mjs', 'check-audit-ok.mjs', 'check-quality-gates.mjs', 'enforce-repo-rules.mjs']) {
    const s = clone();
    const moved = s.hooks.PreToolUse.filter((g) => g.hooks.some((h) => h.command.includes(name)));
    s.hooks.PreToolUse = s.hooks.PreToolUse.filter((g) => !moved.includes(g));
    s.hooks.PostToolUse = moved;
    const v = hookScopeViolations(s);
    assert.ok(v.some((x) => x.includes(name) && /PreToolUse/.test(x)), `nem jelzett áthelyezés: ${name}`);
  }
});

test('P-057 mutáció (PR #548 Sourcery): a romboló hook a PowerShell-ágról hiányzik → jelzett', () => {
  const s = clone();
  s.hooks.PreToolUse = s.hooks.PreToolUse.filter(
    (g) => !(g.matcher === 'PowerShell' && g.hooks.some((h) => h.command.includes('check-destructive.mjs'))),
  );
  assert.ok(hookScopeViolations(s).some((x) => x.includes('check-destructive.mjs') && /PowerShell/.test(x)));
});

test('P-057 mutáció (PR #548 Sourcery): onFailure csak a PONTOS kapu-hook parancson; a nevet tartalmazó más parancs jelzett', () => {
  for (const command of [
    'node "${CLAUDE_PROJECT_DIR}/scripts/qa/hooks/check-quality-gates.mjs" && node x.mjs',
    'node "${CLAUDE_PROJECT_DIR}/scripts/qa/hooks/enforce-repo-rules.mjs" # check-quality-gates.mjs',
    'node other/check-quality-gates.mjs',
  ]) {
    const s = clone();
    s.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [{ type: 'command', command, onFailure: 'block' }] });
    assert.ok(hookScopeViolations(s).some((x) => /onFailure/.test(x)), `nem jelzett: ${command}`);
  }
});

test('P-057 mutáció (PR #548 Sourcery): csak a jóváhagyott egyedi matcherek és az Edit|Write pár — más kombináció jelzett', () => {
  for (const matcher of ['Bash|PowerShell', 'Bash|Edit', 'Edit|Write|Bash', 'Write|Edit', 'Edit|Write|MultiEdit', 'Bash|Bash']) {
    const s = clone();
    s.hooks.PreToolUse[0].matcher = matcher;
    assert.ok(hookScopeViolations(s).some((x) => /matcher/.test(x)), `nem jelzett matcher: ${matcher}`);
  }
  for (const matcher of ['Bash', 'PowerShell', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Edit|Write']) {
    const s = clone();
    s.hooks.PreToolUse[2].matcher = matcher;
    assert.deepEqual(hookScopeViolations(s).filter((x) => /matcher/.test(x)), [], `tévesen jelzett: ${matcher}`);
  }
});

test('P-057 mutáció: a PostToolUse-on álló hook is szűk matchert kér', () => {
  const s = clone();
  s.hooks.PostToolUse = [{ matcher: '.*', hooks: [{ type: 'command', command: 'node x.mjs' }] }];
  assert.ok(hookScopeViolations(s).some((x) => /PostToolUse/.test(x) && /matcher/.test(x)));
});
