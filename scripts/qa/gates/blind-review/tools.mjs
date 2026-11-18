// A vak ellenőr eszközei (docs/specs/2026-11-18-vak-ellenor-deepseek.md, D3). Kiindulás: a modell BÁRMIT kérhet (a repó tartalma
// adat, nem utasítás) — az eszközök akkor se tudjanak kárt okozni. Nincs héj, nincs szabad parancs; minden útvonal a munkafán belül.

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep, win32, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { maskSecrets } from './openrouter.mjs';

export const TMP_DIR = '.blind-review-tmp';
export const LOADER_PATH = join(dirname(fileURLToPath(import.meta.url)), 'ts-sandbox-loader.mjs');
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
            description: 'csak ha a leletet futtatással igazoltad: a ténylegesen futtatott run_command argv-je és a kimenetének egy szó szerinti részlete',
            properties: { argv: { type: 'array', items: str }, output_excerpt: str },
            required: ['argv', 'output_excerpt'],
          },
        },
        required: ['id', 'severity', 'title', 'file', 'line', 'quote'],
      },
    },
  }, ['report', 'findings']),
];

export const INVESTIGATIVE = ['read_file', 'list_dir', 'search', 'git_diff', 'git_log', 'git_show', 'run_command', 'write_temp_file'];
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
  const env = cleanEnv(ctx.env ?? process.env);
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
      runLog.push({ argv: [...argv], output: shown });
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
    async submit_report({ report, findings }) {
      if (typeof report !== 'string' || !report.trim()) return 'HIBA: üres jelentés';
      const r = ctx.onReport(report, findings, runLog);
      return r.ok ? 'ELFOGADVA — a jelentés rögzítve, a munka lezárult.' : `ELUTASÍTVA — javítsd, és add le újra: ${r.error}`;
    },
  };

  return {
    counts,
    runLog,
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
