import { createAdaptiveSession } from "@/game-engine/adaptiveSession";
import { createGradeQuizSeen, isGradeQuizSeen, markGradeQuizSeen } from "@/game-engine/gradeQuiz";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import * as THREE from "three";
import {
  ArrowLeft,
  Tornado as TornadoIcon,
  Anchor,
  Car,
  Trophy,
  BarChart3,
  Settings as SettingsIcon,
  Coins,
  Lock,
  Play,
  ShoppingCart,
  Wrench,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import VirtualJoystick from "@/game-engine/VirtualJoystick";
import { countRender, registerInputProbe } from "@/game-engine/inputProbe";
import { Card, CardContent } from "@/components/ui/card";
import { correctDataAttrs, installGameTestApi, readGameSeed, GAME_TEST_HOOKS_ENABLED } from "@/game-engine/game-test-hooks";
import AudioToggleButton from "@/components/AudioToggleButton";
import AchievementToast from "@/components/AchievementToast";
import GamePedagogyPanel from "@/components/GamePedagogyPanel";
import { queryClient } from "@/lib/queryClient";
import { gameSyncBannerText, useSyncEligibilityQuery } from "@/hooks/useGameScoreSync";
import { recordRun, type Achievement } from "@/lib/achievements";
import { quizTopicLabelHu } from "@/lib/quizTopicLabel";
import { isTodaysGameAvailable, markDailyCompleted } from "@/lib/dailyChallenge";
import { useCouponSession, type CouponSession } from "@/game-engine/useCouponSession";
import { maybeClaimCouponBonus } from "@/game-engine/claimCouponBonus";
import { CouponHud, CouponExpiredOverlay } from "@/game-engine/CouponHud";
import HoldButton from "@/game-engine/HoldButton";
import { targetMarker } from "@/lib/tornado/targetMarker";
import { tornadoLevelTimeScale, tornadoWorldLevel } from "@/lib/tornado/gradeWorld";
import { useClassroomGrade } from "@/lib/classroomStore";
import { GRADE_LEVEL_COUNT, levelBand } from "@/game-engine/gradeLevels";
import { useGradeLevel, type GradeLevelState } from "@/game-engine/useGradeLevel";
import { GradeLevelPicker } from "@/game-engine/GradeLevelPicker";
import QuizFeedbackCard from "@/game-engine/QuizFeedbackCard";
import { buildFeedback, type FeedbackCard } from "@/game-engine/feedback";
import { useReducedMotion } from "@/game-engine/useReducedMotion";
import {
  cancelGameFrame,
  GameHud,
  GameShell,
  PauseMenu,
  ResultScreen,
  StartScreen,
  requestGameFrame,
  useBestScore,
  useHaptics,
  useOrientation,
  useTouchCapable,
  type GameScreenState,
} from "@/game-engine/mobile";
import { useVocabQuizSource, vocabLevelForGrade, type VocabQuiz } from "@/game-engine/vocab";
import {
  InlineQuestion,
  ResultReview,
  createPointerTapTracker,
  estimateLines,
  pointerTapHandlers,
  bankPlayQuestion,
  materialPlayQuestion,
  restoreReviewQuestion,
  usePlayQuestion,
  vocabPlayQuestion,
  type PlayQuestion,
  type QuestionProvider,
} from "@/game-engine/play";
import { createRng, seedFrom, type Rng as SeededRng } from "@shared/game-rng";
import {
  sfxSuccess,
  sfxError,
  sfxLevelUp,
  sfxPickup,
  sfxWarning,
  sfxClick,
} from "@/lib/audioEngine";

import {
  VEHICLES,
  VEHICLE_CATEGORIES,
  RARITY_LABEL,
  RARITY_COLOR,
  categoryLabel,
  vehicleById,
  purchasableVehicles,
  type Vehicle,
} from "@/lib/tornado/vehicles";
import {
  levelSpec,
  levelsByStage,
  stageForLevel,
  stormLabel,
  type LevelSpec,
} from "@/lib/tornado/levels";
import {
  pickQuestion,
  materialToQuestions,
  resolveGrades,
  schoolLevelLabel,
  QUIZ_MODE_LABEL,
  isVocabQuestion,
  questionSubjectLabel,
  vocabToQuestion,
  type Question,
  type SchoolLevel,
  type QuizMode,
} from "@/lib/tornado/questions";
import {
  initialWind,
  advanceWind,
  compassFor,
  bearingBetween,
  windForceOn,
  type WindState,
} from "@/lib/tornado/wind";
import {
  anchorBandMessage,
  anchorBandState,
  anchorOutcome,
  breakdownRows,
  createStreakTracker,
  freeRoamAnswerScore,
  recordStreak,
  type RewardResult,
} from "@/lib/tornado/scoring";
import {
  MAX_UPGRADE_LEVEL,
  UPGRADE_TRACKS,
  effectiveAnchorBand,
  effectiveStats,
  effectiveSurfaceGrip,
  softenImpact,
  upgradeCost,
} from "@/lib/tornado/upgrades";
import ScrollPane from "@/tornado/ScrollPane";
import VehicleArt from "@/tornado/VehicleArt";
import {
  stepVehicle,
  STOPPED_SPEED,
  maxSpeedUnits,
  windDriftUnits,
  driveSubsteps,
  followHeight,
} from "@/lib/tornado/drive";
import { createGamepadRestGate, readStandardGamepad } from "@/lib/tornado/gamepad";
import { collidersNear, resolveVehicleCollisions, vehicleDimensions } from "@/lib/tornado/collision";
import {
  toggleCamera,
  escAction,
  driveKeyFor,
  releaseDriveKeys,
  touchDriveInput,
  type TouchDrive,
} from "@/lib/tornado/controls";
import { shouldDisposeGeometry } from "@/tornado/meshLifetime";
import { applyRunResult } from "@/lib/tornado/runResult";
import { advanceTornado, couponRepeat, createChaseDriver, detourWithGrace, tornadoDirectorConfig, winReward, type ChaseDriver, type ChaseEvent, type QuestionKind } from "@/lib/tornado/sim";
import type { QuestionOutcome, QuestionPresentation } from "@/game-engine/play";
import { NITRO_ACCEL_FACTOR, NITRO_SPEED_FACTOR, TURBO_PAD_RADIUS, gatePoint, type Junction, type TurboPad } from "@/lib/tornado/junctions";
import { newScoreRunId, postGameScore } from "@/lib/gameScoreRunId";
import {
  loadProgress,
  saveProgress,
  buyVehicle,
  selectVehicle,
  buyUpgrade,
  recordAnswer,
  updateSettings,
  upgradesFor,
  STORAGE_KEY as TORNADO_STORAGE_KEY,
  type TornadoProgress,
  type GraphicsQuality,
} from "@/lib/tornado/progress";
import {
  QUALITY_PROFILES,
  buildVehicle,
  setAnchorsVisible,
  buildTornado,
  animateTornado,
  buildTerrainChunk,
  buildBridgeChunk,
  buildProp,
  buildRain,
  animateRain,
  skyPaletteFor,
  SUN_DIRECTION,
  buildSkyDome,
  animateSkyDome,
  buildStormCloud,
  animateStormCloud,
  skyDomeRadiusFor,
  cameraFarFor,
  type StormCloud,
  disposeMeshCaches,
  type TornadoMesh,
} from "@/tornado/buildMeshes";
import {
  applyRendererLook,
  createPostFx,
  disposeObjectTree,
  SparkleField,
  LOOK_BUDGET,
  detectLookTier,
  type PostFx,
} from "@/game-engine/three-look";
import {
  chunksAround,
  chunkKey,
  propsInChunk,
  gripAt,
  surfaceAt,
  SURFACE_LABEL,
  groundHeight,
  clampToWorld,
  toKm,
  fromKm,
  HALF_WORLD,
} from "@/lib/tornado/world";

/* =====================================================================
 * Tornado Hunter 200 — a 3D storm-chasing game inside the WEBSULI curriculum.
 *
 * Flow (from the brief): pick a vehicle → enter the open world → find the storm
 * → the weather worsens → the tornado appears → approach it → find a spot to
 * anchor → a math/English quiz pops up → a correct answer anchors successfully,
 * a wrong one fails and lets you retry → the tornado passes → intercept done →
 * earn Storm Coin + points → next level unlocks.
 *
 * All the rules live in pure modules under lib/tornado (tested without a
 * browser); this file is the Three.js scene, the HUD and the menu screens.
 * ===================================================================== */

type Screen = "menu" | "garage" | "levels" | "settings" | "highscore" | "stats" | "play";
type PlayPhase = "seeking" | "approach" | "quiz" | "paused" | "result_win" | "result_lose";

const GAME_ID = "tornado-hunter-200";

/** Player physics state kept in a ref (mutated every frame, never re-renders). */
type PlayerState = {
  x: number;
  z: number;
  heading: number; // radians, 0 = north (-Z)
  speed: number; // world units / sec
  anchored: boolean;
};

function fmt(n: number): string {
  return Math.round(n).toLocaleString("hu-HU");
}

/**
 * S12 / végrehajtás 7. lépés: a kézi grafikai beállítás marad; ha a játékos még sosem mentett minőséget, az alapérték az
 * eszköz képessége (`detectLookTier`), nem a rögzített „medium” — gyenge telefonon így LOW-ról indul.
 */
function hasStoredQuality(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem(TORNADO_STORAGE_KEY);
    if (!raw) return false;
    const quality = (JSON.parse(raw) as { settings?: { quality?: unknown } } | null)?.settings?.quality;
    return quality === "low" || quality === "medium" || quality === "high";
  } catch {
    return false;
  }
}

function initialProgress(): TornadoProgress {
  const loaded = loadProgress();
  return hasStoredQuality() ? loaded : updateSettings(loaded, { quality: detectLookTier() });
}

export default function TornadoHunter200() {
  const [progress, setProgress] = useState<TornadoProgress>(initialProgress);
  const [screen, setScreen] = useState<Screen>("menu");
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[]>([]);
  /** Teszt-kampó jelzők (növekvő sorszám): a PlayScreen csak a változásra reagál, újraindításkor nem. */
  const [forceResult, setForceResult] = useState(0);
  const [forceQuiz, setForceQuiz] = useState(0);
  /** J7a teszt-kampó: a játékos a tölcsértől ennyi km-re kerül (a mérési sávba állításhoz); `n` a jelző sorszáma. */
  const [forceNear, setForceNear] = useState<{ n: number; km: number }>({ n: 0, km: 0 });
  /** J7b teszt-kampó: azonnali elágazás (`long`: a bank leghosszabb válaszaival — a tábla-beférés mérése). */
  const [forceJunction, setForceJunction] = useState<{ n: number; long: boolean }>({ n: 0, long: false });
  /** A közös keret állapota játék közben (játszik / szünet / eredmény) — a PlayScreen jelenti. */
  const [playState, setPlayState] = useState<GameScreenState>("playing");
  /** A „Következő szint” új futást indít: a kulcs váltása újraszereli a PlayScreent. */
  const [playKey, setPlayKey] = useState(0);
  const autoPauseRef = useRef<() => void>(() => {});
  /** K.2 teszt-kampó: a futó PlayScreen méri ki (`probe()` kötelező mezői), a lap szintű API ide hív. */
  const probeRef = useRef<(() => Record<string, number | string | null>) | null>(null);
  const best = useBestScore(GAME_ID);
  const [, setLocation] = useLocation();
  // Spec 2026-09-29-palyak-szoletra-nyelvek (E szelet, D6): 10 pálya az évfolyam AUTO-tartományában. Évfolyam: a
  // Beállítások számmal megadott iskolai szintje, AUTO esetén a közös évfolyam. A „Szintek” képernyő változatlan.
  const { grade: classroomGrade } = useClassroomGrade();
  const levelGrade = typeof progress.settings.school === "number" ? progress.settings.school : classroomGrade;
  const levels = useGradeLevel("tornado", levelGrade);
  /** A futó pálya (1–10), ha a menü pályaválasztójából indult; a „Szintek”-ből indított futásnál `null`. */
  const [runGradeLevel, setRunGradeLevel] = useState<number | null>(null);
  const levelWorld = levelGrade != null && levels.level != null ? tornadoWorldLevel(levelGrade, levels.level) : null;

  const coupon = useCouponSession();
  const { data: syncEligibility } = useSyncEligibilityQuery();
  const syncBanner = useMemo(() => gameSyncBannerText(syncEligibility), [syncEligibility]);

  // Persist every progress change.
  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  useEffect(() => {
    return installGameTestApi({
      forceState: (patch) => {
        if (patch.screen === "menu" || patch.screen === "levels" || patch.screen === "play") {
          setScreen(patch.screen);
        }
        if (patch.phase === "result_win") {
          setScreen("play");
          setForceResult((n) => n + 1);
        }
        // K.2: a `question: true` azonnal kérdést nyit; a `phase: "quiz"` ennek kompatibilis álneve (terv 9.).
        if (patch.phase === "quiz" || patch.question === true) {
          setScreen("play");
          setForceQuiz((n) => n + 1);
        }
        const junction = (patch as { junction?: unknown }).junction;
        if (junction === true || junction === "long") {
          setScreen("play");
          setForceJunction((cur) => ({ n: cur.n + 1, long: junction === "long" }));
        }
        const nearKm = (patch as { nearTornadoKm?: unknown }).nearTornadoKm;
        if (typeof nearKm === "number" && Number.isFinite(nearKm) && nearKm > 0) {
          setForceNear((cur) => ({ n: cur.n + 1, km: nearKm }));
        }
      },
      probe: () => probeRef.current?.() ?? { simTime: 0, questionOpen: 0, questionsAnswered: 0, questionsCorrect: 0, fps: 0, band: null, intensity: null },
    });
  }, []);

  // A futáson kívül a kampó-jelzők nullázódnak: a következő futás ne induljon kényszerített állapotból.
  useEffect(() => {
    if (screen !== "play") {
      setForceResult(0);
      setForceQuiz(0);
      setForceNear({ n: 0, km: 0 });
      setForceJunction({ n: 0, long: false });
      setPlayState("playing");
    }
  }, [screen]);

  const selectedVehicle = vehicleById(progress.selectedVehicleId) ?? VEHICLES[0]!;

  const commit = useCallback((next: TornadoProgress) => setProgress(next), []);

  const startLevel = (level: number, gradeLevel: number | null) => {
    setSelectedLevelRef(level);
    setRunGradeLevel(gradeLevel);
    setPlayKey((k) => k + 1);
    setScreen("play");
  };
  const playGradeLevel = () => {
    if (levelWorld == null || levels.level == null) return;
    startLevel(levelWorld, levels.level);
  };
  /** Egy koppintásos indítás (M8): évfolyampályán a kiválasztott pálya, különben a legmagasabb feloldott szint. */
  const quickStart = () => {
    sfxClick();
    if (levels.active && levelWorld != null && levels.level != null) playGradeLevel();
    else startLevel(progress.highestLevelUnlocked, null);
  };
  const quickLabel =
    levels.active && levelWorld != null && levels.level != null
      ? `${levels.level}. pálya · ${levelWorld}. szint`
      : `Folytatás · ${progress.highestLevelUnlocked}. szint`;

  const shellState: GameScreenState = screen === "play" ? playState : "start";
  /**
   * Spec 2026-11-16-jatek-telefonos-reszponzivitas (gyökérok): a rögzített, görgetés nélküli keret (index.css
   * `[data-fixed-screen="true"]`: 100dvh + overflow: hidden, a `[data-game-card-content]` is overflow: hidden) a 3D
   * játéktérnek való; a tartalom-képernyőkön levágott (álló garázs: a lista 0 px; Beállítás / Rekordok / Statisztika: a
   * kártya `overflow-y-auto`-ját a keret `overflow: hidden`-je felülírta, az alja elérhetetlen volt). Rögzített keret
   * csak a játékban, a Szintek listán (C1 e2e: ott a lap nem görög; a lista saját, jelzett görgetésű ScrollPane) és a
   * fekvő garázs két ScrollPane-hasábjánál marad; minden más meta-képernyő természetes lapgörgetést kap.
   */
  const orientation = useOrientation();
  const garageLandscape = screen === "garage" && orientation === "landscape";

  /** Győzelem utáni „Tovább”: évfolyampályán a következő pálya (a győzelem feloldja), különben a következő szint. */
  const runLevel = getSelectedLevelRef();
  const nextGradeLevel = runGradeLevel != null && runGradeLevel < GRADE_LEVEL_COUNT ? runGradeLevel + 1 : null;
  const nextGradeWorld = levelGrade != null && nextGradeLevel != null ? tornadoWorldLevel(levelGrade, nextGradeLevel) : null;
  const nextRun: { label: string; go: () => void } | null =
    runGradeLevel != null
      ? nextGradeLevel != null && nextGradeWorld != null
        ? {
            label: `${nextGradeLevel}. pálya`,
            go: () => {
              levels.select(nextGradeLevel);
              startLevel(nextGradeWorld, nextGradeLevel);
            },
          }
        : null
      : runLevel < 200
        ? { label: `${runLevel + 1}. szint`, go: () => startLevel(runLevel + 1, null) }
        : null;

  return (
    <GameShell
      gameId="TornadoHunter200"
      state={shellState}
      fixedScreen={screen === "play" || screen === "levels" || garageLandscape}
      orientation="landscape"
      onAutoPause={() => autoPauseRef.current()}
      style={{
        background:
          "radial-gradient(ellipse at 20% 12%, rgba(56,189,248,0.16), transparent 40%), radial-gradient(ellipse at 82% 8%, rgba(148,163,184,0.16), transparent 44%), linear-gradient(180deg, #0b1220 0%, #0a0f1c 100%)",
      }}
    >
      <AchievementToast achievements={newlyUnlocked} />
      <main
        className={
          screen === "play"
            ? "w-full flex-1 min-h-0"
            : "relative z-10 w-full max-w-2xl xl:max-w-4xl mx-auto px-2 sm:px-5 py-2 sm:py-4 min-h-dvh min-h-screen flex flex-col pb-20 sm:pb-10"
        }
      >
        <CouponHud session={coupon} />
        <CouponExpiredOverlay session={coupon} />

        {screen !== "play" && (
          <header className="flex items-center justify-between gap-1 mb-2">
            <Link href="/games">
              <Button variant="ghost" size="sm" className="text-white/90 hover:bg-white/10 gap-1 -ml-2 h-12 px-3 text-sm">
                <ArrowLeft className="w-4 h-4" />
                Játékok
              </Button>
            </Link>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <AudioToggleButton size="icon" className="h-12 w-12" />
              <span className="flex items-center gap-1 text-amber-300" data-testid="tornado-coins">
                <Coins className="w-4 h-4" />
                {fmt(progress.coins)} SC
              </span>
            </div>
          </header>
        )}

        {screen === "menu" && (
          <StartScreen
            title="Tornado Hunter 200"
            subtitle="3D viharvadászat — 200 szint, 160 jármű, Storm Coin"
            icon={<TornadoIcon className="h-12 w-12" strokeWidth={2.2} />}
            startLabel="Vadászat indítása"
            onStart={() => {
              sfxClick();
              setScreen("levels");
            }}
            best={best.best}
            secondary={
              <>
                <button type="button" className="game-btn game-btn-secondary" data-testid="tornado-quick-start" onClick={quickStart}>
                  <Play className="h-5 w-5 shrink-0" fill="currentColor" aria-hidden="true" />
                  {quickLabel}
                </button>
                <button
                  type="button"
                  className="game-btn game-btn-secondary"
                  onClick={() => {
                    sfxClick();
                    setScreen("garage");
                  }}
                >
                  <Car className="h-5 w-5 shrink-0" aria-hidden="true" />
                  Vihargarázs
                </button>
              </>
            }
            settings={
              <MenuExtras
                progress={progress}
                selectedVehicle={selectedVehicle}
                syncBanner={syncBanner}
                levels={levels}
                levelGrade={levelGrade}
                levelWorld={levelWorld}
                onHighscore={() => setScreen("highscore")}
                onStats={() => setScreen("stats")}
                onSettings={() => setScreen("settings")}
              />
            }
          />
        )}

        {screen === "garage" && (
          <GarageScreen progress={progress} commit={commit} onBack={() => setScreen("menu")} landscape={garageLandscape} />
        )}

        {screen === "levels" && (
          <LevelsScreen
            progress={progress}
            onBack={() => setScreen("menu")}
            onPick={(level) => startLevel(level, null)}
          />
        )}

        {screen === "settings" && (
          <SettingsScreen progress={progress} commit={commit} onBack={() => setScreen("menu")} />
        )}

        {screen === "highscore" && (
          <HighscoreScreen progress={progress} onBack={() => setScreen("menu")} />
        )}

        {screen === "stats" && <StatsScreen progress={progress} onBack={() => setScreen("menu")} />}

        {screen === "play" && (
          <PlayScreen
            key={playKey}
            level={getSelectedLevelRef()}
            vehicle={selectedVehicle}
            progress={progress}
            coupon={coupon}
            newlyUnlocked={newlyUnlocked}
            syncEligible={Boolean(syncEligibility?.eligible)}
            forceResult={forceResult}
            forceQuiz={forceQuiz}
            forceNear={forceNear}
            forceJunction={forceJunction}
            gradeLevel={runGradeLevel}
            onGradeLevelWin={() => {
              if (runGradeLevel != null) levels.complete(runGradeLevel);
            }}
            onExit={() => setScreen(runGradeLevel != null ? "menu" : "levels")}
            onBackToGames={() => setLocation("/games")}
            next={nextRun}
            onComplete={(unlocked) => {
              if (unlocked.length > 0) setNewlyUnlocked(unlocked);
            }}
            onProgress={setProgress}
            onSubmitBest={best.submit}
            onShellState={setPlayState}
            autoPauseRef={autoPauseRef}
            probeRef={probeRef}
          />
        )}
      </main>
    </GameShell>
  );
}

/* The selected level is passed through a module ref so re-selecting does not
 * thread state through five components. */
let selectedLevelRef = 1;
function setSelectedLevelRef(level: number) {
  selectedLevelRef = level;
}
function getSelectedLevelRef(): number {
  return selectedLevelRef;
}

/* ============================ Menu ============================ */

/**
 * S12 — a kezdőképernyő összecsukott „Beállítások” része (StartScreen `settings`): pályaválasztó, aktuális jármű,
 * rekordok, statisztika, iskolai szint, szülői leírás. Az indításhoz nem kell megnyitni (M8).
 */
function MenuExtras(props: {
  progress: TornadoProgress;
  selectedVehicle: Vehicle;
  syncBanner: string;
  levels: GradeLevelState;
  levelGrade: number | null;
  levelWorld: number | null;
  onHighscore: () => void;
  onStats: () => void;
  onSettings: () => void;
}) {
  const { progress, selectedVehicle } = props;
  return (
    <div className="flex flex-col gap-3">
      {props.levels.active && props.levels.level != null && props.levelWorld != null ? (
        <div className="rounded-xl border border-sky-400/30 bg-slate-900/60 p-3 flex flex-col gap-2" data-testid="tornado-grade-levels">
          <GradeLevelPicker
            value={props.levels.level}
            unlocked={props.levels.unlocked}
            onChange={props.levels.select}
            label={`Pálya — ${props.levelGrade}. osztály`}
          />
          <p className="text-sm text-white/70">
            A {props.levels.level}. pálya a {props.levelWorld}. szinten indul — a fenti gyorsgomb ezt indítja.
          </p>
        </div>
      ) : null}

      <div className="rounded-xl border border-white/10 bg-slate-900/60 p-3 flex items-center gap-3">
        <VehicleArt vehicle={selectedVehicle} className="w-20 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white/60 uppercase tracking-wide">Aktuális jármű</p>
          <p className="font-bold truncate text-white">{selectedVehicle.name}</p>
          <p className="text-sm" style={{ color: RARITY_COLOR[selectedVehicle.rarity] }}>
            {RARITY_LABEL[selectedVehicle.rarity]} · {categoryLabel(selectedVehicle.category)}
          </p>
        </div>
        <div className="text-right text-sm text-white/70">
          <p>Szint {progress.highestLevelUnlocked}/200</p>
          <p className="text-amber-300 font-semibold">{fmt(progress.totalScore)} pont</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MenuButton icon={<Trophy className="w-4 h-4" />} label="Rekordok" onClick={props.onHighscore} />
        <MenuButton icon={<BarChart3 className="w-4 h-4" />} label="Statisztika" onClick={props.onStats} />
        <MenuButton icon={<SettingsIcon className="w-4 h-4" />} label="Iskolai szint, grafika, irányítás" onClick={props.onSettings} className="col-span-2" />
      </div>

      <GamePedagogyPanel
          accent="cyan"
          kidMission="Válassz járművet, keresd meg a tornádót, és állj meg biztonságos távolságra! Amikor pontot kapsz, egy gyors matek- vagy angolkérdés dönti el, sikerül-e a horgonyzás. Jó válasz → rögzülsz és túléled a vihart, rossz válasz → új kérdés, próbáld újra!"
          parentBody={
            <>
              <strong className="text-cyan-100/90">Tananyag:</strong> a kérdések a gyerek osztályához kötött legutóbbi tananyagokból jönnek (ha van feldolgozott anyag), különben osztályszintre szabott matek/angol bankból. Az iskolai szint a Beállításokban állítható, vagy AUTO.
              <br />
              <strong className="text-cyan-100/90">Fejleszt:</strong> gyors fejszámolás és szókincs döntéshelyzetben, kockázatbecslés (milyen közel merek menni), kitartás rossz válasz után.
            </>
          }
        />

      <p data-game-sync className="text-sm text-cyan-100/80 border border-cyan-700/40 rounded-lg px-3 py-2 bg-slate-900/80">
        {props.syncBanner}
      </p>
    </div>
  );
}

function MenuButton(props: { icon: React.ReactNode; label: string; onClick: () => void; className?: string }) {
  return (
    <Button
      variant="secondary"
      className={`h-12 justify-start gap-2 bg-slate-800/70 hover:bg-slate-700/80 border border-white/10 ${props.className ?? ""}`}
      onClick={() => {
        sfxClick();
        props.onClick();
      }}
    >
      {props.icon}
      <span className="text-sm font-semibold">{props.label}</span>
    </Button>
  );
}

/* ============================ Garage ============================ */

/**
 * Vihargarázs (docs/specs/2026-11-16-jatek-telefonos-reszponzivitas.md). Álló nézet: EGY természetes lapgörgetés —
 * fejléc → vízszintes szűrősor → vízszintesen lapozható járműsor → a kiválasztott jármű → fejlesztések. Fekvő nézet:
 * két hasáb (bal: szűrő + járműrács, jobb: részletek + fejlesztések), mindkettő saját görgetéssel, a lap nem görög
 * (a keret ilyenkor rögzített, `fixedScreen`). A játéklogika (`buyVehicle` / `selectVehicle` / `buyUpgrade`) változatlan.
 */
function GarageScreen(props: {
  progress: TornadoProgress;
  commit: (p: TornadoProgress) => void;
  onBack: () => void;
  landscape: boolean;
}) {
  const { progress, commit, landscape } = props;
  const [category, setCategory] = useState<Vehicle["category"] | "all">("all");
  const [detailId, setDetailId] = useState<string>(progress.selectedVehicleId);
  const [flash, setFlash] = useState<string | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const detail = vehicleById(detailId) ?? VEHICLES[0]!;
  const owned = new Set(progress.ownedVehicleIds);

  const list = useMemo(() => {
    const base = category === "all" ? [...VEHICLES] : VEHICLES.filter((v) => v.category === category);
    return base.sort((a, b) => a.price - b.price);
  }, [category]);

  // A kiválasztott jármű a vízszintes sorban középre kerül — csak vízszintesen (`scrollLeft`), a lap nem ugrik.
  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const tile = row.querySelector<HTMLElement>(`[data-vehicle-id="${detailId}"]`);
    if (!tile) return;
    row.scrollLeft = Math.max(0, tile.offsetLeft - (row.clientWidth - tile.offsetWidth) / 2);
  }, [detailId, category, landscape]);

  const notify = (msg: string) => {
    setFlash(msg);
    window.setTimeout(() => setFlash((cur) => (cur === msg ? null : cur)), 2200);
  };

  const doBuy = () => {
    const res = buyVehicle(progress, detail.id);
    if (res.ok) {
      sfxPickup();
      commit(res.progress);
      notify(`Megvetted: ${detail.name}`);
    } else {
      sfxError();
      notify(
        res.reason === "insufficient_funds"
          ? "Nincs elég Storm Coin."
          : res.reason === "locked"
            ? `Zárolva — érd el a ${detail.unlockLevel}. szintet.`
            : "Ez a jármű már a tiéd.",
      );
    }
  };

  const doSelect = () => {
    const res = selectVehicle(progress, detail.id);
    if (res.ok) {
      sfxClick();
      commit(res.progress);
      notify(`Kiválasztva: ${detail.name}`);
    }
  };

  const doUpgrade = (track: (typeof UPGRADE_TRACKS)[number]["id"]) => {
    const res = buyUpgrade(progress, detail.id, track);
    if (res.ok) {
      sfxPickup();
      commit(res.progress);
    } else {
      sfxError();
      if (res.reason === "insufficient_funds") {
        // Csak a visszajelzés szövege: az ár ugyanaz, amit a `buyUpgrade` is számol (következő szint).
        const t = UPGRADE_TRACKS.find((x) => x.id === track)!;
        const next = (upgradesFor(progress, detail.id)[track] ?? 0) + 1;
        const missing = upgradeCost(track, next) - progress.coins;
        notify(`Még ${fmt(missing)} SC hiányzik: ${t.label} ${next}. szint (${fmt(upgradeCost(track, next))} SC).`);
      } else {
        notify("Ez már a maximum szint.");
      }
    }
  };

  const pick = (id: string) => {
    sfxClick();
    setDetailId(id);
  };

  const detailUpgrades = upgradesFor(progress, detail.id);
  // J7a: ugyanaz a közös számítás, amelyből a játék is dolgozik — a sávok és a vezetés nem térhet el.
  const detailStats = effectiveStats(detail, detailUpgrades);
  const isOwned = owned.has(detail.id);
  const isLocked = detail.unlockLevel > progress.highestLevelUnlocked;

  const filters = (
    <div
      className="flex gap-2 flex-nowrap overflow-x-auto overflow-y-hidden pb-1 shrink-0"
      role="group"
      aria-label="Járműkategória"
    >
      <FilterChip testId="tornado-garage-filter-all" active={category === "all"} onClick={() => setCategory("all")}>
        Mind ({VEHICLES.length})
      </FilterChip>
      {VEHICLE_CATEGORIES.map((c) => (
        <FilterChip key={c.id} testId={`tornado-garage-filter-${c.id}`} active={category === c.id} onClick={() => setCategory(c.id)}>
          {c.label}
        </FilterChip>
      ))}
    </div>
  );

  const tiles = list.map((v) => (
    <VehicleTile
      key={v.id}
      vehicle={v}
      owned={owned.has(v.id)}
      locked={v.unlockLevel > progress.highestLevelUnlocked}
      active={detailId === v.id}
      inRow={!landscape}
      onPick={() => pick(v.id)}
    />
  ));

  const details = (
    <div className="flex flex-col gap-3" data-testid="tornado-garage-detail">
      <div className="flex items-center gap-3">
        <VehicleArt vehicle={detail} className={`${landscape ? "w-28" : "w-32 sm:w-40"} shrink-0`} />
        <div className="min-w-0 flex-1">
          <h3 className="font-extrabold text-white text-base leading-tight">{detail.name}</h3>
          <p className="text-xs mt-1">
            <span className="font-bold" style={{ color: RARITY_COLOR[detail.rarity] }}>
              {RARITY_LABEL[detail.rarity]}
            </span>
            <span className="text-white/70"> · {categoryLabel(detail.category)}</span>
          </p>
          <p className="text-xs text-white/70">Feloldás: {detail.unlockLevel}. szint</p>
          <p className="text-sm font-bold text-amber-300 mt-0.5">{fmt(detail.price)} SC</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        <StatBar label="Sebesség" value={detail.speed} max={260} />
        <StatBar label="Gyorsulás" value={detailStats.acceleration} max={130} />
        <StatBar label="Irányítás" value={detailStats.handling} max={130} />
        <StatBar label="Tapadás" value={detailStats.grip} max={130} />
        {/* Kanban #83 (J7b): a sáv a játékban ténylegesen ható számot mutatja — Stabilitás = ütközés-tűrés, Horgony =
            rögzítési gyorsaság (a jármű alap stabilitása / horgonyereje nem hat), a szélállóság a telítési pontig. */}
        <StatBar label="Stabilitás" value={detailStats.crashTolerance} max={130} />
        <StatBar label="Szélállóság" value={detailStats.windResistance} max={130} />
        <StatBar label="Horgony" value={detailStats.anchorSpeed} max={130} />
        <StatBar label="Mérősáv" value={detailStats.instruments} max={130} />
      </div>

      {!isOwned && (
        <Button className="h-12 w-full text-sm bg-lime-600 hover:bg-lime-500 text-slate-950 font-bold gap-1" disabled={isLocked} onClick={doBuy}>
          {isLocked ? <Lock className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
          {isLocked ? `Zárolva (${detail.unlockLevel}. szint)` : `Vásárlás — ${fmt(detail.price)} SC`}
        </Button>
      )}
      {isOwned && progress.selectedVehicleId !== detail.id && (
        <Button className="h-12 w-full text-sm bg-sky-600 hover:bg-sky-500 font-bold" onClick={doSelect}>
          Kiválasztás
        </Button>
      )}
      {isOwned && progress.selectedVehicleId === detail.id && (
        <p className="text-sm font-semibold text-emerald-300">✓ Aktuális jármű</p>
      )}
    </div>
  );

  const upgrades = isOwned ? (
    <section aria-label="Fejlesztés" className="border-t border-white/10 pt-2">
      <p className="text-xs uppercase tracking-wide text-white/70 mb-1.5 flex items-center gap-1">
        <Wrench className="w-3.5 h-3.5" aria-hidden="true" /> Fejlesztés
      </p>
      <div className={`grid grid-cols-1 gap-1.5 ${landscape ? "" : "sm:grid-cols-2"}`}>
        {UPGRADE_TRACKS.map((t) => (
          <UpgradeRow key={t.id} track={t} level={detailUpgrades[t.id] ?? 0} coins={progress.coins} onBuy={() => doUpgrade(t.id)} />
        ))}
      </div>
    </section>
  ) : (
    <p className="text-sm text-white/70 border-t border-white/10 pt-2">Vedd meg a járművet, és utána fejlesztheted.</p>
  );

  const footnote = (
    <p className="text-xs text-white/60 text-center">
      Feloldható most: {purchasableVehicles(progress.highestLevelUnlocked, progress.ownedVehicleIds).length} jármű
    </p>
  );

  const header = <ScreenHeader icon={<Car className="w-5 h-5 text-lime-300" />} title="Vihargarázs" onBack={props.onBack} />;

  return (
    <section
      data-testid="tornado-garage"
      data-layout={landscape ? "landscape" : "portrait"}
      className={`rounded-2xl border border-lime-400/40 bg-slate-950/85 p-1.5 sm:p-3 flex flex-col gap-2 ${landscape ? "flex-1 min-h-0" : ""}`}
    >
      {/* Visszajelzés (vásárlás, kevés SC): a képernyő alján lebeg, így a lap aljáról koppintva is látszik. */}
      {flash && (
        <p
          role="status"
          data-testid="tornado-garage-flash"
          className="pointer-events-none fixed inset-x-3 z-40 mx-auto max-w-md text-sm font-semibold text-center rounded-xl bg-slate-800/95 border border-amber-300/40 px-3 py-2 shadow-lg"
          style={{ bottom: "max(16px, calc(var(--game-safe-bottom) + 12px))" }}
        >
          {flash}
        </p>
      )}

      {landscape ? (
        // Fekvő: bal hasáb = fejléc + egysoros, vízszintesen lapozható szűrő + saját görgetésű járműrács; jobb hasáb =
        // részletek + fejlesztések saját görgetéssel. A túlcsordulást a ScrollPane alsó átúszása jelzi.
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-3">
          <div className="min-h-0 flex flex-col gap-1.5">
            {header}
            {filters}
            <ScrollPane className="flex-1" innerClassName="flex flex-col gap-2 pb-6" testId="tornado-garage-list" ariaLabel="Járművek">
              <div className="grid grid-cols-3 lg:grid-cols-4 gap-2">{tiles}</div>
              {footnote}
            </ScrollPane>
          </div>
          <ScrollPane innerClassName="flex flex-col gap-3 pb-6" testId="tornado-garage-side" ariaLabel="A kiválasztott jármű">
            {details}
            {upgrades}
          </ScrollPane>
        </div>
      ) : (
        <>
          {header}
          {filters}
          <div
            ref={rowRef}
            className="relative flex gap-2 overflow-x-auto overflow-y-hidden pb-1 snap-x"
            data-testid="tornado-garage-list"
            aria-label="Járművek"
          >
            {tiles}
          </div>
          {details}
          {upgrades}
          {footnote}
        </>
      )}
    </section>
  );
}

function VehicleTile(props: {
  vehicle: Vehicle;
  owned: boolean;
  locked: boolean;
  active: boolean;
  inRow: boolean;
  onPick: () => void;
}) {
  const { vehicle: v } = props;
  return (
    <button
      type="button"
      data-testid={`tornado-garage-vehicle-${v.id}`}
      data-vehicle-id={v.id}
      aria-pressed={props.active}
      onClick={props.onPick}
      className={`relative text-left rounded-xl border p-1.5 transition-colors ${props.inRow ? "shrink-0 w-28 snap-start" : ""} ${
        props.active ? "border-lime-400/80 bg-lime-900/25" : "border-white/10 bg-slate-900/60 hover:border-white/25"
      }`}
    >
      <VehicleArt vehicle={v} className={`w-full ${props.locked && !props.owned ? "opacity-60" : ""}`} />
      {props.locked && !props.owned && (
        <Lock className="w-4 h-4 absolute top-2.5 right-2.5 text-white/90" aria-label="Zárolva" />
      )}
      {props.owned && <span className="absolute top-2 right-2.5 text-sm text-emerald-300 font-bold">✓</span>}
      <span className="block text-xs font-semibold truncate text-white mt-1">{v.name}</span>
      <span className="block text-xs font-semibold" style={{ color: RARITY_COLOR[v.rarity] }}>
        {fmt(v.price)} SC
      </span>
    </button>
  );
}

/**
 * Egy fejlesztés-sor: a sor maga a gomb (≥ 48 px). Látszik a szint (5 pötty), a KÖVETKEZŐ szint ára, és hogy elég-e
 * az SC (ha nem: halvány ár + „kevés SC”); maximumon „MAX”.
 */
function UpgradeRow(props: { track: (typeof UPGRADE_TRACKS)[number]; level: number; coins: number; onBuy: () => void }) {
  const { track, level } = props;
  const max = level >= MAX_UPGRADE_LEVEL;
  const cost = max ? 0 : upgradeCost(track.id, level + 1);
  const affordable = !max && props.coins >= cost;
  const label = max
    ? `${track.label}: maximum szint (${MAX_UPGRADE_LEVEL})`
    : `${track.label} fejlesztése, ${level}. szint → ${level + 1}. szint, ${fmt(cost)} SC${affordable ? "" : " — nincs elég SC"}`;
  return (
    <button
      type="button"
      data-testid={`tornado-garage-upgrade-${track.id}`}
      data-level={level}
      data-affordable={String(affordable)}
      aria-label={label}
      onClick={props.onBuy}
      className={`min-h-12 w-full flex items-center gap-2 rounded-xl border px-3 py-1.5 text-left transition-colors ${
        max
          ? "border-emerald-400/30 bg-emerald-950/30"
          : affordable
            ? "border-lime-400/40 bg-slate-800/70 hover:bg-slate-700/80"
            : "border-white/10 bg-slate-900/60"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-white leading-tight">{track.label}</span>
        <span className="block text-xs text-white/60 leading-tight truncate">{track.effectLabel}</span>
      </span>
      <span className="flex gap-1 shrink-0" aria-hidden="true">
        {Array.from({ length: MAX_UPGRADE_LEVEL }, (_, i) => (
          <span key={i} className={`w-2.5 h-2.5 rounded-full ${i < level ? "bg-lime-400" : "bg-white/15 border border-white/25"}`} />
        ))}
      </span>
      <span
        className={`shrink-0 min-w-[5.5rem] text-center rounded-lg px-2 py-1 text-xs font-bold leading-tight ${
          max ? "text-emerald-200" : affordable ? "bg-lime-500 text-slate-950" : "bg-slate-800 text-white/60"
        }`}
        aria-hidden="true"
      >
        {max ? "MAX" : `+ ${fmt(cost)} SC`}
        {!max && !affordable && <span className="block font-semibold text-amber-200/90">kevés SC</span>}
      </span>
    </button>
  );
}

function StatBar(props: { label: string; value: number; max: number }) {
  const pct = Math.max(4, Math.min(100, (props.value / props.max) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs text-white/70">
        <span>{props.label}</span>
        <span>{Math.round(props.value)}</span>
      </div>
      <div className="h-1.5 rounded bg-slate-800 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-sky-500 to-lime-400" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FilterChip(props: { active: boolean; onClick: () => void; testId?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      data-testid={props.testId}
      aria-pressed={props.active}
      onClick={props.onClick}
      className={`shrink-0 min-h-11 text-sm font-semibold px-4 py-2 rounded-full border whitespace-nowrap ${
        props.active ? "border-lime-400/70 bg-lime-900/30 text-lime-200" : "border-white/15 bg-slate-900/50 text-white/80"
      }`}
    >
      {props.children}
    </button>
  );
}

/* ============================ Levels ============================ */

function LevelsScreen(props: { progress: TornadoProgress; onBack: () => void; onPick: (level: number) => void }) {
  const groups = useMemo(() => levelsByStage(), []);
  const [openStage, setOpenStage] = useState<string>(() => stageForLevel(props.progress.highestLevelUnlocked).id);

  return (
    <Card className="border border-sky-400/40 bg-slate-950/80 backdrop-blur-md flex-1 flex flex-col min-h-0">
      <CardContent data-game-card-content className="p-3 sm:p-4 flex flex-col gap-2 flex-1 min-h-0">
        <ScreenHeader icon={<TornadoIcon className="w-5 h-5 text-sky-300" />} title="Szintek (1–200)" onBack={props.onBack} />
        <ScrollPane className="flex-1" innerClassName="flex flex-col gap-2 pb-6" testId="tornado-levels-list" ariaLabel="Szintek">
          {groups.map(({ stage, levels }) => {
            const unlockedInStage = levels.filter((l) => l.level <= props.progress.highestLevelUnlocked).length;
            const open = openStage === stage.id;
            return (
              <div key={stage.id} className="rounded-lg border border-white/10 bg-slate-900/50">
                <button
                  className="w-full min-h-12 flex items-center justify-between px-3 py-2"
                  onClick={() => {
                    sfxClick();
                    setOpenStage(open ? "" : stage.id);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                    <span className="font-bold text-sm text-white">{stage.label}</span>
                    <span className="text-xs text-white/50">
                      {stage.from}–{stage.to}
                    </span>
                  </span>
                  <span className="text-xs text-white/60">
                    {unlockedInStage}/{levels.length}
                  </span>
                </button>
                {open && (
                  <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5 p-2 pt-0">
                    {levels.map((l) => {
                      const unlocked = l.level <= props.progress.highestLevelUnlocked;
                      const record = props.progress.levelRecords[String(l.level)];
                      return (
                        <button
                          key={l.level}
                          disabled={!unlocked}
                          onClick={() => {
                            sfxClick();
                            props.onPick(l.level);
                          }}
                          className={`aspect-square rounded flex flex-col items-center justify-center text-xs font-bold border ${
                            unlocked
                              ? "border-white/15 bg-slate-800/80 text-white hover:bg-sky-900/50 hover:border-sky-400/50"
                              : "border-white/5 bg-slate-950/60 text-white/25"
                          } ${l.level === 200 ? "ring-1 ring-rose-500/60" : ""}`}
                          title={record ? `Rekord: ${fmt(record.score)}` : undefined}
                        >
                          {unlocked ? l.level : <Lock className="w-3 h-3" />}
                          {record && <span className="text-xs text-emerald-300 leading-none">★</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </ScrollPane>
        <p className="text-xs text-white/40 text-center">A 200. szint — a Végső Vihar — a legnehezebb kihívás.</p>
      </CardContent>
    </Card>
  );
}

/* ============================ Settings ============================ */

function SettingsScreen(props: { progress: TornadoProgress; commit: (p: TornadoProgress) => void; onBack: () => void }) {
  const { progress, commit } = props;
  const s = progress.settings;
  const set = (patch: Partial<TornadoProgress["settings"]>) => commit(updateSettings(progress, patch));

  // Spec 2026-09-29: a teljes általános és középiskola (7–12: közös évfolyam-bank).
  const schoolOptions: SchoolLevel[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, "auto"];
  const quizModes: QuizMode[] = ["math", "english", "mixed"];
  const qualities: GraphicsQuality[] = ["low", "medium", "high"];

  return (
    <Card className="border border-slate-400/40 bg-slate-950/80 backdrop-blur-md flex-1 flex flex-col min-h-0">
      <CardContent data-game-card-content className="p-3 sm:p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
        <ScreenHeader icon={<SettingsIcon className="w-5 h-5 text-slate-300" />} title="Beállítások" onBack={props.onBack} />

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-white/60 mb-1.5">Iskolai szint</p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5" data-testid="tornado-school-levels">
            {schoolOptions.map((opt) => (
              <ToggleChip
                key={String(opt)}
                active={s.school === opt}
                onClick={() => set({ school: opt })}
                className="min-h-[44px] w-full px-1 whitespace-nowrap"
              >
                {schoolLevelLabel(opt)}
              </ToggleChip>
            ))}
          </div>
          <p className="text-xs text-white/45 mt-1">
            AUTO: a szint alapján választja az osztályt (1–16 → 1. o. … 184–200 → 12. o.).
          </p>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-white/60 mb-1.5">Kérdéstípus</p>
          <div className="flex gap-1.5">
            {quizModes.map((m) => (
              <ToggleChip key={m} active={s.quizMode === m} onClick={() => set({ quizMode: m })}>
                {QUIZ_MODE_LABEL[m]}
              </ToggleChip>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-white/60 mb-1.5">Grafika</p>
          <div className="flex gap-1.5">
            {qualities.map((q) => (
              <ToggleChip key={q} active={s.quality === q} onClick={() => set({ quality: q })}>
                {q === "low" ? "Alacsony" : q === "medium" ? "Közepes" : "Magas"}
              </ToggleChip>
            ))}
          </div>
          <p className="text-xs text-white/45 mt-1">Gyengébb gépen / mobilon az Alacsony ad nagyobb FPS-t.</p>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-white/60 mb-1.5">Irányítás</p>
          <div className="flex gap-1.5">
            <ToggleChip active={!s.leftHanded} onClick={() => set({ leftHanded: false })}>
              Jobbkezes
            </ToggleChip>
            <ToggleChip active={s.leftHanded} onClick={() => set({ leftHanded: true })}>
              Balkezes
            </ToggleChip>
          </div>
        </div>

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-white/60 mb-1.5">Kamera</p>
          <div className="flex gap-1.5">
            <ToggleChip active={s.cameraMode === "chase"} onClick={() => set({ cameraMode: "chase" })}>
              Követő
            </ToggleChip>
            <ToggleChip active={s.cameraMode === "cockpit"} onClick={() => set({ cameraMode: "cockpit" })}>
              Vezetőfülke
            </ToggleChip>
          </div>
        </div>

        <div className="text-xs text-white/50 border border-white/10 rounded p-2 bg-slate-900/50">
          <p className="font-semibold text-white/70 mb-1">Irányítás PC-n</p>
          <p>W/S — gáz/fék · A/D — kormány · Szóköz — kézifék · F — horgony · C — kamera · Esc — menü</p>
          <p className="font-semibold text-white/70 mt-2 mb-1">Mobil</p>
          <p>Bal: kormány · Jobb: gáz, fék, horgony. A gombok az irányítás-móddal oldalt válthatók.</p>
          <p className="font-semibold text-white/70 mt-2 mb-1">Elágazás</p>
          <p>Koppints a jó táblára (vagy 1–3), vagy fékezz, és hajts át a kapuján.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ToggleChip(props: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button
      onClick={() => {
        sfxClick();
        props.onClick();
      }}
      aria-pressed={props.active}
      className={`min-h-12 text-sm px-3 py-2 rounded-lg border font-semibold ${
        props.active ? "border-sky-400/70 bg-sky-900/40 text-sky-100" : "border-white/15 bg-slate-900/50 text-white/70"
      } ${props.className ?? ""}`}
    >
      {props.children}
    </button>
  );
}

/* ============================ Highscore ============================ */

function HighscoreScreen(props: { progress: TornadoProgress; onBack: () => void }) {
  const { stats } = props.progress;
  const records = Object.entries(props.progress.levelRecords)
    .map(([level, rec]) => ({ level: Number(level), ...rec }))
    .sort((a, b) => a.level - b.level);
  const bestLevel = records.reduce((m, r) => Math.max(m, r.level), 0);
  const bestTime = records.reduce((m, r) => (r.bestTime > 0 ? Math.min(m, r.bestTime) : m), Infinity);

  return (
    <Card className="border border-amber-400/40 bg-slate-950/80 backdrop-blur-md flex-1 flex flex-col min-h-0">
      <CardContent data-game-card-content className="p-3 sm:p-4 flex flex-col gap-3 flex-1 overflow-y-auto">
        <ScreenHeader icon={<Trophy className="w-5 h-5 text-amber-300" />} title="Rekordok" onBack={props.onBack} />
        <div className="grid grid-cols-2 gap-2">
          <BigStat label="Összpontszám" value={fmt(props.progress.totalScore)} />
          <BigStat label="Legjobb szint" value={String(bestLevel || 1)} />
          <BigStat label="Elfogott tornádók" value={fmt(stats.tornadoesIntercepted)} />
          <BigStat label="Helyes válaszok" value={fmt(stats.correctAnswers)} />
          <BigStat label="Legjobb idő" value={Number.isFinite(bestTime) ? `${Math.round(bestTime)} s` : "—"} />
          <BigStat label="Max szél" value={`${fmt(stats.maxWindSpeed)} km/h`} />
        </div>
        <p className="text-xs font-bold uppercase tracking-wide text-white/60 mt-1">Szintenkénti rekordok</p>
        <div className="flex flex-col gap-1 overflow-y-auto">
          {records.length === 0 && <p className="text-sm text-white/50">Még nincs teljesített szint.</p>}
          {records.map((r) => (
            <div key={r.level} className="flex items-center justify-between text-xs rounded bg-slate-900/50 border border-white/10 px-2.5 py-1.5">
              <span className="font-bold text-white">Szint {r.level}</span>
              <span className="text-amber-300 font-semibold">{fmt(r.score)} pont</span>
              <span className="text-white/60">{Math.round(r.bestTime)} s</span>
              <span className="text-sky-300">{fmt(r.peakWind)} km/h</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================ Stats ============================ */

function StatsScreen(props: { progress: TornadoProgress; onBack: () => void }) {
  const { stats } = props.progress;
  const rows: [string, string][] = [
    ["Összes pont", fmt(stats.totalPoints)],
    ["Legjobb szintpontszám", fmt(stats.bestLevelScore)],
    ["Teljesített szintek", fmt(stats.levelsCompleted)],
    ["Elfogott tornádók", fmt(stats.tornadoesIntercepted)],
    ["Sikeres horgonyzások", fmt(stats.successfulAnchors)],
    ["Helyes válaszok", fmt(stats.correctAnswers)],
    ["Hibás válaszok", fmt(stats.wrongAnswers)],
    ["Megtett kilométerek", `${stats.kilometersTraveled.toFixed(1)} km`],
    ["Legnagyobb szélsebesség", `${fmt(stats.maxWindSpeed)} km/h`],
    ["Leghosszabb elfogás", `${Math.round(stats.longestIntercept)} s`],
  ];
  return (
    <Card className="border border-cyan-400/40 bg-slate-950/80 backdrop-blur-md flex-1 flex flex-col min-h-0">
      <CardContent data-game-card-content className="p-3 sm:p-4 flex flex-col gap-2 flex-1 overflow-y-auto">
        <ScreenHeader icon={<BarChart3 className="w-5 h-5 text-cyan-300" />} title="Statisztika" onBack={props.onBack} />
        <div className="flex flex-col gap-1">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between text-sm rounded bg-slate-900/50 border border-white/10 px-3 py-2">
              <span className="text-white/70">{label}</span>
              <span className="font-bold text-white">{value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BigStat(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-slate-900/50 p-2.5">
      <p className="text-xs uppercase tracking-wide text-white/50">{props.label}</p>
      <p className="text-lg font-extrabold text-white">{props.value}</p>
    </div>
  );
}

/* ============================ Shared bits ============================ */

function ScreenHeader(props: { icon: React.ReactNode; title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        className="text-white/80 hover:bg-white/10 gap-1 h-12 px-3 text-sm"
        onClick={() => {
          sfxClick();
          props.onBack();
        }}
      >
        <ArrowLeft className="w-4 h-4" /> Vissza
      </Button>
      <span className="flex items-center gap-1.5 ml-1">
        {props.icon}
        <h2 className="text-base font-extrabold text-white">{props.title}</h2>
      </span>
    </div>
  );
}

/* ============================ Play (3D) ============================ */

function PlayScreen(props: {
  level: number;
  vehicle: Vehicle;
  progress: TornadoProgress;
  coupon: CouponSession;
  /** S13 / B6: a futás új jelvényei az eredménykártya közös sorában. */
  newlyUnlocked: Achievement[];
  syncEligible: boolean;
  /** Teszt-kampó (növekvő sorszám): > 0 és változik → győzelmi eredmény. */
  forceResult: number;
  /** Teszt-kampó (növekvő sorszám): > 0 és változik → kvíz feldobása (M9/M10 rossz válasz). */
  forceQuiz: number;
  /** J7a teszt-kampó: `n` > 0 és változik → a játékos `km` távolságra kerül a tölcsértől. */
  forceNear: { n: number; km: number };
  /** J7b teszt-kampó: `n` > 0 és változik → azonnali elágazás; `long` → a leghosszabb válaszú teszt-tétel. */
  forceJunction: { n: number; long: boolean };
  /** A menü pályaválasztójából indított futás pályája (1–10), különben `null`. */
  gradeLevel: number | null;
  onGradeLevelWin: () => void;
  /** „Szintek” (szünet menü): vissza a szintlistára / menübe. */
  onExit: () => void;
  /** Eredményképernyő „Vissza a játékokhoz”. */
  onBackToGames: () => void;
  /** Győzelem után a következő szint / pálya indítása (felirat + művelet), ha van ilyen. */
  next: { label: string; go: () => void } | null;
  /** Futás vége: a feloldott jelvények (a haladást a funkcionális `onProgress` menti). */
  onComplete: (unlocked: Achievement[]) => void;
  /** A haladás mentése — CSAK funkcionális frissítéssel, hogy késleltetett / aszinkron mentés se írjon vissza elavult mezőt. */
  onProgress: (update: (latest: TornadoProgress) => TornadoProgress) => void;
  onSubmitBest: (score: number) => { best: number; isNewBest: boolean };
  onShellState: (state: GameScreenState) => void;
  /** A közös keret automatikus szünete (háttérbe kerülés, elforgatás) ezt hívja. */
  autoPauseRef: React.MutableRefObject<() => void>;
  /** K.2 teszt-kampó: a `probe()` mérője (a futás alatt ez a PlayScreen tölti ki). */
  probeRef: React.MutableRefObject<(() => Record<string, number | string | null>) | null>;
}) {
  const spec = useMemo<LevelSpec>(() => levelSpec(props.level), [props.level]);
  /** Pályás futásban a sáv mérsékelten szűkíti/bővíti az időkeretet (E szelet, D6); a „Szintek”-ből indítva a régi. */
  const runTimeLimit = useMemo(
    () =>
      props.gradeLevel == null
        ? spec.timeLimit
        : Math.round(spec.timeLimit * tornadoLevelTimeScale(levelBand(props.gradeLevel))),
    [spec, props.gradeLevel],
  );
  const quality = props.progress.settings.quality;
  /**
   * J7a: az öt fejlesztés hatása — ugyanaz a közös számítás (`upgrades.ts`), amelyet a garázs sávjai is mutatnak.
   * A kiválasztott jármű fejlesztései futás közben nem változnak, ezért képkockánként nem számoljuk újra.
   */
  const eff = useMemo(
    () => effectiveStats(props.vehicle, upgradesFor(props.progress, props.vehicle.id)),
    [props.vehicle, props.progress.upgrades],
  );
  const effRef = useRef(eff);
  effRef.current = eff;
  /** A szint a fejlesztett (a `instruments` szerint szélesebb) mérési sávval: minden horgony-szabály ezt olvassa. */
  const bandSpec = useMemo<LevelSpec>(
    () => ({ ...spec, anchorBand: effectiveAnchorBand(spec.anchorBand, eff.bandWidthFactor) }),
    [spec, eff.bandWidthFactor],
  );
  const bandSpecRef = useRef(bandSpec);
  bandSpecRef.current = bandSpec;

  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [phase, setPhase] = useState<PlayPhase>("seeking");
  const [hud, setHud] = useState({
    wind: 0,
    windDir: 45,
    maxWind: 0,
    distanceKm: 0,
    /** A cél iránya a jármű orrához képest — a G-9b céljelzőnek. */
    targetRelDeg: 0,
    anchorReady: false,
    /** J7a: a távolság a mérési sávban van (a ⚓ csak itt aktív; a sebesség-feltétel nélkül). */
    inBand: false,
    surface: "grass" as ReturnType<typeof surfaceAt>,
    timeLeft: runTimeLimit,
    stormPct: 0,
    score: 0,
    /** J7b: nitró fut (jó válasz az elágazásnál / a turbópadon). */
    nitro: false,
  });
  /**
   * G-1 → J7b (terv 9., J5): a hibás válasz NEM nyit magától kártyát — a helyes megoldás a játéktérben (kapu-tábla, sáv)
   * ≥ 1,8 mp-ig látszik, a tétel az ismétlési sorba kerül, és a „Miért?” gomb nyitja a teljes magyarázatot. Amíg a kártya
   * nyitva van, áll a játék és a kérdés-óra.
   */
  const [feedback, setFeedback] = useState<FeedbackCard | null>(null);
  const feedbackRef = useRef<FeedbackCard | null>(null);
  feedbackRef.current = feedback;
  /** A kérdés-sáv „Mutasd” (kinyitott hosszú kérdés) — amíg nyitva, áll a játék (terv 8.9). */
  const expandedRef = useRef(false);
  const expandedIdRef = useRef<number | null>(null);
  const [anchorMsg, setAnchorMsg] = useState<string | null>(null);
  /** J7b: az elágazás / turbó következménye („Rövidítés — turbó!”, „Kerülő: −9 mp”), a sáv alatt. */
  const [chaseMsg, setChaseMsg] = useState<{ text: string; tone: "good" | "bad" } | null>(null);
  const [result, setResult] = useState<{
    score: number;
    coins: number;
    won: boolean;
    correct: number;
    total: number;
    best: number;
    isNewBest: boolean;
    /** J7a: a pont-bontás az eredményképernyőre (csak győzelemnél van értelmes bontás). */
    breakdown: RewardResult["breakdown"] | null;
  } | null>(null);
  /**
   * S12: a szünet KÜLÖN állapot, nem fázis — így a kvíz / horgonyzás közben kért szünet után a fázis érintetlen,
   * és a késleltetett fázisváltások (játékóra-időzítők) sem tudják eltüntetni a szünet menüt.
   */
  const [paused, setPaused] = useState(false);
  const touch = useTouchCapable();
  const haptics = useHaptics();
  /** A központi szóbank (A8); `null`, amíg tölt vagy ha nem tölthető — ilyenkor a kézi bank kérdez. */
  const vocab = useVocabQuizSource("en", true);
  const vocabRef = useRef(vocab);
  vocabRef.current = vocab;

  // Material quizzes for this grade.
  const grades = resolveGrades(props.progress.settings.school, props.level);
  const primaryGrade = grades[grades.length - 1]!;
  const { data: materialData } = useQuery<{ items: unknown[] }>({
    queryKey: ["/api/games/material-quizzes", primaryGrade, props.coupon.lessonId],
    queryFn: async () => {
      const res = await fetch(`/api/games/material-quizzes?classroom=${primaryGrade}&limit=3${props.coupon.lessonId ? `&lessonId=${encodeURIComponent(props.coupon.lessonId)}` : ""}`, {
        credentials: "include",
      });
      if (!res.ok) return { items: [] };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  const materialQuestions = useMemo<Question[]>(
    () => materialToQuestions((materialData?.items as never[]) ?? [], primaryGrade),
    [materialData, primaryGrade],
  );

  /* ------- refs mirrored from state for the animation loop ------- */
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  /* ------- J7b: seed (K.4/12–13, KSZ-2/3) ------- */
  /** A menet seedje: `?seed=` (teszt-kampó) vagy a nap + a szint; menetenként `seedFrom(alap, futás)`. */
  const seedBase = useMemo(() => readGameSeed() ?? seedFrom(GAME_ID, new Date().toISOString().slice(0, 10), props.level), [props.level]);
  const runIndexRef = useRef(0);
  const runSeedRef = useRef<string>(seedFrom(seedBase, 0));
  /** A menet játékmenet-RNG-je (kérdés-sorsolás, a tölcsér kezdőszöge, a szél) és a kozmetikai `fxRng` (villám). */
  const worldRngRef = useRef<SeededRng>(createRng(seedFrom(runSeedRef.current, "world")));
  const fxRngRef = useRef<SeededRng>(createRng(seedFrom(runSeedRef.current, "fx")));
  const playerRef = useRef<PlayerState>({ x: fromKm(0.02) * 0, z: HALF_WORLD * 0, heading: 0, speed: 0, anchored: false });
  const tornadoPosRef = useRef({ x: 0, z: 0, angle: 0, born: 0, alive: true });
  const windRef = useRef<WindState>(initialWind(spec));
  const timeLeftRef = useRef(runTimeLimit);
  const scoreRef = useRef(0);
  const correctRef = useRef(0);
  const wrongRef = useRef(0);
  /** J7a: a menet legjobb helyes-válasz sorozata (`runStreak` a ranglistára, `maxStreak` az eredményekhez). */
  const streakRef = useRef(createStreakTracker());
  const anchorAttemptsRef = useRef(1);
  const elapsedRef = useRef(0);
  const distanceTravelledRef = useRef(0);
  const timeoutsRef = useRef<number[]>([]);
  const pausedRef = useRef(false);
  /**
   * Review-lelet (#426, elavult időzítők): a futás azonosítója. Újrakezdés növeli; minden késleltetett visszahívás
   * a saját futásához kötött, így egy előző futás időzítője nem vált fázist az újban.
   */
  const runIdRef = useRef(0);
  /** Játékóra (s): csak szünet nélkül halad — a fázisváltó időzítők ehhez mérnek, ezért szünetben állnak. */
  const gameClockRef = useRef(0);
  const gameTimersRef = useRef<Array<{ at: number; run: number; fn: () => void }>>([]);
  const primaryGradeRef = useRef(primaryGrade);
  primaryGradeRef.current = primaryGrade;
  /** Látszik-e a közös forgatási kérés (10 Hz-en mintavételezve a képkocka-ciklusban). */
  const rotateBlockRef = useRef(false);
  const hintCheckRef = useRef(0);
  /** Látvány: befogáskori kitörés hátralévő ideje (s) — a tölcsér addig gyorsabban pörög. */
  const burstRef = useRef(0);
  const onExitRef = useRef(props.onExit);
  onExitRef.current = props.onExit;
  const onProgressRef = useRef(props.onProgress);
  onProgressRef.current = props.onProgress;
  /** Kozmetikai (üzenet-eltüntető) időzítő valós időben; csak a saját futásában fut le. */
  const scheduleTimeout = (fn: () => void, ms: number) => {
    const run = runIdRef.current;
    const id = window.setTimeout(() => {
      timeoutsRef.current = timeoutsRef.current.filter((x) => x !== id);
      if (run === runIdRef.current) fn();
    }, ms);
    timeoutsRef.current.push(id);
    return id;
  };
  /** Fázist váltó időzítő a játékórán: szünetben áll, újrakezdés / befejezés után nem fut le. */
  const scheduleGame = (fn: () => void, ms: number) => {
    gameTimersRef.current.push({ at: gameClockRef.current + ms / 1000, run: runIdRef.current, fn });
  };
  const clearPendingTimers = () => {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
    gameTimersRef.current = [];
  };
  const recentQuizRef = useRef<string[]>([]);
  /** Spec 2026-09-29: a futásban feltett kérdések — a 7–12. évfolyamos közös bank nem ismétel. */
  const gradeSeenRef = useRef(createGradeQuizSeen());
  const adaptiveRef = useRef(createAdaptiveSession(primaryGrade, props.gradeLevel));
  const keysRef = useRef({ fwd: false, back: false, left: false, right: false, brake: false });
  /** Analog stick input (spec 2026-09-29-tornado-ut-kormanyzas D3). */
  const touchRef = useRef<TouchDrive>({ throttle: 0, steer: 0 });
  /** Smoothed ground height under the camera (spec D6); NaN = snap on the next frame. */
  const camGroundRef = useRef(Number.NaN);
  /** Bumped on blur / hidden tab: the VirtualJoystick drops a drag that is still in progress. */
  const [touchReset, setTouchReset] = useState(0);
  // Joystick-reakció (#49): a bemenet → válasz mérő kampója (csak teszt-kampós buildben él).
  countRender("tornado-play");
  useEffect(
    () =>
      registerInputProbe("tornado", () => {
        const p = playerRef.current;
        return { heading: p.heading, speed: p.speed, x: p.x, z: p.z, steerIn: touchRef.current.steer, throttleIn: touchRef.current.throttle };
      }),
    [],
  );
  const padAnchorPrevRef = useRef(false);
  const padGateRef = useRef(createGamepadRestGate());
  const finishedRef = useRef(false);
  const materialRef = useRef<Question[]>(materialQuestions);
  materialRef.current = materialQuestions;
  const settingsRef = useRef(props.progress.settings);
  settingsRef.current = props.progress.settings;

  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    vehicle: THREE.Group;
    tornado: TornadoMesh;
    rain: THREE.Points;
    chunks: Map<string, THREE.Object3D[]>;
    lightning: THREE.PointLight;
    skyDome: THREE.Mesh;
    stormCloud: StormCloud;
    sun: THREE.DirectionalLight;
    postFx: PostFx;
    dust: SparkleField;
    dustCarry: number;
    /** J7b: a három elágazás-tábla (oszlop + tábla) és a turbópad — előre létrehozva, újrahasznosítva (KSZ-6). */
    signs: THREE.Group[];
    pad: THREE.Mesh;
  } | null>(null);
  /** A vászon CSS-mérete (a táblafeliratok vetítéséhez). */
  const sizeRef = useRef({ w: 640, h: 480, top: 0 });
  /** A kérdés-sáv kártyájának alja (képernyő-px, 10 Hz-en mérve): a táblafeliratok ez alá kerülnek, nem a kártya mögé. */
  const cardBottomRef = useRef(0);

  const rafRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);

  // G-5: a rajzoló hurok ref-ekből olvas (nem indul újra minden renderre),
  // ezért a beállítást ide tükrözzük.
  const reducedMotion = useReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  /* ------- J7b: a menet seedelt RNG-je a kérdés-sorsoláshoz ------- */
  const drawRng = useCallback(() => worldRngRef.current.next(), []);

  /* ------- J7b: kérdésforrás (a meglévő választó), a közös kérdés-sáv és a közös mag ------- */
  const couponRef = useRef(props.coupon);
  couponRef.current = props.coupon;
  /** A director kulcsa → a Tornado-tétel (a kérdés-fajta címkéjének témája / tantárgya). */
  const questionMetaRef = useRef(new Map<string, Question>());
  const couponRepeatRef = useRef(0);
  /** Teszt-kampó: a következő új tétel (a leghosszabb válaszú mérő-tétel). */
  const forcedQuizRef = useRef<Question | null>(null);
  const quizModeNow = (): QuizMode => (couponRef.current.active ? "mixed" : settingsRef.current.quizMode);
  const provider = useMemo<QuestionProvider>(() => {
    const asQuiz = (q: Question) => ({ id: q.id, prompt: q.prompt, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation ?? undefined });
    const toPlay = (q: Question, vq: VocabQuiz | null): PlayQuestion => {
      const play =
        vq && vq.id === q.id
          ? vocabPlayQuestion(vq)
          : q.source === "material"
            ? // A bizonytalan tantárgyú tananyag tárgy nélkül kerül az ismétlési sorba (a „csak matek” mód ne hozza vissza).
              materialPlayQuestion(asQuiz(q), { subject: q.certain === false ? undefined : q.subject, coupon: couponRef.current.active })
            : bankPlayQuestion(GAME_ID, asQuiz(q), q.subject, q.grade);
      questionMetaRef.current.set(play.key, q);
      return play;
    };
    return {
      get couponOnly() {
        return couponRef.current.active;
      },
      // Forrásrend (K.2): nem látott tananyag, a mód tantárgyával (a bizonytalan tantárgyú csak vegyes / kupon módban).
      material: (ctx) => {
        const mode = quizModeNow();
        const seen = gradeSeenRef.current;
        const pool = materialRef.current.filter((m) => (mode === "mixed" || (m.subject === mode && m.certain !== false)) && !isGradeQuizSeen(seen, m));
        if (pool.length === 0) {
          // Kupon (lecke-jutalom) módban csak tananyag jöhet: a kis lecke se fogyjon el — körönként újra, saját kulccsal
          // (a director egy menetben egy kulcsot csak egyszer ad; kupon módban ismétlési sor nincs).
          const again = couponRef.current.active ? couponRepeat(materialRef.current, couponRepeatRef.current) : null;
          if (!again) return null;
          couponRepeatRef.current += 1;
          const play = toPlay(again.item, null);
          const key = `${play.key}${again.keySuffix}`;
          questionMetaRef.current.set(key, again.item);
          return { ...play, key };
        }
        const fits = ctx?.accept ? pool.filter((m) => ctx.accept!(asQuiz(m))) : [];
        const from = fits.length > 0 ? fits : pool;
        const picked = from[Math.floor(drawRng() * from.length) % from.length]!;
        markGradeQuizSeen(seen, picked);
        return toPlay(picked, null);
      },
      // Új tétel: a Tornado meglévő választója (szóbank / évfolyam-bank / kézi bank, a pálya sávja szerint).
      fresh: () => {
        const forced = forcedQuizRef.current;
        if (forced) {
          forcedQuizRef.current = null;
          return toPlay(forced, null);
        }
        const vocabNow = vocabRef.current;
        const held: { vq: VocabQuiz | null } = { vq: null };
        const q = pickQuestion({
          adaptiveBand: adaptiveRef.current.band,
          level: props.level,
          school: settingsRef.current.school,
          mode: quizModeNow(),
          material: [],
          recent: recentQuizRef.current,
          gradeSeen: gradeSeenRef.current,
          rng: drawRng,
          vocab: vocabNow
            ? {
                next: () => {
                  const vq = vocabNow.next(vocabLevelForGrade(primaryGradeRef.current, adaptiveRef.current.band));
                  held.vq = vq;
                  return vq ? vocabToQuestion(vq, primaryGradeRef.current) : null;
                },
              }
            : undefined,
        });
        // Kézi (nem szóbankos) angol kérdés helyes válasza a közös naplóba: ugyanaz a szó ne jöjjön vissza a bankból.
        if (q.subject === "english" && q.source === "bank" && !isVocabQuestion(q)) {
          vocabRef.current?.markExternal(q.options[q.correctIndex]!);
        }
        recentQuizRef.current = [...recentQuizRef.current.slice(-8), q.id];
        markGradeQuizSeen(gradeSeenRef.current, q);
        return toPlay(q, held.vq);
      },
      // Az ismétlési sor KÖZÖS a hét játékban: csak a módnak megfelelő saját / tananyag / angol szóbanki tétel jön vissza.
      restore: (item) => {
        const mode = quizModeNow();
        const pl = item.payload;
        if (pl.kind === "vocab") return pl.lang === "en" && mode !== "math" ? restoreReviewQuestion(item, { vocab: () => vocabRef.current }) : null;
        if (pl.kind !== "quiz" || !(mode === "mixed" || pl.subject === mode)) return null;
        return item.key.startsWith(`bank:${GAME_ID}:`) || item.key.startsWith("mat:") ? restoreReviewQuestion(item, {}) : null;
      },
    };
  }, [props.level, drawRng]);

  const directorConfig = useMemo(() => tornadoDirectorConfig(primaryGrade), [primaryGrade]);
  const qRef = useRef<ReturnType<typeof usePlayQuestion>>(null as unknown as ReturnType<typeof usePlayQuestion>);
  const driverRef = useRef<ChaseDriver | null>(null);
  const onOutcomeRef = useRef<(o: QuestionOutcome, p: QuestionPresentation) => void>(() => {});
  const q = usePlayQuestion({
    setup: { config: directorConfig, provider, startBand: adaptiveRef.current.band, seed: runSeedRef.current },
    // A rezgést a lap adja a játékbeli következménnyel együtt (egy kimenet = egy visszajelzés).
    haptics: false,
    onShow: (p) => driverRef.current?.core.onShow(p),
    onOutcome: (o, p) => onOutcomeRef.current(o, p),
  });
  qRef.current = q;
  /** A fix lépésű szimuláció egy lépése (a jármű, a tölcsér, a szél) — lent definiálva, a meghajtó ezt hívja. */
  const simStepRef = useRef<(dt: number) => { x: number; z: number; heading: number; speed: number; hold: boolean }>(() => ({ x: 0, z: 0, heading: 0, speed: 0, hold: true }));
  const makeDriver = (seed: string): ChaseDriver =>
    createChaseDriver({
      seed,
      questions: {
        frame: (c, ctx) => qRef.current.frame(c, ctx),
        request: (reason, c) => qRef.current.request(reason, c),
        pick: (i, c) => qRef.current.pick(i, c),
        active: () => qRef.current.active(),
        abort: () => qRef.current.abort(),
        canAsk: () => qRef.current.canAsk(),
        pending: () => qRef.current.view().pending !== null,
      },
      physics: (dt) => simStepRef.current(dt),
    });
  if (!driverRef.current) driverRef.current = makeDriver(runSeedRef.current);
  /** A kijelzett elágazás (a táblák a megoldás-kijelzés végéig maradnak) és a turbópad — a rajzoló hurok olvassa. */
  const junctionRef = useRef<Junction | null>(null);
  const padRef = useRef<TurboPad | null>(null);
  /** A horgonyzás pillanatának távolsága (#83 L3: a pozíció-bónusz ebből számol). */
  const anchoredKmRef = useRef<number | null>(null);
  const fpsRef = useRef(60);
  const frameClockRef = useRef(0);
  const signRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const answersRef = useRef<HTMLOListElement | null>(null);
  /** A válaszlista magassága (kérdésenként egyszer mérve) és utoljára írt helye — a rajzoló hurok nem olvas layoutot. */
  const answersHRef = useRef(0);
  const answersTopRef = useRef(-1);
  /** A mozgó táblák koppintás-követője (felengedéskor a cél aktuális dobozán belül = válasz; elhúzás nem). */
  const signTracker = useMemo(() => createPointerTapTracker(), []);

  /* ------- reset the run on mount / level change ------- */
  useEffect(() => {
    finishedRef.current = false;
    // Player starts a few km from the funnel; tornado near the map centre. A kezdőszög a menet seedelt RNG-jéből (K.4/13).
    tornadoPosRef.current = { x: 0, z: 0, angle: drawRng() * Math.PI * 2, born: 0, alive: true };
    playerRef.current = { x: 0, z: fromKm(3.4), heading: Math.PI, speed: 0, anchored: false };
    // Review PR #140: a kamera ne a régi hely magasságáról siklódjon át — NaN → a következő képkocka azonnal az új talajon.
    camGroundRef.current = Number.NaN;
    windRef.current = initialWind(spec);
    timeLeftRef.current = runTimeLimit;
    scoreRef.current = 0;
    correctRef.current = 0;
    wrongRef.current = 0;
    streakRef.current = createStreakTracker();
    anchorAttemptsRef.current = 1;
    elapsedRef.current = 0;
    distanceTravelledRef.current = 0;
    recentQuizRef.current = [];
    gradeSeenRef.current = createGradeQuizSeen();
    anchoredKmRef.current = null;
    setResult(null);
    setAnchorMsg(null);
    setPhase("seeking");
  }, [props.level]);

  /* ------- pause (S12: HUD gomb, Esc, háttérbe kerülés, elforgatás) ------- */
  const releaseInputs = () => {
    releaseDriveKeys(keysRef.current);
    const t = touchRef.current;
    t.throttle = t.steer = 0;
    setTouchReset((n) => n + 1);
  };
  const pauseGame = () => {
    if (finishedRef.current || pausedRef.current) return;
    pausedRef.current = true;
    setPaused(true);
    releaseInputs();
  };
  const resumeGame = () => {
    pausedRef.current = false;
    setPaused(false);
  };
  const pauseRef = useRef(pauseGame);
  pauseRef.current = pauseGame;
  useEffect(() => {
    const ref = props.autoPauseRef;
    ref.current = () => pauseRef.current();
    return () => {
      ref.current = () => {};
    };
  }, [props.autoPauseRef]);

  const shellState: GameScreenState = result ? "result" : paused ? "paused" : "playing";
  const onShellState = props.onShellState;
  useEffect(() => {
    onShellState(shellState);
  }, [shellState, onShellState]);

  /* ------- Three.js scene setup ------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const profile = QUALITY_PROFILES[quality];

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== "low", alpha: false });
    // Közös látvány: ACES tónus, sRGB, pixelarány-plafon. A játékos saját
    // grafikai választása a szint; valódi árnyék csak HIGH-on.
    applyRendererLook(renderer, quality, { exposure: 1.08, shadows: quality === "high" });
    const palette = skyPaletteFor(spec.tornadoIntensity);
    const sky = palette.horizon;
    renderer.setClearColor(sky);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(sky.getHex(), profile.fogFar * 0.4, profile.fogFar);

    const camera = new THREE.PerspectiveCamera(62, 1, 0.5, cameraFarFor(profile));

    scene.add(new THREE.HemisphereLight("#e2efff", "#5f6b3c", 1.55));
    const sun = new THREE.DirectionalLight("#fff0d4", 2.5);
    sun.position.copy(SUN_DIRECTION).multiplyScalar(150);
    scene.add(sun);
    scene.add(sun.target);
    if (quality === "high") {
      // A nap árnyékkamerája csak a jármű környékét fedi, és vele együtt mozog:
      // így a 2048-as térkép is éles árnyékot ad.
      sun.castShadow = true;
      sun.shadow.mapSize.set(LOOK_BUDGET.high.shadowMapSize, LOOK_BUDGET.high.shadowMapSize);
      const shadowCam = sun.shadow.camera;
      shadowCam.left = -34;
      shadowCam.right = 34;
      shadowCam.top = 34;
      shadowCam.bottom = -34;
      shadowCam.near = 10;
      shadowCam.far = 320;
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 0.35;
    }
    const lightning = new THREE.PointLight("#dfefff", 0, 1400);
    lightning.position.set(0, 200, 0);
    scene.add(lightning);

    const vehicleGroup = buildVehicle(props.vehicle);
    if (quality === "high") {
      vehicleGroup.traverse((o) => {
        if (o instanceof THREE.Mesh && !o.userData.blobShadow) o.castShadow = true;
      });
    }
    scene.add(vehicleGroup);

    // G-9: színátmenetes égbolt a sík háttérszín helyett. A `setClearColor`
    // egyetlen színt ad, amitől a horizont papírkivágás-hatású volt.
    const skyDome = buildSkyDome(palette.horizon, palette.zenith, skyDomeRadiusFor(profile), {
      ground: palette.ground,
      sunDirection: SUN_DIRECTION,
      sunColor: palette.sun,
      clouds: quality === "low" ? 0 : palette.clouds,
    });
    scene.add(skyDome);

    const tornado = buildTornado(quality);
    scene.add(tornado.group);

    // G-9: a szuperfelhő a köd FÖLÖTT látszik, ezért messziről is megmutatja,
    // merre van a tornádó. Mérve: 3,56 km-nél (926 egység) a tölcsér a 900-as
    // ködhatáron kívül esett, vagyis a „Menj közelebb a tornádóhoz!" utasítás
    // láthatatlan célra mutatott.
    const stormCloud = buildStormCloud(quality);
    scene.add(stormCloud.group);

    const rain = buildRain(quality);
    rain.visible = false;
    scene.add(rain);

    // J7b: elágazás-táblák (3) és turbópad — egyszer létrehozva, láthatóság / hely / szín képkockánként (KSZ-5, KSZ-6).
    const poleGeo = new THREE.CylinderGeometry(0.28, 0.28, 7, 8);
    const boardGeo = new THREE.PlaneGeometry(4.2, 1.8);
    const poleMat = new THREE.MeshStandardMaterial({ color: "#334155" });
    const signs: THREE.Group[] = [];
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 3.5;
      const board = new THREE.Mesh(boardGeo, new THREE.MeshBasicMaterial({ color: SIGN_COLORS.idle, side: THREE.DoubleSide }));
      board.position.y = 7.2;
      g.add(pole, board);
      g.visible = false;
      scene.add(g);
      signs.push(g);
    }
    const padMesh = new THREE.Mesh(
      new THREE.CircleGeometry(TURBO_PAD_RADIUS, 32),
      new THREE.MeshBasicMaterial({ color: "#22d3ee", transparent: true, opacity: 0.6, depthWrite: false }),
    );
    padMesh.rotation.x = -Math.PI / 2;
    padMesh.visible = false;
    scene.add(padMesh);

    // Por a kerekek mögött: egyetlen pontfelhő, normál (nem additív) keveréssel.
    const dust = new SparkleField(scene, Math.round(320 * LOOK_BUDGET[quality].particleScale), THREE.NormalBlending);
    // HIGH: enyhe ragyogás (fényszórók, napfény); más szinten sima render.
    const postFx = createPostFx(renderer, scene, camera, quality, { strength: 0.35, radius: 0.5, threshold: 0.85 });

    sceneRef.current = {
      renderer,
      scene,
      camera,
      vehicle: vehicleGroup,
      tornado,
      rain,
      chunks: new Map(),
      lightning,
      skyDome,
      stormCloud,
      sun,
      postFx,
      dust,
      dustCarry: 0,
      signs,
      pad: padMesh,
    };

    const handleResize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect?.width ?? 640));
      const h = Math.max(1, Math.floor(rect?.height ?? 480));
      renderer.setSize(w, h, false);
      sizeRef.current = { w, h, top: rect?.top ?? 0 };
      postFx.setSize(w, h);
      dust.setViewportHeight(h * renderer.getPixelRatio(), camera.fov);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    handleResize();
    const ro = new ResizeObserver(handleResize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);
    window.addEventListener("resize", handleResize);

    const loop = (t: number) => {
      const last = lastTimeRef.current;
      lastTimeRef.current = t;
      const dt = last == null ? 0 : Math.min(0.05, (t - last) / 1000);
      stepRef.current(dt);
      rafRef.current = requestGameFrame(loop);
    };
    // #58: `requestGameFrame` — a lejárt kupon alatt a képkocka-hurok áll (a sim a szünet-úton áll, a render is).
    rafRef.current = requestGameFrame(loop);

    return () => {
      cancelGameFrame(rafRef.current);
      window.removeEventListener("resize", handleResize);
      ro.disconnect();
      const sc = sceneRef.current;
      if (sc) {
        sc.dust.dispose();
        sc.postFx.dispose();
        // A HIGH szint árnyéktérképét a fény birtokolja, nem a renderer.
        sc.sun.dispose();
        // Minden, ami a jelenetben van (tereprészek, jármű, tölcsér, ég, eső),
        // itt szabadul fel; a megosztott gyorsítótárat a disposeMeshCaches üríti.
        disposeObjectTree(sc.scene);
        sc.chunks.forEach((objs) => objs.forEach((o) => sc.scene.remove(o)));
        sc.chunks.clear();
      }
      disposeMeshCaches();
      renderer.dispose();
      sceneRef.current = null;
      lastTimeRef.current = null;
    };
  }, [quality, props.vehicle.id, props.level]);

  useEffect(() => () => {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
  }, []);

  // Böngészős próbakampó (spec 2026-09-29-tornado-fizika D12): csak VITE_ENABLE_GAME_TEST_HOOKS=1
  // mellett létezik, élesben a konstans feltétel miatt kiesik a buildből.
  useEffect(() => {
    if (!GAME_TEST_HOOKS_ENABLED) return;
    const api = {
      getPlayer: () => ({ ...playerRef.current }),
      /** The rendered camera height (spec 2026-09-29-tornado-ut-kormanyzas: vertical shake measurement). */
      getCamera: () => ({ y: sceneRef.current?.camera.position.y ?? Number.NaN }),
      setPlayer: (patch: Partial<PlayerState>) => {
        Object.assign(playerRef.current, patch);
      },
      getTornado: () => ({ ...tornadoPosRef.current }),
      setTornado: (patch: { x?: number; z?: number }) => {
        Object.assign(tornadoPosRef.current, patch);
      },
      getPhase: () => phaseRef.current,
      /** Pálya-mérés (E szelet): pálya, világszint, sáv és a futás időkerete. */
      getLevelTuning: () => ({
        gradeLevel: props.gradeLevel,
        worldLevel: props.level,
        band: adaptiveRef.current.band,
        timeLimit: runTimeLimit,
        tornadoSpeed: spec.tornadoSpeed,
      }),
      /** J7b: a nyitott elágazás geometriája (a böngészős próba ezzel hajt át egy kapun). */
      getJunction: () => (junctionRef.current ? { ...junctionRef.current } : null),
      getPad: () => (padRef.current ? { ...padRef.current } : null),
    };
    const w = window as unknown as { __websuliTornado?: typeof api };
    w.__websuliTornado = api;
    return () => {
      if (w.__websuliTornado === api) delete w.__websuliTornado;
    };
  }, []);

  /* ------- K.2 teszt-kampó: `probe()` (a kötelező mezők + a J7b mérései) ------- */
  useEffect(() => {
    const ref = props.probeRef;
    ref.current = () => {
      const ctl = qRef.current;
      const d = driverRef.current;
      const st = ctl.director?.stats(d?.core.clockMs() ?? 0);
      const shown = ctl.view().presentation;
      const p = playerRef.current;
      return {
        simTime: d?.loop.simTimeMs() ?? 0,
        questionOpen: ctl.active() ? 1 : 0,
        questionsAnswered: st?.answered ?? 0,
        questionsCorrect: st?.correct ?? 0,
        fps: Math.round(fpsRef.current),
        band: ctl.director?.band() ?? null,
        intensity: ctl.director?.intensity() ?? null,
        questionKind: shown ? d?.core.kindOf(shown.id) ?? null : null,
        questionId: shown?.id ?? null,
        reveal: ctl.view().reveal ? 1 : 0,
        nitroMs: d?.core.nitroLeftMs() ?? 0,
        junctionFrozen: d?.core.junction()?.frozen ? 1 : 0,
        intent: d?.core.intentSeen() ? 1 : 0,
        detourSec: d?.core.detourTotalSec() ?? 0,
        x: p.x,
        z: p.z,
        speed: p.speed,
        phase: phaseRef.current,
      };
    };
    return () => {
      ref.current = null;
    };
  }, [props.probeRef]);

  /* ------- keyboard ------- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const driveKey = driveKeyFor(e.key);
      if (driveKey) {
        keysRef.current[driveKey] = true;
        if (driveKey === "brake") e.preventDefault();
        return;
      }
      switch (e.key.toLowerCase()) {
        case "f":
          tryAnchorRef.current();
          break;
        case "c": {
          const next = toggleCamera(settingsRef.current.cameraMode);
          settingsRef.current = { ...settingsRef.current, cameraMode: next };
          onProgressRef.current((latest) => updateSettings(latest, { cameraMode: next }));
          break;
        }
        case "escape": {
          // Szünetben az Esc a közös PauseMenu-é (folytatás); itt csak a játék közbeni szünet és az eredményből
          // kilépés marad — különben egy Esc egyszerre folytatna és kilépne.
          if (pausedRef.current) break;
          const action = escAction(phaseRef.current);
          if (action === "pause") pauseRef.current();
          else if (action === "exit") onExitRef.current();
          break;
        }
        case "r":
          if (phaseRef.current === "result_lose" || phaseRef.current === "result_win") restartRef.current();
          break;
        default:
          break;
      }
    };
    const up = (e: KeyboardEvent) => {
      const driveKey = driveKeyFor(e.key);
      if (driveKey) keysRef.current[driveKey] = false;
    };
    // Spec 2026-09-29-tornado-fizika D11: a keyup (or pointerup) that lands in another window never
    // reaches us — without this a key held during alt-tab kept the car reversing on its own.
    const releaseAll = () => {
      releaseDriveKeys(keysRef.current);
      const t = touchRef.current;
      t.throttle = t.steer = 0;
      // The joystick keeps its own drag origin and knob; tell it to let go too (review PR #137).
      setTouchReset((n) => n + 1);
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") releaseAll();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  /* ------- anchoring ------- */
  const tryAnchorRef = useRef<() => void>(() => {});
  tryAnchorRef.current = () => {
    if (pausedRef.current) return;
    // S13 / C9: sikeres horgonyzás után a győzelem már ütemezve van (2,6 s, játékóra) — új horgony-kvíz ne nyíljon,
    // különben az ütemezett eredmény a nyitott kvíz alatt futna le.
    if (playerRef.current.anchored) return;
    if (phaseRef.current !== "approach" && phaseRef.current !== "seeking") return;
    const p = playerRef.current;
    const distKm = toKm(Math.hypot(p.x - tornadoPosRef.current.x, p.z - tornadoPosRef.current.z));
    // J7a (terv 5.7 Q2): a horgonyzási kérdés csak a mérési sávban érkezik; a sávon kívül csak üzenet jön.
    // A sáv-ellenőrzés a sebesség-ellenőrzés ELŐTT áll (review L4): a gyerek ne álljon meg fölöslegesen.
    const band = anchorBandState(distKm, bandSpecRef.current.anchorBand);
    if (band !== "in_band") {
      setAnchorMsg(anchorBandMessage(band));
      sfxWarning();
      scheduleTimeout(() => setAnchorMsg(null), 2200);
      return;
    }
    // Must be roughly stopped to anchor.
    if (Math.abs(p.speed) > STOPPED_SPEED) {
      setAnchorMsg("Előbb állj meg a horgonyzáshoz!");
      sfxWarning();
      scheduleTimeout(() => setAnchorMsg(null), 1600);
      return;
    }
    // The scoring quiz — the brief's core mechanic. A talajt a válasz után a `resolveAnchor` ellenőrzi.
    pendingAnchorRef.current = { distanceKm: distKm };
    raiseQuiz("anchor");
  };

  const pendingAnchorRef = useRef<{ distanceKm: number } | null>(null);
  /**
   * J7b: a horgony-kérdés a közös kérdés-sávon jön (gomb-mód), a megállító overlay megszűnt; a nyitott elágazás / turbó
   * kérdést a mag megszakítja (nem hiba, nem ismétlés). Ha épp megoldás-kijelzés fut, a kérés a kijelzés végén indul.
   */
  const raiseQuiz = (_reason: "anchor") => {
    if (driverRef.current?.core.requestAnchor()) return;
    if (qRef.current.view().pending !== null) return;
    // A director most nem adott kérdést (min. rés / megoldás-kijelzés / üres forrás): a fix lépés újrapróbálja.
    anchorWantRef.current = driverRef.current?.core.clockMs() ?? 0;
  };
  /** A függő horgony-kérés kezdete (kérdés-óra ms), vagy null. */
  const anchorWantRef = useRef<number | null>(null);

  const finishRun = useCallback(
    (won: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      const p = playerRef.current;
      const distKm = toKm(Math.hypot(p.x - tornadoPosRef.current.x, p.z - tornadoPosRef.current.z));
      const reward = won
        ? winReward({
            // Review K2: a pozíció-bónusz az ALAP sávhoz mér (a `winReward` szintszámot kap, szélesített sávot nem
            // kaphat); #83 L3: a horgonyzás pillanatának távolságából (a rögzítés után a tölcsér tovább mozog).
            level: props.level,
            secondsUsed: elapsedRef.current,
            anchorAttempts: anchorAttemptsRef.current,
            peakWind: windRef.current.maximumWindSpeed,
            anchoredDistanceKm: anchoredKmRef.current ?? distKm,
            correctAnswers: correctRef.current,
            wrongAnswers: wrongRef.current,
          })
        : { score: Math.round(scoreRef.current), coins: 0, breakdown: { base: 0, speedBonus: 0, stormBonus: 0, answerBonus: 0, positionBonus: 0 } };

      // A futás véget ért: a még függő fázisváltások (pl. egy kvíz utáni továbblépés) nem írhatják felül.
      clearPendingTimers();
      pausedRef.current = false;
      setPaused(false);
      setFeedback(null);
      // S13 / C9 → J7b: a menet vége lezárja a kérdés-sávot — a nyitott kérdés „megszakítva” (nem hiba, nem ismétlés), és
      // a sáv nem marad az eredményképernyő alatt.
      const stats = qRef.current.director?.stats(driverRef.current?.core.clockMs() ?? 0) ?? null;
      qRef.current.finish();
      qRef.current.abort();
      junctionRef.current = null;
      padRef.current = null;
      pendingAnchorRef.current = null;
      const bestNow = props.onSubmitBest(reward.score);
      setResult({
        score: reward.score,
        coins: reward.coins,
        won,
        // K.2: a valós kérdés-statisztika a directorból.
        correct: stats?.correct ?? correctRef.current,
        total: stats ? stats.correct + stats.wrong + stats.timeouts : correctRef.current + wrongRef.current,
        best: bestNow.best,
        isNewBest: bestNow.isNewBest,
        breakdown: won ? reward.breakdown : null,
      });
      setPhase(won ? "result_win" : "result_lose");
      if (won) sfxLevelUp();
      else sfxError();
      haptics(won ? "success" : "error");

      // Persist progress.
      // Review #433 (Vercel): a (késleltetett) győzelem-mentés funkcionális frissítés a mentés pillanatában érvényes
      // haladáson — egy közben (pl. szünetben) módosított beállítást, válasz-statisztikát vagy Storm Coint nem írhat
      // vissza egy korábbi renderből befagyasztott pillanatkép.
      const distanceKm = distanceTravelledRef.current;
      const levelResult = {
        level: props.level,
        score: reward.score,
        coins: reward.coins,
        secondsUsed: elapsedRef.current,
        peakWind: windRef.current.maximumWindSpeed,
        anchored: true,
      };
      props.onProgress((latest) => applyRunResult(latest, distanceKm, won ? levelResult : null));
      const wasDaily = isTodaysGameAvailable(GAME_ID);
      const unlocked = recordRun({
        game: GAME_ID,
        xpGained: reward.score,
        correctAnswers: correctRef.current,
        wrongAnswers: wrongRef.current,
        maxStreak: streakRef.current.best,
        perfect: won && wrongRef.current === 0 && correctRef.current >= 5,
        fullClear: won && props.level === 200,
        highestLevel: props.level,
      });
      if (wasDaily && won) {
        const daily = markDailyCompleted();
        if (daily.achievements.length > 0) unlocked.push(...daily.achievements);
      }
      props.onComplete(unlocked);
      if (won && props.gradeLevel != null) props.onGradeLevelWin();

      // Cloud leaderboard (best-effort; a missing catalogue row just fails silently).
      if (props.syncEligible && won) {
        void postGameScore({
          gameId: GAME_ID,
          difficulty: props.level >= 150 ? "hard" : props.level >= 70 ? "normal" : "easy",
          runXp: reward.score,
          runStreak: streakRef.current.best,
          runSeconds: Math.round(elapsedRef.current),
          runId: newScoreRunId(),
        })
          .then(() => void queryClient.invalidateQueries({ queryKey: ["/api/games/leaderboard"] }))
          .catch(() => {});
      }
    },
    [props],
  );

  // Teszt-kampók: csak a jelző VÁLTOZÁSÁRA futnak (a régi `forceResult === true` minden renderkor újra lefutott,
  // így az „Újra” után azonnal visszaugrott az eredményre).
  const finishRunRef = useRef(finishRun);
  finishRunRef.current = finishRun;
  useEffect(() => {
    if (props.forceResult > 0) finishRunRef.current(true);
  }, [props.forceResult]);
  useEffect(() => {
    if (props.forceJunction.n <= 0 || finishedRef.current) return;
    if (props.forceJunction.long) forcedQuizRef.current = LONG_ANSWER_FIXTURE;
    driverRef.current?.core.forceJunction();
  }, [props.forceJunction.n]);
  // K.2: `forceState({ question: true })` / `phase: "quiz"` → azonnali kérdés (turbó-kérdés, gomb-mód).
  useEffect(() => {
    if (props.forceQuiz > 0 && !finishedRef.current) driverRef.current?.core.forceTurbo();
  }, [props.forceQuiz]);
  useEffect(() => {
    if (props.forceNear.n <= 0 || finishedRef.current) return;
    const tp = tornadoPosRef.current;
    playerRef.current = { ...playerRef.current, x: tp.x, z: tp.z + fromKm(props.forceNear.km), speed: 0 };
  }, [props.forceNear.n]);

  const resolveAnchor = useCallback(
    (answerCorrect: boolean) => {
      const pending = pendingAnchorRef.current;
      const p = playerRef.current;
      const grip = gripAt(p.x, p.z);
      const outcome = anchorOutcome({
        distanceKm: pending?.distanceKm ?? toKm(Math.hypot(p.x - tornadoPosRef.current.x, p.z - tornadoPosRef.current.z)),
        spec: bandSpec,
        answerCorrect,
        surfaceGrip: grip,
      });
      setAnchorMsg(outcome.message);
      scheduleTimeout(() => setAnchorMsg((cur) => (cur === outcome.message ? null : cur)), 2400);

      if (outcome.ok) {
        playerRef.current.anchored = true;
        anchoredKmRef.current = pending?.distanceKm ?? toKm(Math.hypot(p.x - tornadoPosRef.current.x, p.z - tornadoPosRef.current.z));
        const sc = sceneRef.current;
        if (sc) {
          setAnchorsVisible(sc.vehicle, true);
          interceptBurst(sc, playerRef.current, tornadoPosRef.current, quality, reducedMotionRef.current);
        }
        burstRef.current = 0.6;
        sfxSuccess();
        haptics("hit");
        setPhase("approach");
        // Hold the anchor until the funnel's lifetime elapses → win. Játékórán: szünetben áll, újrakezdés törli.
        // J7a: a horgony-fejlesztés rövidíti a készenléti időt (alap 2,6 s).
        scheduleGame(() => finishRunRef.current(true), effRef.current.anchorHoldMs);
      } else {
        anchorAttemptsRef.current += 1;
        sfxError();
        setPhase("approach");
      }
      pendingAnchorRef.current = null;
    },
    [bandSpec, finishRun, haptics, quality],
  );

  /* ------- J7b: a kérdés kimenete (a kérdés-sáv hívja; ≤ 2 s játékbeli következmény a magban, K.4/23) ------- */
  onOutcomeRef.current = (o, p) => {
    const core = driverRef.current?.core ?? null;
    const kind = core?.kindOf(p.id) ?? null;
    if (o.result !== "aborted") {
      const good = o.result === "correct";
      adaptiveRef.current.answer(good);
      streakRef.current = recordStreak(streakRef.current, good);
      if (good) {
        correctRef.current += 1;
        if (kind !== "anchor") scoreRef.current += freeRoamAnswerScore(spec);
        haptics("success");
      } else {
        wrongRef.current += 1;
        haptics("error");
      }
      props.onProgress((latest) => recordAnswer(latest, good));
      // Kupon-bónusz: a valós (eredeti indexű) választás; lejáratnál nincs választás.
      if (o.pickedOriginalIndex !== null) maybeClaimCouponBonus(props.coupon, p.question.quiz.id, o.pickedOriginalIndex);
    }
    core?.onOutcome(o, p);
  };

  /** „Miért?”: szünet + a valódi magyarázókártya a legutóbbi hibához (terv 9.; G-1 őr: `buildFeedback` + `<QuizFeedbackCard`). */
  const openWhy = useCallback(() => {
    const item = qRef.current.view().whyItem;
    if (!item) return;
    setFeedback(
      buildFeedback({
        quiz: item.quiz,
        chosenIndex: item.pickedOriginalIndex,
        attempt: 1, // vezetés közben nincs újrapróbálkozás: a vihar nem áll meg
        ageBand: "kid",
      }),
    );
  }, []);
  const closeWhy = useCallback(() => setFeedback(null), []);

  const restartRef = useRef<() => void>(() => {});
  restartRef.current = () => {
    // Az előző futás minden függő időzítője és félbehagyott kvíze érvénytelen (review-lelet #426).
    runIdRef.current += 1;
    clearPendingTimers();
    pendingAnchorRef.current = null;
    setFeedback(null);
    setChaseMsg(null);
    pausedRef.current = false;
    setPaused(false);
    burstRef.current = 0;
    adaptiveRef.current.reset(primaryGrade, props.gradeLevel);
    finishedRef.current = false;
    // J7b: új menet = új seed (K.4/13): a kérdés-sor, a pálya és a mag mind ebből; nincs `Math.random`.
    runIndexRef.current += 1;
    runSeedRef.current = seedFrom(seedBase, runIndexRef.current);
    worldRngRef.current = createRng(seedFrom(runSeedRef.current, "world"));
    fxRngRef.current = createRng(seedFrom(runSeedRef.current, "fx"));
    driverRef.current = makeDriver(runSeedRef.current);
    junctionRef.current = null;
    padRef.current = null;
    anchoredKmRef.current = null;
    anchorWantRef.current = null;
    couponRepeatRef.current = 0;
    expandedRef.current = false;
    qRef.current.reset(runSeedRef.current, adaptiveRef.current.band);
    tornadoPosRef.current = { x: 0, z: 0, angle: drawRng() * Math.PI * 2, born: 0, alive: true };
    playerRef.current = { x: 0, z: fromKm(3.4), heading: Math.PI, speed: 0, anchored: false };
    // Review PR #140: a kamera ne a régi hely magasságáról siklódjon át — NaN → a következő képkocka azonnal az új talajon.
    camGroundRef.current = Number.NaN;
    windRef.current = initialWind(spec);
    timeLeftRef.current = runTimeLimit;
    scoreRef.current = 0;
    correctRef.current = 0;
    wrongRef.current = 0;
    streakRef.current = createStreakTracker();
    anchorAttemptsRef.current = 1;
    elapsedRef.current = 0;
    distanceTravelledRef.current = 0;
    recentQuizRef.current = [];
    gradeSeenRef.current = createGradeQuizSeen();
    const sc = sceneRef.current;
    if (sc) setAnchorsVisible(sc.vehicle, false);
    setResult(null);
    setAnchorMsg(null);
    setPhase("seeking");
  };

  /* ------- J7b: a mag eseményei (elágazás, turbópad, horgony-válasz) — a fix lépés elején dolgozzuk fel ------- */
  const showChaseMsg = (text: string, tone: "good" | "bad") => {
    setChaseMsg({ text, tone });
    scheduleTimeout(() => setChaseMsg((cur) => (cur?.text === text ? null : cur)), 1800);
  };
  const applyChaseEventRef = useRef<(e: ChaseEvent) => void>(() => {});
  applyChaseEventRef.current = (e) => {
    switch (e.kind) {
      case "junction":
        junctionRef.current = e.junction;
        break;
      case "junction-done":
        // Terv 5.7 Q1: a helyes úton rövidítés + turbó, a rosszon kerülő — a menet órája és a tölcsér élettartama előrébb lép.
        // K1 (J7b döntések 16.): a kerülő nem okozhat azonnali vereséget — mindkét órából legalább 5 s marad.
        if (e.detourSec > 0) {
          const sec = detourWithGrace(e.detourSec, spec.tornadoLifetime - tornadoPosRef.current.born, runTimeLimit - elapsedRef.current);
          elapsedRef.current += sec;
          tornadoPosRef.current.born += sec;
          showChaseMsg(sec > 0 ? `Kerülő: −${Math.round(sec)} mp` : "Kerülő — de még elkaphatod!", "bad");
        } else if (e.nitroMs > 0) {
          showChaseMsg("Rövidítés — turbó!", "good");
          sfxPickup();
        }
        break;
      case "pad":
        padRef.current = e.pad;
        break;
      case "pad-gone":
        padRef.current = null;
        break;
      case "pad-free":
        // K4: nincs kérdés-forrás — a pad kérdés nélkül ad nitrót.
        padRef.current = null;
        showChaseMsg("Turbó — nitró 3 mp!", "good");
        sfxPickup();
        break;
      case "turbo-done":
        padRef.current = null;
        if (e.nitroMs > 0) {
          showChaseMsg("Turbó — nitró 3 mp!", "good");
          sfxPickup();
        }
        break;
      case "anchor-answer":
        if (e.result === "aborted") pendingAnchorRef.current = null;
        else resolveAnchor(e.result === "correct");
        break;
    }
  };

  /** A fix lépés kimenete — egyetlen, újrahasznált objektum (K5: a lépésben nincs foglalás). */
  const simOutRef = useRef({ x: 0, z: 0, heading: 0, speed: 0, brake: false, reverse: false, hold: false });
  const vehicleDimsRef = useRef(vehicleDimensions(props.vehicle.silhouette));
  vehicleDimsRef.current = vehicleDimensions(props.vehicle.silhouette);
  /** A gamepad képkockánként egyszer olvasva (K5). */
  const padStateRef = useRef(readStandardGamepad(null));
  /** Nyitva van-e (vagy kijelzés alatt) a horgony-kérdés (K3). */
  const anchorQuestionOpen = (): boolean => {
    const view = qRef.current.view();
    const shown = view.presentation;
    return shown !== null && driverRef.current?.core.kindOf(shown.id) === "anchor";
  };

  /* ------- J7b: egy fix szimulációs lépés (1/60 s) — a közös meghajtó hívja, a node-szimuláció ugyanígy ------- */
  simStepRef.current = (dtSec) => {
    const d = driverRef.current!;
    for (const e of d.core.drainEvents()) applyChaseEventRef.current(e);
    const dt = dtSec;
    const ph = phaseRef.current;
    const out = simOutRef.current;
    if (finishedRef.current || !(ph === "seeking" || ph === "approach")) {
      const p0 = playerRef.current;
      out.x = p0.x;
      out.z = p0.z;
      out.heading = p0.heading;
      out.speed = p0.speed;
      out.brake = false;
      out.reverse = false;
      out.hold = true;
      return out;
    }
    elapsedRef.current += dt;
    timeLeftRef.current = Math.max(0, runTimeLimit - elapsedRef.current);
    // Függő horgony-kérés: újrapróba; ha 2 mp alatt sem jön kérdés és nincs nyitott / függő kérdés, a forrás üres (terv
    // 8.1: a játék kérdés nélkül is fut) — a horgony kérdés nélkül dől el.
    const want = anchorWantRef.current;
    if (want !== null && pendingAnchorRef.current) {
      if (d.core.requestAnchor()) anchorWantRef.current = null;
      else if (d.core.clockMs() - want >= 2000 && qRef.current.canAsk() && qRef.current.view().pending === null) {
        anchorWantRef.current = null;
        resolveAnchor(true);
      }
    } else anchorWantRef.current = null;

    // --- vehicle control ---
    const p = playerRef.current;
    const stats = effRef.current;
    const vehicleDims = vehicleDimsRef.current;

    const k = keysRef.current;
    const t = touchRef.current;
    // K5: a gamepadet a képkocka olvassa egyszer (`padStateRef`), a fix lépés csak a kész értéket használja.
    const pad = padStateRef.current;

    // Keyboard stays digital; the touch stick and the gamepad are analog.
    const rawThrottle = clampStick((k.fwd ? 1 : 0) - (k.back ? 1 : 0) + t.throttle + pad.throttle);
    const brake = k.brake || pad.brake;
    // K2 (J7b döntések 17.): a fék vagy a tárcsa / billentyű hátrahúzása megszakítja a nitrót — érintőn is lehet fékezni.
    if (d.core.nitroLeftMs() > 0 && (brake || rawThrottle < -0.2)) d.core.cancelNitro();
    const nitro = d.core.nitroLeftMs() > 0;
    // Nitró alatt (jó válasz az elágazásnál / a turbópadon) a jármű előrelendül.
    const throttle = nitro ? Math.max(rawThrottle, 0.85) : rawThrottle;
    const steer = clampStick((k.right ? 1 : 0) - (k.left ? 1 : 0) + t.steer + pad.steer);
    // K3 (J7b döntések 18.): a horgony-kérdés alatt (és a kijelzéséig) a jármű a ⚓-kori helyén áll, és nem veszíthet.
    const anchorAsking = anchorQuestionOpen();

    if (anchorAsking) {
      p.speed = 0;
    } else if (!p.anchored) {
      // J7a: az alváz (stabilitás) a szélsodrást is csökkenti — a garázs „Szélállóság” sávja ugyanezt a számot mutatja.
      const windPush = windDriftUnits(windForceOn(windRef.current, stats.windResistance));
      const windAngle = (windRef.current.windDirection * Math.PI) / 180;
      // Spec 2026-09-29-tornado-ut-kormanyzas D5: a lépés ≤ 1/60 s (a fix lépés pontosan ennyi: egy rész-lépés).
      const steps = driveSubsteps(dtSec);
      for (let i = 0; i < steps; i++) {
        // A rész-lépés hossza (a fix lépésnél egy rész: 1/60 s); az ütközésfeloldás ugyanezzel a dt-vel fut.
        const dt = dtSec / steps;
        const next = stepVehicle(
          p,
          { throttle, steer, brake },
          dt,
          {
            speedKmh: props.vehicle.speed * (nitro ? NITRO_SPEED_FACTOR : 1),
            acceleration: stats.acceleration * (nitro ? NITRO_ACCEL_FACTOR : 1),
            handling: stats.handling,
            // J7a: a gumik a talaj tapadását szorozzák (sáron, füvön kisebb a kanyar-csúszás).
            grip: effectiveSurfaceGrip(gripAt(p.x, p.z), stats.gripFactor),
            windPush,
            windAngle,
          },
        );
        // Spec 2026-09-29-tornado-fizika H2: houses, trees, poles and bridge railings are solid.
        // The step's dt: the scrape friction is per second (30/60/144 Hz must slow alike).
        const solid = resolveVehicleCollisions(next, vehicleDims, collidersNear(next.x, next.z), dt);
        const nx = clampToWorld(solid.x);
        const nz = clampToWorld(solid.z);
        const moved = Math.hypot(nx - p.x, nz - p.z);
        distanceTravelledRef.current += toKm(moved);
        p.x = nx;
        p.z = nz;
        p.heading = next.heading;
        // J7a: az alváz tompítja az ütközés sebességvesztését (a hely-kitolás nem változik).
        p.speed = softenImpact(next.speed, solid.speed, stats.crashLossFactor);
      }
    } else {
      p.speed = 0;
    }

    // --- tornado motion --- (a lap és a node-szimuláció közös képlete)
    const tp = tornadoPosRef.current;
    advanceTornado(tp, spec, dt);

    // --- distance & wind ---
    const dxu = p.x - tp.x;
    const dzu = p.z - tp.z;
    const distKm = toKm(Math.hypot(dxu, dzu));
    const bearing = bearingBetween(p.x, p.z, tp.x, tp.z);
    windRef.current = advanceWind(windRef.current, {
      distanceKm: distKm,
      peak: spec.windPeak,
      tornadoIntensity: spec.tornadoIntensity,
      dt,
      bearingDeg: bearing,
      // K.4/12: a szél „lélegzése” is a menet seedelt RNG-jéből (nincs `Math.random` a játékmenetben).
      rng: drawRng,
    });

    // Approach phase once within 2 km.
    if (ph === "seeking" && distKm < 2) setPhase("approach");

    // --- lose conditions --- (K3: a horgony-kérdés alatt nem teljesülhetnek)
    if (!anchorAsking) {
      if (timeLeftRef.current <= 0 || tp.born > spec.tornadoLifetime) {
        if (!p.anchored) finishRun(false);
      }
      // Too close, un-anchored, in a strong storm = thrown → lose.
      if (!p.anchored && distKm < bandSpecRef.current.anchorBand.min * 0.4 && windRef.current.currentWindSpeed > spec.windPeak * 0.8) {
        finishRun(false);
      }
    }

    // A rögzítő szándékhoz a lépés bemenete (J7b döntések 25.): fék és hátrahúzott gáz — a mag felfutó élt néz a minimális
    // olvasás után; a kormány nem szándék. A választ a mag csak rögzült kapunál fogadja el (a táblára koppintás közvetlen).
    out.x = p.x;
    out.z = p.z;
    out.heading = p.heading;
    out.speed = p.speed;
    out.brake = brake;
    out.reverse = rawThrottle < -0.2;
    out.hold = anchorAsking || p.anchored || anchorBandState(distKm, bandSpecRef.current.anchorBand) === "in_band";
    return out;
  };

  /* ------- J7b: táblák és turbópad a világban + a táblák feliratai (DOM, vetített helyen; KSZ-9: közvetlen stílusírás) ------- */
  const updateChaseMarkers = (sc: NonNullable<typeof sceneRef.current>) => {
    const view = qRef.current.view();
    let j = junctionRef.current;
    // A táblák a kérdés megoldás-kijelzésének végéig látszanak (a helyes tábla zölden ≥ 1,8 mp — terv 4.1/2), utána eltűnnek.
    if (j && view.presentation?.id !== j.questionId) {
      junctionRef.current = null;
      j = null;
    }
    const reveal = j ? view.reveal : null;
    const w = sizeRef.current.w;
    const h = sizeRef.current.h;
    const compact = answersRef.current !== null;
    const labelW = compact ? 48 : Math.min(w * 0.26, 180);
    // A teljes válaszok listája (hosszú válasznál): állón a kérdés-kártya alatt, alacsony fekvőn a bal oldalon (R4). A lista
    // magasságát kérdésenként egyszer mérjük (`answersHRef`, layout-effektben) — itt csak írunk, nem olvasunk layoutot (K5).
    const sideList = h < 520 && w > h;
    let answersBottom = 0;
    if (answersRef.current) {
      const top = sideList ? 64 : Math.max(90, cardBottomRef.current - sizeRef.current.top + 6);
      if (answersTopRef.current !== top) {
        answersTopRef.current = top;
        answersRef.current.style.top = `${top}px`;
      }
      const vis = j ? "visible" : "hidden";
      if (answersRef.current.style.visibility !== vis) answersRef.current.style.visibility = vis;
      answersBottom = j && !sideList ? top + answersHRef.current : 0;
    }
    for (let i = 0; i < sc.signs.length; i++) {
      const sign = sc.signs[i]!;
      const el = signRefs.current[i] ?? null;
      const on = j !== null && i < j.gates;
      sign.visible = on;
      if (!on || !j) {
        if (el) el.style.visibility = "hidden";
        signX[i] = Number.NaN;
        continue;
      }
      const g = gatePoint(j, i);
      const gy = groundHeight(g.x, g.z);
      sign.position.set(g.x, gy, g.z);
      sign.rotation.y = Math.atan2(-j.fx, -j.fz);
      const board = sign.children[1] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
      board.material.color.setHex(
        !reveal ? SIGN_COLORS.marks[i] ?? SIGN_COLORS.idle : i === reveal.correctOptionIndex ? SIGN_COLORS.correct : i === reveal.pickedOptionIndex ? SIGN_COLORS.wrong : SIGN_COLORS.dim,
      );
      signTmp.set(g.x, gy + 8.2, g.z).project(sc.camera);
      signX[i] = signTmp.z < 1 ? ((signTmp.x + 1) / 2) * w : Number.NaN;
      signY[i] = ((1 - signTmp.y) / 2) * h;
    }
    // A feliratok nem fedhetik egymást: képernyő-x szerint rendezve legalább egy címke-szélességnyi távolság.
    signOrder.length = 0;
    for (let i = 0; i < sc.signs.length; i++) if (Number.isFinite(signX[i]!)) signOrder.push(i);
    signOrder.sort((a, b) => signX[a]! - signX[b]!);
    // R4: fekvőn a bal oldali válaszlista mellett (a lista ≤ min(28vw, 236) széles) kezdődnek a táblák.
    // Alacsony fekvőn a tárcsa (bal alsó sarok, ≤ ~140 px széles) mellett kezdődnek — a magas kártya alá tolt tábla se lógjon rá (A3).
    const left = (sideList && compact ? Math.min(w * 0.28, 236) + 16 : sideList ? 150 : 4) + labelW / 2;
    const right = w - labelW / 2 - 4;
    const spread = () => {
      for (let k = 1; k < signOrder.length; k++) {
        const prev = signX[signOrder[k - 1]!]!;
        if (signX[signOrder[k]!]! < prev + labelW + 6) signX[signOrder[k]!] = prev + labelW + 6;
      }
    };
    if (signOrder.length) {
      if (signX[signOrder[0]!]! < left) signX[signOrder[0]!] = left;
      spread();
      const overflow = signX[signOrder[signOrder.length - 1]!]! - right;
      if (overflow > 0) for (const i of signOrder) signX[i] = signX[i]! - overflow;
      if (signX[signOrder[0]!]! < left) {
        signX[signOrder[0]!] = left;
        spread();
      }
    }
    for (const i of signOrder) {
      const el = signRefs.current[i];
      if (!el) continue;
      const x = signX[i]!;
      // A3: a felirat alja a vezérlősáv (tárcsa) fölött marad.
      const y = Math.max(96, cardBottomRef.current - sizeRef.current.top + 64, answersBottom + 54, Math.min(h - (h < 520 && w > h ? 180 : 130), signY[i]!));
      el.style.visibility = "visible";
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
    }
    for (let i = 0; i < sc.signs.length; i++) {
      if (!Number.isFinite(signX[i]!)) {
        const el = signRefs.current[i];
        if (el) el.style.visibility = "hidden";
      }
    }
    const pad = padRef.current;
    sc.pad.visible = pad !== null;
    if (pad) sc.pad.position.set(pad.x, groundHeight(pad.x, pad.z) + 0.15, pad.z);
  };

  /* ------- the frame step ------- */
  const stepRef = useRef<(dt: number) => void>(() => {});
  stepRef.current = (dt: number) => {
    // A közös keret forgatási kérése (álló telefon) a jelenetet takarja: amíg látszik, a futás áll, mint szünetben.
    hintCheckRef.current += dt;
    if (hintCheckRef.current > 0.1) {
      hintCheckRef.current = 0;
      rotateBlockRef.current = typeof document !== "undefined" && document.querySelector('[data-testid="game-rotate-hint"]') != null;
    }
    const halted = pausedRef.current || rotateBlockRef.current;
    // Játékóra + a fázisváltó időzítők: szünetben állnak, és csak a saját futásuk időzítői futnak le.
    if (!halted) {
      gameClockRef.current += dt;
      const timers = gameTimersRef.current;
      if (timers.length > 0) {
        const now = gameClockRef.current;
        const run = runIdRef.current;
        const due = timers.filter((t) => t.run === run && t.at <= now);
        if (due.length > 0 || timers.some((t) => t.run !== run)) {
          gameTimersRef.current = timers.filter((t) => t.run === run && t.at > now);
          for (const t of due) t.fn();
        }
      }
    }
    const sc = sceneRef.current;
    if (!sc) return;
    const { camera, vehicle, tornado, rain, lightning } = sc;
    const ph = phaseRef.current;
    const playing = (ph === "seeking" || ph === "approach") && !halted;
    // J7b (K.4/9, KSZ-4): a szimuláció a közös fix lépésű hurkon fut (1/60 s, `createChaseDriver`); szünetben, a „Miért?”
    // kártya alatt, a forgatási kérésnél és a menet végén áll (időskála 0). A kérdés alatt NEM lassul (`slowMo: 1`).
    const drv = driverRef.current!;
    if (playing) {
      // K5: a gamepad képkockánként egyszer.
      const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
      const rawPad = pads[0] ?? pads[1] ?? null;
      const pad = readStandardGamepad(padGateRef.current(rawPad) ? rawPad : null);
      padStateRef.current = pad;
      if (pad.anchor && !padAnchorPrevRef.current) tryAnchorRef.current();
      padAnchorPrevRef.current = pad.anchor;
    }
    // A1: a kibontott („Mutasd”) kérdés megszakítása / cseréje után a kibontás nem fagyaszthatja le a játékot.
    const shownId = qRef.current.view().presentation?.id ?? null;
    if (shownId !== expandedIdRef.current) {
      expandedIdRef.current = shownId;
      expandedRef.current = false;
    }
    // A megállítási okok egymástól függetlenek: a szünet feloldása a „Miért?” / „Mutasd” alatt sem indítja el.
    drv.loop.setTimeScale(playing && !feedbackRef.current && !expandedRef.current && !finishedRef.current ? 1 : 0);
    frameClockRef.current += dt * 1000;
    drv.frame(frameClockRef.current);
    if (dt > 0) fpsRef.current = fpsRef.current * 0.9 + Math.min(240, 1 / dt) * 0.1;

    // Always spin the funnel and rain so paused screens still feel alive. Befogáskor (600 ms) a tölcsér
    // felpörög; csökkentett mozgásnál a kitörés 0,4-szeres.
    const burstBoost = burstRef.current > 0 ? 1.6 * (burstRef.current / 0.6) * (reducedMotionRef.current ? 0.4 : 1) : 0;
    if (burstRef.current > 0) burstRef.current = Math.max(0, burstRef.current - dt);
    animateTornado(tornado, dt, spec.tornadoIntensity, (reducedMotionRef.current ? 0.35 : 1) * (1 + burstBoost));

    if (playing) {
      // A fix lépés (`simStepRef`) már léptette a járművet, a tölcsért és a szelet; itt csak a rajz frissül.
      const p = playerRef.current;
      const tp = tornadoPosRef.current;
      tornado.group.position.set(tp.x, 0, tp.z);
      tornado.group.scale.setScalar(spec.tornadoScale);
      // A szuperfelhő a tölcsér fölött marad, és lassan forog. A kupola a
      // kamerát követi, különben a széle belógna a képbe.
      sc.stormCloud.group.position.set(tp.x, 0, tp.z);
      animateStormCloud(sc.stormCloud, dt, reducedMotionRef.current ? 0.25 : 1);
      sc.skyDome.position.set(camera.position.x, 0, camera.position.z);

      // --- vehicle transform ---
      vehicle.position.set(p.x, groundHeight(p.x, p.z), p.z);
      // A mozgás iránya (sin h, −cos h); a modell orra a +z tengely. Az Y körüli
      // θ forgatás a +z-t (sin θ, cos θ)-ba viszi, tehát θ = π − h. (A korábbi
      // θ = h tükrözött: a jármű tolatva haladt és fordítva kanyarodott.)
      vehicle.rotation.y = Math.PI - p.heading;
      const wheels = vehicle.userData.wheels as THREE.Mesh[] | undefined;
      wheels?.forEach((w) => (w.rotation.x += p.speed * dt * 0.2));

      // --- dust behind the wheels, scaled by speed ---
      emitWheelDust(sc, p, props.vehicle.speed, dt, reducedMotionRef.current);

      // --- streaming world chunks ---
      streamChunks(sc, p.x, p.z, quality);

      // --- weather visuals ---
      rain.visible = spec.rainIntensity > 0.15;
      if (rain.visible) animateRain(rain, dt, p.x, p.z, spec.rainIntensity);
      // Kozmetikai villám: külön seedelt `fxRng` (KSZ-2) — a játékmenet RNG-jét nem fogyasztja.
      const fx = fxRngRef.current;
      if (fx.next() < spec.lightningRate * dt * 0.6) {
        lightning.intensity = 6;
        lightning.position.set(tp.x + (fx.next() - 0.5) * 200, 180, tp.z + (fx.next() - 0.5) * 200);
      } else {
        lightning.intensity *= 1 - Math.min(1, dt * 6);
      }
    }
    // Villámláskor az égbolt is felvillan (mozgáscsökkentésnél csak halványan).
    animateSkyDome(
      sc.skyDome,
      dt,
      (lightning.intensity / 6) * (reducedMotionRef.current ? 0.25 : 1),
      reducedMotionRef.current ? 0 : 1,
    );
    sc.dust.update(dt);

    // --- camera ---
    const p = playerRef.current;
    // Spec 2026-09-29-tornado-ut-kormanyzas D6: the camera follows a smoothed ground height — the car's
    // own wobble over the V-shaped road cutting and the bridge-deck lift used to shake the whole view.
    camGroundRef.current = followHeight(camGroundRef.current, groundHeight(p.x, p.z), dt);
    const ground = camGroundRef.current;
    if (settingsRef.current.cameraMode === "cockpit") {
      camera.position.set(p.x - Math.sin(p.heading) * 1, ground + 3.2, p.z + Math.cos(p.heading) * 1);
      camera.lookAt(p.x + Math.sin(p.heading) * 30, ground + 2, p.z - Math.cos(p.heading) * 30);
    } else {
      const camDist = 16;
      const camX = p.x - Math.sin(p.heading) * camDist;
      const camZ = p.z + Math.cos(p.heading) * camDist;
      camera.position.set(camX, ground + 9, camZ);
      camera.lookAt(p.x + Math.sin(p.heading) * 8, ground + 2.5, p.z - Math.cos(p.heading) * 8);
    }

    // A nap (és az árnyékkamerája) a járművet követi.
    sc.sun.target.position.set(p.x, ground, p.z);
    sc.sun.position.set(p.x, ground, p.z).addScaledVector(SUN_DIRECTION, 150);

    // J7b: az elágazás táblái (a megoldás-kijelzés végéig) és a turbópad — a kamera helyzete után, a rajz előtt.
    updateChaseMarkers(sc);

    sc.postFx.render();

    // --- push HUD (throttled to ~10 fps to avoid re-render storms) ---
    hudTickRef.current += dt;
    if (hudTickRef.current > 0.1) {
      hudTickRef.current = 0;
      const card = junctionRef.current ? document.querySelector('[data-testid="tornado-quiz"] .play-question-card') : null;
      cardBottomRef.current = card ? card.getBoundingClientRect().bottom : 0;
      const w = windRef.current;
      const distKm = toKm(Math.hypot(p.x - tornadoPosRef.current.x, p.z - tornadoPosRef.current.z));
      const targetBearing = bearingBetween(p.x, p.z, tornadoPosRef.current.x, tornadoPosRef.current.z);
      setHud({
        wind: Math.round(w.currentWindSpeed),
        windDir: w.windDirection,
        maxWind: Math.round(w.maximumWindSpeed),
        distanceKm: distKm,
        // A jármű iránya radiánban tárolódik, 0 = észak, az óramutató irányában.
        targetRelDeg: ((targetBearing - (p.heading * 180) / Math.PI + 540) % 360) - 180,
        anchorReady: anchorBandState(distKm, bandSpec.anchorBand) === "in_band" && Math.abs(p.speed) < STOPPED_SPEED,
        inBand: anchorBandState(distKm, bandSpec.anchorBand) === "in_band",
        surface: surfaceAt(p.x, p.z),
        timeLeft: timeLeftRef.current,
        stormPct: Math.min(100, (w.currentWindSpeed / spec.windPeak) * 100),
        score: Math.round(scoreRef.current),
        nitro: (driverRef.current?.core.nitroLeftMs() ?? 0) > 0,
      });
    }
  };
  const hudTickRef = useRef(0);

  const compass = compassFor(hud.windDir);
  // K5: stabil visszahívások — a memózott érintővezérlő a kérdés-sáv 10 Hz-es frissítésénél nem rajzolódik újra.
  const onTouchAnchor = useCallback(() => tryAnchorRef.current(), []);
  const onTouchCamera = useCallback(() => {
    const next = toggleCamera(settingsRef.current.cameraMode);
    settingsRef.current = { ...settingsRef.current, cameraMode: next };
    onProgressRef.current((latest) => updateSettings(latest, { cameraMode: next }));
  }, []);
  /** J7b: a kérdés-sáv állapota (≈ 10 Hz + eseményre) és a kérdés fajtája (elágazás: sáv mód; turbó / horgony: gomb mód). */
  const pres = q.state.presentation;
  const qKind: QuestionKind | null = pres ? driverRef.current?.core.kindOf(pres.id) ?? "junction" : null;
  const qMeta = pres ? questionMetaRef.current.get(pres.question.key) : undefined;
  /**
   * Alacsony fekvő nézetben (a közös kérdés-sáv itt a két szélre teszi a gombokat, középre fent a kártyát) a kérdés
   * fajtája lent középen áll, és gomb-módban a bal felső panel elrejtve — különben a bal gombsor alá kerülne.
   */
  const shortLandscape = typeof window !== "undefined" && window.matchMedia?.("(orientation: landscape) and (max-height: 520px)").matches === true;
  /** A kérdés fajtájának helye: fekvőn lent középen; állón sáv-módban lent balra, gomb-módban a bal felső panelben. */
  const chipSpot: "panel" | "bottom-center" | "bottom-left" | null = !qKind ? null : shortLandscape ? "bottom-center" : qKind === "junction" ? "bottom-left" : "panel";
  /**
   * J7b döntések 15. (M3): befér-e minden válasz a tábla VALÓDI szélességén (15 px, legfeljebb 2 sor, szóközépi törés
   * nélkül)? Ha nem, a táblák csak a jelet mutatják, és a teljes válaszok a kártya alatti listában látszanak.
   */
  const compactSigns = (() => {
    if (!pres || qKind !== "junction" || typeof window === "undefined") return false;
    const textW = Math.min(window.innerWidth * 0.26, 180) - 2 * 8 - 2 * 2 - 28;
    return pres.options.some((o) => {
      const longestWord = o.label.split(/\s+/).reduce((m, w) => Math.max(m, w.length), 0);
      return estimateLines(o.label, textW, 15) > 2 || longestWord * 15 * 0.6 > textW;
    });
  })();
  /** A bal felső panel ott rejtett, ahol a kérdés-sáv kártyája / gombsora alá kerülne (R4: fekvőn a válaszlista helyén is). */
  const hidePanel = qKind !== null && (shortLandscape ? qKind !== "junction" || compactSigns : qKind === "junction");
  // J7b döntések 27.: rögzülés után az időcsík a rögzüléskori helyéről simán a meghosszabbított határidőn fogy el (nem töltődik vissza).
  const barJunction = junctionRef.current;
  const barPresentation =
    q.bind.presentation && barJunction && barJunction.barWindowMs > 0 && barJunction.questionId === q.bind.presentation.id
      ? { ...q.bind.presentation, windowMs: barJunction.barWindowMs }
      : q.bind.presentation;
  // K5: a válaszlista magassága kérdésenként egyszer (a rajzoló hurok ebből számol, képkockánként nem olvas layoutot).
  useLayoutEffect(() => {
    answersTopRef.current = -1;
    answersHRef.current = answersRef.current ? answersRef.current.offsetHeight : 0;
  }, [pres?.id, compactSigns]);
  const kindChip =
    pres && qKind ? (
      <div data-testid="tornado-question-kind" data-kind={qKind} className="px-2 py-1 rounded-lg bg-amber-400/90 text-slate-950 text-xs font-bold">
        {(shortLandscape ? QUESTION_KIND_SHORT : QUESTION_KIND_LABEL)[qKind]} · {quizTopicLabelHu(qMeta?.topic ?? null, questionSubjectLabel(qMeta))}
        {qMeta?.source === "material" ? " · tananyag" : ""}
      </div>
    ) : null;

  const stage = stageForLevel(props.level);
  const timeTone = hud.timeLeft <= 10 ? "bad" : hud.timeLeft <= 30 ? "warn" : "default";
  const stormTone = hud.stormPct >= 80 ? "bad" : hud.stormPct >= 50 ? "warn" : "default";
  /*
   * A vezérlősáv fölé kerülő feliratok alsó eltolása érintős eszközön: a tárcsa átmérője
   * 2 × clamp(round(0,16 × min(w,h)), 52, 76) px (`controlRadiusFor`), a `--game-action-size` = clamp(56px, 16vmin, 88px)
   * ugyanazzal a 0,16-os tényezővel nő, így 2 × action-size ≥ a tárcsa átmérője minden nézetben.
   */
  const aboveControls = touch
    ? "calc(max(8px, var(--game-safe-bottom)) + 2 * var(--game-action-size) + 12px)"
    : "max(8px, var(--game-safe-bottom))";
  const next = result?.won ? props.next : null;

  return (
    <div className="absolute inset-0 flex flex-col overflow-hidden" data-tornado-play>
      {/* J7b: a gomb-módú kérdés a vezérlősáv (a tárcsa = 2 × akciógomb magas) FÖLÖTT álljon — a közös alapérték csak egy
          akciógombnyit hagy, álló telefonon a gombsor a tárcsára lógott. Lapra szűkített változó-felülírás (a közös CSS-t nem érinti). */}
      <style>{`.play-question[data-testid="tornado-quiz"] { --play-question-bottom: calc(max(8px, var(--game-safe-bottom)) + 2 * var(--game-action-size) + 16px); }`}</style>
      {/* Teljes képernyős 3D jelenet: a HUD és a vezérlők áttetszően fölötte (mobiljáték-elrendezés). */}
      <div className="absolute inset-0 bg-black">
        <canvas ref={canvasRef} className="w-full h-full block touch-none" />
      </div>
      {/* J7b: az elágazás táblái — a feliratuk a tábla vetített helyén (a helyzetet a rajzoló hurok írja, React-állapot nélkül).
          Koppintással is választhatók (mozgó cél: `pointerTapHandlers`, J7b döntések 13.); hosszú válasznál a tábla csak a jelet
          mutatja, a teljes válaszok a kártya alatti listában (15.). */}
      <div className="absolute inset-0 z-20 pointer-events-none overflow-hidden" data-tornado-signs={pres && qKind === "junction" ? "open" : undefined}>
        {pres && qKind === "junction" && compactSigns && (
          <ol
            ref={answersRef}
            data-testid="tornado-sign-answers"
            className={`absolute top-0 rounded-xl bg-slate-950/85 p-2 flex flex-col gap-1 text-[15px] font-bold text-white ${
              shortLandscape ? "left-2 w-[min(28vw,236px)]" : "left-1/2 -translate-x-1/2 w-[min(92vw,560px)]"
            }`}
            style={{ visibility: "hidden" }}
            aria-label="A táblák válaszai"
          >
            {pres.options.map((opt, i) => (
              <li key={`${pres.id}-a${i}`} className="flex items-start gap-2 leading-snug">
                <span className={`inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1 text-[14px] font-black text-slate-950 ${SIGN_MARK_CLASS[i] ?? SIGN_MARK_CLASS[0]}`}>{i + 1}</span>
                <span>{opt.label}</span>
              </li>
            ))}
          </ol>
        )}
        {pres && qKind === "junction" &&
          pres.options.map((opt, i) => {
            const st = !q.state.reveal ? "idle" : i === q.state.reveal.correctOptionIndex ? "correct" : i === q.state.reveal.pickedOptionIndex ? "wrong" : "dim";
            const tap = pointerTapHandlers(signTracker, i, () => {
              if (pausedRef.current || feedbackRef.current) return;
              qRef.current.pick(i);
            });
            return (
              <button
                type="button"
                key={`${pres.id}-${i}`}
                ref={(el) => {
                  signRefs.current[i] = el;
                }}
                data-testid={`tornado-sign-${i}`}
                data-state={st}
                aria-label={`${i + 1}. tábla: ${opt.label}`}
                {...correctDataAttrs(opt.correct)}
                {...tap}
                className={`absolute left-0 top-0 pointer-events-auto touch-manipulation min-h-[48px] flex items-center justify-center gap-1 rounded-xl border-2 px-2 py-1.5 text-center text-[15px] font-extrabold leading-tight text-slate-950 shadow-[0_6px_18px_rgba(0,0,0,0.45)] hyphens-none [overflow-wrap:normal] ${
                  compactSigns ? "w-12" : "w-[min(26vw,180px)]"
                } ${
                  st === "correct" ? "border-emerald-200 bg-emerald-400" : st === "wrong" ? "border-orange-200 bg-orange-400" : st === "dim" ? "border-slate-400 bg-slate-300/80" : `border-white/70 ${SIGN_MARK_CLASS[i] ?? SIGN_MARK_CLASS[0]}`
                }`}
                style={{ visibility: "hidden" }}
              >
                <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-slate-950/80 px-1 text-[14px] text-white">{i + 1}</span>
                {!compactSigns && <span>{opt.label}</span>}
              </button>
            );
          })}
      </div>
      {/* Felső sötétítés: a HUD felirata (pl. „Vihar 12%”) világos égbolt előtt is olvasható marad. */}
      <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-slate-950/70 via-slate-950/30 to-transparent pointer-events-none" aria-hidden="true" />

      <GameHud
        stats={[
          { id: "distance", label: "Tornádó", value: `${hud.distanceKm.toFixed(2)} km` },
          { id: "time", label: "Idő", value: `${Math.ceil(hud.timeLeft)} s`, tone: timeTone },
          { id: "score", label: "Pont", value: fmt(hud.score), tone: "good" },
        ]}
        onPause={pauseGame}
        progress={{ value: Math.round(hud.stormPct), max: 100, label: `Vihar ${Math.round(hud.stormPct)}%`, tone: stormTone }}
      />

      <div className="relative flex-1 min-h-0">
          {/* Szint / szél / horgony kijelző */}
          <div className={`absolute top-2 left-2 flex flex-col items-start gap-1 text-xs font-bold pointer-events-none max-w-[70%] z-10 ${hidePanel ? "hidden" : ""}`}>
            <div className="px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm" style={{ color: stage.color }}>
              SZINT {props.level}/200 · VIHAR: {stormLabel(props.level)}
            </div>
            <div className="px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm">
              SZÉLSEBESSÉG: <span className="text-cyan-300">{hud.wind} km/h</span>{" "}
              <span className="text-sky-200">
                {compass.arrow} {compass.label}
              </span>{" "}
              · MAX <span className="text-sky-300">{hud.maxWind}</span>
            </div>
            <div
              className={`px-2 py-1 rounded-lg backdrop-blur-sm flex items-center gap-1 transition-colors ${
                hud.anchorReady ? "bg-emerald-600/80" : "bg-black/60"
              }`}
            >
              <Anchor className="w-3.5 h-3.5" /> HORGONY: {hud.anchorReady ? "KÉSZ" : playerRef.current.anchored ? "RÖGZÍTVE" : "…"} ·{" "}
              {SURFACE_LABEL[hud.surface]}
            </div>
            {chipSpot === "panel" && kindChip}
            {hud.nitro && (
              <div data-testid="tornado-nitro" className="px-2 py-1 rounded-lg bg-cyan-400/90 text-slate-950">
                ⚡ TURBÓ
              </div>
            )}
          </div>

          {/* Vehicle name — alacsony fekvő nézetben elhagyva, ott minden képpont a jeleneté; kérdés alatt a helyén a kérdés fajtája. */}
          {!pres && <div
            className="absolute left-2 px-2 py-1 rounded-lg bg-black/60 text-xs font-semibold pointer-events-none z-10 [@media(max-height:500px)]:hidden"
            style={{ bottom: aboveControls }}
          >
            {props.vehicle.name.toUpperCase()}
          </div>}

          {/* G-9b: céljelző nyíl.
              Mérve (Pixel 7, 1. pálya): a cél 3,25 km-re volt, az álló telefon
              vízszintes látószöge viszont csak ~33°. A gyerek azt olvasta, hogy
              „Menj közelebb a tornádóhoz!", de azt nem tudhatta, merre forduljon —
              húsz másodperc alatt 0,2 km-t közeledett, félig véletlenül. */}
          {(phase === "seeking" || phase === "approach") && !pres && !result && (() => {
            const marker = targetMarker({
              heading: 0,
              targetBearing: hud.targetRelDeg,
              halfFovDeg: 16.5,
            });
            if (!marker.visible) return null;
            return (
              <div
                className={`absolute top-[40%] [@media(max-height:500px)]:top-[34%] -translate-y-1/2 ${marker.side === "right" ? "right-2" : "left-2"} z-10 pointer-events-none flex flex-col items-center gap-1`}
                data-testid="tornado-target-marker"
                data-side={marker.side}
              >
                {/* Pulzáló irányjelző (csökkentett mozgásnál áll): a hüvelykujj-távolságból is feltűnő. */}
                <div className="px-3 py-2 rounded-full bg-amber-500/90 text-slate-950 text-2xl font-black leading-none shadow-[0_0_18px_rgba(245,158,11,0.75)] motion-safe:animate-pulse">
                  {marker.side === "right" ? "▶" : "◀"}
                </div>
                {/* J7a (audit #64): alacsony fekvő nézetben a „Menj közelebb” buborék ráfeküdt erre a feliratra; ott
                    elhagyjuk — a távolság ugyanott a felső HUD „Tornádó” értékében is látszik. */}
                <span
                  data-testid="tornado-target-marker-km"
                  className="px-2 py-0.5 rounded-lg bg-black/70 text-xs font-bold text-amber-200 [@media(max-height:500px)]:hidden"
                >
                  {hud.distanceKm.toFixed(1)} km
                </span>
              </div>
            );
          })()}

          {/* Anchor guidance */}
          {(phase === "seeking" || phase === "approach") && !pres && !result && (
            <div
              data-testid="tornado-anchor-guidance"
              className={`absolute right-2 px-3 py-1.5 rounded-lg text-sm font-bold pointer-events-none max-w-[60%] text-right z-10 transition-colors ${
                hud.anchorReady ? "bg-emerald-600/85 text-white" : "bg-sky-900/75"
              }`}
              style={{ bottom: aboveControls }}
            >
              {playerRef.current.anchored
                ? "Horgony rögzítve — tartsd ki a vihart!"
                : hud.anchorReady
                  ? touch
                    ? "Jó pozíció! Nyomd a ⚓ gombot!"
                    : "Jó pozíció! Nyomd az F / Horgony gombot!"
                  : hud.distanceKm > bandSpec.anchorBand.max
                    ? "Menj közelebb a tornádóhoz!"
                    : hud.distanceKm < bandSpec.anchorBand.min
                      ? "Túl közel! Állj meg biztonságos sávban."
                      : "Keresd a tornádót, közelítsd meg és állj meg!"}
            </div>
          )}

          {anchorMsg && (
            <div className="absolute inset-x-0 top-1/3 flex justify-center pointer-events-none">
              <div className="px-3 py-2 rounded-lg bg-black/80 border border-white/20 text-sm font-bold max-w-[min(80%,calc(100%-8.5rem))] text-center">
                {anchorMsg}
              </div>
            </div>
          )}

          {/* Szünet alatt a magyarázó kártya rejtve: a z-[90]-es kártya különben a szünet menü fölé kerülne. */}
          {feedback && !paused && <QuizFeedbackCard card={feedback} onDismiss={closeWhy} />}

          {/* Fekvőn a teljes válaszok listája (hosszú válasz) középen áll — ott a fajta-címke elmarad (a lista maga mutatja). */}
          {(chipSpot === "bottom-left" || (chipSpot === "bottom-center" && !compactSigns)) && kindChip && (
            <div className={`absolute inset-x-2 flex pointer-events-none z-10 ${chipSpot === "bottom-center" ? "justify-center" : "justify-start"}`} style={{ bottom: aboveControls }}>
              <div className={chipSpot === "bottom-center" ? "max-w-[40vw] text-center whitespace-nowrap" : "max-w-[70%]"}>{kindChip}</div>
            </div>
          )}
          {chaseMsg && (
            <div className="absolute inset-x-0 top-[56%] flex justify-center pointer-events-none z-10" role="status" aria-live="polite">
              <div
                data-testid="tornado-chase-msg"
                className={`px-3 py-1.5 rounded-lg text-sm font-extrabold border ${
                  chaseMsg.tone === "good" ? "bg-emerald-600/90 border-emerald-200 text-white" : "bg-orange-600/90 border-orange-200 text-white"
                }`}
              >
                {chaseMsg.text}
              </div>
            </div>
          )}
      </div>

      {/* J7b (terv 5.7, 9.): a megállító overlay megszűnt — nem blokkoló kérdés-sáv; a vezetés közben megy tovább.
          Elágazás: sáv (a válasz az áthajtott tábla), turbó / horgony: nagy gombok. A régi `tornado-quiz` azonosító marad. */}
      <InlineQuestion
        {...q.bind}
        presentation={barPresentation}
        mode={qKind === "junction" ? "bar" : "buttons"}
        skin="storm"
        disabled={paused || feedback !== null}
        onWhy={openWhy}
        testId="tornado-quiz"
        onExpand={() => {
          expandedRef.current = true;
        }}
        onCollapse={() => {
          expandedRef.current = false;
        }}
      />

      {touch && (
        <TouchControls
          leftHanded={props.progress.settings.leftHanded}
          touchRef={touchRef}
          resetSignal={touchReset}
          anchorReady={hud.anchorReady && !playerRef.current.anchored}
          anchorEnabled={hud.inBand && !playerRef.current.anchored}
          onAnchor={onTouchAnchor}
          onCamera={onTouchCamera}
        />
      )}

      <PauseMenu
        open={paused && !result}
        onResume={resumeGame}
        onRestart={() => restartRef.current()}
        onExit={props.onExit}
        exitLabel="Szintek"
      >
        <div className="grid gap-3 [@media(max-height:500px)_and_(min-width:560px)]:grid-cols-[2fr_3fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-white/70 mb-1.5">Irányítás</p>
            <div className="grid grid-cols-2 gap-2">
              <ToggleChip active={!props.progress.settings.leftHanded} onClick={() => props.onProgress((latest) => updateSettings(latest, { leftHanded: false }))}>
                Jobbkezes
              </ToggleChip>
              <ToggleChip active={props.progress.settings.leftHanded} onClick={() => props.onProgress((latest) => updateSettings(latest, { leftHanded: true }))}>
                Balkezes
              </ToggleChip>
            </div>
          </div>
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-white/70 mb-1.5">Grafika</p>
            <div className="grid grid-cols-3 gap-2">
              {(["low", "medium", "high"] as const).map((q) => (
                <ToggleChip key={q} active={quality === q} onClick={() => props.onProgress((latest) => updateSettings(latest, { quality: q }))}>
                  {q === "low" ? "Alacsony" : q === "medium" ? "Közepes" : "Magas"}
                </ToggleChip>
              ))}
            </div>
          </div>
        </div>
      </PauseMenu>

      <ResultScreen
        badges={props.newlyUnlocked}
        open={result != null}
        testId="th-result"
        title={result?.won ? "Elfogás sikeres!" : "Sikertelen elfogás"}
        won={Boolean(result?.won)}
        score={result?.score ?? 0}
        best={result?.best ?? null}
        isNewBest={result?.isNewBest}
        correct={result?.correct ?? 0}
        total={result?.total ?? 0}
        onRetry={() => restartRef.current()}
        retryLabel="Újra"
        onBack={props.onBackToGames}
        extra={
          result ? (
            <div className="flex flex-col gap-2 text-sm">
              <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
                <span className="inline-flex items-center gap-1 font-bold text-emerald-300">
                  <Coins className="w-4 h-4" aria-hidden="true" /> +{fmt(result.coins)} Storm Coin
                </span>
                <span className="text-white/75">
                  {result.won
                    ? props.level === 200
                      ? "Legyőzted a Végső Vihart!"
                      : `${props.level + 1}. szint feloldva!`
                    : "A tornádó elhaladt. Próbáld újra!"}
                </span>
              </p>
              {result.breakdown && (
                <dl
                  data-testid="tornado-score-breakdown"
                  aria-label="Honnan jött a pontszám"
                  className="grid grid-cols-2 gap-x-3 gap-y-0.5 rounded-lg bg-white/5 px-3 py-2 text-xs"
                >
                  {breakdownRows(result.breakdown).map((row) => (
                    <div key={row.id} className="flex items-baseline justify-between gap-2" data-testid={`tornado-breakdown-${row.id}`}>
                      <dt className="text-white/70">{row.label}</dt>
                      <dd className="font-bold text-white tabular-nums">+{fmt(row.value)}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <ResultReview items={q.director?.wrongList() ?? []} />
              {next && (
                <button type="button" data-testid="tornado-next-level" className="game-btn game-btn-secondary w-full" onClick={next.go}>
                  Tovább: {next.label}
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              )}
            </div>
          ) : null
        }
      />
    </div>
  );
}

/**
 * J7b teszt-kampó (M3): a kézi bank három leghosszabb válasza egy tételben — a tábla-beférés és a teljes válaszlista mérése
 * mindhárom nézetben (`forceState({ junction: "long" })`).
 */
const LONG_ANSWER_FIXTURE: Question = {
  id: "tornado-fixture-long-answers",
  subject: "english",
  grade: 6,
  prompt: "Melyik a leghosszabb válasz? (mérő-tétel)",
  options: ["maradj a helyeden fedezékben", "If I were there, I would help.", "az oldalfelező merőlegesek"],
  correctIndex: 1,
  explanation: "A második válasz a helyes feltételes mondat.",
  difficulty: 3,
  source: "bank",
};

/** J7b: a kérdés fajtájának felirata (a kérdés-sáv mellett, a bal felső panelben). */
const QUESTION_KIND_LABEL: Record<QuestionKind, string> = {
  junction: "🔀 Elágazás — koppints a jó táblára, vagy fékezz, és hajts át a kapuján",
  turbo: "⚡ Turbópad",
  anchor: "⚓ Horgonyzási kérdés",
};

/** Alacsony fekvő nézetben egysoros felirat (a táblák fölötte, a vezérlősáv alatta). */
const QUESTION_KIND_SHORT: Record<QuestionKind, string> = {
  junction: "🔀 Elágazás",
  turbo: "⚡ Turbópad",
  anchor: "⚓ Horgonyzási kérdés",
};

/* ------- J7b: elágazás-táblák (modul-szintű ideiglenesek: a képkocka-hurok nem foglal, KSZ-5) ------- */
const SIGN_COLORS = { idle: 0xf59e0b, marks: [0xfcd34d, 0x7dd3fc, 0xf9a8d4], correct: 0x22c55e, wrong: 0xf97316, dim: 0x475569 } as const;
/** A táblák jelölő színe (a lista és a tábla ugyanazzal a számmal + színnel — J7b döntések 15.). */
const SIGN_MARK_CLASS = ["bg-amber-300", "bg-sky-300", "bg-pink-300"] as const;
const signTmp = new THREE.Vector3();
const signX = [Number.NaN, Number.NaN, Number.NaN];
const signY = [0, 0, 0];
const signOrder: number[] = [];

/* ------- wheel dust (imperative, no React) ------- */
const DUST_COLORS: Record<string, string> = {
  grass: "#c9b489",
  dirt: "#c79a63",
  mud: "#7c5c3c",
  water: "#e6f6ff",
};
const dustOrigin = new THREE.Vector3();
const dustDirection = new THREE.Vector3();

function emitWheelDust(
  sc: { vehicle: THREE.Group; dust: SparkleField; dustCarry: number },
  p: { x: number; z: number; heading: number; speed: number; anchored: boolean },
  vehicleSpeedKmh: number,
  dt: number,
  reducedMotion: boolean,
) {
  const ratio = p.anchored ? 0 : Math.min(1, Math.abs(p.speed) / Math.max(0.001, maxSpeedUnits(vehicleSpeedKmh)));
  if (ratio < 0.08) {
    sc.dustCarry = 0;
    return;
  }
  const surface = surfaceAt(p.x, p.z);
  // Aszfalton nem porzik a kerék.
  if (surface === "asphalt") {
    sc.dustCarry = 0;
    return;
  }
  const perSecond = 26 * ratio * (reducedMotion ? 0.25 : 1);
  sc.dustCarry += perSecond * dt;
  const count = Math.floor(sc.dustCarry);
  if (count <= 0) return;
  sc.dustCarry -= count;
  const size = sc.vehicle.userData.size as { width: number; length: number } | undefined;
  const halfW = (size?.width ?? 2.4) / 2;
  const back = (size?.length ?? 5.2) / 2 - 0.6;
  // Előre mutató egységvektor a mozgás irányában; a por ezzel ellentétesen száll.
  const dirSign = p.speed < 0 ? -1 : 1;
  const fx = Math.sin(p.heading) * dirSign;
  const fz = -Math.cos(p.heading) * dirSign;
  const ground = sc.vehicle.position.y;
  const water = surface === "water";
  const n = Math.ceil(count / 2);
  for (const side of [-1, 1]) {
    // Oldalirány: (−fz, fx) merőleges az előre-vektorra.
    dustOrigin.set(p.x - fx * back - fz * side * halfW, ground + 0.5, p.z - fz * back + fx * side * halfW);
    dustDirection.set(-fx, water ? 1.6 : 0.55, -fz);
    sc.dust.emit(dustOrigin, {
      count: n,
      color: DUST_COLORS[surface] ?? "#c9b489",
      speed: 2 + ratio * 3,
      life: water ? 0.7 : 1.5,
      gravity: water ? 7 : surface === "mud" ? 4 : -0.4,
      size: water ? 0.45 : 0.7 + ratio * 0.6,
      direction: dustDirection,
      directionality: 0.6,
      spread: 0.6,
    });
  }
}

/**
 * S12 / végrehajtás 8. lépés — befogáskori látvány a `three-look` keretén belül: porgyűrű a horgonyzó jármű körül
 * és törmelék-kitörés a tölcsér tövénél, ugyanabból a (már meglévő) pontfelhőből. A darabszám a minőségi szint
 * `particleScale`-jével, csökkentett mozgásnál 0,4-szeresen skálázódik; képernyőrázás nincs (M9).
 */
const burstOrigin = new THREE.Vector3();
const burstDirection = new THREE.Vector3();
function interceptBurst(
  sc: { vehicle: THREE.Group; dust: SparkleField },
  p: { x: number; z: number },
  tornado: { x: number; z: number },
  quality: GraphicsQuality,
  reducedMotion: boolean,
) {
  const scale = LOOK_BUDGET[quality].particleScale * (reducedMotion ? 0.4 : 1);
  const ground = sc.vehicle.position.y;
  const ring = Math.max(4, Math.round(10 * scale));
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2;
    burstOrigin.set(p.x + Math.cos(a) * 2.2, ground + 0.4, p.z + Math.sin(a) * 2.2);
    burstDirection.set(Math.cos(a), 0.35, Math.sin(a));
    sc.dust.emit(burstOrigin, {
      count: 3,
      color: i % 2 === 0 ? "#fde68a" : "#c9b489",
      speed: 5,
      life: 0.9,
      gravity: 2,
      size: 0.9,
      direction: burstDirection,
      directionality: 0.85,
      spread: 0.35,
    });
  }
  burstOrigin.set(tornado.x, groundHeight(tornado.x, tornado.z) + 3, tornado.z);
  burstDirection.set(0, 1, 0);
  sc.dust.emit(burstOrigin, {
    count: Math.max(8, Math.round(48 * scale)),
    color: "#6e5840",
    speed: 14,
    life: 0.6,
    gravity: 6,
    size: 3.2,
    direction: burstDirection,
    directionality: 0.3,
    spread: 1,
  });
}

/* ------- world chunk streaming (imperative, no React) ------- */
type StreamScene = {
  scene: THREE.Scene;
  chunks: Map<string, THREE.Object3D[]>;
};

function streamChunks(sc: StreamScene, x: number, z: number, quality: GraphicsQuality) {
  const radius = QUALITY_PROFILES[quality].viewRadius;
  const wanted = new Set<string>();
  for (const { cx, cz } of chunksAround(x, z, radius)) {
    const key = chunkKey(cx, cz);
    wanted.add(key);
    if (!sc.chunks.has(key)) {
      const objects: THREE.Object3D[] = [];
      const terrain = buildTerrainChunk(cx, cz, quality);
      terrain.userData.perScene = true;
      sc.scene.add(terrain);
      objects.push(terrain);
      const bridge = buildBridgeChunk(cx, cz);
      if (bridge) {
        bridge.userData.perScene = true;
        if (quality === "high") {
          bridge.traverse((child) => {
            if (child instanceof THREE.Mesh) child.castShadow = child.receiveShadow = true;
          });
        }
        sc.scene.add(bridge);
        objects.push(bridge);
      }
      for (const prop of propsInChunk(cx, cz)) {
        const mesh = buildProp(prop);
        mesh.userData.perScene = true;
        if (quality === "high") {
          mesh.traverse((child) => {
            if (child instanceof THREE.Mesh) child.castShadow = child.receiveShadow = true;
          });
        }
        sc.scene.add(mesh);
        objects.push(mesh);
      }
      sc.chunks.set(key, objects);
    }
  }
  // Unload distant chunks.
  for (const [key, objects] of sc.chunks) {
    if (!wanted.has(key)) {
      objects.forEach((o) => {
        sc.scene.remove(o);
        o.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (shouldDisposeGeometry(child.geometry)) {
              child.geometry.dispose();
            }
          }
        });
      });
      sc.chunks.delete(key);
    }
  }
}

/* ------- touch controls ------- */
/** K5: memózva — a propjai (a jelzőkön kívül) stabilak, így a lap kérdés-sáv miatti újrarajzolása nem éri el. */
const TouchControls = memo(TouchControlsImpl);
function TouchControlsImpl(props: {
  leftHanded: boolean;
  touchRef: React.MutableRefObject<TouchDrive>;
  resetSignal: number;
  /** Jó horgonyzási pozíció: a ⚓ gomb világít és pulzál (csökkentett mozgásnál csak világít). */
  anchorReady: boolean;
  /** J7a: a ⚓ csak a mérési sávban aktív; a sávon kívül letiltott és halvány. */
  anchorEnabled: boolean;
  onAnchor: () => void;
  onCamera: () => void;
}) {
  // Egységes köralakú vezérlés (spec 2026-09-20): a `◀`/`▶` kormánygombok és a Gáz/Fék pedál
  // helyett ugyanaz a tárcsa, mint az Aszteroidában — a kormányzás és a gyorsítás is IRÁNY, ezért
  // mindkettő a tárcsára kerül. A nem irányjellegű gombok (horgony, kamera) maradnak.
  const steer = (
    <VirtualJoystick
      label="Vezetés"
      resetSignal={props.resetSignal}
      radius="auto"
      onChange={(v) => {
        // Spec 2026-09-29-tornado-ut-kormanyzas D3: analog, not four booleans — a small thumb angle is
        // a small correction, not nothing-or-full-lock.
        const drive = touchDriveInput(v);
        props.touchRef.current.throttle = drive.throttle;
        props.touchRef.current.steer = drive.steer;
      }}
    />
  );
  const pedals = (
    <div className={`flex gap-3 items-end ${props.leftHanded ? "flex-row-reverse" : ""}`}>
      <TouchBtn onDown={() => props.onCamera()} onUp={() => {}} label="Kamera" small />
      <TouchBtn onDown={() => props.onAnchor()} onUp={() => {}} label="⚓" accent glow={props.anchorReady} disabled={!props.anchorEnabled} />
    </div>
  );

  return (
    <div
      data-testid="tornado-touch-controls"
      data-game-controls
      className="game-touch-layer absolute z-30 flex items-end justify-between gap-2 pointer-events-none"
    >
      {props.leftHanded ? (
        <>
          <div className="pointer-events-auto">{pedals}</div>
          <div className="pointer-events-auto">{steer}</div>
        </>
      ) : (
        <>
          <div className="pointer-events-auto">{steer}</div>
          <div className="pointer-events-auto">{pedals}</div>
        </>
      )}
    </div>
  );
}

/**
 * G-8: a gomb a közös HoldButton-ra épül.
 *
 * A korábbi változat `onPointerLeave`-re is elengedett, MIKÖZBEN pointer
 * capture-t kért — a kettő egymás ellen dolgozott. Vezetés közben a hüvelykujj
 * mindig elcsúszik a gomb széléről, és ilyenkor a kormányzás megállt. A capture
 * most tartja a nyomást; elengedni csak felemeléssel vagy rendszer-megszakítással
 * lehet.
 */
function TouchBtn(props: {
  onDown: () => void;
  onUp: () => void;
  label: string;
  small?: boolean;
  accent?: boolean;
  glow?: boolean;
  disabled?: boolean;
}) {
  return (
    <HoldButton
      label={props.label}
      disabled={props.disabled}
      onHoldStart={props.onDown}
      onHoldEnd={props.onUp}
      className={`rounded-full border-2 font-bold flex items-center justify-center shadow-lg backdrop-blur-sm transition-[transform,box-shadow] duration-150 active:scale-90 ${
        props.small ? "w-12 h-12 text-sm" : "game-action-btn text-2xl"
      } ${props.accent ? "bg-amber-500/85 border-amber-200/80 text-slate-950" : "bg-slate-900/70 border-white/25"} ${
        props.disabled ? "opacity-40 saturate-50" : ""
      } ${
        props.glow ? "ring-4 ring-emerald-300/80 shadow-[0_0_24px_rgba(52,211,153,0.85)] motion-safe:animate-pulse" : ""
      }`}
    >
      {props.label}
    </HoldButton>
  );
}

function clampStick(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
