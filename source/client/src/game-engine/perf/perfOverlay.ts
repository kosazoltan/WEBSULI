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

import { createGpuTimer } from "./gpuTimer";
import { DrawnFrameClock, FrameWindow, LoopClock, fmt, probeLabel, probeOutcome, type ProbeOutcome, megapixels, shortUserAgent, type FrameSummary } from "./perfStats";

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
  /** A játék saját jelzője: fut-e a képkocka-hurok (review #504 L1). Ha nincs, a panel a képkockák idejéből becsül. */
  isRunning?(): boolean;
  /** A felső HUD alja a `host` tetejétől (CSS px) — a panel ez alá kerül (review #504 L3). Alap: 4 px. */
  getTopInset?(): number;
};

export type PerfSnapshot = {
  running: boolean;
  /** Az eddig kirajzolt képkockák száma (az 1 s-nál hosszabb, a statisztikából kihagyott képkockák is). */
  renderedFrames: number;
  tier: string;
  frame: FrameSummary | null;
  /** `EXT_disjoint_timer_query_webgl2` átlag (ms); null, ha a böngésző nem adja. */
  gpuMs: number | null;
  gpuTimerAvailable: boolean;
  /** A szinkron próba mediánja (ms): `render()` + a GPU bevárása `readPixels`-szel. */
  gpuProbeMs: number | null;
  /** A legutóbbi próba kimenete (2. vak kör L3): mintaszám és részlegesség; null, ha nincs / megszakadt. */
  gpuProbe: ProbeOutcome | null;
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
  frameStart(now: number, restarted?: boolean): void;
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

const WINDOW_MS = 4000;
const REFRESH_MS = 500;
const RESOLUTIONS: readonly PerfResolution[] = [1, 0.75, 0.5];

function button(testId: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.dataset.testid = testId;
  b.style.cssText =
    "pointer-events:auto;min-height:40px;min-width:40px;padding:2px 7px;border-radius:8px;border:1px solid rgba(255,255,255,.4);" +
    "background:rgba(15,23,42,.72);color:#fff;font:600 11px/1.2 ui-monospace,Consolas,monospace;touch-action:manipulation;";
  return b;
}

export function createPerfOverlay(opts: PerfOverlayOptions): PerfOverlay {
  const { renderer, host, controls } = opts;
  const canvas = renderer.domElement;
  const gl = renderer.getContext();
  const gl2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext ? gl : null;
  // PR #504 (Codex P2): kontextusvesztéskor a függő lekérdezések érvénytelenek — az időzítő eldobja őket, visszaálláskor a
  // kiterjesztést újra lekéri, így a GPU-sor a visszaállás után is frissül.
  const gpuTimer = createGpuTimer(gl2);
  const onContextLost = () => {
    gpuTimer.contextLost();
    // 2026-11-21 vak kör L2: a vesztés előtti minták és a futó szinkron próba érvénytelenek (a próba eredménye: nincs).
    frames.clear();
    if (probeDone) finishProbe(null);
  };
  const onContextRestored = () => gpuTimer.contextRestored();
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

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
  // Review #504 L3: a panel a felső HUD alatt, VÍZSZINTESEN KÖZÉPEN lebeg — így se a bal, se a jobb alsó vezérlőt (a joystick
  // bármelyik oldalon lehet) nem takarja. Fekvő, alacsony nézetben a két oldalsó vezérlősáv szabadon marad (a szélesség ezért
  // a nézet szélessége − 2 × 170 px); álló nézetben a vezérlők alul vannak, a panel a HUD és a célkereszt közti sávban.
  root.className = "bc-perf-panel";
  if (!document.getElementById("bc-perf-panel-style")) {
    const style = document.createElement("style");
    style.id = "bc-perf-panel-style";
    style.textContent =
      ".bc-perf-panel{position:absolute;left:50%;transform:translateX(-50%);z-index:60;width:max-content;" +
      "max-width:min(360px,calc(100% - 8px));pointer-events:none;display:flex;flex-direction:column;gap:3px}" +
      // Review #504 (vak, L2): kis fekvő kijelzőn (568×320) se lógjon ki — a gombsor (benne az összecsukó) felül, mindig
      // látszik; a szöveg a maradék magasságban görgethető.
      // 2. vak kör M3: a szövegdoboz NEM érinthető (a „jobb: nézelődés” húzás a vászonhoz jut) — csak a gombok azok; a szöveg a
      // maradék magasságban levágódik (a gombsor felül, az összecsukó mindig elérhető).
      ".bc-perf-panel>pre{min-height:0;overflow:hidden;pointer-events:none}" +
      "@media (orientation:landscape) and (max-height:600px){.bc-perf-panel{max-width:calc(100% - 340px)}}" +
      // GPT-vak review #504 L3: „Számok” nézet — a kapcsolók rejtve, a panel a teljes szélességet használja, hogy a mérősorok
      // kis fekvő kijelzőn (568×320) is olvashatók legyenek; a szöveg itt sem érinthető (az érintés a játékhoz jut).
      ".bc-perf-panel.bc-perf-reading{max-width:calc(100% - 8px)}";
    document.head.append(style);
  }
  // Review #504 (vak, L3): elrendezést a panel NEM olvas a képkocka-hurokban — a helyét és a vászon CSS-méretét a méretfigyelő
  // és a másodperces időzítő frissíti (a mért JS / render idejébe így nem kerül kényszerített elrendezés-számítás).
  let cssWidth = canvas.clientWidth;
  let cssHeight = canvas.clientHeight;
  const placeTop = () => {
    const inset = opts.getTopInset?.() ?? 4;
    const top = Math.max(4, Math.round(Number.isFinite(inset) ? inset : 4));
    root.style.top = `${top}px`;
    root.style.maxHeight = `calc(100% - ${top + 4}px)`;
  };
  placeTop();
  const sizeObserver =
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver((entries) => {
          for (const e of entries) {
            if (e.target === canvas) {
              cssWidth = Math.round(e.contentRect.width);
              cssHeight = Math.round(e.contentRect.height);
            }
          }
          placeTop();
        });
  sizeObserver?.observe(canvas);
  sizeObserver?.observe(host);
  const text = document.createElement("pre");
  text.dataset.testid = "bc-perf-text";
  text.style.cssText =
    "margin:0;padding:4px 7px;border-radius:8px;background:rgba(2,6,23,.62);color:#e2e8f0;font:10px/1.3 ui-monospace,Consolas,monospace;" +
    "white-space:pre-wrap;overflow-wrap:anywhere;";
  const row = document.createElement("div");
  row.style.cssText = "display:flex;flex-wrap:wrap;justify-content:center;gap:3px;";
  const bShadow = button("bc-perf-shadow");
  const bRes = button("bc-perf-res");
  const bMat = button("bc-perf-mat");
  const bFog = button("bc-perf-fog");
  const bProbe = button("bc-perf-probe");
  const bCopy = button("bc-perf-copy");
  const bCollapse = button("bc-perf-collapse");
  const bView = button("bc-perf-view");
  bProbe.textContent = "GPU-próba";
  bCopy.textContent = "Másol";
  bCollapse.textContent = "–";
  bCollapse.setAttribute("aria-label", "A mérőpanel összecsukása");
  const toggleButtons = [bShadow, bRes, bMat, bFog, bProbe, bCopy];
  row.append(bView, ...toggleButtons, bCollapse);
  let reading = false;
  const syncView = () => {
    root.classList.toggle("bc-perf-reading", reading);
    bView.textContent = reading ? "Kapcsolók" : "Számok";
    bView.setAttribute("aria-pressed", reading ? "true" : "false");
    for (const b of toggleButtons) b.style.display = reading || collapsed ? "none" : "";
  };
  root.append(row, text);
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
  const loopClock = new LoopClock();
  const drawnClock = new DrawnFrameClock();
  let tStart = 0;
  let tBefore = 0;
  let lastRefresh = 0;
  let renderedFrames = 0;
  let calls = 0;
  let triangles = 0;

  let probeLeft = 0;
  let probeSamples: number[] = [];
  let probeDone: ((value: number | null) => void) | null = null;
  let probeTimer = 0;
  let gpuProbeMs: number | null = null;
  let gpuProbe: ProbeOutcome | null = null;
  let probeRequested = 0;
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
    gpuTimer.clearSamples();
    // GPT-vak review #504 L4: a kapcsoló előtt indult szinkron GPU-próba a régi beállítást mérné — megszakítjuk (eredménye: nincs).
    if (probeDone) finishProbe(null);
    gpuProbeMs = null;
    gpuProbe = null;
    // 2. vak kör L1: a váltás előtti utolsó kép nem az új mód első közének kezdete.
    drawnClock.reset();
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
    const gpuAvg = gpuTimer.average();
    return {
      running: loopClock.running(nowMs, opts.isRunning?.()),
      renderedFrames,
      tier: opts.tier,
      frame: frames.summary(nowMs),
      gpuMs: gpuAvg,
      gpuTimerAvailable: gpuTimer.available,
      gpuProbeMs,
      gpuProbe,
      calls,
      triangles,
      textures: info.memory.textures,
      geometries: info.memory.geometries,
      programs: info.programs?.length ?? 0,
      bufferWidth: bufferSize.x,
      bufferHeight: bufferSize.y,
      megapixels: megapixels(bufferSize.x, bufferSize.y),
      cssWidth,
      cssHeight,
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
      `FPS ${fmt(f?.fpsAvg)} · 1% low ${fmt(f?.fpsLow1)} · p50 ${fmt(f?.dtP50)} · p95 ${fmt(f?.dtP95)} · min ${fmt(f?.dtMin)} ms`,
      `JS ${fmt(f?.jsAvg, 2)} · render() ${fmt(f?.renderAvg, 2)} · GPU ${s.gpuTimerAvailable ? fmt(s.gpuMs, 2) : "n. a."} · próba ${probeLabel(s.gpuProbe)}`,
      `hívás ${s.calls} · háromszög ${tri} · textúra ${s.textures} · geom. ${s.geometries} · program ${s.programs}`,
      `vászon ${s.bufferWidth}×${s.bufferHeight} (${s.megapixels.toFixed(2)} Mpx) · CSS ${s.cssWidth}×${s.cssHeight} · dpr ${s.devicePixelRatio.toFixed(2)} → ${s.pixelRatio.toFixed(2)}`,
      `hosszú feladat ${fmt(s.longTasksPerSec)}/s · ${fmt(s.longTaskMsPerSec, 0)} ms/s · React-render ${fmt(s.reactRendersPerSec)}/s`,
      `${(s.rendererName || "WebGL: n. a.").slice(0, 44)} · ${s.userAgent}`,
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

  /** `outcome === null`: megszakított próba (kapcsoló, kontextusvesztés) — nincs eredmény. */
  const finishProbe = (outcome: ProbeOutcome | null) => {
    window.clearTimeout(probeTimer);
    probeLeft = 0;
    gpuProbe = outcome;
    gpuProbeMs = outcome?.value ?? null;
    const done = probeDone;
    probeDone = null;
    done?.(gpuProbeMs);
    renderText();
  };

  const runGpuProbe = (count = 40): Promise<number | null> => {
    if (probeDone) finishProbe(null);
    probeSamples = [];
    probeLeft = Math.max(1, Math.floor(count));
    probeRequested = probeLeft;
    return new Promise<number | null>((resolve) => {
      probeDone = resolve;
      // Ha a képkocka-hurok áll (szünet, kérdés), a próba nem akadhat be. Időtúllépéskor a részleges minta NEM teljes
      // eredmény (2. vak kör L3): a felirat „részleges n/N”, a visszatérési érték null.
      probeTimer = window.setTimeout(() => finishProbe(probeOutcome(probeSamples, probeRequested)), 10_000);
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
  let copyTimer = 0;
  bCopy.addEventListener("click", () => {
    const done = () => {
      bCopy.textContent = "Másolva";
      window.clearTimeout(copyTimer);
      copyTimer = window.setTimeout(() => {
        bCopy.textContent = "Másol";
      }, 1200);
    };
    // Helyi vágólap — hálózatot nem érint; ha a böngésző nem engedi, a panel fotózható marad.
    navigator.clipboard?.writeText(text.textContent ?? "").then(done, () => {});
  });
  let collapsed = false;
  bView.addEventListener("click", () => {
    reading = !reading;
    syncView();
  });
  bCollapse.addEventListener("click", () => {
    collapsed = !collapsed;
    text.style.display = collapsed ? "none" : "";
    bView.style.display = collapsed ? "none" : "";
    syncView();
    bCollapse.textContent = collapsed ? "perf" : "–";
  });

  syncLabels();
  syncView();
  renderText();
  // Másodpercenként, a képkocka-huroktól függetlenül: ha az utolsó szövegfrissítés 1 s-nál régebbi (a hurok áll vagy befagyott),
  // a szöveg — benne a „fut / áll” — újraíródik (review #504 vak L1). Itt (a mérésen kívül) frissül a panel helye is, és méretfigyelő
  // nélkül a vászon CSS-mérete.
  const idleTimer = window.setInterval(() => {
    const nowMs = performance.now();
    placeTop();
    if (!sizeObserver) {
      cssWidth = canvas.clientWidth;
      cssHeight = canvas.clientHeight;
    }
    if (nowMs - lastRefresh >= 1000) renderText();
  }, 1000);

  const api: PerfWindowApi = { snapshot, controls: { set: applyToggles }, runGpuProbe };
  (window as unknown as PerfWindow).__websuliPerf = api;

  return {
    frameStart(now, restarted = false) {
      tStart = performance.now();
      gpuTimer.poll();
      loopClock.frame(now, tStart, restarted);
      // 2026-11-21 vak kör L1: a képkocka elején csak az időbélyeg jegyződik; FPS-minta csak a sikeres `afterRender`-ben születik.
      drawnClock.start(now, restarted);
    },
    beforeRender() {
      tBefore = performance.now();
      gpuTimer.begin(probeLeft > 0);
    },
    afterRender() {
      const tAfter = performance.now();
      gpuTimer.end();
      // 2026-11-21 vak kör L2: elveszett kontextuson a `render()` rajzolás nélkül tér vissza — nem kirajzolt képkocka, nem
      // FPS-minta, a futó szinkron próba érvénytelen; visszaállás után az első valódi rajzolástól mér újra.
      if (gl.isContextLost()) {
        drawnClock.completed(false);
        if (probeDone) finishProbe(null);
        return;
      }
      loopClock.rendered(tAfter);
      renderedFrames += 1;
      const dt = drawnClock.completed(true);
      if (dt !== null) frames.push({ dt, js: tBefore - tStart, render: tAfter - tBefore, at: tAfter });
      calls = renderer.info.render.calls;
      triangles = renderer.info.render.triangles;
      if (probeLeft > 0) {
        // A `readPixels` megvárja, amíg a GPU a képkocka minden parancsát végrehajtja → a teljes költség mérhető.
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probeBuf);
        probeSamples.push(performance.now() - tBefore);
        probeLeft -= 1;
        if (probeLeft === 0) finishProbe(probeOutcome(probeSamples, probeRequested));
      }
      if (tAfter - lastRefresh >= REFRESH_MS) refresh(tAfter);
    },
    snapshot,
    runGpuProbe,
    dispose() {
      window.clearInterval(idleTimer);
      window.clearTimeout(copyTimer);
      sizeObserver?.disconnect();
      // Review #504 (vak, L5): a panel stílusa sem marad a lap fejében.
      document.getElementById("bc-perf-panel-style")?.remove();
      window.clearTimeout(probeTimer);
      probeDone?.(null);
      probeDone = null;
      longTaskObserver?.disconnect();
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      gpuTimer.dispose();
      root.remove();
      const w = window as unknown as PerfWindow;
      if (w.__websuliPerf === api) delete w.__websuliPerf;
    },
  };
}
