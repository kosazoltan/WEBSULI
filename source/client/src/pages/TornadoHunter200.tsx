import { createAdaptiveSession } from "@/game-engine/adaptiveSession";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import * as THREE from "three";
import {
  ArrowLeft,
  Tornado as TornadoIcon,
  Wind,
  Gauge,
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
import { Card, CardContent } from "@/components/ui/card";
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
import QuizFeedbackCard from "@/game-engine/QuizFeedbackCard";
import { buildFeedback, type FeedbackCard } from "@/game-engine/feedback";
import { useReducedMotion } from "@/game-engine/useReducedMotion";
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
import { stepVehicle, STOPPED_SPEED } from "@/lib/tornado/drive";
import { readStandardGamepad } from "@/lib/tornado/gamepad";
import {
  toggleCamera,
  escAction,
} from "@/lib/tornado/controls";
import { shouldDisposeGeometry } from "@/tornado/meshLifetime";
import {
  loadProgress,
  saveProgress,
  buyVehicle,
  selectVehicle,
  buyUpgrade,
  completeLevel,
  recordAnswer,
  addDistance,
  updateSettings,
  upgradesFor,
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
  buildProp,
  buildRain,
  animateRain,
  skyColorFor,
  buildSkyDome,
  buildStormCloud,
  animateStormCloud,
  skyDomeRadiusFor,
  cameraFarFor,
  type StormCloud,
  disposeMeshCaches,
  type TornadoMesh,
} from "@/tornado/buildMeshes";
import {
  chunksAround,
  chunkKey,
  propsInChunk,
  gripAt,
  surfaceAt,
  SURFACE_LABEL,
  terrainHeight,
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

export default function TornadoHunter200() {
  const [progress, setProgress] = useState<TornadoProgress>(() => loadProgress());
  const [screen, setScreen] = useState<Screen>("menu");
  const [newlyUnlocked, setNewlyUnlocked] = useState<Achievement[]>([]);

  const coupon = useCouponSession();
  const { data: syncEligibility } = useSyncEligibilityQuery();
  const syncBanner = useMemo(() => gameSyncBannerText(syncEligibility), [syncEligibility]);

  // Persist every progress change.
  useEffect(() => {
    saveProgress(progress);
  }, [progress]);

  const selectedVehicle = vehicleById(progress.selectedVehicleId) ?? VEHICLES[0]!;

  const commit = useCallback((next: TornadoProgress) => setProgress(next), []);

  return (
    <div
      data-game="TornadoHunter200" data-playing={screen === "play"} data-fixed-screen={screen !== "menu"}
      className="game-shell-fixed min-h-screen relative overflow-hidden text-white"
      style={{
        background:
          "radial-gradient(ellipse at 20% 12%, rgba(56,189,248,0.16), transparent 40%), radial-gradient(ellipse at 82% 8%, rgba(148,163,184,0.16), transparent 44%), linear-gradient(180deg, #0b1220 0%, #0a0f1c 100%)",
      }}
    >
      <AchievementToast achievements={newlyUnlocked} />
      <main className="relative z-10 w-full max-w-2xl xl:max-w-4xl mx-auto px-2 sm:px-5 py-2 sm:py-4 min-h-dvh min-h-screen flex flex-col pb-20 sm:pb-10">
        <CouponHud session={coupon} />
        <CouponExpiredOverlay session={coupon} />

        <header className="flex items-center justify-between gap-1 mb-2">
          <Link href="/games">
            <Button variant="ghost" size="sm" className="text-white/90 hover:bg-white/10 gap-1 -ml-2 h-11 px-3">
              <ArrowLeft className="w-4 h-4" />
              Játékok
            </Button>
          </Link>
          <div className="flex items-center gap-2 text-xs font-semibold">
            <AudioToggleButton size="icon" />
            <span className="flex items-center gap-1 text-amber-300" data-testid="tornado-coins">
              <Coins className="w-4 h-4" />
              {fmt(progress.coins)} SC
            </span>
          </div>
        </header>

        {screen === "menu" && (
          <MenuScreen
            progress={progress}
            selectedVehicle={selectedVehicle}
            syncBanner={syncBanner}
            onPlay={() => setScreen("levels")}
            onGarage={() => setScreen("garage")}
            onLevels={() => setScreen("levels")}
            onHighscore={() => setScreen("highscore")}
            onStats={() => setScreen("stats")}
            onSettings={() => setScreen("settings")}
          />
        )}

        {screen === "garage" && (
          <GarageScreen progress={progress} commit={commit} onBack={() => setScreen("menu")} />
        )}

        {screen === "levels" && (
          <LevelsScreen
            progress={progress}
            onBack={() => setScreen("menu")}
            onPick={(level) => {
              setSelectedLevelRef(level);
              setScreen("play");
            }}
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
            level={getSelectedLevelRef()}
            vehicle={selectedVehicle}
            progress={progress}
            coupon={coupon}
            syncEligible={Boolean(syncEligibility?.eligible)}
            onExit={() => setScreen("levels")}
            onComplete={(next, unlocked) => {
              setProgress(next);
              if (unlocked.length > 0) setNewlyUnlocked(unlocked);
            }}
            onProgress={setProgress}
          />
        )}
      </main>
    </div>
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

function MenuScreen(props: {
  progress: TornadoProgress;
  selectedVehicle: Vehicle;
  syncBanner: string;
  onPlay: () => void;
  onGarage: () => void;
  onLevels: () => void;
  onHighscore: () => void;
  onStats: () => void;
  onSettings: () => void;
}) {
  const { progress, selectedVehicle } = props;
  return (
    <Card className="border border-sky-400/40 bg-slate-950/80 backdrop-blur-md flex-1 flex flex-col min-h-0">
      <CardContent data-game-card-content className="p-3 sm:p-5 flex flex-col gap-4 flex-1 overflow-y-auto">
        <div className="flex items-center gap-2">
          <TornadoIcon className="w-7 h-7 text-sky-300" />
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-white">Tornado Hunter 200</h1>
            <p className="text-xs text-white/60">3D viharvadászat — 200 szint, 160 jármű, Storm Coin</p>
          </div>
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

        <div className="rounded-lg border border-white/10 bg-slate-900/60 p-3 flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-lg shrink-0"
            style={{ background: `linear-gradient(135deg, ${selectedVehicle.colors.body}, ${selectedVehicle.colors.accent})` }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-white/50 uppercase tracking-wide">Aktuális jármű</p>
            <p className="font-bold truncate text-white">{selectedVehicle.name}</p>
            <p className="text-xs" style={{ color: RARITY_COLOR[selectedVehicle.rarity] }}>
              {RARITY_LABEL[selectedVehicle.rarity]} · {categoryLabel(selectedVehicle.category)}
            </p>
          </div>
          <div className="text-right text-xs text-white/60">
            <p>Szint {progress.highestLevelUnlocked}/200</p>
            <p className="text-amber-300 font-semibold">{fmt(progress.totalScore)} pont</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button className="col-span-2 h-14 text-base font-extrabold bg-gradient-to-r from-sky-600 to-cyan-500 hover:from-sky-500 hover:to-cyan-400" onClick={props.onPlay}>
            <Play className="w-5 h-5 mr-1" /> Vadászat indítása
          </Button>
          <MenuButton icon={<Car className="w-4 h-4" />} label="Storm Garage" onClick={props.onGarage} />
          <MenuButton icon={<ChevronRight className="w-4 h-4" />} label="Szintek" onClick={props.onLevels} />
          <MenuButton icon={<Trophy className="w-4 h-4" />} label="Highscore" onClick={props.onHighscore} />
          <MenuButton icon={<BarChart3 className="w-4 h-4" />} label="Statisztika" onClick={props.onStats} />
          <MenuButton icon={<SettingsIcon className="w-4 h-4" />} label="Beállítások (iskolai szint)" onClick={props.onSettings} className="col-span-2" />
        </div>

        <p className="text-[11px] text-cyan-100/80 border border-cyan-700/40 rounded px-2 py-1.5 bg-slate-900/80">
          {props.syncBanner}
        </p>
      </CardContent>
    </Card>
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
                <span className="text-[11px] px-1.5 py-0.5 rounded" style={{ backgroundColor: `${RARITY_COLOR[detail.rarity]}22`, color: RARITY_COLOR[detail.rarity] }}>
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
              <Button size="sm" className="bg-lime-600 hover:bg-lime-500 text-slate-950 font-bold gap-1" disabled={isLocked} onClick={doBuy}>
                {isLocked ? <Lock className="w-4 h-4" /> : <ShoppingCart className="w-4 h-4" />}
                {isLocked ? `Zárolva (${detail.unlockLevel}. szint)` : `Vásárlás — ${fmt(detail.price)} SC`}
              </Button>
            )}
            {isOwned && progress.selectedVehicleId !== detail.id && (
              <Button size="sm" className="bg-sky-600 hover:bg-sky-500 font-bold" onClick={doSelect}>
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
              <p className="text-[11px] uppercase tracking-wide text-white/50 mb-1.5 flex items-center gap-1">
                <Wrench className="w-3.5 h-3.5" /> Fejlesztés
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {UPGRADE_TRACKS.map((t) => {
                  const lvl = detailUpgrades[t.id] ?? 0;
                  return (
                    <button
                      key={t.id}
                      onClick={() => doUpgrade(t.id)}
                      className="flex items-center justify-between rounded border border-white/10 bg-slate-800/60 hover:bg-slate-700/70 px-2 py-1.5 text-left"
                    >
                      <span className="text-xs">
                        <span className="font-semibold text-white">{t.label}</span>
                        <span className="text-white/50"> · {t.effectLabel}</span>
                      </span>
                      <span className="text-[11px] font-mono text-white/80">
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
                  className="w-full h-8 rounded mb-1 relative"
                  style={{ background: `linear-gradient(135deg, ${v.colors.body}, ${v.colors.accent})` }}
                >
                  {vLocked && !vOwned && <Lock className="w-3.5 h-3.5 absolute top-1 right-1 text-white/80" />}
                  {vOwned && <span className="absolute top-0.5 right-1 text-[10px] text-emerald-200 font-bold">✓</span>}
                </div>
                <p className="text-[11px] font-semibold truncate text-white">{v.name}</p>
                <p className="text-[10px]" style={{ color: RARITY_COLOR[v.rarity] }}>
                  {fmt(v.price)} SC
                </p>
              </button>
            );
          })}
        </div>
        <p className="text-[10px] text-white/40 text-center">
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
      <div className="flex justify-between text-[10px] text-white/60">
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
      className={`text-xs px-2.5 py-1 rounded-full border ${
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
                  className="w-full flex items-center justify-between px-3 py-2"
                  onClick={() => {
                    sfxClick();
                    setOpenStage(open ? "" : stage.id);
                  }}
                >
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
                    <span className="font-bold text-sm text-white">{stage.label}</span>
                    <span className="text-[11px] text-white/50">
                      {stage.from}–{stage.to}
                    </span>
                  </span>
                  <span className="text-[11px] text-white/60">
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
                          className={`aspect-square rounded flex flex-col items-center justify-center text-[11px] font-bold border ${
                            unlocked
                              ? "border-white/15 bg-slate-800/80 text-white hover:bg-sky-900/50 hover:border-sky-400/50"
                              : "border-white/5 bg-slate-950/60 text-white/25"
                          } ${l.level === 200 ? "ring-1 ring-rose-500/60" : ""}`}
                          title={record ? `Rekord: ${fmt(record.score)}` : undefined}
                        >
                          {unlocked ? l.level : <Lock className="w-3 h-3" />}
                          {record && <span className="text-[8px] text-emerald-300 leading-none">★</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-white/40 text-center">A 200. szint — THE ULTIMATE STORM — a legnehezebb kihívás.</p>
      </CardContent>
    </Card>
  );
}

/* ============================ Settings ============================ */

function SettingsScreen(props: { progress: TornadoProgress; commit: (p: TornadoProgress) => void; onBack: () => void }) {
  const { progress, commit } = props;
  const s = progress.settings;
  const set = (patch: Partial<TornadoProgress["settings"]>) => commit(updateSettings(progress, patch));

  const schoolOptions: SchoolLevel[] = [1, 2, 3, 4, 5, 6, "auto"];
  const quizModes: QuizMode[] = ["math", "english", "mixed"];
  const qualities: GraphicsQuality[] = ["low", "medium", "high"];

  return (
    <Card className="border border-slate-400/40 bg-slate-950/80 backdrop-blur-md flex-1 flex flex-col min-h-0">
      <CardContent data-game-card-content className="p-3 sm:p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
        <ScreenHeader icon={<SettingsIcon className="w-5 h-5 text-slate-300" />} title="Beállítások" onBack={props.onBack} />

        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-white/60 mb-1.5">School Level — iskolai szint</p>
          <div className="flex flex-wrap gap-1.5">
            {schoolOptions.map((opt) => (
              <ToggleChip key={String(opt)} active={s.school === opt} onClick={() => set({ school: opt })}>
                {schoolLevelLabel(opt)}
              </ToggleChip>
            ))}
          </div>
          <p className="text-[11px] text-white/45 mt-1">
            AUTO: a szint alapján választja az osztályt (1–30 → 1–2. o. … 181–200 → 6. o.).
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
          <p className="text-[11px] text-white/45 mt-1">Gyengébb gépen / mobilon a LOW ad nagyobb FPS-t.</p>
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

        <div className="text-[11px] text-white/50 border border-white/10 rounded p-2 bg-slate-900/50">
          <p className="font-semibold text-white/70 mb-1">Irányítás PC-n</p>
          <p>W/S — gáz/fék · A/D — kormány · Szóköz — kézifék · F — horgony · C — kamera · Esc — menü</p>
          <p className="font-semibold text-white/70 mt-2 mb-1">Mobil</p>
          <p>Bal: kormány · Jobb: gáz, fék, horgony. A gombok az irányítás-móddal oldalt válthatók.</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ToggleChip(props: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={() => {
        sfxClick();
        props.onClick();
      }}
      className={`text-sm px-3 py-1.5 rounded-lg border font-semibold ${
        props.active ? "border-sky-400/70 bg-sky-900/40 text-sky-100" : "border-white/15 bg-slate-900/50 text-white/70"
      }`}
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
      <p className="text-[10px] uppercase tracking-wide text-white/50">{props.label}</p>
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
        className="text-white/80 hover:bg-white/10 gap-1 -ml-2"
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
  onExit: () => void;
  onComplete: (next: TornadoProgress, unlocked: Achievement[]) => void;
  onProgress: (next: TornadoProgress) => void;
}) {
  const spec = useMemo<LevelSpec>(() => levelSpec(props.level), [props.level]);
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
    timeLeft: spec.timeLimit,
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
  const [result, setResult] = useState<{ score: number; coins: number; won: boolean } | null>(null);

  // Material quizzes for this grade.
  const grades = resolveGrades(props.progress.settings.school, props.level);
  const primaryGrade = grades[grades.length - 1]!;
  const { data: materialData } = useQuery<{ items: unknown[] }>({
    queryKey: ["/api/games/material-quizzes", primaryGrade],
    queryFn: async () => {
      const res = await fetch(`/api/games/material-quizzes?classroom=${primaryGrade}&limit=3`, {
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
  const timeLeftRef = useRef(spec.timeLimit);
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
  const prevPhaseRef = useRef<PlayPhase>("seeking");
  const progressRef = useRef(props.progress);
  progressRef.current = props.progress;
  const onExitRef = useRef(props.onExit);
  onExitRef.current = props.onExit;
  const onProgressRef = useRef(props.onProgress);
  onProgressRef.current = props.onProgress;
  const scheduleTimeout = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timeoutsRef.current = timeoutsRef.current.filter((x) => x !== id);
      fn();
    }, ms);
    timeoutsRef.current.push(id);
    return id;
  };
  const recentQuizRef = useRef<string[]>([]);
  const adaptiveRef = useRef(createAdaptiveSession(primaryGrade));
  const answerLockedRef = useRef(false);
  const keysRef = useRef({ fwd: false, back: false, left: false, right: false, brake: false });
  const touchRef = useRef({ fwd: false, back: false, left: false, right: false });
  const padAnchorPrevRef = useRef(false);
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
      const q = pickQuestion({
        adaptiveBand: adaptiveRef.current.band,
        level: props.level,
        school: settingsRef.current.school,
        mode: settingsRef.current.quizMode,
        material: materialRef.current,
        recent: recentQuizRef.current,
        rng: drawRng,
      });
      const shuffled = shuffleOptions(q, drawRng);
      recentQuizRef.current = [...recentQuizRef.current.slice(-8), q.id];
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
    windRef.current = initialWind(spec);
    timeLeftRef.current = spec.timeLimit;
    scoreRef.current = 0;
    correctRef.current = 0;
    wrongRef.current = 0;
    anchorAttemptsRef.current = 1;
    lastQuizAtRef.current = 0;
    lastEvalAtRef.current = -Infinity;
    elapsedRef.current = 0;
    distanceTravelledRef.current = 0;
    recentQuizRef.current = [];
    setResult(null);
    setAnchorMsg(null);
    setActiveQuiz(null);
    setPhase("seeking");
  }, [props.level]);

  /* ------- Three.js scene setup ------- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const profile = QUALITY_PROFILES[quality];

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality !== "low", alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, profile.maxPixelRatio));
    const sky = skyColorFor(spec.tornadoIntensity);
    renderer.setClearColor(sky);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(sky.getHex(), profile.fogFar * 0.4, profile.fogFar);

    const camera = new THREE.PerspectiveCamera(62, 1, 0.5, cameraFarFor(profile));

    scene.add(new THREE.HemisphereLight("#cfe4ff", "#2b2f24", 0.9));
    const sun = new THREE.DirectionalLight("#fff4d6", 0.9);
    sun.position.set(60, 120, 40);
    scene.add(sun);
    const lightning = new THREE.PointLight("#dfefff", 0, 1400);
    lightning.position.set(0, 200, 0);
    scene.add(lightning);

    const vehicleGroup = buildVehicle(props.vehicle);
    scene.add(vehicleGroup);

    // G-9: színátmenetes égbolt a sík háttérszín helyett. A `setClearColor`
    // egyetlen színt ad, amitől a horizont papírkivágás-hatású volt.
    const skyDome = buildSkyDome(sky, sky.clone().multiplyScalar(0.45), skyDomeRadiusFor(profile));
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

    sceneRef.current = { renderer, scene, camera, vehicle: vehicleGroup, tornado, rain, chunks: new Map(), lightning, skyDome, stormCloud };

    const handleResize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect?.width ?? 640));
      const h = Math.max(1, Math.floor(rect?.height ?? 480));
      renderer.setSize(w, h, false);
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
        sc.chunks.forEach((objs) => objs.forEach((o) => sc.scene.remove(o)));
        sc.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
            const anyObj = obj as THREE.Mesh;
            if (!QUALITY_PROFILES[quality]) return;
            // Only dispose per-scene throwaways; shared cache is freed below.
            if (obj.userData.perScene && shouldDisposeGeometry(anyObj.geometry)) {
              anyObj.geometry.dispose();
            }
          }
        });
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

  /* ------- keyboard ------- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = keysRef.current;
      switch (e.key.toLowerCase()) {
        case "w":
        case "arrowup":
          k.fwd = true;
          break;
        case "s":
        case "arrowdown":
          k.back = true;
          break;
        case "a":
        case "arrowleft":
          k.left = true;
          break;
        case "d":
        case "arrowright":
          k.right = true;
          break;
        case " ":
          k.brake = true;
          e.preventDefault();
          break;
        case "f":
          tryAnchorRef.current();
          break;
        case "c": {
          const next = toggleCamera(settingsRef.current.cameraMode);
          settingsRef.current = { ...settingsRef.current, cameraMode: next };
          onProgressRef.current(updateSettings(progressRef.current, { cameraMode: next }));
          break;
        }
        case "escape": {
          const current: PlayPhase = pausedRef.current ? "paused" : phaseRef.current;
          const action = escAction(current);
          if (action === "pause") {
            prevPhaseRef.current = phaseRef.current;
            pausedRef.current = true;
            setPhase("paused");
          } else if (action === "exit") {
            onExitRef.current();
          }
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
      const k = keysRef.current;
      switch (e.key.toLowerCase()) {
        case "w":
        case "arrowup":
          k.fwd = false;
          break;
        case "s":
        case "arrowdown":
          k.back = false;
          break;
        case "a":
        case "arrowleft":
          k.left = false;
          break;
        case "d":
        case "arrowright":
          k.right = false;
          break;
        case " ":
          k.brake = false;
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  /* ------- anchoring ------- */
  const tryAnchorRef = useRef<() => void>(() => {});
  tryAnchorRef.current = () => {
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

      setResult({ score: reward.score, coins: reward.coins, won });
      setPhase(won ? "result_win" : "result_lose");
      if (won) sfxLevelUp();
      else sfxError();

      // Persist progress.
      let next = props.progress;
      next = addDistance(next, distanceTravelledRef.current);
      if (won) {
        next = completeLevel(next, {
          level: props.level,
          score: reward.score,
          coins: reward.coins,
          secondsUsed: elapsedRef.current,
          peakWind: windRef.current.maximumWindSpeed,
          anchored: true,
        });
      }
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
      props.onComplete(next, unlocked);

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
        if (sc) setAnchorsVisible(sc.vehicle, true);
        sfxSuccess();
        setPhase("approach");
        // Hold the anchor until the funnel's lifetime elapses → win.
        scheduleTimeout(() => finishRun(true), 2600);
      } else {
        anchorAttemptsRef.current += 1;
        sfxError();
        setPhase("approach");
      }
      pendingAnchorRef.current = null;
    },
    [spec, finishRun],
  );

  /* ------- answer handling ------- */
  const answerQuiz = useCallback(
    (idx: number) => {
      const quiz = activeQuiz;
      if (!quiz || answerLockedRef.current) return;
      answerLockedRef.current = true;
      const correct = idx === quiz.correctIndex;
      adaptiveRef.current.answer(correct);
      setQuizFlash({ idx, correct });
      if (correct) {
        correctRef.current += 1;
        scoreRef.current += quizReason === "roam" ? freeRoamAnswerScore(spec) : 0;
        sfxSuccess();
      } else {
        wrongRef.current += 1;
        sfxError();
      }
      props.onProgress(recordAnswer(props.progress, correct));

      if (correct) maybeClaimCouponBonus(props.coupon, quiz.id);

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
        scheduleTimeout(advance, 750);
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
    [activeQuiz, quizReason, spec, props.coupon, props.progress],
  );

  const dismissFeedback = useCallback(() => {
    setFeedback(null);
    const resolve = pendingResolveRef.current;
    pendingResolveRef.current = null;
    resolve?.();
  }, []);

  const restartRef = useRef<() => void>(() => {});
  restartRef.current = () => {
    adaptiveRef.current.reset(primaryGrade);
    answerLockedRef.current = false;
    finishedRef.current = false;
    rngRef.current.next = (props.level * 2654435761 + Math.floor(Math.random() * 9973)) >>> 0;
    tornadoPosRef.current = { x: 0, z: 0, angle: drawRng() * Math.PI * 2, born: 0, alive: true };
    playerRef.current = { x: 0, z: fromKm(3.4), heading: Math.PI, speed: 0, anchored: false };
    windRef.current = initialWind(spec);
    timeLeftRef.current = spec.timeLimit;
    scoreRef.current = 0;
    correctRef.current = 0;
    wrongRef.current = 0;
    anchorAttemptsRef.current = 1;
    lastQuizAtRef.current = 0;
    lastEvalAtRef.current = -Infinity;
    elapsedRef.current = 0;
    distanceTravelledRef.current = 0;
    recentQuizRef.current = [];
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
    const sc = sceneRef.current;
    if (!sc) return;
    const { renderer, scene, camera, vehicle, tornado, rain, lightning } = sc;
    const ph = phaseRef.current;
    const playing = (ph === "seeking" || ph === "approach") && !pausedRef.current;

    // Always spin the funnel and rain so paused screens still feel alive.
    animateTornado(tornado, dt, spec.tornadoIntensity);

    if (playing) {
      elapsedRef.current += dt;
      timeLeftRef.current = Math.max(0, spec.timeLimit - elapsedRef.current);

      // --- vehicle control ---
      const p = playerRef.current;
      const upg = upgradesFor(props.progress, props.vehicle.id);
      const grip = gripAt(p.x, p.z);

      const k = keysRef.current;
      const t = touchRef.current;
      const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
      const pad = readStandardGamepad(pads[0] ?? pads[1] ?? null);
      if (pad.anchor && !padAnchorPrevRef.current) tryAnchorRef.current();
      padAnchorPrevRef.current = pad.anchor;

      const throttle = clampStick(
        (k.fwd || t.fwd ? 1 : 0) - (k.back || t.back ? 1 : 0) + pad.throttle,
      );
      const steer = clampStick(
        (k.right || t.right ? 1 : 0) - (k.left || t.left ? 1 : 0) + pad.steer,
      );

      if (!p.anchored) {
        const windPush = windForceOn(windRef.current, props.vehicle.windResistance) * dt * 30;
        const windAngle = (windRef.current.windDirection * Math.PI) / 180;
        const next = stepVehicle(
          p,
          { throttle, steer, brake: k.brake || pad.brake },
          dt,
          {
            speedKmh: props.vehicle.speed,
            acceleration: props.vehicle.acceleration * statMultiplier(upg, "engine"),
            handling: props.vehicle.handling * statMultiplier(upg, "suspension"),
            grip,
            windPush,
            windAngle,
          },
        );
        const moved = Math.hypot(next.x - p.x, next.z - p.z);
        distanceTravelledRef.current += toKm(moved);
        p.x = next.x;
        p.z = next.z;
        p.heading = next.heading;
        p.speed = next.speed;
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
      vehicle.position.set(p.x, terrainHeight(p.x, p.z), p.z);
      vehicle.rotation.y = p.heading;
      const wheels = vehicle.userData.wheels as THREE.Mesh[] | undefined;
      wheels?.forEach((w) => (w.rotation.x += p.speed * dt * 0.2));

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

    // --- camera ---
    const p = playerRef.current;
    const ground = terrainHeight(p.x, p.z);
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

    renderer.render(scene, camera);

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

  return (
    <Card className="border border-sky-400/45 bg-slate-950/85 backdrop-blur-md flex-1 flex flex-col min-h-0">
      <CardContent data-game-card-content className="p-1.5 sm:p-2 flex flex-col flex-1 min-h-0 gap-1.5">
        {/* Top HUD row */}
        <div className="flex items-center justify-between text-[11px] sm:text-xs font-semibold gap-1 flex-wrap">
          <Button variant="ghost" size="sm" className="text-white/80 hover:bg-white/10 gap-1 -ml-1 h-7" onClick={props.onExit}>
            <ArrowLeft className="w-4 h-4" /> Szintek
          </Button>
          <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-white/10">
            LEVEL {props.level}/200
          </span>
          <span className="px-2 py-0.5 rounded" style={{ backgroundColor: `${stageForLevel(props.level).color}22`, color: stageForLevel(props.level).color }}>
            STORM: {stormLabel(props.level)}
          </span>
          <span className="flex items-center gap-1 text-cyan-200">
            <Wind className="w-3.5 h-3.5" /> {hud.wind} km/h
          </span>
          <span className="text-sky-200">
            {compass.arrow} {compass.label}
          </span>
          <span className="flex items-center gap-1 text-white/80">
            <Gauge className="w-3.5 h-3.5" /> {hud.distanceKm.toFixed(2)} km
          </span>
          <span className="text-amber-300">{fmt(hud.score)} pont</span>
        </div>

        {/* Canvas */}
        <div className="relative flex-1 min-h-0 rounded-lg overflow-hidden border border-white/10 bg-black">
          <canvas ref={canvasRef} className="w-full h-full block touch-none" />

          {/* Wind / anchor overlay */}
          <div className="absolute top-2 left-2 flex flex-col gap-1 text-[11px] font-bold pointer-events-none">
            <div className="px-2 py-1 rounded bg-black/55 backdrop-blur-sm">
              WIND SPEED: <span className="text-cyan-300">{hud.wind} km/h</span>
            </div>
            <div className="px-2 py-1 rounded bg-black/55 backdrop-blur-sm">
              MAX: <span className="text-sky-300">{hud.maxWind}</span> · {SURFACE_LABEL[hud.surface]}
            </div>
            <div
              className={`px-2 py-1 rounded backdrop-blur-sm flex items-center gap-1 ${
                hud.anchorReady ? "bg-emerald-600/70" : "bg-black/55"
              }`}
            >
              <Anchor className="w-3.5 h-3.5" /> ANCHOR: {hud.anchorReady ? "READY" : playerRef.current.anchored ? "SET" : "…"}
            </div>
          </div>

          {/* Time + storm meter */}
          <div className="absolute top-2 right-2 flex flex-col items-end gap-1 pointer-events-none">
            <div className="px-2 py-1 rounded bg-black/55 text-[11px] font-bold">
              ⏱ {Math.ceil(hud.timeLeft)}s
            </div>
            <div className="w-24 h-2 rounded bg-black/50 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500" style={{ width: `${hud.stormPct}%` }} />
            </div>
          </div>

          {/* Vehicle name */}
          <div className="absolute bottom-32 sm:bottom-20 left-2 px-2 py-1 rounded bg-black/55 text-[11px] font-semibold pointer-events-none z-10">
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
                className={`absolute top-1/2 -translate-y-1/2 ${marker.side === "right" ? "right-2" : "left-2"} z-10 pointer-events-none flex flex-col items-center gap-1`}
                data-testid="tornado-target-marker"
                data-side={marker.side}
              >
                <div className="px-2 py-1 rounded-full bg-amber-500/90 text-slate-950 text-lg font-black leading-none">
                  {marker.side === "right" ? "▶" : "◀"}
                </div>
                <span className="px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-bold text-amber-200">
                  {hud.distanceKm.toFixed(1)} km
                </span>
              </div>
            );
          })()}

          {/* Anchor guidance */}
          {(phase === "seeking" || phase === "approach") && !activeQuiz && !result && (
            <div className="absolute bottom-32 sm:bottom-20 right-2 px-2 py-1 rounded bg-sky-900/70 text-[11px] font-semibold pointer-events-none max-w-[60%] text-right z-10">
              {playerRef.current.anchored
                ? "Horgony rögzítve — tartsd ki a vihart!"
                : hud.anchorReady
                  ? "Jó pozíció! Nyomd az F / Horgony gombot!"
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

          {feedback && <QuizFeedbackCard card={feedback} onDismiss={dismissFeedback} />}

          {/* Quiz overlay */}
          {activeQuiz && (
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 z-30">
              <div className="w-full max-w-md rounded-xl border border-sky-400/50 bg-slate-900/95 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wide text-sky-300">
                    {quizReason === "anchor" ? "Horgonyzási kérdés" : "Viharkérdés"} · {SUBJECT_LABEL[activeQuiz.subject]}
                    {activeQuiz.source === "material" ? " · tananyag" : ""}
                  </span>
                </div>
                <p className="text-base font-bold mb-3 text-white">{activeQuiz.prompt}</p>
                <div className="grid grid-cols-1 gap-2">
                  {activeQuiz.options.map((opt, i) => {
                    const isFlash = quizFlash?.idx === i;
                    const showCorrect = quizFlash && i === activeQuiz.correctIndex;
                    return (
                      <button
                        key={i}
                        disabled={Boolean(quizFlash)}
                        onClick={() => answerQuiz(i)}
                        className={`text-left rounded-lg border px-3 py-2 text-sm font-semibold text-white transition-colors ${
                          showCorrect
                            ? "border-emerald-400 bg-emerald-700/40"
                            : isFlash && !quizFlash?.correct
                              ? "border-rose-400 bg-rose-800/40"
                              : "border-white/15 bg-slate-800/70 hover:border-sky-400/60 hover:bg-slate-700/70"
                        }`}
                      >
                        {String.fromCharCode(65 + i)}. {opt}
                      </button>
                    );
                  })}
                </div>
                {quizReason === "anchor" && (
                  <p className="text-[11px] text-white/50 mt-2">Helyes válasz = sikeres horgonyzás. Hibás válasz = új kérdés.</p>
                )}
              </div>
            </div>
          )}

          {phase === "paused" && !result && (
            <div className="absolute inset-0 bg-black/75 flex items-center justify-center p-4 z-30">
              <div className="w-full max-w-sm rounded-xl border border-white/15 bg-slate-900/95 p-5 text-center">
                <h3 className="text-xl font-extrabold text-white mb-2">Szünet</h3>
                <p className="text-sm text-white/70 mb-4">A vihar vár. Folytasd, vagy lépj ki a szintekhez.</p>
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-sky-600 hover:bg-sky-500 font-bold"
                    onClick={() => {
                      pausedRef.current = false;
                      setPhase(prevPhaseRef.current === "paused" ? "seeking" : prevPhaseRef.current);
                    }}
                  >
                    Folytatás
                  </Button>
                  <Button variant="secondary" className="flex-1 bg-slate-700 hover:bg-slate-600" onClick={props.onExit}>
                    Szintek
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Result overlay */}
          <TouchControls
            leftHanded={props.progress.settings.leftHanded}
            touchRef={touchRef}
            onAnchor={() => tryAnchorRef.current()}
            onCamera={() => {
              const next = toggleCamera(settingsRef.current.cameraMode);
              settingsRef.current = { ...settingsRef.current, cameraMode: next };
              props.onProgress(updateSettings(props.progress, { cameraMode: next }));
            }}
          />

          {result && (
            <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-4 z-30">
              <div className="w-full max-w-sm rounded-xl border border-white/15 bg-slate-900/95 p-5 text-center">
                <h3 className={`text-2xl font-extrabold mb-1 ${result.won ? "text-emerald-300" : "text-rose-300"}`}>
                  {result.won ? "Intercept sikeres!" : "Sikertelen intercept"}
                </h3>
                <p className="text-sm text-white/70 mb-3">
                  {result.won
                    ? props.level === 200
                      ? "Legyőzted THE ULTIMATE STORM-ot!"
                      : `${props.level + 1}. szint feloldva!`
                    : "A tornádó elhaladt. Próbáld újra!"}
                </p>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="rounded-lg bg-slate-800/70 p-2">
                    <p className="text-[10px] uppercase text-white/50">Pont</p>
                    <p className="text-lg font-bold text-amber-300">{fmt(result.score)}</p>
                  </div>
                  <div className="rounded-lg bg-slate-800/70 p-2">
                    <p className="text-[10px] uppercase text-white/50">Storm Coin</p>
                    <p className="text-lg font-bold text-emerald-300">+{fmt(result.coins)}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 bg-sky-600 hover:bg-sky-500 font-bold" onClick={() => restartRef.current()}>
                    Újra (R)
                  </Button>
                  <Button variant="secondary" className="flex-1 bg-slate-700 hover:bg-slate-600" onClick={props.onExit}>
                    Szintek
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
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
      for (const prop of propsInChunk(cx, cz)) {
        const mesh = buildProp(prop);
        mesh.userData.perScene = true;
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
  touchRef: React.MutableRefObject<{ fwd: boolean; back: boolean; left: boolean; right: boolean }>;
  onAnchor: () => void;
  onCamera: () => void;
}) {
  // G-8: az esemény-kezelés (preventDefault, pointer capture) a HoldButton-ba
  // került, itt már csak az irányjelző állítása marad.
  const hold = (key: "fwd" | "back" | "left" | "right", value: boolean) => () => {
    props.touchRef.current[key] = value;
  };

  const steer = (
    <div className="flex gap-2">
      <TouchBtn onDown={hold("left", true)} onUp={hold("left", false)} label="◀" />
      <TouchBtn onDown={hold("right", true)} onUp={hold("right", false)} label="▶" />
    </div>
  );
  const pedals = (
    <div className="tornado-pedals flex gap-2 items-end">
      <TouchBtn onDown={hold("back", true)} onUp={hold("back", false)} label="Fék" small />
      <TouchBtn onDown={() => props.onAnchor()} onUp={() => {}} label="⚓" accent />
      <TouchBtn onDown={() => props.onCamera()} onUp={() => {}} label="Cam" small />
      <TouchBtn onDown={hold("fwd", true)} onUp={hold("fwd", false)} label="Gáz" />
    </div>
  );

  return (
    <div
      data-testid="tornado-touch-controls"
      className="absolute inset-x-0 bottom-2 z-20 flex items-end justify-between gap-2 px-2 pointer-events-none"
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
}) {
  return (
    <HoldButton
      label={props.label}
      onHoldStart={props.onDown}
      onHoldEnd={props.onUp}
      className={`rounded-full border font-bold flex items-center justify-center active:scale-95 ${
        props.small ? "w-12 h-12 text-xs" : "w-14 h-14 text-sm"
      } ${props.accent ? "bg-amber-600/80 border-amber-300/60" : "bg-slate-800/80 border-white/15"}`}
    >
      {props.label}
    </HoldButton>
  );
}

function clampStick(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
