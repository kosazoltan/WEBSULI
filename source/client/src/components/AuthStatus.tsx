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
      <div className="flex flex-col items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogin}
          className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-950/30"
          data-testid="button-login"
        >
          <LogIn className="h-4 w-4 mr-2" />
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
    <div className="flex items-center gap-2">
      {isAdmin && (
        <div className="hidden sm:flex items-center justify-center w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/50 text-purple-300" title="Adminisztrátor">
          <Shield className="w-3 h-3" />
        </div>
      )}
      
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:border-cyan-500/30 transition-colors">
         <div className="w-5 h-5 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-500 flex items-center justify-center text-[10px] font-bold text-white shadow-lg shadow-cyan-500/20">
            {getDisplayName().charAt(0)}
         </div>
         <span className="text-xs font-medium text-slate-200 hidden sm:inline-block">
            {getDisplayName()}
         </span>
         <button 
            onClick={handleLogout}
            className="ml-1 p-1 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
            title="Kijelentkezés"
         >
            <LogOut className="w-3.5 h-3.5" />
         </button>
      </div>
    </div>
  );
}
