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
          variant="default"
          size="sm"
          onClick={handleLogin}
          data-testid="button-login"
        >
          <LogIn className="h-4 w-4 mr-2" />
          Bejelentkezés
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
        <Badge variant="default" className="gap-1" data-testid="badge-admin">
          <Shield className="h-3 w-3" />
          Admin
        </Badge>
      )}
      <span className="text-sm text-muted-foreground" data-testid="text-user-name">
        {getDisplayName()}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleLogout}
        data-testid="button-logout-action"
      >
        <LogOut className="h-4 w-4 mr-2" />
        Kijelentkezés
      </Button>
    </div>
  );
}
