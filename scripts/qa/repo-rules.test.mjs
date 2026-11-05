// docs/specs/2026-11-05-hookspath-tiltas.md: a repo-rules.json szabályai az enforce-repo-rules hookon át.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const hook = fileURLToPath(new URL('./hooks/enforce-repo-rules.mjs', import.meta.url));
const run = (command) => {
  const out = execFileSync(process.execPath, [hook], { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }), encoding: 'utf8' });
  return out ? JSON.parse(out) : null;
};
const denied = (r) => r?.hookSpecificOutput?.permissionDecision === 'deny';

test('a core.hooksPath felülírása parancssorból tiltott (mint a --no-verify), idézőjellel is', () => {
  for (const c of ['git -c core.hooksPath=/dev/null commit -q -m x', 'git -c core.hookspath=/tmp/x push origin main', 'git -c  core.hooksPath= merge main',
    "git -c 'core.hooksPath=/dev/null' commit -m x", 'git -c "core.hooksPath=/dev/null" commit -m x',
    // Review #398 (Sourcery): ugyanez --config-env-vel és GIT_CONFIG_* környezeti változókkal.
    'git --config-env=core.hooksPath=HP commit -m x', 'git --config-env core.hooksPath=HP push',
    'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.hooksPath GIT_CONFIG_VALUE_0=/dev/null git commit -m x',
    `GIT_CONFIG_PARAMETERS="'core.hooksPath'='/dev/null'" git commit -m x`,
    // Review #398 (Vercel): a core.hooksPath nem az első beállítás a GIT_CONFIG_PARAMETERS-ben.
    `GIT_CONFIG_PARAMETERS="'user.name'='A' 'core.hooksPath'='/dev/null'" git commit -m x`]) {
    assert.ok(denied(run(c)), c);
  }
  assert.ok(denied(run('git commit --no-verify -m x')), 'a meglévő --no-verify tiltás megmarad');
});

// Review #398 (Codex P1, Vercel): a kit hookja az első WARN-nál kilép — ezért repo-szabály nem lehet WARN, különben elnyomná a
// későbbi DENY-t. Egy ártalmatlan core.hooksPath-lekérdezés mellett is tiltott marad a --no-verify.
test('a core.hooksPath lekérdezése nem nyomja el a --no-verify tiltást; a szokásos git-parancsok szabadok', () => {
  assert.ok(denied(run('git config --get core.hooksPath; git commit --no-verify -m x')));
  for (const c of ['git config --get core.hooksPath', 'GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=user.name GIT_CONFIG_VALUE_0=A git commit -m x', 'git commit -q -m "x"', 'git push -u origin claude/x', 'git -c user.name=A -c user.email=a@b.c commit -m x', 'git log --oneline -3']) {
    assert.equal(run(c), null, c);
  }
});
