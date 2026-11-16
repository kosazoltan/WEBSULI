/**
 * Mini-Director: intenzitás-fázisok (terv 2026-11-16-jatekok-jatekelmeny 6.1; végrehajtás J0a, KSZ-15).
 *
 * A Left 4 Dead „AI Director” mintájára egyszerűsítve, mobilmenethez rövidítve: felépülés → csúcs → lecsengés → pihenő →
 * felépülés. A játék a fázist olvassa (pihenőben nem indít új hullámot), a kérdés-ütemező a `calm()` pillanatokat
 * részesíti előnyben, hogy a kérdés ne a legnagyobb harc közepén érkezzen.
 *
 * Szabályok (tiszta, determinisztikus — nincs véletlen, nincs óra; az időt a hívó adja `dtSec`-ben):
 * - Jelzések: sérülés +0,25, rossz válasz +0,1, közeli veszély +0,05/s; az intenzitás 0..1 közé szorul.
 * - Lecsengés: −0,15/s, de abban az `update`-ablakban, amelyben harc-jelzés (`combat`, `damage`, `nearThreat`) jött, nem
 *   csökken. A rossz válasz nem harc: nem tartja fenn az intenzitást.
 * - buildup → peak: az intenzitás eléri a `PEAK_ENTER` (0,7) szintet.
 * - peak → fade: legalább `peakSec[0]` után, ha az intenzitás `PEAK_ENTER` alá esett; legkésőbb `peakSec[1]` után mindenképp
 *   (a csúcs nem tart örökké, akkor sem, ha a harc folytatódik).
 * - fade → relax: az intenzitás `RELAX_ENTER` (0,25) alá vagy rá esik.
 * - relax → buildup: legalább `relaxSec[0]` után az első harc-jelzésre; legkésőbb `relaxSec[1]` után mindenképp.
 */

export type DirectorPhase = "buildup" | "peak" | "fade" | "relax";

export type DirectorSignal = "damage" | "wrong" | "nearThreat" | "combat";

export type IntensityDirector = {
  /**
   * Jelzések: sérülés +0.25, rossz válasz +0.1, közeli veszély +0.05/s; egyébként −0.15/s (harc közben nem csökken).
   * A `dtSec` csak a `nearThreat`-nél számít (alap: egy sim-lépés, 1/60 s).
   */
  signal(kind: DirectorSignal, dtSec?: number): void;
  update(dtSec: number): void;
  phase(): DirectorPhase;
  /** 0..1 */
  intensity(): number;
  /** Kérdés-ütemezéshez: true a relax / fade fázisban, vagy ha a peak 4 s-nál tovább tart. */
  calm(): boolean;
};

export const PEAK_ENTER = 0.7;
export const RELAX_ENTER = 0.25;
export const DAMAGE_GAIN = 0.25;
export const WRONG_GAIN = 0.1;
export const NEAR_THREAT_GAIN_PER_SEC = 0.05;
export const DECAY_PER_SEC = 0.15;
/** A `calm()` ennyi másodperc csúcs után akkor is igaz, ha a csúcs még tart (hosszú `peakSec` esetén). */
export const LONG_PEAK_SEC = 4;

const DEFAULT_PEAK_SEC: readonly [number, number] = [2, 4];
const DEFAULT_RELAX_SEC: readonly [number, number] = [8, 15];
const DEFAULT_SIGNAL_DT_SEC = 1 / 60;

function validRange(name: string, range: readonly [number, number]): readonly [number, number] {
  const [min, max] = range;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
    throw new RangeError(`director: a ${name} [min, max] legyen, 0 ≤ min ≤ max (kapott: [${min}, ${max}])`);
  }
  return range;
}

/** Alap: peak 2–4 s, relax 8–15 s (mobilmenethez rövidítve). */
export function createIntensityDirector(
  opts: { peakSec?: [number, number]; relaxSec?: [number, number] } = {},
): IntensityDirector {
  const [peakMin, peakMax] = validRange("peakSec", opts.peakSec ?? DEFAULT_PEAK_SEC);
  const [relaxMin, relaxMax] = validRange("relaxSec", opts.relaxSec ?? DEFAULT_RELAX_SEC);

  let current: DirectorPhase = "buildup";
  let level = 0;
  let phaseSec = 0;
  /** Jött-e harc-jelzés a legutóbbi `update` óta. */
  let pressure = false;

  const add = (amount: number): void => {
    level = Math.min(1, Math.max(0, level + amount));
  };

  const enter = (next: DirectorPhase): void => {
    current = next;
    phaseSec = 0;
  };

  return {
    signal(kind: DirectorSignal, dtSec: number = DEFAULT_SIGNAL_DT_SEC): void {
      switch (kind) {
        case "damage":
          add(DAMAGE_GAIN);
          pressure = true;
          break;
        case "wrong":
          add(WRONG_GAIN);
          break;
        case "nearThreat":
          if (Number.isFinite(dtSec) && dtSec > 0) add(NEAR_THREAT_GAIN_PER_SEC * dtSec);
          pressure = true;
          break;
        case "combat":
          pressure = true;
          break;
      }
    },
    update(dtSec: number): void {
      if (!Number.isFinite(dtSec) || dtSec <= 0) return;
      const hadPressure = pressure;
      pressure = false;
      if (!hadPressure) add(-DECAY_PER_SEC * dtSec);
      phaseSec += dtSec;

      switch (current) {
        case "buildup":
          if (level >= PEAK_ENTER) enter("peak");
          break;
        case "peak":
          if (phaseSec >= peakMax || (phaseSec >= peakMin && level < PEAK_ENTER)) enter("fade");
          break;
        case "fade":
          if (level <= RELAX_ENTER) enter("relax");
          break;
        case "relax":
          if (phaseSec >= relaxMax || (phaseSec >= relaxMin && hadPressure)) enter("buildup");
          break;
      }
    },
    phase: () => current,
    intensity: () => level,
    calm: () => current === "relax" || current === "fade" || (current === "peak" && phaseSec > LONG_PEAK_SEC),
  };
}
