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

// A git-korlát 10 s (kanban #126); csak `node --test` alatt (NODE_TEST_CONTEXT) felülírható, felülről korlátozva. A külső
// hook-korlát (.claude/settings.json) 20 s, hogy a belső mindig előbb járjon le érthető tiltással (L5).
const GIT_TIMEOUT_MS = process.env.NODE_TEST_CONTEXT && Number(process.env.WEBSULI_AUDIT_GIT_TIMEOUT_MS) > 0
  ? Math.min(Number(process.env.WEBSULI_AUDIT_GIT_TIMEOUT_MS), 10_000) : 10_000;

// Push-parancs felismerése (docs/specs/2026-11-19-audit-hook-kapuinditas.md): LINEÁRIS szó-futam bejárás — egy `git` futamot
// (`git`, `git.exe`, útvonallal `…/git(.exe)`) később egy pontosan `push` futam követ. A `gate:push`, `pre-push-gate`, `.git/`
// egyetlen futam, így a push-kapu indítása nem push-parancs. Álcázás ellen két normalizált szövegen fut: idézőjel / `` ` `` / `^`
// törölve, a visszaperjel (a) `/`-re cserélve (Windows-útvonal), (b) törölve (escape a szó belsejében). Konzervatív: a
// `git stash push` is push-parancsnak számít (téves tiltás olcsóbb, mint az átengedés).
const WORD_RUN = /[\w./:-]+/g;
// a `:` előtag a nyers (hibás) JSON-bemenethez kell: idézőjelek nélkül `command:git` egy futam
const isGitRun = (w) => /(?:^|[/:])git(?:\.exe)?$/.test(w);
// L2 (vak kör 1): a push rokon alparancsai (`http-push`, `send-pack`) is push; önálló programként (`git-send-pack`,
// `…/git-core/git-http-push`) git-futam nélkül is.
const isPushSub = (w) => w === 'push' || w === 'http-push' || w === 'send-pack';
const isPushProgram = (w) => /(?:^|[/:])git-(?:http-push|send-pack)(?:\.exe)?$/.test(w);
function hasGitThenPush(s) {
  let sawGit = false;
  for (const m of s.matchAll(WORD_RUN)) {
    const w = m[0].toLowerCase();
    if (isPushProgram(w)) return true;
    if (!sawGit) sawGit = isGitRun(w);
    else if (isPushSub(w)) return true;
  }
  return false;
}
function isPushCommand(raw) {
  const base = String(raw ?? '').replace(/['"`^‘’‚‛“”„]/g, '');
  return hasGitThenPush(base.replace(/\\/g, '/')) || hasGitThenPush(base.replace(/\\/g, ''));
}

let text = '';
try { text = readFileSync(0, 'utf8'); } catch { /* nincs olvasható bemenet → üres szöveg */ }
let payload;
try {
  payload = JSON.parse(text || '{}');
} catch {
  // Olvashatatlan hook-bemenet: ha a nyers szövegben push van → TILT (kanban #100), különben enged.
  if (isPushCommand(text)) deny(`A hook-bemenet nem értelmezhető, de push-parancsot tartalmaz — ${RETRY}.`);
  process.exit(0);
}
// L5: érvényes, de nem objektum JSON (null, tömb, szám, szöveg) — nem összeomlás; push-szöveggel TILT, különben enged.
if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
  if (isPushCommand(text)) deny(`A hook-bemenet nem értelmezhető, de push-parancsot tartalmaz — ${RETRY}.`);
  process.exit(0);
}
const tool = payload.tool_name || '';
if (tool !== 'Bash' && tool !== 'PowerShell') process.exit(0);
const cmd = String(payload.tool_input?.command ?? '');
if (!isPushCommand(cmd)) process.exit(0);

try {
  let root;
  try {
    root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: payload.cwd || process.cwd(),
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
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
    `A push előtti audit nem futott le az elmúlt ${maxAgeMinutes} percben (hiányzik vagy régi a(z) ${sentinel} jel). ` +
    `Teendő: npm run gate:push zöld → a(z) ${sentinel} frissítése külön parancsban (a repó gyökerében) → ` +
    `git push külön, egyszerű parancsként (docs/minosegkapuk.md).`
  );
} catch (e) {
  deny(`A push előtti audit-ellenőrzés hibára futott (${String(e?.message ?? e).split('\n')[0]}) — ${RETRY}.`);
}
