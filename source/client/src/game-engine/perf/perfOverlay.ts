/**
 * `?perf=1` — eszközön belüli teljesítmény-panel (terv: docs/specs/2026-11-17-kockavadasz-telefon.md, 6. szakasz).
 *
 * Valódi telefonhoz nincs hozzáférésünk, ezért a játék maga mutatja meg a saját képkocka-költségét egy képernyőfotózható
 * panelen, négy kapcsolóval (árnyék, felbontás, anyag, köd). A modul csak a paraméterrel töltődik be (dinamikus import),
 * semmit nem küld és nem tárol: nincs hálózati hívás, nincs tartós tároló, a `userAgent` rövidítve jelenik meg.
 *
 * A panel sima DOM (nem React), hogy a mérés ne indítson lap-szintű renderelést.
 */
import type * as THREE from "three";

import { FrameWindow, fmt, median, megapixels, shortUserAgent, type FrameSummary } from "./perfStats";

export type PerfResolution = 1 | 0.75 | 0.5;

export type PerfToggleState = { shadows: boolean; resolution: PerfResolution; simpleMaterials: boolean; fog: boolean };

export type PerfControls = {
  /** false, ha a grafikai szinten eleve nincs árnyéktérkép (a gomb ilyenkor le van tiltva). */
  shadowsAvailable: boolean;
  /** Az „Anyag” gomb két felirata: [alap, másik készlet]. Alap: PBR / egyszerű. */
  simpleLabel?: readonly [string, string];
  setShadows(on: boolean): void;
  setResolution(scale: PerfResolution): void;
  setSimpleMaterials(on: boolean): void;
  setFog(on: boolean): void;
};

export type PerfOverlayOptions = {
  renderer: THREE.WebGLRenderer;
  /** A vászon pozicionált szülője; a panel ebbe kerül (teljes képernyőn is látszik). */
  host: HTMLElement;
  tier: string;
  title: string;
  controls: PerfControls;
  /** A lap React-renderjeinek futó számlálója. */
  getReactRenders(): number;
};

export type PerfSnapshot = {
  running: boolean;
  tier: string;
  frame: FrameSummary | null;
  /** `EXT_disjoint_timer_query_webgl2` átlag (ms); null, ha a böngésző nem adja. */
  gpuMs: number | null;
  gpuTimerAvailable: boolean;
  /** A szinkron próba mediánja (ms): `render()` + a GPU bevárása `readPixels`-szel. */
  gpuProbeMs: number | null;
  calls: number;
  triangles: number;
  textures: number;
  geometries: number;
  programs: number;
  bufferWidth: number;
  bufferHeight: number;
  megapixels: number;
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  pixelRatio: number;
  longTasksPerSec: number | null;
  longTaskMsPerSec: number | null;
  reactRendersPerSec: number;
  rendererName: string;
  userAgent: string;
  toggles: PerfToggleState;
};

export type PerfOverlay = {
  /** A képkocka elején, a `requestAnimationFrame` időbélyegével. */
  frameStart(now: number): void;
  /** Közvetlenül a `renderer.render` előtt. */
  beforeRender(): void;
  /** Közvetlenül a `renderer.render` után. */
  afterRender(): void;
  snapshot(): PerfSnapshot;
  /** A következő `frames` képkockán szinkron méri a teljes képkocka-költséget; a medián ms, vagy null, ha a hurok áll. */
  runGpuProbe(frames?: number): Promise<number | null>;
  dispose(): void;
};

export type PerfWindowApi = {
  snapshot(): PerfSnapshot;
  controls: { set(patch: Partial<PerfToggleState>): void };
  runGpuProbe(frames?: number): Promise<number | null>;
};

type PerfWindow = { __websuliPerf?: PerfWindowApi };

type TimerExt = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number };

const WINDOW_MS = 4000;
const REFRESH_MS = 500;
const RESOLUTIONS: readonly PerfResolution[] = [1, 0.75, 0.5];

function button(testId: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.testid = testId;
  b.style.cssText =
    "pointer-events:auto;min-height:40px;min-width:40px;padding:4px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.45);" +
    "background:rgba(15,23,42,.92);color:#fff;font:600 12px/1.2 ui-monospace,Consolas,monospace;touch-action:manipulation;";
  return b;
}

export function createPerfOverlay(opts: PerfOverlayOptions): PerfOverlay {
  const { renderer, host, controls } = opts;
  const canvas = renderer.domElement;
  const gl = renderer.getContext();
  const gl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext ? gl : null;
  const timerExt = (gl2?.getExtension("EXT_disjoint_timer_query_webgl2") ?? null) as TimerExt | null;

  let rendererName = "";
  try {
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const raw: unknown = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    rendererName = typeof raw === "string" ? raw.slice(0, 60) : "";
  } catch {
    rendererName = "";
  }
  const userAgent = shortUserAgent(typeof navigator === "undefined" ? "" : navigator.userAgent);

  const toggles: PerfToggleState = { shadows: controls.shadowsAvailable, resolution: 1, simpleMaterials: false, fog: true };

  // --- DOM ---
  const root = document.createElement("div");
  root.dataset.testid = "bc-perf-panel";
  root.style.cssText =
    "position:absolute;top:4px;left:4px;z-index:60;max-width:min(300px,calc(100% - 8px));pointer-events:none;display:flex;" +
    "flex-direction:column;gap:4px;";
  const text = document.createElement("pre");
  text.dataset.testid = "bc-perf-text";
  text.style.cssText =
    "margin:0;padding:6px 8px;border-radius:8px;background:rgba(2,6,23,.82);color:#e2e8f0;font:11px/1.35 ui-monospace,Consolas,monospace;" +
    "white-space:pre-wrap;overflow-wrap:anywhere;";
  const row = document.createElement("div");
  row.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;";
  const bShadow = button("bc-perf-shadow");
  const bRes = button("bc-perf-res");
  const bMat = button("bc-perf-mat");
  const bFog = button("bc-perf-fog");
  const bProbe = button("bc-perf-probe");
  const bCopy = button("bc-perf-copy");
  const bCollapse = button("bc-perf-collapse");
  bProbe.textContent = "GPU-próba";
  bCopy.textContent = "Másol";
  bCollapse.textContent = "–";
  bCollapse.setAttribute("aria-label", "A mérőpanel összecsukása");
  const toggleButtons = [bShadow, bRes, bMat, bFog, bProbe, bCopy];
  row.append(...toggleButtons, bCollapse);
  root.append(text, row);
  host.append(root);

  const syncLabels = () => {
    bShadow.textContent = controls.shadowsAvailable ? `Árnyék: ${toggles.shadows ? "be" : "ki"}` : "Árnyék: nincs";
    bShadow.disabled = !controls.shadowsAvailable;
    bRes.textContent = `Felbontás: ${Math.round(toggles.resolution * 100)}%`;
    const [baseLabel, altLabel] = controls.simpleLabel ?? ["PBR", "egyszerű"];
    bMat.textContent = `Anyag: ${toggles.simpleMaterials ? altLabel : baseLabel}`;
    bFog.textContent = `Köd: ${toggles.fog ? "be" : "ki"}`;
  };

  // --- Mérés ---
  const frames = new FrameWindow();
  let lastNow: number | null = null;
  let lastFrameAt = 0;
  let tStart = 0;
  let tBefore = 0;
  let lastRefresh = 0;
  let lastJs = 0;
  let lastRender = 0;
  let calls = 0;
  let triangles = 0;

  const gpuSamples: number[] = [];
  const pending: WebGLQuery[] = [];
  let active: WebGLQuery | null = null;

  let probeLeft = 0;
  let probeSamples: number[] = [];
  let probeDone: ((value: number | null) => void) | null = null;
  let probeTimer = 0;
  let gpuProbeMs: number | null = null;
  const probeBuf = new Uint8Array(4);

  const longTasks: { at: number; ms: number }[] = [];
  let longTaskObserver: PerformanceObserver | null = null;
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longTasks.push({ at: e.startTime + e.duration, ms: e.duration });
    });
    longTaskObserver.observe({ type: "longtask" });
  } catch {
    longTaskObserver = null;
  }

  let reactLastCount = opts.getReactRenders();
  let reactLastAt = performance.now();
  let reactPerSec = 0;

  const applyToggles = (patch: Partial<PerfToggleState>) => {
    if (patch.shadows !== undefined && controls.shadowsAvailable && patch.shadows !== toggles.shadows) {
      toggles.shadows = patch.shadows;
      controls.setShadows(patch.shadows);
    }
    if (patch.resolution !== undefined && RESOLUTIONS.includes(patch.resolution) && patch.resolution !== toggles.resolution) {
      toggles.resolution = patch.resolution;
      controls.setResolution(patch.resolution);
    }
    if (patch.simpleMaterials !== undefined && patch.simpleMaterials !== toggles.simpleMaterials) {
      toggles.simpleMaterials = patch.simpleMaterials;
      controls.setSimpleMaterials(patch.simpleMaterials);
    }
    if (patch.fog !== undefined && patch.fog !== toggles.fog) {
      toggles.fog = patch.fog;
      controls.setFog(patch.fog);
    }
    // A kapcsoló utáni képkockák más költségűek: a régi minták ne keveredjenek az újakkal.
    frames.clear();
    gpuSamples.length = 0;
    gpuProbeMs = null;
    syncLabels();
  };

  const bufferSize = { x: 0, y: 0 };
  const readBufferSize = () => {
    bufferSize.x = gl.drawingBufferWidth;
    bufferSize.y = gl.drawingBufferHeight;
  };

  const snapshot = (): PerfSnapshot => {
    const nowMs = performance.now();
    while (longTasks.length && longTasks[0]!.at < nowMs - WINDOW_MS) longTasks.shift();
    readBufferSize();
    const info = renderer.info;
    const longMs = longTasks.reduce((sum, t) => sum + t.ms, 0);
    const gpuAvg = gpuSamples.length ? gpuSamples.reduce((a, b) => a + b, 0) / gpuSamples.length : null;
    return {
      running: lastFrameAt > 0 && nowMs - lastFrameAt < 1000,
      tier: opts.tier,
      frame: frames.summary(),
      gpuMs: gpuAvg,
      gpuTimerAvailable: timerExt !== null,
      gpuProbeMs,
      calls,
      triangles,
      textures: info.memory.textures,
      geometries: info.memory.geometries,
      programs: info.programs?.length ?? 0,
      bufferWidth: bufferSize.x,
      bufferHeight: bufferSize.y,
      megapixels: megapixels(bufferSize.x, bufferSize.y),
      cssWidth: canvas.clientWidth,
      cssHeight: canvas.clientHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      pixelRatio: renderer.getPixelRatio(),
      longTasksPerSec: longTaskObserver ? longTasks.length / (WINDOW_MS / 1000) : null,
      longTaskMsPerSec: longTaskObserver ? longMs / (WINDOW_MS / 1000) : null,
      reactRendersPerSec: reactPerSec,
      rendererName,
      userAgent,
      toggles: { ...toggles },
    };
  };

  const renderText = () => {
    const s = snapshot();
    const f = s.frame;
    const tri = s.triangles >= 1000 ? `${(s.triangles / 1000).toFixed(1)} e` : String(s.triangles);
    const lines = [
      `${opts.title} · perf · szint: ${s.tier} · ${s.running ? "fut" : "áll"}`,
      `FPS ${fmt(f?.fpsAvg)} · 1% low ${fmt(f?.fpsLow1)}`,
      `képkocka p50 ${fmt(f?.dtP50)} · p95 ${fmt(f?.dtP95)} · min ${fmt(f?.dtMin)} ms`,
      `JS ${fmt(f?.jsAvg, 2)} · render() ${fmt(f?.renderAvg, 2)} · GPU ${s.gpuTimerAvailable ? fmt(s.gpuMs, 2) : "n. a."} ms`,
      `GPU-próba (szinkron): ${s.gpuProbeMs === null ? "– (nyomd meg a gombot)" : `${fmt(s.gpuProbeMs, 2)} ms`}`,
      `hívás ${s.calls} · háromszög ${tri} · textúra ${s.textures} · geom. ${s.geometries} · program ${s.programs}`,
      `vászon ${s.bufferWidth}×${s.bufferHeight} (${s.megapixels.toFixed(2)} Mpx) · CSS ${s.cssWidth}×${s.cssHeight}`,
      `dpr ${s.devicePixelRatio.toFixed(2)} → ${s.pixelRatio.toFixed(2)}`,
      `hosszú feladat ${fmt(s.longTasksPerSec)}/s · ${fmt(s.longTaskMsPerSec, 0)} ms/s`,
      `React-render ${fmt(s.reactRendersPerSec)}/s`,
      s.rendererName || "WebGL renderer: n. a.",
      s.userAgent,
    ];
    text.textContent = lines.join("\n");
  };

  const refresh = (nowMs: number) => {
    lastRefresh = nowMs;
    const count = opts.getReactRenders();
    const span = nowMs - reactLastAt;
    if (span >= 1000) {
      reactPerSec = ((count - reactLastCount) * 1000) / span;
      reactLastCount = count;
      reactLastAt = nowMs;
    }
    renderText();
  };

  const finishProbe = (value: number | null) => {
    window.clearTimeout(probeTimer);
    probeLeft = 0;
    gpuProbeMs = value;
    const done = probeDone;
    probeDone = null;
    done?.(value);
    renderText();
  };

  const runGpuProbe = (count = 40): Promise<number | null> => {
    if (probeDone) finishProbe(null);
    probeSamples = [];
    probeLeft = Math.max(1, Math.floor(count));
    return new Promise<number | null>((resolve) => {
      probeDone = resolve;
      // Ha a képkocka-hurok áll (szünet, kérdés), a próba nem akadhat be.
      probeTimer = window.setTimeout(() => finishProbe(median(probeSamples)), 10_000);
    });
  };

  // --- Gombok ---
  bShadow.addEventListener("click", () => applyToggles({ shadows: !toggles.shadows }));
  bRes.addEventListener("click", () => applyToggles({ resolution: RESOLUTIONS[(RESOLUTIONS.indexOf(toggles.resolution) + 1) % RESOLUTIONS.length]! }));
  bMat.addEventListener("click", () => applyToggles({ simpleMaterials: !toggles.simpleMaterials }));
  bFog.addEventListener("click", () => applyToggles({ fog: !toggles.fog }));
  bProbe.addEventListener("click", () => {
    void runGpuProbe(40);
  });
  bCopy.addEventListener("click", () => {
    const done = () => {
      bCopy.textContent = "Másolva";
      window.setTimeout(() => {
        bCopy.textContent = "Másol";
      }, 1200);
    };
    // Helyi vágólap — hálózatot nem érint; ha a böngésző nem engedi, a panel fotózható marad.
    navigator.clipboard?.writeText(text.textContent ?? "").then(done, () => {});
  });
  let collapsed = false;
  bCollapse.addEventListener("click", () => {
    collapsed = !collapsed;
    text.style.display = collapsed ? "none" : "";
    for (const b of toggleButtons) b.style.display = collapsed ? "none" : "";
    bCollapse.textContent = collapsed ? "perf" : "–";
  });

  syncLabels();
  renderText();
  // Ha a hurok áll (szünet, kérdés), a fejléc „áll”-ra vált — a képkocka-hurok nélkül is.
  const idleTimer = window.setInterval(() => {
    if (performance.now() - lastFrameAt >= 1000) renderText();
  }, 1000);

  const api: PerfWindowApi = { snapshot, controls: { set: applyToggles }, runGpuProbe };
  (window as unknown as PerfWindow).__websuliPerf = api;

  return {
    frameStart(now) {
      tStart = performance.now();
      if (timerExt && gl2) {
        while (pending.length) {
          const q = pending[0]!;
          if (!gl2.getQueryParameter(q, gl2.QUERY_RESULT_AVAILABLE)) break;
          const disjoint = gl2.getParameter(timerExt.GPU_DISJOINT_EXT) as boolean;
          if (!disjoint) {
            gpuSamples.push((gl2.getQueryParameter(q, gl2.QUERY_RESULT) as number) / 1e6);
            if (gpuSamples.length > 30) gpuSamples.shift();
          }
          gl2.deleteQuery(q);
          pending.shift();
        }
      }
      if (lastNow !== null) {
        const dt = now - lastNow;
        // Az első képkocka és a szünet utáni hosszú rés nem képkockaidő.
        if (dt > 0 && dt < 1000) frames.push({ dt, js: lastJs, render: lastRender });
      }
      lastNow = now;
      lastFrameAt = tStart;
    },
    beforeRender() {
      tBefore = performance.now();
      lastJs = tBefore - tStart;
      if (timerExt && gl2 && probeLeft === 0 && !active && pending.length < 4) {
        const q = gl2.createQuery();
        if (q) {
          gl2.beginQuery(timerExt.TIME_ELAPSED_EXT, q);
          active = q;
        }
      }
    },
    afterRender() {
      const tAfter = performance.now();
      lastRender = tAfter - tBefore;
      if (active && timerExt && gl2) {
        gl2.endQuery(timerExt.TIME_ELAPSED_EXT);
        pending.push(active);
        active = null;
      }
      calls = renderer.info.render.calls;
      triangles = renderer.info.render.triangles;
      if (probeLeft > 0) {
        // A `readPixels` megvárja, amíg a GPU a képkocka minden parancsát végrehajtja → a teljes költség mérhető.
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probeBuf);
        probeSamples.push(performance.now() - tBefore);
        probeLeft -= 1;
        if (probeLeft === 0) finishProbe(median(probeSamples));
      }
      if (tAfter - lastRefresh >= REFRESH_MS) refresh(tAfter);
    },
    snapshot,
    runGpuProbe,
    dispose() {
      window.clearInterval(idleTimer);
      window.clearTimeout(probeTimer);
      probeDone?.(null);
      probeDone = null;
      longTaskObserver?.disconnect();
      if (gl2) {
        if (active && timerExt) gl2.endQuery(timerExt.TIME_ELAPSED_EXT);
        if (active) gl2.deleteQuery(active);
        for (const q of pending) gl2.deleteQuery(q);
      }
      active = null;
      pending.length = 0;
      root.remove();
      const w = window as unknown as PerfWindow;
      if (w.__websuliPerf === api) delete w.__websuliPerf;
    },
  };
}
