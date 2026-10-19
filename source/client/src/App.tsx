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
const Profile = lazy(() => import("@/pages/Profile"));

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
        <Route path="/preview/:id" component={Preview} />
        <Route path="/lesson/:id" component={LessonRedirect} />
        <Route path="/materials/pdf/:id" component={PdfView} />
        <Route path="/admin" component={Admin} />
        <Route path="/admin/stats" component={AdminStats} />
        <Route path="/admin/help" component={AdminDocumentation} />
        <Route path="/login" component={Login} />
        <Route path="/games" component={Games} />
        <Route path="/games/tsunami-english" component={TsunamiEscapeEnglish} />
        <Route path="/games/word-ladder-hu-en" component={WordLadderHuEn} />
        <Route path="/games/block-craft-quiz" component={BlockCraftQuiz} />
        <Route path="/games/speed-quiz-math" component={SpeedQuizMath} />
        <Route path="/games/brain-rot-steal" component={BrainRotSteal} />
        <Route path="/games/space-asteroid-quiz" component={SpaceAsteroidQuiz} />
        <Route path="/games/tornado-hunter-200" component={TornadoHunter200} />
        <Route path="/profile" component={Profile} />
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
