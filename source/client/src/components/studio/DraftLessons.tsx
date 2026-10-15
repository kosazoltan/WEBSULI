import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

/** docs/specs/2026-10-15-admin-tananyag-draft.md — a szerver `OwnerDraft` típusának kliensoldali tükre. */
type OwnerDraft = {
  jobId: string; title: string; subject: string; classroom: number;
  draft: { teachingSections: number; savedBankPackets: number } | null;
  running: boolean; error: string | null; updatedAt: string;
  resumable: boolean; stoppedAt?: string; nextRecovery?: { strategy: string; reason: string };
};

const DRAFTS_KEY = ["/api/studio/drafts"];

/**
 * Tulajdonosi kérés (2026-10-15): a megszakadt gyártás addig elkészült tananyaga az adminfelületen „Tananyag draft” jelzéssel látszik
 * (az éles oldalra nem kerül ki — nincs `html_files` sora), és innen bármikor folytatható a mentett részekből.
 */
export default function DraftLessons() {
  const { toast } = useToast();
  const drafts = useQuery<{ drafts: OwnerDraft[] }>({
    queryKey: DRAFTS_KEY,
    queryFn: () => apiRequest<{ drafts: OwnerDraft[] }>("GET", "/api/studio/drafts"),
    // Futó piszkozatnál a lista magától frissül (a folytatás haladása látszik); különben nem pollozunk.
    refetchInterval: (query) => (query.state.data?.drafts.some((d) => d.running) ? 10_000 : false),
  });
  // A4: a dupla kattintás egyetlen folytatás (az `isPending` csak a következő renderben tiltana).
  const lock = useRef(false);
  // Review #251 (P2): ha a tervező következő foka a teljes újragyártás (a resume végpont ÚJ jobot indít), a gomb ezt mondja, és megerősítést kér.
  const [confirmRemake, setConfirmRemake] = useState<string | null>(null);
  const resume = useMutation({
    mutationFn: (jobId: string) => apiRequest("POST", `/api/studio/jobs/${jobId}/resume`),
    onSuccess: (_data, jobId) => toast(list.find((d) => d.jobId === jobId)?.nextRecovery?.strategy === "remanufacture"
      ? { title: "Újragyártás elindult", description: "Ugyanabból a forrásból új gyártás indult; a régi piszkozat megmarad." }
      : { title: "Folytatás elindult", description: "A gyártás a mentett részekből halad tovább — a kész szakaszok megmaradnak." }),
    onError: (e: Error) => toast({ title: "Nem sikerült folytatni", description: e.message, variant: "destructive" }),
    onSettled: () => { lock.current = false; void queryClient.invalidateQueries({ queryKey: DRAFTS_KEY }); },
  });
  const start = (jobId: string) => {
    if (lock.current) return;
    setConfirmRemake(null);
    lock.current = true;
    resume.mutate(jobId);
  };

  const list = drafts.data?.drafts ?? [];
  if (!list.length) return null;
  return (
    <Card data-testid="draft-lessons">
      <CardHeader>
        <CardTitle className="text-lg">Tananyag draftok</CardTitle>
        <CardDescription>Megszakadt gyártások mentett tananyaga. Nem publikált, az éles oldalon nem látszik; a megszakadt ponttól folytatható.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {list.map((d) => (
          <div key={d.jobId} className="rounded-lg border p-3 space-y-2 min-w-0" data-testid={`draft-item-${d.jobId}`}>
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <Badge variant="secondary" data-testid="draft-badge">Tananyag draft</Badge>
              <span className="font-medium break-words min-w-0">{d.title}</span>
              <span className="text-sm text-muted-foreground">{d.subject}{d.classroom ? ` · ${d.classroom}. osztály` : ""}</span>
            </div>
            {d.draft && (
              <p className="text-sm text-muted-foreground">
                Mentett: {d.draft.teachingSections} fejezetnyi tananyag, {d.draft.savedBankPackets} kész gyakorlócsomag.
              </p>
            )}
            {d.running ? (
              <p className="text-sm flex items-center gap-2" data-testid="draft-running"><Loader2 className="w-4 h-4 animate-spin" /> Folyamatban — a gyártás halad.</p>
            ) : (
              <>
                {/* Az újraindulás szerveroldali üzenete egy másik felület „Újra” gombjára utal — itt a tény elég. */}
                {d.error && <p className="text-sm break-words">Megállt: {d.nextRecovery?.strategy === "restart" ? "a szerver újraindult a gyártás közben." : d.error.length > 220 ? `${d.error.slice(0, 220)}…` : d.error}</p>}
                {d.nextRecovery && <p className="text-sm text-muted-foreground break-words">A program következő lépése: {d.nextRecovery.reason}</p>}
                {d.resumable && d.nextRecovery?.strategy === "remanufacture" ? (
                  confirmRemake === d.jobId ? (
                    <div className="flex flex-wrap items-center gap-2" data-testid={`draft-remake-confirm-${d.jobId}`}>
                      <p className="text-sm basis-full">A mentett részekből nem folytatható: ugyanabból a forrásból teljes, új gyártás indul (modellköltséggel). A régi piszkozat megmarad.</p>
                      <Button size="sm" className="min-h-11" data-testid={`draft-remake-yes-${d.jobId}`} disabled={resume.isPending} onClick={() => start(d.jobId)}>
                        {resume.isPending && resume.variables === d.jobId ? <Loader2 className="w-4 h-4 animate-spin" /> : "Igen, újragyártás"}
                      </Button>
                      <Button size="sm" variant="outline" className="min-h-11" onClick={() => setConfirmRemake(null)}>Mégse</Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="secondary" className="min-h-11" data-testid={`draft-remake-${d.jobId}`} onClick={() => setConfirmRemake(d.jobId)}>
                      Újragyártás ugyanabból a forrásból
                    </Button>
                  )
                ) : d.resumable ? (
                  <Button size="sm" className="min-h-11" data-testid={`draft-resume-${d.jobId}`} disabled={resume.isPending} onClick={() => start(d.jobId)}>
                    {resume.isPending && resume.variables === d.jobId ? <Loader2 className="w-4 h-4 animate-spin" /> : "Folytatás a megszakadt ponttól"}
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground" data-testid="draft-not-resumable">Ez a piszkozat a mentett részekből nem folytatható.</p>
                )}
              </>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
