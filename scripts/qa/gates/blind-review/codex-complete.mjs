#!/usr/bin/env node
// Codex CLI-burok a GPT teljesítési őrrel és díjmentes életjel-felügyelettel (docs/specs/2026-11-20-gpt-teljesitesi-or.md, T8).
//
// A GPT-modellek két módon állnak meg csendben: (1) a folyamat kilép, de a válasz terv / kérdés / félbehagyott munka; (2) a folyamat
// él, de nem dolgozik (pl. hálózati újracsatlakozási hurok). A burok mindkettőt API-hívás NÉLKÜL észleli (folyamat, a kimeneti fájlok
// mérete, időbélyeg), és csak a félbehagyott munka folytatásához hív API-t: `codex exec resume <munkamenet-azonosító> -` ugyanabban a
// munkamenetben, a pontos hiánylistával (szabványos bemeneten). A `--last` nem használható (más munkamenetet folytathatna).
//
// Szintaxis a telepített codex-cli 0.167.2 súgója szerint (2026-11-20): `codex exec [OPTIONS] [PROMPT]` (`-` = szabványos bemenet),
// `--json`, `-o/--output-last-message <FILE>`; `codex exec resume [OPTIONS] [SESSION_ID] [PROMPT]` — a resume-nál nincs `-s` / `-C`,
// ezért `-c sandbox_mode="workspace-write"`, és a munkafából indítjuk.
//
// Használat:
//   node scripts/qa/gates/blind-review/codex-complete.mjs --cwd <munkafa> --prompt <megbízás.md> --out <válasz.md>
//     [--goal <cél.md>] [--review] [--model gpt-6.2-sol] [--stall-min 25] [--max-resumes ≤3] [--max-net ≤8] [--total <feladatszám>]
//   --review: a vak-ellenőr jelentés-szabályai (szakaszok + hibakereső pontok a sablonból és a célból); nélküle általános mód
//   (zárósor + tiltott fordulatok + nem üres válasz).

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCompleteness, continuationPrompt, debugPoints } from './completeness.mjs';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** A munkamenet-azonosító a `--json` eseményfolyamból (thread_id / session_id), vagy a szöveges napló `session id:` sorából. */
export function sessionIdFrom(stdout) {
  for (const line of String(stdout ?? '').split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('{')) {
      try {
        const j = JSON.parse(t);
        const v = j.thread_id ?? j.session_id ?? j.msg?.session_id ?? j.payload?.id ?? ((/thread|session/.test(String(j.type)) && j.id) || null);
        if (typeof v === 'string' && UUID.test(v)) return v.match(UUID)[0];
      } catch { /* nem JSON sor */ }
    }
    const m = /session id:\s*([0-9a-f-]{36})/i.exec(t);
    if (m) return m[1];
  }
  return null;
}

/** A Codex „tokens used” értéke: a szám a KÖVETKEZŐ sorban is állhat, szóközös / vesszős ezres tagolással („380 573”). */
export function tokensUsed(text) {
  const m = /tokens used[:\s]*\n?\s*([\d][\d\s.,]*)/i.exec(String(text ?? ''));
  if (!m) return null;
  const n = Number(m[1].replace(/[\s.,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Hálózati beragadás a naplóban (élő folyamattal is): újracsatlakozási hurok, megszakadt stream, 429. */
export function networkStall(text) {
  return /Reconnecting\.\.\.\s*5\/5|stream disconnected|error sending request|Connection failed|\b429\b|rate limit/i.test(String(text ?? '').slice(-4000));
}

/** A Codex élő munkamenet-fájlja (~/.codex/sessions/ÉÉÉÉ/HH/NN/rollout-*<id>.jsonl) — csak olvasás, díjmentes. */
export function sessionFile(id, base = join(homedir(), '.codex', 'sessions')) {
  if (!id || !existsSync(base)) return null;
  const walk = (d, depth) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory() && depth < 3) { const r = walk(p, depth + 1); if (r) return r; }
      else if (e.isFile() && e.name.startsWith('rollout-') && e.name.includes(id) && e.name.endsWith('.jsonl')) return p;
    }
    return null;
  };
  try { return walk(base, 0); } catch { return null; }
}

const size = (p) => { try { return p && existsSync(p) ? statSync(p).size : 0; } catch { return 0; } };

/**
 * Valódi futtató életjel-felügyelettel: a folyamatot csak akkor állítja le, ha `stallMs` ideig sem a kimenete, sem a figyelt fájlok
 * (válasz, munkamenet-fájl) nem nőnek. Díjmentes: csak helyi méret / időbélyeg.
 */
export function watchedExec(file, args, { input, cwd, stallMs = 25 * 60_000, pollMs = 60_000, watch = () => [], netPolls = 3 } = {}) {
  return new Promise((done) => {
    let stdout = '';
    let stderr = '';
    const posix = process.platform !== 'win32';
    // POSIX: saját folyamatcsoport — leállításkor a teljes fa (unokák is) leáll (vak ellenőr L11)
    const child = spawn(file, args, { cwd, shell: !posix && file === 'codex', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], detached: posix });
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    if (input != null) child.stdin.end(input); else child.stdin.end();
    let last = -1;
    let still = 0;
    let netSeen = 0;
    let verdict = null; // { stalled } | { network } — csak a fa lezárása UTÁN tér vissza (a folytatás nem indulhat élő régi fa mellett)
    const killTree = () => {
      try {
        if (!posix) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
      } catch { /* közben kilépett */ }
    };
    const timer = setInterval(() => {
      const total = stdout.length + stderr.length + watch(stdout).reduce((n, p) => n + size(p), 0);
      if (total === last) still += pollMs; else { still = 0; last = total; }
      // élő hálózati hurok: a kimenet nő (a csend-óra nem jár le), de a vége folyamatosan kapcsolódási hiba (vak ellenőr L11)
      netSeen = networkStall(`${stdout}\n${stderr}`) ? netSeen + 1 : 0;
      if (still >= stallMs || netSeen >= netPolls) {
        clearInterval(timer);
        verdict = still >= stallMs ? { stalled: true } : { network: true };
        killTree();
      }
    }, pollMs);
    child.on('error', (e) => { clearInterval(timer); done({ code: 127, stdout, stderr: `${stderr}\n${e.message}`, stalled: false }); });
    child.on('close', (code) => {
      clearInterval(timer);
      if (verdict) done({ code: 124, stdout, stderr, stalled: Boolean(verdict.stalled), network: Boolean(verdict.network) });
      else done({ code: code ?? 1, stdout, stderr, stalled: false });
    });
  });
}

const TECH_PROMPT = 'A futás technikai okból (hálózat / beragadás / gépújraindítás) megszakadt. Folytasd pontosan ott, ahol abbahagytad; a kész részt ne írd újra. Ez NEM interaktív futás: senki nem válaszol, nincs következő üzenet. A teljesítési szerződés érvényes, a válasz utolsó sora a TELJESSÉG-zárósor.';

/**
 * A burok magja (a futtató injektálható — tesztben hamis).
 * @returns {Promise<{ ok: boolean, resumes: number, netRetries: number, reason: string|null, result: object|null, sessionId: string|null, tokens: number }>}
 */
/** Kemény plafonok (vak ellenőr L7): a kapcsoló csak lefelé állíthat; nem egész / határon kívüli érték az indítás ELŐTT hiba. */
export const MAX_RESUMES = 3;
export const MAX_NET = 8;
const limit = (v, name, hard) => {
  if (!Number.isInteger(v) || v < 0 || v > hard) throw new RangeError(`a ${name} 0 és ${hard} közötti egész lehet (kemény plafon) — kapott: ${v}`);
  return v;
};

export async function runCodexComplete({ exec, prompt, out, points = [], mode = 'review', maxResumes = MAX_RESUMES, maxNet = MAX_NET, execArgs = [], resumeArgs = [], sessionId = null, onEvent = () => {}, expectedTotal = null }) {
  limit(maxResumes, '--max-resumes', MAX_RESUMES);
  limit(maxNet, '--max-net', MAX_NET);
  let id = sessionId;
  let resumes = 0;
  let netRetries = 0;
  let tokens = 0;
  const check = () => checkCompleteness(existsSync(out) ? readFileSync(out, 'utf8') : '', { points, mode, expectedTotal });
  let r = id
    ? await exec('codex', ['exec', 'resume', id, '-', '--json', ...resumeArgs, '-o', out], { input: TECH_PROMPT })
    : await exec('codex', ['exec', '--json', ...execArgs, '-o', out, '-'], { input: prompt });
  for (;;) {
    id = id ?? sessionIdFrom(`${r.stdout}\n${r.stderr}`);
    tokens += tokensUsed(`${r.stdout}\n${r.stderr}`) ?? 0;
    const c = check();
    const technical = r.stalled || r.network || (r.code !== 0 && networkStall(`${r.stdout}\n${r.stderr}`));
    if (!technical && r.code === 0 && c.ok) return { ok: true, resumes, netRetries, reason: null, result: c, sessionId: id, tokens };
    if (!id) return { ok: false, resumes, netRetries, reason: 'nincs munkamenet-azonosító a Codex kimenetében — a munka nem folytatható biztonságosan (a --last más munkamenetet folytathatna)', result: c, sessionId: null, tokens };
    let input;
    if (technical) {
      netRetries += 1;
      if (netRetries > maxNet) return { ok: false, resumes, netRetries, reason: `${maxNet} hálózati / beragadási újrapróba után is megszakad — emberi döntés kell`, result: c, sessionId: id, tokens };
      input = TECH_PROMPT;
      onEvent({ type: 'technical', netRetries, stalled: Boolean(r.stalled) });
    } else {
      resumes += 1;
      if (resumes > maxResumes) return { ok: false, resumes: maxResumes, netRetries, reason: `${maxResumes} folytatás után is hiányos — ${c.problems.slice(0, 4).join(' | ')}`, result: c, sessionId: id, tokens };
      input = `${continuationPrompt(c)}\n\nEz NEM interaktív futás: senki nem válaszol. Most, ebben a körben fejezd be TELJESEN.`;
      onEvent({ type: 'incomplete', resumes, missing: c.missing, problems: c.problems });
    }
    r = await exec('codex', ['exec', 'resume', id, '-', '--json', ...resumeArgs, '-o', out], { input });
  }
}

const arg = (a, n, d) => { const i = a.indexOf(n); return i >= 0 && i + 1 < a.length ? a[i + 1] : d; };

async function main() {
  const a = process.argv.slice(2);
  const cwd = resolve(arg(a, '--cwd', process.cwd()));
  const out = resolve(arg(a, '--out', ''));
  const promptFile = arg(a, '--prompt', null);
  const resumeId = arg(a, '--resume', null);
  if (!out || (!promptFile && !resumeId)) { process.stderr.write('[codex-complete] HIBA: --out és --prompt (vagy --resume <azonosító>) kötelező\n'); return 1; }
  const model = arg(a, '--model', 'gpt-6.2-sol');
  const review = a.includes('--review');
  const here = fileURLToPath(new URL('.', import.meta.url));
  const points = review ? debugPoints(readFileSync(join(here, '..', 'vak-ellenor-megbizas.md'), 'utf8'), arg(a, '--goal', null) ? readFileSync(arg(a, '--goal'), 'utf8') : '') : [];
  const stallMs = Number(arg(a, '--stall-min', 25)) * 60_000;
  let sid = resumeId;
  const exec = (file, args, { input }) => watchedExec(file, args, { input, cwd, stallMs, watch: (so) => [out, sessionFile(sid ?? sessionIdFrom(so))] });
  const total = arg(a, '--total', null);
  let r;
  try {
    r = await runCodexComplete({
    exec, prompt: promptFile ? readFileSync(promptFile, 'utf8') : '', out, points, mode: review ? 'review' : 'generic', sessionId: resumeId,
    maxResumes: Number(arg(a, '--max-resumes', MAX_RESUMES)), maxNet: Number(arg(a, '--max-net', MAX_NET)), expectedTotal: total == null ? null : Number(total),
    execArgs: ['-m', model, '-c', 'model_reasoning_effort=high', '-s', 'workspace-write', '-C', cwd],
    resumeArgs: ['-m', model, '-c', 'model_reasoning_effort=high', '-c', 'sandbox_mode="workspace-write"'],
    onEvent: (e) => { if (e.sessionId) sid = e.sessionId; process.stdout.write(`[codex-complete] ${JSON.stringify(e)}\n`); },
    });
  } catch (e) {
    if (!(e instanceof RangeError)) throw e;
    process.stderr.write(`[codex-complete] HIBA: ${e.message}\n`);
    return 1;
  }
  process.stdout.write(`[codex-complete] ${r.ok ? 'TELJES' : 'NEM TELJES'} — folytatás: ${r.resumes}, technikai újrapróba: ${r.netRetries}, tokenek: ${r.tokens}${r.reason ? `; ok: ${r.reason}` : ''}\n`);
  return r.ok ? 0 : 5;
}

if (process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1])) main().then((c) => process.exit(c));
