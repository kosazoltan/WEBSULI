import { createAdaptiveSession } from "@/game-engine/adaptiveSession";
import { createGradeQuizSeen, markGradeQuizSeen } from "@/game-engine/gradeQuiz";
import {
  useCallback,
  useEffect,
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
import { Card, CardContent } from "@/components/ui/card";
import { correctDataAttrs, installGameTestApi, GAME_TEST_HOOKS_ENABLED } from "@/game-engine/game-test-hooks";
import AudioToggleButton from "@/components/AudioToggleButton";
import AchievementToast from "@/components/AchievementToast";
import GamePedagogyPanel from "@/components/GamePedagogyPanel";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { gameSyncBannerText, useSyncEligibilityQuery } from "@/hooks/useGameScoreSync";
import { recordRun, type Achievement } from "@/lib/achievements";
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
  GameHud,
  GameShell,
  PauseMenu,
  ResultScreen,
  StartScreen,
  useBestScore,
  useHaptics,
  useTouchCapable,
  type GameScreenState,
} from "@/game-engine/mobile";
import { useVocabQuizSource, vocabLevelForGrade } from "@/game-engine/vocab";
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
  shuffleOptions,
  materialToQuestions,
  shouldFireRoamQuiz,
  resolveGrades,
  schoolLevelLabel,
  QUIZ_MODE_LABEL,
  SUBJECT_LABEL,
  isVocabQuestion,
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
import { anchorOutcome, interceptReward, freeRoamAnswerScore } from "@/lib/tornado/scoring";
import { UPGRADE_TRACKS, statMultiplier } from "@/lib/tornado/upgrades";
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
type QuizReason = "anchor" | "roam";

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
  /** A közös keret állapota játék közben (játszik / szünet / eredmény) — a PlayScreen jelenti. */
  const [playState, setPlayState] = useState<GameScreenState>("playing");
  /** A „Következő szint” új futást indít: a kulcs váltása újraszereli a PlayScreent. */
  const [playKey, setPlayKey] = useState(0);
  const autoPauseRef = useRef<() => void>(() => {});
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
        if (patch.phase === "quiz") {
          setScreen("play");
          setForceQuiz((n) => n + 1);
        }
      },
    });
  }, []);

  // A futáson kívül a kampó-jelzők nullázódnak: a következő futás ne induljon kényszerített állapotból.
  useEffect(() => {
    if (screen !== "play") {
      setForceResult(0);
      setForceQuiz(0);
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
      fixedScreen={screen !== "menu"}
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
                  Storm Garage
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
          <GarageScreen progress={progress} commit={commit} onBack={() => setScreen("menu")} />
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
            syncEligible={Boolean(syncEligibility?.eligible)}
            forceResult={forceResult}
            forceQuiz={forceQuiz}
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
        <div
          className="w-12 h-12 rounded-lg shrink-0"
          style={{ background: `linear-gradient(135deg, ${selectedVehicle.colors.body}, ${selectedVehicle.colors.accent})` }}
        />
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
        <MenuButton icon={<Trophy className="w-4 h-4" />} label="Highscore" onClick={props.onHighscore} />
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

function GarageScreen(props: { progress: TornadoProgress; commit: (p: TornadoProgress) => void; onBack: () => void }) {
  const { progress, commit } = props;
  const [category, setCategory] = useState<Vehicle["category"] | "all">("all");
  const [detailId, setDetailId] = useState<string>(progress.selectedVehicleId);
  const [flash, setFlash] = useState<string | null>(null);

  const detail = vehicleById(detailId) ?? VEHICLES[0]!;
  const owned = new Set(progress.ownedVehicleIds);

  const list = useMemo(() => {
    const base = category === "all" ? [...VEHICLES] : VEHICLES.filter((v) => v.category === category);
    return base.sort((a, b) => a.price - b.price);
  }, [category]);

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
      notify(res.reason === "insufficient_funds" ? "Nincs elég SC a fejlesztéshez." : "Maximum szint.");
    }
  };

  const detailUpgrades = upgradesFor(progress, detail.id);
  const isOwned = owned.has(detail.id);
  const isLocked = detail.unlockLevel > progress.highestLevelUnlocked;

  return (
    <Card className="border border-lime-400/40 bg-slate-950/80 backdrop-blur-md flex-1 flex flex-col min-h-0">
      <CardContent data-game-card-content className="p-3 sm:p-4 flex flex-col gap-3 flex-1 min-h-0">
        <ScreenHeader icon={<Car className="w-5 h-5 text-lime-300" />} title="Storm Garage" onBack={props.onBack} />

        {flash && (
          <p className="text-xs font-semibold text-center rounded bg-slate-800/90 border border-white/10 py-1.5">{flash}</p>
        )}

        {/* Detail panel */}
        <div className="rounded-lg border border-white/10 bg-slate-900/60 p-3">
          <div className="flex items-start gap-3">
            <div
              className="w-16 h-16 rounded-lg shrink-0 border border-white/10"
              style={{ background: `linear-gradient(135deg, ${detail.colors.body}, ${detail.colors.accent})` }}
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-white">{detail.name}</h3>
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: `${RARITY_COLOR[detail.rarity]}22`, color: RARITY_COLOR[detail.rarity] }}>
                  {RARITY_LABEL[detail.rarity]}
                </span>
              </div>
              <p className="text-xs text-white/60">{categoryLabel(detail.category)} · Feloldás: {detail.unlockLevel}. szint</p>
              <p className="text-sm font-bold text-amber-300 mt-1">{fmt(detail.price)} SC</p>
            </div>
          </div>

          {/* Stat bars */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-3">
            <StatBar label="Sebesség" value={detail.speed} max={260} />
            <StatBar label="Gyorsulás" value={detail.acceleration * statMultiplier(detailUpgrades, "engine")} max={130} />
            <StatBar label="Irányítás" value={detail.handling * statMultiplier(detailUpgrades, "suspension")} max={130} />
            <StatBar label="Stabilitás" value={detail.stability * statMultiplier(detailUpgrades, "chassis")} max={130} />
            <StatBar label="Szélállóság" value={detail.windResistance} max={120} />
            <StatBar label="Horgony" value={detail.anchorPower * statMultiplier(detailUpgrades, "anchor")} max={130} />
          </div>

          <div className="flex flex-wrap gap-2 mt-3">
            {!isOwned && (
              <Button size="sm" className="h-12 px-4 text-sm bg-lime-600 hover:bg-lime-500 text-slate-950 font-bold gap-1" disabled={isLocked} onClick={doBuy}>
                {isLocked ? <Lock className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
                {isLocked ? `Zárolva (${detail.unlockLevel}. szint)` : `Vásárlás — ${fmt(detail.price)} SC`}
              </Button>
            )}
            {isOwned && progress.selectedVehicleId !== detail.id && (
              <Button size="sm" className="h-12 px-4 text-sm bg-sky-600 hover:bg-sky-500 font-bold" onClick={doSelect}>
                Kiválasztás
              </Button>
            )}
            {isOwned && progress.selectedVehicleId === detail.id && (
              <span className="text-xs font-semibold text-emerald-300 self-center">✓ Aktuális jármű</span>
            )}
          </div>

          {/* Upgrades — only for owned vehicles */}
          {isOwned && (
            <div className="mt-3 border-t border-white/10 pt-2">
              <p className="text-xs uppercase tracking-wide text-white/50 mb-1.5 flex items-center gap-1">
                <Wrench className="w-3.5 h-3.5" /> Fejlesztés
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {UPGRADE_TRACKS.map((t) => {
                  const lvl = detailUpgrades[t.id] ?? 0;
                  return (
                    <button
                      key={t.id}
                      onClick={() => doUpgrade(t.id)}
                      className="min-h-12 flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-slate-800/60 hover:bg-slate-700/70 px-3 py-2 text-left"
                    >
                      <span className="text-xs">
                        <span className="font-semibold text-white">{t.label}</span>
                        <span className="text-white/50"> · {t.effectLabel}</span>
                      </span>
                      <span className="text-xs font-mono text-white/80">
                        {Array.from({ length: 5 }, (_, i) => (i < lvl ? "●" : "○")).join("")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Category filter */}
        <div className="flex gap-1.5 flex-wrap">
          <FilterChip active={category === "all"} onClick={() => setCategory("all")}>
            Mind ({VEHICLES.length})
          </FilterChip>
          {VEHICLE_CATEGORIES.map((c) => (
            <FilterChip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
              {c.label}
            </FilterChip>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 overflow-y-auto flex-1 min-h-0 pr-1">
          {list.map((v) => {
            const vOwned = owned.has(v.id);
            const vLocked = v.unlockLevel > progress.highestLevelUnlocked;
            return (
              <button
                key={v.id}
                onClick={() => {
                  sfxClick();
                  setDetailId(v.id);
                }}
                className={`text-left rounded-lg border p-2 transition-colors ${
                  detailId === v.id ? "border-lime-400/70 bg-lime-900/20" : "border-white/10 bg-slate-900/50 hover:border-white/25"
                }`}
              >
                <div
                  className="w-full min-h-12 rounded mb-1 relative"
                  style={{ background: `linear-gradient(135deg, ${v.colors.body}, ${v.colors.accent})` }}
                >
                  {vLocked && !vOwned && <Lock className="w-3.5 h-3.5 absolute top-1 right-1 text-white/80" />}
                  {vOwned && <span className="absolute top-0.5 right-1 text-xs text-emerald-200 font-bold">✓</span>}
                </div>
                <p className="text-xs font-semibold truncate text-white">{v.name}</p>
                <p className="text-xs" style={{ color: RARITY_COLOR[v.rarity] }}>
                  {fmt(v.price)} SC
                </p>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-white/40 text-center">
          Feloldható most: {purchasableVehicles(progress.highestLevelUnlocked, progress.ownedVehicleIds).length} jármű
        </p>
      </CardContent>
    </Card>
  );
}

function StatBar(props: { label: string; value: number; max: number }) {
  const pct = Math.max(4, Math.min(100, (props.value / props.max) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs text-white/60">
        <span>{props.label}</span>
        <span>{Math.round(props.value)}</span>
      </div>
      <div className="h-1.5 rounded bg-slate-800 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-sky-500 to-lime-400" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function FilterChip(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={props.onClick}
      className={`min-h-12 text-sm font-semibold px-4 py-2 rounded-full border ${
        props.active ? "border-lime-400/70 bg-lime-900/30 text-lime-200" : "border-white/15 bg-slate-900/50 text-white/70"
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
        <div className="overflow-y-auto flex-1 min-h-0 flex flex-col gap-2 pr-1">
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
        </div>
        <p className="text-xs text-white/40 text-center">A 200. szint — THE ULTIMATE STORM — a legnehezebb kihívás.</p>
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
          <p className="text-xs font-bold uppercase tracking-wide text-white/60 mb-1.5">School Level — iskolai szint</p>
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
                {q === "low" ? "LOW" : q === "medium" ? "MEDIUM" : "HIGH"}
              </ToggleChip>
            ))}
          </div>
          <p className="text-xs text-white/45 mt-1">Gyengébb gépen / mobilon a LOW ad nagyobb FPS-t.</p>
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
        <ScreenHeader icon={<Trophy className="w-5 h-5 text-amber-300" />} title="Highscore" onBack={props.onBack} />
        <div className="grid grid-cols-2 gap-2">
          <BigStat label="Total Score" value={fmt(props.progress.totalScore)} />
          <BigStat label="Best Level" value={String(bestLevel || 1)} />
          <BigStat label="Tornadoes Intercepted" value={fmt(stats.tornadoesIntercepted)} />
          <BigStat label="Correct Answers" value={fmt(stats.correctAnswers)} />
          <BigStat label="Best Time" value={Number.isFinite(bestTime) ? `${Math.round(bestTime)} s` : "—"} />
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
    ["Total Points", fmt(stats.totalPoints)],
    ["Best Level Score", fmt(stats.bestLevelScore)],
    ["Levels Completed", fmt(stats.levelsCompleted)],
    ["Tornadoes Intercepted", fmt(stats.tornadoesIntercepted)],
    ["Successful Anchors", fmt(stats.successfulAnchors)],
    ["Correct Answers", fmt(stats.correctAnswers)],
    ["Wrong Answers", fmt(stats.wrongAnswers)],
    ["Kilometers Traveled", `${stats.kilometersTraveled.toFixed(1)} km`],
    ["Maximum Wind Speed", `${fmt(stats.maxWindSpeed)} km/h`],
    ["Longest Intercept", `${Math.round(stats.longestIntercept)} s`],
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
        className="text-white/80 hover:bg-white/10 gap-1 -ml-2 h-12 px-3 text-sm"
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
  syncEligible: boolean;
  /** Teszt-kampó (növekvő sorszám): > 0 és változik → győzelmi eredmény. */
  forceResult: number;
  /** Teszt-kampó (növekvő sorszám): > 0 és változik → kvíz feldobása (M9/M10 rossz válasz). */
  forceQuiz: number;
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
    surface: "grass" as ReturnType<typeof surfaceAt>,
    timeLeft: runTimeLimit,
    stormPct: 0,
    score: 0,
  });
  const [activeQuiz, setActiveQuiz] = useState<Question | null>(null);
  /**
   * G-1: a rossz válasz magyarázata.
   *
   * Eddig 750 ms villanás jelezte a helyes választ, aztán ment tovább a játék.
   * Ennyi idő alatt a gyerek látja, MELYIK volt a jó, de azt nem tudja meg, hogy
   * MIÉRT — a téves fogalom megmarad. A kártya addig áll, amíg be nem zárja.
   */
  const [feedback, setFeedback] = useState<FeedbackCard | null>(null);
  const pendingResolveRef = useRef<(() => void) | null>(null);
  const [quizReason, setQuizReason] = useState<QuizReason>("roam");
  const [quizFlash, setQuizFlash] = useState<{ idx: number; correct: boolean } | null>(null);
  const [anchorMsg, setAnchorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{
    score: number;
    coins: number;
    won: boolean;
    correct: number;
    total: number;
    best: number;
    isNewBest: boolean;
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
  const rngRef = useRef({ next: 0 });
  const playerRef = useRef<PlayerState>({ x: fromKm(0.02) * 0, z: HALF_WORLD * 0, heading: 0, speed: 0, anchored: false });
  const tornadoPosRef = useRef({ x: 0, z: 0, angle: 0, born: 0, alive: true });
  const windRef = useRef<WindState>(initialWind(spec));
  const timeLeftRef = useRef(runTimeLimit);
  const scoreRef = useRef(0);
  const correctRef = useRef(0);
  const wrongRef = useRef(0);
  const anchorAttemptsRef = useRef(1);
  const lastQuizAtRef = useRef(0);
  const lastEvalAtRef = useRef(-Infinity);
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
  const answerLockedRef = useRef(false);
  const keysRef = useRef({ fwd: false, back: false, left: false, right: false, brake: false });
  /** Analog stick input (spec 2026-09-29-tornado-ut-kormanyzas D3). */
  const touchRef = useRef<TouchDrive>({ throttle: 0, steer: 0 });
  /** Smoothed ground height under the camera (spec D6); NaN = snap on the next frame. */
  const camGroundRef = useRef(Number.NaN);
  /** Bumped on blur / hidden tab: the VirtualJoystick drops a drag that is still in progress. */
  const [touchReset, setTouchReset] = useState(0);
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
  } | null>(null);

  const rafRef = useRef(0);
  const lastTimeRef = useRef<number | null>(null);

  // G-5: a rajzoló hurok ref-ekből olvas (nem indul újra minden renderre),
  // ezért a beállítást ide tükrözzük.
  const reducedMotion = useReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  /* ------- deterministic-ish RNG for quiz draws ------- */
  const drawRng = useCallback(() => {
    // xorshift on a per-run seed derived from the level; good enough for variety.
    let x = (rngRef.current.next = (rngRef.current.next * 1664525 + 1013904223 + props.level * 7919) >>> 0);
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 100000) / 100000;
  }, [props.level]);

  const raiseQuiz = useCallback(
    (reason: QuizReason) => {
      answerLockedRef.current = false;
      const vocabNow = vocabRef.current;
      const q = pickQuestion({
        adaptiveBand: adaptiveRef.current.band,
        level: props.level,
        school: settingsRef.current.school,
        mode: props.coupon.active ? "mixed" : settingsRef.current.quizMode,
        material: materialRef.current,
        recent: recentQuizRef.current,
        gradeSeen: gradeSeenRef.current,
        rng: drawRng,
        vocab: vocabNow
          ? {
              next: () => {
                const vq = vocabNow.next(vocabLevelForGrade(primaryGradeRef.current, adaptiveRef.current.band));
                return vq ? vocabToQuestion(vq, primaryGradeRef.current) : null;
              },
            }
          : undefined,
      });
      // Kézi (nem szóbankos) angol kérdés helyes válasza a közös naplóba: ugyanaz a szó ne jöjjön vissza a bankból.
      if (q.subject === "english" && q.source === "bank" && !isVocabQuestion(q)) {
        vocabRef.current?.markExternal(q.options[q.correctIndex]!);
      }
      const shuffled = shuffleOptions(q, drawRng);
      recentQuizRef.current = [...recentQuizRef.current.slice(-8), q.id];
      markGradeQuizSeen(gradeSeenRef.current, q);
      lastQuizAtRef.current = elapsedRef.current;
      setQuizReason(reason);
      setActiveQuiz(shuffled);
      setPhase("quiz");
    },
    [drawRng, props.level],
  );

  /* ------- reset the run on mount / level change ------- */
  useEffect(() => {
    finishedRef.current = false;
    rngRef.current.next = (props.level * 2654435761) >>> 0;
    // Player starts a few km from the funnel; tornado near the map centre.
    tornadoPosRef.current = { x: 0, z: 0, angle: drawRng() * Math.PI * 2, born: 0, alive: true };
    playerRef.current = { x: 0, z: fromKm(3.4), heading: Math.PI, speed: 0, anchored: false };
    // Review PR #140: a kamera ne a régi hely magasságáról siklódjon át — NaN → a következő képkocka azonnal az új talajon.
    camGroundRef.current = Number.NaN;
    windRef.current = initialWind(spec);
    timeLeftRef.current = runTimeLimit;
    scoreRef.current = 0;
    correctRef.current = 0;
    wrongRef.current = 0;
    anchorAttemptsRef.current = 1;
    lastQuizAtRef.current = 0;
    lastEvalAtRef.current = -Infinity;
    elapsedRef.current = 0;
    distanceTravelledRef.current = 0;
    recentQuizRef.current = [];
    gradeSeenRef.current = createGradeQuizSeen();
    setResult(null);
    setAnchorMsg(null);
    setActiveQuiz(null);
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
    };

    const handleResize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect?.width ?? 640));
      const h = Math.max(1, Math.floor(rect?.height ?? 480));
      renderer.setSize(w, h, false);
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
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
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
      suppressQuiz: () => {
        lastQuizAtRef.current = elapsedRef.current;
      },
    };
    const w = window as unknown as { __websuliTornado?: typeof api };
    w.__websuliTornado = api;
    return () => {
      if (w.__websuliTornado === api) delete w.__websuliTornado;
    };
  }, []);

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
    if (phaseRef.current !== "approach" && phaseRef.current !== "seeking") return;
    const p = playerRef.current;
    const distKm = toKm(Math.hypot(p.x - tornadoPosRef.current.x, p.z - tornadoPosRef.current.z));
    // Must be roughly stopped to anchor.
    if (Math.abs(p.speed) > STOPPED_SPEED) {
      setAnchorMsg("Előbb állj meg a horgonyzáshoz!");
      sfxWarning();
      scheduleTimeout(() => setAnchorMsg(null), 1600);
      return;
    }
    // The scoring quiz — the brief's core mechanic. Distance/ground are checked
    // after the answer in `resolveAnchor`, so the child always answers first.
    pendingAnchorRef.current = { distanceKm: distKm };
    raiseQuiz("anchor");
  };

  const pendingAnchorRef = useRef<{ distanceKm: number } | null>(null);

  const finishRun = useCallback(
    (won: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      const p = playerRef.current;
      const distKm = toKm(Math.hypot(p.x - tornadoPosRef.current.x, p.z - tornadoPosRef.current.z));
      const reward = won
        ? interceptReward({
            spec,
            secondsUsed: elapsedRef.current,
            anchorAttempts: anchorAttemptsRef.current,
            peakWind: windRef.current.maximumWindSpeed,
            distanceKm: distKm,
            correctAnswers: correctRef.current,
            wrongAnswers: wrongRef.current,
          })
        : { score: Math.round(scoreRef.current), coins: 0, breakdown: { base: 0, speedBonus: 0, stormBonus: 0, answerBonus: 0, positionBonus: 0 } };

      // A futás véget ért: a még függő fázisváltások (pl. egy kvíz utáni továbblépés) nem írhatják felül.
      clearPendingTimers();
      pausedRef.current = false;
      setPaused(false);
      setFeedback(null);
      pendingResolveRef.current = null;
      const bestNow = props.onSubmitBest(reward.score);
      setResult({
        score: reward.score,
        coins: reward.coins,
        won,
        correct: correctRef.current,
        total: correctRef.current + wrongRef.current,
        best: bestNow.best,
        isNewBest: bestNow.isNewBest,
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
        maxStreak: correctRef.current,
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
        void apiRequest("POST", "/api/games/score", {
          gameId: GAME_ID,
          difficulty: props.level >= 150 ? "hard" : props.level >= 70 ? "normal" : "easy",
          runXp: reward.score,
          runStreak: correctRef.current,
          runSeconds: Math.round(elapsedRef.current),
        })
          .then(() => void queryClient.invalidateQueries({ queryKey: ["/api/games/leaderboard"] }))
          .catch(() => {});
      }
    },
    [props, spec],
  );

  // Teszt-kampók: csak a jelző VÁLTOZÁSÁRA futnak (a régi `forceResult === true` minden renderkor újra lefutott,
  // így az „Újra” után azonnal visszaugrott az eredményre).
  const finishRunRef = useRef(finishRun);
  finishRunRef.current = finishRun;
  const raiseQuizRef = useRef(raiseQuiz);
  raiseQuizRef.current = raiseQuiz;
  useEffect(() => {
    if (props.forceResult > 0) finishRunRef.current(true);
  }, [props.forceResult]);
  useEffect(() => {
    if (props.forceQuiz > 0 && !finishedRef.current) raiseQuizRef.current("roam");
  }, [props.forceQuiz]);

  const resolveAnchor = useCallback(
    (answerCorrect: boolean) => {
      const pending = pendingAnchorRef.current;
      const p = playerRef.current;
      const grip = gripAt(p.x, p.z);
      const outcome = anchorOutcome({
        distanceKm: pending?.distanceKm ?? toKm(Math.hypot(p.x - tornadoPosRef.current.x, p.z - tornadoPosRef.current.z)),
        spec,
        answerCorrect,
        surfaceGrip: grip,
      });
      setAnchorMsg(outcome.message);
      scheduleTimeout(() => setAnchorMsg((cur) => (cur === outcome.message ? null : cur)), 2400);

      if (outcome.ok) {
        playerRef.current.anchored = true;
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
        scheduleGame(() => finishRunRef.current(true), 2600);
      } else {
        anchorAttemptsRef.current += 1;
        sfxError();
        setPhase("approach");
      }
      pendingAnchorRef.current = null;
    },
    [spec, finishRun, haptics, quality],
  );

  /* ------- answer handling ------- */
  const answerQuiz = useCallback(
    (idx: number) => {
      const quiz = activeQuiz;
      if (!quiz || answerLockedRef.current || pausedRef.current) return;
      answerLockedRef.current = true;
      const correct = idx === quiz.correctIndex;
      adaptiveRef.current.answer(correct);
      setQuizFlash({ idx, correct });
      if (correct) {
        correctRef.current += 1;
        scoreRef.current += quizReason === "roam" ? freeRoamAnswerScore(spec) : 0;
        sfxSuccess();
        haptics("success");
      } else {
        wrongRef.current += 1;
        sfxError();
        haptics("error");
      }
      props.onProgress((latest) => recordAnswer(latest, correct));

      maybeClaimCouponBonus(props.coupon, quiz.id, quiz.optionIndices?.[idx] ?? idx);

      const advance = () => {
        setQuizFlash(null);
        setActiveQuiz(null);
        if (quizReason === "anchor") {
          resolveAnchor(correct);
        } else {
          setPhase("approach");
        }
      };

      if (correct) {
        scheduleGame(advance, 750);
        return;
      }

      // Rossz válasz: a továbblépést a magyarázó kártya bezárása intézi, nem az
      // óra. A gyereknek olvasnia kell, és arra nem lehet 750 ms-ot adni.
      pendingResolveRef.current = advance;
      setFeedback(
        buildFeedback({
          quiz: {
            prompt: quiz.prompt,
            options: quiz.options,
            correctIndex: quiz.correctIndex,
            explanation: quiz.explanation ?? undefined,
          },
          chosenIndex: idx,
          attempt: 1, // vezetés közben nincs újrapróbálkozás: a vihar nem áll meg
          ageBand: "kid",
        }),
      );
    },
    [activeQuiz, quizReason, spec, props.coupon, props.progress, haptics],
  );

  const dismissFeedback = useCallback(() => {
    setFeedback(null);
    const resolve = pendingResolveRef.current;
    pendingResolveRef.current = null;
    resolve?.();
  }, []);

  const restartRef = useRef<() => void>(() => {});
  restartRef.current = () => {
    // Az előző futás minden függő időzítője és félbehagyott kvíze érvénytelen (review-lelet #426).
    runIdRef.current += 1;
    clearPendingTimers();
    pendingAnchorRef.current = null;
    pendingResolveRef.current = null;
    setFeedback(null);
    setQuizFlash(null);
    pausedRef.current = false;
    setPaused(false);
    burstRef.current = 0;
    adaptiveRef.current.reset(primaryGrade, props.gradeLevel);
    answerLockedRef.current = false;
    finishedRef.current = false;
    rngRef.current.next = (props.level * 2654435761 + Math.floor(Math.random() * 9973)) >>> 0;
    tornadoPosRef.current = { x: 0, z: 0, angle: drawRng() * Math.PI * 2, born: 0, alive: true };
    playerRef.current = { x: 0, z: fromKm(3.4), heading: Math.PI, speed: 0, anchored: false };
    // Review PR #140: a kamera ne a régi hely magasságáról siklódjon át — NaN → a következő képkocka azonnal az új talajon.
    camGroundRef.current = Number.NaN;
    windRef.current = initialWind(spec);
    timeLeftRef.current = runTimeLimit;
    scoreRef.current = 0;
    correctRef.current = 0;
    wrongRef.current = 0;
    anchorAttemptsRef.current = 1;
    lastQuizAtRef.current = 0;
    lastEvalAtRef.current = -Infinity;
    elapsedRef.current = 0;
    distanceTravelledRef.current = 0;
    recentQuizRef.current = [];
    gradeSeenRef.current = createGradeQuizSeen();
    const sc = sceneRef.current;
    if (sc) setAnchorsVisible(sc.vehicle, false);
    setResult(null);
    setAnchorMsg(null);
    setActiveQuiz(null);
    setPhase("seeking");
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

    // Always spin the funnel and rain so paused screens still feel alive. Befogáskor (600 ms) a tölcsér
    // felpörög; csökkentett mozgásnál a kitörés 0,4-szeres.
    const burstBoost = burstRef.current > 0 ? 1.6 * (burstRef.current / 0.6) * (reducedMotionRef.current ? 0.4 : 1) : 0;
    if (burstRef.current > 0) burstRef.current = Math.max(0, burstRef.current - dt);
    animateTornado(tornado, dt, spec.tornadoIntensity, (reducedMotionRef.current ? 0.35 : 1) * (1 + burstBoost));

    if (playing) {
      elapsedRef.current += dt;
      timeLeftRef.current = Math.max(0, runTimeLimit - elapsedRef.current);

      // --- vehicle control ---
      const p = playerRef.current;
      const upg = upgradesFor(props.progress, props.vehicle.id);
      const vehicleDims = vehicleDimensions(props.vehicle.silhouette);

      const k = keysRef.current;
      const t = touchRef.current;
      const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
      const rawPad = pads[0] ?? pads[1] ?? null;
      const pad = readStandardGamepad(padGateRef.current(rawPad) ? rawPad : null);
      if (pad.anchor && !padAnchorPrevRef.current) tryAnchorRef.current();
      padAnchorPrevRef.current = pad.anchor;

      // Keyboard stays digital; the touch stick and the gamepad are analog.
      const throttle = clampStick((k.fwd ? 1 : 0) - (k.back ? 1 : 0) + t.throttle + pad.throttle);
      const steer = clampStick((k.right ? 1 : 0) - (k.left ? 1 : 0) + t.steer + pad.steer);

      if (!p.anchored) {
        const windPush = windDriftUnits(windForceOn(windRef.current, props.vehicle.windResistance));
        const windAngle = (windRef.current.windDirection * Math.PI) / 180;
        const brake = k.brake || pad.brake;
        // One vehicle step of `dt` seconds: drive, then the collision pass with that same dt.
        const driveStep = (dt: number) => {
          const next = stepVehicle(
            p,
            { throttle, steer, brake },
            dt,
            {
              speedKmh: props.vehicle.speed,
              acceleration: props.vehicle.acceleration * statMultiplier(upg, "engine"),
              handling: props.vehicle.handling * statMultiplier(upg, "suspension"),
              grip: gripAt(p.x, p.z),
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
          p.speed = solid.speed;
        };
        // Spec 2026-09-29-tornado-ut-kormanyzas D5: a slow frame is split into ≤ 1/60 s steps, so a fast
        // car cannot jump through a fence in one go.
        const steps = driveSubsteps(dt);
        for (let i = 0; i < steps; i++) driveStep(dt / steps);
      } else {
        p.speed = 0;
      }

      // --- tornado motion ---
      const tp = tornadoPosRef.current;
      tp.born += dt;
      tp.angle += dt * 0.15;
      tp.x = clampToWorld(tp.x + Math.cos(tp.angle) * spec.tornadoSpeed * dt);
      tp.z = clampToWorld(tp.z + Math.sin(tp.angle) * spec.tornadoSpeed * dt);
      tornado.group.position.set(tp.x, 0, tp.z);
      tornado.group.scale.setScalar(spec.tornadoScale);
      // A szuperfelhő a tölcsér fölött marad, és lassan forog. A kupola a
      // kamerát követi, különben a széle belógna a képbe.
      sc.stormCloud.group.position.set(tp.x, 0, tp.z);
      animateStormCloud(sc.stormCloud, dt, reducedMotionRef.current ? 0.25 : 1);
      sc.skyDome.position.set(camera.position.x, 0, camera.position.z);

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
        rng: Math.random,
      });

      // Approach phase once within 2 km.
      if (ph === "seeking" && distKm < 2) setPhase("approach");

      // --- autonomous free-roam quiz (at most one eval / second) ---
      if (!p.anchored) {
        const decision = shouldFireRoamQuiz({
          elapsed: elapsedRef.current,
          lastQuizAt: lastQuizAtRef.current,
          lastEvalAt: lastEvalAtRef.current,
          alreadyPending: Boolean(activeQuiz) || phaseRef.current === "quiz",
          rng: drawRng,
        });
        lastEvalAtRef.current = decision.lastEvalAt;
        if (decision.fire) raiseQuiz("roam");
      }

      // --- lose conditions ---
      if (timeLeftRef.current <= 0 || tp.born > spec.tornadoLifetime) {
        if (!p.anchored) finishRun(false);
      }
      // Too close, un-anchored, in a strong storm = thrown → lose.
      if (!p.anchored && distKm < spec.anchorBand.min * 0.4 && windRef.current.currentWindSpeed > spec.windPeak * 0.8) {
        finishRun(false);
      }

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
      if (Math.random() < spec.lightningRate * dt * 0.6) {
        lightning.intensity = 6;
        lightning.position.set(tp.x + (Math.random() - 0.5) * 200, 180, tp.z + (Math.random() - 0.5) * 200);
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

    sc.postFx.render();

    // --- push HUD (throttled to ~10 fps to avoid re-render storms) ---
    hudTickRef.current += dt;
    if (hudTickRef.current > 0.1) {
      hudTickRef.current = 0;
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
        anchorReady: distKm >= spec.anchorBand.min && distKm <= spec.anchorBand.max && Math.abs(p.speed) < STOPPED_SPEED,
        surface: surfaceAt(p.x, p.z),
        timeLeft: timeLeftRef.current,
        stormPct: Math.min(100, (w.currentWindSpeed / spec.windPeak) * 100),
        score: Math.round(scoreRef.current),
      });
    }
  };
  const hudTickRef = useRef(0);

  const compass = compassFor(hud.windDir);

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
      {/* Teljes képernyős 3D jelenet: a HUD és a vezérlők áttetszően fölötte (mobiljáték-elrendezés). */}
      <div className="absolute inset-0 bg-black">
        <canvas ref={canvasRef} className="w-full h-full block touch-none" />
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
          {/* Level / wind / anchor overlay */}
          <div className="absolute top-2 left-2 flex flex-col items-start gap-1 text-xs font-bold pointer-events-none max-w-[70%] z-10">
            <div className="px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm" style={{ color: stage.color }}>
              LEVEL {props.level}/200 · STORM: {stormLabel(props.level)}
            </div>
            <div className="px-2 py-1 rounded-lg bg-black/60 backdrop-blur-sm">
              WIND SPEED: <span className="text-cyan-300">{hud.wind} km/h</span>{" "}
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
              <Anchor className="w-3.5 h-3.5" /> ANCHOR: {hud.anchorReady ? "READY" : playerRef.current.anchored ? "SET" : "…"} ·{" "}
              {SURFACE_LABEL[hud.surface]}
            </div>
          </div>

          {/* Vehicle name — alacsony fekvő nézetben elhagyva, ott minden képpont a jeleneté. */}
          <div
            className="absolute left-2 px-2 py-1 rounded-lg bg-black/60 text-xs font-semibold pointer-events-none z-10 [@media(max-height:500px)]:hidden"
            style={{ bottom: aboveControls }}
          >
            {props.vehicle.name.toUpperCase()}
          </div>

          {/* G-9b: céljelző nyíl.
              Mérve (Pixel 7, 1. pálya): a cél 3,25 km-re volt, az álló telefon
              vízszintes látószöge viszont csak ~33°. A gyerek azt olvasta, hogy
              „Menj közelebb a tornádóhoz!", de azt nem tudhatta, merre forduljon —
              húsz másodperc alatt 0,2 km-t közeledett, félig véletlenül. */}
          {(phase === "seeking" || phase === "approach") && !activeQuiz && !result && (() => {
            const marker = targetMarker({
              heading: 0,
              targetBearing: hud.targetRelDeg,
              halfFovDeg: 16.5,
            });
            if (!marker.visible) return null;
            return (
              <div
                className={`absolute top-[40%] -translate-y-1/2 ${marker.side === "right" ? "right-2" : "left-2"} z-10 pointer-events-none flex flex-col items-center gap-1`}
                data-testid="tornado-target-marker"
                data-side={marker.side}
              >
                {/* Pulzáló irányjelző (csökkentett mozgásnál áll): a hüvelykujj-távolságból is feltűnő. */}
                <div className="px-3 py-2 rounded-full bg-amber-500/90 text-slate-950 text-2xl font-black leading-none shadow-[0_0_18px_rgba(245,158,11,0.75)] motion-safe:animate-pulse">
                  {marker.side === "right" ? "▶" : "◀"}
                </div>
                <span className="px-2 py-0.5 rounded-lg bg-black/70 text-xs font-bold text-amber-200">
                  {hud.distanceKm.toFixed(1)} km
                </span>
              </div>
            );
          })()}

          {/* Anchor guidance */}
          {(phase === "seeking" || phase === "approach") && !activeQuiz && !result && (
            <div
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
                  : hud.distanceKm > spec.anchorBand.max
                    ? "Menj közelebb a tornádóhoz!"
                    : hud.distanceKm < spec.anchorBand.min
                      ? "Túl közel! Állj meg biztonságos sávban."
                      : "Keresd a tornádót, közelítsd meg és állj meg!"}
            </div>
          )}

          {anchorMsg && (
            <div className="absolute inset-x-0 top-1/3 flex justify-center pointer-events-none">
              <div className="px-3 py-2 rounded-lg bg-black/80 border border-white/20 text-sm font-bold max-w-[80%] text-center">
                {anchorMsg}
              </div>
            </div>
          )}

          {/* Szünet alatt a magyarázó kártya rejtve: a z-[90]-es kártya különben a szünet menü fölé kerülne. */}
          {feedback && !paused && <QuizFeedbackCard card={feedback} onDismiss={dismissFeedback} />}

          {/* Quiz overlay — a HUD alatti sávban, így a szünet gomb kvíz közben is elérhető. */}
          {activeQuiz && (
            <div className="absolute inset-0 z-40 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-3">
              <div
                data-testid="tornado-quiz"
                className="w-full max-w-md sm:max-w-2xl max-h-full overflow-y-auto rounded-2xl border border-sky-400/50 bg-slate-900/95 p-3 sm:p-4 shadow-[0_18px_50px_rgba(0,0,0,0.6)]"
              >
                <p className="text-xs font-bold uppercase tracking-wide text-sky-300 mb-1">
                  {quizReason === "anchor" ? "⚓ Horgonyzási kérdés" : "🌪 Viharkérdés"} · {activeQuiz.topic || SUBJECT_LABEL[activeQuiz.subject]}
                  {activeQuiz.source === "material" ? " · tananyag" : ""}
                </p>
                <p className="text-lg font-extrabold mb-2 sm:mb-3 text-white leading-snug">{activeQuiz.prompt}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {activeQuiz.options.map((opt, i) => {
                    const isFlash = quizFlash?.idx === i;
                    const showCorrect = quizFlash && i === activeQuiz.correctIndex;
                    return (
                      <button
                        key={i}
                        type="button"
                        disabled={Boolean(quizFlash)}
                        onClick={() => answerQuiz(i)}
                        className={`game-answer-btn text-left rounded-xl border-2 px-3 py-2 font-bold text-white transition-[transform,background-color,border-color] duration-150 active:scale-[0.98] ${
                          showCorrect
                            ? "border-emerald-300 bg-emerald-600/60 motion-safe:scale-[1.02]"
                            : isFlash && !quizFlash?.correct
                              ? "border-rose-300 bg-rose-700/60"
                              : "border-white/15 bg-slate-800/80 hover:border-sky-400/70 hover:bg-slate-700/80"
                        }`}
                        {...correctDataAttrs(i === activeQuiz.correctIndex)}
                      >
                        <span className="mr-2 inline-flex h-[1.75rem] w-[1.75rem] items-center justify-center rounded-lg bg-white/10 text-base">
                          {String.fromCharCode(65 + i)}
                        </span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
                {quizReason === "anchor" && (
                  <p className="text-sm text-white/65 mt-2">Helyes válasz = sikeres horgonyzás. Hibás válasz = új kérdés.</p>
                )}
              </div>
            </div>
          )}
      </div>

      {touch && (
        <TouchControls
          leftHanded={props.progress.settings.leftHanded}
          touchRef={touchRef}
          resetSignal={touchReset}
          anchorReady={hud.anchorReady && !playerRef.current.anchored}
          onAnchor={() => tryAnchorRef.current()}
          onCamera={() => {
            const next = toggleCamera(settingsRef.current.cameraMode);
            settingsRef.current = { ...settingsRef.current, cameraMode: next };
            props.onProgress((latest) => updateSettings(latest, { cameraMode: next }));
          }}
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
                  {q === "low" ? "LOW" : q === "medium" ? "MEDIUM" : "HIGH"}
                </ToggleChip>
              ))}
            </div>
          </div>
        </div>
      </PauseMenu>

      <ResultScreen
        open={result != null}
        testId="th-result"
        title={result?.won ? "Intercept sikeres!" : "Sikertelen intercept"}
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
                      ? "Legyőzted THE ULTIMATE STORM-ot!"
                      : `${props.level + 1}. szint feloldva!`
                    : "A tornádó elhaladt. Próbáld újra!"}
                </span>
              </p>
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
function TouchControls(props: {
  leftHanded: boolean;
  touchRef: React.MutableRefObject<TouchDrive>;
  resetSignal: number;
  /** Jó horgonyzási pozíció: a ⚓ gomb világít és pulzál (csökkentett mozgásnál csak világít). */
  anchorReady: boolean;
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
      <TouchBtn onDown={() => props.onCamera()} onUp={() => {}} label="Cam" small />
      <TouchBtn onDown={() => props.onAnchor()} onUp={() => {}} label="⚓" accent glow={props.anchorReady} />
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
}) {
  return (
    <HoldButton
      label={props.label}
      onHoldStart={props.onDown}
      onHoldEnd={props.onUp}
      className={`rounded-full border-2 font-bold flex items-center justify-center shadow-lg backdrop-blur-sm transition-[transform,box-shadow] duration-150 active:scale-90 ${
        props.small ? "w-12 h-12 text-sm" : "game-action-btn text-2xl"
      } ${props.accent ? "bg-amber-500/85 border-amber-200/80 text-slate-950" : "bg-slate-900/70 border-white/25"} ${
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
