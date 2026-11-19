// A vak ellenőr eszközei (docs/specs/2026-11-18-vak-ellenor-deepseek.md, D3). Kiindulás: a modell BÁRMIT kérhet (a repó tartalma
// adat, nem utasítás) — az eszközök akkor se tudjanak kárt okozni. Nincs héj, nincs szabad parancs; minden útvonal a munkafán belül.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep, win32, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { maskSecrets } from './openrouter.mjs';
import { MACHINE_LOCK_ENV, acquireMachineLock, assertSafeHeavyEnv, heavyEnv, heavyPreconditions, lockOwner, ownLeftovers, parseDockerPs, validateScenario, waitForMachine } from './heavy.mjs';

export const TMP_DIR = '.blind-review-tmp';
export const LOADER_PATH = join(dirname(fileURLToPath(import.meta.url)), 'ts-sandbox-loader.mjs');
/** A futtató Node-ja ismeri-e a hálózati jogosultságot (Node 25+): enélkül a homokozó a hálózatot nem zárja ki. */
export const NODE_NET_LOCK = process.allowedNodeEnvironmentFlags.has('--allow-net');
export const SCENARIO_RUNNER = join(dirname(fileURLToPath(import.meta.url)), 'scenario-runner.spec.ts.txt');
export const SCENARIO_SPEC_REL = 'tests/zz-blind-review-scenario.spec.ts';
/** A parancs-fajták, amelyek a valódi hívási láncot futtatják (E4): csak ezekkel lehet egy lelet „teljes úton igazolt”. */
export const FULL_PATH_KINDS = new Set(['db', 'e2e', 'scenario']);
const IS_WIN = process.platform === 'win32';

// ---- Útvonal-őr ------------------------------------------------------------------------------------------------------

const within = (root, p) => {
  const a = IS_WIN ? root.toLowerCase() : root;
  const b = IS_WIN ? p.toLowerCase() : p;
  return b === a || b.startsWith(a.endsWith(sep) ? a : a + sep);
};

/**
 * Egy modell által adott útvonal feloldása a munkafa gyökeréhez. Elutasít: abszolút / meghajtós / UNC útvonal, `..` kijutás,
 * `.git`, `.env*`, és minden olyan útvonal, amelynek a legmélyebb létező őse (realpath) a munkafán kívülre mutat (symlink, junction).
 * @returns {{ ok: true, abs: string, rel: string } | { ok: false, error: string }}
 */
export function resolveInside(root, p) {
  if (typeof p !== 'string' || !p.trim()) return { ok: false, error: 'hiányzó útvonal' };
  if (p.includes('\0')) return { ok: false, error: 'érvénytelen útvonal' };
  const raw = p.trim();
  if (isAbsolute(raw) || win32.isAbsolute(raw) || posix.isAbsolute(raw) || /^[A-Za-z]:/.test(raw) || /^[\\/]{2}/.test(raw)) {
    return { ok: false, error: `abszolút útvonal nem megengedett (a munkafa gyökeréhez képest add meg): ${raw}` };
  }
  const abs = resolve(root, raw);
  const rel = relative(root, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) return { ok: false, error: `az útvonal a munkafán kívülre mutat: ${raw}` };
  const segs = rel.split(/[\\/]+/).filter(Boolean);
  for (const s of segs) {
    if (s.toLowerCase() === '.git') return { ok: false, error: 'a .git nem olvasható / írható az eszközökkel' };
    if (/^\.env(\..*)?$/i.test(s) && !/\.(example|sample|template)$/i.test(s)) return { ok: false, error: '.env fájl nem olvasható' };
  }
  let probe = abs;
  while (!existsSync(probe)) {
    const up = dirname(probe);
    if (up === probe) break;
    probe = up;
  }
  let real;
  try { real = realpathSync.native(probe); } catch { return { ok: false, error: `az útvonal nem oldható fel: ${raw}` }; }
  if (!within(root, real)) return { ok: false, error: `az útvonal (link / csatolás) a munkafán kívülre mutat: ${raw}` };
  return { ok: true, abs, rel: segs.join('/') };
}

// ---- Tiszta környezet ------------------------------------------------------------------------------------------------

const ENV_ALLOW = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'USERPROFILE', 'HOME',
  'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE', 'OS', 'LANG', 'LC_ALL', 'TZ', 'USERNAME']);
const ENV_SECRETISH = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|DATABASE|_DSN|_URL$/i;

/** A gyerekfolyamat környezete: engedélylistás nevek + rögzített tesztértékek. Kulcs, token, adatbázis-URL nem öröklődik. */
export function cleanEnv(env = process.env, extra = {}) {
  const out = {};
  for (const [k, v] of Object.entries(env)) {
    if (v == null) continue;
    if (!ENV_ALLOW.has(k.toUpperCase())) continue;
    if (ENV_SECRETISH.test(k)) continue;
    out[k] = v;
  }
  return { ...out, NODE_ENV: 'test', CI: '1', NO_COLOR: '1', FORCE_COLOR: '0', NPM_CONFIG_UPDATE_NOTIFIER: 'false', NPM_CONFIG_OFFLINE: 'true',
    GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', ...extra };
}

// ---- Futtatás --------------------------------------------------------------------------------------------------------

function killTree(child) {
  try {
    if (IS_WIN) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
  } catch { /* a folyamat közben kilépett — nincs mit leállítani */ }
}

/** Valódi futtató héj nélkül, argumentumtömbbel, időkorláttal (a folyamatfa leállításával) és pufferplafonnal. */
export function realRun(file, args, { cwd, env, timeoutMs = 300_000, maxBuffer = 2_000_000 } = {}) {
  return new Promise((done) => {
    const t0 = Date.now();
    let out = '';
    let err = '';
    let timedOut = false;
    let child;
    try {
      child = spawn(file, args, { cwd, env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], detached: !IS_WIN });
    } catch (e) {
      done({ code: 127, stdout: '', stderr: String(e?.message ?? e), timedOut: false, ms: 0 });
      return;
    }
    const cap = (cur, d) => (cur.length < maxBuffer ? cur + d : cur);
    child.stdout.on('data', (d) => { out = cap(out, d); });
    child.stderr.on('data', (d) => { err = cap(err, d); });
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeoutMs);
    child.on('error', (e) => { clearTimeout(timer); done({ code: 127, stdout: out, stderr: `${err}\n${e.message}`, timedOut, ms: Date.now() - t0 }); });
    child.on('close', (code) => { clearTimeout(timer); done({ code: timedOut ? 124 : (code ?? 1), stdout: out, stderr: err, timedOut, ms: Date.now() - t0 }); });
  });
}

/** Csonkolás: az eleje és a vége marad (a tesztkimenet lényege jellemzően a végén van). */
export function truncate(text, max) {
  const s = String(text ?? '');
  if (s.length <= max) return s;
  const head = Math.floor(max * 0.4);
  const tailLen = max - head;
  return `${s.slice(0, head)}\n… [csonkolva: ${s.length - max} karakter kimaradt] …\n${s.slice(-tailLen)}`;
}

// ---- Parancs-engedélylista -------------------------------------------------------------------------------------------

const refuse = (error) => ({ ok: false, error });
const HELP = 'Engedélyezett parancsok (argv tömbként): ["node","--test","<követett .test.mjs>"…], '
  + `["node","${TMP_DIR}/<saját fájl>.mjs|.ts"] (homokozóban), ["npx","tsx","--test","<követett source/…​.test.ts>"…], `
  + '["npx","tsc","--noEmit"] (+ ["-p","tsconfig.test.json"]), ["npm","run","<engedélyezett szkript>"].';

function npmCli(node) {
  const d = dirname(node);
  for (const c of [join(d, 'node_modules', 'npm', 'bin', 'npm-cli.js'), join(d, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')]) {
    if (existsSync(c)) return c;
  }
  return null;
}

/**
 * A modell által kért parancs → a ténylegesen indítandó `node …` argumentumtömb, vagy elutasítás. KÉT bizalmi szint:
 *  - a fej KÖVETETT fájljai (a fejlesztő kódja) a szokásos futtatóval;
 *  - az ellenőr SAJÁT fájljai (TMP_DIR — a modell írta) CSAK a Node jogosultsági modelljében (nincs munkafán kívüli fájl,
 *    gyerekfolyamat, worker, hálózat).
 * @param {string[]} argv
 * @param {{ root: string, node: string, isTracked: (rel: string) => boolean, cfg: object, nodeModulesReal?: string|null }} ctx
 */
export function planCommand(argv, ctx) {
  if (!Array.isArray(argv) || !argv.length || argv.some((a) => typeof a !== 'string' || !a || a.includes('\0'))) {
    return refuse(`a parancs nem üres szövegtömb legyen. ${HELP}`);
  }
  const { root, node, cfg } = ctx;
  const src = join(root, 'source');
  const tmpAbs = join(root, TMP_DIR);

  /** Fájl-argumentum feloldása: a munkafa gyökeréhez, vagy (ha úgy nincs) a source/ mappához képest. */
  const file = (a) => {
    if (a.startsWith('-')) return refuse(`kapcsoló nem megengedett ezen a helyen: ${a}`);
    let r = resolveInside(root, a);
    if (r.ok && !existsSync(r.abs)) {
      const alt = resolveInside(root, join('source', a));
      if (alt.ok && existsSync(alt.abs)) r = alt;
    }
    if (!r.ok) return r;
    if (!existsSync(r.abs) || !statSync(r.abs).isFile()) return refuse(`nincs ilyen fájl: ${a}`);
    return { ...r, own: within(tmpAbs, r.abs), tracked: ctx.isTracked(r.rel) };
  };

  const sandbox = (f) => {
    if (!/\.(mjs|js|ts|mts|tsx)$/.test(f.rel)) return refuse('a saját fájl kiterjesztése .mjs / .js / .ts / .mts / .tsx legyen');
    if (!(ctx.netLock ?? NODE_NET_LOCK)) {
      return refuse(`a homokozó ezen a Node-verzión (${process.version}) nem zárja ki a hálózatot (a --allow-net jogosultság Node 25+-tól van) — saját ellenpróba most nem futtatható; használd a követett teszteket / a böngészős forgatókönyvet, és a „Mit NEM vizsgáltam” szakaszban jelezd`);
    }
    const args = ['--permission', `--allow-fs-read=${root}`, `--allow-fs-read=${LOADER_PATH}`, `--allow-fs-write=${tmpAbs}`];
    if (ctx.nodeModulesReal) args.push(`--allow-fs-read=${ctx.nodeModulesReal}`);
    args.push('--import', pathToFileURL(LOADER_PATH).href, f.abs);
    return { ok: true, file: node, args, cwd: root, sandboxed: true, env: { BLIND_REVIEW_ROOT: root }, label: `homokozó: node ${f.rel}` };
  };

  const [cmd, ...rest] = argv;

  if (cmd === 'node') {
    const files = rest[0] === '--test' ? rest.slice(1) : rest;
    if (!files.length) return refuse(`hiányzó fájl. ${HELP}`);
    const fs = files.map(file);
    const bad = fs.find((f) => !f.ok);
    if (bad) return bad;
    if (fs.every((f) => f.own)) {
      if (fs.length !== 1) return refuse('a homokozóban egyszerre egy saját fájl futtatható');
      return sandbox(fs[0]);
    }
    if (rest[0] !== '--test') return refuse(`követett fájl csak tesztként futtatható: ["node","--test",<fájl>]. ${HELP}`);
    const wrong = fs.find((f) => !f.tracked || !/\.test\.[cm]?js$/.test(f.rel));
    if (wrong) return refuse(`csak a fej követett *.test.mjs / .js fájlja futtatható így (saját fájl: ${TMP_DIR}/ alatt, külön parancsban): ${wrong.rel}`);
    return { ok: true, file: node, args: ['--test', ...fs.map((f) => f.abs)], cwd: root, sandboxed: false, label: `node --test ${fs.map((f) => f.rel).join(' ')}` };
  }

  if (cmd === 'npx' && rest[0] === 'tsx') {
    const files = (rest[1] === '--test' ? rest.slice(2) : rest.slice(1));
    if (!files.length) return refuse(`hiányzó fájl. ${HELP}`);
    const fs = files.map(file);
    const bad = fs.find((f) => !f.ok);
    if (bad) return bad;
    if (fs.every((f) => f.own)) {
      if (fs.length !== 1) return refuse('a homokozóban egyszerre egy saját fájl futtatható');
      return sandbox(fs[0]);
    }
    if (rest[1] !== '--test') return refuse(`követett fájl csak tesztként futtatható: ["npx","tsx","--test",<fájl>]. ${HELP}`);
    const wrong = fs.find((f) => !f.tracked || !/^source\/.+\.test\.tsx?$/.test(f.rel));
    if (wrong) return refuse(`csak a fej követett source/…​.test.ts fájlja futtatható így (integrációs teszt és saját fájl nem): ${wrong.rel}`);
    const cli = join(src, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    if (!existsSync(cli)) return refuse('a tsx nincs telepítve a munkafában (source/node_modules hiányzik) — ez a parancs most nem futtatható');
    return { ok: true, file: node, args: [cli, '--test', ...fs.map((f) => f.abs)], cwd: src, sandboxed: false, label: `tsx --test ${fs.map((f) => f.rel).join(' ')}` };
  }

  if (cmd === 'npx' && rest[0] === 'tsc') {
    const tail = rest.slice(1);
    const ok = (tail.length === 1 && tail[0] === '--noEmit')
      || (tail.length === 3 && tail[0] === '--noEmit' && tail[1] === '-p' && /^tsconfig(\.test)?\.json$/.test(tail[2]));
    if (!ok) return refuse(`a tsc csak így futtatható: ["npx","tsc","--noEmit"] vagy [… ,"-p","tsconfig.test.json"]. ${HELP}`);
    const cli = join(src, 'node_modules', 'typescript', 'bin', 'tsc');
    if (!existsSync(cli)) return refuse('a typescript nincs telepítve a munkafában (source/node_modules hiányzik)');
    return { ok: true, file: node, args: [cli, ...tail], cwd: src, sandboxed: false, label: `tsc ${tail.join(' ')}` };
  }

  if (cmd === 'npx' && rest[0] === 'playwright') {
    if (!cfg.allowPlaywright) return refuse('a böngészős (Playwright) futtatás a konfigban ki van kapcsolva (blindReview.allowPlaywright) — a „Mit NEM vizsgáltam” szakaszban jelezd');
    if (!(rest.length === 4 && rest[1] === 'test' && rest[3] === '--workers=1')) return refuse('a Playwright csak így futtatható: ["npx","playwright","test","<követett spec>","--workers=1"]');
    const f = file(rest[2]);
    if (!f.ok) return f;
    if (!f.tracked || !/^source\/tests\/.+\.spec\.ts$/.test(f.rel)) return refuse(`csak a fej követett source/tests/*.spec.ts fájlja futtatható: ${f.rel}`);
    const cli = join(src, 'node_modules', '@playwright', 'test', 'cli.js');
    if (!existsSync(cli)) return refuse('a Playwright nincs telepítve a munkafában');
    return { ok: true, file: node, args: [cli, 'test', relative(src, f.abs).replace(/\\/g, '/'), '--workers=1'], cwd: src, sandboxed: false, label: `playwright test ${f.rel}` };
  }

  if (cmd === 'npm' && rest[0] === 'run') {
    const allowed = cfg.npmScripts ?? [];
    if (rest.length !== 2 || !allowed.includes(rest[1])) return refuse(`csak ezek az npm-szkriptek futtathatók: ${allowed.join(', ') || '(nincs)'}; további argumentum nem adható`);
    const cli = npmCli(node);
    if (!cli) return refuse('az npm nem található a node mellett — ez a parancs most nem futtatható');
    return { ok: true, file: node, args: [cli, 'run', rest[1]], cwd: root, sandboxed: false, label: `npm run ${rest[1]}` };
  }

  return refuse(`ez a parancs nincs az engedélylistán: ${argv.slice(0, 3).join(' ')}. ${HELP}`);
}

// ---- Az eszközök -----------------------------------------------------------------------------------------------------

const str = { type: 'string' };
const fn = (name, description, properties, required = []) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

export const TOOL_SCHEMAS = [
  fn('read_file', 'Fájl olvasása a munkafából, sorszámozva (legfeljebb 400 sor hívásonként).', { path: str, start_line: { type: 'integer' }, end_line: { type: 'integer' } }, ['path']),
  fn('list_dir', 'Mappa tartalmának listázása a munkafában.', { path: str }, ['path']),
  fn('search', 'Keresés reguláris kifejezéssel a munkafa követett fájljaiban (fájl:sor:szöveg).', { pattern: str, path: str, glob: str, ignore_case: { type: 'boolean' } }, ['pattern']),
  fn('git_diff', 'A vizsgált változás: git diff base...head. stat=true: csak a fájllista. paths: szűkítés fájlokra / mappákra.', { paths: { type: 'array', items: str }, stat: { type: 'boolean' }, context_lines: { type: 'integer' } }),
  fn('git_log', 'A vizsgált commitok listája (base..head), opcionálisan fájlokra szűkítve.', { paths: { type: 'array', items: str }, max_count: { type: 'integer' } }),
  fn('git_show', 'Egy commit (ref: "head", "base" vagy a fej egy ősének hash-e) megmutatása; path megadásával a fájl akkori tartalma.', { ref: str, path: str }, ['ref']),
  fn('run_command', `Parancs futtatása a munkafában, argv tömbként, héj nélkül. ${HELP} Saját ellenpróbát előbb a write_temp_file eszközzel írj.`, { argv: { type: 'array', items: str }, timeout_sec: { type: 'integer' } }, ['argv']),
  fn('write_temp_file', `Saját eldobható teszt- / segédfájl írása a ${TMP_DIR}/ mappába (csak fájlnév, mappa nélkül). Futtatás: run_command ["node","${TMP_DIR}/<név>"].`, { name: str, content: str }, ['name', 'content']),
  fn('run_db_tests', 'NEHÉZ futás: a repó eldobható adatbázisos integrációs tesztjei (npm run test:learning-db — saját postgres:17 konténer loopbacken, a végén leállítva; valódi e-mail nem megy ki). Lassú (több perc), futásonként korlátozott számban. Lelet-bizonyítéknál: run.argv = ["run_db_tests"].', {}),
  fn('run_e2e', 'NEHÉZ futás: a fej KÖVETETT Playwright-specjei (legfeljebb 3, source/tests/*.spec.ts) a repó e2e-futtatójával (eldobható adatbázis, saját szerver, --workers=1). Lelet-bizonyítéknál: run.argv = ["run_e2e", <a megadott specek>].', { specs: { type: 'array', items: str } }, ['specs']),
  fn('run_browser_scenario', `NEHÉZ futás: SAJÁT böngészős próba deklaratív forgatókönyvből (előbb write_temp_file-lal írd: ${TMP_DIR}/<név>.json). Alak: {"cases":[{"name":"…","viewport":{"width":390,"height":844},"observeLayoutShift":false,"steps":[…]}]} (1–6 eset, esetenként 1–40 lépés). Lépések (egy művelet / lépés): {"goto":"/útvonal"}, {"click":"<css>"}, {"fill":"<css>","value":"…"}, {"press":"Enter"}, {"wait":ms}, {"waitFor":"<css>","state":"visible|hidden"}, {"mockApi":"/api/…","status":502,"body":"<html>…","delayMs":0}, {"delayApi":"/api/…","delayMs":3000}, {"offline":true}, {"evaluate":"<oldalon belüli JS-kifejezés>"}, {"measure":"<css>"} (doboz, túlcsordulás, számított stílus, szöveg, aria), {"readLayoutShift":true} (observeLayoutShift: true mellett), {"screenshot":"név"} (a képet megkapod). Nem helyi kérés tiltva. Lelet-bizonyítéknál: run.argv = ["run_browser_scenario","${TMP_DIR}/<név>.json"].`, { scenario_file: str }, ['scenario_file']),
  fn('submit_report', 'A KÉSZ jelentés leadása: report = a teljes markdown jelentés (a megbízás-sablon formájában); findings = MINDEN lelet strukturáltan, '
    + 'amelyet a futtató GÉPILEG visszaellenőriz (a fájl:sor létezik-e, az idézet ott van-e; a run a saját parancsnaplóddal egyezik-e). '
    + 'Nem ellenőrizhető blokkoló / közepes lelettel a leadás elutasításra kerül. Ha nincs lelet: findings = [].', {
    report: str,
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'rövid azonosító, pl. L1 — a jelentés szövegében is így szerepeljen' },
          severity: { type: 'string', enum: ['blokkoló', 'közepes', 'kicsi'] },
          title: str,
          file: { type: 'string', description: 'útvonal a munkafa gyökeréhez képest' },
          line: { type: 'integer', description: 'a hibás sor száma a vizsgált fejen' },
          quote: { type: 'string', description: 'a hivatkozott sor(ok) kódja SZÓ SZERINT (legalább 8 karakter)' },
          run: {
            type: 'object',
            description: 'csak ha a leletet futtatással igazoltad: argv = a ténylegesen futtatott run_command argv-je (vagy ["run_db_tests"] / ["run_e2e", …] / ["run_browser_scenario", fájl]); output_excerpt = a kimenet szó szerinti részlete; input = a próba bemenete szó szerint (a futtatott fájlból / forgatókönyvből vagy a kimenetből); scope = teljes_ut (a valódi hívási lánc: böngésző / adatbázis) vagy elszigetelt (függvény közvetlen hívása, egységteszt)',
            properties: { argv: { type: 'array', items: str }, output_excerpt: str, input: str, scope: { type: 'string', enum: ['teljes_ut', 'elszigetelt'] } },
            required: ['argv', 'output_excerpt', 'input', 'scope'],
          },
        },
        required: ['id', 'severity', 'title', 'file', 'line', 'quote'],
      },
    },
  }, ['report', 'findings']),
];

export const INVESTIGATIVE = ['read_file', 'list_dir', 'search', 'git_diff', 'git_log', 'git_show', 'run_command', 'write_temp_file', 'run_db_tests', 'run_e2e', 'run_browser_scenario'];
export const READING = ['read_file', 'search', 'git_diff', 'git_show'];

/**
 * @param {{ root: string, base: string, head: string, cfg: object, node?: string, run?: Function, env?: object, key?: string,
 *           nodeModulesReal?: string|null, onReport: (text: string) => { ok: boolean, error?: string }, shouldStop?: () => string|null }} ctx
 * @returns {{ call: (name: string, args: object) => Promise<string>, counts: Record<string, number> }}
 */
export function makeTools(ctx) {
  const { root, base, head, cfg } = ctx;
  const node = ctx.node ?? process.execPath;
  const run = ctx.run ?? realRun;
  // A környezet-szűrő injektálható (teszt: a szűrő hibáját a nehéz futás második védvonalának, az assertSafeHeavyEnv-nek kell megfognia).
  const env = (ctx.envFilter ?? cleanEnv)(ctx.env ?? process.env);
  const maxOut = cfg.toolOutputMaxChars ?? 12_000;
  const counts = {};
  let tempFiles = 0;
  const runLog = [];
  // A munkafa abszolút útvonala (gépfüggő, a felhasználónevet is hordozhatja) nem megy ki a modellnek: rögzített jelölőre cseréljük.
  const scrub = (text) => {
    let s = String(text ?? '');
    for (const [p, mark] of [[root, '<munkafa>'], [ctx.nodeModulesReal, '<node_modules>']]) {
      if (!p) continue;
      for (const v of new Set([p, p.replace(/\\/g, '/'), p.replace(/\\/g, '\\\\')])) s = s.split(v).join(mark);
    }
    return s;
  };
  // A csonkolás a beérkezéskor, egyszer, determinisztikusan történik — a korábbi üzenetek később nem változnak (gyorsítótár).
  const out = (text) => truncate(maskSecrets(scrub(text), ctx.key), maxOut);
  const git = (args, timeoutMs = 60_000) => run('git', ['-c', 'core.quotepath=false', '-c', 'core.fsmonitor=false', '-c', 'diff.external=', '--no-pager', ...args], { cwd: root, env, timeoutMs });
  const trackedCache = new Map();
  const isTracked = (rel) => {
    if (!trackedCache.has(rel)) {
      const r = spawnSync('git', ['ls-files', '--error-unmatch', '--', rel], { cwd: root, env, windowsHide: true, stdio: 'ignore' });
      trackedCache.set(rel, r.status === 0);
    }
    return trackedCache.get(rel);
  };
  const planCtx = { root, node, cfg, nodeModulesReal: ctx.nodeModulesReal ?? null, isTracked: ctx.isTracked ?? isTracked };
  /** A parancs fájl-argumentumainak tartalma a futás PILLANATÁBAN (E4: a lelet „input” mezője ebben vagy a kimenetben ellenőrizhető). */
  const sourcesOf = (argv) => {
    let text = '';
    for (const a of argv) {
      if (typeof a !== 'string' || a.startsWith('-')) continue;
      for (const cand of [a, `source/${a}`]) {
        const r = resolveInside(root, cand);
        if (r.ok && existsSync(r.abs) && statSync(r.abs).isFile() && statSync(r.abs).size <= 200_000) { text += `\n${readFileSync(r.abs, 'utf8')}`; break; }
      }
    }
    return text;
  };
  let heavyRuns = 0;
  let lockWaitTotal = 0;
  /** A gép foglaltsága miatt NEM FUTOTT nehéz eszközök — a jelentés „Mit NEM vizsgáltam” szakaszának meg kell neveznie őket. */
  const notRun = [];
  let scenarioRuns = 0;
  const dockerPs = ctx.dockerPs ?? (async () => (await run('docker', ['ps', '--format', '{{.Names}}\t{{.CreatedAt}}'], { cwd: root, env, timeoutMs: 30_000 })).stdout);
  /**
   * Egy nehéz futás: darabplafon → előfeltételek → GÉPI ZÁR (ha `WEBSULI_MACHINE_LOCK_DIR` meg van adva) → konténer-sorompó →
   * biztonságos környezet (ellenőrizve) → futás → saját konténer takarítása → a zár elengedése (finally — hibánál is).
   * @returns {Promise<{ text: string, ok: boolean }>}
   */
  const heavyRun = async (opts) => {
    const max = cfg.maxHeavyRuns ?? 4;
    if (heavyRuns >= max) return { ok: false, text: `ELUTASÍTVA: a nehéz futások száma elérte a plafont (${max} / futás) — a „Mit NEM vizsgáltam” szakaszban jelezd` };
    const pre = await heavyPreconditions({ root, run, env });
    if (pre) return { ok: false, text: `ELUTASÍTVA: ${pre}` };
    const lockDir = ctx.machineLockDir !== undefined ? ctx.machineLockDir : (process.env[MACHINE_LOCK_ENV] || null);
    if (!lockDir) return heavyRunLocked(opts, 0);
    // A zár-várakozás saját, futásonkénti összkorláttal (machineLockWaitTotalSec), a falióra-keretbe NEM számítva (onLockWait).
    const budgetLeft = (cfg.machineLockWaitTotalSec ?? 1800) * 1000 - lockWaitTotal;
    const lock = await acquireMachineLock({ dir: lockDir, owner: lockOwner(ctx.head ?? head, opts.tool, new Date(ctx.now ? ctx.now() : Date.now())),
      maxWaitMs: Math.max(0, Math.min((cfg.machineLockWaitSec ?? 1200) * 1000, budgetLeft)), pollMs: 10_000, sleep: ctx.sleep, now: ctx.now, shouldStop: ctx.shouldStop ?? (() => null) });
    lockWaitTotal += lock.waitedMs;
    ctx.onLockWait?.(lock.waitedMs);
    if (!lock.ok) notRun.push({ tool: opts.tool, reason: lock.reason });
    if (!lock.ok) return { ok: false, text: `NEM FUTOTT: gép foglalt — ${lock.reason}${lock.holder ? ` (a zár gazdája: ${lock.holder})` : ''}. Ez nem bukás: a „Mit NEM vizsgáltam” szakaszban jelezd, vagy később próbáld újra.` };
    try {
      return await heavyRunLocked(opts, lock.waitedMs);
    } finally {
      lock.release();
    }
  };
  const heavyRunLocked = async ({ label, kind, argvRepr, args, extraEnv = {}, sources = '' }, lockWaitedMs) => {
    const src = join(root, 'source');
    const gate = await waitForMachine({ ps: dockerPs, maxWaitMs: (cfg.heavyWaitMaxSec ?? 600) * 1000, sleep: ctx.sleep, now: ctx.now, shouldStop: ctx.shouldStop ?? (() => null) });
    if (!gate.ok) return { ok: false, text: `ELUTASÍTVA: ${gate.reason}` };
    const remaining = ctx.remainingMs ? ctx.remainingMs() : Infinity;
    if (remaining < 90_000) return { ok: false, text: 'ELUTASÍTVA: a falióra-keretből kevesebb mint 90 s maradt — nehéz futás már nem fér bele' };
    const timeoutMs = Math.min((cfg.heavyTimeoutSec ?? 900) * 1000, remaining - 60_000);
    const childEnv = { ...heavyEnv(env), ...extraEnv };
    assertSafeHeavyEnv(childEnv);
    heavyRuns += 1;
    const before = parseDockerPs(await dockerPs());
    const x = await run(node, args, { cwd: src, env: childEnv, timeoutMs, maxBuffer: 4_000_000 });
    const after = parseDockerPs(await dockerPs());
    const stopped = [];
    for (const name of ownLeftovers(before, after, `${x.stdout}\n${x.stderr}`)) {
      await run('docker', ['stop', '--time', '2', name], { cwd: root, env, timeoutMs: 60_000 });
      stopped.push(name);
    }
    const head = `$ ${label}\nkilépési kód: ${x.code}${x.timedOut ? ' (IDŐTÚLLÉPÉS — a folyamat leállítva)' : ''}; idő: ${(x.ms / 1000).toFixed(1)} s${lockWaitedMs > 1000 ? `; gépi zár-várakozás: ${Math.round(lockWaitedMs / 1000)} s` : ''}${gate.waitedMs > 1000 ? `; sorompó-várakozás: ${Math.round(gate.waitedMs / 1000)} s` : ''}${stopped.length ? `; a futtató leállította a maradék saját konténert: ${stopped.length} db` : ''}`;
    const text = out(`${head}\n--- stdout ---\n${x.stdout}\n--- stderr ---\n${x.stderr}`);
    runLog.push({ argv: argvRepr, output: text, kind, sources });
    return { ok: x.code === 0, text };
  };
  const paths = (list) => {
    const res = [];
    for (const p of Array.isArray(list) ? list : []) {
      const r = resolveInside(root, p);
      if (!r.ok) return r;
      res.push(r.rel || '.');
    }
    return { ok: true, list: res };
  };
  let rg; // null: nincs ripgrep → saját kereső

  const impl = {
    async read_file({ path, start_line: a = 1, end_line: b }) {
      const r = resolveInside(root, path);
      if (!r.ok) return `HIBA: ${r.error}`;
      if (!existsSync(r.abs) || !statSync(r.abs).isFile()) return `HIBA: nincs ilyen fájl: ${path}`;
      if (statSync(r.abs).size > 4_000_000) return 'HIBA: a fájl túl nagy (> 4 MB) — használd a search eszközt';
      const buf = readFileSync(r.abs);
      if (buf.subarray(0, 8000).includes(0)) return 'HIBA: bináris fájl';
      const lines = buf.toString('utf8').replace(/\r\n/g, '\n').split('\n');
      const from = Math.max(1, Number(a) || 1);
      const to = Math.min(lines.length, Number(b) || from + 399, from + 399);
      const body = lines.slice(from - 1, to).map((l, i) => `${String(from + i).padStart(5)}  ${l}`).join('\n');
      return out(`${r.rel} — ${from}–${to}. sor (összesen ${lines.length})\n${body}`);
    },
    async list_dir({ path = '.' }) {
      const r = path === '.' || path === '' ? { ok: true, abs: root, rel: '' } : resolveInside(root, path);
      if (!r.ok) return `HIBA: ${r.error}`;
      if (!existsSync(r.abs) || !statSync(r.abs).isDirectory()) return `HIBA: nincs ilyen mappa: ${path}`;
      const items = readdirSync(r.abs, { withFileTypes: true }).filter((e) => e.name.toLowerCase() !== '.git').slice(0, 400).map((e) => {
        const st = lstatSync(join(r.abs, e.name));
        if (st.isSymbolicLink()) return `${e.name}/ (csatolás — az eszközökkel nem olvasható)`;
        return st.isDirectory() ? `${e.name}/` : e.name;
      });
      return out(`${r.rel || '.'}/\n${items.sort().join('\n')}`);
    },
    async search({ pattern, path = '.', glob, ignore_case: ic }) {
      if (typeof pattern !== 'string' || !pattern) return 'HIBA: hiányzó minta';
      const r = path === '.' ? { ok: true, rel: '.' } : resolveInside(root, path);
      if (!r.ok) return `HIBA: ${r.error}`;
      if (glob != null && (typeof glob !== 'string' || glob.includes('..') || isAbsolute(glob) || /^[A-Za-z]:/.test(glob))) return 'HIBA: érvénytelen glob';
      if (rg === undefined) rg = spawnSync('rg', ['--version'], { windowsHide: true, stdio: 'ignore', env }).status === 0;
      if (rg) {
        const args = ['--line-number', '--no-heading', '--color', 'never', '--max-columns', '300', '--max-count', '30', ...(ic ? ['-i'] : []),
          ...(glob ? ['--glob', glob] : []), '--glob', `!${TMP_DIR}`, '-e', pattern, '--', r.rel || '.'];
        const x = await run('rg', args, { cwd: root, env, timeoutMs: 60_000 });
        if (x.code > 1) return `HIBA: ${out(x.stderr)}`;
        return out(x.stdout.trim() || 'nincs találat');
      }
      let re;
      try { re = new RegExp(pattern, ic ? 'i' : ''); } catch (e) { return `HIBA: érvénytelen minta: ${e.message}`; }
      const ls = await git(['ls-files', '--', r.rel || '.']);
      const hits = [];
      for (const f of ls.stdout.split('\n').filter(Boolean)) {
        if (hits.length >= 200) break;
        const p = resolveInside(root, f);
        if (!p.ok || !existsSync(p.abs) || statSync(p.abs).size > 1_000_000) continue;
        readFileSync(p.abs, 'utf8').split('\n').forEach((l, i) => { if (hits.length < 200 && re.test(l)) hits.push(`${f}:${i + 1}:${l.slice(0, 300)}`); });
      }
      return out(hits.join('\n') || 'nincs találat');
    },
    async git_diff({ paths: ps, stat, context_lines: n }) {
      const p = paths(ps);
      if (!p.ok) return `HIBA: ${p.error}`;
      const ctxN = Math.max(0, Math.min(20, Number.isFinite(Number(n)) && n != null ? Number(n) : 3));
      const x = await git(['diff', '--no-color', '--no-ext-diff', '--no-textconv', stat ? '--stat' : `-U${ctxN}`, `${base}...${head}`, '--', ...(p.list.length ? p.list : ['.'])]);
      return x.code === 0 ? out(x.stdout || 'nincs különbség') : `HIBA: ${out(x.stderr)}`;
    },
    async git_log({ paths: ps, max_count: m }) {
      const p = paths(ps);
      if (!p.ok) return `HIBA: ${p.error}`;
      const max = Math.max(1, Math.min(100, Number(m) || 30));
      const x = await git(['log', '--no-color', `--max-count=${max}`, '--date=short', '--format=%h %ad %s', `${base}..${head}`, '--', ...(p.list.length ? p.list : ['.'])]);
      return x.code === 0 ? out(x.stdout || 'nincs commit a tartományban') : `HIBA: ${out(x.stderr)}`;
    },
    async git_show({ ref, path }) {
      let sha;
      if (ref === 'head') sha = head;
      else if (ref === 'base') sha = base;
      else if (typeof ref === 'string' && /^[0-9a-f]{7,40}$/i.test(ref)) {
        const anc = await git(['merge-base', '--is-ancestor', ref, head]);
        if (anc.code !== 0) return 'HIBA: a ref csak "head", "base" vagy a fej egy őse lehet';
        sha = ref;
      } else return 'HIBA: a ref csak "head", "base" vagy commit-hash lehet';
      if (path != null && path !== '') {
        const r = resolveInside(root, path);
        if (!r.ok) return `HIBA: ${r.error}`;
        const x = await git(['show', '--no-color', '--no-ext-diff', '--no-textconv', `${sha}:${r.rel}`]);
        return x.code === 0 ? out(x.stdout) : `HIBA: ${out(x.stderr)}`;
      }
      const x = await git(['show', '--no-color', '--no-ext-diff', '--no-textconv', '--stat', '--patch', '--format=fuller', sha]);
      return x.code === 0 ? out(x.stdout) : `HIBA: ${out(x.stderr)}`;
    },
    async run_command({ argv, timeout_sec: t }) {
      const plan = planCommand(argv, planCtx);
      if (!plan.ok) return `ELUTASÍTVA: ${plan.error}`;
      const maxT = cfg.commandTimeoutSec ?? 300;
      const timeoutMs = Math.max(5, Math.min(maxT, Number(t) || maxT)) * 1000;
      const x = await run(plan.file, plan.args, { cwd: plan.cwd, env: { ...env, ...(plan.env ?? {}) }, timeoutMs });
      const headLine = `$ ${plan.label}\nkilépési kód: ${x.code}${x.timedOut ? ' (IDŐTÚLLÉPÉS — a folyamat leállítva)' : ''}; idő: ${(x.ms / 1000).toFixed(1)} s`;
      const shown = out(`${headLine}\n--- stdout ---\n${x.stdout}\n--- stderr ---\n${x.stderr}`);
      const kind = plan.sandboxed ? 'sandbox' : /^(node --test|tsx --test)/.test(plan.label) ? 'unit' : /^tsc/.test(plan.label) ? 'typecheck' : /^playwright/.test(plan.label) ? 'e2e' : 'npm';
      runLog.push({ argv: [...argv], output: shown, kind, sources: sourcesOf(argv) });
      return shown;
    },
    async write_temp_file({ name, content }) {
      if (typeof name !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(mjs|js|ts|mts|tsx|json|txt|md)$/.test(name)) {
        return 'HIBA: a név csak fájlnév lehet (betű, szám, . _ -), .mjs / .js / .ts / .mts / .tsx / .json / .txt / .md kiterjesztéssel, mappa nélkül';
      }
      if (typeof content !== 'string' || content.length > 100_000) return 'HIBA: a tartalom szöveg legyen, legfeljebb 100 000 karakter';
      if (tempFiles >= 30) return 'HIBA: legfeljebb 30 ideiglenes fájl írható futásonként';
      const r = resolveInside(root, `${TMP_DIR}/${name}`);
      if (!r.ok) return `HIBA: ${r.error}`;
      mkdirSync(dirname(r.abs), { recursive: true });
      writeFileSync(r.abs, content);
      tempFiles += 1;
      return `megírva: ${r.rel} (${content.length} karakter)`;
    },
    async run_db_tests() {
      const r = await heavyRun({ tool: 'run_db_tests', label: 'npm run test:learning-db (eldobható postgres:17)', kind: 'db', argvRepr: ['run_db_tests'], args: ['--import', 'tsx', 'scripts/run-learning-db-tests.ts'] });
      return r.text;
    },
    async run_e2e({ specs }) {
      if (!Array.isArray(specs) || !specs.length || specs.length > 3 || specs.some((s) => typeof s !== 'string')) return 'ELUTASÍTVA: specs = 1–3 követett source/tests/*.spec.ts';
      const rels = [];
      for (const s of specs) {
        let r = resolveInside(root, s);
        if (r.ok && !existsSync(r.abs)) r = resolveInside(root, `source/${s}`);
        if (!r.ok) return `ELUTASÍTVA: ${r.error}`;
        if (!/^source\/tests\/[^/]+\.spec\.ts$/.test(r.rel) || !existsSync(r.abs) || !planCtx.isTracked(r.rel)) return `ELUTASÍTVA: csak a fej követett source/tests/*.spec.ts fájlja futtatható: ${s}`;
        rels.push(r.rel);
      }
      const r = await heavyRun({ tool: 'run_e2e', label: `npm run test:e2e -- ${rels.join(' ')} --workers=1`, kind: 'e2e', argvRepr: ['run_e2e', ...specs], sources: sourcesOf(rels),
        args: ['--import', 'tsx', 'scripts/run-e2e-tests.ts', ...rels.map((x) => x.replace(/^source\//, '')), '--workers=1', '--retries=0', '--reporter=line'] });
      return r.text;
    },
    async run_browser_scenario({ scenario_file: f }) {
      const r = resolveInside(root, typeof f === 'string' ? f : '');
      if (!r.ok) return `ELUTASÍTVA: ${r.error}`;
      if (!r.rel.startsWith(`${TMP_DIR}/`) || !r.rel.endsWith('.json') || !existsSync(r.abs)) return `ELUTASÍTVA: a forgatókönyv a ${TMP_DIR}/ mappában lévő, előbb megírt .json fájl legyen`;
      const raw = readFileSync(r.abs, 'utf8');
      const v = validateScenario(raw, { maxScreenshots: cfg.maxScreenshots ?? 6 });
      if (!v.ok) return `ELUTASÍTVA (a forgatókönyv érvénytelen, nem futott): ${v.error}`;
      scenarioRuns += 1;
      const outDir = join(root, TMP_DIR, `scenario-${scenarioRuns}`);
      mkdirSync(outDir, { recursive: true });
      const frozen = join(outDir, 'scenario.json');
      writeFileSync(frozen, JSON.stringify(v.scenario));
      writeFileSync(join(root, 'source', SCENARIO_SPEC_REL), readFileSync(SCENARIO_RUNNER, 'utf8'));
      const h = await heavyRun({ tool: 'run_browser_scenario', label: `saját böngészős forgatókönyv: ${r.rel} (${v.scenario.cases.length} eset)`, kind: 'scenario', argvRepr: ['run_browser_scenario', f], sources: raw,
        args: ['--import', 'tsx', 'scripts/run-e2e-tests.ts', SCENARIO_SPEC_REL, '--workers=1', '--retries=0', '--reporter=line'],
        extraEnv: { BLIND_SCENARIO_FILE: frozen, BLIND_SCENARIO_OUT: outDir } });
      const files = existsSync(outDir) ? readdirSync(outDir).sort() : [];
      const cases = files.filter((x) => /^case-\d+\.json$/.test(x)).map((x) => readFileSync(join(outDir, x), 'utf8'));
      const images = [];
      for (const x of files.filter((y) => y.endsWith('.jpg')).slice(0, cfg.maxScreenshots ?? 6)) {
        const buf = readFileSync(join(outDir, x));
        if (buf.length <= 600_000) images.push({ name: x, mime: 'image/jpeg', base64: buf.toString('base64') });
      }
      const text = out(`${h.text.split('\n--- stdout ---')[0]}\n--- a forgatókönyv eredménye (esetenként) ---\n${cases.join('\n') || '(nincs eredmény — lásd a futás kimenetét lent)'}\n--- képek: ${images.map((i) => i.name).join(', ') || 'nincs'} ---\n${cases.length ? '' : h.text}`);
      if (runLog.length && runLog[runLog.length - 1].kind === 'scenario') runLog[runLog.length - 1].output = `${runLog[runLog.length - 1].output}\n${text}`;
      return images.length ? { text, images } : text;
    },
    async submit_report({ report, findings }) {
      if (typeof report !== 'string' || !report.trim()) return 'HIBA: üres jelentés';
      const r = ctx.onReport(report, findings, runLog);
      return r.ok ? 'ELFOGADVA — a jelentés rögzítve, a munka lezárult.' : `ELUTASÍTVA — javítsd, és add le újra: ${r.error}`;
    },
  };

  return {
    counts,
    runLog,
    notRun,
    async call(name, args) {
      if (!Object.hasOwn(impl, name)) return `HIBA: ismeretlen eszköz: ${String(name).slice(0, 60)}`;
      counts[name] = (counts[name] ?? 0) + 1;
      try {
        return await impl[name](args && typeof args === 'object' ? args : {});
      } catch (e) {
        return `HIBA: ${maskSecrets(String(e?.message ?? e), ctx.key).slice(0, 500)}`;
      }
    },
  };
}
