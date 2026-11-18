#!/usr/bin/env node
// agentic-qa-kit — PreToolUse hook: audit-sentinel kapu git push előtt (TECH-015)
// Repo-szintű .claude/settings.json-ból hívandó (matcher: Bash vagy PowerShell).
// Csak a `git push` parancsokra aktív; minden másra azonnal enged.
// A repo gyökerében lévő .audit-ok sentinel frissességét ellenőrzi
// (a sentinel-t a pre-push-audit-lite.mjs / a repo saját audit-scriptje írja).
// Konfig (opcionális) a repo .agentic-qa-kit.json-jában:
//   { "audit": { "sentinel": ".audit-ok", "maxAgeMinutes": 10 } }
// Kanban #126 (A7): a push-parancsnál a git időtúllépése / indítási hibája és a belső hiba TILT (fail-closed), teendővel;
// a gyors, nem nulla kilépés (nem git-repó) és a nem push parancs változatlanul enged.

import { readFileSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

const RETRY = 'próbáld újra néhány másodperc múlva ugyanazt az egyszerű parancsot; ha tartósan fennáll: docs/minosegkapuk.md — „A kapu-hook hibája”';
/** A git nem adott választ (időtúllépés, jelzés, indítási hiba) — szemben a gyors, nem nulla kilépéssel. */
const noAnswer = (e) => Boolean(e) && (e.code === 'ETIMEDOUT' || e.code === 'ENOENT' || e.code === 'EPERM' || e.code === 'EACCES'
  || e.killed === true || Boolean(e.signal) || e.status === null || e.status === undefined);

let payload;
try {
  payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0); // olvashatatlan hook-bemenet: nincs parancs, amit vizsgálni lehetne
}
const tool = payload.tool_name || '';
if (tool !== 'Bash' && tool !== 'PowerShell') process.exit(0);
const cmd = String(payload.tool_input?.command ?? '');
if (!/\bgit\b[^|;&]*\bpush\b/.test(cmd)) process.exit(0);

try {
  let root;
  try {
    root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: payload.cwd || process.cwd(),
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (e) {
    if (noAnswer(e)) deny(`A push előtti audit nem ellenőrizhető (a git nem válaszolt) — ${RETRY}.`);
    process.exit(0); // gyors, nem nulla kilépés: nem git repo → nem a mi dolgunk
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
} catch (e) {
  deny(`A push előtti audit-ellenőrzés hibára futott (${String(e?.message ?? e).split('\n')[0]}) — ${RETRY}.`);
}
