import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckCircle2, GripVertical, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { LessonOutline, OutlineCoverage, OutlineSection } from "@shared/studio-io";

/**
 * LS-2c — the outline review gate: "A gép javasol, a tanár dönt."
 *
 * The pedagogue's outline arrives server-validated (coverage was measured on the server
 * before it was ever stored), so this screen only re-presents it: sections with their
 * bound concepts as chips, the coverage bar, drag-to-reorder, and the approve button.
 * The server re-validates everything on approve — the client's opinion is never trusted.
 */

const BLOCK_LABELS: Record<string, string> = {
  explain: "Magyarázat",
  example: "Példa",
  check: "Ellenőrzés",
  recap: "Ismétlés",
  animate: "Animáció",
  try: "Próbáld ki",
};

type ConceptInfo = { localId: string; term?: string; examWeight?: string };

type ProducedResponse = {
  job: { id: string; step: string; status: string; round: number };
  produced: {
    outline: LessonOutline | null;
    coverage: OutlineCoverage | null;
    approvedOutline: boolean;
    lessonId: string | null;
  };
};

/** One draggable outline section row. */
function SortableSection({
  id,
  index,
  heading,
  conceptIds,
  plannedBlocks,
  conceptsById,
}: {
  id: string;
  index: number;
  heading: string;
  conceptIds: string[];
  plannedBlocks: string[];
  conceptsById: Map<string, ConceptInfo>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-lg border border-border p-3 flex gap-2 items-start ${isDragging ? "opacity-60 shadow-md" : ""}`}
      data-testid={`outline-section-${index}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none rounded p-1 min-h-11 min-w-11 flex items-center justify-center hover:bg-accent"
        aria-label={`${heading} átrendezése`}
        data-testid={`section-handle-${index}`}
      >
        <GripVertical className="w-4 h-4 text-muted-foreground" />
      </button>
      <div className="flex-1 space-y-2 min-w-0">
        <div className="font-medium text-sm">
          {index + 1}. {heading}
        </div>
        <div className="flex flex-wrap gap-1">
          {conceptIds.map((cid) => {
            const concept = conceptsById.get(cid);
            return (
              <Badge
                key={cid}
                variant="outline"
                className={`text-[10px] ${concept?.examWeight === "core" ? "border-red-300 text-red-700 dark:text-red-300" : ""}`}
                title={concept?.examWeight === "core" ? "Kulcsfogalom" : undefined}
              >
                {concept?.term ?? cid}
              </Badge>
            );
          })}
        </div>
        <div className="text-[11px] text-muted-foreground">
          Tervezett blokkok: {plannedBlocks.map((b) => BLOCK_LABELS[b] ?? b).join(", ")}
        </div>
      </div>
    </div>
  );
}

/** The coverage numbers: core % and supporting %, plus invented-id warnings. */
function CoverageBar({ core, supporting, unknown }: { core: number; supporting: number; unknown: number }) {
  return (
    <div className="space-y-2" data-testid="coverage-bar">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          Kulcsfogalmak: <strong className="text-foreground">{core}%</strong>
        </span>
        <span>
          Kiegészítők: <strong className="text-foreground">{supporting}%</strong>
        </span>
      </div>
      <div className="h-2 rounded bg-muted overflow-hidden flex gap-px">
        <div className="bg-red-500 transition-all" style={{ width: `${core}%` }} />
        <div className="bg-amber-400 transition-all" style={{ width: `${(supporting * (100 - core)) / 100}%` }} />
      </div>
      {unknown > 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {unknown} ismeretlen fogalom-azonosító a vázlatban.
        </p>
      )}
    </div>
  );
}

export function OutlineReview({
  jobId,
  mapId,
  onApproved,
}: {
  jobId: string;
  mapId: string;
  onApproved?: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  // The dragged order as a list of "s<index>" ids; null until the first drag.
  const [order, setOrder] = useState<string[] | null>(null);

  const { data, isLoading } = useQuery<ProducedResponse>({
    queryKey: ["/api/studio/jobs", jobId],
    queryFn: () => apiRequest("GET", `/api/studio/jobs/${jobId}`),
    enabled: jobId.length > 0,
  });

  const { data: mapData } = useQuery<{ map: { id: string }; concepts: ConceptInfo[] }>({
    queryKey: ["/api/studio/maps", mapId],
    queryFn: () => apiRequest("GET", `/api/studio/maps/${mapId}`),
    enabled: mapId.length > 0,
  });

  const conceptsById = useMemo(
    () => new Map((mapData?.concepts ?? []).map((c) => [c.localId, c])),
    [mapData],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const outline = data?.produced.outline ?? null;
  const coverage = data?.produced.coverage ?? null;
  const approved = data?.produced.approvedOutline ?? false;

  // The section order the admin sees: the dragged order once one exists, else the model's.
  const sections: OutlineSection[] = useMemo(() => {
    if (!outline) return [];
    if (!order) return outline.sections;
    const byId = new Map(outline.sections.map((s, i) => [`s${i}`, s]));
    return order.map((id) => byId.get(id)).filter((s): s is OutlineSection => s !== undefined);
  }, [outline, order]);

  const sectionIds = useMemo(() => outline?.sections.map((_, i) => `s${i}`) ?? [], [outline]);

  const approve = useMutation({
    mutationFn: (approvedSections: OutlineSection[]) => {
      if (!outline) throw new Error("Nincs mit jóváhagyni.");
      return apiRequest("POST", `/api/studio/jobs/${jobId}/approve-outline`, {
        outline: { sections: approvedSections, misconceptions: outline.misconceptions },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/studio/jobs", jobId] });
      toast({ title: "Vázlat jóváhagyva", description: "A szerző megkezdi a lecke írását." });
      onApproved?.();
    },
    onError: (e: Error) =>
      toast({ title: "Nem hagyható jóvá", description: e.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Vázlat betöltése…
      </div>
    );
  }

  if (!outline) {
    return (
      <p className="text-sm text-muted-foreground p-6">
        Ehhez a jobhoz még nincs vázlat — a pedagógus lépés nem futott le sikeresen.
      </p>
    );
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = Number(String(active.id).slice(1));
    const to = Number(String(over.id).slice(1));
    if (Number.isNaN(from) || Number.isNaN(to)) return;
    setOrder((prev) => {
      const base = prev ?? sectionIds;
      const next = [...base];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const pct = coverage
    ? coveragePercentagesOf(coverage, mapData?.concepts ?? [])
    : { core: 0, supporting: 0, unknown: 0 };

  return (
    <Card data-testid="outline-review">
      <CardHeader>
        <CardTitle className="text-base">A pedagógus vázlata</CardTitle>
        <CardDescription className="text-xs">
          Húzd a fogantyúnál fogva a szakaszokat a kívánt sorrendbe, majd hagyd jóvá.
          A szerver a jóváhagyáskor újra megméri a térkép-fedettséget.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {coverage && <CoverageBar core={pct.core} supporting={pct.supporting} unknown={pct.unknown} />}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order ?? sectionIds} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {sections.map((section, i) => (
                <SortableSection
                  key={`s${i}`}
                  id={`s${i}`}
                  index={i}
                  heading={section.heading}
                  conceptIds={section.conceptIds}
                  plannedBlocks={section.plannedBlocks}
                  conceptsById={conceptsById}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {approved ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-4 h-4" />
            A vázlat jóváhagyva — a szerző dolgozik.
          </p>
        ) : (
          <Button
            className="min-h-11 gap-1"
            disabled={approve.isPending}
            onClick={() => approve.mutate(sections)}
            data-testid="approve-outline"
          >
            {approve.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Vázlat jóváhagyása
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** Local import shim so the file has one import block; see shared/studio-io.ts. */
function coveragePercentagesOf(c: OutlineCoverage, concepts: ConceptInfo[]) {
  // Mirrors server coveragePercentages() weights: core by missing count, supporting by ratio.
  const coreTotal = concepts.filter((x) => x.examWeight === "core").length;
  const corePct = coreTotal === 0 ? 100 : Math.round(((coreTotal - c.missingCore.length) / coreTotal) * 100);
  return {
    core: corePct,
    supporting: Math.round(c.supporting.ratio * 100),
    unknown: c.unknownIds.length,
  };
}
