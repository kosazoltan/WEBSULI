import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CheckCircle2, Loader2, Quote, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/queryClient";
import { SourceUploadForm } from "@/components/studio/SourceUploadForm";
import { useToast } from "@/hooks/use-toast";

/**
 * LS-1 — Tudás-térkép kurátori felület.
 *
 * A gép javasol, a tanár dönt. A lényeg a "Forrásidézet" doboz: minden fogalom mellett
 * ott áll, mire hivatkozik, és hogy a szerver megtalálta-e szó szerint a forrásban.
 * Amit nem talált meg, az piros — azt a gép nem taníthatja tovább (D1).
 */

type Concept = {
  id: string;
  localId: string;
  term: string;
  definition: string;
  quote: string;
  sourceRef: { file: string; page?: number };
  type: string;
  examWeight: "core" | "supporting" | "extra";
  verbatimOk: boolean;
  verbatimReason?: string | null;
  reviewState: "pending" | "kept" | "edited" | "rejected";
  orderIndex: number;
};

type MapDetail = {
  map: {
    id: string;
    title: string;
    subject: string;
    classroom: number;
    unit?: string | null;
    status: "draft" | "review" | "approved";
    sourceFiles: Array<{ name: string; kind: string }>;
  };
  concepts: Concept[];
  approval: { ok: boolean; reason?: string };
};

const WEIGHT_LABEL: Record<Concept["examWeight"], { text: string; className: string }> = {
  core: { text: "Kulcsfogalom", className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  supporting: { text: "Kiegészítő", className: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  extra: { text: "Érdekesség", className: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

const STATE_LABEL: Record<Concept["reviewState"], string> = {
  pending: "Átnézésre vár",
  kept: "Elfogadva",
  edited: "Javítva",
  rejected: "Kihúzva",
};

function VerbatimBadge({ concept }: { concept: Concept }) {
  if (concept.verbatimOk) {
    return (
      <Badge variant="outline" className="gap-1 border-emerald-300 text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="w-3 h-3" />
        Forrásból igazolt
      </Badge>
    );
  }
  const why =
    concept.verbatimReason === "empty"
      ? "nincs idézet"
      : concept.verbatimReason === "no_source"
        ? "nincs kereshető forrásszöveg"
        : "nem található a forrásban";
  return (
    <Badge variant="outline" className="gap-1 border-red-300 text-red-700 dark:text-red-300">
      <AlertTriangle className="w-3 h-3" />
      Nem igazolt ({why})
    </Badge>
  );
}

function ConceptRow({ concept, mapId, readOnly }: { concept: Concept; mapId: string; readOnly: boolean }) {
  const [quote, setQuote] = useState(concept.quote);
  const [editing, setEditing] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiRequest("PATCH", `/api/studio/concepts/${concept.id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/maps", mapId] });
      setEditing(false);
    },
    onError: (e: Error) => toast({ title: "Nem sikerült menteni", description: e.message, variant: "destructive" }),
  });

  const weight = WEIGHT_LABEL[concept.examWeight];

  return (
    <div
      className={`rounded-lg border p-3 space-y-2 ${
        concept.reviewState === "rejected" ? "opacity-50" : ""
      } ${!concept.verbatimOk && concept.examWeight === "core" ? "border-red-300" : "border-border"}`}
      data-testid={`concept-${concept.localId}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{concept.term}</span>
        <Badge className={`text-[10px] ${weight.className}`}>{weight.text}</Badge>
        <VerbatimBadge concept={concept} />
        <span className="text-[10px] text-muted-foreground ml-auto">
          {STATE_LABEL[concept.reviewState]}
        </span>
      </div>

      <p className="text-sm text-muted-foreground">{concept.definition}</p>

      <div className="rounded bg-muted/50 p-2 text-xs">
        <div className="flex items-center gap-1 text-muted-foreground mb-1">
          <Quote className="w-3 h-3" />
          Forrásidézet — {concept.sourceRef.file}
          {concept.sourceRef.page ? `, ${concept.sourceRef.page}. oldal` : ""}
        </div>
        {editing ? (
          <div className="space-y-2">
            <Textarea
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              rows={3}
              className="text-xs"
              data-testid={`quote-input-${concept.localId}`}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-8"
                disabled={patch.isPending}
                onClick={() => patch.mutate({ quote, reviewState: "edited" })}
              >
                {patch.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Mentés és újraellenőrzés"}
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => { setQuote(concept.quote); setEditing(false); }}>
                Mégse
              </Button>
            </div>
          </div>
        ) : (
          <blockquote className="italic">„{concept.quote}"</blockquote>
        )}
      </div>

      {!readOnly && !editing && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1"
            disabled={patch.isPending || !concept.verbatimOk}
            title={concept.verbatimOk ? undefined : "Előbb javítsd az idézetet a forrás alapján"}
            onClick={() => patch.mutate({ reviewState: "kept" })}
          >
            <Check className="w-3 h-3" /> Elfogadom
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={() => setEditing(true)}>
            <Quote className="w-3 h-3" /> Idézet javítása
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1 text-muted-foreground"
            disabled={patch.isPending}
            onClick={() => patch.mutate({ reviewState: "rejected" })}
          >
            <X className="w-3 h-3" /> Kihúzom
          </Button>
        </div>
      )}
    </div>
  );
}

export function KnowledgeMapEditor({ mapId }: { mapId: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<MapDetail>({
    queryKey: ["/api/studio/maps", mapId],
    queryFn: () => apiRequest("GET", `/api/studio/maps/${mapId}`),
  });

  const approve = useMutation({
    mutationFn: () => apiRequest("POST", `/api/studio/maps/${mapId}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/maps", mapId] });
      toast({ title: "A térkép jóváhagyva", description: "Ebből már írható lecke." });
    },
    onError: (e: Error) => toast({ title: "Nem hagyható jóvá", description: e.message, variant: "destructive" }),
  });

  const recheck = useMutation({
    mutationFn: () => apiRequest<{ checked: number; failing: number }>("POST", `/api/studio/maps/${mapId}/recheck`),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/maps", mapId] });
      toast({
        title: "Forrás-ellenőrzés kész",
        description: `${r.checked} fogalom, ebből ${r.failing} nem igazolt.`,
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Térkép betöltése…
      </div>
    );
  }

  if (!data) return <p className="text-sm text-muted-foreground p-6">A térkép nem található.</p>;

  const readOnly = data.map.status === "approved";
  const core = data.concepts.filter((c) => c.examWeight === "core" && c.reviewState !== "rejected");
  const coreOk = core.filter((c) => c.verbatimOk).length;
  const pending = data.concepts.filter((c) => c.reviewState === "pending").length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex flex-wrap items-center gap-2">
            {data.map.title}
            <Badge variant="outline">{data.map.subject}</Badge>
            <Badge variant="outline">{data.map.classroom}. osztály</Badge>
            {readOnly && <Badge className="bg-emerald-600">Jóváhagyva</Badge>}
          </CardTitle>
          <CardDescription className="text-xs">
            Források: {data.map.sourceFiles.map((f) => f.name).join(", ")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-[11px] text-muted-foreground">Kulcsfogalom igazolva</div>
              <div className="font-semibold">{coreOk} / {core.length}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Átnézésre vár</div>
              <div className="font-semibold">{pending}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted-foreground">Összes fogalom</div>
              <div className="font-semibold">{data.concepts.length}</div>
            </div>
          </div>

          {!data.approval.ok && (
            <p className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              {data.approval.reason}
            </p>
          )}

          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <Button
                className="min-h-11 gap-1"
                disabled={!data.approval.ok || approve.isPending}
                onClick={() => approve.mutate()}
                data-testid="approve-map"
              >
                {approve.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Térkép jóváhagyása
              </Button>
              <Button
                variant="outline"
                className="min-h-11 gap-1"
                disabled={recheck.isPending}
                onClick={() => recheck.mutate()}
              >
                {recheck.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Quote className="w-4 h-4" />}
                Forrás-ellenőrzés újra
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-2">
        {data.concepts.map((concept) => (
          <ConceptRow key={concept.id} concept={concept} mapId={mapId} readOnly={readOnly} />
        ))}
      </div>
    </div>
  );
}

/** Térkép-lista + a kiválasztott térkép szerkesztője. */
export function KnowledgeMapPanel() {
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{
    maps: Array<{ id: string; title: string; subject: string; classroom: number; status: string }>;
  }>({
    queryKey: ["/api/studio/maps"],
    queryFn: () => apiRequest("GET", "/api/studio/maps"),
  });

  if (selected) {
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelected(null)}>
          ← Vissza a listához
        </Button>
        <KnowledgeMapEditor mapId={selected} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* LS-2a-fix (#157): a feltöltő, ami nélkül a tudástár zsákutca volt. */}
      <SourceUploadForm onCreated={(mapId) => setSelected(mapId)} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tudás-térképek</CardTitle>
          <CardDescription className="text-xs">
            Feltöltött forrásból kivonatolt, forráshoz kötött fogalomjegyzékek. Jóváhagyás után
            ezekből írható lecke.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Betöltés…
            </div>
          ) : !data || data.maps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Még nincs térkép — a fenti űrlapon tölts fel forrást, és a gép kivonatolja.
            </p>
          ) : (
            <div className="space-y-2">
              {data.maps.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSelected(m.id)}
                  className="w-full text-left rounded-lg border border-border p-3 hover:bg-accent min-h-11"
                  data-testid={`map-row-${m.id}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{m.title}</span>
                    <Badge variant="outline" className="text-[10px]">{m.subject}</Badge>
                    <Badge variant="outline" className="text-[10px]">{m.classroom}. o.</Badge>
                    {m.status === "approved" && <Badge className="bg-emerald-600 text-[10px]">Jóváhagyva</Badge>}
                    {m.status === "draft" && <Badge variant="secondary" className="text-[10px]">Piszkozat</Badge>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
