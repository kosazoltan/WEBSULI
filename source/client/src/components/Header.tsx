import { BookOpen, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import PushNotificationToggle from "@/components/PushNotificationToggle";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { AuthStatus } from "@/components/AuthStatus";
import { useAuth } from "@/hooks/useAuth";

export default function Header() {
  const [scrolled, setScrolled] = useState(false);
  const isMobile = useIsMobile();
  const { user } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b transition-all duration-200 ${
        scrolled
          ? "bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 shadow-sm"
          : "bg-background"
      }`}
    >
      <div className="container flex h-16 items-center justify-between">
        {/* Logo */}
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold text-foreground">
                WebSuli
              </h1>
              <p className="text-xs text-muted-foreground -mt-1">
                Tananyagok
              </p>
            </div>
          </div>
        </Link>

        {/* Right side actions */}
        <div className="flex items-center gap-2">
          <AuthStatus />

          <div className="h-6 w-px bg-border mx-1 hidden sm:block" />

          <PushNotificationToggle />

          {/* Admin button */}
          {user?.isAdmin && (
            <Link href="/admin">
              <Button
                variant="outline"
                size={isMobile ? "icon" : "default"}
                data-testid="button-admin"
              >
                <Shield className="w-4 h-4 sm:mr-2" />
                {!isMobile && "Admin"}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
