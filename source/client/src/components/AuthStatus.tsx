import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogIn, LogOut, Shield } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

import { useLocation } from "wouter";

export function AuthStatus() {
  const { user, isLoading, isAuthenticated, isAdmin } = useAuth();
  const [, setLocation] = useLocation();

  const handleLogout = async () => {
    // Clear auth cache - ONLY set to null, don't invalidate (avoid refetch race condition)
    queryClient.setQueryData(["/api/auth/user"], null);

    // Navigate to logout endpoint (backend will destroy session and redirect)
    // Actually, backend now returns 200, so we should handle fetch here
    await fetch("/api/logout", { method: "POST" });
    window.location.reload();
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  const handleLogin = () => {
    setLocation("/login");
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center">
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogin}
          className="h-7 px-2 text-xs gap-1 border-orange-300 text-orange-700 hover:bg-orange-100 dark:border-orange-700 dark:text-orange-300 dark:hover:bg-orange-900/30"
          data-testid="button-login"
        >
          <LogIn className="h-3 w-3" />
          Belépés
        </Button>
      </div>
    );
  }

  // Get display name based on email
  const getDisplayName = () => {
    if (!user || !('email' in user)) return 'Unknown';

    const email = user.email;
    if (email === 'kosa.zoltan.ebc@gmail.com') return 'Z';
    if (email === 'mszilva78@gmail.com') return 'Sz';

    return 'Admin';
  };

  return (
    <div className="flex items-center gap-1.5">
      {isAdmin && (
        <div className="hidden sm:flex items-center justify-center w-5 h-5 rounded-full bg-orange-500/20 border border-orange-500/50 text-orange-600 dark:text-orange-400" title="Adminisztrátor">
          <Shield className="w-3 h-3" />
        </div>
      )}

      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-orange-100 border border-orange-300 dark:bg-orange-950/40 dark:border-orange-700 transition-colors">
         <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center text-[10px] font-bold text-white">
            {getDisplayName().charAt(0)}
         </div>
         <span className="text-xs font-medium text-orange-800 dark:text-orange-200 hidden sm:inline-block">
            {getDisplayName()}
         </span>
         <button
            onClick={handleLogout}
            className="ml-0.5 p-0.5 hover:bg-orange-200 dark:hover:bg-orange-800 rounded text-orange-500 hover:text-red-500 transition-colors"
            title="Kijelentkezés"
         >
            <LogOut className="w-3 h-3" />
         </button>
      </div>
    </div>
  );
}
