// docs/specs/2026-11-25-feladat-nyilvantartas.md „Integráció”: a gate:pr és a gate:merge végén a feladat-nyilvántartás
// szinkronja (scripts/kovetelmeny/feladat.py szinkron) NEM blokkoló lépésként fut: csak ha a helyi DB létezik (CI-ben nincs),
// FELADAT_SZINKRON=off kikapcsolja; hiba / időtúllépés / hiányzó Python csak naplósor — sosem dob, a kapu eredményét nem érinti.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PYTHONS = [['python3'], ['py', '-3'], ['python']];

export function feladatDbPath(env = process.env) {
  if (env.KOVETELMENY_DB) return env.KOVETELMENY_DB;
  const local = env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  return join(local, 'hermes', 'projekt-tudas', 'websuli', 'kovetelmenyek.db');
}

/** @returns {{ran: boolean, ok?: boolean, note: string}} */
export function feladatSzinkron({ exec, root, env = process.env, timeoutMs = 120_000 }) {
  try {
    if (String(env.FELADAT_SZINKRON || '').toLowerCase() === 'off') return { ran: false, note: 'kikapcsolva (FELADAT_SZINKRON=off)' };
    const db = feladatDbPath(env);
    if (!existsSync(db)) return { ran: false, note: 'nincs helyi feladat-DB — kihagyva' };
    const script = join(root, 'scripts', 'kovetelmeny', 'feladat.py');
    let last = null;
    for (const [cmd, ...pre] of PYTHONS) {
      const r = exec(cmd, [...pre, '-B', script, '--db', db, '--repo', root, '-q', 'szinkron'], { cwd: root, timeoutMs });
      // csak a ténylegesen hiányzó értelmező (ENOENT) után próbálunk másikat; a realExec időtúllépésnél is 127-et ad
      // (lib.mjs realExec: r.status ?? (r.error ? 127 : 1)) — az egyszeri, nem blokkoló hiba, nincs újraindítás
      if (/ETIMEDOUT|timed out/i.test(`${r.stderr ?? ''}`)) return { ran: true, ok: false, note: `szinkron időtúllépés (${Math.round(timeoutMs / 1000)} s, nem blokkoló)` };
      if (r.code === 127 && /ENOENT|not found|nem található/i.test(`${r.stderr ?? ''}`)) { last = r; continue; }
      const out = `${r.stdout ?? ''}`.trim().split('\n').filter(Boolean).pop() ?? '';
      if (r.code === 0) return { ran: true, ok: true, note: out || 'szinkron kész' };
      const err = `${r.stderr ?? ''}`.trim().split('\n').filter(Boolean)[0] ?? `kilépési kód ${r.code}`;
      return { ran: true, ok: false, note: `szinkron hiba (nem blokkoló): ${err.slice(0, 200)}` };
    }
    return { ran: false, ok: false, note: `nincs Python (${`${last?.stderr ?? ''}`.trim().slice(0, 120)})` };
  } catch (e) {
    return { ran: false, ok: false, note: `szinkron hiba (nem blokkoló): ${String(e?.message ?? e).slice(0, 200)}` };
  }
}
