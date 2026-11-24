// P-057 (tulajdonosi döntés 2026-11-23; docs/specs/2026-11-23-h0-dontesek-atvezetese.md): a hook-határ tiszta ellenőrzője.
// - a projekt-helyi .claude/settings.json verziókezelt marad (nem ignorált);
// - eszköz-eseményen minden hook-csoport matchere szűk: egyetlen ismert eszköznév vagy az `Edit|Write` pár (nincs üres / helyettesítő
//   karakteres / tetszőleges kombináció);
// - a disableAllHooks nem lehet bekapcsolva; a művelet előtt tiltó hookok csak PreToolUse-on, Bash és PowerShell matcheren;
// - egy hook hibája csak a saját lépését tilthatja: `onFailure` kizárólag a kapu-hookon (check-quality-gates, pontos parancs) állhat — a többi hook
//   minden Bash / PowerShell / Edit / Write hívásra fut, a fail-closed hibájuk minden munkát megállítana.
import { execFileSync } from 'node:child_process';

/** Az eszköz-események, amelyeken a matcher az eszköznévre szűr (code.claude.com/docs/en/hooks). */
export const TOOL_EVENTS = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest', 'PermissionDenied'];
/** A szűk matcherben megengedett eszköznevek. */
export const NARROW_TOOLS = ['Bash', 'PowerShell', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
/**
 * A jóváhagyott matcherek (PR #548 Sourcery): az egyes eszköznevek külön, plusz egyetlen pár, az `Edit|Write`.
 * Más kombináció (pl. `Bash|PowerShell`, `Edit|Write|Bash`) tiltott: egy széles matcheren a kapu-hook hibája a javításhoz
 * szükséges szerkesztést is megállítaná.
 */
export const APPROVED_MATCHERS = [...NARROW_TOOLS, 'Edit|Write'];
/** Egy repó-hook pontos parancsa, ahogy a .claude/settings.json regisztrálja. */
export const hookCommand = (file) => `node "\${CLAUDE_PROJECT_DIR}/scripts/qa/hooks/${file}"`;
/** Az egyetlen hook, amelyen `onFailure` állhat — pontos parancs-egyezéssel, nem részszöveggel (PR #548 Sourcery). */
export const GATE_HOOK_COMMAND = hookCommand('check-quality-gates.mjs');
/**
 * A művelet ELŐTT tiltó hookok (PR #548 Sourcery): kizárólag PreToolUse-on állhatnak, és ott a Bash és a PowerShell
 * matcheren is regisztrálva kell lenniük — PostToolUse-on a romboló parancs / push már lefutott, mire tiltanának.
 */
export const PRE_ACTION_HOOKS = ['check-destructive.mjs', 'check-audit-ok.mjs', 'check-quality-gates.mjs', 'enforce-repo-rules.mjs'];
export const PRE_ACTION_MATCHERS = ['Bash', 'PowerShell'];

/** A settings hook-határ sértései (üres tömb = megfelel). Tiszta függvény. */
export function hookScopeViolations(settings) {
  const out = [];
  // A disableAllHooks: true minden hookot kikapcsol — az őr ilyenkor nem lehet zöld (PR #548 Sourcery).
  if (settings?.disableAllHooks !== undefined && settings.disableAllHooks !== false) {
    out.push(`disableAllHooks: minden hook kikapcsolva (${JSON.stringify(settings.disableAllHooks)})`);
  }
  const hooks = settings?.hooks ?? {};
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) { out.push(`${event}: a hook-lista nem tömb`); continue; }
    for (const [i, g] of groups.entries()) {
      const where = `${event}[${i}]`;
      if (TOOL_EVENTS.includes(event)) {
        const m = typeof g?.matcher === 'string' ? g.matcher : '';
        if (!APPROVED_MATCHERS.includes(m)) out.push(`${where}: nem szűk matcher (${JSON.stringify(g?.matcher ?? null)})`);
      }
      for (const h of g?.hooks ?? []) {
        const command = String(h?.command ?? '');
        if (h?.onFailure !== undefined && command !== GATE_HOOK_COMMAND) {
          out.push(`${where}: onFailure csak a kapu-hookon állhat (${h?.command})`);
        }
        // Részszöveges egyezés szándékosan: a művelet előtti hook bármilyen alakban máshol (pl. PostToolUse) sértés.
        if (event !== 'PreToolUse') {
          for (const file of PRE_ACTION_HOOKS) {
            if (command.includes(file)) out.push(`${where}: ${file} csak PreToolUse-on állhat (művelet előtt kell tiltania)`);
          }
        }
      }
    }
  }
  // Minden művelet előtti hook a PreToolUse Bash és PowerShell matcherén is regisztrálva, pontos paranccsal.
  const pre = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
  for (const file of PRE_ACTION_HOOKS) {
    for (const matcher of PRE_ACTION_MATCHERS) {
      const found = pre.some((g) => g?.matcher === matcher && (g?.hooks ?? []).some((h) => h?.command === hookCommand(file)));
      if (!found) out.push(`PreToolUse: ${file} hiányzik a(z) ${matcher} matcherről`);
    }
  }
  return out;
}

/** A .claude/settings.json verziókezelt-e, és ignorált-e (git ls-files / git check-ignore). */
export function settingsTracked(repoRoot, path = '.claude/settings.json') {
  const git = (args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const tracked = git(['ls-files', '--', path]) === path;
  let ignored = true;
  // A két parancs független forrást olvas: az ls-files az indexet, a `check-ignore --no-index` csak a .gitignore-szabályokat
  // (az indexet nem), így nincs közös állapot, amely a két hívás között eltérhetne. Egy egyidejű index-módosítás az
  // egyetlen-pillanatképes olvasás után ugyanúgy elavulttá tenné az eredményt — ez pillanatnyi állításra épülő tesztőr,
  // az index-ütközést pedig a git saját index.lock-ja kezeli (PR #548 Sourcery, TOCTOU-értékelés).
  // check-ignore kilépési kódja: 0 = ignorált, 1 = nem ignorált, 128 = git-hiba (szigorúan ignoráltnak vesszük).
  try { git(['check-ignore', '-q', '--no-index', '--', path]); } catch (e) { ignored = e?.status !== 1; }
  return { tracked, ignored };
}
