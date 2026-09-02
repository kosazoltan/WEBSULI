import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Star, Flame, RotateCcw, Sparkles, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import GamePedagogyPanel from "@/components/GamePedagogyPanel";
import GameNextGoalBar from "@/components/GameNextGoalBar";
import { gameSyncBannerText, useSyncEligibilityQuery } from "@/hooks/useGameScoreSync";
import { useMaterialQuizzes } from "@/hooks/useMaterialQuizzes";
import { useClassroomGrade } from "@/lib/classroomStore";
import ClassroomGateModal from "@/components/ClassroomGateModal";
import AudioToggleButton from "@/components/AudioToggleButton";
import { sfxSuccess, sfxError, sfxLevelUp } from "@/lib/audioEngine";
import { recordRun, type Achievement } from "@/lib/achievements";
import { isTodaysGameAvailable, markDailyCompleted } from "@/lib/dailyChallenge";
import AchievementToast from "@/components/AchievementToast";
import {
  wordLadderEasyMore,
  wordLadderHardMore,
  wordLadderMedMore,
} from "@/data/englishGameQuizExtras";
import { splitBankItemsByTier } from "@/lib/mergeGameQuizBank";
import type { FourChoiceQuiz, GameQuizBankResponse } from "@/types/gameQuiz";
import {
  LADDER_RUNGS,
  LADDER_EASY,
  LADDER_MED,
  LADDER_HARD,
  LADDER_ZONES,
  zoneForRung,
  milestoneFor,
  xpForCorrect,
  nextRung as computeNextRung,
  streakMessage,
  encouragement,
  confettiParticles,
} from "@/lib/wordLadderLogic";

const LS_XP = "websuli-wordladder-xp";
const LS_BEST = "websuli-wordladder-streak";

type Quiz = FourChoiceQuiz;

// A létra hossza és a nehézségi felosztás a tiszta logikai modulban (tesztelt).
const RUNGS = LADDER_RUNGS;
const RUNGS_EASY = LADDER_EASY;
const RUNGS_MED = LADDER_MED;
const RUNGS_HARD = LADDER_HARD;

/** A válasz-felfedés ideje (a helyes zölden, a hibás pirosan látszik). */
const REVEAL_MS = 900;
/** A lépés-animáció ideje (a figura ugrik / megcsúszik). */
const STEP_MS = 620;

const QUIZ_BANK: Quiz[] = [
  { id: "1", prompt: "„Ház” szó angolul:", options: ["house", "horse", "hat", "hand"], correctIndex: 0 },
  { id: "2", prompt: "„Kutya” angolul:", options: ["duck", "door", "dog", "desk"], correctIndex: 2 },
  { id: "3", prompt: "„Macska” angolul:", options: ["cow", "cat", "car", "cup"], correctIndex: 1 },
  { id: "4", prompt: "„Piros” angolul:", options: ["blue", "red", "run", "rain"], correctIndex: 1 },
  { id: "5", prompt: "„Zöld” angolul:", options: ["gray", "gold", "green", "girl"], correctIndex: 2 },
  { id: "6", prompt: "„Iskola” angolul:", options: ["shop", "school", "ship", "shoe"], correctIndex: 1 },
  { id: "7", prompt: "„Alma” angolul:", options: ["animal", "apple", "April", "arm"], correctIndex: 1 },
  { id: "8", prompt: "Mit jelent: Goodbye?", options: ["Helló", "Viszlát", "Köszönöm", "Kérem"], correctIndex: 1 },
  { id: "9", prompt: "„Könyv” angolul:", options: ["ball", "bed", "book", "bird"], correctIndex: 2 },
  { id: "10", prompt: "„Víz” angolul:", options: ["wind", "water", "wall", "week"], correctIndex: 1 },
  { id: "11", prompt: "„Nap” (égbolt) angolul:", options: ["snow", "sun", "sea", "sing"], correctIndex: 1 },
  { id: "12", prompt: "„Hold” angolul:", options: ["mouse", "moon", "milk", "map"], correctIndex: 1 },
  { id: "13", prompt: "„Fa” (növény) angolul:", options: ["fish", "fox", "tree", "train"], correctIndex: 2 },
  { id: "14", prompt: "„Virág” angolul:", options: ["flower", "floor", "food", "four"], correctIndex: 0 },
  { id: "15", prompt: "„Szék” angolul:", options: ["ship", "chair", "cheese", "child"], correctIndex: 1 },
  { id: "16", prompt: "„Ablak” angolul:", options: ["wind", "winter", "window", "wolf"], correctIndex: 2 },
  { id: "17", prompt: "„Ajándék” angolul:", options: ["game", "gift", "girl", "goat"], correctIndex: 1 },
  { id: "18", prompt: "„Barát” angolul:", options: ["bread", "friend", "frog", "fruit"], correctIndex: 1 },
  ...wordLadderEasyMore,
];

const QUIZ_MED: Quiz[] = [
  { id: "m1", prompt: "Hogy mondjuk angolul: kedd?", options: ["Tuesday", "Thursday", "Wednesday", "Sunday"], correctIndex: 0 },
  { id: "m2", prompt: "„Május” angolul:", options: ["March", "May", "June", "April"], correctIndex: 1 },
  { id: "m3", prompt: "„Tél” angolul:", options: ["spring", "summer", "winter", "wind"], correctIndex: 2 },
  { id: "m4", prompt: "Mit jelent: Excuse me?", options: ["Köszönöm", "Elnézést / Elnézést, szabad?", "Viszlát", "Helló"], correctIndex: 1 },
  { id: "m5", prompt: "„Szoba” angolul:", options: ["road", "room", "river", "rain"], correctIndex: 1 },
  { id: "m6", prompt: "„Kert” angolul:", options: ["game", "garden", "gate", "goat"], correctIndex: 1 },
  { id: "m7", prompt: "„Eszik” (ige, ő eszik) — helyes alak:", options: ["He eat.", "He eats.", "He eating.", "He eated."], correctIndex: 1 },
  { id: "m8", prompt: "„Iszik” (ige, ő iszik) — helyes alak:", options: ["She drink.", "She drinks.", "She drinking.", "She drinked."], correctIndex: 1 },
  { id: "m9", prompt: "Mit jelent: I like music.", options: ["Szeretem a zenét.", "Nem szeretek zenét.", "Zenelek.", "Hallgatom a rádiót."], correctIndex: 0 },
  { id: "m10", prompt: "„Esernyő” angolul:", options: ["uniform", "umbrella", "under", "uncle"], correctIndex: 1 },
  { id: "m11", prompt: "„Orvos” angolul:", options: ["driver", "doctor", "daughter", "dictionary"], correctIndex: 1 },
  { id: "m12", prompt: "„Repülőgép” angolul:", options: ["airport", "airplane", "island", "animal"], correctIndex: 1 },
  { id: "m13", prompt: "„Zebra” angolul:", options: ["zero", "zebra", "zipper", "zone"], correctIndex: 1 },
  { id: "m14", prompt: "„Erdő” angolul:", options: ["flower", "forest", "fork", "fourth"], correctIndex: 1 },
  ...wordLadderMedMore,
];

const QUIZ_HARD: Quiz[] = [
  { id: "h1", prompt: "Melyik helyes: „Nem szeretem a spenótot.”", options: ["I don't like spinach.", "I doesn't like spinach.", "I not like spinach.", "I no like spinach."], correctIndex: 0 },
  { id: "h2", prompt: "Melyik ige illik: They ___ football on Saturdays.", options: ["plays", "play", "playing", "is play"], correctIndex: 1 },
  { id: "h3", prompt: "Mit jelent: We must be quiet in the library.", options: ["A könyvtárban csendben kell lennünk.", "A könyvtárban zajosnak kell lennünk.", "A könyvtár zárva van.", "Nem mehetünk könyvtárba."], correctIndex: 0 },
  { id: "h4", prompt: "Melyik helyes többes szám: one foot → two ___", options: ["foots", "feet", "feets", "foot"], correctIndex: 1 },
  { id: "h5", prompt: "„Jobb” (összehasonlítás: nagy → nagyobb) angolul:", options: ["gooder", "better", "more good", "best"], correctIndex: 1 },
  { id: "h6", prompt: "Melyik elöljáró: The keys are ___ the table.", options: ["in", "on", "at", "to"], correctIndex: 1 },
  { id: "h7", prompt: "Válaszd ki: „Holnap lesz angol óránk.”", options: ["We will have English tomorrow.", "We have English yesterday.", "We having English tomorrow.", "We are English tomorrow."], correctIndex: 0 },
  { id: "h8", prompt: "Mit jelent: Could you repeat that, please?", options: ["Kérlek, ismételd meg.", "Kérlek, ne beszélj.", "Kérlek, menj el.", "Kérlek, siess."], correctIndex: 0 },
  { id: "h9", prompt: "Melyik mondat helyes?", options: ["She can sings well.", "She can sing well.", "She cans sing well.", "She can to sing well."], correctIndex: 1 },
  { id: "h10", prompt: "„Fél (óra)” — idő kifejezés angolul:", options: ["quarter", "half past", "o'clock", "minute"], correctIndex: 1 },
  { id: "h11", prompt: "Melyik illik: There ___ a pencil in my bag.", options: ["are", "is", "be", "were"], correctIndex: 1 },
  { id: "h12", prompt: "Mit jelent: I am going to visit my grandparents.", options: ["Meglátogatom a nagyszüleimet (szándék).", "Már meglátogattam őket.", "Nem megyek sehova.", "A nagyszüleim jönnek hozzám."], correctIndex: 0 },
  { id: "h13", prompt: "„Szótár” angolul:", options: ["diary", "dictionary", "delivery", "dinosaur"], correctIndex: 1 },
  { id: "h14", prompt: "Melyik helyes: „Ő tegnap írt egy levelet.”", options: ["She writes a letter yesterday.", "She wrote a letter yesterday.", "She write a letter yesterday.", "She writing a letter yesterday."], correctIndex: 1 },
  ...wordLadderHardMore,
];

function buildWordLadderQueue(pools: { easy: Quiz[]; med: Quiz[]; hard: Quiz[] }): Quiz[] {
  const e = shuffle(pools.easy).slice(0, RUNGS_EASY);
  const m = shuffle(pools.med).slice(0, RUNGS_MED);
  const h = shuffle(pools.hard).slice(0, Math.max(0, RUNGS_HARD));
  return [...e, ...m, ...h];
}

function buildLongRunQueue(pools: { easy: Quiz[]; med: Quiz[]; hard: Quiz[] }, chunks = 8): Quiz[] {
  const q: Quiz[] = [];
  for (let i = 0; i < chunks; i++) q.push(...buildWordLadderQueue(pools));
  return q;
}

/**
 * Fázisok: menu → quiz → reveal (a válasz felfedése, gombok letiltva) → step (a figura
 * ugrik/csúszik) → quiz … → won.
 */
type Phase = "menu" | "quiz" | "reveal" | "step" | "won";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function loadNum(key: string, d: number) {
  try {
    const v = localStorage.getItem(key);
    if (v == null) return d;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : d;
  } catch {
    return d;
  }
}

// ---------------------------------------------------------------------------------
// Grafikai részek
// ---------------------------------------------------------------------------------

/** Mosolygó, kerek fejű mászó figura (SVG). A sorozatnál kis láng a hátán. */
function Climber({ streak, mood }: { streak: number; mood: "happy" | "oops" | "idle" }) {
  const mouth = mood === "oops" ? "M 17 26 q 5 -3 10 0" : "M 16 24 q 6 6 12 0";
  return (
    <svg viewBox="0 0 44 56" width="44" height="56" aria-hidden="true" className="drop-shadow-[0_6px_10px_rgba(0,0,0,0.45)]">
      {streak >= 3 && (
        <g transform="translate(30 30)">
          <path d="M0 0 C -4 -6, 4 -10, 0 -18 C 6 -12, 8 -6, 3 0 Z" fill="#fb923c" />
          <path d="M0 -2 C -2 -5, 2 -8, 0 -12 C 3 -8, 4 -5, 2 -2 Z" fill="#fde047" />
        </g>
      )}
      {/* test */}
      <rect x="12" y="28" width="20" height="16" rx="6" fill="#38bdf8" stroke="#0369a1" strokeWidth="1.5" />
      {/* lábak */}
      <rect x="14" y="42" width="7" height="12" rx="3" fill="#4f46e5" stroke="#312e81" strokeWidth="1.2" />
      <rect x="23" y="42" width="7" height="12" rx="3" fill="#4f46e5" stroke="#312e81" strokeWidth="1.2" />
      {/* kezek a létrán */}
      <circle cx="8" cy="30" r="3.5" fill="#fcd9b6" stroke="#b45309" strokeWidth="1" />
      <circle cx="36" cy="30" r="3.5" fill="#fcd9b6" stroke="#b45309" strokeWidth="1" />
      {/* fej */}
      <circle cx="22" cy="17" r="12" fill="#fde2c4" stroke="#b45309" strokeWidth="1.5" />
      {/* haj */}
      <path d="M 11 12 q 11 -12 22 0 q -4 -4 -11 -4 q -7 0 -11 4 z" fill="#7c2d12" />
      {/* szemek */}
      <circle cx="17.5" cy="17" r="1.8" fill="#1f2937" />
      <circle cx="26.5" cy="17" r="1.8" fill="#1f2937" />
      {/* arcpír */}
      <circle cx="14" cy="21" r="2" fill="#fca5a5" opacity="0.7" />
      <circle cx="30" cy="21" r="2" fill="#fca5a5" opacity="0.7" />
      {/* száj */}
      <path d={mouth} stroke="#7f1d1d" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Zóna-dekoráció (emojik a háttérben), a mászással változik. */
function ZoneDecor({ decor, reduced }: { decor: string[]; reduced: boolean }) {
  const spots = [
    { left: "6%", top: "12%" },
    { left: "84%", top: "18%" },
    { left: "12%", top: "62%" },
    { left: "88%", top: "70%" },
    { left: "50%", top: "8%" },
    { left: "70%", top: "88%" },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {spots.map((s, i) => (
        <motion.span
          key={`${decor[i % decor.length]}-${i}`}
          className="absolute text-2xl sm:text-3xl opacity-70 select-none"
          style={{ left: s.left, top: s.top }}
          animate={reduced ? undefined : { y: [0, -6, 0] }}
          transition={{ duration: 3 + i * 0.6, repeat: Infinity, ease: "easeInOut" }}
        >
          {decor[i % decor.length]}
        </motion.span>
      ))}
    </div>
  );
}

/** Konfetti-eső (CSS animáció), reduced-motion esetén nem jelenik meg. */
function Confetti() {
  const parts = useMemo(() => confettiParticles(40), []);
  return (
    <div className="pointer-events-none fixed inset-0 z-[55] overflow-hidden" aria-hidden="true">
      {parts.map((p, i) => (
        <span
          key={i}
          className="wl-confetti absolute -top-4 rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            background: `hsl(${p.hue} 90% 60%)`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/** A létra: két sín + zóna-színű fokok; a megmászottak világítanak, a következő pulzál. */
function Ladder({ rung, total }: { rung: number; total: number }) {
  const W = 84;
  const H = 400;
  const top = 26;
  const bottom = H - 14;
  const gap = (bottom - top) / total;
  const rungY = (i: number) => bottom - i * gap;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="wl-rail" x1="0" x2="1">
          <stop offset="0" stopColor="#5b3a1e" />
          <stop offset="0.5" stopColor="#9a6335" />
          <stop offset="1" stopColor="#4a2e16" />
        </linearGradient>
      </defs>
      <rect x="10" y="8" width="9" height={H - 10} rx="4" fill="url(#wl-rail)" />
      <rect x={W - 19} y="8" width="9" height={H - 10} rx="4" fill="url(#wl-rail)" />
      {Array.from({ length: total }).map((_, i) => {
        const y = rungY(i + 1);
        const zone = zoneForRung(i + 1);
        const climbed = i + 1 <= rung;
        const isNext = i + 1 === rung + 1;
        return (
          <g key={i}>
            <rect
              x="14"
              y={y - 4}
              width={W - 28}
              height="8"
              rx="3"
              fill={zone.rungColor}
              opacity={climbed ? 1 : 0.55}
              stroke={climbed ? "#fde68a" : "rgba(0,0,0,0.25)"}
              strokeWidth={climbed ? 1.5 : 1}
              className={isNext ? "wl-rung-next" : undefined}
            />
          </g>
        );
      })}
      {/* zászló a tetején */}
      <text x={W / 2} y="16" textAnchor="middle" fontSize="16">🏁</text>
    </svg>
  );
}

export default function WordLadderHuEn() {
  const reducedMotion = useReducedMotion() ?? false;
  const [phase, setPhase] = useState<Phase>("menu");
  const [rung, setRung] = useState(0);
  const [queue, setQueue] = useState<Quiz[]>([]);
  const [cursor, setCursor] = useState(0);
  const [current, setCurrent] = useState<Quiz | null>(null);
  const [streak, setStreak] = useState(0);
  const [sessionXp, setSessionXp] = useState(0);
  const [totalXp, setTotalXp] = useState(() => loadNum(LS_XP, 0));
  const [bestStreak, setBestStreak] = useState(() => loadNum(LS_BEST, 0));
  const [celebrate, setCelebrate] = useState(false);
  const [runSeconds, setRunSeconds] = useState(0);
  const [stepDelta, setStepDelta] = useState<1 | -1>(1);
  /** A felfedés alatt: melyik gombot választotta a gyerek. */
  const [chosenIdx, setChosenIdx] = useState<number | null>(null);
  /** Bátorító üzenet a kvíz-panel alján. */
  const [feedback, setFeedback] = useState<string | null>(null);
  /** Mérföldkő / sorozat felirat (rövid ideig). */
  const [banner, setBanner] = useState<string | null>(null);
  const [lastXpGain, setLastXpGain] = useState<number | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A válasz-lock szinkron ref: két gyors kattintás ne dolgozódjon fel duplán.
  const answerLockedRef = useRef(false);
  // Az ad-hoc setTimeout-ok gyűjtve, unmountkor törölve.
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scoreSubmittedRef = useRef(false);
  /** Futáson belüli max streak — leaderboard/achievement-hez. */
  const runBestStreakRef = useRef(0);
  /** Helyes / hibás válaszok száma a futásban (a streak NEM egyenlő ezekkel). */
  const correctCountRef = useRef(0);
  const wrongCountRef = useRef(0);

  const { data: quizBankResponse } = useQuery<GameQuizBankResponse>({
    queryKey: ["/api/games/quiz-bank/word-ladder-hu-en"],
    queryFn: async () => {
      const r = await fetch("/api/games/quiz-bank/word-ladder-hu-en", { credentials: "include" });
      if (!r.ok) return { gameId: "word-ladder-hu-en", items: [] };
      return r.json() as Promise<GameQuizBankResponse>;
    },
    staleTime: 10 * 60 * 1000,
  });

  // Csak `topic === "english"` material-tételeket fogad (a Word Ladder szókincs-orientált).
  const { grade: userGrade } = useClassroomGrade();
  const { items: materialItems } = useMaterialQuizzes(userGrade, "english");

  const mergedPools = useMemo(() => {
    const { easy, medium, hard } = splitBankItemsByTier(quizBankResponse?.items);
    const matMed = materialItems
      .filter((q) => Array.isArray(q.options) && q.options.length === 4)
      .map((q, idx) => ({
        id: q.id ?? `mat-${idx}`,
        prompt: q.prompt,
        options: q.options.slice(0, 4) as [string, string, string, string],
        correctIndex: q.correctIndex,
      }));
    return {
      easy: [...QUIZ_BANK, ...easy],
      med: [...QUIZ_MED, ...medium, ...matMed],
      hard: [...QUIZ_HARD, ...hard],
    };
  }, [quizBankResponse, materialItems]);

  const mergedPoolsRef = useRef(mergedPools);
  mergedPoolsRef.current = mergedPools;

  const { data: syncEligibility } = useSyncEligibilityQuery();
  const syncBanner = useMemo(() => gameSyncBannerText(syncEligibility), [syncEligibility]);

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

  const pushTimeout = useCallback((fn: () => void, ms: number) => {
    timeoutsRef.current.push(setTimeout(fn, ms));
  }, []);

  const showBanner = useCallback(
    (text: string, ms = 1500) => {
      setBanner(text);
      pushTimeout(() => setBanner((b) => (b === text ? null : b)), ms);
    },
    [pushTimeout],
  );

  const startGame = useCallback(() => {
    scoreSubmittedRef.current = false;
    answerLockedRef.current = false;
    runBestStreakRef.current = 0;
    correctCountRef.current = 0;
    wrongCountRef.current = 0;
    const q = buildLongRunQueue(mergedPoolsRef.current);
    setQueue(q);
    setCursor(0);
    // Csak fejlesztői módban: ?rung=N kezdőfok a zónaváltások/cél gyors ellenőrzéséhez.
    let startRung = 0;
    if (import.meta.env.DEV) {
      const p = parseInt(new URLSearchParams(window.location.search).get("rung") ?? "", 10);
      if (Number.isFinite(p)) startRung = Math.max(0, Math.min(RUNGS - 1, p));
    }
    setRung(startRung);
    setStreak(0);
    setSessionXp(0);
    setRunSeconds(0);
    setChosenIdx(null);
    setFeedback(null);
    setBanner(null);
    setLastXpGain(null);
    setCurrent(q[0] ?? null);
    setPhase("quiz");
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => setRunSeconds((s) => s + 1), 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current = [];
    };
  }, []);

  const finishWon = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    sfxLevelUp();
    setPhase("won");
    setCelebrate(true);
    pushTimeout(() => setCelebrate(false), 3000);
  }, [pushTimeout]);

  // R = quick-restart a "won" / "menu" képernyőn.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "r" && e.key !== "R") return;
      if (phase === "won" || phase === "menu") {
        e.preventDefault();
        startGame();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, startGame]);

  const onAnswer = (i: number) => {
    if (!current) return;
    if (phase !== "quiz") return;
    if (answerLockedRef.current) return;
    answerLockedRef.current = true;
    const isCorrect = i === current.correctIndex;

    // 1) FELFEDÉS: a gyerek látja a zöld (helyes) és piros (hibás) választ.
    setChosenIdx(i);
    setPhase("reveal");
    setFeedback(encouragement(isCorrect, rung));

    if (!isCorrect) {
      wrongCountRef.current += 1;
      sfxError();
      setStreak(0);
      setLastXpGain(null);
    } else {
      correctCountRef.current += 1;
      sfxSuccess();
      const add = xpForCorrect(streak);
      setLastXpGain(add);
      setSessionXp((x) => x + add);
      setTotalXp((t) => t + add);
      const n = streak + 1;
      if (n > runBestStreakRef.current) runBestStreakRef.current = n;
      setBestStreak((b) => (n > b ? n : b));
      setStreak(n);
      const sm = streakMessage(n);
      if (sm) showBanner(sm, 1400);
    }

    const target = computeNextRung(rung, isCorrect, RUNGS);
    const nextCursor = cursor + 1;
    let nextQuestion = queue[nextCursor] ?? null;
    if (!nextQuestion) {
      const more = buildLongRunQueue(mergedPoolsRef.current, 4);
      const expanded = [...queue, ...more];
      setQueue(expanded);
      nextQuestion = expanded[nextCursor] ?? expanded[0] ?? null;
    }

    if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    // 2) LÉPÉS: a felfedés után a figura ugrik/csúszik.
    stepTimerRef.current = setTimeout(() => {
      const ms = milestoneFor(rung, target);
      setRung(target);
      setStepDelta(isCorrect ? 1 : -1);
      setPhase("step");
      if (ms) showBanner(ms, 1800);

      // 3) KÖVETKEZŐ KÉRDÉS vagy CÉL. A kérdéscsere CSAK itt történik: a lépés alatt még az
      // előző kérdés látszik a zöld/piros jelöléssel (különben a következő kérdés helyes
      // válasza szivárogna ki a felfedő színezéssel).
      stepTimerRef.current = setTimeout(() => {
        if (target >= RUNGS) {
          finishWon();
          setCurrent(null);
          return;
        }
        setCursor(nextCursor);
        setCurrent(nextQuestion);
        setChosenIdx(null);
        answerLockedRef.current = false;
        setFeedback(null);
        setLastXpGain(null);
        setPhase("quiz");
      }, STEP_MS);
    }, REVEAL_MS);
  };

  useEffect(() => {
    if (phase !== "won") return;
    if (!syncEligibility?.eligible) return;
    if (scoreSubmittedRef.current) return;
    scoreSubmittedRef.current = true;
    void apiRequest("POST", "/api/games/score", {
      gameId: "word-ladder-hu-en",
      difficulty: "normal",
      runXp: sessionXp,
      runStreak: runBestStreakRef.current,
      runSeconds,
    })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["/api/games/leaderboard"] });
      })
      .catch(() => {
        scoreSubmittedRef.current = false;
      });
  }, [phase, syncEligibility, sessionXp, streak, runSeconds]);

  // Achievement + Daily — egyszer fut "won" átmenetkor.
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[]>([]);
  const achievementCheckedRef = useRef(false);
  useEffect(() => {
    if (phase !== "won") {
      achievementCheckedRef.current = false;
      return;
    }
    if (achievementCheckedRef.current) return;
    achievementCheckedRef.current = true;
    const wasDailyAvailable = isTodaysGameAvailable("word-ladder-hu-en");
    const newOnes = recordRun({
      game: "word-ladder-hu-en",
      xpGained: sessionXp,
      correctAnswers: correctCountRef.current,
      wrongAnswers: wrongCountRef.current,
      maxStreak: runBestStreakRef.current,
      perfect: wrongCountRef.current === 0 && correctCountRef.current >= 5,
      fullClear: true,
    });
    if (wasDailyAvailable) {
      const daily = markDailyCompleted();
      if (daily.achievements.length > 0) newOnes.push(...daily.achievements);
    }
    if (newOnes.length > 0) setNewlyUnlocked(newOnes);
  }, [phase, sessionXp, streak]);

  const zone = zoneForRung(rung);
  const inRun = phase === "quiz" || phase === "reveal" || phase === "step";
  const climberMood: "happy" | "oops" | "idle" =
    phase === "reveal" || phase === "step" ? (stepDelta > 0 && phase === "step" ? "happy" : chosenIdx !== null && current && chosenIdx !== current.correctIndex ? "oops" : "happy") : "idle";
  // A figura függőleges helye a létrán (%): 0. fok = alul, RUNGS = a zászlónál.
  const climberBottomPct = 3 + (rung / RUNGS) * 88;

  return (
    <div
      className="game-shell-fixed min-h-screen relative overflow-hidden text-white"
      style={{
        background: phase === "won" ? LADDER_ZONES[LADDER_ZONES.length - 1]!.background : zone.background,
        transition: "background 800ms ease",
      }}
      data-testid="wordladder-root"
      data-zone={zone.id}
    >
      <ClassroomGateModal accent="violet" />
      <AchievementToast achievements={newlyUnlocked} />
      <ZoneDecor decor={phase === "won" ? ["🎉", "⭐", "🏆", "✨"] : zone.decor} reduced={reducedMotion} />
      {!reducedMotion && (
        <>
          <motion.div
            className="pointer-events-none absolute w-40 h-20 rounded-full bg-white/15 blur-xl top-[8%] left-[10%]"
            animate={{ x: [0, 30, 0], opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="pointer-events-none absolute w-56 h-24 rounded-full bg-white/15 blur-2xl top-[14%] right-[5%]"
            animate={{ x: [0, -40, 0] }}
            transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          />
        </>
      )}

      <main className="relative z-10 w-full max-w-lg lg:max-w-2xl mx-auto px-3 sm:px-5 py-4 min-h-dvh min-h-screen flex flex-col pb-8 sm:pb-10">
        <header className="flex items-center justify-between gap-2 mb-3">
          <Link href="/games">
            <Button variant="ghost" size="sm" className="text-white/90 hover:bg-white/10 gap-1 -ml-2">
              <ArrowLeft className="w-4 h-4" />
              Játékok
            </Button>
          </Link>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <AudioToggleButton size="icon" />
            <span className="flex items-center gap-1 text-amber-200" data-testid="wl-total-xp">
              <Star className="w-4 h-4" />
              {totalXp}
            </span>
            <motion.span
              className="flex items-center gap-1 text-orange-300"
              data-testid="wl-streak"
              animate={streak >= 3 && !reducedMotion ? { scale: [1, 1.2, 1] } : { scale: 1 }}
              transition={{ duration: 0.8, repeat: streak >= 3 ? Infinity : 0 }}
            >
              <Flame className={streak >= 5 ? "w-5 h-5" : "w-4 h-4"} />
              {streak}
            </motion.span>
          </div>
        </header>

        <Card className="glass-card border-white/15 bg-black/25 flex-1 flex flex-col min-h-0 shadow-2xl">
          <CardContent data-game-card-content className="p-3 sm:p-4 flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-5 h-5 text-amber-200" />
              <h1 className="text-base sm:text-lg font-extrabold leading-tight">Szólétra — HU ↔ EN</h1>
            </div>
            <GamePedagogyPanel
              accent="amber"
              className="mb-2"
              kidMission={`Mássz fel a létra tetejére a 🏁 zászlóig! Minden jó válasz egy fokkal feljebb visz és XP-t ad. Ha tévedsz, megcsúszol egy fokot — de a zöld gomb megmutatja a jó választ, és jön a következő kérdés. ${RUNGS} fok, 4 táj: rét, erdő, felhők, csillagok.`}
              parentBody={
                <>
                  <strong className="text-amber-100/90">Tananyag:</strong> magyar–angol szópárok, szókincs és jelentésfelismerés; a kérdések egyre nehezebb „létrafokokra” vannak osztva (progresszív gyakorlás).
                  <br />
                  <strong className="text-amber-100/90">Fejleszt:</strong> memória, kontextusból következtetés, kitartás a hiba után is.
                  <br />
                  <span className="text-white/55">
                    Hibás válasznál a helyes megoldás zölden felvillan (azonnali korrekció), a látható mászás és a tájváltások tartják a figyelmet.
                  </span>
                </>
              }
            />
            <p className="text-[10px] text-amber-100/80 mb-3 border border-white/15 rounded-lg px-2 py-1 bg-black/20">
              {syncBanner}
            </p>

            {phase === "menu" && (
              <div className="flex flex-col items-center justify-center flex-1 gap-4 py-6" data-testid="wl-menu">
                <div className="relative w-28 h-56">
                  <Ladder rung={0} total={RUNGS} />
                  <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: "6%" }}>
                    <motion.div animate={reducedMotion ? undefined : { y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 1.4 }}>
                      <Climber streak={0} mood="idle" />
                    </motion.div>
                  </div>
                </div>
                <p className="text-sm text-white/90 text-center max-w-sm font-semibold px-1">
                  {RUNGS} fok a zászlóig · 4 táj · minden jó válasz egy lépés felfelé
                </p>
                <p className="text-sm text-white/75 text-center max-w-xs">
                  Legjobb sorozat: <strong className="text-orange-300">{bestStreak}</strong>
                </p>
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-bold rounded-full px-8 shadow-lg text-base"
                  onClick={startGame}
                  data-testid="wl-start"
                >
                  Kezdjük a létrát!
                </Button>
              </div>
            )}

            {inRun && (
              <>
                <GameNextGoalBar
                  accent="amber"
                  headline={
                    rung >= RUNGS - 1
                      ? "Már majdnem a 🏁 zászló — még egy jó válasz!"
                      : `${zone.name}: a ${rung + 1}. fok következik (${RUNGS} fok a célig)`
                  }
                  subtitle={`${runSeconds} mp · sorozat: ${streak}`}
                  current={rung}
                  target={RUNGS}
                  className="mb-2"
                />
                <div className="flex-1 flex gap-2 sm:gap-3 min-h-[min(52vh,420px)]">
                  {/* LÉTRA */}
                  <div className="relative w-[72px] sm:w-[92px] shrink-0" data-testid="wl-ladder">
                    <Ladder rung={rung} total={RUNGS} />
                    <motion.div
                      className="absolute left-1/2 z-10"
                      style={{ x: "-50%" }}
                      animate={{
                        bottom: `${climberBottomPct}%`,
                        rotate: phase === "step" && stepDelta < 0 ? [0, -14, 10, 0] : 0,
                        scale: phase === "step" && stepDelta > 0 ? [1, 1.18, 1] : 1,
                      }}
                      transition={
                        reducedMotion
                          ? { duration: 0 }
                          : { bottom: { type: "spring", stiffness: 260, damping: 18 }, rotate: { duration: 0.5 }, scale: { duration: 0.45 } }
                      }
                      data-testid="wl-climber"
                    >
                      <Climber streak={streak} mood={climberMood} />
                    </motion.div>
                    <AnimatePresence>
                      {lastXpGain !== null && (
                        <motion.div
                          key={`${cursor}-${lastXpGain}`}
                          className="absolute left-1/2 -translate-x-1/2 text-sm font-black text-amber-200 drop-shadow"
                          style={{ bottom: `${Math.min(92, climberBottomPct + 14)}%` }}
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: -18 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.8 }}
                        >
                          +{lastXpGain}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* KVÍZ — a létra mellett, mindig látszik a mászás */}
                  <div className="flex-1 flex flex-col rounded-2xl border border-white/15 bg-black/35 p-3 sm:p-4 min-w-0" data-testid="wl-quiz">
                    <p className="text-[10px] uppercase tracking-widest text-amber-200/80 mb-1">
                      {zone.name} · {rung}/{RUNGS} fok · {runSeconds}s
                    </p>
                    {current ? (
                      <>
                        <p className="text-base sm:text-lg font-bold mb-3 leading-snug" data-testid="wl-prompt">
                          {current.prompt}
                        </p>
                        <div className="grid gap-2">
                          {current.options.map((opt, idx) => {
                            const revealing = phase === "reveal" || phase === "step";
                            const isCorrectOpt = idx === current.correctIndex;
                            const isChosen = chosenIdx === idx;
                            let cls =
                              "h-auto min-h-[44px] py-2.5 px-3 text-left justify-start whitespace-normal text-sm sm:text-base font-semibold border transition-colors ";
                            if (revealing && isCorrectOpt) cls += "bg-emerald-500 hover:bg-emerald-500 text-white border-emerald-200 ring-2 ring-emerald-200";
                            else if (revealing && isChosen) cls += "bg-rose-500 hover:bg-rose-500 text-white border-rose-200";
                            else if (revealing) cls += "bg-white/5 text-white/45 border-white/10";
                            else cls += "bg-white/12 hover:bg-amber-500/60 text-white border-white/20";
                            return (
                              <Button
                                key={idx}
                                variant="secondary"
                                className={cls}
                                disabled={phase !== "quiz"}
                                onClick={() => onAnswer(idx)}
                                data-testid={`wl-option-${idx}`}
                                data-state={revealing ? (isCorrectOpt ? "correct" : isChosen ? "wrong" : "idle") : "idle"}
                              >
                                <span className="mr-2 inline-flex w-6 h-6 items-center justify-center rounded-full bg-black/25 text-xs shrink-0">
                                  {revealing && isCorrectOpt ? <Check className="w-4 h-4" /> : revealing && isChosen ? <X className="w-4 h-4" /> : String.fromCharCode(65 + idx)}
                                </span>
                                {opt}
                              </Button>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-white/70">Egy pillanat…</p>
                    )}
                    <div className="mt-auto pt-3 min-h-[2.5rem]">
                      <AnimatePresence mode="wait">
                        {feedback && (
                          <motion.p
                            key={feedback}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className={`text-sm font-semibold ${stepDelta < 0 && phase !== "quiz" ? "text-rose-200" : "text-emerald-200"}`}
                            data-testid="wl-feedback"
                          >
                            {feedback}
                          </motion.p>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              </>
            )}

            {phase === "won" && (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 py-8 text-center" data-testid="wl-won">
                <motion.div initial={{ scale: 0.6, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 200, damping: 12 }}>
                  <Sparkles className="w-14 h-14 text-amber-200" />
                </motion.div>
                <p className="text-2xl font-black text-amber-100">🏁 Elérted a csúcsot!</p>
                <p className="text-sm font-semibold text-white/90 max-w-sm">
                  {RUNGS} fok, 4 táj — a szókincsed egy csomó lépéssel feljebb került. Ez a te jutalmad!
                </p>
                <p className="text-sm text-white/80">
                  +{sessionXp} XP · {runSeconds} mp · legjobb sorozat: {runBestStreakRef.current}
                </p>
                {syncEligibility?.eligible ? (
                  <p className="text-xs text-emerald-200/90">Eredmény elküldve a szervernek.</p>
                ) : (
                  <p className="text-xs text-white/50 max-w-xs">{syncBanner}</p>
                )}
                <div className="flex gap-2 mt-2">
                  <Button className="gap-1 bg-gradient-to-r from-amber-500 to-orange-600" onClick={startGame} data-testid="wl-restart">
                    <RotateCcw className="w-4 h-4" />
                    Újra
                  </Button>
                  <Link href="/games">
                    <Button variant="outline" className="border-white/40 text-white hover:bg-white/10">
                      Lista
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Mérföldkő / sorozat felirat */}
      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner}
            className="pointer-events-none fixed inset-x-0 top-[18%] z-[58] flex justify-center px-4"
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
            role="status"
            data-testid="wl-banner"
          >
            <div className="rounded-2xl bg-black/70 border-2 border-amber-300/70 px-5 py-3 text-lg sm:text-xl font-black text-amber-100 shadow-2xl backdrop-blur-sm text-center">
              {banner}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {celebrate && !reducedMotion && <Confetti />}

      <style>{`
        @keyframes wl-fall {
          0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0.2; }
        }
        .wl-confetti { animation: wl-fall 2.6s ease-in forwards; }
        @keyframes wl-pulse {
          0%, 100% { opacity: 0.55; }
          50% { opacity: 1; }
        }
        .wl-rung-next { animation: wl-pulse 1.1s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .wl-rung-next { animation: none; opacity: 0.85; }
        }
      `}</style>
    </div>
  );
}
