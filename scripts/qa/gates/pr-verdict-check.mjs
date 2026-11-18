#!/usr/bin/env node
// A vak hibakereső ellenőr ítéletének CI-szintű ellenőrzése (docs/specs/2026-11-18-vak-hibakereso-ellenor.md, „Kiegészítés”, V10).
// Környezettől független: a GitHub-esemény fájljából (GITHUB_EVENT_PATH) olvassa a PR leírását és a fej SHA-ját, és csak akkor ad
// 0-s kilépést, ha a leírásban van `Független ellenőr ítélete: IGEN | IGEN, FELTÉTELLEL (fej: <hash>)` sor a JELENLEGI fejre.
// A workflow-ba egy sorral köthető be (külön szelet): node scripts/qa/gates/pr-verdict-check.mjs --event "$GITHUB_EVENT_PATH"
// Függősége csak a lib.mjs (npm ci nem kell).

import { readFileSync } from 'node:fs';
import { STATUS, argValue, isMain, resolveVerdict, verdictResult } from './lib.mjs';

/**
 * @param {{ body?: string|null, head?: string|null }} pr
 * @returns {{ ok: boolean, note: string }}
 */
export function checkPrVerdict({ body, head }) {
  if (!head || !/^[0-9a-f]{40}$/i.test(head)) return { ok: false, note: 'a PR fej-SHA-ja nem olvasható az eseményből' };
  // CSAK a PR-leírás számít (helyi bizonyíték a CI-ban nincs; a kommentekbe bárki írhat).
  const v = resolveVerdict({ head, evidence: null, texts: [String(body ?? '')] });
  const r = verdictResult(v, head);
  if (r.status === STATUS.FAIL) {
    return { ok: false, note: `${r.note} — a PR-leírásba a vak hibakereső ellenőr rögzített ítélet-sora kell, a ${head.slice(0, 12)} fejre (AGENTS.md „Vak hibakereső ellenőr — kötelező”)` };
  }
  return { ok: true, note: r.note };
}

/** A GitHub `pull_request` esemény fájljából a PR leírása és a fej SHA-ja. */
export function prFromEvent(json) {
  const pr = json?.pull_request;
  return { body: pr?.body ?? '', head: pr?.head?.sha ?? null };
}

function main() {
  const path = argValue(process.argv.slice(2), '--event') ?? process.env.GITHUB_EVENT_PATH;
  if (!path) { process.stderr.write('[pr-verdict-check] HIBA: --event <GITHUB_EVENT_PATH> kötelező\n'); process.exit(2); }
  let json;
  try { json = JSON.parse(readFileSync(path, 'utf8')); } catch (e) {
    process.stderr.write(`[pr-verdict-check] HIBA: az esemény-fájl nem olvasható (${String(e?.message ?? e).split('\n')[0]})\n`);
    process.exit(2);
  }
  if (!json?.pull_request) { process.stdout.write('[pr-verdict-check] nem PR-esemény — nincs mit ellenőrizni\n'); process.exit(0); }
  const r = checkPrVerdict(prFromEvent(json));
  process.stdout.write(`[pr-verdict-check] ${r.ok ? 'OK' : 'BUKOTT'}: ${r.note}\n`);
  process.exit(r.ok ? 0 : 1);
}

if (isMain(import.meta.url)) main();
