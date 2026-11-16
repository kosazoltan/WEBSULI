/**
 * JM1 — Párbaj aréna: két játékos, egy telefon / tablet, osztott képernyő (terv 10.5, 10.7; végrehajtás JM1 4. lépés).
 *
 * A szabályt és az időzítést a tiszta motor dönti el (`@shared/duel`: `rules` + `questions` + `match`); ez a lap csak
 * megjelenít, mér (a meccs-óra a szünetben áll) és bemenetet ad. Álló nézetben a felső térfél 180°-kal elforgatva (asztalra
 * tett telefon, szemben ülők; kikapcsolható), fekvőben a két térfél egymás mellett. Mindkét térfélnek saját válaszcéljai
 * (≥ 56 px), életerő-sávja és időjelzője van; a két kéz egyidejű koppintása `pointerId` szerint külön fut (KSZ-14).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, Dices, Pause, Swords, Trophy } from "lucide-react";

import AudioToggleButton from "@/components/AudioToggleButton";
import type { GradeSubject } from "@/data/gradeQuizBank/types";
import { isGradeBankLoaded, loadGradeBank, loadedGradeItems } from "@/data/gradeQuizBank/loader";
import { loadVocabBank } from "@/data/vocabBank/loader";
import type { VocabLang } from "@/data/vocabBank/types";
import { correctDataAttrs, installGameTestApi, readGameSeed, GAME_TEST_HOOKS_ENABLED } from "@/game-engine/game-test-hooks";
import { GameShell, PauseMenu, StartScreen, useHaptics, useOrientation, type GameScreenState } from "@/game-engine/mobile";
import { createFeel, windowMsFor, type Feel, type ShakeOffset } from "@/game-engine/play";
import { useReducedMotion } from "@/game-engine/useReducedMotion";
import { createSeenHistory, createVocabSource, vocabLevelForGrade, type VocabSource } from "@/game-engine/vocab";
import { beep, sfxClick, sfxHit, sfxLevelUp, sfxSuccess, sfxWarning } from "@/lib/audioEngine";
import { loadClassroomGrade } from "@/lib/classroomStore";
import { createRng, seedFrom } from "@shared/game-rng";
import { guestNickname } from "@shared/nicknames";
import {
  DUEL_HP,
  DUEL_ROUNDS,
  accuracyOf,
  buildRoundQuestion,
  createMatch,
  fitsDuelScreen,
  markDuelQuestionUsed,
  playerDeadlineMs,
  reduceMatch,
  toDuelQuestion,
  type DuelQuestion,
  type MatchConfig,
  type MatchEffect,
  type MatchState,
  type MatchTiming,
} from "@shared/duel";

// ---------------------------------------------------------------------------------------------------------------------
// Beállítások

type SeatId = "p1" | "p2";
const SEATS: readonly SeatId[] = ["p1", "p2"];
type Seat = { id: SeatId; name: string; grade: number; generated: boolean };

type SourceId = "mixed" | GradeSubject | "vocab-en" | "vocab-de" | "vocab-fr";
const SOURCES: ReadonlyArray<{ id: SourceId; label: string }> = [
  { id: "mixed", label: "Vegyes" },
  { id: "math", label: "Matek" },
  { id: "hungarian", label: "Magyar" },
  { id: "english", label: "Angol" },
  { id: "science", label: "Természet" },
  { id: "history", label: "Történelem" },
  { id: "vocab-en", label: "Angol szavak" },
  { id: "vocab-de", label: "Német szavak" },
  { id: "vocab-fr", label: "Francia szavak" },
];

type BandId = "easy" | "normal" | "hard";
const BANDS: ReadonlyArray<{ id: BandId; label: string; band: number }> = [
  { id: "easy", label: "Könnyű", band: 0.25 },
  { id: "normal", label: "Közepes", band: 0.55 },
  { id: "hard", label: "Nehéz", band: 0.85 },
];

const GRADES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
/** A párbaj alap-válaszablaka (a J0b `windowMsFor` bemenete; 3–4. évfolyamon ×1,25, mindig ≤ 9 s). */
export const DUEL_BASE_WINDOW_MS = 6000;
const SETUP_KEY = "websuli.duelSetup.v1";
const RECORD_KEY = "websuli.duelRecord.v1";

type Setup = { seats: Record<SeatId, Seat>; source: SourceId; band: BandId; facing: boolean };

function defaultName(id: SeatId): string {
  return id === "p1" ? "1. játékos" : "2. játékos";
}

function clampGrade(g: unknown): number {
  const n = typeof g === "number" ? g : Number(g);
  return Number.isInteger(n) && n >= 3 && n <= 12 ? n : 4;
}

function loadSetup(): Setup {
  const base = clampGrade(loadClassroomGrade());
  const fallback: Setup = {
    seats: { p1: { id: "p1", name: defaultName("p1"), grade: base, generated: false }, p2: { id: "p2", name: defaultName("p2"), grade: base, generated: false } },
    source: "mixed",
    band: "normal",
    facing: true,
  };
  try {
    const raw = window.localStorage.getItem(SETUP_KEY);
    if (!raw) return fallback;
    const p = JSON.parse(raw) as Partial<Setup>;
    const seat = (id: SeatId): Seat => {
      const s = p.seats?.[id];
      // Csak generált becenév vagy az alapfelirat tárolható (valódi nevet nem kérünk és nem tárolunk).
      const name = s && s.generated && typeof s.name === "string" && s.name.length <= 20 ? s.name : defaultName(id);
      return { id, name, grade: clampGrade(s?.grade ?? base), generated: name !== defaultName(id) };
    };
    return {
      seats: { p1: seat("p1"), p2: seat("p2") },
      source: SOURCES.some((s) => s.id === p.source) ? (p.source as SourceId) : "mixed",
      band: BANDS.some((b) => b.id === p.band) ? (p.band as BandId) : "normal",
      facing: typeof p.facing === "boolean" ? p.facing : true,
    };
  } catch {
    return fallback;
  }
}

function saveSetup(s: Setup): void {
  try {
    window.localStorage.setItem(SETUP_KEY, JSON.stringify(s));
  } catch {
    /* tároló nélkül is megy */
  }
}

type DuelRecord = { p1: number; p2: number; co: number };

function loadRecord(): DuelRecord {
  try {
    const p = JSON.parse(window.localStorage.getItem(RECORD_KEY) ?? "null") as Partial<DuelRecord> | null;
    const n = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);
    return { p1: n(p?.p1), p2: n(p?.p2), co: n(p?.co) };
  } catch {
    return { p1: 0, p2: 0, co: 0 };
  }
}

function saveRecord(r: DuelRecord): void {
  try {
    window.localStorage.setItem(RECORD_KEY, JSON.stringify(r));
  } catch {
    /* tároló nélkül is megy */
  }
}

/** Kozmetikai / seed-véletlen a lapon (nem a szimulációban): kriptográfiai forrásból, ha van. */
function freshSeed(): number {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0]!;
  } catch {
    return Math.floor(performance.now() * 1000) >>> 0;
  }
}

const fmt1 = (n: number) => n.toLocaleString("hu-HU", { maximumFractionDigits: 1 });
const fmtSec = (ms: number) => `${(ms / 1000).toLocaleString("hu-HU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} mp`;

// ---------------------------------------------------------------------------------------------------------------------
// Kérdés-szolgáltató (determinisztikus: seed + kör + évfolyam; azonos évfolyam → azonos kérdés)

type ForcedQuestionWindow = Window & { __duelForceQuestion?: { prompt: string; options: string[]; correctIndex: number; explanation?: string } };

function makeProvider(args: {
  seed: string;
  setup: Setup;
  usedByGrade: Map<number, Set<string>>;
  vocab: VocabSource | null;
}): MatchConfig["provider"] {
  const band = BANDS.find((b) => b.id === args.setup.band)!.band;
  const cache = new Map<string, DuelQuestion | null>();
  const subjects = args.setup.source === "mixed" || args.setup.source.startsWith("vocab-") ? undefined : [args.setup.source];
  const rule = (prompt: string, grade: number) => windowMsFor(prompt, grade, DUEL_BASE_WINDOW_MS);
  const fromBank = (round: number, grade: number): DuelQuestion | null => {
    let used = args.usedByGrade.get(grade);
    if (!used) args.usedByGrade.set(grade, (used = new Set()));
    // JBb: az évfolyam-bank évfolyamonként lusta; a `startMatch` a meccs előtt betölti a szükséges évfolyamokat.
    const build = () => buildRoundQuestion({ seed: args.seed, round, grade, band, subjects, used: used!, items: loadedGradeItems(), windowMs: rule });
    let q = build();
    if (!q) {
      // Hosszú visszavágó-sorozat: a bank elfogyott → elölről (a meccsen belül így sincs ismétlés, mert a used friss).
      used.clear();
      q = build();
    }
    if (q) markDuelQuestionUsed(used, q);
    return q;
  };
  return (round, player) => {
    const key = `${round}:${player.grade}`;
    if (cache.has(key)) return cache.get(key)!;
    let q: DuelQuestion | null = null;
    // Teszt-kampó (csak VITE_ENABLE_GAME_TEST_HOOKS=1): a leghosszabb bank-tétellel mérjük, hogy semmi nem lóg ki.
    const forced = GAME_TEST_HOOKS_ENABLED ? (window as ForcedQuestionWindow).__duelForceQuestion : undefined;
    if (forced) {
      q = toDuelQuestion({ ...forced, key: `t:${round}` }, { grade: player.grade, orderSeed: `t:${round}`, windowMs: rule(forced.prompt, player.grade) });
      cache.set(key, q);
      return q;
    }
    if (args.vocab) {
      let quiz = args.vocab.next(vocabLevelForGrade(player.grade, band));
      // Hossz-őr (review #447): a túl hosszú szóbank-kérdés helyett a következő (legfeljebb 3 próba).
      for (let i = 0; i < 3 && quiz && !fitsDuelScreen(quiz); i++) quiz = args.vocab.next(vocabLevelForGrade(player.grade, band));
      if (quiz && !fitsDuelScreen(quiz)) quiz = null;
      if (quiz) {
        q = toDuelQuestion(
          { key: `v:${quiz.vocabId}`, prompt: quiz.prompt, options: quiz.options, correctIndex: quiz.correctIndex, explanation: quiz.explanation },
          { grade: player.grade, orderSeed: seedFrom("duel-o", args.seed, round, quiz.vocabId), windowMs: rule(quiz.prompt, player.grade) },
        );
      }
    }
    if (!q) q = fromBank(round, player.grade);
    cache.set(key, q);
    return q;
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Térfél

type PaneProps = {
  seat: Seat;
  rotated: boolean;
  view: MatchState;
  countdown: number | null;
  onPress: (seat: SeatId, option: number, e: ReactPointerEvent<HTMLButtonElement>) => void;
  onRelease: (seat: SeatId, option: number, e: ReactPointerEvent<HTMLButtonElement>) => void;
  onCancel: (seat: SeatId, e: ReactPointerEvent<HTMLButtonElement>) => void;
  onKey: (seat: SeatId, option: number) => void;
  timerRef: (el: HTMLDivElement | null) => void;
  shakeRef: (el: HTMLDivElement | null) => void;
};

function PlayerPane({ seat, rotated, view, countdown, onPress, onRelease, onCancel, onKey, timerRef, shakeRef }: PaneProps) {
  const id = seat.id;
  const hp = view.duel.hp[id] ?? DUEL_HP;
  const stats = view.duel.stats[id]!;
  const q = view.questions[id];
  const mine = view.answers[id] ?? null;
  const phase = view.phase;
  const revealing = phase === "reveal" || (phase === "finished" && !!view.lastOutcome);
  const lastAnswer = view.lastAnswers.find((a) => a.playerId === id);
  const hit = view.lastOutcome ? (view.lastOutcome.damageTo[id] ?? 0) : 0;
  const bonus = view.lastOutcome ? (view.lastOutcome.speedBonus[id] ?? 0) : 0;
  const correctNow = revealing && !!lastAnswer?.correct && lastAnswer.acceptedMs !== null;
  const showQuestion = (phase === "question" || phase === "reveal") && !!q;
  const hpPct = Math.max(0, Math.min(100, (hp / DUEL_HP) * 100));
  const hpTone = hpPct > 50 ? "ok" : hpPct > 25 ? "mid" : "low";
  const streak = stats.streak;

  // Review #447 (vercel): a térfél soha ne vágjon le választ. Körönként (és fázis- / méretváltáskor) a legnagyobb
  // betűméret-szintet választjuk, amelyen a kérdés + a válaszok elférnek; a legkisebb szinten is ≥ 12 px a szöveg és
  // ≥ 48 px a gomb. A szint DOM-attribútum (nem React-állapot): egy mérés-sor a kör elején, nem képkockánként.
  const rootRef = useRef<HTMLElement>(null);
  const [sizeKey, setSizeKey] = useState(0);
  useEffect(() => {
    const onResize = () => setSizeKey((k) => k + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const stage = root?.querySelector<HTMLElement>(".duel-stage");
    if (!root || !stage) return;
    const overflows = () =>
      stage.scrollHeight > stage.clientHeight ||
      Array.from(stage.querySelectorAll<HTMLElement>(".duel-option, .duel-prompt")).some((el) => el.scrollWidth > el.clientWidth + 1);
    let level = 0;
    root.dataset.fit = "0";
    while (level < FIT_LEVELS - 1 && overflows()) {
      level += 1;
      root.dataset.fit = String(level);
    }
  }, [q?.key, phase, mine?.optionIndex, sizeKey, rotated]);

  return (
    <section
      ref={rootRef}
      className={`duel-pane duel-pane--${id}`}
      data-testid={`duel-pane-${id}`}
      data-rotated={rotated ? "true" : "false"}
      data-locked={mine ? "true" : "false"}
      data-hit={revealing && hit > 0 ? "true" : "false"}
      data-scored={correctNow ? "true" : "false"}
      aria-label={`${seat.name} térfele`}
    >
      <div className="duel-pane-inner" ref={shakeRef}>
        <header className="duel-pane-head">
          <span className="duel-name">
            {seat.name} <span className="duel-grade">{seat.grade}. évf.</span>
          </span>
          {streak >= 2 ? (
            <span className="duel-streak" data-testid={`duel-streak-${id}`}>
              🔥 {streak}× sorozat
            </span>
          ) : null}
          <span className="duel-hp-num" data-testid={`duel-hp-${id}`}>
            {fmt1(hp)} ❤
          </span>
        </header>
        <div className="duel-hp" role="meter" aria-label={`${seat.name} életereje`} aria-valuemin={0} aria-valuemax={DUEL_HP} aria-valuenow={hp}>
          <div className={`duel-hp-fill duel-hp-fill--${hpTone}`} style={{ width: `${hpPct}%` }} />
        </div>
        {revealing && hit > 0 ? (
          <span className="duel-dmg" key={`d${view.roundNo}`} aria-hidden="true">
            −{fmt1(hit)}
          </span>
        ) : null}
        {correctNow && streak >= 3 ? (
          <span className="duel-dmg duel-combo" key={`k${view.roundNo}`} data-testid={`duel-combo-${id}`} aria-hidden="true">
            🔥 {streak}× kombó!
          </span>
        ) : null}
        <div className="duel-timer" aria-hidden="true">
          <div className="duel-timer-fill" ref={timerRef} data-testid={`duel-timer-${id}`} />
        </div>

        <div className="duel-stage">
          {phase === "countdown" && countdown !== null ? (
            <p className="duel-big" key={`c${countdown}`} data-testid={`duel-countdown-${id}`}>
              {countdown}
            </p>
          ) : null}
          {phase === "intro" ? (
            view.isTiebreak ? (
              <div className="duel-intro duel-intro--tie" data-testid={`duel-intro-${id}`}>
                <p className="duel-intro-title">⚡ Döntő kérdés! ⚡</p>
                <p className="duel-intro-sub">Holtverseny — ez a kérdés dönthet.</p>
              </div>
            ) : (
              <div className="duel-intro" data-testid={`duel-intro-${id}`}>
                <p className="duel-intro-title">{view.roundNo}. kör</p>
                <p className="duel-intro-sub">{view.roundNo === DUEL_ROUNDS ? "Utolsó kör!" : "Készülj!"}</p>
              </div>
            )
          ) : null}
          {showQuestion ? (
            <div className="duel-q">
              <p className="duel-prompt" data-testid={`duel-prompt-${id}`}>
                {q.prompt}
              </p>
              <div className="duel-options" role="group" aria-label="Válaszok">
                {q.options.map((opt, i) => {
                  const chosen = mine?.optionIndex === i;
                  const isCorrect = i === q.correctIndex;
                  const state = revealing ? (isCorrect ? "correct" : chosen ? "wrong" : "dim") : chosen ? "chosen" : "idle";
                  // A kör utáni kijelzésen csak a helyes és a választott válasz marad (hely a magyarázatnak).
                  if (state === "dim") return null;
                  return (
                    <button
                      key={i}
                      type="button"
                      className="duel-option"
                      data-state={state}
                      data-testid={`duel-option-${id}-${i}`}
                      disabled={phase !== "question" || !!mine}
                      aria-pressed={chosen}
                      onPointerDown={(e) => onPress(id, i, e)}
                      onPointerUp={(e) => onRelease(id, i, e)}
                      onPointerCancel={(e) => onCancel(id, e)}
                      onLostPointerCapture={(e) => onCancel(id, e)}
                      onClick={(e) => {
                        // Billentyűzet / akadálymentes választás (érintésnél a pointerup dönt, a click `detail`-je ≥ 1).
                        if (e.detail === 0) onKey(id, i);
                      }}
                      {...correctDataAttrs(isCorrect)}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {phase === "question" && mine ? (
                <p className="duel-locked" data-testid={`duel-locked-${id}`}>
                  Rögzítve ✓ Várjuk a másikat…
                </p>
              ) : null}
              {revealing ? (
                <div className={`duel-verdict ${correctNow ? "duel-verdict--ok" : "duel-verdict--miss"}`} data-testid={`duel-verdict-${id}`}>
                  <p className="duel-verdict-title">
                    {correctNow
                      ? `Helyes! ⚡ ${fmt1(10 + bonus)} csapás${bonus > 0 ? ` (gyorsasági bónusz +${fmt1(bonus)})` : ""}`
                      : lastAnswer?.acceptedMs === null || !lastAnswer
                        ? `Lejárt az idő. A helyes: ${q.options[q.correctIndex]}`
                        : `Majdnem! A helyes: ${q.options[q.correctIndex]}`}
                  </p>
                  {q.explanation ? <p className="duel-verdict-why">{q.explanation}</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Lap

type Screen = "start" | "setup" | "match" | "result";

/** Betűméret-szintek a térfél illesztéséhez (CSS: `.duel-pane[data-fit]`). */
const FIT_LEVELS = 6;

const FAST_TIMING: MatchTiming = { countdownMs: 900, introMs: 300, tiebreakIntroMs: 700, revealMs: 700 };

export default function DuelArena() {
  const [, navigate] = useLocation();
  const reducedMotion = useReducedMotion();
  const haptic = useHaptics();
  const orientation = useOrientation();
  const [screen, setScreen] = useState<Screen>("start");
  const [setup, setSetup] = useState<Setup>(loadSetup);
  const [record, setRecord] = useState<DuelRecord>(loadRecord);
  const [view, setView] = useState<MatchState | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const portrait = orientation === "portrait";
  const fast = useMemo(() => GAME_TEST_HOOKS_ENABLED && new URLSearchParams(window.location.search).get("duelSpeed") === "fast", []);
  const baseSeed = useRef<number>(readGameSeed() ?? freshSeed());
  const matchIndex = useRef(0);
  const usedByGrade = useRef(new Map<number, Set<string>>());
  const vocabSources = useRef(new Map<VocabLang, VocabSource>());
  const matchRef = useRef<MatchState | null>(null);
  const configRef = useRef<MatchConfig | null>(null);
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const startToken = useRef(0);
  /** A futó meccs beállítás-pillanatképe: a térfelek és az eredmény ebből rajzolnak (review #447). */
  const [matchSetup, setMatchSetup] = useState<Setup | null>(null);
  const recordedRef = useRef(false);

  // Meccs-óra: valós idő mínusz a szünetek (a pointer-események `timeStamp`-je ugyanebben az időtengelyben van).
  const pausedTotal = useRef(0);
  const pauseStart = useRef<number | null>(null);
  const clock = useCallback((realMs: number) => (pauseStart.current ?? realMs) - pausedTotal.current, []);

  const timerEls = useRef<Record<SeatId, HTMLDivElement | null>>({ p1: null, p2: null });
  const shakeEls = useRef<Record<SeatId, HTMLDivElement | null>>({ p1: null, p2: null });
  const feels = useRef<Record<SeatId, Feel> | null>(null);
  const press = useRef<Record<SeatId, { pointerId: number; option: number; downAt: number } | null>>({ p1: null, p2: null });

  useEffect(() => {
    const fx = createRng(`fx:${baseSeed.current}`);
    feels.current = {
      p1: createFeel({ reducedMotion, fxRng: fx.next }),
      p2: createFeel({ reducedMotion, fxRng: fx.next }),
    };
  }, [reducedMotion]);

  useEffect(() => saveSetup(setup), [setup]);

  const handleEffects = useCallback(
    (effects: MatchEffect[], state: MatchState) => {
      for (const e of effects) {
        if (e.type === "countdown") {
          setCountdown(e.secondsLeft);
          beep(660, 0.12, "sine", 0.05);
        } else if (e.type === "intro") {
          setCountdown(null);
          if (e.round === 1) beep(990, 0.18, "sine", 0.06);
          if (e.tiebreak) sfxWarning();
        } else if (e.type === "open") {
          // Új kör: a félbemaradt lenyomás (pl. a gomb letiltódott, mielőtt az ujj felemelkedett volna, és így nem jött
          // pointerup / lostpointercapture) nem blokkolhatja a következő kört.
          press.current = { p1: null, p2: null };
          for (const el of Array.from(document.querySelectorAll<HTMLElement>(".duel-option[data-pressed]"))) delete el.dataset.pressed;
        } else if (e.type === "locked") {
          sfxClick();
          haptic("tap");
        } else if (e.type === "reveal") {
          const anyHit = Object.values(e.outcome.damageTo).some((d) => d > 0);
          if (anyHit) {
            sfxSuccess();
            window.setTimeout(() => sfxHit(), 140);
            haptic("hit");
            for (const id of SEATS) {
              const dmg = e.outcome.damageTo[id] ?? 0;
              if (dmg > 0) feels.current?.[id].addTrauma(Math.min(0.75, 0.3 + dmg / 30));
            }
          } else {
            beep(330, 0.22, "sine", 0.04);
          }
        } else if (e.type === "finished") {
          sfxLevelUp();
        }
      }
      if (effects.length > 0) setView(state);
    },
    [haptic],
  );

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      startToken.current += 1; // a lecsatolás érvényteleníti a folyamatban lévő indítást
    };
  }, []);
  const inFlight = useRef(false);
  const loadFails = useRef(0);
  const lastStartAt = useRef(-Infinity);

  /**
   * Új meccs ugyanazokkal a játékosokkal (indítás és visszavágó). Review #447: egyetlen rögzített beállítás-pillanatképből
   * dolgozik; a szóbank betöltése alatt a beállítás zárolt; ha közben a beállítás / a képernyő változott, a komponens
   * lecsatolódott vagy újabb indítás jött, ez az indítás érvénytelen; dupla koppintás egy meccset indít.
   */
  const startMatch = useCallback(async () => {
    const now0 = performance.now();
    if (inFlight.current || now0 - lastStartAt.current < 400) return;
    lastStartAt.current = now0;
    const s = setupRef.current;
    const fromScreen = screenRef.current;
    const token = ++startToken.current;
    const stillValid = () => mountedRef.current && token === startToken.current && setupRef.current === s && screenRef.current === fromScreen;
    setLoadError(null);
    let vocab: VocabSource | null = null;
    if (s.source.startsWith("vocab-")) {
      const lang = s.source.slice(6) as VocabLang;
      vocab = vocabSources.current.get(lang) ?? null;
      if (!vocab) {
        inFlight.current = true;
        setLoading(true);
        let failed = false;
        try {
          const entries = await loadVocabBank(lang);
          // Memóriabeli napló + seedelt véletlen: a meccs reprodukálható, a visszavágók nem ismételnek.
          vocab = createVocabSource({ lang, entries, history: createSeenHistory(null), rng: createRng(seedFrom("duel-vocab", baseSeed.current, lang)).next });
          vocabSources.current.set(lang, vocab);
        } catch {
          failed = true;
        } finally {
          inFlight.current = false;
          if (mountedRef.current) setLoading(false);
        }
        if (!stillValid()) return;
        if (failed || !vocab) {
          // A közös betöltő a hibás ígéretet eldobja, így az újrapróba tényleg újra kér (tests/duel-vocab-retry.test.ts);
          // ha egy böngésző a meghiúsult modul-lekérést mégis megjegyzi, a második hiba után az oldal-újratöltést és az
          // évfolyam-banki tartalékot ajánljuk.
          loadFails.current += 1;
          setLoadError(
            loadFails.current > 1
              ? "Megint nem sikerült betölteni a szavakat. Ha már van internet, töltsd újra az oldalt, vagy játsszatok most az évfolyam-bank kérdéseivel!"
              : "Nem sikerült betölteni a szavakat (lehet, hogy nincs internet). Próbáld újra, vagy játsszatok az évfolyam-bank kérdéseivel!",
          );
          return;
        }
      }
    }
    // JBb: a játékosok évfolyamának (és szomszédainak) bankdarabja a meccs előtt; hibánál újrapróbálható üzenet.
    const bankGrades = [...new Set(SEATS.flatMap((id) => [s.seats[id].grade - 1, s.seats[id].grade, s.seats[id].grade + 1]))]
      .filter((g) => g >= 3 && g <= 12);
    if (!bankGrades.every(isGradeBankLoaded)) {
      inFlight.current = true;
      setLoading(true);
      try {
        await Promise.allSettled(bankGrades.map((g) => loadGradeBank(g)));
      } finally {
        inFlight.current = false;
        if (mountedRef.current) setLoading(false);
      }
      if (!stillValid()) return;
      const own = SEATS.map((id) => s.seats[id].grade).filter((g) => g >= 3 && g <= 12);
      if (!own.every(isGradeBankLoaded)) {
        setLoadError("Nem sikerült betölteni a kérdéseket (lehet, hogy nincs internet). Próbáld újra!");
        return;
      }
    }
    matchIndex.current += 1;
    const seed = seedFrom("duel-arena", baseSeed.current, matchIndex.current);
    const config: MatchConfig = {
      players: SEATS.map((id) => ({ id, grade: s.seats[id].grade })),
      provider: makeProvider({ seed, setup: s, usedByGrade: usedByGrade.current, vocab }),
      timing: fast ? FAST_TIMING : undefined,
    };
    configRef.current = config;
    setMatchSetup(s);
    pausedTotal.current = 0;
    pauseStart.current = null;
    setPaused(false);
    recordedRef.current = false;
    const r = reduceMatch(createMatch(config), { type: "start", nowMs: clock(performance.now()) }, config);
    matchRef.current = r.state;
    setView(r.state);
    setScreen("match");
    handleEffects(r.effects, r.state);
  }, [clock, fast, handleEffects]);

  // Képkocka-hurok: a motor `tick`-je, az időjelzők és a rázás (DOM-ra írva, React-állapot nélkül — K.4/10).
  useEffect(() => {
    if (screen !== "match") return;
    let raf = 0;
    let last = performance.now();
    const off: ShakeOffset = { x: 0, y: 0, rot: 0 };
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(250, Math.max(0, t - last));
      last = t;
      const cfg = configRef.current;
      let s = matchRef.current;
      if (cfg && s && pauseStart.current === null) {
        const r = reduceMatch(s, { type: "tick", nowMs: clock(t) }, cfg);
        if (r.state !== s) {
          matchRef.current = s = r.state;
          handleEffects(r.effects, r.state);
        }
      }
      const now = clock(t);
      for (const id of SEATS) {
        const el = timerEls.current[id];
        if (el && s) {
          const q = s.questions[id];
          let ratio = 0;
          if (s.phase === "question" && q && s.answers[id] == null) ratio = Math.max(0, Math.min(1, (playerDeadlineMs(s, id) - now) / q.windowMs));
          else if (s.phase === "intro" || s.phase === "countdown") ratio = 1;
          el.style.transform = `scaleX(${ratio.toFixed(4)})`;
          el.dataset.low = ratio < 0.3 && ratio > 0 ? "true" : "false";
        }
        const feel = feels.current?.[id];
        const box = shakeEls.current[id];
        if (feel && box) {
          feel.update(dt);
          feel.shakeOffset(off, box.clientHeight || 300);
          box.style.transform = off.x || off.y || off.rot ? `translate(${off.x.toFixed(2)}px, ${off.y.toFixed(2)}px) rotate(${((off.rot * 180) / Math.PI).toFixed(3)}deg)` : "";
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [screen, clock, handleEffects]);

  // Meccs vége → eredményképernyő + helyi mérleg (egyszer meccsenként).
  useEffect(() => {
    if (!view || view.phase !== "finished" || screen !== "match") return;
    if (!recordedRef.current && view.verdict) {
      recordedRef.current = true;
      const v = view.verdict;
      setRecord((prev) => {
        const next = { ...prev };
        if (v.coWin) next.co += 1;
        else if (v.winners[0] === "p1") next.p1 += 1;
        else if (v.winners[0] === "p2") next.p2 += 1;
        saveRecord(next);
        return next;
      });
    }
    const t = window.setTimeout(() => setScreen("result"), fast ? 200 : 900);
    return () => window.clearTimeout(t);
  }, [view, screen, fast]);

  const submit = useCallback(
    (seat: SeatId, option: number, realNow: number, realDown: number | null) => {
      const cfg = configRef.current;
      const s = matchRef.current;
      if (!cfg || !s || pauseStart.current !== null) return;
      const nowMs = clock(realNow);
      const clientRtMs = realDown === null ? null : clock(realDown) - s.openedAtMs;
      const r = reduceMatch(s, { type: "answer", playerId: seat, optionIndex: option, nowMs, clientRtMs }, cfg);
      matchRef.current = r.state;
      handleEffects(r.effects, r.state);
    },
    [clock, handleEffects],
  );

  const onPress = useCallback((seat: SeatId, option: number, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button > 0 || press.current[seat]) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a rögzítés nélkül is megy */
    }
    press.current[seat] = { pointerId: e.pointerId, option, downAt: e.timeStamp };
    e.currentTarget.dataset.pressed = "true";
  }, []);

  const onRelease = useCallback(
    (seat: SeatId, option: number, e: ReactPointerEvent<HTMLButtonElement>) => {
      const p = press.current[seat];
      if (!p || p.pointerId !== e.pointerId) return;
      press.current[seat] = null;
      const el = e.currentTarget;
      delete el.dataset.pressed;
      const r = el.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (inside && p.option === option) submit(seat, option, e.timeStamp, p.downAt);
    },
    [submit],
  );

  const onCancel = useCallback((seat: SeatId, e: ReactPointerEvent<HTMLButtonElement>) => {
    const p = press.current[seat];
    if (!p || p.pointerId !== e.pointerId) return;
    press.current[seat] = null;
    delete e.currentTarget.dataset.pressed;
  }, []);

  const onKey = useCallback((seat: SeatId, option: number) => submit(seat, option, performance.now(), null), [submit]);

  const pause = useCallback(() => {
    if (screen !== "match" || pauseStart.current !== null) return;
    pauseStart.current = performance.now();
    setPaused(true);
  }, [screen]);

  const resume = useCallback(() => {
    if (pauseStart.current === null) return;
    pausedTotal.current += performance.now() - pauseStart.current;
    pauseStart.current = null;
    setPaused(false);
  }, []);

  // Teszt-kampó (csak `VITE_ENABLE_GAME_TEST_HOOKS=1`): állapot-olvasás a többujjas teszt mutáció-ellenőrzéséhez (C-34).
  useEffect(() => {
    return installGameTestApi({
      forceState: (patch) => {
        if (patch.phase === "pause") pause();
        if (patch.phase === "resume") resume();
      },
      probe: () => {
        const s = matchRef.current;
        return {
          screen,
          phase: s?.phase ?? "none",
          round: s?.duel.round ?? 0,
          roundNo: s?.roundNo ?? 0,
          tiebreak: s?.isTiebreak ? 1 : 0,
          tiebreaks: s?.duel.tiebreaks ?? 0,
          hpP1: s?.duel.hp.p1 ?? DUEL_HP,
          hpP2: s?.duel.hp.p2 ?? DUEL_HP,
          lockedP1: s?.answers.p1 ? 1 : 0,
          lockedP2: s?.answers.p2 ? 1 : 0,
          answeredP1: s?.duel.stats.p1?.answered ?? 0,
          answeredP2: s?.duel.stats.p2?.answered ?? 0,
          correctP1: s?.duel.stats.p1?.correct ?? 0,
          correctP2: s?.duel.stats.p2?.correct ?? 0,
          questionOpen: s?.phase === "question" ? 1 : 0,
          simTime: clock(performance.now()),
          matchIndex: matchIndex.current,
          winners: s?.verdict?.finished ? s.verdict.winners.join(",") : "",
          coWin: s?.verdict?.coWin ? 1 : 0,
        };
      },
    });
  }, [screen, pause, resume, clock]);

  const shellState: GameScreenState = screen === "match" ? (paused ? "paused" : "playing") : screen === "result" ? "result" : "start";
  const shown = matchSetup ?? setup;
  const facingRotate = portrait && shown.facing;

  const setSeat = (id: SeatId, patch: Partial<Seat>) => setSetup((s) => ({ ...s, seats: { ...s.seats, [id]: { ...s.seats[id], ...patch } } }));
  const nickCounter = useRef(0);
  const rollName = (id: SeatId) => {
    nickCounter.current += 1;
    let name = guestNickname(seedFrom("duel-nick", freshSeed(), nickCounter.current));
    if (name === setup.seats[id === "p1" ? "p2" : "p1"].name) name = guestNickname(seedFrom("duel-nick-2", freshSeed()));
    setSeat(id, { name, generated: true });
  };

  return (
    <GameShell gameId="DuelArena" state={shellState} fixedScreen={screen !== "start"} onAutoPause={pause}>
      <style>{DUEL_CSS}</style>
      {screen === "start" ? (
        <main className="duel-start-wrap">
          <StartScreen
            title="Párbaj aréna"
            subtitle="Két játékos, egy telefon. Aki jól válaszol, csapást mér a másikra — a gyorsaság csak kis bónusz."
            icon={<Swords className="h-12 w-12" aria-hidden="true" />}
            startLabel="Párbaj beállítása"
            startTestId="duel-start"
            onStart={() => setScreen("setup")}
            menuKey="duel"
            secondary={
              <>
                <Link href="/games" className="game-btn game-btn-ghost">
                  <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                  Játékok
                </Link>
                <AudioToggleButton showLabel className="game-btn game-btn-secondary h-12 min-w-12 w-full [&_span]:text-base [&_span]:font-extrabold" />
              </>
            }
          >
            <ul className="duel-rules">
              <li>
                <strong>7 kérdés</strong>, mindkettőtöknek a saját évfolyamából.
              </li>
              <li>
                Helyes válasz = <strong>10 csapás</strong> + legfeljebb 2,5 gyorsasági bónusz. Rossz válaszért nem jár levonás.
              </li>
              <li>Döntetlennél legfeljebb 2 döntő kérdés, utána közös győzelem.</li>
            </ul>
            {record.p1 + record.p2 + record.co > 0 ? (
              <p className="duel-record" data-testid="duel-record">
                Mérleg ezen az eszközön: {setup.seats.p1.name} {record.p1} – {record.p2} {setup.seats.p2.name}
                {record.co > 0 ? ` · közös győzelem: ${record.co}` : ""}
              </p>
            ) : null}
          </StartScreen>
        </main>
      ) : null}

      {screen === "setup" ? (
        // Saját görgető konténer (nem <main>, l. eredmény): így a ragadós indítógomb fekvő nézetben is látszik.
        <div className="duel-setup" data-testid="duel-setup">
          <fieldset className="duel-fieldset" disabled={loading} aria-busy={loading}>
          <header className="duel-setup-head">
            <button type="button" className="game-btn game-btn-ghost duel-back" onClick={() => setScreen("start")}>
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              Vissza
            </button>
            <h1 className="duel-setup-title">Ki játszik?</h1>
          </header>
          <div className="duel-setup-seats">
            {SEATS.map((id) => {
              const seat = setup.seats[id];
              return (
                <section key={id} className={`duel-seat duel-seat--${id}`} data-testid={`duel-seat-${id}`} aria-label={defaultName(id)}>
                  <div className="duel-seat-head">
                    <p className="duel-seat-name" data-testid={`duel-name-${id}`}>
                      {seat.name}
                    </p>
                    <button type="button" className="duel-chip" onClick={() => rollName(id)} data-testid={`duel-roll-${id}`}>
                      <Dices className="h-5 w-5" aria-hidden="true" /> Becenév
                    </button>
                    {seat.generated ? (
                      <button type="button" className="duel-chip" onClick={() => setSeat(id, { name: defaultName(id), generated: false })}>
                        {id === "p1" ? "1." : "2."} játékos
                      </button>
                    ) : null}
                  </div>
                  <p className="duel-label">{id === "p1" ? "1. játékos évfolyama" : "2. játékos évfolyama"}</p>
                  <div className="duel-grade-grid" role="group" aria-label={`${defaultName(id)} évfolyama`}>
                    {GRADES.map((g) => (
                      <button
                        key={g}
                        type="button"
                        className="duel-grade-btn"
                        aria-pressed={seat.grade === g}
                        aria-label={`${g}. évfolyam`}
                        data-testid={`duel-grade-${id}-${g}`}
                        onClick={() => setSeat(id, { grade: g })}
                      >
                        {g}.
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
          <section className="duel-setup-block" aria-label="Kérdések">
            <p className="duel-label">Miből kérdezzünk?</p>
            <div className="duel-chip-row" role="group" aria-label="Tantárgy vagy nyelv">
              {SOURCES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="duel-chip"
                  aria-pressed={setup.source === s.id}
                  data-testid={`duel-source-${s.id}`}
                  onClick={() => setSetup((x) => ({ ...x, source: s.id }))}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="duel-label">Nehézség (mindkettőtöknek ugyanaz a szint)</p>
            <div className="duel-chip-row" role="group" aria-label="Nehézség">
              {BANDS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="duel-chip"
                  aria-pressed={setup.band === b.id}
                  data-testid={`duel-band-${b.id}`}
                  onClick={() => setSetup((x) => ({ ...x, band: b.id }))}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={setup.facing}
              className="duel-toggle"
              data-testid="duel-facing"
              onClick={() => setSetup((x) => ({ ...x, facing: !x.facing }))}
            >
              <span className="duel-toggle-box" aria-hidden="true">
                {setup.facing ? "✓" : ""}
              </span>
              <span>Szemben ültök (álló telefonon a felső térfél fejjel lefelé)</span>
            </button>
          </section>
          </fieldset>
          {loadError ? (
            <div className="duel-error" role="alert" data-testid="duel-load-error">
              <p>{loadError}</p>
              <div className="duel-chip-row">
                <button type="button" className="duel-chip" data-testid="duel-retry" onClick={() => void startMatch()}>
                  Újrapróbálom
                </button>
                <button
                  type="button"
                  className="duel-chip"
                  data-testid="duel-fallback"
                  onClick={() => {
                    setLoadError(null);
                    setSetup((x) => ({ ...x, source: x.source === "vocab-en" ? "english" : "mixed" }));
                  }}
                >
                  Évfolyam-bank kérdései
                </button>
              </div>
            </div>
          ) : null}
          <button type="button" className="game-btn game-btn-primary duel-go" data-testid="duel-go" disabled={loading} onClick={() => void startMatch()}>
            <Swords className="h-6 w-6" aria-hidden="true" />
            {loading ? "Szavak betöltése…" : "Kezdődjön a párbaj!"}
          </button>
        </div>
      ) : null}

      {screen === "match" && view && matchSetup ? (
        <div
          className="duel-arena"
          data-testid="duel-arena"
          data-orient={portrait ? "portrait" : "landscape"}
          data-reduced={reducedMotion ? "true" : "false"}
          data-phase={view.phase}
          data-tiebreak={view.isTiebreak ? "true" : "false"}
        >
          <PlayerPane
            seat={shown.seats.p2}
            rotated={facingRotate}
            view={view}
            countdown={countdown}
            onPress={onPress}
            onRelease={onRelease}
            onCancel={onCancel}
            onKey={onKey}
            timerRef={(el) => (timerEls.current.p2 = el)}
            shakeRef={(el) => (shakeEls.current.p2 = el)}
          />
          <div className="duel-center">
            <span className="duel-round" data-testid="duel-round">
              {view.isTiebreak ? `Döntő ${view.roundNo - DUEL_ROUNDS}/2` : `${Math.max(1, view.roundNo)}/${DUEL_ROUNDS}. kör`}
            </span>
            <span className={`duel-vs ${view.phase === "reveal" && view.lastOutcome && Object.values(view.lastOutcome.damageTo).some((d) => d > 0) ? "duel-vs--clash" : ""}`} aria-hidden="true" key={`vs${view.roundNo}${view.phase}`}>
              <Swords className="h-6 w-6" />
            </span>
            <button type="button" className="duel-pause" aria-label="Szünet" data-testid="duel-pause" onClick={pause}>
              <Pause className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>
          <PlayerPane
            seat={shown.seats.p1}
            rotated={false}
            view={view}
            countdown={countdown}
            onPress={onPress}
            onRelease={onRelease}
            onCancel={onCancel}
            onKey={onKey}
            timerRef={(el) => (timerEls.current.p1 = el)}
            shakeRef={(el) => (shakeEls.current.p1 = el)}
          />
          <PauseMenu
            open={paused}
            onResume={resume}
            onRestart={() => {
              resume();
              void startMatch();
            }}
            onExit={() => navigate("/games")}
            exitLabel="Vissza a játékokhoz"
          />
        </div>
      ) : null}

      {screen === "result" && view?.verdict && matchSetup ? (
        <ResultView
          view={view}
          setup={shown}
          record={record}
          rotateTop={facingRotate}
          onRematch={() => void startMatch()}
          onSetup={() => setScreen("setup")}
        />
      ) : null}
    </GameShell>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Eredmény (dobogó-érzet, nincs megszégyenítés)

function StatCard({ seat, view, rotated }: { seat: Seat; view: MatchState; rotated: boolean }) {
  const v = view.verdict!;
  const st = view.duel.stats[seat.id]!;
  const won = v.winners.includes(seat.id);
  const place = v.podium.findIndex((group) => group.includes(seat.id)) + 1;
  const praise = won
    ? v.coWin
      ? "Fej fej mellett — mindketten nyertetek!"
      : "Gratulálunk, győztél!"
    : st.correct > 0
      ? `Szép munka: ${st.correct} helyes válasz! Visszavágó?`
      : "Jó próbálkozás! A következő kör a tiéd lehet.";
  return (
    <section
      className={`duel-card duel-card--${seat.id} ${won ? "duel-card--win" : ""}`}
      data-rotated={rotated ? "true" : "false"}
      data-testid={`duel-stats-${seat.id}`}
      aria-label={`${seat.name} eredménye`}
    >
      <header className="duel-card-head">
        <span className={`duel-medal duel-medal--${won ? "gold" : "silver"}`} aria-hidden="true">
          {won ? "🏆" : "🥈"}
        </span>
        <div className="min-w-0">
          <p className="duel-card-name">{seat.name}</p>
          <p className="duel-card-place">
            {place}. hely · {seat.grade}. évfolyam
          </p>
        </div>
      </header>
      <p className="duel-card-praise">{praise}</p>
      <dl className="duel-card-stats">
        <div>
          <dt>Pontosság</dt>
          <dd data-testid={`duel-acc-${seat.id}`}>{Math.round(accuracyOf(st) * 100)}%</dd>
        </div>
        <div>
          <dt>Helyes</dt>
          <dd>
            {st.correct}/{st.asked}
          </dd>
        </div>
        <div>
          <dt>Leggyorsabb helyes</dt>
          <dd data-testid={`duel-fast-${seat.id}`}>{st.fastestMs === null ? "—" : fmtSec(st.fastestMs)}</dd>
        </div>
        <div>
          <dt>Legjobb sorozat</dt>
          <dd>{st.bestStreak}</dd>
        </div>
      </dl>
    </section>
  );
}

function ResultView(props: { view: MatchState; setup: Setup; record: DuelRecord; rotateTop: boolean; onRematch: () => void; onSetup: () => void }) {
  const { view, setup, record } = props;
  const v = view.verdict!;
  const headline = v.coWin ? "🤝 Közös győzelem!" : `🏆 ${setup.seats[v.winners[0] as SeatId].name} nyerte a párbajt!`;
  return (
    // Nem <main>: a `.game-shell-fixed[data-fixed-screen] > main` közös szabálya flex-oszlopra írná át a rácsot.
    <div className="duel-result" data-testid="duel-result" data-cowin={v.coWin ? "true" : "false"}>
      <StatCard seat={setup.seats.p2} view={view} rotated={props.rotateTop} />
      <section className="duel-result-mid" aria-label="Győzteshirdetés">
        <h1 className="duel-headline" data-testid="duel-winner">
          {headline}
        </h1>
        <p className="duel-result-sub">
          {view.exhausted ? "Elfogytak a kérdések ennél a beállításnál. " : ""}
          Mérleg ezen az eszközön: {record.p1} – {record.p2}
          {record.co > 0 ? ` · közös: ${record.co}` : ""}
        </p>
        <div className="duel-result-actions">
          <button type="button" className="game-btn game-btn-primary" data-testid="duel-rematch" onClick={props.onRematch}>
            <Trophy className="h-5 w-5" aria-hidden="true" />
            Visszavágó
          </button>
          <button type="button" className="game-btn game-btn-secondary" data-testid="duel-to-setup" onClick={props.onSetup}>
            Beállítások
          </button>
          <Link href="/games" className="game-btn game-btn-ghost">
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            Játékok
          </Link>
        </div>
      </section>
      <StatCard seat={setup.seats.p1} view={view} rotated={false} />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Stílus (a lap saját osztályai; a közös index.css-t ez a szelet nem módosítja)

const DUEL_CSS = `
.duel-start-wrap { flex: 1 1 auto; display: flex; flex-direction: column; }
.duel-rules { margin: 0 auto; max-width: 34ch; padding: 12px 16px; text-align: left; font-size: 15px; line-height: 1.45; color: #e2e8f0;
  list-style: disc; padding-left: 28px; border-radius: 16px; background: #0f172acc; border: 1px solid #ffffff1f; }
.duel-rules li + li { margin-top: 6px; }
.duel-record { margin-top: 10px; font-size: 14px; color: #fde68a; }

.duel-setup { display: flex; flex-direction: column; gap: 14px; width: 100%; max-width: 760px; margin: 0 auto; flex: 1 1 auto; min-height: 0;
  overflow-y: auto; overscroll-behavior: contain;
  padding: max(12px, var(--game-safe-top)) max(16px, var(--game-safe-right)) max(20px, var(--game-safe-bottom)) max(16px, var(--game-safe-left)); }
.duel-fieldset { display: flex; flex-direction: column; gap: 14px; min-width: 0; margin: 0; padding: 0; border: 0; }
.duel-fieldset:disabled { opacity: .6; }
.duel-error { padding: 12px; border-radius: 16px; font-size: 15px; font-weight: 700; color: #fff7ed; background: #7c2d12cc; border: 1px solid #fb923c; }
.duel-error p { margin-bottom: 8px; }
.duel-setup-head { display: flex; align-items: center; gap: 12px; }
.duel-setup-title { font-size: 26px; font-weight: 900; }
.duel-back { min-height: 48px; }
.duel-setup-seats { display: grid; gap: 12px; grid-template-columns: 1fr; }
@media (min-width: 700px) { .duel-setup-seats { grid-template-columns: 1fr 1fr; } }
.duel-seat { padding: 12px; border-radius: 18px; background: #0f172ad9; border: 2px solid var(--seat); --seat: #22d3ee; }
.duel-seat--p2 { --seat: #e879f9; }
.duel-seat-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 8px; }
.duel-seat-name { flex: 1 1 100%; font-size: 20px; font-weight: 900; color: var(--seat); }
.duel-label { margin: 6px 0; font-size: 13px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: #cbd5e1; }
.duel-grade-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.duel-grade-btn { min-height: 52px; min-width: 48px; border-radius: 12px; font-size: 17px; font-weight: 900; color: #fff;
  background: #1e293b; border: 1px solid #ffffff33; touch-action: manipulation; }
.duel-grade-btn[aria-pressed="true"] { background: var(--seat); color: #0b1020; border-color: #fff; box-shadow: 0 0 16px color-mix(in srgb, var(--seat) 60%, transparent); }
.duel-setup-block { padding: 12px; border-radius: 18px; background: #0f172ad9; border: 1px solid #ffffff1f; }
.duel-chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
.duel-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 48px; padding: 0 14px; border-radius: 9999px; font-size: 15px;
  font-weight: 800; color: #e2e8f0; background: #1e293b; border: 1px solid #ffffff33; touch-action: manipulation; }
.duel-chip[aria-pressed="true"] { background: #facc15; color: #0b1020; border-color: #fff; }
.duel-toggle { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 52px; margin-top: 10px; padding: 4px 8px; border-radius: 14px;
  font-size: 15px; text-align: left; color: #e2e8f0; background: transparent; border: 1px solid #ffffff1f; touch-action: manipulation; }
.duel-toggle-box { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; flex: none; border-radius: 8px;
  font-size: 18px; font-weight: 900; color: #0b1020; background: #1e293b; border: 2px solid #ffffff55; }
.duel-toggle[aria-checked="true"] .duel-toggle-box { background: #facc15; border-color: #fff; }
/* Ragadós indítógomb: fekvő telefonon (390 px magas) görgetés nélkül is elérhető. */
.duel-go { position: sticky; bottom: max(8px, var(--game-safe-bottom)); z-index: 5; min-height: 60px; font-size: 19px; box-shadow: 0 8px 28px #000a; }

.duel-arena { position: relative; flex: 1 1 auto; display: grid; height: 100%; min-height: 0; overflow: hidden;
  touch-action: none; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none;
  background: radial-gradient(120% 60% at 50% 0%, #4c1d9533, transparent 60%), radial-gradient(120% 60% at 50% 100%, #0e749033, transparent 60%), #070b1d;
  padding: var(--game-safe-top) var(--game-safe-right) var(--game-safe-bottom) var(--game-safe-left); }
.duel-arena[data-orient="portrait"] { grid-template-rows: minmax(0, 1fr) 52px minmax(0, 1fr); }
.duel-arena[data-orient="landscape"] { grid-template-columns: minmax(0, 1fr) 64px minmax(0, 1fr); }
.duel-arena[data-orient="landscape"] .duel-pane--p1 { order: 1; }
.duel-arena[data-orient="landscape"] .duel-center { order: 2; flex-direction: column; }
.duel-arena[data-orient="landscape"] .duel-pane--p2 { order: 3; }

.duel-pane { --seat: #22d3ee; --pfs: 18px; --ofs: 16px; --omin: 56px; --opad: 6px 8px; --ogap: 8px; --plh: 1.25;
  position: relative; min-height: 0; min-width: 0; padding: 4px 6px; }
.duel-pane[data-fit="1"] { --pfs: 16px; --ofs: 15px; --omin: 52px; }
.duel-pane[data-fit="2"] { --pfs: 15px; --ofs: 14px; --omin: 48px; --ogap: 6px; }
.duel-pane[data-fit="3"] { --pfs: 14px; --ofs: 13px; --omin: 48px; --opad: 4px 6px; --ogap: 6px; --plh: 1.2; }
.duel-pane[data-fit="4"] { --pfs: 13px; --ofs: 12px; --omin: 48px; --opad: 3px 5px; --ogap: 5px; --plh: 1.15; }
.duel-pane[data-fit="5"] { --pfs: 12px; --ofs: 12px; --omin: 48px; --opad: 2px 4px; --ogap: 4px; --plh: 1.1; }
.duel-pane--p2 { --seat: #e879f9; }
.duel-pane[data-rotated="true"] { transform: rotate(180deg); }
.duel-pane-inner { position: relative; display: flex; flex-direction: column; gap: 4px; height: 100%; padding: 6px 8px 8px; border-radius: 18px;
  background: linear-gradient(180deg, #111a33f2, #0b1226f2); border: 2px solid color-mix(in srgb, var(--seat) 55%, transparent);
  box-shadow: inset 0 1px 0 #ffffff18, 0 0 24px color-mix(in srgb, var(--seat) 18%, transparent); will-change: transform; overflow: hidden; }
.duel-pane[data-hit="true"] .duel-pane-inner { animation: duel-hit .45s ease-out 1; }
.duel-pane[data-scored="true"] .duel-pane-inner { animation: duel-score .6s ease-out 1; }
@keyframes duel-hit { 0% { box-shadow: inset 0 0 0 3px #fb923c, 0 0 30px #fb923c88; } 100% { box-shadow: inset 0 1px 0 #ffffff18, 0 0 24px color-mix(in srgb, var(--seat) 18%, transparent); } }
@keyframes duel-score { 0% { box-shadow: inset 0 0 0 3px var(--seat), 0 0 36px var(--seat); } 100% { box-shadow: inset 0 1px 0 #ffffff18, 0 0 24px color-mix(in srgb, var(--seat) 18%, transparent); } }
.duel-pane-head { display: flex; align-items: center; gap: 8px; min-height: 22px; }
.duel-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 16px; font-weight: 900; color: var(--seat); }
.duel-grade { font-size: 13px; font-weight: 700; color: #cbd5e1; }
.duel-streak { flex: none; padding: 2px 8px; border-radius: 9999px; font-size: 13px; font-weight: 900; color: #fde68a; background: #f59e0b26; border: 1px solid #f59e0b55; }
.duel-hp-num { flex: none; font-size: 16px; font-weight: 900; color: #fff; font-variant-numeric: tabular-nums; }
.duel-hp { position: relative; height: 10px; border-radius: 9999px; background: #1e293b; border: 1px solid #ffffff26; overflow: visible; }
.duel-hp-fill { height: 100%; border-radius: inherit; transition: width .45s cubic-bezier(.2,.9,.3,1.2); }
.duel-hp-fill--ok { background: linear-gradient(90deg, #22c55e, #a3e635); }
.duel-hp-fill--mid { background: linear-gradient(90deg, #eab308, #facc15); }
.duel-hp-fill--low { background: linear-gradient(90deg, #f97316, #fb923c); }
/* A csapás száma a térfél közepén lebben fel (1,3 s), utána eltűnik — nem takarja tartósan az ítéletet. */
.duel-dmg { position: absolute; left: 50%; top: 42%; z-index: 3; font-size: clamp(34px, 10vmin, 52px); font-weight: 900; color: #fdba74;
  text-shadow: 0 0 18px #f97316, 0 3px 8px #000; animation: duel-float 1.3s ease-out forwards; pointer-events: none; }
.duel-combo { color: #fde047; font-size: clamp(26px, 8vmin, 40px); white-space: nowrap; text-shadow: 0 0 18px #f59e0b, 0 3px 8px #000; }
@keyframes duel-float { 0% { transform: translate(-50%, 10px) scale(.6); opacity: 0; } 18% { transform: translate(-50%, 0) scale(1.2); opacity: 1; }
  70% { opacity: 1; } 100% { transform: translate(-50%, -36px) scale(1); opacity: 0; } }
.duel-timer { height: 5px; border-radius: 9999px; background: #ffffff14; overflow: hidden; }
.duel-timer-fill { height: 100%; width: 100%; transform-origin: left center; background: var(--seat); }
.duel-timer-fill[data-low="true"] { background: #fbbf24; }
.duel-stage { position: relative; flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; justify-content: safe center; overflow: hidden; }
.duel-big { margin: auto; font-size: clamp(64px, 18vmin, 120px); font-weight: 900; line-height: 1; color: #fff;
  text-shadow: 0 0 30px var(--seat); animation: duel-pop .5s ease-out 1; }
@keyframes duel-pop { 0% { transform: scale(1.6); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
.duel-intro { margin: auto; text-align: center; animation: duel-pop .45s ease-out 1; }
.duel-intro-title { font-size: clamp(30px, 8vmin, 46px); font-weight: 900; color: #fff; text-shadow: 0 0 22px var(--seat); }
.duel-intro-sub { margin-top: 4px; font-size: 16px; font-weight: 700; color: #cbd5e1; }
.duel-intro--tie .duel-intro-title { color: #fde047; text-shadow: 0 0 26px #f59e0b; animation: duel-glow 1.1s ease-in-out infinite alternate; }
@keyframes duel-glow { from { text-shadow: 0 0 10px #f59e0b; } to { text-shadow: 0 0 34px #fde047; } }
.duel-q { display: flex; flex-direction: column; gap: var(--ogap); min-height: 0; }
/* Egyik sor se zsugorodjon el (a kör utáni 2 soros prompt sem tűnhet el): a túlcsordulást az illesztés kezeli. */
.duel-q > * { flex-shrink: 0; }
.duel-prompt { font-size: var(--pfs); font-weight: 800; line-height: var(--plh); color: #f8fafc; text-align: center; overflow-wrap: anywhere; }
.duel-options { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--ogap); }
.duel-option { min-height: var(--omin); padding: var(--opad); border-radius: 14px; font-size: var(--ofs); font-weight: 800; line-height: 1.15; color: #fff;
  background: linear-gradient(180deg, #1e2b4d, #16203b); border: 2px solid #ffffff2e; overflow-wrap: anywhere; touch-action: none;
  transition: transform .08s ease-out, background-color .15s; }
.duel-option[data-pressed="true"] { transform: scale(.96); background: color-mix(in srgb, var(--seat) 35%, #16203b); border-color: var(--seat); }
.duel-option[data-state="chosen"] { background: color-mix(in srgb, var(--seat) 40%, #16203b); border-color: var(--seat); }
.duel-option[data-state="correct"] { background: #15803d; border-color: #86efac; box-shadow: 0 0 16px #22c55e88; }
.duel-option[data-state="wrong"] { background: #1e2b4d; border: 3px solid #fb923c; }
.duel-option[data-state="dim"] { opacity: .55; }
.duel-option:disabled { cursor: default; }
/* Kör utáni kijelzés: a (letiltott) válaszok összébb húzódnak, hogy a helyes válasz + magyarázat 360×640-en is elférjen. */
.duel-arena[data-phase="reveal"] .duel-option { min-height: 40px; }
.duel-arena[data-phase="reveal"] .duel-timer { display: none; }
.duel-arena[data-phase="reveal"] .duel-prompt { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.duel-option:disabled[data-state="idle"] { opacity: .8; }
.duel-locked { text-align: center; font-size: 14px; font-weight: 800; color: #a5f3fc; }
.duel-verdict { padding: 6px 10px; border-radius: 12px; text-align: center; }
.duel-verdict--ok { background: #14532d99; border: 1px solid #22c55e88; }
.duel-verdict--miss { background: #431407aa; border: 1px solid #fb923c88; }
.duel-verdict-title { font-size: 15px; font-weight: 900; color: #fff; }
.duel-verdict-why { margin-top: 2px; font-size: 13px; line-height: 1.3; color: #e2e8f0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.duel-center { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 2px 10px; z-index: 2; }
.duel-round { font-size: 14px; font-weight: 900; color: #fde68a; white-space: nowrap; }
.duel-arena[data-orient="landscape"] .duel-round { writing-mode: vertical-rl; transform: rotate(180deg); }
.duel-vs { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 9999px; color: #0b1020;
  background: radial-gradient(circle at 35% 30%, #fff8, transparent 60%), linear-gradient(135deg, #22d3ee, #e879f9); box-shadow: 0 0 18px #a78bfa88; }
.duel-vs--clash { animation: duel-clash .5s ease-out 1; }
@keyframes duel-clash { 0% { transform: scale(1); } 40% { transform: scale(1.35) rotate(-12deg); box-shadow: 0 0 40px #fde047; } 100% { transform: scale(1); } }
.duel-pause { display: inline-flex; align-items: center; justify-content: center; width: 48px; height: 48px; border-radius: 14px; color: #fff;
  background: #1e293b; border: 1px solid #ffffff33; touch-action: manipulation; }
.duel-arena[data-phase="countdown"] .duel-vs, .duel-arena[data-tiebreak="true"][data-phase="intro"] .duel-vs { animation: duel-glowbox 1s ease-in-out infinite alternate; }
@keyframes duel-glowbox { from { box-shadow: 0 0 8px #f59e0b; } to { box-shadow: 0 0 32px #fde047; } }

.duel-result { flex: 1 1 auto; display: grid; gap: 10px; height: 100%; min-height: 0; overflow-y: auto;
  padding: max(10px, var(--game-safe-top)) max(12px, var(--game-safe-right)) max(10px, var(--game-safe-bottom)) max(12px, var(--game-safe-left));
  background: radial-gradient(90% 50% at 50% 50%, #f59e0b26, transparent 70%), #070b1d; grid-template-rows: auto auto auto; align-content: center; }
@media (orientation: landscape) { .duel-result { grid-template-columns: 1fr minmax(240px, 1fr) 1fr; grid-template-rows: none; align-items: center; }
  .duel-result .duel-card--p1 { order: 1; } .duel-result .duel-result-mid { order: 2; } .duel-result .duel-card--p2 { order: 3; } }
.duel-card { --seat: #22d3ee; padding: 10px 12px; border-radius: 18px; background: #0f172ae6; border: 2px solid color-mix(in srgb, var(--seat) 50%, transparent); }
.duel-card--p2 { --seat: #e879f9; }
.duel-card[data-rotated="true"] { transform: rotate(180deg); }
@media (orientation: landscape) { .duel-card[data-rotated="true"] { transform: none; } }
.duel-card--win { border-color: #facc15; box-shadow: 0 0 28px #facc1555; }
.duel-card-head { display: flex; align-items: center; gap: 10px; }
.duel-medal { font-size: 34px; line-height: 1; }
.duel-card--win .duel-medal { animation: duel-pop .6s ease-out 1; }
.duel-card-name { font-size: 19px; font-weight: 900; color: var(--seat); }
.duel-card-place { font-size: 13px; font-weight: 700; color: #cbd5e1; }
.duel-card-praise { margin: 6px 0; font-size: 15px; font-weight: 800; color: #fef3c7; }
.duel-card-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 12px; }
.duel-card-stats dt { font-size: 12px; font-weight: 700; color: #94a3b8; }
.duel-card-stats dd { font-size: 17px; font-weight: 900; color: #fff; font-variant-numeric: tabular-nums; }
.duel-result-mid { text-align: center; }
.duel-headline { font-size: clamp(22px, 6vmin, 34px); font-weight: 900; line-height: 1.15; color: #fde047; text-shadow: 0 0 24px #f59e0b88; }
.duel-result-sub { margin-top: 4px; font-size: 14px; color: #cbd5e1; }
.duel-result-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 10px; }
.duel-result-actions .game-btn { min-height: 52px; }

@media (prefers-reduced-motion: reduce) {
  .duel-pane[data-hit="true"] .duel-pane-inner, .duel-pane[data-scored="true"] .duel-pane-inner,
  .duel-big, .duel-intro, .duel-intro--tie .duel-intro-title, .duel-vs--clash, .duel-dmg, .duel-card--win .duel-medal,
  .duel-arena[data-phase="countdown"] .duel-vs, .duel-arena[data-tiebreak="true"][data-phase="intro"] .duel-vs { animation: none !important; }
  .duel-pane[data-hit="true"] .duel-pane-inner { box-shadow: inset 0 0 0 3px #fb923c; }
  .duel-pane[data-scored="true"] .duel-pane-inner { box-shadow: inset 0 0 0 3px var(--seat); }
  .duel-dmg { opacity: 1; transform: none; top: 34px; left: auto; right: 12px; font-size: 16px; text-shadow: 0 2px 6px #000; }
  .duel-hp-fill, .duel-option { transition: none; }
}
`;
