#!/usr/bin/env node
// Kanban-ellenőrző (docs/minosegkapuk.md „Állapot-ellenőrzők”; docs/kanban.md; terv: docs/specs/2026-11-17-allapot-ellenorok.md).
// A `.hermes/kanban.db` CSAK OLVASVA (node:sqlite, readOnly); a tábla a fő checkout gyökerében él, munkafából is onnan.
// Semmit nem zár, nem módosít: tételes teendőlistát ad (az orkesztrátor dolga a végrehajtás).
//
// Használat: node scripts/qa/checks/kanban-check.mjs [--db <út>] [--no-gh] [--now <ISO>] [--json]
// Kilépés: 0 = nincs FAIL, 1 = FAIL (teendő van), 2 = nem tudott futni (nincs tábla).

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CannotRun, LEVELS, argValue, createReport, isMainModule, loadChecksConfig, realRun, repoPaths, runMain } from './lib.mjs';

const { FAIL, WARN, INFO, SKIP } = LEVELS;
const PR_RE = /(?:#|PR\s*#?|pull\/)(\d{2,5})\b/gi;

export function prRefs(text) {
  return [...new Set([...String(text ?? '').matchAll(PR_RE)].map((m) => Number(m[1])))];
}

/** Az adatbázis tartalma (csak olvasás). */
export async function readBoard(dbPath) {
  if (!existsSync(dbPath)) throw new CannotRun(`nincs kanban-tábla: ${dbPath} (a fő checkout .hermes/kanban.db-je)`);
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const items = db.prepare('SELECT id, repo, ticket, title, status, created_at, started_at, reviewed_at, done_at, blocked_at FROM items').all();
    const notes = db.prepare('SELECT item_id, body, created_at FROM notes').all();
    return { items: items.map((i) => ({ ...i })), notes: notes.map((n) => ({ ...n })) };
  } finally {
    db.close();
  }
}

const days = (from, now) => (now - Date.parse(`${String(from).replace(' ', 'T')}Z`)) / 86_400_000;

/**
 * @param {{ items: object[], notes: object[] }} board
 * @param {{ cfg: object, now?: number, prState?: (n:number) => ({state:string}|null|undefined), openPrs?: (() => number[]|null) }} o
 *   `prState` / `openPrs` null-t ad, ha a gh nem érhető el (→ SKIP).
 */
export function checkBoard(board, { cfg, now = Date.now(), prState = null, openPrs = null }) {
  const report = createReport('kanban-check');
  const notesBy = new Map();
  for (const n of board.notes) {
    if (!notesBy.has(n.item_id)) notesBy.set(n.item_id, []);
    notesBy.get(n.item_id).push(n);
  }
  const lastTouch = (it) => [it.started_at, it.reviewed_at, it.created_at, ...(notesBy.get(it.id) ?? []).map((n) => n.created_at)]
    .filter(Boolean).map((t) => Date.parse(`${String(t).replace(' ', 'T')}Z`)).reduce((a, b) => Math.max(a, b), 0);
  const refsOf = (it) => prRefs(`${it.title} ${it.ticket} ${(notesBy.get(it.id) ?? []).map((n) => n.body).join(' ')}`);

  // (a) aktív jegy lezárt PR-ral
  const active = board.items.filter((i) => cfg.activeStatuses.includes(i.status));
  if (!prState) {
    report.add(SKIP, 'pr-allapot', '', `nincs gh / hálózat — ${active.length} aktív jegy PR-állapota nem ellenőrzött`);
  } else {
    for (const it of active) {
      for (const n of refsOf(it)) {
        const s = prState(n);
        if (s && (s.state === 'MERGED' || s.state === 'CLOSED')) {
          report.add(FAIL, 'lezarando', `#${it.id}`, `„${it.title}” ${it.status}, de a PR #${n} ${s.state} — zárd le bizonyítékkal (vagy írd a jegyre, mi van még hátra)`);
        }
      }
    }
  }
  // (b) ragadt in_progress, (c) ragadt in_review
  for (const it of board.items) {
    const idle = (now - lastTouch(it)) / 86_400_000;
    if (it.status === 'in_progress' && idle > cfg.stuckDays) report.add(WARN, 'ragadt', `#${it.id}`, `„${it.title}” ${Math.floor(idle)} napja változatlan (keret: ${cfg.stuckDays})`);
    if (it.status === 'in_review' && idle > cfg.reviewStuckDays) report.add(FAIL, 'review-ragadt', `#${it.id}`, `„${it.title}” ${Math.floor(idle)} napja review-ban (AGENTS.md session eleji söprés)`);
  }
  // (d) nyitott PR jegy nélkül; MERGED PR, amelynek jegye todo
  if (!openPrs || !prState) {
    report.add(SKIP, 'pr-jegy-parositas', '', 'nincs gh / hálózat — a PR ↔ jegy párosítás nem ellenőrzött');
  } else {
    const open = openPrs();
    if (open == null) report.add(SKIP, 'pr-jegy-parositas', '', 'a nyitott PR-ok listája nem olvasható');
    else {
      const referenced = new Set(board.items.flatMap(refsOf));
      for (const n of open) if (!referenced.has(n)) report.add(WARN, 'pr-jegy-nelkul', `PR #${n}`, 'nyitott PR, egyetlen jegy sem hivatkozik rá — jegy kell (docs/kanban.md „Jegy először”)');
      for (const it of board.items.filter((i) => i.status === 'todo')) {
        for (const n of refsOf(it)) if (prState(n)?.state === 'MERGED') report.add(WARN, 'todo-merged-pr', `#${it.id}`, `„${it.title}” todo, de a PR #${n} MERGED`);
      }
    }
  }
  // (e) duplikált cím (nem lezárt jegyek között)
  const seen = new Map();
  for (const it of board.items.filter((i) => i.status !== 'done')) {
    const key = it.title.trim().toLowerCase();
    if (seen.has(key)) report.add(WARN, 'duplikalt-cim', `#${it.id}`, `ugyanaz a cím, mint #${seen.get(key)}: „${it.title}”`);
    else seen.set(key, it.id);
  }
  const by = board.items.reduce((m, i) => ({ ...m, [i.status]: (m[i.status] ?? 0) + 1 }), {});
  report.add(INFO, 'osszesito', '', Object.entries(by).map(([k, v]) => `${k}: ${v}`).join(', '));
  return report;
}

function ghAdapters(cwd, run = realRun) {
  if (run('gh', ['--version'], { cwd }).code !== 0) return { prState: null, openPrs: null };
  const cache = new Map();
  const prState = (n) => {
    if (!cache.has(n)) {
      const r = run('gh', ['pr', 'view', String(n), '--json', 'state'], { cwd, timeoutMs: 15_000 });
      cache.set(n, r.code === 0 ? JSON.parse(r.stdout) : null);
    }
    return cache.get(n);
  };
  const openPrs = () => {
    const r = run('gh', ['pr', 'list', '--state', 'open', '--json', 'number', '--limit', '50'], { cwd, timeoutMs: 20_000 });
    return r.code === 0 ? JSON.parse(r.stdout).map((p) => p.number) : null;
  };
  return { prState, openPrs };
}

if (isMainModule(import.meta.url)) {
  await runMain('kanban-check', async (args) => {
    const paths = repoPaths();
    const db = argValue(args, '--db') ?? join(paths.mainRoot, '.hermes', 'kanban.db');
    const board = await readBoard(db);
    const nowArg = argValue(args, '--now');
    const gh = args.includes('--no-gh') ? { prState: null, openPrs: null } : ghAdapters(paths.root);
    return checkBoard(board, { cfg: loadChecksConfig().kanban, now: nowArg ? Date.parse(nowArg) : Date.now(), ...gh });
  });
}
