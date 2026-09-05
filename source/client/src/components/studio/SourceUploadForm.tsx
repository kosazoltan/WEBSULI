import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2, Upload, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  buildExtractPayload,
  downscaleTargetOf,
  extractSubmitDisabledReason,
  oneStepPhaseRows,
  oneStepSubmitDisabledReason,
  shouldDownscale,
  sourceFileFromRead,
  type SourceFile,
} from "@shared/studio-ui";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, CircleDashed, PauseCircle } from "lucide-react";

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

export function SourceUploadForm({ onCreated }: { onCreated?: (mapId: string) => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [classroom, setClassroom] = useState(4);
  const [files, setFiles] = useState<SourceFile[]>([]);

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
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
      } catch (e) {
        toast({ title: "Beolvasási hiba", description: (e as Error).message, variant: "destructive" });
      }
    }
    if (fileInput.current) fileInput.current.value = "";
  };

  const extract = useMutation({
    mutationFn: () =>
      apiRequest<{ mapId: string; cached: boolean }>(
        "POST",
        "/api/studio/maps/extract",
        buildExtractPayload({ title, subject, classroom, files }),
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

  // LS-6 (#164): feltöltés → tudástár → lecke egyetlen hívásban. A scope
  // elhagyható — üres tantárgynál a szerver az olcsó modellel felismeri.
  // LS-6b (#165): a szerver 202 + runId-t ad azonnal; a futást a fázispanel
  // pollozza, hogy a tanár LÁSSA, melyik gyártási lépés fut éppen.
  const [runId, setRunId] = useState<string | null>(null);
  const oneStep = useMutation({
    mutationFn: () =>
      apiRequest<{ runId: string }>(
        "POST",
        "/api/studio/lessons/one-step",
        subject.trim() === ""
          ? { ...(title.trim() !== "" ? { title: title.trim() } : {}), files }
          : buildExtractPayload({ title, subject, classroom, files }),
      ),
    onSuccess: (r) => {
      setRunId(r.runId);
      setFiles([]);
      setTitle("");
    },
    onError: (e: Error) =>
      toast({ title: "Az egylépeses gyártás nem sikerült", description: e.message, variant: "destructive" }),
  });

  const run = useQuery<{
    phase: string;
    detail: string | null;
    error: string | null;
    mapId: string | null;
    lessonId: string | null;
    htmlFileId?: string | null;
  }>({
    queryKey: ["/api/studio/lessons/one-step", runId],
    queryFn: () => apiRequest("GET", `/api/studio/lessons/one-step/${runId}`),
    enabled: runId !== null,
    refetchInterval: (query) => {
      const phase = query.state.data?.phase;
      return phase === "done" || phase === "error" || phase === "parked" ? false : 2500;
    },
    // #166 — a poll háttér-fülben/fókuszvesztéskor is fusson: e nélkül a jelző
    // "befagyott" (OCR 8/10), miközben a szerver rég továbbhaladt.
    refetchIntervalInBackground: true,
  });

  const runFinished = run.data?.phase === "done" || run.data?.phase === "error" || run.data?.phase === "parked";
  const prevFinished = useRef(false);
  useEffect(() => {
    if (runFinished && !prevFinished.current) {
      void queryClient.invalidateQueries({ queryKey: ["/api/studio/maps"] });
      if (run.data?.mapId) onCreated?.(run.data.mapId);
    }
    prevFinished.current = runFinished;
  }, [runFinished, run.data?.mapId, queryClient, onCreated]);

  const blocked = extractSubmitDisabledReason(subject, classroom, files.length);
  const oneStepBlocked = oneStepSubmitDisabledReason(subject, classroom, files.length);
  const runActive = runId !== null && !runFinished;
  const busy = extract.isPending || oneStep.isPending || runActive;

  return (
    <Card data-testid="source-upload-form">
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
      <CardContent className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <Input
            placeholder="Cím (nem kötelező)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="min-h-11"
            data-testid="extract-title"
          />
          <Input
            placeholder="Tantárgy (pl. biológia)"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="min-h-11"
            data-testid="extract-subject"
          />
          <Input
            type="number"
            min={0}
            max={12}
            value={classroom}
            onChange={(e) => setClassroom(Number(e.target.value))}
            className="min-h-11"
            aria-label="Osztály"
            data-testid="extract-classroom"
          />
        </div>

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
            onClick={() => oneStep.mutate()}
            data-testid="one-step-submit"
          >
            {oneStep.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            Tananyag készítése egy lépésben
          </Button>
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
          {(oneStepBlocked ?? blocked) && !busy && (
            <span className="text-xs text-muted-foreground">{oneStepBlocked ?? blocked}</span>
          )}
          {busy && (
            <span className="text-xs text-muted-foreground">
              A gép dolgozik a forráson — a lépések lent követhetők.
            </span>
          )}
        </div>

        {runId !== null && run.data && (
          <div className="rounded-md border p-3 space-y-1.5" data-testid="one-step-progress">
            <p className="text-sm font-medium">
              {run.data.phase === "done"
                ? "A tananyag elkészült ✔"
                : run.data.phase === "error"
                  ? "A gyártás megállt hibával"
                  : run.data.phase === "parked"
                    ? "A gyártás kézi döntésre vár"
                    : "Tananyag készül…"}
            </p>
            <ul className="space-y-1">
              {oneStepPhaseRows(run.data).map((row) => (
                <li key={row.key} className="flex items-start gap-2 text-sm">
                  {row.state === "done" && <Check className="w-4 h-4 mt-0.5 text-emerald-600" />}
                  {row.state === "active" && <Loader2 className="w-4 h-4 mt-0.5 animate-spin text-blue-600" />}
                  {row.state === "pending" && <CircleDashed className="w-4 h-4 mt-0.5 text-muted-foreground" />}
                  {row.state === "error" && <AlertTriangle className="w-4 h-4 mt-0.5 text-red-600" />}
                  {row.state === "parked" && <PauseCircle className="w-4 h-4 mt-0.5 text-amber-600" />}
                  <span className={row.state === "pending" ? "text-muted-foreground" : ""}>
                    {row.label}
                    {row.detail && (
                      <span className="block text-xs text-muted-foreground">{row.detail}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {(run.data.phase === "done" || run.data.phase === "error" || run.data.phase === "parked") && (
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {run.data.phase === "done" && run.data.htmlFileId && (
                  <Button asChild size="sm" data-testid="one-step-open-lesson">
                    <a href={`/preview/${run.data.htmlFileId}`}>Lecke megnyitása</a>
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setRunId(null)}>
                  Bezárás
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
