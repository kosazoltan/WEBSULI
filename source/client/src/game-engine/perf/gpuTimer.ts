/**
 * GPU-időmérés `EXT_disjoint_timer_query_webgl2`-vel a `?perf=1` panelhez (terv: docs/specs/2026-11-17-kockavadasz-telefon.md, 6.).
 *
 * Külön modul, hogy a kontextusvesztés / visszaállás hamis `gl`-lel egységtesztelhető legyen (PR #504, Codex P2): vesztés után a
 * függő lekérdezések érvénytelenek — a `getQueryParameter` soha nem jelez eredményt —, ezért a sort és a régi mintákat el kell
 * dobni, visszaálláskor pedig a kiterjesztést újra le kell kérni; különben a GPU-érték végleg befagy.
 */

type TimerExt = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };

/** A WebGL2-kontextus itt használt része (a valódi `WebGL2RenderingContext` megfelel neki). */
export type GpuTimerGl = {
  readonly QUERY_RESULT_AVAILABLE: number;
  readonly QUERY_RESULT: number;
  getExtension(name: string): unknown;
  createQuery(): WebGLQuery | null;
  deleteQuery(query: WebGLQuery | null): void;
  beginQuery(target: number, query: WebGLQuery): void;
  endQuery(target: number): void;
  getQueryParameter(query: WebGLQuery, pname: number): unknown;
  getParameter(pname: number): unknown;
  isContextLost(): boolean;
};

export type GpuTimer = {
  /** Van-e (jelenleg) időzítő-kiterjesztés. */
  readonly available: boolean;
  /** A kész lekérdezések beolvasása (a képkocka elején). */
  poll(): void;
  /** Mérés indítása a `render()` előtt; `skip` alatt (szinkron próba) nem indít. */
  begin(skip: boolean): void;
  /** Mérés lezárása a `render()` után. */
  end(): void;
  /** A minták átlaga ms-ban; null, ha nincs minta. */
  average(): number | null;
  /** A minták eldobása (kapcsoló után a régi és az új költség ne keveredjen). */
  clearSamples(): void;
  /** Kontextusvesztés: a függő lekérdezések és a régi minták eldobva (a `gl` hívása nélkül — a kontextus halott). */
  contextLost(): void;
  /** Visszaállás: a kiterjesztés újra lekérve, a mérés folytatódik. */
  contextRestored(): void;
  dispose(): void;
  /** Tesztekhez: a függő lekérdezések száma. */
  readonly pendingCount: number;
};

const MAX_PENDING = 4;
const MAX_SAMPLES = 30;
const EXT_NAME = "EXT_disjoint_timer_query_webgl2";

export function createGpuTimer(gl: GpuTimerGl | null): GpuTimer {
  let ext = (gl?.getExtension(EXT_NAME) ?? null) as TimerExt | null;
  const samples: number[] = [];
  const pending: WebGLQuery[] = [];
  let active: WebGLQuery | null = null;

  const dropQueries = (deleteThem: boolean) => {
    if (deleteThem && gl) {
      if (active) gl.deleteQuery(active);
      for (const q of pending) gl.deleteQuery(q);
    }
    active = null;
    pending.length = 0;
  };

  return {
    get available() {
      return ext !== null;
    },
    get pendingCount() {
      return pending.length;
    },
    poll() {
      if (!ext || !gl) return;
      // Biztonsági háló arra az esetre, ha a vesztés eseménye nem jutott el ide: halott kontextuson a sor soha nem ürülne.
      if (gl.isContextLost()) {
        dropQueries(false);
        samples.length = 0;
        return;
      }
      while (pending.length) {
        const q = pending[0]!;
        if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
        if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
          samples.push((gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6);
          if (samples.length > MAX_SAMPLES) samples.shift();
        }
        gl.deleteQuery(q);
        pending.shift();
      }
    },
    begin(skip) {
      if (active && ext && gl) {
        // Review #504 L5: az előző képkocka `render()`-je kivételt dobott, az `end()` elmaradt. A nyitott mérés két képkockát
        // fogna át (torz minta), ezért lezárjuk és eldobjuk; ezután rendesen indul az új mérés.
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        gl.deleteQuery(active);
        active = null;
      }
      if (!ext || !gl || skip || pending.length >= MAX_PENDING) return;
      const q = gl.createQuery();
      if (!q) return;
      gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
      active = q;
    },
    end() {
      if (!active || !ext || !gl) return;
      gl.endQuery(ext.TIME_ELAPSED_EXT);
      pending.push(active);
      active = null;
    },
    average() {
      return samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : null;
    },
    clearSamples() {
      samples.length = 0;
    },
    contextLost() {
      dropQueries(false);
      samples.length = 0;
    },
    contextRestored() {
      dropQueries(false);
      samples.length = 0;
      ext = (gl?.getExtension(EXT_NAME) ?? null) as TimerExt | null;
    },
    dispose() {
      if (active && ext && gl && !gl.isContextLost()) gl.endQuery(ext.TIME_ELAPSED_EXT);
      dropQueries(gl !== null && !gl.isContextLost());
      samples.length = 0;
    },
  };
}
