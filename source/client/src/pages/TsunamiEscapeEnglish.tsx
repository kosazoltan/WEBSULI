import { isPlayableQuestion } from "@shared/game-quiz-contract";
import { createAdaptiveSession } from "@/game-engine/adaptiveSession";
import { QUIZ_TIMEOUT_SEC, tsunamiQuizSeconds, tsunamiWaterPace } from "@/game-engine/tsunamiTiming";
import { useGradeLevel } from "@/game-engine/useGradeLevel";
import { GradeLevelPicker } from "@/game-engine/GradeLevelPicker";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  markGradeQuizSeen,
  pickGradeQuiz,
  pickUnseenMaterial,
} from "@/game-engine/gradeQuiz";
import ClassroomGateModal from "@/components/ClassroomGateModal";
import { sfxSuccess, sfxError, sfxLevelUp } from "@/lib/audioEngine";
import { recordRun, type Achievement } from "@/lib/achievements";
import { quizTopicLabelHu } from "@/lib/quizTopicLabel";
import { isTodaysGameAvailable, markDailyCompleted } from "@/lib/dailyChallenge";
import { useCouponSession } from "@/game-engine/useCouponSession";
import { maybeClaimCouponBonus } from "@/game-engine/claimCouponBonus";
import { CouponHud, CouponExpiredOverlay } from "@/game-engine/CouponHud";
import { correctDataAttrs, installGameTestApi } from "@/game-engine/game-test-hooks";
import { ArrowLeft, Check, Flame, Pause, Shield, Timer, Waves, Wind, X } from "lucide-react";
import VirtualJoystick from "@/game-engine/VirtualJoystick";
import HoldButton from "@/game-engine/HoldButton";
import { joystickToDirections } from "@/game-engine/joystick";
import { useReducedMotion } from "@/game-engine/useReducedMotion";
import { detectLookTier } from "@/game-engine/three-look";
import { pickUnseen, type SeenItem } from "@/game-engine/no-repeat";
import { useVocabQuizSource, vocabLevelForGrade } from "@/game-engine/vocab";
import {
  GameHud,
  GameShell,
  PauseMenu,
  ResultScreen,
  StartScreen,
  useBestScore,
  useHaptics,
  useTouchCapable,
  type GameScreenState,
} from "@/game-engine/mobile";
import { motion, AnimatePresence } from "framer-motion";
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
import TsunamiScene3D from "@/game-engine/scenes/TsunamiScene3D";
import { buildFeedback, type FeedbackCard } from "@/game-engine/feedback";

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

const PRESETS: Record<
  GameDifficulty,
  { waterRisePerSec: number; quizEverySec: number; waterPush: number; xpPerCorrect: number; runBonus: number }
> = {
  easy: { waterRisePerSec: 1.25, quizEverySec: 9.5, waterPush: 25, xpPerCorrect: 28, runBonus: 3 },
  normal: { waterRisePerSec: 1.85, quizEverySec: 8, waterPush: 23, xpPerCorrect: 30, runBonus: 3 },
  hard: { waterRisePerSec: 2.55, quizEverySec: 6.7, waterPush: 20, xpPerCorrect: 38, runBonus: 3 },
};

/** Ennyi helyes kvíz egy körben = győzelem (nem a hullám üzenet) */
const WIN_QUIZ_COUNT: Record<GameDifficulty, number> = {
  easy: 6,
  normal: 8,
  hard: 10,
};

const WIN_BONUS_XP = 150;
const SAFE_ZONE_BONUS_XP = 6;
const QUIZ_WRONG_WATER_PENALTY: Record<GameDifficulty, number> = {
  easy: 4,
  normal: 6,
  hard: 8,
};
const VISUAL_FPS = 24;

function winQuizTarget(d: GameDifficulty): number {
  return WIN_QUIZ_COUNT[d];
}

function shuffleQuiz(q: Quiz): Quiz {
  const indexed = q.options.map((opt, idx) => ({ opt, idx }));
  for (let i = indexed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = indexed[i]!;
    indexed[i] = indexed[j]!;
    indexed[j] = tmp;
  }
  const correctIndex = indexed.findIndex((x) => x.idx === q.correctIndex);
  return {
    ...q,
    options: indexed.map((x) => x.opt),
    optionIndices: indexed.map(x => q.optionIndices?.[x.idx] ?? x.idx),
    correctIndex: correctIndex < 0 ? 0 : correctIndex,
  };
}

type Phase = "menu" | "play" | "quiz" | "over" | "won";

type SyncEligibility = { eligible: boolean; reason?: string };

type ActiveQuizPools = Record<TsunamiCoreSubject, SubjectQuizPools>;

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

/** A víz és a menekülési határ (88 %) közti távolság „méterben” a HUD-hoz (12 % → 38 m, 88 % → 0 m). */
function waveDistanceMeters(water: number): number {
  return Math.max(0, Math.round((88 - water) / 2));
}

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
   * folytatás a régi zárlattal futhat le a következő renderelés előtt (mérve: a győzelem után egy elavult képkocka
   * még kvízt nyitott); ezek a refet olvassák, ezért elavult hívás nem válthat fázist.
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
  const [water, setWater] = useState(12);
  const [playerX, setPlayerX] = useState(50);
  const [runSeconds, setRunSeconds] = useState(0);
  const [streak, setStreak] = useState(0);
  const [sessionXp, setSessionXp] = useState(0);
  const [totalXp, setTotalXp] = useState(() => loadNumber(LS_XP, 0));
  const [bestStreak, setBestStreak] = useState(() => loadNumber(LS_BEST, 0));
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [wrongShake, setWrongShake] = useState(false);
  const [rewardBurst, setRewardBurst] = useState(false);
  const [lastQuizXp, setLastQuizXp] = useState(25);
  const [correctQuizzesInRun, setCorrectQuizzesInRun] = useState(0);
  const [safeZoneX, setSafeZoneX] = useState(50);
  const adaptiveRef = useRef(createAdaptiveSession(4));
  // Spec 2026-09-29-palyak-szoletra-nyelvek (E szelet): 10 pálya évfolyamonként (3–12.); a futás pályája a startkor rögzül.
  const runLevelRef = useRef<number | null>(null);
  const levelClearedRef = useRef(false);
  const [quizTimeLeft, setQuizTimeLeft] = useState(QUIZ_TIMEOUT_SEC.normal);
  /** A kérdés teljes ideje (az időcsík arányához). */
  const [quizTimeTotal, setQuizTimeTotal] = useState(QUIZ_TIMEOUT_SEC.normal);
  const [stormFlash, setStormFlash] = useState(false);
  const [driftDir, setDriftDir] = useState(0);
  /** S9: az eszköz képességéből, egyszer (lásd `isLowEnd`). */
  const [lightGraphics] = useState<boolean>(isLowEnd);
  /** 3D scene layer: null until probed; false → the DOM scene below is drawn instead (spec E7). */
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
  /** Rövid visszajelzés a választott gombon (jó: zöld pipa; rossz: piros). */
  const [answerFx, setAnswerFx] = useState<{ index: number; ok: boolean } | null>(null);
  /** A futás összes megválaszolt kérdése (jó + rossz + lejárt) — az eredményképernyő arányához. */
  const answeredCountRef = useRef(0);
  /** A helyes válasz utáni késleltetett folytatás időzítője (kilépéskor / újrakezdéskor törlendő). */
  const continueTimerRef = useRef(0);
  useEffect(() => () => clearTimeout(continueTimerRef.current), []);
  /** G-1: magyarázó kártya rossz válaszra. */
  const [explainCard, setExplainCard] = useState<FeedbackCard | null>(null);

  const keysRef = useRef({ left: false, right: false, sprint: false });
  const playerXRef = useRef(playerX);
  const safeZoneXRef = useRef(safeZoneX);
  const waterRef = useRef(water);
  const lastVisualFrameRef = useRef(0);
  playerXRef.current = playerX;
  safeZoneXRef.current = safeZoneX;
  const lastRef = useRef<number | null>(null);
  const quizTimerRef = useRef(0);
  const runTimerRef = useRef(0);
  const safeZoneTimerRef = useRef(0);
  const stormTimerRef = useRef(0);
  /** S9: a futás MINDEN kiadott kérdése (`{ id, prompt }`) — az ismétlés-szűrés a teljes futásra érvényes. */
  const runSeenRef = useRef<SeenItem[]>([]);
  const driftDirRef = useRef(0);
  const rafRef = useRef<number>(0);
  const paramsRef = useRef(PRESETS.normal);
  const runDifficultyRef = useRef<GameDifficulty>("normal");
  const correctQuizCountRef = useRef(0);
  /** Futáson belüli max streak — leaderboard/achievement-hez (a kör-végi streak gyakran 0). */
  const runBestStreakRef = useRef(0);
  /** Hibás válaszok + kvíz-timeoutok száma a futásban (lifetime stat-hoz). */
  const wrongAnswersRef = useRef(0);
  /** Dupla-kattintás-lock a kvíz-válaszra. */
  const answerLockedRef = useRef(false);
  const scoreSubmittedRef = useRef(false);
  const runSubjectRef = useRef<TsunamiSubject>("mixed");
  const subjectRoundRef = useRef(0);
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

  // Játékos osztály-specifikus tananyag-kvíz bank (Claude-generált) — minden
  // material-tétel az `english` subject `med` (medium) tier-jébe kerül, függetlenül
  // a topic-tól, így az alap "english" mode-ban (ami a leggyakoribb) elérhető.
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

  // Évfolyam-váltáskor (pl. a ClassroomGateModal után) az alapérték követi az évfolyamot,
  // amíg a játékos nem választott kézzel.
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
   * A tananyag három úton jut be (tananyag-elsőbbség, kupon-jutalom, a közepes készlet), ezért a kérdésszöveg a kulcs.
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

  const pickQuiz = useCallback((): Quiz => {
    const d = runDifficultyRef.current;
    const activeSubject = runSubjectRef.current;
    const target = winQuizTarget(d);
    const done = correctQuizCountRef.current;
    const p = target > 0 ? Math.min(1, done / target) : 0;
    let eff = p;
    if (d === "hard") eff = Math.min(1, p * 1.22);
    if (d === "easy") eff = p * 0.78;

    /**
     * S9: minden kiadott kérdés a futás listájába (`runSeenRef`) és az évfolyam-bank `seen`-jébe kerül, így a
     * teljes futásban egyik ág sem ismétel. A kézi (nem szóbankos) angol kérdés helyes válasza a közös szóbank-
     * naplóba is bekerül (`markExternal`), hogy ugyanaz a szó ne jöjjön vissza a bankból.
     */
    const issue = (q: Quiz): Quiz => {
      runSeenRef.current.push({ id: q.id, prompt: q.prompt });
      markGradeQuizSeen(gradeSeenRef.current, q);
      if (q.subject === "english" && !q.id.startsWith("vocab:") && !materialPromptsRef.current.has(q.prompt)) {
        vocabRef.current?.markExternal(q.options[q.correctIndex] ?? "");
      }
      return shuffleQuiz(q);
    };
    const englishLevel = (band: number) => vocabLevelForGrade(userGradeRef.current, band);

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
      const band = clampBand(adaptiveRef.current.band + bandShiftForDifficulty(d));
      for (let i = 0; i < subjects.length; i++) {
        const gradeSubject = subjects[gradeSubjectRoundRef.current++ % subjects.length]!;
        if (gradeSubject === "english" && vocabRef.current) {
          const fromBank = vocabRef.current.next(englishLevel(band));
          if (fromBank) return issue({ ...fromBank, subject: "english", topic: null });
        }
        const item = pickGradeQuiz({ grade: sharedGrade, band, subjects: [gradeSubject], seen });
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
      const reward = pickUnseen([rewardQuestionsRef.current], 0, runSeenRef.current);
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
        const fromBank = vocabRef.current.next(englishLevel(adaptiveRef.current.band));
        if (fromBank) return issue({ ...fromBank, subject: "english", topic: null });
      }
    }
    const { easy: poolE, med: poolM, hard: poolH } = mergedPoolsRef.current[subjectKey];
    // S9: a teljes futás kiadott kérdéseit kerüli (nem csak az utolsó ötöt); a kívánt szint elfogyása után a
    // szomszéd szint jön, és csak teljes kimerülésnél ismétel (a legrégebben látottat).
    const picked = pickUnseen([poolE, poolM, poolH], tierForProgress(eff), runSeenRef.current);
    return issue(picked ?? poolE[0]!);
  }, []);

  const startGame = useCallback(() => {
    clearTimeout(continueTimerRef.current);
    continueTimerRef.current = 0;
    runIdRef.current += 1;
    runLevelRef.current = levels.level;
    levelClearedRef.current = false;
    adaptiveRef.current.reset(userGrade ?? 4, runLevelRef.current);
    paramsRef.current = PRESETS[difficulty];
    runDifficultyRef.current = difficulty;
    runSubjectRef.current = subject;
    subjectRoundRef.current = 0;
    scoreSubmittedRef.current = false;
    setWater(12);
    setPlayerX(50);
    waterRef.current = 12;
    playerXRef.current = 50;
    lastVisualFrameRef.current = 0;
    setRunSeconds(0);
    setStreak(0);
    setSessionXp(0);
    setCorrectQuizzesInRun(0);
    setSafeZoneX(50);
    setQuizTimeLeft(tsunamiQuizSeconds(difficulty, adaptiveRef.current.band));
    setStormFlash(false);
    setDriftDir(0);
    driftDirRef.current = 0;
    correctQuizCountRef.current = 0;
    runBestStreakRef.current = 0;
    wrongAnswersRef.current = 0;
    answerLockedRef.current = false;
    answeredCountRef.current = 0;
    runSeenRef.current = [];
    gradeSeenRef.current = createGradeQuizSeen();
    goPaused(false);
    setAnswerFx(null);
    setExplainCard(null);
    setBestResult(null);
    setNewlyUnlocked([]);
    gradeSubjectRoundRef.current = 0;
    // Give an early first quiz so the run does not feel empty at the start.
    quizTimerRef.current = Math.max(0, PRESETS[difficulty].quizEverySec * 0.72);
    runTimerRef.current = 0;
    safeZoneTimerRef.current = 0;
    stormTimerRef.current = 0;
    lastRef.current = null;
    setQuiz(null);
    goPhase("play");
  }, [difficulty, subject, userGrade, levels.level]);

  /** S9 / terv 4.5: szünet — a játékciklus és a kvízóra áll, a vezérlés elenged. */
  const pauseGame = useCallback(() => {
    if (phase !== "play" && phase !== "quiz") return;
    keysRef.current.left = false;
    keysRef.current.right = false;
    keysRef.current.sprint = false;
    setJoyReset((n) => n + 1);
    goPaused(true);
  }, [phase]);

  const resumeGame = useCallback(() => {
    lastRef.current = null;
    goPaused(false);
  }, []);

  const exitToMenu = useCallback(() => {
    clearTimeout(continueTimerRef.current);
    continueTimerRef.current = 0;
    runIdRef.current += 1;
    goPaused(false);
    setQuiz(null);
    setExplainCard(null);
    setAnswerFx(null);
    answerLockedRef.current = false;
    goPhase("menu");
  }, []);

  useEffect(() => {
    return installGameTestApi({
      probe: () => {
        const band = adaptiveRef.current.band;
        return {
          level: runLevelRef.current,
          band,
          waterPace: runLevelRef.current == null ? 1 : tsunamiWaterPace(band),
          quizSeconds: tsunamiQuizSeconds(runDifficultyRef.current, band),
        };
      },
      forceState: (patch) => {
        if (typeof patch.correctCount === "number") {
          correctQuizCountRef.current = patch.correctCount;
          answeredCountRef.current = Math.max(answeredCountRef.current, patch.correctCount);
          setCorrectQuizzesInRun(patch.correctCount);
        }
        if (patch.phase === "quiz") {
          // S9 (M9, M10): egy kérdés azonnal, a valós választóból.
          answerLockedRef.current = false;
          setQuiz(pickQuiz());
          const secs = tsunamiQuizSeconds(runDifficultyRef.current, adaptiveRef.current.band);
          setQuizTimeLeft(secs);
          setQuizTimeTotal(secs);
          goPhase("quiz");
          return;
        }
        if (patch.phase === "won" || patch.phase === "over" || patch.phase === "menu" || patch.phase === "play") {
          goPhase(patch.phase);
        }
      },
    });
  }, [pickQuiz]);

  // A győzelem (a nehézség célszámú jó válasza) a következő pályát oldja fel; a menü azt ajánlja.
  useEffect(() => {
    if (phase === "won" && runLevelRef.current != null && !levelClearedRef.current) {
      levelClearedRef.current = true;
      levels.complete(runLevelRef.current);
    }
  }, [phase]);

  // R = quick-restart az "over" / "won" / "menu" képernyőn.
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

  const endGame = useCallback(() => {
    goPhase("over");
    cancelAnimationFrame(rafRef.current);
    lastRef.current = null;
  }, []);

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

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keysRef.current.left = true;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keysRef.current.right = true;
      if (e.key === "Shift") keysRef.current.sprint = true;
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
  }, [phase]);

  const sprintStart = useCallback(() => {
    keysRef.current.sprint = true;
  }, []);
  const sprintEnd = useCallback(() => {
    keysRef.current.sprint = false;
  }, []);
  const onJoystick = useCallback((v: Parameters<typeof joystickToDirections>[0]) => {
    const dirs = joystickToDirections(v);
    keysRef.current.left = dirs.left;
    keysRef.current.right = dirs.right;
  }, []);

  const gameLoop = useCallback(
    (t: number) => {
      if (phase !== "play" || paused) return;
      // Review #426: egy már ütemezett, elavult képkocka (régi zárlat) se futtassa tovább a kört.
      if (phaseNowRef.current !== "play" || pausedNowRef.current) return;

      const last = lastRef.current;
      lastRef.current = t;
      const dt = last == null ? 0 : Math.min(0.05, (t - last) / 1000);

      const P = paramsRef.current;
      const target = winQuizTarget(runDifficultyRef.current);
      const prog = target > 0 ? Math.min(1, correctQuizCountRef.current / target) : 0;
      const waterStress = Math.pow(prog, 1.42);
      const currentPush = Math.sin(t * 0.0017) * (4 + waterStress * 18);
      const driftSign = currentPush >= 0 ? 1 : -1;
      if (driftSign !== driftDirRef.current) {
        driftDirRef.current = driftSign;
        setDriftDir(driftSign);
      }
      const floorQuizSec = runDifficultyRef.current === "hard" ? 4.6 : runDifficultyRef.current === "normal" ? 5.8 : 7.8;
      const quizCurve = Math.pow(prog, 1.38);
      const quizEveryDyn = Math.max(floorQuizSec, P.quizEverySec * (1.34 - quizCurve * 0.8));
      const inSafeZone = Math.abs(playerXRef.current - safeZoneXRef.current) <= 9;
      const safeZoneFactor = inSafeZone ? 0.74 : 1.04;
      // Pályán a sáv mérsékelten gyorsítja/lassítja a vizet (E szelet, D8); pálya nélkül a régi tempó.
      const levelPace = runLevelRef.current == null ? 1 : tsunamiWaterPace(adaptiveRef.current.band);
      const waterRise = P.waterRisePerSec * (0.62 + waterStress * 1.18) * safeZoneFactor * levelPace;

      let nextWater = waterRef.current + waterRise * dt;
      const maxPct = 88;
      if (nextWater >= maxPct) {
        nextWater = maxPct;
        waterRef.current = nextWater;
        setWater(nextWater);
        queueMicrotask(endGame);
        return;
      }
      waterRef.current = nextWater;

      let nx = playerXRef.current;
      const sprintMult = keysRef.current.sprint ? 1.5 : 1;
      if (keysRef.current.left) nx -= 38 * sprintMult * dt;
      if (keysRef.current.right) nx += 38 * sprintMult * dt;
      nx += currentPush * dt;
      playerXRef.current = Math.max(8, Math.min(92, nx));

      safeZoneTimerRef.current += dt;
      const safeZoneEvery = runDifficultyRef.current === "hard" ? 5.2 : runDifficultyRef.current === "normal" ? 6.3 : 7.6;
      if (safeZoneTimerRef.current >= safeZoneEvery) {
        safeZoneTimerRef.current = 0;
        setSafeZoneX(16 + Math.random() * 68);
      }

      stormTimerRef.current += dt;
      if (stormTimerRef.current >= (runDifficultyRef.current === "hard" ? 5.6 : 7.2)) {
        stormTimerRef.current = 0;
        // Csökkentett mozgásnál nincs villámlás-villanás (M9).
        if (!reducedMotion && Math.random() < 0.42 + prog * 0.3) {
          setStormFlash(true);
          timeoutsRef.current.push(window.setTimeout(() => setStormFlash(false), 170));
        }
      }

      quizTimerRef.current += dt;
      if (quizTimerRef.current >= quizEveryDyn) {
        quizTimerRef.current = 0;
        setQuiz(pickQuiz());
        const secs = tsunamiQuizSeconds(runDifficultyRef.current, adaptiveRef.current.band);
        setQuizTimeLeft(secs);
        setQuizTimeTotal(secs);
        goPhase("quiz");
        return;
      }

      runTimerRef.current += dt;
      if (runTimerRef.current >= 1) {
        runTimerRef.current -= 1;
        const bonus = P.runBonus + (inSafeZone ? SAFE_ZONE_BONUS_XP : 0);
        setRunSeconds((s) => s + 1);
        setSessionXp((xp) => xp + bonus);
        setTotalXp((tx) => tx + bonus);
      }

      const visualMs = 1000 / VISUAL_FPS;
      if (t - lastVisualFrameRef.current >= visualMs) {
        lastVisualFrameRef.current = t;
        setWater(waterRef.current);
        setPlayerX(playerXRef.current);
      }

      rafRef.current = requestAnimationFrame(gameLoop);
    },
    [phase, paused, reducedMotion, pickQuiz, endGame],
  );

  useEffect(() => {
    if (phase !== "play" || paused) {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    lastRef.current = null;
    rafRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, paused, gameLoop]);

  const dismissExplain = useCallback(() => {
    setExplainCard(null);
    setAnswerFx(null);
    setQuiz(null);
    goPhase("play");
    lastRef.current = null;
    answerLockedRef.current = false;
  }, []);

  const onAnswer = (index: number) => {
    // S13 / review K1: szünetben nincs válasz (a háttér inert, de a billentyűs út ellen is védünk).
    if (!quiz || paused) return;
    // VÁLASZ-LOCK: dupla kattintás ne dolgozza fel kétszer ugyanazt a kvízt
    // (dupla XP/streak/correctCount, akár korai "won" is lehetett).
    if (answerLockedRef.current) return;
    answerLockedRef.current = true;
    adaptiveRef.current.answer(index === quiz.correctIndex);
    maybeClaimCouponBonus(coupon, quiz.id, quiz.optionIndices?.[index] ?? index);
    answeredCountRef.current += 1;
    if (index !== quiz.correctIndex) {
      wrongAnswersRef.current += 1;
      sfxError();
      haptics("error");
      if (index >= 0) setAnswerFx({ index, ok: false });
      setWrongShake(true);
      timeoutsRef.current.push(window.setTimeout(() => setWrongShake(false), 320));
      setStreak(0);
      waterRef.current = Math.min(88, waterRef.current + QUIZ_WRONG_WATER_PENALTY[runDifficultyRef.current]);
      setWater(waterRef.current);
      // G-1: 280 ms alatt a gyerek annyit érzékelt, hogy emelkedett a víz — azt
      // nem, hogy mit rontott el. A magyarázó kártya addig áll, amíg be nem
      // zárja; a víz nem emelkedik tovább közben, mert a játék áll.
      setExplainCard(
        buildFeedback({
          quiz: {
            prompt: quiz.prompt,
            options: quiz.options,
            correctIndex: quiz.correctIndex,
            // A séma `null`-t is enged (régi sor); a motor `undefined`-ot vár.
            explanation: quiz.explanation ?? undefined,
          },
          chosenIndex: index < 0 ? null : index,
          attempt: 0,
          ageBand: "kid",
        }),
      );
      return;
    }

    sfxSuccess();
    haptics("success");
    setAnswerFx({ index, ok: true });

    setRewardBurst(true);
    timeoutsRef.current.push(window.setTimeout(() => setRewardBurst(false), 900));

    const add = paramsRef.current.xpPerCorrect;
    setLastQuizXp(add);
    setSessionXp((x) => x + add);
    setTotalXp((t) => t + add);
    setStreak((s) => {
      const n = s + 1;
      // Futáson belüli max streak — a leaderboard/achievement EZT kapja,
      // nem a kör-végi (gyakran 0-ra resetelt) értéket.
      if (n > runBestStreakRef.current) runBestStreakRef.current = n;
      setBestStreak((b) => (n > b ? n : b));
      return n;
    });
    waterRef.current = Math.max(5, waterRef.current - paramsRef.current.waterPush);
    setWater(waterRef.current);

    correctQuizCountRef.current += 1;
    const nCorrect = correctQuizCountRef.current;
    setCorrectQuizzesInRun(nCorrect);

    const need = winQuizTarget(runDifficultyRef.current);
    if (nCorrect >= need) {
      sfxLevelUp();
      setSessionXp((x) => x + WIN_BONUS_XP);
      setTotalXp((t) => t + WIN_BONUS_XP);
      setQuiz(null);
      setAnswerFx(null);
      cancelAnimationFrame(rafRef.current);
      lastRef.current = null;
      answerLockedRef.current = false;
      goPhase("won");
      return;
    }

    // S9: a zöld pipa egy pillanatig látszik a választott gombon (azonnali, látható jutalom), utána fut tovább.
    // Review #426: az időzítő a `continueTimerRef`-ben él, így a menübe lépés / újrakezdés törli — különben az
    // elhagyott kör a menü helyett újraindulna.
    clearTimeout(continueTimerRef.current);
    const runId = runIdRef.current;
    continueTimerRef.current = window.setTimeout(() => {
      continueTimerRef.current = 0;
      // Csak a saját futásában és még kvíz-fázisban hat (kilépés, újrakezdés, eredmény után nem).
      if (runIdRef.current !== runId || phaseNowRef.current !== "quiz") return;
      setQuiz(null);
      setAnswerFx(null);
      goPhase("play");
      lastRef.current = null;
      answerLockedRef.current = false;
    }, reducedMotion ? 150 : 420);
  };

  const answerRef = useRef(onAnswer);
  answerRef.current = onAnswer;

  useEffect(() => {
    if (phase !== "quiz" || explainCard || paused) return;
    const id = setInterval(() => {
      if (answerLockedRef.current) return;
      setQuizTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [phase, explainCard, paused]);

  useEffect(() => {
    if (phase === "quiz" && !explainCard && quizTimeLeft <= 0) answerRef.current(-1);
  }, [phase, explainCard, quizTimeLeft]);

  const surfacePct = useMemo(() => Math.min(100, water), [water]);
  const selectedSubjectMeta = TSUNAMI_SUBJECT_META[subject];
  const runSubjectMeta = TSUNAMI_SUBJECT_META[runSubjectRef.current];
  const quizSubjectMeta = quiz?.topic ? { label: quizTopicLabelHu(quiz.topic), chip: "LECKE" } : quiz ? TSUNAMI_SUBJECT_META[quiz.subject] : runSubjectMeta;

  useEffect(() => {
    if (phase !== "over" && phase !== "won") return;
    if (!syncEligibility?.eligible) return;
    if (scoreSubmittedRef.current) return;
    scoreSubmittedRef.current = true;

    const payload = {
      gameId: "tsunami-english",
      difficulty: runDifficultyRef.current,
      runXp: sessionXp,
      runStreak: runBestStreakRef.current,
      runSeconds,
      runId: newScoreRunId(),
    };

    void postGameScore(payload)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["/api/games/leaderboard/tsunami"] });
      })
      .catch(() => {
        scoreSubmittedRef.current = false;
      });
  }, [phase, syncEligibility, sessionXp, streak, runSeconds]);

  // S9: helyi legjobb pontszám (névtelen látogatónak is) — egyszer, az eredményképernyő megnyitásakor.
  useEffect(() => {
    if (phase !== "over" && phase !== "won") return;
    if (bestResult) return;
    setBestResult(bestScore.submit(sessionXp));
  }, [phase, bestResult, bestScore, sessionXp]);

  // Achievement + Daily — egyszer fut "over" / "won" átmenetkor.
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[]>([]);
  const achievementCheckedRef = useRef(false);

  // D6 a11y: quiz-overlay dialog ref + Escape + auto-focus
  const quizDialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase !== "quiz") return;
    const t = window.setTimeout(() => {
      const first = quizDialogRef.current?.querySelector<HTMLElement>("[data-testid^=\"ts-option-\"]");
      first?.focus();
    }, 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [phase]);
  useEffect(() => {
    if (phase !== "over" && phase !== "won") {
      achievementCheckedRef.current = false;
      return;
    }
    if (achievementCheckedRef.current) return;
    achievementCheckedRef.current = true;
    const wasDailyAvailable = isTodaysGameAvailable("tsunami-english");
    const newOnes = recordRun({
      game: "tsunami-english",
      xpGained: sessionXp,
      correctAnswers: correctQuizCountRef.current,
      wrongAnswers: wrongAnswersRef.current,
      maxStreak: runBestStreakRef.current,
      perfect: phase === "won" && wrongAnswersRef.current === 0 && correctQuizCountRef.current >= 5,
      fullClear: phase === "won",
    });
    if (wasDailyAvailable && phase === "won") {
      const daily = markDailyCompleted();
      if (daily.achievements.length > 0) newOnes.push(...daily.achievements);
    }
    if (newOnes.length > 0) setNewlyUnlocked(newOnes);
  }, [phase, sessionXp, streak]);

  const target = winQuizTarget(runDifficultyRef.current);
  const remaining = Math.max(0, target - correctQuizzesInRun);
  const playingPhase = phase === "play" || phase === "quiz";
  const shellState: GameScreenState =
    phase === "menu" ? "start" : playingPhase ? (paused ? "paused" : "playing") : "result";
  const distance = waveDistanceMeters(water);
  const danger = distance <= 8;
  const distanceTone = danger ? "bad" : distance <= 16 ? "warn" : "default";
  const inSafeZone = Math.abs(playerX - safeZoneX) <= 9;
  const resultOpen = phase === "won" || phase === "over";
  const quizRatio = quizTimeTotal > 0 ? Math.max(0, Math.min(1, quizTimeLeft / quizTimeTotal)) : 0;

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
              subtitle={`Fuss a hullám elől! Minden jó válasz lejjebb nyomja a vizet — ${winQuizTarget(difficulty)} helyes válasz, és megmenekültél.`}
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
                    kidMission={`Fuss el a víz elől! Válassz tantárgyat vagy Vegyes kihívást: jó válasz = XP + lejjebb megy a hullám. Egy körben szerezz ${winQuizTarget(difficulty)} helyes kvízt, és győztél — jár a nagy bónusz XP!`}
                    parentBody={
                      <>
                        <strong className="text-cyan-100/90">Tananyag:</strong> 3–5. osztályos angol, matek, magyar nyelvtan és környezetismeret; az angol kérdések a központi szóbankból is jönnek, ismétlés nélkül. A Vegyes kihívás körön belül váltogatja a tantárgyakat.
                        <br />
                        <strong className="text-cyan-100/90">Fejleszt:</strong> gyors döntés, olvasásértés, fejszámolás, helyesírási figyelem, természettudományos kapcsolatok és stratégia (biztonsági zóna).
                        <br />
                        <span className="text-white/70">
                          Felépítés: cél (menekülés) → akadály (víz, sodrás) → rövid teszt → azonnali jutalom (XP, vízcsökkenés) vagy következmény — a gyakorlás és a visszajelzés szorosan összekapcsolva.
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
              <p className="text-center text-sm font-semibold text-cyan-100/90">
                Összes XP: <strong className="text-amber-300">{totalXp}</strong> · Legjobb sorozat:{" "}
                <strong className="text-orange-300">{bestStreak}</strong>
              </p>
            </StartScreen>
          </main>
        </>
      )}

      {playingPhase && (
        <main className="relative flex-1 min-h-0 overflow-hidden" style={{ padding: 0 }} data-testid="tsunami-stage">
          {/* A játéktér a teljes képernyőt kitölti; a HUD és a vezérlők fölötte lebegnek. */}
          <div className="absolute inset-0 z-0 overflow-hidden">
            <TsunamiScene3D
              water={surfacePct}
              playerX={playerX}
              safeZoneX={safeZoneX}
              stormFlash={stormFlash}
              sprinting={keysRef.current.sprint}
              phase={paused ? "paused" : phase}
              light={lightGraphics}
              onSupportedChange={setScene3d}
            />
            {domScene && (
              <>
                {/* Ég + nap */}
                <div
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(165deg, #37d6ff 0%, #74e0ff 26%, #c7f2ff 48%, #f4fbff 62%, #9ac7e8 78%, #5f8fb8 100%)",
                  }}
                />
                <div
                  className="absolute w-28 h-28 rounded-full pointer-events-none opacity-95"
                  style={{
                    top: "14%",
                    right: "7%",
                    background: "radial-gradient(circle, #fffdea 0%, #fde68a 36%, transparent 72%)",
                    boxShadow: "0 0 80px rgba(253,224,71,0.58)",
                  }}
                />
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute rounded-full bg-white/60 blur-sm pointer-events-none"
                    style={{
                      width: `${56 + i * 24}px`,
                      height: `${22 + i * 6}px`,
                      top: `${18 + i * 12}%`,
                      left: `${8 + i * 28}%`,
                    }}
                    animate={reducedMotion ? undefined : { x: [0, 16 + i * 8, 0], opacity: [0.45, 0.7, 0.45] }}
                    transition={{ duration: 10 + i * 4, repeat: Infinity, ease: "easeInOut" }}
                  />
                ))}
                <div
                  className="absolute bottom-[38%] left-0 right-0 h-[28%] opacity-35 pointer-events-none"
                  style={{
                    background: "linear-gradient(to top, #2f6187 0%, transparent 100%)",
                    clipPath: "polygon(0 100%, 0 60%, 15% 45%, 30% 70%, 45% 40%, 60% 65%, 75% 35%, 90% 55%, 100% 45%, 100% 100%)",
                  }}
                />
                {[
                  { top: 18, type: "ice" },
                  { top: 38, type: "steel" },
                  { top: 58, type: "wood" },
                  { top: 78, type: "ice" },
                ].map(({ top, type }, idx) => (
                  <div
                    key={`${top}-${idx}`}
                    className="absolute left-[8%] right-[8%] h-3 rounded-md z-[5]"
                    style={{
                      top: `${top}%`,
                      background:
                        type === "ice"
                          ? "linear-gradient(180deg, #ecfeff 0%, #67e8f9 40%, #0ea5e9 100%)"
                          : type === "steel"
                            ? "linear-gradient(180deg, #dbeafe 0%, #64748b 45%, #334155 100%)"
                            : "linear-gradient(180deg, #fef3c7 0%, #b45309 45%, #78350f 100%)",
                      boxShadow: "0 6px 14px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.72)",
                    }}
                  />
                ))}
                <div
                  className="absolute z-[7] top-[63%] h-2 rounded-full bg-emerald-300/90 border border-emerald-100/80"
                  style={{ left: `${Math.max(8, safeZoneX - 8)}%`, width: "16%", boxShadow: "0 0 20px rgba(16,185,129,0.55)" }}
                />
                <motion.div
                  className="absolute z-20 flex flex-col items-center select-none"
                  style={{ left: `${playerX}%`, bottom: `calc(${surfacePct}% + 14px)`, translateX: "-50%" }}
                  animate={phase === "play" && !paused && !reducedMotion ? { y: [0, -5, 0] } : {}}
                  transition={{ repeat: Infinity, duration: 0.55, ease: "easeInOut" }}
                >
                  <div className="relative drop-shadow-[0_8px_14px_rgba(0,0,0,0.35)]">
                    <div className="w-8 h-3 bg-amber-950/90 rounded-t-md mx-auto" />
                    <div className="w-9 h-8 bg-amber-700 rounded-md mx-auto -mt-0.5 border border-amber-950/50 relative">
                      <div className="absolute top-2 left-2.5 w-1 h-1 rounded-full bg-slate-900" />
                      <div className="absolute top-2 right-2.5 w-1 h-1 rounded-full bg-slate-900" />
                    </div>
                    <div className="w-10 h-11 bg-orange-500 rounded-md mx-auto -mt-0.5 border-x border-orange-800 relative">
                      <div className="absolute inset-x-1 top-2 h-3 rounded bg-amber-200/75" />
                    </div>
                    <div className="flex gap-1 justify-center -mt-0.5">
                      <div className="w-4 h-5 bg-indigo-700 rounded-md border border-indigo-900" />
                      <div className="w-4 h-5 bg-indigo-700 rounded-md border border-indigo-900" />
                    </div>
                  </div>
                </motion.div>
                <div
                  className="absolute left-0 right-0 bottom-0 pointer-events-none transition-[height] duration-100 ease-linear z-[4]"
                  style={{ height: `${surfacePct}%` }}
                >
                  <div
                    className="absolute inset-0"
                    style={{ background: "linear-gradient(to top, #0c4a6e 0%, #0369a1 35%, #0ea5e9 65%, rgba(125,211,252,0.85) 100%)" }}
                  />
                  <div
                    className="absolute top-0 left-0 right-0 h-5 -translate-y-1/2 rounded-full bg-white/80 blur-[3px]"
                    style={{ boxShadow: "0 -12px 32px rgba(34,211,238,0.45)" }}
                  />
                </div>
                {stormFlash && <div className="absolute inset-0 z-[25] bg-white/35 pointer-events-none" />}
              </>
            )}
            {/* A HUD olvashatóságáért sötétedő sáv a képernyő tetején. */}
            <div
              className="absolute inset-x-0 top-0 h-32 pointer-events-none z-[1]"
              style={{ background: "linear-gradient(180deg, rgba(2,6,23,0.55) 0%, rgba(2,6,23,0) 100%)" }}
              aria-hidden="true"
            />
            {/* Veszélyjelzés: közel a hullám → piros szél (villogás nélkül). */}
            <div
              className="absolute inset-0 pointer-events-none z-[2] transition-opacity duration-500"
              style={{ boxShadow: "inset 0 0 70px 18px rgba(244,63,94,0.55)", opacity: danger ? 1 : 0 }}
              aria-hidden="true"
              data-testid="tsunami-danger"
              data-active={danger ? "true" : "false"}
            />
          </div>

          <GameHud
            onPause={pauseGame}
            stats={[
              { id: "goal", label: "Cél", value: `${correctQuizzesInRun}/${target}`, tone: "good" },
              { id: "wave", label: "Hullám", value: `${distance} m`, tone: distanceTone },
              { id: "xp", label: "Pont", value: sessionXp },
            ]}
            progress={{
              value: correctQuizzesInRun,
              max: target,
              label: remaining > 0 ? `Még ${remaining} jó válasz` : "Megvan a győzelem!",
            }}
          >
            <CouponHud session={coupon} />
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border border-amber-200/60 bg-slate-950/70 px-2.5 py-1 text-[13px] font-black text-amber-200 backdrop-blur-sm">
                {runSubjectMeta.chip}: {runSubjectMeta.label}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-slate-950/70 px-2.5 py-1 text-[13px] font-bold text-white backdrop-blur-sm">
                <Wind className="h-4 w-4" aria-hidden="true" />
                Sodrás: {driftDir >= 0 ? "jobbra" : "balra"}
              </span>
              {streak >= 2 && (
                <span
                  data-testid="tsunami-streak"
                  className="inline-flex items-center gap-1 rounded-full border border-orange-200/70 bg-orange-500/85 px-2.5 py-1 text-[13px] font-black text-white"
                >
                  <Flame className="h-4 w-4" aria-hidden="true" />
                  {streak}× sorozat
                </span>
              )}
              {inSafeZone && phase === "play" && (
                <span
                  data-testid="tsunami-safe-zone"
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-200/70 bg-emerald-600/85 px-2.5 py-1 text-[13px] font-black text-white"
                >
                  <Shield className="h-4 w-4" aria-hidden="true" />
                  Zónában: lassabb víz
                </span>
              )}
            </div>
          </GameHud>
          <CouponExpiredOverlay session={coupon} />

          <AnimatePresence>
            {rewardBurst && (
              <motion.div
                key="reward"
                className="absolute left-1/2 top-[38%] z-30 pointer-events-none -translate-x-1/2"
                initial={reducedMotion ? false : { y: 16, opacity: 0, scale: 0.6 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ opacity: 0, y: reducedMotion ? 0 : -24 }}
                transition={{ type: "spring", stiffness: 420, damping: 18 }}
              >
                <div className="flex flex-col items-center gap-1">
                  <span className="rounded-full bg-amber-300 text-slate-950 px-5 py-2 text-2xl font-black border-2 border-amber-100 shadow-[0_10px_28px_rgba(245,158,11,0.6)]">
                    +{lastQuizXp} XP
                  </span>
                  <span className="rounded-full bg-slate-950/70 px-3 py-1 text-sm font-bold text-cyan-100">Lejjebb ment a víz!</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {phase === "play" && touch && (
            /* G-8: touch-action:none — hosszú nyomásra a böngésző eddig kijelölt és görgetett, a futás megállt.
               S9: csak érintős eszközön; a sáv a biztonsági sávon belül, a hüvelykujjak alatt. */
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
              {/*
               * Egységes köralakú vezérlés (spec 2026-09-20). A sprint SZÁNDÉKOSAN külön gomb marad: ha a tárcsa is
               * állítaná, a felengedése kikapcsolná a gombbal tartott sprintet.
               */}
              <VirtualJoystick label="Futás iránya" radius="auto" resetSignal={joyReset} onChange={onJoystick} />
              <HoldButton
                label="Sprint"
                size="auto"
                onHoldStart={sprintStart}
                onHoldEnd={sprintEnd}
                className="flex-col gap-0.5 border-2 border-amber-100/70 bg-gradient-to-b from-amber-300 to-orange-500 text-slate-950 font-black shadow-[0_8px_24px_rgba(245,158,11,0.55)] active:scale-95 transition-transform"
              >
                <Wind className="h-7 w-7" aria-hidden="true" />
                <span className="text-[13px] leading-none tracking-wide">SPRINT</span>
              </HoldButton>
            </div>
          )}
          {phase === "play" && !touch && (
            <p
              data-testid="tsunami-key-hint"
              className="game-key-hint absolute left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/20 bg-slate-950/75 px-4 py-2 text-sm font-semibold text-white/90 backdrop-blur-sm whitespace-nowrap"
              style={{ bottom: "max(12px, var(--game-safe-bottom))" }}
            >
              Futás: <kbd className="px-1.5 rounded bg-white/15">←</kbd> <kbd className="px-1.5 rounded bg-white/15">→</kbd> vagy{" "}
              <kbd className="px-1.5 rounded bg-white/15">A</kbd> <kbd className="px-1.5 rounded bg-white/15">D</kbd> · sprint:{" "}
              <kbd className="px-1.5 rounded bg-white/15">Shift</kbd>
            </p>
          )}
        </main>
      )}

      <AnimatePresence>
        {phase === "quiz" && quiz && (
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Kvíz kérdés"
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-slate-950/70 backdrop-blur-[2px]"
            style={{
              padding:
                "max(8px, var(--game-safe-top)) max(8px, var(--game-safe-right)) max(8px, var(--game-safe-bottom)) max(8px, var(--game-safe-left))",
            }}
            initial={reducedMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={reducedMotion ? false : { y: 48, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              ref={quizDialogRef}
              role="dialog"
              aria-modal="true"
              aria-label="Mini-teszt"
              data-testid="ts-quiz"
              className={`tsunami-quiz w-full max-w-lg max-h-full overflow-y-auto rounded-3xl border border-cyan-200/50 bg-slate-950/95 p-4 shadow-[0_20px_56px_rgba(14,165,233,0.35)] ${
                wrongShake && !reducedMotion ? "animate-shake" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full border border-amber-200/60 bg-amber-300/15 px-2.5 py-1 text-xs font-black uppercase tracking-wide text-amber-200">
                  {quizSubjectMeta.chip} · {quizSubjectMeta.label}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-sm font-black tabular-nums ${quizTimeLeft <= 3 ? "text-rose-300" : "text-amber-200"}`}
                >
                  <Timer className="h-4 w-4" aria-hidden="true" />
                  Idő: {quizTimeLeft}s
                </span>
                {/* Review #426: a teljes képernyős kvízréteg eltakarja a HUD szünetgombját — itt is lehet megállni. */}
                <button
                  type="button"
                  data-testid="ts-quiz-pause"
                  aria-label="Szünet"
                  onClick={pauseGame}
                  className="ml-auto inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-white hover:bg-white/20"
                >
                  <Pause className="h-5 w-5" fill="currentColor" strokeWidth={0} aria-hidden="true" />
                </button>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden" aria-hidden="true">
                <div
                  className={`h-full w-full origin-left rounded-full ${quizTimeLeft <= 3 ? "bg-rose-400" : "bg-gradient-to-r from-cyan-300 to-sky-500"}`}
                  style={{ transform: `scaleX(${quizRatio})`, transition: reducedMotion ? "none" : "transform 1s linear" }}
                />
              </div>
              <p className="mt-3 text-lg sm:text-xl font-bold leading-snug text-white" data-testid="ts-prompt">
                {quiz.prompt}
              </p>
              <div className="tsunami-answers mt-3 grid gap-2">
                {quiz.options.map((opt, i) => {
                  const fx = answerFx && answerFx.index === i ? (answerFx.ok ? "correct" : "wrong") : null;
                  return (
                    <button
                      key={i}
                      type="button"
                      data-testid={`ts-option-${i}`}
                      data-state={fx ?? "idle"}
                      className={`game-answer-btn relative flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left font-semibold text-white transition-colors ${
                        fx === "correct"
                          ? "border-emerald-200 bg-emerald-600"
                          : fx === "wrong"
                            ? "border-rose-200 bg-rose-700"
                            : "border-cyan-200/35 bg-slate-900/95 hover:bg-cyan-700/45 active:bg-cyan-700/60"
                      }`}
                      onClick={() => onAnswer(i)}
                      {...correctDataAttrs(i === quiz.correctIndex)}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-sm font-black text-cyan-100">
                        {fx === "correct" ? (
                          <Check className="h-5 w-5" aria-hidden="true" />
                        ) : fx === "wrong" ? (
                          <X className="h-5 w-5" aria-hidden="true" />
                        ) : (
                          "ABCD"[i] ?? i + 1
                        )}
                      </span>
                      <span className="min-w-0 flex-1">{opt}</span>
                    </button>
                  );
                })}
              </div>
              <p className="tsunami-quiz-hint mt-3 text-sm text-white/70 text-center leading-snug">
                Jó válasz: XP és lejjebb megy a hullám. Rossz vagy lejárt: kicsit feljebb jön — de mehetsz tovább!
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ResultScreen
        badges={newlyUnlocked}
        open={resultOpen}
        testId={phase === "won" ? "ts-won" : "ts-over"}
        title={phase === "won" ? "Sikerült elmenekülni!" : "Utolért a hullám!"}
        won={phase === "won"}
        score={sessionXp}
        best={bestResult?.best ?? bestScore.best}
        isNewBest={bestResult?.isNewBest ?? false}
        correct={correctQuizzesInRun}
        total={Math.max(answeredCountRef.current, correctQuizzesInRun)}
        onRetry={startGame}
        retryTestId={phase === "won" ? "button-tsunami-retry-won" : "button-tsunami-retry"}
        retryLabel={phase === "won" ? "Következő kör" : "Újra"}
        onBack={() => navigate("/games")}
        extra={
          <div className="space-y-2">
            <p className="text-sm text-white/80 leading-snug">
              {phase === "won" ? `+${WIN_BONUS_XP} győzelmi bónusz XP` : `Még ${remaining} jó válasz kellett volna`} · Futás: {runSeconds} mp ·{" "}
              {difficultyLabel(runDifficultyRef.current)}
              {syncEligibility?.eligible ? " · felkerült a ranglistára" : ""}
            </p>
            {/* S13 / B6: az új jelvények a ResultScreen közös sorában (badges) — az S9-es lista közös változata. */}
          </div>
        }
      />

      <PauseMenu open={paused && playingPhase} onResume={resumeGame} onRestart={startGame} onExit={exitToMenu} exitLabel="Kilépés a menübe" />

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
        .animate-shake {
          animation: shake 0.18s ease-in-out 2;
        }
        /* Mért (Pixel 7, 2,625-ös képpontarány): a pontosan 48 px-es elemek a kezdőképernyő belépője közben
           47,9 px-nek is mérődnek (a közös mérő csak a szünet- és eredménykártyát várja meg) — a kezdőképernyő
           érintési céljai itt 52 px-esek. */
        .game-start-settings > summary, .game-start-secondary > *, .tsunami-settings-btn,
        .tsunami-level-picker button { min-height: 52px; }
        .tsunami-level-picker p { font-size: 14px; }
        @media (min-width: 700px), (min-width: 560px) and (max-height: 500px) {
          .tsunami-answers { grid-template-columns: 1fr 1fr; }
          .tsunami-quiz { max-width: 720px; }
        }
        @media (max-height: 500px) {
          .tsunami-quiz-hint { display: none; }
        }
      `}</style>
      {explainCard && <QuizFeedbackCard card={explainCard} onDismiss={dismissExplain} />}
    </GameShell>
  );
}
