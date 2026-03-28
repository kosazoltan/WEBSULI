import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Flame, Gauge, Heart, Rocket, RotateCcw, Star, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { gameSyncBannerText, useSyncEligibilityQuery } from "@/hooks/useGameScoreSync";

type GradeLevel = 3 | 4 | 5;
type Phase = "menu" | "play" | "over" | "won";

type MathTask = {
  prompt: string;
  options: number[];
  correctIndex: number;
  source: "teacher" | "generated";
};

const ROUND_SECONDS: Record<GradeLevel, number> = {
  3: 120,
  4: 110,
  5: 100,
};

const QUESTION_SECONDS: Record<GradeLevel, number> = {
  3: 18,
  4: 16,
  5: 14,
};

const TARGET_CORRECT: Record<GradeLevel, number> = {
  3: 15,
  4: 18,
  5: 21,
};

const LEVEL_LABEL: Record<GradeLevel, string> = {
  3: "3. osztály",
  4: "4. osztály",
  5: "5. osztály",
};

const SCORE_DIFFICULTY: Record<GradeLevel, "easy" | "normal" | "hard"> = {
  3: "easy",
  4: "normal",
  5: "hard",
};

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function uniqueOptions(correct: number, level: GradeLevel): number[] {
  const set = new Set<number>([correct]);
  const spread = level === 3 ? 9 : level === 4 ? 14 : 20;
  while (set.size < 4) {
    const offset = randInt(-spread, spread);
    const candidate = Math.max(0, correct + offset);
    set.add(candidate);
  }
  return [...set].sort(() => Math.random() - 0.5);
}

const TEACHER_BANK: Record<GradeLevel, MathTask[]> = {
  3: [
    { prompt: "Egy gyerek 18 matricát gyűjtött, majd kapott még 7-et. Hány matricája van most?", options: [23, 24, 25, 26], correctIndex: 2, source: "teacher" },
    { prompt: "Az osztályban 27 ceruza volt, 9-et elhasználtak. Mennyi maradt?", options: [16, 17, 18, 19], correctIndex: 2, source: "teacher" },
    { prompt: "4 dobozban dobozonként 6 alma van. Hány alma összesen?", options: [18, 20, 22, 24], correctIndex: 3, source: "teacher" },
    { prompt: "A könyvtárban 35 könyv volt, majd hoztak még 14-et. Hány könyv lett?", options: [47, 48, 49, 50], correctIndex: 2, source: "teacher" },
    { prompt: "Egy buszon 42 utas volt, 15 leszállt. Hány utas maradt?", options: [25, 26, 27, 28], correctIndex: 2, source: "teacher" },
    { prompt: "7 zsákban 5-5 golyó van. Hány golyó összesen?", options: [30, 35, 40, 45], correctIndex: 1, source: "teacher" },
    { prompt: "Misi 12 percet tanult reggel és 13 percet délután. Hány percet tanult összesen?", options: [23, 24, 25, 26], correctIndex: 2, source: "teacher" },
    { prompt: "A büfében 50 zsemle volt, 21-et eladtak. Mennyi maradt?", options: [28, 29, 30, 31], correctIndex: 1, source: "teacher" },
  ],
  4: [
    { prompt: "Egy boltban 235 db füzet volt. Hozzáadtak még 147-et. Hány füzet lett?", options: [372, 382, 392, 402], correctIndex: 1, source: "teacher" },
    { prompt: "A sportnapon 640 métert futottak, ebből 275 métert már teljesítettek. Mennyi van még hátra?", options: [355, 365, 375, 385], correctIndex: 1, source: "teacher" },
    { prompt: "9 csapatban csapatonként 14 tanuló van. Hány tanuló összesen?", options: [116, 126, 136, 146], correctIndex: 1, source: "teacher" },
    { prompt: "432 cukorkát 8 egyenlő csomagba osztanak. Hány cukorka jut egy csomagba?", options: [52, 53, 54, 55], correctIndex: 2, source: "teacher" },
    { prompt: "Egy túrán délelőtt 1860 lépést, délután 975 lépést tettek meg. Hány lépés összesen?", options: [2815, 2825, 2835, 2845], correctIndex: 2, source: "teacher" },
    { prompt: "Egy iskolában 720 tanuló van, ebből 268 alsós. Hány felsős tanuló van?", options: [442, 452, 462, 472], correctIndex: 1, source: "teacher" },
    { prompt: "12 dobozban dobozonként 16 filctoll van. Hány filctoll összesen?", options: [182, 192, 202, 212], correctIndex: 1, source: "teacher" },
    { prompt: "4500 Ft-od van. Veszel egy játékot 1750 Ft-ért és egy könyvet 980 Ft-ért. Mennyi pénzed marad?", options: [1670, 1770, 1870, 1970], correctIndex: 1, source: "teacher" },
  ],
  5: [
    { prompt: "Egy osztály 24 csapatban gyűjt pontot. Egy csapat 18 pontot, egy másik 27 pontot szerzett. Mennyi a két csapat pontjainak összege?", options: [43, 44, 45, 46], correctIndex: 2, source: "teacher" },
    { prompt: "Egy táborban 36 gyerek van. A gyerekek 3/4-e megy kirándulni. Hány gyerek indul?", options: [24, 26, 27, 28], correctIndex: 2, source: "teacher" },
    { prompt: "Egy robotversenyen 1250 pontból 3 körben 285, 340 és 415 pontot szereztek. Mennyi pont maradt?", options: [190, 200, 210, 220], correctIndex: 2, source: "teacher" },
    { prompt: "48 darab LED-et 6 sorba rendeznek egyenlően. Hány LED jut egy sorba?", options: [6, 7, 8, 9], correctIndex: 2, source: "teacher" },
    { prompt: "Egy pályán 28 akadály van. Minden 4. akadály után bónusz jár. Hány bónuszpont-hely van?", options: [6, 7, 8, 9], correctIndex: 1, source: "teacher" },
    { prompt: "A csapat 5600 XP-ből 2380 XP-t megszerzett hétfőn, és 1740 XP-t kedden. Mennyi hiányzik?", options: [1380, 1480, 1580, 1680], correctIndex: 1, source: "teacher" },
    { prompt: "3 dobozban 24-24 kártya, és 2 dobozban 18-18 kártya van. Hány kártya összesen?", options: [98, 108, 118, 128], correctIndex: 1, source: "teacher" },
    { prompt: "Egy játékban 5 kör van. Körönként 12 pont jár, de minden kör végén 3 pont levonás van. Mennyi pont marad 5 kör után?", options: [40, 45, 50, 55], correctIndex: 1, source: "teacher" },
  ],
};

function generatedTaskForGrade(level: GradeLevel): MathTask {
  const roll = Math.random();
  let prompt = "";
  let result = 0;

  if (level === 3) {
    if (roll < 0.45) {
      const a = randInt(8, 90);
      const b = randInt(4, 35);
      prompt = `${a} + ${b} = ?`;
      result = a + b;
    } else if (roll < 0.8) {
      const a = randInt(25, 100);
      const b = randInt(3, 24);
      prompt = `${a} - ${b} = ?`;
      result = a - b;
    } else {
      const a = randInt(2, 9);
      const b = randInt(2, 9);
      prompt = `${a} × ${b} = ?`;
      result = a * b;
    }
  } else if (level === 4) {
    if (roll < 0.34) {
      const a = randInt(120, 780);
      const b = randInt(45, 260);
      prompt = `${a} + ${b} = ?`;
      result = a + b;
    } else if (roll < 0.64) {
      const a = randInt(300, 950);
      const b = randInt(80, 290);
      prompt = `${a} - ${b} = ?`;
      result = a - b;
    } else if (roll < 0.86) {
      const a = randInt(4, 12);
      const b = randInt(6, 19);
      prompt = `${a} × ${b} = ?`;
      result = a * b;
    } else {
      const b = randInt(3, 12);
      const r = randInt(4, 18);
      const a = b * r;
      prompt = `${a} ÷ ${b} = ?`;
      result = r;
    }
  } else {
    if (roll < 0.3) {
      const a = randInt(230, 980);
      const b = randInt(120, 760);
      const c = randInt(10, 90);
      prompt = `(${a} + ${b}) - ${c} = ?`;
      result = a + b - c;
    } else if (roll < 0.56) {
      const a = randInt(12, 36);
      const b = randInt(8, 24);
      const c = randInt(4, 12);
      prompt = `${a} × ${b} - ${c} = ?`;
      result = a * b - c;
    } else if (roll < 0.8) {
      const b = randInt(5, 16);
      const r = randInt(12, 34);
      const a = b * r;
      prompt = `${a} ÷ ${b} = ?`;
      result = r;
    } else {
      const a = randInt(40, 120);
      const b = randInt(10, 40);
      const c = randInt(2, 5);
      prompt = `(${a} - ${b}) × ${c} = ?`;
      result = (a - b) * c;
    }
  }

  const options = uniqueOptions(result, level);
  const correctIndex = Math.max(0, options.findIndex((n) => n === result));
  return { prompt, options, correctIndex, source: "generated" };
}

function pickTask(level: GradeLevel, recentPrompts: string[]): MathTask {
  const teacherPool = TEACHER_BANK[level];
  const preferTeacher = Math.random() < 0.68;
  const sourcePool = preferTeacher ? teacherPool : [];

  if (sourcePool.length > 0) {
    let chosen = sourcePool[Math.floor(Math.random() * sourcePool.length)]!;
    for (let i = 0; i < 8; i++) {
      const candidate = sourcePool[Math.floor(Math.random() * sourcePool.length)]!;
      if (!recentPrompts.includes(candidate.prompt)) {
        chosen = candidate;
        break;
      }
    }
    return chosen;
  }

  return generatedTaskForGrade(level);
}

export default function SpeedQuizMath() {
  const [grade, setGrade] = useState<GradeLevel>(4);
  const [phase, setPhase] = useState<Phase>("menu");
  const [task, setTask] = useState<MathTask>(() => pickTask(4, []));
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS[4]);
  const [questionTimeLeft, setQuestionTimeLeft] = useState(QUESTION_SECONDS[4]);
  const [lives, setLives] = useState(3);
  const [correct, setCorrect] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [totalXp, setTotalXp] = useState(0);
  const [wrongFlash, setWrongFlash] = useState(false);
  const recentPromptsRef = useRef<string[]>([]);
  const scoreSubmittedRef = useRef(false);

  const { data: syncEligibility } = useSyncEligibilityQuery();
  const syncBanner = useMemo(() => gameSyncBannerText(syncEligibility), [syncEligibility]);

  const nextTask = useCallback(() => {
    const next = pickTask(grade, recentPromptsRef.current);
    recentPromptsRef.current = [...recentPromptsRef.current.slice(-5), next.prompt];
    setTask(next);
    setQuestionTimeLeft(QUESTION_SECONDS[grade]);
  }, [grade]);

  const startGame = useCallback(() => {
    scoreSubmittedRef.current = false;
    setLives(3);
    setCorrect(0);
    setAnswered(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setTimeLeft(ROUND_SECONDS[grade]);
    setQuestionTimeLeft(QUESTION_SECONDS[grade]);
    recentPromptsRef.current = [];
    const first = pickTask(grade, []);
    recentPromptsRef.current = [first.prompt];
    setTask(first);
    setPhase("play");
  }, [grade]);

  const endAsLose = useCallback(() => setPhase("over"), []);
  const endAsWin = useCallback(() => setPhase("won"), []);

  useEffect(() => {
    if (phase !== "play") return;
    const id = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          endAsLose();
          return 0;
        }
        return prev - 1;
      });

      setQuestionTimeLeft((prev) => {
        if (prev <= 1) {
          setStreak(0);
          setLives((l) => {
            const next = l - 1;
            if (next <= 0) {
              endAsLose();
              return 0;
            }
            return next;
          });
          nextTask();
          return QUESTION_SECONDS[grade];
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, grade, endAsLose, nextTask]);

  const handleAnswer = (idx: number) => {
    if (phase !== "play") return;
    setAnswered((n) => n + 1);

    if (idx !== task.correctIndex) {
      setWrongFlash(true);
      window.setTimeout(() => setWrongFlash(false), 220);
      setStreak(0);
      setLives((l) => {
        const next = l - 1;
        if (next <= 0) {
          setPhase("over");
          return 0;
        }
        return next;
      });
      setTimeLeft((t) => Math.max(0, t - 1));
      nextTask();
      return;
    }

    const base = grade === 3 ? 30 : grade === 4 ? 36 : 44;
    const speedBonus = Math.max(0, questionTimeLeft - 1) * (grade === 5 ? 4 : 3);
    const comboBonus = streak * 8;
    const add = base + speedBonus + comboBonus;

    setScore((s) => s + add);
    setTotalXp((x) => x + add);
    setStreak((s) => {
      const ns = s + 1;
      setBestStreak((b) => Math.max(b, ns));
      return ns;
    });
    setCorrect((c) => {
      const next = c + 1;
      if (next >= TARGET_CORRECT[grade]) {
        endAsWin();
      } else {
        nextTask();
      }
      return next;
    });
  };

  useEffect(() => {
    if (phase !== "over" && phase !== "won") return;
    if (!syncEligibility?.eligible) return;
    if (scoreSubmittedRef.current) return;
    scoreSubmittedRef.current = true;

    const runSeconds = ROUND_SECONDS[grade] - timeLeft;
    void apiRequest("POST", "/api/games/score", {
      gameId: "speed-quiz-math",
      difficulty: SCORE_DIFFICULTY[grade],
      runXp: score,
      runStreak: bestStreak,
      runSeconds,
    })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["/api/games/leaderboard"] });
      })
      .catch(() => {
        scoreSubmittedRef.current = false;
      });
  }, [phase, syncEligibility, grade, timeLeft, score, bestStreak]);

  const runProgress = Math.max(0, Math.min(100, (timeLeft / ROUND_SECONDS[grade]) * 100));
  const qProgress = Math.max(0, Math.min(100, (questionTimeLeft / QUESTION_SECONDS[grade]) * 100));
  const obbyProgress = Math.max(0, Math.min(100, (correct / TARGET_CORRECT[grade]) * 100));

  return (
    <div
      className="min-h-screen relative overflow-hidden text-white"
      style={{
        background:
          "radial-gradient(circle at 20% 15%, rgba(56,189,248,0.28), transparent 34%), radial-gradient(circle at 82% 9%, rgba(244,114,182,0.3), transparent 38%), linear-gradient(180deg, #090f21 0%, #131a3a 100%)",
      }}
    >
      <main className="relative z-10 max-w-3xl mx-auto px-3 py-3 min-h-screen flex flex-col">
        <header className="flex items-center justify-between gap-2 mb-2">
          <Link href="/games">
            <Button variant="ghost" size="sm" className="text-white/90 hover:bg-white/10 gap-1 -ml-2">
              <ArrowLeft className="w-4 h-4" />
              Játékok
            </Button>
          </Link>
          <div className="flex items-center gap-3 text-xs font-semibold">
            <span className="flex items-center gap-1 text-amber-300">
              <Star className="w-4 h-4" />
              {totalXp}
            </span>
            <span className="flex items-center gap-1 text-orange-300">
              <Flame className="w-4 h-4" />
              {streak}
            </span>
          </div>
        </header>

        <Card className="border border-cyan-300/45 bg-slate-950/88 backdrop-blur-md shadow-[0_16px_50px_rgba(0,0,0,0.48)] flex-1 flex flex-col min-h-0">
          <CardContent className="p-3 flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-2 mb-1">
              <Rocket className="w-5 h-5 text-cyan-300" />
              <h1 className="text-lg font-black tracking-wide">Neon City Tower Obby</h1>
            </div>
            {phase !== "play" && (
              <p className="text-xs text-white/85 mb-2">
                Roblox-hangulatú matek futam neon városi toronyban. Jó válaszra haladsz az obby pályán, rossz válaszra életet vesztesz.
              </p>
            )}
            <p className={`text-[11px] text-cyan-100/95 border border-cyan-700/45 rounded px-2 ${phase === "play" ? "py-1 mb-2" : "py-1.5 mb-3"} bg-slate-900/95`}>
              {syncBanner}
            </p>

            {phase === "menu" && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4 py-6">
                <div className="grid grid-cols-3 gap-2 w-full max-w-xl">
                  {[3, 4, 5].map((g) => (
                    <Button
                      key={g}
                      type="button"
                      className={
                        grade === g
                          ? "bg-gradient-to-r from-cyan-500 to-fuchsia-600 text-white font-bold border border-cyan-100/40 shadow-[0_0_20px_rgba(34,211,238,0.35)]"
                          : "bg-slate-900/95 border border-white/30 text-white hover:bg-slate-800"
                      }
                      onClick={() => setGrade(g as GradeLevel)}
                    >
                      {g}. osztály
                    </Button>
                  ))}
                </div>
                <div className="w-full max-w-xl rounded-xl border border-white/20 bg-slate-900/90 px-3 py-2.5 text-sm text-white/90">
                  Cél: <strong>{TARGET_CORRECT[grade]}</strong> helyes válasz, élet: <strong>3</strong>, szint:{" "}
                  <strong>{LEVEL_LABEL[grade]}</strong>
                </div>
                <Button
                  size="lg"
                  className="bg-gradient-to-r from-cyan-500 via-blue-500 to-fuchsia-600 hover:from-cyan-400 hover:to-fuchsia-500 font-bold text-white px-8 border border-cyan-100/40"
                  onClick={startGame}
                >
                  <Gauge className="w-4 h-4 mr-2" />
                  Obby futam indítása
                </Button>
              </div>
            )}

            {phase === "play" && (
              <div className="flex flex-col gap-2 flex-1 min-h-0">
                <div className="grid grid-cols-4 gap-1.5 text-[11px] font-semibold">
                  <div className="rounded-lg border border-white/20 bg-slate-900/90 px-2 py-1.5">Szint: {LEVEL_LABEL[grade]}</div>
                  <div className="rounded-lg border border-white/20 bg-slate-900/90 px-2 py-1.5">Kör: {timeLeft}s</div>
                  <div className="rounded-lg border border-white/20 bg-slate-900/90 px-2 py-1.5">Kérdés: {questionTimeLeft}s</div>
                  <div className="rounded-lg border border-white/20 bg-slate-900/90 px-2 py-1.5">Pont: {score}</div>
                </div>

                <div className="flex items-center gap-1 text-rose-300 text-xs">
                  {[0, 1, 2].map((i) => (
                    <Heart key={i} className={`w-4 h-4 ${i < lives ? "fill-rose-400 text-rose-300" : "text-white/20"}`} />
                  ))}
                  <span className="ml-2 text-white/70">Életek</span>
                </div>

                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500" style={{ width: `${runProgress}%` }} />
                </div>
                <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-fuchsia-400 to-pink-500" style={{ width: `${qProgress}%` }} />
                </div>

                <div className="rounded-xl border border-cyan-300/45 bg-slate-950/85 p-2">
                  <div className="mb-1 flex items-center justify-between text-[10px] text-white/70">
                    <span>Obby haladás: {correct}/{TARGET_CORRECT[grade]}</span>
                    <span>Kombó: {streak}</span>
                  </div>
                  <div className="relative h-12 rounded-lg border border-white/10 bg-slate-950/70 overflow-hidden">
                    <div className="absolute inset-y-0 left-0 w-full bg-[linear-gradient(90deg,rgba(6,182,212,0.14)_0%,rgba(236,72,153,0.14)_100%)]" />
                    {[...Array(12)].map((_, i) => (
                      <div
                        key={i}
                        className="absolute top-4 h-2.5 w-8 rounded-md border border-cyan-100/20 bg-cyan-300/20"
                        style={{ left: `${4 + i * 8}%` }}
                      />
                    ))}
                    <div
                      className="absolute top-2 transition-all duration-300"
                      style={{ left: `calc(${obbyProgress}% - 12px)` }}
                    >
                      <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-fuchsia-500 to-cyan-400 border border-white/40 shadow-lg" />
                    </div>
                    <div className="absolute right-2 top-1.5 text-[10px] text-amber-200 font-bold">CÉL</div>
                  </div>
                  <div className="mt-1.5 hidden sm:grid grid-cols-3 gap-1.5 text-[10px]">
                    <div className="rounded-md border border-cyan-400/30 bg-cyan-950/40 px-2 py-1 text-cyan-100">Neo Jump</div>
                    <div className="rounded-md border border-fuchsia-400/30 bg-fuchsia-950/40 px-2 py-1 text-fuchsia-100">Laser Gate</div>
                    <div className="rounded-md border border-amber-400/30 bg-amber-950/40 px-2 py-1 text-amber-100">Sky Finish</div>
                  </div>
                </div>

                <div className={`rounded-xl border ${wrongFlash ? "border-rose-400" : "border-cyan-300/45"} bg-slate-950/88 p-2.5 transition-colors`}>
                  <p className="text-[11px] text-white/60 mb-1">Kérdés #{answered + 1}</p>
                  <p className="text-lg sm:text-xl font-black tracking-wide text-cyan-50 leading-tight">{task.prompt}</p>
                  <p className="text-[10px] text-white/55 mt-1">
                    Forrás: {task.source === "teacher" ? "Tanári kérdésbank" : "Generált feladat"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {task.options.map((opt, idx) => (
                    <Button
                      key={`${opt}-${idx}`}
                      className="h-12 text-lg font-black bg-slate-900/95 hover:bg-cyan-700/45 border border-cyan-200/35 text-white shadow-sm"
                      onClick={() => handleAnswer(idx)}
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {(phase === "over" || phase === "won") && (
              <div className="flex-1 flex flex-col justify-center items-center text-center gap-3 py-8">
                {phase === "won" ? (
                  <Trophy className="w-14 h-14 text-amber-300" />
                ) : (
                  <Gauge className="w-14 h-14 text-rose-300" />
                )}
                <p className="text-xl font-bold">{phase === "won" ? "Célba értél az obby pályán!" : "Vége a futamnak"}</p>
                <p className="text-sm text-white/80">
                  Pont: <strong className="text-amber-300">{score}</strong> · Helyes: <strong>{correct}</strong> · Kombó:{" "}
                  <strong>{bestStreak}</strong>
                </p>
                {syncEligibility?.eligible ? (
                  <p className="text-xs text-emerald-300/90">Eredmény elküldve a felhő ranglistára.</p>
                ) : (
                  <p className="text-xs text-white/60 max-w-xs">{syncBanner}</p>
                )}
                <div className="flex gap-2">
                  <Button className="bg-cyan-600 hover:bg-cyan-500" onClick={startGame}>
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Új futam
                  </Button>
                  <Link href="/games">
                    <Button variant="outline" className="border-white/30 text-white">
                      Lista
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
