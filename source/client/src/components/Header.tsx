import { Code2, Moon, Sun, Shield, Menu, User, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import PushNotificationToggle from "@/components/PushNotificationToggle";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { AuthStatus } from "@/components/AuthStatus";
import { useAuth } from "@/hooks/useAuth";

export default function Header() {
  const [darkMode, setDarkMode] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [location] = useLocation();

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setDarkMode(isDark);

    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleDarkMode = () => {
    // Dark mode mindig aktív marad - sci-fi/gamifikált téma miatt
    // Ne engedjük a light mode-ot
    const newMode = true; // Mindig dark mode
    setDarkMode(newMode);
    document.documentElement.classList.add("dark");
    localStorage.setItem("theme", "dark");
  };

  return (
    <header 
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled 
          ? "py-2 bg-background/80 backdrop-blur-xl border-b border-white/10 dark:border-cyan-500/20 shadow-lg shadow-black/5 dark:shadow-cyan-500/5 supports-[backdrop-filter]:bg-background/60" 
          : "py-4 bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between">
          
          {/* Logo / Brand Area */}
          <Link href="/">
            <div className="flex items-center gap-3 cursor-pointer group">
              <div className="relative">
                <div className="absolute inset-0 bg-cyan-400 rounded-xl blur opacity-20 group-hover:opacity-60 transition-opacity animate-pulse-glow" />
                <div className="relative w-10 h-10 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 rounded-xl flex items-center justify-center overflow-hidden group-hover:-translate-y-1 transition-transform duration-300">
                   <Code2 className="w-6 h-6 text-cyan-400 group-hover:rotate-12 transition-transform" />
                </div>
              </div>
              
              <div className="hidden sm:block">
                <h1 className="text-xl font-bold text-foreground tracking-tight">
                  Web<span className="text-cyan-400">Suli</span>
                </h1>
                <p className="text-[10px] text-cyan-200/60 uppercase tracking-widest font-semibold">
                  Future Education
                </p>
              </div>
            </div>
          </Link>

          {/* Desktop Navigation "Dock" */}
          <div className="flex items-center gap-2">
            
            {/* Shortcuts / Status */}
            <div className={`flex items-center gap-1 sm:gap-2 px-2 py-1 rounded-2xl transition-all ${scrolled ? 'bg-slate-800/50' : ''}`}>
              <AuthStatus />
              
              <div className="h-6 w-px bg-slate-700/50 mx-1" />
              
              <PushNotificationToggle />
              
              <Button
                size="icon"
                variant="ghost"
                onClick={toggleDarkMode}
                className="w-9 h-9 text-slate-400 hover:text-yellow-300 hover:bg-yellow-400/10"
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            </div>

            {/* Admin Action */}
            {user?.isAdmin && (
              <Link href="/admin">
                <Button 
                  variant="secondary"
                  size={isMobile ? "icon" : "default"}
                  className="shadow-purple-500/20"
                >
                  <Shield className="w-4 h-4 sm:mr-2" />
                  {!isMobile && "Adminisztráció"}
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
