/**
 * J0b — hullám-forgatókönyv (végrehajtás J0b „Szerződés”; terv 6.1). A forgatókönyv (adat) játékonként, a szabály közös.
 *
 * Szabály (tiszta, seedelt — az idő a hívótól jön `dtSec`-ben, a véletlen a kapott `rng`-ből):
 * - Hullámonként `budget` költségkeret. A spawn-óra `dtSec × tempó`-val nő, ahol tempó = 0,7 + 0,6 × intensity
 *   (intensity 0 → 0,7×, 0,5 → 1×, 1 → 1,3×: a terv ±30%-a). Minden betelt `spawnEverySec` egy ellenfelet szül: a még
 *   megfizethető (`cost ≤ maradék`) fajták közül `weight` szerint súlyozva, seedelten.
 * - Ha már semmi nem fizethető meg, a keret elfogyott; ekkor a hullám a `miniboss` fajtát (ha meg van adva) egyszer
 *   kibocsátja, a `boss`-t pedig akkor, amikor már senki (a miniboss sem) él — a főellenfél a hullám végén, tiszta pályán
 *   érkezik.
 * - `onCleared(n)` az eltűnt (legyőzött / kiesett) ellenfeleket vonja le. `waveDone()`: a keret elfogyott, a záró
 *   ellenfelek kijöttek, és egy ellenfél sincs életben.
 * - `next()` a következő hullámra lép (új keret, nullázott spawn-óra; az életben maradtak száma megmarad); az utolsó után
 *   `false`, és a `done()` igaz. A `done()` akkor is igaz, ha az utolsó hullám `waveDone()`.
 */
import { toRandom, type RandomSource } from "./types";

export type WaveEnemy = { kind: string; cost: number; weight: number };
export type WaveSpec = { id: string; budget: number; enemies: readonly WaveEnemy[]; spawnEverySec: number; miniboss?: string; boss?: string };
export type WaveDirector = {
  index(): number;
  current(): WaveSpec;
  /** dtSec játékidőben; intensity 0..1 a spawn-tempót ±30%-kal skálázza. Visszaadja a most születő ellenfelek fajtáját. */
  tick(dtSec: number, intensity: number): string[];
  onCleared(count?: number): void;
  waveDone(): boolean; // a költségvetés elfogyott és minden ellenfél eltűnt
  next(): boolean;     // következő hullám; false, ha nincs több
  done(): boolean;
};

/** A spawn-tempó szorzója: intensity 0 → 0,7, 1 → 1,3. */
export function waveTempo(intensity: number): number {
  const i = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0.5;
  return 0.7 + 0.6 * i;
}

function validate(script: readonly WaveSpec[]): void {
  if (script.length === 0) throw new RangeError("waves: a forgatókönyv nem lehet üres");
  for (const w of script) {
    if (!(w.budget >= 0) || !(w.spawnEverySec > 0)) {
      throw new RangeError(`waves: a(z) ${w.id} hullám budget ≥ 0 és spawnEverySec > 0 legyen`);
    }
    for (const e of w.enemies) {
      if (!(e.cost > 0) || !(e.weight > 0)) throw new RangeError(`waves: a(z) ${w.id}/${e.kind} cost és weight > 0 legyen`);
    }
  }
}

export function createWaveDirector(script: readonly WaveSpec[], rng: RandomSource): WaveDirector {
  validate(script);
  const random = toRandom(rng);
  let index = 0;
  let budget = script[0]!.budget;
  let clock = 0;
  let alive = 0;
  let budgetSpent = false;
  let minibossOut = false;
  let bossOut = false;
  let finished = false;

  function reset(i: number): void {
    index = i;
    budget = script[i]!.budget;
    clock = 0;
    budgetSpent = false;
    minibossOut = false;
    bossOut = false;
  }

  function pick(spec: WaveSpec): WaveEnemy | null {
    let total = 0;
    for (const e of spec.enemies) if (e.cost <= budget) total += e.weight;
    if (total <= 0) return null;
    let r = random() * total;
    let last: WaveEnemy | null = null;
    for (const e of spec.enemies) {
      if (e.cost > budget) continue;
      last = e;
      r -= e.weight;
      if (r < 0) return e;
    }
    return last;
  }

  function closersOut(spec: WaveSpec): boolean {
    return (!spec.miniboss || minibossOut) && (!spec.boss || bossOut);
  }

  const self: WaveDirector = {
    index: () => index,
    current: () => script[index]!,
    tick(dtSec, intensity) {
      const born: string[] = [];
      if (finished || !(dtSec > 0)) return born;
      const spec = script[index]!;
      if (!budgetSpent) {
        clock += dtSec * waveTempo(intensity);
        while (clock >= spec.spawnEverySec) {
          clock -= spec.spawnEverySec;
          const enemy = pick(spec);
          if (!enemy) {
            budgetSpent = true;
            break;
          }
          budget -= enemy.cost;
          alive += 1;
          born.push(enemy.kind);
        }
        if (!budgetSpent && pick(spec) === null) budgetSpent = true;
      }
      if (budgetSpent && !closersOut(spec)) {
        if (spec.miniboss && !minibossOut) {
          minibossOut = true;
          alive += 1;
          born.push(spec.miniboss);
        } else if (spec.boss && !bossOut && alive === 0) {
          bossOut = true;
          alive += 1;
          born.push(spec.boss);
        }
      }
      return born;
    },
    onCleared(count = 1) {
      if (!(count > 0)) return;
      alive = Math.max(0, alive - count);
    },
    waveDone: () => budgetSpent && closersOut(script[index]!) && alive === 0,
    next() {
      if (index + 1 < script.length) {
        reset(index + 1);
        return true;
      }
      finished = true;
      return false;
    },
    done: () => finished || (index === script.length - 1 && self.waveDone()),
  };
  return self;
}
