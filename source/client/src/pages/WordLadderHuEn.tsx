/**
 * Szólétra → „Szikla-verseny” (terv docs/specs/2026-11-16-jatekok-jatekelmeny.md 5.2; végrehajtás J2a).
 *
 * VALÓDI mászóverseny: a gyerek egy sziklafalon mászik a gépi rivális („Villám”) ellen. A VÁLASZ MAGA A KAPASZKODÓ: a
 * kérdés-sáv (`InlineQuestion mode="bar"`) csak a promptot és az időcsíkot mutatja, a négy válasz a falon lévő fogás
 * (`wl-option-<i>`). Jó fogás → feljebb (kombó ×2-től kettőt), rossz → a fogás letörik, egy fok csúszás, a helyes fogás
 * 2 mp-ig zölden világít — a rivális közben mászik tovább. Nincs kötelező várakozás: a következő fogás a megoldás-kijelzés
 * után azonnal megragadható. Veszíteni is lehet (a rivális ér fel előbb); a végén eredmény „Gyakorold még” listával és
 * visszavágóval.
 *
 * Rétegek (KSZ-1): a mag tiszta TS (`L/wordLadder/core.ts`, fix 1/60 s lépés, seedelt RNG) → a 3D jelenet csak olvas
 * (`LadderScene3D variant="race"`, a `live` refen át, React-render nélkül) → React UI (HUD ≤ 10 Hz, kérdés-sáv, menük).
 * A kérdés-életciklus a közös `usePlayQuestion` (J0c): minden fogás egy kérdés — amint lehet, a lap kér egyet.
 */
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
import { ArrowLeft, Check, Flame, X } from "lucide-react";
import { useReducedMotion } from "framer-motion";
import { createRng, seedFrom, type Rng } from "@shared/game-rng";
import { queryClient } from "@/lib/queryClient";
import GamePedagogyPanel from "@/components/GamePedagogyPanel";
import { gameSyncBannerText, useSyncEligibilityQuery } from "@/hooks/useGameScoreSync";
import { useMaterialQuizzes } from "@/hooks/useMaterialQuizzes";
import { useClassroomGrade } from "@/lib/classroomStore";
import { sfxCombo, sfxGate, sfxLevelUp, sfxWarning } from "@/lib/audioEngine";
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
import { correctDataAttrs, installGameTestApi, readGameSeed } from "@/game-engine/game-test-hooks";
import { LADDER_ZONES, xpForCorrect } from "@/lib/wordLadderLogic";
import {
  createLadderLevelSession,
  ladderRungsForLevel,
  ladderTierForLevel,
  milestoneForProgress,
  wordLadderGameId,
  zoneForProgress,
} from "@/lib/wordLadderLevels";
import {
  FIRST_HOLD_MS,
  FREE_GRIP_COOLDOWN_MS,
  RIVAL_WARMUP_MS,
  answer as applyLadderAnswer,
  climbTarget,
  createLadderState,
  drainEvents,
  finishBonusXp,
  freeGrab,
  lossTitle,
  rivalBaseRungPerSec,
  rivalSecPerRungForLevel,
  step as stepLadder,
  type LadderEvent,
  type LadderState,
} from "@/lib/wordLadder/core";
import { WORD_LADDER_GAME_ID, wordLadderDirectorConfig } from "@/lib/wordLadder/sim";
import { createRunWordGuard, ownsReviewKey, speechPlan } from "@/lib/wordLadder/review";
import { GradeLevelPicker } from "@/game-engine/GradeLevelPicker";
import { loadUnlockedLevel, unlockNextLevel } from "@/game-engine/gradeLevels";
import { detectLookTier } from "@/game-engine/three-look/tier";
import QuizFeedbackCard from "@/game-engine/QuizFeedbackCard";
import LadderScene3D, { type LadderLive } from "@/game-engine/scenes/LadderScene3D";
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
  useOrientation,
  type GameScreenState,
} from "@/game-engine/mobile";
import { createSeenHistory, externalKey, safeLocalStorage, useVocabQuizSource } from "@/game-engine/vocab";
import { mergeVocabTiers, VOCAB_POOL_PER_LEVEL, vocabIdOfLadderItem, type VocabMeaning } from "@/lib/wordLadderVocab";
import { loadVocabBank } from "@/data/vocabBank/loader";
import {
  InlineQuestion,
  PlaySpeechToggle,
  ResultReview,
  bankPlayQuestion,
  createFeel,
  createFixedLoop,
  materialPlayQuestion,
  restoreReviewQuestion,
  useGameSpeech,
  usePlayQuestion,
  type PlayQuestion,
  type PlayQuestionApi,
  type QuestionOutcome,
  type QuestionPresentation,
  type QuestionProvider,
  type ShakeOffset,
} from "@/game-engine/play";

import { newScoreRunId, postGameScore } from "@/lib/gameScoreRunId";
const LS_XP = "websuli-wordladder-xp";
const LS_BEST = "websuli-wordladder-streak";

type Quiz = FourChoiceQuiz;

/** A rivális neve (kedves, nem gúnyos — terv 4.2). */
const RIVAL_NAME = "Villám";

/** A Szólétra évfolyam-választója: 3–12. */
const LADDER_GRADES = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** Billentyűzet: az 1–4 szám a négy kapaszkodót jelöli (a fogásokon is ez a jelvény; a kérdés-sáv kezeli). */
const ANSWER_KEYS = ["1", "2", "3", "4"];

const LADDER_LEVELS = [0, 1, 2, 3, 4] as const;

/** A tanító sor (K.4/25: egy mechanika, szöveg ≤ 1 sor) — az első 30 mp-ben látszik. */
const TEACH_HINT = "Koppints a jó szóra — azzal kapaszkodsz feljebb!";

/** A kezdőképernyő sötét égbolt-háttere: a világos réti színen a fehér feliratok nem olvashatók. */
const MENU_BACKGROUND =
  "radial-gradient(ellipse 90% 55% at 50% 18%, #38bdf84d, transparent 70%), linear-gradient(175deg, #0c2a5c 0%, #10406a 45%, #0f5a4a 80%, #14532d 100%)";

/** Ennél hosszabb kapaszkodó-felirat (kifejezés, mondat) esetén álló nézetben egy oszlopban jönnek a fogások. */
const LONG_HOLD = 24;

/**
 * A fogások CSS-hatóköre: az index.css régi Szólétra-szabálya (`[data-testid="wl-quiz"] button`, kék lap) erősebb egy
 * puszta osztálynál — a hatókörrel a kapaszkodó-stílus nyer (a közös fájl rendbetétele: ORKESZTRÁTOR-KÉRÉS).
 */
const HOLD_SCOPE = '.game-shell-fixed[data-game="WordLadderHuEn"] [data-testid="wl-quiz"]';
const HOLD = `${HOLD_SCOPE} .wl-hold`;

/** A részecske-készlet mérete (KSZ-6: előre rögzített pool). */
const PARTICLE_POOL = 18;

function clampLadderGrade(grade: number): number {
  return Math.min(12, Math.max(3, Math.round(grade)));
}

/** Fázisok (K.4/11): menu → play (a kérdés a play al-állapota) → result. A szünet a play fölötti réteg. */
type Phase = "menu" | "play" | "result";

type RunResult = {
  won: boolean;
  missing: number;
  xp: number;
  bonus: number;
  correct: number;
  total: number;
  seconds: number;
  bestCombo: number;
  best: number;
  isNewBest: boolean;
  level: number;
};

type HudSnap = { rung: number; rival: number; target: number; combo: number; xp: number };

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

/** A nap kulcsa a seedhez (KSZ-3: `seedFrom(gameId, dátum, kör)`), helyi idő szerint. */
function dayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A pálya nehézségi sávja a score-hoz (meglévő enum): 1–3 könnyű, 4–7 normál, 8–10 nehéz. */
function difficultyForLevel(level: number): "easy" | "normal" | "hard" {
  return level <= 3 ? "easy" : level <= 7 ? "normal" : "hard";
}

// ---------------------------------------------------------------------------------
// WebGL nélküli tartalék: két létra, két mászó (SVG), a HUD 10 Hz-es pillanatképéből
// ---------------------------------------------------------------------------------

function RaceFallback({ rung, rival, total }: { rung: number; rival: number; total: number }) {
  const H = 400;
  const top = 24;
  const bottom = H - 16;
  const y = (r: number) => bottom - (Math.min(total, Math.max(0, r)) / Math.max(1, total)) * (bottom - top);
  const ladder = (x: number, color: string) => (
    <g>
      <rect x={x - 22} y={8} width={7} height={H - 10} rx={3} fill={color} />
      <rect x={x + 15} y={8} width={7} height={H - 10} rx={3} fill={color} />
      {Array.from({ length: Math.min(40, total) }).map((_, i) => (
        <rect key={i} x={x - 16} y={y(i + 1) - 2} width={32} height={4} rx={2} fill={color} opacity={0.75} />
      ))}
    </g>
  );
  return (
    <svg viewBox={`0 0 200 ${H}`} className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect x={20} y={0} width={70} height={H} rx={14} fill="#8a6a4f" opacity={0.55} />
      <rect x={110} y={0} width={70} height={H} rx={14} fill="#8a6a4f" opacity={0.55} />
      {ladder(55, "#c98b4a")}
      {ladder(145, "#a47a52")}
      <text x={100} y={18} textAnchor="middle" fontSize={16}>🏁</text>
      <circle cx={55} cy={y(rung) - 10} r={10} fill="#38bdf8" stroke="#0369a1" strokeWidth={2} />
      <circle cx={145} cy={y(rival) - 10} r={10} fill="#a855f7" stroke="#6b21a8" strokeWidth={2} />
    </svg>
  );
}

/** A választható nyelvek (csak a tételt exportáló bankok) — oldalbetöltésenként egyszer. */
const AVAILABLE_LANGUAGES = availableLadderLanguages(WORD_LADDER_BANKS);

export default function WordLadderHuEn() {
  const reducedMotion = useReducedMotion() ?? false;
  const [, navigate] = useLocation();
  const haptics = useHaptics();
  const orientation = useOrientation();
  const { best: bestScore, submit: submitBest } = useBestScore("word-ladder-hu-en");
  const [phase, setPhase] = useState<Phase>("menu");
  const phaseRef = useRef<Phase>("menu");
  phaseRef.current = phase;
  /** Szünet menü (HUD gomb, P billentyű, háttérbe kerülés). */
  const [menuOpen, setMenuOpen] = useState(false);
  /** „Miért?”: a magyarázókártya — alatta áll a menet (a kérdés-óra is). */
  const [why, setWhy] = useState<FeedbackCard | null>(null);
  /** A kérdés-sáv „Mutasd” (hosszú prompt kinyitva): ilyenkor is áll a menet (terv 8.9). */
  const [expanded, setExpanded] = useState(false);
  const paused = phase === "play" && (menuOpen || why !== null || expanded);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const [totalXp, setTotalXp] = useState(() => loadNum(LS_XP, 0));
  const [bestStreak, setBestStreak] = useState(() => loadNum(LS_BEST, 0));
  const [result, setResult] = useState<RunResult | null>(null);
  const [hud, setHud] = useState<HudSnap>({ rung: 0, rival: 0, target: 1, combo: 0, xp: 0 });
  /** Nincs kérdés (üres forrás, terv 8.1): szabad fogás látszik. */
  const [freeHold, setFreeHold] = useState(false);
  /** A 3D jelenet él-e (WebGL); különben az SVG-tartalék látszik. */
  const [scene3d, setScene3d] = useState<boolean | null>(null);
  const [teach, setTeach] = useState(false);
  /**
   * 3D kapaszkodó-lapok (spec 2026-09-29 7. döntés): csak valódi WebGL-lel és nem low szinten; különben a DOM-fogás
   * látszik. A szint oldalbetöltésenként egyszer dől el (`detectLookTier` gyorsítótáraz).
   */
  const [quiz3dWanted] = useState(() => quiz3dEnabled(detectLookTier(), null));
  const [quiz3dSupported, setQuiz3dSupported] = useState<boolean | null>(null);
  // Keskeny álló telefonon (< 600 px) a 2×2 rácsban a 3D lap nem tördeli a hosszú szót (20 px-es betű, vágott felirat —
  // képernyőkép 360×640): ott a DOM-kapaszkodó (tördel, ≥ 48 px) marad; szélesebb nézetben jön a 3D lap.
  const holds3dWanted = quiz3dWanted && (typeof window === "undefined" || window.innerWidth >= 600);
  const quiz3dOn = holds3dWanted && quiz3dSupported === true;
  const holdsRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const particlesRef = useRef<HTMLDivElement | null>(null);
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const bannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scoreSubmittedRef = useRef(false);

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

  // Csak `topic === "english"` material-tételeket fogad (a Szólétra szókincs-orientált); a forrásrend 1. helye (J7).
  const { grade: userGrade, setGrade: setClassroomGrade } = useClassroomGrade();
  const { items: materialItems } = useMaterialQuizzes(userGrade, "english");
  const materialQuizzes = useMemo<Quiz[]>(
    () =>
      lang !== "en"
        ? []
        : materialItems
            .filter((q) => Array.isArray(q.options) && q.options.length === 4)
            .map((q, idx) => ({
              id: q.id ?? `mat-${idx}`,
              prompt: q.prompt,
              options: q.options.slice(0, 4) as [string, string, string, string],
              correctIndex: q.correctIndex,
              // T-1: a bankból jövő magyarázat, ha a lecke exportja hozta.
              explanation: q.explanation ?? undefined,
            })),
    [lang, materialItems],
  );
  const materialRef = useRef(materialQuizzes);
  materialRef.current = materialQuizzes;

  /**
   * A nyelv bankjának öt szintje (A1 … B2, a `tier` mező szerint). Az angolhoz a szerver-bank is hozzájön; a statikus és
   * a szerver-bank azonos tartalmú tételei egyszer szerepelnek. A tananyag-kvízek a director `material()` ágán jönnek
   * (forrásrend), nem a szintlistában — így egy tétel nem jöhet két kulccsal kétszer.
   */
  const tiers = useMemo(() => {
    const base: Quiz[][] = ladderTiersFromBank(WORD_LADDER_BANKS[lang] ?? []);
    if (lang !== "en") return dedupeTiersByContent(base);
    const { easy, medium, hard } = splitBankItemsByTier(quizBankResponse?.items);
    return dedupeTiersByContent([[...base[0]!, ...easy], [...base[1]!, ...medium], [...base[2]!, ...hard], base[3]!, base[4]!]);
  }, [lang, quizBankResponse]);

  /**
   * S6 / A7 — a központi szóbank (mindhárom nyelven) a kézi bank MÖGÉ kerül. `null`, amíg tölt vagy ha a betöltés
   * hibázott: ilyenkor a játék a kézi bankkal megy (terv 5. szakasz). A bekötés ezzel az egy hívással kapcsolható ki.
   */
  const vocab = useVocabQuizSource(lang, true);
  const vocabRef = useRef(vocab);
  vocabRef.current = vocab;
  /** Futásonkénti számláló: a szóbank-készlet futásonként újraépül a tartós napló aktuális állapotából (review #419). */
  const [runSeq, setRunSeq] = useState(0);
  /** A futás kezdő szintje: a készlet csak e körül épül (±1 szint — a sáv ennyit mozdulhat). */
  const runTierRef = useRef(0);
  const [vocabTiers, setVocabTiers] = useState<LadderItem[][]>(() => LADDER_LEVELS.map(() => []));
  /**
   * A készlet a futás kezdete UTÁN épül (setTimeout 0): a teljes bankon szintenként 60 kérdés generálása telefonon
   * érezhető — az indítást nem akaszthatja meg. Addig (az első fogás előtt) a kézi bank kérdez.
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
  /** A bejegyzések két nyelvi alakja (term, hu): ütközés-szűrés, felolvasás (a betöltő gyorsítótáraz). */
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
  const vocabMeaningsRef = useRef(vocabMeanings);
  vocabMeaningsRef.current = vocabMeanings;
  const allTiers = useMemo(() => {
    // A tartós, játékok között közös napló egyetlen olvasása a készlet építésekor (futásonként, a runSeq miatt).
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
  /** A fal magassága: a pálya régi létrahosszából (`ladderRungsForLevel`, 8–20) a verseny-falra hangolva (core). */
  const wallFor = (l: number) => climbTarget(ladderRungsForLevel(l));
  const menuRungs = wallFor(level);
  const runRef = useRef({ lang, grade: ladderGrade, level, rungs: menuRungs });
  /** A futás sávja: a pálya sávjából indul, a pálya ±0,15-én belül mozog (spec 6. döntés). */
  const levelSessionRef = useRef(createLadderLevelSession(1));
  /** A futás ÖSSZES eddigi kérdése (azonosító + prompt) — ezek a futás végéig nem jönnek újra. */
  const seenRef = useRef<SeenItem[]>([]);

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

  /* ------------------------------------------------------------------------------------------------------------ */
  /* Kérdésforrás (K.2 forrásrend): tananyag → (ismétlés: a director) → kézi bank + szóbank a pálya sávja szerint   */
  /* ------------------------------------------------------------------------------------------------------------ */

  /** Hu → idegen irányú szóbank-kérdés célnyelvi szava: a válasz UTÁN hangzik el (különben elárulná a választ). */
  const speakAfterRef = useRef(new Map<string, string>());

  /** A felolvasás (J14) a kérdés szerkezetéből: idegen → magyar a megjelenéskor, magyar → idegen / cloze csak a válasz után. */
  const withSpeech = useCallback((q: PlayQuestion, term: string | undefined): PlayQuestion => {
    const rest: PlayQuestion = { ...q };
    delete rest.speakText;
    const plan = speechPlan(String(q.quiz.id ?? ""), term);
    if (plan.afterAnswer) speakAfterRef.current.set(q.key, plan.afterAnswer);
    else speakAfterRef.current.delete(q.key);
    return plan.atShow ? { ...rest, lang, speakText: plan.atShow } : { ...rest, lang };
  }, [lang]);

  const toPlayQuestion = useCallback(
    (item: Quiz | LadderItem): PlayQuestion => {
      const vocabId = vocabIdOfLadderItem(String(item.id ?? ""));
      const quiz: Quiz = { id: item.id, prompt: item.prompt, options: item.options.slice(), correctIndex: item.correctIndex, ...(item.explanation ? { explanation: item.explanation } : {}) };
      if (vocabId) {
        const term = vocabMeaningsRef.current?.get(vocabId)?.term;
        return withSpeech({ key: `vocab:${lang}:${vocabId}`, quiz, source: "vocab", lang }, term);
      }
      return bankPlayQuestion(WORD_LADDER_GAME_ID, quiz);
    },
    [lang, withSpeech],
  );

  /** A menet szó-őre: egy szó egy menetben csak egy irányban (review #454). */
  const wordGuardRef = useRef(createRunWordGuard<PlayQuestion>());

  const provider = useMemo<QuestionProvider>(
    () => ({
      couponOnly: false,
      material: () => {
        const seen = new Set(seenRef.current.map((s) => s.id));
        const m = materialRef.current.find((q) => !seen.has(String(q.id)));
        if (!m) return null;
        seenRef.current = [...seenRef.current, { id: String(m.id), prompt: m.prompt }];
        return materialPlayQuestion(m, { subject: "english" });
      },
      fresh: () => {
        // A meglévő választó: a futás sávjának szintjéről, a futásban még nem látott tétel (#135).
        // A futásban már megjelent szó (más irányú szóbank-kérdésként sem) nem jön újra új tételként.
        for (let attempt = 0; attempt < 8; attempt++) {
          const item = pickUnseen(tiersRef.current, ladderTierIndex(runRef.current.grade, levelSessionRef.current.band), seenRef.current);
          if (!item) return null;
          seenRef.current = [...seenRef.current, { id: String(item.id), prompt: item.prompt }];
          const q = toPlayQuestion(item);
          if (wordGuardRef.current.freshAllowed(q.key)) return q;
        }
        return null;
      },
      restore: (it) => {
        // A közös ismétlési sorból csak a SAJÁT tétel jön vissza (a nyelv szóbankja, a saját kézi bank, a saját
        // tananyag); a más játék / más nyelv tételét a director a menetre átugorja.
        const own = ownsReviewKey(it.key, {
          gameId: WORD_LADDER_GAME_ID,
          lang,
          bankIds: new Set(tiersRef.current.flat().map((q) => String(q.id))),
          materialKeys: new Set(materialRef.current.map((m) => `mat:${m.id}`)),
        });
        if (!own) return null;
        // Menet közbeni ismétlés: pontosan a már látott kérdés (ugyanaz az irány), nem újragenerált fordított változat.
        const again = wordGuardRef.current.sameAsShown(it.key);
        if (again) return again;
        const q = restoreReviewQuestion(it, { vocab: (l) => (l === lang ? vocabRef.current : null) });
        if (!q) return null;
        seenRef.current = [...seenRef.current, { id: String(q.quiz.id ?? q.key), prompt: q.quiz.prompt }];
        if (q.source === "vocab") return withSpeech(q, q.speakText);
        return q;
      },
    }),
    [lang, toPlayQuestion, withSpeech],
  );

  /* ------------------------------------------------------------------------------------------------------------ */
  /* A mag, a hurok, a kérdés-sáv                                                                                  */
  /* ------------------------------------------------------------------------------------------------------------ */

  const coreRef = useRef<LadderState>(createLadderState({ targetRung: menuRungs }));
  const worldRngRef = useRef<Rng>(createRng(seedFrom(WORD_LADDER_GAME_ID, "init", "world")));
  const fxRngRef = useRef<Rng>(createRng(seedFrom(WORD_LADDER_GAME_ID, "init", "fx")));
  const liveRef = useRef<LadderLive | null>(null);
  const clockRef = useRef(0);
  const fpsRef = useRef(60);
  const lastStartRef = useRef<number | null>(null);
  const freeAtRef = useRef<number>(Number.POSITIVE_INFINITY);
  const moodUntilRef = useRef(0);
  const sessionXpRef = useRef(0);
  const runCounterRef = useRef(0);
  const seedRef = useRef<number | string>(readGameSeed() ?? seedFrom(WORD_LADDER_GAME_ID, dayKey()));
  const pickedHoldRef = useRef<number | null>(null);

  const speech = useGameSpeech();
  const qRef = useRef<PlayQuestionApi | null>(null);
  /** A menet vége egyszer fut (a teszt-kampó és a képkocka-hurok is kérheti). */
  const endedRef = useRef(false);
  const directorConfig = useMemo(() => wordLadderDirectorConfig(ladderGrade), [ladderGrade]);

  const loop = useMemo(
    () =>
      createFixedLoop((dt) => {
        const st = coreRef.current;
        stepLadder(st, dt, qRef.current?.director?.intensity() ?? 0.5, worldRngRef.current);
      }),
    [],
  );
  const feel = useMemo(() => createFeel({ reducedMotion, loop, fxRng: () => fxRngRef.current.next() }), [reducedMotion, loop]);
  const feelRef = useRef(feel);
  feelRef.current = feel;

  /** Rövid felirat a fal fölött (mérföldkő, előzés, lendület) — közvetlen DOM-írás, React-render nélkül (KSZ-9). */
  const showBanner = useCallback((text: string, ms = 1400) => {
    const el = bannerRef.current;
    if (!el) return;
    el.textContent = text;
    el.dataset.show = "true";
    if (bannerTimerRef.current) clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = setTimeout(() => {
      if (bannerRef.current) bannerRef.current.dataset.show = "false";
    }, ms);
  }, []);

  /** Részecske-löket a fogásnál (KSZ-6: pool; csökkentett mozgásnál nincs). */
  const particleCursor = useRef(0);
  const burst = useCallback(
    (x: number, y: number, color: string, count: number) => {
      if (reducedMotion) return;
      const host = particlesRef.current;
      if (!host) return;
      const nodes = host.children;
      for (let k = 0; k < count && nodes.length > 0; k++) {
        const el = nodes[particleCursor.current % nodes.length] as HTMLElement;
        particleCursor.current += 1;
        const a = fxRngRef.current.next() * Math.PI * 2;
        const d = 34 + fxRngRef.current.next() * 46;
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        el.style.background = color;
        el.animate(
          [
            { transform: "translate(-50%, -50%) scale(1)", opacity: 1 },
            { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d - 18}px)) scale(0.3)`, opacity: 0 },
          ],
          { duration: 520, easing: "cubic-bezier(.2,.7,.3,1)" },
        );
      }
    },
    [reducedMotion],
  );

  /** A mag eseményei → kép + hang (+ rezgés) ugyanabban a képkockában (K.4/18). A kérdés-hangot a közös sáv adja. */
  const applyEvents = useCallback(
    (events: readonly LadderEvent[]) => {
      for (const ev of events) {
        if (ev.kind === "climb") {
          const target = coreRef.current.targetRung;
          const ms = milestoneForProgress(ev.from, ev.to, target);
          if (ms) showBanner(ms, 1800);
          else if (ev.gain >= 2) showBanner(`Lendület! +${ev.gain} fok`, 900);
          if (ev.gain >= 2) {
            feelRef.current.hitstop(50);
            sfxCombo(Math.min(5, Math.max(1, Math.floor(ev.combo / 3))) as 1 | 2 | 3 | 4 | 5);
          }
          moodUntilRef.current = clockRef.current + 700;
          const holds = holdsRef.current;
          const idx = pickedHoldRef.current;
          const btn = idx !== null ? holds?.querySelector<HTMLElement>(`[data-hold-index="${idx}"]`) : holds?.querySelector<HTMLElement>("[data-free-hold]");
          if (btn) {
            const r = btn.getBoundingClientRect();
            burst(r.left + r.width / 2, r.top + r.height / 2, ev.gain >= 2 ? "#fde047" : "#86efac", ev.gain >= 2 ? 12 : 8);
          }
        } else if (ev.kind === "slip") {
          feelRef.current.addTrauma(0.45);
          moodUntilRef.current = clockRef.current + 1200;
        } else if (ev.kind === "fumble" && ev.reason === "free-miss") {
          feelRef.current.addTrauma(0.25);
        } else if (ev.kind === "overtake") {
          if (ev.by === "player") {
            showBanner(`Megelőzted ${RIVAL_NAME}t! 🎉`, 1500);
            sfxGate();
          } else {
            showBanner(`${RIVAL_NAME} előzött — kapaszkodj utána!`, 1500);
            sfxWarning();
          }
        }
      }
    },
    [burst, showBanner],
  );

  const onOutcome = useCallback(
    (o: QuestionOutcome, p: QuestionPresentation) => {
      if (o.result === "aborted") return;
      const st = coreRef.current;
      if (st.phase !== "play") return;
      const correct = o.result === "correct";
      levelSessionRef.current.answer(correct);
      if (correct) {
        const add = xpForCorrect(st.combo.count);
        sessionXpRef.current += add;
        setTotalXp((t) => t + add);
      }
      applyLadderAnswer(st, o.result);
      if (st.combo.best > 0) setBestStreak((b) => (st.combo.best > b ? st.combo.best : b));
      applyEvents(drainEvents(st));
      // Hu → idegen irányú szóbank-kérdés: a válasz után hangzik el a célnyelvi szó (J14, nem árulja el előre).
      const term = speakAfterRef.current.get(p.question.key);
      if (term && p.question.lang) speech.say(term, p.question.lang);
    },
    [applyEvents, speech],
  );

  const q = usePlayQuestion({
    setup: { config: directorConfig, provider, startBand: 0.4, seed: seedRef.current },
    speech,
    onShow: (p) => {
      lastStartRef.current = p.startedAtSimMs;
      wordGuardRef.current.remember(p.question.key, p.question);
      // A tartós, játékok közötti szóbank-napló a MEGJELENÍTÉSKOR (a szóbank-motor szerződése, A7): szóbankos tételnél
      // `markAsked`, kézi tételnél a helyes válasz `markExternal`-lal (így ugyanaz a szó a bankból sem jön vissza).
      const vocabId = vocabIdOfLadderItem(String(p.question.quiz.id ?? ""));
      if (vocabId) vocabRef.current?.markAsked({ vocabId });
      else vocabRef.current?.markExternal(p.question.quiz.options[p.question.quiz.correctIndex] ?? "");
    },
    onOutcome,
  });
  qRef.current = q;

  /** Egy fogás megragadása (a kapaszkodó koppintása / kattintása). */
  const grab = useCallback((idx: number) => {
    if (pausedRef.current || phaseRef.current !== "play") return;
    pickedHoldRef.current = idx;
    qRef.current?.pick(idx, clockRef.current);
  }, []);

  /** Szabad fogás (nincs kérdés). */
  const grabFree = useCallback(() => {
    if (pausedRef.current || phaseRef.current !== "play") return;
    const st = coreRef.current;
    pickedHoldRef.current = null;
    freeGrab(st, true);
    applyEvents(drainEvents(st));
    freeAtRef.current = clockRef.current + FREE_GRIP_COOLDOWN_MS;
    setFreeHold(false);
  }, [applyEvents]);

  const endRun = useCallback(
    (won: boolean) => {
      if (endedRef.current) return;
      endedRef.current = true;
      const st = coreRef.current;
      const ctl = qRef.current;
      const stats = ctl?.director?.stats(clockRef.current);
      const bonus = finishBonusXp(st);
      const xp = sessionXpRef.current + bonus;
      if (bonus > 0) setTotalXp((t) => t + bonus);
      const run = runRef.current;
      const best = submitBest(xp);
      const missing = Math.max(1, st.targetRung - st.rung);
      setResult({
        won,
        missing,
        xp,
        bonus,
        correct: stats?.correct ?? 0,
        total: (stats?.answered ?? 0) + (stats?.timeouts ?? 0),
        seconds: Math.round(clockRef.current / 1000),
        bestCombo: st.combo.best,
        best: best.best,
        isNewBest: best.isNewBest,
        level: run.level,
      });
      if (won) {
        sfxLevelUp();
        haptics("success");
        // A pálya teljesítése a következő pályát nyitja (nyelvenként és évfolyamonként).
        const next = unlockNextLevel(wordLadderGameId(run.lang), run.grade, run.level);
        setUnlocked(next);
        setLevel(Math.min(next, run.level + 1));
      }
      setMenuOpen(false);
      setWhy(null);
      setExpanded(false);
      setFreeHold(false);
      setPhase("result");
    },
    [submitBest, haptics],
  );

  const startGame = useCallback(() => {
    scoreSubmittedRef.current = false;
    endedRef.current = false;
    runCounterRef.current += 1;
    const n = runCounterRef.current;
    const total = wallFor(level);
    runRef.current = { lang, grade: ladderGradeRef.current, level, rungs: total };
    levelSessionRef.current.reset(level);
    runTierRef.current = ladderTierIndex(runRef.current.grade, levelSessionRef.current.band);
    seenRef.current = [];
    wordGuardRef.current.reset();
    speakAfterRef.current.clear();
    // Csak fejlesztői módban: ?rung=N kezdőfok a zónaváltások / cél gyors ellenőrzéséhez.
    let startRung = 0;
    if (import.meta.env.DEV) {
      const v = parseInt(new URLSearchParams(window.location.search).get("rung") ?? "", 10);
      if (Number.isFinite(v)) startRung = Math.max(0, Math.min(total - 1, v));
    }
    const seed = seedRef.current;
    coreRef.current = createLadderState({ targetRung: total, startRung, baseRungPerSec: rivalBaseRungPerSec(rivalSecPerRungForLevel(level)) });
    worldRngRef.current = createRng(seedFrom(WORD_LADDER_GAME_ID, seed, "world", n));
    fxRngRef.current = createRng(seedFrom(WORD_LADDER_GAME_ID, seed, "fx", n));
    clockRef.current = 0;
    lastStartRef.current = null;
    freeAtRef.current = Number.POSITIVE_INFINITY;
    moodUntilRef.current = 0;
    sessionXpRef.current = 0;
    pickedHoldRef.current = null;
    loop.reset();
    qRef.current?.reset(seedFrom(seed, n), 0.4);
    setVocabTiers(LADDER_LEVELS.map(() => []));
    setRunSeq((v) => v + 1);
    setResult(null);
    setMenuOpen(false);
    setWhy(null);
    setExpanded(false);
    setFreeHold(false);
    setTeach(true);
    setHud({ rung: startRung, rival: 0, target: total, combo: 0, xp: 0 });
    setPhase("play");
  }, [lang, level, loop]);
  const startGameRef = useRef(startGame);
  startGameRef.current = startGame;
  const endRunRef = useRef(endRun);
  endRunRef.current = endRun;

  const freeHoldRef = useRef(false);
  const directorConfigRef = useRef(directorConfig);
  directorConfigRef.current = directorConfig;

  /* ---------------- képkocka-hurok (rAF): kérdés-óra, sim, rázás, élő 3D-állapot ---------------- */
  useEffect(() => {
    if (phase !== "play") return;
    let raf = 0;
    let last: number | null = null;
    let fpsAcc = 0;
    let fpsFrames = 0;
    const shake: ShakeOffset = { x: 0, y: 0, rot: 0 };
    let shaking = false;
    const tick = (now: number) => {
      const dt = last === null ? 0 : Math.min(250, Math.max(0, now - last));
      last = now;
      fpsAcc += dt;
      fpsFrames += 1;
      if (fpsAcc >= 500) {
        fpsRef.current = Math.round((fpsFrames * 1000) / fpsAcc);
        fpsAcc = 0;
        fpsFrames = 0;
      }
      const isPaused = pausedRef.current;
      if (!isPaused) clockRef.current += dt;
      const clock = clockRef.current;
      const ctl = qRef.current!;
      const st = coreRef.current;
      // Menetvég a frame ELŐTT (J0c): a nyitott kérdés „megszakítva” zárul, a futó megoldás-kijelzés kifut.
      if (st.phase !== "play" && !ctl.finished()) ctl.finish();
      if (!isPaused) {
        ctl.frame(clock, { tick: false });
        // Minden fogás egy kérdés: amint nincs nyitott kérdés és lejárt a kijelzés, azonnal kérünk (a director a
        // minGap-et tartja; kijelzés alatt a kérés függőben vár és a kijelzés végén indul).
        if (st.phase === "play" && clock >= FIRST_HOLD_MS && !ctl.active()) {
          const v = ctl.view();
          // Kijelzés alatt egyszer kérünk (a kérés függőben vár) — képkockánkénti újrakérés React-frissítést okozna.
          if (!v.presentation || (v.reveal && v.pending === null)) {
            const p = ctl.request("trigger", clock);
            const minGap = directorConfigRef.current.minGapMs;
            const empty = !p && ctl.canAsk() && (lastStartRef.current === null || clock - lastStartRef.current >= minGap);
            if (empty && freeAtRef.current === Number.POSITIVE_INFINITY) freeAtRef.current = clock + (st.climbs === 0 ? 0 : FREE_GRIP_COOLDOWN_MS);
            if (p) freeAtRef.current = Number.POSITIVE_INFINITY;
          }
        }
        const wantFree = st.phase === "play" && !ctl.active() && clock >= freeAtRef.current;
        if (wantFree !== freeHoldRef.current) {
          freeHoldRef.current = wantFree;
          setFreeHold(wantFree);
        }
      }
      loop.setTimeScale(isPaused ? 0 : ctl.timeScale());
      loop.frame(now);
      feelRef.current.update(isPaused ? 0 : dt);
      // A rivális lépései (és a vég) a mag eseményeiből.
      const evs = drainEvents(st);
      if (evs.length) applyEvents(evs);
      // Élő állapot a 3D jelenetnek (React-render nélkül).
      const mood = clock < moodUntilRef.current ? (st.stunMs > 0 ? "oops" : "happy") : "idle";
      liveRef.current = {
        rung: st.rung,
        rivalRung: st.rival.rung,
        streak: st.combo.count,
        mood,
        zoneId: zoneForProgress(st.rung, st.targetRung).id,
      };
      // Rázás (KSZ-10: a közös trauma-modell; csökkentett mozgásnál 0).
      const stage = stageRef.current;
      if (stage) {
        feelRef.current.shakeOffset(shake, stage.clientHeight || 600);
        const moving = shake.x !== 0 || shake.y !== 0 || shake.rot !== 0;
        if (moving) {
          stage.style.transform = `translate3d(${shake.x.toFixed(2)}px, ${shake.y.toFixed(2)}px, 0) rotate(${shake.rot.toFixed(4)}rad)`;
          shaking = true;
        } else if (shaking) {
          stage.style.transform = "";
          shaking = false;
        }
      }
      if (ctl.settled()) {
        endRunRef.current(st.phase === "won");
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, loop, applyEvents]);

  // HUD ≤ 10 Hz (KSZ-9) + a tanító sor lekapcsolása 30 mp után.
  useEffect(() => {
    if (phase !== "play") return;
    const id = window.setInterval(() => {
      const st = coreRef.current;
      const next: HudSnap = { rung: st.rung, rival: Math.round(st.rival.pos * 10) / 10, target: st.targetRung, combo: st.combo.count, xp: sessionXpRef.current };
      setHud((h) => (h.rung === next.rung && h.rival === next.rival && h.target === next.target && h.combo === next.combo && h.xp === next.xp ? h : next));
      if (clockRef.current >= RIVAL_WARMUP_MS) setTeach(false);
    }, 100);
    return () => window.clearInterval(id);
  }, [phase]);

  /* ---------------- szünet, kilépés, billentyűk ---------------- */
  const pauseGame = useCallback(() => {
    if (phaseRef.current !== "play") return;
    setMenuOpen(true);
  }, []);
  const resumeGame = useCallback(() => setMenuOpen(false), []);
  const exitToMenu = useCallback(() => {
    qRef.current?.finish();
    setMenuOpen(false);
    setWhy(null);
    setExpanded(false);
    setFreeHold(false);
    setPhase("menu");
  }, []);

  // P = szünet játék közben; R = gyors újraindítás az eredmény- / kezdőképernyőn; Szóköz / ↑ = szabad fogás.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if ((e.key === "p" || e.key === "P") && phaseRef.current === "play") {
        e.preventDefault();
        setMenuOpen((m) => !m);
        return;
      }
      if ((e.key === " " || e.key === "ArrowUp") && freeHoldRef.current) {
        e.preventDefault();
        grabFree();
        return;
      }
      if ((e.key === "r" || e.key === "R") && (phaseRef.current === "result" || phaseRef.current === "menu")) {
        e.preventDefault();
        startGameRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [grabFree]);

  /* ---------------- „Miért?”: szünet + a valódi magyarázókártya (G-1) ---------------- */
  const openWhy = useCallback(() => {
    const item = qRef.current?.view().whyItem; // a vezérlő őrzi: az új kérdés nem írja felül (review #446)
    if (!item) return;
    setWhy(
      buildFeedback({
        quiz: {
          prompt: item.quiz.prompt,
          options: item.quiz.options,
          correctIndex: item.quiz.correctIndex,
          // A séma `null`-t is enged (régi sor); a motor `undefined`-ot vár.
          explanation: item.quiz.explanation ?? undefined,
        },
        chosenIndex: item.pickedOriginalIndex,
        attempt: 1,
        ageBand: "kid",
      }),
    );
  }, []);
  const closeWhy = useCallback(() => setWhy(null), []);

  /* ---------------- teszt-kampó (K.2) ---------------- */
  useEffect(() => {
    return installGameTestApi({
      forceState: (patch) => {
        if (patch.phase === "menu") exitToMenu();
        if (patch.phase === "play") startGameRef.current();
        if (patch.question || patch.phase === "quiz") qRef.current?.request("trigger", clockRef.current);
        if (patch.phase === "won" || patch.phase === "lost") {
          if (phaseRef.current !== "play") startGameRef.current();
          const st = coreRef.current;
          if (patch.phase === "won") st.rung = st.targetRung;
          else st.rival.pos = st.targetRung;
          st.phase = patch.phase;
          qRef.current?.finish();
          endRunRef.current(patch.phase === "won");
        }
      },
      probe: () => {
        const ctl = qRef.current;
        const st = coreRef.current;
        const stats = ctl?.director?.stats(clockRef.current);
        const p = ctl?.view().presentation ?? null;
        return {
          simTime: loop.simTimeMs(),
          questionOpen: ctl?.active() ? 1 : 0,
          questionsAnswered: stats?.answered ?? 0,
          questionsCorrect: stats?.correct ?? 0,
          fps: fpsRef.current,
          band: ctl?.director?.band() ?? null,
          intensity: ctl?.director?.intensity() ?? null,
          rung: st.rung,
          rivalRung: st.rival.rung,
          target: st.targetRung,
          combo: st.combo.count,
          phase: phaseRef.current === "play" ? st.phase : phaseRef.current,
          questionId: p?.id ?? null,
          reveal: ctl?.view().reveal ? 1 : 0,
          paused: pausedRef.current ? 1 : 0,
          clock: clockRef.current,
        };
      },
    });
  }, [exitToMenu, loop]);

  /* ---------------- pontszám, jelvények, napi kihívás — a menet végén egyszer ---------------- */
  useEffect(() => {
    if (phase !== "result" || !result) return;
    if (!syncEligibility?.eligible) return;
    if (scoreSubmittedRef.current) return;
    scoreSubmittedRef.current = true;
    void postGameScore({
      gameId: "word-ladder-hu-en",
      difficulty: difficultyForLevel(result.level),
      runXp: result.xp,
      runStreak: result.bestCombo,
      runSeconds: result.seconds,
      runId: newScoreRunId(),
    })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["/api/games/leaderboard"] });
      })
      .catch(() => {
        scoreSubmittedRef.current = false;
      });
  }, [phase, result, syncEligibility]);

  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[]>([]);
  const achievementCheckedRef = useRef(false);
  useEffect(() => {
    if (phase !== "result" || !result) {
      achievementCheckedRef.current = false;
      return;
    }
    if (achievementCheckedRef.current) return;
    achievementCheckedRef.current = true;
    const wasDailyAvailable = isTodaysGameAvailable("word-ladder-hu-en");
    const newOnes = recordRun({
      game: "word-ladder-hu-en",
      xpGained: result.xp,
      correctAnswers: result.correct,
      wrongAnswers: Math.max(0, result.total - result.correct),
      maxStreak: result.bestCombo,
      perfect: result.won && result.total === result.correct && result.correct >= 5,
      fullClear: result.won,
    });
    if (result.won && wasDailyAvailable) {
      const daily = markDailyCompleted();
      if (daily.achievements.length > 0) newOnes.push(...daily.achievements);
    }
    if (newOnes.length > 0) setNewlyUnlocked(newOnes);
  }, [phase, result]);

  /* ---------------- render ---------------- */
  const view = q.state;
  const presentation = view.presentation;
  const reveal = view.reveal;
  const answering = !!presentation && !reveal && !paused;
  const holdState = (i: number): TileState => (!reveal ? "idle" : i === reveal.correctOptionIndex ? "correct" : i === reveal.pickedOptionIndex ? "wrong" : "dim");
  const tileStates: TileState[] = (presentation?.options ?? []).map((_, i) => holdState(i));
  const zone = zoneForProgress(hud.rung, hud.target);
  const levelTierLabel = LADDER_TIER_LABELS[ladderTierForLevel(ladderGrade, level)];
  // A keret „paused” állapota csak a szünet menüé: a „Miért?”-kártya / kinyitott kérdés alatt is áll a menet, de a
  // háttérbe kerülés ilyenkor is szünet menüt nyit (K1/K3: a menü a kártya fölé kerül).
  const screenState: GameScreenState = phase === "menu" ? "start" : phase === "result" ? "result" : menuOpen ? "paused" : "playing";
  const lead = Math.round((hud.rung - hud.rival) * 10) / 10;
  const leadText = lead >= 1 ? `+${Math.floor(lead)} fok előnyöd van` : lead <= -1 ? `${RIVAL_NAME} ${Math.floor(-lead)} fokkal előtted` : "Fej fej mellett!";
  const rivalPct = Math.min(100, (hud.rival / Math.max(1, hud.target)) * 100);
  const youPct = Math.min(100, (hud.rung / Math.max(1, hud.target)) * 100);
  const wrongItems = q.director?.wrongList() ?? [];
  // Fekvő telefonon a fogások a két szélen vannak, a kártya fent: a mászók lejjebb ülnek a képen.
  const landscapePhone = orientation === "landscape" && typeof window !== "undefined" && window.innerHeight <= 520;
  const retryLabel = result?.won ? (level > result.level ? `Tovább: ${level}. pálya` : "Újra") : "Visszavágó!";

  return (
    <GameShell
      gameId="WordLadderHuEn"
      state={screenState}
      onAutoPause={pauseGame}
      style={{
        background:
          phase === "menu" ? MENU_BACKGROUND : phase === "result" && result?.won ? LADDER_ZONES[LADDER_ZONES.length - 1]!.background : zone.background,
        transition: "background 800ms ease",
      }}
    >
      <div className="wl-achievements">
        <AchievementToast achievements={newlyUnlocked} />
      </div>

      <main
        className={`relative z-10 w-full min-h-dvh flex flex-col ${phase === "menu" ? "" : "wl-play"}`}
        data-testid="wordladder-root"
        data-zone={zone.id}
        data-lang={lang}
      >
        {phase === "menu" ? (
          <StartScreen
            title="Szólétra"
            subtitle={`Szikla-verseny: mássz fel a 🏁 zászlóig ${RIVAL_NAME} előtt! Magyar ↔ ${langLabel.name.toLowerCase()} szavak, ${ladderGrade}. évfolyam.`}
            icon={
              <div className="wl-start-icon relative h-full w-full overflow-hidden rounded-[28px]">
                <LadderScene3D
                  variant="preview"
                  rung={0}
                  rivalRung={0}
                  total={menuRungs}
                  zoneId="meadow"
                  streak={0}
                  mood="idle"
                  fallback={<RaceFallback rung={0} rival={0} total={menuRungs} />}
                />
              </div>
            }
            startLabel={`Indítás — ${level}. pálya`}
            startTestId="wl-start"
            onStart={() => {
              speech.arm(); // J14 / LS-4: a felolvasás csak a játékos koppintása után élesedik
              startGame();
            }}
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
                  kidMission={`Verseny a sziklafalon! ${RIVAL_NAME} a szomszéd létrán mászik — érj fel előbb a 🏁 zászlóhoz! A kapaszkodókon szavak vannak: a jó szót megragadva feljebb mászol, három jó egymás után lendületet ad (két fokot ugrasz). Ha rossz fogást fogsz, megcsúszol egy fokot, és a helyes kapaszkodó zölden világít. Ha ${RIVAL_NAME} ér fel előbb, visszavágót kérhetsz. Válaszolhatsz az 1–4 gombbal is.`}
                  parentBody={
                    <>
                      <strong className="text-amber-100/90">Tananyag:</strong> magyar–{langLabel.name.toLowerCase()} szavak, témakör-szószedetek, kifejezések, mindkét fordítási irányban; évfolyamonként 10, fokozatosan nehezedő pálya. A kérdések a tananyagból, a kézi bankból és a központi szóbankból jönnek; az elrontott szó a menetben 3–6 kérdésen belül visszatér, és a következő napokon is előkerül (térközös ismétlés).
                      <br />
                      <strong className="text-amber-100/90">Fejleszt:</strong> szókincs, gyors felismerés, kitartás a hiba után is.
                      <br />
                      <span className="text-white/70">
                        Minden fogás egy kérdés (percenként 10+), a rivális tempója a gyerek szintjéhez igazodik: szoros, de legyőzhető verseny. A „Miért?” gomb megállítja a játékot és elmagyarázza a hibát.
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
                <PlaySpeechToggle />
              </div>
            }
          >
            <p className="wl-menu-info text-center text-base font-semibold text-white/90" data-testid="wl-menu-info">
              {menuRungs} fok a zászlóig · szint: <span className="text-amber-200">{levelTierLabel}</span> · legjobb sorozat:{" "}
              <strong className="text-orange-300">{bestStreak}</strong>
            </p>
            <p data-game-sync className="wl-menu-sync mt-2 text-center text-sm text-amber-100/80">
              {syncBanner}
            </p>
          </StartScreen>
        ) : (
          <>
            {/* A FAL: a 3D verseny-jelenet a teljes képernyőn, a HUD és a fogások mögött. */}
            <div ref={stageRef} className="wl-stage" data-testid="wl-stage" aria-hidden="true">
              <LadderScene3D
                variant="race"
                rung={hud.rung}
                rivalRung={Math.floor(hud.rival)}
                total={runRef.current.rungs}
                zoneId={zone.id}
                streak={hud.combo}
                mood="idle"
                live={liveRef}
                focus={landscapePhone ? 0.14 : 0.42}
                fallback={<RaceFallback rung={hud.rung} rival={hud.rival} total={hud.target} />}
                onSupportedChange={setScene3d}
              />
            </div>
            <GameHud
              onPause={pauseGame}
              stats={[
                {
                  id: "rung",
                  label: "Fok",
                  value: (
                    <span data-testid="wl-rung" className="tabular-nums">
                      {hud.rung}/{hud.target}
                    </span>
                  ),
                },
                {
                  id: "combo",
                  label: "Kombó",
                  tone: hud.combo >= 3 ? "warn" : "default",
                  value: (
                    <span data-testid="wl-streak" className="inline-flex items-center gap-1">
                      <Flame className={hud.combo >= 3 ? "h-5 w-5 text-orange-300" : "h-4 w-4 text-orange-300"} aria-hidden="true" />
                      {hud.combo >= 3 ? "×2" : hud.combo}
                    </span>
                  ),
                },
                {
                  id: "xp",
                  label: "XP",
                  value: (
                    <span data-testid="wl-run-xp" className="text-amber-200 tabular-nums">
                      {hud.xp}
                    </span>
                  ),
                },
              ]}
            >
              <div className="wl-race" data-testid="wl-race" role="img" aria-label={`Te: ${hud.rung}. fok, ${RIVAL_NAME}: ${Math.floor(hud.rival)}. fok, cél: ${hud.target}. fok. ${leadText}`}>
                <div className="wl-race-track">
                  <span className="wl-race-flag" aria-hidden="true">🏁</span>
                  <span className="wl-race-dot wl-race-rival" style={{ left: `${rivalPct}%` }} aria-hidden="true" />
                  <span className="wl-race-dot wl-race-you" style={{ left: `${youPct}%` }} aria-hidden="true" />
                </div>
                <p className="wl-race-text" data-lead={lead >= 1 ? "ahead" : lead <= -1 ? "behind" : "even"}>
                  <span className="wl-race-key wl-race-key-you">Te</span>
                  <span className="wl-race-lead">{leadText}</span>
                  <span className="wl-race-key wl-race-key-rival">{RIVAL_NAME}</span>
                </p>
              </div>
            </GameHud>

            {/* A FOGÁSOK: a négy válasz a falon (2×2; fekvőben a két szélen), hüvelykujjal elérhetően. */}
            <div
              ref={holdsRef}
              className="wl-holds"
              data-testid="wl-quiz"
              data-quiz3d={quiz3dOn ? "true" : "false"}
              data-scene3d={scene3d === true ? "true" : "false"}
            >
              {holds3dWanted && presentation ? (
                <QuizBoard3D
                  questionKey={`${presentation.id}:${presentation.question.key}`}
                  prompt=""
                  options={presentation.options.map((o) => o.label)}
                  states={tileStates}
                  interactive={answering}
                  layoutRef={holdsRef}
                  onAnswer={grab}
                  onSupportedChange={setQuiz3dSupported}
                />
              ) : null}
              {teach && <p className="wl-teach" data-testid="wl-teach">{TEACH_HINT}</p>}
              {presentation ? (
                <div className="wl-answers" data-count={presentation.options.length} data-long={presentation.options.some((o) => o.label.length > LONG_HOLD) ? "true" : "false"}>
                  {presentation.options.map((opt, idx) => {
                    const st = holdState(idx);
                    return (
                      <button
                        key={`${presentation.id}-${idx}`}
                        type="button"
                        className="wl-hold"
                        data-testid={`wl-option-${idx}`}
                        data-hold-index={idx}
                        data-quiz3d-option={idx}
                        data-state={st}
                        disabled={!answering}
                        aria-keyshortcuts={ANSWER_KEYS[idx]}
                        onClick={() => grab(idx)}
                        {...correctDataAttrs(opt.correct)}
                      >
                        <span className="wl-hold-key" aria-hidden="true">
                          {st === "correct" ? <Check className="h-5 w-5" strokeWidth={3} /> : st === "wrong" ? <X className="h-5 w-5" strokeWidth={3} /> : ANSWER_KEYS[idx]}
                        </span>
                        <span className="wl-hold-label">{opt.label}</span>
                        {st === "correct" && <span className="sr-only"> — a jó kapaszkodó</span>}
                      </button>
                    );
                  })}
                </div>
              ) : freeHold ? (
                <div className="wl-answers wl-answers-free">
                  <button type="button" className="wl-hold wl-hold-free" data-testid="wl-free-hold" data-free-hold onClick={grabFree}>
                    <span className="wl-hold-label">Kapaszkodj! ⬆</span>
                  </button>
                </div>
              ) : null}
            </div>

            <div ref={particlesRef} className="wl-particles" aria-hidden="true">
              {Array.from({ length: PARTICLE_POOL }).map((_, i) => (
                <span key={i} className="wl-particle" />
              ))}
            </div>
            <div ref={bannerRef} className="wl-banner" data-testid="wl-banner" data-show="false" role="status" aria-live="polite" />

            {phase === "play" && (
              <InlineQuestion
                {...q.bind}
                onPick={grab}
                mode="bar"
                skin="rock"
                disabled={paused}
                onWhy={openWhy}
                onExpand={() => setExpanded(true)}
                onCollapse={() => setExpanded(false)}
                testId="wl-question"
                promptTestId="wl-prompt"
              />
            )}
          </>
        )}
      </main>

      <style>{`
        /* J2a — a verseny-jelenet a teljes képernyőn, a HUD és a fogások mögött. */
        .game-shell-fixed[data-game="WordLadderHuEn"] > main.wl-play { padding-top: 0; }
        .game-shell-fixed[data-game="WordLadderHuEn"] > main.wl-play > .game-hud { position: relative; z-index: 12; margin-left: 0; margin-right: 0; }
        .game-shell-fixed[data-game="WordLadderHuEn"] .wl-stage { position: absolute; inset: 0; z-index: 0; touch-action: none; will-change: transform; }
        .game-start .wl-start-icon canvas { border-radius: inherit; }
        .wl-race { margin-top: 6px; }
        .wl-race-track { position: relative; height: 10px; border-radius: 9999px; background: #0f172a99; border: 1px solid #ffffff2e; margin: 0 22px 0 4px; }
        .wl-race-flag { position: absolute; right: -22px; top: 50%; transform: translateY(-50%); font-size: 14px; line-height: 1; }
        .wl-race-dot { position: absolute; top: 50%; width: 16px; height: 16px; border-radius: 9999px; transform: translate(-50%, -50%); transition: left .25s ease; box-shadow: 0 0 0 2px #fff, 0 2px 6px #0008; }
        .wl-race-you { background: #38bdf8; z-index: 2; }
        .wl-race-rival { background: #a855f7; }
        .wl-race-text { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 4px 2px 0; font-size: 13px; font-weight: 800; color: #f8fafc; text-shadow: 0 1px 2px #000a; }
        .wl-race-key { display: inline-flex; align-items: center; gap: 4px; }
        .wl-race-key::before { content: ""; width: 10px; height: 10px; border-radius: 9999px; display: inline-block; }
        .wl-race-key-you::before { background: #38bdf8; }
        .wl-race-key-rival::before { background: #a855f7; }
        .wl-race-text[data-lead="behind"] .wl-race-lead { color: #fed7aa; }
        .wl-race-text[data-lead="ahead"] .wl-race-lead { color: #bbf7d0; }
        @media (prefers-reduced-motion: reduce) { .wl-race-dot { transition: none; } }

        /* A kérdés-kártya a HUD + verseny-csík alatt (a közös sáv változója). */
        .play-question[data-testid="wl-question"] { --play-question-top: calc(max(4px, var(--game-safe-top)) + 112px); }

        /* FOGÁSOK — álló nézet: alul, hüvelykujjnyira; sötét sziklapárkány. */
        .game-shell-fixed[data-game="WordLadderHuEn"] .wl-holds {
          position: absolute; z-index: 20; left: max(8px, var(--game-safe-left)); right: max(8px, var(--game-safe-right));
          bottom: calc(max(8px, var(--game-safe-bottom)) + 4px); padding: 10px; border-radius: 22px;
          background-color: #24160dd9; background-image: linear-gradient(180deg, #ffffff12, #00000033);
          border: 1.5px solid #fbbf2455; box-shadow: 0 -6px 24px #0007, inset 0 1px 0 #ffffff1f;
        }
        .wl-teach { margin: 0 0 8px; text-align: center; font-size: 15px; font-weight: 800; color: #fde68a; line-height: 1.25; }
        .wl-answers { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .wl-answers[data-long="true"] { grid-template-columns: 1fr; gap: 8px; }
        ${HOLD} {
          position: relative; display: flex; align-items: center; gap: 8px; min-height: 64px; min-width: 48px; padding: 8px 10px;
          text-align: left; border-radius: 18px 22px 16px 24px; color: #fff; font-weight: 900; cursor: pointer;
          font-size: clamp(16px, 4.4vw, 20px); line-height: 1.15; overflow-wrap: anywhere; hyphens: auto;
          background: radial-gradient(120% 90% at 30% 20%, #c08a5a, #8a5a34 55%, #5b3a1c);
          border: 2px solid #fcd34d88; box-shadow: inset 0 2px 0 #ffffff33, inset 0 -5px 0 #3b2412, 0 6px 14px #0008;
          -webkit-tap-highlight-color: transparent; touch-action: manipulation; user-select: none;
          transition: transform .08s ease, background-color .12s ease, opacity .15s ease, box-shadow .12s ease;
        }
        ${HOLD_SCOPE} .wl-answers[data-long="true"] .wl-hold { font-size: clamp(15px, 3.9vw, 18px); min-height: 52px; padding-block: 6px; }
        ${HOLD}:not(:disabled):active { transform: translateY(2px) scale(.97); box-shadow: inset 0 1px 0 #ffffff26, inset 0 -2px 0 #3b2412, 0 3px 8px #0008; }
        ${HOLD}:disabled { cursor: default; opacity: 1; }
        ${HOLD}:focus-visible { outline: 4px solid #fef08a; outline-offset: 2px; }
        ${HOLD}-key {
          flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 9999px;
          background: linear-gradient(180deg, #fbbf24, #f59e0b); color: #1f1300; font-size: 15px; box-shadow: 0 2px 0 #92400e;
        }
        ${HOLD}-label { flex: 1 1 auto; min-width: 0; text-shadow: 0 1px 2px #0009; }
        ${HOLD}[data-state="correct"] { background: radial-gradient(120% 90% at 30% 20%, #4ade80, #16a34a 60%, #14532d); border-color: #bbf7d0; box-shadow: 0 0 0 3px #86efac, 0 0 24px #22c55e99; animation: wl-grab .28s ease-out; }
        ${HOLD}[data-state="wrong"] { background: radial-gradient(120% 90% at 30% 20%, #b45309, #7c2d12 70%); border-color: #fdba74; animation: wl-crumble .5s ease-in forwards; }
        ${HOLD}[data-state="dim"] { opacity: .45; }
        ${HOLD}[data-state="correct"] .wl-hold-key, ${HOLD}[data-state="wrong"] .wl-hold-key { background: #ffffff33; color: #fff; box-shadow: none; }
        ${HOLD}-free { grid-column: 1 / -1; justify-content: center; font-size: 22px; min-height: 72px; }
        @keyframes wl-grab { 0% { transform: scale(1); } 45% { transform: scale(1.06); } 100% { transform: scale(1); } }
        @keyframes wl-crumble { 0% { transform: none; } 30% { transform: rotate(-4deg) translateY(2px); } 100% { transform: rotate(7deg) translateY(10px); opacity: .55; } }
        @media (prefers-reduced-motion: reduce) {
          ${HOLD}, ${HOLD}[data-state] { animation: none !important; transition: none; }
        }

        /* Fekvő telefon: a fogások a két szélen (bal: 1–2., jobb: 3–4.), középen a fal látszik. */
        @media (orientation: landscape) and (max-height: 520px) {
          .play-question[data-testid="wl-question"] { --play-question-top: calc(max(4px, var(--game-safe-top)) + 96px); }
          .game-shell-fixed[data-game="WordLadderHuEn"] .wl-holds {
            top: calc(max(4px, var(--game-safe-top)) + 96px); bottom: calc(max(6px, var(--game-safe-bottom)) + 2px);
            padding: 0; background: transparent; border: 0; box-shadow: none; pointer-events: none;
          }
          .wl-answers, .wl-answers[data-long="true"] { height: 100%; grid-template-columns: min(25vw, 230px) 1fr min(25vw, 230px); grid-template-rows: 1fr auto auto; gap: 8px; }
          ${HOLD_SCOPE} .wl-answers > .wl-hold { pointer-events: auto; }
          ${HOLD_SCOPE} .wl-answers > .wl-hold[data-hold-index="0"] { grid-column: 1; grid-row: 2; }
          ${HOLD_SCOPE} .wl-answers > .wl-hold[data-hold-index="1"] { grid-column: 1; grid-row: 3; }
          ${HOLD_SCOPE} .wl-answers > .wl-hold[data-hold-index="2"] { grid-column: 3; grid-row: 2; }
          ${HOLD_SCOPE} .wl-answers > .wl-hold[data-hold-index="3"] { grid-column: 3; grid-row: 3; }
          .wl-answers-free > .wl-hold-free { grid-column: 3; grid-row: 3; }
          .wl-teach { position: absolute; left: 50%; bottom: 0; transform: translateX(-50%); width: min(44vw, 420px); padding: 6px 10px; border-radius: 12px; background: #24160dd9; pointer-events: none; }
          ${HOLD} { min-height: 58px; font-size: 16px; }
        }

        .wl-particles { position: fixed; inset: 0; z-index: 30; pointer-events: none; overflow: hidden; }
        .wl-particle { position: absolute; left: -40px; top: -40px; width: 10px; height: 10px; border-radius: 3px; opacity: 0; }
        .wl-banner {
          position: fixed; left: 50%; top: 31%; z-index: 58; transform: translate(-50%, -50%) scale(.9); opacity: 0; pointer-events: none;
          max-width: calc(100vw - 32px); padding: 10px 18px; border-radius: 18px; background: #000000b3; border: 2px solid #fcd34db3;
          color: #fef3c7; font-size: clamp(18px, 5vw, 24px); font-weight: 900; text-align: center; box-shadow: 0 10px 30px #0009;
          transition: opacity .18s ease, transform .18s ease;
        }
        .wl-banner[data-show="true"] { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        @media (prefers-reduced-motion: reduce) { .wl-banner { transition: none; transform: translate(-50%, -50%); } }

        /* A közös jelvény-értesítő az eredménykártya fölött, a felső biztonsági sávon belül jelenjen meg. */
        .wl-achievements [data-testid^="achievement-toast-"] { z-index: 90; top: max(8px, var(--game-safe-top)); }

        /* 3D kapaszkodó-lapok (spec 7. döntés): a DOM-gomb átlátszó érintési réteg a 3D lap fölött; a fókuszkeret látszik. */
        .game-shell-fixed[data-game="WordLadderHuEn"] [data-testid="wl-quiz"][data-quiz3d="true"] .wl-answers button,
        .game-shell-fixed[data-game="WordLadderHuEn"] [data-testid="wl-quiz"][data-quiz3d="true"] .wl-answers button[data-state] {
          background: transparent !important;
          border-color: transparent !important;
          color: transparent !important;
          box-shadow: none !important;
          text-shadow: none !important;
          animation: none !important;
        }
        .game-shell-fixed[data-game="WordLadderHuEn"] [data-testid="wl-quiz"][data-quiz3d="true"] .wl-answers button:focus-visible {
          outline: 4px solid #fbbf24 !important;
          outline-offset: 3px;
        }
        .game-shell-fixed[data-game="WordLadderHuEn"] [data-testid="wl-quiz"][data-quiz3d="true"] .wl-answers button .wl-hold-key {
          opacity: 0;
        }
      `}</style>
      {why && <QuizFeedbackCard card={why} onDismiss={closeWhy} />}

      <PauseMenu open={menuOpen && phase === "play"} onResume={resumeGame} onRestart={startGame} onExit={exitToMenu} exitLabel="Kilépés a menübe">
        <PlaySpeechToggle />
      </PauseMenu>
      <ResultScreen
        badges={newlyUnlocked}
        open={phase === "result"}
        testId="wl-won"
        title={result?.won ? `🏁 Elérted a csúcsot! Legyőzted ${RIVAL_NAME}t!` : lossTitle(result?.missing ?? 1)}
        won={result?.won ?? false}
        score={result?.xp ?? 0}
        best={result?.best ?? bestScore}
        isNewBest={result?.isNewBest ?? false}
        correct={result?.correct ?? 0}
        total={result?.total ?? 0}
        onRetry={startGame}
        retryTestId="wl-restart"
        retryLabel={retryLabel}
        onBack={() => navigate("/games")}
        extra={
          <div className="flex flex-col gap-1">
            <span data-testid="wl-result-line">
              {result?.won ? `${result.bonus} XP győzelmi jutalom · ` : `${RIVAL_NAME} most gyorsabb volt — a visszavágóban utolérheted! · `}
              {result?.seconds ?? 0} mp · legjobb kombó: {result?.bestCombo ?? 0}
            </span>
            <span className="text-white/75">{syncEligibility?.eligible ? "Eredmény elküldve a szervernek." : syncBanner}</span>
            <ResultReview items={wrongItems} />
          </div>
        }
      />
    </GameShell>
  );
}
