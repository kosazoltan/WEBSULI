import { useState, type ReactNode } from "react";
import { CheckCircle2, CircleDot, RotateCcw, XCircle } from "lucide-react";

import {
  highlightTokens, readCategorize, readEstimate, readHighlight, readNumberLine, readTrueFalse,
  scoreCategorize, scoreEstimate, scoreHighlight, scoreNumberLine, scoreTrueFalseSeries, type TryScore,
} from "@shared/try-scoring";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TrySnapshot } from "../useLessonProgress";

/**
 * V2a (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): öt új feladatfajta. A pontozás a megosztott, determinisztikus
 * `shared/try-scoring.ts`; minden vezérlő natív gomb vagy csúszka (billentyűzettel kezelhető, akadálymentes névvel); az állapot a lecke
 * újranyitásakor visszaáll (B7 snapshot).
 */
type TryProps = { spec: Record<string, unknown>; persisted?: TrySnapshot; onPersist?: (snap: TrySnapshot) => void };

function Verdict({ result }: { result: TryScore }) {
  const text = result.verdict === "teljes" ? "Helyes!" : result.verdict === "részleges" ? `Részben jó (${result.points}/${result.max})` : "Még nem jó — próbáld újra!";
  const Icon = result.verdict === "teljes" ? CheckCircle2 : result.verdict === "részleges" ? CircleDot : XCircle;
  return (
    <span role="status" data-testid="try-verdict" data-verdict={result.verdict}
      className={cn("inline-flex items-center gap-1", result.verdict === "teljes" ? "text-emerald-600" : result.verdict === "részleges" ? "text-amber-600" : "text-red-500")}>
      <Icon className="w-4 h-4" aria-hidden /> {text}
    </span>
  );
}

function Footer({ onCheck, onReset, result }: { onCheck: () => void; onReset: () => void; result: TryScore | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      <Button className="min-h-11" onClick={onCheck} data-testid="try-check">Ellenőrzés</Button>
      <Button variant="ghost" className="min-h-11" onClick={onReset} aria-label="Újra"><RotateCcw className="w-4 h-4" /></Button>
      {result && <Verdict result={result} />}
    </div>
  );
}

function Empty({ kind }: { kind: string }) {
  return <div className="text-sm text-muted-foreground border rounded-lg p-4" data-try={kind}>Ehhez a gyakorlathoz nincs megadott elem.</div>;
}

function Choice({ label, checked, onSelect }: { label: string; checked: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onSelect}
      className={cn("min-h-11 px-3 rounded-md border text-sm", checked ? "bg-primary text-primary-foreground border-primary" : "bg-muted/40 hover:bg-muted")}>
      {label}
    </button>
  );
}

function Shell({ kind, title, children }: { kind: string; title?: string; children: ReactNode }) {
  return <div className="border rounded-lg bg-card p-4 space-y-3" data-try={kind}>{title && <p className="text-sm font-medium">{title}</p>}{children}</div>;
}

export function TrueFalseSeries({ spec, persisted, onPersist }: TryProps) {
  const { statements } = readTrueFalse(spec);
  const restored = persisted?.kind === "trueFalseSeries" ? persisted : null;
  const [answers, setAnswers] = useState<Array<boolean | null>>(() => restored?.answers ?? statements.map(() => null));
  const [checked, setChecked] = useState(() => restored?.checked ?? false);
  if (!statements.length) return <Empty kind="trueFalseSeries" />;
  const save = (a: Array<boolean | null>, c: boolean) => { setAnswers(a); setChecked(c); onPersist?.({ kind: "trueFalseSeries", answers: a, checked: c }); };
  const result = checked ? scoreTrueFalseSeries(spec, answers) : null;
  return (
    <Shell kind="trueFalseSeries" title="Igaz vagy hamis? Jelöld meg mindegyiket:">
      <ul className="space-y-2">
        {statements.map((s, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-[12rem] text-sm">{s.text}</span>
            <div role="radiogroup" aria-label={s.text} className="flex gap-2">
              {([true, false] as const).map((v) => (
                <Choice key={String(v)} label={v ? "Igaz" : "Hamis"} checked={answers[i] === v} onSelect={() => save(answers.map((a, j) => (j === i ? v : a)), false)} />
              ))}
            </div>
            {checked && s.explanation && answers[i] !== s.answer && <span className="w-full text-xs text-muted-foreground">{s.explanation}</span>}
          </li>
        ))}
      </ul>
      <Footer result={result} onCheck={() => save(answers, true)} onReset={() => save(statements.map(() => null), false)} />
    </Shell>
  );
}

export function Highlight({ spec, persisted, onPersist }: TryProps) {
  const h = readHighlight(spec);
  const tokens = highlightTokens(h.text);
  const restored = persisted?.kind === "highlight" ? persisted : null;
  const [selected, setSelected] = useState<number[]>(() => restored?.selected ?? []);
  const [checked, setChecked] = useState(() => restored?.checked ?? false);
  if (!tokens.length || !h.targets.length) return <Empty kind="highlight" />;
  const save = (s: number[], c: boolean) => { setSelected(s); setChecked(c); onPersist?.({ kind: "highlight", selected: s, checked: c }); };
  const result = checked ? scoreHighlight(spec, selected) : null;
  // A szöveg a szavak és a köztük lévő (írásjeles) részek váltakozása; csak a szó kijelölhető.
  const parts: ReactNode[] = [];
  let cursor = 0;
  const re = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;
  let m: RegExpExecArray | null, i = 0;
  while ((m = re.exec(h.text))) {
    if (m.index > cursor) parts.push(<span key={`g${i}`}>{h.text.slice(cursor, m.index)}</span>);
    const idx = i;
    const on = selected.includes(idx);
    parts.push(
      <button key={`w${idx}`} type="button" aria-pressed={on}
        onClick={() => save(on ? selected.filter((x) => x !== idx) : [...selected, idx], false)}
        className={cn("rounded px-0.5 min-h-8", on ? "bg-amber-300 text-black" : "hover:bg-muted")}>{m[0]}</button>,
    );
    cursor = m.index + m[0].length; i++;
  }
  if (cursor < h.text.length) parts.push(<span key="tail">{h.text.slice(cursor)}</span>);
  return (
    <Shell kind="highlight" title={h.prompt ?? "Jelöld ki a megfelelő szavakat:"}>
      <p className="text-base leading-9">{parts}</p>
      <Footer result={result} onCheck={() => save(selected, true)} onReset={() => save([], false)} />
    </Shell>
  );
}

export function Categorize({ spec, persisted, onPersist }: TryProps) {
  const c = readCategorize(spec);
  const restored = persisted?.kind === "categorize" ? persisted : null;
  const [picks, setPicks] = useState<Array<string | null>>(() => restored?.picks ?? c.items.map(() => null));
  const [checked, setChecked] = useState(() => restored?.checked ?? false);
  if (c.categories.length < 2 || !c.items.length) return <Empty kind="categorize" />;
  const save = (p: Array<string | null>, ch: boolean) => { setPicks(p); setChecked(ch); onPersist?.({ kind: "categorize", picks: p, checked: ch }); };
  const result = checked ? scoreCategorize(spec, picks) : null;
  return (
    <Shell kind="categorize" title="Melyik csoportba tartozik? Sorold be az elemeket:">
      <ul className="space-y-2">
        {c.items.map((it, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <span className="flex-1 min-w-[8rem] text-sm font-medium">{it.text}</span>
            <div role="radiogroup" aria-label={it.text} className="flex flex-wrap gap-2">
              {c.categories.map((cat) => <Choice key={cat} label={cat} checked={picks[i] === cat} onSelect={() => save(picks.map((p, j) => (j === i ? cat : p)), false)} />)}
            </div>
          </li>
        ))}
      </ul>
      <Footer result={result} onCheck={() => save(picks, true)} onReset={() => save(c.items.map(() => null), false)} />
    </Shell>
  );
}

function SliderTask({ kind, prompt, min, max, step, unit, value, onChange, footer }: {
  kind: "numberLine" | "estimate"; prompt: string; min: number; max: number; step: number; unit?: string; value: number; onChange: (v: number) => void; footer: ReactNode;
}) {
  return (
    <Shell kind={kind} title={prompt}>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground tabular-nums">{min}</span>
        <input type="range" min={min} max={max} step={step} value={value} aria-label={prompt}
          aria-valuetext={`${value}${unit ? ` ${unit}` : ""}`} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 min-h-11 accent-primary" />
        <span className="text-xs text-muted-foreground tabular-nums">{max}</span>
      </div>
      <p className="text-sm">A választásod: <output className="font-semibold tabular-nums">{value}{unit ? ` ${unit}` : ""}</output></p>
      {footer}
    </Shell>
  );
}

const midpoint = (min: number, max: number, step: number) => Math.min(max, Math.max(min, min + Math.round((max - min) / 2 / step) * step));

export function NumberLine({ spec, persisted, onPersist }: TryProps) {
  const n = readNumberLine(spec);
  const restored = persisted?.kind === "numberLine" ? persisted : null;
  const [value, setValue] = useState<number>(() => restored?.value ?? midpoint(n.min, n.max, n.step));
  const [checked, setChecked] = useState(() => restored?.checked ?? false);
  if (!(n.min < n.max) || !Number.isFinite(n.target)) return <Empty kind="numberLine" />;
  const save = (v: number, c: boolean) => { setValue(v); setChecked(c); onPersist?.({ kind: "numberLine", value: v, checked: c }); };
  return (
    <SliderTask kind="numberLine" prompt={n.prompt ?? "Helyezd el a számot a számegyenesen:"} min={n.min} max={n.max} step={n.step} value={value} onChange={(v) => save(v, false)}
      footer={<Footer result={checked ? scoreNumberLine(spec, value) : null} onCheck={() => save(value, true)} onReset={() => save(midpoint(n.min, n.max, n.step), false)} />} />
  );
}

export function Estimate({ spec, persisted, onPersist }: TryProps) {
  const e = readEstimate(spec);
  const restored = persisted?.kind === "estimate" ? persisted : null;
  const [value, setValue] = useState<number>(() => restored?.value ?? midpoint(e.min, e.max, e.step));
  const [checked, setChecked] = useState(() => restored?.checked ?? false);
  if (!(e.min < e.max) || !Number.isFinite(e.answer)) return <Empty kind="estimate" />;
  const save = (v: number, c: boolean) => { setValue(v); setChecked(c); onPersist?.({ kind: "estimate", value: v, checked: c }); };
  const result = checked ? scoreEstimate(spec, value) : null;
  return (
    <SliderTask kind="estimate" prompt={e.prompt ?? "Becsüld meg:"} min={e.min} max={e.max} step={e.step} unit={e.unit} value={value} onChange={(v) => save(v, false)}
      footer={<>
        <Footer result={result} onCheck={() => save(value, true)} onReset={() => save(midpoint(e.min, e.max, e.step), false)} />
        {result && result.verdict !== "teljes" && <p className="text-xs text-muted-foreground">A pontos érték: {e.answer}{e.unit ? ` ${e.unit}` : ""}.</p>}
      </>} />
  );
}
