#!/usr/bin/env node
// A futás végi higiénia belépési pontja (docs/specs/2026-11-20-session-zaras.md D8; skill: websuli-session-zaras).
// Tulajdonosi utasítás 2026-11-20: a higiénia CSAK a zöld kérés-összevetés (session-closeout verify) után jöhet. Friss zöld
// bizonyíték nélkül (vagy ha azóta új tulajdonosi üzenet érkezett, vagy a lista változott) exit 1 + teendő. Zöldnél csak olvasó
// leltár: munkafák, a base-be beolvadt helyi ágak, a fő munkakönyvtár állapota — törölni nem töröl (a döntés a skill szerint).
//
// Használat: npm run session:hygiene -- --transcript <átirat.jsonl> | --session <id>

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argValue, isMain, readEvidence, realExec, redact } from './gates/lib.mjs';
import { listSha, locate, resolveTranscript, scanOwnerSince, sessionIdOf } from './session-closeout.mjs';

const TAG = '[session-higiénia]';

/** @returns {{ ok: true } | { ok: false, why: string }} */
export function closeoutFresh({ evDir, transcript }) {
  const session = sessionIdOf(transcript);
  const ev = readEvidence(evDir, `closeout-ok-${session}`);
  if (!ev) return { ok: false, why: 'nincs zöld kérés-összevetés ehhez a sessionhöz' };
  const size = statSync(transcript).size;
  if (resolve(ev.transcript ?? '') !== resolve(transcript) || !Number.isInteger(ev.transcriptBytes) || ev.transcriptBytes > size) {
    return { ok: false, why: 'a zöld bizonyíték más átiratra szól' };
  }
  const tail = readFileSync(transcript).subarray(ev.transcriptBytes);
  const { count } = scanOwnerSince(tail, 0, { hasOrigin: ev.originBased === true || tail.includes('"origin":{') });
  if (count) return { ok: false, why: `a zöld összevetés óta ${count} új tulajdonosi üzenet érkezett` };
  const md = join(evDir, `closeout-${session}.md`);
  if (!existsSync(md) || listSha(readFileSync(md, 'utf8')) !== ev.listSha256) return { ok: false, why: 'a zárólista a zöld ellenőrzés óta megváltozott (vagy hiányzik)' };
  return { ok: true, ev };
}

function inventory(exec, loc, base) {
  const git = (args, cwd = loc.mainRoot) => exec('git', args, { cwd, timeoutMs: 60_000 });
  const lines = [`${TAG} == Higiénia-leltár (csak olvasó; törölni a skill szerint, jóváhagyással) ==`];
  const wt = git(['worktree', 'list', '--porcelain']);
  const trees = [];
  let cur = null;
  for (const l of wt.stdout.split(/\r?\n/)) {
    if (l.startsWith('worktree ')) { cur = { path: l.slice(9), branch: null }; trees.push(cur); }
    else if (l.startsWith('branch ') && cur) cur.branch = l.slice(7).replace(/^refs\/heads\//, '');
  }
  lines.push(`${TAG} munkafák: ${trees.length}`);
  for (const t of trees) {
    const merged = t.branch ? git(['merge-base', '--is-ancestor', t.branch, base]).code === 0 : false;
    lines.push(`${TAG}   ${t.path} — ${t.branch ?? '(leválasztott fej)'}${merged ? ` — BEOLVADT a(z) ${base}-be: eltávolítási jelölt` : ''}`);
  }
  const br = git(['branch', '--merged', base, '--format=%(refname:short)']);
  const mergedBranches = br.stdout.split(/\r?\n/).map((s) => s.trim()).filter((b) => b && b !== 'main');
  lines.push(`${TAG} a(z) ${base}-be beolvadt helyi ágak (törlési jelölt): ${mergedBranches.length ? mergedBranches.join(', ') : 'nincs'}`);
  const st = git(['status', '--short']);
  const dirty = st.stdout.split(/\r?\n/).filter((l) => l.trim());
  lines.push(`${TAG} a fő munkakönyvtár állapota: ${dirty.length ? `${dirty.length} változott / nem követett fájl` : 'tiszta'}`);
  lines.push(`${TAG} következő: memória, skill (csapdák + runbook), kanban, mappafa — a websuli-session-zaras skill „Higiénia” lépései szerint.`);
  return lines.map(redact).join('\n');
}

function main() {
  const args = process.argv.slice(2);
  try {
    const transcript = resolveTranscript(args);
    const loc = locate();
    const fresh = closeoutFresh({ evDir: loc.evDir, transcript });
    if (!fresh.ok) {
      process.stdout.write(`${TAG} MEGÁLL: ${fresh.why}. A higiénia csak a zöld kérés-összevetés után jöhet (tulajdonosi utasítás 2026-11-20):\n`);
      process.stdout.write(`${TAG}   node scripts/qa/session-closeout.mjs collect --transcript "${transcript}"\n`);
      process.stdout.write(`${TAG}   (kitöltés + felelős nyilatkozat) → node scripts/qa/session-closeout.mjs verify --transcript "${transcript}"\n`);
      process.exit(1);
    }
    process.stdout.write(`${TAG} zöld kérés-összevetés: ${fresh.ev.ownerCount} tulajdonosi üzenet, nyitott: ${(fresh.ev.open ?? []).join(', ') || 'nincs'} (${fresh.ev.at})\n`);
    process.stdout.write(`${inventory(realExec, loc, argValue(args, '--base', 'origin/main'))}\n`);
    process.exit(0);
  } catch (e) {
    process.stderr.write(`${TAG} HIBA: ${redact(e?.message ?? e)}\n`);
    process.exit(1);
  }
}

if (isMain(import.meta.url)) main();
