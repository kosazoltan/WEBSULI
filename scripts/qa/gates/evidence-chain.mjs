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

import { createHash, randomBytes } from 'node:crypto';
import {
  appendFileSync, closeSync, existsSync, fstatSync, linkSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, statSync, unlinkSync,
  writeFileSync, writeSync,
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
 * régebbi zár elárvultnak számít (egy összeomlott író hagyta) — törlés + napló, DE csak ha a benne álló PID már nem él (független review
 * R2: egy élő, lassú író zárját nem vesszük el). A várakozási idő (45 s) nagyobb az elárvulási küszöbnél (30 s), így egy összeomlott író
 * zárját a várakozó még a saját időtúllépése előtt átveszi. Időtúllépésnél kivétel: a hívó HANGOSAN jelzi (nem csendes rekordhiány).
 */
export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

export const LOCK_TIMEOUT_MS = 45_000;
export const LOCK_STALE_MS = 30_000;
/**
 * Felső korlát (független review F2): a zár alatti művelet ezredmásodperces (hozzáfűzés; a `--repair` is másodperces), ezért a
 * 40 s-nál öregebb zár akkor is elvehető, ha a benne álló PID él — az csak PID-újrahasznosítás vagy beragadt idegen folyamat lehet.
 * A korlát a várakozási időnél (45 s) kisebb: a várakozó minden esetben bejut, a kapuk nem állnak meg.
 */
export const LOCK_MAX_AGE_MS = 40_000;

export function withLock(dir, fn, { timeoutMs = LOCK_TIMEOUT_MS, staleMs = LOCK_STALE_MS, maxAgeMs = LOCK_MAX_AGE_MS, sleep = sleepSync, now = () => Date.now(), alive = pidAlive } = {}) {
  mkdirSync(dir, { recursive: true });
  const lock = join(dir, LOCK_FILE);
  const t0 = now();
  let fd = null;
  for (;;) {
    try { fd = openSync(lock, 'wx'); break; } catch (e) {
      // Windows: a törlés alatt álló zárfájlra EPERM / EACCES jön — ugyanúgy „foglalt”, újrapróba
      if (!['EEXIST', 'EPERM', 'EACCES', 'EBUSY'].includes(e.code)) throw e;
      try {
        const seen = readFileSync(lock, 'utf8');
        const pid = Number.parseInt(seen.trim(), 10);
        const age = now() - statSync(lock).mtimeMs;
        const live = pid !== process.pid && alive(pid);
        if ((age > staleMs && !live) || age > maxAgeMs) {
          // Atomi átvétel (vak review P2-K5): a zárat nem töröljük, hanem egyedi névre nevezzük át; ha az átnevezett fájl már NEM az,
          // amit elárvultnak ítéltünk (közben egy másik várakozó átvette és újat írt), visszaállítjuk (`link`: atomi, foglalt helyre
          // nem ír), és tovább várunk.
          const grabbed = `${lock}.stale-${process.pid}-${randomBytes(4).toString('hex')}`;
          renameSync(lock, grabbed);
          if (readFileSync(grabbed, 'utf8') !== seen) {
            try { linkSync(grabbed, lock); } catch { /* a helyet közben más foglalta: az ő zárja él */ }
            unlinkSync(grabbed);
          } else {
            unlinkSync(grabbed);
            const why = live ? `${maxAgeMs} ms-os felső korlát fölött, a PID ${pid} él (PID-újrahasznosítás / beragadt idegen folyamat)` : `${staleMs} ms-nál régebbi, PID ${Number.isNaN(pid) ? '?' : pid} nem él`;
            appendFileSync(join(dir, REPAIR_LOG), `${new Date().toISOString()} elárvult zár törölve (${why})\n`);
            continue;
          }
        }
      } catch { /* közben eltűnt / átnevezték: újra */ }
      if (now() - t0 > timeoutMs) throw new Error(`a lánc zárja ${timeoutMs} ms után sem szabadult fel (${lock})`);
      sleep(5 + Math.floor(Math.random() * 20));
    }
  }
  // Egyedi zár-token (PID + véletlen): a `finally` csak a SAJÁT zárát törli (P2-K5), egy közben átvett idegen zárat nem.
  const token = `${process.pid} ${randomBytes(6).toString('hex')}\n`;
  try {
    writeSync(fd, token);
    return fn();
  } finally {
    try { closeSync(fd); } catch { /* már zárva */ }
    try { if (readFileSync(lock, 'utf8') === token) unlinkSync(lock); } catch { /* már nincs: nincs mit törölni */ }
  }
}

function chainLines(dir) {
  const p = join(dir, CHAIN_FILE);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8').split('\n').filter((l) => l.trim());
}

/**
 * A lánc utolsó nem üres sora a fájl VÉGÉRŐL olvasva (P2: a zár alatti hozzáfűzés ne olvassa be a teljes, folyton növő láncot —
 * terhelt gépen a teljes beolvasás a zártartást és a várakozók kiéheztetését növelte). @returns {string|null}
 */
export function lastChainLine(dir) {
  const p = join(dir, CHAIN_FILE);
  if (!existsSync(p)) return null;
  const fd = openSync(p, 'r');
  try {
    const size = fstatSync(fd).size;
    let pos = size;
    let buf = Buffer.alloc(0);
    while (pos > 0) {
      const n = Math.min(65_536, pos);
      pos -= n;
      const chunk = Buffer.alloc(n);
      readSync(fd, chunk, 0, n, pos);
      buf = Buffer.concat([chunk, buf]);
      const lines = buf.toString('utf8').split('\n').filter((l) => l.trim());
      // a teljes utolsó sor akkor biztos, ha előtte már van sortörés (vagy a fájl elejéig olvastunk)
      if (lines.length >= 2 || (pos === 0 && lines.length)) return lines[lines.length - 1];
    }
    return null;
  } finally {
    closeSync(fd);
  }
}

function linkUnlocked(dir, name, extra = {}, text = readFileSync(join(dir, `${name}.json`), 'utf8')) {
  let head = null;
  try { head = JSON.parse(text).head ?? null; } catch { /* nem JSON: a hash így is köt */ }
  const last = lastChainLine(dir);
  const prev = last != null ? sha256(last) : null;
  const entry = { name, head, sha256: sha256(text), prev, at: new Date().toISOString(), ...extra };
  appendFileSync(join(dir, CHAIN_FILE), `${JSON.stringify(entry)}\n`);
  return entry;
}

/** Egy már kiírt rekordfájl (`<name>.json`) láncba kötése (zárral). */
export function linkRecord(dir, name, opts) {
  if (!validId(name)) throw new Error(`érvénytelen bizonyíték-azonosító: ${name}`);
  return withLock(dir, () => linkUnlocked(dir, name), opts);
}

/**
 * Rekord kiírása ÉS láncba kötése, egy zár alatt. A rekord ideiglenes néven íródik, a lánc-sor a tartalmára köt, és csak ezután kapja
 * meg a végleges nevét (vak review P2-K4): ha a folyamat bármikor leáll, láncon kívüli végleges rekord (pl. láncolatlan zöld) nem marad.
 */
export function appendRecord(dir, name, rec, opts) {
  if (!validId(name)) throw new Error(`érvénytelen bizonyíték-azonosító: ${name}`);
  mkdirSync(dir, { recursive: true });
  return withLock(dir, () => {
    const text = `${JSON.stringify(rec, null, 2)}\n`;
    const tmp = join(dir, `${name}.json.tmp-${process.pid}`);
    writeFileSync(tmp, text);
    try {
      const entry = linkUnlocked(dir, name, {}, text);
      renameSync(tmp, join(dir, `${name}.json`));
      return entry;
    } finally {
      try { if (existsSync(tmp)) unlinkSync(tmp); } catch { /* a takarítás hibája nem dönt: a végleges rekord a lánc szerint ellenőrzött */ }
    }
  }, opts);
}

/** Azok a rekord-fajták, amelyeket a láncba író kapuk (P2) írnak — a láncon kívüli ilyen rekord gyanús (P2-K1). */
export const CHAINED_PREFIXES = Object.freeze(['stage-', 'pre-push-', 'run-']);

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
export function verifyChain(dir, names = null, { prefixes = CHAINED_PREFIXES } = {}) {
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
  // (3) P2-K1: a láncba író kapuk (CHAINED_PREFIXES) rekordjai közül a láncon kívüliek. Hiányzó láncnál minden ilyen rekord
  // probléma (törölt lánc); meglévő láncnál csak a lánc indulása UTÁN írtak — a korábbiak a lánc bevezetése előtti, régi rekordok.
  const legacy = [];
  if (!names) {
    let since = null;
    try { since = lines.length ? Date.parse(JSON.parse(lines[0]).at) : null; } catch { since = null; }
    for (const f of existsSync(dir) ? readdirSync(dir) : []) {
      if (!f.endsWith('.json')) continue;
      const name = f.slice(0, -5);
      if (!validId(name) || !prefixes.some((x) => name.startsWith(x)) || last.has(name)) continue;
      if (!exists) { problems.push(`${name}: láncba író kapu rekordja, de a lánc (${CHAIN_FILE}) hiányzik — törölt lánc?`); continue; }
      if (since != null && statSync(join(dir, f)).mtimeMs < since) legacy.push(name);
      else problems.push(`${name}: láncon kívüli rekord (kézzel írt / átnevezett?) — a láncba író kapu rekordja a lánc indulása után`);
    }
  }
  return { ok: problems.length === 0, exists, problems, breaks, last, legacy };
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
  // P2-K3: a `--repair` által újra-láncolt rekord NEM igazolt bizonyíték — külön állapot, a hívók nem fogadhatják el zöldnek.
  if (e.repair) return { status: 'repaired-unverified', breaks: v.breaks.length, repaired: true };
  return { status: 'ok', breaks: v.breaks.length, repaired: false };
}

/**
 * Javítás: a (törött) láncot `chain.broken-<időbélyeg>.jsonl` néven ARCHIVÁLJA (nem törli, nem simítja), és új láncot indít, amely a
 * tárban most lévő rekordokat újra-láncolja `repair: true` jelöléssel; minden lépés a `chain-repair.log`-ba kerül. Az újra-láncolt
 * rekordot az ellenőrző „javítás után” megjegyzéssel fogadja el.
 */
export function repairChain(dir, { now = () => new Date(), force = false } = {}) {
  // P2-K3: ép láncon a javítás nem fut (különben minden kézi rekordot újra-láncolna), csak kifejezett `force`-szal.
  if (!force) {
    const v = verifyChain(dir);
    if (v.exists && v.ok) return { archived: null, relinked: 0, skipped: 'a lánc ép — javítás nem kell (kényszerítés: --force)' };
  }
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
    let r;
    try { r = repairChain(ctx.evDir, { force: args.includes('--force') }); } catch (e) {
      // F2: nem kezeletlen kivétel — érthető hiba és teendő, 2-es kód
      process.stderr.write(`[evidence-chain] NEM FUTOTT: a javítás nem sikerült (${String(e?.message ?? e).split('\n')[0]}). Teendő: néhány másodperc múlva futtasd újra; ha a zár 40 s-nál öregebb, a következő futás magától átveszi (napló: ${join(ctx.evDir, REPAIR_LOG)}).\n`);
      process.exit(2);
    }
    if (r.skipped) { process.stdout.write(`[evidence-chain] ${r.skipped}\n`); process.exit(0); }
    process.stdout.write(`[evidence-chain] javítva: ${r.archived ? `a régi lánc archiválva (${r.archived})` : 'nem volt lánc'}; ${r.relinked} rekord újra-láncolva — ezek NEM igazolt bizonyítékok (repaired-unverified): futtasd újra a kapukat\n`);
    process.exit(0);
  }
  const v = verifyChain(ctx.evDir);
  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ schema: 'websuli-check/1', tool: 'evidence-chain', head: null, ok: v.ok, exitCode: v.ok ? 0 : 1, counts: { problems: v.problems.length, breaks: v.breaks.length, records: v.last.size }, items: v.problems.map((p) => ({ id: p.split(':')[0], status: 'FAIL', ref: CHAIN_FILE, detail: p })) })}\n`);
  } else {
    process.stdout.write(`[evidence-chain] ${v.ok ? 'ÉP' : 'TÖRÖTT'}: ${v.last.size} rekord, ${v.breaks.length} törés, ${v.problems.length} probléma${v.legacy.length ? `; ${v.legacy.length} régi (a lánc előtti) láncon kívüli rekord` : ''}${v.ok ? '' : ' — javítás: node scripts/qa/gates/evidence-chain.mjs --repair'}\n`);
    for (const p of v.problems.slice(0, 40)) process.stdout.write(`    | ${p}\n`);
  }
  process.exit(v.ok ? 0 : 1);
}

if (isMain(import.meta.url)) main();
