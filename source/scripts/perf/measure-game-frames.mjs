// Játék-képkocka mérő (kanban #90, spec: docs/specs/2026-11-17-kerdesbank-hook-memo.md). NEM fut a CI-ban.
// Fejes Chrome + CDP: képkocka-idők (rAF), hosszú feladatok / LoAF, WebGL rajzolási hívás és háromszög, JS-heap, a kvízbank-JSON mérete.
// Az éles websuli.vip oldalt nyitja; `--local <source/dist/public>` esetén a HTML és az /assets a helyi buildből jön, az /api
// olvasó GET-jei az élesből (így ELŐTTE / UTÁNA build ugyanazzal az adattal mérhető). A böngészőablak legyen LÁTHATÓ (rejtett
// lapon az rAF fojtott).
// Használat (a source mappából):
//   node scripts/perf/measure-game-frames.mjs --out <mappa> --gpu real|swiftshader --view phone|phone360|phoneL|fold|foldL|laptop
//     --cpu 1|4|6 --rep 1 [--game block-craft-quiz|tsunami-english|word-ladder-hu-en|brain-rot-steal] [--local <dist/public>]
//     [--label before|after] [--hold] [--profile] [--look low|medium|high] [--emptybank] [--net fast4g|slow4g] [--mem]
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright");

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : true]);
    return acc;
  }, []),
);
const GPU = args.gpu || "real";
const VIEW = args.view || "laptop";
const CPU = Number(args.cpu || 1);
const REP = args.rep || "1";
const GAME = args.game || "block-craft-quiz";
const LOCAL = args.local || null; // dist/public mappa: a HTML és /assets innen, az /api az élesről
if (!args.out || args.out === true) {
  console.error("Kötelező: --out <mappa> (a mérési JSON ide kerül; ne a repóba).");
  process.exit(2);
}
const OUTDIR = args.out;
fs.mkdirSync(OUTDIR, { recursive: true });
const tag = `${args.label || (LOCAL ? "local" : "prod")}-${GAME}-${GPU}-${VIEW}-cpu${CPU}${args.look ? "-look" + args.look : ""}${args.profile ? "-prof" : ""}${args.emptybank ? "-emptybank" : ""}${args.net ? "-" + args.net : ""}-r${REP}`;
const BASE = "https://websuli.vip";

const VIEWS = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  phoneL: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  phone360: { viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  fold: { viewport: { width: 827, height: 896 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
  foldL: { viewport: { width: 896, height: 827 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
  laptop: { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
};
const touch = VIEWS[VIEW].hasTouch;

const flags = [
  "--disable-features=CalculateNativeWinOcclusion",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling",
  "--enable-gpu-rasterization",
  "--ignore-gpu-blocklist",
];
if (GPU === "swiftshader") flags.push("--use-angle=swiftshader", "--enable-unsafe-swiftshader");

const INIT = () => {
  const w = window;
  w.__marks = [];
  w.__mark = (n) => w.__marks.push({ n, t: performance.now() });
  w.__frames = [];
  w.__lt = [];
  w.__loaf = [];
  w.__gl = { calls: 0, tris: 0 };
  w.__bankJson = null;
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) w.__lt.push({ s: e.startTime, d: e.duration });
    }).observe({ type: "longtask", buffered: true });
  } catch {
    // A böngésző ezt a megfigyelőt nem támogatja: a mérés nélküle fut tovább.
  }
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        w.__loaf.push({
          s: e.startTime,
          d: e.duration,
          block: e.blockingDuration,
          render: e.renderStart ? e.startTime + e.duration - e.renderStart : 0,
          style: e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0,
          scripts: (e.scripts || []).map((s) => ({
            d: s.duration,
            inv: s.invoker,
            fn: s.sourceFunctionName,
            url: (s.sourceURL || "").split("/").pop(),
            pos: s.sourceCharPosition,
          })),
        });
    }).observe({ type: "long-animation-frame", buffered: true });
  } catch {
    // A böngésző ezt a megfigyelőt nem támogatja: a mérés nélküle fut tovább.
  }
  const patch = (proto) => {
    if (!proto) return;
    const tri = (mode, count) => (mode === 4 ? count / 3 : 0);
    const de = proto.drawElements;
    proto.drawElements = function (m, c, t, o) { w.__gl.calls++; w.__gl.tris += tri(m, c); return de.call(this, m, c, t, o); };
    const da = proto.drawArrays;
    proto.drawArrays = function (m, f, c) { w.__gl.calls++; w.__gl.tris += tri(m, c); return da.call(this, m, f, c); };
    if (proto.drawElementsInstanced) {
      const dei = proto.drawElementsInstanced;
      proto.drawElementsInstanced = function (m, c, t, o, n) { w.__gl.calls++; w.__gl.tris += tri(m, c) * n; return dei.call(this, m, c, t, o, n); };
    }
    if (proto.drawArraysInstanced) {
      const dai = proto.drawArraysInstanced;
      proto.drawArraysInstanced = function (m, f, c, n) { w.__gl.calls++; w.__gl.tris += tri(m, c) * n; return dai.call(this, m, f, c, n); };
    }
  };
  patch(w.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
  patch(w.WebGLRenderingContext && WebGLRenderingContext.prototype);
  const oj = Response.prototype.json;
  Response.prototype.json = async function () {
    const url = this.url;
    if (!/quiz-bank|material-quizzes|vocab/.test(url)) return oj.call(this);
    const t0 = performance.now();
    const txt = await this.text();
    const t1 = performance.now();
    const v = JSON.parse(txt);
    const t2 = performance.now();
    (w.__json = w.__json || []).push({ url: url.split("/").slice(-2).join("/"), chars: txt.length, bodyMs: +(t1 - t0).toFixed(1), parseMs: +(t2 - t1).toFixed(1), at: +t0.toFixed(0) });
    return v;
  };
  let last = 0;
  const loop = (t) => {
    if (last) w.__frames.push({ t, dt: t - last, calls: w.__gl.calls, tris: w.__gl.tris, vis: document.visibilityState === "visible" ? 1 : 0 });
    w.__gl.calls = 0;
    w.__gl.tris = 0;
    last = t;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: false, args: flags });
  const ctx = await browser.newContext({ ...VIEWS[VIEW], serviceWorkers: "block", locale: "hu-HU" });
  await ctx.addInitScript(INIT);
  if (LOCAL) {
    await ctx.route(/^https:\/\/websuli\.vip\/(assets\/.*|games\/.*|$)/, async (route) => {
      const u = new URL(route.request().url());
      if (u.pathname.startsWith("/assets/")) {
        const f = path.join(LOCAL, u.pathname);
        if (fs.existsSync(f)) {
          const ct = f.endsWith(".js") ? "application/javascript" : f.endsWith(".css") ? "text/css" : f.endsWith(".map") ? "application/json" : undefined;
          return route.fulfill({ path: f, headers: ct ? { "content-type": ct } : {} });
        }
        return route.continue();
      }
      if (route.request().resourceType() === "document") return route.fulfill({ path: path.join(LOCAL, "index.html"), headers: { "content-type": "text/html" } });
      return route.continue();
    });
  }
  if (args.emptybank) await ctx.route(/\/api\/games\/quiz-bank\//, (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ gameId: GAME, items: [] }) }));
  const page = await ctx.newPage();
  await page.bringToFront();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("Network.enable");
  const reqs = new Map();
  cdp.on("Network.requestWillBeSent", (e) => reqs.set(e.requestId, { url: e.request.url, method: e.request.method, t0: e.timestamp, type: e.type, dec: 0 }));
  cdp.on("Network.responseReceived", (e) => { const r = reqs.get(e.requestId); if (r) { r.status = e.response.status; r.ttfb = e.response.timing ? e.response.timing.receiveHeadersEnd : null; r.type = e.type; } });
  cdp.on("Network.dataReceived", (e) => { const r = reqs.get(e.requestId); if (r) r.dec += e.dataLength; });
  cdp.on("Network.loadingFinished", (e) => { const r = reqs.get(e.requestId); if (r) { r.enc = e.encodedDataLength; r.t1 = e.timestamp; } });
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  const NETS = { fast4g: { latency: 150, downloadThroughput: (9 * 1024 * 1024) / 8, uploadThroughput: (1.5 * 1024 * 1024) / 8 }, slow4g: { latency: 562.5, downloadThroughput: (1.6 * 1024 * 1024) / 8 * 0.9, uploadThroughput: (750 * 1024) / 8 * 0.9 } };
  if (args.net) await cdp.send("Network.emulateNetworkConditions", { offline: false, ...NETS[args.net] });

  const heap = async () => {
    const m = await cdp.send("Performance.getMetrics");
    const g = (n) => m.metrics.find((x) => x.name === n)?.value;
    return { jsHeapUsedMB: +(g("JSHeapUsedSize") / 1048576).toFixed(1), jsHeapTotalMB: +(g("JSHeapTotalSize") / 1048576).toFixed(1), nodes: g("Nodes") };
  };
  const mark = (n) => page.evaluate((n) => window.__mark(n), n);
  const result = { tag, gpu: GPU, view: VIEW, cpu: CPU, local: !!LOCAL, game: GAME, steps: {} };
  const tNav = Date.now();
  const url = `${BASE}/games/${GAME}${args.look ? "?look=" + args.look : ""}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  result.steps.loadEventMs = Date.now() - tNav;
  result.env = await page.evaluate(() => {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
    return { renderer: gl && ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null, dpr: devicePixelRatio, cores: navigator.hardwareConcurrency, mem: navigator.deviceMemory, coarse: matchMedia("(pointer: coarse)").matches, vis: document.visibilityState, focus: document.hasFocus() };
  });

  // Start / gate
  const startSel = {
    "block-craft-quiz": '[data-testid="bc-start"]',
    "tsunami-english": '[data-testid="button-tsunami-start"]',
    "word-ladder-hu-en": '[data-testid="wl-start"]',
  }[GAME];
  // A Brainrot indítógombjának nincs test-id-je: a közös nézet-mérő (tests/game-viewport-experience.spec.ts) is név szerint keresi.
  const start = startSel
    ? page.locator(startSel)
    : GAME === "brain-rot-steal"
      ? page.getByRole("button", { name: /indít|indul|start|vadász|rajta/i }).first()
      : null;
  if (!start) throw new Error("unknown game");
  await start.waitFor({ state: "visible", timeout: 120000 });
  result.steps.startVisibleMs = Date.now() - tNav;
  const gate = page.getByTestId("classroom-gate-modal");
  if (await gate.isVisible()) {
    await gate.getByTestId("button-grade-4").click();
    await gate.waitFor({ state: "hidden" });
  }
  result.paint = await page.evaluate(() => Object.fromEntries(performance.getEntriesByType("paint").map((e) => [e.name, Math.round(e.startTime)])));
  result.nav = await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0]; return { ttfb: Math.round(n.responseStart), domContentLoaded: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) }; });
  await mark("menu");
  await sleep(3000);
  result.heapStart = await heap();
  await mark("startClick");
  const tStart = Date.now();
  await start.click();
  // első játék-képkocka: a HUD megjelenése
  const hud = GAME === "block-craft-quiz" && touch ? page.getByTestId("bc-touch-controls") : page.locator("canvas").first();
  await hud.waitFor({ state: "visible", timeout: 60000 });
  result.steps.startToHudMs = Date.now() - tStart;
  await mark("idle");
  await sleep(4000);

  // Profil (opcionális): bányászás + séta + körbenézés
  if (args.profile) {
    await cdp.send("Profiler.enable");
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
    await cdp.send("Profiler.start");
  }

  if (GAME !== "block-craft-quiz") {
    // általános: séta (billentyű) + tétlen, 15 s
    await mark("walk");
    for (const k of ["KeyW", "KeyA", "KeyD", "ArrowUp", "ArrowLeft", "ArrowRight"]) { await page.keyboard.down(k); await sleep(1000); await page.keyboard.up(k); }
    await mark("idle2");
    await sleep(8000);
    await mark("end");
  }
  if (GAME === "block-craft-quiz") {
  // BÁNYÁSZÁS + KVÍZ (a kezdő nézés bányászható blokkra mutat)
  const canvas = page.locator("canvas").first();
  const cbox = await canvas.boundingBox();
  if (!touch) {
    await page.mouse.click(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2); // pointer lock
    await sleep(500);
  }
  result.mines = [];
  const tMine0 = Date.now();
  for (let i = 0; i < 3 && Date.now() - tMine0 < 45000; i++) {
    await mark(`mineKey${i}`);
    const t0 = Date.now();
    if (args.hold) { await page.keyboard.down("KeyE"); await sleep(2500); await page.keyboard.up("KeyE"); } else await page.keyboard.press("KeyE");
    const quiz = page.getByTestId("bc-quiz");
    try {
      await quiz.waitFor({ state: "visible", timeout: 8000 });
    } catch {
      result.mines.push({ i, quizOpened: false });
      // fordulj kicsit és próbáld újra
      await page.keyboard.down("KeyS"); await sleep(400); await page.keyboard.up("KeyS");
      continue;
    }
    const openMs = Date.now() - t0;
    await mark(`quizOpen${i}`);
    await sleep(3000);
    await mark(`quizAnswer${i}`);
    let tries = 0, answerToCloseMs = null;
    for (; tries < 10 && Date.now() - tMine0 < 60000; tries++) {
      const btn = page.locator('[data-testid="bc-quiz"] button.game-answer-btn, [data-testid^="bc-rune-"]').nth(tries % 2);
      const ta = Date.now();
      try { await btn.click({ timeout: 5000 }); } catch { await sleep(300); continue; }
      const closed = await quiz.waitFor({ state: "hidden", timeout: 1500 }).then(() => true, () => false);
      if (closed) { answerToCloseMs = Date.now() - ta; break; }
      const fb = page.getByTestId("quiz-feedback-dismiss");
      if (await fb.isVisible().catch(() => false)) await fb.click();
      await sleep(400);
    }
    await mark(`afterMine${i}`);
    await sleep(1500);
    result.mines.push({ i, quizOpened: true, keyToQuizVisibleMs: openMs, answerTries: tries + 1, answerToCloseMs });
    if (!touch) {
      await page.mouse.click(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2); // lock vissza
      await sleep(300);
    }
  }

  // SÉTA
  await mark("walk");
  await page.keyboard.down("KeyW");
  await sleep(3000);
  await page.keyboard.up("KeyW");
  await page.keyboard.down("KeyD");
  await sleep(2000);
  await page.keyboard.up("KeyD");
  await page.keyboard.down("KeyS");
  await sleep(1500);
  await page.keyboard.up("KeyS");

  // KÖRBENÉZÉS
  await mark("look");
  const cx = cbox.x + cbox.width * 0.75, cy = cbox.y + cbox.height * 0.45;
  if (touch) {
    const tLook0 = Date.now();
    for (let k = 0; k < 3 && Date.now() - tLook0 < 10000; k++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx, y: cy, id: 1 }] });
      for (let s = 1; s <= 30 && Date.now() - tLook0 < 10000; s++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx - s * 4 * (k % 2 ? -1 : 1), y: cy + Math.sin(s / 5) * 10, id: 1 }] });
        await sleep(50);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
  } else {
    const tLookM = Date.now();
    for (let s = 0; s < 120 && Date.now() - tLookM < 10000; s++) {
      await page.mouse.move(cbox.x + cbox.width / 2 + Math.sin(s / 10) * 300, cbox.y + cbox.height / 2 + Math.cos(s / 13) * 60);
      await sleep(40);
    }
  }
  await mark("end");
  }
  if (args.profile) {
    const { profile } = await cdp.send("Profiler.stop");
    fs.writeFileSync(path.join(OUTDIR, `${tag}.cpuprofile`), JSON.stringify(profile));
  }
  // várj 60 s-ig az indítástól (memória)
  const elapsed = Date.now() - tStart;
  if (elapsed < 60000 && args.mem) await sleep(60000 - elapsed);
  result.heap60 = await heap();
  result.elapsedSinceStartMs = Date.now() - tStart;

  const raw = await page.evaluate(() => ({ frames: window.__frames, marks: window.__marks, lt: window.__lt, loaf: window.__loaf, json: window.__json || [], vis: document.visibilityState, canvas: (() => { const c = document.querySelector("canvas"); return c ? { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight } : null; })() }));
  result.canvas = raw.canvas;
  result.visEnd = raw.vis;
  result.json = raw.json;
  result.marksRel = raw.marks.map((m) => [m.n, Math.round(m.t)]);
  result.ltTimes = raw.lt.map((x) => [Math.round(x.s), Math.round(x.d)]);
  result.requests = [...reqs.values()].map((r) => ({ url: r.url.replace(BASE, ""), m: r.method, type: r.type, st: r.status, enc: r.enc, dec: r.dec, ms: r.t1 ? Math.round((r.t1 - r.t0) * 1000) : null, at: Math.round(r.t0 * 1000) }));
  // fázis-statisztika
  const phases = [];
  const M = raw.marks;
  for (let i = 0; i < M.length; i++) {
    const a = M[i].t, b = i + 1 < M.length ? M[i + 1].t : M[i].t + 10000;
    const fr = raw.frames.filter((f) => f.t > a && f.t <= b);
    const dts = fr.map((f) => f.dt).sort((x, y) => x - y);
    const q = (p) => (dts.length ? dts[Math.min(dts.length - 1, Math.floor(p * dts.length))] : null);
    const lt = raw.lt.filter((x) => x.s >= a && x.s < b);
    const gameFrames = fr.filter((f) => f.calls > 0);
    phases.push({
      phase: M[i].n,
      durMs: Math.round(b - a),
      frames: fr.length,
      fpsAvg: fr.length ? +(1000 / (fr.reduce((s, f) => s + f.dt, 0) / fr.length)).toFixed(1) : null,
      fpsMedian: q(0.5) ? +(1000 / q(0.5)).toFixed(1) : null,
      fpsP5: q(0.95) ? +(1000 / q(0.95)).toFixed(1) : null,
      dtMedian: q(0.5) && +q(0.5).toFixed(1),
      dtP95: q(0.95) && +q(0.95).toFixed(1),
      dtMax: dts.length ? +dts[dts.length - 1].toFixed(1) : null,
      over50: dts.filter((d) => d > 50).length,
      dtP99: q(0.99) && +q(0.99).toFixed(1),
      pctOver33: dts.length ? +((100 * dts.filter((d) => d > 33.4).length) / dts.length).toFixed(1) : null,
      pctOver50: dts.length ? +((100 * dts.filter((d) => d > 50).length) / dts.length).toFixed(1) : null,
      busyPctLT: +((100 * lt.reduce((s, x) => s + x.d, 0)) / Math.max(1, b - a)).toFixed(0),
      longTasks: lt.length,
      longTaskMs: Math.round(lt.reduce((s, x) => s + x.d, 0)),
      longestTask: lt.length ? Math.round(Math.max(...lt.map((x) => x.d))) : 0,
      drawCallsMedian: gameFrames.length ? gameFrames.map((f) => f.calls).sort((x, y) => x - y)[Math.floor(gameFrames.length / 2)] : 0,
      trisMedian: gameFrames.length ? Math.round(gameFrames.map((f) => f.tris).sort((x, y) => x - y)[Math.floor(gameFrames.length / 2)]) : 0,
      hiddenFrames: fr.filter((f) => !f.vis).length,
    });
  }
  result.phases = phases;
  result.loafTop = raw.loaf.sort((a, b) => b.d - a.d).slice(0, 12);
  result.longTasksAll = { count: raw.lt.length, ms: Math.round(raw.lt.reduce((s, x) => s + x.d, 0)), beforeMenu: raw.lt.filter((x) => x.s < (M[0]?.t ?? 0)).map((x) => Math.round(x.d)) };
  fs.writeFileSync(path.join(OUTDIR, `${tag}.json`), JSON.stringify(result, null, 1));
  console.log(JSON.stringify({ tag, env: result.env, canvas: result.canvas, steps: result.steps, mines: result.mines, heap: [result.heapStart, result.heap60], json: result.json, phases: phases.map((p) => [p.phase, p.fpsMedian, p.dtP95, p.dtP99, p.pctOver33, p.pctOver50, p.longTasks, p.longTaskMs, p.drawCallsMedian, p.trisMedian, p.hiddenFrames]) }));
  await browser.close();
}
main().catch((e) => { console.error("FAIL", tag, e.message); process.exit(1); });
