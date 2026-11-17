#!/usr/bin/env node
// Ingadozó tesztek nyilvántartása (S8; terv: docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md, végrehajtás „S8”).
// CSAK OLVAS: a `gh` a CI-futásokat és a job-naplókat adja; a szkript gépiesen összesíti, melyik teszt hányszor bukott, hányszor ment át
// a Playwright saját újrapróbáján („flaky”), és hányszor zöldült a futás újraindítására — és ebből dönti el egy PR CI-bukásáról, hogy
// ismert ingadozó-e („nem a PR hibája”), vagy új bukás. A döntést a gép hozza, nem az ügynök (ma kétszer kézzel kellett: a
// `word-ladder-play.spec.ts:48`).
//
// Használat: node scripts/qa/gates/flaky-report.mjs [--limit 20] [--branch main] [--pr <n>] [--cache <mappa>] [--json]
//   --limit  a vizsgált main-futások száma (befejezettek; minden újraindítási kísérlettel)
//   --pr     döntés egy PR legutóbbi CI-futásának bukott tesztjeiről
//   --cache  a letöltött job-naplók gyorsítótára (futás + kísérlet + job szerint változatlan; alapérték: a bizonyíték-tár alatt)
// Kilépési kód (közös konvenció, terv 6.6a): 0 = rendben (--pr: minden bukás ismert ingadozó); 1 = jegy nélküli ingadozó, vagy a PR-nak
// van nem ingadozó bukása; 2 = a szkript nem tudott futni (gh / hálózat).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GATES_DIR, STATUS, argValue, createGate, isMain, makeContext, redact } from './lib.mjs';

export const KNOWN_FILE = join(GATES_DIR, 'known-flaky.json');

// ---- Napló-értelmezés -------------------------------------------------------------------------------------------------------

const ANSI = /\x1b\[[0-9;]*[A-Za-z]|\^\[\[[0-9;]*m/g;

/** A `gh run view --log` sorainak előtagja (job, lépés, időbélyeg) és az ANSI-kódok nélkül. */
export function cleanLine(raw) {
  return String(raw).replace(/\r$/, '').replace(/^[^\t\n]*\t[^\t\n]*\t/, '').replace(/^﻿?\d{4}-\d\d-\d\dT[\d:.]+Z ?/, '').replace(ANSI, '');
}

/**
 * Egy job-napló → `{ failed: string[], flaky: string[] }`. Azonosítók: `e2e:<spec>:<sor>` (Playwright összesítő „N failed” / „N flaky”
 * szakasza) és `unit:<tesztnév>` (node:test „✖ failing tests:” szakasza).
 */
export function parseJobLog(text) {
  const failed = new Set();
  const flaky = new Set();
  let section = null;
  for (const raw of String(text ?? '').split('\n')) {
    const l = cleanLine(raw);
    const head = /^\s{2}(\d+) (failed|flaky)\s*$/.exec(l);
    if (head) { section = head[2]; continue; }
    if (/^\s*✖ failing tests:/.test(l)) { section = 'unit'; continue; }
    if (section === 'failed' || section === 'flaky') {
      // A cím is az azonosító része: a paraméterezett tesztek (pl. joystick-response.spec.ts:629 játékonként) ugyanazon a soron
      // élnek; a Playwright a hosszú címet `─` kitöltéssel vágja — az előtte álló részt tartjuk meg.
      const m = /^\s{4}\[[^\]]+\] › (\S+?):(\d+):\d+ › (.*)$/.exec(l);
      if (m) {
        const title = m[3].split('─')[0].replace(/\s+/g, ' ').trim();
        (section === 'failed' ? failed : flaky).add(`e2e:${m[1].replace(/\\/g, '/')}:${m[2]} › ${title}`);
        continue;
      }
      section = null;
    } else if (section === 'unit') {
      const m = /^\s*✖ (.+?) \(\d+(?:\.\d+)?m?s\)\s*$/.exec(l);
      if (m) { failed.add(`unit:${m[1].trim()}`); continue; }
      if (/^(?:ℹ |# |##\[)/.test(l)) section = null; // a node:test összesítője / a futó vége zárja a szakaszt
    }
  }
  for (const id of flaky) failed.delete(id);
  return { failed: [...failed].sort(), flaky: [...flaky].sort() };
}

// ---- Összesítés -------------------------------------------------------------------------------------------------------------

/**
 * `runs`: `[{ id, sha, createdAt, attempts: [{ attempt, conclusion, failed: string[], flaky: string[] }] }]` (újabb elöl).
 * @returns {{ id, fails, flakyRetries, rerunPass, runs: number[], lastSeen, cls }[]} — rangsorolva (pont: flaky + rerun×2 + fails)
 */
export function aggregate(runs) {
  const m = new Map();
  const get = (id) => {
    if (!m.has(id)) m.set(id, { id, fails: 0, flakyRetries: 0, rerunPass: 0, runs: new Set(), failRunIdx: [], lastSeen: null });
    return m.get(id);
  };
  runs.forEach((run, idx) => {
    const final = run.attempts[run.attempts.length - 1];
    for (const a of run.attempts) {
      for (const id of a.flaky) { const e = get(id); e.flakyRetries += 1; e.runs.add(run.id); e.lastSeen ??= run.createdAt; }
      for (const id of a.failed) {
        const e = get(id);
        e.fails += 1;
        e.runs.add(run.id);
        e.lastSeen ??= run.createdAt;
        if (!e.failRunIdx.includes(idx)) e.failRunIdx.push(idx);
        if (a !== final && final.conclusion === 'success') e.rerunPass += 1;
      }
    }
  });
  const out = [];
  for (const e of m.values()) {
    // Nem egymást követő bukás: két bukott futás között van olyan futás, amelyben ez a teszt nem bukott (a kód közben nem javult rá).
    const idx = [...e.failRunIdx].sort((a, b) => a - b);
    const gaps = idx.some((v, i) => i > 0 && v - idx[i - 1] > 1);
    // A két legfrissebb futásban egymás után bukott teszt TARTÓS bukás (valószínű regresszió) — akkor is, ha korábban ingadozott
    // (mért 2026-11-17: joystick-response.spec.ts:629 block-craft-quiz — korábban újrapróbán átment, most két egymást követő mainen bukik).
    const latestTwice = idx[0] === 0 && idx[1] === 1;
    const cls = latestTwice ? 'tartós bukás'
      : e.flakyRetries > 0 || e.rerunPass > 0 || (idx.length >= 2 && gaps) ? 'ingadozó'
        : 'egyszeri bukás';
    out.push({ id: e.id, fails: e.fails, flakyRetries: e.flakyRetries, rerunPass: e.rerunPass, runs: [...e.runs], lastSeen: e.lastSeen, cls });
  }
  const score = (x) => x.flakyRetries + 2 * x.rerunPass + x.fails;
  return out.sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
}

/** A teszt-azonosító forrásfájlja (a PR érintette-e): `e2e:tests/x.spec.ts:48 › cím` → `source/tests/x.spec.ts`. */
export function testFileOf(id) {
  const m = /^e2e:(.+?):\d+(?: › |$)/.exec(id);
  if (!m) return null;
  return m[1].startsWith('source/') ? m[1] : `source/${m[1]}`;
}

/**
 * Döntés egy PR bukásairól. @returns {{ verdict: 'nem a PR hibája' | 'a PR hibája lehet' | 'nincs bukás', items: object[] }}
 */
export function decidePr({ failed, ranking, known, prFiles }) {
  if (!failed.length) return { verdict: 'nincs bukás', items: [] };
  const byId = new Map(ranking.map((r) => [r.id, r]));
  const items = failed.map((id) => {
    const r = byId.get(id);
    const k = knownEntry(known, id);
    const file = testFileOf(id);
    const touched = file && prFiles.includes(file);
    if (touched) return { id, status: 'A PR HIBÁJA LEHET', why: `a PR módosította a tesztfájlt (${file}) — gépileg nem minősíthető ingadozónak` };
    if (r?.cls === 'ingadozó' || k) {
      const ev = r ? `${r.fails} bukás, ${r.flakyRetries} Playwright-újrapróba, ${r.rerunPass} újraindításra zöld a main utolsó futásaiban (futások: ${r.runs.slice(0, 5).join(', ')})` : 'a known-flaky.json listáján';
      return { id, status: 'ISMERT INGADOZÓ', why: `${ev}${k?.ticket ? `; jegy: #${k.ticket}` : '; JEGY NINCS'}` };
    }
    return { id, status: 'A PR HIBÁJA LEHET', why: r ? `a mainen ${r.cls} (${r.fails} bukás) — nem ingadozó minta` : 'a mainen nem bukott a vizsgált futásokban' };
  });
  return { verdict: items.every((x) => x.status === 'ISMERT INGADOZÓ') ? 'nem a PR hibája' : 'a PR hibája lehet', items };
}

/** A `known-flaky.json` ellenőrzése: minden ingadozóhoz jegy kell (nincs csendes elfogadás). */
/** A lista eleme egy azonosítóra: pontos egyezés, vagy cím nélküli `e2e:<spec>:<sor>` elem a sor minden paraméterezett esetére. */
export function knownEntry(known, id) {
  const base = id.split(' › ')[0];
  return (known ?? []).find((k) => k.id === id || k.id === base) ?? null;
}

export function checkKnown(ranking, known) {
  const problems = [];
  for (const k of known ?? []) if (!Number.isInteger(k.ticket)) problems.push(`${k.id}: a known-flaky.json elemén nincs kanban-jegy (ticket)`);
  for (const r of ranking) if (r.cls === 'ingadozó' && !knownEntry(known, r.id)) problems.push(`${r.id}: ingadozó (${r.fails} bukás, ${r.flakyRetries} újrapróba, ${r.rerunPass} újraindítás), de NINCS a known-flaky.json-ban jeggyel`);
  return problems;
}

// ---- Begyűjtés (gh) ---------------------------------------------------------------------------------------------------------

function ghJson(exec, root, args) {
  const r = exec('gh', args, { cwd: root, timeoutMs: 120_000 });
  if (r.code !== 0) throw new Error(`gh ${args.slice(0, 3).join(' ')}: ${redact(r.stderr).split('\n')[0]}`);
  return JSON.parse(r.stdout || 'null');
}

/** Egy futás minden kísérlete a bukott (és az E2E job zöld kísérleténél a flaky) tesztekkel. */
export function collectRun({ exec, root, run, cacheDir }) {
  const attempts = [];
  const last = Number(run.attempt ?? 1);
  for (let k = 1; k <= last; k += 1) {
    const v = ghJson(exec, root, ['run', 'view', String(run.databaseId), '--attempt', String(k), '--json', 'conclusion,jobs']);
    const failed = new Set();
    const flaky = new Set();
    for (const j of v.jobs ?? []) {
      const e2e = /playwright|e2e/i.test(j.name);
      if (!(j.conclusion === 'failure' || (e2e && j.conclusion === 'success'))) continue;
      const cache = cacheDir ? join(cacheDir, `${run.databaseId}-${k}-${j.databaseId}.log`) : null;
      let log;
      if (cache && existsSync(cache)) log = readFileSync(cache, 'utf8');
      else {
        const r = exec('gh', ['run', 'view', String(run.databaseId), '--job', String(j.databaseId), '--log'], { cwd: root, timeoutMs: 300_000 });
        if (r.code !== 0) throw new Error(`gh run view --log ${j.databaseId}: ${redact(r.stderr).split('\n')[0]}`);
        log = r.stdout;
        if (cache) { mkdirSync(cacheDir, { recursive: true }); writeFileSync(cache, log); }
      }
      const p = parseJobLog(log);
      p.failed.forEach((x) => failed.add(x));
      p.flaky.forEach((x) => flaky.add(x));
    }
    attempts.push({ attempt: k, conclusion: v.conclusion, failed: [...failed], flaky: [...flaky] });
  }
  return { id: run.databaseId, sha: run.headSha, createdAt: run.createdAt, attempts };
}

export function readKnown(path = KNOWN_FILE) {
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, 'utf8')).tests ?? [];
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const limit = Number(argValue(args, '--limit', '20'));
  const branch = argValue(args, '--branch', 'main');
  const prArg = argValue(args, '--pr');
  const t0 = Date.now();
  let ctx;
  try { ctx = makeContext({}); } catch (e) { process.stderr.write(`[flaky-report] NEM FUTOTT: ${e.message}\n`); process.exit(2); }
  const { exec, root } = ctx;
  const cacheDir = argValue(args, '--cache') ?? join(ctx.evDir, 'ci-logs');
  const gate = createGate('flaky-report', { log: json ? () => {} : undefined });
  let ranking = [];
  let decision = null;
  let problems = [];
  try {
    const list = ghJson(exec, root, ['run', 'list', '--workflow', 'CI', '--branch', branch, '--limit', String(limit * 2), '--json', 'databaseId,headSha,conclusion,attempt,status,event,createdAt'])
      .filter((r) => r.status === 'completed' && r.event === 'push').slice(0, limit);
    const runs = list.map((run) => collectRun({ exec, root, run, cacheDir }));
    ranking = aggregate(runs);
    const known = readKnown();
    problems = checkKnown(ranking, known);
    gate.add(`vizsgált ${branch}-futások`, STATUS.PASS, `${runs.length} futás, ${runs.reduce((n, r) => n + r.attempts.length, 0)} kísérlet`);
    for (const r of ranking.slice(0, 15)) {
      gate.add(r.id.slice(0, 80), r.cls === 'ingadozó' ? STATUS.WARN : STATUS.PASS, `${r.cls}: ${r.fails} bukás, ${r.flakyRetries} Playwright-újrapróba, ${r.rerunPass} újraindításra zöld (futások: ${r.runs.slice(0, 4).join(', ')})`);
    }
    for (const p of problems) gate.add('jegy nélküli ingadozó', STATUS.FAIL, p);
    if (prArg) {
      const pr = ghJson(exec, root, ['pr', 'view', prArg, '--json', 'number,headRefOid,headRefName,files']);
      const prRuns = ghJson(exec, root, ['run', 'list', '--workflow', 'CI', '--commit', pr.headRefOid, '--limit', '5', '--json', 'databaseId,headSha,conclusion,attempt,status,event,createdAt'])
        .filter((r) => r.status === 'completed');
      if (!prRuns.length) gate.add(`PR #${prArg}`, STATUS.NOT_RUN, `a fejre (${pr.headRefOid.slice(0, 12)}) még nincs befejezett CI-futás`);
      else {
        const pr0 = collectRun({ exec, root, run: prRuns[0], cacheDir });
        const fin = pr0.attempts[pr0.attempts.length - 1];
        decision = decidePr({ failed: fin.failed, ranking, known, prFiles: (pr.files ?? []).map((f) => f.path) });
        for (const it of decision.items) gate.add(`PR #${prArg}: ${it.id}`.slice(0, 80), it.status === 'ISMERT INGADOZÓ' ? STATUS.PASS : STATUS.FAIL, `${it.status} — ${it.why}`);
        gate.add(`PR #${prArg} ítélet`, decision.verdict === 'a PR hibája lehet' ? STATUS.FAIL : STATUS.PASS, `${decision.verdict} (futás ${pr0.id}, kísérlet ${fin.attempt}, fej ${pr.headRefOid.slice(0, 12)})`);
      }
    }
  } catch (e) {
    if (json) process.stdout.write(`${JSON.stringify({ schema: 'websuli-check/1', tool: 'flaky-report', head: null, ok: false, exitCode: 2, counts: {}, items: [], error: redact(String(e?.message ?? e)) })}\n`);
    else process.stderr.write(`[flaky-report] NEM FUTOTT: ${redact(String(e?.message ?? e))}\n`);
    process.exit(2);
  }
  const code = gate.finish();
  if (json) {
    const items = [
      ...ranking.map((r) => ({ id: r.id, status: r.cls === 'ingadozó' ? STATUS.WARN : STATUS.PASS, ref: r.id, detail: `${r.cls}: ${r.fails}/${r.flakyRetries}/${r.rerunPass}`, ...r })),
      ...problems.map((p) => ({ id: 'known-flaky', status: STATUS.FAIL, ref: 'known-flaky.json', detail: p })),
      ...(decision?.items ?? []).map((x) => ({ id: `pr:${x.id}`, status: x.status === 'ISMERT INGADOZÓ' ? STATUS.PASS : STATUS.FAIL, ref: x.id, detail: `${x.status} — ${x.why}` })),
    ];
    const counts = {};
    for (const x of items) counts[x.status] = (counts[x.status] ?? 0) + 1;
    process.stdout.write(`${JSON.stringify({ schema: 'websuli-check/1', tool: 'flaky-report', head: null, ok: code === 0, exitCode: code, counts, items, verdict: decision?.verdict ?? null, ms: Date.now() - t0 }, null, 2)}\n`);
  }
  process.exit(code);
}

if (isMain(import.meta.url)) main();
