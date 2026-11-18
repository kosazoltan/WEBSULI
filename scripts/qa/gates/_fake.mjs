// Tesztsegéd a kapukhoz: hamis futtató (a hívásokat rögzíti) és hamis kontextus ideiglenes gyökérrel. Nem teszt, nem éles kód.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createGate, loadConfig, makeGit } from './lib.mjs';

/**
 * @param {{ changed?: string[], untracked?: string[], diff?: string, dirty?: string[], diffCheck?: number,
 *           respond?: (cmd: string, args: string[], opts: object) => ({code:number,stdout?:string,stderr?:string} | undefined) }} o
 */
export function fakeCtx(o = {}) {
  const root = mkdtempSync(join(tmpdir(), 'gate-fake-'));
  mkdirSync(join(root, 'source', 'node_modules'), { recursive: true });
  mkdirSync(join(root, 'source', 'tests'), { recursive: true });
  for (const f of o.changed ?? []) {
    mkdirSync(dirname(join(root, f)), { recursive: true });
    writeFileSync(join(root, f), o.contents?.[f] ?? '');
  }
  const calls = [];
  const exec = (cmd, args = [], opts = {}) => {
    calls.push({ cmd, args, cwd: opts.cwd });
    const custom = o.respond?.(cmd, args, opts);
    if (custom) return { stdout: '', stderr: '', ms: 0, ...custom };
    const ok = (stdout = '') => ({ code: 0, stdout, stderr: '', ms: 0 });
    if (cmd === 'git') {
      const a = args.join(' ');
      if (a === 'rev-parse --show-toplevel') return ok(root);
      if (a === 'rev-parse --git-common-dir') return ok(join(root, '.git'));
      if (a === 'rev-parse HEAD') return ok('f'.repeat(40));
      if (a === 'branch --show-current') return ok('chore/proba');
      if (a.startsWith('merge-base --is-ancestor')) return { code: 0, stdout: '', stderr: '', ms: 0 };
      if (a.startsWith('merge-base')) return ok('mb0');
      if (a.startsWith('diff --name-only')) return ok((o.changed ?? []).join('\n'));
      if (a.startsWith('ls-files --others')) return ok((o.untracked ?? []).join('\n'));
      if (a.startsWith('diff --check')) return { code: o.diffCheck ?? 0, stdout: o.diffCheck ? 'x.ts:1: trailing whitespace.' : '', stderr: '', ms: 0 };
      if (a.startsWith('diff -U0')) return ok(o.diff ?? '');
      if (a.startsWith('status --porcelain')) return ok((o.dirty ?? []).join('\n'));
      return ok('');
    }
    return ok('');
  };
  const cfg = loadConfig();
  const ctx = { exec, git: makeGit(exec, root), root, src: join(root, 'source'), cfg, base: 'origin/main', node: 'node', evDir: join(root, '.git', 'ev') };
  const lines = [];
  const gate = createGate('teszt', { log: (s) => lines.push(s) });
  return { ctx, calls, gate, lines, root };
}

export const statusOf = (gate, prefix) => gate.results.find((r) => r.name.startsWith(prefix))?.status;
