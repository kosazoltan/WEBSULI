import type { CSSProperties } from "react";
import type { ClipOverlay as Overlay } from "@shared/lesson-clip";
import type { Section } from "@shared/lesson-schema";
import { ANIMATE_REGISTRY } from "../blocks/animate-blocks";

/**
 * A v2 kisfilm PONTOS ábrái (spec 2026-11-10-fejezet-kisfilmek-v2, 3. és 8.): a rajzolt képre úszó, programból rajzolt elemek. Minden
 * szám és jelölés itt jelenik meg — a rajzon soha. A darabok a jelenet idejéhez (`ms`) arányosan érkeznek, hogy akkor látszódjanak,
 * amikor elhangzanak.
 */
const at = (ms: number, fraction: number): CSSProperties => ({ animationDelay: `${Math.round(ms * fraction)}ms` });
const spread = (ms: number, index: number, count: number): CSSProperties => at(ms, 0.12 + (0.62 * index) / Math.max(1, count));

function Graph({ overlay, ms }: { overlay: Extract<Overlay, { kind: "graph" }>; ms: number }) {
  const xs = overlay.points.map((p) => p[0]), ys = overlay.points.map((p) => p[1]);
  const x0 = Math.min(0, ...xs), x1 = Math.max(...xs), y0 = Math.min(0, ...ys), y1 = Math.max(...ys);
  const px = (x: number) => 34 + ((x - x0) / (x1 - x0 || 1)) * 190;
  const py = (y: number) => 104 - ((y - y0) / (y1 - y0 || 1)) * 88;
  const fmt = (n: number) => String(n).replace(".", ",");
  return <svg className="clip2-graph" viewBox="0 0 240 130" role="img" aria-label={`Grafikon: ${overlay.yLabel} – ${overlay.xLabel}`}>
    <path className="clip2-axis" d="M34 10 V104 H232" />
    {[x0, x1].map((x) => <text key={`x${x}`} className="clip2-tick" x={px(x)} y="116" textAnchor="middle">{fmt(x)}</text>)}
    {[y0, y1].map((y) => <text key={`y${y}`} className="clip2-tick" x="30" y={py(y) + 3} textAnchor="end">{fmt(y)}</text>)}
    <text className="clip2-axis-label" x="232" y="127" textAnchor="end">{overlay.xLabel}</text>
    <text className="clip2-axis-label" x="4" y="9">{overlay.yLabel}</text>
    <polyline className="clip2-line" pathLength={1} points={overlay.points.map(([x, y]) => `${px(x)},${py(y)}`).join(" ")} style={{ animationDuration: `${Math.round(ms * 0.6)}ms`, animationDelay: `${Math.round(ms * 0.12)}ms` }} />
    {overlay.points.map(([x, y], i) => <circle key={i} className="clip2-dot clip2-pop" cx={px(x)} cy={py(y)} r="3.4" style={at(ms, 0.12 + (0.6 * i) / (overlay.points.length - 1))} />)}
  </svg>;
}

const DIRS = { right: [1, 0], left: [-1, 0], up: [0, -1], down: [0, 1] } as const;
function Vectors({ overlay, ms }: { overlay: Extract<Overlay, { kind: "vectors" }>; ms: number }) {
  return <svg className="clip2-vectors" viewBox="0 0 260 150" role="img" aria-label={`Erők: ${overlay.arrows.map((a) => a.label).join(", ")}`}>
    <defs><marker id="clip2-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" className="clip2-head" /></marker></defs>
    <rect className="clip2-body" x="100" y="55" width="60" height="40" rx="5" />
    <text className="clip2-body-label" x="130" y="79" textAnchor="middle">{overlay.body}</text>
    {overlay.arrows.map((arrow, i) => {
      const [dx, dy] = DIRS[arrow.dir];
      const len = 16 + arrow.size * 16;
      const sx = 130 + dx * 32, sy = 75 + dy * 22;
      const ex = sx + dx * len, ey = sy + dy * (len * 0.7);
      const anchor = dx > 0 ? "start" : dx < 0 ? "end" : "middle";
      // Az azonos irányú nyilak felirata nem fedi egymást: a második a nyíl másik oldalára kerül.
      const same = overlay.arrows.slice(0, i).filter((a) => a.dir === arrow.dir).length;
      const ly = dy === 0 ? ey + (same ? 14 : -6) : ey + dy * 10 + (dy < 0 ? 0 : 4);
      return <g key={i} className="clip2-pop" style={spread(ms, i, overlay.arrows.length)}>
        <line className="clip2-arrow" x1={sx} y1={sy + (dy === 0 ? same * 8 : 0)} x2={ex} y2={ey + (dy === 0 ? same * 8 : 0)} markerEnd="url(#clip2-head)" />
        <text className="clip2-arrow-label" x={dy === 0 ? ex - dx * 2 : ex + 6} y={ly} textAnchor={dy === 0 ? (dx > 0 ? "end" : "start") : anchor}>{arrow.label}</text>
      </g>;
    })}
  </svg>;
}

export function ClipOverlay({ overlay, ms, section }: { overlay: Overlay; ms: number; section?: Section }) {
  switch (overlay.kind) {
    case "title":
      return <p className="clip2-title clip2-rise">{overlay.text}</p>;
    case "formula":
      return <div className="clip2-formula">
        <div className="clip2-parts">{overlay.parts.map((part, i) => <div key={i} className="clip2-part clip2-pop" style={spread(ms, i, overlay.parts.length)}><b>{part.t}</b>{part.note && <span>{part.note}</span>}</div>)}</div>
        {overlay.caption && <p className="clip2-note clip2-rise" style={at(ms, 0.78)}>{overlay.caption}</p>}
      </div>;
    case "steps":
      return <ol className="clip2-steps">{overlay.items.map((item, i) => <li key={i} className="clip2-rise" style={spread(ms, i, overlay.items.length)}><i>{i + 1}</i><span>{item.text}</span></li>)}</ol>;
    case "compare":
      return <div className="clip2-compare">
        <p className="clip2-side clip2-rise" style={at(ms, 0.12)}>{overlay.left.label}</p>
        <p className="clip2-side clip2-rise" data-side="right" style={at(ms, 0.4)}>{overlay.right.label}</p>
        {overlay.verdict && <p className="clip2-verdict clip2-pop" style={at(ms, 0.72)}>{overlay.verdict}</p>}
      </div>;
    case "graph":
      return <Graph overlay={overlay} ms={ms} />;
    case "vectors":
      return <Vectors overlay={overlay} ms={ms} />;
    case "lessonVisual": {
      const block = section?.blocks[overlay.blockIndex];
      if (block?.kind !== "animate") return null;
      const Anim = ANIMATE_REGISTRY[block.animKind];
      return <div className="clip2-visual"><Anim params={block.params} caption="" /></div>;
    }
  }
}
