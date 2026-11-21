/**
 * `?perf=1` diagnosztika — tiszta segédek (terv: docs/specs/2026-11-17-kockavadasz-telefon.md, 6. szakasz).
 *
 * Böngésző-API nélkül, hogy a számolás egységtesztelhető legyen (tests/perf-stats.test.ts). A panel semmit nem küld és
 * nem tárol; a `shortUserAgent` szándékosan eldobja az eszközmodellt és a build-azonosítót.
 */

/** A `?perf=1` kapcsoló a `perfFlag` modulban él (a játék darabja csak azt tölti be); itt a meglévő hívók miatt újraexportálva. */
export { perfEnabledFrom } from "./perfFlag";

/** Egy képkocka mért idői ms-ban: `dt` az előző képkockától, `js` a frissítés, `render` a `renderer.render` hívás. */
/** `at`: a képkocka időbélyege (ms, ugyanazon az órán, mint a `summary(nowMs)`); nélküle a minta nem öregszik. */
export type FrameSample = { dt: number; js: number; render: number; at?: number };

/** A mintaablak hossza (terv 6. szakasz: „az utolsó ~4 s ablakából”) — GPT-vak review #504 L1: eltelt idő, nem elemszám. */
export const FRAME_WINDOW_MS = 4000;

export type FrameSummary = {
  frames: number;
  fpsAvg: number;
  /** A leglassabb 1 % képkocka átlagából számolt fps. */
  fpsLow1: number;
  dtP50: number;
  dtP95: number;
  /** A leggyorsabb képkocka — a kijelző frissítési idejére utal (8,3 ms ≈ 120 Hz). */
  dtMin: number;
  jsAvg: number;
  renderAvg: number;
};

/** Gyűrűpuffer a legutóbbi képkockákról; a képkocka-hurokban nem foglal memóriát. */
export class FrameWindow {
  private readonly dt: Float32Array;
  private readonly js: Float32Array;
  private readonly render: Float32Array;
  private readonly sorted: Float32Array;
  private readonly at: Float64Array;
  private readonly picked: number[] = [];
  private head = 0;
  private count = 0;

  constructor(private readonly capacity = 480) {
    this.dt = new Float32Array(capacity);
    this.js = new Float32Array(capacity);
    this.render = new Float32Array(capacity);
    this.sorted = new Float32Array(capacity);
    this.at = new Float64Array(capacity);
  }

  get size(): number {
    return this.count;
  }

  push(s: FrameSample): void {
    this.dt[this.head] = s.dt;
    this.js[this.head] = s.js;
    this.render[this.head] = s.render;
    this.at[this.head] = s.at ?? Number.NaN;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count += 1;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }

  /**
   * Összegzés. `nowMs` megadásával csak az utolsó `FRAME_WINDOW_MS` képkockái számítanak (időbélyeg nélküli minta mindig);
   * ha az ablakban nincs minta, `null` — elavult FPS nem jelenik meg.
   */
  summary(nowMs?: number): FrameSummary | null {
    const picked = this.picked;
    picked.length = 0;
    for (let i = 0; i < this.count; i++) {
      const a = this.at[i]!;
      if (nowMs === undefined || Number.isNaN(a) || a >= nowMs - FRAME_WINDOW_MS) picked.push(i);
    }
    const n = picked.length;
    if (n === 0) return null;
    let dtSum = 0;
    let jsSum = 0;
    let renderSum = 0;
    for (let k = 0; k < n; k++) {
      const i = picked[k]!;
      const d = this.dt[i]!;
      this.sorted[k] = d;
      dtSum += d;
      jsSum += this.js[i]!;
      renderSum += this.render[i]!;
    }
    const sorted = this.sorted.subarray(0, n);
    sorted.sort();
    const at = (p: number) => sorted[Math.floor(p * (n - 1))]!;
    const slowCount = Math.max(1, Math.floor(n / 100));
    let slowSum = 0;
    for (let i = n - slowCount; i < n; i++) slowSum += sorted[i]!;
    const slowAvg = slowSum / slowCount;
    return {
      frames: n,
      fpsAvg: dtSum > 0 ? (1000 * n) / dtSum : 0,
      fpsLow1: slowAvg > 0 ? 1000 / slowAvg : 0,
      dtP50: at(0.5),
      dtP95: at(0.95),
      dtMin: sorted[0]!,
      jsAvg: jsSum / n,
      renderAvg: renderSum / n,
    };
  }
}

const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/HonorBrowser\/(\d+)/, "Honor böngésző"],
  [/HuaweiBrowser\/(\d+)/, "Huawei böngésző"],
  [/SamsungBrowser\/(\d+)/, "Samsung Internet"],
  [/EdgA?\/(\d+)/, "Edge"],
  [/OPR\/(\d+)/, "Opera"],
  [/Firefox\/(\d+)/, "Firefox"],
  [/CriOS\/(\d+)/, "Chrome"],
  [/Chrome\/(\d+)/, "Chrome"],
  [/Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari/, "Safari"],
];

/**
 * „Chrome 142 · Android 16” alakú rövidítés. Csak a böngésző és a rendszer neve + főverziója marad; az eszközmodell és a
 * build-azonosító nem (a panel képernyőfotója így nem hordoz az eszközre jellemző ujjlenyomatot).
 */
export function shortUserAgent(ua: string): string {
  let browser = "";
  for (const [re, name] of BROWSERS) {
    const m = re.exec(ua);
    if (m) {
      browser = `${name} ${m[1]}`;
      break;
    }
  }
  let os = "";
  const android = /Android (\d+)/.exec(ua);
  const ios = /(?:iPhone|iPad|iPod).*? OS (\d+)/.exec(ua);
  if (android) os = `Android ${android[1]}`;
  else if (ios) os = `iOS ${ios[1]}`;
  else if (/Windows NT/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";
  const webView = /; wv\)/.test(ua) ? " (WebView)" : "";
  const parts = [browser ? browser + webView : "", os].filter(Boolean);
  return parts.length ? parts.join(" · ") : "ismeretlen";
}

/** Megapixel két tizedesre. */
export function megapixels(width: number, height: number): number {
  return Math.round((width * height) / 10_000) / 100;
}

/** Szám a panelre; `null` vagy nem véges érték → „n. a.”. */
export function fmt(value: number | null | undefined, digits = 1): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "n. a.";
}

/** Rendezetlen számlista mediánja; üres lista → `null`. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)]!;
}

/**
 * Él-e a képkocka-hurok: az utolsó képkocka óta eltelt idő belefér-e a hurok saját ütemébe. Rögzített 1 s-os küszöbbel a
 * lassú (szoftveres megjelenítő, gyenge eszköz: > 1 s / képkocka), de FUTÓ hurok „áll”-nak látszott (PR #504 CI). A küszöb
 * ezért legalább 1 s, lassú huroknál pedig a legutóbbi képkockaidő háromszorosa.
 */
export function isLoopRunning(sinceLastFrameMs: number, lastFrameDtMs: number): boolean {
  if (!(sinceLastFrameMs >= 0)) return false;
  const dt = Number.isFinite(lastFrameDtMs) && lastFrameDtMs > 0 ? lastFrameDtMs : 0;
  // Felső korlát: egy szünet utáni első „képkockaidő” (akár percek) ne tartsa „fut”-on a jelzőt 15 s-nál tovább.
  return sinceLastFrameMs < Math.max(1000, 3 * Math.min(dt, 5000));
}

/**
 * FPS-minta csak BEFEJEZETT és ténylegesen kirajzolt képkockából (2026-11-21 vak kör L1, L2). A képkocka elején (`start`) csak
 * az időbélyeg jegyződik; a minta a `completed(drawn)` hívásakor születik, a köz az előző SIKERES kirajzolástól számít. Ha a
 * rajzolás kivételt dob, `completed` el sem hangzik — a megszakadt próbálkozás nem minta. `drawn === false` (elveszett
 * WebGL-kontextus: a `render()` rajzolás nélkül tér vissza) sem minta, és megszakítja a sort; újrainduláskor (szünet után) is
 * megszakad, így a rés nem képkocka-köz.
 */
export class DrawnFrameClock {
  private lastDrawnNow: number | null = null;
  private pendingNow: number | null = null;

  start(now: number, restarted: boolean): void {
    if (restarted) this.lastDrawnNow = null;
    this.pendingNow = now;
  }

  completed(drawn: boolean): number | null {
    const now = this.pendingNow;
    this.pendingNow = null;
    if (now === null) return null;
    if (!drawn) {
      this.lastDrawnNow = null;
      return null;
    }
    const prev = this.lastDrawnNow;
    this.lastDrawnNow = now;
    return prev !== null && now > prev ? now - prev : null;
  }

  /**
   * Kapcsolás (2. vak kör L1): a váltás előtti utolsó kép nem lehet az új mód első közének kezdete — a következő sikeres kép
   * csak új alap, az első minta a második új képpel születik.
   */
  reset(): void {
    this.lastDrawnNow = null;
  }
}

/** A szinkron GPU-próba kimenete (2. vak kör L3): teljes eredmény csak akkor, ha a kért összes minta megvan. */
export type ProbeOutcome = { value: number | null; samples: number; requested: number; partial: boolean };

export function probeOutcome(samples: readonly number[], requested: number): ProbeOutcome {
  const partial = samples.length < requested;
  return { value: partial ? null : median(samples), samples: samples.length, requested, partial };
}

/** A panel „próba” mezője: teljes → „x.xx ms”; részleges / üres (időtúllépés) → „részleges n/N”; nincs / megszakítva → „–”. */
export function probeLabel(outcome: ProbeOutcome | null): string {
  if (!outcome) return "–";
  if (outcome.partial) return `részleges ${outcome.samples}/${outcome.requested}`;
  return `${fmt(outcome.value, 2)} ms`;
}

/**
 * A képkocka-hurok állapota a panelnek (review #504 L1). Elsődleges forrás a JÁTÉK saját jelzője (`gameRunning`: fut-e a hurok
 * — a Kockavadászban a `runningRef`); a falióra-becslés (`isLoopRunning`) csak akkor dönt, ha a játék nem ad jelzőt.
 * A szünet utáni rés (≥ 1 s) nem képkockaidő: ott a `lastDt` 0, hogy a tartalék becslés ne nyújtsa meg a „fut” időt.
 */
const FRESH_FLOOR_MS = 3000;
const INTERVAL_HISTORY = 8;
const MAX_INTERVAL_MS = 5000;

export class LoopClock {
  private lastNow: number | null = null;
  private lastFrameAt = 0;
  private lastDt = 0;
  /** Az utolsó néhány KIRAJZOLÁSOK közti köz (ms, egyenként legfeljebb 5000) — a lassú, de élő hurok frissességi küszöbéhez. */
  private readonly intervals: number[] = [];
  /** A hurok (újra)indulása óta volt-e kirajzolás (a szünetet átívelő köz nem számít). */
  private renderedSinceRestart = false;
  /** A mostani futás (az utolsó (újra)indulás) első képkocka-kezdete — az első kirajzolásig ez a frissesség alapja. */
  private runStartAt = 0;
  /** A legutóbbi KIRAJZOLT képkocka vége (`performance.now()`); 0 = még nem volt. */
  private lastRenderedAt = 0;

  /**
   * Képkocka eleje: `now` a rAF-időbélyeg, `wallMs` a `performance.now()`, `restarted`: a hurok most indult (újra) — a játék
   * életciklusa (szünet / folytatás) jelzi, nem a köz hossza (GPT-vak review #504 L1). Visszaadja a statisztikába számító dt-t.
   */
  frame(now: number, wallMs: number, restarted = false): number | null {
    let counted: number | null = null;
    if (restarted) {
      this.lastNow = null;
      this.renderedSinceRestart = false;
    }
    if (this.lastNow === null) this.runStartAt = wallMs;
    if (this.lastNow !== null) {
      const dt = now - this.lastNow;
      const isFrame = dt > 0;
      this.lastDt = isFrame ? dt : 0;
      if (isFrame) counted = dt;
    }
    this.lastNow = now;
    this.lastFrameAt = wallMs;
    return counted;
  }

  /** Egy képkocka kirajzolása véget ért (`afterRender`). */
  rendered(wallMs: number): void {
    if (this.renderedSinceRestart && this.lastRenderedAt > 0 && wallMs > this.lastRenderedAt) {
      this.intervals.push(Math.min(wallMs - this.lastRenderedAt, MAX_INTERVAL_MS));
      if (this.intervals.length > INTERVAL_HISTORY) this.intervals.shift();
    }
    this.lastRenderedAt = wallMs;
    this.renderedSinceRestart = true;
  }

  /**
   * Fut-e a hurok. A játék jelzője (`gameRunning`) a szándék; „fut” csak akkor, ha emellett friss BEFEJEZETT kirajzolás is van.
   * Befagyott rAF, a `render()` előtti vagy alatti kivétel (a hurok újraütemez, de semmi nem rajzolódik ki — GPT-vak review #504
   * L2) így „áll”. Küszöb: legalább 3 s (a 2,5 s-os élő képkocka nem lehet hamis „áll” — orkesztrátori döntés 2026-11-19), lassú,
   * élő huroknál az utolsó 8 kirajzolás-köz MAXIMUMÁNAK háromszorosa (2. vak kör M2: egy ≈ 1 fps-es élő hurok sem villog).
   */
  running(wallMs: number, gameRunning?: boolean): boolean {
    if (gameRunning !== undefined) {
      // Az első kirajzolásig a futás első képkocka-kezdete számít (rögzített pont — a megszakadó újrapróbálkozások nem frissítik).
      const last = this.renderedSinceRestart ? this.lastRenderedAt : this.runStartAt;
      if (!gameRunning || last === 0) return false;
      const longest = this.intervals.length ? Math.max(...this.intervals) : 0;
      return wallMs - last < Math.max(FRESH_FLOOR_MS, 3 * longest);
    }
    return this.lastFrameAt > 0 && isLoopRunning(wallMs - this.lastFrameAt, this.lastDt);
  }
}
