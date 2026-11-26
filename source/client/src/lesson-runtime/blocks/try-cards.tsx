import { useState } from "react";
import { ChevronLeft, ChevronRight, Lightbulb, RefreshCw, RotateCcw } from "lucide-react";

import { readDecision, readDidYouKnow, readFlashcards, readFlipCard, readStepReveal, scoreDecision } from "@shared/try-scoring";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TrySnapshot } from "../useLessonProgress";
import { RadioRow } from "./try-blocks-v2";

/**
 * V3a (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): kártyaformák és döntés–következmény. Minden kártya nevesített
 * csoport (akadálymentes név), a vezérlők natív gombok; az állapot a lecke újranyitásakor visszaáll (B7 snapshot).
 */
type TryProps = { spec: Record<string, unknown>; persisted?: TrySnapshot; onPersist?: (snap: TrySnapshot) => void };

const Empty = ({ kind }: { kind: string }) => <div className="text-sm text-muted-foreground border rounded-lg p-4" data-try={kind}>Ehhez a kártyához nincs tartalom.</div>;

export function FlipCard({ spec, persisted, onPersist }: TryProps) {
  const f = readFlipCard(spec);
  const [flipped, setFlipped] = useState(() => (persisted?.kind === "flipCard" ? persisted.flipped : false));
  if (!f.front || !f.back) return <Empty kind="flipCard" />;
  const flip = () => { const next = !flipped; setFlipped(next); onPersist?.({ kind: "flipCard", flipped: next }); };
  return (
    <div className="border rounded-lg bg-card p-4 space-y-3" data-try="flipCard" role="group" aria-label={`Fordítókártya: ${f.front}`}>
      <div className={cn("rounded-md border p-4 min-h-24 text-base", flipped ? "bg-primary/10" : "bg-muted/40")} aria-live="polite">
        <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{flipped ? "Hátoldal" : "Előoldal"}</p>
        <p>{flipped ? f.back : f.front}</p>
      </div>
      <Button className="min-h-11" onClick={flip}><RefreshCw className="w-4 h-4 mr-1" aria-hidden />{flipped ? "Fordítsd vissza" : "Fordítsd meg"}</Button>
    </div>
  );
}

export function StepReveal({ spec, persisted, onPersist }: TryProps) {
  const s = readStepReveal(spec);
  const [shown, setShown] = useState(() => Math.max(1, persisted?.kind === "stepReveal" ? persisted.shown : 1));
  if (s.steps.length < 2) return <Empty kind="stepReveal" />;
  const set = (n: number) => { setShown(n); onPersist?.({ kind: "stepReveal", shown: n }); };
  return (
    <div className="border rounded-lg bg-card p-4 space-y-3" data-try="stepReveal" role="group" aria-label={s.title ?? "Lépésről lépésre"}>
      {s.title && <p className="text-sm font-medium">{s.title}</p>}
      <ol className="list-decimal pl-5 space-y-1" aria-live="polite">
        {s.steps.slice(0, shown).map((step, i) => <li key={i} className="text-sm">{step}</li>)}
      </ol>
      <div className="flex gap-2">
        {shown < s.steps.length && <Button className="min-h-11" onClick={() => set(shown + 1)}>Következő lépés ({shown}/{s.steps.length})</Button>}
        {shown > 1 && <Button variant="ghost" className="min-h-11" onClick={() => set(1)} aria-label="Újrakezdés"><RotateCcw className="w-4 h-4" /></Button>}
      </div>
    </div>
  );
}

export function DidYouKnow({ spec }: TryProps) {
  const d = readDidYouKnow(spec);
  if (!d.fact) return <Empty kind="didYouKnow" />;
  return (
    <div className="border rounded-lg bg-amber-50 dark:bg-amber-950/30 p-4 flex gap-3" data-try="didYouKnow" role="note" aria-label="Tudtad?">
      <Lightbulb className="w-5 h-5 text-amber-500 shrink-0" aria-hidden />
      <div><p className="text-sm font-semibold">Tudtad?</p><p className="text-sm">{d.fact}</p>{d.source && <p className="text-xs text-muted-foreground mt-1">Forrás: {d.source}</p>}</div>
    </div>
  );
}

export function Decision({ spec, persisted, onPersist }: TryProps) {
  const d = readDecision(spec);
  const [choice, setChoice] = useState<number | null>(() => (persisted?.kind === "decision" ? persisted.choice : null));
  if (!d.situation || d.options.length < 2) return <Empty kind="decision" />;
  const pick = (i: number | null) => { setChoice(i); onPersist?.({ kind: "decision", choice: i }); };
  const result = choice === null ? null : scoreDecision(spec, choice);
  return (
    <div className="border rounded-lg bg-card p-4 space-y-3" data-try="decision" role="group" aria-label={`Döntés: ${d.situation}`}>
      <p className="text-sm font-medium">{d.situation}</p>
      {/* Review #609: valódi rádiócsoport (egy Tab-megálló, a nyilak léptetnek és választanak) — a V2a közös RadioRow-ja. */}
      <RadioRow label="Mit választasz?" options={d.options.map((_, i) => i)} value={choice} onSelect={pick}
        optionLabel={(i) => d.options[i].text} className="flex-col" />
      {choice !== null && d.options[choice] && (
        <div className="space-y-1" aria-live="polite">
          <p className="text-sm"><span className="font-medium">Következmény: </span>{d.options[choice].consequence}</p>
          <span role="status" data-testid="try-verdict" data-verdict={result!.verdict} className={result!.verdict === "teljes" ? "text-emerald-600 text-sm" : "text-red-500 text-sm"}>
            {result!.verdict === "teljes" ? "Helyes döntés!" : "Van jobb döntés — próbáld újra!"}
          </span>
          <Button variant="ghost" className="min-h-11" onClick={() => pick(null)} aria-label="Újra"><RotateCcw className="w-4 h-4" /></Button>
        </div>
      )}
    </div>
  );
}

export function Flashcards({ spec, persisted, onPersist }: TryProps) {
  const { cards } = readFlashcards(spec);
  const restored = persisted?.kind === "flashcards" ? persisted : null;
  const [index, setIndex] = useState(() => Math.min(Math.max(0, restored?.index ?? 0), Math.max(0, cards.length - 1)));
  const [flipped, setFlipped] = useState(() => restored?.flipped ?? false);
  if (cards.length < 2) return <Empty kind="flashcards" />;
  const save = (i: number, f: boolean) => { setIndex(i); setFlipped(f); onPersist?.({ kind: "flashcards", index: i, flipped: f }); };
  const card = cards[index];
  return (
    <div className="border rounded-lg bg-card p-4 space-y-3" data-try="flashcards" role="group" aria-label={`Villámkártyák: ${index + 1}. kártya a(z) ${cards.length}-ból`}>
      <div className={cn("rounded-md border p-4 min-h-20 text-base text-center", flipped ? "bg-primary/10" : "bg-muted/40")} aria-live="polite">{flipped ? card.back : card.front}</div>
      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" className="min-h-11" onClick={() => save(index - 1, false)} disabled={index === 0} aria-label="Előző kártya"><ChevronLeft className="w-4 h-4" /></Button>
        <Button className="min-h-11" onClick={() => save(index, !flipped)}>{flipped ? "Fordítsd vissza" : "Fordítsd meg"}</Button>
        <Button variant="outline" className="min-h-11" onClick={() => save(index + 1, false)} disabled={index === cards.length - 1} aria-label="Következő kártya"><ChevronRight className="w-4 h-4" /></Button>
      </div>
      <p className="text-xs text-muted-foreground text-center">{index + 1} / {cards.length}</p>
    </div>
  );
}
