import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gamepad2, Loader2, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  conceptStatRows,
  quizExportDisabledReason,
  type ConceptStat,
} from "@shared/studio-ui";

/**
 * LS-5b — the feedback panel of a FINISHED lesson (board #156).
 *
 * Three things, one card: the per-concept results (from concept-stats), a
 * "javítsd ezt a fogalmat" button per row (fix-concept), and the quiz export
 * to a game's question bank. The panel renders only for a done job with a
 * lesson id — the visibility rule lives in shared/studio-ui.ts.
 *
 * The weak threshold mirrors the server's default (0.7, min 3 measurements);
 * the server recomputes on every call, the client only displays.
 */

const WEAK_THRESHOLD = 0.7;

type GameItem = { id: string; title: string };

export function FeedbackPanel({ lessonId }: { lessonId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [gameId, setGameId] = useState<string>("");

  const { data: statsData, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useQuery<{ stats: ConceptStat[] }>({
    queryKey: ["/api/studio/lessons", lessonId, "concept-stats"],
    queryFn: () => apiRequest("GET", `/api/studio/lessons/${lessonId}/concept-stats`),
  });

  const { data: gamesData } = useQuery<GameItem[]>({
    queryKey: ["/api/games/catalog"],
    queryFn: () => apiRequest("GET", "/api/games/catalog"),
  });

  const fixConcept = useMutation({
    mutationFn: (conceptId: string) =>
      apiRequest<{ message: string }>("POST", `/api/studio/lessons/${lessonId}/fix-concept`, { conceptId }),
    onSuccess: (r) => {
      toast({ title: "Fogalom javítva", description: r.message });
      void queryClient.invalidateQueries({ queryKey: ["/api/studio/lessons", lessonId, "concept-stats"] });
    },
    onError: (e: Error) =>
      toast({ title: "A javítás nem futott le", description: e.message, variant: "destructive" }),
  });

  const exportQuiz = useMutation({
    mutationFn: () =>
      apiRequest<{ exported: number }>("POST", `/api/studio/lessons/${lessonId}/export-quiz`, { gameId }),
    onSuccess: (r) =>
      toast({ title: "Kvíz exportálva", description: `${r.exported} kérdés került a játék bankjába.` }),
    onError: (e: Error) =>
      toast({ title: "Az export nem futott le", description: e.message, variant: "destructive" }),
  });

  const stats = statsData?.stats ?? [];
  const rows = conceptStatRows(stats, WEAK_THRESHOLD);
  const exportBlocked = quizExportDisabledReason(gameId, stats);

  return (
    <Card data-testid="feedback-panel">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="w-4 h-4 text-amber-600" />
          Visszacsatolás — fogalmankénti eredmények
        </CardTitle>
        <CardDescription className="text-xs">
          A Próbák eredménye fogalmanként. A gyenge fogalmat a szerző célzottan újraírja —
          minden más blokk változatlan marad. A kérdések játék-bankba is exportálhatók.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {statsLoading && <Loader2 className="w-4 h-4 animate-spin" data-testid="feedback-loading" />}

        {/* Audit 2026-09-05 (E): a failed request is NOT "no data yet" — say so, offer retry. */}
        {statsError && (
          <div className="rounded border border-red-300 bg-red-50 dark:bg-red-950/40 p-3 space-y-2" data-testid="feedback-error">
            <p className="text-sm text-red-700 dark:text-red-300">
              A fogalom-statisztika nem tölthető be.
            </p>
            <Button size="sm" variant="outline" className="min-h-11" onClick={() => void refetchStats()}>
              Újra
            </Button>
          </div>
        )}

        {!statsLoading && !statsError && rows.length === 0 && (
          <p className="text-sm text-muted-foreground" data-testid="feedback-empty">
            Ehhez a leckéhez még nincs rögzített fogalom-eredmény — a gyerekek Próba-válaszaiból gyűlik.
          </p>
        )}

        {rows.length > 0 && (
          <ul className="space-y-2" data-testid="concept-stat-list">
            {rows.map((row) => (
              <li key={row.conceptId} className="flex flex-wrap items-center gap-2">
                <Badge variant={row.weak ? "destructive" : "outline"}>{row.label}</Badge>
                {row.weak && <span className="text-xs text-red-600">gyenge</span>}
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-9 gap-1"
                  disabled={fixConcept.isPending}
                  onClick={() => fixConcept.mutate(row.conceptId)}
                  data-testid={`fix-concept-${row.conceptId}`}
                >
                  {fixConcept.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wrench className="w-3 h-3" />}
                  Javítsd ezt a fogalmat
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Gamepad2 className="w-4 h-4 text-muted-foreground" />
          <Select value={gameId} onValueChange={setGameId}>
            <SelectTrigger className="min-h-11 w-56" data-testid="quiz-export-game">
              <SelectValue placeholder="Válassz játékot…" />
            </SelectTrigger>
            <SelectContent>
              {(gamesData ?? []).map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="min-h-11 gap-1"
            disabled={exportBlocked !== null || exportQuiz.isPending}
            onClick={() => exportQuiz.mutate()}
            data-testid="quiz-export-button"
          >
            {exportQuiz.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Gamepad2 className="w-4 h-4" />}
            Kvíz a játékba
          </Button>
          {exportBlocked && <span className="text-xs text-muted-foreground">{exportBlocked}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
