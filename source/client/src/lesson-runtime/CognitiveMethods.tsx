import { useState, type PointerEvent } from "react";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { CognitiveMethod } from "@shared/lesson-experience";

const LABELS: Record<CognitiveMethod["kind"], string> = { prediction: "Jósolj!", gate: "Kapukérdés", myth: "Tévhitvadász", sorting: "Rendezd sorba!", causeEffect: "Ok és következmény", conflict: "Gondold újra!", selfCheck: "Önértékelés", popup: "Villámkérdés", timeline: "Lépésről lépésre", analogy: "Kapcsold össze!" };
function SortSteps({ steps, onDone }: { steps: string[]; onDone(): void }) {
  const [order, setOrder] = useState(() => steps.map((_, i) => i).reverse());
  const [ghost, setGhost] = useState<{ index: number; x: number; y: number } | null>(null);
  const [checked, setChecked] = useState(false);
  const move = (from: number, to: number) => {
    setOrder(old => { const next = [...old]; const [value] = next.splice(from, 1); next.splice(to, 0, value); return next; });
    setChecked(false);
  };
  const moveItem = (id: number, direction: number) => {
    setOrder(old => { const from = old.indexOf(id); const to = Math.max(0, Math.min(old.length - 1, from + direction)); const next = [...old]; next.splice(from, 1); next.splice(to, 0, id); return next; });
    setChecked(false);
  };
  const drop = (e: PointerEvent) => {
    if (!ghost) return;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-sort-position]");
    if (target && e.currentTarget.closest("[data-sort-list]")?.contains(target)) move(ghost.index, Number(target.dataset.sortPosition));
    setGhost(null);
  };
  const correct = order.every((n, i) => n === i);
  return <div data-sort-list><ol className="fusion-sort">{order.map((n, i) => <li key={n} data-sort-position={i}>
    <button aria-label={`${steps[n]} húzása`} className="fusion-drag" style={{ touchAction: "none" }} onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); setGhost({ index: i, x: e.clientX, y: e.clientY }); }} onPointerMove={e => { if (ghost) setGhost({ ...ghost, x: e.clientX, y: e.clientY }); }} onPointerUp={drop} onPointerCancel={() => setGhost(null)}><GripVertical size={18} /></button>
    <span>{steps[n]}</span><button aria-label={`${steps[n]} feljebb`} disabled={i === 0} onClick={() => moveItem(n, -1)}><ArrowUp size={18} /></button><button aria-label={`${steps[n]} lejjebb`} disabled={i === order.length - 1} onClick={() => moveItem(n, 1)}><ArrowDown size={18} /></button>
  </li>)}</ol>{ghost && <div className="fusion-drag-ghost" style={{ left: ghost.x + 8, top: ghost.y + 8 }}>{steps[order[ghost.index]]}</div>}
    <button className="lesson-outline-btn" onClick={() => { setChecked(true); if (correct) onDone(); }}>Sorrend ellenőrzése</button>
    {checked && <p role="status">{correct ? "Helyes sorrend!" : "Még nem ez a sorrend. Gondold át, mi következik miből."}</p>}
  </div>;
}

function MethodCard({ method: m, onGatePassed }: { method: CognitiveMethod; onGatePassed(id: string): void }) {
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState("");
  const [picked, setPicked] = useState<number | null>(null);
  const [step, setStep] = useState(1);
  const [confidence, setConfidence] = useState(3);
  const [popup, setPopup] = useState(false);
  const choice = <div className="fusion-choices">{m.options?.map((option, i) => <button className="lesson-option" key={option} onClick={() => { setPicked(i); if (i === m.correctIndex) { setRevealed(true); onGatePassed(m.id); } }}>{option}</button>)}{picked !== null && <p role="status">{picked === m.correctIndex ? m.answer : "Próbáld újra! Keresd meg a magyarázatot a Tananyag lapon."}</p>}</div>;
  return <section className="fusion-method lesson-block" data-method={m.kind}>
    <span className="fusion-eyebrow">{LABELS[m.kind]}</span><h3>{m.title}</h3><p>{m.prompt}</p>
    {m.kind === "prediction" && <><label className="fusion-label">Az én feltevésem<textarea value={answer} onChange={e => setAnswer(e.target.value)} maxLength={2000} /></label><button className="lesson-outline-btn" disabled={!answer.trim()} onClick={() => setRevealed(true)}>Összevetem a magyarázattal</button></>}
    {(m.kind === "gate" || m.kind === "myth") && choice}
    {m.kind === "sorting" && m.steps && <SortSteps steps={m.steps} onDone={() => setRevealed(true)} />}
    {(m.kind === "timeline" || m.kind === "causeEffect") && <><ol className="fusion-steps">{m.steps?.slice(0, step).map((s, i) => <li key={i}><span>{i + 1}</span>{s}</li>)}</ol><button className="lesson-outline-btn" disabled={step >= (m.steps?.length ?? 0)} onClick={() => { setStep(step + 1); if (step + 1 >= (m.steps?.length ?? 0)) setRevealed(true); }}>Következő lépés</button></>}
    {m.kind === "selfCheck" && <><label className="fusion-label">Mennyire tudnád elmagyarázni? {confidence} / 5<input type="range" min={1} max={5} value={confidence} onChange={e => { setConfidence(Number(e.target.value)); setRevealed(true); }} /></label><p>{confidence < 3 ? "Olvasd újra a példát, aztán próbáld elmondani." : "Mondd el saját szavaiddal, és ellenőrizd magad."}</p></>}
    {(m.kind === "conflict" || m.kind === "analogy") && <button className="lesson-outline-btn" onClick={() => setRevealed(true)}>Megnézem az összefüggést</button>}
    {m.kind === "popup" && <><button className="lesson-outline-btn" onClick={() => setPopup(true)}>Kérem a villámkérdést</button><Dialog open={popup} onOpenChange={setPopup}><DialogContent className="fusion-dialog"><DialogTitle>{m.title}</DialogTitle><DialogDescription>{m.prompt}</DialogDescription>{choice}</DialogContent></Dialog></>}
    {revealed && !["gate", "myth", "popup"].includes(m.kind) && <p className="lesson-answer">{m.answer}</p>}
  </section>;
}
export function CognitiveMethods({ methods }: { methods: CognitiveMethod[] }) {
  const [passed, setPassed] = useState<string[]>([]);
  const gate = methods.findIndex(m => m.kind === "gate" && !passed.includes(m.id));
  const visible = gate < 0 ? methods : methods.slice(0, gate + 1);
  return <><p className="fusion-intro">Jósolj, rendezz, érvelj! A kapukérdések megoldása nyitja meg a következő módszereket.</p><div className="fusion-method-grid">{visible.map(m => <MethodCard key={m.id} method={m} onGatePassed={id => setPassed(old => old.includes(id) ? old : [...old, id])} />)}</div>{gate >= 0 && <p className="fusion-intro">Válaszolj helyesen a kapukérdésre a folytatáshoz.</p>}</>;
}
