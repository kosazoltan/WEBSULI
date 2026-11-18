/**
 * J5a — Brain Rot Lopás „Lény-aréna”: a játék tiszta magja (végrehajtás J5 / J5a 2.; terv 5.5; K.5 KSZ-1, KSZ-2, KSZ-4,
 * KSZ-5, KSZ-6, KSZ-14, KSZ-15).
 *
 * TISZTA TS: nincs DOM, three, React, hang, `Math.random`, `Date.now` (őr: `T/game-sim-determinism-guard.test.ts`). A lap
 * (`P/BrainRotSteal.tsx`) csak olvassa az állapotot és a kibocsátott eseményeket; a hang, a rezgés és a feliratok az
 * eseményekből dolgoznak. A lap és a node-szimuláció (`./sim.ts`) UGYANAZT a meghajtót hívja (`createBrainRotDriver`,
 * K.6 „Közös meghajtó”, C-52).
 *
 * KOORDINÁTÁK: egység (u) = a tábla RÖVIDEBB oldala. Az aréna `w × h` egység (álló telefonon w = 1, h ≥ 1; fekvőn h = 1,
 * w ≥ 1), x jobbra, y LEFELÉ nő. A pixelre váltás (`× unitPx`) a nézet dolga.
 *
 * IDŐ: a `step(dtMs)` a VILÁG ideje — a meghajtó fix lépésű hurka (`createFixedLoop`) lépteti; a kérdés alatti lassítás
 * (`slowMo` 0,6) a hurok szorzója (KSZ-4). A kérdés-óra a meghajtó LASSÍTATLAN órája (a kérdés határideje ezen fut); a menet
 * 90 mp-es órája külön (terv 2026-11-17-brainrot-valaszido D5 és a 2026-11-18-i módosítás, tulajdonosi döntés „Csak a
 * többletidőre álljon”): kérdés nélkül jár; nyitott kérdésnél csak a régi (közös) ablaknyit fogy az óra indulásától, az
 * előjelzés és a hosszabbítás alatt áll; szünetben áll. A menet vége nem eshet nyitott kérdésre.
 *
 * JÁTÉK (terv 5.5, J5a):
 *  - A vadász joystickkal (vagy a táblára bökve / húzva) fut; a lények pattogva sodródnak (`stepBrainRot`), és ha a vadász
 *    a közelükbe ér, ELMENEKÜLNEK (távolodás, falnál csúszás). Menekülés közben kifáradnak (`STAMINA_MS`), ilyenkor
 *    elkaphatók. Elkapás = érintkezés.
 *  - Elkapáskor a meghajtó kérdést kér (`request("trigger")`); megjelenéskor 4 ketrec nyílik az aréna négy negyedében
 *    (`CageLock`, opció-indexszel). A lény küszködik, a vadász 20%-kal lassabb (`CARRY_SPEED_FACTOR`), amíg egy ketrecbe nem ér.
 *    Ketrecbe futás = válasz. Jó: a lény megmarad + kombó; rossz / lejárat: a lény elszökik (J5b-től a riválishoz).
 *  - A lény élettartama (évfolyamtól függő, `brainRotLifetimeFor`) a világ idejében telik; a végén „Elszökött!”.
 *  - Ha `ASSIST_MS` ideig nincs elkapás, a legközelebbi lény elfárad (nem menekül) — a kérdés nélküli szakasz nem nyúlik
 *    el (terv 6.2: Brain Rot ≤ 12 mp).
 *  - Kérdés nélkül (üres forrás, terv 8.1; `questions: false`) az elkapás közvetlenül számít (a játék így is játszható).
 *  - Győzelem (J5a): legalább `CLEAR_CATCHES` megtartott lény a 90 mp végén. (J5b: rivális, fordulók, Tolvajkirály.)
 */
import { createRng, seedFrom, type Rng } from "@shared/game-rng";
import { comboBreak, comboCorrect, createCombo, type ComboState } from "@/game-engine/play/combo";
import { createIntensityDirector, type IntensityDirector } from "@/game-engine/play/director";
import { createFeel, type Feel } from "@/game-engine/play/feel";
import { createFixedLoop, type FixedLoop } from "@/game-engine/play/loop";
import { estimateLines, fitsAllViewports } from "@/game-engine/play/promptFit";
import type { DirectorConfig } from "@/game-engine/play/questionDirector";
import type { QuestionPresentation, QuestionResult } from "@/game-engine/play/types";

import { stepBrainRotInPlace, type Bounds, type MovingRot } from "../brainRotPhysics";
import type { brainRotAgeMs } from "../brainRotTuning";

export const BRAIN_ROT_GAME_ID = "brain-rot-steal" as const;

/* ------------------------------------------------------------------------------------------------------------------ */
/* Hangolás (a sim-teszt ezekre mér: `T/brainrot-sim.test.ts`)                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */

/** A menet hossza a kérdés-órán (valós idő, szünet nélkül): 90 mp (terv 5.5). */
export const ROUND_MS = 90_000;
/**
 * Sikeres vadászat: ennyi KETRECBEN megtartott lény (a pályanyitás és a napi kihívás is ez; a kérdés nélküli megtartás nem
 * számít — végrehajtás J5a 13.). A 10 a gyengébb játékosnak (kb. 14 kérdés, 45%) elérhetetlen volt (review #485 K2).
 */
export const CLEAR_CATCHES = 7;
/** A kérdés alatti lassítás (végrehajtás J5a 3.: `slowMo: 0.6`). */
export const BRAIN_ROT_SLOW_MO = 0.6;
/** A ketrec-kérdés alap ablaka: a gondolkodás + a ketrecig futás (terv 5.5 Q1: 4–6 mp; a 3–4. évf. ×1,25). */
export const CAGE_WINDOW_MS = 6000;

export const PLAYER_SPEED = 1.05; // u/s
/** A küszködő lénnyel a vadász 20%-kal lassabb (végrehajtás J5a 2.). */
export const CARRY_SPEED_FACTOR = 0.8;
export const PLAYER_RADIUS = 0.075;
/** A vadász kompenzációjának alsó korlátja (a hurok szorzója 0,35 alá úgysem megy — terv 4.1/3). */
export const MIN_PLAYER_SCALE = 0.35;
/** A sebesség ennyi 1/s ütemben közelít a kívánthoz (rövid gyorsulás — finom, de azonnal reagál). */
export const PLAYER_ACCEL = 16;
/** A böködött célpont elérésének sugara. */
export const TARGET_REACHED = 0.02;

export const FLEE_RADIUS = 0.42;
export const FLEE_SPEED = 0.55; // u/s, a játékos sebessége alatt
/** Ennyi ms menekülés után a lény kifárad (lassú, elkapható), majd pihenve visszanyeri az erejét. */
export const STAMINA_MS = 1400;
export const TIRED_FACTOR = 0.35;
export const STAMINA_REGEN = 0.6;
export const DRIFT_MIN = 0.06;
export const DRIFT_MAX = 0.22;

export const FIRST_SPAWN_MS = 300;
export const SPAWN_BASE_MS = 2200;
export const SPAWN_MIN_MS = 900;
/** Egyszerre legfeljebb ennyi szabad lény (a régi `MAX_BRAIN_ROTS`). */
export const MAX_FREE = 8;
/** A lény-pool kapacitása (szabad + vitt + szökő), előre rögzítve (KSZ-6). */
export const CREATURE_CAP = 12;
/** Az élettartam szorzója a régi, koppintásos játékhoz képest: most üldözni kell. */
export const LIFETIME_CHASE_FACTOR = 1.4;
/** Ennyi elkapás nélküli világidő után a legközelebbi lény elfárad (terv 6.2: kérdés nélkül ≤ 12 mp). */
export const ASSIST_MS = 5000;
export const ESCAPE_ANIM_MS = 450;
/** Az érintkezés: a vadász sugara + a lény sugarának ennyi része. */
export const CATCH_REACH = 0.85;
/** Új lény legalább ennyire születik a vadásztól (ne „magától” kerüljön a kezébe). */
export const SPAWN_CLEAR = 0.3;
/** Kérés után ennyi kérdés-óra ms-ig vár a meghajtó kérdésre; utána a lény közvetlenül megmarad (terv 8.1). */
export const CARRY_RESOLVE_MS = 1600;
export const EVENT_CAP = 32;

/** A lény-fajták (a régi lap táblája; a név a `CollectibleAvatar` képét választja). */
/**
 * Ketrec-választás: a ketrecben MEGÁLLVA (a sebesség a vitt tempó `CAGE_STOP_SPEED`-szerese alatt) eltöltött, folyamatos
 * `CAGE_DWELL_MS` (vadász-idő). Az átfutás nem választ (review #485).
 */
export const CAGE_DWELL_MS = 160;
/** A ketrecek ennyi (vadász-idő) ms látható előjelzés után élesednek (KSZ-11: kérdés-kapu előtt >= 400 ms; review #485 B1). */
export const CAGE_ARM_MS = 600;
export const CAGE_STOP_SPEED = 0.35;
/** A ketrec ennyi szabad helyet hagy a vadász körül, ha a nyíláskor rá esne (`clearCagesFrom`). */
export const CAGE_PLAYER_CLEAR = 0.06;

export const BRAIN_ROT_KINDS: readonly { emoji: string; name: string; xp: number }[] = [
  { emoji: "\u{1F9E0}", name: "Agy", xp: 30 },
  { emoji: "\u{1F92F}", name: "Felrobbanó fej", xp: 40 },
  { emoji: "\u{1F480}", name: "Koponya", xp: 35 },
  { emoji: "\u{1F47E}", name: "Űrlény", xp: 50 },
  { emoji: "\u{1F916}", name: "Robot", xp: 45 },
  { emoji: "\u{1F47B}", name: "Szellem", xp: 55 },
  { emoji: "\u{1F9A0}", name: "Vírus", xp: 60 },
  { emoji: "\u{1F300}", name: "Örvény", xp: 70 },
  { emoji: "\u{1F4AB}", name: "Csillag", xp: 65 },
  { emoji: "\u{1F52E}", name: "Kristálygömb", xp: 80 },
  { emoji: "\u{1F3AD}", name: "Maszk", xp: 45 },
  { emoji: "\u{1F9FF}", name: "Nazar szem", xp: 75 },
  { emoji: "⚡", name: "Villám", xp: 55 },
];

/**
 * A kérdés-ütemező beállítása (végrehajtás J5a 3.): 4 ketrec, 8 kérdés/perc cél (terv 6.2), a kérdést a játék kéri
 * (elkapás), ütemezett kérdés nincs (a lap `tick: false`-szal hívja); 6 mp alap ablak, `slowMo` 0,6; olvasás-tudatos ablak
 * és a ketrec-feliratokkal együtt beférő tétel elsőbbsége (J0c-b).
 */
export function brainRotDirectorConfig(grade: number | null): DirectorConfig {
  return {
    gameId: BRAIN_ROT_GAME_ID,
    optionCount: 4,
    minGapMs: 1500,
    maxGapMs: 12_000,
    targetPerMin: 8,
    baseWindowMs: CAGE_WINDOW_MS,
    slowMo: BRAIN_ROT_SLOW_MO,
    grade,
    readingAware: true,
    promptFits: (quiz) => fitsAllViewports(quiz, { grade, baseWindowMs: CAGE_WINDOW_MS }).ok,
  };
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Típusok                                                                                                              */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * Az évfolyamhoz és a táblához igazított hangolás (a lap a `lib/brainRotTuning.ts` függvényeiből adja — a sim ugyanígy).
 * `sizePx`: a lény átmérője CSS px-ben (seedelt szórással); `unitPx`: a tábla rövidebb oldala px-ben (= 1 egység).
 */
export type BrainRotTuning = {
  sizePx: (rng: () => number) => number;
  unitPx: number;
  lifetimeMs: number;
  speedScale: number;
  ageMs: typeof brainRotAgeMs;
};

export type CreatureState = "free" | "carried" | "escaping";

export type Creature = {
  /** A pool-hely aktív-e. */
  active: boolean;
  id: number;
  kind: number;
  x: number;
  y: number;
  /** A sodródás sebessége (u/s); a menekülés külön komponens. */
  vx: number;
  vy: number;
  r: number;
  rotation: number;
  rotSpeed: number;
  bornMs: number;
  lifeMs: number;
  stamina: number;
  dazed: boolean;
  state: CreatureState;
  escapeMs: number;
  /** A szökés iránya (egységvektor). */
  ex: number;
  ey: number;
};

/**
 * `dwellMs`: mióta áll benne MEGÁLLVA a vadász (vadász-idő ms) — a nézet töltődő sávot rajzol belőle. `armed`: élesedett-e
 * (az előjelzés után, a vadász kint). `entered`: az élesítés után lendülettel lépett-e be (csak ez választhat); `inside`: az
 * előző lépésben bent volt-e (a belépés éle).
 */
export type Cage = { x: number; y: number; w: number; h: number; armed: boolean; dwellMs: number; entered: boolean; inside: boolean };

export type CarryMode = "waiting" | "question";

export type BrainRotEventType = "spawn" | "catch" | "kept" | "direct" | "escape" | "lost" | "dazed" | "cageHit";

export type BrainRotEvent = {
  type: BrainRotEventType;
  x: number;
  y: number;
  /** A lény azonosítója (ha van). */
  id: number;
  /** Pont (kept / direct), ketrec-index (cageHit), különben 0. */
  n: number;
};

export type BrainRotState = {
  phase: "play" | "over";
  worldMs: number;
  arenaW: number;
  arenaH: number;
  player: { x: number; y: number; vx: number; vy: number; r: number };
  creatures: Creature[];
  carry: { id: number; mode: CarryMode; askSince: number } | null;
  cages: Cage[];
  cageCount: number;
  cagesOpen: boolean;
  /** A ketrecek nyitása óta eltelt vadász-idő (ms) — az élesítés `CAGE_ARM_MS` után. */
  cageAgeMs: number;
  /** A ketrec-zóna teteje egységben (a kérdés-kártya mért alja; a lap adja). */
  cageTop: number;
  /** Jelölt mód: a ketrecekben csak jel (a felirat nem fér) — alacsonyabb ketrec. */
  cageCompact: boolean;
  /** A ketrec-zár kérdésének azonosítója (a nézet ezzel köti a presentationhoz). */
  cageQuestionId: number | null;
  /** A ketrecbe futás indexe, amíg a meghajtó el nem dolgozza (−1: nincs). */
  hitCage: number;
  /** Ketrecben (jó válasszal) megtartott lények — ez számít a győzelembe. */
  caught: number;
  /** Kérdés nélkül megtartott lények (forráshiány): pont igen, győzelem / pályanyitás nem. */
  direct: number;
  missed: number;
  lost: number;
  score: number;
  combo: ComboState;
  sinceCatchMs: number;
  nextSpawnMs: number;
};

export type BrainRotCore = {
  state(): Readonly<BrainRotState>;
  running(): boolean;
  /** Az aréna mérete egységben (átméretezéskor a lények és a vadász az arénán belülre kerülnek) és a hangolás. */
  setArena(w: number, h: number, tuning: BrainRotTuning): void;
  /** A ketrec-zóna teteje egységben (a kérdés-kártya / jelmagyarázat mért alja) és a jelölt mód (a lap méri). */
  setCageZone(top: number, compact: boolean): void;
  /** Joystick / billentyű: képernyő-irány (y LEFELÉ), nagyság 0..1. Nem nulla bemenet a böködött célt törli. */
  setInput(x: number, y: number): void;
  /**
   * Böködés / húzás a táblán: ide fut a vadász (null: nincs cél). `kind`: `"down"` — friss lenyomás / ketrecgomb (alap);
   * `"move"` — a lenyomott ujj húzása. A ketrecek nyitásakor a már lent lévő ujj húzása elengedtetett: amíg új lenyomás
   * nem jön, a `"move"` cél elvetve (review #485 Ú1 — a húzás nem szándék).
   */
  setTarget(x: number | null, y?: number, kind?: "down" | "move"): void;
  /**
   * Egy világ-lépés. `timeScale`: a hurok aktuális szorzója (kérdés alatt `slowMo`) — a VADÁSZ ezzel kompenzál (a világ
   * lassul, a gyerek irányítása nem: a lassított joystick bemeneti késésnek érződne). Determinisztikus: a lépés bemenete.
   */
  step(dtMs: number, band: number, timeScale?: number): void;
  /** Elkaphat-e most lényt (nincs vitt lény). */
  canCatch(): boolean;
  /** A kérdés megjelent: a ketrecek kinyílnak (vitt lény nélkül a teszt-kampó egyet a vadász kezébe ad). */
  openCages(count: number, questionId: number): void;
  /** A kérdés kimenete (opció-index a presentationben, vagy null). */
  applyOutcome(result: QuestionResult, pickedOption: number | null): void;
  /** A meghajtó feldolgozta a ketrec-találatot. */
  takeCageHit(): number;
  /** A vitt lény kérdés nélkül megmarad (üres forrás / kérdés nélküli mód). */
  keepDirect(): void;
  markCarry(mode: CarryMode, askSince?: number): void;
  /** Teszt-kampó: egy lény a vadász mellett, már elkapva (a meghajtó kérdést kér hozzá). */
  forceCatch(): void;
  /** A menet vége (a meghajtó hívja az óra lejártakor). */
  end(): void;
  won(): boolean;
  /** A győzelembe számító (ketrecben megtartott) lények száma. */
  wonCount(): number;
  drainEvents(fn: (e: BrainRotEvent) => void): void;
  /** Determinisztikus állapot-ujjlenyomat (arany visszajátszás). */
  hash(): string;
};

/* ------------------------------------------------------------------------------------------------------------------ */
/* Ketrec-elrendezés                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------------ */

/**
 * A 4 ketrec helye (`out` mezőit írja). Álló nézetben 2 × 2 — az aréna négy negyedében, a felső sor az aréna közepe alatt
 * (a kérdés-sáv a HUD alatt a tábla felső ~20%-át takarja). Fekvő nézetben egy sorban az aréna alsó részén: a kérdés-kártya
 * fent középen van, és a tábla kevés magas — két sor alá nem férne, a kártya alá esne. A ketrecek nem fedik egymást
 * (≥ 12 px a 360 px-es táblán is).
 */
export function cageLayout(w: number, h: number, count: number, out: Cage[], top = 0, compact = false): void {
  const wide = w > h * 1.25;
  const n = Math.max(1, Math.min(count, out.length));
  const cw = cageWidthU(w, h, n, top);
  // A ketrec-zóna teteje: a kérdés-kártya (és a jelmagyarázat) mért alja alatt (review #485 B2b, K3).
  const zoneTop = cageZoneTop(h, top);
  const xs = [0.255, 0.745];
  let ch = wide ? (compact ? 0.22 : 0.3) : compact ? 0.15 : 0.21;
  let ys: number[];
  const row = cageSingleRow(w, h, top);
  if (row && !wide) {
    // Ú2: álló nézetben a mély zóna alatt nem fér két sor — egy sor a tábla alján, egymástól CAGE_ROW_GAP távolságra.
    const room = h - 0.02 - zoneTop;
    ch = Math.max(0.14, Math.min(ch, room));
    const y = Math.max(zoneTop + ch / 2, h - 0.02 - ch / 2);
    const span = n * cw + (n - 1) * CAGE_ROW_GAP;
    const x0 = (w - span) / 2 + cw / 2;
    for (let i = 0; i < n; i++) {
      const c = out[i]!;
      c.w = cw;
      c.h = ch;
      c.x = x0 + i * (cw + CAGE_ROW_GAP);
      c.y = Math.min(h - ch / 2 - 0.02, y);
      c.armed = false;
      c.dwellMs = 0;
      c.entered = false;
      c.inside = false;
    }
    return;
  }
  if (wide) {
    // Ha a zóna alatt nem fér a teljes magasság, a ketrec alacsonyabb lesz (de >= 0,16 egység, kb. 48 px).
    const room = h - 0.02 - zoneTop;
    if (room < ch) ch = Math.max(0.16, room);
    ys = [Math.min(h - ch / 2 - 0.02, Math.max(0.8 * h, zoneTop + ch / 2))];
  } else {
    const gap = 0.05;
    const bottom = h - 0.02;
    const room = bottom - zoneTop;
    if (room < 2 * ch + gap) ch = Math.max(0.14, (room - gap) / 2);
    // Ú2: ha a felső sor a zóna alatt kezdődne, az alsó sor lejjebb csúszik (a két sor + rés a zónába fér, lásd fent).
    const lower = Math.min(bottom - ch / 2, Math.max(Math.min(0.84 * h, bottom - ch / 2), zoneTop + ch / 2 + ch + gap));
    const upper = Math.min(Math.max(0.47 * h, zoneTop + ch / 2), lower - ch - gap);
    ys = [upper, lower];
  }
  for (let i = 0; i < n; i++) {
    const c = out[i]!;
    let cx: number;
    let cy: number;
    if (wide) {
      cx = ((i + 0.5) / n) * w;
      cy = ys[0]!;
    } else {
      const col = n === 3 && i === 2 ? -1 : i % 2;
      cx = col < 0 ? 0.5 * w : xs[col]! * w;
      cy = ys[i < 2 ? 0 : 1]!;
    }
    c.w = cw;
    c.h = ch;
    c.x = Math.min(w - cw / 2 - 0.02, Math.max(cw / 2 + 0.02, cx));
    c.y = Math.min(h - ch / 2 - 0.02, Math.max(ch / 2 + 0.02, cy));
    c.armed = false;
    c.dwellMs = 0;
    c.entered = false;
    c.inside = false;
  }
}

/** A ketrec-zóna teteje egységben (a mért alj + rés, a táblán belül). */
function cageZoneTop(h: number, top: number): number {
  return Math.max(0.02, Math.min(h - 0.3, top + 0.03));
}

/** Egysoros elrendezésnél a ketrecek közti rés (egység; ≥ 12 px a 344 px-es táblán is). */
export const CAGE_ROW_GAP = 0.04;

/**
 * Álló nézetben két sor kell (2 × ≥ 0,14 + 0,05 egység rés); ha a kártya / jelmagyarázat alatt ennyi nincs, egy sor
 * (review #485 Ú2). Fekvő nézetben mindig egy sor.
 */
export function cageSingleRow(w: number, h: number, top: number): boolean {
  if (w > h * 1.25) return true;
  return h - 0.02 - cageZoneTop(h, top) < 2 * 0.14 + 0.05;
}

/**
 * A ketrec szélessége egységben (a lap ebből számolja a felirat valódi px-szélességét a beférés-ellenőrzéshez). `top`: a
 * ketrec-zóna teteje — álló nézetben mély zónánál egy sorba kerülnek, és keskenyebbek (Ú2).
 */
export function cageWidthU(w: number, h: number, count: number, top = 0): number {
  const n = Math.max(1, Math.min(4, count));
  if (w > h * 1.25) return Math.min(0.62, (w * 0.88) / n);
  if (cageSingleRow(w, h, top)) return Math.min(0.46, (w - 0.04 - (n - 1) * CAGE_ROW_GAP) / n);
  return Math.min(0.46, w * 0.44);
}

/** A ketrecfelirat betűmérete (px) és sorainak felső határa — a CSS-sel egyező értékek (`.br-cage-label`). */
export const CAGE_LABEL_FONT = 15;
export const CAGE_LABEL_FONT_LONG = 14;
export const CAGE_LABEL_LINES = 3;
/** A ketrec nem-felirat szélessége (px): keret 2 × 2,5 + belső margó 2 × 8 + jel 28 + rés 6. */
export const CAGE_CHROME_PX = 55;

export function cageLabelFont(label: string): number {
  return label.length > 18 || longestWord(label) > 9 ? CAGE_LABEL_FONT_LONG : CAGE_LABEL_FONT;
}

/**
 * Lapszintű beférés (review #485 B2): elfér-e minden válasz a ketrec VALÓDI feliratszélességén legfeljebb 3 sorban, a közös
 * (óvatos) `estimateLines` becslővel. Ha nem, a lap jelölt módba vált (a ketrecben szám + szín, a teljes válasz a
 * jelmagyarázatban) — a válasz így soha nem vágódik le.
 */
export function cageLabelsFit(labels: readonly string[], cageWidthPx: number): boolean {
  const width = cageWidthPx - CAGE_CHROME_PX;
  if (width < 40) return false;
  return labels.every((l) => estimateLines(l, width, cageLabelFont(l)) <= CAGE_LABEL_LINES);
}

/** A felirat leghosszabb szava (a ketrec-felirat kisebb betűt kap, ha egy szó nem fér ki — ne törjön a szó közepén). */
export function longestWord(label: string): number {
  let best = 0;
  for (const w of label.split(" ")) best = Math.max(best, w.length);
  return best;
}

/** A vadász (kör) a ketrecben áll-e: a középpontja a sugár felével kitágított téglalapon belül. */
export function playerInCage(px: number, py: number, c: Cage): boolean {
  const m = PLAYER_RADIUS * 0.5;
  return Math.abs(px - c.x) <= c.w / 2 + m && Math.abs(py - c.y) <= c.h / 2 + m;
}

function rectsOverlap(a: Cage, b: Cage, gap: number): boolean {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + gap && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + gap;
}

/**
 * Ha egy ketrec a nyíláskor a vadászra esne, a ketrec arrébb kerül (függőlegesen, majd vízszintesen), hogy a vadász ne
 * „álljon bele” egy válaszba olvasás közben — és ne is kelljen kilépnie, ha épp ez a jó ketrec. Csak akkor mozdít, ha az új
 * hely az arénán belül van és más ketrecet nem fed; ha nincs ilyen, a ketrec marad (kilépésre élesedik).
 */
export function clearCagesFrom(px: number, py: number, w: number, h: number, count: number, cages: Cage[], top = 0): void {
  for (let i = 0; i < count; i++) {
    const c = cages[i]!;
    if (!playerInCage(px, py, c) && !(Math.abs(px - c.x) <= c.w / 2 + PLAYER_RADIUS && Math.abs(py - c.y) <= c.h / 2 + PLAYER_RADIUS)) continue;
    const ox = c.x;
    const oy = c.y;
    const dy = c.h / 2 + PLAYER_RADIUS + CAGE_PLAYER_CLEAR;
    const dx = c.w / 2 + PLAYER_RADIUS + CAGE_PLAYER_CLEAR;
    const prefer = oy >= py ? 1 : -1;
    const candidates: ReadonlyArray<readonly [number, number]> = [
      [ox, py + prefer * dy], [ox, py - prefer * dy], [px + (ox >= px ? 1 : -1) * dx, oy], [px - (ox >= px ? 1 : -1) * dx, oy],
    ];
    let placed = false;
    for (const [cx, cy] of candidates) {
      // A kérdés-kártya alá (a ketrec-zóna fölé) nem kerülhet (review #485 B2b).
      if (cx - c.w / 2 < 0.02 || cx + c.w / 2 > w - 0.02 || cy - c.h / 2 < Math.max(0.02, top + 0.03) || cy + c.h / 2 > h - 0.02) continue;
      c.x = cx;
      c.y = cy;
      let clash = false;
      for (let j = 0; j < count; j++) if (j !== i && rectsOverlap(c, cages[j]!, 0.03)) clash = true;
      if (!clash) {
        placed = true;
        break;
      }
    }
    if (!placed) {
      c.x = ox;
      c.y = oy;
    }
  }
}

/** A régi lap spawn-ütemének képlete: az idő adja az alapívet, a nehézség-sáv a tempót (padlón lassabb). */
export function spawnEveryMs(worldMs: number, band: number): number {
  const paceScale = 1.4 - band * 0.55;
  return Math.max(SPAWN_MIN_MS, (SPAWN_BASE_MS - (worldMs / 1000) * 15) * paceScale);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A mag                                                                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */

const DEFAULT_TUNING: BrainRotTuning = {
  sizePx: () => 80,
  unitPx: 360,
  lifetimeMs: 7500,
  speedScale: 0.8,
  ageMs: ({ now, spawnTime }) => Math.max(0, now - spawnTime),
};

function blankCreature(): Creature {
  return {
    active: false, id: -1, kind: 0, x: 0, y: 0, vx: 0, vy: 0, r: 0.1, rotation: 0, rotSpeed: 0, bornMs: 0, lifeMs: 0,
    stamina: STAMINA_MS, dazed: false, state: "free", escapeMs: 0, ex: 0, ey: 0,
  };
}

/**
 * `directCatch`: kérdés nélküli menet (a meghajtó `questions: null`-lal) — az elkapás a LÉPÉSEN BELÜL közvetlenül megmarad,
 * így a mag állapota a képkocka-felosztástól független (K.6 determinizmus).
 */
export function createBrainRotCore(opts: { seed: number | string; arenaW?: number; arenaH?: number; tuning?: BrainRotTuning; directCatch?: boolean }): BrainRotCore {
  const rng: Rng = createRng(seedFrom(BRAIN_ROT_GAME_ID, opts.seed, "world"));
  const random = rng.next;
  let tuning = opts.tuning ?? DEFAULT_TUNING;
  const st: BrainRotState = {
    phase: "play",
    worldMs: 0,
    arenaW: Math.max(0.5, opts.arenaW ?? 1),
    arenaH: Math.max(0.5, opts.arenaH ?? 1.5),
    player: { x: 0, y: 0, vx: 0, vy: 0, r: PLAYER_RADIUS },
    creatures: Array.from({ length: CREATURE_CAP }, blankCreature),
    carry: null,
    cages: Array.from({ length: 4 }, () => ({ x: 0, y: 0, w: 0.4, h: 0.2, armed: false, dwellMs: 0, entered: false, inside: false })),
    cageCount: 0,
    cagesOpen: false,
    cageAgeMs: 0,
    cageTop: 0,
    cageCompact: false,
    cageQuestionId: null,
    hitCage: -1,
    caught: 0,
    direct: 0,
    missed: 0,
    lost: 0,
    score: 0,
    combo: createCombo(),
    sinceCatchMs: 0,
    nextSpawnMs: FIRST_SPAWN_MS,
  };
  st.player.x = st.arenaW / 2;
  st.player.y = st.arenaH * 0.62;
  let nextId = 1;
  let inputX = 0;
  let inputY = 0;
  let target: { x: number; y: number } | null = null;
  /**
   * A ketrecek nyitása UTÁN böködött cél (kifejezett szándék): ha a vadász ezzel már az élesítés előtt beér és megáll, az
   * élesítéskor ez a ketrec választható (a gyors böködő gyereknek nem kell kilépnie). A joystick-tehetetlenség nem szándék.
   */
  let intent: { x: number; y: number } | null = null;
  /** Ú1: a ketrecek nyitásakor igaz — a lenyomva tartott ujj húzása (`"move"`) új lenyomásig elvetve. */
  let staleDrag = false;
  /**
   * Joystick-szándék (review #485, Vercel 4597845275): lent van-e a joystick, a nyitáskor már lent volt-e (tehetetlenség —
   * nem szándék, amíg el nem engedik), és a mostani tolás mikor kezdődött (ketrec-kor, ms; -1: nyitott ketrec nélkül).
   */
  let stickDown = false;
  let stickStale = false;
  let stickStartAge = -1;
  const events: BrainRotEvent[] = Array.from({ length: EVENT_CAP }, () => ({ type: "spawn" as BrainRotEventType, x: 0, y: 0, id: -1, n: 0 }));
  let evHead = 0;
  let evCount = 0;
  /** Lépésenként újrahasznált munkaváltozók (KSZ-5: a forró hurokban nincs allokáció). */
  const bounds: Bounds = { width: 1, height: 1 };
  const moved: MovingRot = { x: 0, y: 0, vx: 0, vy: 0, size: 0, rotation: 0, rotSpeed: 0 };

  function emit(type: BrainRotEventType, x: number, y: number, id: number, n: number): void {
    const slot = events[(evHead + evCount) % EVENT_CAP]!;
    slot.type = type;
    slot.x = x;
    slot.y = y;
    slot.id = id;
    slot.n = n;
    if (evCount < EVENT_CAP) evCount += 1;
    else evHead = (evHead + 1) % EVENT_CAP; // a legrégebbi eldobva (a nézet úgyis képkockánként ürít)
  }

  const clampX = (x: number, r: number) => Math.min(st.arenaW - r, Math.max(r, x));
  const clampY = (y: number, r: number) => Math.min(st.arenaH - r, Math.max(r, y));

  function findCreature(id: number): Creature | null {
    for (const c of st.creatures) if (c.active && c.id === id) return c;
    return null;
  }

  function freeCount(): number {
    let n = 0;
    for (const c of st.creatures) if (c.active && c.state === "free") n += 1;
    return n;
  }

  /** Új lény: seedelt fajta, méret, sodródás; a vadásztól `SPAWN_CLEAR`-nél messzebb (`near`: közel, a segítséghez). */
  function spawn(near: boolean): Creature | null {
    const slot = st.creatures.find((c) => !c.active);
    if (!slot) return null;
    const kind = rng.int(BRAIN_ROT_KINDS.length);
    const r = Math.max(0.04, tuning.sizePx(random) / 2 / Math.max(1, tuning.unitPx));
    let x = 0;
    let y = 0;
    const p = st.player;
    if (near) {
      // A segítség / az első lény: ~0,32 egységre a vadásztól, az aréna felé eső irányban.
      const a = random() * Math.PI * 2;
      x = clampX(p.x + Math.cos(a) * 0.32, r + 0.02);
      y = clampY(p.y + Math.sin(a) * 0.32, r + 0.02);
    } else {
      for (let tries = 0; tries < 8; tries++) {
        x = r + 0.02 + random() * Math.max(0, st.arenaW - 2 * (r + 0.02));
        y = r + 0.02 + random() * Math.max(0, st.arenaH - 2 * (r + 0.02));
        if (Math.hypot(x - p.x, y - p.y) >= SPAWN_CLEAR + r) break;
      }
    }
    const speed = (DRIFT_MIN + random() * (DRIFT_MAX - DRIFT_MIN)) * tuning.speedScale;
    const ang = random() * Math.PI * 2;
    slot.active = true;
    slot.id = nextId++;
    slot.kind = kind;
    slot.x = x;
    slot.y = y;
    slot.vx = Math.cos(ang) * speed;
    slot.vy = Math.sin(ang) * speed;
    slot.r = r;
    slot.rotation = random() * 360;
    slot.rotSpeed = (random() - 0.5) * 4;
    slot.bornMs = st.worldMs;
    slot.lifeMs = tuning.lifetimeMs * LIFETIME_CHASE_FACTOR;
    slot.stamina = STAMINA_MS;
    slot.dazed = false;
    slot.state = "free";
    slot.escapeMs = 0;
    emit("spawn", x, y, slot.id, 0);
    return slot;
  }

  /** A lény elszökik (élettartam / rossz válasz): kifelé fut, majd eltűnik. */
  function escape(c: Creature, fromX: number, fromY: number): void {
    c.state = "escaping";
    c.escapeMs = 0;
    c.x = fromX;
    c.y = fromY;
    // A legközelebbi fal felé fut ki.
    const dl = c.x;
    const dr = st.arenaW - c.x;
    const dt = c.y;
    const db = st.arenaH - c.y;
    const m = Math.min(dl, dr, dt, db);
    c.ex = m === dl ? -1 : m === dr ? 1 : 0;
    c.ey = m === dt ? -1 : m === db ? 1 : 0;
    if (c.ex !== 0 && c.ey !== 0) c.ey = 0;
  }

  function age(c: Creature): number {
    return tuning.ageMs({ now: st.worldMs, spawnTime: c.bornMs, pausedTotal: 0, pausedTotalAtSpawn: 0, pausedAt: null });
  }

  function dazeNearest(): void {
    let best: Creature | null = null;
    let bestD = Infinity;
    for (const c of st.creatures) {
      if (!c.active || c.state !== "free") continue;
      if (c.dazed) return; // már van fáradt lény
      const d = Math.hypot(c.x - st.player.x, c.y - st.player.y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (!best) best = spawn(true);
    if (!best) return;
    best.dazed = true;
    // A fáradt lény kivárja a vadászt (ne szökjön el az orra előtt).
    best.lifeMs = Math.max(best.lifeMs, age(best) + 6000);
    emit("dazed", best.x, best.y, best.id, 0);
  }

  function catchCreature(c: Creature): void {
    c.state = "carried";
    c.dazed = false;
    st.carry = { id: c.id, mode: "waiting", askSince: -1 };
    st.sinceCatchMs = 0;
    // A lényre szánt böködés célja nem viheti a vadászt egy (később nyíló) ketrecbe (review #485 B1).
    target = null;
    emit("catch", c.x, c.y, c.id, 0);
    if (opts.directCatch) core.keepDirect();
  }

  /** A ketrecek elrendezése a mostani zónában; a vadászra eső ketrec arrébb kerül. Az élesítés újraindul (előjelzés). */
  function relayoutCages(): void {
    cageLayout(st.arenaW, st.arenaH, st.cageCount, st.cages, st.cageTop, st.cageCompact);
    clearCagesFrom(st.player.x, st.player.y, st.arenaW, st.arenaH, st.cageCount, st.cages, st.cageTop);
    for (let i = 0; i < st.cageCount; i++) st.cages[i]!.inside = playerInCage(st.player.x, st.player.y, st.cages[i]!);
  }

  const core: BrainRotCore = {
    state: () => st,
    running: () => st.phase === "play",
    setArena(w, h, nextTuning) {
      st.arenaW = Math.max(0.5, w);
      st.arenaH = Math.max(0.5, h);
      tuning = nextTuning;
      const p = st.player;
      p.x = clampX(p.x, p.r);
      p.y = clampY(p.y, p.r);
      for (const c of st.creatures) {
        if (!c.active) continue;
        c.x = clampX(c.x, c.r);
        c.y = clampY(c.y, c.r);
      }
      if (st.cageCount > 0) relayoutCages();
    },
    setCageZone(top, compact) {
      const t = Number.isFinite(top) ? Math.max(0, top) : 0;
      const changed = Math.abs(t - st.cageTop) > 0.005 || compact !== st.cageCompact;
      st.cageTop = t;
      st.cageCompact = compact;
      if (changed && st.cageCount > 0) relayoutCages();
    },
    setInput(x, y) {
      const m = Math.hypot(x, y);
      if (!(m > 0) || !Number.isFinite(m)) {
        inputX = 0;
        inputY = 0;
        stickDown = false;
        stickStale = false;
        return;
      }
      if (!stickDown) {
        stickDown = true;
        stickStartAge = st.cagesOpen ? st.cageAgeMs : -1;
      }
      const k = m > 1 ? 1 / m : 1;
      inputX = x * k;
      inputY = y * k;
      target = null;
      intent = null;
    },
    setTarget(x, y, kind = "down") {
      if (x === null || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) {
        target = null;
        return;
      }
      // Ú1: a nyitáskor lent lévő ujj húzása új lenyomásig nem ad célt (és szándékot sem).
      if (kind === "move" && staleDrag) return;
      if (kind === "down") staleDrag = false;
      target = { x: clampX(x, st.player.r), y: clampY(y, st.player.r) };
      intent = st.cagesOpen ? { x: target.x, y: target.y } : null;
    },
    step(dtMs, band, timeScale = 1) {
      if (st.phase !== "play" || !(dtMs > 0)) return;
      st.worldMs += dtMs;
      const dt = dtMs / 1000;
      // A vadász ideje: a világ-lépés a lassítás nélkül (a kérdés alatt is a gyerek tempójában mozog).
      const playerDtMs = dtMs / Math.min(1, Math.max(MIN_PLAYER_SCALE, timeScale));
      const pdt = playerDtMs / 1000;
      const p = st.player;

      /* ---- vadász ---- */
      let dx = inputX;
      let dy = inputY;
      if (dx === 0 && dy === 0 && target) {
        const tx = target.x - p.x;
        const ty = target.y - p.y;
        const d = Math.hypot(tx, ty);
        if (d <= TARGET_REACHED) target = null;
        else {
          // Lassítás a cél előtt (ne lengjen túl): a sebesség a hátralévő úttal arányos, ha közel van.
          const k = Math.min(1, d / 0.08) / d;
          dx = tx * k;
          dy = ty * k;
        }
      }
      const speed = PLAYER_SPEED * (st.carry ? CARRY_SPEED_FACTOR : 1);
      const blend = 1 - Math.exp(-PLAYER_ACCEL * pdt);
      p.vx += (dx * speed - p.vx) * blend;
      p.vy += (dy * speed - p.vy) * blend;
      p.x = clampX(p.x + p.vx * pdt, p.r);
      p.y = clampY(p.y + p.vy * pdt, p.r);

      /* ---- születés ---- */
      if (st.worldMs >= st.nextSpawnMs) {
        if (freeCount() < MAX_FREE) spawn(st.worldMs <= FIRST_SPAWN_MS + 1);
        st.nextSpawnMs = st.worldMs + spawnEveryMs(st.worldMs, band);
      }

      /* ---- lények ---- */
      // Lemaradás a győzelmi tempótól (0..1): 2 lény hiány = teljes (a világidő a kérdés alatt lassabb — megengedő mérce).
      const behind = Math.min(1, Math.max(0, (CLEAR_CATCHES * Math.min(1, st.worldMs / ROUND_MS) - st.caught) / 2));
      bounds.width = st.arenaW;
      bounds.height = st.arenaH;
      for (const c of st.creatures) {
        if (!c.active) continue;
        if (c.state === "carried") {
          // A küszködő lény a vadász feje fölött.
          c.x = p.x;
          c.y = p.y - p.r - c.r * 0.6;
          c.rotation += 9 * Math.sin(st.worldMs / 70) * dt * 60;
          continue;
        }
        if (c.state === "escaping") {
          c.escapeMs += dtMs;
          c.x += c.ex * 1.6 * dt;
          c.y += c.ey * 1.6 * dt;
          if (c.escapeMs >= ESCAPE_ANIM_MS) c.active = false;
          continue;
        }
        if (age(c) > c.lifeMs) {
          st.missed += 1;
          escape(c, c.x, c.y);
          emit("escape", c.x, c.y, c.id, 0);
          continue;
        }
        // Menekülés: a vadász közelében távolodik; menekülés közben fogy az ereje, kifáradva lassú.
        let fx = 0;
        let fy = 0;
        const ddx = c.x - p.x;
        const ddy = c.y - p.y;
        const d = Math.hypot(ddx, ddy);
        if (!c.dazed && d < FLEE_RADIUS && d > 1e-6) {
          const tired = c.stamina <= 0;
          // KSZ-16: kicsi, nyílt gumiszalag a LEMARADÓNAK (review #485 Ú4, J5a 18.) — ha a ketrecben megtartott lények
          // elmaradnak a győzelmi tempótól, legfeljebb −10% menekülési tempó; előnyben nincs gyorsítás (a jó válasz nem nehezít).
          const rubber = 1 - 0.1 * behind;
          const strength = FLEE_SPEED * tuning.speedScale * rubber * Math.sqrt(1 - d / FLEE_RADIUS) * (tired ? TIRED_FACTOR : 1);
          fx = (ddx / d) * strength;
          fy = (ddy / d) * strength;
          c.stamina = Math.max(0, c.stamina - dtMs);
        } else {
          c.stamina = Math.min(STAMINA_MS, c.stamina + dtMs * STAMINA_REGEN);
        }
        const drift = c.dazed ? 0.3 : 1;
        const vx = c.vx * drift + fx;
        const vy = c.vy * drift + fy;
        // A régi pattogó mozgás (`stepBrainRot`, 60 Hz-re normalizált sebesség) a menekülési komponenssel bővítve.
        moved.x = c.x;
        moved.y = c.y;
        moved.vx = vx / 60;
        moved.vy = vy / 60;
        moved.size = c.r * 2;
        moved.rotation = c.rotation;
        moved.rotSpeed = c.rotSpeed;
        stepBrainRotInPlace(moved, dtMs, bounds);
        // Falnál a SODRÓDÁS pattan vissza; a menekülés komponense a falon nem fordul meg (csúszás a fal mentén).
        if (vx !== 0 && Math.sign(moved.vx) !== Math.sign(vx)) c.vx = -c.vx;
        if (vy !== 0 && Math.sign(moved.vy) !== Math.sign(vy)) c.vy = -c.vy;
        c.x = moved.x;
        c.y = moved.y;
        c.rotation = moved.rotation;
        if (!st.carry && Math.hypot(c.x - p.x, c.y - p.y) < p.r + c.r * CATCH_REACH) catchCreature(c);
      }

      /* ---- segítség: hosszú elkapás nélküli szakasz ---- */
      if (!st.carry) {
        st.sinceCatchMs += dtMs;
        if (st.sinceCatchMs >= ASSIST_MS) dazeNearest();
      }

      /* ---- ketrec-zár ---- */
      if (st.cagesOpen && st.hitCage < 0) {
        st.cageAgeMs += playerDtMs;
        const moving = Math.hypot(p.vx, p.vy) >= CAGE_STOP_SPEED * PLAYER_SPEED * CARRY_SPEED_FACTOR;
        for (let i = 0; i < st.cageCount; i++) {
          const cage = st.cages[i]!;
          const inside = playerInCage(p.x, p.y, cage);
          const wasInside = cage.inside;
          cage.inside = inside;
          if (!cage.armed) {
            // Előjelzés (`CAGE_ARM_MS`), utána élesedik — de csak ha a vadász kint áll; aki bent van, annak ki kell lépnie.
            // Kivétel: a nyitás után ebbe a ketrecbe böködött (szándékos) cél — az élesítéskor rögtön választható.
            if (st.cageAgeMs >= CAGE_ARM_MS) {
              // A „bent áll” itt szigorú (a vadász KÖZEPE a ketrecben): a ketrecek közti keresztezésnél álló vadász a
              // peremével mind a négyet érinti — ettől még élesednek, de a perem-átfedés nem belépés (`wasInside` igaz marad,
              // a válaszhoz ki kell lépni és lendülettel visszajönni).
              const centreIn = Math.abs(p.x - cage.x) <= cage.w / 2 && Math.abs(p.y - cage.y) <= cage.h / 2;
              if (!centreIn) cage.armed = true;
              else if (intent && playerInCage(intent.x, intent.y, cage)) {
                cage.armed = true;
                cage.entered = true;
              }
            }
            continue;
          }
          if (!inside) {
            cage.dwellMs = 0;
            cage.entered = false;
            continue;
          }
          // Belépés éle az élesítés után: csak a lendülettel érkező (szándékos) belépés választhat; a lassú becsúszás
          // (a kérdés megjelenése utáni tehetetlenség) nem — review #485 B1.
          if (!wasInside) cage.entered = moving;
          // A ketrec peremén (kibővített zónájában) már álló vadász SZÁNDÉKKAL is választhat, kilépés nélkül (review #485,
          // Vercel 4597845275 — fal / sarok mellett ki sem tudna lépni): a nyitás után erre a ketrecre böködött cél, vagy az
          // élesítés UTÁN indított joystick-mozdulat a ketrec belseje felé. A tehetetlenség (bemenet nélkül, vagy a nyitáskor
          // már tolt, el nem engedett joystick) továbbra sem belépés.
          if (!cage.entered) {
            const tapped = intent !== null && playerInCage(intent.x, intent.y, cage);
            const stick = stickDown && !stickStale && stickStartAge >= CAGE_ARM_MS && moving && p.vx * (cage.x - p.x) + p.vy * (cage.y - p.y) > 0;
            if (tapped || stick) cage.entered = true;
          }
          if (!cage.entered) {
            cage.dwellMs = 0;
            continue;
          }
          // Beállás a ketrecbe = MEGÁLLÁS benne: a lassú (megálló) vadász ideje gyűlik, és `CAGE_DWELL_MS` folyamatos
          // lassú bent tartózkodás választ. Az átfutás (bármely irányban, egy másik ketrec felé) nem választ, bármilyen
          // hosszan tart is — review #485: a puszta bent töltött időt a széles ketrecen vízszintes átfutás is elérte.
          const slow = Math.hypot(p.vx, p.vy) < CAGE_STOP_SPEED * PLAYER_SPEED * CARRY_SPEED_FACTOR;
          cage.dwellMs = slow ? cage.dwellMs + playerDtMs : 0;
          if (cage.dwellMs >= CAGE_DWELL_MS) {
            st.hitCage = i;
            st.cagesOpen = false;
            emit("cageHit", cage.x, cage.y, st.carry?.id ?? -1, i);
            break;
          }
        }
      }
    },
    canCatch: () => st.phase === "play" && st.carry === null,
    openCages(count, questionId) {
      if (!st.carry) core.forceCatch();
      st.cageCount = Math.min(4, Math.max(2, count));
      // A vadász megáll: a böködés célja, a bemenet és a lendület törlődik (a gyerek új irányítása mozdítja) — review #485 B1.
      target = null;
      intent = null;
      // Ú1: a már lenyomott ujj húzása elengedtetett — új lenyomásig nem ad célt.
      staleDrag = true;
      // A nyitáskor már tolt joystick tehetetlenség: elengedésig nem szándék.
      stickStale = stickDown;
      stickStartAge = -1;
      inputX = 0;
      inputY = 0;
      st.player.vx = 0;
      st.player.vy = 0;
      st.cageAgeMs = 0;
      relayoutCages();
      st.cagesOpen = true;
      st.cageQuestionId = questionId;
      st.hitCage = -1;
      if (st.carry) st.carry.mode = "question";
    },
    applyOutcome(result, pickedOption) {
      st.cagesOpen = false;
      st.hitCage = -1;
      // A ketrecek zárva: a lent tartott ujj húzása újra vadászhat (nincs mibe válaszolni).
      staleDrag = false;
      const carry = st.carry;
      st.carry = null;
      st.sinceCatchMs = 0;
      const c = carry ? findCreature(carry.id) : null;
      // Önellenőrzés (e): lezárt menetben vagy vitt lény nélkül egy késői kimenet sem ír a magba — a győzelem / vereség a
      // menet végén rögzül, utólag nem fordulhat át.
      if (st.phase !== "play" || !carry) return;
      if (result === "aborted") {
        // Megszakítva (menet vége, kilépés, kupon): a lény szabadon marad, büntetés nincs.
        if (c) {
          c.state = "free";
          c.stamina = STAMINA_MS;
        }
        return;
      }
      if (result === "correct") {
        st.combo = comboCorrect(st.combo);
        st.caught += 1;
        const xp = BRAIN_ROT_KINDS[c?.kind ?? 0]!.xp;
        const gain = xp * st.combo.multiplier;
        st.score += gain;
        const cage = pickedOption !== null && pickedOption >= 0 && pickedOption < st.cageCount ? st.cages[pickedOption]! : null;
        const x = cage?.x ?? st.player.x;
        const y = cage?.y ?? st.player.y;
        if (c) c.active = false;
        emit("kept", x, y, c?.id ?? -1, gain);
        return;
      }
      // Rossz ketrec / lejárt idő: a lény elszökik (J5b-től a rivális kapja).
      st.combo = comboBreak(st.combo);
      st.lost += 1;
      const cage = pickedOption !== null && pickedOption >= 0 && pickedOption < st.cageCount ? st.cages[pickedOption]! : null;
      const x = cage?.x ?? st.player.x;
      const y = cage?.y ?? st.player.y;
      if (c) escape(c, x, y);
      emit("lost", x, y, c?.id ?? -1, 0);
    },
    takeCageHit() {
      const i = st.hitCage;
      st.hitCage = -1;
      return i;
    },
    keepDirect() {
      const carry = st.carry;
      if (!carry) return;
      st.carry = null;
      st.sinceCatchMs = 0;
      const c = findCreature(carry.id);
      const xp = BRAIN_ROT_KINDS[c?.kind ?? 0]!.xp;
      // Pont igen, győzelem / pályanyitás nem (végrehajtás J5a 13.): a `caught` csak a ketrecben megtartott lény.
      st.direct += 1;
      st.score += xp;
      if (c) c.active = false;
      emit("direct", st.player.x, st.player.y, carry.id, xp);
    },
    markCarry(mode, askSince) {
      if (!st.carry) return;
      st.carry.mode = mode;
      if (askSince !== undefined) st.carry.askSince = askSince;
    },
    forceCatch() {
      if (st.carry || st.phase !== "play") return;
      const c = spawn(true);
      if (!c) return;
      c.x = st.player.x;
      c.y = st.player.y;
      catchCreature(c);
    },
    end() {
      if (st.phase !== "play") return;
      st.phase = "over";
      st.cagesOpen = false;
      st.carry = null;
    },
    won: () => st.caught >= CLEAR_CATCHES,
    wonCount: () => st.caught,
    drainEvents(fn) {
      while (evCount > 0) {
        const e = events[evHead]!;
        evHead = (evHead + 1) % EVENT_CAP;
        evCount -= 1;
        fn(e);
      }
    },
    hash() {
      const r = (v: number) => Math.round(v * 1e6);
      const parts: (string | number)[] = [st.phase, r(st.worldMs), r(st.player.x), r(st.player.y), st.caught, st.direct, st.missed, st.lost, st.score, st.combo.best];
      for (const c of st.creatures) if (c.active) parts.push(c.id, c.state, r(c.x), r(c.y));
      return parts.join("|");
    },
  };
  return core;
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* A menet meghajtója: a lap ÉS a node-szimuláció ugyanezt hívja (K.6, C-52)                                            */
/* ------------------------------------------------------------------------------------------------------------------ */

/** Elkapáskor rövid hitstop (valós ms; a hurok `holdFor`-ja a lépéseket tolja el, a tartalmukat nem). */
export const HITSTOP_CATCH_MS = 50;

/** A kérdés-sáv állapotgépének az a része, amit a meghajtó használ (`createQuestionUi` / `usePlayQuestion` adja). */
export type BrainRotQuestionUi = {
  frame(clockMs: number, ctx: { calm: boolean; tick?: boolean }): void;
  timeScale(): number;
  finished(): boolean;
  finish(): unknown;
  request(reason: "trigger", clockMs: number): QuestionPresentation | null;
  abort(): unknown;
  canAsk(): boolean;
  active(): QuestionPresentation | null;
  pick(optionIndex: number, clockMs?: number): unknown;
};

export type BrainRotDriver = {
  core: BrainRotCore;
  loop: FixedLoop;
  feel: Feel;
  pace: IntensityDirector;
  /**
   * Egy képkocka: `realDtMs` a valós eltelt idő. Sorrend (mindkét úton azonos): kérdés-óra (szünetben áll) → az óra lejárta
   * (menet vége) → a kérdés lezárása → a kérdés-sáv képkockája (ütemezett kérdés nincs: `tick: false`) → időskála (szünet 0,
   * nyitott kérdés `slowMo`) → fix lépésű hurok → elkapás / ketrec feldolgozása → események. Visszaadja az alphát.
   */
  frame(realDtMs: number, paused: boolean, onEvent?: (e: BrainRotEvent) => void): number;
  /** A vitt lényhez kérdés kérése azonnal (teszt-kampó, koppintás után) — ugyanazzal a szabállyal, mint a képkockában. */
  resolve(): void;
  drain(onEvent?: (e: BrainRotEvent) => void): void;
  /** A lassítatlan kérdés-óra (ms; szünetben áll) — a director / kérdés-sáv `simNowMs`-e és a 90 mp-es óra. */
  clockMs(): number;
  /** A hátralévő menetidő ms-ban (a kérdés alatt is fogy). */
  remainingMs(): number;
};

/**
 * A menet egyetlen meghajtója: a lap (rAF) és a sim (`sim.ts`) bitre ugyanazt a lépéssort futtatja ugyanazon képkocka-időkkel
 * (J0a determinizmus-szabály; `T/brainrot-core.test.ts` „meghajtó”). A kérdés-sáv kimenetét a hívó köti a maghoz
 * (`core.applyOutcome`), a megjelenést `core.openCages`-szel (a lap a `usePlayQuestion` `onShow` / `onOutcome`-jában).
 */
export function createBrainRotDriver(opts: {
  seed: number | string;
  questions: BrainRotQuestionUi | null;
  /** A nehézség-sáv (a spawn-tempóhoz); a lap a meglévő adaptív sávot adja, a sim a directorét. */
  band: () => number;
  tuning?: BrainRotTuning;
  arenaW?: number;
  arenaH?: number;
  reducedMotion?: boolean;
  /**
   * D5-módosítás (tulajdonosi döntés 2026-11-18, „Csak a többletidőre álljon”): egy nyitott kérdés ennyi menet-időt fogyaszt
   * az óra indulásától (`startedAtSimMs`, az előjelzés után) — a régi ablakot; az előjelzés alatt és a hosszabbítás idejére a
   * menet-óra áll. Hiányában a kérdés egész ideje alatt áll.
   */
  questionRoundMs?: (p: QuestionPresentation) => number;
}): BrainRotDriver {
  const core = createBrainRotCore({ seed: opts.seed, tuning: opts.tuning, arenaW: opts.arenaW, arenaH: opts.arenaH, directCatch: opts.questions === null });
  const pace = createIntensityDirector();
  const loop = createFixedLoop((dt) => {
    core.step(dt, opts.band(), loop.timeScale());
    pace.update(dt / 1000);
  });
  // A rázás-zaj kozmetikai (KSZ-2: külön fxRng); a hitstop determinisztikus (a hurok tartása).
  const feel = createFeel({ reducedMotion: opts.reducedMotion ?? false, loop, fxRng: createRng(seedFrom(BRAIN_ROT_GAME_ID, opts.seed, "fx")).next });
  let clock = 0;
  /** A menet órája (D5): nyitott kérdés és szünet alatt áll. */
  let roundClock = 0;
  let real = 0;

  // KSZ-5: az ürítő függvény egyszer jön létre; a képkockánkénti visszahívás egy változóba kerül (nincs új closure).
  let sink: ((e: BrainRotEvent) => void) | undefined;
  const handle = (e: BrainRotEvent) => {
    if (e.type === "catch") feel.hitstop(HITSTOP_CATCH_MS);
    if (e.type === "lost") pace.signal("wrong");
    sink?.(e);
  };
  const drain = (onEvent?: (e: BrainRotEvent) => void) => {
    sink = onEvent;
    core.drainEvents(handle);
    sink = undefined;
  };

  /** Ketrec-találat → válasz; vitt lény kérdés nélkül → kérés (vagy közvetlen megtartás, ha nincs kérdés). */
  const resolve = () => {
    const q = opts.questions;
    const st = core.state();
    const hit = core.takeCageHit();
    if (hit >= 0 && q?.active()) q.pick(hit, clock);
    const carry = st.carry;
    if (!carry || carry.mode !== "waiting" || st.phase !== "play") return;
    if (!q) {
      core.keepDirect();
      return;
    }
    if (q.active()) return; // a kérdés már nyitva (a megjelenés nyitja a ketreceket)
    if (q.canAsk()) {
      const p = q.request("trigger", clock);
      if (p) return; // `onShow` → `openCages`
      // A director most nem ad kérdést (minGap, vagy kifogyott forrás): rövid várakozás, utána közvetlen megtartás.
      if (carry.askSince < 0) core.markCarry("waiting", clock);
      else if (clock - carry.askSince >= CARRY_RESOLVE_MS) {
        q.abort(); // a függő kérés is törlődik (nyitott kérdés és kijelzés ilyenkor nincs)
        core.keepDirect();
      }
      return;
    }
    // Megoldás-kijelzés alatt: a kérés várakozik, a kijelzés végén nyílik (a lény addig küszködik).
    q.request("trigger", clock);
  };

  return {
    core,
    loop,
    feel,
    pace,
    frame(realDtMs, paused, onEvent) {
      const dt = Number.isFinite(realDtMs) && realDtMs > 0 ? realDtMs : 0;
      real += dt;
      const q = opts.questions;
      if (!paused) {
        clock += dt;
        // D5 + módosítás: kérdés nélkül a menet-óra jár; nyitott kérdésnél csak az óra indulása (az előjelzés vége) és a régi
        // ablak vége közti szakaszban — az előjelzés és a hosszabbítás alatt áll. A menet vége nem esik nyitott kérdésre.
        const open = q ? q.active() : null;
        if (!open) roundClock += dt;
        else {
          const from = open.startedAtSimMs;
          const to = from + Math.max(0, opts.questionRoundMs ? opts.questionRoundMs(open) : 0);
          roundClock += Math.max(0, Math.min(clock, to) - Math.max(clock - dt, from));
        }
      }
      feel.update(paused ? 0 : dt);
      if (core.running() && roundClock >= ROUND_MS && !(q && q.active())) core.end();
      if (q && !core.running() && !q.finished()) q.finish();
      if (q && !paused) q.frame(clock, { calm: true, tick: false });
      loop.setTimeScale(paused ? 0 : q ? q.timeScale() : 1);
      const alpha = loop.frame(real);
      if (!paused) resolve();
      drain(onEvent);
      return alpha;
    },
    resolve,
    drain,
    clockMs: () => clock,
    remainingMs: () => Math.max(0, ROUND_MS - roundClock),
  };
}
