import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BellRing, Send } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type Planned = { email: string; studentName: string; grade: number; materialId: string; title: string; topic: string | null; url: string };
type Preview = { day: string; schoolDay: boolean; items: Planned[] };
type RunResult = { day: string; skipped?: string; sent: number; failed: number; duplicate: number };

/**
 * „Mai emlékeztetők” (docs/specs/2026-10-18-napi-emlekezteto.md): a nevesített tanulók mai anyaga küldés nélkül, és kézi
 * „Küldés most” (ugyanazzal az ismétlésvédelemmel: címenként naponta egy levél).
 */
export default function DailyReminderCard() {
  const { toast } = useToast();
  const [confirm, setConfirm] = useState(false);
  const preview = useQuery<Preview>({ queryKey: ["/api/admin/daily-reminders/preview"] });
  const run = useMutation({
    mutationFn: async () => apiRequest<RunResult>("POST", "/api/admin/daily-reminders/run"),
    onSuccess: (r) => {
      setConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/daily-reminders/preview"] });
      toast({ title: r.skipped ? `Ma nincs küldés: ${r.skipped}` : "Emlékeztetők kiküldve", description: r.skipped ? undefined : `Elküldve: ${r.sent} · hiba: ${r.failed} · ma már korábban kiküldve: ${r.duplicate}` });
    },
    onError: (error: Error) => toast({ title: "Hiba", description: error.message, variant: "destructive" }),
  });
  const data = preview.data;

  return (
    <Card className="mt-4" data-testid="daily-reminder-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BellRing className="h-5 w-5 text-amber-600" aria-hidden="true" /> Mai emlékeztetők</CardTitle>
        <CardDescription>
          A nevesített tanulók minden tanítási reggel 6:45-kor e-mailt kapnak a tanmenet szerint aktuális tananyagukkal; a levélből
          egy kattintással megnyílik. Címenként naponta legfeljebb egy levél megy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {preview.isLoading ? <p className="text-sm text-muted-foreground">Betöltés…</p> : preview.isError ? (
          <p className="text-sm text-destructive">Az előnézet nem tölthető be.</p>
        ) : data ? (
          <>
            <p className="text-sm">
              {data.day} · {data.schoolDay ? <Badge variant="secondary">tanítási nap</Badge> : <Badge variant="outline">ma nincs tanítás — nem megy levél</Badge>}
            </p>
            {data.items.length ? (
              <ul className="space-y-1.5" data-testid="daily-reminder-preview">
                {data.items.map((item) => (
                  <li key={item.email} className="text-sm flex flex-wrap items-center gap-x-2 gap-y-0.5 border rounded-md px-3 py-2">
                    <span className="font-semibold">{item.studentName}</span>
                    <Badge variant="secondary">{item.grade}. osztály</Badge>
                    <span className="text-muted-foreground">{item.email}</span>
                    <a href={item.url} target="_blank" rel="noreferrer" className="basis-full text-primary underline underline-offset-2">{item.title}</a>
                    {item.topic && <span className="basis-full text-xs text-muted-foreground">Tanmenet: {item.topic}</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Nincs nevesített, aktív cím (vagy az évfolyamán nincs anyag).</p>}
            <div className="flex flex-wrap gap-2">
              {confirm ? (
                <>
                  <Button onClick={() => run.mutate()} disabled={run.isPending} data-testid="button-daily-reminder-confirm">
                    <Send className="h-4 w-4 mr-1.5" aria-hidden="true" /> {run.isPending ? "Küldés…" : `Igen, küldd el (${data.items.length})`}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirm(false)}>Mégse</Button>
                </>
              ) : (
                <Button variant="outline" onClick={() => setConfirm(true)} disabled={!data.schoolDay || !data.items.length} data-testid="button-daily-reminder-run">
                  <Send className="h-4 w-4 mr-1.5" aria-hidden="true" /> Küldés most
                </Button>
              )}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
