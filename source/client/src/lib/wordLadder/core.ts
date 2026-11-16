/**
 * Szólétra → „Szikla-verseny” — a játék tiszta, determinisztikus magja (terv docs/specs/2026-11-16-jatekok-jatekelmeny.md
 * 5.2; végrehajtás J2a 2. lépés, K.6, KSZ-1/2/4/15/16).
 *
 * A gyerek egy sziklafalon mászik egy gépi RIVÁLIS ellen. A mászás maga a válasz: a helyes szót viselő fogás megragadása
 * felvisz (kombó ×2-től kettőt), a rossz fogás megcsúszás (−1 fok + rövid kábulat, nem menetvég). Győzelem: a zászló
 * (`targetRung`) elérése a rivális előtt; vereség: a rivális ér fel előbb. Kérdés nélkül (üres kérdésforrás — terv 8.1 —
 * és a szimuláció `questions: false` módja) „szabad fogás” van: ügyesség, kombó nélkül.
 *
 * Réteg (KSZ-1): ez a modul nem hív hangot, DOM-ot, three.js-t, Reactot, órát vagy `Math.random`-ot (őr:
 * `T/game-sim-determinism-guard.test.ts`). Az állapotot a hívó tartja; a függvények azt módosítják, és eseményeket
 * gyűjtenek (`drainEvents`), amelyekből a nézet (3D jelenet, hang, részecskék) dolgozik. Egyetlen seedelt RNG
 * (`createRng`, a hívó adja) dönt a rivális tempó-ingadozásáról — azonos seed + lépésenkénti bemenet → azonos állapot
 * (ez kell az online párbajhoz, JM4b).
 *
 * J2b ráépül: `rocks` (hulló kövek), `ropeCharges` (kötél-turbó), a Szélsas főellenfél a `phase` mellé — a mezők már itt
 * vannak, a J2a nem tölti őket.
 */
import { comboBreak, comboCorrect, createCombo, type ComboState } from "../../game-engine/play/combo";

/** A rivális tempó-ingadozásához elég a seedelt RNG `next`-je (`createRng(seed)` vagy bármely [0, 1) forrás). */
export type LadderRandom = { next(): number };

export type LadderPhase = "play" | "won" | "lost";
/** A kérdés kimenete a mag szemszögéből (a director `QuestionResult`-jából; „aborted” nem jut ide). */
export type LadderAnswer = "correct" | "wrong" | "timeout";

/** J2b: hulló kő (oszlop 0 / 1, magasság fokban). A J2a nem hoz létre követ. */
export type LadderRock = { column: 0 | 1; y: number; warnMs: number; alive: boolean };

export type LadderEvent =
  | { kind: "climb"; from: number; to: number; gain: number; combo: number; free: boolean }
  | { kind: "slip"; from: number; to: number }
  | { kind: "fumble"; reason: "timeout" | "free-miss" }
  | { kind: "rival-climb"; to: number }
  | { kind: "overtake"; by: "player" | "rival" }
  | { kind: "won"; lead: number }
  | { kind: "lost"; missing: number };

export type LadderRival = {
  /** Folytonos magasság fokban (0 … targetRung). A kijelzett fok: `rung`. */
  pos: number;
  rung: number;
  /** Fokonként újrasorsolt tempó-szorzó (élénkebb, „emberi” mászás); seedelt. */
  tempo: number;
};

export type LadderState = {
  timeMs: number;
  rung: number;
  targetRung: number;
  rival: LadderRival;
  /** A rivális alaptempója fok / mp-ben (a pályából: `rivalBaseRungPerSec`). */
  baseRungPerSec: number;
  /** Megcsúszás utáni kábulat: amíg > 0, szabad fogás nem sikerülhet. */
  stunMs: number;
  /** J2b kötél-turbó. */
  ropeCharges: number;
  /** J2b hulló kövek. */
  rocks: LadderRock[];
  combo: ComboState;
  phase: LadderPhase;
  /** Ki vezet most (a fokok szerint): a nézet és a hang előzés-eseményeihez. */
  leader: "player" | "rival" | "tie";
  climbs: number;
  slips: number;
  /** A legutóbbi `drainEvents` óta történtek. */
  events: LadderEvent[];
};

/** A lépés-animáció hossza (terv 5.2, végrehajtás J2a: a 900 + 620 ms-os kötelező lánc helyett 250 ms). */
export const CLIMB_STEP_MS = 250;
/** Megcsúszás után ennyi ideig nincs fogás (végrehajtás J2a 2.: `stunMs = 600`). */
export const SLIP_STUN_MS = 600;
/**
 * Gumiszalag (KSZ-16: legfeljebb ±10%, kicsi és nyílt). A végrehajtás J2a 2. képlete 0,15-öt ír; a K.5 kötelező
 * kódszabálya a szigorúbb, az érvényes. Ha a játékos vezet, a rivális legfeljebb 10%-kal gyorsabb; ha lemarad, lassabb.
 */
export const RUBBER_BAND = 0.1;
/** A gumiszalag ennyi fok különbségnél éri el a teljes hatását. */
export const RUBBER_BAND_RUNGS = 4;
/** Az első 30 mp tanító szakasz (K.4/25): a rivális lassabban indul, és ezalatt nem érhet fel. */
export const RIVAL_WARMUP_MS = 30_000;
const RIVAL_WARMUP_START = 0.55;
/**
 * A rivális egy fokra jutó ideje (mp) az alaptempón. A szimulációs mérés (T/word-ladder-sim.test.ts) erre hangolja,
 * hogy az átlagos játékos (SIM_AVERAGE) a menetek ~60–70%-át nyerje, és a menet 2–5 perc legyen.
 */
export const RIVAL_SEC_PER_RUNG = 6.3;
/** Pályánként ennyivel gyorsabb a rivális (mp / fok): a hosszabb falon az előny különben felhalmozódna. */
export const RIVAL_LEVEL_SPEEDUP = 0.1;
/** Áramlat (terv 4.1/6): a rivális tempója a játék-intenzitással 0,9–1,1 között mozog (erős játékosnál gyorsabb). */
const FLOW_MIN = 0.9;
const FLOW_SPAN = 0.2;
/** A tempó-ingadozás sávja fokonként. */
const TEMPO_MIN = 0.85;
const TEMPO_SPAN = 0.3;
/** Az első kapaszkodó-választás ideje (terv 5.2 „0–10 mp”: 2 mp-nél) — előtte a gyerek a falat és a riválist látja. */
export const FIRST_HOLD_MS = 1500;
/** Szabad fogás (kérdés nélkül): ennyi idő után kínál új fogást a fal. */
export const FREE_GRIP_COOLDOWN_MS = 4200;

/**
 * A fal magassága (fok) a pálya régi létrahosszából (`ladderRungsForLevel`, 8–20). A régi hossz a kombó-lépés (+2) és a
 * riválisos verseny mellett 1–1,5 perces menetet adna; a terv 6.2 „Szimulációs paraméterek” szerint a pályahosszakat a
 * szelet a SIM_AVERAGE mediánjára hangolja (J9: 2–5 perc) — így 24 (1. pálya) … 42 fok (10. pálya). A régi függvény
 * megmarad (a tiszta tesztjei változatlanok).
 */
export function climbTarget(ladderRungs: number): number {
  const base = Number.isFinite(ladderRungs) ? Math.max(1, ladderRungs) : 8;
  return Math.round(1.5 * base + 12);
}

function safeLevel(level: number): number {
  return Number.isFinite(level) ? Math.min(10, Math.max(1, Math.round(level))) : 1;
}

/** A rivális egy fokra jutó ideje (mp) a pályán. */
export function rivalSecPerRungForLevel(level: number): number {
  return RIVAL_SEC_PER_RUNG - RIVAL_LEVEL_SPEEDUP * (safeLevel(level) - 1);
}

/** A rivális alaptempója (fok / mp). */
export function rivalBaseRungPerSec(secPerRung = RIVAL_SEC_PER_RUNG): number {
  return 1 / Math.max(0.5, secPerRung);
}

export function createLadderState(opts: { targetRung: number; startRung?: number; baseRungPerSec?: number }): LadderState {
  const target = Math.max(1, Math.round(opts.targetRung));
  const start = Math.max(0, Math.min(target - 1, Math.round(opts.startRung ?? 0)));
  return {
    timeMs: 0,
    rung: start,
    targetRung: target,
    rival: { pos: 0, rung: 0, tempo: 1 },
    baseRungPerSec: opts.baseRungPerSec ?? rivalBaseRungPerSec(),
    stunMs: 0,
    ropeCharges: 0,
    rocks: [],
    combo: createCombo(),
    phase: "play",
    leader: start > 0 ? "player" : "tie",
    climbs: 0,
    slips: 0,
    events: [],
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** A rivális pillanatnyi tempója (fok / mp) — a gumiszalag, az áramlat és a tanító szakasz szorzójával. */
export function rivalSpeed(state: LadderState, intensity: number): number {
  const lead = clamp((state.rung - state.rival.pos) / RUBBER_BAND_RUNGS, -1, 1);
  const rubber = 1 + RUBBER_BAND * lead;
  const flow = FLOW_MIN + FLOW_SPAN * (Number.isFinite(intensity) ? clamp(intensity, 0, 1) : 0.5);
  const warm = state.timeMs >= RIVAL_WARMUP_MS ? 1 : RIVAL_WARMUP_START + (1 - RIVAL_WARMUP_START) * (state.timeMs / RIVAL_WARMUP_MS);
  return state.baseRungPerSec * rubber * flow * warm * state.rival.tempo;
}

function updateLeader(state: LadderState): void {
  const next = state.rung > state.rival.rung ? "player" : state.rung < state.rival.rung ? "rival" : "tie";
  if (next !== state.leader) {
    if (next === "player" && state.leader !== "player" && state.rival.rung > 0) state.events.push({ kind: "overtake", by: "player" });
    if (next === "rival" && state.leader !== "rival") state.events.push({ kind: "overtake", by: "rival" });
    state.leader = next;
  }
}

function checkWin(state: LadderState): void {
  if (state.phase !== "play" || state.rung < state.targetRung) return;
  state.phase = "won";
  state.events.push({ kind: "won", lead: Math.max(0, state.targetRung - state.rival.rung) });
}

/**
 * Egy szimulációs lépés (fix 1/60 s a hívótól; KSZ-4). A rivális mászik, a kábulat fogy. `intensity` a director
 * áramlat-kimenete (0..1). A hívó a szünetben nem hívja.
 */
export function step(state: LadderState, dtMs: number, intensity: number, rng: LadderRandom): void {
  if (state.phase !== "play" || !(dtMs > 0)) return;
  state.timeMs += dtMs;
  state.stunMs = Math.max(0, state.stunMs - dtMs);
  const r = state.rival;
  // A tanító szakaszban (első 30 mp) a rivális nem érhet fel (K.4/25: halál nélkül).
  const cap = state.timeMs < RIVAL_WARMUP_MS ? state.targetRung - 1 : state.targetRung;
  r.pos = Math.min(cap, r.pos + (rivalSpeed(state, intensity) * dtMs) / 1000);
  const shown = Math.floor(r.pos + 1e-9);
  if (shown !== r.rung) {
    r.rung = shown;
    r.tempo = TEMPO_MIN + TEMPO_SPAN * rng.next();
    state.events.push({ kind: "rival-climb", to: shown });
    updateLeader(state);
  }
  if (r.pos >= state.targetRung) {
    state.phase = "lost";
    state.events.push({ kind: "lost", missing: Math.max(1, state.targetRung - state.rung) });
  }
}

/**
 * Egy szó-kapaszkodó kimenete (végrehajtás J2a 2.): jó → +1 fok (kombó ×2-től +2) és lendület; rossz → a fogás letörik,
 * −1 fok (0 alatt 0) és `SLIP_STUN_MS` kábulat, a kombó nullázódik; lejárt idő → a kombó nullázódik, fok nem vész el
 * (a gyerek habozott, nem tévedett — a rivális előnye már az elveszett idő). Visszaadja a fok-változást.
 */
export function answer(state: LadderState, result: LadderAnswer): number {
  if (state.phase !== "play") return 0;
  const from = state.rung;
  if (result === "correct") {
    state.combo = comboCorrect(state.combo);
    const gain = state.combo.multiplier >= 2 ? 2 : 1;
    state.rung = Math.min(state.targetRung, state.rung + gain);
    state.climbs += 1;
    state.events.push({ kind: "climb", from, to: state.rung, gain: state.rung - from, combo: state.combo.count, free: false });
    updateLeader(state);
    checkWin(state);
    return state.rung - from;
  }
  state.combo = comboBreak(state.combo);
  if (result === "timeout") {
    state.events.push({ kind: "fumble", reason: "timeout" });
    return 0;
  }
  state.rung = Math.max(0, state.rung - 1);
  state.stunMs = SLIP_STUN_MS;
  state.slips += 1;
  state.events.push({ kind: "slip", from, to: state.rung });
  updateLeader(state);
  return state.rung - from;
}

/**
 * Szabad fogás (nincs kérdés: üres forrás vagy `questions: false`): ügyesség. Siker → +1 fok (a kombó nem nő); kudarc →
 * rövid kábulat, fok nem vész. Kábulat alatt nem sikerülhet. Visszaadja a fok-változást.
 */
export function freeGrab(state: LadderState, success: boolean): number {
  if (state.phase !== "play") return 0;
  if (state.stunMs > 0 || !success) {
    if (state.stunMs <= 0) state.stunMs = SLIP_STUN_MS;
    state.events.push({ kind: "fumble", reason: "free-miss" });
    return 0;
  }
  const from = state.rung;
  state.rung = Math.min(state.targetRung, state.rung + 1);
  state.climbs += 1;
  state.events.push({ kind: "climb", from, to: state.rung, gain: state.rung - from, combo: state.combo.count, free: true });
  updateLeader(state);
  checkWin(state);
  return state.rung - from;
}

/** Az összegyűlt események átadása a nézetnek (a tömb kiürül). */
export function drainEvents(state: LadderState): LadderEvent[] {
  if (state.events.length === 0) return EMPTY;
  const out = state.events;
  state.events = [];
  return out;
}
const EMPTY: LadderEvent[] = [];

/** A rivális-távolság a HUD-hoz: pozitív = a játékos vezet (fokban, egy tizedesre kerekítve). */
export function leadRungs(state: LadderState): number {
  return Math.round((state.rung - state.rival.pos) * 10) / 10;
}

/** Győzelmi jutalom (determinisztikus, teljesítményhez kötött — terv 4.2): 50 XP + 10 XP a rivális mögött hagyott fokonként. */
export function finishBonusXp(state: LadderState): number {
  if (state.phase !== "won") return 0;
  return 50 + 10 * Math.max(0, state.targetRung - state.rival.rung);
}

/** Az eredményképernyő vereség-címe (terv 5.2: „Majdnem! 2 fok hiányzott.”). */
export function lossTitle(missing: number): string {
  const n = Math.max(1, Math.round(missing));
  return `Majdnem! ${n} fok hiányzott.`;
}

/** Az állapot rövid, stabil lenyomata (arany visszajátszás, párbaj-összevetés). */
export function stateFingerprint(state: LadderState): string {
  return [
    state.phase,
    Math.round(state.timeMs),
    state.rung,
    state.rival.rung,
    state.rival.pos.toFixed(6),
    state.combo.count,
    state.combo.best,
    state.climbs,
    state.slips,
  ].join("|");
}
