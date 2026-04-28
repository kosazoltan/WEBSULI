import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Link } from "wouter";
import GamePedagogyPanel from "@/components/GamePedagogyPanel";
import GameNextGoalBar from "@/components/GameNextGoalBar";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMaterialQuizzes } from "@/hooks/useMaterialQuizzes";
import { useClassroomGrade } from "@/lib/classroomStore";
import ClassroomGateModal from "@/components/ClassroomGateModal";
import AudioToggleButton from "@/components/AudioToggleButton";
import { sfxSuccess, sfxError, sfxLevelUp } from "@/lib/audioEngine";
import { recordRun, type Achievement } from "@/lib/achievements";
import { isTodaysGameAvailable, markDailyCompleted } from "@/lib/dailyChallenge";
import AchievementToast from "@/components/AchievementToast";
import {
  ArrowLeft,
  ArrowBigLeft,
  ArrowBigRight,
  Waves,
  Trophy,
  Flame,
  Star,
  RotateCcw,
  Wind,
  Timer,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import CosmicBackground from "@/components/CosmicBackground";
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

const LS_XP = "websuli-tsunami-en-xp";
const LS_BEST = "websuli-tsunami-en-best-streak";

type Quiz = TsunamiSubjectQuiz;

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
const QUIZ_TIMEOUT_SEC: Record<GameDifficulty, number> = {
  easy: 14,
  normal: 11,
  hard: 9,
};
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

function parseDifficultyFromSearch(): GameDifficulty {
  if (typeof window === "undefined") return "normal";
  const q = new URLSearchParams(window.location.search).get("difficulty");
  if (q === "easy" || q === "hard" || q === "normal") return q;
  return "normal";
}

export default function TsunamiEscapeEnglish() {
  const [difficulty, setDifficulty] = useState<GameDifficulty>(parseDifficultyFromSearch);
  const [subject, setSubject] = useState<TsunamiSubject>("mixed");
  const [phase, setPhase] = useState<Phase>("menu");
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
  const [quizTimeLeft, setQuizTimeLeft] = useState(QUIZ_TIMEOUT_SEC.normal);
  const [stormFlash, setStormFlash] = useState(false);
  const [driftDir, setDriftDir] = useState(0);
  const [lightGraphics, setLightGraphics] = useState(false);

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
  const recentQuizIdsRef = useRef<string[]>([]);
  const driftDirRef = useRef(0);
  const rafRef = useRef<number>(0);
  const paramsRef = useRef(PRESETS.normal);
  const runDifficultyRef = useRef<GameDifficulty>("normal");
  const correctQuizCountRef = useRef(0);
  const scoreSubmittedRef = useRef(false);
  const runSubjectRef = useRef<TsunamiSubject>("mixed");
  const subjectRoundRef = useRef(0);

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
  const { items: materialItems } = useMaterialQuizzes(userGrade);

  const mergedPools = useMemo<ActiveQuizPools>(() => {
    const { easy, medium, hard } = splitBankItemsByTier(quizBankResponse?.items);
    const matMed = materialItems
      .filter((q) => Array.isArray(q.options) && q.options.length === 4)
      .map((q, idx) => ({
        id: q.id ?? `mat-${idx}`,
        prompt: q.prompt,
        options: q.options.slice(0, 4) as [string, string, string, string],
        correctIndex: q.correctIndex,
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

  const mergedPoolsRef = useRef(mergedPools);
  mergedPoolsRef.current = mergedPools;

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

    const subjectKey =
      activeSubject === "mixed"
        ? TSUNAMI_SUBJECT_ORDER[subjectRoundRef.current++ % TSUNAMI_SUBJECT_ORDER.length]!
        : activeSubject;
    const { easy: poolE, med: poolM, hard: poolH } = mergedPoolsRef.current[subjectKey];
    let pool: Quiz[];
    if (eff < 0.32) pool = [...poolE];
    else if (eff < 0.58) pool = [...poolE, ...poolM];
    else if (eff < 0.82) pool = [...poolM, ...poolH];
    else pool = [...poolH];

    if (pool.length === 0) pool = [...poolE];

    const recent = recentQuizIdsRef.current;
    let selected = pool[Math.floor(Math.random() * pool.length)]!;
    if (pool.length > 3) {
      for (let tries = 0; tries < 8; tries++) {
        const cand = pool[Math.floor(Math.random() * pool.length)]!;
        if (!recent.includes(cand.id)) {
          selected = cand;
          break;
        }
      }
    }
    recentQuizIdsRef.current = [...recent.slice(-4), selected.id];
    return shuffleQuiz(selected);
  }, []);

  const startGame = useCallback(() => {
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
    setQuizTimeLeft(QUIZ_TIMEOUT_SEC[difficulty]);
    setStormFlash(false);
    setDriftDir(0);
    driftDirRef.current = 0;
    correctQuizCountRef.current = 0;
    recentQuizIdsRef.current = [];
    // Give an early first quiz so the run does not feel empty at the start.
    quizTimerRef.current = Math.max(0, PRESETS[difficulty].quizEverySec * 0.72);
    runTimerRef.current = 0;
    safeZoneTimerRef.current = 0;
    stormTimerRef.current = 0;
    lastRef.current = null;
    setQuiz(null);
    setPhase("play");
  }, [difficulty, subject]);

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
    setPhase("over");
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
    const isLowEnd = () => {
      const mobileLike =
        window.matchMedia("(hover: none)").matches ||
        window.matchMedia("(pointer: coarse)").matches ||
        window.innerWidth < 1024;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const lowMem = typeof navigator !== "undefined" && "deviceMemory" in navigator
        ? ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4
        : false;
      return mobileLike || reduced || lowMem;
    };
    const apply = () => setLightGraphics(isLowEnd());
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

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

  const setControlState = useCallback((key: "left" | "right" | "sprint", active: boolean) => {
    keysRef.current[key] = active;
  }, []);

  const pressStart = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>, key: "left" | "right" | "sprint") => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setControlState(key, true);
    },
    [setControlState],
  );

  const pressEnd = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>, key: "left" | "right" | "sprint") => {
      e.preventDefault();
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setControlState(key, false);
    },
    [setControlState],
  );

  const gameLoop = useCallback(
    (t: number) => {
      if (phase !== "play") return;

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
      const waterRise = P.waterRisePerSec * (0.62 + waterStress * 1.18) * safeZoneFactor;

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
        if (Math.random() < 0.42 + prog * 0.3) {
          setStormFlash(true);
          setTimeout(() => setStormFlash(false), 170);
        }
      }

      quizTimerRef.current += dt;
      if (quizTimerRef.current >= quizEveryDyn) {
        quizTimerRef.current = 0;
        setQuiz(pickQuiz());
        setQuizTimeLeft(QUIZ_TIMEOUT_SEC[runDifficultyRef.current]);
        setPhase("quiz");
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
    [phase, pickQuiz, endGame],
  );

  useEffect(() => {
    if (phase !== "play") {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    lastRef.current = null;
    rafRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, gameLoop]);

  const onAnswer = (index: number) => {
    if (!quiz) return;
    if (index !== quiz.correctIndex) {
      sfxError();
      setWrongShake(true);
      setTimeout(() => setWrongShake(false), 320);
      setStreak(0);
      waterRef.current = Math.min(88, waterRef.current + QUIZ_WRONG_WATER_PENALTY[runDifficultyRef.current]);
      setWater(waterRef.current);
      setTimeout(() => {
        setQuiz(null);
        setPhase("play");
        lastRef.current = null;
      }, 280);
      return;
    }

    sfxSuccess();
    setRewardBurst(true);
    setTimeout(() => setRewardBurst(false), 900);

    const add = paramsRef.current.xpPerCorrect;
    setLastQuizXp(add);
    setSessionXp((x) => x + add);
    setTotalXp((t) => t + add);
    setStreak((s) => {
      const n = s + 1;
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
      cancelAnimationFrame(rafRef.current);
      lastRef.current = null;
      setPhase("won");
      return;
    }

    setQuiz(null);
    setPhase("play");
    lastRef.current = null;
  };

  useEffect(() => {
    if (phase !== "quiz") return;
    const id = setInterval(() => {
      setQuizTimeLeft((prev) => {
        if (prev <= 1) {
          setWrongShake(true);
          setTimeout(() => setWrongShake(false), 220);
          setStreak(0);
          waterRef.current = Math.min(
            88,
            waterRef.current + QUIZ_WRONG_WATER_PENALTY[runDifficultyRef.current],
          );
          setWater(waterRef.current);
          setQuiz(null);
          setPhase("play");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  const surfacePct = useMemo(() => Math.min(100, water), [water]);
  const selectedSubjectMeta = TSUNAMI_SUBJECT_META[subject];
  const runSubjectMeta = TSUNAMI_SUBJECT_META[runSubjectRef.current];
  const quizSubjectMeta = quiz ? TSUNAMI_SUBJECT_META[quiz.subject] : runSubjectMeta;

  useEffect(() => {
    if (phase !== "over" && phase !== "won") return;
    if (!syncEligibility?.eligible) return;
    if (scoreSubmittedRef.current) return;
    scoreSubmittedRef.current = true;

    const payload = {
      gameId: "tsunami-english",
      difficulty: runDifficultyRef.current,
      runXp: sessionXp,
      runStreak: streak,
      runSeconds,
    };

    void apiRequest("POST", "/api/games/score", payload)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["/api/games/leaderboard/tsunami"] });
      })
      .catch(() => {
        scoreSubmittedRef.current = false;
      });
  }, [phase, syncEligibility, sessionXp, streak, runSeconds]);

  // Achievement + Daily — egyszer fut "over" / "won" átmenetkor.
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[]>([]);
  const achievementCheckedRef = useRef(false);
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
      wrongAnswers: 0,
      maxStreak: streak,
      perfect: phase === "won" && streak >= correctQuizCountRef.current,
      fullClear: phase === "won",
    });
    if (wasDailyAvailable && phase === "won") {
      markDailyCompleted();
    }
    if (newOnes.length > 0) setNewlyUnlocked(newOnes);
  }, [phase, sessionXp, streak]);

  return (
    <div
      className="min-h-screen relative overflow-hidden text-white"
      style={{
        background:
          "radial-gradient(circle at 8% 14%, rgba(14,165,233,0.34), transparent 34%), radial-gradient(circle at 90% 8%, rgba(250,204,21,0.26), transparent 30%), linear-gradient(180deg, #03203f 0%, #05325f 48%, #0b4d8f 100%)",
      }}
    >
      <ClassroomGateModal accent="cyan" />
      <AchievementToast achievements={newlyUnlocked} />
      <div className="absolute inset-0 opacity-35 pointer-events-none">
        <CosmicBackground />
      </div>
      <div className="absolute inset-0 pointer-events-none">
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

      <main className="relative z-10 w-full max-w-2xl lg:max-w-3xl mx-auto px-3 sm:px-5 py-4 min-h-dvh min-h-screen flex flex-col pb-6 sm:pb-8">
        <header className="flex items-center justify-between gap-2 mb-3">
          <Link href="/games">
            <Button
              variant="ghost"
              size="sm"
              className="text-white bg-slate-900/45 border border-white/20 hover:bg-slate-800/70 gap-1 -ml-2"
              data-testid="link-tsunami-back-games"
            >
              <ArrowLeft className="w-4 h-4" />
              Játékok
            </Button>
          </Link>
          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold">
            <AudioToggleButton size="icon" />
            <span className="flex items-center gap-1 text-amber-300">
              <Star className="w-4 h-4" />
              {totalXp} XP
            </span>
            <span className="flex items-center gap-1 text-orange-400">
              <Flame className="w-4 h-4" />
              {streak}
            </span>
          </div>
        </header>

        <Card className="border border-cyan-200/40 bg-slate-950/82 backdrop-blur-md flex-1 flex flex-col min-h-0 mb-3 shadow-[0_20px_60px_rgba(6,182,212,0.22)]">
          <CardContent className="p-3 sm:p-4 flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-2 mb-2">
              <Waves className="w-5 h-5 text-cyan-300" />
              <h1 className="text-base sm:text-lg font-extrabold leading-tight">
                Szökőár szökés — Tudáspróba (3–5. o.)
              </h1>
            </div>
            <GamePedagogyPanel
              accent="cyan"
              className="mb-2"
              kidMission={`Fuss el a víz elől! Válassz tantárgyat vagy Vegyes kihívást: jó válasz = XP + lejjebb megy a hullám. Egy körben szerezz ${winQuizTarget(difficulty)} helyes kvízt, és győztél — jár a nagy bónusz XP!`}
              parentBody={
                <>
                  <strong className="text-cyan-100/90">Tananyag:</strong> 3–5. osztályos angol, matek, magyar nyelvtan és környezetismeret. A Vegyes kihívás körön belül váltogatja a tantárgyakat.
                  <br />
                  <strong className="text-cyan-100/90">Fejleszt:</strong> gyors döntés, olvasásértés, fejszámolás, helyesírási figyelem, természettudományos kapcsolatok és stratégia (biztonsági zóna).
                  <br />
                  <span className="text-white/55">
                    Felépítés: cél (menekülés) → akadály (víz, sodrás) → rövid teszt → azonnali jutalom (XP, vízcsökkenés) vagy következmény — a gyakorlás és a visszajelzés szorosan összekapcsolva.
                  </span>
                </>
              }
            />
            <p className="text-[11px] text-cyan-100/95 mb-3 leading-snug border border-cyan-400/35 rounded-lg px-2 py-1.5 bg-slate-900/90">
              {syncBanner}
            </p>

            {phase === "menu" && (
              <div className="flex flex-col items-center justify-center flex-1 gap-4 py-6">
                <Trophy className="w-16 h-16 text-amber-300 drop-shadow-[0_0_20px_rgba(251,191,36,0.55)]" />
                <p className="text-xs text-center text-amber-100/90 max-w-sm font-semibold">
                  Jutalom minden jó válaszra: XP. A láng ikon = hány helyes válasz jött egymás után — tartsd életben a sorozatot!
                </p>
                <p className="text-sm text-center text-white/75 max-w-xs">
                  Legjobb sorozat (helyi): <strong className="text-orange-300">{bestStreak}</strong> helyes
                  egymás után
                </p>
                <div className="w-full max-w-xl">
                  <p className="text-xs text-cyan-100/90 text-center font-semibold mb-2">Tantárgy mód</p>
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                    {(["mixed", ...TSUNAMI_SUBJECT_ORDER] as TsunamiSubject[]).map((id) => {
                      const meta = TSUNAMI_SUBJECT_META[id];
                      const active = subject === id;
                      return (
                        <Button
                          key={id}
                          type="button"
                          variant={active ? "default" : "outline"}
                          className={`h-auto min-h-[70px] flex flex-col items-start justify-center gap-0.5 text-left rounded-xl border px-3 py-2 ${
                            active
                              ? "bg-gradient-to-br from-cyan-500 to-blue-700 text-white border-cyan-100/60 shadow-[0_0_20px_rgba(34,211,238,0.28)]"
                              : "bg-slate-900/75 border-white/20 text-white hover:bg-slate-800/90"
                          }`}
                          onClick={() => setSubject(id)}
                        >
                          <span className="text-[10px] font-black tracking-wide text-amber-200">{meta.chip}</span>
                          <span className="text-xs font-extrabold">{meta.label}</span>
                          <span className="text-[10px] leading-tight text-white/70">{meta.short}</span>
                        </Button>
                      );
                    })}
                  </div>
                  <p className="mt-2 text-[11px] text-cyan-100/80 text-center">{selectedSubjectMeta.mission}</p>
                </div>
                <div className="w-full max-w-xs space-y-2">
                  <p className="text-xs text-cyan-100/90 text-center font-semibold">Nehézség</p>
                  <div className="flex gap-2 justify-center flex-wrap">
                    <Button
                      type="button"
                      size="sm"
                      variant={difficulty === "easy" ? "default" : "outline"}
                      className={difficulty === "easy" ? "bg-emerald-600 text-white border border-emerald-100/40" : "bg-slate-900/95 border-white/35 text-white hover:bg-slate-800"}
                      onClick={() => setDifficulty("easy")}
                    >
                      Könnyű
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={difficulty === "normal" ? "default" : "outline"}
                      className={difficulty === "normal" ? "bg-cyan-600 text-white border border-cyan-100/40" : "bg-slate-900/95 border-white/35 text-white hover:bg-slate-800"}
                      onClick={() => setDifficulty("normal")}
                    >
                      Közepes
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={difficulty === "hard" ? "default" : "outline"}
                      className={difficulty === "hard" ? "bg-rose-600 text-white border border-rose-100/40" : "bg-slate-900/95 border-white/35 text-white hover:bg-slate-800"}
                      onClick={() => setDifficulty("hard")}
                    >
                      Nehéz
                    </Button>
                  </div>
                </div>
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-cyan-400 via-sky-500 to-blue-600 hover:from-cyan-300 hover:to-blue-500 text-white font-bold rounded-full px-8 border border-cyan-100/50 shadow-[0_10px_24px_rgba(56,189,248,0.4)]"
                  onClick={startGame}
                  data-testid="button-tsunami-start"
                >
                  Indítás: {selectedSubjectMeta.label} · {difficultyLabel(difficulty)}
                </Button>
              </div>
            )}

            {(phase === "play" || phase === "quiz") && (
              <>
                <GameNextGoalBar
                  accent="cyan"
                  headline={
                    correctQuizzesInRun >= winQuizTarget(runDifficultyRef.current)
                      ? "Megvan a győzelem ebben a körben — fuss tovább, gyűjts XP-et!"
                      : `${Math.max(0, winQuizTarget(runDifficultyRef.current) - correctQuizzesInRun)} helyes kvíz még a célhoz`
                  }
                  subtitle={`${runSubjectMeta.label} · Futás: ${runSeconds} mp · ${difficultyLabel(runDifficultyRef.current)} · jó válasz = víz lejjebb`}
                  current={correctQuizzesInRun}
                  target={winQuizTarget(runDifficultyRef.current)}
                  className="mb-2"
                />
                <div className="relative flex-1 min-h-[min(52vh,440px)] sm:min-h-[420px] rounded-2xl overflow-hidden border border-cyan-200/45 shadow-[0_0_45px_rgba(34,211,238,0.22)]">
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
                    top: "4%",
                    right: "7%",
                    background: "radial-gradient(circle, #fffdea 0%, #fde68a 36%, transparent 72%)",
                    filter: "blur(0.3px)",
                    boxShadow: "0 0 80px rgba(253,224,71,0.58)",
                  }}
                />
                {/* Felhők */}
                {[0, 1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute rounded-full bg-white/60 blur-sm pointer-events-none"
                    style={{
                      width: `${56 + i * 24}px`,
                      height: `${22 + i * 6}px`,
                      top: `${12 + i * 14}%`,
                      left: `${8 + i * 28}%`,
                    }}
                    animate={{ x: [0, 16 + i * 8, 0], opacity: [0.45, 0.7, 0.45] }}
                    transition={{ duration: 10 + i * 4, repeat: Infinity, ease: "easeInOut" }}
                  />
                ))}
                {/* Távoli hegyek */}
                <div
                  className="absolute bottom-[38%] left-0 right-0 h-[28%] opacity-35 pointer-events-none"
                  style={{
                    background: "linear-gradient(to top, #2f6187 0%, transparent 100%)",
                    clipPath: "polygon(0 100%, 0 60%, 15% 45%, 30% 70%, 45% 40%, 60% 65%, 75% 35%, 90% 55%, 100% 45%, 100% 100%)",
                  }}
                />
                <div
                  className="absolute inset-0 opacity-30"
                  style={{
                    background:
                      "repeating-linear-gradient(90deg, transparent, transparent 26px, rgba(255,255,255,0.06) 26px, rgba(255,255,255,0.06) 27px)",
                  }}
                />
                <div className="absolute top-3 left-0 right-0 flex justify-center z-10">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-slate-900/90 font-black drop-shadow-sm rounded-full border border-white/45 bg-white/50 px-3 py-1">
                    Maradj szárazon — kvíz = esély a víz ellen
                  </span>
                </div>
                <div className="absolute top-9 left-2 right-2 text-[11px] text-slate-900/90 font-semibold z-10 flex flex-wrap gap-2 justify-between">
                  <span className="rounded-md bg-amber-100/75 px-2 py-1 border border-amber-300/55 text-amber-950 font-black">
                    {runSubjectMeta.chip}: {runSubjectMeta.label}
                  </span>
                  <span className="rounded-md bg-white/45 px-2 py-1 backdrop-blur-sm border border-white/40">
                    Futás: {runSeconds}s · {difficultyLabel(runDifficultyRef.current)}
                  </span>
                  <span className="rounded-md bg-emerald-100/65 px-2 py-1 border border-emerald-300/55 text-emerald-900 font-bold">
                    Győzelem: {correctQuizzesInRun}/{winQuizTarget(runDifficultyRef.current)} kvíz
                  </span>
                </div>
                <div className="absolute top-[66px] left-2 right-2 text-[10px] text-slate-900 font-semibold z-10 flex justify-between">
                  <span className="inline-flex items-center gap-1 rounded-md bg-white/45 px-2 py-1 backdrop-blur-sm border border-white/35">
                    <Wind className="w-3 h-3" />
                    Sodrás: {driftDir >= 0 ? "jobbra" : "balra"}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100/65 px-2 py-1 border border-emerald-300/55 text-emerald-900">
                    <Shield className="w-3 h-3" />
                    Biztonsági zóna aktív
                  </span>
                </div>

                {/* Erkélyek / platformok - eltérő anyagokkal */}
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
                      boxShadow:
                        "0 6px 14px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.72), 0 0 18px rgba(56,189,248,0.35)",
                    }}
                  />
                ))}
                <motion.div
                  className="absolute z-[7] top-[63%] h-2 rounded-full bg-emerald-300/90 border border-emerald-100/80"
                  style={{
                    left: `${Math.max(8, safeZoneX - 8)}%`,
                    width: "16%",
                    boxShadow: "0 0 20px rgba(16,185,129,0.55)",
                  }}
                  animate={{ opacity: [0.55, 0.95, 0.55] }}
                  transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
                />

                {/* Játékos */}
                <motion.div
                  className="absolute z-20 flex flex-col items-center select-none"
                  style={{
                    left: `${playerX}%`,
                    bottom: `calc(${surfacePct}% + 14px)`,
                    translateX: "-50%",
                  }}
                  animate={phase === "play" ? { y: [0, -5, 0] } : {}}
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

                {/* Víz + hullám */}
                <div
                  className="absolute left-0 right-0 bottom-0 pointer-events-none transition-[height] duration-100 ease-linear z-[4]"
                  style={{ height: `${surfacePct}%` }}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(to top, #0c4a6e 0%, #0369a1 35%, #0ea5e9 65%, rgba(125,211,252,0.85) 100%)",
                    }}
                  />
                  <div
                    className="absolute inset-0 opacity-45"
                    style={{
                      background:
                        "linear-gradient(120deg, rgba(14,165,233,0.05) 0%, rgba(255,255,255,0.22) 40%, rgba(14,116,144,0.09) 100%)",
                    }}
                  />
                  <motion.div
                    className="absolute left-0 right-0 top-0 h-6 opacity-70"
                    style={{
                      background:
                        "repeating-linear-gradient(90deg, transparent, transparent 18px, rgba(255,255,255,0.15) 18px, rgba(255,255,255,0.15) 36px)",
                    }}
                    animate={{ x: [0, -36, 0] }}
                    transition={{ duration: 2.8, repeat: Infinity, ease: "linear" }}
                  />
                  <motion.div
                    className="absolute left-0 right-0 top-2 h-4 opacity-45"
                    style={{
                      background:
                        "repeating-radial-gradient(circle at 10% 50%, rgba(255,255,255,0.35) 0 2px, transparent 2px 10px)",
                    }}
                    animate={{ x: [0, -24, 0] }}
                    transition={{ duration: 3.4, repeat: Infinity, ease: "linear" }}
                  />
                  <div
                    className="absolute top-0 left-0 right-0 h-4 -translate-y-1/2 rounded-full bg-cyan-200/60 blur-md"
                    style={{ boxShadow: "0 -12px 32px rgba(34,211,238,0.45)" }}
                  />
                </div>
                {[...Array(lightGraphics ? 6 : 12)].map((_, i) => (
                  <motion.div
                    key={`rain-${i}`}
                    className="absolute w-[2px] h-10 bg-cyan-100/45 z-[6] pointer-events-none"
                    style={{ left: `${4 + i * 5.2}%`, top: "-10%" }}
                    animate={{ y: ["0%", "470%"], opacity: [0.1, 0.55, 0.1] }}
                    transition={{
                      duration: 1 + (i % 4) * 0.22,
                      repeat: Infinity,
                      ease: "linear",
                      delay: (i % 5) * 0.1,
                    }}
                  />
                ))}
                {stormFlash && <div className="absolute inset-0 z-[25] bg-white/35 pointer-events-none" />}

                {rewardBurst && (
                  <motion.div
                    className="absolute right-3 top-20 pointer-events-none z-30"
                    initial={{ y: 12, opacity: 0, scale: 0.8 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="rounded-full bg-amber-300 text-slate-950 px-4 py-1.5 text-lg font-black border border-amber-100 shadow-[0_8px_18px_rgba(245,158,11,0.55)]">
                      +{lastQuizXp} XP
                    </div>
                  </motion.div>
                )}
              </div>
              </>
            )}

            {phase === "play" && (
              <>
                <p className="hidden md:block text-[11px] text-white/65 text-center mt-2 mb-1">
                  Billentyűzet: <kbd className="px-1 rounded bg-white/15">←</kbd>{" "}
                  <kbd className="px-1 rounded bg-white/15">→</kbd> vagy <kbd className="px-1 rounded bg-white/15">A</kbd>{" "}
                  <kbd className="px-1 rounded bg-white/15">D</kbd>, sprint: <kbd className="px-1 rounded bg-white/15">Shift</kbd>
                </p>
                <div className="grid grid-cols-3 gap-2 mt-1 sm:mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-12 sm:h-14 touch-manipulation border-cyan-100/60 bg-gradient-to-b from-sky-500 to-cyan-700 text-white hover:brightness-110 active:scale-95 shadow-md shadow-cyan-900/50"
                  onPointerDown={(e) => pressStart(e, "left")}
                  onPointerUp={(e) => pressEnd(e, "left")}
                  onPointerCancel={(e) => pressEnd(e, "left")}
                  onPointerLeave={(e) => pressEnd(e, "left")}
                  aria-label="Balra"
                >
                  <ArrowBigLeft className="w-8 h-8" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-12 sm:h-14 touch-manipulation border-amber-100/60 bg-gradient-to-b from-amber-400 to-orange-500 text-slate-950 hover:brightness-110 active:scale-95 shadow-md shadow-amber-900/60 font-extrabold"
                  onPointerDown={(e) => pressStart(e, "sprint")}
                  onPointerUp={(e) => pressEnd(e, "sprint")}
                  onPointerCancel={(e) => pressEnd(e, "sprint")}
                  onPointerLeave={(e) => pressEnd(e, "sprint")}
                  aria-label="Sprint"
                >
                  <Wind className="w-7 h-7" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="h-12 sm:h-14 touch-manipulation border-cyan-100/60 bg-gradient-to-b from-sky-500 to-cyan-700 text-white hover:brightness-110 active:scale-95 shadow-md shadow-cyan-900/50"
                  onPointerDown={(e) => pressStart(e, "right")}
                  onPointerUp={(e) => pressEnd(e, "right")}
                  onPointerCancel={(e) => pressEnd(e, "right")}
                  onPointerLeave={(e) => pressEnd(e, "right")}
                  aria-label="Jobbra"
                >
                  <ArrowBigRight className="w-8 h-8" />
                </Button>
              </div>
              </>
            )}

            {phase === "won" && (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 py-6 text-center">
                <Trophy className="w-16 h-16 text-amber-300 drop-shadow-lg" />
                <p className="text-xl font-black text-amber-200">Sikerült elmenekülni!</p>
                <p className="text-sm font-semibold text-emerald-200/95 max-w-sm">
                  Ez a nagy jutalom-kör: elég tudáspróba sikerült {runSubjectMeta.label.toLowerCase()} módban — így néz ki, amikor a gyakorlás meghozza a győzelmet!
                </p>
                <p className="text-sm text-white/80 max-w-xs">
                  {correctQuizzesInRun} helyes kvíz · +{WIN_BONUS_XP} győzelmi bónusz XP · összesen ebben a körben:{" "}
                  <strong className="text-amber-300">{sessionXp}</strong> XP
                </p>
                <p className="text-xs text-white/60">
                  Futás: {runSeconds} mp · {difficultyLabel(runDifficultyRef.current)}
                </p>
                {syncEligibility?.eligible ? (
                  <p className="text-xs text-emerald-300/90">
                    A kör eredménye fel lett küldve a szervernek (ranglista frissülhet néhány másodperc alatt).
                  </p>
                ) : (
                  <p className="text-xs text-white/45 max-w-xs mx-auto">{syncBanner}</p>
                )}
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  <Button
                    className="gap-1 bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 border border-amber-100/50"
                    onClick={startGame}
                    data-testid="button-tsunami-retry-won"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Következő kör
                  </Button>
                  <Link href="/games">
                    <Button variant="outline" className="border-white/40 text-white bg-slate-900/70 hover:bg-slate-800">
                      Játéklista
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {phase === "over" && (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 py-6 text-center">
                <Waves className="w-12 h-12 text-cyan-400" />
                <p className="text-lg font-bold">Utolért a hullám!</p>
                <p className="text-sm text-white/80 max-w-sm font-medium">
                  Legközelebb a kvízeknél is számít a gyors jó válasz — próbáld újra, már tudod, mire kell figyelni!
                </p>
                <p className="text-sm text-white/70">
                  Kör XP: <strong className="text-amber-300">{sessionXp}</strong> · Futás:{" "}
                  <strong>{runSeconds}</strong> mp · {difficultyLabel(runDifficultyRef.current)} · helyes kvíz:{" "}
                  {correctQuizzesInRun}/{winQuizTarget(runDifficultyRef.current)}
                </p>
                {syncEligibility?.eligible ? (
                  <p className="text-xs text-emerald-300/90">
                    A kör eredménye fel lett küldve a szervernek (ranglista frissülhet néhány másodperc alatt).
                  </p>
                ) : (
                  <p className="text-xs text-white/45 max-w-xs mx-auto">{syncBanner}</p>
                )}
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  <Button
                    className="gap-1 bg-gradient-to-r from-cyan-400 to-blue-600 border border-cyan-100/45"
                    onClick={startGame}
                    data-testid="button-tsunami-retry"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Újra
                  </Button>
                  <Link href="/games">
                    <Button variant="outline" className="border-white/40 text-white bg-slate-900/70 hover:bg-slate-800">
                      Játéklista
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <AnimatePresence>
        {phase === "quiz" && quiz && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className={`w-full max-w-md rounded-2xl border border-cyan-200/50 bg-slate-950/96 p-4 shadow-[0_20px_56px_rgba(14,165,233,0.35)] ${
                wrongShake ? "animate-shake" : ""
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="rounded-full border border-amber-200/60 bg-amber-300/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-amber-200">
                  {quizSubjectMeta.chip} · {quizSubjectMeta.label}
                </span>
                <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                  Mini-teszt — találd el, és jön a jutalom
                </span>
              </div>
              <p className="text-[11px] text-white/70 mb-1">Helyes válasz: XP + lejjebb a hullám. Figyelj az órára!</p>
              <p className="text-[11px] text-amber-200/90 mb-1 inline-flex items-center gap-1">
                <Timer className="w-3 h-3" />
                Idő: {quizTimeLeft}s
              </p>
              <p className="text-[11px] text-emerald-300/90 mb-2">
                Győzelemhez még:{" "}
                {Math.max(0, winQuizTarget(runDifficultyRef.current) - correctQuizzesInRun)} helyes válasz ebben a körben
              </p>
              <p className="text-base font-semibold mb-4 leading-snug">{quiz.prompt}</p>
              <div className="grid gap-2">
                {quiz.options.map((opt, i) => (
                  <Button
                    key={i}
                    variant="secondary"
                    className="h-auto py-3 text-left justify-start whitespace-normal bg-slate-900/95 hover:bg-cyan-700/45 text-white border border-cyan-200/35"
                    onClick={() => onAnswer(i)}
                  >
                    {opt}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-white/60 mt-3 text-center leading-snug">
                Rossz válasz vagy lejáró idő: a víz egy kicsit feljebb jön — de mehetsz tovább futni, és jön a következő esély. Ne add fel!
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
        .animate-shake {
          animation: shake 0.18s ease-in-out 2;
        }
      `}</style>
    </div>
  );
}
