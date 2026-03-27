import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft,
  ArrowBigLeft,
  ArrowBigRight,
  Waves,
  Trophy,
  Flame,
  Star,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import CosmicBackground from "@/components/CosmicBackground";
import { motion, AnimatePresence } from "framer-motion";

const LS_XP = "websuli-tsunami-en-xp";
const LS_BEST = "websuli-tsunami-en-best-streak";

type Quiz = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
};

/** Harmadikos angol: színek, számok, egyszerű szavak, üdvözlet — magyar kérdés, angol válaszok */
const QUIZ_BANK: Quiz[] = [
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
];

/** Nehezített mód: több kérdés a poolban */
const HARD_QUIZ_EXTRA: Quiz[] = [
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

type GameDifficulty = "easy" | "normal" | "hard";

const PRESETS: Record<
  GameDifficulty,
  { waterRisePerSec: number; quizEverySec: number; waterPush: number; xpPerCorrect: number; runBonus: number }
> = {
  easy: { waterRisePerSec: 3, quizEverySec: 18, waterPush: 28, xpPerCorrect: 25, runBonus: 2 },
  normal: { waterRisePerSec: 4.5, quizEverySec: 14, waterPush: 22, xpPerCorrect: 25, runBonus: 2 },
  hard: { waterRisePerSec: 6.8, quizEverySec: 9, waterPush: 16, xpPerCorrect: 32, runBonus: 2 },
};

type Phase = "menu" | "play" | "quiz" | "over";

type SyncEligibility = { eligible: boolean; reason?: string };

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

  const keysRef = useRef({ left: false, right: false });
  const lastRef = useRef<number | null>(null);
  const quizTimerRef = useRef(0);
  const runTimerRef = useRef(0);
  const rafRef = useRef<number>(0);
  const paramsRef = useRef(PRESETS.normal);
  const runDifficultyRef = useRef<GameDifficulty>("normal");
  const scoreSubmittedRef = useRef(false);

  const { data: syncEligibility } = useQuery<SyncEligibility>({
    queryKey: ["/api/games/sync-eligibility"],
  });

  const syncBanner = useMemo(() => {
    if (!syncEligibility) return "Felhő szinkron ellenőrzése…";
    if (syncEligibility.eligible) {
      return "Be vagy jelentkezve Google-lal és listán van az e-mailed — a kör vége felkerül a ranglistára.";
    }
    switch (syncEligibility.reason) {
      case "not_logged_in":
        return "Nem vagy bejelentkezve — a helyi XP megmarad, felhő ranglista nincs.";
      case "google_only":
        return "Csak Google bejelentkezéssel menthető a pont a szerverre (OAuth).";
      case "not_on_mailing_list":
        return "Az e-mailed nincs a WebSuli értesítő listáján — iratkozz fel, vagy kérj meghívót.";
      default:
        return "A felhő szinkron most nem elérhető.";
    }
  }, [syncEligibility]);

  const pickQuiz = useCallback((): Quiz => {
    const hard = runDifficultyRef.current === "hard";
    const pool = hard ? [...QUIZ_BANK, ...HARD_QUIZ_EXTRA] : QUIZ_BANK;
    const idx = Math.floor(Math.random() * pool.length);
    return pool[idx]!;
  }, []);

  const startGame = useCallback(() => {
    paramsRef.current = PRESETS[difficulty];
    runDifficultyRef.current = difficulty;
    scoreSubmittedRef.current = false;
    setWater(12);
    setPlayerX(50);
    setRunSeconds(0);
    setStreak(0);
    setSessionXp(0);
    quizTimerRef.current = 0;
    runTimerRef.current = 0;
    lastRef.current = null;
    setQuiz(null);
    setPhase("play");
  }, [difficulty]);

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
    const down = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keysRef.current.left = true;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keysRef.current.right = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") keysRef.current.left = false;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") keysRef.current.right = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const gameLoop = useCallback(
    (t: number) => {
      if (phase !== "play") return;

      const last = lastRef.current;
      lastRef.current = t;
      const dt = last == null ? 0 : Math.min(0.05, (t - last) / 1000);

      const P = paramsRef.current;

      setWater((w) => {
        let next = w + P.waterRisePerSec * dt;
        const maxPct = 88;
        if (next >= maxPct) {
          queueMicrotask(endGame);
          return maxPct;
        }
        return next;
      });

      setPlayerX((x) => {
        let nx = x;
        if (keysRef.current.left) nx -= 38 * dt;
        if (keysRef.current.right) nx += 38 * dt;
        return Math.max(8, Math.min(92, nx));
      });

      quizTimerRef.current += dt;
      if (quizTimerRef.current >= P.quizEverySec) {
        quizTimerRef.current = 0;
        setQuiz(pickQuiz());
        setPhase("quiz");
        return;
      }

      runTimerRef.current += dt;
      if (runTimerRef.current >= 1) {
        runTimerRef.current -= 1;
        const bonus = P.runBonus;
        setRunSeconds((s) => s + 1);
        setSessionXp((xp) => xp + bonus);
        setTotalXp((tx) => tx + bonus);
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
      setWrongShake(true);
      setTimeout(() => setWrongShake(false), 400);
      setStreak(0);
      return;
    }

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
    setWater((w) => Math.max(5, w - paramsRef.current.waterPush));
    setQuiz(null);
    setPhase("play");
    lastRef.current = null;
  };

  const surfacePct = useMemo(() => Math.min(100, water), [water]);

  useEffect(() => {
    if (phase !== "over") return;
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
      .catch((err) => {
        console.warn("[games/score]", err);
        scoreSubmittedRef.current = false;
      });
  }, [phase, syncEligibility, sessionXp, streak, runSeconds]);

  return (
    <div className="min-h-screen relative overflow-hidden text-white" style={{ backgroundColor: "#061022" }}>
      <CosmicBackground />

      <main className="relative z-10 max-w-lg mx-auto px-3 py-4 min-h-screen flex flex-col">
        <header className="flex items-center justify-between gap-2 mb-3">
          <Link href="/games">
            <Button
              variant="ghost"
              size="sm"
              className="text-white/90 hover:bg-white/10 gap-1 -ml-2"
              data-testid="link-tsunami-back-games"
            >
              <ArrowLeft className="w-4 h-4" />
              Játékok
            </Button>
          </Link>
          <div className="flex items-center gap-2 text-xs sm:text-sm font-semibold">
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

        <Card className="glass-card border-cyan-500/30 flex-1 flex flex-col min-h-0 mb-3">
          <CardContent className="p-3 sm:p-4 flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-2 mb-2">
              <Waves className="w-5 h-5 text-cyan-400" />
              <h1 className="text-base sm:text-lg font-extrabold leading-tight">
                Szökőár szökés — Angol 3.
              </h1>
            </div>
            <p className="text-[11px] sm:text-xs text-white/65 mb-2 leading-snug">
              A víz egyre feljebb jön. Időnként kvíz jön: csak helyes válasszal kapsz nagy XP-t és
              visszanyomod a hullámot. Billentyű: A/D vagy nyilak. Telefonon: gombok.
            </p>
            <p className="text-[10px] text-cyan-200/80 mb-3 leading-snug border border-cyan-500/25 rounded-lg px-2 py-1.5 bg-cyan-950/30">
              {syncBanner}
            </p>

            {phase === "menu" && (
              <div className="flex flex-col items-center justify-center flex-1 gap-4 py-6">
                <Trophy className="w-14 h-14 text-amber-400" />
                <p className="text-sm text-center text-white/75 max-w-xs">
                  Legjobb sorozat (helyi): <strong className="text-orange-300">{bestStreak}</strong> helyes
                  egymás után
                </p>
                <div className="w-full max-w-xs space-y-2">
                  <p className="text-[11px] text-white/55 text-center">Nehézség</p>
                  <div className="flex gap-2 justify-center flex-wrap">
                    <Button
                      type="button"
                      size="sm"
                      variant={difficulty === "easy" ? "default" : "outline"}
                      className={
                        difficulty === "easy"
                          ? "bg-emerald-600 text-white"
                          : "border-white/40 text-white hover:bg-white/10"
                      }
                      onClick={() => setDifficulty("easy")}
                    >
                      Könnyű
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={difficulty === "normal" ? "default" : "outline"}
                      className={
                        difficulty === "normal"
                          ? "bg-cyan-600 text-white"
                          : "border-white/40 text-white hover:bg-white/10"
                      }
                      onClick={() => setDifficulty("normal")}
                    >
                      Közepes
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={difficulty === "hard" ? "default" : "outline"}
                      className={
                        difficulty === "hard"
                          ? "bg-rose-600 text-white"
                          : "border-white/40 text-white hover:bg-white/10"
                      }
                      onClick={() => setDifficulty("hard")}
                    >
                      Nehéz
                    </Button>
                  </div>
                </div>
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-full px-8"
                  onClick={startGame}
                  data-testid="button-tsunami-start"
                >
                  Indítás ({difficultyLabel(difficulty)})
                </Button>
              </div>
            )}

            {(phase === "play" || phase === "quiz") && (
              <div className="relative flex-1 min-h-[320px] rounded-xl overflow-hidden border border-white/15 bg-gradient-to-b from-sky-900/80 to-slate-950">
                {/* Tower / sky */}
                <div
                  className="absolute inset-0 opacity-40"
                  style={{
                    background:
                      "repeating-linear-gradient(90deg, transparent, transparent 28px, rgba(255,255,255,0.04) 28px, rgba(255,255,255,0.04) 29px)",
                  }}
                />
                <div className="absolute top-3 left-0 right-0 flex justify-center">
                  <span className="text-[10px] uppercase tracking-widest text-white/50">Menekülés felfelé</span>
                </div>
                <div className="absolute top-8 left-2 text-[11px] text-white/60">
                  Futás: {runSeconds}s · {difficultyLabel(runDifficultyRef.current)}
                </div>

                {/* Platforms */}
                {[18, 38, 58, 78].map((top) => (
                  <div
                    key={top}
                    className="absolute left-[10%] right-[10%] h-2 rounded-full bg-white/25"
                    style={{ top: `${top}%` }}
                  />
                ))}

                {/* Player */}
                <motion.div
                  className="absolute w-10 h-10 flex items-center justify-center text-2xl select-none"
                  style={{
                    left: `${playerX}%`,
                    bottom: `calc(${surfacePct}% + 12px)`,
                    translateX: "-50%",
                  }}
                  animate={phase === "play" ? { y: [0, -4, 0] } : {}}
                  transition={{ repeat: Infinity, duration: 0.6, ease: "easeInOut" }}
                >
                  🏃
                </motion.div>

                {/* Water */}
                <div
                  className="absolute left-0 right-0 bottom-0 pointer-events-none transition-[height] duration-100 ease-linear"
                  style={{
                    height: `${surfacePct}%`,
                    background: `linear-gradient(to top, rgba(8,47,73,0.95), rgba(14,165,233,0.65), rgba(125,211,252,0.35))`,
                    boxShadow: "0 -8px 40px rgba(34,211,238,0.35)",
                  }}
                >
                  <div className="absolute top-0 left-0 right-0 h-3 -translate-y-1/2 rounded-full bg-cyan-300/50 blur-sm" />
                </div>

                {rewardBurst && (
                  <motion.div
                    className="absolute inset-0 flex items-center justify-center pointer-events-none text-4xl"
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1.2, opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    ✨ +{lastQuizXp} XP
                  </motion.div>
                )}
              </div>
            )}

            {phase === "play" && (
              <div className="flex gap-3 justify-center mt-3">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="flex-1 h-14 border-white/30 bg-white/5 text-white hover:bg-white/15 active:scale-95"
                  onTouchStart={() => {
                    keysRef.current.left = true;
                  }}
                  onTouchEnd={() => {
                    keysRef.current.left = false;
                  }}
                  onMouseDown={() => {
                    keysRef.current.left = true;
                  }}
                  onMouseUp={() => {
                    keysRef.current.left = false;
                  }}
                  onMouseLeave={() => {
                    keysRef.current.left = false;
                  }}
                  aria-label="Balra"
                >
                  <ArrowBigLeft className="w-8 h-8" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="flex-1 h-14 border-white/30 bg-white/5 text-white hover:bg-white/15 active:scale-95"
                  onTouchStart={() => {
                    keysRef.current.right = true;
                  }}
                  onTouchEnd={() => {
                    keysRef.current.right = false;
                  }}
                  onMouseDown={() => {
                    keysRef.current.right = true;
                  }}
                  onMouseUp={() => {
                    keysRef.current.right = false;
                  }}
                  onMouseLeave={() => {
                    keysRef.current.right = false;
                  }}
                  aria-label="Jobbra"
                >
                  <ArrowBigRight className="w-8 h-8" />
                </Button>
              </div>
            )}

            {phase === "over" && (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 py-6 text-center">
                <Waves className="w-12 h-12 text-cyan-400" />
                <p className="text-lg font-bold">Elért a hullám!</p>
                <p className="text-sm text-white/70">
                  Szekció XP: <strong className="text-amber-300">{sessionXp}</strong> · Futás:{" "}
                  <strong>{runSeconds}</strong> mp · {difficultyLabel(runDifficultyRef.current)}
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
                    className="gap-1 bg-gradient-to-r from-cyan-500 to-blue-600"
                    onClick={startGame}
                    data-testid="button-tsunami-retry"
                  >
                    <RotateCcw className="w-4 h-4" />
                    Újra
                  </Button>
                  <Link href="/games">
                    <Button variant="outline" className="border-white/40 text-white hover:bg-white/10">
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
              className={`w-full max-w-md rounded-2xl border border-cyan-400/40 bg-slate-900/95 p-4 shadow-2xl ${
                wrongShake ? "animate-shake" : ""
              }`}
            >
              <p className="text-xs font-bold text-cyan-300 uppercase tracking-wider mb-2">Kvíz — helyes válasz = XP + hullám vissza</p>
              <p className="text-base font-semibold mb-4 leading-snug">{quiz.prompt}</p>
              <div className="grid gap-2">
                {quiz.options.map((opt, i) => (
                  <Button
                    key={i}
                    variant="secondary"
                    className="h-auto py-3 text-left justify-start whitespace-normal bg-white/10 hover:bg-cyan-600/40 text-white border border-white/10"
                    onClick={() => onAnswer(i)}
                  >
                    {opt}
                  </Button>
                ))}
              </div>
              <p className="text-[11px] text-white/50 mt-3 text-center">Rossz válasz: nincs jutalom — próbáld újra ugyanazt!</p>
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
