/**
 * `?perf=1` diagnosztika — tiszta segédek (terv: docs/specs/2026-11-17-kockavadasz-telefon.md, 6. szakasz).
 *
 * Böngésző-API nélkül, hogy a számolás egységtesztelhető legyen (tests/perf-stats.test.ts). A panel semmit nem küld és
 * nem tárol; a `shortUserAgent` szándékosan eldobja az eszközmodellt és a build-azonosítót.
 */

/** A `?perf=1` kapcsoló a `perfFlag` modulban él (a játék darabja csak azt tölti be); itt a meglévő hívók miatt újraexportálva. */
export { perfEnabledFrom } from "./perfFlag";

/** Egy képkocka mért idői ms-ban: `dt` az előző képkockától, `js` a frissítés, `render` a `renderer.render` hívás. */
export type FrameSample = { dt: number; js: number; render: number };

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
  private head = 0;
  private count = 0;

  constructor(private readonly capacity = 480) {
    this.dt = new Float32Array(capacity);
    this.js = new Float32Array(capacity);
    this.render = new Float32Array(capacity);
    this.sorted = new Float32Array(capacity);
  }

  get size(): number {
    return this.count;
  }

  push(s: FrameSample): void {
    this.dt[this.head] = s.dt;
    this.js[this.head] = s.js;
    this.render[this.head] = s.render;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count += 1;
  }

  clear(): void {
    this.head = 0;
    this.count = 0;
  }

  summary(): FrameSummary | null {
    const n = this.count;
    if (n === 0) return null;
    let dtSum = 0;
    let jsSum = 0;
    let renderSum = 0;
    for (let i = 0; i < n; i++) {
      const d = this.dt[i]!;
      this.sorted[i] = d;
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
 * A képkocka-hurok állapota a panelnek (review #504 L1). Elsődleges forrás a JÁTÉK saját jelzője (`gameRunning`: fut-e a hurok
 * — a Kockavadászban a `runningRef`); a falióra-becslés (`isLoopRunning`) csak akkor dönt, ha a játék nem ad jelzőt.
 * A szünet utáni rés (≥ 1 s) nem képkockaidő: ott a `lastDt` 0, hogy a tartalék becslés ne nyújtsa meg a „fut” időt.
 */
export class LoopClock {
  private lastNow: number | null = null;
  private lastFrameAt = 0;
  private lastDt = 0;

  /** Képkocka eleje: `now` a rAF-időbélyeg, `wallMs` a `performance.now()`. Visszaadja a statisztikába számító dt-t (vagy null-t). */
  frame(now: number, wallMs: number): number | null {
    let counted: number | null = null;
    if (this.lastNow !== null) {
      const dt = now - this.lastNow;
      const isFrame = dt > 0 && dt < 1000;
      this.lastDt = isFrame ? dt : 0;
      if (isFrame) counted = dt;
    }
    this.lastNow = now;
    this.lastFrameAt = wallMs;
    return counted;
  }

  running(wallMs: number, gameRunning?: boolean): boolean {
    if (gameRunning !== undefined) return gameRunning;
    return this.lastFrameAt > 0 && isLoopRunning(wallMs - this.lastFrameAt, this.lastDt);
  }
}
