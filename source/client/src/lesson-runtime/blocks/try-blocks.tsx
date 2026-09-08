import { useState } from "react";
import type { ComponentType } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, RotateCcw, XCircle } from "lucide-react";

import type { TryKind } from "@shared/lesson-schema";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TrySnapshot } from "../useLessonProgress";

/**
 * LS-4 — the three planned hands-on kinds (master plan §4).
 *
 * Every kind grades itself locally and shows per-attempt feedback. Touch-first:
 * the reorderer uses 44 px arrow buttons instead of HTML5 drag. Specs come from
 * a model, so readers are tolerant like the animate blocks.
 *
 * B7: optional persisted + onPersist restore answers across refresh.
 */

type TryProps = {
  spec: Record<string, unknown>;
  persisted?: TrySnapshot;
  onPersist?: (snap: TrySnapshot) => void;
};

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function DragSort({ spec, persisted, onPersist }: TryProps) {
  const initial = strArray(spec.items);
  const correct = strArray(spec.correctOrder);
  const hint = typeof spec.hint === "string" ? spec.hint.trim() : "";
  const restored = persisted?.kind === "dragSort" ? persisted : null;
  const [order, setOrder] = useState<string[]>(() => restored?.order ?? initial);
  const [checked, setChecked] = useState(() => restored?.checked ?? false);

  const move = (i: number, delta: number) => {
    const target = i + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[i], next[target]] = [next[target], next[i]];
    setOrder(next);
    setChecked(false);
    onPersist?.({ kind: "dragSort", order: next, checked: false });
  };

  if (initial.length === 0 || correct.length === 0) {
    return (
      <div className="text-sm text-muted-foreground border rounded-lg p-4" data-try="dragSort">
        Ehhez a gyakorlathoz nincs megadott elem.
      </div>
    );
  }

  const isCorrect = checked && order.every((v, i) => v === correct[i]);

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
        <Button
          className="min-h-11"
          onClick={() => {
            setChecked(true);
            onPersist?.({ kind: "dragSort", order, checked: true });
          }}
          data-testid="try-check"
        >
          Ellenőrzés
        </Button>
        <Button
          variant="ghost"
          className="min-h-11"
          onClick={() => {
            setOrder(initial);
            setChecked(false);
            onPersist?.({ kind: "dragSort", order: initial, checked: false });
          }}
          aria-label="Újra"
        >
          <RotateCcw className="w-4 h-4" />
        </Button>
        {checked && (
          isCorrect
            ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-4 h-4" /> Helyes!</span>
            : <span className="inline-flex items-center gap-1 text-red-500" data-testid="try-feedback">
                <XCircle className="w-4 h-4" /> {hint || "Még nem jó — próbáld újra!"}
              </span>
        )}
      </div>
    </div>
  );
}

function FillBlank({ spec, persisted, onPersist }: TryProps) {
  const text = typeof spec.text === "string" ? spec.text : "";
  const answers = strArray(spec.answers);
  const hint = typeof spec.hint === "string" ? spec.hint.trim() : "";
  const blanks = (text.match(/___+/g) ?? []).length;
  const restored = persisted?.kind === "fillBlank" ? persisted : null;
  const [values, setValues] = useState<string[]>(() => {
    if (restored?.values && restored.values.length === Math.max(blanks, 1)) return restored.values;
    return Array.from({ length: Math.max(blanks, 1) }, () => "");
  });
  const [checked, setChecked] = useState(() => restored?.checked ?? false);

  const setValue = (i: number, v: string) => {
    const next = [...values];
    next[i] = v;
    setValues(next);
    setChecked(false);
    onPersist?.({ kind: "fillBlank", values: next, checked: false });
  };

  if (blanks < 1 || answers.length !== blanks) {
    return (
      <div className="text-sm text-muted-foreground border rounded-lg p-4" data-try="fillBlank">
        Ehhez a gyakorlathoz nincs megadott elem.
      </div>
    );
  }

  const isCorrect =
    checked &&
    answers.length > 0 &&
    answers.every((a, i) => values[i]?.trim().toLowerCase() === a.trim().toLowerCase());

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
        <Button
          className="min-h-11"
          onClick={() => {
            setChecked(true);
            onPersist?.({ kind: "fillBlank", values, checked: true });
          }}
          data-testid="try-check"
        >
          Ellenőrzés
        </Button>
        {checked && (
          isCorrect
            ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-4 h-4" /> Helyes!</span>
            : <span className="inline-flex items-center gap-1 text-red-500" data-testid="try-feedback">
                <XCircle className="w-4 h-4" /> {hint || "Nem stimmel minden — nézd át újra!"}
              </span>
        )}
      </div>
    </div>
  );
}

function Match({ spec, persisted, onPersist }: TryProps) {
  const pairs = Array.isArray(spec.pairs)
    ? (spec.pairs as Array<Record<string, unknown>>)
        .filter((p) => p && typeof p.left === "string" && typeof p.right === "string")
        .map((p) => ({ left: p.left as string, right: p.right as string }))
    : [];
  const restored = persisted?.kind === "match" ? persisted : null;
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  const [matched, setMatched] = useState<Set<number>>(() => new Set(restored?.matched ?? []));
  const [failed, setFailed] = useState<Set<number>>(new Set());

  const pickLeft = (i: number) => {
    setFailed((f) => { const n = new Set(f); n.delete(i); return n; });
    setSelectedLeft((s) => (s === i ? null : i));
  };

  const pickRight = (i: number) => {
    if (selectedLeft === null) return;
    if (selectedLeft === i) {
      setMatched((m) => {
        const next = new Set(m).add(i);
        onPersist?.({ kind: "match", matched: Array.from(next) });
        return next;
      });
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
