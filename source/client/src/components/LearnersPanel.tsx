import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Copy, RefreshCw, Save, Send, ShieldOff, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { interestsFromText, NEWSLETTER_LIMITS } from "@shared/newsletter";
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
type LearnerRow = { id: string; name: string; grade: number; emails: number; report: LearnerReport; pairLink: string | null; interests: string[]; newsletter: boolean };

/** „Mai felfedezés” hírlevél (docs/specs/2026-10-19-mai-felfedezes-hirlevel.md, S1): érdeklődés + napi hírlevél kapcsoló. */
function NewsletterPrefs({ learner }: { learner: LearnerRow }) {
  const { toast } = useToast();
  const [text, setText] = useState(learner.interests.join(", "));
  const [enabled, setEnabled] = useState(learner.newsletter);
  const save = useMutation({
    mutationFn: () => apiRequest<{ interests: string[]; newsletter: boolean }>("PATCH", `/api/admin/learners/${learner.id}`, { interests: interestsFromText(text), newsletter: enabled }),
    // Review #312: a mentett (szerveroldali) érték a lista frissítésével jön vissza — a szerkesztő a kulcsa miatt újraindul vele;
    // a válasz nem írja felül a mentés közbeni bevitelt (közben a mező és a kapcsoló tiltott).
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/learners"] });
      if (res.newsletter && !res.interests.length) toast({ title: "Mentve — de érdeklődés nélkül nem megy hírlevél", description: "Adj meg legalább egy érdeklődési kört.", variant: "destructive" });
      else toast({ title: "Mentve", description: res.newsletter ? "A napi felfedezés-hírlevél 16:00-kor megy." : "A hírlevél kikapcsolva." });
    },
    onError: (error) => toast({ title: "A mentés nem sikerült", description: error instanceof Error ? error.message : undefined, variant: "destructive" }),
  });
  return (
    <div className="space-y-2 rounded-md border p-2" data-testid={`learner-newsletter-${learner.id}`}>
      <label className="text-sm font-medium" htmlFor={`interests-${learner.id}`}>Érdeklődés (vesszővel elválasztva, legfeljebb {NEWSLETTER_LIMITS.tags})</label>
      <Input id={`interests-${learner.id}`} value={text} onChange={(e) => setText(e.target.value)} disabled={save.isPending} placeholder="pl. repülők, történelem, elektromosság" />
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={enabled} onCheckedChange={setEnabled} disabled={save.isPending} aria-label="Napi felfedezés-hírlevél" />
        Napi felfedezés-hírlevél 16:00-kor
      </label>
      <Button size="sm" variant="outline" onClick={() => save.mutate()} disabled={save.isPending}><Save className="h-4 w-4 mr-1" /> Mentés</Button>
    </div>
  );
}

export default function LearnersPanel() {
  const { toast } = useToast();
  const { data, isLoading, refetch, isFetching } = useQuery<LearnerRow[]>({ queryKey: ["/api/admin/learners"] });
  const rotate = useMutation({
    mutationFn: (id: string) => apiRequest<{ pairLink: string | null }>("POST", `/api/admin/learners/${id}/rotate`),
    onSuccess: (res, id) => {
      // Review #304: az új link azonnal a gyorsítótárba kerül — a másolás gomb ne a már érvénytelen linket adja.
      queryClient.setQueryData<LearnerRow[]>(["/api/admin/learners"], (rows) => rows?.map(r => (r.id === id ? { ...r, pairLink: res.pairLink } : r)));
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
        <div className="flex flex-wrap gap-2">
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
              ) : <p className="text-sm text-muted-foreground">Még nincs beküldött eredmény.</p>}
              {/* Review #312: a kulcs a szerver értéke — frissítés vagy más admin módosítása után a szerkesztő azzal indul újra. */}
              <NewsletterPrefs key={`${l.id}:${l.interests.join("\u0001")}:${l.newsletter}`} learner={l} />
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
