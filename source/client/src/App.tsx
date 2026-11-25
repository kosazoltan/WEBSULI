import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import { lazy, Suspense, useEffect } from "react";
import { LessonLoading } from "@/lesson-runtime/LessonLoading";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import LearnerProfileSync from "@/components/LearnerProfileSync";
import { ADVENT_BUILD_FLAG } from "@/advent/season-flag";

// LS-2: lazy, hogy a mérőoldal kódja ne kerüljön a fő bundle-be.
const LessonRuntimeProbe = lazy(() => import("@/lesson-runtime/LessonRuntimeProbe"));
// LS-3b: a kupon-HUD mérőoldala, ugyanazzal a kapcsolóval.
const CouponHudProbe = lazy(() =>
  import("@/lesson-runtime/LessonRuntimeProbe").then((m) => ({ default: m.CouponHudProbe })),
);
// LS-8 (#191): a tananyagkészítés panel böngészős mérőoldala. Lazy import, hogy
// soha ne kerüljön a fő bundle-be (repo-szabály a mérő/próba oldalakra).
const StudioPanelProbe = lazy(() => import("@/components/studio/StudioPanelProbe"));
const AdminTabsProbe = lazy(() => import("@/pages/AdminTabsProbe"));
const LearnersPanelProbe = lazy(() => import("@/pages/LearnersPanelProbe"));
const RepairWorkbenchProbe = lazy(() => import("@/pages/RepairWorkbenchProbe"));
// J0c: a kérdés-sáv próbaoldala CSAK teszt-kampós buildben (GAME_TEST_HOOKS_ENABLED ≡ VITE_ENABLE_GAME_TEST_HOOKS === "1").
// A feltétel a lusta importot is őrzi: az éles buildben a kifejezés `null`-ra egyszerűsödik, így a PlayLab darabja el sem
// készül (T/game-test-hooks-guard.test.ts prod-ága). A fő JS-darabba sosem kerül.
const PlayLab = import.meta.env.VITE_ENABLE_GAME_TEST_HOOKS === "1" ? lazy(() => import("@/pages/PlayLab")) : null;

// Lazy load heavy components for better code splitting
const Preview = lazy(() => import("@/pages/Preview"));
const LessonRedirect = lazy(() => import("@/pages/LessonRedirect"));
const PdfView = lazy(() => import("@/pages/pdf-view"));
const Admin = lazy(() => import("@/pages/admin"));
const AdminStats = lazy(() => import("@/pages/AdminStats"));
const AdminDocumentation = lazy(() => import("@/pages/AdminDocumentation"));
const Games = lazy(() => import("@/pages/Games"));
const TsunamiEscapeEnglish = lazy(() => import("@/pages/TsunamiEscapeEnglish"));
const WordLadderHuEn = lazy(() => import("@/pages/WordLadderHuEn"));
const BlockCraftQuiz = lazy(() => import("@/pages/BlockCraftQuiz"));
const SpeedQuizMath = lazy(() => import("@/pages/SpeedQuizMath"));
const BrainRotSteal = lazy(() => import("@/pages/BrainRotSteal"));
const SpaceAsteroidQuiz = lazy(() => import("@/pages/SpaceAsteroidQuiz"));
const TornadoHunter200 = lazy(() => import("@/pages/TornadoHunter200"));
// JM3a: Párbaj — online két főre (MP_MODE mögött) + gépi ellenfél (flag nélkül, hálózat nélkül).
const DuelOnline = lazy(() => import("@/pages/DuelOnline"));
// Adventi naptár (docs/specs/2026-11-18-adventi-naptar.md 14.1): szezonális oldal, NEM a játékok között. Kikapcsolt build-kapcsolónál
// az útvonal nem él (nincs oldal, nincs eszközazonosító-írás), és a lusta import sincs a buildben (vak ellenőr KICSI-5).
const AdventCalendar = ADVENT_BUILD_FLAG ? lazy(() => import("@/pages/AdventCalendar")) : null;
// JM7b: a /profile bejelentkezett játékosnál a „kis fiók”, vendégnél (és kikapcsolt flagnél) a régi helyi Profil oldal.
const PlayerAccount = lazy(() => import("@/pages/PlayerAccount"));
// JM7a: játékos belépés (PLAYER_ACCOUNTS flag mögött; kikapcsolva a „nem található” oldal jelenik meg).
const PlayerLogin = lazy(() => import("@/pages/PlayerLogin"));

function LoadingSpinner() {
  // Review #275 (lecke megnyitása): a /preview/ oldal kódjának letöltése alatt is a közös lecke-töltő látszik — így a megnyitás
  // végig egyetlen töltőképernyő (nem „Betöltés…” → „Lecke betöltése…”). HTML/PDF anyagnál a Preview utána a sajátját mutatja.
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/preview/")) return <LessonLoading fullScreen />;
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Betöltés…</p>
      </div>
    </div>
  );
}

function Router() {
  // Lecke megnyitása (2026-10-17-lecke-betoltes, 11.): a világos alap csak a lecke útvonalán; a kezdőlap sötétkékje visszatér.
  const [location] = useLocation();
  useEffect(() => { document.documentElement.classList.toggle("ws-lesson-route", location.startsWith("/preview/")); }, [location]);
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Switch>
        <Route path="/" component={Home} />
        {/* LS-2: a lecke-futtató böngészős mérőoldala. Csak akkor létezik, ha a build
            kifejezetten bekapcsolta (VITE_ENABLE_RUNTIME_PROBE=1) — az éles bundle-ben
            nincs benne. A Playwright a production buildet szolgálja ki, ezért NEM elég
            a `!PROD` feltétel: a kapcsolót a teszt-build állítja be. */}
        {import.meta.env.VITE_ENABLE_RUNTIME_PROBE === "1" && (
          <Route path="/__lesson-runtime-probe" component={LessonRuntimeProbe} />
        )}
        {import.meta.env.VITE_ENABLE_RUNTIME_PROBE === "1" && (
          <Route path="/__coupon-hud-probe" component={CouponHudProbe} />
        )}
        {import.meta.env.VITE_ENABLE_RUNTIME_PROBE === "1" && (
          <Route path="/__studio-panel-probe" component={StudioPanelProbe} />
        )}
        {import.meta.env.VITE_ENABLE_RUNTIME_PROBE === "1" && (
          <Route path="/__admin-tabs-probe" component={AdminTabsProbe} />
        )}
        {import.meta.env.VITE_ENABLE_RUNTIME_PROBE === "1" && (
          <Route path="/__learners-panel-probe" component={LearnersPanelProbe} />
        )}
        {import.meta.env.VITE_ENABLE_RUNTIME_PROBE === "1" && (
          <Route path="/__repair-workbench-probe" component={RepairWorkbenchProbe} />
        )}
        {import.meta.env.VITE_ENABLE_GAME_TEST_HOOKS === "1" && PlayLab && <Route path="/__play-lab" component={PlayLab} />}
        <Route path="/preview/:id" component={Preview} />
        <Route path="/lesson/:id" component={LessonRedirect} />
        <Route path="/materials/pdf/:id" component={PdfView} />
        <Route path="/admin" component={Admin} />
        <Route path="/admin/stats" component={AdminStats} />
        <Route path="/admin/help" component={AdminDocumentation} />
        <Route path="/login" component={Login} />
        {AdventCalendar ? <Route path="/adventi-naptar" component={AdventCalendar} /> : null}
        <Route path="/games" component={Games} />
        <Route path="/games/tsunami-english" component={TsunamiEscapeEnglish} />
        <Route path="/games/word-ladder-hu-en" component={WordLadderHuEn} />
        <Route path="/games/block-craft-quiz" component={BlockCraftQuiz} />
        <Route path="/games/speed-quiz-math" component={SpeedQuizMath} />
        <Route path="/games/brain-rot-steal" component={BrainRotSteal} />
        <Route path="/games/space-asteroid-quiz" component={SpaceAsteroidQuiz} />
        <Route path="/games/tornado-hunter-200" component={TornadoHunter200} />
        <Route path="/games/parbaj" component={DuelOnline} />
        <Route path="/games/parbaj/:kod" component={DuelOnline} />
        <Route path="/profile" component={PlayerAccount} />
        <Route path="/fiok" component={PlayerAccount} />
        <Route path="/belepes" component={PlayerLogin} />
        <Route path="/belepes/link" component={PlayerLogin} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <div className="min-h-screen supports-[height:100dvh]:min-h-dvh">
            <Toaster />
            <LearnerProfileSync />
            <Router />
          </div>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
