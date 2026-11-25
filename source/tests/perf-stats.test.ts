import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DrawnFrameClock, FrameWindow, LoopClock, longTaskLoad, longTaskObservable, probeLabel, probeOutcome, fmt, isLoopRunning, median, megapixels, perfEnabledFrom, shortUserAgent } from "../client/src/game-engine/perf/perfStats";

/** `?perf=1` diagnosztika — a tiszta számolás (terv: docs/specs/2026-11-17-kockavadasz-telefon.md, 6. szakasz). */

describe("perfEnabledFrom", () => {
  it("csak a pontos perf=1 paraméterre kapcsol be", () => {
    assert.equal(perfEnabledFrom("?perf=1"), true);
    assert.equal(perfEnabledFrom("?look=low&perf=1"), true);
    assert.equal(perfEnabledFrom("?perf=0"), false);
    assert.equal(perfEnabledFrom("?perf=true"), false);
    assert.equal(perfEnabledFrom("?perfx=1"), false);
    assert.equal(perfEnabledFrom(""), false);
  });
});

describe("FrameWindow", () => {
  it("üresen nincs összegzés", () => {
    assert.equal(new FrameWindow().summary(), null);
  });

  it("egyenletes 60 Hz-es mintán 60 fps az átlag és az 1 % low is", () => {
    const w = new FrameWindow();
    for (let i = 0; i < 240; i++) w.push({ dt: 1000 / 60, js: 2, render: 3 });
    const s = w.summary()!;
    assert.equal(s.frames, 240);
    assert.ok(Math.abs(s.fpsAvg - 60) < 0.01);
    assert.ok(Math.abs(s.fpsLow1 - 60) < 0.01);
    assert.ok(Math.abs(s.dtMin - 1000 / 60) < 0.01);
    assert.ok(Math.abs(s.jsAvg - 2) < 1e-6);
    assert.ok(Math.abs(s.renderAvg - 3) < 1e-6);
  });

  it("az 1 % low a leglassabb képkockát mutatja, az átlag alig mozdul", () => {
    const w = new FrameWindow();
    for (let i = 0; i < 99; i++) w.push({ dt: 10, js: 1, render: 1 });
    w.push({ dt: 100, js: 1, render: 1 });
    const s = w.summary()!;
    assert.ok(Math.abs(s.fpsLow1 - 10) < 0.01, `fpsLow1 = ${s.fpsLow1}`);
    assert.ok(Math.abs(s.fpsAvg - (1000 * 100) / 1090) < 0.01);
    assert.equal(s.dtP50, 10);
    assert.equal(s.dtP95, 10);
    assert.equal(s.dtMin, 10);
  });

  it("a kapacitás fölött a legrégebbi képkockák kiesnek", () => {
    const w = new FrameWindow(10);
    for (let i = 0; i < 10; i++) w.push({ dt: 100, js: 0, render: 0 });
    for (let i = 0; i < 10; i++) w.push({ dt: 20, js: 0, render: 0 });
    const s = w.summary()!;
    assert.equal(w.size, 10);
    assert.equal(s.frames, 10);
    assert.ok(Math.abs(s.fpsAvg - 50) < 0.01);
    w.clear();
    assert.equal(w.summary(), null);
  });
});

describe("shortUserAgent", () => {
  const androidChrome = "Mozilla/5.0 (Linux; Android 16; MHG-NX9 Build/HONORMHG-N49) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.7444.102 Mobile Safari/537.36";

  it("Android Chrome: böngésző + főverzió, rendszer + főverzió, modell nélkül", () => {
    const out = shortUserAgent(androidChrome);
    assert.equal(out, "Chrome 142 · Android 16");
    assert.ok(!out.includes("MHG"), "az eszközmodell nem kerülhet a kimenetbe");
    assert.ok(!out.includes("Build"));
  });

  it("gyártói böngésző és WebView felismerése", () => {
    assert.equal(
      shortUserAgent("Mozilla/5.0 (Linux; Android 15; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 HonorBrowser/8.1"),
      "Honor böngésző 8 · Android 15",
    );
    assert.equal(
      shortUserAgent("Mozilla/5.0 (Linux; Android 14; K; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.0.0 Mobile Safari/537.36"),
      "Chrome 128 (WebView) · Android 14",
    );
  });

  it("iOS Safari és asztali Chrome", () => {
    assert.equal(
      shortUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1"),
      "Safari 18 · iOS 18",
    );
    assert.equal(
      shortUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"),
      "Chrome 142 · Windows",
    );
  });

  it("ismeretlen szövegre nem dob", () => {
    assert.equal(shortUserAgent(""), "ismeretlen");
  });
});

describe("megapixels, fmt, median", () => {
  it("megapixel két tizedesre", () => {
    assert.equal(megapixels(1240, 1252), 1.55);
    assert.equal(megapixels(0, 0), 0);
  });

  it("a hiányzó érték „n. a.”", () => {
    assert.equal(fmt(null), "n. a.");
    assert.equal(fmt(Number.NaN), "n. a.");
    assert.equal(fmt(16.666, 1), "16.7");
    assert.equal(fmt(3, 0), "3");
  });

  it("medián", () => {
    assert.equal(median([]), null);
    assert.equal(median([5, 1, 9]), 5);
    assert.equal(median([4, 1, 3, 2]), 2);
  });
});

describe("isLoopRunning", () => {
  it("gyors huroknál 1 s a küszöb", () => {
    assert.equal(isLoopRunning(16, 16.7), true);
    assert.equal(isLoopRunning(999, 16.7), true);
    assert.equal(isLoopRunning(1000, 16.7), false, "szünet: 1 s óta nincs képkocka");
  });

  it("lassú, de futó hurok (> 1 s / képkocka — szoftveres megjelenítő) nem „áll” (PR #504 CI)", () => {
    assert.equal(isLoopRunning(1400, 1500), true);
    assert.equal(isLoopRunning(2900, 1500), true);
    assert.equal(isLoopRunning(4500, 1500), false, "három képkockányi csend után áll");
  });

  it("képkocka nélkül vagy értelmetlen bemenetre az 1 s-os küszöb él, és nem dob", () => {
    assert.equal(isLoopRunning(500, 0), true);
    assert.equal(isLoopRunning(16_000, 600_000), false, "szünet utáni óriási rés legfeljebb 15 s-ig számít");
    assert.equal(isLoopRunning(14_000, 600_000), true);
    assert.equal(isLoopRunning(1500, Number.NaN), false);
    assert.equal(isLoopRunning(Number.NaN, 16), false);
  });
});

/**
 * Review #504 L1 — idősorok a vak ellenőr próbáiból (`ci-repro-*.json`, `t2-stale-fut.json`): a jelzőt minden képkocka-köz
 * KÖZEPÉN és VÉGÉN kiolvassuk (az eredeti olvasási pontok — review #504, 2. vak kör M1: ezeket tilos az implementációhoz igazítani).
 * Két modell: CPU-kötött (a kirajzolás a köz végén ér véget, előtte a főszál foglalt) és GPU-kötött (a `render()` gyorsan
 * visszatér, a kirajzolás a köz elején +5 ms-kor véget ér, a főszál a köz többi részében TÉTLEN — szoftveres WebGL, gyenge GPU).
 */
type RenderModel = "cpu" | "gpu";
function simulate(clock: LoopClock, frameMs: readonly number[], gameRunning: boolean | undefined, model: RenderModel = "gpu") {
  let t = 1000;
  const reads: boolean[] = [];
  for (const ms of frameMs) {
    clock.frame(t, t);
    if (model === "gpu") clock.rendered(t + Math.min(5, ms / 2));
    reads.push(clock.running(t + ms * 0.5, gameRunning));
    reads.push(clock.running(t + ms - 1, gameRunning));
    if (model === "cpu") clock.rendered(t + ms - 0.5);
    t += ms;
  }
  return reads;
}

describe("LoopClock — a játék jelzője az igazság (review #504 L1)", () => {
  it("GPU-kötött, élő, lassú hurok (≈ 1 fps, 900–1200 ms-os közök; 2. vak kör M2): soha nem „áll”", () => {
    const series = [16.7, 16.7, 16.7, 400, 958, 1005, 1066, 1111, 1159, 1200, 1200, 1005, 900, 1200];
    const reads = simulate(new LoopClock(), series, true, "gpu");
    assert.equal(reads.filter((r) => !r).length, 0);
  });

  it("GPU-kötött, állandó 1200 ms-os köz: soha nem „áll”", () => {
    const reads = simulate(new LoopClock(), Array.from({ length: 20 }, () => 1200), true, "gpu");
    assert.equal(reads.filter((r) => !r).length, 0);
  });

  it("150 / 150 / 1600 ms váltakozva: futó hurok soha nem „áll”", () => {
    const series = Array.from({ length: 30 }, (_, i) => (i % 3 === 2 ? 1600 : 150));
    for (const model of ["cpu", "gpu"] as const) {
      const reads = simulate(new LoopClock(), series, true, model);
      assert.equal(reads.filter((r) => !r).length, 0, `${model}-kötött`);
    }
  });

  it("19 gyors képkocka, majd egy 2500 ms-os: futó hurok soha nem „áll”", () => {
    const series = [...Array.from({ length: 19 }, () => 16.7), 2500, 16.7, 16.7];
    for (const model of ["cpu", "gpu"] as const) {
      const reads = simulate(new LoopClock(), series, true, model);
      assert.equal(reads.filter((r) => !r).length, 0, `${model}-kötött`);
    }
  });

  it("szünet → folytatás egy képkockára → szünet: az álló hurok azonnal „áll” (nem 14 s-ig „fut”)", () => {
    const clock = new LoopClock();
    let t = 1000;
    for (let i = 0; i < 60; i++, t += 16.7) {
      clock.frame(t, t);
      clock.rendered(t + 3);
    }
    assert.equal(clock.running(t + 10, false), false, "első szünet");
    t += 8500;
    clock.frame(t, t); // folytatás: egyetlen képkocka
    clock.rendered(t + 3);
    assert.equal(clock.running(t + 5, true), true, "fut a folytatás képkockáján");
    assert.equal(clock.running(t + 200, false), false, "újra szünet — azonnal áll");
    assert.equal(clock.running(t + 13_000, false), false);
  });

  it("játék-jelző nélkül (tartalék becslés) a szünet utáni rés nem nyújtja meg a „fut” időt", () => {
    const clock = new LoopClock();
    let t = 1000;
    for (let i = 0; i < 60; i++, t += 16.7) clock.frame(t, t);
    t += 8500;
    // SPEC-VÁLTOZÁS (GPT-vak review #504 L1): a szünetet a hurok újraindulása jelzi (`restarted`), nem a köz hossza — a bemenet a
    // valódi játék jelét kapja; az állítás változatlan.
    clock.frame(t, t, true);
    assert.equal(clock.running(t + 2000), false, "2 s-mal az utolsó képkocka után a hurok áll (régen: 15 s-ig „fut”)");
  });

  it("a szünet utáni rés nem kerül a képkocka-statisztikába", () => {
    const clock = new LoopClock();
    assert.equal(clock.frame(1000, 1000), null, "első képkocka");
    assert.equal(clock.frame(1016, 1016), 16);
    // SPEC-VÁLTOZÁS (GPT-vak review #504 L1): a szünetet a hurok újraindulása jelzi (`restarted`), nem a köz hossza — a bemenet a
    // valódi játék jelét kapja; az állítás változatlan.
    assert.equal(clock.frame(9516, 9516, true), null, "8,5 s-os rés");
  });
});

/**
 * Review #504 (a3846493, vak, L1): a „fut” a játék jelzője ÉS friss kirajzolt képkocka. A frissesség a legutóbbi képkocka
 * KIRAJZOLÁSÁNAK VÉGÉTŐL számít — a főszál egy hosszú képkocka alatt foglalt, a panel csak utána olvas, így egy hosszú, de
 * befejezett képkocka nem ad hamis „áll”-t; a befagyott hurok (nincs több kirajzolás) viszont 1 s után „áll”.
 */
describe("LoopClock — befagyott hurok (review #504 vak L1)", () => {
  // SPEC-DÖNTÉS (orkesztrátori döntés 2026-11-19): a 2,5 s-os élő képkocka nem lehet hamis „áll” (a visszaállított idősor-mérce),
  // ezért a fagyásjelzés alsóhatára 3 s — az eredeti 1,5 s-os elvárás 3,5 s-ra módosult. Terv: docs/specs/2026-11-17-kockavadasz-telefon-gyors.md.
  it("a játék szerint fut, de 3,5 s óta nincs kirajzolt képkocka → „áll”", () => {
    const clock = new LoopClock();
    let t = 1000;
    for (let i = 0; i < 20; i++, t += 16.7) {
      clock.frame(t, t);
      clock.rendered(t + 4);
    }
    assert.equal(clock.running(t, true), true, "friss képkocka mellett fut");
    assert.equal(clock.running(t + 3500, true), false, "befagyott rAF / render előtti kivétel: áll");
  });

  it("valós ütemű hosszú képkockák (a főszál foglalt, olvasás a képkocka UTÁN): futó hurok nem „áll”", () => {
    const clock = new LoopClock();
    let t = 1000;
    const series = [16.7, 16.7, 1600, 150, 150, 1600, 16.7, 2500, 16.7];
    for (const ms of series) {
      clock.frame(t, t);
      clock.rendered(t + ms);
      assert.equal(clock.running(t + ms + 1, true), true, `a ${ms} ms-os képkocka után`);
      t += ms + 16.7;
    }
  });

  it("a játék szerint áll → „áll”, akkor is, ha az imént volt képkocka", () => {
    const clock = new LoopClock();
    clock.frame(1000, 1000);
    clock.rendered(1005);
    assert.equal(clock.running(1006, false), false);
  });
});

/**
 * GPT-vak review #504 (4dbc3a8b) L1 / L2 — a mérőszám helyessége. L1: az élő hurok lassú (≥ 1 s-os) képkockái is számítanak; a
 * szünetet a hurok ÚJRAINDULÁSA jelzi (a játék életciklusa), nem a köz hossza; a mintaablak ~4 s eltelt idő. L2: a frissesség csak
 * BEFEJEZETT kirajzolásból számol — a kivétellel megszakadt, újra és újra ütemezett képkocka nem tartja „fut”-on a jelzőt.
 */
describe("FPS lassú, élő hurkon és megszakadó rajzolásnál (GPT-vak review #504 L1, L2)", () => {
  it("L1: állandó 1200 ms-os, élő képkockák mind bekerülnek a statisztikába", () => {
    const clock = new LoopClock();
    let t = 1000;
    clock.frame(t, t, true);
    for (let i = 0; i < 6; i++) {
      t += 1200;
      assert.equal(clock.frame(t, t), 1200, `${i}. lassú képkocka`);
    }
  });

  it("L1: gyors, majd lassú szakasz — a 4 s-os ablak a lassú FPS-t és 1% low-t mutatja, a régi gyors minták kiesnek", () => {
    const w = new FrameWindow();
    let t = 1000;
    for (let i = 0; i < 120; i++) {
      t += 16.7;
      w.push({ dt: 16.7, js: 1, render: 1, at: t });
    }
    for (let i = 0; i < 5; i++) {
      t += 1200;
      w.push({ dt: 1200, js: 1, render: 1, at: t });
    }
    const s = w.summary(t)!;
    assert.ok(s.fpsAvg < 1, `fpsAvg = ${s.fpsAvg}`);
    assert.ok(s.fpsLow1 <= 1000 / 1200 + 1e-6, `fpsLow1 = ${s.fpsLow1}`);
  });

  it("L1: minta-elöregedés — 4 s után új képkocka nélkül nincs (elavult) FPS", () => {
    const w = new FrameWindow();
    w.push({ dt: 16.7, js: 1, render: 1, at: 1000 });
    assert.ok(w.summary(1500));
    assert.equal(w.summary(5200), null);
  });

  it("L1: a szünet utáni első képkocka (a hurok újraindult) nem számít", () => {
    const clock = new LoopClock();
    clock.frame(1000, 1000, true);
    assert.equal(clock.frame(1016, 1016), 16);
    assert.equal(clock.frame(9516, 9516, true), null);
  });

  it("L2: a képkockák elindulnak, de 3,5 s óta egy sem fejeződik be (a rajzolás kivételt dob) → „áll”", () => {
    const clock = new LoopClock();
    let t = 1000;
    for (let i = 0; i < 20; i++, t += 16.7) {
      clock.frame(t, t);
      clock.rendered(t + 3);
    }
    const lastOk = t;
    for (; t < lastOk + 3600; t += 16.7) clock.frame(t, t); // újraütemezett, de megszakadó képkockák
    assert.equal(clock.running(t, true), false);
  });
});

describe("DrawnFrameClock — FPS csak BEFEJEZETT, tényleg kirajzolt képkockából (2026-11-21 vak kör L1, L2)", () => {
  it("L1: a megszakadó (kivételt dobó) képkockák nem adnak mintát", () => {
    const c = new DrawnFrameClock();
    c.start(1000, true);
    assert.equal(c.completed(true), null, "az első kirajzolás csak a sor kezdete");
    let t = 1000;
    for (let i = 0; i < 200; i++) {
      t += 8.3;
      c.start(t, false); // a rajzolás kivételt dob, completed() nem hívódik
    }
    // Új sikeres képkocka: a köz az utolsó SIKERES képtől számít (a megjelenített képek tényleges üteme).
    t += 8.3;
    c.start(t, false);
    const dt = c.completed(true);
    assert.ok(dt !== null && Math.abs(dt - (t - 1000)) < 1e-6, `dt ${dt}`);
  });

  it("L1: két egymást követő sikeres képkocka a rAF-közt adja", () => {
    const c = new DrawnFrameClock();
    c.start(1000, true);
    c.completed(true);
    c.start(1016, false);
    assert.equal(c.completed(true), 16);
  });

  it("újraindulásnál a sor megszakad (a szünet nem képkocka-köz)", () => {
    const c = new DrawnFrameClock();
    c.start(1000, true);
    c.completed(true);
    c.start(9000, true);
    assert.equal(c.completed(true), null);
    c.start(9016, false);
    assert.equal(c.completed(true), 16);
  });

  it("L2: elveszett kontextusnál (drawn=false) nincs minta, és visszaállás után az első valódi rajzolástól mér újra", () => {
    const c = new DrawnFrameClock();
    c.start(1000, true);
    c.completed(true);
    for (let t = 1016; t < 6000; t += 16) {
      c.start(t, false);
      assert.equal(c.completed(false), null);
    }
    c.start(6000, false);
    assert.equal(c.completed(true), null, "a visszaállás utáni első kép csak a sor kezdete");
    c.start(6016, false);
    assert.equal(c.completed(true), 16);
  });

  it("completed() start() nélkül nem ad mintát", () => {
    const c = new DrawnFrameClock();
    assert.equal(c.completed(true), null);
  });

  it("2. vak kör L1: kapcsolás (reset) után az első új kép csak alap, a második adja az első mintát", () => {
    const c = new DrawnFrameClock();
    c.start(1000, true);
    c.completed(true);
    // 1200 ms várakozás a váltás ELŐTT, majd kapcsolás.
    c.reset();
    c.start(2208, false);
    assert.equal(c.completed(true), null, "az első új kép nem hordozza a váltás előtti várakozást");
    c.start(2224, false);
    assert.equal(c.completed(true), 16, "a második új kép a két új kép közét adja");
  });
});

describe("probeOutcome — teljes / részleges / üres GPU-próba (2. vak kör L3)", () => {
  it("teljes próba: a medián az eredmény", () => {
    assert.deepEqual(probeOutcome([3, 1, 2], 3), { value: 2, samples: 3, requested: 3, partial: false });
  });

  it("részleges próba (időtúllépés): nincs teljes eredmény, a mintaszám látszik", () => {
    assert.deepEqual(probeOutcome([3.5], 40), { value: null, samples: 1, requested: 40, partial: true });
  });

  it("üres próba: nincs eredmény, 0 minta", () => {
    assert.deepEqual(probeOutcome([], 40), { value: null, samples: 0, requested: 40, partial: true });
  });

  it("a felirat a részleges és az üres próbát megkülönbözteti a teljestől", () => {
    assert.equal(probeLabel(probeOutcome([1, 2, 3], 3)), "2.00 ms");
    assert.equal(probeLabel(probeOutcome([3.5], 40)), "részleges 1/40");
    assert.equal(probeLabel(probeOutcome([], 40)), "részleges 0/40");
    assert.equal(probeLabel(null), "–");
  });
});

describe("hosszú feladatok — támogatás és ablak (PR #504 Copilot)", () => {
  it("csak akkor figyel, ha a böngésző a `longtask` bejegyzést támogatja (Safari: van observer, longtask nincs)", () => {
    assert.equal(longTaskObservable({ supportedEntryTypes: ["longtask", "mark"] }), true);
    assert.equal(longTaskObservable({ supportedEntryTypes: ["mark", "measure", "navigation"] }), false);
    assert.equal(longTaskObservable({}), false);
    assert.equal(longTaskObservable(undefined), false);
  });

  it("az ablakba csak részben eső feladatnak csak az ablakba eső része számít", () => {
    // Ablak: [6000, 10000]. Az első feladat 5000–7000 (1000 ms az ablakban), a második teljesen benne (200 ms).
    const load = longTaskLoad([{ start: 5000, end: 7000 }, { start: 8000, end: 8200 }], 10_000, 4000);
    assert.equal(load.count, 2);
    assert.equal(load.ms, 1200);
  });

  it("az ablak előtt véget ért feladat nem számít; az ablak hossza fölé nem nő", () => {
    assert.deepEqual(longTaskLoad([{ start: 1000, end: 5999 }], 10_000, 4000), { count: 0, ms: 0 });
    assert.deepEqual(longTaskLoad([{ start: 0, end: 20_000 }], 10_000, 4000), { count: 1, ms: 4000 });
  });
});
