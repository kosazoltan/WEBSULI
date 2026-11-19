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

/**
 * Van-e a parancs szövegében BÁRHOL kapu-köteles művelet (szándékosan tág: kétség esetén a szigorú ág fut).
 * Önálló szó: a `[\w./:-]` karakterek egy teljes futama (nem része útvonalnak / névnek: `.git/`, `pre-push-gate`, `gate:push`
 * nem számít). L1 (vak ellenőr, 2026-11-18): a felismerés LINEÁRIS — a futamokat egyszer bejárva sorrend-állapotgép
 * (`git` → `push`; `gh` → `pr` → `create|merge`); a korábbi `[\s\S]*…[\s\S]*` minták nagy szövegen szuperlineárisak voltak.
 */
const WORD_RUN = /[\w./:-]+/g;
const isGit = (w) => w === 'git' || w === 'git.exe';
const isGh = (w) => w === 'gh' || w === 'gh.exe';
const isPush = (w) => w === 'push';
const isPr = (w) => w === 'pr';
const isCreateOrMerge = (w) => w === 'create' || w === 'merge';
// Útvonallal megadott git / gh (`C:/…/git.exe' push`, `"…/GitHub CLI/gh.exe" pr merge`): a név után idézőjel és / vagy szóköz jön.
const GIT_PATH = /git(?:\.exe)?['"]?\s/i;
const GH_PATH = /gh(?:\.exe)?['"]?\s/i;
/** A futamok (kisbetűvel) és a kezdő pozíciójuk — egyetlen, lineáris bejárás. */
function wordRuns(s) {
  const out = [];
  for (const m of s.matchAll(WORD_RUN)) out.push({ w: m[0].toLowerCase(), at: m.index });
  return out;
}
/** A `from` pozíciótól a lépések egymás utáni teljesülése (lineáris). */
function inOrder(runs, from, steps) {
  let k = 0;
  for (const r of runs) {
    if (r.at < from || !steps[k](r.w)) continue;
    k += 1;
    if (k === steps.length) return true;
  }
  return false;
}
// ENGEDŐ lista (visszaellenőrzés AA1): csak ezek a NEM futtató eszközök kaphatnak „git push” / „gh pr merge” szöveget idézett
// argumentumban; minden más fej (értelmező, burkoló, ismeretlen eszköz) + kapu-köteles szöveg → fail-closed DENY.
const INTERPRETERS = new Set(['node', 'python', 'python3', 'py', 'deno', 'bun', 'perl', 'ruby']);
const SCRIPT_FILE = /^[^-][^\s]*\.(?:mjs|cjs|js|ts|mts|py|pl|rb)$/i;
const EVAL_FLAGS = new Set(['-e', '-p', '--eval', '--print', '-c', '-E', '-pe', '-ne', 'eval', 'run', '-r', '--require', '--import', '--loader']);
const NON_EXEC = new Set(['echo', 'printf', 'grep', 'egrep', 'fgrep', 'rg', 'cat', 'head', 'tail', 'wc', 'less', 'more', 'findstr',
  'write-output', 'write-host', 'select-string', 'get-content', 'type', 'sls', 'gc']);
export function detectGated(raw) {
  const s = String(raw ?? '');
  const runs = wordRuns(s);
  if (inOrder(runs, 0, [isGit, isPush]) || inOrder(runs, 0, [isGh, isPr, isCreateOrMerge])) return true;
  const gp = GIT_PATH.exec(s);
  if (gp && inOrder(runs, gp.index + gp[0].length, [isPush])) return true;
  const hp = GH_PATH.exec(s);
  if (hp && inOrder(runs, hp.index + hp[0].length, [isPr, isCreateOrMerge])) return true;
  return /\/pulls\/\d+\/merge\b/i.test(s);
}

// PowerShell idézőjel-karakterei (a tipográfiaiak is idézőjelek ott); Bash-ben ezek közönséges karakterek.
const PS_SQ = new Set(["'", '\u2018', '\u2019', '\u201A', '\u201B']);
const PS_DQ = new Set(['"', '\u201C', '\u201D', '\u201E']);
// A PowerShell által szóköznek vett, nem ASCII karakterek (pl. nem törő szóköz).
const NON_ASCII_SPACE = /[\u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/;

/**
 * Egyszerű parancs szavakra bontása a héj (`tool`: Bash | PowerShell) szabályai szerint. `{ ok: false, reason }`, ha a parancs nem
 * egyetlen egyszerű parancs: idézőjelen kívül láncoló / átirányító / csoportosító jel (`& | ; < > ( ) { }`, újsor), bárhol
 * parancshelyettesítés (`$(`, backtick), lezáratlan idézőjel, vagy olyan idézés, amelyet a tokenizáló az adott héjjal egyezően
 * nem tud feldolgozni (kanban #100, 2. kör).
 * - Bash: az egyszeres idézőjelen belül minden szó szerinti; a kettősön belül a `\` csak a `"`, `\`, `$` előtt escape; idézőjelen
 *   kívül a `\` a következő karaktert teszi szó szerintivé; a `$'…'` / `$"…"` nem egyértelmű → nem ok. A tipográfiai idézőjel
 *   közönséges karakter.
 * - PowerShell: a `\` mindig szó szerinti; a tipográfiai idézőjelek is idézőjelek; a duplázott idézőjel szó szerinti; a `--%`
 *   (értelmezés leállítása), a here-string (`@"` / `@'`) és az idézőjelen kívüli nem ASCII szóköz nem ok.
 * - Mindkét héj: a szó elején, idézőjelen kívül álló `#` megjegyzés a SOR VÉGÉIG; az utána álló újsor láncolás (nem ok). A megjegyzés
 *   szövege a `comment` mezőben (kanban #100, 4. kör).
 */
export function tokenizeSimple(raw, { tool = 'Bash' } = {}) {
  const ps = tool === 'PowerShell';
  const isSq = (c) => (ps ? PS_SQ.has(c) : c === "'");
  const isDq = (c) => (ps ? PS_DQ.has(c) : c === '"');
  const s = String(raw ?? '').trim();
  const words = [];
  let word = '';
  let has = false;
  let q = null;
  let comment = null;
  // PowerShell: az idézőjellel KEZDŐDŐ szó az idézőjel lezárásával véget ér (a következő karakter új argumentum) — mérve a héjban.
  let quotedStart = false;
  const closeQuote = () => { q = null; if (ps && quotedStart) { words.push(word); word = ''; has = false; quotedStart = false; } };
  const push = () => { if (has) words.push(word); word = ''; has = false; };
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    const n = s[i + 1];
    if (q === 'sq') {
      if (!isSq(c)) word += c;
      else if (ps && n !== undefined && isSq(n)) { word += n; i += 1; }
      else closeQuote();
      continue;
    }
    if (c === '`' || (c === '$' && n === '(')) return { ok: false, reason: 'parancshelyettesítés / escape (`$(…)` / backtick)' };
    if (q === 'dq') {
      if (isDq(c)) {
        if (ps && n !== undefined && isDq(n)) { word += n; i += 1; } else closeQuote();
      } else if (!ps && c === '\\' && (n === '"' || n === '\\' || n === '$')) { word += n; i += 1; }
      else word += c;
      continue;
    }
    if (!ps && c === '$' && (n === "'" || n === '"')) return { ok: false, reason: 'nem egyértelműen értelmezhető idézés' };
    if (c === '#' && !has) { // megjegyzés a sor végéig; a következő sor (újsor) a szokott módon láncolás → nem ok
      let j = i;
      while (j + 1 < s.length && s[j + 1] !== '\n' && s[j + 1] !== '\r') j += 1;
      comment = s.slice(i, j + 1);
      i = j;
      continue;
    }
    if (ps && c === '@' && n !== undefined && (isSq(n) || isDq(n))) return { ok: false, reason: 'nem egyértelműen értelmezhető idézés (here-string)' };
    if (ps && NON_ASCII_SPACE.test(c)) return { ok: false, reason: 'nem egyértelműen értelmezhető idézés (nem ASCII szóköz)' };
    if (isSq(c)) { quotedStart = !has; q = 'sq'; has = true; continue; }
    if (isDq(c)) { quotedStart = !has; q = 'dq'; has = true; continue; }
    if (!ps && c === '\\') {
      if (n === undefined || n === '\n' || n === '\r') return { ok: false, reason: 'sorfolytatás / lezáratlan escape' };
      word += n; has = true; i += 1;
      continue;
    }
    if ('&|;<>(){}\n\r'.includes(c)) return { ok: false, reason: `láncolás / átirányítás / alshell (\`${c === '\n' || c === '\r' ? 'újsor' : c}\`)` };
    if (c === ' ' || c === '\t') { push(); continue; }
    word += c;
    has = true;
  }
  if (q) return { ok: false, reason: 'lezáratlan idézőjel' };
  push();
  if (ps && words.includes('--%')) return { ok: false, reason: 'nem egyértelműen értelmezhető idézés (`--%`)' };
  return { ok: true, words, comment };
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
const MERGE_FLAG = new Set(['--squash', '-s', '--merge', '-m', '--rebase', '-r', '--delete-branch', '-d', '--admin', '--auto', '--disable-auto']);

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
export function planCommand(raw, { tool = 'Bash' } = {}) {
  // Kanban #100, 4. kör: ismeretlen / hiányzó eszköznév → mindkét héj szabálya szerint; amelyik szigorúbb, az dönt.
  if (tool !== 'Bash' && tool !== 'PowerShell') {
    const a = planCommand(raw, { tool: 'Bash' });
    const b = planCommand(raw, { tool: 'PowerShell' });
    if (a.kind === 'deny') return a;
    if (b.kind === 'deny') return b;
    if (a.kind === 'none') return b;
    if (b.kind === 'none' || JSON.stringify(a) === JSON.stringify(b)) return a;
    return { kind: 'deny', reason: `${SIMPLE_HINT} (Ismeretlen eszköz: a Bash és a PowerShell eltérően értelmezné a parancsot.)` };
  }
  // Kanban #100, 2. kör: a tokenizáló a héj (Bash / PowerShell) szabályai szerint bont; amit nem tud hűen feldolgozni → DENY.
  const t = tokenizeSimple(raw, { tool });
  // A kapu-kötelesség a nyers szövegen ÉS az idézés feloldása utáni szavakon is (a parancsnévbe szúrt idézőjel nem rejti el).
  if (!detectGated(raw) && !(t.ok && detectGated(t.words.join(' ')))) {
    // Bash kapcsos kifejtés (`{a,b}` / `{a..b}`) git / gh mellett: a héj olyan szót állíthat elő, amelyet a nyers szöveg nem mutat.
    if (!t.ok && tool === 'Bash' && /\{[^{}\s'"]*(?:,|\.\.)[^{}\s'"]*\}/.test(raw) && /(?:^|\s)(?:git|gh)(?:\.exe)?\s/i.test(raw)) {
      return { kind: 'deny', reason: `${SIMPLE_HINT} (Kapcsos kifejtés git / gh parancsban.)` };
    }
    return { kind: 'none' };
  }
  if (!t.ok) return { kind: 'deny', reason: `${SIMPLE_HINT} (Talált: ${t.reason}.)` };
  // A „#9” a héjban megjegyzés: a PR-szám nem jutna el a parancshoz → érthető tiltás.
  if (t.comment && /^#\s*\d/.test(t.comment)) return { kind: 'deny', reason: 'A PR számát # nélkül add meg (a héjban a szó eleji # megjegyzést kezd, a szám nem jutna el a parancshoz).' };
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
      // A kapcsolók ÉRTELMEZÉSE után (az érték-kapcsoló utáni szó érték, nem kapcsoló).
      const p = parseFlags(rest, MERGE_VALUE, MERGE_FLAG);
      if (p.error) return { kind: 'deny', reason: `\`gh pr merge\`: ${p.error}.` };
      if (p.vals['--auto']) return { kind: 'deny', reason: 'A `gh pr merge --auto` később, futásőr és `/api/rt/status` nélkül vonna össze — a merge-et közvetlenül a `npm run gate:merge -- <PR>` után, kézzel indítsd.' };
      if (p.vals['--disable-auto']) return { kind: 'none' };
      if (p.pos.length > 1) return { kind: 'deny', reason: `\`gh pr merge\`: nem egyértelmű cél (${p.pos.length} pozicionális argumentum).` };
      const target = p.pos[0] ?? null;
      if (target && !(/^#?\d+$/.test(target) || /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+$/.test(target) || BRANCH.test(target))) {
        return { kind: 'deny', reason: `\`gh pr merge\`: nem egyértelmű cél: \`${target}\` (szám, PR-URL vagy ág).` };
      }
      return { kind: 'pr-merge', target: target ? target.replace(/^#/, '') : null, repoFlag: p.vals['--repo'] ?? p.vals['-R'] ?? null };
    }
    return { kind: 'deny', reason: SIMPLE_HINT };
  }
  // Z2: önálló, nem futtató eszköz (echo, grep, rg, cat …), amelyben a „git push” csak idézett szövegként áll → nem kibocsátás.
  const base = (x) => x.replace(/\\/g, '/').split('/').pop().toLowerCase().replace(/\.(?:exe|cmd|bat|com)$/, '');
  const toolish = (x) => ['git', 'gh'].includes(base(x));
  const onlyQuoted = !w.some((x) => x === 'push' || x === 'pr' || toolish(x));
  if (!/[\\/]/.test(w[0]) && NON_EXEC.has(base(head)) && onlyQuoted) return { kind: 'none' };
  // Kanban #100: értelmező + szkriptfájl (pl. `node kanban.mjs note 5 "… push …"`), kiértékelő kapcsoló nélkül → a kapu-köteles
  // szöveg csak adat egy idézett argumentumban. Az `-e` / `-p` / `--eval` / `-c` kiértékelés, a burkoló és a láncolás DENY marad.
  if (!/[\\/]/.test(w[0]) && INTERPRETERS.has(base(head)) && SCRIPT_FILE.test(w[1] ?? '') && !w.slice(1).some((x) => EVAL_FLAGS.has(x)) && onlyQuoted) return { kind: 'none' };
  return { kind: 'deny', reason: `${SIMPLE_HINT} (A parancs nem közvetlenül \`git push\` / \`gh pr …\`: burkoló, változó, alias vagy más eszköz.)` };
}

// ---- Futtatás határidővel, fail-closed (kanban #100) --------------------------------------------------------------------
// A korlátok a gates.config.json-ból (a hook saját repójának konfigja); alapérték: git 10 s, gh 15 s, a teljes keret 45 s — a
// .claude/settings.json hook-időkorlátja (60 s) alatt: a döntést a hook a saját keretén belül hozza meg. Ha maga a hook-folyamat akad
// el (vagy nem indul), a külső korlát a Claude Code alapbeállításával NEM tiltás — ezt csak az `onFailure: "block"` zárja le.
export function hookConfig() {
  try {
    const p = new URL('../gates/gates.config.json', import.meta.url);
    const c = JSON.parse(readFileSync(p, 'utf8'));
    return testOverride({ gitMs: Number(c.hookGitTimeoutMs) || 10_000, ghMs: Number(c.hookGhTimeoutMs) || 15_000, budgetMs: Number(c.hookBudgetMs) || 45_000 });
  } catch { return testOverride({ gitMs: 10_000, ghMs: 15_000, budgetMs: 45_000 }); } // a konfig hiánya csak az alapértéket hozza — szigorúság nem változik
}

/**
 * Csak a `node --test` alatt (NODE_TEST_CONTEXT): a valódi gites hook-tesztek a gép terhelésétől függetlenül fussanak (kanban #100:
 * terhelt gépen a 10 s-os git-korlát lejárt → a hook helyesen tiltott, a teszt mégis ingadozott). Minden felülírt érték legfeljebb
 * TEST_CAP_MS (55 s), így a keret felülírással sem nőhet a settings.json 60 s-os hook-időkorlátja fölé — akkor sem, ha a
 * NODE_TEST_CONTEXT éles futásban is be van állítva.
 */
export const TEST_CAP_MS = 55_000;
function testOverride(cfg) {
  if (!process.env.NODE_TEST_CONTEXT) return cfg;
  const n = (v, d) => Math.min(Number(v) > 0 ? Number(v) : d, TEST_CAP_MS);
  return { gitMs: n(process.env.WEBSULI_HOOK_GIT_TIMEOUT_MS, cfg.gitMs), ghMs: n(process.env.WEBSULI_HOOK_GH_TIMEOUT_MS, cfg.ghMs), budgetMs: n(process.env.WEBSULI_HOOK_BUDGET_MS, cfg.budgetMs) };
}

/** A hívott program NEM adott választ (időtúllépés, jelzéssel leállítva, indítási hiba) — szemben a gyors, nem nulla kilépéssel. */
export function noAnswer(e) {
  return Boolean(e) && (e.code === 'ETIMEDOUT' || e.code === 'ENOENT' || e.code === 'EPERM' || e.code === 'EACCES' || e.killed === true
    || Boolean(e.signal) || e.status === null || e.status === undefined);
}

export class NoAnswerError extends Error {}

/** A „nem válaszolt” tiltás teendője (kanban #100: a tiltás megmondja, mit tegyen az ügynök). */
export const RETRY_HINT = 'próbáld újra néhány másodperc múlva ugyanazt az egyszerű parancsot; ha tartósan fennáll: docs/minosegkapuk.md — „A kapu-hook hibája”';

/**
 * Futtató-környezet: `exec` befecskendezhető (tesztek), a határidő a hook teljes keretéből fogy. A „nem válaszolt” hibát
 * `NoAnswerError`-ra fordítja (→ DENY a main catch-ében); a gyors, nem nulla kilépést eredeti hibaként adja tovább.
 */
export function makeRunner({ exec = execFileSync, now = Date.now, cfg = hookConfig() } = {}) {
  const deadline = now() + cfg.budgetMs;
  return function run(file, args, cwd, kind = 'git') {
    const left = deadline - now() - 500;
    if (left <= 0) throw new NoAnswerError(`a minőségkapu-hook ideje elfogyott (${Math.round(cfg.budgetMs / 1000)} s) — ${RETRY_HINT}`);
    const timeout = Math.min(kind === 'gh' ? cfg.ghMs : cfg.gitMs, left);
    try {
      return String(exec(file, args, { cwd, encoding: 'utf8', timeout, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })).trim();
    } catch (e) {
      if (noAnswer(e)) throw new NoAnswerError(`a repó állapota nem állapítható meg (a(z) ${file} nem válaszolt ${Math.round(timeout / 1000)} s alatt) — ${RETRY_HINT}`);
      throw e;
    }
  };
}

function repoInfo(dir, run, raw) {
  let top;
  try {
    top = run('git', ['rev-parse', '--show-toplevel'], dir);
  } catch (e) {
    if (e instanceof NoAnswerError) throw e; // nem válaszolt → DENY (nem „más repó”)
    // A git gyorsan, nem nulla kóddal kilépett: nem git-repó. Ha a mappa vagy a parancs a WEBSULI-ra utal, ez gyanús → DENY.
    if (/websuli/i.test(String(dir)) || /websuli/i.test(String(raw))) throw new NoAnswerError('a WEBSULI-ra utaló mappában / parancsban a git nem talált repót — a kapu nem ellenőrizhető');
    return null;
  }
  if (!existsSync(join(top, 'scripts', 'qa', 'gates', 'pre-push-gate.mjs'))) return null; // nem WEBSULI / még kapu nélküli ág
  let common = run('git', ['rev-parse', '--git-common-dir'], top); // hiba → kivétel → DENY
  if (!isAbsolute(common)) common = resolve(top, common);
  const evDir = process.env.WEBSULI_QA_EVIDENCE_DIR || join(common, 'websuli-qa-evidence');
  let maxMin = 15;
  // A konfig hiánya / hibája az alapértéket (15 perc) hozza — ugyanaz, mint a kapu alapértéke; nem enyhít.
  try { maxMin = JSON.parse(readFileSync(join(top, 'scripts', 'qa', 'gates', 'gates.config.json'), 'utf8')).mergeEvidenceMaxMinutes ?? 15; } catch { /* alap */ }
  return { top, evDir, maxMin };
}

function readEv(evDir, name) {
  const p = join(evDir, `${name}.json`);
  if (!existsSync(p)) return null;
  // Sérült bizonyíték → „bukott” (TILT), nem „hiányzik / engedélyezett”.
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return { ok: false, broken: true }; }
}

function currentBranch(top, run) {
  try { return run('git', ['symbolic-ref', '--quiet', '--short', 'HEAD'], top); } catch (e) {
    if (e instanceof NoAnswerError) throw e; // nem válaszolt → DENY a valódi okkal
    return null; // leválasztott HEAD — a hívók erre TILTANAK
  }
}

function localSha(run, top, ref, notFound) {
  try { return run('git', ['rev-parse', '--verify', `refs/heads/${ref}^{commit}`], top); } catch (e) {
    if (e instanceof NoAnswerError) throw e;
    throw new Error(notFound); // nincs ilyen helyi ág → TILT
  }
}

/** Egy terv ellenőrzése a bizonyíték alapján; DENY-indokot ad vissza, vagy null-t (enged). */
export function checkAction(plan, cwd, { now = Date.now(), ghView, raw = '', run = makeRunner() } = {}) {
  if (plan.kind === 'none' || plan.kind === 'push-delete') return null;
  const info = repoInfo(cwd, run, raw);
  if (!info) {
    // Más repó: nem a mi dolgunk — kivéve, ha a parancs a WEBSULI-ra mutat (pl. -R …/WEBSULI, cd …/WEBSULI): akkor fail-closed.
    return /websuli/i.test(raw) ? 'A WEBSULI-ra szóló push / PR / merge parancsot a WEBSULI munkafájából add ki, egyszerű parancsként.' : null;
  }
  if (plan.kind === 'deny') return plan.reason;
  try {
    if (plan.kind === 'push') {
      let sha;
      let label;
      if (plan.ref) {
        sha = localSha(run, info.top, plan.ref, `A pusholt ág (\`${plan.ref}\`) nem helyi ág — csak helyi ágat pusholj, a saját kimenő commitjára szóló bizonyítékkal.`);
        label = plan.ref;
      } else {
        const cur = currentBranch(info.top, run);
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
        sha = localSha(run, info.top, plan.ref, `A --head ág (\`${plan.ref}\`) nem helyi ág — a PR-kapu bizonyítéka nem ellenőrizhető.`);
      } else {
        if (!currentBranch(info.top, run)) return 'Leválasztott HEAD-ről PR-t nyitni nem engedett.';
        sha = run('git', ['rev-parse', '--verify', 'HEAD^{commit}'], info.top);
      }
      const ev = readEv(info.evDir, `pre-pr-${sha}`);
      if (ev?.ok === true) return null;
      const why = ev ? `az utolsó futás BUKOTT (${ev.at ?? '?'})` : 'nincs zöld bizonyíték';
      return `A PR előtti kapu nem zöld a ${sha.slice(0, 12)} fejre (${why}). Előbb a független ellenőr (websuli-fejlesztesi-ellenor skill), aztán: npm run gate:pr -- --body-file <PR-leírás.md>.`;
    }
  } catch (e) {
    if (e instanceof NoAnswerError) throw e;
    return String(e?.message ?? e).split('\n')[0]; // minden más hiba is TILT
  }
  if (plan.kind === 'pr-merge') {
    const view = (ghView ?? ((p, top) => defaultGhView(p, top, run)))(plan, info.top);
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

function defaultGhView(plan, top, run) {
  const args = ['pr', 'view', ...(plan.target ? [plan.target] : []), ...(plan.repoFlag ? ['-R', plan.repoFlag] : []), '--json', 'number,headRefOid'];
  // Bármely hiba (gh nem válaszol, nincs PR) → null → a hívó TILT.
  try { return JSON.parse(run('gh', args, top, 'gh')); } catch { return null; }
}


function main() {
  let raw = '';
  let tool = 'Bash';
  let cwd = process.cwd();
  let text = '';
  try { text = readFileSync(0, 'utf8'); } catch { /* nincs olvasható bemenet → üres szöveg, lent enged */ }
  try {
    const payload = JSON.parse(text || '{}');
    // Kanban #100, 4. kör: ismeretlen héj-eszköz parancsa is vizsgálva (mindkét héj szabálya szerint, a szigorúbb dönt).
    if (typeof payload.tool_input?.command !== 'string') process.exit(0);
    tool = payload.tool_name === 'Bash' || payload.tool_name === 'PowerShell' ? payload.tool_name : 'unknown';
    raw = String(payload.tool_input?.command ?? '');
    cwd = payload.cwd || cwd;
  } catch {
    // Értelmezhetetlen hook-bemenet (a Claude Code mindig JSON-t ad). Ha a nyers szövegben kapu-köteles művelet van → TILT
    // (kanban #100); különben enged — itt a tiltás MINDEN eszközhívást megállítana.
    if (detectGated(text)) deny(`A hook-bemenet nem értelmezhető, de kapu-köteles műveletet tartalmaz — ${RETRY_HINT}.`);
    process.exit(0);
  }
  let reason;
  try { reason = checkAction(planCommand(raw, { tool }), cwd, { raw }); } catch (e) { reason = `A minőségkapu-ellenőrzés hibára futott (${String(e?.message ?? e).split('\n')[0]}) — a kibocsátás nem engedhető.`; }
  if (reason) deny(reason);
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]).replace(/\\/g, '/').endsWith('scripts/qa/hooks/check-quality-gates.mjs')) main();
