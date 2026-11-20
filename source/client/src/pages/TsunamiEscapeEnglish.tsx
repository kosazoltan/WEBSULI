import { isPlayableQuestion } from "@shared/game-quiz-contract";
import { createRng, seedFrom, type Rng } from "@shared/game-rng";
import { createAdaptiveSession } from "@/game-engine/adaptiveSession";
import { tsunamiWaterPace } from "@/game-engine/tsunamiTiming";
import { useGradeLevel } from "@/game-engine/useGradeLevel";
import { GradeLevelPicker } from "@/game-engine/GradeLevelPicker";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
import { prewarmAudio, sfxCombo, sfxHit, sfxLevelUp, sfxPickup } from "@/lib/audioEngine";
import { recordRun, type Achievement } from "@/lib/achievements";
import { quizTopicLabelHu } from "@/lib/quizTopicLabel";
import { isTodaysGameAvailable, markDailyCompleted } from "@/lib/dailyChallenge";
import { useCouponSession } from "@/game-engine/useCouponSession";
import { maybeClaimCouponBonus } from "@/game-engine/claimCouponBonus";
import { CouponHud, CouponExpiredOverlay } from "@/game-engine/CouponHud";
import { installGameTestApi, readGameSeed } from "@/game-engine/game-test-hooks";
import { ArrowLeft, Flame, Mountain, Waves, Zap } from "lucide-react";
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
  restoreReviewQuestion,
  usePlayQuestion,
  useQuestionDirector,
  vocabPlayQuestion,
  type PlayQuestion,
  type QuestionProvider,
} from "@/game-engine/play";
import { motion } from "framer-motion";
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
import TsunamiScene3D, { SHELTER_TOP_LANDSCAPE, SHELTER_TOP_PORTRAIT, SHELTER_X, type TsunamiLive } from "@/game-engine/scenes/TsunamiScene3D";
import { paceTsunamiDirector } from "@/lib/tsunami/pacing";
import { dampShift, isShiftSettled } from "@/lib/tsunami/shift";
import { buildFeedback, type FeedbackCard } from "@/game-engine/feedback";
import {
  TSUNAMI_GAME_ID,
  WATER_LOSE,
  WATER_TUNING,
  ZONE_HALF,
  createTsunamiDriver,
  tsunamiDirectorConfig,
  type TsunamiDriver,
  type WaterEvent,
} from "@/lib/tsunami/water";
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
 * D1 (2026-11-18, „Vissza a régi, emelkedő vízhez”): a menedéket N jó válasz hozza (docs/specs/2026-11-18-szokoar-tema-es-sebesseg.md;
 * a hangolás a `WATER_TUNING`-ban, a szimulációval mérve).
 */
function winTargetFor(d: GameDifficulty): number {
  return WATER_TUNING[d].winCorrect;
}

/**
 * A víz képi leképezése: a vesztési vonal (88 %) a kép 70 %-ánál — a figura sosem ér a HUD sávjába, és a felső deszka
 * menedéke (a kép 82 %-a) mindig a víz fölött marad; a víz így alatta törik meg.
 */
const WATER_VIEW_SCALE = 0.8;
/** A figura testének fél szélessége a képen (px) — a kérdés-sáv takarás-döntéséhez (a figura nem egy pont). */
const FIGURE_HALF_WIDTH_PX = 26;
/** A figura magassága a képen (px, a talpától a feje fölé) — ennyi helyet kap a kérdés-sáv alatt / fölött. */
const FIGURE_HEIGHT_PX = 44;
const QUESTION_BOX_SELECTOR = '[data-testid="ts-question"] > *:not(.play-question-options), [data-testid="ts-question"] .play-question-option';
/** A keret akadályai: a vezérlők (tárcsa, Sprint) és a felső sáv kattintható sorai (a jelzősor nem kattintható, átlátszik). */
const FRAME_OBSTACLE_SELECTOR = '[data-testid="tsunami-touch-controls"] > *, [data-game-hud] .game-hud-row, [data-game-hud] .game-hud-progress';

/** A menet vége előtt (győzelem / a hullám) ennyi ideig látszik a pillanat, mielőtt az eredménykártya jön (ms). */
const END_PAUSE_MS = 900;
/** Győzelemkor (B1): a figura beér a menedékbe, a víz alatta megtörik — ez LÁTHATÓAN lefut, csak utána nyílik a kártya. */
const WIN_SCENE_MS = 1600;
/** A tanító súgó ennyi ideig látszik a menet elején (világ-ms). */
const HINT_MS = 30_000;
/** Ennyi ms-onként jöhet villám (díszlet; csökkentett mozgásnál nincs — M9). */
const STORM_EVERY_MS = 7_000;

type Phase = "menu" | "play" | "over" | "won";

type SyncEligibility = { eligible: boolean; reason?: string };

type ActiveQuizPools = Record<TsunamiCoreSubject, SubjectQuizPools>;

type RunResult = { won: boolean; score: number; correct: number; total: number; bestStreak: number; target: number; water: number; seconds: number };

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

/**
 * Érintős vezérlősáv (tárcsa + Sprint). `memo`: a lap a HUD (10 Hz) és a nyitott kérdés órája miatt is újrarenderel; a
 * tárcsának ezekhez semmi köze (joystick-reakció #49 render-mérője).
 */
const TsunamiTouchControls = memo(function TsunamiTouchControls({
  joyReset,
  onJoystick,
  sprintStart,
  sprintEnd,
}: {
  joyReset: number;
  onJoystick: (v: JoystickVector) => void;
  sprintStart: () => void;
  sprintEnd: () => void;
}) {
  return (
    /* G-8: touch-action:none — hosszú nyomásra a böngésző ne jelöljön ki és ne görgessen. A tárcsa a figura vízszintes
       mozgása (a régi játék), a Sprint akciógomb a jobb hüvelykujjnak. */
    <div
      className="tsunami-controls game-touch-layer"
      data-game-controls
      data-testid="tsunami-touch-controls"
      style={{ touchAction: "none", userSelect: "none", WebkitTouchCallout: "none", WebkitTapHighlightColor: "transparent" }}
    >
      <VirtualJoystick label="Mozgás iránya" radius="auto" resetSignal={joyReset} onChange={onJoystick} />
      <HoldButton
        label="Sprint"
        size="auto"
        onHoldStart={sprintStart}
        onHoldEnd={sprintEnd}
        className="flex-col gap-0.5 border-2 border-amber-100/70 bg-gradient-to-b from-amber-300 to-orange-500 text-slate-950 font-black shadow-[0_8px_24px_rgba(245,158,11,0.55)] active:scale-95 transition-transform"
      >
        <Zap className="h-7 w-7" aria-hidden="true" />
        <span className="text-[13px] leading-none tracking-wide">SPRINT</span>
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
  /*
   * Menetindítás (koordinátori kötelező javítás 2026-11-18): a 3D-jelenet (geometria, környezet-térkép, shader-fordítás) a menü
   * alatt, rejtve épül fel — az „Indítás” így nem akad meg. A kezdőképernyő előbb kirajzolódik, a felépítés utána indul.
   */
  const [scenePrewarm, setScenePrewarm] = useState(false);
  useEffect(() => {
    if (scenePrewarm) return;
    const id = window.setTimeout(() => setScenePrewarm(true), 600);
    return () => window.clearTimeout(id);
  }, [scenePrewarm]);
  /*
   * A hangkontextus is a menü alatt jön létre (csiszoló kör 4. pont, CPU-profillal mérve): lustán az első kérdés suhogó hangja
   * hozta létre, és a `new AudioContext()` a menet közepén ~2 s-ra megállította a főszálat.
   * Vak ellenőr KICSI 1 (2026-11-19): mozdulat nélkül létrehozva a böngésző minden betöltéskor konzol-figyelmeztetést adott
   * („The AudioContext was not allowed to start…”). Ezért: tétlen időben csak akkor, ha a lap már kapott felhasználói mozdulatot
   * (`navigator.userActivation.hasBeenActive` — a játéklistáról érkezve igaz), különben az első mozdulatkor (koppintás, kattintás,
   * billentyű) a mozdulaton belül; az „Indítás” koppintás (`startGame`) mindenképp létrehozza / folytatja.
   */
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const activated = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive === true;
    const events = ["pointerdown", "touchend", "click", "keydown"] as const;
    const onGesture = () => {
      prewarmAudio();
      events.forEach((e) => window.removeEventListener(e, onGesture, true));
    };
    events.forEach((e) => window.addEventListener(e, onGesture, { capture: true, passive: true }));
    let idle: number | null = null;
    if (activated && w.requestIdleCallback) idle = w.requestIdleCallback(() => prewarmAudio(), { timeout: 2500 });
    return () => {
      events.forEach((e) => window.removeEventListener(e, onGesture, true));
      if (idle !== null) w.cancelIdleCallback?.(idle);
    };
  }, []);
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
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
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
  const [hud, setHud] = useState({ correct: 0, target: 10, water: 12, score: 0, combo: 0, inZone: true, hint: 0, drift: 0 });
  const [result, setResult] = useState<RunResult | null>(null);
  const [stormFlash, setStormFlash] = useState(false);
  /**
   * Élesítés (átmeneti kapu 3a): a válaszgombok akkor jelennek meg, amikor a meghajtó már
   * elfogadja az érintést (`driver.armedPresentationId()`, a kérdés-órával: `ANSWER_ARM_MS`). Korábban 450 ms valós idő
   * után — lassú képkockánál (a kérdés-óra képkockánként legfeljebb 250 ms-ot lép) a tábla már látszott, de az érintést a
   * meghajtó még elnyelte. A képkocka-hurok állítja, kérdésenként egyszer.
   */
  const [armedId, setArmedId] = useState<number | null>(null);
  const armedNowRef = useRef<number | null>(null);
  /** A menet kulcsa: minden indítás növeli, a képkocka-hurok effektje ezen is újraindul (review #483). */
  const [runKey, setRunKey] = useState(0);

  /** A billentyűk (a bemenet-mérő `inX`-éhez) és a tárcsa analóg értéke. */
  const keysRef = useRef({ left: false, right: false, sprint: false });
  /** Joystick-reakció (#49): az analóg tárcsa vízszintes értéke (−1…1, a görbével). */
  const stickXRef = useRef(0);
  const sprintHeldRef = useRef(false);
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

  /*
   * A kézi bank (~10 MB, több tízezer tétel) ellenőrzése és sávokra bontása szeletekben, képkockák között (koordinátori kötelező
   * gyorsítás 2026-11-18; mérve 4× lassított CPU-n: egyben 11 s-os fő-szál blokk, amely menet közben érkezve másodperces
   * megakadást okozott). A kész eredmény egyszerre kerül be; addig a beépített bankok szolgálnak.
   */
  const [bankTiers, setBankTiers] = useState<ReturnType<typeof splitBankItemsByTier>>({ easy: [], medium: [], hard: [] });
  useEffect(() => {
    const items = quizBankResponse?.items ?? [];
    let cancelled = false;
    const acc: ReturnType<typeof splitBankItemsByTier> = { easy: [], medium: [], hard: [] };
    let i = 0;
    const SLICE = 60;
    const step = () => {
      if (cancelled) return;
      const part = splitBankItemsByTier(items.slice(i, i + SLICE));
      acc.easy.push(...part.easy);
      acc.medium.push(...part.medium);
      acc.hard.push(...part.hard);
      i += SLICE;
      if (i < items.length) timer = window.setTimeout(step, 0);
      else setBankTiers(acc);
    };
    let timer = window.setTimeout(step, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [quizBankResponse]);

  const mergedPools = useMemo<ActiveQuizPools>(() => {
    const { easy, medium, hard } = bankTiers;
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
  }, [bankTiers, materialItems]);

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
  /** A jelenet képkockánként innen olvas (nincs 60 Hz-es React-render). */
  /** A mag győzelme (a jelenet győzelmi animációja ettől indul, nem a React-fázistól — B1). */
  const [coreWon, setCoreWon] = useState(false);
  const coreWonRef = useRef(false);
  coreWonRef.current = coreWon;
  const liveRef = useRef<TsunamiLive>({ water: 12, playerX: 50, safeZoneX: 50, sprinting: false });
  /** A nyitott kérdés alatti kép-eltolás képkockánkénti követése (a törzse lejjebb, az elrendezés-döntésnél). */
  const trackShiftRef = useRef<() => void>(() => {});
  const resetLayoutRef = useRef<() => void>(() => {});
  /** Pont és kombó (a lap számolja a kérdés-kimenetekből). */
  const scoreRef = useRef({ score: 0, combo: 0, best: 0 });
  const qRef = useRef<ReturnType<typeof usePlayQuestion>>(null as unknown as ReturnType<typeof usePlayQuestion>);
  const driverRef = useRef<TsunamiDriver | null>(null);
  const makeDriver = (seed: string | number, d: GameDifficulty, wavePace: number): TsunamiDriver =>
    createTsunamiDriver({
      seed,
      difficulty: d,
      pace: wavePace,
      questions: {
        frame: (c, ctx) => qRef.current?.frame(c, ctx),
        timeScale: () => qRef.current?.timeScale() ?? 1,
        finished: () => qRef.current?.finished() ?? true,
        finish: () => qRef.current?.finish(),
        pick: (i, c) => qRef.current?.pick(i, c) ?? null,
        active: () => qRef.current?.active() ?? null,
      },
      reducedMotion,
    });
  if (!driverRef.current) driverRef.current = makeDriver(runSeedRef.current, difficulty, 1);
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
    // Négy gomb (a kérdés-sáv mind a négy válaszát a leghosszabbakkal mérjük).
    const top = [...all].sort((a, b) => b.length - a.length || a.localeCompare(b)).slice(0, 4);
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
        // D-J1a-11 (review #483, M3): a director `accept`-je (befér a kérdés-sávba) — az elfogadott tananyag előbb.
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

  /*
   * K1 (koordinátori döntés 2026-11-18): olvasási idő szerinti válaszablak — a közös director presentation-je a
   * `paceTsunamiDirector`-ral burkolva (a director maga nem változik); a többletidő alatt a víz áll (water.ts).
   */
  const ownDirector = useQuestionDirector({ config: directorConfig, provider, startBand: adaptiveRef.current.band, seed: runSeedRef.current });
  const resetDirectorRef = useRef(ownDirector.reset);
  resetDirectorRef.current = ownDirector.reset;
  const pacedDirector = useMemo(() => paceTsunamiDirector(ownDirector.director, { grade: () => userGradeRef.current ?? null }), [ownDirector.director]);
  const q = usePlayQuestion({
    director: pacedDirector,
    onOutcome: (o, p) => {
      // A kimenet → a víz (D4: jó válasz = visszahúzódik, rossz / lejárt = ugrik).
      driverRef.current?.onOutcome(o, p);
      if (o.result === "aborted") return;
      const sc = scoreRef.current;
      if (o.result === "correct") {
        sc.combo += 1;
        sc.best = Math.max(sc.best, sc.combo);
        sc.score += 100 + 25 * Math.min(4, sc.combo - 1);
      } else {
        sc.combo = 0;
      }
      adaptiveRef.current.answer(o.result === "correct");
      // A kupon-bónusz a VALÓS választással (az eredeti opció-index — terv 8.7).
      if (o.pickedOriginalIndex !== null) maybeClaimCouponBonus(coupon, p.question.couponItemId ?? p.question.quiz.id, o.pickedOriginalIndex);
    },
  });
  qRef.current = q;

  const startGame = useCallback(() => {
    // Az „Indítás” koppintás felhasználói mozdulat: a hangkontextus itt biztosan létrejön / fut (vak ellenőr KICSI 1).
    prewarmAudio();
    runIdRef.current += 1;
    runIndexRef.current += 1;
    // Új menet: a kérdés-azonosítók újra 1-től indulnak — a régi élesítés és a régi elrendezés-döntés / nyugalom ne öröklődjön
    // (vak ellenőr GPT L3: az új menet 1-es kérdése a régi 1-es kérdés „settled” állapotát kapta).
    armedNowRef.current = null;
    setArmedId(null);
    resetLayoutRef.current();
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
    scoreRef.current = { score: 0, combo: 0, best: 0 };
    setCoreWon(false);
    keysRef.current.left = false;
    keysRef.current.right = false;
    keysRef.current.sprint = false;
    sprintHeldRef.current = false;
    stickXRef.current = 0;
    scoreSubmittedRef.current = false;
    resetDirectorRef.current(seed, adaptiveRef.current.band);
    q.reset(seed, adaptiveRef.current.band);
    goPaused(false);
    setExplainCard(null);
    setExpanded(false);
    setBestResult(null);
    setNewlyUnlocked([]);
    setResult(null);
    const st = driverRef.current.core.state();
    liveRef.current = { water: st.water * WATER_VIEW_SCALE, playerX: st.x, safeZoneX: st.zoneX, sprinting: false };
    setHud({ correct: 0, target: st.target, water: Math.round(st.water), score: 0, combo: 0, inZone: true, hint: 1, drift: 0 });
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
      score: scoreRef.current.score,
      correct,
      total,
      bestStreak: scoreRef.current.best,
      target: st.target,
      water: Math.round(st.water),
      seconds: Math.round(driver.clockMs() / 1000),
    });
    goPhase(won ? "won" : "over");
  }, []);

  /** S9 / terv 4.5: szünet — a játékciklus és a kérdés-óra áll, a vezérlés elenged. */
  const pauseGame = useCallback(() => {
    if (phase !== "play") return;
    keysRef.current.left = false;
    keysRef.current.right = false;
    keysRef.current.sprint = false;
    sprintHeldRef.current = false;
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
  /** Válasz a kérdés-sáv gombján (érintés) vagy billentyűvel. S13 / review K1: szünetben (és a „Miért?” alatt) nincs válasz. */
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

  /* ---------------- bemenet: billentyű (←/→ A/D mozgás, Shift sprint), tárcsa, Sprint gomb ---------------- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (phaseNowRef.current !== "play" || pausedNowRef.current || whyOpenRef.current) return;
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        keysRef.current.left = true;
        e.preventDefault();
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        keysRef.current.right = true;
        e.preventDefault();
      } else if (e.key === "Shift") {
        keysRef.current.sprint = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keysRef.current.left = false;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keysRef.current.right = false;
      if (e.key === "Shift") keysRef.current.sprint = false;
    };
    const reset = () => {
      keysRef.current.left = false;
      keysRef.current.right = false;
      keysRef.current.sprint = false;
      sprintHeldRef.current = false;
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
    keysRef.current.sprint = false;
    sprintHeldRef.current = false;
    stickXRef.current = 0;
  }, [phase]);

  // Joystick-reakció (#49): a bemenet → válasz mérő kampója (csak teszt-kampós buildben él). A figura helye %-ban.
  useEffect(
    () =>
      registerInputProbe("tsunami", () => ({
        x: driverRef.current?.core.state().x ?? 50,
        inX: (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0) + stickXRef.current,
      })),
    [],
  );

  // Joystick-reakció (#49): analóg, folytonos görbe — a vízszintes érték a figura mozgása.
  const onJoystick = useCallback((v: JoystickVector) => {
    stickXRef.current = shapeJoystick(v).x;
  }, []);
  const sprintStart = useCallback(() => {
    if (!pausedNowRef.current && !whyOpenRef.current) sprintHeldRef.current = true;
  }, []);
  const sprintEnd = useCallback(() => {
    sprintHeldRef.current = false;
  }, []);

  /* ---------------- képkocka-hurok (requestGameFrame): kérdés-óra, sim, rajz ---------------- */
  const stageRef = useRef<HTMLDivElement>(null);
  const shakeRef = useRef<HTMLDivElement>(null);
  const flatCanvasRef = useRef<HTMLCanvasElement>(null);
  const shakeOff = useRef({ x: 0, y: 0, rot: 0 });
  const onEvent = useCallback((e: WaterEvent) => {
    if (e.type === "waterSurge") {
      // D4: rossz / lejárt válasz → a víz ugrik: mély ütés + rezgés (a rázást a meghajtó adja, csökkentett mozgásnál nincs).
      sfxHit();
      haptics("hit");
    } else if (e.type === "waterDrop") {
      const combo = scoreRef.current.combo;
      if (combo >= 2) sfxCombo(Math.min(5, combo) as 1 | 2 | 3 | 4 | 5);
      else sfxPickup();
    } else if (e.type === "won") {
      setCoreWon(true);
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
      const keys = keysRef.current;
      core.input.move = isPaused ? 0 : Math.max(-1, Math.min(1, (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + stickXRef.current));
      core.input.sprint = !isPaused && (keys.sprint || sprintHeldRef.current);
      progressRef.current = Math.min(1, core.state().correct / Math.max(1, core.state().target));
      // A meghajtó képkockája (a sim ugyanezt hívja): kérdés-óra → menetvégnél a kérdés lezárása → kérdés-sáv → időskála
      // (szünet 0, nyitott kérdés slowMo — a világ lassul, nem áll) → fix lépés → események.
      const alpha = driver.frame(dt, isPaused, onEvent);
      const st = core.state();
      const live = liveRef.current;
      live.water = (st.prevWater + (st.water - st.prevWater) * alpha) * WATER_VIEW_SCALE;
      live.playerX = st.prevX + (st.x - st.prevX) * alpha;
      live.safeZoneX = st.zoneX;
      live.sprinting = core.input.sprint;
      trackShiftRef.current();
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
      if (flatCanvasRef.current) drawFlat(flatCanvasRef.current, driver, liveRef.current, reducedMotionRef.current);
      if (!core.running() && qRef.current.settled()) {
        if (endAt === null) endAt = now + (core.state().phase === "won" ? WIN_SCENE_MS : END_PAUSE_MS);
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
      const sc = scoreRef.current;
      // A3: a sodrás iránya (a régi „Sodrás: jobbra” jelzés) — 3 %/s fölött.
      const drift = st.drift > 3 ? 1 : st.drift < -3 ? -1 : 0;
      const next = { correct: st.correct, target: st.target, water: Math.round(st.water), score: sc.score, combo: sc.combo, inZone: st.inZone, hint, drift };
      setHud((prev) =>
        prev.correct === next.correct && prev.target === next.target && prev.water === next.water && prev.score === next.score && prev.combo === next.combo && prev.inZone === next.inZone && prev.hint === next.hint && prev.drift === next.drift
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
      // A menet-pont: jó válaszonként 100 + kombó-bónusz (25 × a sorozat, legfeljebb 100).
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
          water: st.water,
          waterLose: WATER_LOSE,
          x: st.x,
          zoneX: st.zoneX,
          inZone: st.inZone ? 1 : 0,
          correct: st.correct,
          target: st.target,
          wrong: st.wrong,
          // A figura helye a játéktér arányában (a jelenet a z = 0 síkot lineárisan képezi: x % balról, víz % alulról).
          figureX: st.x / 100,
          // A ténylegesen kirajzolt kép-eltolással (a jelenet visszaírja; WebGL nélkül a cél-eltolás).
          figureY: 1 - (st.water * WATER_VIEW_SCALE) / 100 + (liveRef.current.shownShiftPx ?? liveRef.current.shiftPx ?? 0) / Math.max(1, stageRef.current?.clientHeight ?? 1),
          // A figura ténylegesen kirajzolt doboza a játéktér bal felső sarkától (px; a jelenet vetíti), vagy null (WebGL nélkül).
          figureBoxLeft: liveRef.current.figureBoxPx?.left ?? null,
          figureBoxTop: liveRef.current.figureBoxPx?.top ?? null,
          figureBoxRight: liveRef.current.figureBoxPx?.right ?? null,
          figureBoxBottom: liveRef.current.figureBoxPx?.bottom ?? null,
          quizPlace: quizPlaceRef.current,
          sprint: driver.core.input.sprint ? 1 : 0,
          layoutSettleMs: settleMsRef.current,
          scenePhase: coreWonRef.current ? "won" : phaseNowRef.current,
          questionId: p?.id ?? null,
          questionSeconds: p ? p.windowMs / 1000 : null,
          reveal: ctl.view().reveal ? 1 : 0,
          // D-J1a-19: a meghajtó elfogadná-e most az érintést (az élesítés-teszt a táblák látható élességével veti össze).
          armed: driver.armedPresentationId() !== null ? 1 : 0,
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
        // Teszt: a mag győzelme a valódi úton (a jelenet → kártya sorrend méréséhez, B1).
        if ((patch as { coreWin?: boolean }).coreWin && driverRef.current) {
          driverRef.current.core.forceEnd(true);
          return;
        }
        // Teszt: a figura vízszintes helye (% — a fekvő nézet szélső válasz-oszlopa alatti szabadság méréséhez).
        const fxPatch = (patch as { x?: unknown }).x;
        if (typeof fxPatch === "number" && Number.isFinite(fxPatch) && driverRef.current) {
          const st = driverRef.current.core.state() as { x: number; prevX: number };
          st.x = Math.max(8, Math.min(92, fxPatch));
          st.prevX = st.x;
          return;
        }
        // Teszt: a vízszint beállítása (a „magas víz → lent a kérdés” elrendezés méréséhez).
        const water = (patch as { water?: unknown }).water;
        if (typeof water === "number" && Number.isFinite(water) && driverRef.current) {
          const st = driverRef.current.core.state() as { water: number; prevWater: number };
          st.water = Math.max(5, Math.min(WATER_LOSE - 1, water));
          st.prevWater = st.water;
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
  // A víz a vesztési vonalhoz közel → narancs szél és tónus (villogás nélkül — K.4/20).
  const danger = hud.water >= WATER_LOSE - 14;
  const gapTone = danger ? "bad" : hud.water >= WATER_LOSE - 28 ? "warn" : "default";
  const pres = q.state.presentation;
  const reveal = q.state.reveal;
  const presTopic = pres ? topicByKeyRef.current.get(pres.question.key) ?? null : null;
  const questionChip = pres ? (pres.question.source === "material" || pres.question.source === "coupon" ? `LECKE · ${quizTopicLabelHu(presTopic, "Tananyag")}` : quizTopicLabelHu(null, TSUNAMI_SUBJECT_META[(pres.question.subject as TsunamiCoreSubject | undefined) ?? runSubjectRef.current]?.label ?? runSubjectMeta.label)) : null;
  const nextGoal = result
    ? result.won
      ? "Következő cél: érd el a menedéket egy nehezebb pályán, vagy hosszabb jó-válasz sorozattal!"
      : `Következő cél: ${Math.min(result.target, result.correct + 2)} jó válasz — maradj a zöld bóják között, ott lassabban emelkedik a víz!`
    : "";

  /*
   * A kérdés a régi játék helyén, de a világot NEM állítja meg (D1 + a J1-fejezet gyengeségei): a közös kérdés-sáv „buttons”
   * módban, a kép tetején (a figura és a víz alatta látszik), négy ≥ 48 px-es gombbal; a válaszgombok az élesítés (400 ms)
   * után jelennek meg.
   */
  const questionBar = (inside: boolean) => (
    <InlineQuestion
      {...q.bind}
      onPick={(i) => answerRef.current(i)}
      mode="buttons"
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
  const toShelter = Math.max(0, hud.target - hud.correct);
  /*
   * A kérdés-sáv alsó határa a vezérlők (tárcsa, Sprint) teteje fölött — a tárcsa nagyobb, mint a közös akciógomb-méret, ezért
   * mérjük (a menet indulásakor, kérdésenként és átméretezéskor), különben a válaszgomb a tárcsára lógna.
   */
  const [quizBottom, setQuizBottom] = useState<number | null>(null);
  const presIdNow = pres?.id ?? null;
  useLayoutEffect(() => {
    if (phase !== "play") return;
    const measure = () => {
      const tops = Array.from(document.querySelectorAll('[data-testid="tsunami-touch-controls"] > *, [data-testid="tsunami-key-hint"]')).map((el) => el.getBoundingClientRect().top);
      const top = tops.length ? Math.min(...tops) : window.innerHeight;
      const next = Math.max(0, Math.round(window.innerHeight - top + 10));
      setQuizBottom((prev) => (prev === next ? prev : next));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [presIdNow, phase, touch]);
  /*
   * A kérdés helye a kérdés megjelenésekor dől el (utána nem ugrál): ha a víz (és rajta a figura) a kép alsó felében van, a
   * kérdés fent áll; ha a felső felében, lent (a vezérlők fölött) — így a gombok sosem takarják a figurát.
   */
  const shownAtRef = useRef(0);
  const quizPlaceRef = useRef<"top" | "bottom">("top");
  const placedForRef = useRef<number | null>(null);
  const [, setPlaceTick] = useState(0);
  /** K3: a kompakt („magas víz”) mód is a megjelenéskor rögzül — nyitott kérdés alatt nem ugrál az elrendezés. */
  const quizHighRef = useRef(false);
  if (pres && placedForRef.current !== pres.id) {
    placedForRef.current = pres.id;
    shownAtRef.current = performance.now();
    const viewWater = (driverRef.current?.core.state().water ?? 0) * WATER_VIEW_SCALE;
    quizPlaceRef.current = viewWater > 40 ? "bottom" : "top";
    // K2: a kompakt mód már a kép alsó negyede fölött (a 32–50 %-os sávban is) él.
    quizHighRef.current = viewWater > 25;
  }
  /*
   * Elrendezés-nyugalom (koordinátori spec-pontosítás 2026-11-18): a figura a kérdés megjelenése után ≤ 600 ms-on belül szabad,
   * és a nyitott kérdés alatt végig az. A sáv `data-layout="settled"`-et kap, amikor a hely / kompakt mód / kép-eltolás eldőlt
   * ÉS a KIRAJZOLT eltolás megérkezett (terv 7.7, „A nyugalom-jelző oka”: időzítő helyett — terhelt gépen a rögzített idő előbb
   * lejárt, mint ahogy a kép megnyugodott). A döntés egy helyen: `isShiftSettled` (`lib/tsunami/shift.ts`), a képkocka-követő
   * hívja. A beállás ideje a teszt-kampóban (`layoutSettleMs`).
   */
  const settledForRef = useRef<number | null>(null);
  const settleMsRef = useRef<number | null>(null);
  /** A döntés megszületett, a kirajzolt eltolás még úton lehet: a képkocka-követő ennek a kérdésnek a nyugalmát várja. */
  const awaitSettleForRef = useRef<number | null>(null);
  const markSettled = (id: number) => {
    if (placedForRef.current !== id || settledForRef.current === id) return;
    awaitSettleForRef.current = null;
    settledForRef.current = id;
    settleMsRef.current = Math.round(performance.now() - shownAtRef.current);
    setPlaceTick((n) => n + 1);
  };
  /** Új menet: az elrendezés-döntés, a nyugalom és a követés minden kérdéshez kötött állapota törlődik (vak GPT L3). */
  resetLayoutRef.current = () => {
    placedForRef.current = null;
    decidedForRef.current = null;
    settledForRef.current = null;
    settleMsRef.current = null;
    awaitSettleForRef.current = null;
    trackRef.current = { at: 0, obs: [], id: null };
    stageRectRef.current = null;
  };
  /** Nyugalomban van-e a kirajzolt kép (csökkentett mozgásnál az eltolás azonnali). */
  const shiftArrived = () => reducedMotion || isShiftSettled(liveRef.current.shownShiftPx, liveRef.current.shiftPx ?? 0);
  const quizElRef = useRef<HTMLDivElement | null>(null);
  const decidedForRef = useRef<number | null>(null);
  /** Egy akadály: a doboza, és hogy álló nézetben a teljes szélességet foglalja-e (a kérdés-felület: a figura alatta mozog). */
  type Obstacle = { box: DOMRect; wide: boolean };
  const boxesOf = (selector: string): DOMRect[] =>
    Array.from(document.querySelectorAll(selector))
      .map((el) => el.getBoundingClientRect())
      .filter((b) => b.height > 0 && b.width > 0 && b.height < window.innerHeight * 0.9);
  /** A kérdés-felület dobozai (kártya-részek + válaszgombok; az élesítés előtt rejtett, de már elrendezett gombokkal együtt). */
  const questionBoxes = (): DOMRect[] => boxesOf(QUESTION_BOX_SELECTOR);
  /**
   * Vak ellenőr K4 és KICSI 5: a vezérlők (tárcsa, Sprint — a tényleges dobozuk, bármelyik oldalon) és a felső sáv kattintható
   * sorai is akadályok — kérdés nélkül is, ha a figura alájuk kerülne.
   */
  const frameObstacles = (): Obstacle[] => boxesOf(FRAME_OBSTACLE_SELECTOR).map((box) => ({ box, wide: false }));
  const portrait = () => window.innerHeight > window.innerWidth;
  const withQuestion = (boxes: DOMRect[]): Obstacle[] => [...boxes.map((box) => ({ box, wide: portrait() })), ...frameObstacles()];
  /**
   * A figura TESTE a képen (px), kép-eltolás NÉLKÜL: a talppont a mag állapotából (víz, x — a jelenet lineáris leképezése), a
   * kiterjedés a jelenetből (a ténylegesen kirajzolt figura vetített doboza a talpponthoz képest; vak ellenőr B1: a régi 44 px-es
   * állandó a 75–95 px-es figura fejét kihagyta). WebGL nélkül (lapos tartalék) a rajz méretével számol.
   */
  type FigureRect = { l: number; r: number; t: number; b: number };
  /*
   * Vak ellenőr GPT L4: a képkocka-követő ne olvasson minden képkockán DOM-geometriát. A játéktér doboza gyorsítótárban; frissül
   * a döntéskor, a követő 250 ms-os akadály-frissítésekor és átméretezéskor (`resize`).
   */
  const stageRectRef = useRef<DOMRect | null>(null);
  const measureStage = (): DOMRect | null => {
    const r = stageRef.current?.getBoundingClientRect() ?? null;
    stageRectRef.current = r;
    return r;
  };
  const stageRect = (): DOMRect | null => stageRectRef.current ?? measureStage();
  useEffect(() => {
    const onResize = () => {
      stageRectRef.current = null;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const figureRect = (): FigureRect | null => {
    const st = driverRef.current?.core.state();
    const sr = stageRect();
    if (!sr || !st) return null;
    const fx = sr.left + (st.x / 100) * sr.width;
    const fy = sr.top + (1 - (st.water * WATER_VIEW_SCALE) / 100) * sr.height;
    const ext = liveRef.current.figureExtentPx ?? { up: FIGURE_HEIGHT_PX, down: 10, left: FIGURE_HALF_WIDTH_PX, right: FIGURE_HALF_WIDTH_PX };
    return { l: fx - ext.left, r: fx + ext.right, t: fy - ext.up, b: fy + ext.down };
  };
  /*
   * A takarás-döntés a figura TESTÉRE szól (C-77): a figura téglalapja és az akadály metszi-e egymást. A kérdés-felület álló
   * nézetben a teljes szélességet foglalja (a figura alatta oldalra mozog), ezért ott csak a magasság dönt. A dobozok teteje
   * 12 px ráhagyást kap: a kártya belépő animációja (10 px) alatt mérünk, a végleges hely ennyivel feljebb van.
   */
  const hitsAt = (obs: Obstacle[], f: FigureRect, shift: number): boolean =>
    obs.some(({ box, wide }) => (wide || (f.r >= box.left && f.l <= box.right)) && f.t + shift <= box.bottom + 4 && f.b + shift >= box.top - 12);
  /*
   * Kép-eltolás (px, pozitív = a világ lejjebb kerül), amelynél a figura szabad. Ha a nulla eltolás is szabad, az a cél (a kép
   * visszaáll); ha a jelenlegi szabad, az marad (nem remeg); különben a jelöltek — minden ütköző doboz alá, minden ütköző doboz
   * fölé — közül a jelenlegihez legközelebbi, amelynél a figura egyik akadállyal sem ütközik és a képen marad.
   */
  /** Szabad eltolás, vagy null, ha ennél az elrendezésnél nincs (a figura sehol nem fér el). */
  const findShift = (obs: Obstacle[], f: FigureRect, current: number): number | null => {
    if (!hitsAt(obs, f, 0)) return 0;
    if (!hitsAt(obs, f, current)) return current;
    const stage = stageRect();
    const minTop = (stage?.top ?? 0) + 4;
    const maxBottom = (stage?.bottom ?? window.innerHeight) - 4;
    const over = obs.filter(({ box, wide }) => wide || (f.r >= box.left && f.l <= box.right)).map((o) => o.box);
    const candidates = [...over.map((b) => b.bottom + 16 - f.t), ...over.map((b) => b.top - 16 - f.b)];
    const ok = candidates.filter((c) => f.t + c >= minTop && f.b + c <= maxBottom && !hitsAt(obs, f, c));
    if (!ok.length) return null;
    return ok.reduce((best, c) => (Math.abs(c - current) < Math.abs(best - current) ? c : best));
  };
  const solveShift = (obs: Obstacle[], f: FigureRect, current: number): number => findShift(obs, f, current) ?? current;
  /**
   * Az elrendezés akkor jó, ha a figura a kérdés alatt BÁRHOVÁ mozoghat (x = 8…92 %): minden helyzetben van szabad eltolás.
   * Fekvő nézetben a szélső válasz-oszlop és a tárcsa között nincs hely a figurának — ott a középre tett kompakt sáv a jó (a két
   * oldal szabadon marad). Álló nézetben a kérdés teljes szélességű, a vízszintes helyzet nem számít.
   */
  const everyXSolvable = (obs: Obstacle[], f: FigureRect): boolean => {
    const stage = stageRef.current?.getBoundingClientRect();
    const st = driverRef.current?.core.state();
    if (!stage || !st || portrait()) return findShift(obs, f, 0) !== null;
    const fx = stage.left + (st.x / 100) * stage.width;
    for (let x = 8; x <= 92; x += 7) {
      const dx = stage.left + (x / 100) * stage.width - fx;
      if (findShift(obs, { l: f.l + dx, r: f.r + dx, t: f.t, b: f.b }, 0) === null) return false;
    }
    return true;
  };
  /*
   * A döntés EGY lépésben, a kirajzolás előtt születik (nincs köztes, félig eldőlt állapot): a jelölteket — ugyanott, ugyanott
   * kompaktan, a másik helyen kompaktan — közvetlenül a sávra írjuk, megmérjük, és az első olyan marad, amelyik a figurát nem
   * takarja. Ha egyik sem jó (kis képernyő, köztes vízszint — K2), a fenti kompakt sáv marad, és a kép annyival eltolódik,
   * hogy a figura szabad legyen. A választást a ref-ek is megkapják, így a React ugyanazt írja vissza.
   */
  useLayoutEffect(() => {
    if (presIdNow === null) return;
    if (decidedForRef.current === presIdNow) return;
    const el = quizElRef.current;
    measureStage();
    const fig = figureRect();
    if (!el || !fig) return;
    // Csak a teljes elrendezésre döntünk: ha a válaszgombok még nincsenek a DOM-ban (az első képkocka), a következő rendernél.
    if (document.querySelectorAll('[data-testid="ts-question"] .play-question-option').length < (pres?.options.length ?? 4)) return;
    decidedForRef.current = presIdNow;
    const first = quizPlaceRef.current;
    const other = first === "top" ? "bottom" : "top";
    const candidates: Array<{ place: "top" | "bottom"; high: boolean }> = [{ place: first, high: quizHighRef.current }];
    if (!quizHighRef.current) candidates.push({ place: first, high: true });
    candidates.push({ place: other, high: true });
    const measure = (c: { place: "top" | "bottom"; high: boolean }) => {
      el.setAttribute("data-place", c.place);
      el.setAttribute("data-high", c.high ? "true" : "false");
      return withQuestion(questionBoxes());
    };
    // Elsőbbségi sorrend: (1) a figura most is szabad ÉS bárhová mozoghat; (2) bárhová mozoghat (eltolással); (3) a régi
    // tartalék: a fenti kompakt sáv.
    // Lustán mérünk (minden mérés egy kényszerített elrendezés — 4× lassított CPU-n a kérdés-nyitás képkockájának jelentős része):
    // az első, (1)-nek megfelelő jelöltnél megállunk; a (2)-höz az addig mértek közül választunk.
    let chosen: { place: "top" | "bottom"; high: boolean } | null = null;
    let obs: Obstacle[] = [];
    let fallback: { c: { place: "top" | "bottom"; high: boolean }; obs: Obstacle[] } | null = null;
    for (const c of candidates) {
      const o = measure(c);
      const solvable = everyXSolvable(o, fig);
      if (solvable && !hitsAt(o, fig, 0)) {
        chosen = c;
        obs = o;
        break;
      }
      if (solvable && !fallback) fallback = { c, obs: o };
    }
    if (!chosen) {
      chosen = fallback?.c ?? { place: "top", high: true };
      obs = fallback ? fallback.obs : measure(chosen);
      // A DOM-on az utoljára mért jelölt áll: a választottat írjuk vissza (a React is ezt írja a ref-ekből).
      if (fallback) measure(chosen);
    }
    quizPlaceRef.current = chosen.place;
    quizHighRef.current = chosen.high;
    const before = liveRef.current.shiftPx ?? 0;
    const shift = solveShift(obs, fig, before);
    liveRef.current.shiftPx = shift;
    trackRef.current = { at: performance.now(), obs, id: presIdNow };
    // A nyugalom a kirajzolt eltoláshoz kötött: ha már megérkezett (változatlan eltolás, csökkentett mozgás, WebGL nélkül), most;
    // különben a képkocka-követő jelzi, amikor a jelenet visszaírt eltolása 1 px-en belül van.
    if (shiftArrived()) markSettled(presIdNow);
    else awaitSettleForRef.current = presIdNow;
  });
  /*
   * „Végig szabad”: a víz a nyitott kérdés alatt is emelkedik (lassítva), a figura oldalra is mozog (fekvő nézetben a szélső
   * válasz-oszlop alá kerülhetne), és kérdés nélkül is a vezérlők / a felső sáv alá mehetne (vak ellenőr K4, KICSI 5). A
   * kép-eltolás képkockánként követi, az akadályokat 250 ms-onként újramérve; szabad figuránál nem változik (nem remeg), és ha a
   * nulla eltolás is szabad, visszaáll.
   */
  const trackRef = useRef<{ at: number; obs: Obstacle[]; id: number | null }>({ at: 0, obs: [], id: null });
  trackShiftRef.current = () => {
    const view = qRef.current.view();
    const id = view.presentation?.id ?? null;
    // Nyitott kérdésnél csak a döntés után követünk (a döntés előtt a jelöltek mérése zajlik).
    if (id !== null && decidedForRef.current !== id) return;
    const now = performance.now();
    const cache = trackRef.current;
    if (now - cache.at > 250 || cache.id !== id) {
      cache.at = now;
      cache.id = id;
      cache.obs = id !== null && !view.reveal ? withQuestion(questionBoxes()) : frameObstacles();
      measureStage();
    }
    const fig = figureRect();
    if (!fig) return;
    liveRef.current.shiftPx = solveShift(cache.obs, fig, liveRef.current.shiftPx ?? 0);
    if (id !== null && awaitSettleForRef.current === id && shiftArrived()) markSettled(id);
  };

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
              subtitle={`Emelkedik a víz! ${winTargetFor(difficulty)} jó válasz kell a menedékig — minden jó válasz visszanyomja a hullámot.`}
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
                    kidMission={`Alulról emelkedik a tenger! Maradj a két zöld bója között — ott lassabban jön a víz —, a sodrás elvisz, a tárcsával (vagy a ← → nyilakkal) térj vissza, a Sprint gyorsít. Ha kérdés jön, a játék nem áll meg: a jó válasz visszanyomja a vizet, a rossz megemeli. ${winTargetFor(difficulty)} jó válasz, és fent vagy a menedékben!`}
                    parentBody={
                      <>
                        <strong className="text-cyan-100/90">Tananyag:</strong> 3–5. osztályos angol, matek, magyar nyelvtan és környezetismeret (3–12. évfolyamon a közös évfolyam-bankból); az angol kérdések a központi szóbankból is jönnek, ismétlés nélkül. A Vegyes kihívás körön belül váltogatja a tantárgyakat.
                        <br />
                        <strong className="text-cyan-100/90">Fejleszt:</strong> gyors döntés, olvasásértés, fejszámolás, figyelemmegosztás és reakcióidő.
                        <br />
                        <span className="text-white/70">
                          A kérdés a játék része: a jó válasz visszanyomja a vizet, a rossz megemeli — a játék nem áll meg. Az elrontott kérdés néhány kérdés múlva visszatér, a menet végén a „Gyakorold még” lista mutatja a megoldását.
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
                <li className="rounded-full border border-emerald-300/30 bg-emerald-500/10 px-3 py-1">🟢 Bóják között: lassabb víz</li>
                <li className="rounded-full border border-amber-300/30 bg-amber-500/10 px-3 py-1">⚡ Sprint</li>
                <li className="rounded-full border border-cyan-300/30 bg-cyan-500/10 px-3 py-1">✅ Jó válasz = apad a víz</li>
              </ul>
              <p className="text-center text-sm font-semibold text-cyan-100/90">
                Összes XP: <strong className="text-amber-300">{totalXp}</strong> · Legjobb sorozat:{" "}
                <strong className="text-orange-300">{bestStreak}</strong>
              </p>
            </StartScreen>
          </main>
        </>
      )}

      {(phase !== "menu" || scenePrewarm) && (
        <main
          ref={stageRef}
          className={phase === "menu" ? "absolute inset-0 overflow-hidden" : "relative flex-1 min-h-0 overflow-hidden"}
          style={phase === "menu" ? { padding: 0, visibility: "hidden", pointerEvents: "none", zIndex: 0 } : { padding: 0 }}
          data-testid={phase === "menu" ? "tsunami-stage-prewarm" : "tsunami-stage"}
          aria-hidden={resultOpen || phase === "menu" ? true : undefined}
        >
          {/* A játéktér a teljes képernyőt kitölti; a HUD, a kérdés és a vezérlők fölötte lebegnek. */}
          <div ref={shakeRef} className="absolute inset-0 z-0 overflow-hidden">
            <TsunamiScene3D
              live={liveRef}
              water={hud.water * WATER_VIEW_SCALE}
              playerX={50}
              safeZoneX={50}
              stormFlash={stormFlash}
              sprinting={false}
              phase={coreWon ? "won" : paused || explainCard ? "paused" : phase}
              light={lightGraphics}
              onSupportedChange={setScene3d}
            />
            {domScene && <canvas ref={flatCanvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" data-testid="tsunami-flat" />}
            {/* A menedék MINDIG látszik (D4) — a felirat a 3D házikó fölött (a DOM-tartaléknál a lapos rajzé). */}
            <div className="ts-shelter-tag" data-testid="ts-shelter" style={{ left: `${SHELTER_X * 100}%` }} aria-hidden="true">
              Menedék
            </div>
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
          {phase !== "menu" && (
          <>

          <GameHud
            onPause={pauseGame}
            stats={[
              { id: "goal", label: "Cél", value: <span data-testid="ts-goal">{hud.correct}/{hud.target}</span>, tone: "good" },
              { id: "wave", label: "Hullám", value: <span data-testid="ts-wave">{Math.round((hud.water / WATER_LOSE) * 100)}%</span>, tone: gapTone },
              { id: "score", label: "Pont", value: <span data-testid="ts-score">{hud.score}</span> },
            ]}
            progress={{
              value: hud.correct,
              max: hud.target,
              label: toShelter > 0 ? `Még ${toShelter} jó válasz a menedékig` : "Menedék!",
              tone: gapTone,
            }}
          >
            <CouponHud session={coupon} />
            {/*
              A jelzők sora nem kattintható felület. Gyökérok (mérve, 360×640): a közös `.game-hud > *` szabály a sort
              kattinthatóvá tette, így a második (tördelt) sor ÜRES része láthatatlan rétegként a menedék-házra feküdt.
            */}
            <div className="flex flex-wrap items-center gap-1.5" style={{ pointerEvents: "none" }}>
              <span className="max-w-[60vw] truncate rounded-full border border-amber-200/60 bg-slate-950/70 px-2.5 py-1 text-[13px] font-black text-amber-200 backdrop-blur-sm" data-testid="ts-subject-chip">
                {questionChip ?? `${runSubjectMeta.chip}: ${runSubjectMeta.label}`}
              </span>
              <span
                className="rounded-full border px-2.5 py-1 text-[13px] font-black backdrop-blur-sm"
                data-testid="ts-zone"
                data-in={hud.inZone ? "true" : "false"}
                style={hud.inZone ? { borderColor: "#86efacaa", background: "#14532dcc", color: "#dcfce7" } : { borderColor: "#fdba74aa", background: "#7c2d12cc", color: "#ffedd5" }}
              >
                {hud.inZone ? "Bóják között" : "Vissza a bójákhoz!"}
              </span>
              {hud.drift !== 0 && (
                <span className="rounded-full border border-sky-200/60 bg-slate-950/70 px-2.5 py-1 text-[13px] font-black text-sky-100 backdrop-blur-sm" data-testid="ts-drift">
                  Sodrás: {hud.drift > 0 ? "jobbra →" : "← balra"}
                </span>
              )}
              {hud.combo >= 2 && (
                <span
                  data-testid="tsunami-streak"
                  className="inline-flex items-center gap-1 rounded-full border border-orange-200/70 bg-orange-500/85 px-2.5 py-1 text-[13px] font-black text-white"
                >
                  <Flame className="h-4 w-4" aria-hidden="true" />×{hud.combo} sorozat
                </span>
              )}
            </div>
          </GameHud>
          <CouponExpiredOverlay session={coupon} />

          {/* A kérdés a kép tetején, a világ közben lassítva megy tovább (D1; a J1-fejezet: nem teljes képernyős, nem állít meg). */}
          {phase === "play" && pres && (
            <div
              ref={quizElRef}
              data-testid="ts-quiz"
              className="ts-quiz"
              data-place={quizPlaceRef.current}
              data-layout={settledForRef.current === pres.id ? "settled" : "settling"}
              data-high={quizHighRef.current ? "true" : "false"}
              style={quizBottom !== null ? ({ "--ts-quiz-bottom": `${quizBottom}px` } as CSSProperties) : undefined}
              data-state={reveal ? "reveal" : "open"}
              data-armed={armedId === pres.id || reveal ? "true" : "false"}
            >
              {questionBar(true)}
            </div>
          )}
          {/* A „Miért?” a megoldás-kijelzés után még 4 mp-ig (a következő kérdéstől függetlenül). */}
          {phase === "play" && !pres && questionBar(false)}

          {phase === "play" && hud.hint > 0 && !pres && hud.water * WATER_VIEW_SCALE < 40 && (
            <p className="ts-hint" data-testid="ts-hint" role="status">
              {touch ? "Tárcsa: mozgás · maradj a zöld bóják között" : "← → mozgás · Shift sprint · maradj a bóják között"}
            </p>
          )}

          {phase === "play" && touch && (
            <TsunamiTouchControls joyReset={joyReset} onJoystick={onJoystick} sprintStart={sprintStart} sprintEnd={sprintEnd} />
          )}
          {phase === "play" && !touch && (
            <p
              data-testid="tsunami-key-hint"
              className="game-key-hint absolute left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/20 bg-slate-950/75 px-4 py-2 text-sm font-semibold text-white/90 backdrop-blur-sm whitespace-nowrap"
              style={{ bottom: "max(12px, var(--game-safe-bottom))" }}
            >
              Mozgás: <kbd className="px-1.5 rounded bg-white/15">←</kbd> <kbd className="px-1.5 rounded bg-white/15">→</kbd> vagy{" "}
              <kbd className="px-1.5 rounded bg-white/15">A</kbd> <kbd className="px-1.5 rounded bg-white/15">D</kbd> · sprint:{" "}
              <kbd className="px-1.5 rounded bg-white/15">Shift</kbd> · válasz: <kbd className="px-1.5 rounded bg-white/15">1–4</kbd>
            </p>
          )}
          </>
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
                Jó válasz: <strong>{result?.correct ?? 0}</strong>/{result?.target ?? 0} a menedékig · víz: <strong>{result?.water ?? 0}%</strong>
              </span>
            </p>
            <p className="game-result-stat">
              <Flame className="h-5 w-5 text-orange-300" aria-hidden="true" />
              <span>
                Legjobb sorozat: <strong>{result?.bestStreak ?? 0}</strong> · {difficultyLabel(runDifficultyRef.current)} · {result?.seconds ?? 0} mp
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
          {hud.correct} / {hud.target} jó válasz · víz: {Math.round((hud.water / WATER_LOSE) * 100)}%
        </p>
      </PauseMenu>

      <style>{TSUNAMI_CSS}</style>
      {explainCard && <QuizFeedbackCard card={explainCard} onDismiss={dismissExplain} />}
    </GameShell>
  );
}

/** A DOM-tartalék (WebGL nélkül, spec E7): oldalnézeti 2D rajz a mag állapotából — a játék így is végigjátszható. */
/** A lapos rajz figurájának mérete a vízfelszínhez képest (px): a középpont 14 px-cel fölötte, 12 px-es sugár. */
const FLAT_FIGURE = { up: 28, down: 2, half: 14 } as const;
const flatClock = new WeakMap<HTMLCanvasElement, number>();

/**
 * Lapos (2D) tartalék — WebGL nélkül vagy kontextusvesztés után. Vak ellenőr GPT L1 / L2: a kérdés-sáv miatti kép-eltolást ez a
 * rajz is kirajzolja (a 3D-jelenettel azonos csillapítással, `lib/tsunami/shift.ts`), és MINDEN képkockán visszaírja a kirajzolt
 * eltolást és a figura dobozát — így a „nyugalomban” jelző a ténylegesen kirajzolt képhez kötött, és a 3D-renderelő régi
 * értékére sem várhat.
 */
function drawFlat(canvas: HTMLCanvasElement, driver: TsunamiDriver, live: TsunamiLive, reducedMotion: boolean): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const now = performance.now();
  const prevAt = flatClock.get(canvas);
  flatClock.set(canvas, now);
  const target = live.shiftPx ?? 0;
  const prevShown = live.shownShiftPx ?? target;
  const shift = reducedMotion ? target : dampShift(prevShown, target, prevAt === undefined ? 0 : (now - prevAt) / 1000);
  live.shownShiftPx = shift;
  const st = driver.core.state();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#7dd3fc";
  ctx.fillRect(0, 0, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, shift);
  const yOf = (pct: number) => h * (1 - (pct * WATER_VIEW_SCALE) / 100);
  ctx.fillStyle = "#c4843f";
  const first = w > h ? SHELTER_TOP_LANDSCAPE : SHELTER_TOP_PORTRAIT;
  for (const top of [0, 1, 2, 3].map((i) => first + ((78 - first) * i) / 3)) ctx.fillRect(w * 0.08, h * (top / 100) - 6, w * 0.84, 12);
  // A menedék (mindig látszik).
  const sx = w * SHELTER_X;
  ctx.fillStyle = "#fef3c7";
  const sy = h * (first / 100);
  ctx.fillRect(sx - 18, sy - 34, 36, 28);
  ctx.fillStyle = "#dc2626";
  ctx.beginPath();
  ctx.moveTo(sx - 24, sy - 34);
  ctx.lineTo(sx, sy - 54);
  ctx.lineTo(sx + 24, sy - 34);
  ctx.fill();
  const wy = yOf(st.water);
  ctx.fillStyle = "rgba(14,116,190,0.9)";
  ctx.fillRect(0, wy, w, h - wy);
  ctx.fillStyle = "#f0fbff";
  ctx.fillRect(0, wy - 4, w, 6);
  ctx.fillStyle = "#4ade80";
  for (const dx of [-ZONE_HALF, ZONE_HALF]) {
    ctx.beginPath();
    ctx.arc(w * ((st.zoneX + dx) / 100), wy, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#fb7a1c";
  ctx.beginPath();
  const fx = w * (st.x / 100);
  ctx.arc(fx, wy - 14, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Felfelé tolt képnél (negatív eltolás) a kép alja se maradjon víz nélkül.
  if (shift < 0) {
    ctx.fillStyle = "rgba(14,116,190,0.9)";
    ctx.fillRect(0, h + shift, w, -shift);
  }
  // A kirajzolt figura doboza (a játéktér-koordinátákban, mint a 3D-jelenet `figureBoxPx`-e) és a talpponthoz mért kiterjedése.
  live.figureBoxPx = { left: fx - FLAT_FIGURE.half, top: wy - FLAT_FIGURE.up + shift, right: fx + FLAT_FIGURE.half, bottom: wy + FLAT_FIGURE.down + shift };
  live.figureExtentPx = { up: FLAT_FIGURE.up, down: FLAT_FIGURE.down, left: FLAT_FIGURE.half, right: FLAT_FIGURE.half };
}

/**
 * A kérdés-sáv elhelyezése, a menedék-címke és a súgó stílusa (a játéklapé — a közös `index.css` a J0c / J8 szeleté); a
 * válaszgomb ≥ 48 px (K.4/16).
 */
const TSUNAMI_CSS = `
/* Asztali nézet: a közös 1200 px-es szélességkorlát a játéktérre nem vonatkozik (a jelenet a teljes képet tölti ki). */
.game-shell-fixed > main[data-testid="tsunami-stage"], .game-shell-fixed > main[data-testid="tsunami-stage-prewarm"] { max-width: none; width: 100%; }
/* B2: a menedék-deszka magassága (a jelenet SHELTER_TOP_PORTRAIT / _LANDSCAPE értékével egyezik) — a közös felső sáv alatt. */
:root { --ts-shelter-top: ${SHELTER_TOP_PORTRAIT}vh; }
@media (orientation: landscape) { :root { --ts-shelter-top: ${SHELTER_TOP_LANDSCAPE}vh; } }
.game-start-settings > summary, .game-start-secondary > *, .tsunami-settings-btn,
.tsunami-level-picker button { min-height: 52px; }
.tsunami-level-picker p { font-size: 14px; }
/* A kérdés-sáv a kép tetején (a HUD alatt); a figura és a víz alatta látszik. */
.ts-quiz { position: absolute; left: 0; right: 0; top: calc(var(--game-safe-top, 0px) + 96px); z-index: 35; pointer-events: none; padding: 0 12px; }
.ts-quiz[data-place="bottom"] { top: auto; bottom: calc(max(8px, var(--game-safe-bottom)) + var(--game-action-size, 88px) + 24px); }
/* A közös kérdés-sáv rögzített (fixed, inset 0) réteg: álló nézetben a helyét a figura szerint választjuk (fent / lent). */
.ts-quiz .play-question { --play-question-top: calc(max(4px, var(--game-safe-top)) + 92px); --play-question-bottom: var(--ts-quiz-bottom, calc(max(8px, var(--game-safe-bottom)) + var(--game-action-size) + 16px)); }
.ts-quiz[data-place="top"] .play-question { justify-content: flex-start; }
/* B2: álló nézetben a fenti kérdés a felső deszka (a menedék) ALATT kezdődik — a menedék nyitott kérdésnél is látszik. */
@media (orientation: portrait) {
  .ts-quiz[data-place="top"] .play-question { --play-question-top: max(calc(max(4px, var(--game-safe-top)) + 92px), calc(var(--ts-shelter-top) + 44px)); }
}
.ts-quiz[data-place="bottom"] .play-question { justify-content: flex-end; }
/*
 * Kompakt kérdés (koordinátori döntés 2026-11-18, „A”): kis képernyőn magas víznél csak a kérdés + a gombok, fejléc (címke,
 * idősáv, szünetgomb) nélkül — a szünet a felső sáv gombján marad. A kérdés-szöveg nem vágódik (nincs sorkorlát).
 */
@media (orientation: portrait), (orientation: landscape) and (max-height: 520px) {
  .ts-quiz[data-high="true"] .play-question-head { display: none; }
  .ts-quiz[data-high="true"] .play-question-card { padding: 6px 10px; }
  .ts-quiz[data-high="true"] .play-question-prompt { font-size: 14px; line-height: 1.25; display: block; -webkit-line-clamp: unset; line-clamp: none; max-height: none; overflow: visible; }
  .ts-quiz[data-high="true"] .play-question-more { display: none; }
  .ts-quiz[data-high="true"] .play-question-option { min-height: 48px; padding: 4px 8px; gap: 6px; font-size: 14px; }
  .ts-quiz[data-high="true"] .play-question-key { width: 24px; height: 24px; flex: 0 0 24px; }
  .ts-quiz[data-high="true"] .play-question-label { line-height: 1.2; }
}
/* Fekvő, kompakt, lent: a kártya és a négy gomb (2×2) középen, a tárcsa és a Sprint gomb közötti sávban. */
@media (orientation: landscape) and (max-height: 520px) {
  .ts-quiz[data-high="true"][data-place="bottom"] .play-question {
    display: flex; flex-direction: column; justify-content: flex-end; gap: 6px;
    padding: 0 calc(max(8px, var(--game-safe-right)) + 150px) max(8px, var(--game-safe-bottom)) calc(max(8px, var(--game-safe-left)) + 150px);
  }
  .ts-quiz[data-high="true"][data-place="bottom"] .play-question > .play-question-card { position: static; width: 100%; }
  .ts-quiz[data-high="true"][data-place="bottom"] .play-question .play-question-options {
    position: static; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; width: 100%; pointer-events: auto;
  }
  .ts-quiz[data-high="true"][data-place="bottom"] .play-question .play-question-col { display: contents; }
}
/* Magas víznél (a figura a kép közepén / felső felében) álló nézetben a négy válasz két oszlopban — alacsonyabb sáv. */
@media (orientation: portrait) { .ts-quiz[data-high="true"] .play-question .play-question-options { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
/* Fekvő nézetben lent: a kártya a vezérlők fölé kerül (a válasz-oszlopok a két szélen maradnak). */
@media (orientation: landscape) and (max-height: 520px) {
  .ts-quiz[data-place="bottom"] .play-question > .play-question-card { top: auto; bottom: var(--play-question-bottom); }
}
/* Mért (Pixel 7, 2,625-ös képpontarány): a pontosan 48 px-es ikongomb 47,9 px-nek mérődik — a szünetgomb itt 52 px. */
.ts-quiz .play-question-icon-btn { width: 52px; height: 52px; }
.ts-quiz .play-question-option { min-height: 48px; }
/* Élesítés: a megjelenés utáni első 400 ms-ban a válaszgombok még nem látszanak és nem érinthetők. */
.ts-quiz[data-armed="false"] .play-question-options { visibility: hidden; pointer-events: none; }
.ts-shelter-tag {
  position: absolute; top: calc(var(--ts-shelter-top) + 8px); transform: translateX(-50%); z-index: 4; pointer-events: none;
  padding: 2px 8px; border-radius: 9999px; background: #14532dd9; border: 1.5px solid #86efac; color: #dcfce7;
  font-size: 12px; font-weight: 900; white-space: nowrap;
}
.ts-hint {
  /* A1: a kezdő súgó a menedék-deszka alatt, a kép felső harmadában — nem takarja a figurát és a bójákat. */
  position: absolute; left: 50%; top: calc(var(--ts-shelter-top) + 44px); transform: translateX(-50%); z-index: 25;
  max-width: calc(100% - 24px); margin: 0; padding: 8px 14px; border-radius: 9999px; pointer-events: none;
  background: #0b172dd9; border: 1.5px solid #fef08a99; color: #fef9c3; font-size: 15px; font-weight: 800; line-height: 1.25;
  text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: 0 6px 18px #0008;
}
/*
 * Csiszoló kör 1. pont: álló nézetben a súgó a kép felső harmadában a közeledő hullámfal tarajára esett. A súgó csak alacsony
 * víznél látszik (a figura a kép alsó 40 %-ában), ezért a kép közepére kerül: a figura feje fölé, a hullámfal alá.
 */
@media (orientation: portrait) { .ts-hint { top: 46%; } }
`;
