import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Preview from "@/pages/Preview";
import PdfView from "@/pages/pdf-view";
import Admin from "@/pages/admin";
import AdminStats from "@/pages/AdminStats";
import AdminDocumentation from "@/pages/AdminDocumentation";
import Login from "@/pages/Login";
import { ChemicalBackground } from "@/components/ChemicalBackground";
import { useEffect } from "react";

function Router() {
  // Platform is fully public - no authentication required for any page
  return (
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
        <ChemicalBackground />
        <div className="relative z-10 min-h-screen">
          <Toaster />
          <Router />
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
