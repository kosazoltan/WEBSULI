/**
 * Hang-előmelegítés horga (terv: docs/specs/2026-11-19-hang-elomelegites.md). Valódi React-gyökérben (jsdom):
 * (1) a horog felcsatoláskor NEM hoz létre azonnal kontextust, a tétlen időben igen — egyszer, akkor is, ha több komponens hívja;
 * (2) mozdulat nélkül felfüggesztett kontextusnál az első aktiváló mozdulat folytatja (`resume`), és hangot nem ad;
 * (3) `AudioContext` nélküli böngészőben nem dob hibát; (4) leválasztáskor a figyelők és az időzítő eltűnnek.
 * Vak ellenőr 1. kör (2026-11-19): (5) érintésnél a `pointerdown` (nem aktiváló) nem hoz létre kontextust, csak a `touchend`;
 * (6) ahol a böngésző megmondja (`userActivation.isActive`), a drága konstruktor a figyelő UTÁN fut, nem a bemenet útvonalán;
 * (7) némított felhasználónál nincs kontextus; (8) leválasztás után sem a figyelő, sem a tétlen / halasztott feladat nem hoz létre.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";

type DomWindow = Window & typeof globalThis & { close(): void };
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string, opts?: { url?: string }) => { window: DomWindow };
};

const globalKeys = ["window", "document", "navigator", "HTMLElement", "Node", "IS_REACT_ACT_ENVIRONMENT"] as const;
const saved = new Map<string, PropertyDescriptor | undefined>();
let dom: { window: DomWindow };
const idleQueue: Array<() => void> = [];
const stats = { created: 0, resumed: 0, oscillators: 0, createdOutsideActivation: 0 };
/** A valódi böngészőhöz hasonlóan a `resume` csak felhasználói mozdulat alatt indítja el a kontextust. */
let inGesture = false;
/** A böngésző átmeneti aktiválása (`navigator.userActivation.isActive`), ha a teszt beállítja. */
const activeNow = () => inGesture || (navigator as Navigator & { userActivation?: { isActive?: boolean } }).userActivation?.isActive === true;
const contexts: FakeAudioContext[] = [];
const lastCtx = () => contexts[contexts.length - 1]!;

class FakeParam {
  value = 0;
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
  linearRampToValueAtTime() {}
}
class FakeNode {
  frequency = new FakeParam();
  gain = new FakeParam();
  type = "sine";
  connect() {
    return this;
  }
  start() {}
  stop() {}
}
class FakeAudioContext {
  state: "suspended" | "running" = "suspended";
  currentTime = 0;
  destination = {};
  constructor() {
    stats.created += 1;
    // Mint a valódi böngészőben: aktiválás alatt létrehozva rögtön fut, különben felfüggesztve (és figyelmeztet).
    if (activeNow()) this.state = "running";
    else stats.createdOutsideActivation += 1;
    contexts.push(this as FakeAudioContext);
  }
  createOscillator() {
    stats.oscillators += 1;
    return new FakeNode();
  }
  createGain() {
    return new FakeNode();
  }
  resume() {
    stats.resumed += 1;
    if (!activeNow()) return Promise.reject(new Error("NotAllowedError"));
    this.state = "running";
    return Promise.resolve();
  }
}

before(() => {
  dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://websuli.test/" });
  for (const k of globalKeys) saved.set(k, Object.getOwnPropertyDescriptor(globalThis, k));
  const set = (k: string, v: unknown) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  const w = dom.window as unknown as Record<string, unknown> & DomWindow;
  // A tesztben a böngésző API-k szűk, hamis változata (csak amit a hangmotor használ).
  (w as unknown as Record<string, unknown>).AudioContext = FakeAudioContext;
  (w as unknown as Record<string, unknown>).requestIdleCallback = (cb: () => void) => {
    idleQueue.push(cb);
    return idleQueue.length;
  };
  (w as unknown as Record<string, unknown>).cancelIdleCallback = (id: number) => {
    idleQueue[id - 1] = () => {};
  };
  set("window", w);
  set("document", w.document);
  set("navigator", w.navigator);
  set("HTMLElement", w.HTMLElement);
  set("Node", w.Node);
  set("IS_REACT_ACT_ENVIRONMENT", true);
});

after(() => {
  for (const k of globalKeys) {
    const d = saved.get(k);
    if (d) Object.defineProperty(globalThis, k, d);
    else delete (globalThis as Record<string, unknown>)[k];
  }
  dom.window.close();
});

/*
 * Tulajdonosi döntés (2026-11-19, „A”): mozdulat nélkül a kontextus NEM jön létre (a böngésző minden betöltéskor
 * konzol-figyelmeztetést adott: „The AudioContext was not allowed to start…”). Nem aktivált lapon a tétlen idő semmit nem hoz
 * létre; az első aktiváló mozdulat a mozdulaton BELÜL hozza létre (így rögtön fut). Már aktivált lapon (a játéklistáról
 * érkezve: `navigator.userActivation.hasBeenActive`) tétlen időben előre létrejön.
 */
test("nem aktivált lapon: tétlen időben NEM jön létre (nincs figyelmeztetés); az első mozdulaton belül létrejön és fut, hang nélkül; utána a figyelők leválnak", async () => {
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const audio = await import("../client/src/lib/audioEngine");
  function Game() {
    audio.useAudioPrewarm();
    return null;
  }
  const root = createRoot(document.getElementById("root")!);
  await act(async () => {
    root.render(React.createElement(React.Fragment, null, React.createElement(Game), React.createElement(Game)));
  });
  assert.equal(stats.created, 0, "felcsatoláskor nincs kontextus");
  await act(async () => {
    for (const cb of idleQueue.splice(0)) cb();
  });
  assert.equal(stats.created, 0, "nem aktivált lapon a tétlen idő sem hoz létre kontextust (nincs konzol-figyelmeztetés)");
  // Az első aktiváló mozdulat (érintés vége): a mozdulaton belül jön létre, ezért rögtön fut.
  inGesture = true;
  window.dispatchEvent(new window.Event("touchend"));
  inGesture = false;
  assert.equal(stats.created, 1, "az első mozdulat pontosan egy kontextust hoz létre (két hívó mellett is)");
  assert.equal(lastCtx().state, "running", "a mozdulaton belül létrehozott kontextus fut");
  assert.equal(stats.oscillators, 0, "az előmelegítés hangot nem ad");
  // Futó kontextusnál a figyelők leváltak: egy későbbi felfüggesztés után a mozdulat már nem a horgon át folytat.
  lastCtx().state = "suspended";
  const before = stats.resumed;
  inGesture = true;
  window.dispatchEvent(new window.Event("keydown"));
  inGesture = false;
  assert.equal(stats.resumed, before, "futó kontextus után a mozdulat-figyelők leváltak");
  await act(async () => root.unmount());
});

test("már aktivált lapon (userActivation.hasBeenActive): tétlen időben előre létrejön", async () => {
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  const freshUrl = new URL("../client/src/lib/audioEngine.ts?aktivalt-lap", import.meta.url).href;
  const audio = (await import(freshUrl)) as typeof import("../client/src/lib/audioEngine");
  Object.defineProperty(navigator, "userActivation", { value: { hasBeenActive: true }, configurable: true });
  function Game() {
    audio.useAudioPrewarm();
    return null;
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Game)));
  const createdBefore = stats.created;
  assert.equal(idleQueue.length, 1, "egy tétlen feladat");
  await act(async () => {
    for (const cb of idleQueue.splice(0)) cb();
  });
  assert.equal(stats.created, createdBefore + 1, "aktivált lapon tétlen időben létrejön (az első hang már nem akad)");
  await act(async () => root.unmount());
  delete (navigator as unknown as Record<string, unknown>).userActivation;
});

test("AudioContext nélküli böngészőben a horog nem dob hibát", async () => {
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  // Friss modulpéldány (a gyorsítótárazott kontextus nélkül), hogy valóban az `AudioContext` nélküli út fusson.
  const freshUrl = new URL("../client/src/lib/audioEngine.ts?nincs-hangkontextus", import.meta.url).href;
  const audio = (await import(freshUrl)) as typeof import("../client/src/lib/audioEngine");
  const w = window as unknown as Record<string, unknown>;
  const savedAc = w.AudioContext;
  delete w.AudioContext;
  function Game() {
    audio.useAudioPrewarm();
    return null;
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Game)));
  await act(async () => {
    for (const cb of idleQueue.splice(0)) cb();
  });
  const createdBefore = stats.created;
  inGesture = true;
  window.dispatchEvent(new window.Event("click"));
  inGesture = false;
  assert.equal(stats.created, createdBefore, "AudioContext nélkül nem jön létre kontextus, és hiba sincs");
  await act(async () => root.unmount());
  w.AudioContext = savedAc;
});

type AudioModule = typeof import("../client/src/lib/audioEngine");
const freshAudio = async (tag: string) =>
  (await import(new URL(`../client/src/lib/audioEngine.ts?${tag}`, import.meta.url).href)) as AudioModule;
const setActivation = (v: { hasBeenActive?: boolean; isActive?: boolean } | null) => {
  if (v === null) delete (navigator as unknown as Record<string, unknown>).userActivation;
  else Object.defineProperty(navigator, "userActivation", { value: v, configurable: true });
};
const tick = () => new Promise((r) => setTimeout(r, 5));
async function mount(audio: AudioModule) {
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { act } = await import("react");
  function Game() {
    audio.useAudioPrewarm();
    return null;
  }
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Game)));
  return { unmount: () => act(async () => root.unmount()), act };
}
const touch = (type: string, activating: boolean) => {
  const ev = Object.assign(new window.Event(type), { pointerType: "touch" });
  inGesture = activating;
  window.dispatchEvent(ev);
  inGesture = false;
};

test("érintés-sorrend: a pointerdown (nem aktiváló) NEM hoz létre kontextust, csak az utána jövő touchend — és az fut", async () => {
  const audio = await freshAudio("erintes-sorrend");
  setActivation(null);
  idleQueue.splice(0);
  const m = await mount(audio);
  const created0 = stats.created;
  const outside0 = stats.createdOutsideActivation;
  touch("pointerdown", false);
  await tick();
  assert.equal(stats.created, created0, "a pointerdown után nincs kontextus (érintésnél nem aktiváló esemény)");
  touch("touchend", true);
  await tick();
  assert.equal(stats.created, created0 + 1, "a touchend létrehozza");
  assert.equal(stats.createdOutsideActivation, outside0, "aktiválás nélkül egy kontextus sem jött létre");
  assert.equal(lastCtx().state, "running", "a kontextus fut");
  await m.unmount();
});

test("userActivation.isActive mellett a drága konstruktor a figyelő UTÁN fut (nem a bemenet útvonalán), és nem aktiváló billentyű nem hoz létre", async () => {
  const audio = await freshAudio("halasztott");
  const ua = { hasBeenActive: false, isActive: false };
  setActivation(ua);
  idleQueue.splice(0);
  const m = await mount(audio);
  const created0 = stats.created;
  // Az Escape-billentyű nem ad aktiválást: a böngésző `isActive`-je hamis marad.
  window.dispatchEvent(new window.Event("keydown"));
  await tick();
  assert.equal(stats.created, created0, "aktiválás nélküli billentyű nem hoz létre kontextust");
  ua.hasBeenActive = true;
  ua.isActive = true;
  window.dispatchEvent(new window.Event("touchend"));
  assert.equal(stats.created, created0, "a figyelőben (szinkronban) még nincs konstruktor-hívás");
  await tick();
  assert.equal(stats.created, created0 + 1, "a figyelő után, az átmeneti aktiválás ablakán belül létrejön");
  assert.equal(lastCtx().state, "running", "és fut");
  ua.isActive = false;
  await m.unmount();
  setActivation(null);
});

test("némított felhasználónál a horog nem hoz létre kontextust (sem tétlen időben, sem mozdulatra)", async () => {
  const audio = await freshAudio("nemitott");
  audio.setMuted(true);
  try {
    const ua = { hasBeenActive: true, isActive: false };
    setActivation(ua);
    idleQueue.splice(0);
    const m = await mount(audio);
    const created0 = stats.created;
    await m.act(async () => {
      for (const cb of idleQueue.splice(0)) cb();
    });
    ua.isActive = true;
    touch("touchend", true);
    await tick();
    ua.isActive = false;
    assert.equal(stats.created, created0, "némítva nincs kontextus");
    await m.unmount();
  } finally {
    audio.setMuted(false);
    setActivation(null);
  }
});

test("leválasztás után a figyelő, a tétlen feladat és a halasztott létrehozás sem hoz létre kontextust", async () => {
  // (a) a tétlen feladat és a mozdulat-figyelő
  const audioA = await freshAudio("levalasztas-a");
  setActivation({ hasBeenActive: true, isActive: false });
  idleQueue.splice(0);
  const a = await mount(audioA);
  const created0 = stats.created;
  assert.equal(idleQueue.length, 1, "egy tétlen feladat várakozik");
  await a.unmount();
  for (const cb of idleQueue.splice(0)) cb();
  touch("touchend", true);
  touch("click", true);
  await tick();
  assert.equal(stats.created, created0, "leválasztás után sem a tétlen feladat, sem a mozdulat nem hoz létre kontextust");
  setActivation(null);
  // (b) a halasztott létrehozás
  const audioB = await freshAudio("levalasztas-b");
  const ua = { hasBeenActive: true, isActive: true };
  setActivation(ua);
  idleQueue.splice(0);
  const b = await mount(audioB);
  idleQueue.splice(0);
  window.dispatchEvent(new window.Event("touchend"));
  await b.unmount();
  await tick();
  assert.equal(stats.created, created0, "a leválasztáskor függő halasztott létrehozás is elmarad");
  setActivation(null);
});
