// A vak ellenőr „nehéz” futásai: eldobható adatbázis, a repó Playwright-specjei és a saját böngészős forgatókönyv
// (docs/specs/2026-11-18-vak-ellenor-deepseek.md, 4. kiegészítés, E2). Kiindulás: a modell bármit kérhet — a biztonsági feltételeket
// a futtató gépileg kényszeríti ki: valódi e-mail SEMMILYEN úton, csak saját konténer, kimenő hálózat tiltva, idő- és darabplafon.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---- Biztonságos gyerek-környezet ---------------------------------------------------------------------------------------------

/** E-mail-küldő kulcs, más titok vagy adatbázis-URL jellegű változónév — a nehéz futás környezetében egy sem lehet. */
export const HEAVY_ENV_FORBIDDEN = /RESEND|SMTP|SENDGRID|MAILGUN|POSTMARK|MAILJET|SES_|API_KEY|_KEY$|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|DATABASE|_DSN$|_URL$/i;
const DEAD_PROXY = 'http://127.0.0.1:9';
const NO_PROXY = 'localhost,127.0.0.1,::1';

/**
 * A nehéz futás környezete a tiszta környezetből: a Node-folyamatok kimenő forgalma egy halott helyi proxyn át megy (Node 24+:
 * `NODE_USE_ENV_PROXY`), a helyi címek kivételével; a Playwright HTML-jelentése nem nyílik meg.
 */
export function heavyEnv(clean) {
  return {
    ...clean,
    NODE_USE_ENV_PROXY: '1', HTTP_PROXY: DEAD_PROXY, HTTPS_PROXY: DEAD_PROXY, http_proxy: DEAD_PROXY, https_proxy: DEAD_PROXY,
    NO_PROXY, no_proxy: NO_PROXY, PW_TEST_HTML_REPORT_OPEN: 'never',
  };
}

/** A tiltott változók neve (az értékük SOHA nem kerül kimenetbe). Üres tömb = biztonságos. */
export function unsafeHeavyEnvKeys(env) {
  return Object.keys(env).filter((k) => HEAVY_ENV_FORBIDDEN.test(k) && !/^(NO_PROXY|no_proxy|HTTP_PROXY|HTTPS_PROXY|http_proxy|https_proxy)$/.test(k)).sort();
}

export function assertSafeHeavyEnv(env) {
  const bad = unsafeHeavyEnvKeys(env);
  if (bad.length) throw new Error(`a nehéz futás környezetében tiltott változó van (${bad.join(', ')}) — valódi e-mail / éles adatbázis kizárva, a futás nem indul`);
  if (env.NODE_USE_ENV_PROXY !== '1' || env.HTTPS_PROXY !== DEAD_PROXY || env.HTTP_PROXY !== DEAD_PROXY) throw new Error('a nehéz futás kimenő hálózati zárja hiányzik');
}

// ---- Előfeltételek -------------------------------------------------------------------------------------------------------------

/**
 * @param {{ root: string, run: Function, env: object }} o
 * @returns {Promise<string|null>} hibaüzenet, vagy null
 */
export async function heavyPreconditions({ root, run, env }) {
  if (existsSync(join(root, 'source', '.env'))) return 'a vizsgált munkafában source/.env van — a nehéz futás tilos (éles beállítás kerülhetne a tesztbe)';
  if (!existsSync(join(root, 'source', 'node_modules'))) return 'a munkafában nincs telepített node_modules — a nehéz futás nem indítható';
  const img = await run('docker', ['image', 'inspect', '--format', '{{.Id}}', 'postgres:17'], { cwd: root, env, timeoutMs: 30_000 });
  if (img.code !== 0) return 'a postgres:17 kép nincs helyben (vagy a Docker nem fut) — letöltést (kimenő hálózat) a futtató nem indít';
  return null;
}

// ---- Gépi sorompó (idegen konténerek) -------------------------------------------------------------------------------------

/** `docker ps --format "{{.Names}}\t{{.CreatedAt}}"` sorai → `[{ name, createdMs }]` (a CreatedAt pl. „2026-11-18 21:40:12 +0100 CET”). */
export function parseDockerPs(text) {
  const out = [];
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const [name, created] = line.split('\t');
    if (!name || !created) continue;
    const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})/.exec(created.trim());
    out.push({ name: name.trim(), createdMs: m ? Date.parse(`${m[1]}T${m[2]}${m[3]}${m[4]}:${m[5]}`) : NaN });
  }
  return out;
}

/** Friss (60 percen belül indult) idegen `websuli-*` konténerek. */
export function freshForeign(list, nowMs, own = new Set(), maxAgeMs = 60 * 60_000) {
  return list.filter((c) => /^websuli-/.test(c.name) && !own.has(c.name) && Number.isFinite(c.createdMs) && nowMs - c.createdMs < maxAgeMs);
}

/**
 * Sorompó: ha legalább `limit` friss idegen konténer fut, várakozás `pollMs`-onként, legfeljebb `maxWaitMs`-ig.
 * @returns {Promise<{ ok: true, waitedMs: number } | { ok: false, waitedMs: number, reason: string }>}
 */
export async function waitForMachine({ ps, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), maxWaitMs, pollMs = 15_000, limit = 2, shouldStop = () => null }) {
  const t0 = now();
  for (;;) {
    const busy = freshForeign(parseDockerPs(await ps()), now());
    if (busy.length < limit) return { ok: true, waitedMs: now() - t0 };
    const stop = shouldStop();
    if (stop) return { ok: false, waitedMs: now() - t0, reason: stop };
    if (now() - t0 >= maxWaitMs) return { ok: false, waitedMs: now() - t0, reason: `a gép foglalt: ${busy.length} friss idegen websuli-* konténer fut (${Math.round(maxWaitMs / 60_000)} perc várakozás után is)` };
    await sleep(pollMs);
  }
}

/** A futás alatt megjelent, utána is futó konténerek közül azok, amelyek neve a futás kimenetében szerepel (a sajátunk). */
export function ownLeftovers(before, after, output) {
  const had = new Set(before.map((c) => c.name));
  return after.map((c) => c.name).filter((n) => !had.has(n) && /^websuli-/.test(n) && String(output).includes(n));
}

// ---- Gépi zár (egy sáv a nehéz köröknek) --------------------------------------------------------------------------------------

/** A zár mappájának környezeti változója. Ha nincs megadva, nincs zárolás (a CI-ben nincs ilyen). */
export const MACHINE_LOCK_ENV = 'WEBSULI_MACHINE_LOCK_DIR';
const HELD = new Map(); // zár-mappa → gazda-szöveg (a folyamat kilépésekor is elengedjük)
let exitHook = false;

function releaseSync(dir) {
  const mine = HELD.get(dir);
  if (mine == null) return false;
  HELD.delete(dir);
  try {
    // Csak a SAJÁT zárat bontjuk: ha a gazda.txt már nem a miénk, a zárhoz nem nyúlunk.
    const cur = existsSync(join(dir, 'gazda.txt')) ? readFileSync(join(dir, 'gazda.txt'), 'utf8') : null;
    if (cur !== null && cur !== mine) return false;
    rmSync(dir, { recursive: true, force: true });
    return true;
  } catch { return false; } // a zár már nincs meg — nincs mit elengedni
}

/**
 * A gépi zár megszerzése: atomi `mkdir` (ha a mappa létezik, a zár foglalt), utána `gazda.txt`. Foglalt zárnál `pollMs`-onként vár,
 * legfeljebb `maxWaitMs`-ig; a zárat SOHA nem töri fel (más folyamaté lehet). Minden várakozó lekérdezéskor `onPoll({ waitedMs, holder })`.
 * @returns {Promise<{ ok: true, waitedMs: number, release: () => boolean } | { ok: false, waitedMs: number, holder: string|null, reason: string }>}
 */
export async function acquireMachineLock({ dir, owner, maxWaitMs, pollMs = 10_000, now = () => Date.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), shouldStop = () => null, onPoll = () => {} }) {
  const t0 = now();
  for (;;) {
    let created = false;
    try { mkdirSync(dir); created = true; } catch (e) { if (e?.code !== 'EEXIST') return { ok: false, waitedMs: now() - t0, holder: null, reason: `a gépi zár nem hozható létre (${e?.code ?? 'hiba'})` }; }
    if (created) {
      try { writeFileSync(join(dir, 'gazda.txt'), owner); } catch { /* a mappa a zár; a gazda-szöveg csak tájékoztató */ }
      HELD.set(dir, owner);
      if (!exitHook) { exitHook = true; process.once('exit', () => { for (const d of [...HELD.keys()]) releaseSync(d); }); }
      return { ok: true, waitedMs: now() - t0, release: () => releaseSync(dir) };
    }
    let holder = null;
    try { holder = readFileSync(join(dir, 'gazda.txt'), 'utf8').trim().slice(0, 200); } catch { /* a gazda épp ír vagy enged el */ }
    const stop = shouldStop();
    if (stop) return { ok: false, waitedMs: now() - t0, holder, reason: stop };
    if (now() - t0 >= maxWaitMs) return { ok: false, waitedMs: now() - t0, holder, reason: `a gépi zár ${Math.round(maxWaitMs / 60_000)} percen belül nem szabadult fel` };
    // Életjel a várakozás alatt (a hívó percenként naplóz belőle); a hibája a várakozást nem szakíthatja meg.
    try { onPoll({ waitedMs: now() - t0, holder }); } catch { /* az életjel nem kritikus */ }
    await sleep(pollMs);
  }
}

/** A zár gazda-szövege: „blind-review <fej12> <eszköz> <UTC>”. */
export const lockOwner = (head, tool, date = new Date()) => `blind-review ${String(head).slice(0, 12)} ${tool} ${date.toISOString()}`;

// ---- A saját böngészős forgatókönyv érvényesítése ------------------------------------------------------------------------------

const SEL = (v) => typeof v === 'string' && v.length > 0 && v.length <= 300;
const PATH = (v) => typeof v === 'string' && /^\/(?!\/)[^\s\\]*$/.test(v) && v.length <= 500 && !/^\/[a-z][a-z0-9+.-]*:/i.test(v);
const INT = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const STEP_RULES = {
  goto: (s) => PATH(s.goto) || 'a goto csak helyi útvonal lehet („/…”, séma és gépnév nélkül)',
  click: (s) => SEL(s.click) || 'érvénytelen click-szelektor',
  fill: (s) => (SEL(s.fill) && typeof s.value === 'string' && s.value.length <= 2000) || 'a fill: szelektor + value (szöveg, legfeljebb 2000)',
  press: (s) => (typeof s.press === 'string' && /^[A-Za-z0-9+]{1,30}$/.test(s.press)) || 'érvénytelen billentyű',
  wait: (s) => INT(s.wait, 0, 10_000) || 'a wait 0–10000 ms',
  waitFor: (s) => (SEL(s.waitFor) && (s.state == null || ['visible', 'hidden', 'attached', 'detached'].includes(s.state)) && (s.timeoutMs == null || INT(s.timeoutMs, 0, 15_000))) || 'a waitFor: szelektor (+ state, timeoutMs ≤ 15000)',
  mockApi: (s) => (typeof s.mockApi === 'string' && /^\/api\/[^\s\\]*$/.test(s.mockApi) && INT(s.status, 100, 599) && (s.delayMs == null || INT(s.delayMs, 0, 30_000))
    && (s.body == null || JSON.stringify(s.body).length <= 20_000) && (s.method == null || /^(GET|POST|PUT|PATCH|DELETE)$/.test(s.method))) || 'a mockApi csak „/api/…” útvonal lehet, status 100–599, delayMs ≤ 30000, body ≤ 20000',
  delayApi: (s) => (typeof s.delayApi === 'string' && /^\/api\/[^\s\\]*$/.test(s.delayApi) && INT(s.delayMs, 0, 30_000)) || 'a delayApi: „/api/…” + delayMs ≤ 30000',
  offline: (s) => typeof s.offline === 'boolean' || 'az offline logikai érték',
  evaluate: (s) => (typeof s.evaluate === 'string' && s.evaluate.length <= 5000) || 'az evaluate oldalon belüli JS-kifejezés (legfeljebb 5000 karakter)',
  measure: (s) => SEL(s.measure) || 'érvénytelen measure-szelektor',
  readLayoutShift: (s) => s.readLayoutShift === true || 'readLayoutShift: true',
  screenshot: (s) => (typeof s.screenshot === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(s.screenshot) && (s.fullPage == null || typeof s.fullPage === 'boolean')) || 'a screenshot neve betű / szám / _ / -, legfeljebb 40',
};
const MODIFIERS = new Set(['value', 'state', 'timeoutMs', 'status', 'body', 'delayMs', 'method', 'fullPage']);

/**
 * A forgatókönyv érvényesítése a futtatás ELŐTT.
 * @returns {{ ok: true, scenario: object, screenshots: number } | { ok: false, error: string }}
 */
export function validateScenario(raw, { maxScreenshots = 6 } = {}) {
  let sc;
  try { sc = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return { ok: false, error: `a forgatókönyv nem érvényes JSON: ${e.message}` }; }
  if (!sc || !Array.isArray(sc.cases) || !sc.cases.length || sc.cases.length > 6) return { ok: false, error: 'a forgatókönyv: { "cases": [ … ] }, 1–6 eset' };
  let shots = 0;
  for (const [i, c] of sc.cases.entries()) {
    const at = `${i + 1}. eset`;
    if (!c || typeof c.name !== 'string' || !c.name || c.name.length > 60) return { ok: false, error: `${at}: a name kötelező (legfeljebb 60 karakter)` };
    if (!c.viewport || !INT(c.viewport.width, 280, 1920) || !INT(c.viewport.height, 280, 1400)) return { ok: false, error: `${at}: viewport { width 280–1920, height 280–1400 }` };
    if (c.observeLayoutShift != null && typeof c.observeLayoutShift !== 'boolean') return { ok: false, error: `${at}: observeLayoutShift logikai érték` };
    if (!Array.isArray(c.steps) || !c.steps.length || c.steps.length > 40) return { ok: false, error: `${at}: 1–40 lépés` };
    for (const [n, s] of c.steps.entries()) {
      const keys = s && typeof s === 'object' ? Object.keys(s) : [];
      const actions = keys.filter((k) => Object.hasOwn(STEP_RULES, k));
      const unknown = keys.filter((k) => !Object.hasOwn(STEP_RULES, k) && !MODIFIERS.has(k));
      if (actions.length !== 1 || unknown.length) return { ok: false, error: `${at}, ${n + 1}. lépés: pontosan egy művelet kell (${Object.keys(STEP_RULES).join(', ')})${unknown.length ? `; ismeretlen mező: ${unknown.join(', ')}` : ''}` };
      const v = STEP_RULES[actions[0]](s);
      if (v !== true) return { ok: false, error: `${at}, ${n + 1}. lépés: ${v}` };
      if (actions[0] === 'screenshot') shots += 1;
    }
  }
  if (shots > maxScreenshots) return { ok: false, error: `legfeljebb ${maxScreenshots} képernyőkép futásonként` };
  return { ok: true, scenario: sc, screenshots: shots };
}
