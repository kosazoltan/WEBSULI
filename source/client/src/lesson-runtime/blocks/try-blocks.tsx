import { useState } from "react";
import type { ComponentType } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, RotateCcw, XCircle } from "lucide-react";

import type { TryKind } from "@shared/lesson-schema";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * LS-4 — the three planned hands-on kinds (master plan §4).
 *
 * Every kind grades itself locally and shows per-attempt feedback; the results are
 * not persisted here (the LS-5 feedback loop owns aggregation). Touch-first: the
 * reorderer uses 44 px arrow buttons instead of HTML5 drag, which is unreliable
 * under touch. Specs come from a model, so readers are tolerant like the animate
 * blocks.
 */

type TryProps = { spec: Record<string, unknown> };

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function DragSort({ spec }: TryProps) {
  const initial = strArray(spec.items);
  const correct = strArray(spec.correctOrder);
  const [order, setOrder] = useState<string[]>(initial);
  const [checked, setChecked] = useState(false);

  const move = (i: number, delta: number) => {
    const target = i + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[i], next[target]] = [next[target], next[i]];
    setOrder(next);
    setChecked(false);
  };

  const isCorrect = checked && (correct.length === 0 ? true : order.every((v, i) => v === correct[i]));

  if (initial.length === 0) {
    return <div className="text-sm text-muted-foreground border rounded-lg p-4" data-try="dragSort">Ehhez a gyakorlathoz nincs megadott elem.</div>;
  }

  return (
    <div className="border rounded-lg bg-card p-4 space-y-2" data-try="dragSort">
      <p className="text-sm font-medium">Rendezd helyes sorrendbe:</p>
      {order.map((item, i) => (
        <div key={`${item}-${i}`} className="flex items-center gap-2">
          <span className="flex-1 border rounded-md px-3 py-2 text-sm bg-muted/40">{item}</span>
          <Button variant="outline" size="icon" className="min-h-11 min-w-11" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Feljebb">
            <ArrowUp className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" className="min-h-11 min-w-11" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label="Lejjebb">
            <ArrowDown className="w-4 h-4" />
          </Button>
        </div>
      ))}
      <div className="flex items-center gap-2 pt-1">
        <Button className="min-h-11" onClick={() => setChecked(true)} data-testid="try-check">Ellenőrzés</Button>
        <Button variant="ghost" className="min-h-11" onClick={() => { setOrder(initial); setChecked(false); }} aria-label="Újra">
          <RotateCcw className="w-4 h-4" />
        </Button>
        {checked && (
          isCorrect
            ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-4 h-4" /> Helyes!</span>
            : <span className="inline-flex items-center gap-1 text-red-500"><XCircle className="w-4 h-4" /> Még nem jó — próbáld újra!</span>
        )}
      </div>
    </div>
  );
}

function FillBlank({ spec }: TryProps) {
  const text = typeof spec.text === "string" ? spec.text : "";
  const answers = strArray(spec.answers);
  const blanks = (text.match(/___+/g) ?? []).length;
  const [values, setValues] = useState<string[]>(Array.from({ length: Math.max(blanks, 1) }, () => ""));
  const [checked, setChecked] = useState(false);

  const setValue = (i: number, v: string) => {
    const next = [...values];
    next[i] = v;
    setValues(next);
    setChecked(false);
  };

  const isCorrect = checked && answers.every((a, i) => values[i]?.trim().toLowerCase() === a.trim().toLowerCase());

  return (
    <div className="border rounded-lg bg-card p-4 space-y-3" data-try="fillBlank">
      <p className="text-sm font-medium">Töltsd ki a hiányzó részeket:</p>
      <p className={cn("text-base leading-relaxed")}>{text.split(/___+/).map((part, i) => (
        <span key={i}>
          {part}
          {i < blanks && (
            <input
              value={values[i] ?? ""}
              onChange={(e) => setValue(i, e.target.value)}
              aria-label={`Hiányzó rész ${i + 1}`}
              className="inline-block w-28 border rounded px-2 py-1 mx-1 text-sm bg-background"
              data-testid={`fill-${i}`}
            />
          )}
        </span>
      ))}</p>
      <div className="flex items-center gap-2">
        <Button className="min-h-11" onClick={() => setChecked(true)} data-testid="try-check">Ellenőrzés</Button>
        {checked && (
          isCorrect
            ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-4 h-4" /> Helyes!</span>
            : <span className="inline-flex items-center gap-1 text-red-500"><XCircle className="w-4 h-4" /> Nem stimmel minden — nézd át újra!</span>
        )}
      </div>
    </div>
  );
}

function Match({ spec }: TryProps) {
  const pairs = Array.isArray(spec.pairs)
    ? (spec.pairs as Array<Record<string, unknown>>)
        .filter((p) => p && typeof p.left === "string" && typeof p.right === "string")
        .map((p) => ({ left: p.left as string, right: p.right as string }))
    : [];
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [failed, setFailed] = useState<Set<number>>(new Set());

  const pickLeft = (i: number) => {
    setFailed((f) => { const n = new Set(f); n.delete(i); return n; });
    setSelectedLeft((s) => (s === i ? null : i));
  };

  const pickRight = (i: number) => {
    if (selectedLeft === null) return;
    if (selectedLeft === i) {
      setMatched((m) => new Set(m).add(i));
    } else {
      setFailed((f) => new Set(f).add(selectedLeft).add(i));
    }
    setSelectedLeft(null);
  };

  if (pairs.length === 0) {
    return <div className="text-sm text-muted-foreground border rounded-lg p-4" data-try="match">Ehhez a gyakorlathoz nincs megadott pár.</div>;
  }

  return (
    <div className="border rounded-lg bg-card p-4 space-y-3" data-try="match">
      <p className="text-sm font-medium">Kösd össze a párokat (bal, majd jobb oldal):</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-2">
          {pairs.map((pair, i) => (
            <button
              key={`l-${i}`}
              onClick={() => pickLeft(i)}
              className={cn(
                "w-full text-left border rounded-md px-3 py-2 text-sm min-h-11",
                selectedLeft === i && "ring-2 ring-emerald-500",
                matched.has(i) && "bg-emerald-50 dark:bg-emerald-950 border-emerald-400",
                failed.has(i) && "border-red-400",
              )}
            >
              {pair.left}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {pairs.map((pair, i) => (
            <button
              key={`r-${i}`}
              onClick={() => pickRight(i)}
              className={cn(
                "w-full text-left border rounded-md px-3 py-2 text-sm min-h-11",
                matched.has(i) && "bg-emerald-50 dark:bg-emerald-950 border-emerald-400",
                failed.has(i) && "border-red-400",
              )}
            >
              {pair.right}
            </button>
          ))}
        </div>
      </div>
      {matched.size === pairs.length && (
        <p className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-4 h-4" /> Minden pár megvan!</p>
      )}
    </div>
  );
}

/** Every planned try kind mapped to its renderer — the LS-4 guard test pins this. */
export const TRY_REGISTRY: Record<TryKind, ComponentType<TryProps>> = {
  dragSort: DragSort,
  fillBlank: FillBlank,
  match: Match,
};
