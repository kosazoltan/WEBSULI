/**
 * Hang-előmelegítés horga (terv: docs/specs/2026-11-19-hang-elomelegites.md). Valódi React-gyökérben (jsdom):
 * (1) a horog felcsatoláskor NEM hoz létre azonnal kontextust, a tétlen időben igen — egyszer, akkor is, ha több komponens hívja;
 * (2) mozdulat nélkül felfüggesztett kontextusnál az első aktiváló mozdulat folytatja (`resume`), és hangot nem ad;
 * (3) `AudioContext` nélküli böngészőben nem dob hibát; (4) leválasztáskor a figyelők és az időzítő eltűnnek.
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
const stats = { created: 0, resumed: 0, oscillators: 0 };
/** A valódi böngészőhöz hasonlóan a `resume` csak felhasználói mozdulat alatt indítja el a kontextust. */
let inGesture = false;
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
    if (!inGesture) return Promise.reject(new Error("NotAllowedError"));
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
