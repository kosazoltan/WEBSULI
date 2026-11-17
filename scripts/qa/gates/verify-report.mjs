#!/usr/bin/env node
// Állítás- és hivatkozás-ellenőrző (S2; terv: docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md, végrehajtás S2.3 / S2.3b).
// Bemenet: egy jelentés / PR-leírás / zárójelentés (md) + egy fej. Kimenet: tételes IGAZ / HAMIS / NEM ELLENŐRIZHETŐ lista.
//  (A) szabad szöveges hivatkozások MINDEN md-ben: `fájl:sor`, `fájl:sor-sor` (+ a mellette álló backtickes kódrészlet ±3 soron belül),
//      backtickes útvonal, `npm run <név>`, `node scripts/…`, commit-hash, `PR #n`, „N/M teszt” (bizonyíték-azonosítóval);
//  (B) a gépi `json allitasok` blokk (alügynök-jelentésnél kötelező): fej = ág feje, módosított fájlok = git diff, PASS = bizonyíték
//      0 kóddal a fejen, PR / CI = GitHub, kapu-lánc hiánytalan, bizonyíték-lánc hash-ei.
// A HAMIS hivatkozás és a bukott blokk-ellenőrzés: kilépési kód 1; a szkript futásképtelensége: 2 (közös konvenció, terv 6.6a).
//
// Használat: node scripts/qa/gates/verify-report.mjs (--report <jelentés.md> | --body-file <PR-leírás.md>) [--head <hash|ref>]
//            [--no-gh] [--json]
//   --report     alügynök-jelentés: a `json allitasok` blokk KÖTELEZŐ
//   --body-file  PR-leírás / egyéb md: csak a szabad szöveges hivatkozások (blokk nem kell)

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { STATUS, argValue, createGate, isMain, makeContext, redact } from './lib.mjs';
import { readRecord, verifyChain } from './evidence-chain.mjs';
import { rollupState } from './pre-push-gate.mjs';

export const TRUE = 'IGAZ';
export const FALSE = 'HAMIS';
export const UNKNOWN = 'NEM ELLENŐRIZHETŐ';
export const SCHEMA = 'websuli-allitasok/1';

const FILE_EXT = 'mjs|cjs|js|jsx|ts|tsx|mts|cts|json|md|ya?ml|css|html|sh|ps1|sql|txt';
const FILE_LINE = new RegExp(`(?<![\\w/.\\\\-])((?:[\\w.-]+/)*[\\w.-]+\\.(?:${FILE_EXT})):(\\d+)(?:\\s*[-–]\\s*(\\d+))?(?![\\w])`, 'g');
const FILE_LINE_ONE = new RegExp(FILE_LINE.source);
const BACKTICK = /`([^`\n]+)`/g;
// Backtickes szöveg csak akkor útvonal, ha ismert gyökérmappával kezdődik vagy fájlkiterjesztése van (az `origin/main`, ágnév nem út).
const PATH_LIKE = new RegExp(`^(?:source|scripts|docs|\\.github|\\.claude|\\.agents|\\.cursor|tests|client|server|shared)/|\\.(?:${FILE_EXT})$`);
const NPM_RUN = /\bnpm(?:\.cmd)?\s+run\s+([\w:.-]+)/g;
const NODE_SCRIPT = /\bnode\s+((?:scripts|source\/scripts)\/[^\s`'")]+)/g;
const COMMIT_BT = /`([0-9a-f]{7,40})`/g;
const COMMIT_WORD = /\bcommit(?:ban|ot|ja|on)?\s+`?([0-9a-f]{7,40})\b/gi;
const PR_REF = /\b(?:PR|pull)\s*-?\s*#(\d{1,6})\b/gi;
const TEST_COUNT = /(\d+)\s*\/\s*(\d+)\s*(?:teszt|eset)|(\d+)\s+(?:teszt|eset)(?:\s+(?:zöld|pass|sikeres))?|(\d+)\s+pass\b/i;
const EVIDENCE_ID = /\b((?:run|stage|pre-push|pre-pr|review|test-integrity|claims)-[0-9a-f]{12,40})\b/;
const FOREIGN = /^(?:[A-Za-z]:[\\/]|\/[a-z]\/|~|https?:|\.\.?\/)|scratchpad|AppData|node_modules/i;

const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

/** A kódblokkok (``` … ```) eltávolítása (a sorszámok megmaradnak: üres sorok kerülnek a helyükre). */
export function stripFences(md) {
  const out = [];
  let inFence = false;
  for (const l of String(md).replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*```/.test(l)) { inFence = !inFence; out.push(''); continue; }
    out.push(inFence ? '' : l);
  }
  return out;
}

/**
 * A hivatkozások kigyűjtése. @returns {{ kind, ref, line, path?, from?, to?, snippet?, name?, hash?, pr?, count?, evidence? }[]}
 */
export function extractRefs(md) {
  const refs = [];
  const seen = new Set();
  const add = (r) => { const k = `${r.kind}|${r.ref}|${r.snippet ?? ''}`; if (!seen.has(k)) { seen.add(k); refs.push(r); } };
  stripFences(md).forEach((text, i) => {
    const line = i + 1;
    const fileLineSpans = [];
    for (const m of text.matchAll(FILE_LINE)) {
      const path = m[1];
      if (FOREIGN.test(path)) continue;
      fileLineSpans.push([m.index, m.index + m[0].length]);
      // A közvetlenül utána álló backtickes kódrészlet (≤ 6 karakter elválasztóval: `:`, `—`, `-`, `(`, szóköz, záró backtick).
      const after = text.slice(m.index + m[0].length);
      const sn = /^`?[\s:—–(-]{0,6}`([^`]{4,})`/.exec(after);
      const snippet = sn && !FILE_LINE_ONE.test(sn[1]) ? sn[1] : undefined;
      add({ kind: 'file-line', ref: m[0], line, path, from: Number(m[2]), to: Number(m[3] ?? m[2]), snippet });
    }
    for (const m of text.matchAll(BACKTICK)) {
      const v = m[1].trim();
      if (fileLineSpans.some(([a, b]) => m.index < b && m.index + m[0].length > a)) continue;
      if (/\s/.test(v) || !v.includes('/') || FOREIGN.test(v) || /[*<>{}$|()[\]]/.test(v) || /:\d+/.test(v)) continue;
      if (!/^[\w.@-]+(?:\/[\w.@-]+)+\/?$/.test(v) || !PATH_LIKE.test(v.replace(/\/$/, ''))) continue;
      add({ kind: 'path', ref: v, line, path: v.replace(/\/$/, '') });
    }
    for (const m of text.matchAll(NPM_RUN)) add({ kind: 'npm-script', ref: `npm run ${m[1]}`, line, name: m[1] });
    for (const m of text.matchAll(NODE_SCRIPT)) {
      const p = m[1].replace(/[.,;:]+$/, '');
      add({ kind: 'node-script', ref: `node ${p}`, line, path: p });
    }
    for (const re of [COMMIT_BT, COMMIT_WORD]) {
      for (const m of text.matchAll(re)) if (/\d/.test(m[1]) && /[a-f]/.test(m[1])) add({ kind: 'commit', ref: m[1], line, hash: m[1] });
    }
    for (const m of text.matchAll(PR_REF)) add({ kind: 'pr', ref: `PR #${m[1]}`, line, pr: Number(m[1]) });
    const tc = TEST_COUNT.exec(text);
    if (tc) {
      const pass = Number(tc[1] ?? tc[3] ?? tc[4]);
      const total = tc[2] != null ? Number(tc[2]) : null;
      add({ kind: 'test-count', ref: norm(tc[0]), line, count: { pass, total }, evidence: EVIDENCE_ID.exec(text)?.[1] });
    }
  });
  return refs;
}

/**
 * A repó-hozzáférés a fejen (a tesztek hamisat injektálnak):
 * `files: Set<string>`, `read(path) → string|null`, `commitExists(hash) → bool`, `scripts: Set<string>`, `pr(n) → {state}|null|undefined`
 * (undefined = nem ellenőrizhető), `record(id) → object|null`.
 */
export function checkRef(r, repo) {
  const resolve = (p) => {
    const clean = p.replace(/^\.\//, '').replace(/\\/g, '/');
    if (repo.files.has(clean)) return { path: clean };
    if (!clean.startsWith('source/') && repo.files.has(`source/${clean}`)) return { path: `source/${clean}` };
    if (repo.dirs?.has(clean) || repo.dirs?.has(`source/${clean}`)) return { path: clean, dir: true };
    if (!clean.includes('/')) {
      const hits = [...repo.files].filter((f) => f.endsWith(`/${clean}`) || f === clean);
      if (hits.length === 1) return { path: hits[0] };
      if (hits.length > 1) return { ambiguous: hits.length };
    } else {
      const hits = [...repo.files].filter((f) => f.endsWith(`/${clean}`));
      if (hits.length === 1) return { path: hits[0] };
      if (hits.length > 1) return { ambiguous: hits.length };
    }
    return null;
  };
  switch (r.kind) {
    case 'file-line': {
      const f = resolve(r.path);
      if (!f) return { status: FALSE, detail: `a fájl nincs a fejen: ${r.path}` };
      if (f.ambiguous) return { status: UNKNOWN, detail: `${f.ambiguous} azonos nevű fájl — adj teljes utat` };
      if (f.dir) return { status: FALSE, detail: `${r.path} könyvtár, nem fájl` };
      const lines = String(repo.read(f.path) ?? '').replace(/\r\n/g, '\n').split('\n');
      if (lines.length && lines[lines.length - 1] === '') lines.pop();
      if (r.from < 1 || r.to > lines.length || r.from > r.to) return { status: FALSE, detail: `${f.path}: ${lines.length} soros, a hivatkozott ${r.from}${r.to !== r.from ? `–${r.to}` : ''} nem létezik` };
      if (r.snippet) {
        const want = norm(r.snippet);
        const lo = Math.max(0, r.from - 1 - 3);
        const hi = Math.min(lines.length, r.to + 3);
        const win = lines.slice(lo, hi);
        const found = win.some((l) => norm(l).includes(want)) || norm(win.join(' ')).includes(want);
        if (!found) return { status: FALSE, detail: `${f.path}:${r.from}: a kódrészlet („${want.slice(0, 60)}”) nincs a ±3 soros ablakban` };
        return { status: TRUE, detail: `${f.path}:${r.from} + kódrészlet` };
      }
      return { status: TRUE, detail: f.path };
    }
    case 'path': {
      const f = resolve(r.path);
      if (!f) return { status: FALSE, detail: `nincs a fejen: ${r.path}` };
      if (f.ambiguous) return { status: UNKNOWN, detail: `${f.ambiguous} találat` };
      return { status: TRUE, detail: f.path };
    }
    case 'node-script': {
      const f = resolve(r.path);
      return f && !f.ambiguous ? { status: TRUE, detail: f.path } : { status: FALSE, detail: `a szkript nincs a fejen: ${r.path}` };
    }
    case 'npm-script':
      return repo.scripts.has(r.name) ? { status: TRUE, detail: 'package.json scripts' } : { status: FALSE, detail: `a „${r.name}” nincs sem a gyökér, sem a source/ package.json scripts mezőjében` };
    case 'commit':
      return repo.commitExists(r.hash) ? { status: TRUE, detail: 'létező commit' } : { status: FALSE, detail: `nem létező commit: ${r.hash}` };
    case 'pr': {
      const p = repo.pr(r.pr);
      if (p === undefined) return { status: UNKNOWN, detail: 'a gh nem érhető el (--no-gh?)' };
      return p ? { status: TRUE, detail: `PR #${r.pr}: ${p.state}` } : { status: FALSE, detail: `nem létező PR: #${r.pr}` };
    }
    case 'test-count': {
      if (!r.evidence) return { status: UNKNOWN, detail: 'nincs mellette bizonyíték-azonosító (run-… / pre-push-…)' };
      const rec = repo.record(r.evidence);
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

export function checkReferences(md, repo) {
  return extractRefs(md).map((r) => ({ ...r, ...checkRef(r, repo) }));
}

// ---- (B) a gépi blokk -----------------------------------------------------------------------------------------------------

export function extractClaimsBlock(md) {
  const blocks = [...String(md).replace(/\r\n/g, '\n').matchAll(/^```json[ \t]+allitasok[ \t]*\n([\s\S]*?)\n```/gm)];
  if (!blocks.length) return { error: 'nincs `json allitasok` blokk (a jelentés-sablon kötelező része: scripts/qa/gates/report-template.md)' };
  if (blocks.length > 1) return { error: `${blocks.length} \`json allitasok\` blokk — pontosan egy legyen` };
  try { return { claims: JSON.parse(blocks[0][1]) }; } catch (e) { return { error: `a blokk nem érvényes JSON: ${e.message}` }; }
}

/**
 * A blokk állításai a valósághoz mérve. `env`: `resolve(ref) → hash|null`, `diffNames(base, head) → string[]`, `record(id)`,
 * `chain(names) → { ok, problems }`, `pr(n) → { state, headRefOid, statusCheckRollup } | null | undefined`, `repo` (a `checkRef`-hez).
 * @returns {{ name: string, status: string, note: string }[]}
 */
export function checkClaims(c, env) {
  const out = [];
  const add = (name, status, note = '') => out.push({ name, status, note });
  if (c?.schema !== SCHEMA) add('séma', STATUS.FAIL, `schema: „${c?.schema}” — elvárt: ${SCHEMA}`);
  const head = c?.head ? env.resolve(c.head) : null;
  if (!head || !/^[0-9a-f]{40}$/.test(String(c?.head))) {
    add('fej', STATUS.FAIL, !c?.head ? 'hiányzik a head' : head ? 'a head 40 jegyű hash legyen' : `nem létező commit: ${c.head}`);
    return out;
  }
  if (c.branch) {
    const tip = env.resolve(c.branch);
    add('fej = az ág feje', tip === head ? STATUS.PASS : STATUS.FAIL, tip === head ? c.branch : `a ${c.branch} feje ${tip ? tip.slice(0, 12) : 'nem létezik'}, a jelentés ${head.slice(0, 12)}-t állít`);
  }
  if (Array.isArray(c.changedFiles)) {
    const real = new Set(env.diffNames(c.base ?? 'origin/main', head));
    const said = new Set(c.changedFiles);
    const missing = [...real].filter((f) => !said.has(f));
    const extra = [...said].filter((f) => !real.has(f));
    add('módosított fájlok = git diff', missing.length || extra.length ? STATUS.FAIL : STATUS.PASS,
      missing.length || extra.length ? `${missing.length ? `kimaradt: ${missing.join(', ')}` : ''}${missing.length && extra.length ? '; ' : ''}${extra.length ? `nem változott: ${extra.join(', ')}` : ''}` : `${real.size} fájl`);
  }
  for (const r of c.refs ?? []) {
    const ref = { kind: 'file-line', ref: `${r.file}:${r.line}`, path: r.file, from: Number(String(r.line).split('-')[0]), to: Number(String(r.line).split('-')[1] ?? String(r.line).split('-')[0]), snippet: r.text };
    const v = checkRef(ref, env.repo);
    add(`hivatkozás ${ref.ref}`, v.status === TRUE ? STATUS.PASS : STATUS.FAIL, v.detail);
  }
  const ids = [];
  for (const k of ['commands', 'tests']) {
    for (const x of c[k] ?? []) {
      const label = `${k === 'tests' ? 'teszt' : 'parancs'}: ${x.cmd}`;
      const claimed = String(x.status ?? (x.fail === 0 ? 'PASS' : x.fail > 0 ? 'FAIL' : '')).toUpperCase();
      if (claimed !== 'PASS') { add(label, STATUS.PASS, `${claimed || 'állapot nélkül'} — bukás bevallása, bizonyíték nem kell`); continue; }
      if (!x.evidence) { add(label, STATUS.FAIL, 'PASS-t állít bizonyíték-azonosító nélkül (futtasd: node scripts/qa/gates/evidence-run.mjs -- <parancs>)'); continue; }
      ids.push(x.evidence);
      const rec = env.record(x.evidence);
      if (!rec) { add(label, STATUS.FAIL, `a bizonyíték nincs a tárban: ${x.evidence}`); continue; }
      if (rec.head !== head) { add(label, STATUS.FAIL, `a ${x.evidence} más fejre szól (${String(rec.head).slice(0, 12)})`); continue; }
      if (!(rec.ok === true || rec.code === 0)) { add(label, STATUS.FAIL, `a ${x.evidence} szerint a futás bukott (kód ${rec.code})`); continue; }
      if (k === 'tests' && rec.counts && x.pass != null && rec.counts.pass !== x.pass) { add(label, STATUS.FAIL, `a rekord ${rec.counts.pass} pass-t rögzített, a jelentés ${x.pass}-t állít`); continue; }
      add(label, STATUS.PASS, `${x.evidence}${rec.dirty ? ' (FIGYELEM: commitolatlan változás mellett futott)' : ''}`);
    }
  }
  if (c.pr) {
    const p = env.pr(c.pr.number);
    if (p === undefined) add(`PR #${c.pr.number}`, STATUS.WARN, 'a gh nem érhető el — nem ellenőrizhető');
    else if (!p) add(`PR #${c.pr.number}`, STATUS.FAIL, 'nem létező PR');
    else {
      const probs = [];
      if (c.pr.state && c.pr.state !== p.state) probs.push(`állapot: ${p.state} (a jelentés: ${c.pr.state})`);
      if (p.headRefOid && p.headRefOid !== head) probs.push(`a PR feje ${p.headRefOid.slice(0, 12)}, a jelentés ${head.slice(0, 12)}`);
      const ci = rollupState(p.statusCheckRollup);
      if (c.pr.ci && c.pr.ci !== ci) probs.push(`CI: ${ci} (a jelentés: ${c.pr.ci})`);
      add(`PR #${c.pr.number} állapota`, probs.length ? STATUS.FAIL : STATUS.PASS, probs.join('; ') || `${p.state}, CI ${ci}`);
    }
  }
  const gates = new Set(c.gates ?? []);
  const need = { stage: [`stage-${head}`], push: [`pre-push-${head}`, `pre-pr-${head}`], review: [`review-${head}`], pr: [`pre-pr-${head}`] };
  if (gates.has('pr')) { for (const g of ['push', 'review']) if (!gates.has(g)) add('kapu-lánc', STATUS.FAIL, `a „pr” kapu állítása mellől hiányzik: ${g}`); }
  for (const g of gates) {
    const cands = need[g];
    if (!cands) { add(`kapu: ${g}`, STATUS.FAIL, 'ismeretlen kapu (stage | push | review | pr)'); continue; }
    const hit = cands.map((n) => [n, env.record(n)]).find(([, r]) => r && (r.ok === true || r.verdict === 'IGEN' || r.verdict === 'IGEN, FELTÉTELLEL'));
    add(`kapu: ${g}`, hit ? STATUS.PASS : STATUS.FAIL, hit ? hit[0].replace(head, head.slice(0, 12)) : `nincs zöld bizonyíték a fejre (${cands.map((n) => n.replace(head, '<fej>')).join(' / ')})`);
    if (hit) ids.push(hit[0]);
  }
  if (ids.length) {
    const ch = env.chain(ids);
    const relevant = ch.problems.filter((p) => ids.some((id) => p.startsWith(id)) || p.startsWith('chain.jsonl'));
    add('bizonyíték-lánc', relevant.length ? STATUS.FAIL : STATUS.PASS, relevant.join('; ') || `${ids.length} rekord a láncban (a láncon kívüli régi rekord: nem hiba)`);
  }
  for (const n of c.notRun ?? []) if (!n?.reason) add(`NOT RUN: ${n?.what ?? '?'}`, STATUS.FAIL, 'ok (reason) nélkül');
  return out;
}

// ---- Valódi környezet ------------------------------------------------------------------------------------------------------

export function makeRepo({ ctx, head, gh = true }) {
  const { git, root } = ctx;
  const q = ['-c', 'core.quotePath=false'];
  const files = new Set(git.out([...q, 'ls-tree', '-r', '--name-only', head]).split('\n').map((s) => s.trim()).filter(Boolean));
  const dirs = new Set();
  for (const f of files) { const parts = f.split('/'); for (let i = 1; i < parts.length; i += 1) dirs.add(parts.slice(0, i).join('/')); }
  const cache = new Map();
  const read = (p) => {
    if (!cache.has(p)) { const r = git.run([...q, 'show', `${head}:${p}`]); cache.set(p, r.code === 0 ? r.stdout : null); }
    return cache.get(p);
  };
  const scripts = new Set();
  for (const p of ['package.json', 'source/package.json']) {
    try { Object.keys(JSON.parse(read(p) ?? '{}').scripts ?? {}).forEach((s) => scripts.add(s)); } catch { /* hibás manifest: a szkript nem igazolható */ }
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
  return {
    files, dirs, read, scripts, pr,
    commitExists: (h) => git.run(['cat-file', '-e', `${h}^{commit}`]).code === 0,
    record: (id) => readRecord(ctx.evDir, id),
  };
}

function summarize(items) {
  const counts = {};
  for (const x of items) counts[x.status] = (counts[x.status] ?? 0) + 1;
  return counts;
}

/** Kapu-lépés egy szövegre (a `pre-pr-gate` a #490 után ezzel nézi a PR-leírást; a `record-review` az ellenőri jelentést). */
export async function runReferenceStep({ gate, ctx, text, label, head = null, gh = true }) {
  let items = [];
  const r = await gate.step(`hivatkozások: ${label}`, () => {
    const h = head ?? ctx.git.head();
    items = checkReferences(text, makeRepo({ ctx, head: h, gh }));
    const bad = items.filter((x) => x.status === FALSE);
    const unk = items.filter((x) => x.status === UNKNOWN).length;
    if (!items.length) return { status: STATUS.PASS, note: 'nincs gépileg ellenőrizhető hivatkozás' };
    if (bad.length) return { status: STATUS.FAIL, note: `${bad.length} HAMIS hivatkozás (${items.length} közül; ${unk} nem ellenőrizhető)`, detail: bad.map((x) => redact(`${label}:${x.line} ${x.ref} — ${x.detail}`)).join('\n') };
    return { status: STATUS.PASS, note: `${items.length - unk} IGAZ, ${unk} NEM ELLENŐRIZHETŐ` };
  });
  return { items, result: r };
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
  const block = reportPath ? extractClaimsBlock(md) : null;
  const headArg = argValue(args, '--head') ?? block?.claims?.head ?? 'HEAD';
  const hr = ctx.git.run(['rev-parse', '--verify', '--quiet', `${headArg}^{commit}`]);
  if (hr.code !== 0) fail2(`a fej nem oldható fel: ${headArg}`);
  const head = hr.stdout.trim();
  const gh = !args.includes('--no-gh');
  const repo = makeRepo({ ctx, head, gh });
  const lines = [];
  const gate = createGate('verify-report', { log: json ? (s) => lines.push(s) : undefined });
  const refItems = checkReferences(md, repo);
  for (const x of refItems) gate.add(`${x.kind} ${x.ref}`.slice(0, 70), x.status === FALSE ? STATUS.FAIL : x.status === UNKNOWN ? STATUS.WARN : STATUS.PASS, `${x.status} — ${basename(file)}:${x.line}: ${x.detail}`);
  if (reportPath) {
    if (block.error) gate.add('gépi blokk (json allitasok)', STATUS.FAIL, block.error);
    else {
      const env = {
        resolve: (ref) => { const r = ctx.git.run(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]); return r.code === 0 ? r.stdout.trim() : null; },
        diffNames: (base, h) => ctx.git.out(['-c', 'core.quotePath=false', 'diff', '--name-only', `${base}...${h}`]).split('\n').map((s) => s.trim()).filter(Boolean),
        record: (id) => readRecord(ctx.evDir, id),
        chain: (names) => verifyChain(ctx.evDir, names),
        pr: (n) => repo.pr(n),
        repo,
      };
      for (const r of checkClaims(block.claims, env)) gate.add(r.name, r.status, r.note);
    }
  }
  const code = gate.finish();
  const items = [
    ...refItems.map((x) => ({ id: `${x.kind}:${x.ref}`, status: x.status, ref: `${basename(file)}:${x.line} ${x.ref}`, detail: redact(x.detail) })),
    ...gate.results.slice(refItems.length).map((r) => ({ id: r.name, status: r.status, ref: r.name, detail: redact(r.note) })),
  ];
  const sha = createHash('sha256').update(md).digest('hex');
  try {
    const { appendRecord } = await import('./evidence-chain.mjs');
    appendRecord(ctx.evDir, `claims-${sha.slice(0, 16)}`, { kind: 'claims', head, report: basename(file), reportSha256: sha, ok: code === 0, counts: summarize(items), at: new Date().toISOString() });
  } catch { /* a rekord írása nem dönti el az ítéletet */ }
  if (json) process.stdout.write(`${JSON.stringify({ schema: 'websuli-check/1', tool: 'verify-report', head, ok: code === 0, exitCode: code, counts: summarize(items), items, ms: Date.now() - t0 }, null, 2)}\n`);
  process.exit(code);
}

if (isMain(import.meta.url)) main();
