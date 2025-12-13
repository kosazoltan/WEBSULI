import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import { useEffect, lazy, Suspense } from "react";

// Lazy load heavy components for better code splitting
const Preview = lazy(() => import("@/pages/Preview"));
const PdfView = lazy(() => import("@/pages/pdf-view"));
const Admin = lazy(() => import("@/pages/admin"));
const AdminStats = lazy(() => import("@/pages/AdminStats"));
const AdminDocumentation = lazy(() => import("@/pages/AdminDocumentation"));

function Router() {
  // Platform is fully public - no authentication required for any page
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Betöltés...</div>}>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/preview/:id" component={Preview} />
        <Route path="/materials/pdf/:id" component={PdfView} />
        <Route path="/admin" component={Admin} />
        <Route path="/admin/stats" component={AdminStats} />
        <Route path="/admin/help" component={AdminDocumentation} />
        <Route path="/login" component={Login} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
    }
  }, []);

  const APP_VERSION = "2.0.1"; // Force new build hash

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="relative z-10 min-h-screen">
          <Toaster />
          <Router />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
