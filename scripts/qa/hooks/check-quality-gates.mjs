#!/usr/bin/env node
// PreToolUse hook: minőségkapu-bizonyíték a kibocsátó parancsok előtt (docs/minosegkapuk.md; terv D6–D8, E10–E12).
// Matcher: Bash | PowerShell. CSAK OLVAS: a kapuk által írt bizonyíték-fájlt nézi (és a merge-nél a PR fejét a gh-tól), kaput nem futtat.
//
// FAIL-CLOSED (orkesztrátori döntés a #489 bot-leletei után): a shell-nyelvtan végtelen, ezért nem a megkerüléseket foltozzuk
// egyenként, hanem a kapu-köteles műveletet (git push, gh pr create, gh pr merge) CSAK önálló, egyszerű, ismert alakú parancsként
// engedjük át. Láncolás (&&, ||, ;, |, &, újsor), alshell / parancshelyettesítés, átirányítás, könyvtárváltás, környezet-burkoló
// (cd, pushd, env, git -C, --git-dir, GIT_*=, &, Start-Process, cmd /c …) vagy ismeretlen kapcsoló mellett → DENY.
//   git push [-u] [<remote> [<ág> | HEAD | HEAD:<aktuális ág>]]  → zöld `pre-push-<kimenő commit>` / `pre-pr-<…>`   (npm run gate:push)
//   git push <remote> --delete <ág>                               → kapu nélkül (távoli ág törlése)
//   gh pr create [ismert kapcsolók]                               → zöld `pre-pr-<fej>`                            (npm run gate:pr)
//   gh pr merge [<szám>|<URL>|<ág>] [ismert kapcsolók]            → zöld, ≤ 15 perces `merge-<n>-<PR-fej>`        (npm run gate:merge -- <n>)
// A bizonyíték a közös git-könyvtárban van (`<git-common-dir>/websuli-qa-evidence/`): a fő checkout és minden munkafa ugyanazt látja.
// A hook NEM biztonsági határ a szándékos megkerülés ellen (pl. a hook kikapcsolása) — a figyelmetlen hibát fogja meg; a megkerülés
// tilos, és az orkesztrátor a pre-merge-gate-et mindenképp lefuttatja.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

const SIMPLE_HINT = 'A push / PR / merge külön, egyszerű parancsként fusson a munkafa gyökeréből (láncolás, cd / env / -C, alshell, átirányítás nélkül; PR-leírás: --body-file).';

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

/** Van-e a parancs szövegében BÁRHOL kapu-köteles művelet (szándékosan tág: kétség esetén a szigorú ág fut). */
// Önálló szó: nem része útvonalnak / névnek (`.git/`, `pre-push-gate`, `gate:push` nem számít).
const W = (x) => `(?<![\\w./:-])${x}(?![\\w./:-])`;
const GIT_PUSH = new RegExp(`${W('git(?:\\.exe)?')}[\\s\\S]*${W('push')}`, 'i');
// Útvonallal megadott git (`C:/…/git.exe' push`, `/usr/bin/git push`): a név után idézőjel és / vagy szóköz jön.
const GIT_PATH_PUSH = new RegExp(`git(?:\\.exe)?['"]?\\s[\\s\\S]*${W('push')}`, 'i');
const GH_PR = new RegExp(`${W('gh(?:\\.exe)?')}[\\s\\S]*${W('pr')}[\\s\\S]*${W('(?:create|merge)')}`, 'i');
export function detectGated(raw) {
  const s = String(raw ?? '');
  return GIT_PUSH.test(s) || GIT_PATH_PUSH.test(s) || GH_PR.test(s) || /\/pulls\/\d+\/merge\b/i.test(s);
}

/**
 * Egyszerű parancs szavakra bontása. `{ ok: false, reason }`, ha a parancs nem egyetlen egyszerű parancs: idézőjelen kívül
 * láncoló / átirányító / csoportosító jel (`& | ; < > ( ) { }`, újsor), bárhol parancshelyettesítés (`$(`, backtick), vagy lezáratlan
 * idézőjel. Az egyszeres idézőjelen belüli szöveg szó szerinti.
 */
export function tokenizeSimple(raw) {
  const s = String(raw ?? '').trim();
  const words = [];
  let word = '';
  let has = false;
  let q = null;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (q === "'") { if (c === "'") q = null; else word += c; continue; }
    if (c === '`' || (c === '$' && s[i + 1] === '(')) return { ok: false, reason: 'parancshelyettesítés (`$(…)` / backtick)' };
    if (q === '"') {
      if (c === '"') q = null;
      else if (c === '\\' && (s[i + 1] === '"' || s[i + 1] === '\\')) { word += s[i + 1]; i += 1; }
      else word += c;
      continue;
    }
    if (c === '"' || c === "'") { q = c; has = true; continue; }
    if ('&|;<>(){}\n\r'.includes(c)) return { ok: false, reason: `láncolás / átirányítás / alshell (\`${c === '\n' || c === '\r' ? 'újsor' : c}\`)` };
    if (c === ' ' || c === '\t') { if (has) words.push(word); word = ''; has = false; continue; }
    word += c;
    has = true;
  }
  if (q) return { ok: false, reason: 'lezáratlan idézőjel' };
  if (has) words.push(word);
  return { ok: true, words };
}

const NAME = /^[A-Za-z0-9._-]+$/;
const BRANCH = /^[A-Za-z0-9._/-]+$/;

/** `git push` engedett alakjai (fail-closed whitelist). */
function planPush(args) {
  let a = args.slice();
  // Távoli ág törlése: CSAK a `--delete` alak, pontosan egy ággal.
  if (a.includes('--delete')) {
    const rest = a.filter((x) => x !== '--delete');
    if (rest.length === 2 && NAME.test(rest[0]) && BRANCH.test(rest[1]) && !rest.some((x) => x.startsWith('-'))) return { kind: 'push-delete' };
    return { kind: 'deny', reason: 'A távoli ág törlése: `git push <remote> --delete <ág>` (egy ág, más kapcsoló nélkül).' };
  }
  let upstream = false;
  if (a[0] === '-u' || a[0] === '--set-upstream') { upstream = true; a = a.slice(1); }
  const bad = a.find((x) => x.startsWith('-'));
  if (bad) {
    const why = /^--force|^-f$|^\+/.test(bad) ? ' (a force-push a repó szabálya szerint tilos)' : '';
    return { kind: 'deny', reason: `A \`git push\` ismeretlen / nem engedett kapcsolóval (\`${bad}\`)${why}. Engedett: git push [-u] [<remote> [<ág> | HEAD]].` };
  }
  if (a.length > 2) return { kind: 'deny', reason: 'A `git push` egyszerre csak egy ágat tölthet fel (több refspec nem engedett).' };
  const [remote, spec] = a;
  if (remote !== undefined && !NAME.test(remote)) return { kind: 'deny', reason: `Nem egyértelmű remote: \`${remote}\`.` };
  if (spec === undefined) return { kind: 'push', remote: remote ?? null, ref: null, upstream };
  if (spec.startsWith(':')) return { kind: 'deny', reason: 'A `:<ág>` / `:` refspec nem engedett — távoli ág törlésére használd a `git push <remote> --delete <ág>` alakot.' };
  if (spec.startsWith('+')) return { kind: 'deny', reason: 'A `+` (force) refspec nem engedett — a force-push a repó szabálya szerint tilos.' };
  if (spec === 'HEAD') return { kind: 'push', remote, ref: null, upstream };
  const m = /^HEAD:(?:refs\/heads\/)?([A-Za-z0-9._/-]+)$/.exec(spec);
  if (m) return { kind: 'push', remote, ref: null, sameAsCurrent: m[1], upstream };
  if (BRANCH.test(spec) && !spec.includes(':')) return { kind: 'push', remote, ref: spec, upstream };
  return { kind: 'deny', reason: `Nem engedett refspec: \`${spec}\` (engedett: <ág>, HEAD, HEAD:<aktuális ág>).` };
}

const CREATE_VALUE = new Set(['--title', '-t', '--body', '-b', '--body-file', '-F', '--base', '-B', '--head', '-H', '--label', '-l', '--assignee', '-a', '--reviewer', '-r', '--milestone', '-m', '--project', '-p', '--repo', '-R', '--template', '-T']);
const CREATE_FLAG = new Set(['--draft', '-d', '--fill', '-f', '--fill-first', '--fill-verbose', '--web', '-w', '--no-maintainer-edit', '--dry-run']);
const MERGE_VALUE = new Set(['--subject', '-t', '--body', '-b', '--body-file', '-F', '--match-head-commit', '--author-email', '-A', '--repo', '-R']);
const MERGE_FLAG = new Set(['--squash', '-s', '--merge', '-m', '--rebase', '-r', '--delete-branch', '-d', '--admin']);

function parseFlags(args, valueSet, flagSet) {
  const pos = [];
  const vals = {};
  for (let i = 0; i < args.length; i += 1) {
    const x = args[i];
    const eq = /^(--[a-z-]+)=(.*)$/.exec(x);
    if (eq && valueSet.has(eq[1])) { vals[eq[1]] = eq[2]; continue; }
    if (valueSet.has(x)) { if (i + 1 >= args.length) return { error: `a \`${x}\` kapcsolónak nincs értéke` }; vals[x] = args[i + 1]; i += 1; continue; }
    if (flagSet.has(x)) { vals[x] = true; continue; }
    if (x.startsWith('-')) return { error: `ismeretlen / nem engedett kapcsoló: \`${x}\`` };
    pos.push(x);
  }
  return { pos, vals };
}

/**
 * Egy parancs terve: `{ kind: 'none' }` (nem kapu-köteles), `{ kind: 'deny', reason }`, `push`, `push-delete`, `pr-create`, `pr-merge`.
 */
export function planCommand(raw) {
  if (!detectGated(raw)) return { kind: 'none' };
  const t = tokenizeSimple(raw);
  if (!t.ok) return { kind: 'deny', reason: `${SIMPLE_HINT} (Talált: ${t.reason}.)` };
  const w = t.words;
  const head = (w[0] ?? '').toLowerCase();
  if (head === 'git' || head === 'git.exe') {
    if (!w.includes('push')) return { kind: 'none' }; // pl. git commit -m "… push …", git log — nem kibocsátás
    if (w[1] !== 'push') return { kind: 'deny', reason: `${SIMPLE_HINT} (A \`git\` és a \`push\` közé nem kerülhet kapcsoló: -C, -c, --git-dir, --work-tree.)` };
    return planPush(w.slice(2));
  }
  if (head === 'gh' || head === 'gh.exe') {
    if (w[1] === 'api' && !w.some((x) => /\/pulls\/\d+\/merge\b/i.test(x))) return { kind: 'none' };
    if (w[1] !== 'api' && !(w.includes('pr') && (w.includes('create') || w.includes('merge')))) return { kind: 'none' };
    if (w[1] === 'api') return { kind: 'deny', reason: 'A PR-t `gh api`-n át összevonni nem engedett — használd a `gh pr merge <n>` parancsot a merge-kapu után.' };
    if (w[1] !== 'pr') return { kind: 'deny', reason: `${SIMPLE_HINT} (A \`gh\` és a \`pr\` közé nem kerülhet kapcsoló.)` };
    if (w[2] === 'create') {
      const p = parseFlags(w.slice(3), CREATE_VALUE, CREATE_FLAG);
      if (p.error || p.pos.length) return { kind: 'deny', reason: `\`gh pr create\`: ${p.error ?? 'váratlan pozicionális argumentum'}.` };
      const repoFlag = p.vals['--repo'] ?? p.vals['-R'] ?? null;
      const h = p.vals['--head'] ?? p.vals['-H'] ?? null;
      if (h && !BRANCH.test(h.split(':').pop())) return { kind: 'deny', reason: `\`gh pr create\`: nem egyértelmű --head: \`${h}\`.` };
      return { kind: 'pr-create', ref: h ? h.split(':').pop() : null, repoFlag };
    }
    if (w[2] === 'merge') {
      const rest = w.slice(3);
      if (rest.includes('--auto')) return { kind: 'deny', reason: 'A `gh pr merge --auto` később, futásőr és `/api/rt/status` nélkül vonna össze — a merge-et közvetlenül a `npm run gate:merge -- <PR>` után, kézzel indítsd.' };
      if (rest.includes('--disable-auto')) return { kind: 'none' };
      const p = parseFlags(rest, MERGE_VALUE, MERGE_FLAG);
      if (p.error) return { kind: 'deny', reason: `\`gh pr merge\`: ${p.error}.` };
      if (p.pos.length > 1) return { kind: 'deny', reason: `\`gh pr merge\`: nem egyértelmű cél (${p.pos.length} pozicionális argumentum).` };
      const target = p.pos[0] ?? null;
      if (target && !(/^#?\d+$/.test(target) || /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+$/.test(target) || BRANCH.test(target))) {
        return { kind: 'deny', reason: `\`gh pr merge\`: nem egyértelmű cél: \`${target}\` (szám, PR-URL vagy ág).` };
      }
      return { kind: 'pr-merge', target: target ? target.replace(/^#/, '') : null, repoFlag: p.vals['--repo'] ?? p.vals['-R'] ?? null };
    }
    return { kind: 'deny', reason: SIMPLE_HINT };
  }
  return { kind: 'deny', reason: `${SIMPLE_HINT} (A parancs nem közvetlenül \`git push\` / \`gh pr …\`: burkoló, változó, alias vagy más eszköz.)` };
}

// Időkorlátok: a hook teljes ideje 15 s (settings.json) — git 3 s, gh 8 s.
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

function currentBranch(top) {
  try { return run('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], top); } catch { return null; }
}

/** Egy terv ellenőrzése a bizonyíték alapján; DENY-indokot ad vissza, vagy null-t (enged). */
export function checkAction(plan, cwd, { now = Date.now(), ghView, raw = '' } = {}) {
  if (plan.kind === 'none' || plan.kind === 'push-delete') return null;
  const info = repoInfo(cwd);
  if (!info) {
    // Más repó: nem a mi dolgunk — kivéve, ha a parancs a WEBSULI-ra mutat (pl. -R …/WEBSULI, cd …/WEBSULI): akkor fail-closed.
    return /websuli/i.test(raw) ? 'A WEBSULI-ra szóló push / PR / merge parancsot a WEBSULI munkafájából add ki, egyszerű parancsként.' : null;
  }
  if (plan.kind === 'deny') return plan.reason;
  if (plan.kind === 'push') {
    let sha;
    let label;
    if (plan.ref) {
      try { sha = run('git', ['rev-parse', '--verify', `refs/heads/${plan.ref}^{commit}`], info.top); } catch { return `A pusholt ág (\`${plan.ref}\`) nem helyi ág — csak helyi ágat pusholj, a saját kimenő commitjára szóló bizonyítékkal.`; }
      label = plan.ref;
    } else {
      const cur = currentBranch(info.top);
      if (!cur) return 'Leválasztott HEAD-ről pusholni nem engedett — pusholj megnevezett helyi ágat.';
      if (plan.sameAsCurrent && plan.sameAsCurrent !== cur) return `A \`HEAD:${plan.sameAsCurrent}\` más ágra töltene fel, mint az aktuális (\`${cur}\`) — nem engedett.`;
      sha = run('git', ['rev-parse', '--verify', 'HEAD^{commit}'], info.top);
      label = cur;
    }
    const ev = readEv(info.evDir, `pre-push-${sha}`);
    const pr = readEv(info.evDir, `pre-pr-${sha}`);
    if (ev?.ok === true || pr?.ok === true) return null;
    const why = ev ? `az utolsó futás erre a commitra BUKOTT (${ev.at ?? '?'})` : 'nincs zöld bizonyíték erre a commitra';
    return `A push előtti kapu nem zöld a kimenő ${sha.slice(0, 12)} commitra (${label}; ${why}). Futtasd a munkafa gyökeréből: npm run gate:push — és ha zöld, pusholj újra.`;
  }
  if (plan.kind === 'pr-create') {
    if (plan.repoFlag && !/(?:^|\/)WEBSULI$/i.test(plan.repoFlag)) return null;
    let sha;
    if (plan.ref) {
      try { sha = run('git', ['rev-parse', '--verify', `refs/heads/${plan.ref}^{commit}`], info.top); } catch { return `A --head ág (\`${plan.ref}\`) nem helyi ág — a PR-kapu bizonyítéka nem ellenőrizhető.`; }
    } else {
      if (!currentBranch(info.top)) return 'Leválasztott HEAD-ről PR-t nyitni nem engedett.';
      sha = run('git', ['rev-parse', '--verify', 'HEAD^{commit}'], info.top);
    }
    const ev = readEv(info.evDir, `pre-pr-${sha}`);
    if (ev?.ok === true) return null;
    const why = ev ? `az utolsó futás BUKOTT (${ev.at ?? '?'})` : 'nincs zöld bizonyíték';
    return `A PR előtti kapu nem zöld a ${sha.slice(0, 12)} fejre (${why}). Előbb a független ellenőr (websuli-fejlesztesi-ellenor skill), aztán: npm run gate:pr -- --body-file <PR-leírás.md>.`;
  }
  if (plan.kind === 'pr-merge') {
    const view = (ghView ?? defaultGhView)(plan, info.top);
    if (!view?.number || !view?.headRefOid) return 'A PR száma / feje nem olvasható a gh-tól — merge-bizonyíték nélkül nem engedhető. Futtasd: npm run gate:merge -- <PR-szám>.';
    const ev = readEv(info.evDir, `merge-${view.number}-${view.headRefOid}`);
    if (!ev || ev.ok !== true) {
      return `A merge előtti kapu nem zöld a #${view.number} jelenlegi fejére (${view.headRefOid.slice(0, 12)})${ev ? ' — az utolsó futás BUKOTT' : ''}. Futtasd közvetlenül a merge előtt: npm run gate:merge -- ${view.number}.`;
    }
    const age = (now - Date.parse(ev.at)) / 60000;
    if (!(age <= info.maxMin)) return `A #${view.number} merge-bizonyítéka ${Number.isFinite(age) ? Math.round(age) : '?'} perces (legfeljebb ${info.maxMin} perc; a futásőr „közvetlenül előtte” szabálya). Futtasd újra: npm run gate:merge -- ${view.number}.`;
    return null;
  }
  return 'Ismeretlen kibocsátó művelet — nem engedhető.';
}

function defaultGhView(plan, top) {
  const args = ['pr', 'view', ...(plan.target ? [plan.target] : []), ...(plan.repoFlag ? ['-R', plan.repoFlag] : []), '--json', 'number,headRefOid'];
  try { return JSON.parse(run('gh', args, top, 8000)); } catch { return null; }
}

function main() {
  let raw = '';
  let cwd = process.cwd();
  try {
    const payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
    if (payload.tool_name !== 'Bash' && payload.tool_name !== 'PowerShell') process.exit(0);
    raw = String(payload.tool_input?.command ?? '');
    cwd = payload.cwd || cwd;
  } catch {
    process.exit(0); // értelmezhetetlen bemenet: nem kibocsátó parancsként kezeljük
  }
  let reason;
  try { reason = checkAction(planCommand(raw), cwd, { raw }); } catch (e) { reason = `A minőségkapu-ellenőrzés hibára futott (${String(e?.message ?? e).split('\n')[0]}) — a kibocsátás nem engedhető.`; }
  if (reason) deny(reason);
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]).replace(/\\/g, '/').endsWith('scripts/qa/hooks/check-quality-gates.mjs')) main();
