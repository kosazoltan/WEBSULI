import type { ReactNode } from "react";

import {
  moonLitPath,
  parseVisualParams,
  type BarChartParams,
  type CycleParams,
  type LabeledShapeParams,
  type NumberLineParams,
  type VennParams,
} from "@shared/lesson-visual-params";
import { sanitizeIllustration } from "@shared/illustration-svg";

/**
 * Spec 2026-09-24 (docs/specs/2026-09-24-magyarazo-abrak.md, 1. szelet): magyarázó ábrák.
 *
 * Mért hiány: a holdciklushoz egyetlen címke nélküli kör készült (a régi `geometry` rajzoló).
 * Ezek a rajzolók a fogalmat mutatják — fázisokat körben, címkézett méreteket, arányokat,
 * halmazokat —, csak érvényes paraméterből rajzolnak, és kitalált alapértéket soha nem mutatnak:
 * hibás adatnál nincs ábra (a szerver kapuja ezt jelzi a készítőnek).
 *
 * Olvashatóság: minden ábra `viewBox`-szal skálázódik; a hosszabb szöveg az SVG ALATT, HTML-listában
 * van, így 375 px szélességen sem fedi egymást.
 */

type AnimProps = { params: Record<string, unknown>; caption: string };

const FRAME = "motion-safe:animate-draw border rounded-lg bg-card p-4 motion-reduce:animate-none";
const ACCENT = "#10b981";
const PALETTE = ["#0ea5e9", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444", "#14b8a6", "#ec4899", "#84cc16", "#6366f1", "#f97316", "#06b6d4", "#a855f7"];
const MOON_LIT = "#facc15";
const MOON_DARK = "#475569";

/** Split a label into at most two lines near the middle, for SVG text that cannot wrap. */
function twoLines(text: string, max = 14): string[] {
  if (text.length <= max) return [text];
  const words = text.split(/\s+/);
  let best: [string, string] = [text, ""];
  let bestScore = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
    const score = Math.max(a.length, b.length);
    if (score < bestScore) { bestScore = score; best = [a, b]; }
  }
  return best[1] ? best : [text];
}

function Caption({ caption }: { caption: string }) {
  return caption ? <figcaption className="text-sm text-muted-foreground mt-2">{caption}</figcaption> : null;
}

/* ------------------------------------------------------------------ cycle */

function Moon({ cx, cy, r, lit, waxing }: { cx: number; cy: number; r: number; lit: number; waxing: boolean }) {
  const d = moonLitPath(cx, cy, r, lit, waxing);
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={MOON_DARK} stroke="currentColor" strokeOpacity="0.35" strokeWidth="1" />
      {d && <path d={d} fill={MOON_LIT} />}
    </g>
  );
}

export function CycleAnim({ params, caption }: AnimProps) {
  const p = parseVisualParams("cycle", params) as CycleParams | null;
  if (!p) return null;
  const n = p.phases.length;
  // 400×400 rajzterület: 375 px-es telefonon (≈ 0,77-es skála) a 16-os betű ≈ 12 px marad (böngészőben mérve).
  const W = 400, H = 400, cx = W / 2, c = H / 2, R = 104, node = n > 8 ? 18 : 22;
  const hasMoon = p.phases.some((ph) => ph.moon !== undefined);
  const at = (i: number) => {
    const a = (i / n) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + R * Math.cos(a), y: c + R * Math.sin(a), a };
  };
  return (
    <figure className={FRAME} data-anim="cycle">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-w-lg mx-auto block" role="img" aria-label={caption}>
        <defs>
          <marker id="cycle-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="currentColor" fillOpacity="0.55" />
          </marker>
        </defs>
        {p.phases.map((_, i) => {
          // Arrow along the ring from phase i to i+1, clear of both nodes.
          const gap = (node + 8) / R;
          const a0 = at(i).a + gap, a1 = at(i + 1).a - gap;
          const x0 = cx + R * Math.cos(a0), y0 = c + R * Math.sin(a0), x1 = cx + R * Math.cos(a1), y1 = c + R * Math.sin(a1);
          return <path key={`arc-${i}`} d={`M${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1}`} fill="none" stroke="currentColor" strokeOpacity="0.45" strokeWidth="2" markerEnd="url(#cycle-arrow)" />;
        })}
        {p.center && (
          hasMoon ? (
            <g>
              <circle cx={cx} cy={c} r={30} fill="#0ea5e9" />
              <path d={`M${cx - 18} ${c - 8} q10 -10 22 -2 q8 6 -4 14 q-12 6 -18 -12`} fill="#22c55e" opacity="0.85" />
              {twoLines(p.center, 16).map((line, k, all) => (
                <text key={k} x={cx} y={c + 52 + k * 21 - (all.length - 1) * 10} textAnchor="middle" fontSize="16" fontWeight="600" fill="currentColor">{line}</text>
              ))}
            </g>
          ) : (
            twoLines(p.center, 16).map((line, k, all) => (
              <text key={k} x={cx} y={c + 6 + k * 22 - (all.length - 1) * 11} textAnchor="middle" fontSize="17" fontWeight="700" fill="currentColor">{line}</text>
            ))
          )
        )}
        {p.phases.map((phase, i) => {
          const { x, y, a } = at(i);
          const lx = cx + (R + node + 14) * Math.cos(a), ly = c + (R + node + 16) * Math.sin(a);
          const anchor = Math.abs(Math.cos(a)) < 0.3 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
          const lines = twoLines(phase.label, 9);
          const color = PALETTE[i % PALETTE.length];
          return (
            <g key={i}>
              {phase.moon !== undefined
                ? <Moon cx={x} cy={y} r={node} lit={phase.moon} waxing={phase.waxing ?? true} />
                : <circle cx={x} cy={y} r={node} fill={color} fillOpacity="0.9" />}
              {/* Témától független jelvény (mérve: a --card a lecke témájától eltérhet, 1,2:1 kontraszt). */}
              <circle cx={x + node * 0.72} cy={y - node * 0.72} r={13} fill="#ffffff" stroke={color} strokeWidth="2.5" />
              <text x={x + node * 0.72} y={y - node * 0.72 + 5.5} textAnchor="middle" fontSize="16" fontWeight="700" fill="#1e293b">{i + 1}</text>
              {lines.map((line, k) => (
                <text key={k} x={lx} y={ly + 5 + (k - (lines.length - 1) / 2) * 24} textAnchor={anchor} fontSize="16" fontWeight="600" fill="currentColor">{line}</text>
              ))}
            </g>
          );
        })}
      </svg>
      {p.phases.some((ph) => ph.note) && (
        <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {p.phases.map((ph, i) => (
            <li key={i}><span className="font-semibold">{i + 1}. {ph.label}</span>{ph.note ? ` – ${ph.note}` : ""}</li>
          ))}
        </ol>
      )}
      <Caption caption={caption} />
    </figure>
  );
}

/* ------------------------------------------------------------ labeledShape */

const labelOf = (v: number | string | undefined, unit?: string) =>
  v === undefined ? "" : typeof v === "number" ? `${v}${unit ? ` ${unit}` : ""}` : v;
const numOf = (v: number | string | undefined) => {
  if (typeof v === "number") return v;
  const m = typeof v === "string" ? /-?\d+(?:[.,]\d+)?/.exec(v) : null;
  return m ? Number(m[0].replace(",", ".")) : undefined;
};

/** Proportional sizes that always fit: the larger side gets `max`, the smaller never below 35 %. */
function fitSizes(values: Array<number | undefined>, max: number): number[] {
  const known = values.filter((v): v is number => typeof v === "number" && v > 0);
  const top = known.length ? Math.max(...known) : 1;
  return values.map((v) => (typeof v === "number" && v > 0 ? Math.max(0.35, v / top) : 0.7) * max);
}

export function LabeledShapeAnim({ params, caption }: AnimProps) {
  const p = parseVisualParams("labeledShape", params) as LabeledShapeParams | null;
  if (!p) return null;
  const stroke = "currentColor";
  const tag = (x: number, y: number, text: string, anchor: "start" | "middle" | "end" = "middle") =>
    text ? <text x={x} y={y} textAnchor={anchor} fontSize="14" fontWeight="700" fill="currentColor">{text}</text> : null;
  let body: ReactNode;
  let view = "0 0 320 240";
  if (p.shape === "circle") {
    const r = 80;
    body = (
      <g>
        <circle cx={160} cy={120} r={r} fill={ACCENT} fillOpacity="0.12" stroke={stroke} strokeWidth="2.5" />
        <circle cx={160} cy={120} r={3.5} fill={stroke} />
        <line x1={160} y1={120} x2={160 + r} y2={120} stroke={ACCENT} strokeWidth="2.5" />
        {tag(160 + r / 2, 112, labelOf(p.radius, p.unit))}
      </g>
    );
  } else if (p.shape === "triangle") {
    const [w, h] = fitSizes([numOf(p.width), numOf(p.height)], 200);
    const x0 = 160 - w / 2, y0 = 200, apex = { x: 160 - w * 0.15, y: y0 - Math.min(h, 170) };
    const v = p.vertices ?? [];
    body = (
      <g>
        <polygon points={`${x0},${y0} ${x0 + w},${y0} ${apex.x},${apex.y}`} fill={ACCENT} fillOpacity="0.12" stroke={stroke} strokeWidth="2.5" />
        <line x1={apex.x} y1={apex.y} x2={apex.x} y2={y0} stroke={ACCENT} strokeWidth="2" strokeDasharray="5 4" />
        <rect x={apex.x} y={y0 - 10} width={10} height={10} fill="none" stroke={ACCENT} strokeWidth="1.5" />
        {tag(160, y0 + 22, labelOf(p.width, p.unit))}
        {tag(apex.x + 8, (apex.y + y0) / 2, labelOf(p.height, p.unit), "start")}
        {v[0] && tag(x0 - 6, y0 + 4, v[0], "end")}
        {v[1] && tag(x0 + w + 6, y0 + 4, v[1], "start")}
        {v[2] && tag(apex.x, apex.y - 8, v[2])}
      </g>
    );
  } else if (p.shape === "cuboid") {
    const [w, h, d] = fitSizes([numOf(p.width), numOf(p.height), numOf(p.depth)], 150);
    const dx = d * 0.5, dy = d * 0.35;
    const x0 = 160 - (w + dx) / 2, y0 = 40 + dy + (170 - h - dy) / 2 + h;
    const front = `${x0},${y0} ${x0 + w},${y0} ${x0 + w},${y0 - h} ${x0},${y0 - h}`;
    const top = `${x0},${y0 - h} ${x0 + w},${y0 - h} ${x0 + w + dx},${y0 - h - dy} ${x0 + dx},${y0 - h - dy}`;
    const side = `${x0 + w},${y0} ${x0 + w + dx},${y0 - dy} ${x0 + w + dx},${y0 - h - dy} ${x0 + w},${y0 - h}`;
    const layers = p.layers ?? 0;
    view = "0 0 320 250";
    body = (
      <g strokeLinejoin="round">
        <polygon points={front} fill={ACCENT} fillOpacity="0.16" stroke={stroke} strokeWidth="2.5" />
        <polygon points={top} fill={ACCENT} fillOpacity="0.28" stroke={stroke} strokeWidth="2.5" />
        <polygon points={side} fill={ACCENT} fillOpacity="0.08" stroke={stroke} strokeWidth="2.5" />
        {Array.from({ length: Math.max(0, layers - 1) }, (_, k) => {
          const y = y0 - (h * (k + 1)) / layers;
          return <polyline key={k} points={`${x0},${y} ${x0 + w},${y} ${x0 + w + dx},${y - dy}`} fill="none" stroke={stroke} strokeOpacity="0.4" strokeWidth="1.2" />;
        })}
        {tag(x0 + w / 2, y0 + 22, labelOf(p.width, p.unit))}
        {tag(x0 - 8, y0 - h / 2 + 5, labelOf(p.height, p.unit), "end")}
        {tag(x0 + w + dx / 2 + 8, y0 - dy / 2 + 12, labelOf(p.depth, p.unit), "start")}
      </g>
    );
  } else {
    const square = p.shape === "square";
    const [w, h] = square ? [180, 180] : fitSizes([numOf(p.width), numOf(p.height)], 210);
    const x0 = 160 - w / 2, y0 = 120 - Math.min(h, 180) / 2, hh = Math.min(h, 180);
    const v = p.vertices ?? [];
    body = (
      <g>
        <rect x={x0} y={y0} width={w} height={hh} fill={ACCENT} fillOpacity="0.12" stroke={stroke} strokeWidth="2.5" />
        {tag(160, y0 + hh + 22, labelOf(p.width, p.unit))}
        {tag(x0 - 8, y0 + hh / 2 + 5, labelOf(square ? p.width : p.height, p.unit), "end")}
        {v.slice(0, 4).map((name, k) => {
          const pts = [[x0, y0 + hh], [x0 + w, y0 + hh], [x0 + w, y0], [x0, y0]][k];
          return <text key={k} x={pts[0] + (k === 0 || k === 3 ? -6 : 6)} y={pts[1] + (k < 2 ? 16 : -6)} textAnchor={k === 0 || k === 3 ? "end" : "start"} fontSize="14" fontWeight="700" fill="currentColor">{name}</text>;
        })}
      </g>
    );
  }
  return (
    <figure className={FRAME} data-anim="labeledShape">
      <svg viewBox={view} className="w-full h-auto max-w-md mx-auto block" role="img" aria-label={caption}>{body}</svg>
      {p.note && <p className="text-sm mt-1">{p.note}</p>}
      <Caption caption={caption} />
    </figure>
  );
}

/* ---------------------------------------------------------------- barChart */

export function BarChartAnim({ params, caption }: AnimProps) {
  const p = parseVisualParams("barChart", params) as BarChartParams | null;
  if (!p) return null;
  const W = 340, H = 240, left = 12, right = 12, top = 30, bottom = 56;
  const max = Math.max(...p.bars.map((b) => b.value), 1);
  const avg = p.average === true ? p.bars.reduce((s, b) => s + b.value, 0) / p.bars.length : typeof p.average === "number" ? p.average : undefined;
  const slot = (W - left - right) / p.bars.length, bw = Math.min(56, slot * 0.62);
  const y = (v: number) => top + (H - top - bottom) * (1 - v / max);
  const fmt = (v: number) => `${Math.round(v * 100) / 100}`.replace(".", ",");
  return (
    <figure className={FRAME} data-anim="barChart">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-w-md mx-auto block" role="img" aria-label={caption}>
        <line x1={left} y1={H - bottom} x2={W - right} y2={H - bottom} stroke="currentColor" strokeOpacity="0.5" />
        {p.bars.map((b, i) => {
          const x = left + slot * i + (slot - bw) / 2;
          return (
            <g key={i}>
              <rect x={x} y={y(b.value)} width={bw} height={H - bottom - y(b.value)} rx="4" fill={PALETTE[i % PALETTE.length]} />
              <text x={x + bw / 2} y={y(b.value) - 6} textAnchor="middle" fontSize="15" fontWeight="700" fill="currentColor">{fmt(b.value)}</text>
              {twoLines(b.label, 10).map((line, k) => (
                <text key={k} x={x + bw / 2} y={H - bottom + 20 + k * 18} textAnchor="middle" fontSize="15" fill="currentColor">{line}</text>
              ))}
            </g>
          );
        })}
        {avg !== undefined && avg <= max && (
          <line x1={left} y1={y(avg)} x2={W - right} y2={y(avg)} stroke="#ef4444" strokeWidth="2.5" strokeDasharray="7 5" />
        )}
      </svg>
      {/* Az átlag felirata a rajz alatt: az oszlopok értékcímkéivel így sosem fedik egymást (mérve: „480” × „átlag”). */}
      {avg !== undefined && avg <= max && (
        <p className="mt-1 text-sm font-semibold text-red-600 dark:text-red-400"><span aria-hidden="true">– – </span>átlag: {fmt(avg)}{p.unit ? ` ${p.unit}` : ""}</p>
      )}
      <Caption caption={caption} />
    </figure>
  );
}

/* -------------------------------------------------------------------- venn */

export function VennAnim({ params, caption }: AnimProps) {
  const p = parseVisualParams("venn", params) as VennParams | null;
  if (!p) return null;
  const three = p.sets.length === 3;
  const circles = three
    ? [{ x: 140, y: 110 }, { x: 220, y: 110 }, { x: 180, y: 175 }]
    : [{ x: 135, y: 130 }, { x: 225, y: 130 }];
  const r = three ? 70 : 85;
  const spots: Record<string, { x: number; y: number }> = three
    ? { A: { x: 112, y: 92 }, B: { x: 248, y: 92 }, C: { x: 180, y: 212 }, AB: { x: 180, y: 84 }, AC: { x: 142, y: 160 }, BC: { x: 218, y: 160 }, ABC: { x: 180, y: 132 }, none: { x: 330, y: 238 } }
    : { A: { x: 100, y: 135 }, B: { x: 260, y: 135 }, AB: { x: 180, y: 135 }, none: { x: 330, y: 238 } };
  const labelPos = three ? [{ x: 88, y: 34 }, { x: 272, y: 34 }, { x: 180, y: 258 }] : [{ x: 110, y: 34 }, { x: 250, y: 34 }];
  return (
    <figure className={FRAME} data-anim="venn">
      <svg viewBox={`0 0 360 ${three ? 270 : 250}`} className="w-full h-auto max-w-md mx-auto block" role="img" aria-label={caption}>
        <rect x="4" y="4" width="352" height={three ? 262 : 242} rx="10" fill="none" stroke="currentColor" strokeOpacity="0.35" />
        {p.universe && <text x="14" y={three ? 256 : 234} fontSize="15" fill="currentColor" fillOpacity="0.85">{p.universe}</text>}
        {circles.map((ci, i) => (
          <circle key={i} cx={ci.x} cy={ci.y} r={r} fill={PALETTE[i]} fillOpacity="0.22" stroke={PALETTE[i]} strokeWidth="2.5" />
        ))}
        {p.sets.map((name, i) => (
          <text key={i} x={labelPos[i].x} y={labelPos[i].y} textAnchor="middle" fontSize="15" fontWeight="700" fill="currentColor">{name}</text>
        ))}
        {Object.entries(p.regions ?? {}).filter(([key]) => spots[key]).map(([key, v]) => (
          <text key={key} x={spots[key].x} y={spots[key].y} textAnchor={key === "none" ? "end" : "middle"} fontSize="16" fontWeight="700" fill="currentColor">{String(v)}</text>
        ))}
      </svg>
      <Caption caption={caption} />
    </figure>
  );
}

/* -------------------------------------------------------------- numberLine */

export function RichNumberLineAnim({ params, caption }: AnimProps) {
  const p = parseVisualParams("numberLine", params) as NumberLineParams | null;
  if (!p) return null;
  const W = 340, pad = 26, base = 66;
  const x = (v: number) => pad + ((v - p.from) / (p.to - p.from)) * (W - 2 * pad);
  const step = p.step ?? (p.to - p.from) / 10;
  const ticks = Array.from({ length: Math.floor((p.to - p.from) / step + 1e-9) + 1 }, (_, i) => p.from + i * step);
  const labelEvery = Math.ceil(ticks.length / 7);
  const fmt = (v: number) => `${Math.round(v * 100) / 100}`.replace(".", ",");
  // Élő mérés (Opus 5.5-ábra, 2026-09-24): a jobb szélső jelölés felirata („1 évszázad”) levágódott.
  // A felirat középpontját a becsült szélesség felével a rajzterületen belül tartjuk.
  const inside = (cx: number, text: string, size: number) => {
    const half = (text.length * size * 0.56) / 2;
    return Math.min(W - 4 - half, Math.max(4 + half, cx));
  };
  // Élő mérés (Opus 5.5, 2026-09-24): tíz szomszédos „1 évszázad” ugrás felirata egymásra csúszott. A felirat
  // előbb a saját helyére, ütközéskor egy sorral feljebb kerül; ha ott is ütközne, csak az ív marad.
  const placed: Array<{ x0: number; x1: number; y: number }> = [];
  // Ugyanaz a felirat ≥ 3 ugráson (pl. tízszer „1 évszázad”): elég egyszer kiírni, az ívek mutatják az ismétlést.
  const labelCount = new Map<string, number>();
  for (const j of p.jumps ?? []) if (j.label) labelCount.set(j.label, (labelCount.get(j.label) ?? 0) + 1);
  const shown = new Set<string>();
  const jumpLabels = (p.jumps ?? []).map((j, i) => {
    const x0 = x(j.from), x1 = x(j.to), h = Math.min(40, Math.abs(x1 - x0) / 2 + 10);
    if (!j.label || ((labelCount.get(j.label) ?? 0) >= 3 && shown.has(j.label))) return { j, i, x0, x1, h, label: null };
    const cx = inside((x0 + x1) / 2, j.label, 14), half = (j.label.length * 14 * 0.56) / 2;
    for (const y of [base - 8 - h * 0.8, base - 8 - h * 0.8 - 20]) {
      if (y < 14) continue;
      if (!placed.some((b) => Math.abs(b.y - y) < 20 && Math.min(b.x1, cx + half) - Math.max(b.x0, cx - half) > 0)) {
        placed.push({ x0: cx - half, x1: cx + half, y });
        shown.add(j.label);
        return { j, i, x0, x1, h, label: { x: cx, y } };
      }
    }
    return { j, i, x0, x1, h, label: null };
  });
  return (
    <figure className={FRAME} data-anim="numberLine">
      <svg viewBox={`0 0 ${W} 124`} className="w-full h-auto max-w-lg mx-auto block" role="img" aria-label={caption}>
        <line x1={pad - 8} y1={base} x2={W - pad + 10} y2={base} stroke="currentColor" strokeWidth="2" />
        <path d={`M${W - pad + 10} ${base} l-8 -5 v10 z`} fill="currentColor" />
        {p.highlightTo !== undefined && (
          <line x1={x(p.from)} y1={base} x2={x(Math.min(p.to, p.highlightTo))} y2={base} stroke={ACCENT} strokeWidth="6" strokeLinecap="round" />
        )}
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={x(v)} y1={base - 6} x2={x(v)} y2={base + 6} stroke="currentColor" strokeWidth="1.6" />
            {i % labelEvery === 0 && <text x={inside(x(v), fmt(v), 14)} y={base + 24} textAnchor="middle" fontSize="14" fill="currentColor">{fmt(v)}</text>}
          </g>
        ))}
        {jumpLabels.map(({ j, i, x0, x1, h, label }) => (
          <g key={`j${i}`}>
            <path d={`M${x0} ${base - 4} Q${(x0 + x1) / 2} ${base - 4 - h * 1.6} ${x1} ${base - 4}`} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth="2" />
            {label && <text x={label.x} y={label.y} textAnchor="middle" fontSize="14" fontWeight="700" fill="currentColor">{j.label}</text>}
          </g>
        ))}
        {(p.marks ?? []).map((m, i) => (
          <g key={`m${i}`}>
            <circle cx={x(m.value)} cy={base} r={5.5} fill={ACCENT} stroke="#ffffff" strokeWidth="1.5" />
            {m.label && <text x={inside(x(m.value), m.label, 14)} y={base + 46} textAnchor="middle" fontSize="14" fontWeight="700" fill="currentColor">{m.label}</text>}
          </g>
        ))}
      </svg>
      <Caption caption={caption} />
    </figure>
  );
}

/* ------------------------------------------------------------ illustration */

/**
 * Spec 2026-09-24 (2. szelet): a modell SVG-rajza. A szerver beillesztéskor már megtisztította; a kliens
 * a megjelenítés előtt UGYANAZZAL a tisztítóval újra lefuttatja (mélységi védelem) — ami nem megy át,
 * az nem jelenik meg.
 */
export function IllustrationAnim({ params, caption }: AnimProps) {
  const check = sanitizeIllustration(params.svg);
  if (!check.ok) return null;
  return (
    <figure className={FRAME} data-anim="illustration">
      <div
        className="mx-auto max-w-lg [&>svg]:block [&>svg]:h-auto [&>svg]:w-full"
        aria-label={caption}
        // A tartalom a shared/illustration-svg.ts allowlistjén átment SVG (nincs script, esemény, link, stílus).
        dangerouslySetInnerHTML={{ __html: check.svg }}
      />
      <Caption caption={caption} />
    </figure>
  );
}
