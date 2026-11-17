#!/usr/bin/env node
// PreToolUse hook: minőségkapu-bizonyíték a kibocsátó parancsok előtt (docs/minosegkapuk.md; terv D6–D8, E10–E12).
// Matcher: Bash | PowerShell. CSAK OLVAS: a kapuk által írt bizonyíték-fájlt nézi (és a merge-nél a PR fejét a gh-tól), kaput nem futtat.
//   git push          → zöld `pre-push-<fej>` vagy `pre-pr-<fej>` kell        (npm run gate:push)
//   gh pr create      → zöld `pre-pr-<fej>` kell                              (npm run gate:pr)
//   gh pr merge [n]   → zöld, ≤ 15 perces `merge-<n>-<PR-fej>` kell           (npm run gate:merge -- <n>)
// Kivétel (vizsgálat nélkül enged): távoli ág törlése (`--delete`, `-d`, `:ág`), `--dry-run`, más repó (amelyben nincs
// scripts/qa/gates/pre-push-gate.mjs), minden más parancs. A bizonyíték a közös git-könyvtárban van
// (`<git-common-dir>/websuli-qa-evidence/`), ezért a fő checkout és minden munkafa ugyanazt látja.
// Hibánál a kibocsátó ágon DENY (szigorúbb ág); minden más parancsnál nincs kimenet. Vészkijárat nincs.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `[minőségkapu] ${reason} Megkerülni tilos (docs/minosegkapuk.md); ha a kapu hibás, a kaput kell javítani.`,
    },
  }));
  process.exit(0);
}

/** Idézőjel-tudatos bontás parancs-szakaszokra (`&&`, `||`, `;`, `|`, újsor), majd szavakra. */
export function splitSegments(cmd) {
  const segs = [];
  let cur = [];
  let word = '';
  let hasWord = false;
  let q = null;
  const pushWord = () => { if (hasWord) cur.push(word); word = ''; hasWord = false; };
  const pushSeg = () => { pushWord(); if (cur.length) segs.push(cur); cur = []; };
  const s = String(cmd ?? '');
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (q) {
      if (c === q) q = null;
      else if (c === '\\' && q === '"' && (s[i + 1] === '"' || s[i + 1] === '\\')) { word += s[i + 1]; i += 1; }
      else word += c;
      continue;
    }
    if (c === '"' || c === "'") { q = c; hasWord = true; continue; }
    if (c === '&' && s[i + 1] === '&') { pushSeg(); i += 1; continue; }
    if (c === '|' && s[i + 1] === '|') { pushSeg(); i += 1; continue; }
    if (c === ';' || c === '|' || c === '\n' || c === '\r') { pushSeg(); continue; }
    if (c === ' ' || c === '\t') { pushWord(); continue; }
    word += c;
    hasWord = true;
  }
  pushSeg();
  return segs;
}

/** Git Bash-útvonal (`/d/repo/x`) → Windows-alak; egyébként változatlan. */
export function normPath(p) {
  if (process.platform === 'win32') {
    const m = /^\/([a-zA-Z])(\/.*)?$/.exec(p);
    if (m) return `${m[1].toUpperCase()}:${m[2] ?? '/'}`;
  }
  return p;
}

const exe = (w) => w.replace(/\\/g, '/').split('/').pop().toLowerCase().replace(/\.(?:exe|cmd)$/, '');

/**
 * A kibocsátó műveletek kigyűjtése: `[{ kind: 'push'|'pr-create'|'pr-merge', dir, ref?, pr?, repoFlag?, skip? }]`.
 */
export function findActions(cmd, cwd) {
  const actions = [];
  let dir = cwd;
  for (const seg of splitSegments(cmd)) {
    let w = seg.slice();
    while (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0])) w.shift();
    if (!w.length) continue;
    const head = exe(w[0]);
    if (['cd', 'set-location', 'pushd', 'sl'].includes(head)) {
      const target = w.slice(1).find((a) => !a.startsWith('-'));
      if (target) dir = isAbsolute(normPath(target)) ? normPath(target) : resolve(dir, normPath(target));
      continue;
    }
    if (head === 'git') {
      let d = dir;
      let i = 1;
      while (i < w.length && w[i].startsWith('-')) {
        if (w[i] === '-C' && w[i + 1]) { d = isAbsolute(normPath(w[i + 1])) ? normPath(w[i + 1]) : resolve(d, normPath(w[i + 1])); i += 2; continue; }
        if (w[i] === '-c' || w[i] === '--git-dir' || w[i] === '--work-tree') { i += 2; continue; }
        i += 1;
      }
      if (w[i] !== 'push') continue;
      const rest = w.slice(i + 1);
      const skip = rest.some((a) => a === '--delete' || a === '-d' || a === '--dry-run' || a === '-n' || (a.startsWith(':') && a.length > 1));
      const pos = rest.filter((a) => !a.startsWith('-'));
      const ref = pos[1] ? pos[1].replace(/^\+/, '').split(':')[0] : null;
      actions.push({ kind: 'push', dir: d, ref: ref && ref !== 'HEAD' ? ref : null, skip });
      continue;
    }
    if (head === 'gh') {
      const a = w.slice(1);
      let repoFlag = null;
      const plain = [];
      for (let i = 0; i < a.length; i += 1) {
        if (a[i] === '-R' || a[i] === '--repo') { repoFlag = a[i + 1]; i += 1; continue; }
        if (a[i].startsWith('--repo=')) { repoFlag = a[i].slice(7); continue; }
        plain.push(a[i]);
      }
      if (plain[0] !== 'pr') continue;
      if (plain[1] === 'create') {
        const hi = plain.indexOf('--head');
        const hv = hi >= 0 ? plain[hi + 1] : (plain.find((x) => x.startsWith('--head=')) ?? '').slice(7) || null;
        actions.push({ kind: 'pr-create', dir, ref: hv ? hv.split(':').pop() : null, repoFlag });
      } else if (plain[1] === 'merge') {
        if (plain.includes('--disable-auto')) continue;
        const target = plain.slice(2).find((x) => !x.startsWith('-'));
        const num = target ? (/^#?(\d+)$/.exec(target)?.[1] ?? /\/pull\/(\d+)/.exec(target)?.[1] ?? null) : null;
        actions.push({ kind: 'pr-merge', dir, pr: num, target: target ?? null, repoFlag });
      }
    }
  }
  return actions;
}

function run(file, args, cwd, timeout = 8000) {
  return execFileSync(file, args, { cwd, encoding: 'utf8', timeout, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function repoInfo(dir) {
  let top;
  try { top = run('git', ['rev-parse', '--show-toplevel'], dir); } catch { return null; }
  if (!existsSync(join(top, 'scripts', 'qa', 'gates', 'pre-push-gate.mjs'))) return null; // nem WEBSULI / még kapu nélküli ág
  let common = run('git', ['rev-parse', '--git-common-dir'], top);
  if (!isAbsolute(common)) common = resolve(top, common);
  const evDir = process.env.WEBSULI_QA_EVIDENCE_DIR || join(common, 'websuli-qa-evidence');
  let maxMin = 15;
  try { maxMin = JSON.parse(readFileSync(join(top, 'scripts', 'qa', 'gates', 'gates.config.json'), 'utf8')).mergeEvidenceMaxMinutes ?? 15; } catch { /* alap */ }
  return { top, evDir, maxMin };
}

function readEv(evDir, name) {
  const p = join(evDir, `${name}.json`);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return { ok: false, broken: true }; }
}

function resolveSha(top, ref) {
  return run('git', ['rev-parse', '--verify', `${ref ?? 'HEAD'}^{commit}`], top);
}

/** Egy művelet ellenőrzése; DENY-indokot ad vissza, vagy null-t (enged). */
export function checkAction(a, { now = Date.now(), ghView } = {}) {
  if (a.kind === 'push' && a.skip) return null;
  const info = repoInfo(a.dir);
  if (!info) return null;
  if (a.kind === 'push') {
    let sha;
    try { sha = resolveSha(info.top, a.ref); } catch { sha = resolveSha(info.top, null); }
    const ev = readEv(info.evDir, `pre-push-${sha}`);
    const pr = readEv(info.evDir, `pre-pr-${sha}`);
    if (ev?.ok === true || pr?.ok === true) return null;
    const why = ev ? `az utolsó futás erre a fejre BUKOTT (${ev.at ?? '?'})` : 'nincs zöld bizonyíték erre a fejre';
    return `A push előtti kapu nem zöld a ${sha.slice(0, 12)} fejre (${why}). Futtasd a munkafa gyökeréből: npm run gate:push — és ha zöld, pusholj újra.`;
  }
  if (a.kind === 'pr-create') {
    const sha = resolveSha(info.top, a.ref);
    const ev = readEv(info.evDir, `pre-pr-${sha}`);
    if (ev?.ok === true) return null;
    const why = ev ? `az utolsó futás BUKOTT (${ev.at ?? '?'})` : 'nincs zöld bizonyíték';
    return `A PR előtti kapu nem zöld a ${sha.slice(0, 12)} fejre (${why}). Előbb a független ellenőr (websuli-fejlesztesi-ellenor skill), aztán: npm run gate:pr -- --body-file <PR-leírás.md>.`;
  }
  if (a.kind === 'pr-merge') {
    const view = (ghView ?? defaultGhView)(a, info.top);
    if (!view?.number || !view?.headRefOid) return 'A PR száma / feje nem olvasható a gh-tól — merge-bizonyíték nélkül nem engedhető. Futtasd: npm run gate:merge -- <PR-szám>.';
    const ev = readEv(info.evDir, `merge-${view.number}-${view.headRefOid}`);
    if (!ev || ev.ok !== true) {
      return `A merge előtti kapu nem zöld a #${view.number} jelenlegi fejére (${view.headRefOid.slice(0, 12)})${ev ? ' — az utolsó futás BUKOTT' : ''}. Futtasd közvetlenül a merge előtt: npm run gate:merge -- ${view.number}.`;
    }
    const age = (now - Date.parse(ev.at)) / 60000;
    if (!(age <= info.maxMin)) return `A #${view.number} merge-bizonyítéka ${Number.isFinite(age) ? Math.round(age) : '?'} perces (legfeljebb ${info.maxMin} perc; a futásőr „közvetlenül előtte” szabálya). Futtasd újra: npm run gate:merge -- ${view.number}.`;
    return null;
  }
  return null;
}

function defaultGhView(a, top) {
  const args = ['pr', 'view', ...(a.target ? [a.target] : []), ...(a.repoFlag ? ['-R', a.repoFlag] : []), '--json', 'number,headRefOid'];
  try { return JSON.parse(run('gh', args, top, 10_000)); } catch { return null; }
}

function main() {
  let actions = [];
  try {
    const payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
    if (payload.tool_name !== 'Bash' && payload.tool_name !== 'PowerShell') process.exit(0);
    actions = findActions(String(payload.tool_input?.command ?? ''), payload.cwd || process.cwd());
  } catch {
    process.exit(0); // értelmezhetetlen bemenet: nem kibocsátó parancsként kezeljük
  }
  for (const a of actions) {
    let reason;
    try { reason = checkAction(a); } catch (e) { reason = `A minőségkapu-ellenőrzés hibára futott (${String(e?.message ?? e).split('\n')[0]}) — a kibocsátás nem engedhető.`; }
    if (reason) deny(reason);
  }
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]).replace(/\\/g, '/').endsWith('scripts/qa/hooks/check-quality-gates.mjs')) main();
