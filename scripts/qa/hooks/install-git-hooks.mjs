#!/usr/bin/env node
// Opt-in git `pre-push` hook telepítője (docs/minosegkapuk.md „Futtatókörnyezetek”; terv: docs/specs/2026-11-17-kapuk-beepites.md).
// A hook a `scripts/qa/hooks/git-pre-push.mjs`-t hívja: push előtt a kimenő commitra zöld `gate:push` / `gate:pr` bizonyíték kell —
// bármely kliensből (nem csak Claude Code-ból). A hook a közös git-könyvtárban él, így minden munkafára hat.
//
// Használat (a repó / munkafa gyökeréből; a gépen egyszer, a tulajdonos döntése):
//   node scripts/qa/hooks/install-git-hooks.mjs            telepítés (= --install)
//   node scripts/qa/hooks/install-git-hooks.mjs --status   állapot
//   node scripts/qa/hooks/install-git-hooks.mjs --uninstall  eltávolítás (a hook archiválódik: pre-push.bak-<időbélyeg>)
// Idegen (nem általunk írt) `pre-push` hookot nem ír felül, és `core.hooksPath` beállítás mellett megáll (kilépés 1).

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, chmodSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { isMain } from '../gates/lib.mjs';

export const MARKER = 'websuli-qa-pre-push';

export const HOOK_BODY = `#!/bin/sh
# ${MARKER} — telepítette: scripts/qa/hooks/install-git-hooks.mjs (docs/minosegkapuk.md). Kézzel ne szerkeszd.
top=$(git rev-parse --show-toplevel) || exit 1
script="$top/scripts/qa/hooks/git-pre-push.mjs"
if [ ! -f "$script" ]; then
  echo "[minőségkapu] figyelmeztetés: ebben az ágban nincs $script (a kapuk előtti állapot) — a push ellenőrzés nélkül megy." >&2
  exit 0
fi
exec node "$script" "$@"
`;

/**
 * Tiszta döntés a telepítésről.
 * @param {{ action: 'install'|'uninstall'|'status', hooksPath: string, existing: string|null }} p
 * @returns {{ code: number, op: 'write'|'archive'|'none', message: string }}
 */
export function decide({ action, hooksPath, existing }) {
  const ours = existing != null && existing.includes(MARKER);
  if (action === 'status') {
    return { code: 0, op: 'none', message: existing == null ? 'nincs telepítve' : ours ? 'telepítve (websuli-qa-pre-push)' : 'idegen pre-push hook van (nem a miénk)' };
  }
  if (hooksPath) {
    return { code: 1, op: 'none', message: `a core.hooksPath be van állítva (${hooksPath}) — a telepítő nem ír oda; döntsd el kézzel (docs/minosegkapuk.md).` };
  }
  if (action === 'uninstall') {
    if (existing == null) return { code: 0, op: 'none', message: 'nincs mit eltávolítani' };
    if (!ours) return { code: 1, op: 'none', message: 'a pre-push hook nem a miénk — nem nyúlok hozzá' };
    return { code: 0, op: 'archive', message: 'eltávolítva (archiválva)' };
  }
  if (existing != null && !ours) return { code: 1, op: 'none', message: 'idegen pre-push hook van — nem írom felül; vond össze kézzel, vagy archiváld előbb.' };
  if (ours && existing === HOOK_BODY) return { code: 0, op: 'none', message: 'már telepítve, naprakész' };
  return { code: 0, op: 'write', message: ours ? 'frissítve' : 'telepítve' };
}

function git(args, cwd) {
  try { return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; }
}

/** A végrehajtás (a teszt ideiglenes könyvtárral hívja). */
export function apply({ action, commonDir, hooksPath, now = new Date() }) {
  const dir = join(commonDir, 'hooks');
  const file = join(dir, 'pre-push');
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : null;
  const d = decide({ action, hooksPath, existing });
  if (d.op === 'write') {
    mkdirSync(dir, { recursive: true });
    if (existing != null) renameSync(file, `${file}.bak-${now.toISOString().replace(/[:.]/g, '-')}`);
    writeFileSync(file, HOOK_BODY);
    try { chmodSync(file, 0o755); } catch { /* Windows: a Git for Windows a sh-t a shebang alapján futtatja */ }
  } else if (d.op === 'archive') {
    renameSync(file, `${file}.bak-${now.toISOString().replace(/[:.]/g, '-')}`);
  }
  return { ...d, file };
}

function main() {
  const args = process.argv.slice(2);
  const action = args.includes('--uninstall') ? 'uninstall' : args.includes('--status') ? 'status' : 'install';
  const cwd = process.cwd();
  const raw = git(['rev-parse', '--git-common-dir'], cwd);
  if (!raw) { process.stderr.write('nem git-repó\n'); process.exitCode = 1; return; }
  const commonDir = isAbsolute(raw) ? raw : resolve(cwd, raw);
  const r = apply({ action, commonDir, hooksPath: git(['config', '--get', 'core.hooksPath'], cwd) });
  process.stdout.write(`[install-git-hooks] ${r.message} — ${r.file}\n`);
  process.exitCode = r.code;
}

if (isMain(import.meta.url)) main();
