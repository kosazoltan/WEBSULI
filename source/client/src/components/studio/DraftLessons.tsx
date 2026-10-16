import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CreationProgress } from "./CreationProgress";

/** docs/specs/2026-10-15-admin-tananyag-draft.md + 2026-10-16-draft-kezeles.md — a szerver `OwnerDraft` típusának kliensoldali tükre. */
type OwnerDraft = {
  jobId: string; title: string; subject: string; classroom: number;
  draft: { teachingSections: number; savedBankPackets: number } | null;
  running: boolean; error: string | null; updatedAt: string; step: string; ownerless: boolean; hasPublished: boolean;
  resumable: boolean; stoppedAt?: string; nextRecovery?: { strategy: string; reason: string };
};

type Action = "resume" | "remake" | "discard" | "discard-published";
const DRAFTS_KEY = ["/api/studio/drafts"];

/** D3: a megállt piszkozat továbblépése — a mentett részekből folytatható → Folytatás; különben (vagy gazdátlanul) → teljes újragyártás. */
const nextStepOf = (d: OwnerDraft): "resume" | "remake" =>
  d.resumable && !d.ownerless && d.nextRecovery?.strategy !== "remanufacture" ? "resume" : "remake";

const CONFIRM_TEXT: Record<Exclude<Action, "resume">, string> = {
  remake: "Ugyanabból a forrásból teljes, új gyártás indul (modellköltséggel). A régi piszkozat megmarad, de a listából kikerül.",
  discard: "A piszkozat törlődik a listából, és a program sem folytatja. (Az adat visszaállítható, nem végleges törlés.)",
  "discard-published": "Minden olyan piszkozat törlődik, amelynek forrásából már van kész, közzétett tananyag.",
};

/**
 * Tulajdonosi kérések (2026-10-15, 2026-10-16): a megszakadt gyártás tananyaga az adminfelületen „Tananyag draft” jelzéssel látszik (az éles
 * oldalra nem kerül ki), minden piszkozat törölhető és továbbvihető (folytatás vagy újragyártás), és a futó gyártás haladása a három készítési
 * szakasszal látszik.
 */
export default function DraftLessons() {
  const { toast } = useToast();
  // Review #255 (P2): folytatás / újragyártás után az új futás workflow-ja a 202-es válasz UTÁN jön létre — egy rövid ablakig akkor is
  // frissítünk, ha még nem látszik futó tétel (különben a haladás csak kézi frissítéssel jelenne meg).
  const [followUntil, setFollowUntil] = useState(0);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (followUntil <= Date.now()) return;
    const t = setTimeout(() => setTick((n) => n + 1), followUntil - Date.now() + 50);
    return () => clearTimeout(t);
  }, [followUntil]);
  const drafts = useQuery<{ drafts: OwnerDraft[]; total?: number; redundant?: number }>({
    queryKey: DRAFTS_KEY,
    queryFn: () => apiRequest<{ drafts: OwnerDraft[]; total?: number; redundant?: number }>("GET", "/api/studio/drafts"),
    // D4: amíg van futó tétel (vagy egy indítás utáni követési ablak tart), a lista 5 másodpercenként frissül. Hibatűrő: váratlan alakú válasznál nincs pollozás.
    refetchInterval: (query) => (followUntil > Date.now() || (Array.isArray(query.state.data?.drafts) && query.state.data.drafts.some((d) => d.running)) ? 5_000 : false),
  });
  // A dupla kattintás egyetlen kérés (az `isPending` csak a következő renderben tiltana).
  const lock = useRef(false);
  const [confirm, setConfirm] = useState<{ jobId: string; action: Exclude<Action, "resume"> } | null>(null);
  const act = useMutation({
    mutationFn: ({ jobId, action }: { jobId: string; action: Action }) =>
      action === "resume" ? apiRequest("POST", `/api/studio/jobs/${jobId}/resume`)
        : action === "discard-published" ? apiRequest<{ discarded: number }>("POST", "/api/studio/drafts/discard-published", { expected: redundant })
          : apiRequest("POST", `/api/studio/drafts/${jobId}/${action}`),
    onSuccess: (data, { action }) => {
      if (action === "resume" || action === "remake") setFollowUntil(Date.now() + 60_000);
      toast(
      action === "resume" ? { title: "Folytatás elindult", description: "A gyártás a megszakadt ponttól halad tovább — a kész szakaszok megmaradnak." }
        : action === "remake" ? { title: "Újragyártás elindult", description: "A haladás a lista tetején, a készítési szakaszoknál követhető." }
          : action === "discard" ? { title: "Piszkozat törölve" }
            : { title: "Felesleges piszkozatok törölve", description: `${(data as { discarded?: number } | undefined)?.discarded ?? 0} piszkozat.` });
    },
    onError: (e: Error) => toast({ title: "A művelet nem sikerült", description: e.message, variant: "destructive" }),
    onSettled: () => { lock.current = false; void queryClient.invalidateQueries({ queryKey: DRAFTS_KEY }); },
  });
  const run = (jobId: string, action: Action) => {
    if (lock.current) return;
    lock.current = true;
    setConfirm(null);
    act.mutate({ jobId, action });
  };
  const busy = (jobId: string) => act.isPending && act.variables?.jobId === jobId;

  const list = Array.isArray(drafts.data?.drafts) ? drafts.data.drafts : [];
  if (!list.length) return null;
  // Review #255 (P2): a darabszám a szerver összesítése (a lista csonkolhatja), és a törlés ugyanezt a számot küldi vissza ellenőrzésre.
  const redundant = typeof drafts.data?.redundant === "number" ? drafts.data.redundant : list.filter((d) => d.hasPublished && !d.running).length;
  const hidden = typeof drafts.data?.total === "number" ? Math.max(0, drafts.data.total - list.length) : 0;

  const confirmBox = (jobId: string, action: Exclude<Action, "resume">, yes: string) => (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 dark:bg-amber-950" data-testid={`draft-confirm-${action}-${jobId}`}>
      <p className="text-sm basis-full break-words">{CONFIRM_TEXT[action]}</p>
      <Button size="sm" className="min-h-11" variant={action === "remake" ? "default" : "destructive"} data-testid={`draft-confirm-yes-${action}-${jobId}`}
        disabled={act.isPending} onClick={() => run(jobId, action)}>
        {busy(jobId) ? <Loader2 className="w-4 h-4 animate-spin" /> : yes}
      </Button>
      <Button size="sm" variant="outline" className="min-h-11" onClick={() => setConfirm(null)}>Mégse</Button>
    </div>
  );

  return (
    <Card data-testid="draft-lessons">
      <CardHeader>
        <CardTitle className="text-lg">Tananyag draftok</CardTitle>
        <CardDescription>
          Megszakadt gyártások mentett tananyaga és a futó gyártások. Nem publikált, az éles oldalon nem látszik; folytatható, újragyártható vagy törölhető.
        </CardDescription>
        {redundant > 0 && (confirm?.action === "discard-published"
          ? confirmBox("all", "discard-published", `Igen, ${redundant} törlése`)
          : (
            <Button size="sm" variant="outline" className="min-h-11 self-start gap-1" data-testid="draft-discard-published"
              onClick={() => setConfirm({ jobId: "all", action: "discard-published" })}>
              <Trash2 className="w-4 h-4" /> Kész tananyaggal rendelkező piszkozatok törlése ({redundant})
            </Button>
          ))}
      </CardHeader>
      <CardContent className="space-y-3">
        {hidden > 0 && <p className="text-sm text-amber-900 dark:text-amber-200" data-testid="draft-hidden">
          További {hidden} régebbi tétel nem fér a listába — töröld a feleslegeseket, és a többi megjelenik.
        </p>}
        {list.map((d) => {
          const next = nextStepOf(d);
          return (
            <div key={d.jobId} className="rounded-lg border p-3 space-y-2 min-w-0" data-testid={`draft-item-${d.jobId}`}>
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <Badge variant="secondary" data-testid="draft-badge">{d.running ? "Gyártás folyamatban" : "Tananyag draft"}</Badge>
                {d.hasPublished && !d.running && <Badge variant="outline" data-testid="draft-has-published">Kész tananyag már van</Badge>}
                {d.ownerless && <Badge variant="outline" data-testid="draft-ownerless">Gazdátlan</Badge>}
                <span className="font-medium break-words min-w-0">{d.title}</span>
                <span className="text-sm text-muted-foreground">{d.subject}{d.classroom ? ` · ${d.classroom}. osztály` : ""}</span>
              </div>
              {d.draft && (
                <p className="text-sm text-muted-foreground">
                  Mentett: {d.draft.teachingSections} fejezetnyi tananyag, {d.draft.savedBankPackets} kész gyakorlócsomag.
                </p>
              )}
              {/* D4: a három készítési szakasz — futásnál a mostani lépés, megállásnál a megállás helye. */}
              <CreationProgress run={d.running ? { phase: d.step, detail: null, error: null } : { phase: "error", detail: null, error: null, ...(d.stoppedAt ? { stoppedAt: d.stoppedAt } : {}) }} />
              {d.running ? (
                <p className="text-sm flex items-center gap-2" data-testid="draft-running" role="status"><Loader2 className="w-4 h-4 animate-spin" /> Folyamatban — a lista magától frissül.</p>
              ) : (
                <>
                  {/* Az újraindulás szerveroldali üzenete egy másik felület „Újra” gombjára utal — itt a tény elég. */}
                  {d.error && <p className="text-sm break-words">Megállt: {d.nextRecovery?.strategy === "restart" ? "a szerver újraindult a gyártás közben." : d.error.length > 220 ? `${d.error.slice(0, 220)}…` : d.error}</p>}
                  {next === "resume" && d.nextRecovery && <p className="text-sm text-muted-foreground break-words">A program következő lépése: {d.nextRecovery.reason}</p>}
                  {next === "remake" && <p className="text-sm text-muted-foreground break-words" data-testid="draft-remake-why">
                    {d.ownerless ? "Régi, napló nélküli gyártás: csak újragyártható." : "A mentett részekből nem folytatható: újragyártható ugyanabból a forrásból."}
                  </p>}
                  {confirm?.jobId === d.jobId ? confirmBox(d.jobId, confirm.action, confirm.action === "remake" ? "Igen, újragyártás" : "Igen, törlés") : (
                    <div className="flex flex-wrap items-center gap-2">
                      {next === "resume" ? (
                        <Button size="sm" className="min-h-11" data-testid={`draft-resume-${d.jobId}`} disabled={act.isPending} onClick={() => run(d.jobId, "resume")}>
                          {busy(d.jobId) ? <Loader2 className="w-4 h-4 animate-spin" /> : "Folytatás a megszakadt ponttól"}
                        </Button>
                      ) : (
                        <Button size="sm" variant="secondary" className="min-h-11" data-testid={`draft-remake-${d.jobId}`} onClick={() => setConfirm({ jobId: d.jobId, action: "remake" })}>
                          Újragyártás ugyanabból a forrásból
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="min-h-11 gap-1" data-testid={`draft-discard-${d.jobId}`} onClick={() => setConfirm({ jobId: d.jobId, action: "discard" })}>
                        <Trash2 className="w-4 h-4" /> Törlés
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
