/**
 * Fix lépésű szimulációs hurok akkumulátorral (terv 2026-11-16-jatekok-jatekelmeny 4.3, 6.1; végrehajtás J0a, K.4/9, KSZ-4).
 *
 * A rAF a valós időt adja (`frame(nowMs)`), a szimuláció mindig `SIM_STEP_MS` (1/60 s) lépésekben halad. Így a sim
 * végállapota a lépések sorozatától függ, nem a képkocka-időktől: azonos seed + bemenetsor → azonos végállapot 30, 60 vagy
 * 120 Hz-es kijelzőn is. Képkockánként legfeljebb `maxSteps` (alap 5) lépés fut; a nagyobb lemaradást a hurok eldobja
 * („spiral of death” elleni védelem) — ilyenkor a sim lassabban halad a valós időnél, de determinisztikus marad.
 *
 * A kérdés alatti lassítás a `setTimeScale` szorzója (KSZ-4: nem a `dt` torzítása): a lépés hossza változatlan, csak
 * ritkábban jön. A hurok nem olvas órát (nincs `performance.now` / `Date.now`): az időt a hívó adja.
 */

/** Egy szimulációs lépés hossza ezredmásodpercben (1/60 s). */
export const SIM_STEP_MS = 1000 / 60;

/** A lassítás alsó korlátja (terv 4.1/3: a játék a kérdés alatt ≥ 0,35× sebességgel fut; 0 csak szünet). */
export const MIN_SLOW_MO = 0.35;

/** Lebegőpontos tűrés: 60 Hz-es képkockáknál a 16,666… ms-os összeg kerekítése ne vesszen el egy lépés. */
const EPS = 1e-6;

export type FixedLoop = {
  /** A rAF valós `nowMs`-ével hívandó; legfeljebb 5 lépést futtat; visszaadja az interpolációs alphát (0..1). */
  frame(nowMs: number): number;
  /**
   * 0 = szünet; 0.35..1 = kérdés alatti lassítás; 1 = normál. A (0; 0,35) közötti érték 0,35-re, az 1 feletti 1-re
   * kerül, a negatív 0-ra; NaN RangeError.
   */
  setTimeScale(scale: number): void;
  /** A játék által beállított szorzó (a `setHold` nem változtatja meg). */
  timeScale(): number;
  /** A lefutott lépések ideje ms-ban (lépésszám × `SIM_STEP_MS`); a `probe().simTime` forrása. */
  simTimeMs(): number;
  /** Új menet: lépésszám, akkumulátor, időalap törlése; szorzó 1, tartás ki. */
  reset(): void;
  /**
   * Átmeneti megállítás a beállított szorzó felülírása nélkül (a `feel.hitstop` használja). Amíg be van kapcsolva, nem
   * fut lépés; kikapcsolás után a `timeScale()` szerinti tempó folytatódik (szünet alatt a szünet marad).
   */
  setHold(on: boolean): void;
};

export function createFixedLoop(
  step: (dtMs: number) => void,
  opts: { maxSteps?: number; maxFrameMs?: number } = {},
): FixedLoop {
  const maxSteps = opts.maxSteps ?? 5;
  const maxFrameMs = opts.maxFrameMs ?? 250;
  if (!Number.isInteger(maxSteps) || maxSteps < 1) {
    throw new RangeError(`loop: a maxSteps pozitív egész legyen (kapott: ${maxSteps})`);
  }
  if (!Number.isFinite(maxFrameMs) || maxFrameMs <= 0) {
    throw new RangeError(`loop: a maxFrameMs pozitív szám legyen (kapott: ${maxFrameMs})`);
  }

  let last: number | null = null;
  let acc = 0;
  let scale = 1;
  let held = false;
  let steps = 0;

  const alpha = (): number => {
    const a = acc / SIM_STEP_MS;
    return a < 0 ? 0 : a > 1 ? 1 : a;
  };

  return {
    frame(nowMs: number): number {
      if (!Number.isFinite(nowMs)) return alpha();
      if (last === null) {
        last = nowMs;
        return alpha();
      }
      let real = nowMs - last;
      last = nowMs;
      if (real < 0) real = 0;
      if (real > maxFrameMs) real = maxFrameMs;

      if (held) return alpha();
      acc += real * scale;
      let ran = 0;
      while (acc + EPS >= SIM_STEP_MS && ran < maxSteps) {
        acc -= SIM_STEP_MS;
        if (acc < 0) acc = 0;
        steps++;
        ran++;
        step(SIM_STEP_MS);
      }
      // A plafon feletti lemaradás eldobva; a törtrész marad, hogy az interpoláció folytonos legyen.
      if (acc >= SIM_STEP_MS) acc %= SIM_STEP_MS;
      return alpha();
    },
    setTimeScale(next: number): void {
      if (Number.isNaN(next)) throw new RangeError("loop: a setTimeScale() NaN-t kapott");
      if (next <= 0) scale = 0;
      else if (next < MIN_SLOW_MO) scale = MIN_SLOW_MO;
      else if (next > 1) scale = 1;
      else scale = next;
    },
    timeScale: () => scale,
    simTimeMs: () => steps * SIM_STEP_MS,
    reset(): void {
      last = null;
      acc = 0;
      scale = 1;
      held = false;
      steps = 0;
    },
    setHold(on: boolean): void {
      held = on;
    },
  };
}
