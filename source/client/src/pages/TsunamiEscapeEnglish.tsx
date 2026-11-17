import { isPlayableQuestion } from "@shared/game-quiz-contract";
import { createRng, seedFrom, type Rng } from "@shared/game-rng";
import { createAdaptiveSession } from "@/game-engine/adaptiveSession";
import { tsunamiWaterPace } from "@/game-engine/tsunamiTiming";
import { useGradeLevel } from "@/game-engine/useGradeLevel";
import { GradeLevelPicker } from "@/game-engine/GradeLevelPicker";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { useLocation } from "wouter";
import GamePedagogyPanel from "@/components/GamePedagogyPanel";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useMaterialQuizzes } from "@/hooks/useMaterialQuizzes";
import { loadClassroomGrade, useClassroomGrade } from "@/lib/classroomStore";
import type { GradeSubject } from "@/data/gradeQuizBank";
import {
  bandShiftForDifficulty,
  clampBand,
  createGradeQuizSeen,
  difficultyForGrade,
  gradeForGame,
  isGradeQuizSeen,
  markGradeQuizSeen,
  pickGradeQuiz,
  pickUnseenMaterial,
} from "@/game-engine/gradeQuiz";
import ClassroomGateModal from "@/components/ClassroomGateModal";
import { sfxCombo, sfxHit, sfxLevelUp, sfxPickup } from "@/lib/audioEngine";
import { recordRun, type Achievement } from "@/lib/achievements";
import { quizTopicLabelHu } from "@/lib/quizTopicLabel";
import { isTodaysGameAvailable, markDailyCompleted } from "@/lib/dailyChallenge";
import { useCouponSession } from "@/game-engine/useCouponSession";
import { maybeClaimCouponBonus } from "@/game-engine/claimCouponBonus";
import { CouponHud, CouponExpiredOverlay } from "@/game-engine/CouponHud";
import { correctDataAttrs, installGameTestApi, readGameSeed } from "@/game-engine/game-test-hooks";
import { ArrowLeft, ArrowUp, Check, Flame, Mountain, Shell as ShellIcon, Waves, X } from "lucide-react";
import VirtualJoystick from "@/game-engine/VirtualJoystick";
import { countRender, registerInputProbe } from "@/game-engine/inputProbe";
import HoldButton from "@/game-engine/HoldButton";
import { shapeJoystick, type JoystickVector } from "@/game-engine/joystick";
import { useReducedMotion } from "@/game-engine/useReducedMotion";
import { detectLookTier } from "@/game-engine/three-look";
import { pickUnseen, type SeenItem } from "@/game-engine/no-repeat";
import { useVocabQuizSource, vocabLevelForGrade, type VocabQuiz } from "@/game-engine/vocab";
import {
  GameHud,
  GameShell,
  PauseMenu,
  ResultScreen,
  StartScreen,
  cancelGameFrame,
  requestGameFrame,
  useBestScore,
  useHaptics,
  useTouchCapable,
  type GameScreenState,
} from "@/game-engine/mobile";
import {
  InlineQuestion,
  ResultReview,
  bankPlayQuestion,
  gradePlayQuestion,
  materialPlayQuestion,
  TAP_STILL_PX,
  restoreReviewQuestion,
  usePlayQuestion,
  vocabPlayQuestion,
  type PlayQuestion,
  type QuestionProvider,
} from "@/game-engine/play";
import { motion } from "framer-motion";
import { createPortal } from "react-dom";
import {
  tsunamiQuizEasyMore,
  tsunamiQuizHardMore,
  tsunamiQuizMedMore,
} from "@/data/englishGameQuizExtras";
import {
  TSUNAMI_SUBJECT_META,
  TSUNAMI_SUBJECT_ORDER,
  TSUNAMI_SUBJECT_QUIZ_BANKS,
  type SubjectQuizPools,
  type TsunamiCoreSubject,
  type TsunamiSubject,
  type TsunamiSubjectQuiz,
} from "@/data/tsunamiSubjectQuizBanks";
import { splitBankItemsByTier } from "@/lib/mergeGameQuizBank";
import type { FourChoiceQuiz, GameQuizBankResponse } from "@/types/gameQuiz";
import QuizFeedbackCard from "@/game-engine/QuizFeedbackCard";
import TsunamiScene3D, { TSUNAMI_LANE_COLORS, TSUNAMI_LANE_SYMBOLS, createRunnerView, type TsunamiFx } from "@/game-engine/scenes/TsunamiScene3D";
import { buildFeedback, type FeedbackCard } from "@/game-engine/feedback";
import {
  IDLE_GOOD_GATE_STATUS,
  TSUNAMI_GAME_ID,
  TSUNAMI_TUNING,
  createTsunamiDriver,
  gateHeightPx,
  gateLabelFits,
  gatesFitVertically,
  idleCrossingWasGood,
  laneForOption,
  tsunamiDirectorConfig,
  tuningFor,
  type TsunamiDriver,
  type TsunamiEvent,
} from "@/lib/tsunami/core";
import { OBSTACLE_SPECS } from "@/lib/tsunami/obstacles";
import { loadedGradeItems } from "@/data/gradeQuizBank/loader";

import { newScoreRunId, postGameScore } from "@/lib/gameScoreRunId";
const LS_XP = "websuli-tsunami-en-xp";
const LS_BEST = "websuli-tsunami-en-best-streak";

type Quiz = TsunamiSubjectQuiz & { optionIndices?: number[]; topic?: string | null };

const withSubject = (items: FourChoiceQuiz[], subject: TsunamiCoreSubject): TsunamiSubjectQuiz[] =>
  items.map((item) => ({ ...item, subject }));

/** 3–5. osztályos angol: alap → közép → nehezebb kérdések a menet előrehaladtával */
const QUIZ_BANK: FourChoiceQuiz[] = [
  {
    id: "1",
    prompt: "Hogy mondjuk angolul: piros?",
    options: ["red", "blue", "green", "yellow"],
    correctIndex: 0,
  },
  {
    id: "2",
    prompt: "Hogy mondjuk angolul: kék?",
    options: ["black", "blue", "brown", "white"],
    correctIndex: 1,
  },
  {
    id: "3",
    prompt: "Hogy mondjuk angolul: zöld?",
    options: ["gray", "pink", "green", "purple"],
    correctIndex: 2,
  },
  {
    id: "4",
    prompt: "Hogy mondjuk angolul: sárga?",
    options: ["yellow", "orange", "red", "blue"],
    correctIndex: 0,
  },
  {
    id: "5",
    prompt: "Hogy mondjuk angolul: egy?",
    options: ["two", "one", "three", "ten"],
    correctIndex: 1,
  },
  {
    id: "6",
    prompt: "Hogy mondjuk angolul: kettő?",
    options: ["three", "ten", "two", "five"],
    correctIndex: 2,
  },
  {
    id: "7",
    prompt: "Hogy mondjuk angolul: három?",
    options: ["tree", "three", "free", "thank you"],
    correctIndex: 1,
  },
  {
    id: "8",
    prompt: "Hogy mondjuk angolul: alma?",
    options: ["apple", "banana", "cat", "dog"],
    correctIndex: 0,
  },
  {
    id: "9",
    prompt: "Hogy mondjuk angolul: kutya?",
    options: ["duck", "dog", "frog", "fish"],
    correctIndex: 1,
  },
  {
    id: "10",
    prompt: "Hogy mondjuk angolul: macska?",
    options: ["cow", "cat", "bird", "pig"],
    correctIndex: 1,
  },
  {
    id: "11",
    prompt: "Mit jelent: Hello?",
    options: ["Viszlát!", "Köszönöm!", "Szia! / Helló!", "Elnézést!"],
    correctIndex: 2,
  },
  {
    id: "12",
    prompt: "Mit jelent: Thank you?",
    options: ["Kérem", "Köszönöm", "Szia", "Igen"],
    correctIndex: 1,
  },
  {
    id: "13",
    prompt: "Hogy mondjuk angolul: iskola?",
    options: ["school", "house", "park", "shop"],
    correctIndex: 0,
  },
  {
    id: "14",
    prompt: "Hogy mondjuk angolul: könyv?",
    options: ["bag", "book", "ball", "bed"],
    correctIndex: 1,
  },
  {
    id: "15",
    prompt: "Hogy mondjuk angolul: toll (író)?",
    options: ["pencil", "pen", "paper", "ruler"],
    correctIndex: 1,
  },
  {
    id: "16",
    prompt: "Hogy mondjuk angolul: asztal?",
    options: ["door", "table", "window", "chair"],
    correctIndex: 1,
  },
  {
    id: "17",
    prompt: "Hogy mondjuk angolul: fekete?",
    options: ["white", "black", "pink", "gray"],
    correctIndex: 1,
  },
  {
    id: "18",
    prompt: "Hogy mondjuk angolul: fehér?",
    options: ["white", "blue", "red", "brown"],
    correctIndex: 0,
  },
  {
    id: "19",
    prompt: "Hogy mondjuk angolul: narancssárga (szín)?",
    options: ["purple", "orange", "brown", "gold"],
    correctIndex: 1,
  },
  {
    id: "20",
    prompt: "Hogy mondjuk angolul: lila?",
    options: ["pink", "gray", "purple", "silver"],
    correctIndex: 2,
  },
  {
    id: "21",
    prompt: "Hogy mondjuk angolul: négy (szám)?",
    options: ["five", "four", "forty", "fourteen"],
    correctIndex: 1,
  },
  {
    id: "22",
    prompt: "Hogy mondjuk angolul: hat?",
    options: ["seven", "eight", "six", "sixty"],
    correctIndex: 2,
  },
  {
    id: "23",
    prompt: "Hogy mondjuk angolul: madár?",
    options: ["bear", "bird", "bee", "boat"],
    correctIndex: 1,
  },
  {
    id: "24",
    prompt: "Hogy mondjuk angolul: hal?",
    options: ["fox", "frog", "fish", "farm"],
    correctIndex: 2,
  },
  {
    id: "25",
    prompt: "Hogy mondjuk angolul: tej?",
    options: ["milk", "meat", "meal", "mouse"],
    correctIndex: 0,
  },
  {
    id: "26",
    prompt: "Hogy mondjuk angolul: kenyér?",
    options: ["butter", "bread", "break", "bridge"],
    correctIndex: 1,
  },
  {
    id: "27",
    prompt: "Hogy mondjuk angolul: testvér (általános)?",
    options: ["cousin", "sibling", "neighbor", "parent"],
    correctIndex: 1,
  },
  {
    id: "28",
    prompt: "Mit jelent: Good afternoon?",
    options: ["Jó reggelt", "Jó estét", "Jó napot (délután)", "Viszlát"],
    correctIndex: 2,
  },
  ...tsunamiQuizEasyMore,
];

/** Közép szakasz (3–4. osztály): napok, hónapok, egyszerű mondatok */
const HARD_QUIZ_EXTRA: FourChoiceQuiz[] = [
  {
    id: "h1",
    prompt: "Hogy mondjuk angolul: hétfő?",
    options: ["Sunday", "Monday", "Friday", "Tuesday"],
    correctIndex: 1,
  },
  {
    id: "h2",
    prompt: "Hogy mondjuk angolul: január?",
    options: ["June", "January", "July", "March"],
    correctIndex: 1,
  },
  {
    id: "h3",
    prompt: "Mit jelent: Good morning?",
    options: ["Jó estét", "Jó reggelt", "Viszlát", "Köszönöm"],
    correctIndex: 1,
  },
  {
    id: "h4",
    prompt: "Hogy mondjuk angolul: narancs (gyümölcs)?",
    options: ["apple", "grape", "orange", "lemon"],
    correctIndex: 2,
  },
  {
    id: "h5",
    prompt: "Hogy mondjuk angolul: lány?",
    options: ["boy", "girl", "baby", "teacher"],
    correctIndex: 1,
  },
  {
    id: "h6",
    prompt: "Hogy mondjuk angolul: fiú?",
    options: ["girl", "boy", "man", "sister"],
    correctIndex: 1,
  },
  {
    id: "h7",
    prompt: "Válaszd ki: I am a student.",
    options: ["Diák vagyok.", "Tanár vagyok.", "Otthon vagyok.", "Jó vagyok."],
    correctIndex: 0,
  },
  {
    id: "h8",
    prompt: "Hogy mondjuk angolul: öt (szám)?",
    options: ["four", "six", "five", "fifty"],
    correctIndex: 2,
  },
];

const QUIZ_ADDITIONAL_MED: FourChoiceQuiz[] = [
  {
    id: "m1",
    prompt: "Hogy mondjuk angolul: kedd?",
    options: ["Thursday", "Tuesday", "Wednesday", "Sunday"],
    correctIndex: 1,
  },
  {
    id: "m2",
    prompt: "Hogy mondjuk angolul: csütörtök?",
    options: ["Tuesday", "Thursday", "Friday", "Saturday"],
    correctIndex: 1,
  },
  {
    id: "m3",
    prompt: "Hogy mondjuk angolul: vasárnap?",
    options: ["Saturday", "Monday", "Sunday", "Friday"],
    correctIndex: 2,
  },
  {
    id: "m4",
    prompt: "Hogy mondjuk angolul: február?",
    options: ["January", "February", "March", "May"],
    correctIndex: 1,
  },
  {
    id: "m5",
    prompt: "Hogy mondjuk angolul: augusztus?",
    options: ["April", "June", "August", "October"],
    correctIndex: 2,
  },
  {
    id: "m6",
    prompt: "Hogy mondjuk angolul: tél?",
    options: ["spring", "summer", "autumn", "winter"],
    correctIndex: 3,
  },
  {
    id: "m7",
    prompt: "Hogy mondjuk angolul: tavasz?",
    options: ["spring", "winter", "summer", "fall"],
    correctIndex: 0,
  },
  {
    id: "m8",
    prompt: "Hogy mondjuk angolul: szoba?",
    options: ["road", "room", "river", "rain"],
    correctIndex: 1,
  },
  {
    id: "m9",
    prompt: "Hogy mondjuk angolul: kert?",
    options: ["game", "gate", "garden", "girl"],
    correctIndex: 2,
  },
  {
    id: "m10",
    prompt: "Válaszd ki: We are in the classroom.",
    options: ["Az osztályteremben vagyunk.", "Az udvaron vagyunk.", "Otthon vagyunk.", "A boltban vagyunk."],
    correctIndex: 0,
  },
  {
    id: "m11",
    prompt: "Melyik helyes: „Ő (lány) olvas.”?",
    options: ["He reads.", "She reads.", "It reads.", "They reads."],
    correctIndex: 1,
  },
  {
    id: "m12",
    prompt: "Mit jelent: How are you?",
    options: ["Hány éves vagy?", "Hogy vagy?", "Mi a neved?", "Honnan jöttél?"],
    correctIndex: 1,
  },
  {
    id: "m13",
    prompt: "Hogy mondjuk angolul: esős (idő)?",
    options: ["snowy", "windy", "rainy", "cloud"],
    correctIndex: 2,
  },
  {
    id: "m14",
    prompt: "Hogy mondjuk angolul: hideg (időjárás)?",
    options: ["hot", "warm", "cold", "cool"],
    correctIndex: 2,
  },
];

const QUIZ_HARD: FourChoiceQuiz[] = [
  {
    id: "x1",
    prompt: "Melyik igeforma illik: She ___ English every day.",
    options: ["study", "studies", "studying", "studied"],
    correctIndex: 1,
  },
  {
    id: "x2",
    prompt: "Melyik helyes: „Tegnap játszottam.”?",
    options: ["I play yesterday.", "I played yesterday.", "I playing yesterday.", "I plays yesterday."],
    correctIndex: 1,
  },
  {
    id: "x3",
    prompt: "Mit jelent: I am eating lunch.",
    options: ["Ebédelek.", "Ebédeltem.", "Ebédelni fogok.", "Nem eszem."],
    correctIndex: 0,
  },
  {
    id: "x4",
    prompt: "Melyik szó a helyes többes szám: one child → two ___",
    options: ["childs", "children", "childes", "childrens"],
    correctIndex: 1,
  },
  {
    id: "x5",
    prompt: "Válaszd ki: bigger =",
    options: ["kisebb", "nagyobb", "legnagyobb", "közepes"],
    correctIndex: 1,
  },
  {
    id: "x6",
    prompt: "Melyik elöljáró illik: I go ___ school every morning.",
    options: ["in", "on", "to", "at"],
    correctIndex: 2,
  },
  {
    id: "x7",
    prompt: "Mit jelent: I must do my homework.",
    options: ["Lehet, hogy házi lesz.", "Kell megcsinálnom a házi feladatom.", "Nem szeretek házi feladatot.", "Már megcsináltam."],
    correctIndex: 1,
  },
  {
    id: "x8",
    prompt: "Melyik mondat helyes?",
    options: ["He don't like apples.", "He doesn't like apples.", "He not like apples.", "He isn't like apples."],
    correctIndex: 1,
  },
  {
    id: "x9",
    prompt: "Hogy mondjuk angolul: unokaöcs / unokanővér (gyerek)?",
    options: ["cousin", "nephew", "aunt", "neighbor"],
    correctIndex: 0,
  },
  {
    id: "x10",
    prompt: "Melyik illik: There ___ many books on the desk.",
    options: ["is", "are", "am", "be"],
    correctIndex: 1,
  },
  {
    id: "x11",
    prompt: "Mit jelent: Could you help me, please?",
    options: ["Kérlek, segíts!", "Nem kérek segítséget.", "Tudsz segíteni, kérlek?", "Ne zavarj!"],
    correctIndex: 2,
  },
  {
    id: "x12",
    prompt: "Melyik szinoníma illik: The weather is very bad — it is ___.",
    options: ["sunny", "terrible", "lovely", "warm"],
    correctIndex: 1,
  },
  {
    id: "x13",
    prompt: "Válaszd ki: „Holnap megyünk a múzeumba.”",
    options: ["We go to the museum tomorrow.", "We went to the museum tomorrow.", "We going museum tomorrow.", "We are go museum tomorrow."],
    correctIndex: 0,
  },
  {
    id: "x14",
    prompt: "Melyik helyes: „Nem voltam otthon tegnap.”?",
    options: ["I wasn't at home yesterday.", "I am not at home yesterday.", "I not was home yesterday.", "I didn't be home yesterday."],
    correctIndex: 0,
  },
  ...tsunamiQuizHardMore,
];

const QUIZ_MED: FourChoiceQuiz[] = [...HARD_QUIZ_EXTRA, ...QUIZ_ADDITIONAL_MED, ...tsunamiQuizMedMore];

type GameDifficulty = "easy" | "normal" | "hard";

/**
 * J1a — „Hegyre fel!”: a régi 6 / 8 / 10 jó válaszos győzelem helyett a pálya hossza a cél (végrehajtás J1a 2.; a meglévő
 * nehézségi preset új értelmezése: könnyű 1200 m, közepes 1600 m, nehéz 2000 m).
 */
function levelDistanceFor(d: GameDifficulty): number {
  return TSUNAMI_TUNING[d].levelDistance;
}

/** A menet vége előtt (győzelem / a hullám) ennyi ideig látszik a pillanat, mielőtt az eredménykártya jön (ms). */
const END_PAUSE_MS = 900;
/** A tanító súgó ennyi ideig látszik a menet elején (világ-ms). */
const HINT_MS = 30_000;
/** Ennyi ms-onként jöhet villám (díszlet; csökkentett mozgásnál nincs — M9). */
const STORM_EVERY_MS = 7_000;

type Phase = "menu" | "play" | "over" | "won";

type SyncEligibility = { eligible: boolean; reason?: string };

type ActiveQuizPools = Record<TsunamiCoreSubject, SubjectQuizPools>;

type RunResult = { won: boolean; score: number; correct: number; total: number; bestStreak: number; distance: number; goal: number; shells: number; seconds: number };

function difficultyLabel(d: GameDifficulty): string {
  if (d === "easy") return "Könnyű";
  if (d === "hard") return "Nehéz";
  return "Közepes";
}

function loadNumber(key: string, fallback: number) {
  try {
    const v = localStorage.getItem(key);
    if (v == null) return fallback;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
}

/** A `?difficulty=` URL-paraméter, ha érvényes; különben `null` (az évfolyam dönt). */
function parseDifficultyFromSearch(): GameDifficulty | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("difficulty");
  if (q === "easy" || q === "hard" || q === "normal") return q;
  return null;
}

/** Spec 2026-09-29: tárgy-mód → a közös évfolyam-bank tárgyai (a vegyes mód a négy tárgy körforgása). */
const TSUNAMI_GRADE_SUBJECTS: Record<TsunamiSubject, GradeSubject[]> = {
  english: ["english"],
  math: ["math"],
  grammar: ["hungarian"],
  nature: ["science"],
  mixed: ["english", "math", "hungarian", "science"],
};

function tsunamiSubjectFromGradeSubject(subject: GradeSubject): TsunamiCoreSubject {
  if (subject === "hungarian") return "grammar";
  if (subject === "science" || subject === "history") return "nature";
  return subject;
}

/**
 * S9 / terv 4.6/1 — „könnyű grafika”: az ESZKÖZ képessége dönt (a `three-look` szintje, csökkentett mozgás, kevés
 * memória), nem az ablak szélessége vagy a mutató fajtája. Egyszer, betöltéskor fut: a jelenet így futás közben nem
 * épül újra (a `TsunamiScene3D` a `light` változására újraépülne).
 */
function isLowEnd(): boolean {
  if (typeof window === "undefined") return false;
  const lowTier = detectLookTier() === "low";
  const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const lowMem = typeof memory === "number" && memory <= 4;
  return lowTier || reduced || lowMem;
}

/** A régi szintes ág: a menet előrehaladása → a kívánt szint (0 könnyű, 1 közepes, 2 nehéz). */
function tierForProgress(eff: number): number {
  if (eff < 0.45) return 0;
  return eff < 0.82 ? 1 : 2;
}

/** A kapu-tábla felirata kétsoros méretre (a hosszú tananyag-válasz kisebb betűt kap). */
function gateLabelLong(label: string): boolean {
  return label.length > 22;
}

/** A sáv-tábla elrendezése: a sávok vetített közepe köré, egymástól legalább a tábla szélessége + 12 px-re (K.4/16). */
function gateLayout(stageW: number, laneX: readonly number[]): { centers: [number, number, number]; width: number } {
  const margin = 8;
  const width = Math.max(96, Math.min(160, Math.floor((stageW - 2 * margin - 24) / 3)));
  const mid = Math.min(stageW - margin - width * 1.5 - 12, Math.max(margin + width * 1.5 + 12, (laneX[1] ?? 0.5) * stageW));
  const proj = ((laneX[2] ?? 0.8) - (laneX[0] ?? 0.2)) * stageW * 0.5;
  const spacing = Math.max(width + 12, Math.min(proj, (stageW - 2 * margin - width) / 2));
  return { centers: [mid - spacing, mid, mid + spacing], width };
}

/**
 * Érintős vezérlősáv (tárcsa + Ugrás). `memo`: a lap a HUD (10 Hz) és a menet közben nyitott kérdés órája miatt is
 * újrarenderel; a tárcsának ezekhez semmi köze, csak a saját (stabil) propjai változásakor renderel (joystick-reakció
 * #49 render-mérője, PR #483 CI: a kérdés-renderek a tárcsán is megjelentek).
 */
const TsunamiTouchControls = memo(function TsunamiTouchControls({
  joyReset,
  onJoystick,
  jumpStart,
  jumpEnd,
}: {
  joyReset: number;
  onJoystick: (v: JoystickVector) => void;
  jumpStart: () => void;
  jumpEnd: () => void;
}) {
  return (
    /* G-8: touch-action:none — hosszú nyomásra a böngésző eddig kijelölt és görgetett, a futás megállt.
       S9: csak érintős eszközön; a sáv a biztonsági sávon belül, a hüvelykujjak alatt. D-J1a-1: a tárcsa
       analóg oldalirányú kormányzás a húzás mellett; az Ugrás akciógomb a jobb hüvelykujjnak. */
    <div
      className="tsunami-controls game-touch-layer"
      data-game-controls
      data-testid="tsunami-touch-controls"
      style={{
        touchAction: "none",
        userSelect: "none",
        WebkitTouchCallout: "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <VirtualJoystick label="Futás iránya" radius="auto" resetSignal={joyReset} onChange={onJoystick} />
      <HoldButton
        label="Ugrás"
        size="auto"
        onHoldStart={jumpStart}
        onHoldEnd={jumpEnd}
        className="flex-col gap-0.5 border-2 border-amber-100/70 bg-gradient-to-b from-amber-300 to-orange-500 text-slate-950 font-black shadow-[0_8px_24px_rgba(245,158,11,0.55)] active:scale-95 transition-transform"
      >
        <ArrowUp className="h-7 w-7" aria-hidden="true" />
        <span className="text-[13px] leading-none tracking-wide">UGRÁS</span>
      </HoldButton>
    </div>
  );
});

export default function TsunamiEscapeEnglish() {
  // Spec 2026-09-29: URL-paraméter nélkül a könnyű/közepes/nehéz alapértéke az évfolyamból jön.
  const [difficulty, setDifficulty] = useState<GameDifficulty>(
    () => parseDifficultyFromSearch() ?? difficultyForGrade(loadClassroomGrade()) ?? "normal",
  );
  /** A játékos kézzel (vagy URL-lel) választott nehézséget — ezt az évfolyam-váltás nem írja felül. */
  const difficultyChosenRef = useRef(parseDifficultyFromSearch() != null);
  const chooseDifficulty = useCallback((d: GameDifficulty) => {
    difficultyChosenRef.current = true;
    setDifficulty(d);
  }, []);
  const [subject, setSubject] = useState<TsunamiSubject>("mixed");
  const [phase, setPhase] = useState<Phase>("menu");
  /**
   * S9 / review #426: a fázis és a szünet SZINKRON tükre. A már ütemezett animációs képkocka és a késleltetett
   * folytatás a régi zárlattal futhat le a következő renderelés előtt; ezek a refet olvassák, ezért elavult hívás nem
   * válthat fázist.
   */
  const phaseNowRef = useRef<Phase>("menu");
  const goPhase = useCallback((p: Phase) => {
    phaseNowRef.current = p;
    setPhase(p);
  }, []);

  /**
   * LS-3b: the play-time coupon earned in a lesson, if there is one.
   *
   * Without a coupon this is inert and the game is exactly what it was before — free
   * play is the default and must stay that way.
   */
  const coupon = useCouponSession();
  const [totalXp, setTotalXp] = useState(() => loadNumber(LS_XP, 0));
  const [bestStreak, setBestStreak] = useState(() => loadNumber(LS_BEST, 0));
  const adaptiveRef = useRef(createAdaptiveSession(4));
  // Spec 2026-09-29-palyak-szoletra-nyelvek (E szelet): 10 pálya évfolyamonként (3–12.); a futás pályája a startkor rögzül.
  const runLevelRef = useRef<number | null>(null);
  const levelClearedRef = useRef(false);
  /** S9: az eszköz képességéből, egyszer (lásd `isLowEnd`). */
  const [lightGraphics] = useState<boolean>(isLowEnd);
  /** 3D scene layer: null until probed; false → the 2D canvas below is drawn instead (spec E7). */
  const [scene3d, setScene3d] = useState<boolean | null>(null);
  const domScene = scene3d === false;
  /** S9 / terv 4.5: szünet (kézi vagy automatikus, ha a lap háttérbe kerül). */
  const [paused, setPaused] = useState(false);
  const pausedNowRef = useRef(false);
  const goPaused = useCallback((p: boolean) => {
    pausedNowRef.current = p;
    setPaused(p);
  }, []);
  /** Futás-azonosító: minden indítás / kilépés növeli — a késleltetett hívás csak a saját futásában hat. */
  const runIdRef = useRef(0);
  /** Érintővezérlés csak érintős eszközön (S9 / terv 4.6/1, M5). */
  const touch = useTouchCapable();
  const haptics = useHaptics();
  const reducedMotion = useReducedMotion();
  const [, navigate] = useLocation();
  const bestScore = useBestScore("tsunami-english");
  const [bestResult, setBestResult] = useState<{ best: number; isNewBest: boolean } | null>(null);
  /** A tárcsa nullázása szünetkor / fázisváltáskor (beragadt irány ellen). */
  const [joyReset, setJoyReset] = useState(0);
  /** „Miért?” — a játékos kérte magyarázat (G-1: a közös QuizFeedbackCard); amíg nyitva van, a játék áll. */
  const [explainCard, setExplainCard] = useState<FeedbackCard | null>(null);
  const [expanded, setExpanded] = useState(false);
  const whyOpenRef = useRef(false);
  whyOpenRef.current = explainCard !== null || expanded;
  /** HUD-pillanatkép ≤ 10 Hz (KSZ-9): a képkocka-hurok nem ír React-állapotot. */
  const [hud, setHud] = useState({ distance: 0, goal: 1600, gap: 30, shells: 0, score: 0, combo: 0, multiplier: 1, lane: 1, hint: 0, danger: 0 });
  const [result, setResult] = useState<RunResult | null>(null);
  const [stormFlash, setStormFlash] = useState(false);
  /** D-J1a-17 (ÚK2): annak a kérdésnek az azonosítója, amelynek JÓ kapuján a gyerek bemenet nélkül futott át. */
  const [idleGoodId, setIdleGoodId] = useState<number | null>(null);
  /**
   * Élesítés (átmeneti kapu 3a): a válaszcélok (táblák, lista módban a gombok) akkor jelennek meg, amikor a meghajtó már
   * elfogadja az érintést (`driver.armedPresentationId()`, a kérdés-órával: `ANSWER_ARM_MS`). Korábban 450 ms valós idő
   * után — lassú képkockánál (a kérdés-óra képkockánként legfeljebb 250 ms-ot lép) a tábla már látszott, de az érintést a
   * meghajtó még elnyelte. A képkocka-hurok állítja, kérdésenként egyszer.
   */
  const [armedId, setArmedId] = useState<number | null>(null);
  const armedNowRef = useRef<number | null>(null);
  /** A menet kulcsa: minden indítás növeli, a képkocka-hurok effektje ezen is újraindul (review #483). */
  const [runKey, setRunKey] = useState(0);

  /** A billentyűk (a bemenet-mérő `inX`-éhez) és a tárcsa analóg értéke. */
  const keysRef = useRef({ left: false, right: false });
  /** Joystick-reakció (#49): az analóg tárcsa vízszintes értéke (−1…1, a görbével). */
  const stickXRef = useRef(0);
  const stickJumpArmedRef = useRef(true);
  // Joystick-reakció (#49): a bemenet → válasz mérő kampója (csak teszt-kampós buildben él).
  countRender("tsunami-page");
  const timeoutsRef = useRef<number[]>([]);
  // D4: unmountkor az összes pending timeout törlése
  useEffect(() => () => { timeoutsRef.current.forEach(clearTimeout); }, []);

  const { data: quizBankResponse } = useQuery<GameQuizBankResponse>({
    queryKey: ["/api/games/quiz-bank/tsunami-english"],
    queryFn: async () => {
      const r = await fetch("/api/games/quiz-bank/tsunami-english", { credentials: "include" });
      if (!r.ok) return { gameId: "tsunami-english", items: [] };
      return r.json() as Promise<GameQuizBankResponse>;
    },
    staleTime: 10 * 60 * 1000,
  });

  // Játékos osztály-specifikus tananyag-kvíz bank (Claude-generált) — minden material-tétel az `english` subject `med`
  // (medium) tier-jébe kerül, függetlenül a topic-tól, így az alap "english" mode-ban (ami a leggyakoribb) elérhető.
  const { grade: userGrade } = useClassroomGrade();
  const levels = useGradeLevel("tsunami", userGrade);
  const { items: materialItems } = useMaterialQuizzes(userGrade, undefined, coupon.lessonId);
  /**
   * S9 / A8: angol kérdések a központi szóbankból, a közös naplóval. Bekapcsolva angol ÉS vegyes módban (a vegyes
   * kör is ad angol kérdést); a bekötés ezzel az egy hívással kapcsolható ki. `null` → a kézi bank megy.
   */
  const vocab = useVocabQuizSource("en", subject === "english" || subject === "mixed");
  const vocabRef = useRef(vocab);
  vocabRef.current = vocab;

  // Évfolyam-váltáskor (pl. a ClassroomGateModal után) az alapérték követi az évfolyamot, amíg a játékos nem választott kézzel.
  useEffect(() => {
    if (difficultyChosenRef.current) return;
    const fromGrade = difficultyForGrade(userGrade);
    if (fromGrade) setDifficulty(fromGrade);
  }, [userGrade]);

  const mergedPools = useMemo<ActiveQuizPools>(() => {
    const { easy, medium, hard } = splitBankItemsByTier(quizBankResponse?.items);
    const matMed = materialItems
      .filter(isPlayableQuestion)
      .map((q, idx) => ({
        id: q.id ?? `mat-${idx}`,
        prompt: q.prompt,
        options: [...q.options],
        correctIndex: q.correctIndex,
        // T-1: a bankból jövő magyarázat, ha a lecke exportja hozta.
        explanation: q.explanation ?? undefined,
      }));
    const english: SubjectQuizPools = {
      easy: [...withSubject(QUIZ_BANK, "english"), ...withSubject(easy, "english")],
      med: [...withSubject(QUIZ_MED, "english"), ...withSubject(medium, "english"), ...withSubject(matMed, "english")],
      hard: [...withSubject(QUIZ_HARD, "english"), ...withSubject(hard, "english")],
    };
    return {
      english,
      ...TSUNAMI_SUBJECT_QUIZ_BANKS,
    };
  }, [quizBankResponse, materialItems]);

  const rewardQuestionsRef = useRef<Quiz[]>([]);
  rewardQuestionsRef.current = coupon.active ? materialItems.map((q, i) => ({ ...q, id: q.id ?? `mat-${i}`, explanation: q.explanation ?? undefined, subject: "english" })) : [];
  const mergedPoolsRef = useRef(mergedPools);
  mergedPoolsRef.current = mergedPools;

  /** Spec 2026-09-29: a közös évfolyam-bank állapota (a `pickQuiz` refeken át olvassa). */
  const userGradeRef = useRef(userGrade);
  userGradeRef.current = userGrade;
  const gradeSeenRef = useRef(createGradeQuizSeen());
  const gradeSubjectRoundRef = useRef(0);
  const materialQuizzes = useMemo<Quiz[]>(
    () =>
      materialItems.filter(isPlayableQuestion).map((q, idx) => ({
        id: q.id ?? `mat-${idx}`,
        prompt: q.prompt,
        options: [...q.options],
        correctIndex: q.correctIndex,
        explanation: q.explanation ?? undefined,
        subject: "english" as const,
      })),
    [materialItems],
  );
  const materialQuizzesRef = useRef(materialQuizzes);
  materialQuizzesRef.current = materialQuizzes;
  /**
   * S13 / átfogó review L1: a lecke-tananyagból jövő kérdés (bármely tárgyú, a játékban „english” címkével fut) NEM
   * kézi angol kérdés — a helyes válasza nem kerülhet a közös szóbank-naplóba (a többi játék is kizárja a tananyagot).
   */
  const materialPromptsRef = useRef<Set<string>>(new Set());
  materialPromptsRef.current = useMemo(() => new Set(materialItems.map((q) => q.prompt)), [materialItems]);

  const { data: syncEligibility } = useQuery<SyncEligibility>({
    queryKey: ["/api/games/sync-eligibility"],
  });

  const syncBanner = useMemo(() => {
    if (!syncEligibility) return "Felhő szinkron ellenőrzése…";
    if (syncEligibility.eligible) {
      return "Be vagy jelentkezve Google-lal, és az e-mail címed rajta van a listán — a kör vége felkerül a ranglistára.";
    }
    switch (syncEligibility.reason) {
      case "not_logged_in":
        return "Nem vagy bejelentkezve — a helyi XP megmarad, felhő ranglista nincs.";
      case "google_only":
        return "Csak Google bejelentkezéssel menthető a pont a szerverre (OAuth).";
      case "not_on_mailing_list":
        return "Az e-mail címed nincs a WebSuli értesítő listáján — iratkozz fel, vagy kérj meghívót.";
      default:
        return "A felhő szinkron most nem elérhető.";
    }
  }, [syncEligibility]);

  /* ---------------- a menet seedje, a meghajtó (mag + fix lépésű hurok), a kérdés-sáv ---------------- */

  const seedBase = useMemo(() => readGameSeed() ?? seedFrom(TSUNAMI_GAME_ID, new Date().toISOString().slice(0, 10)), []);
  const runIndexRef = useRef(0);
  const runSeedRef = useRef<string | number>(seedFrom(seedBase, 0));
  /** A kérdés-választás seedelt véletlenje (K.6: a lap játékmenet-kódja sem húz Math.random-ot). */
  const pickRngRef = useRef<Rng>(createRng(seedFrom(TSUNAMI_GAME_ID, runSeedRef.current, "pick")));
  const runDifficultyRef = useRef<GameDifficulty>("normal");
  const runSubjectRef = useRef<TsunamiSubject>("mixed");
  const subjectRoundRef = useRef(0);
  /** S9: a futás MINDEN kiadott kérdése (`{ id, prompt }`) — az ismétlés-szűrés a teljes futásra érvényes. */
  const runSeenRef = useRef<SeenItem[]>([]);
  /** A tananyag-kérdés témája a kulcsa szerint (a kérdés-címke a közös `quizTopicLabelHu`-val). */
  const topicByKeyRef = useRef(new Map<string, string>());
  const viewRef = useRef(createRunnerView());
  const qRef = useRef<ReturnType<typeof usePlayQuestion>>(null as unknown as ReturnType<typeof usePlayQuestion>);
  const driverRef = useRef<TsunamiDriver | null>(null);
  const makeDriver = (seed: string | number, d: GameDifficulty, wavePace: number): TsunamiDriver =>
    createTsunamiDriver({
      seed,
      tuning: tuningFor(d, wavePace),
      questions: {
        frame: (c, ctx) => qRef.current?.frame(c, ctx),
        timeScale: () => qRef.current?.timeScale() ?? 1,
        finished: () => qRef.current?.finished() ?? true,
        finish: () => qRef.current?.finish(),
        pick: (i, c) => qRef.current?.pick(i, c) ?? null,
        active: () => qRef.current?.active() ?? null,
      },
      intensity: () => qRef.current?.director?.intensity() ?? 0.4,
      reducedMotion,
    });
  if (!driverRef.current) driverRef.current = makeDriver(runSeedRef.current, difficulty, 1);
  viewRef.current.core = driverRef.current.core;
  const fpsRef = useRef(60);

  /** A menet előrehaladása 0..1 (a régi szintes kérdés-választóhoz). */
  const progressRef = useRef(0);

  /**
   * A kérdés-választás (a meglévő forrásrend): nem látott tananyag → (S9) angol helyen a központi szóbank → a közös
   * évfolyam-bank a tárgy-mód tárgyaiból → a régi szintes kézi bank. A director a `material()` ágat a `fresh()` ELŐTT
   * kérdezi (terv 4.1/5, K.2 „Forrásrend”), és a menetben feltett kulcsot nem kéri újra.
   */
  const pickQuiz = useCallback((band: number = adaptiveRef.current.band): Quiz => {
    const d = runDifficultyRef.current;
    const activeSubject = runSubjectRef.current;
    const p = progressRef.current;
    let eff = p;
    if (d === "hard") eff = Math.min(1, p * 1.22);
    if (d === "easy") eff = p * 0.78;
    const rng = pickRngRef.current.next;

    /**
     * S9: minden kiadott kérdés a futás listájába (`runSeenRef`) és az évfolyam-bank `seen`-jébe kerül, így a
     * teljes futásban egyik ág sem ismétel. A kézi (nem szóbankos) angol kérdés helyes válasza a közös szóbank-
     * naplóba is bekerül (`markExternal`), hogy ugyanaz a szó ne jöjjön vissza a bankból. Az opciók sorrendjét a
     * director keveri (seedelten), itt nincs keverés.
     */
    const issue = (q: Quiz): Quiz => {
      runSeenRef.current.push({ id: q.id, prompt: q.prompt });
      markGradeQuizSeen(gradeSeenRef.current, q);
      if (q.subject === "english" && !q.id.startsWith("vocab:") && !materialPromptsRef.current.has(q.prompt)) {
        vocabRef.current?.markExternal(q.options[q.correctIndex] ?? "");
      }
      return q;
    };
    const englishLevel = (b: number) => vocabLevelForGrade(userGradeRef.current, b);

    // Spec 2026-09-29: 3–12. évfolyamon (kupon-tananyag nélkül) nem látott tananyag-kvíz → (S9) angol helyen a
    // központi szóbank → a közös évfolyam-bank a tárgy-mód tárgyaiból, a sávot a nehézség-gomb eltolja → a régi
    // szintes választás.
    const sharedGrade = gradeForGame(userGradeRef.current);
    if (sharedGrade != null && rewardQuestionsRef.current.length === 0) {
      const seen = gradeSeenRef.current;
      if (activeSubject === "english" || activeSubject === "mixed") {
        const material = pickUnseenMaterial(materialQuizzesRef.current, seen);
        if (material) return issue(material);
      }
      const subjects = TSUNAMI_GRADE_SUBJECTS[activeSubject];
      const gradeBand = clampBand(band + bandShiftForDifficulty(d));
      for (let i = 0; i < subjects.length; i++) {
        const gradeSubject = subjects[gradeSubjectRoundRef.current++ % subjects.length]!;
        if (gradeSubject === "english" && vocabRef.current) {
          const fromBank = vocabRef.current.next(englishLevel(gradeBand));
          if (fromBank) return issue({ ...fromBank, subject: "english", topic: null });
        }
        const item = pickGradeQuiz({ grade: sharedGrade, band: gradeBand, subjects: [gradeSubject], seen, rng });
        if (!item) continue;
        return issue({
          id: item.id,
          prompt: item.prompt,
          options: [...item.options],
          correctIndex: item.correctIndex,
          explanation: item.explanation,
          subject: tsunamiSubjectFromGradeSubject(item.subject),
        });
      }
    }

    // Kupon-tananyag: a lecke kérdései, futáson belül ismétlés nélkül (kimerülésnél a legrégebben látott).
    if (rewardQuestionsRef.current.length) {
      const reward = pickUnseen([rewardQuestionsRef.current], 0, runSeenRef.current, rng);
      if (reward) return issue(reward);
    }

    const subjectKey =
      activeSubject === "mixed"
        ? TSUNAMI_SUBJECT_ORDER[subjectRoundRef.current++ % TSUNAMI_SUBJECT_ORDER.length]!
        : activeSubject;
    if (subjectKey === "english") {
      // A tananyag elsőbbsége ebben az ágban is (1–2. évfolyam, leckéből indított játék), utána a szóbank.
      const material = pickUnseenMaterial(materialQuizzesRef.current, gradeSeenRef.current);
      if (material) return issue(material);
      if (vocabRef.current) {
        const fromBank = vocabRef.current.next(englishLevel(band));
        if (fromBank) return issue({ ...fromBank, subject: "english", topic: null });
      }
    }
    const { easy: poolE, med: poolM, hard: poolH } = mergedPoolsRef.current[subjectKey];
    // S9: a teljes futás kiadott kérdéseit kerüli (nem csak az utolsó ötöt); a kívánt szint elfogyása után a
    // szomszéd szint jön, és csak teljes kimerülésnél ismétel (a legrégebben látottat).
    const picked = pickUnseen([poolE, poolM, poolH], tierForProgress(eff), runSeenRef.current, rng);
    return issue(picked ?? poolE[0]!);
  }, []);

  /** A választott kérdés → a közös kérdés-életciklus tétele (egységes ismétlési kulcs a hét játékban). */
  const toPlayQuestion = useCallback((q: Quiz): PlayQuestion => {
    const grade = userGradeRef.current ?? undefined;
    if (q.topic) topicByKeyRef.current.set(`mat:${q.id}`, q.topic);
    // A szóbank tétele a saját mezőivel (vocabId, nyelv, felolvasható szöveg) érkezik (`{ ...fromBank, subject, topic }`).
    if ("vocabId" in q && "lang" in q) return { ...vocabPlayQuestion(q as unknown as VocabQuiz), subject: "english" };
    if (materialPromptsRef.current.has(q.prompt)) return materialPlayQuestion(q, { subject: q.subject, coupon: coupon.active, ...(grade !== undefined ? { grade } : {}) });
    const gradeItem = loadedGradeItems().find((g) => g.id === q.id);
    if (gradeItem) return gradePlayQuestion(gradeItem);
    return bankPlayQuestion(TSUNAMI_GAME_ID, q, q.subject, grade);
  }, [coupon.active]);

  /** Teszt-kampó (D-J1a-11): a következő kérdés a forrásokban talált leghosszabb válaszokat hordozza. */
  const forceLongRef = useRef(false);
  const forceLongPromptRef = useRef(false);
  /** Teszt-kampó (D-J1a-18): a következő kérdés pontosan ezekkel a válaszokkal (az első a helyes). */
  const forceAnswersRef = useRef<string[] | null>(null);
  const forcedSeqRef = useRef(0);
  /** A kézi bankok, a tananyag és a betöltött évfolyam-bank három leghosszabb válasza (programmal kikeresve). */
  const longestAnswerQuiz = (): Quiz => {
    const all = new Set<string>();
    for (const pools of Object.values(mergedPoolsRef.current)) for (const tier of [pools.easy, pools.med, pools.hard]) for (const item of tier) for (const o of item.options) all.add(o);
    for (const m of materialQuizzesRef.current) for (const o of m.options) all.add(o);
    for (const g of loadedGradeItems()) for (const o of g.options) all.add(o);
    const top = [...all].sort((a, b) => b.length - a.length || a.localeCompare(b)).slice(0, 3);
    // ÚK3 (újra-review #483): `longPrompt` — a leghosszabb kérdés-szöveg is a forrásokból (a legnehezebb álló elrendezés).
    let prompt = "Melyik válasz a leghosszabb a játék kérdései közül? (próba)";
    if (forceLongPromptRef.current) {
      forceLongPromptRef.current = false;
      const prompts: string[] = [];
      for (const pools of Object.values(mergedPoolsRef.current)) for (const tier of [pools.easy, pools.med, pools.hard]) for (const item of tier) prompts.push(item.prompt);
      for (const m of materialQuizzesRef.current) prompts.push(m.prompt);
      for (const g of loadedGradeItems()) prompts.push(g.prompt);
      prompt = prompts.sort((a, b) => b.length - a.length || a.localeCompare(b))[0] ?? prompt;
    }
    return { id: "test-long-answers", prompt, options: top, correctIndex: 0, subject: "english" };
  };

  const provider = useMemo<QuestionProvider>(
    () => ({
      // Kupon módban csak a lecke tananyaga kérdez (meglévő szabály, terv 8.6).
      get couponOnly() {
        return rewardQuestionsRef.current.length > 0;
      },
      material: (ctx) => {
        // Teszt-kampó (mobil mérő hosszú-válasz esete, D-J1a-11): a programmal kikeresett leghosszabb válaszok egy kérdésben.
        if (forceLongRef.current) {
          forceLongRef.current = false;
          return materialPlayQuestion(longestAnswerQuiz(), { subject: "english" });
        }
        // Teszt-kampó (D-J1a-18): kényszerített válaszok (egysoros / kétsoros eset determinisztikus mérése).
        const forced = forceAnswersRef.current;
        if (forced) {
          forceAnswersRef.current = null;
          forcedSeqRef.current += 1;
          return materialPlayQuestion(
            { id: `test-forced-${forcedSeqRef.current}`, prompt: "Melyik a jó válasz? (próba)", options: forced, correctIndex: 0 },
            { subject: "english" },
          );
        }
        if (rewardQuestionsRef.current.length > 0) {
          const reward = rewardQuestionsRef.current.find((r) => !runSeenRef.current.some((s) => s.id === r.id));
          if (!reward) return null;
          runSeenRef.current.push({ id: reward.id, prompt: reward.prompt });
          return materialPlayQuestion(reward, { subject: reward.subject, coupon: true, couponItemId: reward.id });
        }
        const subj = runSubjectRef.current;
        if (subj !== "english" && subj !== "mixed") return null;
        // D-J1a-11 (review #483, M3): a director `accept`-je (befér a sávba és a kapu-táblába) — az elfogadott tananyag előbb.
        const unseen = materialQuizzesRef.current.filter((m) => !isGradeQuizSeen(gradeSeenRef.current, m));
        const material = (ctx?.accept ? unseen.find((m) => ctx.accept!(m)) : undefined) ?? unseen[0] ?? null;
        if (!material) return null;
        runSeenRef.current.push({ id: material.id, prompt: material.prompt });
        markGradeQuizSeen(gradeSeenRef.current, material);
        return materialPlayQuestion(material, { subject: material.subject, ...(userGradeRef.current != null ? { grade: userGradeRef.current } : {}) });
      },
      fresh: ({ band }) => toPlayQuestion(pickQuiz(band)),
      // Az ismétlési sor KÖZÖS a hét játékban: a saját tétel, a szóbank (angol) és az évfolyam-bank tétele állítható vissza.
      restore: (item) =>
        // Más játék saját (kézi) bankjának tétele nem jön vissza itt (review #451 mintája); a tananyag, a szóbank és az
        // évfolyam-bank közös.
        item.key.startsWith("bank:") && !item.key.startsWith(`bank:${TSUNAMI_GAME_ID}:`)
          ? null
          : restoreReviewQuestion(item, {
          vocab: (lang) => (lang === "en" ? vocabRef.current : null),
          gradeItem: (id) => loadedGradeItems().find((g) => g.id === id) ?? null,
        }),
    }),
    [pickQuiz, toPlayQuestion],
  );
  const directorConfig = useMemo(() => tsunamiDirectorConfig(userGrade ?? null), [userGrade]);

  const q = usePlayQuestion({
    setup: { config: directorConfig, provider, startBand: adaptiveRef.current.band, seed: runSeedRef.current },
    onOutcome: (o, p) => {
      // D-J1a-17 (ÚK2): a tétlen átfutás a JÓ kapun — a kimenet alkalmazása ELŐTT kérdezzük (utána a kapu jelzése törlődik).
      const core = driverRef.current?.core;
      const idleGood = !!core && o.result === "timeout" && idleCrossingWasGood(core.state(), p.options.findIndex((opt) => opt.correct));
      setIdleGoodId(idleGood ? p.id : null);
      driverRef.current?.onOutcome(o, p);
      if (o.result === "aborted") return;
      adaptiveRef.current.answer(o.result === "correct");
      // A kupon-bónusz a VALÓS választással (az eredeti opció-index — terv 8.7).
      if (o.pickedOriginalIndex !== null) maybeClaimCouponBonus(coupon, p.question.couponItemId ?? p.question.quiz.id, o.pickedOriginalIndex);
    },
  });
  qRef.current = q;

  const startGame = useCallback(() => {
    runIdRef.current += 1;
    runIndexRef.current += 1;
    // Új menet: a kérdés-azonosítók újra 1-től indulnak — a régi élesítés ne öröklődjön.
    armedNowRef.current = null;
    setArmedId(null);
    const seed = seedFrom(seedBase, runIndexRef.current);
    runSeedRef.current = seed;
    pickRngRef.current = createRng(seedFrom(TSUNAMI_GAME_ID, seed, "pick"));
    runLevelRef.current = levels.level;
    levelClearedRef.current = false;
    adaptiveRef.current.reset(userGrade ?? 4, runLevelRef.current);
    runDifficultyRef.current = difficulty;
    runSubjectRef.current = subject;
    subjectRoundRef.current = 0;
    gradeSubjectRoundRef.current = 0;
    runSeenRef.current = [];
    gradeSeenRef.current = createGradeQuizSeen();
    progressRef.current = 0;
    // Pályán a sáv mérsékelten gyorsítja / lassítja a hullámot (E szelet, D8); pálya nélkül a régi tempó.
    const wavePace = runLevelRef.current == null ? 1 : tsunamiWaterPace(adaptiveRef.current.band);
    driverRef.current = makeDriver(seed, difficulty, wavePace);
    viewRef.current.core = driverRef.current.core;
    viewRef.current.fx.length = 0;
    keysRef.current.left = false;
    keysRef.current.right = false;
    stickXRef.current = 0;
    scoreSubmittedRef.current = false;
    q.reset(seed, adaptiveRef.current.band);
    goPaused(false);
    setExplainCard(null);
    setExpanded(false);
    setBestResult(null);
    setNewlyUnlocked([]);
    setResult(null);
    const st = driverRef.current.core.state();
    setHud({ distance: 0, goal: levelDistanceFor(difficulty), gap: st.waveGap, shells: 0, score: 0, combo: 0, multiplier: 1, lane: 1, hint: 1, danger: 0 });
    // Review #483: a szünetmenü „Újrakezdés”-e a „play” fázisban marad — a képkocka-hurok a menet kulcsára is újraindul.
    setRunKey((k) => k + 1);
    goPhase("play");
  }, [difficulty, subject, userGrade, levels.level, q, seedBase]);

  /** A menet lezárása: a kérdés-sáv már lezárt (settled); az eredmény a director valós statisztikájából. */
  const endRun = useCallback((won: boolean, forcedCorrect?: number) => {
    const ctl = qRef.current;
    if (!ctl.finished()) ctl.finish();
    const driver = driverRef.current!;
    const st = driver.core.state();
    const stats = ctl.director?.stats(driver.clockMs());
    const correct = Math.max(stats?.correct ?? 0, forcedCorrect ?? 0);
    const total = Math.max(correct, (stats?.correct ?? 0) + (stats?.wrong ?? 0) + (stats?.timeouts ?? 0));
    setExplainCard(null);
    setExpanded(false);
    setResult({
      won,
      score: st.score,
      correct,
      total,
      bestStreak: st.combo.best,
      distance: Math.round(st.distance),
      goal: driver.core.tuning().levelDistance,
      shells: st.shellCount,
      seconds: Math.round(driver.clockMs() / 1000),
    });
    goPhase(won ? "won" : "over");
  }, []);

  /** S9 / terv 4.5: szünet — a játékciklus és a kérdés-óra áll, a vezérlés elenged. */
  const pauseGame = useCallback(() => {
    if (phase !== "play") return;
    keysRef.current.left = false;
    keysRef.current.right = false;
    stickXRef.current = 0;
    setJoyReset((n) => n + 1);
    goPaused(true);
  }, [phase]);

  const resumeGame = useCallback(() => {
    goPaused(false);
  }, []);

  const exitToMenu = useCallback(() => {
    runIdRef.current += 1;
    goPaused(false);
    qRef.current.finish();
    setExplainCard(null);
    setExpanded(false);
    goPhase("menu");
  }, []);

  /* ---------------- „Miért?”: szünet + a valódi magyarázókártya (G-1, terv 9.) ---------------- */
  const openWhy = useCallback(() => {
    const item = qRef.current.view().whyItem;
    if (!item) return;
    setExplainCard(
      buildFeedback({
        quiz: {
          prompt: item.quiz.prompt,
          options: item.quiz.options,
          correctIndex: item.quiz.correctIndex,
          // A séma `null`-t is enged (régi sor); a motor `undefined`-ot vár.
          explanation: item.quiz.explanation ?? undefined,
        },
        chosenIndex: item.pickedOriginalIndex,
        // Egyetlen próbálkozás van (a megoldás a pályán látszik, újrapróba nincs — terv 9.).
        attempt: 1,
        ageBand: "kid",
      }),
    );
  }, []);
  const dismissExplain = useCallback(() => setExplainCard(null), []);

  /** A kérdés-sáv nyitott (nem kijelzés alatti) kérdése — erre lehet válaszolni. */
  const quiz = q.state.presentation && !q.state.reveal ? q.state.presentation : null;
  /**
   * Válasz a kapu-táblán (érintés) vagy az 1–3 billentyűvel: a futó a sávba fut, és a kérdés azonnal eldől (D-J1a-2).
   * S13 / review K1: szünetben (és a „Miért?” alatt) nincs válasz.
   */
  const onAnswer = (index: number) => {
    if (!quiz || paused) return;
    if (whyOpenRef.current) return;
    driverRef.current?.tapOption(index);
  };
  const answerRef = useRef(onAnswer);
  answerRef.current = onAnswer;

  // A győzelem a következő pályát oldja fel; a menü azt ajánlja.
  useEffect(() => {
    if (phase === "won" && runLevelRef.current != null && !levelClearedRef.current) {
      levelClearedRef.current = true;
      levels.complete(runLevelRef.current);
    }
  }, [phase]);

  // R = új futam az "over" / "won" / "menu" képernyőn (csak a gyerek billentyűjére — nincs automatikus újraindítás).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "r" && e.key !== "R") return;
      if (phase === "over" || phase === "won" || phase === "menu") {
        e.preventDefault();
        startGame();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, startGame]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_XP, String(totalXp));
    } catch {
      /* ignore */
    }
  }, [totalXp]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_BEST, String(bestStreak));
    } catch {
      /* ignore */
    }
  }, [bestStreak]);

  /* ---------------- bemenet: billentyű (←/→ A/D sáv, ↑ W szóköz ugrás), húzás, tárcsa, Ugrás gomb ---------------- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (phaseNowRef.current !== "play" || pausedNowRef.current || whyOpenRef.current || e.repeat) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const input = driverRef.current?.core.input;
      if (!input) return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        keysRef.current.left = true;
        input.laneDelta -= 1;
        e.preventDefault();
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        keysRef.current.right = true;
        input.laneDelta += 1;
        e.preventDefault();
      } else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W" || e.key === " ") {
        input.jump = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keysRef.current.left = false;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keysRef.current.right = false;
    };
    const reset = () => {
      keysRef.current.left = false;
      keysRef.current.right = false;
      stickXRef.current = 0;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", reset);
    };
  }, []);

  useEffect(() => {
    if (phase === "play") return;
    keysRef.current.left = false;
    keysRef.current.right = false;
    stickXRef.current = 0;
  }, [phase]);

  // Joystick-reakció (#49): a bemenet → válasz mérő kampója (csak teszt-kampós buildben él).
  useEffect(
    () =>
      registerInputProbe("tsunami", () => ({
        x: 50 + (driverRef.current?.core.state().x ?? 0) * 35,
        inX: (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0) + stickXRef.current,
      })),
    [],
  );

  // Joystick-reakció (#49): analóg, folytonos görbe — az oldalirány a tárcsa vízszintes értéke; erős felfelé = ugrás.
  const onJoystick = useCallback((v: JoystickVector) => {
    const shaped = shapeJoystick(v);
    stickXRef.current = shaped.x;
    if (shaped.y > 0.75 && stickJumpArmedRef.current) {
      stickJumpArmedRef.current = false;
      const input = driverRef.current?.core.input;
      if (input && !pausedNowRef.current) input.jump = true;
    } else if (shaped.y < 0.35) {
      stickJumpArmedRef.current = true;
    }
  }, []);
  const jumpStart = useCallback(() => {
    const input = driverRef.current?.core.input;
    if (input && !pausedNowRef.current && !whyOpenRef.current) input.jump = true;
  }, []);
  const jumpEnd = useCallback(() => {}, []);

  /** Húzás a játéktéren (terv 5.1): ≥ 30 px vízszintesen = sávváltás, felfelé = ugrás; egy gesztusban több is (mutatónként). */
  const swipesRef = useRef(new Map<number, { x: number; y: number }>());
  const onStagePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== undefined && e.button > 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* a szintetikus esemény nem foglalható le — a húzás így is működik */
    }
    swipesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }, []);
  const onStagePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const s = swipesRef.current.get(e.pointerId);
    if (!s || pausedNowRef.current || whyOpenRef.current) return;
    const input = driverRef.current?.core.input;
    if (!input) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) >= 30 && Math.abs(dx) > Math.abs(dy)) {
      input.laneDelta += dx > 0 ? 1 : -1;
      s.x = e.clientX;
      s.y = e.clientY;
    } else if (dy <= -30 && Math.abs(dy) > Math.abs(dx)) {
      input.jump = true;
      s.x = e.clientX;
      s.y = e.clientY;
    }
  }, []);
  const onStagePointerEnd = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    swipesRef.current.delete(e.pointerId);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  /**
   * D-J1a-9 (review #483, M1): a kapu-táblán INDÍTOTT mozdulat. A mozdulatlansági küszöb (`TAP_STILL_PX`) fölött nem koppintás,
   * hanem húzás: ugyanaz a sávváltás- / ugrás-kezelő kapja, mint a játéktér húzó rétege (válasz nem rögzül). Csak a rövid,
   * mozdulatlan koppintás választ; billentyűvel (Enter / Szóköz: `click` `detail === 0`) is.
   */
  const gateDownRef = useRef(new Map<number, { x: number; y: number; moved: boolean; option: number }>());
  const gateHandlers = (option: number) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      if (e.button !== undefined && e.button > 0) return;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* a szintetikus esemény nem foglalható le */
      }
      gateDownRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: false, option });
      swipesRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    },
    onPointerMove: (e: ReactPointerEvent<HTMLButtonElement>) => {
      const d = gateDownRef.current.get(e.pointerId);
      if (!d) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_STILL_PX) d.moved = true;
      onStagePointerMove(e as unknown as ReactPointerEvent<HTMLDivElement>);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const d = gateDownRef.current.get(e.pointerId);
      gateDownRef.current.delete(e.pointerId);
      swipesRef.current.delete(e.pointerId);
      if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
      if (d && !d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= TAP_STILL_PX) answerRef.current(d.option);
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLButtonElement>) => {
      gateDownRef.current.delete(e.pointerId);
      swipesRef.current.delete(e.pointerId);
    },
    onLostPointerCapture: (e: ReactPointerEvent<HTMLButtonElement>) => {
      gateDownRef.current.delete(e.pointerId);
      swipesRef.current.delete(e.pointerId);
    },
    onClick: (e: { detail: number }) => {
      // Billentyűzet (Enter / Szóköz): `detail === 0`. A mutatós választást a pointerup intézte.
      if (e.detail === 0) answerRef.current(option);
    },
  });

  /* ---------------- képkocka-hurok (requestGameFrame): kérdés-óra, sim, rajz ---------------- */
  const stageRef = useRef<HTMLDivElement>(null);
  const shakeRef = useRef<HTMLDivElement>(null);
  const flatCanvasRef = useRef<HTMLCanvasElement>(null);
  const shakeOff = useRef({ x: 0, y: 0, rot: 0 });
  const lastSfxRef = useRef(0);
  const onEvent = useCallback((e: TsunamiEvent) => {
    const fx = viewRef.current.fx;
    if (fx.length < 24) fx.push({ type: e.type, lane: e.lane, at: e.at } as TsunamiFx);
    const now = performance.now();
    if (e.type === "collide") {
      sfxHit();
      haptics("hit");
      driverRef.current?.feel.addTrauma(0.35);
    } else if (e.type === "shell" && now - lastSfxRef.current > 60) {
      lastSfxRef.current = now;
      sfxPickup();
    } else if (e.type === "shellRow") {
      sfxCombo(2);
    } else if (e.type === "gateCorrect" && e.n >= 2) {
      sfxCombo(Math.min(5, e.n) as 1 | 2 | 3 | 4 | 5);
    } else if (e.type === "won") {
      sfxLevelUp();
    }
  }, [haptics]);

  const endRunRef = useRef(endRun);
  endRunRef.current = endRun;
  useEffect(() => {
    if (phase !== "play") return;
    let raf = 0;
    let last: number | null = null;
    let fpsAcc = 0;
    let fpsFrames = 0;
    let endAt: number | null = null;
    const runId = runIdRef.current;
    const tick = (now: number) => {
      // Review #426: egy már ütemezett, elavult képkocka (régi futás) se futtassa tovább a kört.
      if (phaseNowRef.current !== "play" || runIdRef.current !== runId) return;
      const dt = last === null ? 0 : Math.min(250, Math.max(0, now - last));
      last = now;
      fpsAcc += dt;
      fpsFrames += 1;
      if (fpsAcc >= 500) {
        fpsRef.current = Math.round((fpsFrames * 1000) / fpsAcc);
        fpsAcc = 0;
        fpsFrames = 0;
      }
      const isPaused = pausedNowRef.current || whyOpenRef.current;
      const driver = driverRef.current!;
      const core = driver.core;
      if (!isPaused) core.input.steer = stickXRef.current;
      progressRef.current = Math.min(1, core.state().distance / core.tuning().levelDistance);
      // A meghajtó képkockája (a sim ugyanezt hívja): kérdés-óra → menetvégnél a kérdés lezárása → kérdés-sáv → kapu →
      // időskála (szünet 0, nyitott kérdés slowMo) → fix lépés → események (hitstop + nézet).
      viewRef.current.alpha = driver.frame(dt, isPaused, onEvent);
      const armed = driver.armedPresentationId();
      if (armed !== null && armedNowRef.current !== armed) {
        armedNowRef.current = armed;
        setArmedId(armed);
      }
      const shake = shakeRef.current;
      if (shake) {
        const off = shakeOff.current;
        driver.feel.shakeOffset(off, stageRef.current?.clientHeight ?? 600);
        shake.style.transform = off.x || off.y || off.rot ? `translate3d(${off.x.toFixed(1)}px, ${off.y.toFixed(1)}px, 0) rotate(${((off.rot * 180) / Math.PI).toFixed(2)}deg)` : "";
      }
      if (flatCanvasRef.current) drawFlat(flatCanvasRef.current, driver);
      if (!core.running() && qRef.current.settled()) {
        if (endAt === null) endAt = now + END_PAUSE_MS;
        if (now >= endAt) {
          endRunRef.current(core.state().phase === "won");
          return;
        }
      }
      raf = requestGameFrame(tick);
    };
    raf = requestGameFrame(tick);
    return () => cancelGameFrame(raf);
  }, [phase, onEvent, runKey]);

  // HUD ≤ 10 Hz (KSZ-9). Szünetben és a magyarázat alatt nem frissül (az óra is áll). A villám díszlet (M9: csökkentett
  // mozgásnál nincs).
  const stormAtRef = useRef(0);
  useEffect(() => {
    if (phase !== "play" || paused || explainCard) return;
    const id = window.setInterval(() => {
      const driver = driverRef.current;
      if (!driver) return;
      const st = driver.core.state();
      const hint = st.timeMs < HINT_MS ? 1 : 0;
      const next = {
        distance: Math.floor(st.distance),
        goal: driver.core.tuning().levelDistance,
        gap: Math.max(0, Math.round(st.waveGap)),
        shells: st.shellCount,
        score: st.score,
        combo: st.combo.count,
        multiplier: st.combo.multiplier,
        lane: st.lane,
        hint,
        danger: Math.round(viewRef.current.danger * 10) / 10,
      };
      setHud((prev) =>
        prev.distance === next.distance && prev.gap === next.gap && prev.shells === next.shells && prev.score === next.score && prev.combo === next.combo && prev.lane === next.lane && prev.hint === next.hint && prev.danger === next.danger && prev.goal === next.goal
          ? prev
          : next,
      );
      if (st.timeMs < stormAtRef.current) stormAtRef.current = 0; // új menet
      if (st.timeMs - stormAtRef.current >= STORM_EVERY_MS) {
        stormAtRef.current = st.timeMs;
        const prog = progressRef.current;
        // Csökkentett mozgásnál nincs villámlás-villanás (M9).
        if (!reducedMotion && Math.random() < 0.3 + prog * 0.3) {
          setStormFlash(true);
          timeoutsRef.current.push(window.setTimeout(() => setStormFlash(false), 170));
        }
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [phase, paused, explainCard, reducedMotion]);

  /* ---------------- kapu-táblák: a sávok fölött, a kérdés-kártya alatt ---------------- */
  const [gateBox, setGateBox] = useState<{ top: number; centers: [number, number, number]; width: number }>({ top: 220, centers: [60, 180, 300], width: 106 });
  const gatesRef = useRef<HTMLDivElement>(null);
  const presId = q.state.presentation?.id ?? null;
  /** D-J1a-18: a nyitott kérdés válaszai (a magasság-döntéshez) és az, hogy a táblák függőlegesen elférnek-e. */
  const presLabelsRef = useRef<string[]>([]);
  presLabelsRef.current = q.state.presentation?.options.map((o) => o.label) ?? [];
  const [gatesFitH, setGatesFitH] = useState(true);
  // D-J1a-17 (ÚK2): a „Jó kapu!” felirat helye a kártya alján (a közös kérdés-sáv állapotsora mellett, annak helyén).
  const revealNow = q.state.reveal;
  const idleGoodNow = presId !== null && !!revealNow && revealNow.pickedOptionIndex === null && idleGoodId === presId;
  const [idleGoodFoot, setIdleGoodFoot] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setIdleGoodFoot(idleGoodNow ? gatesRef.current?.querySelector<HTMLElement>(".play-question-foot") ?? null : null);
  }, [idleGoodNow]);
  useLayoutEffect(() => {
    if (presId === null) return;
    // D-J1a-18: a tábla / lista mód döntése CSAK a kérdés megjelenésekor és átméretezéskor / elforgatáskor (`decide`); a kártya
    // későbbi növekedése (a megoldás-kijelzés állapotsora, „Jó kapu!”) csak a táblák helyét igazítja — különben a kijelzés
    // közben váltana lista módra, és a táblák eltűnnének.
    const measure = (decide: boolean) => {
      const stage = stageRef.current;
      const card = gatesRef.current?.querySelector<HTMLElement>(".play-question-card");
      if (!stage) return;
      const sr = stage.getBoundingClientRect();
      // D-J1a-18: a kártya alja a „sáv” (táblás) elrendezés szerint, a mód- és animációfüggetlen elrendezési dobozból — lista
      // módban álló nézetben a kártya lecsúszik (flex-end), a belépő animáció pedig 10 px-et told rajta; ezekkel mérve a döntés
      // beragadna a lista módba.
      const bar = card?.parentElement;
      const barTop = card && bar ? (getComputedStyle(bar).display === "block" ? card.offsetTop : parseFloat(getComputedStyle(bar).paddingTop) || 0) : 0;
      const cardBottom = card && bar ? bar.getBoundingClientRect().top + barTop + card.offsetHeight - sr.top : 200;
      const { centers, width } = gateLayout(sr.width, viewRef.current.laneScreenX);
      // D-J1a-15 (review #483, K4): a táblák alsó széle ne lógjon a futó vetített feje alá (fekvő nézetben a kártya nő).
      // D-J1a-18: a tábla várható magassága a feliratból; ha a táblák így nem férnek a kártya és a fej közé → lista mód.
      const labels = presLabelsRef.current;
      const inner = width - 22;
      const head = viewRef.current.runnerTopY * sr.height;
      const gateH = labels.length ? Math.max(...labels.map((l) => gateHeightPx(l, inner))) : 64;
      const below = Math.max(cardBottom + 10, sr.height * 0.18);
      const cap = head - gateH - 8;
      const top = Math.round(Math.max(sr.height * 0.12, Math.min(below, cap)));
      setGateBox((prev) =>
        prev.top === top && prev.width === width && prev.centers[0] === centers[0] && prev.centers[1] === centers[1] && prev.centers[2] === centers[2] ? prev : { top, centers, width },
      );
      if (decide) setGatesFitH(gatesFitVertically({ labels, innerWidthPx: inner, cardBottomPx: cardBottom, runnerHeadPx: head, stageHeightPx: sr.height }));
    };
    measure(true);
    const card = gatesRef.current?.querySelector<HTMLElement>(".play-question-card");
    const ro = typeof ResizeObserver !== "undefined" && card ? new ResizeObserver(() => measure(false)) : null;
    if (ro && card) ro.observe(card);
    const onResize = () => measure(true);
    window.addEventListener("resize", onResize);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [presId]);

  /* ---------------- pontszám, jelvények, legjobb ---------------- */
  const scoreSubmittedRef = useRef(false);
  useEffect(() => {
    if (phase !== "over" && phase !== "won") return;
    if (!syncEligibility?.eligible || !result) return;
    if (scoreSubmittedRef.current) return;
    scoreSubmittedRef.current = true;

    const payload = {
      gameId: "tsunami-english",
      difficulty: runDifficultyRef.current,
      // A menet-pont (K.2 „Pontszám-szerződés”): kagyló × 5 + jó kapu × 30 × kombó + táv / 10.
      runXp: result.score,
      // A menet LEGJOBB kombó-sorozata (J12).
      runStreak: result.bestStreak,
      runSeconds: result.seconds,
      runId: newScoreRunId(),
    };

    void postGameScore(payload)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["/api/games/leaderboard/tsunami"] });
      })
      .catch(() => {
        scoreSubmittedRef.current = false;
      });
  }, [phase, syncEligibility, result]);

  // S9: helyi legjobb pontszám (névtelen látogatónak is) — egyszer, az eredményképernyő megnyitásakor; az összes XP és a
  // legjobb sorozat is ekkor íródik.
  useEffect(() => {
    if (phase !== "over" && phase !== "won") return;
    if (bestResult || !result) return;
    setBestResult(bestScore.submit(result.score));
    setTotalXp((t) => t + result.score);
    setBestStreak((b) => Math.max(b, result.bestStreak));
  }, [phase, bestResult, bestScore, result]);

  // Achievement + Daily — egyszer fut "over" / "won" átmenetkor.
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[]>([]);
  const achievementCheckedRef = useRef(false);
  useEffect(() => {
    if (phase !== "over" && phase !== "won") {
      achievementCheckedRef.current = false;
      return;
    }
    if (achievementCheckedRef.current || !result) return;
    achievementCheckedRef.current = true;
    const wasDailyAvailable = isTodaysGameAvailable("tsunami-english");
    const wrong = result.total - result.correct;
    const newOnes = recordRun({
      game: "tsunami-english",
      xpGained: result.score,
      // Valós kérdés-statisztika a directorból (K.2 „Menet-statisztika”); a lejárt kérdés is hibának számít.
      correctAnswers: result.correct,
      wrongAnswers: wrong,
      maxStreak: result.bestStreak,
      perfect: phase === "won" && wrong === 0 && result.correct >= 5,
      fullClear: phase === "won",
    });
    if (wasDailyAvailable && phase === "won") {
      const daily = markDailyCompleted();
      if (daily.achievements.length > 0) newOnes.push(...daily.achievements);
    }
    if (newOnes.length > 0) setNewlyUnlocked(newOnes);
  }, [phase, result]);

  /* ---------------- teszt-kampó (K.2) ---------------- */
  useEffect(() => {
    return installGameTestApi({
      probe: () => {
        const ctl = qRef.current;
        const driver = driverRef.current!;
        const st = driver.core.state();
        const stats = ctl.director?.stats(driver.clockMs());
        const p = ctl.view().presentation;
        return {
          simTime: driver.loop.simTimeMs(),
          questionOpen: ctl.active() ? 1 : 0,
          questionsAnswered: stats?.answered ?? 0,
          questionsCorrect: stats?.correct ?? 0,
          fps: fpsRef.current,
          band: ctl.director?.band() ?? adaptiveRef.current.band,
          intensity: ctl.director?.intensity() ?? null,
          level: runLevelRef.current,
          waveGap: st.waveGap,
          distance: st.distance,
          lane: st.lane,
          x: st.x,
          jumps: st.jumps,
          runnerTopY: viewRef.current.runnerTopY,
          gateAt: st.gates ? st.gates.atDistance : null,
          questionId: p?.id ?? null,
          questionSeconds: p ? p.windowMs / 1000 : null,
          reveal: ctl.view().reveal ? 1 : 0,
          // D-J1a-19: a meghajtó elfogadná-e most az érintést (az élesítés-teszt a táblák látható élességével veti össze).
          armed: driver.armedPresentationId() !== null ? 1 : 0,
          collisions: st.collisions,
          phase: st.phase,
          paused: pausedNowRef.current || whyOpenRef.current ? 1 : 0,
          clock: driver.clockMs(),
        };
      },
      forceState: (patch) => {
        // `phase: "quiz"` a `question: true` kompatibilis álneve (terv 9.): azonnal nyit egy kérdést.
        if (patch.question || patch.phase === "quiz") {
          if (phaseNowRef.current !== "play") startGame();
          // `longAnswers: true` (mobil mérő, D-J1a-11): a leghosszabb válaszokkal — a „lista mód” mérésére.
          if ((patch as { longAnswers?: boolean }).longAnswers) forceLongRef.current = true;
          if ((patch as { longPrompt?: boolean }).longPrompt) forceLongPromptRef.current = true;
          const answers = (patch as { answers?: unknown }).answers;
          if (Array.isArray(answers) && answers.length >= 2 && answers.every((a) => typeof a === "string")) forceAnswersRef.current = answers as string[];
          qRef.current.request("trigger", driverRef.current!.clockMs());
          return;
        }
        if (patch.phase === "play") startGame();
        if (patch.phase === "menu") exitToMenu();
        if (patch.phase === "won" || patch.phase === "over") endRun(patch.phase === "won", typeof patch.correctCount === "number" ? patch.correctCount : undefined);
      },
    });
  }, [endRun, startGame, exitToMenu]);

  /* ---------------- render ---------------- */
  const selectedSubjectMeta = TSUNAMI_SUBJECT_META[subject];
  const runSubjectMeta = TSUNAMI_SUBJECT_META[runSubjectRef.current];
  const playingPhase = phase === "play";
  const resultOpen = phase === "won" || phase === "over";
  const shellState: GameScreenState = phase === "menu" ? "start" : playingPhase ? (paused ? "paused" : "playing") : "result";
  const danger = hud.gap <= 8;
  const gapTone = danger ? "bad" : hud.gap <= 14 ? "warn" : "default";
  const pres = q.state.presentation;
  const reveal = q.state.reveal;
  const presTopic = pres ? topicByKeyRef.current.get(pres.question.key) ?? null : null;
  const questionChip = pres ? (pres.question.source === "material" || pres.question.source === "coupon" ? `LECKE · ${quizTopicLabelHu(presTopic, "Tananyag")}` : quizTopicLabelHu(null, TSUNAMI_SUBJECT_META[(pres.question.subject as TsunamiCoreSubject | undefined) ?? runSubjectRef.current]?.label ?? runSubjectMeta.label)) : null;
  // A sáv ↔ opció leképezés a maggal közös (review #483 A1).
  const laneOfOption = (i: number) => laneForOption(i, pres?.options.length ?? 3);
  const nextGoal = result
    ? result.won
      ? "Következő cél: fuss célba egy nehezebb pályán, vagy szedj össze több kagylót!"
      : `Következő cél: juss el ${Math.min(result.goal, Math.ceil((result.distance + 200) / 100) * 100)} méterig!`
    : "";

  // D-J1a-11 (review #483, M3): ha egy válasz sem fér a kapu-táblába levágás nélkül, „lista mód”: a kérdés-sáv teljes
  // szöveggel mutatja a válaszokat (a kulcs-kör a kapu színe + szimbóluma), táblák nélkül.
  // D-J1a-18: magasságban is — ha a táblák nem férnek a kártya alja és a futó feje közé, szintén lista mód.
  const longMode = !!pres && (!pres.options.every((o) => gateLabelFits(o.label, gateBox.width - 22)) || !gatesFitH);
  // D-J1a-19: futásidejű háló — a becslő betűmetrika-függő (más telefon / betűkészlet / nagyítás), a háló a tényleges
  // kirajzolást méri: ha egy tábla felirata levágódna, a kérdés lista módra vált. Stabil: lista módban nincs tábla, ami
  // visszaválthatna; a következő kérdés / átméretezés újra dönt. Küszöb: fél sor. Mérve (2026-11-17, SwiftShader, 360 / 390 /
  // 844 px-es nézet, 106 / 116 / 160 px-es tábla): levágás nélkül a scrollHeight − clientHeight 1–2 px (a bank leghosszabb
  // válaszai + előtagjaik, és a reviewer 12 kockázatos valódi válasza — egyik sem vágódott le), egy levágott sor 16 px; a fél
  // sor (7,5 px 13 px-es, 9,2 px 16 px-es betűnél) egyértelműen a kettő között van.
  useLayoutEffect(() => {
    if (presId === null || longMode) return;
    const clipped = Array.from(gatesRef.current?.querySelectorAll<HTMLElement>(".ts-gate-label") ?? []).some((el) => {
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 18;
      return el.scrollHeight - el.clientHeight > lh * 0.5;
    });
    if (clipped) setGatesFitH(false);
  }, [presId, longMode]);
  // D-J1a-17 (ÚK2): „Jó kapu!” felirat a jó kapun bemenet nélkül átfutó gyereknek (a nyilvántartásban „nem válaszolt”).
  const idleGoodShown = !!pres && !!reveal && reveal.pickedOptionIndex === null && idleGoodId === pres.id;
  const questionBar = (inside: boolean) => (
    <InlineQuestion
      {...q.bind}
      onPick={(i) => answerRef.current(i)}
      mode={inside && longMode ? "buttons" : "bar"}
      skin="ocean"
      portal={!inside}
      disabled={paused}
      onWhy={openWhy}
      testId="ts-question"
      promptTestId="ts-prompt"
      optionTestId={(i) => `ts-option-${i}`}
      pauseTestId="ts-quiz-pause"
      onPause={pauseGame}
      onExpand={() => setExpanded(true)}
      onCollapse={() => setExpanded(false)}
    />
  );

  return (
    <GameShell
      gameId="TsunamiEscapeEnglish"
      state={shellState}
      onAutoPause={pauseGame}
      style={{
        background:
          "radial-gradient(circle at 8% 14%, rgba(14,165,233,0.34), transparent 34%), radial-gradient(circle at 90% 8%, rgba(250,204,21,0.26), transparent 30%), linear-gradient(180deg, #03203f 0%, #05325f 48%, #0b4d8f 100%)",
      }}
    >
      <ClassroomGateModal accent="cyan" />

      {phase === "menu" && (
        <>
          {!reducedMotion && (
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              {[0, 1, 2, 3, 4, 5].slice(0, lightGraphics ? 3 : 6).map((i) => (
                <motion.div
                  key={`bubble-${i}`}
                  className="absolute rounded-full border border-cyan-100/35 bg-cyan-100/10"
                  style={{
                    width: `${20 + i * 8}px`,
                    height: `${20 + i * 8}px`,
                    left: `${8 + i * 15}%`,
                    bottom: `${4 + (i % 3) * 9}%`,
                    boxShadow: "inset 0 0 14px rgba(255,255,255,0.25)",
                  }}
                  animate={{ y: [0, -18 - i * 4, 0], opacity: [0.35, 0.8, 0.35] }}
                  transition={{ duration: 4 + i * 0.8, repeat: Infinity, ease: "easeInOut" }}
                />
              ))}
            </div>
          )}
          <main className="relative z-10 w-full">
            {/* LS-3b: earned play time. Renders nothing when the child has no coupon. */}
            <CouponHud session={coupon} />
            <CouponExpiredOverlay session={coupon} />
            <StartScreen
              title="Szökőár szökés"
              subtitle={`Hegyre fel! Fuss a hullám elől ${levelDistanceFor(difficulty)} métert a hegytetői menedékig — a jó válasz kapuja turbót ad.`}
              icon={<Waves className="h-9 w-9" aria-hidden="true" />}
              startLabel={`Indítás: ${selectedSubjectMeta.label} · ${difficultyLabel(difficulty)}`}
              startTestId="button-tsunami-start"
              onStart={startGame}
              best={bestScore.best}
              secondary={
                <>
                  <button
                    type="button"
                    className="game-btn game-btn-secondary"
                    data-testid="link-tsunami-back-games"
                    onClick={() => navigate("/games")}
                  >
                    <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                    Játékok
                  </button>
                  <GamePedagogyPanel
                    accent="cyan"
                    className="game-btn game-btn-secondary min-h-12 text-base text-center"
                    kidMission={`Fuss fel a hegyre a hullám elől! Húzd az ujjad balra–jobbra a sávváltáshoz, felfelé az ugráshoz: ugord át a fát és a kerítést, kerüld ki a felborult kocsit, és szedd a kagylót. Ha kérdés jön, három kapu áll az úton — fuss át azon, amelyiken a jó válasz van: turbót kapsz, és a hullám lemarad. ${levelDistanceFor(difficulty)} méter a menedékig!`}
                    parentBody={
                      <>
                        <strong className="text-cyan-100/90">Tananyag:</strong> 3–5. osztályos angol, matek, magyar nyelvtan és környezetismeret (3–12. évfolyamon a közös évfolyam-bankból); az angol kérdések a központi szóbankból is jönnek, ismétlés nélkül. A Vegyes kihívás körön belül váltogatja a tantárgyakat.
                        <br />
                        <strong className="text-cyan-100/90">Fejleszt:</strong> gyors döntés, olvasásértés, fejszámolás, figyelemmegosztás és reakcióidő.
                        <br />
                        <span className="text-white/70">
                          A kérdés a játék része: a jó válasz kapuja turbót ad, a rossz egy botlást — a játék nem áll meg. Az elrontott kérdés néhány kérdés múlva visszatér, a menet végén a „Gyakorold még” lista mutatja a megoldását.
                        </span>
                      </>
                    }
                  />
                </>
              }
              settings={
                <div className="space-y-4 text-left">
                  <div>
                    <p className="text-sm text-cyan-100/90 font-bold mb-2">Tantárgy mód</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {(["mixed", ...TSUNAMI_SUBJECT_ORDER] as TsunamiSubject[]).map((id) => {
                        const meta = TSUNAMI_SUBJECT_META[id];
                        const active = subject === id;
                        return (
                          <button
                            key={id}
                            type="button"
                            aria-pressed={active}
                            data-testid={`tsunami-subject-${id}`}
                            className={`tsunami-settings-btn min-h-12 flex flex-col items-start justify-center gap-0.5 text-left rounded-xl border px-3 py-2 transition-colors ${
                              active
                                ? "bg-gradient-to-br from-cyan-500 to-blue-700 text-white border-cyan-100/60 shadow-[0_0_20px_rgba(34,211,238,0.28)]"
                                : "bg-slate-900/75 border-white/20 text-white hover:bg-slate-800/90"
                            }`}
                            onClick={() => setSubject(id)}
                          >
                            <span className="text-xs font-black tracking-wide text-amber-200">{meta.chip}</span>
                            <span className="text-sm font-extrabold leading-tight">{meta.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-sm text-cyan-100/80">{selectedSubjectMeta.mission}</p>
                  </div>
                  <div>
                    <p className="text-sm text-cyan-100/90 font-bold mb-2">Nehézség</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          ["easy", "Könnyű", "bg-emerald-600 border-emerald-100/40"],
                          ["normal", "Közepes", "bg-cyan-600 border-cyan-100/40"],
                          ["hard", "Nehéz", "bg-rose-600 border-rose-100/40"],
                        ] as const
                      ).map(([id, label, activeCls]) => (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={difficulty === id}
                          className={`tsunami-settings-btn min-h-12 rounded-xl border px-2 text-base font-bold text-white ${
                            difficulty === id ? activeCls : "bg-slate-900/95 border-white/35 hover:bg-slate-800"
                          }`}
                          onClick={() => chooseDifficulty(id)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {levels.active && levels.level != null ? (
                    <div className="tsunami-level-picker">
                      <GradeLevelPicker
                        value={levels.level}
                        unlocked={levels.unlocked}
                        onChange={levels.select}
                        label={`Pálya — ${userGrade}. osztály`}
                      />
                    </div>
                  ) : null}
                  <p data-game-sync className="text-sm text-cyan-100/95 leading-snug border border-cyan-400/35 rounded-lg px-3 py-2 bg-slate-900/90">
                    {syncBanner}
                  </p>
                </div>
              }
            >
              <ul className="flex flex-wrap justify-center gap-2 text-sm font-bold text-white/90" aria-label="Szabályok">
                <li className="rounded-full border border-cyan-300/30 bg-cyan-500/10 px-3 py-1">👉 Húzás: sávváltás</li>
                <li className="rounded-full border border-amber-300/30 bg-amber-500/10 px-3 py-1">👆 Felfelé: ugrás</li>
                <li className="rounded-full border border-emerald-300/30 bg-emerald-500/10 px-3 py-1">🚪 Jó kapu = turbó</li>
              </ul>
              <p className="text-center text-sm font-semibold text-cyan-100/90">
                Összes XP: <strong className="text-amber-300">{totalXp}</strong> · Legjobb sorozat:{" "}
                <strong className="text-orange-300">{bestStreak}</strong>
              </p>
            </StartScreen>
          </main>
        </>
      )}

      {phase !== "menu" && (
        <main
          ref={stageRef}
          className="relative flex-1 min-h-0 overflow-hidden"
          style={{ padding: 0 }}
          data-testid="tsunami-stage"
          aria-hidden={resultOpen ? true : undefined}
        >
          {/* A játéktér a teljes képernyőt kitölti; a HUD, a kérdés és a vezérlők fölötte lebegnek. */}
          <div ref={shakeRef} className="absolute inset-0 z-0 overflow-hidden">
            <TsunamiScene3D viewRef={viewRef} phase={paused || explainCard ? "paused" : phase} light={lightGraphics} onSupportedChange={setScene3d} />
            {domScene && <canvas ref={flatCanvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" data-testid="tsunami-flat" />}
            {stormFlash && <div className="absolute inset-0 z-[3] bg-white/25 pointer-events-none" aria-hidden="true" />}
            {/* A HUD olvashatóságáért sötétedő sáv a képernyő tetején. */}
            <div
              className="absolute inset-x-0 top-0 h-32 pointer-events-none z-[1]"
              style={{ background: "linear-gradient(180deg, rgba(2,6,23,0.55) 0%, rgba(2,6,23,0) 100%)" }}
              aria-hidden="true"
            />
            {/* Veszélyjelzés: közel a hullám → narancs szél (villogás nélkül, nem telített piros — K.4/20). */}
            <div
              className="absolute inset-0 pointer-events-none z-[2] transition-opacity duration-500"
              style={{ boxShadow: "inset 0 -90px 80px -20px rgba(251,146,60,0.55)", opacity: danger ? 1 : 0 }}
              aria-hidden="true"
              data-testid="tsunami-danger"
              data-active={danger ? "true" : "false"}
            />
          </div>

          {/* Húzás-réteg (terv 5.1): a teljes játéktér, a böngésző saját gesztusai nélkül. */}
          {phase === "play" && (
            <div
              className="absolute inset-0 z-[5]"
              data-testid="tsunami-swipe"
              style={{ touchAction: "none", userSelect: "none", WebkitTouchCallout: "none" } as CSSProperties}
              onPointerDown={onStagePointerDown}
              onPointerMove={onStagePointerMove}
              onPointerUp={onStagePointerEnd}
              onPointerCancel={onStagePointerEnd}
              onLostPointerCapture={onStagePointerEnd}
            />
          )}

          <GameHud
            onPause={pauseGame}
            stats={[
              { id: "dist", label: "Táv", value: <span data-testid="ts-distance">{hud.distance} m</span>, tone: "good" },
              { id: "wave", label: "Víz", value: <span data-testid="ts-wave">{hud.gap} m</span>, tone: gapTone },
              {
                id: "shells",
                label: "Kagyló",
                value: (
                  <span className="inline-flex items-center gap-1" data-testid="ts-shells">
                    <ShellIcon className="h-4 w-4 text-rose-200" aria-hidden="true" />
                    {hud.shells}
                  </span>
                ),
              },
            ]}
            progress={{
              value: hud.distance,
              max: hud.goal,
              label: `Menedék: ${Math.max(0, hud.goal - hud.distance)} m`,
              tone: danger ? "bad" : hud.gap <= 14 ? "warn" : "default",
            }}
          >
            <CouponHud session={coupon} />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="max-w-[60vw] truncate rounded-full border border-amber-200/60 bg-slate-950/70 px-2.5 py-1 text-[13px] font-black text-amber-200 backdrop-blur-sm" data-testid="ts-subject-chip">
                {questionChip ?? `${runSubjectMeta.chip}: ${runSubjectMeta.label}`}
              </span>
              <span className="rounded-full border border-white/25 bg-slate-950/70 px-2.5 py-1 text-[13px] font-black text-white backdrop-blur-sm">
                Pont: <span data-testid="ts-score">{hud.score}</span>
              </span>
              {hud.multiplier >= 2 && (
                <span
                  data-testid="tsunami-streak"
                  className="inline-flex items-center gap-1 rounded-full border border-orange-200/70 bg-orange-500/85 px-2.5 py-1 text-[13px] font-black text-white"
                >
                  <Flame className="h-4 w-4" aria-hidden="true" />×{hud.multiplier} kombó
                </span>
              )}
            </div>
          </GameHud>
          <CouponExpiredOverlay session={coupon} />

          {/* A kérdés a pályán: a kártya (prompt + idő) és alatta a három sáv táblája; a jó sáv kapuján kell átfutni. */}
          {phase === "play" && pres && (
            <div
              ref={gatesRef}
              data-testid="ts-quiz"
              className="ts-gates"
              data-state={reveal ? "reveal" : "open"}
              data-long={longMode ? "true" : "false"}
              data-armed={armedId === pres.id || reveal ? "true" : "false"}
              data-idle-good={idleGoodShown ? "true" : undefined}
              style={{ top: gateBox.top, "--ts-gate-w": `${gateBox.width}px` } as CSSProperties}
              role="group"
              aria-label="Kapuk: fuss át a jó válasz kapuján"
            >
              {!longMode && pres.options.map((opt, i) => {
                const lane = laneOfOption(i);
                const st = reveal ? (i === reveal.correctOptionIndex ? "correct" : i === reveal.pickedOptionIndex ? "wrong" : "dim") : "idle";
                return (
                  <button
                    key={`${pres.id}-${i}`}
                    type="button"
                    className="ts-gate game-answer-btn"
                    data-testid={`ts-gate-${i}`}
                    data-state={st}
                    data-here={!reveal && hud.lane === lane ? "true" : "false"}
                    data-long={gateLabelLong(opt.label) ? "true" : "false"}
                    style={{ left: gateBox.centers[lane], "--ts-lane": TSUNAMI_LANE_COLORS[lane] } as CSSProperties}
                    aria-label={`${["Bal", "Középső", "Jobb"][lane]} kapu: ${opt.label}`}
                    aria-disabled={reveal || paused ? "true" : undefined}
                    {...gateHandlers(i)}
                    {...correctDataAttrs(opt.correct)}
                  >
                    <span className="ts-gate-sym" aria-hidden="true">
                      {st === "correct" ? <Check strokeWidth={3} /> : st === "wrong" ? <X strokeWidth={3} /> : TSUNAMI_LANE_SYMBOLS[lane]}
                    </span>
                    <span className="ts-gate-label">{opt.label}</span>
                  </button>
                );
              })}
              {questionBar(true)}
              {/* D-J1a-17 (ÚK2): a jó kapun tétlenül átfutó gyerek igaz, semleges állapotsora a kártya aljában (a közös
                  állapotsor ilyenkor rejtett — egy élő régió marad). */}
              {idleGoodFoot &&
                createPortal(
                  <p className="play-question-status ts-idle-status" data-testid="ts-idle-status" role="status" aria-live="polite" data-tone="good">
                    <Check aria-hidden="true" />
                    <span>{IDLE_GOOD_GATE_STATUS}</span>
                  </p>,
                  idleGoodFoot,
                )}
            </div>
          )}
          {/* A „Miért?” a megoldás-kijelzés után még 4 mp-ig (a következő kérdéstől függetlenül). */}
          {phase === "play" && !pres && questionBar(false)}

          {phase === "play" && hud.hint > 0 && !pres && (
            <p className="ts-hint" data-testid="ts-hint" role="status">
              {touch ? "Húzd az ujjad: ← → sáv, ↑ ugrás" : "← → sáv · ↑ ugrás · 1–3 kapu"}
            </p>
          )}

          {phase === "play" && touch && (
            <TsunamiTouchControls joyReset={joyReset} onJoystick={onJoystick} jumpStart={jumpStart} jumpEnd={jumpEnd} />
          )}
          {phase === "play" && !touch && (
            <p
              data-testid="tsunami-key-hint"
              className="game-key-hint absolute left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/20 bg-slate-950/75 px-4 py-2 text-sm font-semibold text-white/90 backdrop-blur-sm whitespace-nowrap"
              style={{ bottom: "max(12px, var(--game-safe-bottom))" }}
            >
              Sáv: <kbd className="px-1.5 rounded bg-white/15">←</kbd> <kbd className="px-1.5 rounded bg-white/15">→</kbd> vagy{" "}
              <kbd className="px-1.5 rounded bg-white/15">A</kbd> <kbd className="px-1.5 rounded bg-white/15">D</kbd> · ugrás:{" "}
              <kbd className="px-1.5 rounded bg-white/15">↑</kbd> · kapu: <kbd className="px-1.5 rounded bg-white/15">1–3</kbd>
            </p>
          )}
        </main>
      )}

      <ResultScreen
        badges={newlyUnlocked}
        open={resultOpen}
        testId={phase === "won" ? "ts-won" : "ts-over"}
        title={phase === "won" ? "Elérted a menedéket!" : "Utolért a hullám — jöhet a következő futás!"}
        won={phase === "won"}
        score={result?.score ?? 0}
        best={bestResult?.best ?? bestScore.best}
        isNewBest={bestResult?.isNewBest ?? false}
        correct={result?.correct ?? 0}
        total={result?.total ?? 0}
        // „Új futam” = új menet (nem a magyarázókártya tiltott újrapróbája — K.2 „Megvalósult eltérések” e).
        onRetry={startGame}
        retryTestId={phase === "won" ? "button-tsunami-retry-won" : "button-tsunami-retry"}
        retryLabel={phase === "won" ? "Következő kör" : "Újra"}
        onBack={() => navigate("/games")}
        extra={
          <div className="grid gap-2">
            <p className="game-result-stat">
              <Mountain className="h-5 w-5 text-cyan-300" aria-hidden="true" />
              <span>
                Táv: <strong>{result?.distance ?? 0}</strong>/{result?.goal ?? 0} m · kagyló: <strong>{result?.shells ?? 0}</strong>
              </span>
            </p>
            <p className="game-result-stat">
              <Flame className="h-5 w-5 text-orange-300" aria-hidden="true" />
              <span>
                Legjobb kombó: <strong>{result?.bestStreak ?? 0}</strong> · {difficultyLabel(runDifficultyRef.current)} · {result?.seconds ?? 0} mp
              </span>
            </p>
            <p className="px-1 text-sm font-bold text-amber-100" data-testid="ts-next-goal">{nextGoal}</p>
            <ResultReview items={q.director?.wrongList() ?? []} />
            {/* S13 / B6: az új jelvények a ResultScreen közös sorában (badges). */}
            {syncEligibility?.eligible && <p className="px-1 text-sm text-emerald-200/90">Felkerült a ranglistára.</p>}
          </div>
        }
      />

      <PauseMenu open={paused && playingPhase} onResume={resumeGame} onRestart={startGame} onExit={exitToMenu} exitLabel="Kilépés a menübe">
        <p className="text-center text-base text-white/80">
          {hud.distance} / {hud.goal} m · hullám: {hud.gap} m · {hud.shells} kagyló
        </p>
      </PauseMenu>

      <style>{TSUNAMI_CSS}</style>
      {explainCard && <QuizFeedbackCard card={explainCard} onDismiss={dismissExplain} />}
    </GameShell>
  );
}

/** A DOM-tartalék (WebGL nélkül, spec E7): felülnézeti 2D rajz a mag állapotából — a játék így is végigjátszható. */
function drawFlat(canvas: HTMLCanvasElement, driver: TsunamiDriver): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const st = driver.core.state();
  const laneW = Math.min(w / 3.4, 140);
  const x0 = w / 2 - laneW * 1.5;
  const playerY = h * 0.78;
  const pxPerM = h / 60;
  ctx.fillStyle = "#86c76a";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#d2ad78";
  ctx.fillRect(x0, 0, laneW * 3, h);
  ctx.fillStyle = "#fff8e1";
  for (let l = 1; l < 3; l++) ctx.fillRect(x0 + laneW * l - 2, 0, 4, h);
  const yOf = (at: number) => playerY - (at - st.distance) * pxPerM;
  for (const o of st.obstacles) {
    if (!o.alive) continue;
    const len = OBSTACLE_SPECS[o.kind].length * pxPerM;
    ctx.fillStyle = o.kind === "car" ? "#e11d48" : o.kind === "log" ? "#8b5a2b" : "#f8fafc";
    ctx.fillRect(x0 + laneW * o.lane + laneW * 0.12, yOf(o.at) - len / 2, laneW * 0.76, Math.max(8, len));
  }
  ctx.fillStyle = "#fb7185";
  for (const s of st.shells) {
    if (!s.alive) continue;
    ctx.beginPath();
    ctx.arc(x0 + laneW * (s.lane + 0.5), yOf(s.at), 7, 0, Math.PI * 2);
    ctx.fill();
  }
  const g = st.gates;
  if (g) {
    for (let l = 0; l < 3; l++) {
      if (g.laneOptions[l]! < 0) continue;
      ctx.fillStyle = g.resolved ? (l === g.correctLane ? "#22c55e" : l === g.pickedLane ? "#fb923c" : "#94a3b8") : TSUNAMI_LANE_COLORS[l]!;
      ctx.fillRect(x0 + laneW * l + 6, yOf(g.atDistance) - 6, laneW - 12, 12);
    }
  }
  const px = x0 + laneW * (st.x + 1.5);
  ctx.fillStyle = "#fb7a1c";
  ctx.beginPath();
  ctx.arc(px, playerY - st.y * pxPerM, laneW * 0.22, 0, Math.PI * 2);
  ctx.fill();
  const waveY = playerY + Math.max(0, st.waveGap) * pxPerM * 0.6;
  ctx.fillStyle = "rgba(14,116,190,0.85)";
  ctx.fillRect(0, waveY, w, h - waveY);
  ctx.fillStyle = "#f0fbff";
  ctx.fillRect(0, waveY - 4, w, 6);
}

/**
 * A kapu-táblák és a súgó stílusa (a játéklapé — a közös `index.css` a J0c / J8 szeleté). A tábla ≥ 56 px magas,
 * egymástól ≥ 12 px (K.4/16); a visszajelzés szín + ikon + szöveg (nem csak szín); a hiba narancs, nem telített piros
 * (K.4/20); csökkentett mozgásnál nincs pattanás.
 */
const TSUNAMI_CSS = `
.game-start-settings > summary, .game-start-secondary > *, .tsunami-settings-btn,
.tsunami-level-picker button { min-height: 52px; }
.tsunami-level-picker p { font-size: 14px; }
.ts-gates { position: absolute; left: 0; right: 0; z-index: 35; height: 0; pointer-events: none; }
/* Mért (Pixel 7, 2,625-ös képpontarány): a pontosan 48 px-es ikongomb 47,9 px-nek mérődik — a kérdés-sáv szünetgombja itt 52 px. */
.ts-gates .play-question-icon-btn { width: 52px; height: 52px; }
/* Élesítés: a megjelenés utáni első 450 ms-ban a válaszcélok még nem látszanak és nem érinthetők. */
.ts-gates[data-armed="false"] .ts-gate, .ts-gates[data-armed="false"] .play-question-options { visibility: hidden; pointer-events: none; }
/* A táblás módban a kérdés-sáv rejtett (billentyűzetre fókuszálható) gombsora a kép fölé kerül, hogy a hosszabb feliratú
   rejtett gombok doboza se essen a látható kapu-táblákra (fókuszra a közös szabály szerint megjelenik). */
.ts-gates[data-long="false"] .play-question[data-mode="bar"] .play-question-options:not(:focus-within) { top: auto; bottom: 100%; }
.ts-gate {
  position: absolute; top: 0; transform: translateX(-50%); width: var(--ts-gate-w, 110px); min-height: 56px; padding: 6px 8px 7px;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; text-align: center;
  border-radius: 16px; border: 3px solid var(--ts-lane); color: #fff; cursor: pointer; pointer-events: auto;
  background: linear-gradient(180deg, #0b2440f2 0%, #06182cf2 100%); box-shadow: 0 8px 20px #0008, 0 0 16px color-mix(in srgb, var(--ts-lane) 45%, transparent);
  -webkit-tap-highlight-color: transparent; touch-action: none; user-select: none;
  transition: background-color .12s ease, border-color .12s ease, opacity .15s ease, box-shadow .12s ease;
}
.ts-gate[data-here="true"] { box-shadow: 0 8px 20px #0008, 0 0 0 3px #ffffffcc, 0 0 22px var(--ts-lane); }
.ts-gate:focus-visible { outline: 3px solid #fef08a; outline-offset: 3px; }
.ts-gate-sym {
  display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 9999px;
  background: var(--ts-lane); color: #0f172a; font-size: 15px; font-weight: 900; line-height: 1;
}
.ts-gate-sym svg { width: 17px; height: 17px; }
.ts-gate-label { font-size: 16px; font-weight: 900; line-height: 1.15; overflow-wrap: break-word; word-break: normal; hyphens: manual; text-shadow: 0 1px 2px #000a;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden;
  /* D-J1a-19: 2 px függőleges ráhagyás — a nagybetű ékezete (Á, Ő, Ű) és az alsó szár (g, j, p, y) ne csonkolódjon. */
  padding-block: 2px; }
.ts-gate[data-long="true"] .ts-gate-label { font-size: 13px; }
.ts-gate[data-state="correct"] { background: #15803d; border-color: #bbf7d0; box-shadow: 0 0 0 2px #052e16, 0 0 28px #4ade80; animation: ts-gate-pop .3s ease-out; }
.ts-gate[data-state="correct"] .ts-gate-sym { background: #22c55e; color: #fff; }
.ts-gate[data-state="wrong"] { background: #9a3412; border-color: #fdba74; }
.ts-gate[data-state="wrong"] .ts-gate-sym { background: #f97316; color: #fff; }
.ts-gate[data-state="dim"] { opacity: .3; pointer-events: none; }
/* D-J1a-15: a megoldás-kijelzés alatt a táblák nem érinthetők (a válasz eldőlt), a futó és az út jobban látszik. */
.ts-gates[data-state="reveal"] .ts-gate { pointer-events: none; }
.ts-gates[data-idle-good="true"] .play-question-status:not(.ts-idle-status) { display: none; }
.ts-idle-status { order: -1; }
.ts-gates[data-state="reveal"] .ts-gate[data-state="wrong"] { opacity: .75; }
/* D-J1a-11: „lista mód” — a kérdés-sáv gombjainak kulcs-köre a kapu színe és szimbóluma (a 3D kapuval párban). */
/* Újra-review #483 ÚK3: álló nézetben a lista a kártyával együtt FENT áll (nem alul, flex-end) — nem takarja a futót, és nem
   lóg a tárcsa találati területére (a tárcsa marad). Fekvőben a közös elrendezés (display: block, oldalsó oszlopok) érvényes. */
.ts-gates[data-long="true"] .play-question[data-mode="buttons"] { justify-content: flex-start; }
/* Alacsony álló képernyőn (mérve: 360x640, a leghosszabb kérdés + válaszok) a lista tömörebb, hogy a futó feje fölött érjen
   véget; a gomb érintési magassága ≥ 44 px marad. */
@media (orientation: portrait) and (max-height: 720px) {
  .ts-gates[data-long="true"] .play-question[data-mode="buttons"] { gap: 6px; }
  .ts-gates[data-long="true"] .play-question[data-mode="buttons"] .play-question-options { gap: 6px; }
  .ts-gates[data-long="true"] .play-question[data-mode="buttons"] .play-question-option { min-height: 44px; padding: 3px 10px; gap: 8px; font-size: 15px; }
  .ts-gates[data-long="true"] .play-question[data-mode="buttons"] .play-question-label { line-height: 1.15; }
  .ts-gates[data-long="true"] .play-question[data-mode="buttons"] .play-question-key { width: 26px; height: 26px; }
}
.ts-gates[data-long="true"] .play-question-key { font-size: 0; color: #0f172a; box-shadow: none; }
.ts-gates[data-long="true"] .play-question-key::before { font-size: 15px; font-weight: 900; }
.ts-gates[data-long="true"] .play-question-option[data-option-index="0"] .play-question-key { background: ${TSUNAMI_LANE_COLORS[0]}; }
.ts-gates[data-long="true"] .play-question-option[data-option-index="0"] .play-question-key::before { content: "${TSUNAMI_LANE_SYMBOLS[0]}"; }
.ts-gates[data-long="true"] .play-question[data-count="3"] .play-question-option[data-option-index="1"] .play-question-key { background: ${TSUNAMI_LANE_COLORS[1]}; }
.ts-gates[data-long="true"] .play-question[data-count="3"] .play-question-option[data-option-index="1"] .play-question-key::before { content: "${TSUNAMI_LANE_SYMBOLS[1]}"; }
.ts-gates[data-long="true"] .play-question[data-count="3"] .play-question-option[data-option-index="2"] .play-question-key,
.ts-gates[data-long="true"] .play-question[data-count="2"] .play-question-option[data-option-index="1"] .play-question-key { background: ${TSUNAMI_LANE_COLORS[2]}; }
.ts-gates[data-long="true"] .play-question[data-count="3"] .play-question-option[data-option-index="2"] .play-question-key::before,
.ts-gates[data-long="true"] .play-question[data-count="2"] .play-question-option[data-option-index="1"] .play-question-key::before { content: "${TSUNAMI_LANE_SYMBOLS[2]}"; }
.ts-gates[data-long="true"] .play-question-option[data-state="correct"] .play-question-key,
.ts-gates[data-long="true"] .play-question-option[data-state="wrong"] .play-question-key { font-size: 15px; color: #fff; }
.ts-gates[data-long="true"] .play-question-option[data-state="correct"] .play-question-key::before,
.ts-gates[data-long="true"] .play-question-option[data-state="wrong"] .play-question-key::before { content: none; }
.ts-hint {
  position: absolute; left: 50%; bottom: calc(max(8px, var(--game-safe-bottom)) + var(--game-action-size) + 20px); transform: translateX(-50%); z-index: 25;
  max-width: calc(100% - 24px); margin: 0; padding: 8px 14px; border-radius: 9999px; pointer-events: none;
  background: #0b172dd9; border: 1.5px solid #fef08a99; color: #fef9c3; font-size: 15px; font-weight: 800; line-height: 1.25;
  text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 6px 18px #0008;
}
@keyframes ts-gate-pop { 0% { scale: 1; } 45% { scale: 1.08; } 100% { scale: 1; } }
@media (prefers-reduced-motion: reduce) {
  .ts-gate, .ts-gate[data-state="correct"] { animation: none; transition: none; }
}
`;
