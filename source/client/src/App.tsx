import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import { lazy, Suspense } from "react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// Lazy load heavy components for better code splitting
const Preview = lazy(() => import("@/pages/Preview"));
const PdfView = lazy(() => import("@/pages/pdf-view"));
const Admin = lazy(() => import("@/pages/admin"));
const AdminStats = lazy(() => import("@/pages/AdminStats"));
const AdminDocumentation = lazy(() => import("@/pages/AdminDocumentation"));

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-muted-foreground">Betöltés...</p>
      </div>
    </div>
  );
}

function Router() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
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
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <div className="min-h-screen bg-background">
            <Toaster />
            <Router />
          </div>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
