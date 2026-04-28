import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { ArrowLeft, Brain, Star, Flame, RotateCcw, Zap, Trophy, ShieldAlert } from "lucide-react";
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
import { useStreakProtector } from "@/hooks/useStreakProtector";
import { sfxSuccess, sfxError, sfxLevelUp, sfxWarning } from "@/lib/audioEngine";
import { recordRun, type Achievement } from "@/lib/achievements";
import { isTodaysGameAvailable, markDailyCompleted } from "@/lib/dailyChallenge";
import AchievementToast from "@/components/AchievementToast";

/* --- Típusok --- */
type Quiz = { prompt: string; options: string[]; correctIndex: number; category: "english" | "math" | "hungarian" };

type BrainRot = {
  id: number;
  emoji: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  rotSpeed: number;
  xpValue: number;
  spawnTime: number;
  caught: boolean;
  escaping: boolean;
  pulsePhase: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  emoji?: string;
};

type FloatingText = {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
};

type Phase = "menu" | "play" | "quiz" | "over";

/* --- Konstansok --- */
const ROUND_LIMIT = 90;
const STREAK_GOAL = 7;
const SPAWN_INTERVAL_BASE = 2200;
const SPAWN_INTERVAL_MIN = 900;
const BRAIN_ROT_LIFETIME = 6000;
const MAX_BRAIN_ROTS = 8;

const BRAIN_ROT_EMOJIS = [
  { emoji: "\u{1F9E0}", name: "Agy", xp: 30 },
  { emoji: "\u{1F92F}", name: "Felrobbanó fej", xp: 40 },
  { emoji: "\u{1F480}", name: "Koponya", xp: 35 },
  { emoji: "\u{1F47E}", name: "Űrlény", xp: 50 },
  { emoji: "\u{1F916}", name: "Robot", xp: 45 },
  { emoji: "\u{1F47B}", name: "Szellem", xp: 55 },
  { emoji: "\u{1F9A0}", name: "Vírus", xp: 60 },
  { emoji: "\u{1F300}", name: "Örvény", xp: 70 },
  { emoji: "\u{1F4AB}", name: "Csillag", xp: 65 },
  { emoji: "\u{1F52E}", name: "Kristálygömb", xp: 80 },
  { emoji: "\u{1F3AD}", name: "Maszk", xp: 45 },
  { emoji: "\u{1F9FF}", name: "Nazar szem", xp: 75 },
  { emoji: "\u26A1", name: "Villám", xp: 55 },
];

/* --- Quiz bank --- */

const ENGLISH_QUIZZES: Quiz[] = [
  { prompt: "\"Dog\" magyarul:", options: ["macska", "kutya", "madár", "hal"], correctIndex: 1, category: "english" },
  { prompt: "\"Cat\" magyarul:", options: ["kutya", "macska", "nyúl", "egér"], correctIndex: 1, category: "english" },
  { prompt: "\"Apple\" magyarul:", options: ["körte", "szőlő", "alma", "barack"], correctIndex: 2, category: "english" },
  { prompt: "\"Sun\" magyarul:", options: ["hold", "csillag", "felhő", "nap"], correctIndex: 3, category: "english" },
  { prompt: "\"Tree\" magyarul:", options: ["virág", "fa", "bokor", "fű"], correctIndex: 1, category: "english" },
  { prompt: "\"Water\" magyarul:", options: ["tej", "víz", "lé", "üdítő"], correctIndex: 1, category: "english" },
  { prompt: "\"House\" magyarul:", options: ["ház", "lakás", "szoba", "kert"], correctIndex: 0, category: "english" },
  { prompt: "\"School\" magyarul:", options: ["bolt", "könyvtár", "iskola", "kórház"], correctIndex: 2, category: "english" },
  { prompt: "\"Happy\" magyarul:", options: ["szomorú", "boldog", "fáradt", "mérges"], correctIndex: 1, category: "english" },
  { prompt: "\"Big\" magyarul:", options: ["kicsi", "nagy", "hosszú", "rövid"], correctIndex: 1, category: "english" },
  { prompt: "Melyik a helyes: I ___ a student.", options: ["am", "is", "are", "be"], correctIndex: 0, category: "english" },
  { prompt: "Melyik a helyes: She ___ books.", options: ["read", "reads", "reading", "readed"], correctIndex: 1, category: "english" },
  { prompt: "\"Red\" magyarul:", options: ["kék", "zöld", "piros", "sárga"], correctIndex: 2, category: "english" },
  { prompt: "\"Blue\" magyarul:", options: ["kék", "zöld", "piros", "fehér"], correctIndex: 0, category: "english" },
  { prompt: "\"Monday\" magyarul:", options: ["kedd", "hétfő", "szerda", "csütörtök"], correctIndex: 1, category: "english" },
  { prompt: "\"Brother\" magyarul:", options: ["nővér", "testvér", "fivér", "húg"], correctIndex: 2, category: "english" },
  { prompt: "Mit jelent: Good morning!", options: ["Jó éjszakát!", "Jó napot!", "Jó reggelt!", "Viszlát!"], correctIndex: 2, category: "english" },
  { prompt: "\"Flower\" magyarul:", options: ["fa", "virág", "levél", "gyökér"], correctIndex: 1, category: "english" },
  { prompt: "Egészítsd ki: They ___ playing.", options: ["is", "am", "are", "be"], correctIndex: 2, category: "english" },
  { prompt: "\"Fish\" magyarul:", options: ["madár", "hal", "béka", "kígyó"], correctIndex: 1, category: "english" },
  { prompt: "\"Green\" magyarul:", options: ["piros", "kék", "zöld", "sárga"], correctIndex: 2, category: "english" },
  { prompt: "\"Kitchen\" magyarul:", options: ["hálószoba", "nappali", "konyha", "fürdőszoba"], correctIndex: 2, category: "english" },
  { prompt: "\"Rain\" magyarul:", options: ["hó", "szél", "nap", "eső"], correctIndex: 3, category: "english" },
  { prompt: "\"Pencil\" magyarul:", options: ["toll", "ceruza", "radír", "vonalzó"], correctIndex: 1, category: "english" },
  { prompt: "Melyik illik: He ___ to school every day.", options: ["go", "goes", "going", "goed"], correctIndex: 1, category: "english" },
];

const MATH_QUIZZES: Quiz[] = [
  { prompt: "12 + 8 = ?", options: ["18", "20", "22", "19"], correctIndex: 1, category: "math" },
  { prompt: "7 x 6 = ?", options: ["36", "42", "48", "35"], correctIndex: 1, category: "math" },
  { prompt: "56 / 8 = ?", options: ["6", "7", "8", "9"], correctIndex: 1, category: "math" },
  { prompt: "15 + 27 = ?", options: ["42", "41", "43", "40"], correctIndex: 0, category: "math" },
  { prompt: "9 x 9 = ?", options: ["72", "81", "90", "79"], correctIndex: 1, category: "math" },
  { prompt: "100 - 37 = ?", options: ["63", "67", "73", "57"], correctIndex: 0, category: "math" },
  { prompt: "8 x 7 = ?", options: ["54", "56", "49", "63"], correctIndex: 1, category: "math" },
  { prompt: "144 / 12 = ?", options: ["11", "12", "13", "14"], correctIndex: 1, category: "math" },
  { prompt: "25 + 38 = ?", options: ["53", "63", "62", "64"], correctIndex: 1, category: "math" },
  { prompt: "6 x 12 = ?", options: ["66", "72", "78", "60"], correctIndex: 1, category: "math" },
  { prompt: "Mi a geometriai test neve, ha 6 négyzet határolja?", options: ["gömb", "kocka", "henger", "kúp"], correctIndex: 1, category: "math" },
  { prompt: "Melyik szám a legnagyobb: 398, 389, 399, 390?", options: ["398", "389", "399", "390"], correctIndex: 2, category: "math" },
  { prompt: "Mennyi a téglalap kerülete, ha a = 5 cm, b = 3 cm?", options: ["16 cm", "15 cm", "8 cm", "30 cm"], correctIndex: 0, category: "math" },
  { prompt: "200 - 86 = ?", options: ["124", "116", "114", "104"], correctIndex: 2, category: "math" },
  { prompt: "Mi az 50 fele?", options: ["20", "30", "15", "25"], correctIndex: 3, category: "math" },
  { prompt: "11 x 11 = ?", options: ["111", "121", "110", "131"], correctIndex: 1, category: "math" },
  { prompt: "Hány perc van 1 órában?", options: ["30", "45", "60", "90"], correctIndex: 2, category: "math" },
  { prompt: "Melyik a páratlan szám?", options: ["12", "18", "23", "30"], correctIndex: 2, category: "math" },
  { prompt: "Mi a 3/4 tizedestörtje?", options: ["0,34", "0,75", "0,43", "0,7"], correctIndex: 1, category: "math" },
  { prompt: "5 négyzeten = ?", options: ["10", "15", "20", "25"], correctIndex: 3, category: "math" },
  { prompt: "Mennyi a négyzet területe, ha az oldala 4 cm?", options: ["8 cm²", "12 cm²", "16 cm²", "20 cm²"], correctIndex: 2, category: "math" },
  { prompt: "1000 / 10 = ?", options: ["10", "100", "1000", "1"], correctIndex: 1, category: "math" },
  { prompt: "Mennyi 3 x 15?", options: ["30", "35", "45", "55"], correctIndex: 2, category: "math" },
  { prompt: "Mi a következő szám: 2, 4, 8, 16, ...?", options: ["20", "24", "28", "32"], correctIndex: 3, category: "math" },
  { prompt: "Hány cm 1 méter?", options: ["10", "100", "1000", "50"], correctIndex: 1, category: "math" },
];

const HUNGARIAN_QUIZZES: Quiz[] = [
  { prompt: "Melyik az igekötős ige?", options: ["szép", "megírta", "kutya", "magas"], correctIndex: 1, category: "hungarian" },
  { prompt: "Hány magánhangzó van a Magyarország szóban?", options: ["4", "5", "6", "7"], correctIndex: 1, category: "hungarian" },
  { prompt: "Melyik szó melléknév?", options: ["fut", "szép", "asztal", "boldogan"], correctIndex: 1, category: "hungarian" },
  { prompt: "Mi a \"kutya\" szó többes száma?", options: ["kutyák", "kutyák", "kutyás", "kutyái"], correctIndex: 0, category: "hungarian" },
  { prompt: "Melyik a helyes: Holnap ___ iskolába.", options: ["megyünk", "menünk", "menünk", "mennyünk"], correctIndex: 0, category: "hungarian" },
  { prompt: "Melyik szó főnév?", options: ["fut", "szép", "asztal", "gyorsan"], correctIndex: 2, category: "hungarian" },
  { prompt: "Melyik mondat helyes?", options: ["A kutya szalad.", "A kutya szalat.", "A kutya szalatt.", "A kutya szaland."], correctIndex: 0, category: "hungarian" },
  { prompt: "Mi az \"ly\" hang a \"mély\" szóban?", options: ["j hang", "l hang", "ny hang", "jj hang"], correctIndex: 0, category: "hungarian" },
  { prompt: "Hány mássalhangzó van az \"iskola\" szóban?", options: ["2", "3", "4", "1"], correctIndex: 1, category: "hungarian" },
  { prompt: "Melyik a határozószó?", options: ["kutya", "szép", "gyorsan", "ír"], correctIndex: 2, category: "hungarian" },
  { prompt: "Melyik írásjelezés helyes?", options: ["Hol van a könyv?", "Hol van a könyv.", "Hol, van a könyv?", "Hol van, a könyv."], correctIndex: 0, category: "hungarian" },
  { prompt: "Mi az \"alma\" szó ragozott alakja: alma___?", options: ["-t", "-k", "-nak", "-ban"], correctIndex: 0, category: "hungarian" },
  { prompt: "Melyik a helyes: \"ott\" vagy \"ot\"?", options: ["ott", "ot", "ottt", "mindkettő jó"], correctIndex: 0, category: "hungarian" },
  { prompt: "Melyik kétjegyű msh jelölés helyes?", options: ["ly", "lj", "lly", "ljj"], correctIndex: 0, category: "hungarian" },
  { prompt: "Mi a \"tanár\" szó többes száma?", options: ["tanárok", "tanárk", "tanárak", "tanárják"], correctIndex: 0, category: "hungarian" },
  { prompt: "Melyik szó tartalmaz hosszú magánhangzót?", options: ["hal", "fal", "hál (hosszú á-val)", "kal"], correctIndex: 2, category: "hungarian" },
  { prompt: "Melyik szóban van \"j\" hang, de \"ly\"-t írunk?", options: ["játék", "hely", "jég", "jobb"], correctIndex: 1, category: "hungarian" },
  { prompt: "Mi a \"könyv\" szó tárgyragos alakja?", options: ["könyvet", "könyvöt", "könyvat", "könyved"], correctIndex: 0, category: "hungarian" },
  { prompt: "Egészítsd ki: A gyerekek ___ a parkban.", options: ["játszanak", "játsznak", "jácanak", "játszanak (helyes)"], correctIndex: 0, category: "hungarian" },
  { prompt: "Melyik szóban van kétjegyű mássalhangzó?", options: ["anya", "alma", "apa", "ág"], correctIndex: 0, category: "hungarian" },
  { prompt: "Mi az ige a mondatban: A macska alszik.?", options: ["macska", "A", "alszik", "mondatban"], correctIndex: 2, category: "hungarian" },
  { prompt: "Melyik szó szinonímája a \"boldog\"-nak?", options: ["szomorú", "vidám", "mérges", "fáradt"], correctIndex: 1, category: "hungarian" },
  { prompt: "Melyik a helyes: \"szebb\" vagy \"szépebb\"?", options: ["szebb", "szépebb", "szépbb", "mind jó"], correctIndex: 0, category: "hungarian" },
  { prompt: "Hol van a \"j\" hang: gólya vagy díj?", options: ["csak gólyában", "csak díjban", "mindkettőben", "egyikben sem"], correctIndex: 2, category: "hungarian" },
  { prompt: "Melyik a mondatrész: A ház nagy.?", options: ["alany: ház, állítmány: nagy", "alany: A, állítmány: ház", "tárgy: nagy, alany: A", "nincs állítmány"], correctIndex: 0, category: "hungarian" },
];

const ALL_QUIZZES = [...ENGLISH_QUIZZES, ...MATH_QUIZZES, ...HUNGARIAN_QUIZZES];

const CATEGORY_LABELS: Record<Quiz["category"], { label: string; color: string; icon: string }> = {
  english: { label: "Angol", color: "text-cyan-300", icon: "\u{1F1EC}\u{1F1E7}" },
  math: { label: "Matek", color: "text-amber-300", icon: "\u{1F522}" },
  hungarian: { label: "Magyar nyelvtan", color: "text-emerald-300", icon: "\u{1F4DD}" },
};

const CATEGORY_BORDERS: Record<Quiz["category"], string> = {
  english: "border-cyan-500/50",
  math: "border-amber-500/50",
  hungarian: "border-emerald-500/50",
};

/* --- Segédfüggvények --- */
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

let nextId = 0;

function spawnBrainRot(boardW: number, boardH: number): BrainRot {
  const template = pickRandom(BRAIN_ROT_EMOJIS);
  const size = randInt(40, 70);
  const x = randInt(size, boardW - size);
  const y = randInt(size, boardH - size);
  const speed = 0.3 + Math.random() * 1.2;
  const angle = Math.random() * Math.PI * 2;
  return {
    id: nextId++,
    emoji: template.emoji,
    name: template.name,
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    size,
    rotation: Math.random() * 360,
    rotSpeed: (Math.random() - 0.5) * 4,
    xpValue: template.xp,
    spawnTime: Date.now(),
    caught: false,
    escaping: false,
    pulsePhase: Math.random() * Math.PI * 2,
  };
}

/* --- Fo komponens --- */
export default function BrainRotSteal() {
  const boardRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("menu");
  const [brainRots, setBrainRots] = useState<BrainRot[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [caughtRot, setCaughtRot] = useState<BrainRot | null>(null);
  const [wrongShake, setWrongShake] = useState(false);
  const [revealCorrectIdx, setRevealCorrectIdx] = useState<number | null>(null);
  const [wrongIdx, setWrongIdx] = useState<number | null>(null);
  const streakProtector = useStreakProtector();
  const [sessionXp, setSessionXp] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [totalCaught, setTotalCaught] = useState(0);
  const [totalMissed, setTotalMissed] = useState(0);
  const [timeLeft, setTimeLeft] = useState(ROUND_LIMIT);
  const [runSeconds, setRunSeconds] = useState(0);
  const [comboMultiplier, setComboMultiplier] = useState(1);
  const [screenFlash, setScreenFlash] = useState<string | null>(null);
  const scoreSubmittedRef = useRef(false);
  const lastSpawnRef = useRef(0);
  const animRef = useRef(0);
  const floatIdRef = useRef(0);

  const { data: syncEligibility } = useSyncEligibilityQuery();
  const syncBanner = useMemo(() => gameSyncBannerText(syncEligibility), [syncEligibility]);

  // Tananyag-kvíz: a játékos osztályának legutóbbi 3 anyagából (Claude-generált).
  const { grade: userGrade } = useClassroomGrade();
  const { items: materialItems } = useMaterialQuizzes(userGrade);

  /* --- Quiz valasztas --- */
  const fullQuizPool = useMemo(() => {
    const matMapped: Quiz[] = materialItems
      .filter((q) => Array.isArray(q.options) && q.options.length === 4)
      .map((q) => {
        const t = (q.topic ?? "").toLowerCase();
        const cat: Quiz["category"] = t === "math" ? "math" : t === "hungarian" ? "hungarian" : "english";
        return {
          prompt: q.prompt,
          options: q.options.slice(0, 4),
          correctIndex: q.correctIndex,
          category: cat,
        };
      });
    return [...matMapped, ...ALL_QUIZZES];
  }, [materialItems]);

  const pickQuiz = useCallback((): Quiz => {
    return pickRandom(fullQuizPool);
  }, [fullQuizPool]);

  /* --- Reszecskek --- */
  const spawnParticles = useCallback((x: number, y: number, color: string, count: number, emoji?: string) => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      newParticles.push({
        x: x + randInt(-10, 10),
        y: y + randInt(-10, 10),
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8 - 3,
        life: 0.6 + Math.random() * 0.8,
        maxLife: 0.6 + Math.random() * 0.8,
        color,
        size: 3 + Math.random() * 6,
        emoji: emoji && Math.random() > 0.5 ? emoji : undefined,
      });
    }
    setParticles((prev) => [...prev, ...newParticles].slice(-80));
  }, []);

  /* --- Lebego szoveg --- */
  const addFloatingText = useCallback((x: number, y: number, text: string, color: string) => {
    const id = floatIdRef.current++;
    setFloatingTexts((prev) => [...prev, { id, x, y, text, color, life: 1.5 }]);
  }, []);

  /* --- Brain rot elkap --- */
  const handleCatchBrainRot = useCallback(
    (rot: BrainRot) => {
      if (phase !== "play" || rot.caught) return;
      setBrainRots((prev) => prev.map((r) => (r.id === rot.id ? { ...r, caught: true } : r)));
      setCaughtRot(rot);
      setQuiz(pickQuiz());
      setPhase("quiz");
    },
    [phase, pickQuiz],
  );

  /* --- Válasz kezelés --- */
  const onAnswer = useCallback(
    (idx: number) => {
      if (!quiz || !caughtRot) return;
      if (revealCorrectIdx !== null) return;

      if (idx !== quiz.correctIndex) {
        sfxError();
        setWrongShake(true);
        setTimeout(() => setWrongShake(false), 400);
        setRevealCorrectIdx(quiz.correctIndex);
        setWrongIdx(idx);
        const outcome = streakProtector.handleWrong({ streak });
        if (outcome === "warned") {
          sfxWarning();
        } else {
          setStreak(0);
          setComboMultiplier(1);
        }
        // 1.5s reveal után a quiz "elnyel" — a brain rot fennmarad, új próba
        window.setTimeout(() => {
          setRevealCorrectIdx(null);
          setWrongIdx(null);
        }, 1500);
        return;
      }

      // Helyes válasz!
      sfxSuccess();
      setRevealCorrectIdx(null);
      setWrongIdx(null);
      const multiplier = comboMultiplier;
      const xpGain = Math.round(caughtRot.xpValue * multiplier);
      setSessionXp((x) => x + xpGain);
      setStreak((s) => {
        const newStreak = s + 1;
        setBestStreak((bs) => Math.max(bs, newStreak));
        return newStreak;
      });
      setTotalCaught((c) => c + 1);
      setComboMultiplier((m) => Math.min(4, m + 0.25));

      // Vizuális visszajelzés
      spawnParticles(caughtRot.x, caughtRot.y, "#fbbf24", 20, "\u2B50");
      addFloatingText(caughtRot.x, caughtRot.y - 30, `+${xpGain} XP`, "#fbbf24");

      if (multiplier >= 2) {
        sfxLevelUp();
        setScreenFlash("rgba(251, 191, 36, 0.15)");
        setTimeout(() => setScreenFlash(null), 300);
      }

      // Brain rot törlése
      setBrainRots((prev) => prev.filter((r) => r.id !== caughtRot.id));
      setCaughtRot(null);
      setQuiz(null);
      setPhase("play");
    },
    [quiz, caughtRot, comboMultiplier, spawnParticles, addFloatingText, revealCorrectIdx, streak, streakProtector],
  );

  /* --- Játék indítása --- */
  const startGame = useCallback(() => {
    scoreSubmittedRef.current = false;
    streakProtector.resetProtector();
    setRevealCorrectIdx(null);
    setWrongIdx(null);
    nextId = 0;
    setBrainRots([]);
    setParticles([]);
    setFloatingTexts([]);
    setSessionXp(0);
    setStreak(0);
    setBestStreak(0);
    setTotalCaught(0);
    setTotalMissed(0);
    setTimeLeft(ROUND_LIMIT);
    setRunSeconds(0);
    setComboMultiplier(1);
    setScreenFlash(null);
    lastSpawnRef.current = 0;
    setPhase("play");
  }, [streakProtector]);

  // R = quick-restart az "over" / "menu" képernyőn.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "r" && e.key !== "R") return;
      if (phase === "over" || phase === "menu") {
        e.preventDefault();
        startGame();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, startGame]);

  /* --- Idozito --- */
  useEffect(() => {
    if (phase !== "play") return;
    const id = setInterval(() => {
      setRunSeconds((s) => s + 1);
      setTimeLeft((t) => {
        if (t <= 1) {
          setPhase("over");
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [phase]);

  /* --- Animacio + spawn --- */
  useEffect(() => {
    if (phase !== "play") return;
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const boardEl = boardRef.current;
      const boardW = boardEl?.clientWidth ?? 400;
      const boardH = boardEl?.clientHeight ?? 400;

      // Spawn brain rots
      if (now - lastSpawnRef.current > Math.max(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_BASE - runSeconds * 15)) {
        lastSpawnRef.current = now;
        setBrainRots((prev) => {
          if (prev.filter((r) => !r.caught).length >= MAX_BRAIN_ROTS) return prev;
          return [...prev, spawnBrainRot(boardW, boardH)];
        });
      }

      // Update brain rots
      setBrainRots((prev) => {
        const nowMs = Date.now();
        return prev
          .map((rot) => {
            if (rot.caught) return rot;

            // Check if expired
            if (nowMs - rot.spawnTime > BRAIN_ROT_LIFETIME && !rot.escaping) {
              return { ...rot, escaping: true };
            }

            let { x, y, vx, vy, rotation } = rot;
            const { rotSpeed } = rot;

            // Bounce off walls
            x += vx;
            y += vy;
            if (x < rot.size / 2 || x > boardW - rot.size / 2) vx = -vx;
            if (y < rot.size / 2 || y > boardH - rot.size / 2) vy = -vy;
            x = Math.max(rot.size / 2, Math.min(boardW - rot.size / 2, x));
            y = Math.max(rot.size / 2, Math.min(boardH - rot.size / 2, y));

            rotation += rotSpeed;

            return { ...rot, x, y, vx, vy, rotation };
          })
          .filter((rot) => {
            if (rot.escaping) {
              setTotalMissed((m) => m + 1);
              setStreak(0);
              setComboMultiplier(1);
              return false;
            }
            return true;
          });
      });

      // Update particles
      setParticles((prev) =>
        prev
          .map((p) => ({
            ...p,
            x: p.x + p.vx * dt * 60,
            y: p.y + p.vy * dt * 60,
            vy: p.vy + 5 * dt * 60,
            life: p.life - dt,
          }))
          .filter((p) => p.life > 0),
      );

      // Update floating texts
      setFloatingTexts((prev) =>
        prev
          .map((ft) => ({
            ...ft,
            y: ft.y - 1.5,
            life: ft.life - dt,
          }))
          .filter((ft) => ft.life > 0),
      );

      animRef.current = requestAnimationFrame(loop);
    };

    animRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animRef.current);
  }, [phase, runSeconds]);

  /* --- Eredmény beküldése --- */
  useEffect(() => {
    if (phase !== "over" || !syncEligibility?.eligible || scoreSubmittedRef.current) return;
    scoreSubmittedRef.current = true;
    void apiRequest("POST", "/api/games/score", {
      gameId: "brain-rot-steal",
      difficulty: "normal",
      runXp: sessionXp,
      runStreak: bestStreak,
      runSeconds,
    })
      .then(() => void queryClient.invalidateQueries({ queryKey: ["/api/games/leaderboard"] }))
      .catch(() => {
        scoreSubmittedRef.current = false;
      });
  }, [phase, syncEligibility, sessionXp, bestStreak, runSeconds]);

  // Achievement + Daily — egyszer fut "over" átmenetkor.
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[]>([]);
  const achievementCheckedRef = useRef(false);
  useEffect(() => {
    if (phase !== "over") {
      achievementCheckedRef.current = false;
      return;
    }
    if (achievementCheckedRef.current) return;
    achievementCheckedRef.current = true;
    const wasDailyAvailable = isTodaysGameAvailable("brain-rot-steal");
    const newOnes = recordRun({
      game: "brain-rot-steal",
      xpGained: sessionXp,
      correctAnswers: totalCaught,
      wrongAnswers: totalMissed,
      maxStreak: bestStreak,
      brainRotsCaught: totalCaught,
      maxComboMultiplier: comboMultiplier,
      perfect: totalMissed === 0 && totalCaught >= 5,
    });
    // Daily: ha a játékos legalább 10 brain rot-ot kapott el → "teljesítve".
    if (wasDailyAvailable && totalCaught >= 10) {
      markDailyCompleted();
    }
    if (newOnes.length > 0) setNewlyUnlocked(newOnes);
  }, [phase, sessionXp, totalCaught, totalMissed, bestStreak, comboMultiplier]);

  /* --- Render --- */
  const timePercent = (timeLeft / ROUND_LIMIT) * 100;

  return (
    <div
      className="min-h-screen relative overflow-hidden text-white"
      style={{
        background:
          "radial-gradient(circle at 20% 20%, rgba(147, 51, 234, 0.25), transparent 45%), radial-gradient(circle at 80% 80%, rgba(236, 72, 153, 0.2), transparent 40%), radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.12), transparent 50%), linear-gradient(180deg, #0c0118 0%, #1a0a2e 50%, #0f172a 100%)",
      }}
    >
      <ClassroomGateModal accent="fuchsia" />
      <AchievementToast achievements={newlyUnlocked} />
      {/* Background animated stars */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={`star-${i}`}
            className="absolute rounded-full opacity-20 animate-pulse"
            style={{
              left: `${(i * 3.7 + 11) % 100}%`,
              top: `${(i * 7.3 + 5) % 100}%`,
              width: `${2 + (i % 3) * 2}px`,
              height: `${2 + (i % 3) * 2}px`,
              backgroundColor: ["#a855f7", "#ec4899", "#3b82f6", "#fbbf24"][i % 4],
              animationDelay: `${(i * 0.7) % 5}s`,
              animationDuration: `${2 + (i % 4)}s`,
            }}
          />
        ))}
      </div>

      {/* Screen flash effect */}
      <AnimatePresence>
        {screenFlash && (
          <motion.div
            className="fixed inset-0 z-50 pointer-events-none"
            style={{ backgroundColor: screenFlash }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
        )}
      </AnimatePresence>

      <main className="relative z-10 w-full max-w-xl lg:max-w-3xl mx-auto px-2 sm:px-5 py-2 sm:py-4 min-h-screen flex flex-col pb-20 sm:pb-10">
        <header className="flex items-center justify-between gap-2 mb-2">
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
              {sessionXp}
            </span>
            <span className="flex items-center gap-1 text-orange-300">
              <Flame className="w-4 h-4" />
              {streak}
            </span>
            {comboMultiplier > 1 && (
              <motion.span
                className="flex items-center gap-1 text-yellow-300 bg-yellow-400/15 px-1.5 py-0.5 rounded-md"
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                key={comboMultiplier}
              >
                <Zap className="w-3 h-3" />
                x{comboMultiplier.toFixed(1)}
              </motion.span>
            )}
          </div>
        </header>

        <Card className="border border-purple-400/45 bg-slate-950/85 backdrop-blur-md shadow-[0_16px_48px_rgba(0,0,0,0.45)] flex-1 flex flex-col min-h-0">
          <CardContent className="p-2 sm:p-3 flex flex-col flex-1 min-h-0">
            <div className="flex items-center gap-2 mb-1">
              <Brain className="w-5 h-5 text-purple-400" />
              <h1 className="text-sm sm:text-base font-extrabold bg-gradient-to-r from-purple-300 via-pink-300 to-amber-300 bg-clip-text text-transparent">
                Brain Rot Lopás
              </h1>
            </div>

            {/* Hide pedagogy + mission during active gameplay on mobile to maximize game area */}
            {phase !== "play" && (
              <GamePedagogyPanel
                accent="fuchsia"
                className="mb-2"
                kidMission="Kapd el a Brain Rot-okat, mielőtt eltűnnek! Minden elkapás után kvíz: angol, matek, vagy magyar nyelvtan. Helyes válasz = XP + kombó szorzó! Minél gyorsabb vagy, annál több pont!"
                parentBody={
                  <>
                    <strong className="text-fuchsia-100/90">Tananyag:</strong> angol szókincs (3-5. oszt.), alap matematika
                    (műveletek, mértékegységek, geometria), magyar nyelvtan (szófajok, ragozás, helyesírás).
                    <br />
                    <strong className="text-fuchsia-100/90">Fejleszt:</strong> gyors döntéshozatal, olvasásértés, kéz-szem
                    koordináció, matematikai készségek, magyar nyelvtan.
                    <br />
                    <span className="text-white/55">
                      A lopás motiváció + kvíz + azonnali jutalom (XP, kombó) ciklus tartja fenn a figyelmet.
                    </span>
                  </>
                }
              />
            )}

            <p className="text-[10px] sm:text-[11px] text-purple-100/90 mb-1.5 sm:mb-2 border border-purple-700/45 rounded px-2 py-1 sm:py-1.5 bg-slate-900/95">
              {syncBanner}
            </p>

            {/* --- MENU --- */}
            {phase === "menu" && (
              <div className="flex flex-col items-center justify-center flex-1 gap-4 sm:gap-5 py-4 sm:py-6">
                <motion.div
                  className="text-5xl sm:text-7xl"
                  animate={{
                    rotate: [0, -10, 10, -10, 0],
                    scale: [1, 1.1, 1, 1.1, 1],
                  }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  {"\u{1F9E0}"}
                </motion.div>

                <div className="text-center space-y-2 max-w-sm">
                  <h2 className="text-xl font-extrabold bg-gradient-to-r from-purple-300 via-pink-300 to-amber-200 bg-clip-text text-transparent">
                    Brain Rot Lopás
                  </h2>
                  <p className="text-sm text-white/80">
                    Kapd el a <span className="text-purple-300 font-bold">Brain Rot</span>-okat, amíg el nem tűnnek! {"\u{1F9E0}\u{1F480}\u{1F47E}"}
                  </p>
                  <p className="text-xs text-white/60">
                    Minden elkapás előtt válaszolj angol, matek, vagy magyar kérdésre.
                    Jó válasz = <span className="text-amber-300 font-bold">XP</span> +{" "}
                    <span className="text-yellow-300 font-bold">kombó szorzó</span>!
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-black/40 border border-purple-700/40">
                  <div className="flex flex-col items-center gap-1 text-center">
                    <span className="text-2xl">{"\u{1F1EC}\u{1F1E7}"}</span>
                    <span className="text-[10px] text-cyan-300 font-bold">Angol</span>
                  </div>
                  <div className="flex flex-col items-center gap-1 text-center">
                    <span className="text-2xl">{"\u{1F522}"}</span>
                    <span className="text-[10px] text-amber-300 font-bold">Matek</span>
                  </div>
                  <div className="flex flex-col items-center gap-1 text-center">
                    <span className="text-2xl">{"\u{1F4DD}"}</span>
                    <span className="text-[10px] text-emerald-300 font-bold">Magyar</span>
                  </div>
                </div>

                <Button
                  size="lg"
                  className="bg-gradient-to-r from-purple-600 via-pink-600 to-amber-600 hover:from-purple-500 hover:via-pink-500 hover:to-amber-500 border border-purple-200/35 font-bold text-white shadow-lg shadow-purple-500/25 text-base px-8"
                  onClick={startGame}
                >
                  <Brain className="w-5 h-5 mr-2" />
                  Vadászat indítása!
                </Button>
              </div>
            )}

            {/* --- GAME --- */}
            {phase === "play" && (
              <div className="flex flex-col items-center gap-1.5 sm:gap-2 flex-1">
                <GameNextGoalBar
                  accent="fuchsia"
                  headline={
                    streak >= STREAK_GOAL
                      ? "Szuper sorozat – tartsd így!"
                      : `Gyűjts ${STREAK_GOAL} jó választ egymás után!`
                  }
                  subtitle={`${timeLeft}s | ${totalCaught} elkapva | ${totalMissed} elszökött`}
                  current={Math.min(streak, STREAK_GOAL)}
                  target={STREAK_GOAL}
                  className="w-full"
                />

                {/* Stats */}
                <div className="w-full grid grid-cols-2 gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] font-semibold">
                  <div className="rounded-lg border border-white/20 bg-slate-900/95 px-1.5 sm:px-2 py-1 sm:py-1.5">
                    XP: {sessionXp} | Elkapva: {totalCaught}
                  </div>
                  <div className="rounded-lg border border-white/20 bg-slate-900/95 px-1.5 sm:px-2 py-1 sm:py-1.5 text-right">
                    Idő: {timeLeft}s | Szorzó: x{comboMultiplier.toFixed(1)}
                  </div>
                </div>

                {/* Time bar */}
                <div className="w-full h-2 sm:h-2.5 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background:
                        timePercent > 50
                          ? "linear-gradient(to right, #a855f7, #ec4899)"
                          : timePercent > 25
                            ? "linear-gradient(to right, #f59e0b, #ef4444)"
                            : "linear-gradient(to right, #ef4444, #991b1b)",
                      width: `${timePercent}%`,
                    }}
                    transition={{ duration: 0.3 }}
                  />
                </div>

                {/* Game board */}
                <div
                  ref={boardRef}
                  className="relative w-full rounded-xl sm:rounded-2xl overflow-hidden border-2 border-purple-500/40 shadow-[0_0_40px_rgba(147,51,234,0.2)] bg-gradient-to-br from-slate-900/90 via-purple-950/40 to-slate-900/90 backdrop-blur-sm flex-1"
                  style={{ minHeight: "min(60vh, 420px)", touchAction: "manipulation" }}
                >
                  {/* Grid background */}
                  <div className="absolute inset-0 opacity-[0.04]" style={{
                    backgroundImage: "linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)",
                    backgroundSize: "40px 40px",
                  }} />

                  {/* Brain Rots */}
                  {brainRots
                    .filter((r) => !r.caught)
                    .map((rot) => {
                      const age = (Date.now() - rot.spawnTime) / BRAIN_ROT_LIFETIME;
                      const opacity = age > 0.7 ? 1 - (age - 0.7) / 0.3 : 1;
                      const isWarning = age > 0.6;

                      return (
                        <motion.button
                          key={rot.id}
                          className="absolute flex items-center justify-center cursor-pointer select-none focus:outline-none"
                          style={{
                            left: rot.x - rot.size / 2,
                            top: rot.y - rot.size / 2,
                            width: rot.size,
                            height: rot.size,
                            transform: `rotate(${rot.rotation}deg)`,
                            opacity,
                            filter: isWarning ? "hue-rotate(40deg)" : "none",
                            /* Enlarge touch target on mobile for easier tapping */
                            padding: "8px",
                            margin: "-8px",
                          }}
                          whileHover={{ scale: 1.2 }}
                          whileTap={{ scale: 0.85 }}
                          onClick={() => handleCatchBrainRot(rot)}
                          aria-label={`Kapd el: ${rot.name}`}
                        >
                          {/* Glowing aura */}
                          <div
                            className="absolute inset-0 rounded-full"
                            style={{
                              background: `radial-gradient(circle, ${isWarning ? "rgba(239,68,68,0.4)" : "rgba(147,51,234,0.35)"} 0%, transparent 70%)`,
                              animation: `pulse ${1 + Math.sin(rot.pulsePhase) * 0.5}s ease-in-out infinite`,
                            }}
                          />
                          <span
                            className="relative z-10 drop-shadow-lg"
                            style={{ fontSize: rot.size * 0.65 }}
                          >
                            {rot.emoji}
                          </span>
                          {/* XP badge */}
                          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-black bg-black/70 text-amber-300 px-1 rounded-sm whitespace-nowrap">
                            {rot.xpValue} XP
                          </span>
                          {/* Warning indicator */}
                          {isWarning && (
                            <motion.div
                              className="absolute -top-1 -right-1"
                              animate={{ scale: [1, 1.3, 1] }}
                              transition={{ duration: 0.5, repeat: Infinity }}
                            >
                              <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                            </motion.div>
                          )}
                        </motion.button>
                      );
                    })}

                  {/* Particles */}
                  {particles.map((p, i) => (
                    <div
                      key={`p-${i}`}
                      className="absolute pointer-events-none"
                      style={{
                        left: p.x,
                        top: p.y,
                        opacity: p.life / p.maxLife,
                        transform: `scale(${p.life / p.maxLife})`,
                      }}
                    >
                      {p.emoji ? (
                        <span style={{ fontSize: p.size * 2 }}>{p.emoji}</span>
                      ) : (
                        <div
                          className="rounded-full"
                          style={{
                            width: p.size,
                            height: p.size,
                            backgroundColor: p.color,
                          }}
                        />
                      )}
                    </div>
                  ))}

                  {/* Floating texts */}
                  {floatingTexts.map((ft) => (
                    <motion.div
                      key={ft.id}
                      className="absolute pointer-events-none font-black text-sm"
                      style={{
                        left: ft.x,
                        top: ft.y,
                        color: ft.color,
                        opacity: ft.life / 1.5,
                        textShadow: "0 2px 8px rgba(0,0,0,0.8)",
                      }}
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                    >
                      {ft.text}
                    </motion.div>
                  ))}

                  {/* Empty state */}
                  {brainRots.filter((r) => !r.caught).length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <motion.p
                        className="text-white/40 text-sm font-medium"
                        animate={{ opacity: [0.3, 0.7, 0.3] }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        Brain Rot-ok közelednek... {"\u{1F9E0}"}
                      </motion.p>
                    </div>
                  )}
                </div>

                {/* Hint */}
                <p className="text-[10px] text-white/50 text-center">
                  Koppints a Brain Rot-okra, mielőtt eltűnnek! Minden szerzés kvízt hoz.
                </p>
              </div>
            )}

            {/* --- GAME OVER --- */}
            {phase === "over" && (
              <div className="flex flex-col items-center justify-center flex-1 gap-4 py-8 text-center">
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", damping: 10 }}
                >
                  <Trophy className="w-16 h-16 text-amber-400 mx-auto" />
                </motion.div>

                <div className="space-y-1">
                  <h2 className="text-xl font-extrabold bg-gradient-to-r from-amber-300 via-orange-300 to-pink-300 bg-clip-text text-transparent">
                    Vadászat vége!
                  </h2>
                  <p className="text-sm text-white/70 max-w-sm">
                    Minden jó kvíz angol szavakat, matekot és magyart erősített!
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 w-full max-w-xs">
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-center">
                    <p className="text-2xl font-black text-amber-300">{sessionXp}</p>
                    <p className="text-[10px] text-white/60 font-semibold">SZERZETT XP</p>
                  </div>
                  <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-3 text-center">
                    <p className="text-2xl font-black text-orange-300">{totalCaught}</p>
                    <p className="text-[10px] text-white/60 font-semibold">ELKAPOTT</p>
                  </div>
                  <div className="rounded-xl border border-pink-500/30 bg-pink-500/10 p-3 text-center">
                    <p className="text-2xl font-black text-pink-300">{bestStreak}</p>
                    <p className="text-[10px] text-white/60 font-semibold">LEGJOBB SOROZAT</p>
                  </div>
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-center">
                    <p className="text-2xl font-black text-red-300">{totalMissed}</p>
                    <p className="text-[10px] text-white/60 font-semibold">ELSZÖKÖTT</p>
                  </div>
                </div>

                {syncEligibility?.eligible ? (
                  <p className="text-xs text-emerald-300/90">Eredmény elküldve!</p>
                ) : (
                  <p className="text-xs text-white/50 max-w-xs">{syncBanner}</p>
                )}

                <div className="flex gap-2">
                  <Button
                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 shadow-lg"
                    onClick={startGame}
                  >
                    <RotateCcw className="w-4 h-4 mr-1" />
                    Újra!
                  </Button>
                  <Link href="/games">
                    <Button variant="outline" className="border-white/40 text-white">
                      Lista
                    </Button>
                  </Link>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* --- QUIZ OVERLAY --- */}
      <AnimatePresence>
        {phase === "quiz" && quiz && caughtRot && (
          <motion.div
            className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-2 sm:p-3 bg-black/80 backdrop-blur-sm"
            style={{ paddingBottom: "env(safe-area-inset-bottom, 8px)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className={`w-full max-w-md rounded-t-2xl sm:rounded-2xl ${CATEGORY_BORDERS[quiz.category]} border-2 bg-slate-950/95 p-3 sm:p-4 shadow-2xl ${wrongShake ? "animate-brshake" : ""}`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{caughtRot.emoji}</span>
                  <div>
                    <p className={`text-xs font-bold uppercase ${CATEGORY_LABELS[quiz.category].color}`}>
                      {CATEGORY_LABELS[quiz.category].icon} {CATEGORY_LABELS[quiz.category].label} kvíz
                    </p>
                    <p className="text-[10px] text-white/50">
                      {caughtRot.name} | {Math.round(caughtRot.xpValue * comboMultiplier)} XP
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  {comboMultiplier > 1 && (
                    <span className="text-[10px] font-bold text-yellow-300 bg-yellow-400/15 px-1.5 py-0.5 rounded">
                      x{comboMultiplier.toFixed(1)} szorzó
                    </span>
                  )}
                </div>
              </div>

              <p className="text-[10px] sm:text-[11px] text-white/60 mb-1.5 sm:mb-2">
                Helyes válasz: a Brain Rot a tied + XP! Rossz válasz: próbáld újra.
              </p>

              {/* Question */}
              <p className="text-sm sm:text-base font-semibold mb-3 sm:mb-4">{quiz.prompt}</p>

              {/* Answers */}
              <div className="grid gap-1.5 sm:gap-2">
                {quiz.options.map((o, i) => {
                  const isCorrect = revealCorrectIdx === i;
                  const isWrong = wrongIdx === i;
                  const dim = revealCorrectIdx !== null && !isCorrect && !isWrong;
                  const baseCat =
                    quiz.category === "english"
                      ? "border-cyan-900/40 hover:border-cyan-500/50"
                      : quiz.category === "math"
                        ? "border-amber-900/40 hover:border-amber-500/50"
                        : "border-emerald-900/40 hover:border-emerald-500/50";
                  const cls = isCorrect
                    ? "h-auto min-h-[48px] py-2.5 sm:py-3 text-left bg-emerald-700/70 hover:bg-emerald-700/70 text-white border-2 border-emerald-300 text-[14px] sm:text-[15px] font-bold"
                    : isWrong
                      ? "h-auto min-h-[48px] py-2.5 sm:py-3 text-left bg-rose-800/70 hover:bg-rose-800/70 text-white border-2 border-rose-300 text-[14px] sm:text-[15px]"
                      : dim
                        ? "h-auto min-h-[48px] py-2.5 sm:py-3 text-left bg-white/5 text-white/40 border border-white/10 text-[14px] sm:text-[15px]"
                        : `h-auto min-h-[48px] py-2.5 sm:py-3 text-left bg-white/10 hover:bg-purple-800/50 active:bg-purple-700/60 text-white border text-[14px] sm:text-[15px] ${baseCat}`;
                  return (
                    <Button
                      key={`${o}-${i}`}
                      variant="secondary"
                      className={cls}
                      disabled={revealCorrectIdx !== null}
                      onClick={() => onAnswer(i)}
                    >
                      <span className="text-white/40 mr-2 font-mono text-xs">{String.fromCharCode(65 + i)})</span>
                      {o}
                    </Button>
                  );
                })}
              </div>
              {streakProtector.warning && (
                <p className="mt-2 text-[11px] text-amber-300/95 font-semibold">⚠ {streakProtector.warning}</p>
              )}
              {revealCorrectIdx !== null && wrongIdx !== null && (
                <p className="mt-2 text-[11px] text-emerald-300/95">
                  A helyes válasz: <strong>{quiz.options[revealCorrectIdx]}</strong>
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes brshake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-6px); }
          75% { transform: translateX(6px); }
        }
        .animate-brshake { animation: brshake 0.16s ease-in-out 2; }
      `}</style>
    </div>
  );
}
