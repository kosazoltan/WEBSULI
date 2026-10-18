import { useQuery, useMutation } from "@tanstack/react-query";
import { Copy, RefreshCw, Send, ShieldOff, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LearnerReport } from "@shared/learner-report";

/**
 * Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S4): tanulónként az utolsó aktivitás, a heti aktív napok és az utolsó
 * eredmények; párosító link (pl. közös tablethez) és a párosítás visszavonása.
 */
type LearnerRow = { id: string; name: string; grade: number; emails: number; report: LearnerReport; pairLink: string | null };

export default function LearnersPanel() {
  const { toast } = useToast();
  const { data, isLoading, refetch, isFetching } = useQuery<LearnerRow[]>({ queryKey: ["/api/admin/learners"] });
  const rotate = useMutation({
    mutationFn: (id: string) => apiRequest<{ pairLink: string | null }>("POST", `/api/admin/learners/${id}/rotate`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/learners"] });
      toast({ title: "Párosítás visszavonva", description: "A régi linkek és eszközök érvénytelenek; az új link másolható." });
    },
    onError: () => toast({ title: "A visszavonás nem sikerült", variant: "destructive" }),
  });
  const weekly = useMutation({
    mutationFn: () => apiRequest<{ sent: number }>("POST", "/api/admin/learners/weekly-summary"),
    onSuccess: (r) => toast({ title: "Heti összefoglaló elküldve", description: `${r.sent} címzettnek.` }),
    onError: () => toast({ title: "A heti összefoglaló nem ment el", variant: "destructive" }),
  });
  const copy = async (link: string | null) => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Párosító link másolva", description: "Nyisd meg a tanuló eszközén — utána az eszköz a tanulóé." });
    } catch {
      toast({ title: "A másolás nem sikerült", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-3" data-testid="learners-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold flex items-center gap-2"><UserRound className="h-5 w-5" /> Tanulók</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}><RefreshCw className="h-4 w-4 mr-1" /> Frissítés</Button>
          <Button size="sm" onClick={() => weekly.mutate()} disabled={weekly.isPending} data-testid="learners-weekly"><Send className="h-4 w-4 mr-1" /> Heti összefoglaló most</Button>
        </div>
      </div>
      {isLoading && <Skeleton className="h-40 w-full" />}
      {data && data.length === 0 && <p className="text-sm text-muted-foreground">Még nincs tanuló. Az „E-mail címzettek” fülön a címhez rendelt név hozza létre.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {data?.map(l => (
          <Card key={l.id} data-testid={`learner-${l.id}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex flex-wrap items-center gap-2">{l.name} <Badge variant="secondary">{l.grade}. évfolyam</Badge></CardTitle>
              <CardDescription>
                Utolsó tevékenység: {l.report.lastActive ?? "még nincs"} · aktív napok (7 nap): {l.report.activeDays7} · megnyitott anyagok: {l.report.views7}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {l.report.results.length ? (
                <ul className="text-sm space-y-1">
                  {l.report.results.map((r, i) => (
                    <li key={i} className="flex justify-between gap-2"><span className="truncate">{r.at} — {r.title}</span><strong>{r.percent === null ? "—" : `${r.percent}%`}</strong></li>
                  ))}
                </ul>
              ) : <p className="text-sm text-muted-foreground">Az elmúlt 30 napban nincs beküldött eredmény.</p>}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => void copy(l.pairLink)} disabled={!l.pairLink}><Copy className="h-4 w-4 mr-1" /> Párosító link másolása</Button>
                <Button variant="outline" size="sm" disabled={rotate.isPending}
                  onClick={() => { if (window.confirm(`${l.name}: minden párosított eszköz és a régi linkek érvénytelenné válnak. Folytatod?`)) rotate.mutate(l.id); }}>
                  <ShieldOff className="h-4 w-4 mr-1" /> Párosítás visszavonása
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
