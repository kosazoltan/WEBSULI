#!/usr/bin/env node
// agentic-qa-kit — PreToolUse hook: audit-sentinel kapu git push előtt (TECH-015)
// Repo-szintű .claude/settings.json-ból hívandó (matcher: Bash vagy PowerShell).
// Csak a `git push` parancsokra aktív; minden másra azonnal enged.
// A repo gyökerében lévő .audit-ok sentinel frissességét ellenőrzi
// (a sentinel-t a pre-push-audit-lite.mjs / a repo saját audit-scriptje írja).
// Konfig (opcionális) a repo .agentic-qa-kit.json-jában:
//   { "audit": { "sentinel": ".audit-ok", "maxAgeMinutes": 10 } }
// Fail-open belső hibára.

import { readFileSync, statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `[agentic-qa-kit] ${reason}`,
    },
  }));
  process.exit(0);
}

try {
  const payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
  const tool = payload.tool_name || '';
  if (tool !== 'Bash' && tool !== 'PowerShell') process.exit(0);
  const cmd = String(payload.tool_input?.command ?? '');
  if (!/\bgit\b[^|;&]*\bpush\b/.test(cmd)) process.exit(0);

  let root;
  try {
    root = execSync('git rev-parse --show-toplevel', {
      cwd: payload.cwd || process.cwd(),
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
  } catch {
    process.exit(0); // nem git repo → nem a mi dolgunk
  }

  let sentinel = '.audit-ok';
  let maxAgeMinutes = 10;
  const cfgPath = join(root, '.agentic-qa-kit.json');
  if (existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
      if (cfg.audit?.sentinel) sentinel = cfg.audit.sentinel;
      if (cfg.audit?.maxAgeMinutes) maxAgeMinutes = cfg.audit.maxAgeMinutes;
      if (cfg.audit?.enabled === false) process.exit(0);
    } catch { /* rossz konfig → default */ }
  }

  const sPath = join(root, sentinel);
  if (existsSync(sPath)) {
    const ageMin = (Date.now() - statSync(sPath).mtimeMs) / 60000;
    if (ageMin <= maxAgeMinutes) process.exit(0);
  }

  deny(
    `A push előtti audit nem futott le az elmúlt ${maxAgeMinutes} percben. ` +
    `Futtasd: npm run qa:audit (vagy a repo saját audit-scriptjét), majd pusholj újra.`
  );
} catch {
  process.exit(0);
}
