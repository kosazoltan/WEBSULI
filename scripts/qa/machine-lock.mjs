#!/usr/bin/env node
// Gépi zár: a nehéz körök (npm ci, teljes npm test, böngészős / e2e kör, DB-tesztek, gate:push, gate:pr, mutációs és
// CPU-terheléses próbák) EGY sávban, érkezési sorrendben (FIFO) futnak — docs/specs/2026-11-19-gepi-zar.md, tulajdonosi utasítás
// 2026-11-19. A zárat CSAK a `run` szerzi meg, és AZONNAL lefuttatja a parancsot a saját gyerekeként; a végén — hiba, időtúllépés,
// Ctrl+C / SIGTERM esetén is — elengedi. Folyamatot csak a saját gyerekét állítja le, pontos PID alapján.
// Hely: <git-common-dir>/websuli-machine-lock/ (WEBSULI_MACHINE_LOCK_DIR felülírja); CI-ben (CI igaz) átenged. Minden időbélyeg UTC.
// Függőség nélküli Node ESM; Windows (x64, ARM64) és Linux.
//
// Használat:
//   node scripts/qa/machine-lock.mjs run --name <név> --timeout-min <perc> [--max-wait-min <perc>] -- <parancs> [arg…]
//   node scripts/qa/machine-lock.mjs status [--json]
// Kilépési kód: a parancsé; 124 időtúllépés; 130 / 143 megszakítás; 75 a várakozási korlát lejárt (a parancs nem futott);
// 127 a parancs nem indítható; 2 használati hiba.

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  appendFileSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import { constants as osConstants, hostname } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redact } from './gates/lib.mjs';

export const SCRIPT = fileURLToPath(import.meta.url);
export const HELD_ENV = 'WEBSULI_MACHINE_LOCK_HELD';
export const DIR_ENV = 'WEBSULI_MACHINE_LOCK_DIR';
const IS_WIN = process.platform === 'win32';
const ENTRY_STALE_MS = 5 * 60_000;
const OWNERLESS_STALE_MS = 60_000;
const UNREADABLE_ENTRY_MS = 30_000;
const MUTEX_STALE_MS = 60_000;
const KILL_GRACE_MS = 10_000;
/** A repó eldobható Postgres-konténerei (source/scripts/run-e2e-tests.ts:14, run-learning-db-tests.ts:10). */
const OWN_CONTAINER_RE = /^websuli-(?:e2e|learning-test)-/;
const NOTE_EVERY_MS = 60_000;
const SIGNAL_CODES = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129, SIGBREAK: 149 };

export const nowUtc = (ms = Date.now()) => new Date(ms).toISOString();
const minutes = (ms) => (ms / 60_000).toFixed(1);

// ---- Tiszta döntések ---------------------------------------------------------------------------------------------------

export function isCiEnv(env = process.env) {
  const v = String(env.CI ?? '').trim().toLowerCase();
  return v !== '' && v !== 'false' && v !== '0';
}

function defaultGitCommonDir(cwd) {
  try {
    return execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, windowsHide: true }).trim() || null;
  } catch {
    return null;
  }
}

/** A zár-mappa: a változó, különben a közös git-könyvtár (a szkript saját repójáé, munkafától függetlenül). */
export function resolveLockDir({ env = process.env, cwd = process.cwd(), gitCwd = dirname(SCRIPT), gitCommonDir = defaultGitCommonDir } = {}) {
  if (env[DIR_ENV]) return resolve(cwd, env[DIR_ENV]);
  const common = gitCommonDir(gitCwd);
  if (!common) return null;
  return join(isAbsolute(common) ? common : resolve(gitCwd, common), 'websuli-machine-lock');
}

export function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

/** Elavult-e a zár (D5): halott gazda + gyerek ugyanazon a gépen, lejárt időkorlát + türelmi idő, vagy 60 s után sincs gazda-fájl. */
export function isStaleOwner({ owner, nowMs, host = hostname(), alive = pidAlive, graceMin = 10, lockAgeMs = 0 }) {
  const started = Date.parse(owner?.startedUtc ?? '');
  const timeoutMin = Number(owner?.timeoutMin);
  if (!owner || !Number.isFinite(started) || !Number.isFinite(timeoutMin)) {
    return lockAgeMs > OWNERLESS_STALE_MS ? { stale: true, reason: 'a zár-mappában 60 s után sincs érvényes gazda-fájl' } : { stale: false };
  }
  if (nowMs - started > (timeoutMin + graceMin) * 60_000) {
    return { stale: true, reason: `lejárt: időkorlát ${timeoutMin} perc + türelmi idő ${graceMin} perc` };
  }
  if (owner.host === host && !alive(owner.pid) && !alive(owner.childPid)) {
    return { stale: true, reason: `a gazda (PID ${owner.pid}) és a gyereke (PID ${owner.childPid ?? '-'}) nem él` };
  }
  return { stale: false };
}

/** Elavult-e egy sorbejegyzés (D6): halott PID ugyanazon a gépen, vagy 5 percnél régebbi életjel. */
export function isStaleEntry({ entry, nowMs, host = hostname(), alive = pidAlive }) {
  if (entry.host === host && !alive(entry.pid)) return true;
  const hb = Date.parse(entry.heartbeatUtc ?? entry.joinedUtc ?? '');
  return !Number.isFinite(hb) || nowMs - hb > ENTRY_STALE_MS;
}

/** A token SHA-256 lenyomata: a gazda-fájlba csak ez kerül (L4) — a nyers tokent csak a gyerek környezete kapja. */
export const hashToken = (token) => createHash('sha256').update(String(token)).digest('hex');

/** Újrabelépés (D7): csak a jelenlegi, élő, nem lejárt gazda tokenjével (a gazda-fájlban a lenyomata áll). */
export function decideReentry({ heldToken, owner, host = hostname(), alive = pidAlive, nowMs = Date.now(), graceMin = 10 }) {
  if (!heldToken) return { reenter: false, why: 'nincs token' };
  if (!owner) return { reenter: false, why: 'a zár szabad' };
  if (!owner.tokenHash || owner.tokenHash !== hashToken(heldToken)) return { reenter: false, why: `a zár gazdája „${owner.name}”` };
  if (owner.host === host && !alive(owner.pid)) return { reenter: false, why: 'a gazda nem él' };
  const started = Date.parse(owner.startedUtc ?? '');
  if (!Number.isFinite(started) || nowMs - started > (Number(owner.timeoutMin) + graceMin) * 60_000) return { reenter: false, why: 'a gazda lejárt' };
  return { reenter: true };
}

// ---- Fájlműveletek -------------------------------------------------------------------------------------------------------

const paths = (dir) => ({
  lock: join(dir, 'lock'),
  owner: join(dir, 'lock', 'owner.json'),
  queue: join(dir, 'queue'),
  mutex: join(dir, 'state.mutex'),
  counter: join(dir, 'counter'),
  events: join(dir, 'events.log'),
});
const ticketFile = (dir, n) => join(dir, 'queue', `${String(n).padStart(12, '0')}.json`);

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function readJson(file, tries = 5) {
  let code = null;
  for (let i = 0; i < tries; i += 1) {
    try {
      return { value: JSON.parse(readFileSync(file, 'utf8')), code: null };
    } catch (e) {
      code = e.code ?? 'PARSE';
      if (code === 'ENOENT') break;
      sleepSync(20);
    }
  }
  return { value: null, code };
}

function writeJsonAtomic(file, obj) {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`);
  for (let i = 0; ; i += 1) {
    try {
      renameSync(tmp, file);
      return;
    } catch (e) {
      if (i >= 50 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) {
        rmSync(tmp, { force: true });
        throw e;
      }
      sleepSync(20);
    }
  }
}

function appendEvent(dir, text) {
  try {
    appendFileSync(paths(dir).events, `${nowUtc()} ${text}\n`);
  } catch { /* a napló hiánya nem állíthatja meg a futást (a kimenetben úgyis megjelenik) */ }
}

/**
 * Az állapot-mutex (L1): a sorba állás, a zár megszerzése, visszavétele, a gazda-fájl frissítése és az elengedés UGYANEZ alatt
 * dönt és cselekszik — a „tokent olvas, majd átnevez” lépéspár így nem fedhet át egy másik gazdaváltással. A gazdája
 * `holder.json`-t ír; elavult, ha ugyanazon a gépen a PID nem él, vagy 60 s-nál régebbi. Az elavult mutex eltávolítása átnevezéssel
 * és visszaellenőrzéssel történik.
 */
function withMutex(dir, fn) {
  const { mutex } = paths(dir);
  const holderFile = join(mutex, 'holder.json');
  const me = { pid: process.pid, host: hostname(), id: randomBytes(6).toString('hex') };
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      mkdirSync(mutex);
      writeFileSync(holderFile, JSON.stringify({ ...me, atUtc: nowUtc() }));
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const h = readJson(holderFile, 1).value;
      let age = 0;
      try { age = Date.now() - statSync(mutex).mtimeMs; } catch { continue; }
      const deadHolder = h && h.host === me.host && !pidAlive(h.pid);
      if (deadHolder || age > MUTEX_STALE_MS) {
        const aside = `${mutex}.stale-${process.pid}-${randomBytes(3).toString('hex')}`;
        try { renameSync(mutex, aside); } catch { continue; }
        const moved = readJson(join(aside, 'holder.json'), 1).value;
        if ((moved?.id ?? null) !== (h?.id ?? null)) {
          try { renameSync(aside, mutex); } catch { /* közben új mutex keletkezett — a félretettet hagyjuk */ }
          continue;
        }
        rmSync(aside, { recursive: true, force: true });
        appendEvent(dir, `allapot-mutex elavult (${deadHolder ? `a gazda PID ${h.pid} nem él` : `${Math.round(age / 1000)} s`}), eltávolítva`);
        continue;
      }
      if (Date.now() > deadline) throw new Error('az állapot-mutex 30 s alatt sem szabadult fel');
      sleepSync(5 + Math.floor(Math.random() * 20));
    }
  }
  try {
    return fn();
  } finally {
    if (readJson(holderFile, 1).value?.id === me.id) rmSync(mutex, { recursive: true, force: true });
  }
}

function listEntries(dir) {
  let names = [];
  try { names = readdirSync(paths(dir).queue); } catch { return []; }
  return names.filter((f) => /^\d{12}\.json$/.test(f)).sort().map((f) => {
    const file = join(paths(dir).queue, f);
    let mtimeMs = Date.now();
    try { mtimeMs = statSync(file).mtimeMs; } catch { /* közben törölték */ }
    return { ticket: Number(f.slice(0, 12)), file, entry: readJson(file, 2).value, mtimeMs };
  });
}

/** Atomi beállás a sorba (D1): a mutex alatt a számláló + 1, `wx` jelzővel írt bejegyzés. */
function joinQueue(dir, info) {
  mkdirSync(paths(dir).queue, { recursive: true });
  return withMutex(dir, () => {
    let fromCounter = 0;
    try { fromCounter = Number(readFileSync(paths(dir).counter, 'utf8')) || 0; } catch { /* első belépés */ }
    let n = Math.max(fromCounter, 0, ...listEntries(dir).map((e) => e.ticket)) + 1;
    for (;;) {
      try {
        writeFileSync(ticketFile(dir, n), `${JSON.stringify({ ...info, ticket: n }, null, 2)}\n`, { flag: 'wx' });
        break;
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        n += 1;
      }
    }
    writeFileSync(paths(dir).counter, String(n));
    return n;
  });
}

function removeEntry(dir, ticket) {
  rmSync(ticketFile(dir, ticket), { force: true });
}

function lockAge(dir) {
  try { return Date.now() - statSync(paths(dir).lock).mtimeMs; } catch { return null; }
}

function renameRetry(from, to, tries = 25) {
  for (let i = 0; ; i += 1) {
    try {
      renameSync(from, to);
      return true;
    } catch (e) {
      if (i >= tries || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) return false;
      sleepSync(20);
    }
  }
}

/** A félretett (már nem `lock/` nevű) mappa takarítása a mutexen KÍVÜL; hibája soha nem érinti a közös `lock/`-ot. */
function removeAside(dir) {
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); } catch { /* szemét marad, a zárat nem érinti */ }
}

/**
 * Megszerzés vagy elavult zár visszavétele (D5, L1) — egyetlen mutex-szakaszban: ha nincs zár, létrehozza; ha elavult, félreteszi és
 * létrehozza a sajátját. Élő folyamatot nem öl meg. @returns {{ acquired: boolean, aside?: string, reclaimed?: string }}
 */
function acquireOrReclaim(dir, owner, { host, graceMin }) {
  const p = paths(dir);
  return withMutex(dir, () => {
    let reclaimed = null;
    let aside = null;
    const age = lockAge(dir);
    if (age != null) {
      const r = readJson(p.owner);
      if (r.code && r.code !== 'ENOENT' && r.code !== 'PARSE') return { acquired: false };
      const v = isStaleOwner({ owner: r.value, nowMs: Date.now(), host, alive: pidAlive, graceMin, lockAgeMs: age });
      if (!v.stale) return { acquired: false };
      aside = join(dir, `stale-${nowUtc().replace(/[:.]/g, '-')}-${process.pid}`);
      if (!renameRetry(p.lock, aside)) return { acquired: false };
      reclaimed = `visszaveve: name=${r.value?.name ?? '?'} pid=${r.value?.pid ?? '?'} ok: ${v.reason}`;
      appendEvent(dir, reclaimed);
    }
    try {
      mkdirSync(p.lock);
    } catch (e) {
      if (e.code === 'EEXIST') return { acquired: false, aside, reclaimed };
      throw e;
    }
    try {
      writeJsonAtomic(p.owner, owner);
    } catch (e) {
      rmSync(p.lock, { recursive: true, force: true });
      throw e;
    }
    return { acquired: true, aside, reclaimed };
  });
}

/** A gazda-fájl frissítése (pl. gyerek PID) csak a mutex alatt és csak a saját token-lenyomattal (L1). */
function updateOwner(dir, tokenHash, patch) {
  const p = paths(dir);
  return withMutex(dir, () => {
    const cur = readJson(p.owner).value;
    if (!cur || cur.tokenHash !== tokenHash) return false;
    writeJsonAtomic(p.owner, { ...cur, ...patch });
    return true;
  });
}

/**
 * Elengedés (L1): a mutex alatt a token-lenyomat ellenőrzése és a `lock/` félretétele egy lépésben; ha a zár már másé, nem nyúl
 * hozzá; ha az átnevezés nem sikerül, a zárat NEM törli (elavultként a következő `run` veszi vissza).
 */
export function releaseLock(dir, token, say = () => {}) {
  const p = paths(dir);
  const tokenHash = hashToken(token);
  const res = withMutex(dir, () => {
    const cur = readJson(p.owner).value;
    if (!cur || cur.tokenHash !== tokenHash) return { ok: false, why: 'foreign' };
    const aside = join(dir, `released-${process.pid}-${randomBytes(3).toString('hex')}`);
    if (!renameRetry(p.lock, aside)) return { ok: false, why: 'rename', cur };
    return { ok: true, aside, cur };
  });
  if (res.ok) {
    removeAside(res.aside);
    appendEvent(dir, `elengedve: name=${res.cur.name} pid=${res.cur.pid}`);
  } else if (res.why === 'foreign') {
    appendEvent(dir, 'elengedes-kihagyva: a zár már nem ennek a futásnak a tokenjét viseli');
    say('FIGYELEM: a zár közben gazdát cserélt — nem nyúlok hozzá');
  } else {
    appendEvent(dir, `elengedes-sikertelen: name=${res.cur.name} — a lock/ nem nevezhető át; elavultként veszik vissza`);
    say('FIGYELEM: a zár nem engedhető el (átnevezési hiba) — a következő run elavultként veszi vissza');
  }
  return res.ok;
}

// ---- Állapot -----------------------------------------------------------------------------------------------------------

export function readStatus(dir, { nowMs = Date.now(), host = hostname(), alive = pidAlive, graceMin = graceFromEnv() } = {}) {
  const p = paths(dir);
  const raw = readJson(p.owner).value;
  const age = lockAge(dir);
  const verdict = age == null ? { stale: false } : isStaleOwner({ owner: raw, nowMs, host, alive, graceMin, lockAgeMs: age });
  const ownerAlive = raw ? (raw.host === host ? alive(raw.pid) || alive(raw.childPid) : null) : false;
  const sinceMin = (iso) => (Number.isFinite(Date.parse(iso ?? '')) ? Math.round((nowMs - Date.parse(iso)) / 600) / 100 : null);
  // Engedélylistás alak (L4): a token / lenyomat soha nem kerül a kimenetbe; L7: számolt idők ugyanabból a pillanatból.
  const owner = raw ? {
    name: raw.name, pid: raw.pid, childPid: raw.childPid ?? null, host: raw.host, cwd: raw.cwd, command: raw.command,
    startedUtc: raw.startedUtc, timeoutMin: raw.timeoutMin, ticket: raw.ticket, ranMinutes: sinceMin(raw.startedUtc),
  } : null;
  const entries = listEntries(dir).map(({ ticket, entry }) => ({
    ticket,
    name: entry?.name ?? null, pid: entry?.pid ?? null, host: entry?.host ?? null, cwd: entry?.cwd ?? null, command: entry?.command ?? null,
    joinedUtc: entry?.joinedUtc ?? null, heartbeatUtc: entry?.heartbeatUtc ?? null, waitedMinutes: sinceMin(entry?.joinedUtc),
    alive: entry ? (entry.host === host ? alive(entry.pid) : null) : null,
    stale: entry ? isStaleEntry({ entry, nowMs, host, alive }) : null,
  }));
  return { dir, nowUtc: nowUtc(nowMs), locked: age != null, owner, ownerAlive, ownerStale: verdict.stale, staleReason: verdict.reason ?? null, entries };
}

export function formatStatus(st, nowMs = Date.now()) {
  const out = [`[machine-lock] zár-mappa: ${st.dir}`];
  if (!st.locked) out.push('[machine-lock] a zár szabad');
  else if (!st.owner) out.push(`[machine-lock] a zár foglalt, gazda-fájl nélkül${st.ownerStale ? ' — ELAVULT' : ''}`);
  else {
    const o = st.owner;
    const ran = o.ranMinutes ?? minutes(nowMs - Date.parse(o.startedUtc));
    out.push(`[machine-lock] gazda: ${o.name} (PID ${o.pid}, gyerek ${o.childPid ?? '-'}, ${st.ownerAlive === null ? 'más gépen' : st.ownerAlive ? 'él' : 'NEM ÉL'}) gép: ${o.host}`);
    out.push(`  ${ran} perce fut — kezdés ${o.startedUtc}, időkorlát ${o.timeoutMin} perc${st.ownerStale ? ` — ELAVULT (${st.staleReason})` : ''}`);
    out.push(`  parancs: ${o.command ?? '?'}`);
  }
  out.push(`[machine-lock] sor: ${st.entries.length} várakozó`);
  for (const e of st.entries) {
    const waited = Number.isFinite(Date.parse(e.joinedUtc ?? '')) ? minutes(nowMs - Date.parse(e.joinedUtc)) : '?';
    out.push(`  #${e.ticket} ${e.name ?? '?'} PID ${e.pid ?? '?'} — belépett ${e.joinedUtc ?? '?'} (${waited} perce vár)${e.alive === false ? ' — NEM ÉL' : ''}${e.stale ? ' — ELAVULT' : ''}`);
  }
  return out.join('\n');
}

function graceFromEnv(env = process.env) {
  const raw = env.WEBSULI_MACHINE_LOCK_GRACE_MIN;
  if (raw === undefined || raw === '') return 10;
  const g = Number(raw);
  return Number.isFinite(g) && g >= 0 ? g : 10;
}

// ---- Gyerekfolyamat ------------------------------------------------------------------------------------------------------

const quoteWin = (a) => (a === '' || /[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a);

/** Windows-on az npm / npx / .cmd / .bat a héjon át, saját idézéssel (D11); minden más héj nélkül. */
function spawnSpec(cmd, args) {
  if (IS_WIN && (/^(npm|npx|pnpm|yarn)$/i.test(cmd) || /\.(cmd|bat)$/i.test(cmd))) {
    const file = /\.(cmd|bat)$/i.test(cmd) ? cmd : `${cmd}.cmd`;
    return { file: [file, ...args].map(quoteWin).join(' '), args: [], shell: true };
  }
  return { file: cmd, args, shell: false };
}

/** POSIX: él-e még valaki a saját gyerek folyamatcsoportjában (a gyerek a csoport vezetője, `detached`). */
function groupAlive(pgid) {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

async function waitUntil(pred, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return pred();
}

/**
 * Csak a saját gyerek (és annak fája) állítható le, pontos PID alapján (D4). Windows: `taskkill /PID <gyerek> /T /F` (szinkron, a
 * teljes fa); POSIX: SIGTERM a saját folyamatcsoportnak — az eszkalációt a `reapGroup` végzi, MIELŐTT a zár felszabadul (L2).
 */
function stopTree(child, say) {
  const pid = child?.pid;
  if (!pid) return;
  if (IS_WIN) {
    const r = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    if (r.status !== 0 && child.exitCode === null) say(`FIGYELEM: a taskkill kilépési kódja ${r.status} — a gyerek (PID ${pid}) állapota bizonytalan`);
    return;
  }
  try { process.kill(-pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch { /* már kilépett */ } }
}

/**
 * POSIX (L2): a gyerek kilépése után a zár csak akkor szabadul fel, ha a saját csoportja (az újrabelépő gyerekekkel együtt, mert
 * azok nem kapnak új csoportot) üres: SIGTERM → türelmi idő → SIGKILL → legfeljebb 5 s. Windows-on a rendes kilépés után
 * leválasztott unokák nem követhetők (ismert korlát; az időtúllépés / megszakítás a teljes fát leállítja).
 */
async function reapGroup(pgid, { graceMs, say }) {
  if (IS_WIN || !pgid || !groupAlive(pgid)) return;
  say(`a saját folyamatcsoport (PGID ${pgid}) még él — leállítás, mielőtt a zár felszabadul`);
  try { process.kill(-pgid, 'SIGTERM'); } catch { /* közben kiürült */ }
  if (await waitUntil(() => !groupAlive(pgid), graceMs)) return;
  try { process.kill(-pgid, 'SIGKILL'); } catch { /* közben kiürült */ }
  if (await waitUntil(() => !groupAlive(pgid), 5000)) return;
  say(`FIGYELEM: a folyamatcsoport (PGID ${pgid}) SIGKILL után sem üres (zombi?) — a zár felszabadul`);
}

/** L3: a futás ALATT keletkezett saját eldobható konténer(ek) leállítása kényszerleállítás után; a korábbiakat nem érinti. */
export function cleanupNewContainers({ before, after, stop, say }) {
  if (!before || !after) return [];
  const had = new Set(before.map((c) => c.id));
  const fresh = after.filter((c) => !had.has(c.id) && OWN_CONTAINER_RE.test(c.name));
  for (const c of fresh) say(`a kényszerleállított futás eldobható konténere leállítva: ${c.name} (${stop(c.id) ? 'kész' : 'SIKERTELEN'})`);
  return fresh.map((c) => c.id);
}

function realDocker() {
  return {
    ps: () => {
      const r = spawnSync('docker', ['ps', '--format', '{{.ID}} {{.Names}}'], { encoding: 'utf8', timeout: 15_000, windowsHide: true });
      if (r.status !== 0) return null;
      return r.stdout.split(/\r?\n/).filter(Boolean).map((l) => { const [id, name] = l.trim().split(/\s+/); return { id, name }; });
    },
    stop: (id) => spawnSync('docker', ['stop', '--time', '5', id], { stdio: 'ignore', timeout: 60_000, windowsHide: true }).status === 0,
  };
}

const abortCode = (reason) => SIGNAL_CODES[reason] ?? 130;

/**
 * A gyerek futtatása; a visszatérés (és így az elengedés) csak a saját folyamatfa leállása (POSIX: üres csoport) és kényszerleállításnál
 * a saját új konténerek takarítása UTÁN történik. `ownGroup`: a gyerek saját csoportot kap (a zár gazdája / CI); újrabelépésnél nem
 * — az a szülő felügyelt határán belül marad (L2).
 */
async function superviseChild({ command, env, cwd, timeoutMs, signal, say, state, stdio, onSpawn, ownGroup = true, graceMs = KILL_GRACE_MS, docker = null }) {
  const [cmd, ...args] = command;
  const spec = spawnSpec(cmd, args);
  const before = docker ? docker.ps() : null;
  let forced = false;
  const code = await new Promise((done) => {
    let child;
    try {
      child = spawn(spec.file, spec.args, { cwd, env, stdio, windowsHide: true, shell: spec.shell, detached: ownGroup && !IS_WIN });
    } catch (e) {
      say(`a parancs nem indítható: ${e.message}`);
      done(127);
      return;
    }
    state.child = child;
    let timedOut = false;
    let abortedBy = null;
    let settled = false;
    let escalate = null;
    const force = () => {
      forced = true;
      stopTree(child, say);
      if (!IS_WIN && !escalate) {
        escalate = setTimeout(() => { try { process.kill(ownGroup ? -child.pid : child.pid, 'SIGKILL'); } catch { /* már kilépett */ } }, graceMs);
      }
    };
    const finish = (c) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(escalate);
      signal?.removeEventListener('abort', onAbort);
      done(c);
    };
    const onAbort = () => {
      abortedBy = abortCode(signal.reason);
      say(`megszakítás (${signal.reason}) — a saját gyerek (PID ${child.pid}) leállítása`);
      force();
    };
    const timer = setTimeout(() => {
      timedOut = true;
      say(`IDŐTÚLLÉPÉS (${minutes(timeoutMs)} perc) — a saját gyerek (PID ${child.pid}) leállítása`);
      force();
    }, timeoutMs);
    child.once('error', (e) => {
      state.childExited = true;
      say(`a parancs nem indítható: ${e.message}`);
      finish(127);
    });
    child.once('exit', (c, sig) => {
      state.childExited = true;
      if (timedOut) finish(124);
      else if (abortedBy) finish(abortedBy);
      else finish(c ?? (sig ? 128 + (osConstants.signals[sig] ?? 0) : 1));
    });
    if (child.pid) onSpawn?.(child.pid);
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
  });
  if (ownGroup && state.child?.pid) await reapGroup(state.child.pid, { graceMs, say });
  if (forced && docker) cleanupNewContainers({ before, after: docker.ps(), stop: docker.stop, say });
  return code;
}

function sleepAbortable(ms, signal) {
  return new Promise((done) => {
    const t = setTimeout(finish, ms);
    function finish() {
      clearTimeout(t);
      signal?.removeEventListener('abort', finish);
      done();
    }
    signal?.addEventListener('abort', finish, { once: true });
  });
}

// ---- A futtató -----------------------------------------------------------------------------------------------------------

/**
 * Sorba áll, VÁR, amíg ő az első élő a sorban ÉS a zár szabad, megszerzi, AZONNAL futtat, a végén elenged.
 * @returns {Promise<number>} kilépési kód
 */
export async function run({
  name, timeoutMin, maxWaitMin = 0, command, env = process.env, cwd = process.cwd(), lockDir, pollMs, graceMin,
  signal, log = (s) => process.stderr.write(`${s}\n`), host = hostname(), stdio = 'inherit', docker,
}) {
  const say = (s) => log(`[machine-lock] ${nowUtc()} ${s}`);
  const timeoutMs = timeoutMin * 60_000;
  const poll = pollMs ?? (Number(env.WEBSULI_MACHINE_LOCK_POLL_MS) || 2000);
  const grace = graceMin ?? graceFromEnv(env);
  const graceMs = Number(env.WEBSULI_MACHINE_LOCK_KILL_GRACE_MS) > 0 ? Number(env.WEBSULI_MACHINE_LOCK_KILL_GRACE_MS) : KILL_GRACE_MS;
  const dock = docker !== undefined ? docker : (env.WEBSULI_MACHINE_LOCK_DOCKER_CLEANUP === '0' ? null : realDocker());
  const display = redact(command.map((a) => quoteWin(String(a))).join(' ')).slice(0, 500);
  const state = { ticket: null, token: null, holding: false, child: null, childExited: false };
  const sup = (extra) => superviseChild({ command, env, cwd, timeoutMs, signal, say, state, stdio, graceMs, docker: dock, ...extra });

  if (isCiEnv(env)) {
    say(`CI-környezet — a gépi zár kikapcsolva, „${name}” zár nélkül fut`);
    return sup({});
  }
  if (!lockDir) {
    say('HIBA: a zár-mappa nem állapítható meg (nincs git-könyvtár és nincs WEBSULI_MACHINE_LOCK_DIR) — a parancs NEM fut');
    return 2;
  }
  const p = paths(lockDir);
  const held = env[HELD_ENV];
  if (held) {
    const owner = readJson(p.owner).value;
    const d = decideReentry({ heldToken: held, owner, host, graceMin: grace });
    if (d.reenter) {
      say(`újrabelépés: a zárat a szülő („${owner.name}”, PID ${owner.pid}) tartja — „${name}” azonnal fut (a szülő folyamatcsoportjában)`);
      return sup({ ownGroup: false, docker: null });
    }
    say(`FIGYELEM: az örökölt ${HELD_ENV} nem a jelenlegi gazdáé (${d.why}) — rendes sorba állás`);
  }
  try {
    mkdirSync(lockDir, { recursive: true });
  } catch (e) {
    say(`HIBA: a zár-mappa nem hozható létre (${lockDir}): ${e.message}`);
    return 2;
  }

  const cleanupSync = () => {
    if (state.child && !state.childExited) stopTree(state.child, say);
    if (state.ticket) removeEntry(lockDir, state.ticket);
    if (state.holding) releaseLock(lockDir, state.token, say);
    state.ticket = null;
    state.holding = false;
  };
  process.once('exit', cleanupSync);
  try {
    const base = { name, pid: process.pid, host, cwd, command: display, joinedUtc: nowUtc() };
    state.ticket = joinQueue(lockDir, { ...base, heartbeatUtc: base.joinedUtc });
    say(`sorba álltam: #${state.ticket} „${name}” (zár-mappa: ${lockDir})`);
    const t0 = Date.now();
    const maxWaitMs = maxWaitMin * 60_000;
    let lastNote = 0;
    for (;;) {
      if (signal?.aborted) {
        say(`megszakítás várakozás közben (${signal.reason}) — kilépek a sorból, a parancs NEM futott`);
        return abortCode(signal.reason);
      }
      // L5: a határidő a foglalási kísérlet ELŐTT dönt — lejárt várakozás után a parancs nem indulhat el.
      if (maxWaitMs > 0 && Date.now() - t0 >= maxWaitMs) {
        say(`a várakozási korlát (${maxWaitMin} perc) lejárt — kilépek a sorból, a parancs NEM futott`);
        return 75;
      }
      const mine = ticketFile(lockDir, state.ticket);
      const hadEntry = readJson(mine, 1).code !== 'ENOENT';
      writeJsonAtomic(mine, { ...base, ticket: state.ticket, heartbeatUtc: nowUtc() });
      if (!hadEntry) appendEvent(lockDir, `sorbejegyzes-ujrairva: #${state.ticket} name=${name} (a régi eltűnt)`);
      const live = [];
      for (const e of listEntries(lockDir)) {
        if (e.ticket === state.ticket) live.push(e);
        else if (!e.entry) {
          if (Date.now() - e.mtimeMs > UNREADABLE_ENTRY_MS) {
            rmSync(e.file, { force: true });
            appendEvent(lockDir, `sorbejegyzes-olvashatatlan, eltavolitva: #${e.ticket}`);
          } else live.push(e);
        } else if (isStaleEntry({ entry: e.entry, nowMs: Date.now(), host })) {
          rmSync(e.file, { force: true });
          appendEvent(lockDir, `sorbejegyzes-elavult, eltavolitva: #${e.ticket} name=${e.entry.name} pid=${e.entry.pid}`);
        } else live.push(e);
      }
      if (live[0]?.ticket === state.ticket) {
        const token = randomBytes(16).toString('hex');
        const owner = { name, pid: process.pid, childPid: null, host, cwd, command: display, startedUtc: nowUtc(), timeoutMin, tokenHash: hashToken(token), ticket: state.ticket };
        const got = acquireOrReclaim(lockDir, owner, { host, graceMin: grace });
        if (got.aside) removeAside(got.aside);
        if (got.reclaimed) say(`elavult zár ${got.reclaimed}`);
        if (got.acquired) {
          state.token = token;
          state.holding = true;
          removeEntry(lockDir, state.ticket);
          state.ticket = null;
          appendEvent(lockDir, `megszerezve: name=${name} pid=${process.pid}`);
          say(`megszereztem a zárat (${Math.round((Date.now() - t0) / 1000)} s várakozás) — indul: ${display}`);
          const code = await sup({
            env: { ...env, [HELD_ENV]: token },
            onSpawn: (pid) => updateOwner(lockDir, owner.tokenHash, { childPid: pid }),
          });
          releaseLock(lockDir, token, say);
          state.holding = false;
          say(`kész: „${name}” kilépési kód ${code}, ${minutes(Date.now() - Date.parse(owner.startedUtc))} perc; a zár elengedve`);
          return code;
        }
        if (got.reclaimed) continue;
      }
      if (Date.now() - lastNote >= NOTE_EVERY_MS) {
        lastNote = Date.now();
        const o = readJson(p.owner).value;
        const pos = live.findIndex((e) => e.ticket === state.ticket) + 1;
        say(`várok: ${pos}. a sorban (#${state.ticket}); ${o ? `a zár gazdája „${o.name}” (PID ${o.pid}), kezdés ${o.startedUtc}` : 'a zár szabad, előttem más áll'} — állapot: node scripts/qa/machine-lock.mjs status`);
      }
      await sleepAbortable(maxWaitMs > 0 ? Math.max(1, Math.min(poll, maxWaitMs - (Date.now() - t0))) : poll, signal);
    }
  } finally {
    cleanupSync();
    process.removeListener('exit', cleanupSync);
  }
}

/**
 * Egy kapu-szkript önmaga sorba állítása (D13): ha nem CI és nem érvényes újrabelépés, a saját parancssorát a `run` alatt indítja
 * újra, és a gyerek kódjával kilép (`true`); különben `false` — a hívó a saját `main()`-jét futtatja.
 */
export function relaunchUnderMachineLock({
  name, timeoutMin, env = process.env, argv = process.argv, execPath = process.execPath, spawnSyncImpl = spawnSync, exit = process.exit,
}) {
  if (isCiEnv(env)) return false;
  if (env[HELD_ENV]) {
    const dir = resolveLockDir({ env });
    const owner = dir ? readJson(paths(dir).owner).value : null;
    if (decideReentry({ heldToken: env[HELD_ENV], owner, graceMin: graceFromEnv(env) }).reenter) return false;
  }
  const r = spawnSyncImpl(execPath, [SCRIPT, 'run', '--name', name, '--timeout-min', String(timeoutMin), '--', execPath, ...argv.slice(1)], { stdio: 'inherit', env, windowsHide: true });
  exit(r.status ?? (r.signal ? 128 + (osConstants.signals[r.signal] ?? 0) : 1));
  return true;
}

// ---- CLI -----------------------------------------------------------------------------------------------------------------

const USAGE = `Használat:
  node scripts/qa/machine-lock.mjs run --name <név> --timeout-min <perc> [--max-wait-min <perc>] -- <parancs> [arg…]
  node scripts/qa/machine-lock.mjs status [--json]
Részletek: .agents/skills/websuli-gep-zar/SKILL.md, docs/minosegkapuk.md „Gépi zár”.`;

export function parseRunArgs(args) {
  const sep = args.indexOf('--');
  const opts = sep >= 0 ? args.slice(0, sep) : args;
  const command = sep >= 0 ? args.slice(sep + 1) : [];
  const val = (flag) => { const i = opts.indexOf(flag); return i >= 0 ? opts[i + 1] : undefined; };
  const name = val('--name');
  const timeoutMin = Number(val('--timeout-min'));
  const maxWaitMin = val('--max-wait-min') === undefined ? 0 : Number(val('--max-wait-min'));
  const errors = [];
  if (!name || name.startsWith('--')) errors.push('hiányzik a --name');
  if (!(timeoutMin > 0)) errors.push('hiányzik vagy érvénytelen a --timeout-min (pozitív perc)');
  if (!(maxWaitMin >= 0)) errors.push('érvénytelen a --max-wait-min');
  if (!command.length) errors.push('hiányzik a parancs a -- után');
  return { name, timeoutMin, maxWaitMin, command, errors };
}

/** A CLI jelkezelői (L6): SIGINT / SIGTERM / SIGHUP, Windows-on SIGBREAK is → megszakítás a jel nevével. */
export function installSignalHandlers(ac, proc = process, platform = process.platform) {
  for (const s of ['SIGINT', 'SIGTERM', 'SIGHUP', ...(platform === 'win32' ? ['SIGBREAK'] : [])]) proc.on(s, () => ac.abort(s));
}

async function main(argv = process.argv.slice(2)) {
  const [cmd, ...rest] = argv;
  if (cmd === 'status') {
    const dir = resolveLockDir();
    if (!dir) { process.stderr.write('[machine-lock] HIBA: a zár-mappa nem állapítható meg\n'); process.exit(2); }
    const st = readStatus(dir);
    process.stdout.write(rest.includes('--json') ? `${JSON.stringify(st, null, 2)}\n` : `${formatStatus(st)}\n`);
    process.exit(0);
  }
  if (cmd !== 'run') {
    process.stderr.write(`${USAGE}\n`);
    process.exit(2);
  }
  const a = parseRunArgs(rest);
  if (a.errors.length) {
    process.stderr.write(`[machine-lock] HIBA: ${a.errors.join('; ')}\n${USAGE}\n`);
    process.exit(2);
  }
  const ac = new AbortController();
  installSignalHandlers(ac);
  const code = await run({ ...a, lockDir: isCiEnv() ? null : resolveLockDir(), signal: ac.signal });
  process.exit(code);
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT) {
  main().catch((e) => {
    process.stderr.write(`[machine-lock] HIBA: ${e?.stack ?? e}\n`);
    process.exit(2);
  });
}
