import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2, Upload, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { LessonArtSummary } from "@/components/studio/LessonArtSummary";

/** A folytatás fajtája szerinti, a valóságnak megfelelő tájékoztatás (spec 2026-10-15-folytatas-szoveg). */
const RESUME_TEXT: Record<string, string> = {
  bank: "A folytatás innen halad tovább, a kész részeket nem gyártja újra.",
  gate: "A folytatás innen halad tovább, a kész részeket nem gyártja újra.",
  review: "A folytatás a tananyagot megtartja, és a lektori ellenőrzést futtatja újra.",
  rebuild: "A folytatás a tanítást megtartja, a gyakorlóbankot új tartalékkal újraépíti.",
  lektor: "A folytatás a lektori ellenőrzést futtatja újra.",
  restart: "A szerver újraindult; a folytatás a megszakadt lépéstől halad tovább, a kész részeket nem gyártja újra.",
};
import { useToast } from "@/hooks/use-toast";
import {
  downscaleTargetOf,
  oneStepSubmitDisabledReason,
  shouldDownscale,
  sourceFileFromRead,
  type SourceFile,
} from "@shared/studio-ui";
import { useQuery } from "@tanstack/react-query";
import { CreationProgress } from "./CreationProgress";
import { WorkflowMonitor } from "./WorkflowMonitor";

const RUN_STORAGE_KEY = "websuli.studio.oneStepRunId";
function readPersistedRunId(): string | null {
  try { return sessionStorage.getItem(RUN_STORAGE_KEY); }
  catch { return null; } // Storage may be unavailable in a restricted browser.
}

/**
 * LS-2a-fix (board #157) — the missing source-upload form.
 *
 * The trap this closes: the map list's empty state told the admin to "upload a
 * source", but no upload existed anywhere — the extract endpoint was orphaned.
 * This form reads the files client-side (text as text, pdf/image/docx as a
 * data URL — the shape the extractor expects), then POSTs
 * /api/studio/maps/extract. On success the map list refreshes and the new map
 * opens for curation.
 */

function readFileFor(file: File): Promise<string> {
  const isText = /\.(txt|md)$/i.test(file.name);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Nem sikerült beolvasni: ${file.name}`));
    reader.onload = () => resolve(String(reader.result));
    if (isText) reader.readAsText(file);
    else reader.readAsDataURL(file);
  });
}

/**
 * #163 — a fotót feltöltés ELŐTT kicsinyítjük (leghosszabb él 1600px, JPEG
 * 0.85): az OCR-nek bőven elég, a vision-hívás töredék tokenből megvan, és a
 * kérés is kisebb. A döntési számok a shared/studio-ui.ts-ben, unit-tesztelve.
 */
function downscaleImage(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(dataUrl); // nem dekódolható: eredeti megy
    img.onload = () => {
      if (!shouldDownscale("image", img.naturalWidth, img.naturalHeight)) return resolve(dataUrl);
      const { width, height } = downscaleTargetOf(img.naturalWidth, img.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.src = dataUrl;
  });
}

export function SourceUploadForm({
  onCreated,
  onReview,
  persistRun = false,
  showMapOnlyAction = true,
  headerless = false,
}: {
  onCreated?: (mapId: string) => void;
  onReview?: (mapId: string) => void;
  /** Only the main lesson form owns the persistent run monitor. */
  persistRun?: boolean;
  /**
   * LS-8 (#191): a kurátori „Csak tudás-térkép" gomb. A tananyagkészítés fülön
   * `false` — ott a tudástár építése a folyamat láthatatlan része.
   */
  showMapOnlyAction?: boolean;
  /** A befoglaló kártya adja a címet/leírást (nincs dupla fejléc). */
  headerless?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  // Spec 2026-09-23: a pársoros kérés az ügynöknek (évfolyam, terjedelem, hangsúly, elírások).
  const [instructions, setInstructions] = useState("");
  const [files, setFiles] = useState<SourceFile[]>([]);

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    let added = 0;
    for (const file of Array.from(list)) {
      try {
        const content = await readFileFor(file);
        const source = sourceFileFromRead(file.name, content);
        if (!source) {
          toast({
            title: "Nem támogatott fájl",
            description: `${file.name} — pdf, kép, docx vagy txt/md tölthető fel.`,
            variant: "destructive",
          });
          continue;
        }
        // #163: fotó kicsinyítése feltöltés előtt (olcsóbb OCR, kisebb kérés).
        const finalSource =
          source.kind === "image" ? { ...source, content: await downscaleImage(source.content) } : source;
        setFiles((prev) => [...prev.filter((f) => f.name !== finalSource.name), finalSource]);
        added++;
      } catch (e) {
        toast({ title: "Beolvasási hiba", description: (e as Error).message, variant: "destructive" });
      }
    }
    if (fileInput.current) fileInput.current.value = "";
    // Review #250 (P2): ha egy fájl sem olvasható be, a függő újragyártás megszűnik (egy későbbi sima választás nem indíthatja el).
    if (!added) remakeAfterPick.current = false;
    setPicked((n) => n + 1);
  };
  // Review #248 (P2): oldalfrissítés után a fájlok nincsenek meg — az újragyártás a forrás újraválasztásával indul (a választás végén magától).
  const [picked, setPicked] = useState(0);
  const remakeAfterPick = useRef(false);

  const extract = useMutation({
    mutationFn: () =>
      apiRequest<{ mapId: string; cached: boolean }>(
        "POST",
        "/api/studio/maps/extract",
        { ...(title.trim() !== "" ? { title: title.trim() } : {}), files },
      ),
    onSuccess: (r) => {
      toast({
        title: r.cached ? "Ez a forrás már fel volt dolgozva" : "Tudás-térkép elkészült",
        description: r.cached
          ? "A meglévő térképet nyitottuk meg — ugyanazért a forrásért nem fizetünk kétszer."
          : "Nézd át a fogalmakat, majd hagyd jóvá a térképet.",
      });
      void queryClient.invalidateQueries({ queryKey: ["/api/studio/maps"] });
      setFiles([]);
      setTitle("");
      onCreated?.(r.mapId);
    },
    onError: (e: Error) =>
      toast({ title: "A kivonatolás nem sikerült", description: e.message, variant: "destructive" }),
  });

  // Feltöltés → tudástár → lecke. A tantárgyat és évfolyamot a forrás határozza meg.
  // LS-6b (#165): a szerver 202 + runId-t ad azonnal; a futást a fázispanel
  // pollozza, hogy a tanár LÁSSA, melyik gyártási lépés fut éppen.
  const [runId, setRunId] = useState<string | null>(() => persistRun ? readPersistedRunId() : null);
  useEffect(() => {
    if (!persistRun) return;
    try {
      if (runId) sessionStorage.setItem(RUN_STORAGE_KEY, runId);
      else sessionStorage.removeItem(RUN_STORAGE_KEY);
    } catch { /* The live status remains available without browser storage. */ }
  }, [runId, persistRun]);
  const oneStep = useMutation({
    // docs/specs/2026-10-15-hiba-gombok.md (E3): `forceNew` = kifejezett újragyártás ugyanabból a forrásból (a megszakadt piszkozat helyett).
    mutationFn: (opts?: { forceNew?: boolean }) =>
      apiRequest<{ runId: string }>(
        "POST",
        "/api/studio/lessons/one-step",
        // The source determines subject and grade; the author supplies files/title and an optional request
        // (spec 2026-09-23: an explicit grade in the request wins over the source estimate).
        { ...(title.trim() !== "" ? { title: title.trim() } : {}), ...(instructions.trim() !== "" ? { instructions: instructions.trim() } : {}), files, ...(opts?.forceNew ? { forceNew: true } : {}) },
      ),
    onSuccess: (r) => {
      prevFinished.current = false;
      setRunId(r.runId);
    },
    onError: (e: Error) =>
      toast({ title: "Az egylépeses gyártás nem sikerült", description: e.message, variant: "destructive" }),
  });

  const run = useQuery<{
    phase: string;
    detail: string | null;
    error: string | null;
    mapId: string | null;
    jobId?: string | null;
    lessonId: string | null;
    htmlFileId?: string | null;
    draft?: { teachingSections: number; savedBankPackets: number };
    resumable?: boolean;
    stoppedAt?: string;
    resumeKind?: string;
    nextRecovery?: { strategy: string; reason: string };
    draftRunId?: string;
    ownerInstruction?: string;
  }>({
    queryKey: ["/api/studio/lessons/one-step", runId],
    queryFn: async () => {
      const result = await apiRequest<{ phase: string; detail: string | null; error: string | null; mapId: string | null; jobId?: string | null; lessonId: string | null; htmlFileId?: string | null; draft?: { teachingSections: number; savedBankPackets: number }; resumable?: boolean; stoppedAt?: string; resumeKind?: string; nextRecovery?: { strategy: string; reason: string }; draftRunId?: string; ownerInstruction?: string }>("GET", `/api/studio/lessons/one-step/${runId}`);
      if (result.phase === "done" && !result.htmlFileId) throw new Error("A futás lezárult, de nincs elérhető, közzétett tananyag. A készítést ellenőrizni kell.");
      return result;
    },
    enabled: runId !== null,
    refetchInterval: (query) => {
      const phase = query.state.data?.phase;
      return phase === "done" || phase === "error" || phase === "parked" || phase === "draft" ? false : 2500;
    },
    // #166 — a poll háttér-fülben/fókuszvesztéskor is fusson: e nélkül a jelző
    // "befagyott" (OCR 8/10), miközben a szerver rég továbbhaladt.
    // Spec 2026-10-19-eroforras-s2a: rejtett fülön nem kérdez (visszatéréskor a fókusz frissít).
    refetchIntervalInBackground: false,
  });

  const runFinished = run.data?.phase === "done" || run.data?.phase === "error" || run.data?.phase === "parked" || run.data?.phase === "draft";
  const prevFinished = useRef(false);
  useEffect(() => {
    if (runFinished && !prevFinished.current) {
      void queryClient.invalidateQueries({ queryKey: ["/api/studio/maps"] });
      if (run.data?.phase === "done" && run.data.htmlFileId) {
        void queryClient.invalidateQueries({ queryKey: ["/api/html-files"] });
        setFiles([]);
        setTitle("");
        setInstructions("");
        if (run.data.mapId) onCreated?.(run.data.mapId);
      } else if (run.data?.phase === "draft") {
        toast({ title: "Ebből a forrásból van megszakadt piszkozat", description: "Válassz: folytatás a megszakadt ponttól, újragyártás, vagy új tananyag." });
      } else {
        toast({ title: "Az új tananyag még nem készült el", description: run.data?.error ?? run.data?.detail ?? "A gyártás megállt.", variant: "destructive" });
      }
    }
    prevFinished.current = runFinished;
  }, [runFinished, run.data, queryClient, onCreated, toast]);

  // Spec 2026-10-14-folytatas-mentett-reszekbol: a megállt gyártás a mentett részekből folytatódik (lecke, kész
  // bankcsomagok, modellhívás-napló) — a szerver dönti el, folytatható-e; elutasításkor az üzenetét mutatjuk.
  // Szinkron zár: az `isPending` csak a következő renderben frissül — a gyors dupla kattintás két folytatást indítana (mért, e2e).
  const resumeLock = useRef(false);
  const resume = useMutation({
    mutationFn: (jobId: string) => apiRequest<{ runId?: string; resumed?: boolean } | undefined>("POST", `/api/studio/jobs/${jobId}/resume`),
    onSuccess: async (started) => {
      // Review #260 / J5: a folytatás (mentett részekből) és az újragyártás is saját futást indít (`runId`) — a haladásjelző ezt követi.
      if (started?.runId) {
        toast(started.resumed
          ? { title: "Folytatás elindult", description: "A gyártás a mentett részekből halad tovább; a kész részeket nem gyártja újra." }
          : { title: "Újragyártás elindult", description: "A mentett forrásból új gyártás indult." });
        prevFinished.current = false; setRunId(started.runId); return;
      }
      toast({ title: "Folytatás elindult", description: "A gyártás a mentett részekből halad tovább." });
      // E2: a piszkozat-választásból indított folytatás a piszkozat saját futását követi (ott frissül a haladásjelző).
      if (run.data?.phase === "draft" && run.data.draftRunId) { prevFinished.current = false; setRunId(run.data.draftRunId); return; }
      // Spec 2026-10-15-kapu-reszleges-javitas-folytatas (D7): a hibánál leállt folyamatábra-lekérdezés újraindul.
      void queryClient.invalidateQueries({ queryKey: ["/api/studio/workflows", runId] });
      await run.refetch();
    },
    onError: (e: Error) => toast({ title: "Nem sikerült folytatni", description: e.message, variant: "destructive" }),
    onSettled: () => { resumeLock.current = false; },
  });
  // Review #248 (P1): a dupla kattintás nem indíthat két újragyártást (az `isPending` csak a következő renderben tilt) — szinkron zár.
  const remakeLock = useRef(false);
  const startRemake = () => {
    if (remakeLock.current) return;
    if (files.length === 0) {
      remakeAfterPick.current = true;
      toast({ title: "Válaszd ki újra a forrásfájlokat", description: "A kiválasztás után az újragyártás magától elindul." });
      fileInput.current?.click();
      return;
    }
    remakeLock.current = true;
    oneStep.mutate({ forceNew: true }, { onSettled: () => { remakeLock.current = false; } });
  };
  // Review #251 (P2): a futás bármilyen váltása (Bezárás, Új tananyag, új futás) törli a függő újragyártást — egy későbbi, más célú
  // fájlválasztás nem indíthat észrevétlenül forceNew gyártást.
  useEffect(() => { remakeAfterPick.current = false; }, [runId]);
  // Review #250 (P2): a fájlválasztó megszakítása is törli a függő újragyártást.
  useEffect(() => {
    const el = fileInput.current;
    const onCancel = () => { remakeAfterPick.current = false; };
    el?.addEventListener("cancel", onCancel);
    return () => el?.removeEventListener("cancel", onCancel);
  }, []);
  // Review #250 (P1): oldalfrissítés után az űrlap üres — a megállt gyártás eredeti tanári kérése visszakerül (látható, javítható),
  // így az újragyártás nem kérés nélkül indul, és a szerver ugyanazt a piszkozatot teszi félre.
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    const owner = run.data?.ownerInstruction;
    if (!runId || !owner || restoredFor.current === runId || (run.data?.phase !== "error" && run.data?.phase !== "draft")) return;
    restoredFor.current = runId;
    setInstructions((current) => (current.trim() === "" ? owner.slice(0, 2000) : current));
  }, [runId, run.data?.ownerInstruction, run.data?.phase]);
  useEffect(() => {
    if (!remakeAfterPick.current || files.length === 0) return;
    remakeAfterPick.current = false;
    startRemake();
    // A kiválasztás befejezése (picked) indít; a startRemake a friss fájllistával fut.
  }, [picked]);
  const startResume = (jobId: string) => {
    if (resumeLock.current) return;
    resumeLock.current = true;
    resume.mutate(jobId);
  };

  const blocked = oneStepSubmitDisabledReason("", Number.NaN, files.length);
  const oneStepBlocked = oneStepSubmitDisabledReason("", Number.NaN, files.length);
  const runActive = runId !== null && !runFinished;
  const busy = extract.isPending || oneStep.isPending || runActive;

  return (
    <Card data-testid="source-upload-form">
      {!headerless && (
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileUp className="w-4 h-4 text-emerald-600" />
            Forrás feltöltése — új tudás-térkép
          </CardTitle>
          <CardDescription className="text-xs">
            Tölts fel tananyag-forrást (pdf, kép, docx, txt) — a gép fogalomjegyzéket kivonatol
            belőle, te átnézed és jóváhagyod, és abból készül a lecke.
          </CardDescription>
        </CardHeader>
      )}
      <CardContent className="space-y-3">
        {headerless && (
          <p className="text-xs text-muted-foreground" data-testid="one-step-hint">
            Csak a forrást töltsd fel. A program a tartalomból felismeri a tantárgyat és az
            osztályt; címet külön is megadhatsz.
          </p>
        )}
        <div className="grid gap-2">
          <Input
            placeholder="Cím (nem kötelező)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="min-h-11"
            data-testid="extract-title"
          />
          <Textarea
            placeholder={"Kérés az ügynöknek (nem kötelező) — pl.: 5. osztályos szinten, röviden. Kézzel írt jegyzet: az elírásokat (pl. bódex → kódex) javítsd."}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value.slice(0, 2000))}
            rows={3}
            maxLength={2000}
            className="min-h-20 text-sm"
            aria-label="Kérés az ügynöknek"
            data-testid="extract-instructions"
          />
        </div>
        {!headerless && <p className="text-sm text-muted-foreground">A tantárgyat és az osztályt a program a feltöltött tananyagból határozza meg.</p>}

        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.docx,.txt,.md"
          className="hidden"
          onChange={(e) => void addFiles(e.target.files)}
          data-testid="extract-file-input"
        />
        <Button
          variant="outline"
          className="min-h-11 gap-1"
          onClick={() => fileInput.current?.click()}
          data-testid="extract-pick-files"
        >
          <Upload className="w-4 h-4" />
          Fájlok kiválasztása
        </Button>

        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2" data-testid="extract-file-list">
            {files.map((f) => (
              <li key={f.name}>
                <Badge variant="secondary" className="gap-1">
                  {f.name} · {f.kind}
                  <button
                    onClick={() => setFiles((prev) => prev.filter((p) => p.name !== f.name))}
                    aria-label={`${f.name} eltávolítása`}
                    className="ml-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            className="min-h-11 gap-1"
            disabled={oneStepBlocked !== null || busy}
            onClick={() => oneStep.mutate({})}
            data-testid="one-step-submit"
          >
            {oneStep.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            Tananyag készítése
          </Button>
          {/* LS-8 (#191): a „csak tudás-térkép" a KURÁTORI út gombja. A
              tananyagkészítés fülön nem jelenik meg — ott a tudástár építése
              a folyamat láthatatlan része, nem külön felhasználói döntés. */}
          {showMapOnlyAction && (
            <Button
              variant="outline"
              className="min-h-11 gap-1"
              disabled={blocked !== null || busy}
              onClick={() => extract.mutate()}
              data-testid="extract-submit"
            >
              {extract.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
              Csak tudás-térkép
            </Button>
          )}
          {(oneStepBlocked ?? (showMapOnlyAction ? blocked : null)) && !busy && (
            <span className="text-xs text-muted-foreground">
              {oneStepBlocked ?? blocked}
            </span>
          )}
          {busy && (
            <span className="text-xs text-muted-foreground">
              A gép dolgozik a forráson — a lépések lent követhetők.
            </span>
          )}
        </div>

        {runId !== null && run.isError && <div role="alert" className="rounded-md border border-red-300 p-3 text-sm space-y-2" data-testid="one-step-status-error">
          <p>Nem sikerült ellenőrizni a tananyagkészítés állapotát. {run.error.message}</p>
          <Button variant="outline" onClick={() => void run.refetch()}>Állapot újraellenőrzése</Button>
          <Button variant="ghost" onClick={() => setRunId(null)}>Bezárás</Button>
        </div>}
        {runId !== null && run.data && !run.isError && (
          <div className="rounded-md border p-3 space-y-1.5" data-testid="one-step-progress">
            <p className="text-sm font-medium">
              {run.data.phase === "done"
                ? "A tananyag elkészült ✔"
                : run.data.phase === "draft"
                  ? "Ebből a forrásból van megszakadt piszkozat"
                : run.data.phase === "error"
                  ? "A gyártás megállt hibával"
                  : run.data.phase === "parked"
                    ? "Az új tananyag még nem készült el — forrásellenőrzés szükséges"
                    : "Tananyag készül…"}
            </p>
            <CreationProgress run={run.data} />
            {(run.data.phase === "error" || run.data.phase === "draft") && run.data.draft && (
              <p className="text-sm text-muted-foreground" data-testid="one-step-draft">
                Mentett piszkozat: {run.data.draft.teachingSections} fejezetnyi tananyag, {run.data.draft.savedBankPackets} kész gyakorlócsomag.
                {run.data.jobId && run.data.resumable ? ` ${RESUME_TEXT[run.data.resumeKind ?? ""] ?? RESUME_TEXT.bank}` : ""}
                {run.data.jobId && !run.data.resumable ? " Ez a megállás a mentett részekből nem folytatható; a forrásellenőrzésből új készítés indítható." : ""}
              </p>
            )}
            {run.data.phase === "error" && run.data.nextRecovery && (
              <p className="text-sm text-muted-foreground" data-testid="one-step-next-recovery">
                A program következő lépése: {run.data.nextRecovery.reason}.
              </p>
            )}
            {/* Review #278 (P1): az arculat a fő feltöltési útvonal kész futásánál is látszik (nem csak a haladó ágon). */}
            {run.data.phase === "done" && run.data.htmlFileId && <LessonArtSummary htmlFileId={run.data.htmlFileId} />}
            {(run.data.phase === "done" || run.data.phase === "error" || run.data.phase === "parked" || run.data.phase === "draft") && (
              <div className="flex flex-wrap items-center gap-2 mt-1" data-testid="one-step-actions">
                {run.data.phase === "done" && run.data.htmlFileId && (
                  <Button asChild size="sm" data-testid="one-step-open-lesson">
                    <a href={`/preview/${run.data.htmlFileId}`}>Lecke megnyitása</a>
                  </Button>
                )}
                {/* docs/specs/2026-10-15-hiba-gombok.md (tulajdonosi javaslat): három külön döntés — soha nem kezd újra észrevétlenül. */}
                {(run.data.phase === "error" || run.data.phase === "draft") && run.data.jobId && run.data.resumable && (
                  <Button size="sm" className="min-h-11" data-testid="one-step-resume" disabled={resume.isPending}
                    onClick={() => startResume(run.data!.jobId!)}>
                    {resume.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Folytatás a megszakadt ponttól"}
                  </Button>
                )}
                {(run.data.phase === "error" || run.data.phase === "draft") && (
                  <Button size="sm" variant="secondary" className="min-h-11" data-testid="one-step-remake" disabled={oneStep.isPending}
                    onClick={startRemake}>
                    {files.length > 0 ? "Újragyártás ugyanabból a forrásból" : "Újragyártás (a forrás újraválasztásával)"}
                  </Button>
                )}
                {(run.data.phase === "error" || run.data.phase === "draft") && (
                  <Button size="sm" variant="outline" className="min-h-11" data-testid="one-step-new"
                    onClick={() => { setRunId(null); setFiles([]); setTitle(""); setInstructions(""); }}>
                    Új tananyag
                  </Button>
                )}
                {(run.data.phase === "parked" || run.data.phase === "error") && run.data.mapId && onReview && <Button variant="outline" size="sm" data-testid="one-step-review-source" onClick={() => onReview(run.data!.mapId!)}>
                  Forrásellenőrzés megnyitása
                </Button>}
                <Button variant="ghost" size="sm" onClick={() => setRunId(null)}>
                  Bezárás
                </Button>
              </div>
            )}
          </div>
        )}
        <WorkflowMonitor id={runId} />
      </CardContent>
    </Card>
  );
}
