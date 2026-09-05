import type { ComponentType } from "react";

import type { AnimKind } from "@shared/lesson-schema";

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

type AnimProps = { params: Record<string, unknown>; caption: string };

function str(v: unknown, fallback: string): string {
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function strArray(v: unknown, fallback: string[]): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : fallback;
}

const FRAME = "motion-safe:animate-draw border rounded-lg bg-card p-4 motion-reduce:animate-none";

/* ------------------------------------------------------------------ */

function NumberLineAnim({ params, caption }: AnimProps) {
  const from = num(params.from, 0);
  const to = num(params.to, 10);
  const highlight = num(params.highlightTo, to);
  const width = 300;
  const pad = 24;
  const x = (v: number) => pad + ((v - from) / (to - from || 1)) * (width - 2 * pad);
  return (
    <figure className={FRAME} data-anim="numberLine">
      <svg viewBox={`0 0 ${width} 64`} className="w-full h-auto" role="img" aria-label={caption}>
        <line x1={pad} y1={40} x2={width - pad} y2={40} stroke="currentColor" strokeWidth="2" />
        <line x1={x(from)} y1={40} x2={x(highlight)} y2={40} stroke="#10b981" strokeWidth="5" strokeLinecap="round" />
        {Array.from({ length: 11 }, (_, i) => {
          const v = from + ((to - from) / 10) * i;
          return (
            <g key={i}>
              <line x1={x(v)} y1={35} x2={x(v)} y2={45} stroke="currentColor" strokeWidth="2" />
              <text x={x(v)} y={58} textAnchor="middle" fontSize="9">{Math.round(v * 10) / 10}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="text-sm text-muted-foreground mt-1">{str(caption, "Számegyenes")}</figcaption>
    </figure>
  );
}

function FractionAnim({ params, caption }: AnimProps) {
  const numerator = num(params.numerator, 1);
  const denominator = Math.max(2, num(params.denominator, 2));
  const segs = 12;
  const filled = Math.round((numerator / denominator) * segs);
  return (
    <figure className={FRAME} data-anim="fraction">
      <div className="flex items-center gap-4">
        <svg viewBox="0 0 64 64" className="w-20 h-20" role="img" aria-label={`${numerator}/${denominator}`}>
          {Array.from({ length: segs }, (_, i) => {
            const a0 = (i / segs) * 2 * Math.PI - Math.PI / 2;
            const a1 = ((i + 1) / segs) * 2 * Math.PI - Math.PI / 2;
            return (
              <path
                key={i}
                d={`M32 32 L${32 + 28 * Math.cos(a0)} ${32 + 28 * Math.sin(a0)} A28 28 0 0 1 ${32 + 28 * Math.cos(a1)} ${32 + 28 * Math.sin(a1)} Z`}
                fill={i < filled ? "#10b981" : "currentColor"}
                opacity={i < filled ? 1 : 0.25}
              />
            );
          })}
          <circle cx="32" cy="32" r="6" fill="var(--background)" />
        </svg>
        <div className="text-3xl font-bold">
          {numerator}<span className="block text-sm font-normal text-muted-foreground">/ {denominator}</span>
        </div>
      </div>
      <figcaption className="text-sm text-muted-foreground mt-1">{str(caption, "Tört")}</figcaption>
    </figure>
  );
}

function TimelineAnim({ params, caption }: AnimProps) {
  const events = strArray(params.events, ["Kezdet", "Következő esemény", "Vég"]);
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

function ProcessAnim({ params, caption }: AnimProps) {
  const steps = strArray(params.steps, ["1. lépés", "2. lépés", "3. lépés"]);
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

function MapAnim({ params, caption }: AnimProps) {
  const spots = Array.isArray(params.spots)
    ? (params.spots as Array<Record<string, unknown>>).filter((s) => s && typeof s === "object")
    : [];
  return (
    <figure className={FRAME} data-anim="map">
      <div className="relative border rounded-md bg-muted/20 h-40">
        {spots.slice(0, 8).map((spot, i) => (
          <div
            key={i}
            className="absolute flex flex-col items-center"
            style={{
              left: `${num(spot.x, 20 + i * 12)}%`,
              top: `${num(spot.y, 50)}%`,
            }}
          >
            <span className="w-3 h-3 rounded-full bg-emerald-500 border-2 border-background" />
            <span className="text-[10px] bg-card/90 px-1 rounded">{str(spot.label, "")}</span>
          </div>
        ))}
        {spots.length === 0 && <div className="absolute inset-0 grid place-items-center text-sm text-muted-foreground">Nincs megadott pont</div>}
      </div>
      <figcaption className="text-sm text-muted-foreground mt-1">{str(caption, "Térkép")}</figcaption>
    </figure>
  );
}

function WordBuilderAnim({ params, caption }: AnimProps) {
  const parts = strArray(params.parts, ["szó", "tag"]);
  return (
    <figure className={FRAME} data-anim="wordBuilder">
      <div className="flex flex-wrap items-center gap-1">
        {parts.map((part, i) => (
          <span key={i} className="inline-flex items-center">
            <span className="border rounded-md px-3 py-2 text-lg font-semibold bg-muted/40">{part}</span>
            {i < parts.length - 1 && <span className="text-muted-foreground mx-1">+</span>}
          </span>
        ))}
      </div>
      <figcaption className="text-sm text-muted-foreground mt-2">{str(caption, "Szóépítés")}</figcaption>
    </figure>
  );
}

function SentencePartsAnim({ params, caption }: AnimProps) {
  const parts = strArray(params.parts, ["[alany]", "[állítmány]", "[tárgy]"]);
  const colors = ["bg-sky-100 dark:bg-sky-950", "bg-emerald-100 dark:bg-emerald-950", "bg-amber-100 dark:bg-amber-950"];
  return (
    <figure className={FRAME} data-anim="sentenceParts">
      <div className="flex flex-wrap gap-1.5">
        {parts.map((part, i) => (
          <span key={i} className={`rounded-md px-3 py-2 text-sm font-medium ${colors[i % colors.length]}`}>{part}</span>
        ))}
      </div>
      <figcaption className="text-sm text-muted-foreground mt-2">{str(caption, "Mondatrészek")}</figcaption>
    </figure>
  );
}

/** Every planned animate kind mapped to its renderer — the LS-4 guard test pins this. */
export const ANIMATE_REGISTRY: Record<AnimKind, ComponentType<AnimProps>> = {
  numberLine: NumberLineAnim,
  fraction: FractionAnim,
  timeline: TimelineAnim,
  geometry: GeometryAnim,
  process: ProcessAnim,
  map: MapAnim,
  wordBuilder: WordBuilderAnim,
  sentenceParts: SentencePartsAnim,
};
