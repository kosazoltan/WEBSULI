// Kilépési nyom és zárvárási életjel a vak-ellenőr futtatóhoz (docs/specs/2026-11-20-gpt-teljesitesi-or.md, T13–T14).
//
// Cél: a futtató MINDEN kilépési úton egy géppel olvasható sort írjon a naplóba (stderr):
//   [blind-review] KILÉPÉS <kód> — ok: <ok>; utolsó állapot: szakasz <…>, kör <n>, eszköz <…>, várakozás: <…>
// Ha ez a sor HIÁNYZIK a napló végéről, a folyamatot kívülről, kezelhetetlenül állították le (Windows TerminateProcess /
// `taskkill /F`, `kill -9`, gépleállás) — ez maga is diagnózis. Az ok nélküli kilépés („ismeretlen”) azt jelenti, hogy a
// futtató nem a saját kilépési útján ért véget (pl. kiürült eseményhurok vagy ok nélküli process.exit).
import { writeSync } from 'node:fs';

const SIGNALS = ['SIGTERM', 'SIGHUP', 'SIGBREAK'];
const UNKNOWN = 'ismeretlen — a futtató nem adott okot (kiürült eseményhurok vagy ok nélküli kilépés)';

/**
 * @param {{ write?: (s: string) => void, mask?: (s: string) => string }} [opts]
 */
export function createExitTrace({ write = (s) => { try { writeSync(2, s); } catch { /* a napló már nem írható */ } }, mask = (s) => s } = {}) {
  const state = { phase: 'indulás', round: 0, tool: null, waiting: null };
  let reason = null;
  let masker = mask;
  let settled = false;
  const one = (s) => masker(String(s ?? '')).replace(/\s+/g, ' ').trim().slice(0, 400);
  const api = {
    state,
    /** Az utolsó ismert állapot frissítése (szakasz, kör, eszköz, várakozás). */
    set(patch) { Object.assign(state, patch); },
    /** A kilépés oka — az ELSŐ megadott ok marad (a későbbi, következményes ok nem írja felül). */
    reason(text) { if (reason == null) reason = one(text); },
    get reasonText() { return reason; },
    setMask(fn) { masker = fn; },
    /** A fő ígéret teljesült (a futtató a saját útján tér vissza). */
    settle() { settled = true; },
    line(code) {
      const w = state.waiting ? one(state.waiting) : 'nincs';
      return `[blind-review] KILÉPÉS ${code} — ok: ${reason ?? UNKNOWN}; utolsó állapot: szakasz ${one(state.phase)}, kör ${state.round}, eszköz ${state.tool ? one(state.tool) : '—'}, várakozás: ${w}\n`;
    },
    /**
     * A kezelők telepítése: 'exit' (mindig a KILÉPÉS-sor), 'uncaughtException' / 'unhandledRejection' (ok + kilépés 2),
     * SIGTERM / SIGHUP / SIGBREAK (ok + kilépés 2), 'beforeExit' (kiürült eseményhurok a fő ígéret teljesülése előtt).
     * A SIGINT-et a futtató maga kezeli (rendezett megállás), ide csak az állapotot jegyezzük.
     * `onSignal`: a jelzésre a kilépés ELŐTT lefutó takarítás (saját nehéz gyerekfolyamat-fa és konténer leállítása) — a gépi zárat
     * a folyamat 'exit' kezelője csak ezután engedi el (vak ellenőr L13). Legfeljebb `signalGraceMs`-ig várunk rá.
     */
    install(proc = process, { onSignal = null, signalGraceMs = 60_000 } = {}) {
      proc.on('exit', (code) => write(api.line(code)));
      proc.on('uncaughtException', (e) => {
        api.reason(`kezeletlen kivétel: ${e?.stack ?? e?.message ?? e}`);
        proc.exit(2);
      });
      proc.on('unhandledRejection', (r) => {
        api.reason(`kezeletlen ígéret-elutasítás: ${r?.stack ?? r?.message ?? r}`);
        proc.exit(2);
      });
      let stopping = false;
      const onSig = async (sig) => {
        api.reason(`jelzés: ${sig} (külső leállítási kérés)`);
        if (stopping) return;
        stopping = true;
        if (onSignal) {
          let timer;
          const grace = new Promise((r) => { timer = setTimeout(r, signalGraceMs); });
          try { await Promise.race([Promise.resolve().then(onSignal), grace]); } catch { /* a takarítás hibája a kilépést nem akadályozza */ }
          clearTimeout(timer);
        }
        proc.exit(2);
      };
      for (const sig of SIGNALS) {
        try { proc.on(sig, () => { onSig(sig); }); } catch { /* a platformon nem kérhető */ }
      }
      proc.on('beforeExit', () => {
        // Elveszett fő ígéret: nem sikeres kilépés (vak ellenőr L12) — a sor-futtató ne kapjon 0-t jelentés nélkül.
        if (!settled) { api.reason('kiürült eseményhurok — a fő ígéret nem teljesült (elveszett várakozás / időzítő)'); proc.exitCode = 2; }
      });
      return api;
    },
  };
  return api;
}

/**
 * Zárvárási életjel: a gépi zár minden lekérdezésekor hívják; legfeljebb `everyMs`-onként (alapból percenként) ad egy
 * naplósort és szívverést — így a díjmentes felügyelet meg tudja különböztetni a várakozást a beragadástól.
 * Az első lekérdezéskor azonnal jelez (a várakozás kezdete).
 * @param {{ everyMs?: number, say: (s: string) => void, beat?: (data: object) => void, now?: () => number }} opts
 * @returns {(p: { tool: string, waitedMs: number, holder: string|null }) => boolean} igaz, ha most jelzett
 */
export function lockWaitReporter({ everyMs = 60_000, say, beat = () => {}, now = () => Date.now() }) {
  let last = null;
  return ({ tool, waitedMs, holder }) => {
    const t = now();
    if (last !== null && t - last < everyMs) return false;
    last = t;
    const m = Math.floor(waitedMs / 60_000);
    const s = Math.floor((waitedMs % 60_000) / 1000);
    say(`zárvárás: ${tool} — ${m} perc ${s} mp óta vár a gépi zárra; gazda: ${holder ? String(holder).replace(/\s+/g, ' ').slice(0, 160) : '—'}`);
    beat({ phase: 'lock-wait', tool, waitedMs, holder: holder ? String(holder).slice(0, 160) : null });
    return true;
  };
}
