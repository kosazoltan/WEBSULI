import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { hu } from "date-fns/locale";
import { GraduationCap, Mail, Trophy, Star, Flame, RefreshCw, Send, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/**
 * Szülő-dashboard panel — a tanulók játék-statisztikáját jeleníti meg
 * az utolsó N napra (alapértelmezett 7 nap). A `/api/admin/parent-dashboard`
 * endpoint-ról tölt; a Google-bejelentkezett tanulók `gameScores` táblájából
 * jön az adat (név + email + per-játék breakdown).
 *
 * További funkció: "Heti email küldése" gomb, ami minden tanulónak
 * (vagy az `extra_email_addresses`-en szereplő email-cmnek) elküldi az
 * összefoglalót.
 */

type GameStats = {
  totalXp: number;
  gamesPlayed: number;
  bestStreak: number;
  bestRunXp: number;
};

type Student = {
  userId: string;
  name: string;
  email: string | null;
  totalXp: number;
  totalGames: number;
  bestStreak: number;
  lastActivity: string;
  games: Record<string, GameStats>;
};

type DashboardResponse = {
  days: number;
  cutoff: string;
  students: Student[];
  totalStudents: number;
  totalXp: number;
  totalGames: number;
};

const GAME_LABELS: Record<string, { name: string; emoji: string }> = {
  "tsunami-english": { name: "Szökőár", emoji: "🌊" },
  "word-ladder-hu-en": { name: "Szólétra", emoji: "📚" },
  "block-craft-quiz": { name: "Kockavadász", emoji: "🧱" },
  "speed-quiz-math": { name: "Gyors matek", emoji: "⚡" },
  "brain-rot-steal": { name: "Brain Rot", emoji: "🧠" },
  "space-asteroid-quiz": { name: "Aszteroida", emoji: "🚀" },
};

export default function ParentDashboardPanel() {
  const { toast } = useToast();
  const [days, setDays] = useState(7);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<DashboardResponse>({
    queryKey: ["/api/admin/parent-dashboard", days],
    queryFn: async () => {
      const r = await fetch(`/api/admin/parent-dashboard?days=${days}`, { credentials: "include" });
      if (!r.ok) throw new Error("Dashboard betöltési hiba");
      return r.json();
    },
    refetchOnWindowFocus: false,
  });

  const sendWeeklyMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/admin/parent-dashboard/send-weekly", { days });
    },
    onSuccess: (raw: unknown) => {
      const result = raw as { sent?: number; failed?: number; recipients?: number };
      toast({
        title: "Heti email kiküldve",
        description: `${result.sent ?? 0} sikeres / ${result.failed ?? 0} hibás (${result.recipients ?? 0} címzett).`,
      });
    },
    onError: (error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      toast({
        title: "Email küldés hiba",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-purple-500" />
                Szülő-dashboard
              </CardTitle>
              <CardDescription>
                A Google-lal bejelentkezett tanulók játék-statisztikája az utolsó {days} napban.
                Csak azok a tanulók jelennek meg, akik bejelentkeztek és játszottak az időszakban.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={days}
                onChange={(e) => setDays(parseInt(e.target.value, 10))}
                className="h-8 rounded border border-input bg-background px-2 text-xs"
                data-testid="select-dashboard-days"
              >
                <option value={1}>Mai nap</option>
                <option value={7}>Heti</option>
                <option value={14}>2 hét</option>
                <option value={30}>30 nap</option>
                <option value={90}>3 hónap</option>
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isFetching}
                className="gap-1.5"
                data-testid="button-refresh-dashboard"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
                Frissítés
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => sendWeeklyMutation.mutate()}
                disabled={sendWeeklyMutation.isPending || !data || data.students.length === 0}
                className="gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
                data-testid="button-send-weekly-email"
              >
                <Send className="w-3.5 h-3.5" />
                {sendWeeklyMutation.isPending ? "Küldés…" : "Heti email küldése"}
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {isLoading && (
        <Card>
          <CardContent className="py-6 space-y-3">
            <Skeleton className="h-4 w-72" />
            <Skeleton className="h-4 w-56" />
          </CardContent>
        </Card>
      )}

      {isError && !isLoading && (
        <Card>
          <CardContent className="py-6 text-destructive">Hiba a dashboard betöltésekor.</CardContent>
        </Card>
      )}

      {data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Összesítő
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="Aktív tanuló" value={data.totalStudents} icon={<GraduationCap className="w-3.5 h-3.5 text-purple-500" />} />
                <Stat label="Összes XP" value={data.totalXp} icon={<Star className="w-3.5 h-3.5 text-amber-500" />} />
                <Stat label="Összes futás" value={data.totalGames} icon={<Trophy className="w-3.5 h-3.5 text-cyan-500" />} />
              </div>
              <p className="text-[10px] text-muted-foreground mt-3">
                Időszak: <strong>{format(new Date(data.cutoff), "yyyy. MM. dd. HH:mm", { locale: hu })}</strong> óta
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Tanulók (XP szerint csökkenő)</CardTitle>
            </CardHeader>
            <CardContent>
              {data.students.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nincs aktív tanuló az időszakban.</p>
              ) : (
                <div className="space-y-2">
                  {data.students.map((s) => (
                    <div
                      key={s.userId}
                      className="border rounded-md p-3"
                      data-testid={`student-row-${s.userId}`}
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
                        <div className="min-w-0">
                          <p className="font-bold text-sm">{s.name}</p>
                          {s.email && (
                            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {s.email}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1">
                            Utolsó aktivitás: {formatDistanceToNow(new Date(s.lastActivity), { locale: hu, addSuffix: true })}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100 gap-1 border-amber-300/50">
                            <Star className="w-3 h-3" /> {s.totalXp.toLocaleString("hu-HU")} XP
                          </Badge>
                          <Badge variant="outline" className="gap-1">
                            <Trophy className="w-3 h-3" /> {s.totalGames} futás
                          </Badge>
                          <Badge variant="outline" className="gap-1 border-orange-300/60 text-orange-600 dark:text-orange-300">
                            <Flame className="w-3 h-3" /> {s.bestStreak}
                          </Badge>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {Object.entries(s.games).map(([gameId, g]) => {
                          const meta = GAME_LABELS[gameId];
                          return (
                            <div key={gameId} className="rounded border border-muted bg-muted/30 p-2 text-[11px]">
                              <p className="font-semibold flex items-center gap-1">
                                <span>{meta?.emoji ?? "🎮"}</span>
                                <span className="truncate">{meta?.name ?? gameId}</span>
                              </p>
                              <p className="text-muted-foreground">XP: <strong>{g.totalXp}</strong> · Run: {g.gamesPlayed}</p>
                              <p className="text-muted-foreground">Best: {g.bestRunXp} · Streak: {g.bestStreak}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
        {icon}
        <span>{label}</span>
      </div>
      <p className="text-xl font-extrabold text-foreground tabular-nums mt-0.5">{value.toLocaleString("hu-HU")}</p>
    </div>
  );
}
