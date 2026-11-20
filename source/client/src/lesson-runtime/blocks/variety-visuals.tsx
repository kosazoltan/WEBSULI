/**
 * Spec docs/specs/2026-11-20-tgm-valtozatossag-abrak.md (14. szakasz): szebb, az évfolyamsáv színeit használó ábrák.
 * - A négy, élesben soha nem használt fajta (tört, térkép, szóépítés, mondatrészek) megjelenítője — mindig ezek rajzolnak.
 * - A folyamat és az idővonal új megjelenése — csak a változatossági jelölővel mentett leckén (a hívó dönt, `animate-blocks.tsx`).
 * Szín kizárólag CSS-osztályból, a sáv tokenjeiből (`lesson-design.css`, `.vv-*`): kódba írt szín nincs. A modell paramétereit
 * tűrően olvassa: hibás érték → ésszerű alapérték vagy semmi, sosem kivétel.
 */
type Params = Record<string, unknown>;
type Props = { params: Params; caption: string };

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const TONES = ["vv-tone-a", "vv-tone-b", "vv-tone-c"] as const;

function Caption({ text, fallback }: { text: string; fallback: string }) {
  return <figcaption className="vv-caption">{text || fallback}</figcaption>;
}

/* ------------------------------------------------------------------ tört */

export function FractionVisual({ params, caption }: Props) {
  const denominator = Math.min(24, Math.max(2, Math.round(num(params.denominator, 2))));
  const numerator = Math.max(0, Math.round(num(params.numerator, 1)));
  const wholes = Math.min(3, Math.floor(numerator / denominator));
  const rest = numerator - wholes * denominator;
  const bars = [...Array.from({ length: wholes }, () => denominator), ...(rest > 0 || wholes === 0 ? [Math.min(rest, denominator)] : [])];
  const slice = (i: number, n: number) => {
    const a0 = (i / n) * 2 * Math.PI - Math.PI / 2;
    const a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2;
    const p = (a: number) => `${(50 + 42 * Math.cos(a)).toFixed(2)} ${(50 + 42 * Math.sin(a)).toFixed(2)}`;
    return `M50 50 L${p(a0)} A42 42 0 0 1 ${p(a1)} Z`;
  };
  const pieFilled = Math.min(denominator, wholes > 0 && rest === 0 ? denominator : rest);
  return (
    <figure className="vv-figure" data-anim="fraction">
      <div className="vv-fraction">
        <svg viewBox="0 0 100 100" className="vv-pie" role="img" aria-label={`${numerator}/${denominator}`}>
          {Array.from({ length: denominator }, (_, i) => (
            <path key={i} d={slice(i, denominator)} className={i < pieFilled ? "vv-fill-a" : "vv-fill-empty"} />
          ))}
        </svg>
        <div className="vv-fraction-number" aria-hidden="true">
          <span>{numerator}</span><span className="vv-fraction-line" /><span>{denominator}</span>
        </div>
      </div>
      <div className="vv-bars">
        {bars.map((filled, b) => (
          <div key={b} className="vv-bar" role="presentation">
            {Array.from({ length: denominator }, (_, i) => <span key={i} className={i < filled ? "vv-cell vv-cell-on" : "vv-cell"} />)}
          </div>
        ))}
      </div>
      <Caption text={caption} fallback="Tört" />
    </figure>
  );
}

/* ------------------------------------------------------------------ térkép */

export function MapVisual({ params, caption }: Props) {
  const spots = (Array.isArray(params.spots) ? params.spots : [])
    .filter((s): s is Params => !!s && typeof s === "object")
    .slice(0, 8)
    .map((s, i) => ({ label: str(s.label), x: Math.min(94, Math.max(6, num(s.x, 15 + i * 11))), y: Math.min(90, Math.max(10, num(s.y, 50))) }));
  if (!spots.length) return null;
  return (
    <figure className="vv-figure" data-anim="map">
      <div className="vv-map" role="img" aria-label={spots.map((s, i) => `${i + 1}. ${s.label}`).join(", ")}>
        {spots.map((s, i) => (
          <span key={i} className={`vv-marker ${TONES[i % TONES.length]}`} style={{ left: `${s.x}%`, top: `${s.y}%` }}>{i + 1}</span>
        ))}
      </div>
      <ol className="vv-legend">
        {spots.map((s, i) => (
          <li key={i}><span className={`vv-legend-dot ${TONES[i % TONES.length]}`}>{i + 1}</span>{s.label}</li>
        ))}
      </ol>
      <Caption text={caption} fallback="Térkép" />
    </figure>
  );
}

/* ------------------------------------------------------------------ szóépítés */

const WORD_PART = /^-?[\p{L}]+-?$/u;

export function WordBuilderVisual({ params, caption }: Props) {
  const parts = strings(params.parts).slice(0, 6);
  if (parts.length < 2) return null;
  // Az összeolvasott szó csak tiszta szórészeknél (betűk, legfeljebb kötőjellel a szélén) — különben nem találunk ki eredményt.
  const result = parts.length <= 5 && parts.every((p) => WORD_PART.test(p)) ? parts.map((p) => p.replace(/^-|-$/g, "")).join("") : "";
  return (
    <figure className="vv-figure" data-anim="wordBuilder">
      <div className="vv-word">
        {parts.map((part, i) => (
          <span key={i} className="vv-word-item">
            <span className={`vv-chip ${TONES[i % TONES.length]}`}>{part}</span>
            {i < parts.length - 1 && <span className="vv-op" aria-hidden="true">+</span>}
          </span>
        ))}
        {result && <span className="vv-word-item"><span className="vv-op" aria-hidden="true">=</span><span className="vv-chip vv-chip-result">{result}</span></span>}
      </div>
      <Caption text={caption} fallback="Szóépítés" />
    </figure>
  );
}

/* ------------------------------------------------------------------ mondatrészek */

export function SentencePartsVisual({ params, caption }: Props) {
  const parts = strings(params.parts).slice(0, 8).map((p) => {
    const m = /^\[([^\]]{1,24})\]\s*(.*)$/u.exec(p);
    return m ? { role: m[1], text: m[2] || m[1] } : { role: "", text: p };
  });
  if (!parts.length) return null;
  return (
    <figure className="vv-figure" data-anim="sentenceParts">
      <div className="vv-sentence">
        {parts.map((p, i) => (
          <span key={i} className={`vv-part ${TONES[i % TONES.length]}`}>
            {p.role && <span className="vv-role">{p.role}</span>}
            <span className="vv-part-text">{p.text}</span>
          </span>
        ))}
      </div>
      <Caption text={caption} fallback="Mondatrészek" />
    </figure>
  );
}

/* ------------------------------------------------------------------ folyamat és idővonal (jelölt lecke) */

export function ProcessVisual({ params, caption }: Props) {
  const steps = strings(params.steps).slice(0, 8);
  if (steps.length < 2) return null;
  return (
    <figure className="vv-figure" data-anim="process" data-style="v2">
      <ol className="vv-steps">
        {steps.map((step, i) => (
          <li key={i} className={`vv-step ${TONES[i % TONES.length]}`}><span className="vv-step-num">{i + 1}</span><span className="vv-step-text">{step}</span></li>
        ))}
      </ol>
      <Caption text={caption} fallback="Folyamat" />
    </figure>
  );
}

export function TimelineVisual({ params, caption }: Props) {
  const events = strings(params.events).slice(0, 12).map((e) => {
    const at = e.indexOf(": ");
    return at > 0 && at <= 24 ? { when: e.slice(0, at), what: e.slice(at + 2) } : { when: "", what: e };
  });
  if (events.length < 2) return null;
  return (
    <figure className="vv-figure" data-anim="timeline" data-style="v2">
      <ol className="vv-timeline">
        {events.map((e, i) => (
          <li key={i} className={`vv-event ${TONES[i % TONES.length]}`}>
            <span className="vv-event-dot" aria-hidden="true" />
            {e.when && <span className="vv-event-when">{e.when}</span>}
            <span className="vv-event-what">{e.what}</span>
          </li>
        ))}
      </ol>
      <Caption text={caption} fallback="Idővonal" />
    </figure>
  );
}
