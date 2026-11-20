import { useContext, type ComponentType } from "react";

import type { AnimKind } from "@shared/lesson-schema";
import { TriangleAreaLab } from "./TriangleAreaLab";
import { DecisionStory } from "./DecisionStory";
import { BarChartAnim, CycleAnim, IllustrationAnim, LabeledShapeAnim, RichNumberLineAnim, VennAnim } from "./explanatory-visuals";
import { Scene3dAnim } from "./scene3d-anim";
import { CompareCardsAnim, RuleBoxAnim, TableAnim } from "./source-visuals";
import { FractionVisual, MapVisual, ProcessVisual, SentencePartsVisual, TimelineVisual, WordBuilderVisual } from "./variety-visuals";
import { FeedbackVarietyContext } from "../feedback-variety";

/**
 * LS-4 — the eight planned animation kinds (master plan §4).
 *
 * Each kind is a small self-contained visual over the block's `params` record.
 * The params come from a model, so every reader is tolerant: missing or
 * malformed values fall back to a sensible default instead of crashing the
 * lesson. Motion is a one-shot CSS draw-in that the `motion-reduce:` variant
 * turns into a static frame — a reduced-motion child sees the same content,
 * just without movement.
 */

type AnimProps = { params: Record<string, unknown>; caption: string; label?: string };

function str(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

function strArray(v: unknown, fallback: string[]): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : fallback;
}

const FRAME = "motion-safe:animate-draw border rounded-lg bg-card p-4 motion-reduce:animate-none";

/* ------------------------------------------------------------------ */

function LegacyTimelineAnim({ params, caption }: AnimProps) {
  // Spec 2026-09-24: kitalált alapesemény („Kezdet”) helyett nincs ábra.
  const events = strArray(params.events, []);
  if (events.length < 2) return null;
  return (
    <figure className={FRAME} data-anim="timeline">
      <div className="flex items-center gap-1">
        {events.map((event, i) => (
          <div key={i} className="flex-1 flex items-center">
            <div className="flex flex-col items-center gap-1 w-full">
              <div className="w-3 h-3 rounded-full bg-emerald-500" />
              <div className="text-xs text-center leading-tight">{event}</div>
            </div>
            {i < events.length - 1 && <div className="h-0.5 flex-1 bg-muted" />}
          </div>
        ))}
      </div>
      <figcaption className="text-sm text-muted-foreground mt-2">{str(caption, "Idővonal")}</figcaption>
    </figure>
  );
}

function GeometryAnim({ params, caption }: AnimProps) {
  const shape = str(params.shape, "square");
  const label = str(params.label, "");
  return (
    <figure className={FRAME} data-anim="geometry">
      <svg viewBox="0 0 120 80" className="w-full h-auto" role="img" aria-label={caption}>
        {shape === "triangle" && <polygon points="60,8 112,72 8,72" fill="none" stroke="currentColor" strokeWidth="3" />}
        {shape === "circle" && <circle cx="60" cy="40" r="32" fill="none" stroke="currentColor" strokeWidth="3" />}
        {shape !== "triangle" && shape !== "circle" && (
          <rect x="28" y="8" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="3" />
        )}
      </svg>
      <figcaption className="text-sm text-muted-foreground mt-1">{str(caption, `Alakzat${label ? `: ${label}` : ""}`)}</figcaption>
    </figure>
  );
}

function LegacyProcessAnim({ params, caption }: AnimProps) {
  // Spec 2026-09-24: kitalált alaplépés („1. lépés”) helyett nincs ábra.
  const steps = strArray(params.steps, []);
  if (steps.length < 2) return null;
  return (
    <figure className={FRAME} data-anim="process">
      <div className="flex flex-wrap items-center gap-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="border rounded-md px-3 py-2 text-sm bg-muted/40">{step}</div>
            {i < steps.length - 1 && <span className="text-muted-foreground">→</span>}
          </div>
        ))}
      </div>
      <figcaption className="text-sm text-muted-foreground mt-2">{str(caption, "Folyamat")}</figcaption>
    </figure>
  );
}

/**
 * Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (14. szakasz): a folyamat és az idővonal új, sávszínű megjelenése csak a
 * változatossági jelölővel mentett leckén — jelöletlen leckén a régi megjelenítő (a kiadott leckék kinézete változatlan).
 */
function ProcessAnim(props: AnimProps) {
  return useContext(FeedbackVarietyContext) ? <ProcessVisual {...props} /> : <LegacyProcessAnim {...props} />;
}
function TimelineAnim(props: AnimProps) {
  return useContext(FeedbackVarietyContext) ? <TimelineVisual {...props} /> : <LegacyTimelineAnim {...props} />;
}

/** Every planned animate kind mapped to its renderer — the LS-4 guard test pins this. */
export const ANIMATE_REGISTRY: Record<AnimKind, ComponentType<AnimProps>> = {
  numberLine: RichNumberLineAnim,
  fraction: FractionVisual,
  timeline: TimelineAnim,
  geometry: GeometryAnim,
  process: ProcessAnim,
  map: MapVisual,
  wordBuilder: WordBuilderVisual,
  sentenceParts: SentencePartsVisual,
  triangleArea: TriangleAreaLab,
  decisionStory: DecisionStory,
  cycle: CycleAnim,
  labeledShape: LabeledShapeAnim,
  barChart: BarChartAnim,
  venn: VennAnim,
  illustration: IllustrationAnim,
  scene3d: Scene3dAnim,
  table: TableAnim,
  ruleBox: RuleBoxAnim,
  compareCards: CompareCardsAnim,
};
