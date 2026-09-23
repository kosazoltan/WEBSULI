import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Wrench, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { parseLessonRepair } from "@shared/lesson-repair";

/**
 * Spec 2026-09-23 — javító modul a kész tananyag alatt (csak adminnak).
 *
 * A meglévő, ellenőrzött javító utat hívja (POST /api/admin/improve-material/:id → jelölt →
 * POST /api/admin/improved-files/:id/apply mentéssel), csak a lecke mellől: a tanár megnézi a
 * leckét, lejjebb görget, leírja a hibát, és a kész jelöltet egy gombbal alkalmazza.
 * A futó javítás azonosítója fájlonként a localStorage-ban él, így újratöltés után is követhető.
 */
type Status = { status: "processing" | "completed" | "error" | "not_found"; elapsed?: number; message?: string; improvedFile?: { id: string } };
const storageKey = (fileId: string) => `websuli.lessonRepair.${fileId}`;
function readJob(fileId: string): string | null {
  try { return localStorage.getItem(storageKey(fileId)); } catch { return null; }
}
function writeJob(fileId: string, jobId: string | null) {
  try { if (jobId) localStorage.setItem(storageKey(fileId), jobId); else localStorage.removeItem(storageKey(fileId)); }
  catch { /* A folyamat a böngésző-tároló nélkül is követhető, csak újratöltésig. */ }
}

export type RepairPreset = { label: string; text: string };

export function LessonRepairPanel({ fileId, isLesson, presets = [], embedded = false }: { fileId: string; isLesson: boolean; presets?: RepairPreset[]; embedded?: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [instruction, setInstruction] = useState("");
  const [jobId, setJobId] = useState<string | null>(() => readJob(fileId));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setJobId(readJob(fileId)); }, [fileId]);
  useEffect(() => { writeJob(fileId, jobId); }, [fileId, jobId]);

  const status = useQuery<Status>({
    queryKey: ["/api/admin/improve-material/status", jobId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/improve-material/status/${jobId}`, { credentials: "include" });
      if (res.status === 404) return { status: "not_found" };
      if (!res.ok) throw new Error(`Állapot-lekérdezési hiba (${res.status})`);
      return res.json() as Promise<Status>;
    },
    enabled: !!jobId,
    refetchInterval: (q) => (q.state.data?.status === "processing" || !q.state.data ? 5000 : false),
  });
  const done = status.data?.status === "completed" ? status.data.improvedFile?.id : undefined;
  const candidate = useQuery<{ content?: string; status?: string }>({
    queryKey: ["/api/admin/improved-files", done],
    enabled: !!done,
  });
  const repair = parseLessonRepair(candidate.data?.content);
  const applied = candidate.data?.status === "applied";

  const start = async () => {
    const text = instruction.trim();
    if (!text) return;
    setBusy(true);
    try {
      const r = await apiRequest<{ jobId?: string; existingJobId?: string }>("POST", `/api/admin/improve-material/${fileId}`, { customPrompt: text });
      if (!r.jobId) throw new Error("Nem érkezett javítási azonosító.");
      setJobId(r.jobId);
      toast({ title: "Javítás elindítva", description: "A tananyag újragyártása több lépésben fut; itt követheted." });
    } catch (e) {
      toast({ title: "A javítás nem indult el", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };
  const apply = async () => {
    if (!done) return;
    setBusy(true);
    try {
      await apiRequest("POST", `/api/admin/improved-files/${done}/apply`, { createBackup: true, notes: `Javítás a lecke alól: ${instruction.trim().slice(0, 200)}` });
      await queryClient.invalidateQueries({ queryKey: [`/api/html-files/${fileId}`] });
      await queryClient.invalidateQueries({ queryKey: ["/api/lessons/by-file", fileId] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/improved-files"] });
      toast({ title: "✅ Javítás alkalmazva", description: "A javított tananyag élesben van; az előző változat mentésből visszaállítható." });
      setJobId(null); setInstruction("");
    } catch (e) {
      toast({ title: "Az alkalmazás nem sikerült", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };
  const discard = async () => {
    if (done) { try { await apiRequest("DELETE", `/api/admin/improved-files/${done}`); } catch { /* A jelölt később az Okosítás lapon is törölhető. */ } }
    setJobId(null);
  };

  const s = status.data?.status;
  return (
    <section className={embedded ? "" : "max-w-3xl mx-auto my-8 px-4"} data-testid="lesson-repair-panel" aria-labelledby="lesson-repair-title">
      <div className="rounded-xl border bg-card p-4 space-y-3 shadow-sm">
        <h2 id="lesson-repair-title" className="flex items-center gap-2 text-base font-semibold">
          <Wrench className="w-4 h-4" /> Tananyag javítása
        </h2>
        <p className="text-sm text-muted-foreground">
          Írd le, mi a hiba és mit módosítson a készítő ügynök (pl. „a kódex szót bódexnek írja; 5. osztályos szintre írd; rövidítsd a magyarázatokat”).
          {isLesson ? " A lecke és a gyakorlóbankok újragyártódnak, ellenőrzésen mennek át, és csak jóváhagyás után cserélik le az eredetit." : " Az anyag újragyártódik, és csak jóváhagyás után cseréli le az eredetit."}
        </p>
        {!jobId && (
          <>
            {presets.length > 0 && (
              <div className="flex flex-wrap gap-1.5" aria-label="Javítási szempontok" data-testid="lesson-repair-presets">
                {presets.map((p) => (
                  <Button key={p.label} type="button" variant="outline" size="sm" className="min-h-9 text-xs" title={p.text}
                    onClick={() => setInstruction((prev) => [prev.trim(), p.text].filter(Boolean).join("\n").slice(0, 2000))}>
                    + {p.label}
                  </Button>
                ))}
              </div>
            )}
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value.slice(0, 2000))}
              rows={4}
              maxLength={2000}
              placeholder="Javítási utasítás az ügynöknek…"
              aria-label="Javítási utasítás"
              data-testid="lesson-repair-instruction"
            />
            <Button onClick={start} disabled={busy || !instruction.trim()} className="min-h-11" data-testid="lesson-repair-start">
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wrench className="w-4 h-4 mr-2" />}
              Javítás indítása
            </Button>
          </>
        )}
        {jobId && (s === "processing" || !s) && (
          <p className="flex items-center gap-2 text-sm" data-testid="lesson-repair-running" role="status">
            <Loader2 className="w-4 h-4 animate-spin" /> A javítás fut{status.data?.elapsed ? ` (${Math.round(status.data.elapsed / 60)} perc)` : ""}… Az oldal bezárható, később itt folytatódik.
          </p>
        )}
        {jobId && (s === "error" || s === "not_found") && (
          <div className="space-y-2" data-testid="lesson-repair-error" role="alert">
            <p className="flex items-start gap-2 text-sm text-destructive"><XCircle className="w-4 h-4 mt-0.5 shrink-0" />{status.data?.message ?? "A javítási feladat nem található (szerver-újraindulás)."} Az eredeti tananyag érintetlen.</p>
            <Button variant="outline" onClick={() => setJobId(null)} className="min-h-11">Új utasítás</Button>
          </div>
        )}
        {done && !applied && (
          <div className="space-y-2" data-testid="lesson-repair-ready">
            <p className="flex items-center gap-2 text-sm font-medium"><CheckCircle2 className="w-4 h-4 text-green-600" /> Az ellenőrzött javítás elkészült.</p>
            {repair && (
              <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                {repair.classroom !== undefined && <li>Évfolyam: {repair.previousLesson.classroom}. → {repair.classroom}. osztály</li>}
                {(repair.sourceCorrections ?? []).map((c) => (
                  <li key={c.localId}>Forrás-helyesbítés: „{c.from.term ?? c.from.definition}” → „{c.term ?? c.definition}”</li>
                ))}
                <li>Lektori megjegyzések: {repair.reviewNotes?.length ?? 0} (blokkoló nincs)</li>
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={apply} disabled={busy} className="min-h-11" data-testid="lesson-repair-apply">
                {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Alkalmazás
              </Button>
              <Button variant="outline" onClick={discard} disabled={busy} className="min-h-11" data-testid="lesson-repair-discard">Elvetés</Button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
