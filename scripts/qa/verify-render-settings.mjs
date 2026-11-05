#!/usr/bin/env node
// A Render-szolgáltatás (websuli-api-eu) beállítása egyezik-e a repó feltevéseivel
// (docs/specs/2026-11-05-render-beallitas-ellenorzes.md). Csak olvas; a kulcs: RENDER_API_KEY környezeti változó.
//
// Használat: RENDER_API_KEY=… node scripts/qa/verify-render-settings.mjs
// Kilépés: 0 = egyezik, 1 = eltér (mezőnként kiírva), 2 = nem ellenőrizhető (nincs kulcs / API-hiba).

import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RENDER_IGNORED_PATHS, RENDER_ROOT_DIR } from './verify-render-revision.mjs';

export const RENDER_SERVICE_ID = 'srv-d6h9oq9drdic73cied30';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A `render.yaml` (egyetlen szolgáltatás) `buildCommand` értéke. */
export function renderYamlBuildCommand(text) {
  const m = /^[ \t-]*buildCommand:\s*(.+?)\s*$/m.exec(text);
  return m ? m[1].replace(/^(['"])(.*)\1$/, '$2') : '';
}

/** Tiszta összevetés: a Render API szolgáltatás-objektuma vs. a repó feltevései. Visszatér: eltérések listája. */
export function compareRenderSettings(service, { buildCommand }) {
  const diffs = [];
  const check = (field, live, expected) => {
    if (live !== expected) diffs.push({ field, live, expected });
  };
  const sortedJson = (list) => JSON.stringify([...(Array.isArray(list) ? list : [])].sort());
  check('branch', service?.branch, 'main');
  check('autoDeploy', service?.autoDeploy, 'yes');
  check('rootDir', service?.rootDir, RENDER_ROOT_DIR);
  check('buildFilter.ignoredPaths', sortedJson(service?.buildFilter?.ignoredPaths), sortedJson(RENDER_IGNORED_PATHS));
  check('buildFilter.paths', sortedJson(service?.buildFilter?.paths), '[]');
  check('buildCommand', service?.serviceDetails?.envSpecificDetails?.buildCommand, buildCommand);
  return diffs;
}

async function main() {
  const key = process.env.RENDER_API_KEY;
  if (!key) {
    console.error('[render-beállítás] Nem ellenőrizhető: a RENDER_API_KEY nincs beállítva.');
    process.exit(2);
  }
  const buildCommand = renderYamlBuildCommand(readFileSync(resolve(REPO_ROOT, 'render.yaml'), 'utf8'));
  let service;
  try {
    const res = await fetch(`https://api.render.com/v1/services/${RENDER_SERVICE_ID}`, {
      headers: { authorization: `Bearer ${key}`, accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    service = await res.json();
  } catch (error) {
    // A kulcs nem kerülhet a naplóba — a hibaüzenetből is kivesszük.
    const detail = String(error instanceof Error ? error.message : error).split(key).join('***');
    console.error(`[render-beállítás] A Render API nem érhető el: ${detail}`);
    process.exit(2);
  }
  const diffs = compareRenderSettings(service, { buildCommand });
  if (diffs.length === 0) {
    console.log('[render-beállítás] OK: a Render-beállítás egyezik a repó feltevéseivel.');
    process.exit(0);
  }
  for (const d of diffs) console.log(`[render-beállítás] ELTÉR ${d.field}: Render = ${d.live ?? '(nincs)'} | repó = ${d.expected}`);
  console.log('[render-beállítás] Igazítsd a Render-felületet (Settings) vagy a repót (render.yaml, verify-render-revision.mjs).');
  process.exit(1);
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  try { return realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
}

if (isDirectRun()) await main();
