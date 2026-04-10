import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Flame, Gauge, Heart, Rocket, RotateCcw, Star, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import GamePedagogyPanel from "@/components/GamePedagogyPanel";
import GameNextGoalBar from "@/components/GameNextGoalBar";
import { gameSyncBannerText, useSyncEligibilityQuery } from "@/hooks/useGameScoreSync";

type GradeLevel = 3 | 4 | 5;
type Phase = "menu" | "play" | "over" | "won";

type MathTask = {
  prompt: string;
  options: number[];
  correctIndex: number;
  source: "teacher" | "generated";
};
type AnswerState = "idle" | "correct" | "wrong";

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
  return Array.from(set).sort(() => Math.random() - 0.5);
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
    { prompt: "Peti 14 matricát ragasztott a füzetére, majd kapott még 8-at. Hány matrica van most összesen?", options: [20, 21, 22, 23], correctIndex: 2, source: "teacher" },
    { prompt: "Az asztalon 16 színes ceruha volt (köztük 4 törött). A törötteket félretették. Hány egész ceruha maradt az asztalon?", options: [10, 11, 12, 13], correctIndex: 2, source: "teacher" },
    { prompt: "3 polcon polconként 7 könyv áll. Hány könyv van összesen a három polcon?", options: [18, 19, 20, 21], correctIndex: 3, source: "teacher" },
    { prompt: "Egy dobozban 20 db kréta volt. 6-ot elhasználtak. Mennyi maradt?", options: [12, 13, 14, 15], correctIndex: 2, source: "teacher" },
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
    { prompt: "A kiránduláson 156 fényképet készítettek hétfőn és 89-et kedden. Hány kép készült összesen?", options: [235, 245, 255, 265], correctIndex: 1, source: "teacher" },
    { prompt: "Egy táskában 8 csomag ragasztólap van, mindegyikben 12 lap. Hány lap van összesen?", options: [84, 92, 96, 104], correctIndex: 2, source: "teacher" },
    { prompt: "A medence hossza 25 m. Anna kétszer oda-vissza úszik (oda és vissza = egy oda-vissza pár). Hány métert úszik összesen?", options: [50, 75, 100, 125], correctIndex: 2, source: "teacher" },
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
    { prompt: "Egy projekthez 144 lapot nyomtattak, ebből 37-et már összefűztek. Hány lap maradt még?", options: [105, 107, 109, 111], correctIndex: 1, source: "teacher" },
    { prompt: "15 diák mindegyike 8 pontot szerzett a feleletválaszos körben. Hány pont az összesen?", options: [110, 115, 120, 125], correctIndex: 2, source: "teacher" },
    { prompt: "Egy tábori versenyen 2,5 km-t kellett futni. Zoli már lefutotta 0,8 km-t. Hány km van még hátra?", options: [1.5, 1.6, 1.7, 1.8], correctIndex: 2, source: "teacher" },
  ],
};

function generatedTaskForGrade(level: GradeLevel): MathTask {
  const roll = Math.random();
  let prompt: string | null = null;
  let result: number | null = null;

  if (level === 3) {
    if (roll < 0.4) {
      const a = randInt(8, 90);
      const b = randInt(4, 35);
      prompt = `${a} + ${b} = ?`;
      result = a + b;
    } else if (roll < 0.7) {
      const a = randInt(25, 100);
      const b = randInt(3, 24);
      prompt = `${a} - ${b} = ?`;
      result = a - b;
    } else if (roll < 0.84) {
      const a = randInt(2, 9);
      const b = randInt(2, 9);
      prompt = `${a} × ${b} = ?`;
      result = a * b;
    } else {
      const a = randInt(6, 22);
      const b = randInt(4, 18);
      prompt = `Dóri ${a} matricát ragasztott a füzetére, majd kapott még ${b}-et. Hány matrica van most összesen?`;
      result = a + b;
    }
  } else if (level === 4) {
    if (roll < 0.3) {
      const a = randInt(120, 780);
      const b = randInt(45, 260);
      prompt = `${a} + ${b} = ?`;
      result = a + b;
    } else if (roll < 0.55) {
      const a = randInt(300, 950);
      const b = randInt(80, 290);
      prompt = `${a} - ${b} = ?`;
      result = a - b;
    } else if (roll < 0.72) {
      const a = randInt(4, 12);
      const b = randInt(6, 19);
      prompt = `${a} × ${b} = ?`;
      result = a * b;
    } else if (roll < 0.86) {
      const b = randInt(3, 12);
      const r = randInt(4, 18);
      const a = b * r;
      prompt = `${a} ÷ ${b} = ?`;
      result = r;
    } else {
      const rows = randInt(3, 6);
      const each = randInt(6, 14);
      prompt = `${rows} polcon polconként ${each} könyv áll (minden polcon ugyanannyi). Hány könyv van összesen?`;
      result = rows * each;
    }
  } else {
    if (roll < 0.26) {
      const a = randInt(230, 980);
      const b = randInt(120, 760);
      const c = randInt(10, 90);
      prompt = `(${a} + ${b}) - ${c} = ?`;
      result = a + b - c;
    } else if (roll < 0.48) {
      const a = randInt(12, 36);
      const b = randInt(8, 24);
      const c = randInt(4, 12);
      prompt = `${a} × ${b} - ${c} = ?`;
      result = a * b - c;
    } else if (roll < 0.66) {
      const b = randInt(5, 16);
      const r = randInt(12, 34);
      const a = b * r;
      prompt = `${a} ÷ ${b} = ?`;
      result = r;
    } else if (roll < 0.78) {
      const a = randInt(40, 120);
      const b = randInt(10, 40);
      const c = randInt(2, 5);
      prompt = `(${a} - ${b}) × ${c} = ?`;
      result = (a - b) * c;
    } else {
      const n = randInt(8, 14);
      const p = randInt(6, 12);
      prompt = `${n} csapat mindegyike ${p} pontot szerzett ugyanazon a fordulón. Mennyi a pontok összege?`;
      result = n * p;
    }
  }

  // Defensive fallback; should not happen with the grade branches above.
  if (prompt == null || result == null) {
    prompt = "12 + 8 = ?";
    result = 20;
  }
  const options = uniqueOptions(result, level);
  const correctIndex = Math.max(0, options.findIndex((n) => n === result));
  return { prompt, options, correctIndex, source: "generated" };
}

function isMathTask(task: MathTask): boolean {
  const hasNumericPrompt = /\d/.test(task.prompt);
  const hasFourOptions = task.options.length === 4;
  const optionsAreNumbers = task.options.every((n) => Number.isFinite(n));
  const validCorrect = task.correctIndex >= 0 && task.correctIndex < task.options.length;
  return hasNumericPrompt && hasFourOptions && optionsAreNumbers && validCorrect;
}

function pickTask(level: GradeLevel, recentPrompts: string[]): MathTask {
  const teacherPool = TEACHER_BANK[level].filter(isMathTask);
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

  const generated = generatedTaskForGrade(level);
  return isMathTask(generated) ? generated : generatedTaskForGrade(level);
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
  const [answerState, setAnswerState] = useState<AnswerState>("idle");
  const recentPromptsRef = useRef<string[]>([]);
  const scoreSubmittedRef = useRef(false);

  const { data: syncEligibility } = useSyncEligibilityQuery();
  const syncBanner = useMemo(() => gameSyncBannerText(syncEligibility), [syncEligibility]);

  const nextTask = useCallback(() => {
    const next = pickTask(grade, recentPromptsRef.current);
    recentPromptsRef.current = [...recentPromptsRef.current.slice(-5), next.prompt];
    setTask(next);
    setQuestionTimeLeft(QUESTION_SECONDS[grade]);
    setAnswerState("idle");
  }, [grade]);

  const startGame = useCallback(() => {
    scoreSubmittedRef.current = false;
    setLives(3);
    setCorrect(0);
    setAnswered(0);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setWrongFlash(false);
    setAnswerState("idle");
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
      setAnswerState("wrong");
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
      window.setTimeout(nextTask, 140);
      return;
    }

    setAnswerState("correct");
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
        window.setTimeout(nextTask, 120);
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
      <main className="relative z-10 w-full max-w-3xl xl:max-w-4xl mx-auto px-3 sm:px-5 py-3 min-h-dvh min-h-screen flex flex-col pb-8 sm:pb-10">
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
              <h1 className="text-lg font-black tracking-wide">Neon matek torony</h1>
            </div>
            {phase !== "play" && (
              <GamePedagogyPanel
                accent="cyan"
                className="mb-2"
                kidMission={`Válaszolj gyorsan és jól (${grade}. osztály szint)! Minden helyes válasz közelebb visz a torony tetejéhez a pályán. Van 3 életed — rossz válasz egy szívecskét elvesz. A láng = sorozat: minél több jó válasz egymás után, annál nagyobb a pontszorzó érzése.`}
                parentBody={
                  <>
                    <strong className="text-cyan-100/90">Tananyag:</strong> műveletek és számolás a választott évfolyamnak megfelelően (tanári bank + generált feladatok).
                    <br />
                    <strong className="text-cyan-100/90">Fejleszt:</strong> számolási sebesség, önellenőrzés, hibatűrés (életek után is folytatható kör).
                    <br />
                    <span className="text-white/55">
                      A kettős idő (kör + kérdés) és a vizuális „lépkedés” a cél felé ugyanazt a motivációs mintát követi, mint a rövid tesztekkel tarkított gyakorló appok: gyors visszajelzés, világos cél.
                    </span>
                  </>
                }
              />
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
                <div className="w-full max-w-xl rounded-xl border border-amber-400/35 bg-gradient-to-r from-amber-500/10 to-fuchsia-500/10 px-3 py-2.5 text-sm text-white/90">
                  <span className="font-bold text-amber-200">A pálya célja:</span>{" "}
                  <strong>{TARGET_CORRECT[grade]}</strong> helyes válasz a torony tetejéig · <strong>3</strong> szív =
                  három hibalehetőség · szint: <strong>{LEVEL_LABEL[grade]}</strong>
                </div>
                <Button
                  type="button"
                  size="lg"
                  className="bg-gradient-to-r from-cyan-500 via-blue-500 to-fuchsia-600 hover:from-cyan-400 hover:to-fuchsia-500 font-bold text-white px-8 border border-cyan-100/40 text-base"
                  onClick={startGame}
                >
                  <Gauge className="w-4 h-4 mr-2" />
                  Indul a torony — rajta!
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

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center gap-1 text-rose-300">
                    {[0, 1, 2].map((i) => (
                      <Heart key={i} className={`w-4 h-4 ${i < lives ? "fill-rose-400 text-rose-300" : "text-white/20"}`} />
                    ))}
                    <span className="ml-1 text-white/75 font-semibold">Életek (akadály)</span>
                  </div>
                  <span className="rounded-full border border-orange-400/40 bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-200">
                    Kombó = sorozat · minél több jó válasz egymás után, annál menőbb
                  </span>
                </div>

                <GameNextGoalBar
                  accent="fuchsia"
                  headline={
                    correct >= TARGET_CORRECT[grade]
                      ? "Megvan a torony teteje — még gyűjts pontot, amíg tart a kör!"
                      : `${TARGET_CORRECT[grade] - correct} helyes válasz még a célhoz`
                  }
                  subtitle={`${LEVEL_LABEL[grade]} · ${timeLeft}s a körből · ${lives} élet · kombó: ${streak}`}
                  current={correct}
                  target={TARGET_CORRECT[grade]}
                  className="w-full"
                />

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

                <div
                  className={`rounded-xl border ${
                    answerState === "correct"
                      ? "border-emerald-400"
                      : wrongFlash || answerState === "wrong"
                        ? "border-rose-400"
                        : "border-cyan-300/45"
                  } bg-slate-950/88 p-2.5 transition-colors`}
                >
                  <p className="text-[11px] text-white/60 mb-1">
                    Gyors teszt #{answered + 1} — válaszd ki a helyest (fent a kérdés-idő sáv)
                  </p>
                  <p className="text-lg sm:text-xl font-black tracking-wide text-cyan-50 leading-tight">{task.prompt}</p>
                  <p className="text-[10px] text-white/55 mt-1">
                    Forrás: {task.source === "teacher" ? "Tanári kérdésbank" : "Generált feladat"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {task.options.map((opt, idx) => (
                    <Button
                      key={`${opt}-${idx}`}
                      type="button"
                      className={`h-12 text-lg font-black border text-white shadow-sm transition-colors ${
                        answerState === "correct"
                          ? "bg-emerald-700/40 border-emerald-200/40 hover:bg-emerald-600/45"
                          : wrongFlash || answerState === "wrong"
                            ? "bg-rose-900/35 border-rose-200/40 hover:bg-rose-800/45"
                            : "bg-slate-900/95 hover:bg-cyan-700/45 border-cyan-200/35"
                      }`}
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
                <p className="text-xl font-bold">{phase === "won" ? "Célba értél a neon toronyban!" : "Vége a futamnak"}</p>
                {phase === "won" && (
                  <p className="text-sm font-semibold text-cyan-100/90 max-w-sm">
                    Annyi helyes matektesztet raktál össze, hogy a pálya tetejére értél — ügyes vagy, ez a fő jutalom!
                  </p>
                )}
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
                  <Button type="button" className="bg-cyan-600 hover:bg-cyan-500" onClick={startGame}>
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
