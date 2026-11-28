// Minőségkapuk közös könyvtára (docs/specs/2026-11-17-minosegkapuk.md, D1–D5).
// Lépésenkénti futtató külön kilépési kóddal, összesítő tábla, kimenet-szűrés, git-segédek, bizonyíték-tár.
// Függőség nélküli Node ESM; Windows x64 és Linux.

import { spawnSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const GATES_DIR = dirname(fileURLToPath(import.meta.url));
export const IS_WIN = process.platform === 'win32';

// ---- Kimenet-szűrés (D3, E15) ---------------------------------------------------------------------------------------

const REDACTIONS = [
  [/postgres(?:ql)?:\/\/[^\s"'`<>]+/gi, '<db-url>'],
  [/\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{16,}\b/g, '<token>'],
  [/\bgithub_pat_[A-Za-z0-9_]{16,}\b/g, '<token>'],
  [/\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}\b/g, '<token>'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '<aws-key>'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/g, 'Bearer <token>'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, '<email>'],
];

/**
 * Elővágás (docs/specs/2026-11-22-kitakaro-elovagas.md): a fenti, változatlan főági regexek legfeljebb ennyi karakteren futnak
 * (a főági e-mail-regex `'a'×n`-en négyzetes: 8 KB 20 ms, 16 KB 75 ms, 32 KB 311–440 ms helyben; a CI-futón ~5×-ös). 8 KB: a CI-futó
 * és a párhuzamos tesztfuttatás lassulása mellett is bőven 1 s alatt (32 KB a gate:pr-ben 1109 ms, 16 KB a CI-n 451 ms volt).
 */
export const REDACT_CAP = 8 * 1024;

/** Token-karakter az elővágáshoz: betű, szám, `+ / = _ - . ~ % \ @` (a JSON-escape-ek is ebbe esnek). */
export const isCutRunChar = (c) => (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122)
  || c === 43 || c === 47 || c === 61 || c === 95 || c === 45 || c === 46 || c === 126 || c === 37 || c === 92 || c === 64;

/**
 * A korlát felett az utolsó REDACT_CAP karakter (a napló vége a lényeg), jelzősorral. A vágás után az első KÉT, szóköz-jellegű
 * karakterrel határolt szó is kimarad: így a vágáson átnyúló szó (token, DB-URL, cím) teljesen, és egy félbevágott
 * `Bearer` + hitelesítő pár hitelesítője sem marad előtag nélkül — lineáris, előre lépő keresés.
 */
function capTail(text) {
  if (text.length <= REDACT_CAP) return text;
  let s = text.length - REDACT_CAP;
  // A szóhatár PONTOSAN a regex `\s` halmaza (1. vak kör L1): a főági DB-URL-minta (`[^\s"'`<>]+`) ezen nem lép át, az ANSI
  // ESC-en (27) és más vezérlőkarakteren viszont igen — ezek a szó részei.
  for (let w = 0; w < 2; w++) {
    while (s < text.length && WS.test(text[s])) s++;
    while (s < text.length && !WS.test(text[s])) s++;
  }
  return `[… ${s} karakter elhagyva …]\n${text.slice(s)}`;
}
const WS = /\s/;

/**
 * Egy hívó, amely csak az első hibasort írja ki (pl. a merge előtti kapu `gh`-hibája; 1. vak kör L3): a NYERS első sor kitakarva —
 * nem a teljes szöveg első sora, amely a korlát felett a csonkolásjelző lenne. Túl hosszú első sornál a sor vége látszik.
 */
export function redactFirstLine(text) {
  const t = String(text ?? '');
  const nl = t.indexOf('\n');
  const lines = redact(nl >= 0 ? t.slice(0, nl) : t).split('\n');
  return lines[lines[0].startsWith('[… ') && lines.length > 1 ? 1 : 0];
}

/** Titok, kapcsolati szöveg és e-mail-cím helyőrzőre cserélve — minden kiírás és napló ezen megy át. */
export function redact(text) {
  let out = capTail(String(text ?? ''));
  for (const [re, rep] of REDACTIONS) out = out.replace(re, rep);
  return out;
}

export function tail(text, n = 40) {
  const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.slice(-n).join('\n');
}

// ---- Külső parancsok -------------------------------------------------------------------------------------------------

function quoteWin(a) {
  return /[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a;
}

/**
 * Valódi futtató: `{ code, stdout, stderr, ms }`. Windows-on az `npm` / `npx` a `.cmd` shimen át fut (a Node ≥ 20 a `.cmd`-t csak
 * shellel indítja — itt csak a saját, rögzített argumentumainkkal); minden más shell nélkül, argumentumtömbbel.
 */
export function realExec(cmd, args = [], { cwd, env, timeoutMs = 30 * 60_000, input } = {}) {
  const t0 = Date.now();
  let file = cmd;
  let argv = args;
  let shell = false;
  if (IS_WIN && (cmd === 'npm' || cmd === 'npx')) {
    file = `${cmd}.cmd`;
    argv = args.map(quoteWin);
    shell = true;
  }
  const r = spawnSync(file, argv, {
    cwd, env: env ?? process.env, encoding: 'utf8', timeout: timeoutMs, windowsHide: true, shell,
    maxBuffer: 256 * 1024 * 1024, input,
  });
  // Q-3 (#168): időtúllépésnél olvasható jelzés és 124-es kód (a `timeout` parancs konvenciója), nem „kilépési kód 127”.
  if (r.error && /ETIMEDOUT/.test(`${r.error.code ?? ''} ${r.error.message}`)) {
    return { code: 124, stdout: r.stdout ?? '', stderr: `${r.stderr ?? ''}\nIDŐTÚLLÉPÉS ${timeoutMs / 1000} s`, ms: Date.now() - t0 };
  }
  const stderr = `${r.stderr ?? ''}${r.error ? `\n${r.error.message}` : ''}`;
  return { code: r.status ?? (r.error ? 127 : 1), stdout: r.stdout ?? '', stderr, ms: Date.now() - t0 };
}

/** Aszinkron változat párhuzamos lépésekhez (azonos visszatérési alak). */
export function realExecAsync(cmd, args = [], { cwd, env } = {}) {
  return new Promise((done) => {
    const t0 = Date.now();
    let file = cmd;
    let argv = args;
    let shell = false;
    if (IS_WIN && (cmd === 'npm' || cmd === 'npx')) { file = `${cmd}.cmd`; argv = args.map(quoteWin); shell = true; }
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(file, argv, { cwd, env: env ?? process.env, windowsHide: true, shell });
    } catch (e) {
      done({ code: 127, stdout: '', stderr: e.message, ms: 0 });
      return;
    }
    child.stdout?.on('data', (d) => { stdout += d; });
    child.stderr?.on('data', (d) => { stderr += d; });
    child.on('error', (e) => done({ code: 127, stdout, stderr: `${stderr}\n${e.message}`, ms: Date.now() - t0 }));
    child.on('close', (code) => done({ code: code ?? 1, stdout, stderr, ms: Date.now() - t0 }));
  });
}

// ---- Git -------------------------------------------------------------------------------------------------------------

export function makeGit(exec, cwd) {
  const run = (args) => exec('git', args, { cwd, timeoutMs: 120_000 });
  const out = (args) => {
    const r = run(args);
    if (r.code !== 0) throw new Error(`git ${args.join(' ')}: ${tail(redact(r.stderr), 3)}`);
    return r.stdout.trim();
  };
  return {
    run,
    out,
    top: () => out(['rev-parse', '--show-toplevel']),
    head: () => out(['rev-parse', 'HEAD']),
    branch: () => out(['branch', '--show-current']),
    commonDir: () => {
      const d = out(['rev-parse', '--git-common-dir']);
      return isAbsolute(d) ? d : resolve(cwd ?? process.cwd(), d);
    },
    mergeBase: (base) => out(['merge-base', base, 'HEAD']),
    /** A merge-base óta commitolt + stage-elt + nem stage-elt + nem követett fájlok (törölt nélkül), `/` elválasztóval. */
    changedFiles(base, top) {
      const mb = out(['merge-base', base, 'HEAD']);
      const set = new Set();
      for (const args of [['diff', '--name-only', '--diff-filter=d', mb], ['ls-files', '--others', '--exclude-standard']]) {
        for (const f of out(args).split('\n')) if (f.trim()) set.add(f.trim().replace(/\\/g, '/'));
      }
      return [...set].filter((f) => !top || existsSync(join(top, f))).sort();
    },
    untracked: () => out(['ls-files', '--others', '--exclude-standard']).split('\n').map((s) => s.trim()).filter(Boolean),
    trackedDirty: () => out(['status', '--porcelain', '--untracked-files=no']).split('\n').filter((l) => l.trim()),
    /** A merge-base óta HOZZÁADOTT sorok (munkafával és a nem követett szövegfájlokkal együtt): `[{ file, line, text }]`. */
    addedLines(base, top) {
      const mb = out(['merge-base', base, 'HEAD']);
      const res = parseUnifiedZero(out(['diff', '-U0', '--no-color', '--diff-filter=d', mb]));
      const dir = top ?? cwd ?? process.cwd();
      for (const f of out(['ls-files', '--others', '--exclude-standard']).split('\n').map((s) => s.trim()).filter(Boolean)) {
        try {
          const buf = readFileSync(join(dir, f));
          if (buf.length > 2 * 1024 * 1024 || buf.includes(0)) continue;
          buf.toString('utf8').replace(/\r\n/g, '\n').split('\n').forEach((text, i) => res.push({ file: f.replace(/\\/g, '/'), line: i + 1, text }));
        } catch { /* eltűnt közben: a fájl már nincs a munkafában, nincs mit szkennelni (ártalmatlan) */ }
      }
      return res;
    },
  };
}

/** `git diff -U0` kimenetből a hozzáadott sorok fájl:sor szerint. */
export function parseUnifiedZero(diff) {
  const res = [];
  let file = null;
  let line = 0;
  for (const raw of String(diff).split('\n')) {
    const l = raw.replace(/\r$/, '');
    if (l.startsWith('+++ ')) { file = l === '+++ /dev/null' ? null : l.replace(/^\+\+\+ (?:b\/)?/, ''); continue; }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (h) { line = Number(h[1]); continue; }
    if (file && l.startsWith('+') && !l.startsWith('+++')) { res.push({ file, line, text: l.slice(1) }); line += 1; }
  }
  return res;
}

// ---- Konfig és bizonyíték-tár (D4, D5) ----------------------------------------------------------------------------------

export function loadConfig() {
  return JSON.parse(readFileSync(join(GATES_DIR, 'gates.config.json'), 'utf8'));
}

export function evidenceDir(commonDir) {
  return process.env.WEBSULI_QA_EVIDENCE_DIR || join(commonDir, 'websuli-qa-evidence');
}

export function writeEvidence(dir, name, obj) {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, `${name}.json`);
  writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`);
  return p;
}

export function readEvidence(dir, name) {
  const p = join(dir, `${name}.json`);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

export function listEvidence(dir) {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
}

export function writeLog(dir, gate, step, text) {
  try {
    const d = join(dir, 'logs');
    mkdirSync(d, { recursive: true });
    const p = join(d, `${gate}-${step.replace(/[^A-Za-z0-9_-]+/g, '_')}.log`);
    writeFileSync(p, redact(text));
    return p;
  } catch { return null; } // a napló csak diagnosztika; a hiánya a lépés eredményét nem változtatja (ártalmatlan)
}

// ---- Lépésenkénti futtató (D2) --------------------------------------------------------------------------------------

export const STATUS = Object.freeze({ PASS: 'PASS', FAIL: 'FAIL', WARN: 'WARN', SKIP: 'SKIP', NOT_RUN: 'NOT RUN', EXCEPTION: 'KIVÉTEL' });

/**
 * `createGate('lint-gate', { log, now, strict })` → `{ step, add, results, finish }`.
 * `step(name, fn)` — `fn` `{ status, note, detail }`-ot ad (vagy Promise-t); kivétel → FAIL az első sorral.
 * `finish()` → kiírja a táblát és visszaadja a kilépési kódot (1 bármely FAIL-nál, `strict` mellett NOT RUN-nál is).
 */
export function createGate(name, { log = (s) => process.stdout.write(`${s}\n`), now = () => Date.now(), strict = false } = {}) {
  const results = [];
  const print = (s) => log(redact(s));
  const record = (stepName, r, ms) => {
    const item = { name: stepName, status: r.status, note: r.note ?? '', ms };
    results.push(item);
    print(`[${name}] ${item.status.padEnd(7)} ${stepName}${item.note ? ` — ${item.note}` : ''}`);
    if (r.detail && (r.status === STATUS.FAIL || r.status === STATUS.WARN || r.status === STATUS.EXCEPTION)) {
      print(tail(r.detail, 40).split('\n').map((l) => `    | ${l}`).join('\n'));
    }
    return item;
  };
  return {
    results,
    log: print,
    async step(stepName, fn) {
      const t0 = now();
      let r;
      try { r = await fn(); } catch (e) { r = { status: STATUS.FAIL, note: String(e?.message ?? e).split('\n')[0] }; }
      if (!r || !r.status) r = { status: STATUS.FAIL, note: 'a lépés nem adott eredményt' };
      return record(stepName, r, now() - t0);
    },
    add(stepName, status, note = '', detail = '') { return record(stepName, { status, note, detail }, 0); },
    failed() { return results.some((r) => r.status === STATUS.FAIL || (strict && r.status === STATUS.NOT_RUN)); },
    finish() {
      const w = Math.max(5, ...results.map((r) => r.name.length));
      print('');
      print(`== ${name} — összesítés ==`);
      print(`${'Lépés'.padEnd(w)} | Állapot | Idő     | Megjegyzés`);
      print(`${'-'.repeat(w)}-+---------+---------+-----------`);
      for (const r of results) {
        print(`${r.name.padEnd(w)} | ${r.status.padEnd(7)} | ${`${(r.ms / 1000).toFixed(1)}s`.padStart(7)} | ${r.note}`);
      }
      const bad = this.failed();
      print(bad
        ? `== ${name}: BUKOTT — javítsd a FAIL${strict ? ' / NOT RUN' : ''} lépéseket, és futtasd újra. Megkerülni tilos. ==`
        : `== ${name}: ZÖLD ==`);
      return bad ? 1 : 0;
    },
  };
}

/** Egy külső parancs lépés-eredménnyé alakítva (a kimenet csak bukáskor, szűrve). */
export function cmdResult(r, okNote = '') {
  if (r.code === 0) return { status: STATUS.PASS, note: okNote };
  const all = `${r.stdout}\n${r.stderr}`;
  // node:test: a bukások összefoglalója („✖ failing tests:”) a lényeg — azt mutatjuk, ne a futás utolsó, zöld sorait.
  const i = all.indexOf('failing tests:');
  return { status: STATUS.FAIL, note: `kilépési kód ${r.code}`, detail: i >= 0 ? all.slice(Math.max(0, i - 2)) : all };
}

// ---- Független ellenőr ítélete (D9) -----------------------------------------------------------------------------------

export const VERDICTS = ['IGEN', 'IGEN, FELTÉTELLEL', 'NEM'];
const VERDICT_LINE = /Független ellenőr ítélete:\s*\**\s*(IGEN, FELTÉTELLEL|IGEN|NEM)\s*\**\s*\(fej:\s*`?([0-9a-f]{7,40})`?\)/gi;

export function verdictLine(verdict, head) {
  return `Független ellenőr ítélete: ${verdict} (fej: ${head.slice(0, 12)})`;
}

/**
 * Az aktuális fejre szóló ítélet: előbb a helyi bizonyíték (`review-<fej>.json`), aztán a PR-szövegek (leírás, kommentek)
 * `Független ellenőr ítélete: … (fej: <hash>)` sora — a hash (≥ 7 jegy) a fej előtagja kell legyen; több találatnál az utolsó.
 * @returns {{ verdict: string, source: string } | null}
 */
export function resolveVerdict({ head, evidence, texts = [] }) {
  if (evidence && evidence.head === head && VERDICTS.includes(evidence.verdict)) {
    const source = evidence.transferredFrom
      ? `átvett helyi bizonyíték (${String(evidence.transferredFrom).slice(0, 12)} → azonos kód-patch-id, K2)`
      : 'helyi bizonyíték (record-review)';
    return { verdict: evidence.verdict, source };
  }
  let found = null;
  for (const [i, t] of texts.entries()) {
    for (const m of String(t ?? '').matchAll(VERDICT_LINE)) {
      if (head.toLowerCase().startsWith(m[2].toLowerCase())) found = { verdict: m[1].toUpperCase(), source: i === 0 ? 'PR-leírás' : 'PR-komment' };
    }
  }
  return found;
}

// ---- K2: bizonyíték-átvitel azonos kódra (docs/specs/2026-11-23-foterv-vegrehajtas.md H3) -----------------------------------

/** A kód-patch-id-ból kimaradó (dokumentum- és tudás-) útvonalak: ezek változása nem érvényteleníti a kódra adott ítéletet. */
export const K2_NON_CODE = [':(exclude)docs/**', ':(exclude)*.md', ':(exclude)**/*.md', ':(exclude).hermes/**', ':(exclude)memory/**', ':(exclude)kanban/**', ':(exclude).agent/**'];

/**
 * A fej SAJÁT kódváltozásának azonosítója: `git diff -U0 <merge-base(base, fej)> <fej>` a nem-kód útvonalak nélkül →
 * `git patch-id --verbatim`. A `--verbatim` a szóközt is megtartja (egy sztringliterál szóköz-változása más program — PR #568 review);
 * a `-U0` miatt a main által (ütközés nélkül) módosított szomszédos sorok, mint kontextus, nem változtatják meg. A fájlnév és a
 * hozzáadott / törölt sorok számítanak; ugyanazon fájlon belüli áthelyezést nem különböztet meg (ismert, szándékos korlát).
 * Üres kód-diff vagy git-hiba → null (nincs mihez kötni).
 */
export function codePatchId(exec, cwd, base, head) {
  const mb = exec('git', ['merge-base', base, head], { cwd, timeoutMs: 60_000 });
  if (mb.code !== 0 || !mb.stdout.trim()) return null;
  const diff = exec('git', ['diff', '--no-color', '--no-ext-diff', '-U0', mb.stdout.trim(), head, '--', '.', ...K2_NON_CODE], { cwd, timeoutMs: 120_000 });
  if (diff.code !== 0 || !diff.stdout.trim()) return null;
  const pid = exec('git', ['patch-id', '--verbatim'], { cwd, input: diff.stdout, timeoutMs: 60_000 });
  const id = pid.code === 0 ? pid.stdout.trim().split(/\s+/)[0] : '';
  return /^[0-9a-f]{40}$/.test(id) ? id : null;
}

/**
 * Ha a fejre nincs saját `review-<fej>.json`, egy korábbi fej ítélete átvihető, ha a kód-patch-id-juk azonos. Az azonos kódú, a hívó
 * feltételének (`accept`, pl. a merge-kapu vak-módja) megfelelő rekordok közül a LEGÚJABB dönt: ha az NEM (vagy ismeretlen), nincs
 * átvitel — egy régebbi IGEN-re sem esik vissza (PR #568 review). A visszaadott rekord az eredeti mezőit megtartja, `head` = az új
 * fej, `transferredFrom` = a megítélt fej. Találat nélkül null.
 */
export function transferReviewEvidence({ evDir, head, base = 'origin/main', exec = realExec, cwd, accept = () => true }) {
  let current;
  const same = [];
  for (const name of listEvidence(evDir)) {
    if (!/^review-[0-9a-f]{40}\.json$/.test(name)) continue;
    const ev = readEvidence(evDir, name.slice(0, -'.json'.length));
    if (!ev || typeof ev.head !== 'string' || ev.head === head || !VERDICTS.includes(ev.verdict) || !accept(ev)) continue;
    if (current === undefined) current = codePatchId(exec, cwd, base, head);
    if (!current) return null;
    if (codePatchId(exec, cwd, base, ev.head) === current) same.push(ev);
  }
  if (!same.length) return null;
  same.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')));
  const newest = same[0];
  return ['IGEN', 'IGEN, FELTÉTELLEL'].includes(newest.verdict) ? { ...newest, head, transferredFrom: newest.head } : null;
}

/** Az ítélet lépés-eredménye. */
export function verdictResult(v, head) {
  const how = `node scripts/qa/gates/record-review.mjs --head ${head.slice(0, 12)} --verdict IGEN --report <jelentés.md>`;
  if (!v) return { status: STATUS.FAIL, note: `nincs független ellenőr-ítélet a ${head.slice(0, 12)} fejre — futtasd: node scripts/qa/gates/local-review.mjs (helyi GPU-ellenőr; tartalék: ${how})` };
  // KAPU-LR-JELZES (tulajdonosi döntés 2026-11-27): a helyi ellenőr NEM ítélete jelzés — a leleteket a PR-szálakban / -leírásban kell
  // kezelni (a négy külső ellenőr és a CI után a merge-kapu szál-ellenőrzése a döntő). A hiányzó ítélet (nem futott) bukás marad.
  if (v.verdict === 'NEM') return { status: STATUS.WARN, note: `a független ellenőr ítélete NEM (${v.source}) — jelzés: a high leleteket a PR-leírásban / -szálban igazold (javítás) vagy cáfold (kód / teszt hivatkozással); új ellenőrkör nem kötelező` };
  if (v.verdict === 'IGEN, FELTÉTELLEL') return { status: STATUS.WARN, note: `IGEN, FELTÉTELLEL (${v.source}) — a feltételek jegyre / a PR-leírásba kerüljenek` };
  return { status: STATUS.PASS, note: `IGEN (${v.source})` };
}

/**
 * A külső (Gemini) ellenőr bizonyítéka (`external-<fej>.json`, external-review.mjs --record) — CSAK figyelmeztetés, soha nem bukás
 * (docs/specs/2026-11-17-kulso-ellenor.md K4): a döntő a Claude-alügynökös ellenőr ítélete + az orkesztrátor.
 */
export function externalResult(ev, head) {
  const how = `node scripts/qa/gates/external-review.mjs --repo . --base origin/main --head ${head.slice(0, 12)} --spec <terv.md>#<fejezet> --lista scripts/qa/gates/external-review/checklist-general.md --ki <jelentés.md> --record`;
  if (!ev || ev.head !== head) return { status: STATUS.WARN, note: `nincs külső (Gemini) második vélemény erre a fejre — ajánlott: ${how}` };
  if (ev.status === 'ok') return { status: STATUS.PASS, note: `lefutott (${ev.model ?? '?'}) — a leleteit az orkesztrátor a kódból visszaellenőrzi` };
  const why = { skipped: 'KIHAGYVA (nincs GEMINI_API_KEY)', quota: 'KIHAGYVA (kvóta / keret)', blocked: 'BLOKKOLT válasz', incomplete: 'HIÁNYOS válasz (nincs kész jelentés)' }[ev.status] ?? `SIKERTELEN (${ev.status})`;
  return { status: STATUS.WARN, note: `a második vélemény HIÁNYZIK — külső ellenőr: ${why}${ev.reason ? `, ${ev.reason}` : ''} — nem bukás` };
}

/**
 * Futási környezet egy kapuhoz: git-gyökér, `source/`, konfig, bizonyíték-tár. A tesztek `exec`-et és `root`-ot injektálnak.
 */
export function makeContext({ exec = realExec, cwd = process.cwd(), base, cfg } = {}) {
  const git = makeGit(exec, cwd);
  const root = git.top();
  const config = cfg ?? loadConfig();
  const ctx = {
    exec,
    git: makeGit(exec, root),
    root,
    src: join(root, 'source'),
    cfg: config,
    base: base ?? config.base ?? 'origin/main',
    node: process.execPath,
  };
  ctx.evDir = evidenceDir(ctx.git.commonDir());
  return ctx;
}

export function argValue(args, name, def = undefined) {
  const i = args.indexOf(name);
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : def;
}

export function isMain(metaUrl) {
  return Boolean(process.argv[1]) && resolve(fileURLToPath(metaUrl)) === resolve(process.argv[1]);
}
