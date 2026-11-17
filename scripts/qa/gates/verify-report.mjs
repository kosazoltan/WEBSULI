#!/usr/bin/env node
// Állítás- és hivatkozás-ellenőrző (S2; terv: docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md 6.3a; végrehajtás S2, R).
// Bemenet: egy jelentés / PR-leírás / zárójelentés (md) + a HÍVÓ által megadott fej (és bázis). Kimenet: tételes IGAZ / HAMIS /
// NEM ELLENŐRIZHETŐ lista.
//  (A) szabad szöveges hivatkozások MINDEN md-ben — szabályok (a független review B1 után):
//      • `fájl:sor`, `fájl:sor-sor`, „fájl N. sorában”, `fájl#L<N>`: a fájl és a sor a fejen;
//      • KÓDIDÉZET csak explicit jelöléssel: `fájl:sor` → `kód`  vagy  `fájl:sor` idézet: `kód` (±3 soron belül, szóköz-normalizálva);
//        a hivatkozás utáni próza SOHA nem idézet;
//      • más fej: `<fej>:fájl:sor`, vagy egy `# … fej <hash>` címsor alatti szakasz (a visszaellenőrzés körei) — a saját fején ellenőrzött;
//      • negatív hivatkozás: `!fájl` vagy „nem létezik: `fájl`” → IGAZ, ha a fájl tényleg nincs a fejen;
//      • a fejen nem létező út NEM ELLENŐRIZHETŐ (más ág, munkafa, scratchpad, tervezett fájl) — KIVÉVE a teljes, ismert gyökérmappás
//        `fájl:sor`-t, amely a repó TELJES történetében sem létezik: az HAMIS;
//      • rövidítés-előtag (`WT/`, `L/` …) és `…`-os / helyőrzős (`<x>`) alak: NEM ELLENŐRIZHETŐ vagy kihagyva;
//      • `npm run <név>` (írásjel / toldalék levágva), `node scripts/…`, `commit <hash>`, `PR #n`, „N/M teszt” bizonyíték-azonosítóval.
//  (B) a gépi `json allitasok` blokk (`--report`, alügynök-jelentés): kötelező mezők, zárt állapot-szótár, a fej / bázis a hívótól,
//      a bizonyíték parancsa és feje egyezik az állítottal, láncban van; a prózai „N/M teszt” gépi megfelelő nélkül bukás.
// Kilépési kód (közös konvenció, terv 6.6a): 0 / 1 (HAMIS vagy bukott blokk-ellenőrzés) / 2 (nem futott).
//
// Használat: node scripts/qa/gates/verify-report.mjs (--report <jelentés.md> | --body-file <md>) [--head <ref>] [--base <ref>]
//            [--no-gh] [--json]

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';
import { STATUS, argValue, createGate, isMain, makeContext, redact } from './lib.mjs';
import { appendRecord, chainStatus, readRecord, validId } from './evidence-chain.mjs';
import { rollupState } from './pre-push-gate.mjs';

export const TRUE = 'IGAZ';
export const FALSE = 'HAMIS';
export const UNKNOWN = 'NEM ELLENŐRIZHETŐ';
export const SCHEMA = 'websuli-allitasok/1';
export const STATES = ['PASS', 'FAIL', 'NOT RUN'];
export const REQUIRED = ['schema', 'head', 'branch', 'changedFiles', 'commands', 'tests', 'gates', 'notRun'];

const FILE_EXT = 'mjs|cjs|js|jsx|ts|tsx|mts|cts|json|md|ya?ml|css|html|sh|ps1|sql|txt';
const PATH = `(?:[\\w.@-]+/)*[\\w.@-]+\\.(?:${FILE_EXT})`;
// [1] fej-előtag, [2] út, [3] sor, [4] záró sor
const FILE_LINE = new RegExp(`(?<![\\w/.\\\\@-])(?:([0-9a-f]{7,40}):)?(${PATH}):(\\d+)(?:\\s*[-–]\\s*(\\d+))?(?![\\w])`, 'g');
const FILE_LINE_ONE = new RegExp(FILE_LINE.source);
const FILE_LINE_HASH =new RegExp(`(?<![\\w/.\\\\@-])(${PATH})#L(\\d+)(?:-L?(\\d+))?(?![\\w])`, 'g');
const FILE_NTH_LINE = new RegExp(`(?<![\\w/.\\\\@-])(${PATH})\`?\\s+(\\d+)\\.\\s*sor(?:ában|ában|án|a|ától|áig)?\\b`, 'g');
const QUOTE_AFTER = /^`?\s*(?:→|->|idézet\s*:)\s*`([^`\n]+)`/;
const NEGATIVE = new RegExp(`(?:!\`(${PATH}|[\\w.@-]+(?:/[\\w.@-]+)+)\`|nem létezik:\\s*\`([^\`\\n]+)\`)`, 'g');
const BACKTICK = /`([^`\n]+)`/g;
const KNOWN_ROOT = /^(?:source|scripts|docs|\.github|\.claude|\.agents|\.cursor)\//;
const PATH_LIKE = new RegExp(`^(?:source|scripts|docs|\\.github|\\.claude|\\.agents|\\.cursor|tests|client|server|shared)/|\\.(?:${FILE_EXT})$`);
const NPM_RUN = /\bnpm(?:\.cmd)?\s+run\s+([\w:.<>-]+)/g;
const NODE_SCRIPT = /\bnode\s+((?:scripts|source\/scripts)\/[^\s`'")]+)/g;
const COMMIT_BT = /`([0-9a-f]{7,40})`/g;
const COMMIT_WORD = /\bcommit(?:ban|ot|ja|on|ja)?\s+`?([0-9a-f]{7,40})\b/gi;
const PR_REF = /\b(?:PR|pull)\s*-?\s*#(\d{1,6})\b/gi;
const TEST_COUNT = /(\d+)\s*\/\s*(\d+)\s*(?:teszt|eset)|(\d+)\s+(?:teszt|eset)(?:\s+(?:zöld|pass|sikeres))?|(\d+)\s+pass\b/i;
const EVIDENCE_ID = /\b((?:run|stage|pre-push|pre-pr|review|test-integrity|claims)-[0-9a-f]{12,40})\b/;
const SECTION_HEAD = /^#{1,6}\s.*\bfej\b.*?`?\b([0-9a-f]{7,40})\b/i;
const ITEM_HEAD = /\bfej\b[\s:]*`?([0-9a-f]{7,40})\b/i;
// Idegen (a repón kívüli) út: abszolút, scratchpad, munkafa — nem gyűjtjük.
const FOREIGN = /^(?:[A-Za-z]:[\\/]|\/[a-z]\/|~|https?:|\.\.?\/)|scratchpad|AppData|node_modules|^\.claude\/worktrees\//i;
const PLACEHOLDER = /[<>*…]|\.\.\.|\{|\}/;
const ALIAS_SEG = /^[A-Z]{1,3}$/;

const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

/** A kódblokkok (``` és ~~~ kerítés) eltávolítása (a sorszámok megmaradnak). */
export function stripFences(md) {
  const out = [];
  let fence = null;
  for (const l of String(md).replace(/\r\n/g, '\n').split('\n')) {
    const m = /^\s*(```|~~~)/.exec(l);
    if (m && (!fence || fence === m[1])) { fence = fence ? null : m[1]; out.push(''); continue; }
    out.push(fence ? '' : l);
  }
  return out;
}

/**
 * A hivatkozások kigyűjtése. Minden hivatkozás `head`-et kap: az explicit `<fej>:` előtag, különben a szakasz-fej (`# … fej <hash>`),
 * különben null (= a hívó feje).
 */
export function extractRefs(md) {
  const refs = [];
  const seen = new Set();
  let section = null;
  let item = null;
  let sectionHead = null;
  const add = (r) => { const k = `${r.kind}|${r.head ?? ''}|${r.ref}|${r.snippet ?? ''}`; if (!seen.has(k)) { seen.add(k); refs.push(r); } };
  stripFences(md).forEach((text, i) => {
    const line = i + 1;
    const sh = SECTION_HEAD.exec(text);
    if (sh) section = sh[1];
    // Lista-elem szintű fej: „- **#418 (fej `6f2f5c11`) — …” — az elem és folytató (behúzott) sorai erre a fejre szólnak.
    if (/^\s*(?:[-*+]|\d+\.)\s/.test(text)) item = ITEM_HEAD.exec(text)?.[1] ?? null;
    else if (!/^\s{2,}\S/.test(text)) item = null;
    sectionHead = item ?? section;
    const spans = [];
    const taken = (a, b) => spans.some(([x, y]) => a < y && b > x);
    for (const m of text.matchAll(NEGATIVE)) {
      const p = (m[1] ?? m[2]).trim();
      spans.push([m.index, m.index + m[0].length]);
      if (!FOREIGN.test(p) && !PLACEHOLDER.test(p)) add({ kind: 'absent', ref: `!${p}`, line, path: p, head: sectionHead });
    }
    for (const m of text.matchAll(FILE_LINE)) {
      const path = m[2];
      if (taken(m.index, m.index + m[0].length)) continue;
      spans.push([m.index, m.index + m[0].length]);
      if (FOREIGN.test(path)) continue;
      const before = text.slice(Math.max(0, m.index - 2), m.index);
      const abbrev = path.startsWith('-') || /…|\.\.\.$/.test(before) || PLACEHOLDER.test(path);
      const q = QUOTE_AFTER.exec(text.slice(m.index + m[0].length));
      // a nyíl utáni MÁSIK hivatkozás (`a.ts:1` → `b.ts:2`, `:2503`) nem kódidézet
      const quote = q && !FILE_LINE_ONE.test(q[1]) && !/^:\d/.test(q[1]) ? q[1] : undefined;
      add({ kind: 'file-line', ref: m[0], line, path, from: Number(m[3]), to: Number(m[4] ?? m[3]), snippet: quote, head: m[1] ?? sectionHead, abbrev });
    }
    for (const re of [FILE_LINE_HASH, FILE_NTH_LINE]) {
      for (const m of text.matchAll(re)) {
        if (taken(m.index, m.index + m[0].length) || FOREIGN.test(m[1])) continue;
        spans.push([m.index, m.index + m[0].length]);
        add({ kind: 'file-line', ref: m[0], line, path: m[1], from: Number(m[2]), to: Number(m[3] ?? m[2]), head: sectionHead, abbrev: PLACEHOLDER.test(m[1]) });
      }
    }
    for (const m of text.matchAll(BACKTICK)) {
      const v = m[1].trim();
      if (taken(m.index, m.index + m[0].length)) continue;
      if (/\s/.test(v) || !v.includes('/') || FOREIGN.test(v) || PLACEHOLDER.test(v) || /[$|()[\]]/.test(v) || /:\d+/.test(v)) continue;
      if (!/^[\w.@-]+(?:\/[\w.@-]+)+\/?$/.test(v) || !PATH_LIKE.test(v.replace(/\/$/, ''))) continue;
      add({ kind: 'path', ref: v, line, path: v.replace(/\/$/, ''), head: sectionHead });
    }
    for (const m of text.matchAll(NPM_RUN)) {
      const name = m[1].replace(/[.,;:!?]+$/, '');
      if (!PLACEHOLDER.test(name) && name) add({ kind: 'npm-script', ref: `npm run ${name}`, line, name, head: sectionHead });
    }
    for (const m of text.matchAll(NODE_SCRIPT)) {
      const p = m[1].replace(/[.,;:]+$/, '');
      if (!PLACEHOLDER.test(p)) add({ kind: 'node-script', ref: `node ${p}`, line, path: p, head: sectionHead });
    }
    for (const m of text.matchAll(COMMIT_WORD)) if (/\d/.test(m[1]) && /[a-f]/.test(m[1])) add({ kind: 'commit', ref: m[1], line, hash: m[1], strong: true });
    for (const m of text.matchAll(COMMIT_BT)) if (/\d/.test(m[1]) && /[a-f]/.test(m[1])) add({ kind: 'commit', ref: m[1], line, hash: m[1], strong: false });
    for (const m of text.matchAll(PR_REF)) add({ kind: 'pr', ref: `PR #${m[1]}`, line, pr: Number(m[1]) });
    const tc = TEST_COUNT.exec(text);
    if (tc) {
      const pass = Number(tc[1] ?? tc[3] ?? tc[4]);
      const total = tc[2] != null ? Number(tc[2]) : null;
      add({ kind: 'test-count', ref: norm(tc[0]), line, count: { pass, total }, evidence: EVIDENCE_ID.exec(text)?.[1] });
    }
  });
  // ugyanaz a hash commit-szóval ÉS backtickben: elég egyszer (az erős alak)
  return refs.filter((r) => !(r.kind === 'commit' && !r.strong && refs.some((x) => x.kind === 'commit' && x.strong && x.hash === r.hash)));
}

/**
 * Repó-hozzáférés (a tesztek hamisat injektálnak): `repoAt(head|null) → { files, dirs, read } | null` (null: a fej nem oldható fel),
 * `existsAnywhere(path) → bool` (a repó TELJES történetében), `scripts: Set`, `commitExists(hash)`, `pr(n) → {state}|null|undefined`,
 * `record(id)`.
 */
function resolvePath(repo, p) {
  const clean = p.replace(/^\.\//, '').replace(/\\/g, '/');
  if (repo.files.has(clean)) return { path: clean };
  if (!clean.startsWith('source/') && repo.files.has(`source/${clean}`)) return { path: `source/${clean}` };
  if (repo.dirs?.has(clean) || repo.dirs?.has(`source/${clean}`)) return { path: clean, dir: true };
  const segs = clean.split('/');
  // rövidítés-előtag (WT/, L/, T/, P/): csak akkor oldjuk fel, ha a maradék utótagként EGYÉRTELMŰ
  const rest = segs.length > 1 && ALIAS_SEG.test(segs[0]) ? segs.slice(1).join('/') : clean;
  const hits = [...repo.files].filter((f) => f === rest || f.endsWith(`/${rest}`));
  if (hits.length === 1) return { path: hits[0] };
  if (hits.length > 1) return { ambiguous: hits.length };
  return null;
}

function checkPathRef(r, env) {
  const repo = env.repoAt(r.head);
  if (!repo) return { status: UNKNOWN, detail: `a hivatkozott fej (${r.head}) nem oldható fel ebben a repóban` };
  return { repo, f: resolvePath(repo, r.path) };
}

export function checkRef(r, env) {
  switch (r.kind) {
    case 'file-line': {
      if (r.abbrev) return { status: UNKNOWN, detail: 'rövidített / helyőrzős út' };
      const { repo, f, status, detail } = checkPathRef(r, env);
      if (status) return { status, detail };
      if (!f) {
        const full = KNOWN_ROOT.test(r.path);
        if (full && !env.existsAnywhere(r.path)) return { status: FALSE, detail: `a fájl sem a fejen, sem a repó történetében nem létezik: ${r.path}` };
        return { status: UNKNOWN, detail: full ? 'a fejen nincs (más ágon / korábbi állapotban létezik) — jelöld: `<fej>:út:sor`' : 'a fejen nem található (rövidítés, más ág, munkafa vagy scratchpad?)' };
      }
      if (f.ambiguous) return { status: UNKNOWN, detail: `${f.ambiguous} azonos nevű fájl — adj teljes utat` };
      if (f.dir) return { status: FALSE, detail: `${r.path} könyvtár, nem fájl` };
      const lines = String(repo.read(f.path) ?? '').replace(/\r\n/g, '\n').split('\n');
      if (lines.length && lines[lines.length - 1] === '') lines.pop();
      if (r.from < 1 || r.to > lines.length || r.from > r.to) return { status: FALSE, detail: `${f.path}: ${lines.length} soros${r.head ? ` (a ${r.head} fejen)` : ''}, a hivatkozott ${r.from}${r.to !== r.from ? `–${r.to}` : ''} nem létezik` };
      if (r.snippet) {
        const want = norm(r.snippet);
        // K6: a rövid, általános részlet (`return`, `if (`) bárhol illeszkedik — nem bizonyít
        if (want.length < 8) return { status: UNKNOWN, detail: 'túl rövid idézet (< 8 karakter) — nem bizonyít' };
        const win = lines.slice(Math.max(0, r.from - 1 - 3), Math.min(lines.length, r.to + 3));
        if (!(win.some((l) => norm(l).includes(want)) || norm(win.join(' ')).includes(want))) return { status: FALSE, detail: `${f.path}:${r.from}: az idézet („${want.slice(0, 60)}”) nincs a ±3 soros ablakban` };
        return { status: TRUE, detail: `${f.path}:${r.from} + idézet` };
      }
      return { status: TRUE, detail: f.path };
    }
    case 'absent': {
      const { f, status, detail } = checkPathRef(r, env);
      if (status) return { status, detail };
      return f && !f.ambiguous ? { status: FALSE, detail: `a hiányt állítja, de a fejen létezik: ${f.path}` } : { status: TRUE, detail: 'a fejen valóban nincs' };
    }
    case 'path':
    case 'node-script': {
      const { f, status, detail } = checkPathRef(r, env);
      if (status) return { status, detail };
      if (f && !f.ambiguous) return { status: TRUE, detail: f.path };
      return { status: UNKNOWN, detail: f?.ambiguous ? `${f.ambiguous} találat` : 'a fejen nincs (tervezett / más ágon / nem követett?) — hiány-állításhoz: `!út`' };
    }
    case 'npm-script': {
      if (env.scripts.has(r.name)) return { status: TRUE, detail: 'package.json scripts' };
      const stem = r.name.replace(/-[\p{Ll}]+$/u, ''); // toldalék: `gate:stage-et`
      if (stem !== r.name && env.scripts.has(stem)) return { status: TRUE, detail: `package.json scripts (${stem})` };
      return { status: FALSE, detail: `a „${r.name}” nincs sem a gyökér, sem a source/ package.json scripts mezőjében` };
    }
    case 'commit':
      if (env.commitExists(r.hash)) return { status: TRUE, detail: 'létező commit' };
      return r.strong ? { status: FALSE, detail: `nem létező commit: ${r.hash}` } : { status: UNKNOWN, detail: 'hash-alakú szöveg, nem létező commit (kimenet-hash?)' };
    case 'pr': {
      const p = env.pr(r.pr);
      if (p === undefined) return { status: UNKNOWN, detail: 'a gh nem érhető el (--no-gh?)' };
      return p ? { status: TRUE, detail: `PR #${r.pr}: ${p.state}` } : { status: FALSE, detail: `nem létező PR: #${r.pr}` };
    }
    case 'test-count': {
      if (!r.evidence) return { status: UNKNOWN, detail: 'nincs mellette bizonyíték-azonosító (run-… / pre-push-…)' };
      const rec = env.record(r.evidence);
      if (!rec) return { status: FALSE, detail: `a hivatkozott bizonyíték nincs a tárban: ${r.evidence}` };
      const c = rec.counts;
      if (!c) return { status: UNKNOWN, detail: `a ${r.evidence} rekord nem rögzített darabszámot` };
      if (c.pass !== r.count.pass || (r.count.total != null && c.tests != null && c.tests !== r.count.total)) {
        return { status: FALSE, detail: `a ${r.evidence} rekord szerint ${c.pass} pass${c.tests != null ? ` / ${c.tests}` : ''}, a szöveg ${r.count.pass}${r.count.total != null ? `/${r.count.total}` : ''}-t állít` };
      }
      return { status: TRUE, detail: `${r.evidence} egyezik` };
    }
    default:
      return { status: UNKNOWN, detail: 'ismeretlen hivatkozás-típus' };
  }
}

export function checkReferences(md, env) {
  return extractRefs(md).map((r) => ({ ...r, ...checkRef(r, env) }));
}

/** Összesítés: darabszámok + a NEM ELLENŐRIZHETŐ arány és a küszöb-figyelmeztetés. */
export function summarizeRefs(items, unknownWarnRatio = 0.5) {
  const n = { [TRUE]: 0, [FALSE]: 0, [UNKNOWN]: 0 };
  for (const x of items) n[x.status] += 1;
  const ratio = items.length ? n[UNKNOWN] / items.length : 0;
  return { ...n, total: items.length, unknownRatio: ratio, unknownWarn: items.length >= 5 && ratio > unknownWarnRatio };
}

// ---- (B) a gépi blokk -----------------------------------------------------------------------------------------------------

export function extractClaimsBlock(md) {
  const blocks = [...String(md).replace(/\r\n/g, '\n').matchAll(/^```json[ \t]+allitasok[ \t]*\n([\s\S]*?)\n```/gm)];
  if (!blocks.length) return { error: 'nincs `json allitasok` blokk (a jelentés-sablon kötelező része: scripts/qa/gates/report-template.md)' };
  if (blocks.length > 1) return { error: `${blocks.length} \`json allitasok\` blokk — pontosan egy legyen` };
  try { return { claims: JSON.parse(blocks[0][1]) }; } catch (e) { return { error: `a blokk nem érvényes JSON: ${e.message}` }; }
}

/** Parancs-normalizálás az állított és a rögzített parancs összevetéséhez. */
export function normCmd(s) {
  return norm(String(s ?? ''))
    .replace(/^node\s+\S*evidence-run\.mjs\s+--\s+/, '')
    .replace(/\b(npm|npx)\.cmd\b/g, '$1')
    .replace(/\bnode(?:\.exe)?\b/g, 'node');
}

/** A kapu-rekordok parancs-megfelelője (ezeknek nincs `cmd` mezőjük). */
const GATE_CMD = { stage: 'npm run gate:stage', 'pre-push': 'npm run gate:push', 'pre-pr': 'npm run gate:pr' };

function recordMatchesCmd(id, rec, claimed) {
  const c = normCmd(claimed);
  if (rec.kind === 'run' || id.startsWith('run-')) return normCmd(rec.cmd) === c;
  const kind = Object.keys(GATE_CMD).find((k) => id.startsWith(`${k}-`));
  if (!kind) return false;
  if (kind === 'pre-pr') return c.startsWith(GATE_CMD['pre-pr']) || c.startsWith(GATE_CMD['pre-push']);
  return c.startsWith(GATE_CMD[kind]);
}

/**
 * A blokk állításai a valósághoz mérve. `env`: `head` (a HÍVÓ feje, 40 jegy), `base` (a hívó bázisa), `resolve(ref)`,
 * `diffNames(base, head)`, `record(id)`, `chain(id) → { status, breaks }`, `chainEnforce` (bool), `pr(n)`, `noGh` (bool),
 * `refEnv` (a `checkRef`-hez), `proseCounts` (a szöveg „N/M teszt” állításai bizonyíték-azonosító nélkül).
 * @returns {{ name: string, status: string, note: string }[]}
 */
export function checkClaims(c, env) {
  const out = [];
  const add = (name, status, note = '') => out.push({ name, status, note });
  const head = env.head;
  const missing = REQUIRED.filter((k) => c?.[k] === undefined);
  if (missing.length) add('kötelező mezők', STATUS.FAIL, `hiányzik: ${missing.join(', ')} (üres lista is megadandó)`);
  if (c?.schema !== SCHEMA) add('séma', STATUS.FAIL, `schema: „${c?.schema}” — elvárt: ${SCHEMA}`);
  const claimedHead = c?.head ? env.resolve(c.head) : null;
  if (!/^[0-9a-f]{40}$/.test(String(c?.head ?? '')) || claimedHead !== head) {
    add('fej = a hívó feje', STATUS.FAIL, `a blokk feje ${c?.head ? String(c.head).slice(0, 12) : 'hiányzik'}${/^[0-9a-f]{40}$/.test(String(c?.head ?? '')) ? '' : ' (40 jegy kell)'}, a vizsgált fej ${head.slice(0, 12)}`);
    return out;
  }
  if (typeof c.branch === 'string') {
    const tip = env.resolve(c.branch);
    add('fej = az ág feje', tip === head ? STATUS.PASS : STATUS.FAIL, tip === head ? c.branch : `a ${c.branch} feje ${tip ? tip.slice(0, 12) : 'nem létezik'}, a vizsgált fej ${head.slice(0, 12)}`);
  }
  if (Array.isArray(c.changedFiles)) {
    const real = new Set(env.diffNames(env.base, head));
    const said = new Set(c.changedFiles);
    const miss = [...real].filter((f) => !said.has(f));
    const extra = [...said].filter((f) => !real.has(f));
    add(`módosított fájlok = git diff ${env.base}...fej`, miss.length || extra.length ? STATUS.FAIL : STATUS.PASS,
      miss.length || extra.length ? `${miss.length ? `kimaradt: ${miss.join(', ')}` : ''}${miss.length && extra.length ? '; ' : ''}${extra.length ? `nem változott: ${extra.join(', ')}` : ''}` : `${real.size} fájl`);
  }
  for (const r of c.refs ?? []) {
    const [a, b] = String(r.line).split('-');
    const ref = { kind: 'file-line', ref: `${r.file}:${r.line}`, path: r.file, from: Number(a), to: Number(b ?? a), snippet: r.text, head: null };
    const v = checkRef(ref, env.refEnv);
    add(`hivatkozás ${ref.ref}`, v.status === TRUE ? STATUS.PASS : STATUS.FAIL, v.detail);
  }
  const ids = [];
  const verifiedCounts = [];
  for (const k of ['commands', 'tests']) {
    for (const x of Array.isArray(c[k]) ? c[k] : []) {
      const label = `${k === 'tests' ? 'teszt' : 'parancs'}: ${x?.cmd ?? '?'}`;
      const st = String(x?.status ?? '');
      if (!STATES.includes(st)) { add(label, STATUS.FAIL, `ismeretlen / hiányzó állapot „${st}” — csak ${STATES.join(' | ')}`); continue; }
      if (st !== 'PASS') { add(label, STATUS.PASS, `${st} — bukás / kihagyás bevallása, bizonyíték nem kell`); continue; }
      if (!x.evidence) { add(label, STATUS.FAIL, 'PASS bizonyíték-azonosító nélkül (futtasd: node scripts/qa/gates/evidence-run.mjs -- <parancs>)'); continue; }
      if (!validId(x.evidence)) { add(label, STATUS.FAIL, `érvénytelen bizonyíték-azonosító: ${x.evidence} (csak [a-z0-9-])`); continue; }
      ids.push(x.evidence);
      const rec = env.record(x.evidence);
      if (!rec) { add(label, STATUS.FAIL, `a bizonyíték nincs a tárban (vagy sérült): ${x.evidence}`); continue; }
      if (rec.head !== head) { add(label, STATUS.FAIL, `a ${x.evidence} más fejre szól (${String(rec.head).slice(0, 12)})`); continue; }
      if (!(rec.ok === true && (rec.code === undefined || rec.code === 0))) { add(label, STATUS.FAIL, `a ${x.evidence} szerint a futás bukott (kód ${rec.code})`); continue; }
      if (!recordMatchesCmd(x.evidence, rec, x.cmd)) { add(label, STATUS.FAIL, `a ${x.evidence} más parancsot rögzített („${String(rec.cmd ?? rec.kind).slice(0, 60)}”)`); continue; }
      if (x.pass != null || x.fail != null) {
        if (!rec.counts) { add(label, STATUS.FAIL, `darabszámot állít (${x.pass} pass), de a ${x.evidence} nem rögzített darabszámot`); continue; }
        if ((x.pass != null && rec.counts.pass !== x.pass) || (x.fail != null && rec.counts.fail !== x.fail)) { add(label, STATUS.FAIL, `a rekord ${rec.counts.pass} pass / ${rec.counts.fail} fail, a jelentés ${x.pass} / ${x.fail}`); continue; }
        verifiedCounts.push(rec.counts);
      }
      add(label, STATUS.PASS, `${x.evidence}${rec.dirty ? ' (FIGYELEM: commitolatlan változás mellett futott)' : ''}`);
    }
  }
  for (const pc of env.proseCounts ?? []) {
    const ok = verifiedCounts.some((vc) => vc.pass === pc.pass && (pc.total == null || vc.tests === pc.total || vc.pass + (vc.fail ?? 0) === pc.total));
    add(`prózai állítás: „${pc.ref}”`, ok ? STATUS.PASS : STATUS.FAIL, ok ? 'a blokk igazolt teszt-tételével egyezik' : 'a szövegben tesztszámot állít, de nincs mellette bizonyíték-azonosító, és a blokk egyetlen igazolt tételével sem egyezik');
  }
  if (c.pr) {
    const p = env.pr(c.pr.number);
    if (p === undefined) add(`PR #${c.pr.number}`, env.noGh ? STATUS.WARN : STATUS.FAIL, env.noGh ? '--no-gh: nem ellenőrizve' : 'a gh nem érhető el — a PR-állapot állítása nem ellenőrizhető');
    else if (!p) add(`PR #${c.pr.number}`, STATUS.FAIL, 'nem létező PR');
    else {
      const probs = [];
      if (c.pr.state && c.pr.state !== p.state) probs.push(`állapot: ${p.state} (a jelentés: ${c.pr.state})`);
      if (p.headRefOid && p.headRefOid !== head) probs.push(`a PR feje ${p.headRefOid.slice(0, 12)}, a vizsgált ${head.slice(0, 12)}`);
      const ci = rollupState(p.statusCheckRollup);
      if (c.pr.ci && c.pr.ci !== ci) probs.push(`CI: ${ci} (a jelentés: ${c.pr.ci})`);
      add(`PR #${c.pr.number} állapota`, probs.length ? STATUS.FAIL : STATUS.PASS, probs.join('; ') || `${p.state}, CI ${ci}`);
    }
  }
  const gates = new Set(Array.isArray(c.gates) ? c.gates : []);
  const need = { stage: [`stage-${head}`], push: [`pre-push-${head}`, `pre-pr-${head}`], review: [`review-${head}`], pr: [`pre-pr-${head}`] };
  if (gates.has('pr')) for (const g of ['push', 'review']) if (!gates.has(g)) add('kapu-lánc', STATUS.FAIL, `a „pr” kapu állítása mellől hiányzik: ${g}`);
  for (const g of gates) {
    const cands = need[g];
    if (!cands) { add(`kapu: ${g}`, STATUS.FAIL, 'ismeretlen kapu (stage | push | review | pr)'); continue; }
    const hit = cands.map((n) => [n, env.record(n)]).find(([, r]) => r && (r.ok === true || r.verdict === 'IGEN' || r.verdict === 'IGEN, FELTÉTELLEL'));
    add(`kapu: ${g}`, hit ? STATUS.PASS : STATUS.FAIL, hit ? hit[0].replace(head, head.slice(0, 12)) : `nincs zöld bizonyíték a fejre (${cands.map((n) => n.replace(head, '<fej>')).join(' / ')})`);
    if (hit) ids.push(hit[0]);
  }
  // Lánc: láncon kívüli / átírt / lánc nélküli rekord érvénytelen. A még lánc nélküli írók (pre-pr-, merge-: a #490 után kapnak
  // láncot) csak figyelmeztetnek. Bevezetési lépcső (terv 6.3a): `chainEnforce` nélkül minden lánc-hiba WARN.
  for (const id of [...new Set(ids)]) {
    const s = env.chain(id);
    if (s.status === 'ok') { if (s.repaired) add(`lánc: ${id.slice(0, 24)}`, STATUS.WARN, 'javítás (--repair) után újra-láncolt rekord'); continue; }
    const legacy = /^(?:pre-pr|merge)-/.test(id) && (s.status === 'not-in-chain' || s.status === 'no-chain');
    const sev = legacy || !env.chainEnforce ? STATUS.WARN : STATUS.FAIL;
    const why = { 'not-in-chain': 'láncon kívüli rekord (kézzel írt vagy lánc nélküli író)', 'no-chain': 'van rekord, de nincs lánc (chain.jsonl)', mismatch: 'a rekord tartalma eltér a láncba írt hash-től (átírták)', missing: 'a rekordfájl hiányzik', 'invalid-id': 'érvénytelen azonosító' }[s.status] ?? s.status;
    add(`lánc: ${id.slice(0, 24)}`, sev, `${why}${legacy ? ' — a pre-pr / merge író a #490 után kap láncot' : ''}${!env.chainEnforce && !legacy ? ' (bevezetési lépcső: csak figyelmeztet)' : ''}`);
  }
  for (const n of Array.isArray(c.notRun) ? c.notRun : []) if (!n?.reason) add(`NOT RUN: ${n?.what ?? '?'}`, STATUS.FAIL, 'ok (reason) nélkül');
  return out;
}

// ---- Valódi környezet ------------------------------------------------------------------------------------------------------

export function makeEnv({ ctx, head, gh = true }) {
  const { git, root } = ctx;
  const q = ['-c', 'core.quotePath=false'];
  const repos = new Map();
  const resolve = (ref) => { const r = git.run(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]); return r.code === 0 ? r.stdout.trim() : null; };
  const repoAt = (h) => {
    const full = h ? resolve(h) : head;
    if (!full) return null;
    if (!repos.has(full)) {
      const files = new Set(git.out([...q, 'ls-tree', '-r', '--name-only', full]).split('\n').map((s) => s.trim()).filter(Boolean));
      const dirs = new Set();
      for (const f of files) { const parts = f.split('/'); for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/')); }
      const cache = new Map();
      const read = (p) => { if (!cache.has(p)) { const r = git.run([...q, 'show', `${full}:${p}`]); cache.set(p, r.code === 0 ? r.stdout : null); } return cache.get(p); };
      repos.set(full, { files, dirs, read });
    }
    return repos.get(full);
  };
  const anywhere = new Map();
  const existsAnywhere = (p) => {
    if (!anywhere.has(p)) {
      const r = git.run([...q, 'log', '--all', '--format=%H', '-1', '--', p, `source/${p}`]);
      anywhere.set(p, r.code === 0 && r.stdout.trim().length > 0);
    }
    return anywhere.get(p);
  };
  const scripts = new Set();
  const h0 = repoAt(null);
  for (const p of ['package.json', 'source/package.json']) {
    try { Object.keys(JSON.parse(h0.read(p) ?? '{}').scripts ?? {}).forEach((s) => scripts.add(s)); } catch { /* hibás manifest */ }
  }
  const ghOk = gh && ctx.exec('gh', ['--version'], { cwd: root, timeoutMs: 15_000 }).code === 0;
  const prCache = new Map();
  const pr = (n) => {
    if (!ghOk) return undefined;
    if (!prCache.has(n)) {
      const r = ctx.exec('gh', ['pr', 'view', String(n), '--json', 'number,state,headRefOid,statusCheckRollup'], { cwd: root, timeoutMs: 30_000 });
      if (r.code === 0) prCache.set(n, JSON.parse(r.stdout));
      else prCache.set(n, /Could not resolve|no pull requests? found|not found/i.test(r.stderr) ? null : undefined);
    }
    return prCache.get(n);
  };
  // rövidített bizonyíték-azonosító (pl. `stage-82ea5b1a2a23`): egyértelmű előtag-egyezés a tárban
  const record = (id) => {
    if (!validId(id)) return null;
    const exact = readRecord(ctx.evDir, id);
    if (exact) return exact;
    if (!existsSync(ctx.evDir)) return null;
    const hits = readdirSync(ctx.evDir).filter((f) => f.endsWith('.json') && f.startsWith(id));
    return hits.length === 1 ? readRecord(ctx.evDir, hits[0].slice(0, -5)) : null;
  };
  return {
    repoAt, existsAnywhere, scripts, pr, resolve, record,
    commitExists: (hash) => git.run(['cat-file', '-e', `${hash}^{commit}`]).code === 0,
  };
}

export function claimsMode(cfg) {
  const m = cfg?.modes?.['claims-verify'] ?? {};
  return (process.env.GITHUB_ACTIONS === 'true' ? m.ci : m.local) ?? 'warn';
}

/**
 * Kapu-lépés egy szövegre (a `record-review` az ellenőri jelentést nézi vele; a `pre-pr-gate` a #490 után a PR-leírást).
 * Bevezetési lépcső (terv 6.3a): `warn` módban a HAMIS csak WARN + tételes lista; `block` módban FAIL.
 */
export async function runReferenceStep({ gate, ctx, text, label, head = null, gh = true, mode }) {
  let items = [];
  const m = mode ?? claimsMode(ctx.cfg);
  const ratioCfg = ctx.cfg?.claims?.unknownWarnRatio ?? 0.5;
  const r = await gate.step(`hivatkozások: ${label} (${m})`, () => {
    const h = head ?? ctx.git.head();
    items = checkReferences(text, makeEnv({ ctx, head: h, gh }));
    const s = summarizeRefs(items, ratioCfg);
    const bad = items.filter((x) => x.status === FALSE);
    const tail = `${s[TRUE]} IGAZ, ${s[UNKNOWN]} NEM ELLENŐRIZHETŐ (${Math.round(s.unknownRatio * 100)}%)`;
    if (!items.length) return { status: STATUS.PASS, note: 'nincs gépileg ellenőrizhető hivatkozás' };
    if (bad.length) return { status: m === 'block' ? STATUS.FAIL : STATUS.WARN, note: `${bad.length} HAMIS hivatkozás; ${tail}`, detail: bad.map((x) => redact(`${label}:${x.line} ${x.ref} — ${x.detail}`)).join('\n') };
    if (s.unknownWarn) return { status: STATUS.WARN, note: `${tail} — a küszöb (${Math.round(ratioCfg * 100)}%) fölött: a hivatkozások nagy része gépileg ellenőrizetlen` };
    return { status: STATUS.PASS, note: tail };
  });
  return { items, result: r, mode: m };
}

async function main() {
  const args = process.argv.slice(2);
  const reportPath = argValue(args, '--report');
  const bodyPath = argValue(args, '--body-file');
  const file = reportPath ?? bodyPath;
  const json = args.includes('--json');
  const fail2 = (msg) => {
    if (json) process.stdout.write(`${JSON.stringify({ schema: 'websuli-check/1', tool: 'verify-report', head: null, ok: false, exitCode: 2, counts: {}, items: [], error: msg })}\n`);
    else process.stderr.write(`[verify-report] NEM FUTOTT: ${msg}\n`);
    process.exit(2);
  };
  if (!file) fail2('add meg: --report <jelentés.md> vagy --body-file <leírás.md>');
  if (!existsSync(file)) fail2(`nem létezik: ${file}`);
  let ctx;
  try { ctx = makeContext({}); } catch (e) { fail2(`nem git-munkafa: ${e.message}`); }
  const md = readFileSync(file, 'utf8');
  const t0 = Date.now();
  // A fej és a bázis a HÍVÓTÓL jön (M1): a jelentés nem választhatja meg, mihez mérjük.
  const headArg = argValue(args, '--head') ?? 'HEAD';
  const base = argValue(args, '--base') ?? ctx.cfg.base ?? 'origin/main';
  const hr = ctx.git.run(['rev-parse', '--verify', '--quiet', `${headArg}^{commit}`]);
  if (hr.code !== 0) fail2(`a fej nem oldható fel: ${headArg}`);
  const head = hr.stdout.trim();
  const noGh = args.includes('--no-gh');
  let env;
  try { env = makeEnv({ ctx, head, gh: !noGh }); } catch (e) { fail2(`a repó nem olvasható: ${String(e?.message ?? e).split('\n')[0]}`); }
  const gate = createGate('verify-report', { log: json ? () => {} : undefined });
  const refItems = checkReferences(md, env);
  for (const x of refItems) gate.add(`${x.kind} ${x.ref}`.slice(0, 70), x.status === FALSE ? STATUS.FAIL : x.status === UNKNOWN ? STATUS.WARN : STATUS.PASS, `${x.status} — ${basename(file)}:${x.line}: ${x.detail}`);
  const s = summarizeRefs(refItems, ctx.cfg?.claims?.unknownWarnRatio ?? 0.5);
  if (s.unknownWarn) gate.add('NEM ELLENŐRIZHETŐ arány', STATUS.WARN, `${Math.round(s.unknownRatio * 100)}% (${s[UNKNOWN]} / ${s.total}) — a küszöb fölött`);
  if (reportPath) {
    const block = extractClaimsBlock(md);
    if (block.error) gate.add('gépi blokk (json allitasok)', STATUS.FAIL, block.error);
    else {
      const chainEnforce = (ctx.cfg?.modes?.['evidence-chain']?.local ?? 'warn') === 'block';
      const results = checkClaims(block.claims, {
        head, base, resolve: env.resolve, record: env.record, noGh, pr: env.pr, refEnv: env, chainEnforce,
        diffNames: (b, h) => ctx.git.out(['-c', 'core.quotePath=false', 'diff', '--name-only', `${b}...${h}`]).split('\n').map((x) => x.trim()).filter(Boolean),
        chain: (id) => chainStatus(ctx.evDir, id),
        proseCounts: refItems.filter((x) => x.kind === 'test-count' && !x.evidence).map((x) => ({ ref: x.ref, ...x.count })),
      });
      for (const r of results) gate.add(r.name, r.status, r.note);
    }
  }
  const code = gate.finish();
  const items = [
    ...refItems.map((x) => ({ id: `${x.kind}:${x.ref}`, status: x.status, ref: `${basename(file)}:${x.line} ${x.ref}`, detail: redact(x.detail) })),
    ...gate.results.slice(refItems.length).map((r) => ({ id: r.name, status: r.status, ref: r.name, detail: redact(r.note) })),
  ];
  const counts = {};
  for (const x of items) counts[x.status] = (counts[x.status] ?? 0) + 1;
  const sha = createHash('sha256').update(md).digest('hex');
  try {
    appendRecord(ctx.evDir, `claims-${sha.slice(0, 16)}`, { kind: 'claims', head, report: basename(file), reportSha256: sha, ok: code === 0, counts, at: new Date().toISOString() });
  } catch { /* a rekord írása nem dönti el az ítéletet */ }
  if (json) process.stdout.write(`${JSON.stringify({ schema: 'websuli-check/1', tool: 'verify-report', head, ok: code === 0, exitCode: code, counts, items, ms: Date.now() - t0 }, null, 2)}\n`);
  process.exit(code);
}

if (isMain(import.meta.url)) main();
