// Állapot-ellenőrzők közös alapja (docs/minosegkapuk.md „Állapot-ellenőrzők”; terv: docs/specs/2026-11-17-allapot-ellenorok.md).
// Eredménymodell, emberi / JSON kimenet, kilépési kódok (0 = nincs FAIL, 1 = FAIL, 2 = a szkript nem tudott futni), titok-szűrés.
// Csak Node beépített modulok; a szűrő a kapuk közös `redact`-ja (scripts/qa/gates/lib.mjs).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redact } from '../gates/lib.mjs';

export { redact };
export const CHECKS_DIR = dirname(fileURLToPath(import.meta.url));
export const LEVELS = Object.freeze({ FAIL: 'FAIL', WARN: 'WARN', INFO: 'INFO', SKIP: 'SKIP' });

export class CannotRun extends Error {}

export function loadChecksConfig() {
  return JSON.parse(readFileSync(join(CHECKS_DIR, 'checks.config.json'), 'utf8'));
}

/** Egy ellenőrző jelentése. `where`: fájl:sor vagy azonosító; `msg`: mit és mit tegyél. Minden szöveg a `redact` szűrőn megy át. */
export function createReport(name) {
  const items = [];
  return {
    name,
    items,
    add(level, code, where, msg) {
      items.push({ level, code, where: redact(String(where ?? '')), msg: redact(String(msg ?? '')) });
    },
    count(level) { return items.filter((i) => i.level === level).length; },
    exitCode() { return items.some((i) => i.level === LEVELS.FAIL) ? 1 : 0; },
    render({ json = false } = {}) {
      const summary = { FAIL: this.count('FAIL'), WARN: this.count('WARN'), INFO: this.count('INFO'), SKIP: this.count('SKIP') };
      if (json) return JSON.stringify({ check: name, exitCode: this.exitCode(), summary, items }, null, 2);
      const lines = items.map((i) => `[${name}] ${i.level.padEnd(4)} ${i.code}${i.where ? ` — ${i.where}` : ''}: ${i.msg}`);
      lines.push(`== ${name}: ${summary.FAIL} FAIL, ${summary.WARN} WARN, ${summary.SKIP} SKIP, ${summary.INFO} INFO — ${this.exitCode() ? 'BUKOTT' : 'RENDBEN'} ==`);
      return lines.join('\n');
    },
  };
}

/** Szinkron parancsfuttatás kilépési kóddal (nem dob). */
export function realRun(cmd, args = [], { cwd, timeoutMs = 10_000 } = {}) {
  try {
    const stdout = execFileSync(cmd, args, { cwd, encoding: 'utf8', timeout: timeoutMs, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    return { code: typeof e.status === 'number' ? e.status : 127, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? e.message ?? ''), timedOut: e.code === 'ETIMEDOUT' };
  }
}

/** A repó gyökere és a közös git-könyvtár (munkafából is a fő checkout közös tára). */
export function repoPaths(cwd = process.cwd(), run = realRun) {
  const top = run('git', ['rev-parse', '--show-toplevel'], { cwd });
  const common = run('git', ['rev-parse', '--git-common-dir'], { cwd });
  if (top.code !== 0 || common.code !== 0) throw new CannotRun('nem git-repó (git rev-parse sikertelen)');
  const c = common.stdout.trim();
  const commonDir = isAbsolute(c) ? c : resolve(cwd, c);
  return { root: top.stdout.trim(), commonDir, mainRoot: dirname(commonDir) };
}

export function isMainModule(metaUrl) {
  return Boolean(process.argv[1]) && resolve(fileURLToPath(metaUrl)) === resolve(process.argv[1]);
}

export function argValue(args, name) {
  const i = args.indexOf(name);
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  const eq = args.find((a) => a.startsWith(`${name}=`));
  return eq ? eq.slice(name.length + 1) : undefined;
}

/** Fő belépő: a `fn(args)` egy jelentést ad; kivétel → 2-es kilépés (a szkript nem tudott futni — ez is bukás). */
export async function runMain(name, fn) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  try {
    const report = await fn(args);
    process.stdout.write(`${report.render({ json })}\n`);
    process.exitCode = report.exitCode();
  } catch (e) {
    const msg = redact(String(e?.message ?? e));
    process.stdout.write(json ? `${JSON.stringify({ check: name, exitCode: 2, error: msg })}\n` : `[${name}] NEM FUTOTT LE: ${msg}\n`);
    process.exitCode = 2;
  }
}
