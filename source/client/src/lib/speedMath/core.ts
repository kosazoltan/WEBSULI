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
import type { PlayQuestion, QuestionOutcome, QuestionPresentation, QuestionResult } from "@/game-engine/play/types";
import { bankPlayQuestion, type DirectorConfig } from "@/game-engine/play/questionDirector";
import { fitsAllViewports } from "@/game-engine/play/promptFit";
import { createIntensityDirector, type IntensityDirector } from "@/game-engine/play/director";
import { createFixedLoop, type FixedLoop } from "@/game-engine/play/loop";
import { createFeel, type Feel } from "@/game-engine/play/feel";

export const SPEED_MATH_GAME_ID = "speed-quiz-math";

/**
 * A feladat azonosítója az ismétlési sorban: az évfolyam is benne van (review #451), így egy 12. évfolyamon elrontott
 * feladat nem tér vissza egy 3. osztályos menetben. A kulcs: `bank:speed-quiz-math:<évfolyam>:<prompt>`.
 */
export function speedMathQuizId(grade: number, prompt: string): string {
  return `g${grade}:${prompt}`;
}

/** Csak a saját játék tétele állítható vissza ismétlésként (a sor a hét játékban közös; az évfolyamot a közös `reviewFitsGrade` szűri). */
export function isOwnReviewKey(key: string): boolean {
  return key.startsWith(`bank:${SPEED_MATH_GAME_ID}:`);
}

/**
 * A kérdés alatti lassítás (terv 4.1/3: ≥ 0,35×). A számdrónok a kérdés-órán érkeznek, a fosztogatók a lassított
 * világban: a gyerek gondolkodhat, de a világ nem áll meg.
 */
export const TOWER_SLOW_MO = 0.5;

/**
 * A kérdés-ütemező beállítása (végrehajtás J4a 3.): 10 kérdés/perc cél, 1,5–6 mp rés (terv 6.2 Matek: ≤ 6 mp kérdés
 * nélkül), 4,5 mp alap ablak (3–4. évfolyamon ×1,25 a `windowMsFor`-ban), az első feladat 1,5 mp-nél (terv 5.4).
 */
export function towerDirectorConfig(grade: number): DirectorConfig {
  const baseWindowMs = 4500;
  return {
    gameId: SPEED_MATH_GAME_ID,
    optionCount: 4,
    minGapMs: 1500,
    maxGapMs: 6000,
    targetPerMin: 10,
    baseWindowMs,
    slowMo: TOWER_SLOW_MO,
    grade,
    warmupMs: 1500,
    // J0c-b (#450): az ablak a gyerek becsült olvasási idejéhez igazodik (≤ 9 mp), és a forrás előbb a mindhárom nézetben
    // beférő és 9 mp alatt elolvasható feladatot adja (`accept`).
    readingAware: true,
    promptFits: (quiz) => fitsAllViewports(quiz, { grade, baseWindowMs }).ok,
  };
}

/** A torony magja (a becsapódás célpontja) a normalizált térben. */
export const TOWER = { x: 0.5, y: 0.84 } as const;


/** Ennél közelebb járó fosztogató „közeli veszély” a mini-Directornak. */
export const NEAR_THREAT = 0.7;

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
/** Automata ágyú (2. erő-szinttől, azaz 3 egymás utáni jó választól): tüzelési köz ms-ban az erő függvényében. */
export function turretIntervalMs(power: number): number {
  return power >= 2 ? 3000 - 450 * (power - 2) : Number.POSITIVE_INFINITY;
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
  { id: "w1", budget: 8, spawnEverySec: 2.4, enemies: [{ kind: "scout", cost: 1, weight: 3 }, { kind: "weaver", cost: 1, weight: 1 }] },
  { id: "w2", budget: 11, spawnEverySec: 2.0, enemies: [{ kind: "scout", cost: 1, weight: 2 }, { kind: "weaver", cost: 1, weight: 2 }] },
  { id: "w3", budget: 14, spawnEverySec: 1.7, enemies: [{ kind: "scout", cost: 1, weight: 2 }, { kind: "weaver", cost: 1, weight: 2 }, { kind: "zig", cost: 1, weight: 2 }] },
  { id: "w4", budget: 18, spawnEverySec: 1.5, enemies: [{ kind: "scout", cost: 1, weight: 2 }, { kind: "zig", cost: 1, weight: 2 }, { kind: "tank", cost: 2, weight: 1 }] },
  { id: "w5", budget: 22, spawnEverySec: 1.35, enemies: [{ kind: "weaver", cost: 1, weight: 2 }, { kind: "zig", cost: 1, weight: 2 }, { kind: "tank", cost: 2, weight: 2 }] },
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
  | "wrongAnswer" // rossz válasz / lejárat (a mini-Director jelzése; a zap mellett)
  | "turret" // automata ágyú lövése (x, y)
  | "shieldUp" // +1 pajzs (kombó-lépcső / hullám vége)
  | "power" // új erő-szint (n)
  | "waveClear" // hullám vége (n = a lezárt hullám sorszáma, 1-től)
  | "waveStart" // új hullám (n = sorszám 1-től)
  | "bossSpawn" // főellenfél / miniboss érkezik (n: 1 = Hibagyár, 2 = Zéró-robot)
  | "bossCharge" // a Zéró-robot támadást tölt (n = előjelzés ms, ≥ 600 — K.4/21)
  | "bossFire" // a támadás eltalálta a pajzsot (n = maradék pajzs)
  | "bossStun" // a töltés közben megérintett mag: a támadás elmaradt
  | "bossHit" // jó válasz: páncélszegmens / fogaskerék tört (n = maradék)
  | "bossShrug" // rossz válasz / lejárat a főellenfélnél: a gyenge pont bezárult (nincs sebzés)
  | "bossStage" // a Zéró-robot 2. fázisa
  | "bossDefeat" // legyőzve (n: 1 = Hibagyár, 2 = Zéró-robot)
  | "bomb" // Becslő-bomba: jó becslés → minden fosztogató eltűnik (n = hány)
  | "bombFizzle" // rossz becslés: a bomba nem robban (nincs büntetés)
  | "won"
  | "lost";

export type TowerEvent = { type: TowerEventType; x: number; y: number; n: number; kind: RaiderKind | null };

export type TowerPhase = "play" | "intermission" | "boss" | "won" | "lost";

/** J4b — a Hibagyár (miniboss a 3. hullám után) és a Zéró-robot (főellenfél az 5. hullám után). */
export type BossKind = "factory" | "zero";
export type Boss = {
  kind: BossKind;
  hp: number;
  maxHp: number;
  /** A Zéró-robot fázisa (a páncél felénél 2.: gyorsabb mozgás és támadás, kísérő fosztogatók). */
  stage: 1 | 2;
  x: number;
  y: number;
  px: number;
  py: number;
  /** Életkor ms (a belépő ereszkedés és a ringás órája). */
  t: number;
  attack: "idle" | "charge" | "stunned";
  attackMs: number;
  hitAgo: number;
  spawnMs: number;
  /** A magra mért találatok (az ügyességi út): `*_CHIP_PER_HP` után egy szegmens törik. */
  chip: number;
  /** Az utolsó főellenfél-kérdés vége óta eltelt ms (a ritmus: kérdés → ellencsapás / kábulat → kérdés). */
  sinceAnswer: number;
  defeated: boolean;
};

/** A kérdés fajtája a magban (a forrás és a kimenet-leképezés ugyanezt használja a lapon és a sim-ben). */
export type TowerQuestionKind = "normal" | "boss" | "bomb";

export const FACTORY_HP = 2;
export const ZERO_HP = 6;
/** A Zéró-robot 2. fázisa ennyi maradék páncélnál kezdődik. */
export const ZERO_STAGE2_HP = 3;
/** A belépő ereszkedés; alatta nincs főellenfél-kérdés (a harc kezdete is látszik). */
export const BOSS_ENTER_MS = 1600;
/** A Zéró-robot támadásának előjelzése (K.4/21: főellenfélnél ≥ 600 ms) fázisonként, és a támadások köze. */
export const BOSS_TELEGRAPH_MS: readonly [number, number] = [950, 750];
export const BOSS_ATTACK_EVERY_MS: readonly [number, number] = [5600, 4300];
/** A töltés közben megérintett mag (vagy egy találat) után ennyi ideig nem támad. */
export const BOSS_STUN_MS = 1600;
/** Két főellenfél-kérdés között ennyi idő (ms): ebben a szünetben jön a jó válasz utáni kábulat vagy a rossz utáni ellencsapás. */
export const BOSS_QUESTION_GAP_MS = 3200;
/** Rossz válasz / lejárat után ennyi ms múlva kezd tölteni a Zéró-robot (az előjelzés után ér célba; a mag megérintése kivédi). */
export const BOSS_COUNTER_DELAY_MS = 900;
/** Ügyességi út: ennyi mag-találat tör egy szegmenst (a jó válasz egymaga egyet). */
export const ZERO_CHIP_PER_HP = 2;
export const FACTORY_CHIP_PER_HP = 5;
/** A Hibagyár ennyi időnként gyárt egy fosztogatót; a Zéró-robot 2. fázisa kísérőket hív. */
export const FACTORY_SPAWN_MS = 2400;
export const ZERO_MINION_MS = 3600;
/** A főellenfél helye (a kérdés-kártya alatt). */
export const BOSS_Y = 0.36;
/** Becslő-bomba: 20 mp-enként (világidő), a tanító szakasz után. */
export const BOMB_EVERY_MS = 20_000;
/** A Hibagyár ennyiedik (0-tól számolt) hullám UTÁN jön: a 3. után. */
export const FACTORY_AFTER_WAVE = 2;

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
  /** A főellenfél / miniboss, ha éppen harc van. */
  boss: Boss | null;
  bossesDefeated: number;
};

export type TowerCore = {
  state(): TowerState;
  step(dtMs: number, intensity: number, ctx?: { questionOpen?: boolean }): void;
  /** Koppintás egy fosztogatóra (id a `raiderAt`-ból). Igaz, ha talált. */
  shoot(id: number): boolean;
  /** A (nx, ny) ponthoz legközelebbi élő fosztogató a (rx, ry) ellipszisen belül, különben −1. */
  raiderAt(nx: number, ny: number, rx: number, ry: number): number;
  /** A kérdés kimenete a világban (≤ 2 s következmény, K.4/23). `speed` 0..1: a megmaradt ablak aránya (gyorsasági bónusz). */
  applyOutcome(result: QuestionResult, speed: number, kind?: TowerQuestionKind): void;
  /** Harc közben kér-e főellenfél-kérdést (a belépő után, nincs legyőzve). */
  bossWantsQuestion(): boolean;
  /** Esedékes-e Becslő-bomba (rendes hullám alatt); `takeBomb()` jelzi, hogy a kérdés elindult. */
  bombDue(): boolean;
  takeBomb(): void;
  /** A forrás ezt olvassa: milyen kérdést kér most a játék (a meghajtó állítja a kérés előtt). */
  nextKind(): TowerQuestionKind;
  setNextKind(kind: TowerQuestionKind): void;
  /** A főellenfél magja a (nx, ny) pont (rx, ry) ellipszisén belül van-e. */
  bossCoreAt(nx: number, ny: number, rx: number, ry: number): boolean;
  /**
   * Koppintás a főellenfél magjára. Zéró-robot: csak töltés közben hat (megszakítja a támadást); Hibagyár: mindig.
   * A találatok repesztik a páncélt (ügyességi út). Igaz, ha hatott.
   */
  hitBossCore(): boolean;
  /** Teszt-kampó / képernyőkép: azonnal a főellenfél-harc (a fosztogatók eltűnnek). A játékmenet nem hívja. */
  forceBoss(kind: BossKind): void;
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
    boss: null,
    bossesDefeated: 0,
  };
  let nextKindVal: TowerQuestionKind = "normal";
  let bombMs = 0;
  let bombReady = false;
  let questionOpen = false;
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

  function spawnBoss(kind: BossKind): void {
    const hp = kind === "zero" ? ZERO_HP : FACTORY_HP;
    st.boss = { kind, hp, maxHp: hp, stage: 1, x: 0.5, y: -0.15, px: 0.5, py: -0.15, t: 0, attack: "idle", attackMs: 0, hitAgo: 1e9, spawnMs: 0, chip: 0, sinceAnswer: BOSS_QUESTION_GAP_MS, defeated: false };
    st.phase = "boss";
    bombReady = false;
    emit("bossSpawn", 0.5, BOSS_Y, kind === "zero" ? 2 : 1);
  }

  /** A főellenfél pályája: belépő ereszkedés, utána ringás (a Zéró-robot 2. fázisa gyorsabb; a Hibagyár áll). */
  function bossPos(b: Boss): void {
    const enter = Math.min(1, b.t / BOSS_ENTER_MS);
    const ease = 1 - (1 - enter) * (1 - enter);
    if (b.kind === "factory") {
      b.x = 0.5;
      b.y = -0.15 + (BOSS_Y - 0.04 + 0.15) * ease;
      return;
    }
    const w = b.stage === 2 ? 0.0011 : 0.0007;
    const sway = enter < 1 ? 0 : Math.sin((b.t - BOSS_ENTER_MS) * w);
    b.x = 0.5 + 0.2 * sway;
    b.y = -0.15 + (BOSS_Y + 0.15) * ease + 0.025 * Math.sin(b.t * 0.0019);
  }

  function updateBoss(dtMs: number, intensity: number): void {
    const b = st.boss;
    if (!b) return;
    b.px = b.x;
    b.py = b.y;
    b.t += dtMs;
    b.hitAgo += dtMs;
    bossPos(b);
    if (b.t < BOSS_ENTER_MS || b.defeated) return;
    // Kísérők: a Hibagyár folyamatosan gyárt, a Zéró-robot a 2. fázisban hív.
    const every = b.kind === "factory" ? FACTORY_SPAWN_MS : b.stage === 2 ? ZERO_MINION_MS : 0;
    if (every > 0) {
      b.spawnMs += dtMs;
      if (b.spawnMs >= every) {
        b.spawnMs = 0;
        spawn(b.kind === "factory" && rng.next() < 0.5 ? "weaver" : "scout", intensity);
      }
    }
    // Támadás / ritmus-óra csak akkor, ha nincs nyitott kérdés (tisztességes: a gyereket nem éri támadás a válasz közben).
    if (questionOpen) return;
    b.sinceAnswer += dtMs;
    if (b.kind !== "zero") return;
    const s = b.stage - 1;
    b.attackMs += dtMs;
    if (b.attack === "stunned") {
      if (b.attackMs >= BOSS_STUN_MS) {
        b.attack = "idle";
        b.attackMs = 0;
      }
    } else if (b.attack === "idle") {
      if (b.attackMs >= BOSS_ATTACK_EVERY_MS[s]!) {
        b.attack = "charge";
        b.attackMs = 0;
        emit("bossCharge", b.x, b.y, BOSS_TELEGRAPH_MS[s]!);
      }
    } else if (b.attackMs >= BOSS_TELEGRAPH_MS[s]!) {
      b.attack = "idle";
      b.attackMs = 0;
      // A főellenfél lövése az utolsó pajzsot nem viszi el (a harc a feladatokról szól — „a kérdés itt se öljön”); a
      // vereség a kísérő fosztogatóktól jöhet.
      st.breaches += 1;
      setShield(Math.max(1, st.shield - 1));
      emit("bossFire", b.x, b.y, st.shield);
    }
  }

  function bossHit(byAnswer = true): void {
    const b = st.boss;
    if (!b || b.defeated) return;
    b.hp -= 1;
    b.hitAgo = 0;
    // A találat megzavarja: a töltött támadás elmarad, a következő később jön.
    b.attack = "stunned";
    b.attackMs = 0;
    st.score += byAnswer ? (b.kind === "zero" ? 50 : 30) * st.power : 10;
    emit("bossHit", b.x, b.y, b.hp);
    if (b.kind === "zero" && b.stage === 1 && b.hp <= ZERO_STAGE2_HP && b.hp > 0) {
      b.stage = 2;
      emit("bossStage", b.x, b.y, 2);
    }
    if (b.hp > 0) return;
    b.defeated = true;
    st.bossesDefeated += 1;
    for (const r of raiders) if (r.alive) damage(r, r.hp, false);
    st.boss = null;
    if (b.kind === "zero") {
      st.score += 300;
      emit("bossDefeat", b.x, b.y, 2);
      st.phase = "won";
      emit("won", TOWER.x, TOWER.y);
      return;
    }
    st.score += 100;
    emit("bossDefeat", b.x, b.y, 1);
    shieldUp();
    st.phase = "intermission";
    interMs = INTERMISSION_MS;
  }

  const api: TowerCore = {
    state: () => st,
    running: () => st.phase === "play" || st.phase === "intermission" || st.phase === "boss",
    step(dtMs, intensity, ctx) {
      if (!api.running() || !(dtMs > 0)) return;
      st.worldMs += dtMs;
      questionOpen = !!ctx?.questionOpen;
      if (st.phase === "boss") {
        updateBoss(dtMs, intensity);
        if (!api.running()) return;
      } else if (st.phase === "intermission") {
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
        // Becslő-bomba (J4b): rendes hullám alatt 20 mp-enként, a tanító szakasz után.
        if (st.worldMs >= TUTORIAL_MS && !bombReady) {
          bombMs += dtMs;
          if (bombMs >= BOMB_EVERY_MS) {
            bombMs = 0;
            bombReady = true;
          }
        }
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
      st.waveProgress = st.phase === "boss" ? 1 : Math.min(1, spawnedInWave / Math.max(1, budget));
      if (st.phase === "play" && waves.waveDone()) {
        st.waveProgress = 1;
        st.score += 20 * (st.wave + 1);
        emit("waveClear", 0.5, 0.3, st.wave + 1);
        bombReady = false;
        // J4b: a 3. hullám után a Hibagyár, az 5. után a Zéró-robot (a győzelem a legyőzése).
        if (st.wave >= TOWER_WAVES.length - 1) {
          spawnBoss("zero");
          return;
        }
        if (st.wave === FACTORY_AFTER_WAVE) {
          spawnBoss("factory");
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
    applyOutcome(result, speed, kind = "normal") {
      if (!api.running() || result === "aborted") return;
      if (kind === "bomb") {
        // Becslő-bomba: bónusz — a jó becslés minden fosztogatót eltüntet; a rossz nem büntet (a kombó sem törik).
        if (result === "correct") {
          let n = 0;
          for (const r of raiders) {
            if (!r.alive) continue;
            n += 1;
            damage(r, r.hp, false);
          }
          st.score += 15;
          emit("bomb", TOWER.x, TOWER.y, n);
        } else {
          emit("bombFizzle", TOWER.x, TOWER.y);
        }
        return;
      }
      if (result === "correct") {
        const before = st.power;
        st.combo = comboCorrect(st.combo);
        st.power = st.combo.multiplier;
        if (st.power > before) emit("power", TOWER.x, TOWER.y, st.power);
        if (COMBO_STEPS.includes(st.combo.count) && st.combo.count > 0) shieldUp();
        const s = Number.isFinite(speed) ? Math.min(1, Math.max(0, speed)) : 0;
        // terv 6.2 „bónuszplafon”: a gyorsasági bónusz legfeljebb 2,5 / 10 = 25%.
        st.score += Math.round(10 * st.power + 2.5 * st.power * s);
        if (kind === "boss") {
          if (st.boss) st.boss.sinceAnswer = 0;
          bossHit();
          return;
        }
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
      // Rossz válasz / lejárat (J4b hangolás, mérve): a kombó és vele a lövés ereje elvész (≤ 2 s látható következmény:
      // narancs villám, „Erő ×1”), de a PAJZS NEM fogy — a pajzs az ügyességi játék tétje. A J4a-ban a rossz válasz −1 pajzs
      // volt (terv 5.4); a 20 seedes mérés szerint így a gyengébb és a lassú számoló rosszabbul járt a kérdésekkel, mint
      // nélkülük (a tanulás büntetett). Főellenfélnél a rossz válasz ellencsapást vált ki (előjelzett, kivédhető).
      st.combo = comboBreak(st.combo);
      st.power = 1;
      if (kind === "boss" && st.boss) {
        const b = st.boss;
        b.sinceAnswer = 0;
        // Ellencsapás: rövid szünet után töltés (≥ 600 ms előjelzés) — a mag megérintése kivédi (ügyesség, nem büntetés).
        if (b.kind === "zero" && b.attack !== "charge") {
          b.attack = "idle";
          b.attackMs = Math.max(0, BOSS_ATTACK_EVERY_MS[b.stage - 1]! - BOSS_COUNTER_DELAY_MS);
        }
        emit("bossShrug", b.x, b.y, b.hp);
      }
      emit("zap", TOWER.x, TOWER.y, st.shield);
      emit("wrongAnswer", TOWER.x, TOWER.y, st.shield);
    },
    drainEvents(visit) {
      for (let i = 0; i < eventCount; i++) visit(events[i]!);
      eventCount = 0;
    },
    bossWantsQuestion: () => {
      const b = st.boss;
      return st.phase === "boss" && !!b && !b.defeated && b.t >= BOSS_ENTER_MS && b.attack !== "charge" && b.sinceAnswer >= BOSS_QUESTION_GAP_MS;
    },
    bombDue: () => st.phase === "play" && bombReady,
    takeBomb() {
      bombReady = false;
      bombMs = 0;
    },
    nextKind: () => nextKindVal,
    setNextKind(kind) {
      nextKindVal = kind;
    },
    bossCoreAt(nx, ny, rx, ry) {
      const b = st.boss;
      if (!b || b.defeated) return false;
      const ex = (b.x - nx) / rx;
      const ey = (b.y - ny) / ry;
      return ex * ex + ey * ey <= 1;
    },
    hitBossCore() {
      const b = st.boss;
      if (!b || b.defeated || b.t < BOSS_ENTER_MS) return false;
      if (b.kind === "zero") {
        // A Zéró-robot magja csak TÖLTÉS közben sebezhető: a megszakítás elmarasztalja a támadást és repeszt a páncélon.
        if (b.attack !== "charge") return false;
        b.attack = "stunned";
        b.attackMs = 0;
        b.hitAgo = 0;
        st.score += 10 * st.power;
        emit("bossStun", b.x, b.y);
      } else {
        b.hitAgo = 0;
        st.score += 2 * st.power;
      }
      // Ügyességi út (kérdés nélkül is legyőzhető, K.6): a magra mért találatok repesztik a páncélt / fogaskereket.
      b.chip += 1;
      if (b.chip >= (b.kind === "zero" ? ZERO_CHIP_PER_HP : FACTORY_CHIP_PER_HP)) {
        b.chip = 0;
        bossHit(false);
      }
      return true;
    },
    forceBoss(kind) {
      if (!api.running()) return;
      for (const r of raiders) if (r.alive) remove(r);
      if (kind === "zero") st.wave = TOWER_WAVES.length - 1;
      spawnBoss(kind);
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

/**
 * A főellenfél gyenge pontjai (a válaszcélok) a test körül — a főellenféllel együtt MOZOGNAK (a mobil mérő „mozgó cél”
 * esete). Hibagyár: két fogaskerék két oldalt; Zéró-robot: négy pont a páncélon. Normalizált eltolás a középponttól.
 */
export function bossWeakPoints(kind: BossKind, count: number, wide: boolean, out: { x: number; y: number }[]): void {
  const n = Math.max(1, count);
  const sx = wide ? 0.11 : 0.2;
  for (let i = 0; i < n; i++) {
    const p = out[i] ?? (out[i] = { x: 0, y: 0 });
    if (kind === "factory" || n <= 2) {
      p.x = (i % 2 === 0 ? -1 : 1) * sx * 1.05;
      p.y = 0.02;
    } else {
      // 2×2: felső pár szélesebben, alsó pár szűkebben (két drón soha nem fedi egymást — ld. teszt)
      const top = i < 2;
      p.x = (i % 2 === 0 ? -1 : 1) * (top ? sx * 1.15 : sx * 0.65);
      p.y = top ? -0.07 : 0.11;
    }
  }
}

export type MathTaskSpec = { prompt: string; labels: string[]; correctIndex: number; explanation: string; value: number };

function label(n: number): string {
  return String(n).replace("-", "−");
}

function distinctOptions(value: number, rng: () => number, spread: number, allowNegative: boolean): number[] {
  const set = new Set<number>([value]);
  let guard = 0;
  while (set.size < 4 && guard++ < 200) {
    const d = 1 + Math.floor(rng() * spread);
    const c = value + (rng() < 0.5 ? -d : d);
    if (allowNegative || c >= 0) set.add(c);
  }
  for (let k = 1; set.size < 4; k++) set.add(value + 10 * k);
  const arr = Array.from(set);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * Számlánc (J4b, terv 5.4 Q2): a következő feladat első operandusa az előző eredménye — `a ± b` / `a × b` / `a ÷ b` az
 * évfolyam számkörében (U-J4-1: a lap generátora nem paraméterezhető operandussal, ezért helyi, seedelt generátor).
 * 3–4. évfolyamon nemnegatív, ezres számkör; később nagyobb számok és szorzás.
 */
export function chainTask(prev: number, grade: number, rng: () => number): MathTaskSpec {
  const young = grade <= 4;
  const cap = young ? 1000 : 10_000;
  const a = Math.max(0, Math.min(cap, Math.round(prev)));
  const roll = rng();
  let op: "+" | "−" | "×" | "÷" = "+";
  let b = 0;
  let value = 0;
  if (roll < 0.25 && a >= 2 && a <= (young ? 100 : 500)) {
    // osztás, ha van egész osztó
    const divisors = [2, 3, 4, 5, 6, 7, 8, 9, 10].filter((d) => a % d === 0);
    if (divisors.length > 0) {
      b = divisors[Math.floor(rng() * divisors.length)]!;
      op = "÷";
      value = a / b;
      return finish();
    }
  }
  if (roll < 0.5 && a <= (young ? 50 : 300)) {
    b = 2 + Math.floor(rng() * (young ? 4 : 8));
    op = "×";
    value = a * b;
  } else if (roll < 0.75 && a >= 10) {
    b = 2 + Math.floor(rng() * Math.min(young ? 20 : 99, a - 1));
    op = "−";
    value = a - b;
  } else {
    b = 2 + Math.floor(rng() * (young ? 20 : 99));
    op = "+";
    value = a + b;
  }
  return finish();

  function finish(): MathTaskSpec {
    const opts = distinctOptions(value, rng, young ? 9 : 15, false);
    return {
      prompt: `${label(a)} ${op} ${label(b)} = ?`,
      labels: opts.map(label),
      correctIndex: opts.indexOf(value),
      explanation: `${label(a)} ${op} ${label(b)} = ${label(value)}.`,
      value,
    };
  }
}

/**
 * A játék különleges kérdései a lapon ÉS a sim-ben ugyanígy (J4b): Becslő-bomba (`nextKind() === "bomb"`), a Zéró-robot /
 * Hibagyár gyenge pontja (`"boss"`: számlánc a főellenfél előző eredményéből), és ×3 kombótól a Számlánc a rendes kérdésnél.
 * `special()` null → a hívó a saját rendes forrását használja. A `noteOutcome` a kimenetből viszi tovább a láncot.
 */
export function createTowerTasks(opts: { core: TowerCore; grade: () => number; rng: () => number }): {
  special(): PlayQuestion | null;
  noteOutcome(o: QuestionOutcome, p: QuestionPresentation): void;
  /** A rendes kérdés most Számlánc lenne-e (a HUD jelzi). */
  chainActive(): boolean;
} {
  let last: number | null = null;
  let bossChain: number | null = null;
  const parse = (t: string): number | null => {
    const v = Number(t.replace("−", "-").replace(",", "."));
    return Number.isFinite(v) && Number.isInteger(v) && v >= 0 && v <= 10_000 ? v : null;
  };
  const toQuestion = (spec: MathTaskSpec, tag: string, noReview: boolean): PlayQuestion => {
    const q = bankPlayQuestion(SPEED_MATH_GAME_ID, {
      id: `${tag}:${speedMathQuizId(opts.grade(), spec.prompt)}:${spec.labels.join("|")}`,
      prompt: spec.prompt,
      options: spec.labels,
      correctIndex: spec.correctIndex,
      explanation: spec.explanation,
    }, undefined, opts.grade());
    return noReview ? { ...q, noReview: true } : q;
  };
  const chainActive = () => opts.core.state().combo.count >= 3 && last !== null;
  return {
    special() {
      const kind = opts.core.nextKind();
      if (kind === "bomb") return toQuestion(estimateTask(opts.grade(), opts.rng), "est", true);
      if (kind === "boss") {
        const base = bossChain ?? chainStart(opts.grade(), opts.rng);
        return toQuestion(chainTask(base, opts.grade(), opts.rng), "boss", false);
      }
      if (chainActive()) return toQuestion(chainTask(last!, opts.grade(), opts.rng), "chain", false);
      return null;
    },
    noteOutcome(o, p) {
      if (o.result === "aborted") return;
      const isBoss = p.reason === "boss";
      if (o.result !== "correct") {
        if (!isBoss) last = null;
        return;
      }
      const v = parse(p.question.quiz.options[p.question.quiz.correctIndex] ?? "");
      if (isBoss) bossChain = v;
      else if (!p.question.noReview) last = v;
    },
    chainActive,
  };
}

/** A kérdés fajtája a kimenet-leképezéshez (a lapon és a sim-ben ugyanígy). */
export function towerQuestionKind(p: QuestionPresentation): TowerQuestionKind {
  if (p.reason === "boss") return "boss";
  return p.question.noReview && p.question.key.includes(":est:") ? "bomb" : "normal";
}

/** A Zéró-robot számláncának kezdőszáma az évfolyam számkörében. */
export function chainStart(grade: number, rng: () => number): number {
  return grade <= 3 ? 10 + Math.floor(rng() * 40) : grade <= 4 ? 20 + Math.floor(rng() * 80) : 50 + Math.floor(rng() * 200);
}

/**
 * Becslő-bomba (J4b, terv 5.4 Q3): „Melyik nagyobb?” — két kifejezés, a különbség 6–20%, hogy becsléssel (nem pontos
 * számolással) gyorsan dönthető legyen. Két opció; nem kerül az ismétlési sorba (`noReview`).
 */
export function estimateTask(grade: number, rng: () => number): MathTaskSpec {
  const young = grade <= 4;
  const a = young ? 3 + Math.floor(rng() * 7) : 6 + Math.floor(rng() * 14);
  const b = young ? 11 + Math.floor(rng() * 19) : 12 + Math.floor(rng() * 38);
  const exact = a * b;
  const pct = 0.06 + rng() * 0.14;
  const other = Math.round(exact * (rng() < 0.5 ? 1 - pct : 1 + pct));
  const left = `${a} × ${b}`;
  const right = label(other);
  const swap = rng() < 0.5;
  const labels = swap ? [right, left] : [left, right];
  const bigger = exact > other ? left : right;
  return {
    prompt: "Melyik nagyobb?",
    labels,
    correctIndex: labels.indexOf(bigger),
    explanation: `${left} = ${label(exact)}, ez ${exact > other ? "nagyobb" : "kisebb"}, mint ${right}.`,
    value: Math.max(exact, other),
  };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A menet meghajtója: a lap ÉS a node-szimuláció ugyanezt hívja (review #451)                                        */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A becsapódás és az energiahullám hitstopja (valós ms; a hurok `holdFor`-ja a sim lépéseit tolja el, nem a tartalmukat). */
export const HITSTOP_BREACH_MS = 60;
export const HITSTOP_SHOCK_MS = 80;

/** A kérdés-sáv állapotgépének az a része, amit a meghajtó használ (`createQuestionUi` / `usePlayQuestion` adja). */
export type TowerQuestionUi = {
  frame(clockMs: number, ctx: { calm: boolean; tick?: boolean }): void;
  timeScale(): number;
  finished(): boolean;
  finish(): unknown;
  /** J4b: azonnali kérés (főellenfél: „boss”, Becslő-bomba: „trigger”), és hogy most indulhat-e kérdés. */
  request(reason: "trigger" | "boss", clockMs: number): unknown;
  canAsk(): boolean;
  /** Nyitott-e kérdés (a főellenfél ilyenkor nem támad). */
  active(): unknown;
};

export type TowerDriver = {
  core: TowerCore;
  loop: FixedLoop;
  feel: Feel;
  pace: IntensityDirector;
  /**
   * Egy képkocka: `realDtMs` a valós eltelt idő. Sorrend (mindkét úton azonos): kérdés-óra (szünetben áll) → hitstop-óra →
   * menetvég esetén a kérdés lezárása → a kérdés-sáv képkockája → időskála (szünet 0, nyitott kérdés `slowMo`) → fix
   * lépésű hurok → az események ürítése (hitstop a becsapódásra / energiahullámra, majd a nézet `onEvent`-je).
   * Visszaadja az interpolációs alphát.
   */
  frame(realDtMs: number, paused: boolean, onEvent?: (e: TowerEvent) => void): number;
  /** Az események ürítése képkockán kívül (koppintás után azonnal) — ugyanazzal a hitstop-szabállyal. */
  drain(onEvent?: (e: TowerEvent) => void): void;
  /** A lassítatlan kérdés-óra (ms; szünetben áll) — a director / kérdés-sáv `simNowMs`-e. */
  clockMs(): number;
};

/**
 * A menet egyetlen meghajtója: a játéklogika a magban fut, a fix lépésű hurok (`createFixedLoop`, 1/60 s, időskála,
 * `holdFor`) és a hitstop-szabály is itt van, így a lap (rAF) és a sim (`sim.ts`) bitre ugyanazt a lépéssort futtatja
 * ugyanazon képkocka-időkkel; eltérő képkocka-időknél a mag állapota a LÉPÉSSZÁMTÓL és a lépésekhez kötött bemenettől
 * függ (J0a determinizmus-szabály) — `T/speed-math-core.test.ts` „meghajtó”.
 */
export function createTowerDriver(opts: {
  seed: number | string;
  questions: TowerQuestionUi | null;
  /** A director áramlat-intenzitása (a fosztogató-tempóhoz); kérdés nélkül 0,4. */
  intensity: () => number;
  reducedMotion?: boolean;
}): TowerDriver {
  const core = createTowerCore({ seed: opts.seed });
  const pace = createIntensityDirector();
  const loop = createFixedLoop((dt) => {
    const before = core.state().breaches;
    core.step(dt, opts.intensity(), { questionOpen: !!opts.questions?.active() });
    if (core.state().breaches > before) pace.signal("damage");
    const lead = core.mostAdvanced();
    if (lead >= 0 && core.progressOf(lead) > NEAR_THREAT) pace.signal("nearThreat", dt / 1000);
    pace.update(dt / 1000);
  });
  // A rázás-zaj kozmetikai (KSZ-2: külön fxRng); a hitstop determinisztikus (a hurok tartása).
  const feel = createFeel({ reducedMotion: opts.reducedMotion ?? false, loop, fxRng: createRng(seedFrom(SPEED_MATH_GAME_ID, opts.seed, "fx")).next });
  let clock = 0;
  let real = 0;
  const drain = (onEvent?: (e: TowerEvent) => void) => {
    core.drainEvents((e) => {
      if (e.type === "breach") feel.hitstop(HITSTOP_BREACH_MS);
      else if (e.type === "shock") feel.hitstop(HITSTOP_SHOCK_MS);
      if (e.type === "wrongAnswer") pace.signal("wrong");
      onEvent?.(e);
    });
  };
  return {
    core,
    loop,
    feel,
    pace,
    frame(realDtMs, paused, onEvent) {
      const dt = Number.isFinite(realDtMs) && realDtMs > 0 ? realDtMs : 0;
      real += dt;
      if (!paused) clock += dt;
      feel.update(paused ? 0 : dt);
      const q = opts.questions;
      if (q && !core.running() && !q.finished()) q.finish();
      // A mini-Director `calm()`-ja (a közös utójavítás óta a nyugodt buildup is nyugodt — a J4a kerülőútja megszűnt).
      if (q && !paused) {
        // A főellenfél-harc alatt nincs ütemezett rendes kérdés: a kérdés a gyenge pont (lent kérve).
        core.setNextKind("normal");
        q.frame(clock, { calm: pace.calm(), tick: core.state().phase !== "boss" });
        if (q.canAsk() && core.running()) {
          if (core.bossWantsQuestion()) {
            core.setNextKind("boss");
            q.request("boss", clock);
          } else if (core.bombDue()) {
            core.setNextKind("bomb");
            if (q.request("trigger", clock)) core.takeBomb();
          }
          core.setNextKind("normal");
        }
      }
      loop.setTimeScale(paused ? 0 : q ? q.timeScale() : 1);
      const alpha = loop.frame(real);
      drain(onEvent);
      return alpha;
    },
    drain,
    clockMs: () => clock,
  };
}
