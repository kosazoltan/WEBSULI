// P-057 (tulajdonosi döntés 2026-11-23; docs/specs/2026-11-23-h0-dontesek-atvezetese.md): a hook-határ tiszta ellenőrzője.
// - a projekt-helyi .claude/settings.json verziókezelt marad (nem ignorált);
// - eszköz-eseményen minden hook-csoport matchere szűk: csak ismert eszköznevek `|`-vel (nincs üres / helyettesítő karakteres matcher);
// - egy hook hibája csak a saját lépését tilthatja: `onFailure` kizárólag a kapu-hookon (check-quality-gates) állhat — a többi hook
//   minden Bash / PowerShell / Edit / Write hívásra fut, a fail-closed hibájuk minden munkát megállítana.
import { execFileSync } from 'node:child_process';

/** Az eszköz-események, amelyeken a matcher az eszköznévre szűr (code.claude.com/docs/en/hooks). */
export const TOOL_EVENTS = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'PermissionDenied'];
/** A szűk matcherben megengedett eszköznevek. */
export const NARROW_TOOLS = ['Bash', 'PowerShell', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
/** Az egyetlen hook, amelyen `onFailure` állhat (a kapu-hook saját lépése a kibocsátás). */
const GATE_HOOK = /check-quality-gates\.mjs/;

/** A settings hook-határ sértései (üres tömb = megfelel). Tiszta függvény. */
export function hookScopeViolations(settings) {
  const out = [];
  for (const [event, groups] of Object.entries(settings?.hooks ?? {})) {
    if (!Array.isArray(groups)) { out.push(`${event}: a hook-lista nem tömb`); continue; }
    for (const [i, g] of groups.entries()) {
      const where = `${event}[${i}]`;
      if (TOOL_EVENTS.includes(event)) {
        const m = typeof g?.matcher === 'string' ? g.matcher : '';
        const parts = m.split('|');
        if (!m || parts.some((t) => !NARROW_TOOLS.includes(t))) out.push(`${where}: nem szűk matcher (${JSON.stringify(g?.matcher ?? null)})`);
      }
      for (const h of g?.hooks ?? []) {
        if (h?.onFailure !== undefined && !GATE_HOOK.test(String(h.command ?? ''))) {
          out.push(`${where}: onFailure csak a kapu-hookon állhat (${h.command})`);
        }
      }
    }
  }
  return out;
}

/** A .claude/settings.json verziókezelt-e, és ignorált-e (git ls-files / git check-ignore). */
export function settingsTracked(repoRoot, path = '.claude/settings.json') {
  const git = (args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const tracked = git(['ls-files', '--', path]) === path;
  let ignored = true;
  // check-ignore kilépési kódja: 0 = ignorált, 1 = nem ignorált, 128 = git-hiba (szigorúan ignoráltnak vesszük).
  try { git(['check-ignore', '-q', '--no-index', '--', path]); } catch (e) { ignored = e?.status !== 1; }
  return { tracked, ignored };
}
