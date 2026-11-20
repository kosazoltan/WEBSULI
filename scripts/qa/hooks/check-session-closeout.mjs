#!/usr/bin/env node
// Stop hook: session-zárás csak kérés-összevetés után (docs/specs/2026-11-20-session-zaras.md D6, D7; skill: websuli-session-zaras).
// Tulajdonosi utasítás 2026-11-20. A Claude Code hook-szerződése (code.claude.com/docs/en/hooks, „Stop”): bemenet
// `stop_hook_active`, `last_assistant_message`, `background_tasks`, `session_crons`, `transcript_path`; tiltás
// `{"decision":"block","reason":…}`. Arányos: CSAK akkor tilt, ha (1) a válasz zárásra utal, (2) a legutóbbi zöld closeout óta
// van tulajdonosi üzenet, (3) nem fut háttérfeladat / ütemezett ébresztés, (4) `stop_hook_active` hamis (második körben nem tilt
// újra — a tulajdonosnak látható figyelmeztetést ad, így végtelen ciklus nincs). Rövid, közbenső válasznál nem olvas átiratot.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { evidenceDir, isMain, readEvidence } from '../gates/lib.mjs';
import { scanOwnerSince, sessionIdOf } from '../session-closeout.mjs';

/** Erős zárás-jel: bárhol a válaszban. */
const STRONG = /z[áa]r[óo] ?jelent[ée]s|[öo]sszefoglal[óoá]|higi[ée]ni|rendrak[áa]s|(?:session|munkamenet)[- ]?(?:v[ée]g|z[áa]r)|lez[áa]r(?:om|tam|va|tuk)|befejeztem|minden k[ée]sz|felel[őo]s nyilatkozat|final report|summary|wrap[- ]?up|all done|closing report/i;
/** Gyenge jel: csak hosszú (jelentés-szerű) válaszban számít. */
const WEAK = /\b(?:k[ée]sz|elk[ée]sz[üu]lt(?:ek)?|done|completed|finished)\b|elkészült/i;
export const WEAK_MIN_CHARS = 600;

export function isClosingMessage(msg) {
  const m = String(msg ?? '');
  if (!m.trim()) return false;
  if (STRONG.test(m)) return true;
  return m.length >= WEAK_MIN_CHARS && WEAK.test(m);
}

const out = (obj) => process.stdout.write(JSON.stringify(obj));
const samePath = (a, b) => {
  const n = (p) => resolve(String(p ?? '')).replace(/\\/g, '/');
  return process.platform === 'win32' ? n(a).toLowerCase() === n(b).toLowerCase() : n(a) === n(b);
};

/** A bizonyíték-tár a hook munkakönyvtárának repójából; nem git-repó → null. A git időtúllépése hiba (a hívó dönt). */
function evDirFor(cwd) {
  if (process.env.WEBSULI_QA_EVIDENCE_DIR) return process.env.WEBSULI_QA_EVIDENCE_DIR;
  let common;
  try {
    common = execFileSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim();
  } catch (e) {
    if (e?.code === 'ETIMEDOUT' || e?.signal) throw new Error('a git nem válaszolt 5 s alatt');
    return null; // gyors, nem nulla kilépés: nem git-repó — nincs mit ellenőrizni
  }
  return evidenceDir(isAbsolute(common) ? common : resolve(cwd, common));
}

function readFrom(path, offset) {
  if (!offset) return readFileSync(path);
  const size = statSync(path).size;
  const buf = Buffer.alloc(Math.max(0, size - offset));
  const fd = openSync(path, 'r');
  try { readSync(fd, buf, 0, buf.length, offset); } finally { closeSync(fd); }
  return buf;
}

function reasonText(n, transcript) {
  return [
    `[session-zárás] ${n} feldolgozatlan tulajdonosi üzenet van a legutóbbi zöld kérés-összevetés óta (tulajdonosi utasítás 2026-11-20).`,
    'A session lezárása és a higiénia előtt kötelező (skill: websuli-session-zaras):',
    `1) node scripts/qa/session-closeout.mjs collect --transcript "${transcript}"`,
    '2) a kiírt closeout-*.md minden tételéhez állapot + bizonyíték — az elmaradt kérést előbb pótold, vagy tedd kanban-jegyre / tulajdonosi kérdésre;',
    `3) node scripts/qa/session-closeout.mjs verify --transcript "${transcript}" — amíg nem zöld, pótolj és ellenőrizz újra;`,
    '4) felelős nyilatkozat a listában, és csak ezután a higiénia (npm run session:hygiene).',
  ].join('\n');
}

function main() {
  let raw = '';
  try { raw = readFileSync(0, 'utf8'); } catch { return; } // nincs bemenet: nincs mit eldönteni
  let p;
  try { p = JSON.parse(raw || 'null'); } catch { return; } // olvashatatlan bemenet: a Stop-on tiltani nem lehet értelmesen
  if (!p || typeof p !== 'object' || Array.isArray(p) || p.hook_event_name !== 'Stop') return;
  if ((Array.isArray(p.background_tasks) && p.background_tasks.length) || (Array.isArray(p.session_crons) && p.session_crons.length)) return;
  const closing = isClosingMessage(p.last_assistant_message);
  const again = p.stop_hook_active === true;
  if (!closing && !again) return;
  const transcript = p.transcript_path;
  try {
    if (!transcript || !existsSync(transcript)) return;
    const ev = evDirFor(p.cwd || process.cwd());
    if (!ev) return;
    const session = p.session_id ? String(p.session_id).replace(/[^A-Za-z0-9_.-]+/g, '_') : sessionIdOf(transcript);
    const ok = readEvidence(ev, `closeout-ok-${session}`);
    const size = statSync(transcript).size;
    const valid = ok && samePath(ok.transcript, transcript) && Number.isInteger(ok.transcriptBytes) && ok.transcriptBytes >= 0 && ok.transcriptBytes <= size;
    const offset = valid ? ok.transcriptBytes : 0;
    const buf = readFrom(transcript, offset);
    const { count } = scanOwnerSince(buf, 0, valid && typeof ok.originBased === 'boolean' ? { hasOrigin: ok.originBased || buf.includes('"origin":{') } : {});
    if (!count) return;
    if (again) {
      out({ systemMessage: `[session-zárás] Figyelem: a kérés-összevetés hiányzik — ${count} tulajdonosi üzenet nincs összevetve (websuli-session-zaras skill; node scripts/qa/session-closeout.mjs collect / verify).` });
      return;
    }
    out({ decision: 'block', reason: reasonText(count, transcript) });
  } catch (e) {
    if (!closing || again) return;
    out({ decision: 'block', reason: `[session-zárás] A kérés-összevetés hookja hibára futott (${String(e?.message ?? e).split('\n')[0]}). A zárás előtt futtasd kézzel: node scripts/qa/session-closeout.mjs collect --transcript "${transcript}", majd verify. Ha a hiba tartós: állj meg, és jelezd a tulajdonosnak (a hookot csak javítani szabad).` });
  }
}

if (isMain(import.meta.url)) main();
