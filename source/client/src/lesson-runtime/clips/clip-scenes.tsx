import type { CSSProperties } from "react";
import type { ClipScene, ClipVisual } from "@shared/lesson-clip";

/**
 * A kisfilm „színpada” (spec 2026-11-10-fejezet-kisfilmek, 4.8): hat rögzített képsablon és a narrátor-kabala. Minden kisfilm ezekből
 * épül, ezért a stílus leckétől és gyártótól függetlenül azonos. A mozgás CSS-kulcskocka (lesson-clips.css); a darabok egymás után,
 * késleltetve jelennek meg, hogy a szem az éppen elhangzó elemre essen.
 */
const delay = (seconds: number): CSSProperties => ({ animationDelay: `${seconds}s` });

function Narrator({ speaking }: { speaking: boolean }) {
  return <div className="clip-narrator" data-speaking={speaking} aria-hidden>
    <svg viewBox="0 0 120 130">
      <g className="clip-body">
        <ellipse cx="60" cy="122" rx="34" ry="6" fill="rgba(29,37,69,.18)" />
        <path d="M20 70 Q20 20 60 20 Q100 20 100 70 Q100 118 60 118 Q20 118 20 70Z" fill="#ff6b5e" stroke="#1d2545" strokeWidth="5" />
        <path d="M34 22 L28 4 L48 18Z M86 22 L92 4 L72 18Z" fill="#ff6b5e" stroke="#1d2545" strokeWidth="5" strokeLinejoin="round" />
        <ellipse cx="60" cy="86" rx="24" ry="22" fill="#fff8ea" />
        <circle cx="44" cy="58" r="13" fill="#fff" stroke="#1d2545" strokeWidth="4" />
        <circle cx="76" cy="58" r="13" fill="#fff" stroke="#1d2545" strokeWidth="4" />
        <circle className="clip-eye" cx="46" cy="59" r="6" fill="#1d2545" />
        <circle className="clip-eye" cx="74" cy="59" r="6" fill="#1d2545" />
        <path d="M54 72 L66 72 L60 80Z" fill="#ffc93c" stroke="#1d2545" strokeWidth="3" strokeLinejoin="round" />
        <ellipse className="clip-mouth" cx="60" cy="90" rx="8" ry="5" fill="#1d2545" />
      </g>
    </svg>
  </div>;
}

function Visual({ visual }: { visual: ClipVisual }) {
  switch (visual.kind) {
    case "title":
      return <div className="clip-v-title"><span className="clip-emoji clip-pop">{visual.emoji}</span><p className="clip-text clip-rise" style={delay(0.35)}>{visual.text}</p></div>;
    case "idea":
      return <div className="clip-v-idea"><span className="clip-emoji clip-pop">{visual.emoji}</span><p className="clip-text clip-from-right" style={delay(0.4)}>{visual.text}</p></div>;
    case "formula":
      return <div className="clip-v-formula">
        <div className="clip-parts">{visual.parts.map((part, i) => <div key={i} className="clip-part clip-pop" style={delay(0.3 + i * 1.1)}><b>{part.t}</b>{part.note && <span>{part.note}</span>}</div>)}</div>
        {visual.caption && <p className="clip-caption-in clip-rise" style={delay(0.5 + visual.parts.length * 1.1)}>{visual.caption}</p>}
      </div>;
    case "steps":
      return <div className="clip-v-steps">{visual.items.map((item, i) => <div key={i} className="clip-step clip-from-left" style={delay(0.3 + i * 1.3)}>
        {item.emoji ? <i data-emoji>{item.emoji}</i> : <i>{i + 1}</i>}<span>{item.text}</span>
      </div>)}</div>;
    case "compare":
      return <div className="clip-v-compare">
        <div className="clip-side clip-from-left" style={delay(0.2)}><span className="clip-emoji">{visual.left.emoji}</span><span>{visual.left.label}</span></div>
        <span className="clip-vs clip-pop" style={delay(1.1)}>↔</span>
        <div className="clip-side clip-from-right" style={delay(1.4)}><span className="clip-emoji">{visual.right.emoji}</span><span>{visual.right.label}</span></div>
        {visual.verdict && <p className="clip-verdict clip-pop" style={delay(2.6)}>{visual.verdict}</p>}
      </div>;
    case "motion":
      return <div className="clip-v-motion">
        <div className="clip-track" data-effect={visual.effect}><span className="clip-actor">{visual.actor}</span></div>
        <p className="clip-caption-in clip-rise" style={delay(0.4)}>{visual.caption}</p>
      </div>;
  }
}

/** Egy jelenet képe. A `sceneKey` váltása újraindítja a belépő mozgásokat. */
export function ClipStage({ scene, speaking, sceneKey }: { scene: ClipScene; speaking: boolean; sceneKey: string }) {
  return <div className="clip-stage" data-kind={scene.visual.kind} data-testid="clip-stage">
    <div className="clip-board" key={sceneKey}><Visual visual={scene.visual} /></div>
    <Narrator speaking={speaking} />
  </div>;
}
