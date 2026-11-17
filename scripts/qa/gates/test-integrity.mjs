#!/usr/bin/env node
// Teszt-integritás kapu (S1; terv: docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md, végrehajtás S1).
// A tesztfájlok (és a sim-kalibrációs fájlok) diffjében keresi a mérce dokumentálatlan lazítását: törölt / kikommentezett teszt és
// állítás, megváltozott számküszöb vagy relációs jel, lazább matcher, megnövelt timeout / retries, `force: true` / fix várakozás,
// forrásszöveget vizsgáló „teszt”, bot-kalibrációs konstans. Átengedés csak igazolt `SPEC-VÁLTOZÁS <dátum> (<hivatkozás>)` jelöléssel.
// Két nézet: a main-hez képesti tartomány ÉS commitonként (a PR-on belüli lazítás a main-hez képest „új fájlként” látszana).
//
// Használat: node scripts/qa/gates/test-integrity.mjs [--base origin/main] [--head <ref>] [--mode warn|block]
//            [--body-file <PR-leírás.md>] [--pr-body-env <VÁLTOZÓ>] [--json]
//   --head  csak olvasó ellenpróba egy másik ágon (munkafa nélkül); alapérték: a munkafa (HEAD + commitolatlan + nem követett)
// Kilépési kód: 0 = nincs jelöletlen / nem igazolt lelet, vagy `warn` mód; 1 = `block` módban van ilyen lelet.

import { existsSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import {
  STATUS, argValue, createGate, isMain, makeContext, redact, writeEvidence,
} from './lib.mjs';

export const GATE = 'test-integrity';

/**
 * Szabály-osztályok: a „mérce” lazítása a CI-ban (`block`) bukás; a „higiénia” (fix várakozás, `force`, forrásszöveg-vizsgálat)
 * mindenütt csak figyelmeztetés — kockázatos minta, de nem a mérce lazítása (a 2026-11-17-i ellenpróba szerint az új e2e-k fele
 * használja; a tiltásához előbb a meglévő esetek kiváltása kell).
 */
export const HYGIENE_RULES = new Set(['force-or-fixed-wait', 'source-regex-test']);

export const DEFAULTS = Object.freeze({
  testPatterns: ['\\.(?:test|spec)\\.[cm]?[jt]sx?$', '\\.browser\\.ts$', '^source/tests/game-mobile-cases/', '^source/playwright[^/]*\\.config\\.[cm]?ts$'],
  calibrationPatterns: ['^source/client/src/lib/[^/]+/sim\\.ts$'],
  markerWindow: 8,
});

// ---- Diff-értelmezés ---------------------------------------------------------------------------------------------------

/**
 * Egységes diff (kontextussal) → `[{ commit, path, oldPath, status, hunks: [{ lines: [{ t: ' '|'+'|'-', text, oldLine, newLine }] }] }]`.
 * A `git log -p --format=@@commit %H` kimenetét is érti (a commit-elválasztó sorral).
 */
export function parseDiff(text) {
  const files = [];
  let commit = null;
  let f = null;
  let h = null;
  let oldLine = 0;
  let newLine = 0;
  for (const raw of String(text ?? '').split('\n')) {
    const l = raw.replace(/\r$/, '');
    if (l.startsWith('@@commit ')) { commit = l.slice(9).trim(); f = null; h = null; continue; }
    if (l.startsWith('diff --git ')) {
      f = { commit, path: null, oldPath: null, status: 'M', hunks: [] };
      files.push(f);
      h = null;
      continue;
    }
    if (!f) continue;
    if (!h) {
      if (l.startsWith('new file mode')) { f.status = 'A'; continue; }
      if (l.startsWith('deleted file mode')) { f.status = 'D'; continue; }
      if (l.startsWith('rename from ')) { f.status = 'R'; f.oldPath = l.slice(12); continue; }
      if (l.startsWith('rename to ')) { f.path = l.slice(10); continue; }
      if (l.startsWith('--- ')) { if (l !== '--- /dev/null') f.oldPath = l.replace(/^--- (?:a\/)?/, ''); continue; }
      if (l.startsWith('+++ ')) { f.path = l === '+++ /dev/null' ? f.oldPath : l.replace(/^\+\+\+ (?:b\/)?/, ''); continue; }
    }
    const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(l);
    if (m) {
      h = { lines: [] };
      f.hunks.push(h);
      oldLine = Number(m[1]);
      newLine = Number(m[2]);
      if (!f.path) f.path = f.oldPath;
      continue;
    }
    if (!h) continue;
    if (l.startsWith('\\')) continue; // „\ No newline at end of file”
    const t = l[0];
    if (t === '+') { h.lines.push({ t, text: l.slice(1), oldLine: null, newLine }); newLine += 1; }
    else if (t === '-') { h.lines.push({ t, text: l.slice(1), oldLine, newLine: null }); oldLine += 1; }
    else if (t === ' ' || l === '') { h.lines.push({ t: ' ', text: l.slice(1), oldLine, newLine }); oldLine += 1; newLine += 1; }
  }
  for (const x of files) { if (!x.path) x.path = x.oldPath; if (!x.oldPath) x.oldPath = x.path; }
  return files.filter((x) => x.path);
}

/** Nem követett (új) fájl diff-alakja: minden sora hozzáadott. */
export function addedFileDiff(path, content) {
  const lines = String(content).replace(/\r\n/g, '\n').split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return { commit: null, path, oldPath: path, status: 'A', hunks: [{ lines: lines.map((text, i) => ({ t: '+', text, oldLine: null, newLine: i + 1 })) }] };
}

// ---- Sor-osztályozás ---------------------------------------------------------------------------------------------------

const ASSERT = /(?:^|[^\w$.])(?:assert(?:\.[A-Za-z]+)*\s*\(|expect(?:\.soft|\.poll)?\s*\(|t\.assert\b)/;
const TEST_CALL = /^\s*(?:test|it|describe)(?:\.(?:serial|parallel|describe|concurrent))?\s*\(\s*(["'`])((?:\\.|(?!\1).)*)\1/;
const COMMENTED = /^\s*(?:\/\/+|\/\*+)\s*(?:await\s+)?(?:assert(?:\.[A-Za-z]+)*\s*\(|expect\s*\(|(?:test|it|describe)\s*\(\s*["'`]).*[;){,]\s*(?:\*\/)?\s*$/;
const FORCE = /\bforce\s*:\s*true\b/;
const FIXED_WAIT = /\bwaitForTimeout\s*\(/;
const SKIP_ADDED = [/\.todo\s*\(/, /\btest\.fail\s*\(/, /\bskip\s*:\s*(?!true\b|false\b)[^\s,}]/];
const READ_FILE = /\breadFile(?:Sync)?\s*\(/;
const SOURCE_PATH = /["'`][^"'`\n]*(?:client\/src\/|server\/|shared\/|\/pages\/|\/lib\/)[^"'`\n]*["'`]/;
const CALIBRATION_CONST = /^\s*(?:export\s+)?const\s+([A-Z][A-Z0-9_]{2,})\s*(?::[^=]+)?=\s*([^;]+);?\s*(?:\/\/.*)?$/;
const MARKER = /SPEC-VÁLTOZÁS/;
const SOURCE_GUARD_MARKER = /FORRÁS-ŐR\s*:\s*\S.{8,}/;

const STRICT_MATCHERS = new Set(['toBe', 'toEqual', 'toStrictEqual', 'strictEqual', 'deepStrictEqual', 'equal', 'deepEqual', 'toHaveLength', 'toHaveCount', 'toHaveText', 'toHaveValue']);
const LOOSE_MATCHERS = new Set(['toBeGreaterThan', 'toBeGreaterThanOrEqual', 'toBeLessThan', 'toBeLessThanOrEqual', 'toContain', 'toContainEqual', 'toContainText', 'toMatch', 'toMatchObject', 'toBeTruthy', 'toBeDefined', 'ok', 'match', 'toBeCloseTo', 'notEqual', 'notStrictEqual']);

const REGEX_MATCHERS = new Set(['match', 'doesNotMatch', 'toMatch']);

export const isAssert =(s) => ASSERT.test(stripStrings(s)) && !/^\s*(?:\/\/|\/\*|\*)/.test(s);

/** A sztring-literálok tartalma `S`-re cserélve (az üzenetszöveg `<`, `≪`, számai ne zavarjanak). */
export function stripStrings(s) {
  return String(s).replace(/(["'`])(?:\\.|(?!\1).)*\1/g, 'S');
}

function tokens(s) {
  return new Set((stripStrings(s).replace(/\d+(?:[._]\d+)*/g, '#').match(/[\p{L}\p{N}_$#]+|[<>=!]=?=?|[-+*/]/gu)) ?? []);
}

export function similarity(a, b) {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size && !y.size) return 1;
  let inter = 0;
  for (const t of x) if (y.has(t)) inter += 1;
  return inter / (x.size + y.size - inter);
}

const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

function parenBody(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i += 1) {
    if (s[i] === '(') depth += 1;
    else if (s[i] === ')') { depth -= 1; if (depth === 0) return s.slice(open + 1, i); }
  }
  return s.slice(open + 1);
}

function firstArg(body) {
  let depth = 0;
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if ('([{'.includes(c)) depth += 1;
    else if (')]}'.includes(c)) depth -= 1;
    else if (c === ',' && depth === 0) return body.slice(0, i);
  }
  return body;
}

/**
 * Az állítás „alanya” (mit mér): `expect(<alany>)`, `assert.x(<első argumentum>)`, `assert.ok(<bal oldal> op …)`; számok `#`-re,
 * szóköz nélkül. Két állítás csak azonos alany mellett párosítható (különben két különböző mérés, nem küszöb-változás).
 */
export function subjectOf(line) {
  // A sztring-literál itt SZÁMÍT (a lokátor azonosítója: getByTestId("a") ≠ getByTestId("b")); a `.length` / `.size` utótag nem.
  const s = String(line);
  let subj = null;
  const e = /expect(?:\.soft|\.poll)?\s*\(/.exec(s);
  if (e) subj = firstArg(parenBody(s, e.index + e[0].length - 1));
  else {
    const a = /assert(?:\.([A-Za-z]+))?\s*\(/.exec(s);
    if (a) {
      const arg = firstArg(parenBody(s, a.index + a[0].length - 1));
      const c = (!a[1] || a[1] === 'ok') ? comparison(`assert.ok(${arg})`) : null;
      subj = c ? c.lhs : arg;
    }
  }
  // A számok is az alany részei (`through(9)` ≠ `through(-7)`: más bemenet, más mérés).
  return subj == null ? null : subj.replace(/\s+/g, '').replace(/\.(?:length|size)$/, '');
}

function matcherOf(s) {
  const m = /\.(to[A-Z]\w*|ok|equal|strictEqual|deepEqual|deepStrictEqual|notEqual|notStrictEqual|match|doesNotMatch)\s*\(/.exec(stripStrings(s));
  if (m) return m[1];
  return /(?:^|[^\w$.])assert\s*\(/.test(stripStrings(s)) ? 'ok' : null;
}

/** Egy kifejezés `alap ± eltolás`, `alap * szorzó` alakra bontva (`without - 1` → { base: 'without', off: -1, mul: 1 }). */
export function linear(expr) {
  let e = norm(expr).replace(/[;,]+$/, '').replace(/^\(|\)$/g, '');
  let off = 0;
  let mul = 1;
  for (;;) {
    const t = /^(.*?)\s*([-+])\s*(\d+(?:[._]\d+)*)$/.exec(e);
    if (t && t[1] !== '') { off += (t[2] === '-' ? -1 : 1) * Number(t[3].replace(/_/g, '')); e = t[1].trim(); continue; }
    const k = /^(.*?)\s*\*\s*(\d+(?:\.\d+)?)$/.exec(e);
    if (k && k[1] !== '') { mul *= Number(k[2]); e = k[1].trim(); continue; }
    break;
  }
  if (/^-?\d+(?:[._]\d+)*$/.test(e)) return { base: '', off: off + Number(e.replace(/_/g, '')), mul };
  return { base: e.replace(/\s+/g, ''), off, mul };
}

/** Az állítás első összehasonlítása: `{ op, lhs, rhs }` (matcher-alak is: `toBeGreaterThanOrEqual(n)` → `>=`). */
export function comparison(line) {
  const s = stripStrings(line);
  const mm = /expect\s*\(([^)]*(?:\([^)]*\))?[^)]*)\)\s*\.\s*(toBeGreaterThanOrEqual|toBeGreaterThan|toBeLessThanOrEqual|toBeLessThan)\s*\(([^)]*)\)/.exec(s);
  if (mm) return { op: { toBeGreaterThanOrEqual: '>=', toBeGreaterThan: '>', toBeLessThanOrEqual: '<=', toBeLessThan: '<' }[mm[2]], lhs: mm[1], rhs: mm[3] };
  const am = /assert(?:\.ok)?\s*\((.*)$/.exec(s);
  const body = am ? am[1] : s;
  const c = /([\w$.[\]()]+(?:\s*[-+*]\s*[\w$.]+)*)\s*(>=|<=|>|<)\s*([^,)&|?]+(?:\([^)]*\))?[^,)&|?]*)/.exec(body);
  return c ? { op: c[2], lhs: c[1], rhs: c[3] } : null;
}

/**
 * Egy párosított (törölt → hozzáadott) állítás-változás iránya: 'looser' | 'stricter' | 'unknown' | 'same'.
 * Csak egyszerű, egyértelmű esetben dönt; minden más 'unknown' (= lelet — a gép nem találgat).
 */
export function thresholdDirection(oldLine, newLine) {
  const a = comparison(oldLine);
  const b = comparison(newLine);
  if (!a || !b) return 'unknown';
  const flip = (c) => {
    // `5 <= x` → `x >= 5` (a szám a jobb oldalra)
    if (/^\d/.test(norm(c.lhs)) && !/^\d/.test(norm(c.rhs))) return { op: { '>=': '<=', '<=': '>=', '>': '<', '<': '>' }[c.op], lhs: c.rhs, rhs: c.lhs };
    return c;
  };
  const x = flip(a);
  const y = flip(b);
  if (norm(x.lhs).replace(/\s+/g, '') !== norm(y.lhs).replace(/\s+/g, '')) return 'unknown';
  const lower = (op) => op === '>=' || op === '>';
  if (lower(x.op) !== lower(y.op)) return 'unknown';
  const p = linear(x.rhs);
  const q = linear(y.rhs);
  if (p.base !== q.base) return 'unknown';
  // Az „érték” összevetése: alsó korlátnál a kisebb jobb oldal / a `>` → `>=` lazább; felsőnél fordítva.
  let cmp = 0;
  if (p.mul !== q.mul) {
    if (p.off !== q.off) return 'unknown';
    cmp = Math.sign(q.mul - p.mul);
  } else {
    cmp = Math.sign(q.off - p.off);
  }
  const strictOld = x.op === '>' || x.op === '<';
  const strictNew = y.op === '>' || y.op === '<';
  let opCmp = 0; // +1: az új jel szigorúbb
  if (strictOld !== strictNew) opCmp = strictNew ? 1 : -1;
  // alsó korlát: nagyobb jobb oldal = szigorúbb; felső: kisebb = szigorúbb
  const valueStricter = lower(x.op) ? cmp : -cmp;
  if (valueStricter === 0 && opCmp === 0) return 'same';
  if (valueStricter >= 0 && opCmp >= 0) return 'stricter';
  if (valueStricter <= 0 && opCmp <= 0) return 'looser';
  return 'unknown';
}

const NUMS = (s) => (stripStrings(s).match(/(?<![\w$.])\d+(?:[._]\d+)*/g) ?? []).join(',');
const OPS = (s) => (stripStrings(s).match(/[<>]=?|[!=]==?/g) ?? []).join(',');
const TIMEOUT_KEYS = /\b(timeout|retries|setTimeout|waitForTimeout)\b\s*[:(]\s*([\d_]+)/g;

function timeoutMap(s) {
  const m = new Map();
  for (const x of s.matchAll(TIMEOUT_KEYS)) m.set(x[1], Number(x[2].replace(/_/g, '')));
  return m;
}

// ---- Elemzés -----------------------------------------------------------------------------------------------------------

const finding = (rule, file, l, extra = {}) => ({ rule, file, line: l.newLine ?? l.oldLine, side: l.t === '-' ? 'old' : 'new', text: l.text, ...extra });

/**
 * Egy fájl egy diff-egységben (tartomány vagy egy commit) → leletek. `kind`: 'test' | 'calibration'.
 * @returns {{ findings: object[], notes: string[] }}
 */
export function analyzeFile(f, kind) {
  const findings = [];
  const notes = [];
  const all = f.hunks.flatMap((h, hi) => h.lines.map((l) => ({ ...l, hi })));
  const added = all.filter((l) => l.t === '+');
  const removed = all.filter((l) => l.t === '-');

  if (kind === 'calibration') {
    const oldC = new Map();
    for (const l of removed) { const m = CALIBRATION_CONST.exec(l.text); if (m) oldC.set(m[1], { v: norm(m[2]), l }); }
    for (const l of added) {
      const m = CALIBRATION_CONST.exec(l.text);
      if (m && oldC.has(m[1]) && oldC.get(m[1]).v !== norm(m[2])) findings.push(finding('sim-calibration', f.path, l, { was: oldC.get(m[1]).v }));
    }
    return { findings, notes };
  }

  if (f.status === 'D') {
    findings.push({ rule: 'test-file-deleted', file: f.path, line: 0, side: 'old', text: '(a tesztfájl törölve)' });
    return { findings, notes };
  }

  // Tesztesetek: nettó csökkenés esetén a párjukat vesztett címek.
  const titles = (ls) => ls.map((l) => ({ l, m: TEST_CALL.exec(l.text) })).filter((x) => x.m);
  const rT = titles(removed);
  const aT = titles(added);
  if (rT.length > aT.length) {
    const addedTitles = new Set(aT.map((x) => x.m[2]));
    for (const x of rT) if (!addedTitles.has(x.m[2])) findings.push(finding('test-removed', f.path, x.l));
  }

  // Állítások párosítása (sok-az-egyhez: minden hozzáadott a leginkább hasonló törölthöz).
  const rA = removed.filter((l) => isAssert(l.text));
  const aA = added.filter((l) => isAssert(l.text));
  const addedNorm = new Set(added.map((l) => norm(l.text)));
  const pairedOld = new Set();
  for (const a of aA) {
    let best = null;
    let bs = 0;
    const sa = subjectOf(a.text);
    for (const r of rA) {
      const s = similarity(a.text, r.text);
      const sr = subjectOf(r.text);
      // Ismert, eltérő alany: két különböző mérés — nem pár. Ismeretlen alanynál csak a nagyon hasonló sor párosítható.
      const ok = sa != null && sr != null ? sa === sr && s >= 0.4 : s >= 0.8;
      if (ok && s > bs) { bs = s; best = r; }
    }
    if (!best) continue;
    pairedOld.add(best);
    if (norm(a.text) === norm(best.text)) continue;
    const om = matcherOf(best.text);
    const nm = matcherOf(a.text);
    if (om && nm && om !== nm && STRICT_MATCHERS.has(om) && LOOSE_MATCHERS.has(nm)) {
      findings.push(finding('matcher-loosened', f.path, a, { was: norm(best.text) }));
      continue;
    }
    if (om && nm && om !== nm && LOOSE_MATCHERS.has(om) && STRICT_MATCHERS.has(nm)) {
      notes.push(`${f.path}:${a.newLine} laza → szigorú matcher (nem lelet)`);
      continue;
    }
    if (om && nm && REGEX_MATCHERS.has(om) && REGEX_MATCHERS.has(nm)) {
      // Regex-alakú (forrás-)állítás átírása szerkezeti változás, nem számküszöb — a forrás-vizsgálatot a `source-regex-test` jelzi.
      notes.push(`${f.path}:${a.newLine} regex-állítás átírva (nem küszöb)`);
      continue;
    }
    if (om && nm && om !== nm) {
      // Más matcher (nem szigorú → laza): más mérés, nem küszöb-változás — a csere a reviewer dolga.
      notes.push(`${f.path}:${a.newLine} matcher-csere ${om} → ${nm} (nem küszöb)`);
      continue;
    }
    const to = timeoutMap(best.text);
    const tn = timeoutMap(a.text);
    for (const [k, v] of tn) if (to.has(k) && v > to.get(k)) findings.push(finding('timeout-raised', f.path, a, { was: norm(best.text) }));
    const noT = (s) => s.replace(TIMEOUT_KEYS, '');
    if (NUMS(noT(a.text)) !== NUMS(noT(best.text)) || OPS(a.text) !== OPS(best.text)) {
      const dir = thresholdDirection(best.text, a.text);
      if (dir === 'stricter' || dir === 'same') notes.push(`${f.path}:${a.newLine} szigorúbb / azonos küszöb (nem lelet)`);
      else findings.push(finding('threshold-changed', f.path, a, { was: norm(best.text), direction: dir }));
    }
  }
  if (rA.length > aA.length) {
    for (const r of rA) {
      if (pairedOld.has(r) || addedNorm.has(norm(r.text))) continue;
      findings.push(finding('assert-removed', f.path, r));
    }
  }

  // Nem állítás-sorok timeout / retries emelése (konfig, test.setTimeout).
  for (const a of added) {
    if (isAssert(a.text)) continue;
    const tn = timeoutMap(a.text);
    if (!tn.size) continue;
    let best = null;
    let bs = 0;
    for (const r of removed) { const s = similarity(a.text, r.text); if (s > bs) { bs = s; best = r; } }
    const to = best && bs >= 0.5 ? timeoutMap(best.text) : new Map();
    for (const [k, v] of tn) {
      if ((k === 'timeout' || k === 'setTimeout' || k === 'retries') && to.has(k) && v > to.get(k)) findings.push(finding('timeout-raised', f.path, a, { was: norm(best.text) }));
      else if (k === 'retries' && !to.has(k) && f.status !== 'A' && v > 0) findings.push(finding('timeout-raised', f.path, a));
    }
  }

  for (const a of added) {
    if (COMMENTED.test(a.text)) findings.push(finding('assert-commented', f.path, a));
    if (FORCE.test(stripStrings(a.text)) || FIXED_WAIT.test(stripStrings(a.text))) findings.push(finding('force-or-fixed-wait', f.path, a));
    if (SKIP_ADDED.some((re) => re.test(stripStrings(a.text)))) findings.push(finding('skip-added', f.path, a));
  }
  const readers = added.filter((l) => READ_FILE.test(stripStrings(l.text)));
  if (readers.length && (readers.some((l) => SOURCE_PATH.test(l.text)) || added.some((l) => SOURCE_PATH.test(l.text)))) {
    for (const l of readers) findings.push(finding('source-regex-test', f.path, l));
  }
  return { findings, notes };
}

// ---- Jelölés --------------------------------------------------------------------------------------------------------------

/** A lelet melletti jelölés-sor (a sorban vagy fölötte ≤ `window` sorban; törölt sornál a hunk hozzáadott / kontextus sorai). */
export function findMarker({ f, finding: x, window = DEFAULTS.markerWindow, finalLines = null }) {
  const re = x.rule === 'source-regex-test' ? new RegExp(`${MARKER.source}|${SOURCE_GUARD_MARKER.source}`) : MARKER;
  if (finalLines && x.side === 'new') {
    const idx = finalLines.findIndex((t) => norm(t) === norm(x.text));
    if (idx >= 0) {
      for (let i = idx; i >= Math.max(0, idx - window); i -= 1) if (re.test(finalLines[i])) return finalLines[i];
    }
  }
  for (const h of f.hunks) {
    const lines = h.lines;
    if (x.side === 'new') {
      const i = lines.findIndex((l) => l.t === '+' && l.newLine === x.line);
      if (i < 0) continue;
      for (let j = i; j >= 0 && j >= i - window * 2; j -= 1) {
        const l = lines[j];
        if (l.t === '-') continue;
        if (x.line - l.newLine > window) break;
        if (re.test(l.text)) return l.text;
      }
    } else if (lines.some((l) => l.t === '-' && l.oldLine === x.line)) {
      const hit = lines.find((l) => l.t !== '-' && re.test(l.text));
      if (hit) return hit.text;
    }
  }
  return null;
}

const MARKER_DATE = /SPEC-VÁLTOZÁS\s*:?\s*(\d{4}-\d{2}-\d{2})/;
const MARKER_REF = /SPEC-VÁLTOZÁS[^(\n]*\(([^)\n]*)/;
const SPEC_PATH = /docs\/specs\/[^\s,;)`'"]+\.md/;

/** A tesztfájl „töve” a spec / PR-leírás kereséséhez (`source/tests/tornado-sim.test.ts` → `tornado-sim`). */
export const testStem = (path) => basename(path).replace(/\..*$/, '');

/**
 * A jelölés igazolása: dátum + hivatkozás; a hivatkozott (vagy bármely) változott spec hozzáadott soraiban a teszt töve vagy a
 * `SPEC-VÁLTOZÁS` szó; ha van PR-leírás, abban a teszt töve és a `SPEC-VÁLTOZÁS`.
 * @returns {{ ok: boolean, why: string, pending?: string }}
 */
export function verifyMarker({ marker, file, specAdded, prBody }) {
  if (SOURCE_GUARD_MARKER.test(marker) && !MARKER.test(marker)) return { ok: true, why: 'FORRÁS-ŐR jelölés indoklással' };
  const date = MARKER_DATE.exec(marker)?.[1];
  const ref = MARKER_REF.exec(marker)?.[1] ?? '';
  if (!date || !ref.trim()) return { ok: false, why: `a jelölésből hiányzik a ${!date ? 'dátum (ÉÉÉÉ-HH-NN)' : ''}${!date && !ref.trim() ? ' és a ' : ''}${!ref.trim() ? 'zárójeles hivatkozás' : ''}` };
  const stem = testStem(file);
  const path = SPEC_PATH.exec(ref)?.[0];
  const mentions = (lines) => lines.some((t) => t.includes(stem) || MARKER.test(t));
  if (path) {
    if (!specAdded.has(path)) return { ok: false, why: `a hivatkozott ${path} nem változik ebben a diffben (a döntés nincs rögzítve)` };
    if (!mentions(specAdded.get(path))) return { ok: false, why: `a ${path} diffje nem említi a tesztet (${stem}) / a SPEC-VÁLTOZÁS-t` };
  } else if (![...specAdded.values()].some((ls) => ls.some((t) => t.includes(stem)))) {
    return { ok: false, why: `a hivatkozás nem útvonal, és egyetlen változott docs/specs fájl sem említi a tesztet (${stem})` };
  }
  if (prBody == null) return { ok: true, why: 'igazolt jelölés', pending: 'a PR-leírás itt nem ellenőrizhető (a CI és a PR-kapu nézi)' };
  if (!(prBody.includes(stem) && MARKER.test(prBody))) return { ok: false, why: `a PR-leírás nem sorolja fel (${stem} + SPEC-VÁLTOZÁS)` };
  return { ok: true, why: 'igazolt jelölés (spec + PR-leírás)' };
}

// ---- Teljes elemzés ------------------------------------------------------------------------------------------------------

function classifier(cfg) {
  const ti = { ...DEFAULTS, ...(cfg?.testIntegrity ?? {}) };
  const tests = ti.testPatterns.map((p) => new RegExp(p));
  const cal = ti.calibrationPatterns.map((p) => new RegExp(p));
  return { ti, kindOf: (p) => (tests.some((re) => re.test(p)) ? 'test' : cal.some((re) => re.test(p)) ? 'calibration' : null) };
}

/**
 * Tiszta döntés a begyűjtött diffekből. `range`: a main-hez képesti fájlok; `commits`: commitonkénti fájlok; `finalText(path)`: a
 * fájl jelenlegi tartalma (vagy null); `prBody`: a PR-leírás (vagy null).
 * @returns {{ findings: object[], notes: string[] }} — minden lelet `marker`, `verified`, `why` mezővel
 */
export function analyze({ range, commits = [], finalText = () => null, prBody = null, cfg }) {
  const { ti, kindOf } = classifier(cfg);
  const specAdded = new Map();
  for (const f of range) {
    if (/^docs\/specs\/.+\.md$/.test(f.path)) specAdded.set(f.path, f.hunks.flatMap((h) => h.lines.filter((l) => l.t === '+').map((l) => l.text)));
  }
  const out = [];
  const notes = [];
  const seen = new Set();
  const key = (x) => `${x.rule}|${x.file}|${norm(x.text)}`;
  const finalCache = new Map();
  const finalLines = (p) => {
    if (!finalCache.has(p)) { const t = finalText(p); finalCache.set(p, t == null ? null : String(t).replace(/\r\n/g, '\n').split('\n')); }
    return finalCache.get(p);
  };
  const push = (f, x, viaCommit) => {
    const k = key(x);
    if (seen.has(k)) return;
    seen.add(k);
    const fl = viaCommit ? finalLines(x.file) : null;
    const marker = findMarker({ f, finding: x, window: ti.markerWindow, finalLines: fl });
    const v = marker ? verifyMarker({ marker, file: x.file, specAdded, prBody }) : { ok: false, why: 'jelöletlen' };
    // Commit-nézetben a sor a JELENLEGI fájlban (ha megtalálható) — a commit-beli sorszám a `commitLine`.
    const idx = fl && x.side === 'new' ? fl.findIndex((t) => norm(t) === norm(x.text)) : -1;
    const line = idx >= 0 ? idx + 1 : x.line;
    out.push({ ...x, line, commitLine: viaCommit ? x.line : undefined, commit: viaCommit ? f.commit : undefined, marker: marker ? norm(marker).slice(0, 160) : null, verified: v.ok, why: v.why, pending: v.pending });
  };
  for (const f of range) {
    const kind = kindOf(f.path);
    if (!kind) continue;
    const r = analyzeFile(f, kind);
    notes.push(...r.notes);
    for (const x of r.findings) push(f, x, false);
  }
  for (const f of commits) {
    const kind = kindOf(f.path);
    if (!kind) continue;
    const fl = finalLines(f.path);
    for (const x of analyzeFile(f, kind).findings) {
      // A később visszacsinált lazítás nem lelet: a hozzáadott (lazított) sor már nincs meg / a törölt sor visszakerült.
      if (fl) {
        const present = fl.some((t) => norm(t) === norm(x.text));
        if (x.side === 'new' && !present) continue;
        if (x.side === 'old' && x.rule !== 'test-file-deleted' && present) continue;
      } else if (x.rule !== 'test-file-deleted') continue; // a fájl már nem létezik: a tartomány-nézet felel érte
      push(f, x, true);
    }
  }
  return { findings: out, notes };
}

// ---- Begyűjtés és kapu-lépés -------------------------------------------------------------------------------------------

/** Diffek begyűjtése gittel (egyetlen `git diff` + egyetlen `git log -p`). */
export function collect({ ctx, head = null }) {
  const { git, root, base } = ctx;
  const q = ['-c', 'core.quotePath=false'];
  const mb = git.out(['merge-base', base, head ?? 'HEAD']);
  const rangeText = git.out([...q, 'diff', '-U6', '--no-color', '-M', mb, ...(head ? [head] : []), '--']);
  const range = parseDiff(rangeText);
  if (!head) {
    for (const p of git.untracked().map((s) => s.replace(/\\/g, '/'))) {
      try {
        const buf = readFileSync(join(root, p));
        if (buf.length <= 2 * 1024 * 1024 && !buf.includes(0)) range.push(addedFileDiff(p, buf.toString('utf8')));
      } catch { /* eltűnt közben */ }
    }
  }
  const logText = git.out([...q, 'log', '-p', '-U6', '--no-color', '--no-merges', '-M', '--format=@@commit %H', `${base}..${head ?? 'HEAD'}`, '--']);
  const commits = parseDiff(logText);
  const finalText = (p) => {
    if (head) { const r = git.run([...q, 'show', `${head}:${p}`]); return r.code === 0 ? r.stdout : null; }
    const abs = join(root, p);
    return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
  };
  return { range, commits, finalText, commitCount: new Set(commits.map((f) => f.commit)).size };
}

export function resolveMode(cfg, explicit) {
  if (explicit === 'warn' || explicit === 'block') return explicit;
  const m = cfg?.modes?.[GATE] ?? {};
  return (process.env.GITHUB_ACTIONS === 'true' ? m.ci : m.local) ?? 'warn';
}

export function readPrBody({ bodyFile, bodyEnv, argv = process.argv }) {
  const file = bodyFile ?? argValue(argv.slice(2), '--body-file');
  if (file && existsSync(file)) return readFileSync(file, 'utf8');
  if (bodyEnv && process.env[bodyEnv] != null) return process.env[bodyEnv];
  return null;
}

export function formatFinding(x) {
  const where = `${x.file}:${x.line}${x.side === 'old' ? ' (törölt sor)' : ''}${x.commit ? ` [commit ${x.commit.slice(0, 8)}]` : ''}`;
  const was = x.was ? ` ← volt: ${x.was.slice(0, 90)}` : '';
  return redact(`${where} — ${x.rule}${x.direction && x.direction !== 'unknown' ? ` (${x.direction === 'looser' ? 'LAZÍTÁS' : x.direction})` : ''}: ${x.verified ? 'jelölt, igazolt' : x.marker ? `jelölt, NEM igazolt — ${x.why}` : 'JELÖLETLEN'} | ${norm(x.text).slice(0, 110)}${was}`);
}

/** A kapu-lépés (a `lint-gate.mjs` `runLintSteps` hívja, így a szakasz-, push- és PR-kapuban is fut). */
export async function runTestIntegrityStep({ gate, ctx, mode, prBody, head = null }) {
  const m = resolveMode(ctx.cfg, mode);
  const body = prBody === undefined ? readPrBody({}) : prBody;
  let rec = null;
  const r = await gate.step(`teszt-integritás (S1, ${m})`, () => {
    const t0 = Date.now();
    const c = collect({ ctx, head });
    const res = analyze({ range: c.range, commits: c.commits, finalText: c.finalText, prBody: body, cfg: ctx.cfg });
    const bad = res.findings.filter((x) => !x.verified);
    const badMeasure = bad.filter((x) => !HYGIENE_RULES.has(x.rule));
    const badHygiene = bad.filter((x) => HYGIENE_RULES.has(x.rule));
    const ok = res.findings.length - bad.length;
    rec = { kind: GATE, mode: m, at: new Date().toISOString(), ms: Date.now() - t0, commits: c.commitCount, findings: res.findings, notes: res.notes };
    const pending = res.findings.some((x) => x.verified && x.pending);
    if (!bad.length) {
      return { status: STATUS.PASS, note: `${c.commitCount} commit + tartomány; ${ok} igazolt jelölés${pending ? ' (a PR-leírást a CI / PR-kapu nézi)' : ''}` };
    }
    const parts = [];
    if (badMeasure.length) parts.push(`${badMeasure.length} jelöletlen / nem igazolt MÉRCE-változás`);
    if (badHygiene.length) parts.push(`${badHygiene.length} higiénia-jelzés (fix várakozás / force / forrás-vizsgálat — csak figyelmeztetés)`);
    if (ok) parts.push(`${ok} igazolt`);
    return {
      status: m === 'block' && badMeasure.length ? STATUS.FAIL : STATUS.WARN,
      note: `${parts.join(', ')} — a mércét ne lazítsd; ha valódi spec-változás: \`// SPEC-VÁLTOZÁS <dátum> (docs/specs/<terv>.md <pont>)\` + a spec diffje + a PR-leírás`,
      detail: [...badMeasure, ...badHygiene].map(formatFinding).join('\n'),
    };
  });
  if (rec) {
    try {
      const h = head ? ctx.git.out(['rev-parse', head]) : ctx.git.head();
      writeEvidence(ctx.evDir, `${GATE}-${h}`, { ...rec, head: h, status: r.status });
    } catch { /* a bizonyíték írása nem döntheti el a kaput */ }
  }
  return { record: rec, result: r };
}

async function main() {
  const args = process.argv.slice(2);
  const ctx = makeContext({ base: argValue(args, '--base') });
  const gate = createGate(GATE);
  const { record } = await runTestIntegrityStep({
    gate, ctx, mode: argValue(args, '--mode'), head: argValue(args, '--head') ?? null,
    prBody: readPrBody({ bodyFile: argValue(args, '--body-file'), bodyEnv: argValue(args, '--pr-body-env'), argv: ['', '', ...args] }),
  });
  if (args.includes('--json') && record) process.stdout.write(`${JSON.stringify({ findings: record.findings.map((x) => ({ ...x, text: redact(x.text) })), ms: record.ms }, null, 2)}\n`);
  process.exit(gate.finish());
}

if (isMain(import.meta.url)) main();
