import {
  dedupeTiersByContent,
  ladderTierIndex,
  LADDER_TIER_LABELS,
  pickUnseen,
  type SeenItem,
} from "@/game-engine/no-repeat";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Flame, Check, X } from "lucide-react";
import { motion, AnimatePresence, useAnimationControls, useReducedMotion } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import GamePedagogyPanel from "@/components/GamePedagogyPanel";
import { gameSyncBannerText, useSyncEligibilityQuery } from "@/hooks/useGameScoreSync";
import { useMaterialQuizzes } from "@/hooks/useMaterialQuizzes";
import { useClassroomGrade } from "@/lib/classroomStore";
import { sfxSuccess, sfxError, sfxLevelUp } from "@/lib/audioEngine";
import { recordRun, type Achievement } from "@/lib/achievements";
import { isTodaysGameAvailable, markDailyCompleted } from "@/lib/dailyChallenge";
import AchievementToast from "@/components/AchievementToast";
import { WORD_LADDER_BANKS } from "@/data/wordLadder/registry";
import {
  availableLadderLanguages,
  ladderTiersFromBank,
  loadLadderLanguage,
  saveLadderLanguage,
} from "@/data/wordLadder/banks";
import {
  WORD_LADDER_LANGUAGES,
  WORD_LADDER_LANGUAGE_LABELS,
  type WordLadderLanguage,
} from "@/data/wordLadder/types";
import type { LadderItem } from "@/data/wordLadder/types";
import { splitBankItemsByTier } from "@/lib/mergeGameQuizBank";
import type { FourChoiceQuiz, GameQuizBankResponse } from "@/types/gameQuiz";
import { correctDataAttrs, installGameTestApi } from "@/game-engine/game-test-hooks";
import {
  LADDER_ZONES,
  xpForCorrect,
  nextRung as computeNextRung,
  streakMessage,
  encouragement,
  confettiParticles,
} from "@/lib/wordLadderLogic";
import {
  createLadderLevelSession,
  ladderRungsForLevel,
  ladderTierForLevel,
  milestoneForProgress,
  wordLadderGameId,
  zoneForProgress,
} from "@/lib/wordLadderLevels";
import { GradeLevelPicker } from "@/game-engine/GradeLevelPicker";
import { loadUnlockedLevel, unlockNextLevel } from "@/game-engine/gradeLevels";
import { detectLookTier } from "@/game-engine/three-look/tier";
import QuizFeedbackCard from "@/game-engine/QuizFeedbackCard";
import LadderScene3D from "@/game-engine/scenes/LadderScene3D";
import QuizBoard3D from "@/game-engine/scenes/QuizBoard3D";
import { quiz3dEnabled, type TileState } from "@/game-engine/scenes/quizBoardLayout";
import { buildFeedback, type FeedbackCard } from "@/game-engine/feedback";
import {
  GameHud,
  GameShell,
  PauseMenu,
  ResultScreen,
  StartScreen,
  useBestScore,
  useHaptics,
  type GameScreenState,
} from "@/game-engine/mobile";
import { createSeenHistory, externalKey, safeLocalStorage, useVocabQuizSource } from "@/game-engine/vocab";
import { mergeVocabTiers, VOCAB_POOL_PER_LEVEL, vocabIdOfLadderItem, type VocabMeaning } from "@/lib/wordLadderVocab";
import { loadVocabBank } from "@/data/vocabBank/loader";

const LS_XP = "websuli-wordladder-xp";
const LS_BEST = "websuli-wordladder-streak";

type Quiz = FourChoiceQuiz;

/** A válasz-felfedés ideje (a helyes zölden, a hibás pirosan látszik). */
const REVEAL_MS = 900;
/** A lépés-animáció ideje (a figura ugrik / megcsúszik). */
const STEP_MS = 620;

/** A Szólétra évfolyam-választója: 3–12. */
const LADDER_GRADES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** Billentyűzet: az 1–4 szám a négy választ jelöli (a lapokon is ez a jelvény). */
const ANSWER_KEYS = ["1", "2", "3", "4"];

const LADDER_LEVELS = [0, 1, 2, 3, 4] as const;

/** A kezdőképernyő sötét égbolt-háttere: a világos réti színen a fehér feliratok nem olvashatók. */
const MENU_BACKGROUND =
  "radial-gradient(ellipse 90% 55% at 50% 18%, #38bdf84d, transparent 70%), linear-gradient(175deg, #0c2a5c 0%, #10406a 45%, #0f5a4a 80%, #14532d 100%)";

function clampLadderGrade(grade: number): number {
  return Math.min(12, Math.max(3, Math.round(grade)));
}

/**
 * Fázisok: menu → quiz → reveal (a válasz felfedése, gombok letiltva) → step (a figura
 * ugrik/csúszik) → quiz … → won.
 */
type Phase = "menu" | "quiz" | "reveal" | "step" | "won";

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

/** Konfetti-eső (CSS animáció), reduced-motion esetén nem jelenik meg. Az eredménykártya fölé esik. */
function Confetti() {
  const parts = useMemo(() => confettiParticles(40), []);
  return (
    <div className="pointer-events-none fixed inset-0 z-[85] overflow-hidden" aria-hidden="true">
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
        const zone = zoneForProgress(i + 1, total);
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

/** A választható nyelvek (csak a tételt exportáló bankok) — oldalbetöltésenként egyszer. */
const AVAILABLE_LANGUAGES = availableLadderLanguages(WORD_LADDER_BANKS);

export default function WordLadderHuEn() {
  const reducedMotion = useReducedMotion() ?? false;
  const [, navigate] = useLocation();
  const haptics = useHaptics();
  const { best: bestScore, submit: submitBest } = useBestScore("word-ladder-hu-en");
  const [phase, setPhase] = useState<Phase>("menu");
  /** S6: szünet (a 4.5 keret szünet menüje); a lépés-lánc és a futamidő ilyenkor áll. */
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  /** A szünet alatt esedékessé vált lépés-lánc-lépés: folytatáskor fut le. */
  const deferredStepRef = useRef<(() => void) | null>(null);
  const [rung, setRung] = useState(0);
  /** A futás kérdés-sorszáma (az XP-felirat kulcsa). */
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
  /** Az eredményképernyő legjobb-adata (a győzelemkor egyszer rögzítve). */
  const [result, setResult] = useState<{ best: number; isNewBest: boolean } | null>(null);
  /** A 3D létra él-e (WebGL); különben az SVG-létra és a DOM-mászó látszik. */
  const [ladder3d, setLadder3d] = useState(false);
  const ladderColumnRef = useRef<HTMLDivElement | null>(null);
  const quizControls = useAnimationControls();
  const onLadderSupported = useCallback((s: boolean | null) => {
    setLadder3d(s === true);
    if (s !== true) ladderColumnRef.current?.style.removeProperty("--wl-climber-pct");
  }, []);
  // A 3D mászó képernyő-magassága (%) — az XP-felirat ehhez igazodik, React-render nélkül.
  const onClimberScreenPct = useCallback((pct: number) => {
    ladderColumnRef.current?.style.setProperty("--wl-climber-pct", `${pct}%`);
  }, []);
  /**
   * 3D kérdések (spec 7. döntés): csak valódi WebGL-lel és nem low szinten; különben a DOM-kártya.
   * A szint oldalbetöltésenként egyszer dől el (`detectLookTier` gyorsítótáraz).
   */
  const [quiz3dWanted] = useState(() => quiz3dEnabled(detectLookTier(), null));
  const [quiz3dSupported, setQuiz3dSupported] = useState<boolean | null>(null);
  const quiz3dOn = quiz3dWanted && quiz3dSupported === true;
  const quizPanelRef = useRef<HTMLDivElement | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A válasz-lock szinkron ref: két gyors kattintás ne dolgozódjon fel duplán.
  const answerLockedRef = useRef(false);
  /** A futás sávja: a pálya sávjából indul, a pálya ±0,15-én belül mozog (spec 6. döntés). */
  const levelSessionRef = useRef(createLadderLevelSession(1));
  /** A futás ÖSSZES eddigi kérdése (azonosító + prompt) — ezek a futás végéig nem jönnek újra. */
  const seenRef = useRef<SeenItem[]>([]);
  // Az ad-hoc setTimeout-ok gyűjtve, unmountkor törölve.
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const scoreSubmittedRef = useRef(false);
  /** Rossz válasz után a lépés-lánc a magyarázó kártya bezárásáig vár. */
  const pendingStepRef = useRef<(() => void) | null>(null);
  /** A futamidő-óra refen olvassa, hogy a kártya alatt ne ketyegjen. */
  const explainOpenRef = useRef(false);
  /** Futáson belüli max streak — leaderboard/achievement-hez. */
  const runBestStreakRef = useRef(0);
  /** Helyes / hibás válaszok száma a futásban (a streak NEM egyenlő ezekkel). */
  const correctCountRef = useRef(0);
  const wrongCountRef = useRef(0);
  /**
   * G-1: magyarázó kártya rossz válaszra. A `feedback` állapot a bátorító mondaté,
   * ezért ez külön néven él. A kártya bezárása után indul a létra lépése (A1).
   */
  const [explainCard, setExplainCard] = useState<FeedbackCard | null>(null);
  const startGameRef = useRef<() => void>(() => {});

  useEffect(() => {
    return installGameTestApi({
      forceState: (patch) => {
        if (patch.phase === "won" || patch.phase === "menu") {
          setPaused(false);
          pausedRef.current = false;
          setPhase(patch.phase);
        }
        if (patch.phase === "play") {
          startGameRef.current();
        }
      },
    });
  }, []);

  /** Nyelv (spec 4. döntés): a menüben választható, tárolva `websuli.wordladder.lang`. */
  const [lang, setLang] = useState<WordLadderLanguage>(() => loadLadderLanguage(AVAILABLE_LANGUAGES));
  const langLabel = WORD_LADDER_LANGUAGE_LABELS[lang];
  const pickLanguage = useCallback((next: WordLadderLanguage) => {
    if (!AVAILABLE_LANGUAGES.includes(next)) return;
    setLang(next);
    saveLadderLanguage(next);
  }, []);

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
  const { grade: userGrade, setGrade: setClassroomGrade } = useClassroomGrade();
  const { items: materialItems } = useMaterialQuizzes(userGrade, "english");

  /**
   * A nyelv bankjának öt szintje (A1 … B2, a `tier` mező szerint). Az angolhoz a szerver-bank és a tananyag-kvízek
   * (mind angolok) is hozzájönnek; a statikus és a szerver-bank azonos tartalmú tételei egyszer szerepelnek.
   */
  const tiers = useMemo(() => {
    const base: Quiz[][] = ladderTiersFromBank(WORD_LADDER_BANKS[lang] ?? []);
    if (lang !== "en") return dedupeTiersByContent(base);
    const { easy, medium, hard } = splitBankItemsByTier(quizBankResponse?.items);
    const matMed = materialItems
      .filter((q) => Array.isArray(q.options) && q.options.length === 4)
      .map((q, idx) => ({
        id: q.id ?? `mat-${idx}`,
        prompt: q.prompt,
        options: q.options.slice(0, 4) as [string, string, string, string],
        correctIndex: q.correctIndex,
        // T-1: a bankból jövő magyarázat, ha a lecke exportja hozta.
        explanation: q.explanation ?? undefined,
      }));
    return dedupeTiersByContent([
      [...base[0]!, ...easy],
      [...base[1]!, ...medium, ...matMed],
      [...base[2]!, ...hard],
      base[3]!,
      base[4]!,
    ]);
  }, [lang, quizBankResponse, materialItems]);

  /**
   * S6 / A7 — a központi szóbank (mindhárom nyelven) a kézi bank MÖGÉ kerül. `null`, amíg tölt vagy ha a betöltés
   * hibázott: ilyenkor a játék a kézi bankkal megy (terv 5. szakasz). A bekötés ezzel az egy hívással kapcsolható ki.
   */
  const vocab = useVocabQuizSource(lang, true);
  const vocabRef = useRef(vocab);
  vocabRef.current = vocab;
  /**
   * Futásonkénti számláló: a `startGame` minden futáskezdetkor növeli, így a szóbank-készlet futásonként újraépül,
   * és a `buildPool` a tartós napló szerint a még nem látott bejegyzéseket adja (review #419).
   */
  const [runSeq, setRunSeq] = useState(0);
  /** A futás kezdő szintje (a startGame írja): a készlet csak e körül épül (±1 szint — a sáv ennyit mozdulhat). */
  const runTierRef = useRef(0);
  const [vocabTiers, setVocabTiers] = useState<LadderItem[][]>(() => LADDER_LEVELS.map(() => []));
  /**
   * A készlet a futás kezdete UTÁN, a koppintás visszajelzése után épül (setTimeout 0): a teljes, ~2000 bejegyzéses
   * bankon szintenként 60 kérdés generálása asztali gépen ~0,1 s / szint, telefonon ennek többszöröse — a lépés így nem
   * akasztja meg az indítást. Addig (az első kérdésnél) a kézi bank kérdez. A runSeq szándékosan függőség: futásonként
   * új készlet, a tartós napló aktuális állapotából.
   */
  useEffect(() => {
    setVocabTiers(LADDER_LEVELS.map(() => []));
    if (!vocab || runSeq === 0) return;
    const timer = setTimeout(() => {
      const tier = runTierRef.current;
      setVocabTiers(
        LADDER_LEVELS.map((l) =>
          Math.abs(l - tier) <= 1 ? vocab.buildPool(l, VOCAB_POOL_PER_LEVEL).map((q) => vocab.toLadderItem(q)) : [],
        ),
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [vocab, lang, runSeq]);
  /**
   * A bejegyzések két nyelvi alakja (term, hu) a kézi bankkal való ütközés-szűréshez, fordítási iránytól függetlenül
   * (review #430). A betöltő gyorsítótáraz: ez ugyanaz az ígéret, amelyet a szóbank-forrás is használ.
   */
  const [vocabMeanings, setVocabMeanings] = useState<Map<string, VocabMeaning> | null>(null);
  useEffect(() => {
    setVocabMeanings(null);
    if (!vocab) return;
    let cancelled = false;
    loadVocabBank(lang).then(
      (entries) => {
        if (!cancelled) setVocabMeanings(new Map(entries.map((e) => [e.id, { term: e.term, hu: e.hu }])));
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [vocab, lang]);
  const allTiers = useMemo(() => {
    // A tartós, játékok között közös napló egyetlen olvasása a készlet építésekor (futásonként, a runSeq miatt):
    // látott a bejegyzés, ha az azonosítója vagy (kézi kérdésből) a term / hu kulcsa szerepel (terv 4.4).
    const snap = createSeenHistory(safeLocalStorage()).snapshot(lang);
    const isSeen = (id: string) => {
      if (snap[id] !== undefined) return true;
      const m = vocabMeanings?.get(id);
      return !!m && (snap[externalKey(m.term)] !== undefined || snap[externalKey(m.hu)] !== undefined);
    };
    return mergeVocabTiers(tiers, vocabMeanings ? vocabTiers : vocabTiers.map(() => []), (id) => vocabMeanings?.get(id), isSeen);
  }, [tiers, vocabTiers, vocabMeanings, lang]);
  const tiersRef = useRef(allTiers);
  tiersRef.current = allTiers;

  /** A játszott évfolyam (3–12): a menüben választható, alapértéke az osztály. */
  const [pickedGrade, setPickedGrade] = useState<number | null>(null);
  const ladderGrade = pickedGrade ?? clampLadderGrade(userGrade ?? 4);
  const ladderGradeRef = useRef(ladderGrade);
  ladderGradeRef.current = ladderGrade;
  /**
   * S6 / M8: a blokkoló osztály-modal helyett a kezdőképernyő évfolyam-választója. Ha még nincs tárolt osztály,
   * a választás azt is beállítja (mint a modal), így a többi játék is tudja.
   */
  const pickGrade = useCallback(
    (g: number) => {
      setPickedGrade(g);
      if (userGrade == null) setClassroomGrade(g);
    },
    [userGrade, setClassroomGrade],
  );

  /** Pálya (spec 6. döntés): nyelvenként és évfolyamonként külön haladás; alapból a legmagasabb nyitott pálya. */
  const [unlocked, setUnlocked] = useState(() => loadUnlockedLevel(wordLadderGameId(lang), ladderGrade));
  const [level, setLevel] = useState(unlocked);
  useEffect(() => {
    const u = loadUnlockedLevel(wordLadderGameId(lang), ladderGrade);
    setUnlocked(u);
    setLevel(u);
  }, [lang, ladderGrade]);
  const runRef = useRef({ lang, grade: ladderGrade, level, rungs: ladderRungsForLevel(level) });
  /** A futás létrájának hossza: a pályából, a futás elején rögzítve. */
  const [runRungs, setRunRungs] = useState(() => ladderRungsForLevel(level));
  const menuRungs = ladderRungsForLevel(level);
  const RUNGS = phase === "menu" ? menuRungs : runRungs;

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

  /** A következő, a futásban még nem látott kérdés a futás sávjának szintjéről. */
  const nextUnseen = useCallback(
    () => pickUnseen(tiersRef.current, ladderTierIndex(runRef.current.grade, levelSessionRef.current.band), seenRef.current),
    [],
  );

  /** A futás első kérdése a futásonként újraépülő készletből jön (a runSeq-render után, lásd a lenti effektet). */
  const firstQuestionPendingRef = useRef(false);

  const clearRunTimers = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (stepTimerRef.current) {
      clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    deferredStepRef.current = null;
    pendingStepRef.current = null;
  }, []);

  const startGame = useCallback(() => {
    clearRunTimers();
    scoreSubmittedRef.current = false;
    answerLockedRef.current = false;
    runBestStreakRef.current = 0;
    correctCountRef.current = 0;
    wrongCountRef.current = 0;
    pausedRef.current = false;
    setPaused(false);
    setResult(null);
    runRef.current = { lang, grade: ladderGradeRef.current, level, rungs: ladderRungsForLevel(level) };
    levelSessionRef.current.reset(level);
    runTierRef.current = ladderTierIndex(runRef.current.grade, levelSessionRef.current.band);
    seenRef.current = [];
    const total = runRef.current.rungs;
    setRunRungs(total);
    setCursor(0);
    // Csak fejlesztői módban: ?rung=N kezdőfok a zónaváltások/cél gyors ellenőrzéséhez.
    let startRung = 0;
    if (import.meta.env.DEV) {
      const p = parseInt(new URLSearchParams(window.location.search).get("rung") ?? "", 10);
      if (Number.isFinite(p)) startRung = Math.max(0, Math.min(total - 1, p));
    }
    setRung(startRung);
    setStreak(0);
    setSessionXp(0);
    setRunSeconds(0);
    setChosenIdx(null);
    setFeedback(null);
    setBanner(null);
    setLastXpGain(null);
    // Új futás → új szóbank-készlet; az első kérdést az újraépült készletből a lenti effekt választja.
    // Az előző futás készlete azonnal kiürül (az első kérdés így nem jöhet a régi, elavult készletből).
    setVocabTiers(LADDER_LEVELS.map(() => []));
    setRunSeq((n) => n + 1);
    firstQuestionPendingRef.current = true;
    setCurrent(null);
    setPhase("quiz");
    setExplainCard(null);
    explainOpenRef.current = false;
    tickRef.current = setInterval(() => {
      // A magyarázat olvasása és a szünet nem büntethető idővel.
      if (explainOpenRef.current) return;
      if (pausedRef.current) return;
      setRunSeconds((s) => s + 1);
    }, 1000);
  }, [lang, level, clearRunTimers]);
  startGameRef.current = startGame;

  useEffect(() => {
    if (!firstQuestionPendingRef.current) return;
    firstQuestionPendingRef.current = false;
    setCurrent(nextUnseen());
  }, [runSeq, nextUnseen]);

  /**
   * S6 / A7: a ténylegesen megjelenő kérdés naplózása a közös szóbank-naplóba — szóbankos tételnél `markAsked`,
   * kézi tételnél a helyes válasz `markExternal`-lal (így ugyanaz a szó a bankból sem jön vissza).
   */
  useEffect(() => {
    if (!current) return;
    const vocabId = vocabIdOfLadderItem(current.id);
    if (vocabId) vocabRef.current?.markAsked({ vocabId });
    else vocabRef.current?.markExternal(current.options[current.correctIndex] ?? "");
  }, [current]);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current = [];
      pendingStepRef.current = null;
      deferredStepRef.current = null;
    };
  }, []);

  const finishWon = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    sfxLevelUp();
    haptics("success");
    // A pálya teljesítése a következő pályát nyitja (nyelvenként és évfolyamonként).
    const run = runRef.current;
    const next = unlockNextLevel(wordLadderGameId(run.lang), run.grade, run.level);
    setUnlocked(next);
    setLevel(Math.min(next, run.level + 1));
    setPhase("won");
    setCelebrate(true);
    pushTimeout(() => setCelebrate(false), 3000);
  }, [pushTimeout, haptics]);

  const inRun = phase === "quiz" || phase === "reveal" || phase === "step";
  const inRunRef = useRef(inRun);
  inRunRef.current = inRun;

  /** Szünet: a lap háttérbe kerülésekor (GameShell) és a HUD gombjával. */
  const pauseGame = useCallback(() => {
    if (!inRunRef.current || pausedRef.current) return;
    pausedRef.current = true;
    setPaused(true);
  }, []);
  const resumeGame = useCallback(() => {
    if (!pausedRef.current) return;
    pausedRef.current = false;
    setPaused(false);
    const deferred = deferredStepRef.current;
    deferredStepRef.current = null;
    deferred?.();
  }, []);
  const exitToMenu = useCallback(() => {
    clearRunTimers();
    pausedRef.current = false;
    setPaused(false);
    setExplainCard(null);
    explainOpenRef.current = false;
    setCurrent(null);
    setChosenIdx(null);
    setFeedback(null);
    setBanner(null);
    setPhase("menu");
  }, [clearRunTimers]);

  // R = quick-restart a "won" / "menu" képernyőn; P = szünet játék közben.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "p" || e.key === "P") && inRunRef.current) {
        e.preventDefault();
        if (pausedRef.current) resumeGame();
        else pauseGame();
        return;
      }
      if (e.key !== "r" && e.key !== "R") return;
      if (phase === "won" || phase === "menu") {
        e.preventDefault();
        startGame();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, startGame, pauseGame, resumeGame]);

  /**
   * A1: a lépés-lánc és a magyarázó kártya összekötése.
   * Rossz válasznál a kérdéscsere a kártya bezárásáig vár.
   */
  explainOpenRef.current = explainCard !== null;

  /** Szünetben az esedékes lépés nem fut le: a folytatásig vár (S6/2. lépés). */
  const whenNotPaused = useCallback(
    (fn: () => void) => () => {
      if (pausedRef.current) {
        deferredStepRef.current = fn;
        return;
      }
      fn();
    },
    [],
  );

  const runStepChain = useCallback(
    (
      target: number,
      nextCursor: number,
      nextQuestion: Quiz | null,
      isCorrect: boolean,
      fromRung: number,
    ) => {
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
      const total = runRef.current.rungs;
      // 2) LÉPÉS: a felfedés után a figura ugrik/csúszik.
      stepTimerRef.current = setTimeout(
        whenNotPaused(() => {
          const ms = milestoneForProgress(fromRung, target, total);
          setRung(target);
          setStepDelta(isCorrect ? 1 : -1);
          setPhase("step");
          if (ms) showBanner(ms, 1800);

          // 3) KÖVETKEZŐ KÉRDÉS vagy CÉL. A kérdéscsere CSAK itt történik: a lépés alatt még az
          // előző kérdés látszik a zöld/piros jelöléssel (különben a következő kérdés helyes
          // válasza szivárogna ki a felfedő színezéssel).
          stepTimerRef.current = setTimeout(
            whenNotPaused(() => {
              if (target >= total) {
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
            }),
            STEP_MS,
          );
        }),
        REVEAL_MS,
      );
    },
    [finishWon, showBanner, whenNotPaused],
  );

  const dismissExplain = useCallback(() => {
    setExplainCard(null);
    explainOpenRef.current = false;
    const pending = pendingStepRef.current;
    pendingStepRef.current = null;
    pending?.();
  }, []);

  const onAnswer = (i: number) => {
    if (!current) return;
    if (phase !== "quiz") return;
    if (pausedRef.current) return;
    if (answerLockedRef.current) return;
    if (i < 0 || i >= current.options.length) return;
    answerLockedRef.current = true;
    const isCorrect = i === current.correctIndex;
    levelSessionRef.current.answer(isCorrect);
    seenRef.current = [...seenRef.current, { id: current.id, prompt: current.prompt }];

    // 1) FELFEDÉS: a gyerek látja a zöld (helyes) és piros (hibás) választ.
    setChosenIdx(i);
    setPhase("reveal");
    setFeedback(encouragement(isCorrect, rung));

    if (!isCorrect) {
      wrongCountRef.current += 1;
      sfxError();
      haptics("error");
      if (!reducedMotion) void quizControls.start({ x: [0, -10, 9, -6, 4, 0], transition: { duration: 0.42 } });
      setStreak(0);
      setLastXpGain(null);
      // G-1: a bátorító mondat („Semmi baj!") kedves, de nem tanít. A kártya
      // megmondja, mi a helyes szó, és mit választott helyette a gyerek.
      // A `feedback` név itt már foglalt (a bátorítás szövege), ezért explainCard.
      setExplainCard(
        buildFeedback({
          quiz: {
            prompt: current.prompt,
            options: current.options,
            correctIndex: current.correctIndex,
            // A séma `null`-t is enged (régi sor); a motor `undefined`-ot vár.
            explanation: current.explanation ?? undefined,
          },
          chosenIndex: i,
          attempt: 0,
          ageBand: "kid",
        }),
      );
      explainOpenRef.current = true;
    } else {
      correctCountRef.current += 1;
      sfxSuccess();
      haptics("success");
      if (!reducedMotion) void quizControls.start({ scale: [1, 1.025, 1], transition: { duration: 0.3 } });
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

    const target = computeNextRung(rung, isCorrect, runRef.current.rungs);
    const nextCursor = cursor + 1;
    // Futáson belül nincs ismétlés (#135): a következő kérdés a futás sávjának szintjéről, még nem látott.
    const nextQuestion = nextUnseen();

    const fromRung = rung;
    const startStep = () => runStepChain(target, nextCursor, nextQuestion, isCorrect, fromRung);
    if (!isCorrect) {
      // A1: a lépés és a kérdéscsere a kártya bezárásáig vár — különben a gyerek
      // a magyarázatot egy már kicserélt kérdés mögött olvassa.
      pendingStepRef.current = startStep;
    } else {
      pendingStepRef.current = null;
      startStep();
    }
  };
  const onAnswerRef = useRef(onAnswer);
  onAnswerRef.current = onAnswer;
  const answerFromBoard = useCallback((i: number) => onAnswerRef.current(i), []);

  // Billentyűzet: 1–4 = a négy válasz (a lapok jelvénye), csak kérdés közben.
  useEffect(() => {
    if (phase !== "quiz") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      if (pausedRef.current) return;
      const idx = ANSWER_KEYS.indexOf(e.key);
      if (idx < 0) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      onAnswerRef.current(idx);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

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

  // Achievement + Daily + helyi legjobb — egyszer fut "won" átmenetkor.
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[]>([]);
  const achievementCheckedRef = useRef(false);
  useEffect(() => {
    if (phase !== "won") {
      achievementCheckedRef.current = false;
      return;
    }
    if (achievementCheckedRef.current) return;
    achievementCheckedRef.current = true;
    setResult(submitBest(sessionXp));
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
  }, [phase, sessionXp, streak, submitBest]);

  const zone = zoneForProgress(rung, RUNGS);
  const revealing = phase === "reveal" || phase === "step";
  const climberMood: "happy" | "oops" | "idle" =
    phase === "reveal" || phase === "step" ? (stepDelta > 0 && phase === "step" ? "happy" : chosenIdx !== null && current && chosenIdx !== current.correctIndex ? "oops" : "happy") : "idle";
  // A figura függőleges helye a létrán (%): 0. fok = alul, RUNGS = a zászlónál.
  const climberBottomPct = 3 + (rung / RUNGS) * 88;
  const tileStates: TileState[] = (current?.options ?? []).map((_, idx) =>
    !revealing ? "idle" : idx === current!.correctIndex ? "correct" : idx === chosenIdx ? "wrong" : "dim",
  );
  const levelTierLabel = LADDER_TIER_LABELS[ladderTierForLevel(ladderGrade, level)];
  const screenState: GameScreenState =
    phase === "menu" ? "start" : phase === "won" ? "result" : paused ? "paused" : "playing";
  const stepping = phase === "step" && !reducedMotion;
  const answered = correctCountRef.current + wrongCountRef.current;

  return (
    <GameShell
      gameId="WordLadderHuEn"
      state={screenState}
      onAutoPause={pauseGame}
      style={{
        background:
          phase === "menu"
            ? MENU_BACKGROUND
            : phase === "won"
              ? LADDER_ZONES[LADDER_ZONES.length - 1]!.background
              : zone.background,
        transition: "background 800ms ease",
      }}
    >
      <div className="wl-achievements">
        <AchievementToast achievements={newlyUnlocked} />
      </div>
      {phase !== "menu" && (
        <ZoneDecor decor={phase === "won" ? ["🎉", "⭐", "🏆", "✨"] : zone.decor} reduced={reducedMotion} />
      )}
      {!reducedMotion && phase !== "menu" && (
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

      <main
        className={`relative z-10 w-full min-h-dvh flex flex-col ${phase === "menu" ? "" : "wl-play"}`}
        data-testid="wordladder-root"
        data-zone={zone.id}
        data-lang={lang}
      >
        {phase === "menu" ? (
          <StartScreen
            title="Szólétra"
            subtitle={`Mássz fel a 🏁 zászlóig! Magyar ↔ ${langLabel.name.toLowerCase()} szavak, ${ladderGrade}. évfolyam.`}
            icon={
              <div className="wl-start-icon relative h-full w-full overflow-hidden rounded-[28px]">
                <LadderScene3D
                  variant="preview"
                  rung={0}
                  total={RUNGS}
                  zoneId="meadow"
                  streak={0}
                  mood="idle"
                  fallback={
                    <>
                      <Ladder rung={0} total={RUNGS} />
                      <div className="absolute left-1/2 -translate-x-1/2 scale-75" style={{ bottom: "2%" }}>
                        <Climber streak={0} mood="idle" />
                      </div>
                    </>
                  }
                />
              </div>
            }
            startLabel={`Indítás — ${level}. pálya`}
            startTestId="wl-start"
            onStart={startGame}
            best={bestScore}
            menuKey="ladder"
            secondary={
              <>
                <Link href="/games" className="game-btn game-btn-secondary" data-testid="wl-back">
                  <ArrowLeft className="h-5 w-5" aria-hidden="true" />
                  Játékok
                </Link>
                <GamePedagogyPanel
                  accent="amber"
                  className="game-btn game-btn-secondary min-h-[48px] w-full justify-center border-white/20 bg-white/10 text-base"
                  kidMission={`Mássz fel a létra tetejére a 🏁 zászlóig! Minden jó válasz egy fokkal feljebb visz és XP-t ad. Ha tévedsz, megcsúszol egy fokot — de a zöld lap megmutatja a jó választ, és jön a következő kérdés. Minden évfolyamon 10 pálya vár: a pálya teljesítése nyitja a következőt. Válaszolhatsz az 1–4 gombbal is.`}
                  parentBody={
                    <>
                      <strong className="text-amber-100/90">Tananyag:</strong> magyar–{langLabel.name.toLowerCase()} szavak, témakör-szószedetek, kifejezések, rendhagyó és szabályos alakok, hétköznapi helyzetek, mindkét fordítási irányban; évfolyamonként 10, fokozatosan nehezedő pálya (progresszív gyakorlás). A kérdések a kézi bankból és a központi szóbankból jönnek; a már látott szavak a következő futásokban sem ismétlődnek, amíg van új.
                      <br />
                      <strong className="text-amber-100/90">Fejleszt:</strong> memória, kontextusból következtetés, kitartás a hiba után is.
                      <br />
                      <span className="text-white/70">
                        Hibás válasznál a helyes megoldás zölden felvillan (azonnali korrekció), a látható mászás és a tájváltások tartják a figyelmet.
                      </span>
                    </>
                  }
                />
              </>
            }
            settings={
              <div className="flex flex-col gap-4 py-1" data-testid="wl-settings">
                <div data-testid="wl-lang-picker">
                  <p className="mb-1.5 text-sm font-bold text-white/85">Nyelv</p>
                  <div className="grid grid-cols-3 gap-2" role="group" aria-label="Nyelv választása">
                    {WORD_LADDER_LANGUAGES.map((l) => {
                      const available = AVAILABLE_LANGUAGES.includes(l);
                      const selected = l === lang;
                      return (
                        <button
                          key={l}
                          type="button"
                          data-testid={`wl-lang-${l}`}
                          aria-pressed={selected}
                          aria-label={`${WORD_LADDER_LANGUAGE_LABELS[l].name}${available ? "" : " (hamarosan)"}`}
                          disabled={!available}
                          onClick={() => pickLanguage(l)}
                          className={`min-h-[52px] rounded-xl border px-2 py-1.5 text-base font-bold leading-tight transition-colors ${
                            selected
                              ? "bg-sky-500 border-sky-200 text-slate-950"
                              : available
                                ? "bg-black/30 border-white/25 text-white hover:bg-white/10"
                                : "cursor-not-allowed bg-black/40 border-white/10 text-white/50"
                          }`}
                        >
                          {WORD_LADDER_LANGUAGE_LABELS[l].name}
                          {available ? null : <span className="block text-sm font-semibold">hamarosan</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div data-testid="wl-grade-picker">
                  <p className="mb-1.5 text-sm font-bold text-white/85">
                    Évfolyam: <strong className="text-amber-200">{ladderGrade}.</strong>
                  </p>
                  <div className="grid grid-cols-5 gap-2">
                    {LADDER_GRADES.map((g) => (
                      <button
                        key={g}
                        type="button"
                        aria-pressed={ladderGrade === g}
                        aria-label={`${g}. évfolyam`}
                        onClick={() => pickGrade(g)}
                        className={`min-h-[52px] rounded-xl border px-1 py-1.5 text-base font-bold transition-colors ${
                          ladderGrade === g
                            ? "bg-amber-500 border-amber-200 text-slate-950"
                            : "bg-black/30 border-white/25 text-white hover:bg-white/10"
                        }`}
                      >
                        {g}.
                      </button>
                    ))}
                  </div>
                </div>
                <GradeLevelPicker
                  value={level}
                  unlocked={unlocked}
                  onChange={setLevel}
                  label={`Pálya — ${ladderGrade}. évfolyam, ${langLabel.name.toLowerCase()}`}
                />
              </div>
            }
          >
            <p className="wl-menu-info text-center text-base font-semibold text-white/90" data-testid="wl-menu-info">
              {RUNGS} fok a zászlóig · szint: <span className="text-amber-200">{levelTierLabel}</span> · legjobb sorozat:{" "}
              <strong className="text-orange-300">{bestStreak}</strong>
            </p>
            <p data-game-sync className="wl-menu-sync mt-2 text-center text-sm text-amber-100/80">
              {syncBanner}
            </p>
          </StartScreen>
        ) : (
          <>
            <GameHud
              onPause={pauseGame}
              stats={[
                {
                  id: "xp",
                  label: "XP",
                  value: (
                    <span data-testid="wl-total-xp" className="inline-flex items-center gap-1 text-amber-200">
                      {totalXp}
                    </span>
                  ),
                },
                {
                  id: "streak",
                  label: "Sorozat",
                  tone: streak >= 3 ? "warn" : "default",
                  value: (
                    <span data-testid="wl-streak" className="inline-flex items-center gap-1">
                      <Flame className={streak >= 5 ? "h-5 w-5 text-orange-300" : "h-4 w-4 text-orange-300"} aria-hidden="true" />
                      {streak}
                    </span>
                  ),
                },
                { id: "level", label: "Pálya", value: `${runRef.current.level}.` },
              ]}
              progress={{
                value: rung,
                max: RUNGS,
                label: `${rung}/${RUNGS} fok`,
              }}
            />
            <div className="wl-stage flex-1 flex gap-2 sm:gap-3 min-h-0 mt-2">
              {/* LÉTRA */}
              <div
                ref={ladderColumnRef}
                className={`wl-ladder relative shrink-0 ${ladder3d ? "rounded-2xl overflow-hidden border border-white/15" : ""}`}
                data-testid="wl-ladder"
              >
                <LadderScene3D
                  rung={rung}
                  total={RUNGS}
                  zoneId={zone.id}
                  streak={streak}
                  mood={climberMood}
                  fallback={<Ladder rung={rung} total={RUNGS} />}
                  onSupportedChange={onLadderSupported}
                  onClimberScreenPct={onClimberScreenPct}
                />
                {/* A 3D mászó látszik; ez a DOM-mászó (testid) akkor átlátszó helyőrző, de együtt mozog. */}
                <motion.div
                  className="absolute left-1/2 z-10"
                  style={{ x: "-50%", opacity: ladder3d ? 0 : 1 }}
                  animate={{
                    bottom: `${climberBottomPct}%`,
                    // S6/7: zuhanásnál bukfenc, lépésnél guggolás-nyújtás; csökkentett mozgásnál csak elmozdulás.
                    rotate: stepping && stepDelta < 0 ? [0, 360] : 0,
                    scaleY: stepping && stepDelta > 0 ? [1, 1, 0.85, 1.08, 1] : 1,
                    scaleX: stepping && stepDelta > 0 ? [1, 1, 1.1, 0.95, 1] : 1,
                  }}
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : {
                          bottom: { type: "spring", stiffness: 260, damping: 18 },
                          rotate: { duration: 0.55, ease: "easeInOut" },
                          scaleY: { duration: 0.64, times: [0, 0.75, 0.85, 0.93, 1] },
                          scaleX: { duration: 0.64, times: [0, 0.75, 0.85, 0.93, 1] },
                        }
                  }
                  data-testid="wl-climber"
                >
                  <Climber streak={streak} mood={climberMood} />
                </motion.div>
                <AnimatePresence>
                  {lastXpGain !== null && (
                    <motion.div
                      key={`${cursor}-${lastXpGain}`}
                      className="absolute left-1/2 z-20 -translate-x-1/2 rounded-full bg-amber-400/90 px-2 py-0.5 text-base font-black text-slate-950 shadow-lg"
                      style={{ bottom: `min(92%, calc(var(--wl-climber-pct, ${climberBottomPct}%) + 14%))` }}
                      initial={reducedMotion ? false : { opacity: 0, y: 8, scale: 0.6 }}
                      animate={{ opacity: 1, y: reducedMotion ? 0 : -18, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reducedMotion ? 0 : 0.6, type: "spring", stiffness: 380, damping: 16 }}
                    >
                      +{lastXpGain}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* KVÍZ — a létra mellett, mindig látszik a mászás. 3D módban a DOM átlátszó érintési réteg. */}
              <motion.div
                ref={quizPanelRef}
                animate={quizControls}
                className="relative flex-1 flex flex-col rounded-2xl border border-white/15 bg-black/35 p-3 sm:p-4 min-w-0 min-h-0"
                data-testid="wl-quiz"
                data-quiz3d={quiz3dOn ? "true" : "false"}
              >
                {quiz3dWanted && current ? (
                  <QuizBoard3D
                    questionKey={`${cursor}:${current.id}`}
                    prompt={current.prompt}
                    options={current.options}
                    states={tileStates}
                    interactive={phase === "quiz" && !paused}
                    layoutRef={quizPanelRef}
                    onAnswer={answerFromBoard}
                    onSupportedChange={setQuiz3dSupported}
                  />
                ) : null}
                <p className="wl-zone-line relative mb-1 flex items-center justify-between gap-2 text-sm font-bold text-amber-200/90">
                  <span className="truncate">{zone.name}</span>
                  <span className="shrink-0 tabular-nums text-white/75">{runSeconds} mp</span>
                </p>
                {current ? (
                  <>
                    <div className="wl-prompt-area relative flex min-h-0 flex-1 flex-col justify-center">
                      <p
                        className={`relative mb-2 ${
                          quiz3dOn
                            ? "wl-prompt3d px-4 py-3 text-center text-[22px] leading-[29px] font-extrabold opacity-0"
                            : "wl-prompt text-center text-xl sm:text-2xl font-extrabold leading-snug"
                        }`}
                        data-testid="wl-prompt"
                        data-quiz3d-prompt
                      >
                        {current.prompt}
                      </p>
                      <div className="relative min-h-[1.75rem] text-center">
                        <AnimatePresence mode="wait">
                          {feedback && (
                            <motion.p
                              key={feedback}
                              initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              className={`text-base font-bold ${chosenIdx !== null && chosenIdx !== current.correctIndex ? "text-rose-200" : "text-emerald-200"}`}
                              data-testid="wl-feedback"
                            >
                              {feedback}
                            </motion.p>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                    <div className="wl-answers relative mt-auto grid gap-2 pt-2">
                      {current.options.map((opt, idx) => {
                        const isCorrectOpt = idx === current.correctIndex;
                        const isChosen = chosenIdx === idx;
                        let cls = quiz3dOn
                          ? "wl-opt3d relative h-auto py-2.5 pl-[50px] pr-3 text-left justify-start whitespace-normal text-[20px] leading-[25px] font-bold border rounded-2xl "
                          : "wl-opt game-answer-btn relative flex items-center h-auto py-2.5 px-3 text-left justify-start whitespace-normal font-bold border rounded-2xl ";
                        if (revealing && isCorrectOpt) cls += "bg-emerald-500 text-white border-emerald-200 ring-2 ring-emerald-200";
                        else if (revealing && isChosen) cls += "bg-rose-500 text-white border-rose-200";
                        else if (revealing) cls += "bg-white/5 text-white/60 border-white/10";
                        else cls += "text-white border-white/20";
                        return (
                          <button
                            key={idx}
                            type="button"
                            className={cls}
                            disabled={phase !== "quiz" || paused}
                            onClick={() => onAnswer(idx)}
                            data-testid={`wl-option-${idx}`}
                            data-quiz3d-option={idx}
                            data-state={revealing ? (isCorrectOpt ? "correct" : isChosen ? "wrong" : "idle") : "idle"}
                            aria-keyshortcuts={ANSWER_KEYS[idx]}
                            {...correctDataAttrs(idx === current.correctIndex)}
                          >
                            <span
                              className={`wl-badge inline-flex w-8 h-8 items-center justify-center rounded-full bg-black/30 text-sm font-black shrink-0 ${
                                quiz3dOn ? "absolute left-3 top-1/2 -translate-y-1/2" : "mr-3"
                              }`}
                            >
                              {revealing && isCorrectOpt ? <Check className="w-5 h-5" /> : revealing && isChosen ? <X className="w-5 h-5" /> : ANSWER_KEYS[idx]}
                            </span>
                            <span>{opt}</span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : phase === "won" ? null : (
                  <p className="text-base text-white/80">Egy pillanat…</p>
                )}
              </motion.div>
            </div>
          </>
        )}
      </main>

      {/* Mérföldkő / sorozat felirat */}
      <AnimatePresence>
        {banner && (
          <motion.div
            key={banner}
            className="pointer-events-none fixed inset-x-0 top-[18%] z-[58] flex justify-center px-4"
            initial={reducedMotion ? false : { opacity: 0, scale: 0.8, y: 10 }}
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
        /* S6 — játék közben: a HUD a biztonsági sávot a saját margójával tartja, ezért a main nem ad még egy felső sávot. */
        .game-shell-fixed[data-game="WordLadderHuEn"] > main.wl-play { padding-top: 0; }
        .game-shell-fixed[data-game="WordLadderHuEn"] > main.wl-play > .game-hud { margin-left: 0; margin-right: 0; }
        .game-shell-fixed[data-game="WordLadderHuEn"] .wl-ladder { width: clamp(76px, 22vw, 112px); }
        @media (max-height: 500px) and (min-width: 560px) {
          .game-shell-fixed[data-game="WordLadderHuEn"] .wl-ladder { width: clamp(84px, 14vw, 128px); }
        }
        /* S6 / terv 4.6/2 — nagy, hüvelykujjal elérhető válaszgombok: min. 56 px, 1 oszlop ≤ 390 px, fölötte 2. */
        .game-shell-fixed[data-game="WordLadderHuEn"] [data-testid="wl-quiz"] .wl-answers button {
          min-height: 56px;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: transform .12s ease, background-color .15s ease, box-shadow .15s ease;
        }
        .game-shell-fixed[data-game="WordLadderHuEn"] [data-testid="wl-quiz"] .wl-answers button.wl-opt[data-state="idle"] {
          background-color: #17406a;
          border-color: #6fc3d6aa;
          box-shadow: inset 0 1px 0 #ffffff26, inset 0 -4px 0 #0a2540, 0 4px 12px #0006;
        }
        .game-shell-fixed[data-game="WordLadderHuEn"] [data-testid="wl-quiz"] .wl-answers button.wl-opt[data-state="idle"]:not(:disabled):hover { background-color: #1f5486; }
        .game-shell-fixed[data-game="WordLadderHuEn"] [data-testid="wl-quiz"] .wl-answers button.wl-opt:not(:disabled):active {
          transform: translateY(2px) scale(.985);
          box-shadow: inset 0 1px 0 #ffffff1a, inset 0 -1px 0 #0a2540;
        }
        .game-shell-fixed[data-game="WordLadderHuEn"] [data-testid="wl-quiz"] .wl-answers button.wl-opt .wl-badge {
          background: linear-gradient(180deg, #fbbf24, #f59e0b); color: #1f1300; box-shadow: 0 2px 0 #92400e;
        }
        .game-shell-fixed[data-game="WordLadderHuEn"] [data-testid="wl-quiz"] .wl-answers button.wl-opt[data-state="correct"] .wl-badge,
        .game-shell-fixed[data-game="WordLadderHuEn"] [data-testid="wl-quiz"] .wl-answers button.wl-opt[data-state="wrong"] .wl-badge {
          background: #ffffff33; color: #fff; box-shadow: none;
        }
        .game-shell-fixed[data-game="WordLadderHuEn"] [data-testid="wl-quiz"] .wl-answers button:disabled { opacity: 1; }
        .game-shell-fixed[data-game="WordLadderHuEn"] .wl-answers { grid-template-columns: 1fr; }
        @media (min-width: 391px) {
          .game-shell-fixed[data-game="WordLadderHuEn"] .wl-answers { grid-template-columns: 1fr 1fr; }
        }
        .game-start .wl-start-icon canvas { border-radius: inherit; }
        /* A közös jelvény-értesítő az eredménykártya fölött, a felső biztonsági sávon belül jelenjen meg. */
        .wl-achievements [data-testid^="achievement-toast-"] { z-index: 90; top: max(8px, var(--game-safe-top)); }
        /* 3D kérdés (spec 7. döntés): a DOM-gomb átlátszó érintési réteg a 3D lap fölött; a fókuszkeret látszik. */
        .game-shell-fixed[data-game="WordLadderHuEn"] [data-testid="wl-quiz"][data-quiz3d="true"] {
          background: #071b2d;
        }
        .game-shell-fixed[data-game="WordLadderHuEn"] [data-testid="wl-quiz"][data-quiz3d="true"] .wl-answers button,
        .game-shell-fixed[data-game="WordLadderHuEn"] [data-testid="wl-quiz"][data-quiz3d="true"] .wl-answers button[data-state] {
          background: transparent !important;
          border-color: transparent !important;
          color: transparent !important;
          box-shadow: none !important;
          --tw-ring-shadow: 0 0 #0000 !important;
        }
        .game-shell-fixed[data-game="WordLadderHuEn"] [data-testid="wl-quiz"][data-quiz3d="true"] .wl-answers button:focus-visible {
          outline: 4px solid #fbbf24 !important;
          outline-offset: 3px;
        }
        .game-shell-fixed[data-game="WordLadderHuEn"] [data-testid="wl-quiz"][data-quiz3d="true"] .wl-answers button .wl-badge {
          opacity: 0;
        }
        .game-shell-fixed[data-game="WordLadderHuEn"] [data-testid="wl-quiz"][data-quiz3d="true"] .wl-answers button:disabled {
          opacity: 1;
        }
      `}</style>
      {explainCard && <QuizFeedbackCard card={explainCard} onDismiss={dismissExplain} />}

      <PauseMenu open={paused && inRun} onResume={resumeGame} onRestart={startGame} onExit={exitToMenu} exitLabel="Kilépés a menübe" />
      <ResultScreen
        open={phase === "won"}
        testId="wl-won"
        title="🏁 Elérted a csúcsot!"
        won
        score={sessionXp}
        best={result?.best ?? bestScore}
        isNewBest={result?.isNewBest ?? false}
        correct={correctCountRef.current}
        total={answered}
        onRetry={startGame}
        retryTestId="wl-restart"
        retryLabel={level > runRef.current.level ? `Tovább: ${level}. pálya` : "Újra"}
        onBack={() => navigate("/games")}
        extra={
          <div className="flex flex-col gap-1">
            <span>
              {RUNGS} fok · {runSeconds} mp · legjobb sorozat: {runBestStreakRef.current}
            </span>
            <span className="text-white/75">{syncEligibility?.eligible ? "Eredmény elküldve a szervernek." : syncBanner}</span>
          </div>
        }
      />
    </GameShell>
  );
}
