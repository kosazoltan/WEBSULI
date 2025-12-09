import { Code2, Moon, Sun, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import PushNotificationToggle from "@/components/PushNotificationToggle";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { AuthStatus } from "@/components/AuthStatus";
import { useAuth } from "@/hooks/useAuth";

export default function Header() {
  const [darkMode, setDarkMode] = useState(false);
  const isMobile = useIsMobile();
  const { user } = useAuth();

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setDarkMode(isDark);
  }, []);

  const toggleDarkMode = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  return (
    <header className="border-b bg-card">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 py-3 md:py-4">
        {/* Mobil: Kompakt header logó + navigáció */}
        {isMobile ? (
          <>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                  <Code2 className="w-5 h-5 text-primary-foreground" />
                </div>
                <h1 className="text-base font-bold text-foreground truncate">Anyagok Profiknak</h1>
              </div>
              <div className="flex items-center gap-1">
                <PushNotificationToggle />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={toggleDarkMode}
                  data-testid="button-theme-toggle"
                >
                  {darkMode ? (
                    <Sun className="w-4 h-4" />
                  ) : (
                    <Moon className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
            
            <div className="flex flex-col gap-2 w-full">
              <AuthStatus />
              {user?.isAdmin && (
                <Link href="/admin" className="w-full">
                  <Button 
                    variant="default"
                    size="lg"
                    className="w-full min-h-[2.75rem] py-3"
                    data-testid="button-admin-panel"
                  >
                    <Shield className="w-5 h-5 mr-2" />
                    Admin Panel
                  </Button>
                </Link>
              )}
            </div>
          </>
        ) : (
          /* Desktop: Teljes header admin gombokkal */
          <>
            <div className="flex items-center justify-between gap-2 sm:gap-4 mb-3">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                  <Code2 className="w-6 h-6 text-primary-foreground" />
                </div>
                <h1 className="text-base sm:text-xl font-bold text-foreground truncate">Anyagok Profiknak</h1>
              </div>
              <div className="flex items-center gap-2">
                <AuthStatus />
                <PushNotificationToggle />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={toggleDarkMode}
                  data-testid="button-theme-toggle"
                >
                  {darkMode ? (
                    <Sun className="w-5 h-5" />
                  ) : (
                    <Moon className="w-5 h-5" />
                  )}
                </Button>
              </div>
            </div>
            
            {user?.isAdmin && (
              <div className="flex items-center justify-center gap-2 sm:gap-3">
                <Link href="/admin">
                  <Button 
                    variant="default"
                    size="sm"
                    data-testid="button-admin-panel"
                  >
                    <Shield className="w-4 h-4 mr-2" />
                    Admin Panel
                  </Button>
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </header>
  );
}
