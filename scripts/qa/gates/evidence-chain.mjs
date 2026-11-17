#!/usr/bin/env node
// Láncolt bizonyíték-napló (S2; terv: docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md 6.1, 6.3a; független review M2–M3).
// A bizonyíték-tár (`<git-common-dir>/websuli-qa-evidence/`) rekordjai mellé egy `chain.jsonl`: soronként `{ name, head, sha256, prev, at }`
// (`sha256` = a rekordfájl tartalmának hash-e, `prev` = az előző lánc-SOR hash-e). A hozzáfűzés kizáró zárfájllal (`chain.lock`, `wx`)
// atomi: a tár minden munkafának közös, a kapuk párhuzamosan írnak.
//
// MIT GARANTÁL: a véletlen vagy hanyag hamisítás és az utólagos átírás ÉSZLELÉSÉT (kézzel írt, láncon kívüli rekord; átírt rekord;
// kivágott / törölt lánc-sor; útvonal-bejárás az azonosítóban). MIT NEM: egy, a tárat írni tudó, szándékosan csaló ügynök a teljes
// láncot újraszámolhatja — ez ellen helyi fájl nem véd; a megkerülhetetlen pont a CI.
//
// Használat: node scripts/qa/gates/evidence-chain.mjs --verify [--json]   (kód: 0 ép / 1 törött / 2 nem futott)
//            node scripts/qa/gates/evidence-chain.mjs --repair            (a törött láncot archiválja, újat indít — naplózva)

import { createHash } from 'node:crypto';
import {
  appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync, writeSync,
} from 'node:fs';
import { join } from 'node:path';
import { isMain, makeContext } from './lib.mjs';

export const CHAIN_FILE = 'chain.jsonl';
export const LOCK_FILE = 'chain.lock';
export const REPAIR_LOG = 'chain-repair.log';
/** Bizonyíték-azonosító: csak kisbetű, szám, kötőjel (útvonal-elem, `..`, `/` tilos). */
export const ID_RE = /^[a-z0-9][a-z0-9-]{2,120}$/;
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const validId = (id) => typeof id === 'string' && ID_RE.test(id);

const sleepSync = (ms) => { if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); };

/**
 * Kizáró zár a lánc köré: `chain.lock` létrehozása `wx`-szel; foglaltnál korlátos újrapróba (véletlen várakozással); a `staleMs`-nél
 * régebbi zár elárvultnak számít (egy összeomlott író hagyta) — törlés + napló. Időtúllépésnél kivétel (a hívó kapu nem dől el rajta).
 */
export function withLock(dir, fn, { timeoutMs = 20_000, staleMs = 30_000, sleep = sleepSync, now = () => Date.now() } = {}) {
  mkdirSync(dir, { recursive: true });
  const lock = join(dir, LOCK_FILE);
  const t0 = now();
  let fd = null;
  for (;;) {
    try { fd = openSync(lock, 'wx'); break; } catch (e) {
      // Windows: a törlés alatt álló zárfájlra EPERM / EACCES jön — ugyanúgy „foglalt”, újrapróba
      if (!['EEXIST', 'EPERM', 'EACCES', 'EBUSY'].includes(e.code)) throw e;
      try {
        if (now() - statSync(lock).mtimeMs > staleMs) {
          unlinkSync(lock);
          appendFileSync(join(dir, REPAIR_LOG), `${new Date().toISOString()} elárvult zár törölve (${staleMs} ms-nál régebbi)\n`);
          continue;
        }
      } catch { /* közben eltűnt: újra */ }
      if (now() - t0 > timeoutMs) throw new Error(`a lánc zárja ${timeoutMs} ms után sem szabadult fel (${lock})`);
      sleep(5 + Math.floor(Math.random() * 20));
    }
  }
  try {
    writeSync(fd, `${process.pid}\n`);
    return fn();
  } finally {
    try { closeSync(fd); } catch { /* már zárva */ }
    try { unlinkSync(lock); } catch { /* már törölve */ }
  }
}

function chainLines(dir) {
  const p = join(dir, CHAIN_FILE);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').filter((l) => l.trim());
}

function linkUnlocked(dir, name, extra = {}) {
  const text = readFileSync(join(dir, `${name}.json`), 'utf8');
  let head = null;
  try { head = JSON.parse(text).head ?? null; } catch { /* nem JSON: a hash így is köt */ }
  const lines = chainLines(dir);
  const prev = lines.length ? sha256(lines[lines.length - 1]) : null;
  const entry = { name, head, sha256: sha256(text), prev, at: new Date().toISOString(), ...extra };
  appendFileSync(join(dir, CHAIN_FILE), `${JSON.stringify(entry)}\n`);
  return entry;
}

/** Egy már kiírt rekordfájl (`<name>.json`) láncba kötése (zárral). */
export function linkRecord(dir, name, opts) {
  if (!validId(name)) throw new Error(`érvénytelen bizonyíték-azonosító: ${name}`);
  return withLock(dir, () => linkUnlocked(dir, name), opts);
}

/** Rekord kiírása ÉS láncba kötése, egy zár alatt. */
export function appendRecord(dir, name, rec, opts) {
  if (!validId(name)) throw new Error(`érvénytelen bizonyíték-azonosító: ${name}`);
  mkdirSync(dir, { recursive: true });
  return withLock(dir, () => {
    writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(rec, null, 2)}\n`);
    return linkUnlocked(dir, name);
  }, opts);
}

export function readRecord(dir, name) {
  if (!validId(name)) return null;
  const p = join(dir, `${name}.json`);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

/**
 * A lánc ellenőrzése: (1) minden sor `prev`-je az előző sor hash-e (különben `breaks`); (2) minden NÉV UTOLSÓ lánc-sorának `sha256`-ja
 * egyezik a rekordfájl jelenlegi tartalmával.
 * @param {string[]} [names] a (2) csak ezekre (alapérték: mind)
 * @returns {{ ok: boolean, exists: boolean, problems: string[], breaks: number[], last: Map<string, object> }}
 */
export function verifyChain(dir, names = null) {
  const exists = existsSync(join(dir, CHAIN_FILE));
  const lines = chainLines(dir);
  const problems = [];
  const breaks = [];
  const last = new Map();
  let prevHash = null;
  lines.forEach((l, i) => {
    let e;
    try { e = JSON.parse(l); } catch { problems.push(`${CHAIN_FILE}:${i + 1}: nem JSON`); breaks.push(i + 1); prevHash = sha256(l); return; }
    if ((e.prev ?? null) !== prevHash) { problems.push(`${CHAIN_FILE}:${i + 1}: megszakadt lánc (prev ≠ az előző sor hash-e)`); breaks.push(i + 1); }
    prevHash = sha256(l);
    last.set(e.name, e);
  });
  for (const [name, e] of last) {
    if (names && !names.includes(name)) continue;
    const p = join(dir, `${name}.json`);
    if (!existsSync(p)) { problems.push(`${name}: a rekordfájl hiányzik`); continue; }
    if (sha256(readFileSync(p, 'utf8')) !== e.sha256) problems.push(`${name}: a rekord tartalma eltér a láncba írt hash-től (utólag módosították?)`);
  }
  return { ok: problems.length === 0, exists, problems, breaks, last };
}

/**
 * Egy hivatkozott rekord állapota a lánc szerint: 'ok' | 'invalid-id' | 'missing' | 'no-chain' (van rekord, de nincs lánc) |
 * 'not-in-chain' (láncon kívüli = kézzel írt / régi író) | 'mismatch' (átírt) — és a máshol lévő törések száma (független
 * rekordot NEM buktat, csak jelez).
 */
export function chainStatus(dir, id) {
  if (!validId(id)) return { status: 'invalid-id' };
  const p = join(dir, `${id}.json`);
  if (!existsSync(p)) return { status: 'missing' };
  const v = verifyChain(dir, [id]);
  if (!v.exists) return { status: 'no-chain', breaks: 0 };
  const e = v.last.get(id);
  if (!e) return { status: 'not-in-chain', breaks: v.breaks.length };
  if (sha256(readFileSync(p, 'utf8')) !== e.sha256) return { status: 'mismatch', breaks: v.breaks.length };
  return { status: 'ok', breaks: v.breaks.length, repaired: Boolean(e.repair) };
}

/**
 * Javítás: a (törött) láncot `chain.broken-<időbélyeg>.jsonl` néven ARCHIVÁLJA (nem törli, nem simítja), és új láncot indít, amely a
 * tárban most lévő rekordokat újra-láncolja `repair: true` jelöléssel; minden lépés a `chain-repair.log`-ba kerül. Az újra-láncolt
 * rekordot az ellenőrző „javítás után” megjegyzéssel fogadja el.
 */
export function repairChain(dir, { now = () => new Date() } = {}) {
  return withLock(dir, () => {
    const stamp = now().toISOString().replace(/[:.]/g, '-');
    const p = join(dir, CHAIN_FILE);
    const archived = existsSync(p) ? `chain.broken-${stamp}.jsonl` : null;
    if (archived) renameSync(p, join(dir, archived));
    const names = readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter(validId)
      .map((n) => [n, statSync(join(dir, `${n}.json`)).mtimeMs]).sort((a, b) => a[1] - b[1]).map(([n]) => n);
    for (const n of names) linkUnlocked(dir, n, { repair: true, repairedAt: now().toISOString() });
    appendFileSync(join(dir, REPAIR_LOG), `${now().toISOString()} lánc-javítás: ${archived ? `archiválva: ${archived}` : 'nem volt lánc'}; ${names.length} rekord újra-láncolva (repair: true)\n`);
    return { archived, relinked: names.length };
  });
}

async function main() {
  const args = process.argv.slice(2);
  let ctx;
  try { ctx = makeContext({}); } catch (e) { process.stderr.write(`[evidence-chain] NEM FUTOTT: ${e.message}\n`); process.exit(2); }
  if (args.includes('--repair')) {
    const r = repairChain(ctx.evDir);
    process.stdout.write(`[evidence-chain] javítva: ${r.archived ? `a régi lánc archiválva (${r.archived})` : 'nem volt lánc'}; ${r.relinked} rekord újra-láncolva\n`);
    process.exit(0);
  }
  const v = verifyChain(ctx.evDir);
  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ schema: 'websuli-check/1', tool: 'evidence-chain', head: null, ok: v.ok, exitCode: v.ok ? 0 : 1, counts: { problems: v.problems.length, breaks: v.breaks.length, records: v.last.size }, items: v.problems.map((p) => ({ id: p.split(':')[0], status: 'FAIL', ref: CHAIN_FILE, detail: p })) })}\n`);
  } else {
    process.stdout.write(`[evidence-chain] ${v.ok ? 'ÉP' : 'TÖRÖTT'}: ${v.last.size} rekord, ${v.breaks.length} törés, ${v.problems.length} probléma${v.ok ? '' : ' — javítás: node scripts/qa/gates/evidence-chain.mjs --repair'}\n`);
    for (const p of v.problems.slice(0, 40)) process.stdout.write(`    | ${p}\n`);
  }
  process.exit(v.ok ? 0 : 1);
}

if (isMain(import.meta.url)) main();
