import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Star, Flame, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { motion, AnimatePresence } from "framer-motion";
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

const LS_XP = "websuli-wordladder-xp";
const LS_BEST = "websuli-wordladder-streak";

type Quiz = FourChoiceQuiz;

const RUNGS = 22;
const RUNGS_EASY = 8;
const RUNGS_MED = 8;

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
  const needHard = RUNGS - RUNGS_EASY - RUNGS_MED;
  const e = shuffle(pools.easy).slice(0, RUNGS_EASY);
  const m = shuffle(pools.med).slice(0, RUNGS_MED);
  const h = shuffle(pools.hard).slice(0, Math.max(0, needHard));
  return [...e, ...m, ...h];
}

function buildLongRunQueue(pools: { easy: Quiz[]; med: Quiz[]; hard: Quiz[] }, chunks = 8): Quiz[] {
  const q: Quiz[] = [];
  for (let i = 0; i < chunks; i++) q.push(...buildWordLadderQueue(pools));
  return q;
}

type Phase = "menu" | "quiz" | "step" | "won";

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

export default function WordLadderHuEn() {
  const [phase, setPhase] = useState<Phase>("menu");
  const [rung, setRung] = useState(0);
  const [queue, setQueue] = useState<Quiz[]>([]);
  const [cursor, setCursor] = useState(0);
  const [current, setCurrent] = useState<Quiz | null>(null);
  const [streak, setStreak] = useState(0);
  const [sessionXp, setSessionXp] = useState(0);
  const [totalXp, setTotalXp] = useState(() => loadNum(LS_XP, 0));
  const [bestStreak, setBestStreak] = useState(() => loadNum(LS_BEST, 0));
  const [wrongShake, setWrongShake] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const [runSeconds, setRunSeconds] = useState(0);
  const [stepDelta, setStepDelta] = useState<1 | -1>(1);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scoreSubmittedRef = useRef(false);

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

  const startGame = useCallback(() => {
    scoreSubmittedRef.current = false;
    const q = buildLongRunQueue(mergedPoolsRef.current);
    setQueue(q);
    setCursor(0);
    setRung(0);
    setStreak(0);
    setSessionXp(0);
    setRunSeconds(0);
    setCurrent(q[0] ?? null);
    setPhase("quiz");
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => setRunSeconds((s) => s + 1), 1000);
  }, []);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
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
    setTimeout(() => setCelebrate(false), 2000);
  }, []);

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
    const isCorrect = i === current.correctIndex;

    if (!isCorrect) {
      sfxError();
      setWrongShake(true);
      setTimeout(() => setWrongShake(false), 400);
      setStreak(0);
    }

    if (isCorrect) {
      sfxSuccess();
      const add = 30 + streak * 2;
      setSessionXp((x) => x + add);
      setTotalXp((t) => t + add);
      setStreak((s) => {
        const n = s + 1;
        setBestStreak((b) => (n > b ? n : b));
        return n;
      });
    }

    const nextRung = Math.max(0, Math.min(RUNGS, rung + (isCorrect ? 1 : -1)));
    const nextCursor = cursor + 1;
    let nextQuestion = queue[nextCursor] ?? null;
    if (!nextQuestion) {
      const more = buildLongRunQueue(mergedPoolsRef.current, 4);
      const expanded = [...queue, ...more];
      setQueue(expanded);
      nextQuestion = expanded[nextCursor] ?? expanded[0] ?? null;
    }

    setCursor(nextCursor);
    setRung(nextRung);
    setStepDelta(isCorrect ? 1 : -1);
    setCurrent(nextQuestion);
    setPhase("step");

    if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    stepTimerRef.current = setTimeout(() => {
      if (nextRung >= RUNGS) {
        finishWon();
        setCurrent(null);
        return;
      }
      setPhase("quiz");
    }, 520);
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
      runStreak: streak,
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
      correctAnswers: streak, // best-effort proxy
      wrongAnswers: 0,
      maxStreak: streak,
      perfect: streak >= 5,
      fullClear: true,
    });
    if (wasDailyAvailable) {
      markDailyCompleted();
    }
    if (newOnes.length > 0) setNewlyUnlocked(newOnes);
  }, [phase, sessionXp, streak]);

  return (
    <div
      className="game-shell-fixed min-h-screen relative overflow-hidden text-white"
      style={{
        background: "linear-gradient(180deg, #1e3a5f 0%, #2d4a6f 35%, #3d5c3a 70%, #2d4a2d 100%)",
      }}
    >
      <ClassroomGateModal accent="violet" />
      <AchievementToast achievements={newlyUnlocked} />
      {/* Ég + nap */}
      <div
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 120% 80% at 50% -20%, rgba(255,220,150,0.45) 0%, transparent 55%), radial-gradient(circle at 85% 12%, rgba(255,240,200,0.35) 0%, transparent 25%)",
        }}
      />
      <motion.div
        className="pointer-events-none absolute w-40 h-20 rounded-full bg-white/10 blur-xl top-[8%] left-[10%]"
        animate={{ x: [0, 30, 0], opacity: [0.4, 0.65, 0.4] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="pointer-events-none absolute w-56 h-24 rounded-full bg-white/8 blur-2xl top-[14%] right-[5%]"
        animate={{ x: [0, -40, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />

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
            <span className="flex items-center gap-1 text-amber-300">
              <Star className="w-4 h-4" />
              {totalXp}
            </span>
            <span className="flex items-center gap-1 text-orange-400">
              <Flame className="w-4 h-4" />
              {streak}
            </span>
          </div>
        </header>

        <Card className="glass-card border-amber-900/40 bg-amber-950/20 flex-1 flex flex-col min-h-0 shadow-2xl">
          <CardContent data-game-card-content className="p-3 sm:p-4 flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="w-5 h-5 text-amber-300" />
              <h1 className="text-base sm:text-lg font-extrabold leading-tight">Szólétra — HU ↔ EN</h1>
            </div>
            <GamePedagogyPanel
              accent="amber"
              className="mb-2"
              kidMission="Mászd meg a létrát a tetejéig! Minden jó válasz egy fokkal feljebb visz és XP-et ad. Ha tévedsz, egy fokot visszamész — de jön azonnal egy új kérdés, újra próbálhatod (mint egy szintlépős nyelvtanfolyamon)."
              parentBody={
                <>
                  <strong className="text-amber-100/90">Tananyag:</strong> magyar–angol szópárok, szókincs és jelentésfelismerés; a kérdések egyre nehezebb „létrafokokra” vannak osztva (progresszív gyakorlás).
                  <br />
                  <strong className="text-amber-100/90">Fejleszt:</strong> memória, kontextusból következtetés, kitartás a hiba után is.
                  <br />
                  <span className="text-white/55">
                    A kvízek és a vizuális haladás (létra) együtt tartják a figyelmet: cél látható, a visszajelzés azonnali.
                  </span>
                </>
              }
            />
            <p className="text-[10px] text-amber-100/80 mb-3 border border-amber-700/40 rounded-lg px-2 py-1 bg-black/20">
              {syncBanner}
            </p>

            {phase === "menu" && (
              <div className="flex flex-col items-center justify-center flex-1 gap-4 py-8">
                <div className="relative w-32 h-48 flex items-end justify-center">
                  {Array.from({ length: RUNGS }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute w-28 h-2 rounded-sm shadow-md"
                      style={{
                        bottom: `${i * 14}px`,
                        background: `linear-gradient(90deg, #5c3d1e 0%, #8b5a2b 40%, #6b4423 100%)`,
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15)",
                      }}
                    />
                  ))}
                  <span className="relative z-10 text-3xl mb-1 drop-shadow-lg">🧗</span>
                </div>
                <p className="text-xs text-amber-100/90 text-center max-w-sm font-semibold px-1">
                  Tipp: nézd a fokokat bal oldalt — minden találat közelebb visz a „CÉL” táblához. XP + láng = sorozat.
                </p>
                <p className="text-sm text-white/75 text-center max-w-xs">
                  Legjobb sorozat: <strong className="text-orange-300">{bestStreak}</strong>
                </p>
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-amber-600 to-orange-700 text-white font-bold rounded-full px-8 shadow-lg text-base"
                  onClick={startGame}
                >
                  Kezdjük a létrát!
                </Button>
              </div>
            )}

            {(phase === "quiz" || phase === "step") && (
              <>
                <GameNextGoalBar
                  accent="amber"
                  headline={
                    rung >= RUNGS - 1
                      ? "Már majdnem a CÉL tábla — még egy jó válasz!"
                      : `Mászd meg a következő fokot (${rung + 1}. → ${RUNGS}.)`
                  }
                  subtitle={`${runSeconds} mp a körből · minden találat = feljebb a létrán`}
                  current={rung}
                  target={RUNGS}
                  className="mb-2"
                />
                <div className="flex-1 flex gap-3 min-h-[min(45vh,340px)] sm:min-h-[300px]">
                <div className="relative w-[88px] shrink-0 flex items-end justify-center pb-2">
                  <div
                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-full rounded-sm"
                    style={{
                      background: "linear-gradient(90deg, #4a3728, #6b5344, #3d2e22)",
                      boxShadow: "inset -2px 0 4px rgba(0,0,0,0.4)",
                    }}
                  />
                  {Array.from({ length: RUNGS }).map((_, i) => (
                    <div
                      key={i}
                      className="absolute left-1/2 -translate-x-1/2 w-20 h-2.5 rounded-sm"
                      style={{
                        bottom: `${8 + i * 18}px`,
                        background: `linear-gradient(90deg, #6b4423 0%, #a0522d 45%, #5c3d1e 100%)`,
                        boxShadow: "inset 0 2px 0 rgba(255,255,255,0.2), 0 2px 4px rgba(0,0,0,0.4)",
                      }}
                    />
                  ))}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 text-[10px] font-bold text-amber-200 bg-black/35 border border-amber-200/30 rounded-full px-2 py-0.5">
                    CÉL
                  </div>
                  <motion.div
                    className="absolute z-10 left-1/2 -translate-x-1/2"
                    style={{ bottom: `${8 + rung * 18}px` }}
                    animate={{ y: [0, -2, 0] }}
                    transition={{ repeat: Infinity, duration: 1, ease: "easeInOut" }}
                  >
                    <div className="relative w-8 h-12 drop-shadow-[0_5px_10px_rgba(0,0,0,0.55)]">
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-5 h-4 rounded-full bg-amber-200 border border-amber-400" />
                      <div className="absolute top-4 left-1/2 -translate-x-1/2 w-6 h-5 rounded bg-sky-500 border border-sky-700" />
                      <div className="absolute top-8 left-[6px] w-2.5 h-4 rounded bg-indigo-700 border border-indigo-900" />
                      <div className="absolute top-8 right-[6px] w-2.5 h-4 rounded bg-indigo-700 border border-indigo-900" />
                    </div>
                  </motion.div>
                </div>
                <div className="flex-1 flex flex-col justify-center rounded-xl border border-white/10 bg-black/25 p-3 min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-amber-200/70 mb-1">
                    Fok {rung + 1} / {RUNGS} · {runSeconds}s
                  </p>
                  <p className="text-sm text-white/80">
                    {phase === "step"
                      ? stepDelta > 0
                        ? "Szuper! Egy fokkal feljebb — így néz ki a jutalom. Mehet a következő lépés!"
                        : "Most egy fokot vissza — ne búsulj, a következő kérdésnél újra próbálkozhatsz, és újra feljebb mászhatsz."
                      : "Figyeld a figurát: minden válasz után vagy feljebb kerül, vagy egy fokot vissza — mindkettő azonnal látszik."}
                  </p>
                </div>
              </div>
              </>
            )}

            {phase === "won" && (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 py-8 text-center">
                <Sparkles className="w-14 h-14 text-amber-300" />
                <p className="text-xl font-black text-amber-200">Elérted a létra tetejét!</p>
                <p className="text-sm font-semibold text-lime-100/90 max-w-sm">
                  Sok helyes kvíz összejött — a szókincsed egy csomó fokkal feljebb került. Ez a te jutalmad!
                </p>
                <p className="text-sm text-white/75">
                  +{sessionXp} XP ebben a körben · {runSeconds} mp
                </p>
                {syncEligibility?.eligible ? (
                  <p className="text-xs text-emerald-300/90">Eredmény elküldve a szervernek.</p>
                ) : (
                  <p className="text-xs text-white/50 max-w-xs">{syncBanner}</p>
                )}
                <div className="flex gap-2 mt-2">
                  <Button
                    className="gap-1 bg-gradient-to-r from-amber-600 to-orange-700"
                    onClick={startGame}
                  >
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

      <AnimatePresence>
        {phase === "quiz" && current && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-3 bg-black/75 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ y: 36, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className={`w-full max-w-md rounded-2xl border-2 border-amber-600/50 bg-gradient-to-b from-amber-950/95 to-slate-950/98 p-4 shadow-2xl ${
                wrongShake ? "animate-shake" : ""
              }`}
            >
              <p className="text-xs font-bold text-amber-300 uppercase tracking-wider mb-1">
                Gyors kvíz — válaszd a helyest
              </p>
              <p className="text-[11px] text-white/65 mb-2">Találat = egy fok fel + XP. Ez a „tesztlépés” a következő szintre.</p>
              <p className="text-base font-semibold mb-4 leading-snug">{current.prompt}</p>
              <div className="grid gap-2">
                {current.options.map((opt, idx) => (
                  <Button
                    key={idx}
                    variant="secondary"
                    className="h-auto py-3 text-left justify-start bg-white/10 hover:bg-amber-700/50 text-white border border-amber-900/40"
                    onClick={() => onAnswer(idx)}
                  >
                    {opt}
                  </Button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {celebrate && (
        <div className="fixed inset-0 pointer-events-none z-[55] flex items-start justify-center pt-24">
          <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.2, 1] }} className="text-6xl">
            🎉
          </motion.div>
        </div>
      )}

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
        .animate-shake { animation: shake 0.18s ease-in-out 2; }
      `}</style>
    </div>
  );
}
