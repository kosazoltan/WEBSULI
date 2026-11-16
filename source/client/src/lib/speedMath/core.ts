/**
 * J4a — „Neon védőtorony”: a Gyors matek sprint játékmagja (végrehajtás J4a, terv 5.4, D1; K.5 KSZ-1, KSZ-2, KSZ-4–6,
 * KSZ-11, KSZ-15).
 *
 * TISZTA TS: nincs DOM, three, React, hang, `Math.random`, `Date.now` (őr: `T/game-sim-determinism-guard.test.ts`). A
 * nézet (vászon + DOM-drónok a `P/SpeedQuizMath.tsx`-ben) csak olvassa az állapotot és a kibocsátott eseményeket; a hang,
 * a rezgés, a rázás és a hitstop az eseményekből dolgozik.
 *
 * KOORDINÁTÁK: normalizált játéktér, x ∈ [0, 1] balról jobbra, y ∈ [0, 1] fentről lefelé; a torony magja `TOWER`. A
 * pixelre váltás és a találati sugár a nézet dolga (`raiderAt` normalizált sugarat kap tengelyenként).
 *
 * IDŐ: a `step(dtMs)` a VILÁG ideje — a lap a fix lépésű hurokkal (`createFixedLoop`) lépteti, a kérdés alatti lassítás a
 * hurok szorzója (KSZ-4); a node-szimuláció ugyanígy a lassított időt adja át.
 *
 * JÁTÉK (terv 5.4):
 *  - Fosztogató drónok hullámokban (`createWaveDirector`, 5 hullám) repülnek a toronyra különböző pályákon (egyenes,
 *    hullámzó, cikcakk, páncélos); megjelenés előtt 450 ms-os „bevillanás” jelzi őket (K.4/21). Koppintás = lézer. Ha egy
 *    eléri a tornyot: pajzs −1; 0 pajzs = vereség. Ez a kérdés nélkül is játszható ügyességi alaphurok.
 *  - A kérdés (a 4 számot viselő drón) a lapon él (`usePlayQuestion`); a kimenetét az `applyOutcome` hozza a világba:
 *    jó válasz = a torony energiahulláma (a közeli fosztogatók megsemmisülnek), kombó ↑ → erősebb lövés (szórás, majd
 *    automata ágyú), kombó-lépcsőnként +1 pajzs; rossz válasz / lejárat = pajzs −1, kombó elvész.
 *  - A kérdés NEM öl (K.4/24): kérdés miatt a pajzs legfeljebb 1-ig fogy; az utolsó pajzsot csak a fosztogató viheti el.
 *  - Az első 30 mp tanító szakasz (K.4/25): ekkor a pajzs nem fogy (a becsapódás „elnyelődik”).
 *  - Győzelem (J4a): az 5. hullám vége (a J4b a Zéró-robot legyőzéséhez köti).
 */
import { createRng, seedFrom, type Rng } from "@shared/game-rng";
import { COMBO_STEPS, comboBreak, comboCorrect, createCombo, type ComboState } from "@/game-engine/play/combo";
import { createWaveDirector, type WaveDirector, type WaveSpec } from "@/game-engine/play/waves";
import type { QuestionResult } from "@/game-engine/play/types";
import type { DirectorConfig } from "@/game-engine/play/questionDirector";
import { RELAX_ENTER, type IntensityDirector } from "@/game-engine/play/director";

export const SPEED_MATH_GAME_ID = "speed-quiz-math";

/**
 * A kérdés alatti lassítás (terv 4.1/3: ≥ 0,35×). A számdrónok a kérdés-órán érkeznek, a fosztogatók a lassított
 * világban: a gyerek gondolkodhat, de a világ nem áll meg.
 */
export const TOWER_SLOW_MO = 0.6;

/**
 * A kérdés-ütemező beállítása (végrehajtás J4a 3.): 10 kérdés/perc cél, 1,5–6 mp rés (terv 6.2 Matek: ≤ 6 mp kérdés
 * nélkül), 4,5 mp alap ablak (3–4. évfolyamon ×1,25 a `windowMsFor`-ban), az első feladat 1,5 mp-nél (terv 5.4).
 */
export function towerDirectorConfig(grade: number): DirectorConfig {
  return {
    gameId: SPEED_MATH_GAME_ID,
    optionCount: 4,
    minGapMs: 1500,
    maxGapMs: 6000,
    targetPerMin: 10,
    baseWindowMs: 4500,
    slowMo: TOWER_SLOW_MO,
    grade,
    warmupMs: 1500,
  };
}

/** A torony magja (a becsapódás célpontja) a normalizált térben. */
export const TOWER = { x: 0.5, y: 0.84 } as const;

/**
 * „Nyugodt-e a helyzet” a kérdés-ütemezőnek (KSZ-15). A mini-Director `calm()`-ja csak a pihenő / lecsengés fázisban
 * igaz, a kezdő „buildup” fázisban alacsony szint mellett sem — csúcs nélkül egy nyugodt menetben sosem lenne igaz, és
 * csak a kényszerített (maxGap) kérdések jönnének (mérve: 7,5 kérdés/perc a 10 helyett). Ezért az alacsony szint is
 * nyugalomnak számít.
 */
export function towerCalm(pace: Pick<IntensityDirector, "calm" | "intensity">): boolean {
  return pace.calm() || pace.intensity() < RELAX_ENTER;
}

export const SHIELD_START = 4;
export const SHIELD_MAX = 5;
/** Az első 30 mp tanító szakasz: a pajzs nem fogy (K.4/25). */
export const TUTORIAL_MS = 30_000;
/** Két hullám közti szünet (világidő). */
export const INTERMISSION_MS = 2_500;
/** Előjelzés: ennyi ideig villan be a fosztogató, mielőtt elindul (K.4/21: ≥ 400 ms). */
export const WARP_MS = 450;
/** A fosztogató-pool kapacitása (KSZ-6). */
export const RAIDER_CAP = 32;
/** A fosztogatók megjelenési magassága (normalizált): a kérdés-kártya alatt. */
export const SPAWN_Y = 0.24;
/** Az első fosztogató ennyi ms után jelenik meg (terv 5.: 0–10 mp azonnali akció). */
export const FIRST_SPAWN_MS = 700;
/** Az eseménysor kapacitása képkockánként (a nézet minden képkockában üríti). */
export const EVENT_CAP = 64;
/** Jó válasz: a torony energiahullámának sugara (normalizált). */
export const SHOCK_RADIUS = 0.75;
/** Szórólövés sugara erő-szintenként (2. szinttől). */
export const SPLASH_PER_LEVEL = 0.045;
/** Automata ágyú (3. erő-szinttől): tüzelési köz ms-ban az erő függvényében. */
export function turretIntervalMs(power: number): number {
  return power >= 3 ? 3400 - 500 * (power - 3) : Number.POSITIVE_INFINITY;
}

export type RaiderKind = "scout" | "weaver" | "zig" | "tank";

export type RaiderSpec = {
  /** A beérésig tartó repülés (ms, a 0,5-ös intenzitáson, 1. hullámban). */
  travelMs: number;
  hp: number;
  /** Oldalkitérés amplitúdója (normalizált) és frekvenciája (1/s). */
  amp: number;
  freq: number;
  /** Pont a lelövésért (× erő-szint). */
  points: number;
  /** A szimulált játékos találati könnyítése (`T/support/game-sim.ts` megállapodás: siker, ha skillRoll < ease). */
  ease: number;
};

export const RAIDERS: Record<RaiderKind, RaiderSpec> = {
  scout: { travelMs: 5600, hp: 1, amp: 0, freq: 0, points: 2, ease: 0.9 },
  weaver: { travelMs: 7000, hp: 1, amp: 0.11, freq: 0.55, points: 3, ease: 0.85 },
  zig: { travelMs: 6400, hp: 1, amp: 0.09, freq: 0.9, points: 3, ease: 0.8 },
  tank: { travelMs: 9400, hp: 2, amp: 0.03, freq: 0.3, points: 5, ease: 1 },
};

/** Az 5 hullám (a J4b a Hibagyárat a 3. után, a Zéró-robotot az 5. után illeszti be). */
export const TOWER_WAVES: readonly WaveSpec[] = [
  { id: "w1", budget: 10, spawnEverySec: 2.6, enemies: [{ kind: "scout", cost: 1, weight: 3 }, { kind: "weaver", cost: 1, weight: 1 }] },
  { id: "w2", budget: 14, spawnEverySec: 2.2, enemies: [{ kind: "scout", cost: 1, weight: 2 }, { kind: "weaver", cost: 1, weight: 2 }] },
  { id: "w3", budget: 18, spawnEverySec: 1.9, enemies: [{ kind: "scout", cost: 1, weight: 2 }, { kind: "weaver", cost: 1, weight: 2 }, { kind: "zig", cost: 1, weight: 2 }] },
  { id: "w4", budget: 23, spawnEverySec: 1.7, enemies: [{ kind: "scout", cost: 1, weight: 2 }, { kind: "zig", cost: 1, weight: 2 }, { kind: "tank", cost: 2, weight: 1 }] },
  { id: "w5", budget: 28, spawnEverySec: 1.5, enemies: [{ kind: "weaver", cost: 1, weight: 2 }, { kind: "zig", cost: 1, weight: 2 }, { kind: "tank", cost: 2, weight: 2 }] },
];

export type Raider = {
  id: number;
  alive: boolean;
  kind: RaiderKind;
  hp: number;
  /** Indulási pont. */
  sx: number;
  sy: number;
  /** Mostani és előző lépésbeli pozíció (a nézet interpolál). */
  x: number;
  y: number;
  px: number;
  py: number;
  /** Életkor ms-ban (az első `WARP_MS` a bevillanás). */
  age: number;
  travelMs: number;
  phase: number;
  /** Utolsó találat óta eltelt ms (villanáshoz); nagy szám = nincs. */
  hitAgo: number;
};

export type TowerEventType =
  | "spawn" // fosztogató bevillan (x, y)
  | "kill" // lelőtték (x, y, kind)
  | "hit" // páncélos sérült, de él
  | "breach" // becsapódott, pajzs −1
  | "blocked" // becsapódott a tanító szakaszban (nincs sebzés)
  | "shock" // jó válasz: energiahullám a toronyból (n = hány fosztogató semmisült meg)
  | "zap" // rossz válasz / lejárat: a torony pajzsa villan (−1 vagy védve)
  | "turret" // automata ágyú lövése (x, y)
  | "shieldUp" // +1 pajzs (kombó-lépcső / hullám vége)
  | "power" // új erő-szint (n)
  | "waveClear" // hullám vége (n = a lezárt hullám sorszáma, 1-től)
  | "waveStart" // új hullám (n = sorszám 1-től)
  | "won"
  | "lost";

export type TowerEvent = { type: TowerEventType; x: number; y: number; n: number; kind: RaiderKind | null };

export type TowerPhase = "play" | "intermission" | "won" | "lost";

export type TowerState = {
  phase: TowerPhase;
  worldMs: number;
  shield: number;
  /** 0-tól; a HUD 1-től mutatja. */
  wave: number;
  waves: number;
  kills: number;
  breaches: number;
  score: number;
  combo: ComboState;
  /** 1..5 = a kombó-szorzó: a lövés ereje. */
  power: number;
  /** A hullám előrehaladása 0..1 (a torony-kijelzőhöz). */
  waveProgress: number;
  raiders: readonly Raider[];
};

export type TowerCore = {
  state(): TowerState;
  step(dtMs: number, intensity: number): void;
  /** Koppintás egy fosztogatóra (id a `raiderAt`-ból). Igaz, ha talált. */
  shoot(id: number): boolean;
  /** A (nx, ny) ponthoz legközelebbi élő fosztogató a (rx, ry) ellipszisen belül, különben −1. */
  raiderAt(nx: number, ny: number, rx: number, ry: number): number;
  /** A kérdés kimenete a világban (≤ 2 s következmény, K.4/23). `speed` 0..1: a megmaradt ablak aránya (gyorsasági bónusz). */
  applyOutcome(result: QuestionResult, speed: number): void;
  /** A lépések óta kibocsátott események (a nézet képkockánként üríti: hang, rezgés, részecske, rázás, hitstop). */
  drainEvents(visit: (e: TowerEvent) => void): void;
  /** Él-e még a menet (play / intermission). */
  running(): boolean;
  /** Az a fosztogató, amelyik a legközelebb jár a beéréshez (az automata ágyú és a bot célpontja), különben −1. */
  mostAdvanced(): number;
  /** A beérés aránya 0..1 egy élő fosztogatónál. */
  progressOf(id: number): number;
};

/** A torony felé tartó egységvektorra merőleges eltolás (a hullámzó / cikcakk pályához). */
function lateral(kind: RaiderKind, t: number, phase: number): number {
  const spec = RAIDERS[kind];
  if (spec.amp === 0) return 0;
  const w = t * spec.freq * 2 * Math.PI + phase;
  if (kind === "zig") {
    // háromszögjel: éles fordulók
    const u = (w / (2 * Math.PI)) % 1;
    return spec.amp * (u < 0.5 ? 4 * u - 1 : 3 - 4 * u);
  }
  return spec.amp * Math.sin(w);
}

/** A hullámonkénti tempó: későbbi hullámban gyorsabb fosztogatók (+7% / hullám). */
export function travelFactor(wave: number, intensity: number): number {
  const i = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0.5;
  // intensity 0 → 1,12× hosszabb út, 1 → 0,88× (±12%, KSZ-16 szellemében kicsi és nyílt)
  return (1.12 - 0.24 * i) / (1 + 0.07 * wave);
}

export function createTowerCore(opts: { seed: number | string }): TowerCore {
  const rng: Rng = createRng(seedFrom(SPEED_MATH_GAME_ID, opts.seed, "world"));
  const waves: WaveDirector = createWaveDirector(TOWER_WAVES, createRng(seedFrom(SPEED_MATH_GAME_ID, opts.seed, "waves")));
  const raiders: Raider[] = [];
  for (let i = 0; i < RAIDER_CAP; i++) {
    raiders.push({ id: i, alive: false, kind: "scout", hp: 0, sx: 0, sy: 0, x: 0, y: 0, px: 0, py: 0, age: 0, travelMs: 1, phase: 0, hitAgo: 1e9 });
  }
  const events: TowerEvent[] = [];
  for (let i = 0; i < EVENT_CAP; i++) events.push({ type: "spawn", x: 0, y: 0, n: 0, kind: null });
  let eventCount = 0;

  const st: TowerState = {
    phase: "play",
    worldMs: 0,
    shield: SHIELD_START,
    wave: 0,
    waves: TOWER_WAVES.length,
    kills: 0,
    breaches: 0,
    score: 0,
    combo: createCombo(),
    power: 1,
    waveProgress: 0,
    raiders,
  };
  let interMs = 0;
  let turretMs = 0;
  let spawnedInWave = 0;
  // Az első hullám spawn-órája előre tekerve: az első fosztogató ~FIRST_SPAWN_MS után jön (a 0,5-ös intenzitás tempóján).
  waves.tick(Math.max(0, TOWER_WAVES[0]!.spawnEverySec - FIRST_SPAWN_MS / 1000), 0.5);

  function emit(type: TowerEventType, x: number, y: number, n = 0, kind: RaiderKind | null = null): void {
    if (eventCount >= EVENT_CAP) return; // a nézet minden képkockában üríti; túlcsordulásnál a kozmetika vész el, nem a játék
    const e = events[eventCount]!;
    e.type = type;
    e.x = x;
    e.y = y;
    e.n = n;
    e.kind = kind;
    eventCount += 1;
  }

  function spawn(kind: RaiderKind, intensity: number): void {
    let r: Raider | null = null;
    for (let i = 0; i < raiders.length && !r; i++) if (!raiders[i]!.alive) r = raiders[i]!;
    if (!r) {
      // Teli pool: a hullám ne akadjon el (a forgatókönyv elszámolja).
      waves.onCleared(1);
      return;
    }
    const spec = RAIDERS[kind];
    r.alive = true;
    r.kind = kind;
    r.hp = spec.hp;
    // A kérdés-kártya (álló nézetben a játéktér felső ~22%-a) alatt jelennek meg, hogy a bevillanás látsszon; a két
    // szélső 8% nélkül. A hullámzók néha oldalról (y 0,3–0,55) jönnek.
    const side = kind === "weaver" && rng.next() < 0.4;
    if (side) {
      r.sx = rng.next() < 0.5 ? 0.05 : 0.95;
      r.sy = SPAWN_Y + 0.06 + rng.next() * 0.25;
    } else {
      r.sx = 0.08 + rng.next() * 0.84;
      r.sy = SPAWN_Y;
    }
    r.x = r.px = r.sx;
    r.y = r.py = r.sy;
    r.age = 0;
    r.travelMs = spec.travelMs * travelFactor(st.wave, intensity);
    r.phase = rng.next() * Math.PI * 2;
    r.hitAgo = 1e9;
    spawnedInWave += 1;
    emit("spawn", r.x, r.y, 0, kind);
  }

  function remove(r: Raider): void {
    r.alive = false;
    waves.onCleared(1);
  }

  function damage(r: Raider, amount: number, byPlayer: boolean): void {
    if (!r.alive) return;
    r.hp -= amount;
    r.hitAgo = 0;
    if (r.hp > 0) {
      emit("hit", r.x, r.y, 0, r.kind);
      return;
    }
    st.kills += 1;
    st.score += RAIDERS[r.kind].points * (byPlayer ? st.power : 1);
    emit("kill", r.x, r.y, 0, r.kind);
    remove(r);
  }

  function progress(r: Raider): number {
    return r.age <= WARP_MS ? 0 : Math.min(1, (r.age - WARP_MS) / r.travelMs);
  }

  function mostAdvanced(): number {
    let best = -1;
    let bestP = -1;
    for (const r of raiders) {
      if (!r.alive || r.age < WARP_MS) continue;
      const p = progress(r);
      if (p > bestP) {
        bestP = p;
        best = r.id;
      }
    }
    return best;
  }

  function setShield(next: number): void {
    st.shield = Math.max(0, Math.min(SHIELD_MAX, next));
  }

  function shieldUp(): void {
    if (st.shield >= SHIELD_MAX) return;
    setShield(st.shield + 1);
    emit("shieldUp", TOWER.x, TOWER.y, st.shield);
  }

  function lose(): void {
    st.phase = "lost";
    emit("lost", TOWER.x, TOWER.y);
  }

  function updateRaider(r: Raider, dtMs: number): void {
    r.px = r.x;
    r.py = r.y;
    r.age += dtMs;
    r.hitAgo += dtMs;
    if (r.age <= WARP_MS) return;
    const p = progress(r);
    const dx = TOWER.x - r.sx;
    const dy = TOWER.y - r.sy;
    const len = Math.hypot(dx, dy) || 1;
    // Merőleges egységvektor; a kitérés a torony közelében elhal (a célra fut be).
    const off = lateral(r.kind, (r.age - WARP_MS) / 1000, r.phase) * (1 - p);
    r.x = Math.min(0.98, Math.max(0.02, r.sx + dx * p + (-dy / len) * off));
    r.y = r.sy + dy * p + (dx / len) * off;
    if (p >= 1) {
      remove(r);
      if (st.worldMs < TUTORIAL_MS) {
        emit("blocked", TOWER.x, TOWER.y, st.shield, r.kind);
        return;
      }
      st.breaches += 1;
      setShield(st.shield - 1);
      emit("breach", TOWER.x, TOWER.y, st.shield, r.kind);
      if (st.shield <= 0) lose();
    }
  }

  const api: TowerCore = {
    state: () => st,
    running: () => st.phase === "play" || st.phase === "intermission",
    step(dtMs, intensity) {
      if (!api.running() || !(dtMs > 0)) return;
      st.worldMs += dtMs;
      if (st.phase === "intermission") {
        interMs -= dtMs;
        if (interMs <= 0) {
          waves.next();
          st.wave = waves.index();
          spawnedInWave = 0;
          st.phase = "play";
          emit("waveStart", 0.5, 0.3, st.wave + 1);
        }
      } else {
        const born = waves.tick(dtMs / 1000, intensity);
        for (let i = 0; i < born.length; i++) spawn(born[i] as RaiderKind, intensity);
      }
      for (const r of raiders) {
        if (r.alive) updateRaider(r, dtMs);
        if (st.phase === "lost") return;
      }
      // Automata ágyú (3. erő-szinttől).
      const every = turretIntervalMs(st.power);
      if (Number.isFinite(every)) {
        turretMs += dtMs;
        if (turretMs >= every) {
          const id = mostAdvanced();
          if (id >= 0) {
            turretMs = 0;
            const r = raiders[id]!;
            emit("turret", r.x, r.y, 0, r.kind);
            damage(r, 1, false);
          }
        }
      } else {
        turretMs = 0;
      }
      const budget = TOWER_WAVES[st.wave]!.budget;
      st.waveProgress = Math.min(1, spawnedInWave / Math.max(1, budget));
      if (st.phase === "play" && waves.waveDone()) {
        st.waveProgress = 1;
        st.score += 20 * (st.wave + 1);
        emit("waveClear", 0.5, 0.3, st.wave + 1);
        if (st.wave >= TOWER_WAVES.length - 1) {
          st.phase = "won";
          emit("won", TOWER.x, TOWER.y);
          return;
        }
        shieldUp();
        st.phase = "intermission";
        interMs = INTERMISSION_MS;
      }
    },
    shoot(id) {
      if (!api.running()) return false;
      const r = raiders[id];
      if (!r || !r.alive) return false;
      const x = r.x;
      const y = r.y;
      damage(r, 1, true);
      if (st.power >= 2) {
        const rad = SPLASH_PER_LEVEL * (st.power - 1);
        for (const o of raiders) {
          if (!o.alive || o.id === id) continue;
          if (Math.hypot(o.x - x, o.y - y) <= rad) damage(o, 1, true);
        }
      }
      return true;
    },
    raiderAt(nx, ny, rx, ry) {
      let best = -1;
      let bestD = Number.POSITIVE_INFINITY;
      for (const r of raiders) {
        if (!r.alive) continue;
        const ex = (r.x - nx) / rx;
        const ey = (r.y - ny) / ry;
        const d = ex * ex + ey * ey;
        if (d <= 1 && d < bestD) {
          bestD = d;
          best = r.id;
        }
      }
      return best;
    },
    applyOutcome(result, speed) {
      if (!api.running() || result === "aborted") return;
      if (result === "correct") {
        const before = st.power;
        st.combo = comboCorrect(st.combo);
        st.power = st.combo.multiplier;
        if (st.power > before) emit("power", TOWER.x, TOWER.y, st.power);
        if (COMBO_STEPS.includes(st.combo.count) && st.combo.count > 0) shieldUp();
        const s = Number.isFinite(speed) ? Math.min(1, Math.max(0, speed)) : 0;
        // terv 6.2 „bónuszplafon”: a gyorsasági bónusz legfeljebb 2,5 / 10 = 25%.
        st.score += Math.round(10 * st.power + 2.5 * st.power * s);
        let n = 0;
        for (const r of raiders) {
          if (!r.alive) continue;
          if (Math.hypot(r.x - TOWER.x, r.y - TOWER.y) <= SHOCK_RADIUS) {
            n += 1;
            damage(r, r.hp, false);
          }
        }
        emit("shock", TOWER.x, TOWER.y, n);
        return;
      }
      // Rossz válasz / lejárat: erőforrást vesz el, életet nem (K.4/24) — a pajzs kérdés miatt 1 alá nem megy.
      st.combo = comboBreak(st.combo);
      st.power = 1;
      if (st.worldMs >= TUTORIAL_MS && st.shield > 1) setShield(st.shield - 1);
      emit("zap", TOWER.x, TOWER.y, st.shield);
    },
    drainEvents(visit) {
      for (let i = 0; i < eventCount; i++) visit(events[i]!);
      eventCount = 0;
    },
    mostAdvanced,
    progressOf(id) {
      const r = raiders[id];
      return r && r.alive ? progress(r) : 0;
    },
  };
  return api;
}

/**
 * A négy számdrón helye a nyitott kérdésnél (normalizált, a játéktérben). Seedelt (a kérdés-azonosító szerint), így
 * ugyanaz a kérdés ugyanott jelenik meg; álló nézetben lépcsőzetes sor a torony fölött, fekvőben a két szélen (a
 * kérdés-kártya középen fent van). Az `out` tömböt tölti (nincs allokáció a képkocka-hurokban).
 */
export function droneLayout(seed: number | string, presentationId: number, count: number, wide: boolean, out: { x: number; y: number }[]): void {
  const rng = createRng(seedFrom(SPEED_MATH_GAME_ID, seed, "drones", presentationId));
  const n = Math.max(1, count);
  for (let i = 0; i < n; i++) {
    const p = out[i] ?? (out[i] = { x: 0, y: 0 });
    // Kis, seedelt szórás: minden kérdésnél kicsit máshol, de két drón sosem fedi egymást (76 × 60 px, 360 px-en is).
    const jx = (rng.next() - 0.5) * 0.016;
    const jy = (rng.next() - 0.5) * 0.024;
    if (wide) {
      // bal oldalt az első fele, jobb oldalt a többi; két magasságban
      const left = i < Math.ceil(n / 2);
      const k = left ? i : i - Math.ceil(n / 2);
      p.x = (left ? 0.08 + k * 0.12 : 0.8 + k * 0.12) + jx;
      p.y = 0.42 + (k % 2) * 0.22 + jy;
    } else {
      // cikcakk-sor: a szomszédok függőlegesen is eltolva, hogy hosszú szám mellett se érjenek össze
      p.x = (n === 1 ? 0.5 : 0.15 + (0.7 * i) / (n - 1)) + jx;
      p.y = 0.38 + (i % 2) * 0.14 + jy;
    }
  }
}

/** Az energiahullám és a becsapódás „bevillanó” megjelenése 0..1 a belépő animációhoz (a nézet használja). */
export const DRONE_ENTER_MS = 520;
