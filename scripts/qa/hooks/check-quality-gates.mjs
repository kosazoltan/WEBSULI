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
const WRAPPERS = new Set(['env', 'sudo', 'command', 'nohup', 'time', 'exec', 'call', 'xargs', 'start-process']);
const EVAL_WRAPPERS = new Set(['iex', 'invoke-expression', 'eval']);
const KEYWORDS = new Set(['then', 'do', 'else', 'elif', 'if', 'while', 'until', '!']);
// Burkolók értéket váró kapcsolói (`sudo -u x`, `env -u X`): az utánuk álló szó nem parancs (visszaellenőrzés J4).
const WRAPPER_VALUE_OPTS = new Set(['-u', '-g', '--user', '--group', '--unset', '-C', '--chdir']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'pwsh', 'powershell', 'cmd']);
// `git push` értékes kapcsolói: az utánuk álló szó nem remote / ref (review J9). A `--signed` és a `--force-with-lease`
// érték nélkül is érvényes — azok csak `=`-es alakban kapnak értéket, ezért NINCSENEK itt (visszaellenőrzés V2).
const PUSH_VALUE_OPTS = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec']);
// Rövid shell-kapcsoló, amely parancsszöveget vár: -c, -lc, -ec, -xc … (a hosszú PowerShell-kapcsolók külön).
const SHELL_CMD_FLAG = /^(?:-[a-z]{0,3}c[a-z]{0,3}|-command|\/c|-encodedcommand)$/;

/** Átirányítások és a magában álló `&` eltávolítása (`2>&1`, `>log`, `> log`, `2>/dev/null`, záró `&`) — visszaellenőrzés V1. */
export function dropRedirections(words) {
  const out = [];
  for (let i = 0; i < words.length; i += 1) {
    const x = words[i];
    if (/^\d*(?:>>?|<)$/.test(x) || /^&>>?$/.test(x)) { i += 1; continue; }
    if (/^\d*(?:>>?|<)\S/.test(x) || /^&>/.test(x)) continue;
    if (x === '&' && i > 0) continue;
    out.push(x);
  }
  return out;
}

/**
 * A kibocsátó műveletek kigyűjtése: `[{ kind: 'push'|'pr-create'|'pr-merge'|'deny', dir, refs?, pr?, repoFlag?, skip?, reason? }]`.
 * Burkolók (`env`, `sudo`, `&`, `(`…), beágyazott shell (`bash -c "…"`, `powershell -c "…"`) és `gh api …/merge` is (review J4).
 */
export function findActions(cmd, cwd, depth = 0) {
  const actions = [];
  let dir = cwd;
  // Sorfolytatás (bash `\` + újsor, PowerShell backtick + újsor) egy parancs — visszaellenőrzés J3.
  const joined = String(cmd ?? '').replace(/[\\`]\r?\n/g, ' ');
  for (const seg of splitSegments(joined)) {
    let w = dropRedirections(seg.map((x, i) => (i === 0 ? x.replace(/^[({]+/, '') : x).replace(/[)}]+$/, '')).filter((x) => x !== ''));
    let nested = null;
    for (;;) {
      while (w.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0]) || /^\$env:/i.test(w[0]) || KEYWORDS.has(w[0]))) w.shift();
      if (w.length && EVAL_WRAPPERS.has(exe(w[0]))) { nested = w.slice(1).filter((x) => !x.startsWith('-')).join(' '); w = []; break; }
      if (w.length && (w[0] === '&' || w[0] === '.' || WRAPPERS.has(exe(w[0])))) {
        w.shift();
        while (w.length && w[0].startsWith('-') && !SHELL_CMD_FLAG.test(w[0])) {
          const opt = w.shift();
          if (WRAPPER_VALUE_OPTS.has(opt)) w.shift();
        }
        continue;
      }
      break;
    }
    if (nested && depth < 3) { actions.push(...findActions(nested, dir, depth + 1)); continue; }
    if (!w.length) continue;
    const head = exe(w[0]);
    if (SHELLS.has(head) && depth < 3) {
      const ci = w.findIndex((x, i) => i > 0 && (SHELL_CMD_FLAG.test(x) || /^-(?:command|encodedcommand)$/i.test(x)));
      if (ci > 0 && w[ci + 1]) {
        if (/^-encodedcommand$/i.test(w[ci])) actions.push({ kind: 'deny', reason: 'Kódolt PowerShell-parancs (-EncodedCommand) nem vizsgálható — írd ki a parancsot olvashatóan.' });
        else actions.push(...findActions(w.slice(ci + 1).join(' '), dir, depth + 1));
      }
      continue;
    }
    if (['cd', 'set-location', 'pushd', 'sl'].includes(head)) {
      const target = w.slice(1).find((a) => !a.startsWith('-'));
      if (target) dir = isAbsolute(normPath(target)) ? normPath(target) : resolve(dir, normPath(target));
      continue;
    }
    if (head === 'git') {
      let d = dir;
      let i = 1;
      let gitDir = false;
      while (i < w.length && w[i].startsWith('-')) {
        if (w[i] === '-C' && w[i + 1]) { d = isAbsolute(normPath(w[i + 1])) ? normPath(w[i + 1]) : resolve(d, normPath(w[i + 1])); i += 2; continue; }
        if (w[i] === '--git-dir' || w[i] === '--work-tree') { gitDir = true; i += 2; continue; }
        if (/^--(?:git-dir|work-tree)=/.test(w[i])) { gitDir = true; i += 1; continue; }
        if (w[i] === '-c') { i += 2; continue; }
        i += 1;
      }
      if (w[i] !== 'push') continue;
      const rest = w.slice(i + 1);
      const flags = rest.filter((a) => a.startsWith('-'));
      const pos = [];
      for (let k = 0; k < rest.length; k += 1) {
        if (PUSH_VALUE_OPTS.has(rest[k])) { k += 1; continue; }
        if (!rest[k].startsWith('-')) pos.push(rest[k]);
      }
      const refspecs = pos.slice(1);
      const dry = flags.some((a) => a === '--dry-run' || a === '-n');
      const delFlag = flags.some((a) => a === '--delete' || a === '-d');
      // Csak akkor vizsgálat nélküli, ha MINDEN refspec törlés (review J2).
      const allDeletes = refspecs.length > 0 && refspecs.every((r) => r.startsWith(':') && r.length > 1);
      if (gitDir && !dry && !delFlag && !allDeletes) { actions.push({ kind: 'deny', reason: 'A `git --git-dir / --work-tree … push` alak nem vizsgálható — használd a `git -C <munkafa> push` alakot.' }); continue; }
      if (flags.some((a) => a === '--all' || a === '--mirror' || a === '--branches')) {
        if (!dry) actions.push({ kind: 'deny', reason: 'A `git push --all / --mirror` több ágat tölt fel egyszerre — ágonként pusholj, mindegyikre zöld push-kapuval (review J3).' });
        continue;
      }
      const refs = refspecs.filter((r) => !(r.startsWith(':') && r.length > 1)).map((r) => r.replace(/^\+/, '').split(':')[0]).map((r) => (r === 'HEAD' || r === '' ? null : r));
      actions.push({ kind: 'push', dir: d, refs: refs.length ? refs : [null], skip: dry || delFlag || allDeletes });
      continue;
    }
    if (head === 'gh') {
      const a = w.slice(1);
      let repoFlag = null;
      const plain = [];
      for (let k = 0; k < a.length; k += 1) {
        if (a[k] === '-R' || a[k] === '--repo') { repoFlag = a[k + 1]; k += 1; continue; }
        if (a[k].startsWith('--repo=')) { repoFlag = a[k].slice(7); continue; }
        plain.push(a[k]);
      }
      if (plain[0] === 'api') {
        const m = plain.map((x) => /repos\/([^/\s]+\/[^/\s]+)\/pulls\/(\d+)\/merge\b/.exec(x)).find(Boolean);
        // Csak író hívás (PUT / POST, vagy mezők → implicit POST) merge-el; az olvasó GET nem (visszaellenőrzés V3).
        const mi = plain.findIndex((x) => x === '-X' || x === '--method');
        const method = mi >= 0 ? String(plain[mi + 1] ?? '').toUpperCase() : (plain.find((x) => /^--method=/i.test(x)) ?? '').split('=')[1]?.toUpperCase();
        const writes = ['PUT', 'POST', 'PATCH'].includes(method) || (!method && plain.some((x) => ['-f', '-F', '--field', '--raw-field', '--input'].includes(x)));
        if (m && writes) actions.push({ kind: 'pr-merge', dir, pr: m[2], target: m[2], repoFlag: m[1] });
        continue;
      }
      if (plain[0] !== 'pr') continue;
      if (plain[1] === 'create') {
        const hi = plain.indexOf('--head');
        const hv = hi >= 0 ? plain[hi + 1] : (plain.find((x) => x.startsWith('--head=')) ?? '').slice(7) || null;
        actions.push({ kind: 'pr-create', dir, refs: [hv ? hv.split(':').pop() : null], repoFlag });
      } else if (plain[1] === 'merge') {
        if (plain.includes('--disable-auto')) continue;
        if (plain.includes('--auto')) {
          actions.push({ kind: 'deny', reason: 'A `gh pr merge --auto` később, futásőr és `/api/rt/status` nélkül vonna össze — a merge-et közvetlenül a `npm run gate:merge -- <PR>` után, kézzel indítsd (review J10; docs/telepites-elotti-or.md 1. pont).' });
          continue;
        }
        const target = plain.slice(2).find((x) => !x.startsWith('-'));
        const num = target ? (/^#?(\d+)$/.exec(target)?.[1] ?? /\/pull\/(\d+)/.exec(target)?.[1] ?? null) : null;
        actions.push({ kind: 'pr-merge', dir, pr: num, target: target ?? null, repoFlag });
      }
    }
  }
  return actions;
}

// Időkorlátok: a hook teljes ideje 15 s (settings.json) — git 3 s, gh 8 s (review J14).
function run(file, args, cwd, timeout = 3000) {
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
  if (a.kind === 'deny') return a.reason;
  if (a.kind === 'push' && a.skip) return null;
  const info = repoInfo(a.dir);
  if (!info) {
    // Review J1: WEBSULI-n kívüli mappából, `-R …/WEBSULI`-vel kiadott gh-parancs nem csúszhat át.
    if (a.repoFlag && /(?:^|\/)WEBSULI$/i.test(a.repoFlag)) return 'A WEBSULI-ra szóló gh-parancsot a WEBSULI munkafájából add ki (ott van a kapu-bizonyíték), ne más mappából -R-rel.';
    return null;
  }
  if (a.kind === 'push') {
    for (const ref of a.refs ?? [null]) {
      let sha;
      try { sha = resolveSha(info.top, ref); } catch { return `A pusholt ref (${ref}) nem oldható fel helyi commitra — a push nem vizsgálható; pusholj helyi ágat.`; }
      const ev = readEv(info.evDir, `pre-push-${sha}`);
      const pr = readEv(info.evDir, `pre-pr-${sha}`);
      if (ev?.ok === true || pr?.ok === true) continue;
      const why = ev ? `az utolsó futás erre a fejre BUKOTT (${ev.at ?? '?'})` : 'nincs zöld bizonyíték erre a fejre';
      return `A push előtti kapu nem zöld a ${sha.slice(0, 12)} fejre${ref ? ` (${ref})` : ''} (${why}). Futtasd a munkafa gyökeréből: npm run gate:push — és ha zöld, pusholj újra.`;
    }
    return null;
  }
  if (a.kind === 'pr-create') {
    const sha = resolveSha(info.top, a.refs?.[0] ?? null);
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
  try { return JSON.parse(run('gh', args, top, 8000)); } catch { return null; }
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
