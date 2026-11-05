#!/usr/bin/env node
// Az éles backend (Render, websuli-api-eu) a várt commitot futtatja-e (docs/specs/2026-11-05-render-telepites.md).
//
// A Render a `main` minden új commitjára automatikusan telepít, DE csak akkor, ha a commit a `source/` gyökérmappán belül
// változtat, és nem csak a build-szűrő kizárt útvonalain (Render-felület → Settings → Build Filters, 2026-11-05-i állapot,
// a Render API-ból kiolvasva). A várt revízió tehát a `main` utolsó olyan commitja, amely ilyen fájlt érint; az éles
// `/api/health` `revision` mezőjének ezzel kell egyeznie.
//
// Használat: node scripts/qa/verify-render-revision.mjs [--url https://websuli.vip/api/health] [--ref origin/main]
// Kilépés: 0 = egyezik, 1 = eltér (még fut a telepítés, vagy elmaradt), 2 = nem ellenőrizhető (hálózat / git).

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** A Render-szolgáltatás gyökérmappája (`rootDir`). */
export const RENDER_ROOT_DIR = 'source';
/** A Render build-szűrő kizárt útvonalai (`buildFilter.ignoredPaths`), a repó gyökeréhez képest. */
export const RENDER_IGNORED_PATHS = ['docs/**', '**/*.md', 'source/tests/**', '.github/**'];

/** A repó gyökere: a git innen fut, így a pathspec almappából indítva is a gyökérhez képest értendő (review #401). */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', cwd: REPO_ROOT, ...opts });

/** git pathspec: a gyökérmappa, a kizárt útvonalak nélkül. */
export function deployPathspec() {
  return [RENDER_ROOT_DIR, ...RENDER_IGNORED_PATHS.map((p) => `:(exclude,glob)${p}`)];
}

/**
 * A várt revízió lekérdezése. Review #401 (Codex, Vercel): `--first-parent` — merge committal összevont változásnál a
 * Render a `main` merge commitját telepíti, nem az oldalág commitját; a merge az első szülőjéhez képest számít.
 */
export function expectedRevisionArgs(ref) {
  return ['log', '-1', '--first-parent', '--format=%H', ref, '--', ...deployPathspec()];
}

/** Döntés a mért értékekből (tiszta függvény, tesztelhető). */
export function compareRevisions({ expected, live, uptimeSec }) {
  // Review #401: nem szöveges `revision` (pl. hibás health-válasz) se dobjon TypeError-t.
  if (typeof expected !== 'string' || typeof live !== 'string' || !expected || !live) return { ok: false, code: 2, message: 'Nem ellenőrizhető: hiányzó várt vagy éles revízió.' };
  if (expected === live) {
    return { ok: true, code: 0, message: `OK: az éles backend a várt ${live.slice(0, 7)} revíziót futtatja (uptime ${Math.round((uptimeSec ?? 0) / 60)} perc).` };
  }
  return { ok: false, code: 1, message: `ELTÉR: éles ${live.slice(0, 7)}, várt ${expected.slice(0, 7)} — a telepítés még fut (kb. 2 perc), vagy elmaradt (Render → Events).` };
}

/** Naplózható URL: hitelesítő adat, query és fragment nélkül (review #401 — titok ne kerüljön naplóba). */
export function safeUrl(url) {
  try { const u = new URL(url); return `${u.origin}${u.pathname}`; } catch { return '<érvénytelen URL>'; }
}

/** Kapcsoló értéke; hiányzó vagy másik kapcsolóval kezdődő érték esetén a tartalék (review #401). */
export function argValue(argv, name, fallback) {
  const i = argv.indexOf(name);
  const value = i >= 0 ? argv[i + 1] : undefined;
  return value && !value.startsWith('--') ? value : fallback;
}

/** A várt revízió a megadott refen (sekély klón → hiba). */
function expectedRevision(ref) {
  if (git(['rev-parse', '--is-shallow-repository']).trim() === 'true') {
    throw new Error('Sekély klón: a várt revízió nem állapítható meg megbízhatóan (git fetch --unshallow).');
  }
  return git(expectedRevisionArgs(ref)).trim();
}

/** Review #401 (Sourcery): `origin/<ág>` refnél előbb frissít, hogy ne egy elavult helyi refhez mérjen. */
function refreshRemoteRef(ref) {
  const m = /^origin\/(.+)$/.exec(ref);
  if (m) git(['fetch', '--quiet', 'origin', m[1]], { stdio: ['ignore', 'ignore', 'pipe'] });
}

async function main() {
  const url = argValue(process.argv, '--url', 'https://websuli.vip/api/health');
  const ref = argValue(process.argv, '--ref', 'origin/main');
  let expected = '';
  try {
    refreshRemoteRef(ref);
    // Review #401 (Vercel): sekély klónban a levágott előzmény határa téves várt revíziót adhat — ott nem ellenőrizhető.
    expected = expectedRevision(ref);
  } catch (error) {
    console.error(`[render-revízió] git hiba: ${error instanceof Error ? error.message : error}`);
    process.exit(2);
  }
  let health;
  try {
    // Review #401 (Sourcery): időkorlát — a nem válaszoló végpont nem akasztja meg az ellenőrzést.
    const res = await fetch(url, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(15_000) });
    // Review #401: nem 2xx válasznál a státusz látszódjon, ne egy általános JSON-hiba.
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    health = await res.json();
  } catch (error) {
    // A Node hibaüzenete maga is tartalmazhatja a teljes URL-t — abból is kivesszük.
    const detail = String(error instanceof Error ? error.message : error).split(url).join(safeUrl(url));
    console.error(`[render-revízió] a ${safeUrl(url)} nem érhető el: ${detail}`);
    process.exit(2);
  }
  // Review #401 (Sourcery): ha az ellenőrzés közben új commit érkezett, az eredmény nem dönthető el.
  try {
    refreshRemoteRef(ref);
    if (expectedRevision(ref) !== expected) {
      console.error('[render-revízió] A ref az ellenőrzés közben változott — futtasd újra néhány perc múlva.');
      process.exit(2);
    }
  } catch (error) {
    console.error(`[render-revízió] git hiba: ${error instanceof Error ? error.message : error}`);
    process.exit(2);
  }
  const result = compareRevisions({ expected, live: health?.revision ?? '', uptimeSec: health?.uptime });
  console.log(`[render-revízió] ${result.message}`);
  process.exit(result.code);
}

/** Közvetlen futtatás-e (review #401: relatív útvonal és symlink esetén is). */
function isDirectRun() {
  if (!process.argv[1]) return false;
  try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}

if (isDirectRun()) await main();
