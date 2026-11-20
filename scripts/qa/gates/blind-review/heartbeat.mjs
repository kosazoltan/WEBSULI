#!/usr/bin/env node
// A vak futtató szívverés-fájlja és díjmentes felügyelője (docs/specs/2026-11-20-gpt-teljesitesi-or.md, kiegészítés).
// A futtató minden eseménynél (modellhívás, eszközhívás, hiba) frissíti a `<bizonyíték-tár>/blind-review-<fej12>.heartbeat.json`
// fájlt; ez a szkript API-hívás NÉLKÜL megmondja, hogy a futás él-e és halad-e.
//   node scripts/qa/gates/blind-review/heartbeat.mjs <szívverés.json> [--stale-min 20]
//   kilépési kód: 0 él és halad · 2 él, de STALE percig nem haladt · 3 a folyamat nem él (és nem fejeződött be) · 4 befejeződött

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** A szívverés írása: a mappát létrehozza (friss tár — vak ellenőr L9), atomi cserével (a felügyelő nem olvas félig írt fájlt). */
export function writeHeartbeat(file, data, now = new Date()) {
  try {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify({ pid: process.pid, ...data, at: now.toISOString() })}\n`);
    renameSync(tmp, file);
  } catch { /* a szívverés tájékoztató, a futást nem állítja meg */ }
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e?.code === 'EPERM'; } };

/** @returns {{ state: 'halad'|'beragadt'|'nem él'|'befejeződött', ageSec: number, code: number }} */
export function judgeHeartbeat(hb, { nowMs = Date.now(), staleMs = 10 * 60_000, isAlive = alive } = {}) {
  const ageSec = Math.round((nowMs - Date.parse(hb?.at ?? '')) / 1000);
  if (hb?.phase === 'done') return { state: 'befejeződött', ageSec, code: 4 };
  if (!hb?.pid || !isAlive(hb.pid)) return { state: 'nem él', ageSec, code: 3 };
  if (!Number.isFinite(ageSec) || ageSec * 1000 > staleMs) return { state: 'beragadt', ageSec, code: 2 };
  return { state: 'halad', ageSec, code: 0 };
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) {
  const f = process.argv[2];
  const i = process.argv.indexOf('--stale-min');
  const staleMs = (i > 0 ? Number(process.argv[i + 1]) : 20) * 60_000; // 20 perc: egy hívás korlátja 900 s
  if (!f || !existsSync(f)) { process.stdout.write('[heartbeat] nincs szívverés-fájl\n'); process.exit(3); }
  const hb = JSON.parse(readFileSync(f, 'utf8'));
  const j = judgeHeartbeat(hb, { staleMs });
  process.stdout.write(`[heartbeat] ${j.state} — utolsó jel ${j.ageSec} s-a (${hb.phase ?? '?'}, ${hb.calls ?? '?'} hívás, ${hb.spentUsd ?? '?'} USD)\n`);
  process.exit(j.code);
}
