import { useId, useRef, useState } from "react";
import { labNumber, triangleAreaLabParamsSchema, triangleAreaScene, type TriangleAreaLabParams } from "@shared/triangle-area-lab";

const PREDICTIONS = ["Nő a terület", "Ugyanannyi marad", "Csökken a terület"];

function TriangleDiagram({ params, apex = 0.5, ratio = 1 }: { params: TriangleAreaLabParams; apex?: number; ratio?: number }) {
  const id = useId().replace(/:/g, "");
  const { a, b, c, foot, height, external } = triangleAreaScene(params, apex, ratio);
  return <svg className="triangle-lab-diagram" viewBox="0 0 400 260" role="img" aria-label={`Háromszög: alap ${labNumber(params.base)} ${params.unit}, merőleges magasság ${labNumber(height)} ${params.unit}.${external ? " A talppont az alap meghosszabbításán van." : ""}`}>
    <defs>
      <pattern id={`${id}-grid`} width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#cbd5e1" strokeWidth=".6" /></pattern>
      <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#6ee7b7" stopOpacity=".8" /><stop offset="1" stopColor="#38bdf8" stopOpacity=".3" /></linearGradient>
    </defs>
    <rect x="8" y="8" width="384" height="244" rx="18" fill="#f0fdfa" />
    <rect x="8" y="8" width="384" height="244" rx="18" fill={`url(#${id}-grid)`} />
    <line x1="20" y1={c.y} x2="380" y2={c.y} stroke="#64748b" strokeDasharray="4 6" />
    <line x1="20" y1={a.y} x2="380" y2={a.y} stroke="#64748b" strokeDasharray="4 6" />
    <polygon points={`${a.x},${a.y} ${b.x},${b.y} ${c.x},${c.y}`} fill={`url(#${id}-fill)`} stroke="#0f766e" strokeWidth="2.5" />
    <line x1={c.x} y1={c.y} x2={foot.x} y2={foot.y} stroke="#a21caf" strokeWidth="2.5" strokeDasharray="6 4" />
    <path d={`M${foot.x + 10} ${foot.y}v-10h-10`} stroke="#a21caf" strokeWidth="1.5" fill="none" />
    <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#0369a1" strokeWidth="4" />
    <circle cx={c.x} cy={c.y} r="6" fill="#0f766e" stroke="white" strokeWidth="2" />
    <text x={c.x} y={c.y - 12} textAnchor="middle" fill="#134e4a">C</text>
    <text x={200} y="244" textAnchor="middle" fill="#075985">a = {labNumber(params.base)} {params.unit}</text>
    <text x={foot.x + 14} y={(foot.y + c.y) / 2} fill="#86198f">m = {labNumber(height)}</text>
  </svg>;
}

function ValidTriangleLab({ params, caption }: { params: TriangleAreaLabParams; caption: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [step, setStep] = useState(0);
  const [prediction, setPrediction] = useState<number | null>(null);
  const [apex, setApex] = useState(0.5);
  const [ratio, setRatio] = useState(1);
  const [moved, setMoved] = useState(false);
  const [resized, setResized] = useState(false);
  const [explanation, setExplanation] = useState("");
  const [showSample, setShowSample] = useState(false);
  const scene = triangleAreaScene(params, apex, ratio);
  return <figure className="triangle-lab-preview" data-anim="triangleArea">
    <div><span className="triangle-lab-eyebrow">Felfedező labor</span><h3>Más alak. Ugyanakkora terület?</h3><figcaption>{caption}</figcaption>
      <button type="button" onClick={() => dialog.current?.showModal()}>Kipróbálom a laborban <span aria-hidden="true">↗</span></button></div>
    <TriangleDiagram params={params} />
    <dialog ref={dialog} className="triangle-lab" data-step={step} aria-labelledby={titleId}>
      <header><div><span className="triangle-lab-eyebrow">{step + 1} / 3 · {step === 0 ? "Jósolj" : step === 1 ? "Kísérletezz" : "Magyarázd el"}</span><h2 id={titleId}>Háromszög-labor</h2></div>
        <button type="button" className="triangle-lab-close" aria-label="Vissza a tananyaghoz" onClick={() => dialog.current?.close()}>✕</button></header>
      <div className="triangle-lab-body">
        <div className="triangle-lab-picture"><TriangleDiagram params={params} apex={apex} ratio={ratio} />
          <output aria-live="polite" data-lab-area>T = {labNumber(params.base)} × {labNumber(scene.height)} / 2 = <strong>{labNumber(scene.area)} {params.unit}²</strong></output>
        </div>
        <section className="triangle-lab-panel" aria-label="Laborfeladat">
          {step === 0 && <><h3>Oldalra húzzuk C-t. Mi változik?</h3><p>Az alap és a magasság ugyanakkora marad.</p>
            <div className="triangle-lab-choices">{PREDICTIONS.map((p, i) => <button type="button" key={p} aria-pressed={prediction === i} onClick={() => setPrediction(i)}>{p}</button>)}</div></>}
          {step === 1 && <><h3>Mozgasd, és figyeld a területet!</h3>
            <label>Csúcs oldalirányú helyzete<input aria-label="Csúcs oldalirányú helyzete" type="range" min="-0.4" max="1.4" step="0.1" value={apex} onChange={e => { setApex(Number(e.target.value)); setMoved(true); }} /></label>
            <label>Magasság: {labNumber(scene.height)} {params.unit}<input aria-label="Magasság" type="range" min="0.5" max="1.5" step="0.25" value={ratio} onChange={e => { setRatio(Number(e.target.value)); setResized(true); }} /></label>
            <p className="triangle-lab-note">{scene.external ? "A magasság most az alap meghosszabbítására merőleges." : "A lila szakasz a merőleges magasság; nem a ferde oldal."}</p>
            {(!moved || !resized) && <p className="triangle-lab-hint">{!moved ? "Először csúsztasd oldalra a csúcsot." : "Most változtasd meg a magasságot is."}</p>}</>}
          {step === 2 && <><h3>Mi változtatja meg a területet?</h3><p>A jóslatod: <strong>{PREDICTIONS[prediction!]}</strong>.</p>
            <label>Mondd el, vagy írd le a magyarázatod!<textarea value={explanation} maxLength={1500} onChange={e => setExplanation(e.target.value)} /></label>
            <button type="button" aria-expanded={showSample} onClick={() => setShowSample(!showSample)}>Összevetem a magyarázattal</button>
            {showSample && <p className="triangle-lab-note">Rögzített alap és magasság mellett az oldalra húzott csúcs nem változtatja meg a területet. Azonos alapnál a kétszeres magassághoz kétszeres terület tartozik: T = a × m / 2.</p>}
          </>}
        </section>
      </div>
      <footer><button type="button" disabled={step === 0} onClick={() => setStep(step - 1)}>Vissza</button>
        <button type="button" className="triangle-lab-primary" disabled={step === 0 ? prediction === null : step === 1 ? !moved || !resized : false}
          onClick={() => step === 2 ? dialog.current?.close() : setStep(step + 1)}>{step === 0 ? "Megvizsgálom" : step === 1 ? "Elmagyarázom" : "Vissza a leckéhez"}</button></footer>
    </dialog>
  </figure>;
}

export function TriangleAreaLab({ params, caption }: { params: Record<string, unknown>; caption: string }) {
  const parsed = triangleAreaLabParamsSchema.safeParse(params);
  if (!parsed.success) return <p role="status">A labor adatai hibásak. Folytasd a kidolgozott példával!</p>;
  return <ValidTriangleLab key={JSON.stringify(parsed.data)} params={parsed.data} caption={caption} />;
}
