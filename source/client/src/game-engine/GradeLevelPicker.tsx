import { Lock } from "lucide-react";

import { GRADE_LEVEL_COUNT } from "./gradeLevels";

/**
 * Évfolyamonként 10 nehezedő pálya választója — közös komponens minden játék menüjébe
 * (spec 2026-09-29-palyak-szoletra-nyelvek, 2. döntés). A lezárt pálya nem választható; a gombok ≥ 44 px-esek, és
 * 390 px-en két sorban férnek el vízszintes görgetés nélkül.
 */
export function GradeLevelPicker(props: {
  /** A kiválasztott pálya (1–10). */
  value: number;
  /** A legmagasabb feloldott pálya (1–10). */
  unlocked: number;
  onChange: (level: number) => void;
  /** Felirat a választó fölött, pl. „Pálya — 7. osztály”. */
  label?: string;
}) {
  const levels = Array.from({ length: GRADE_LEVEL_COUNT }, (_, i) => i + 1);
  return (
    <div className="w-full max-w-xl" data-testid="level-picker">
      {props.label ? <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-white/75">{props.label}</p> : null}
      <div className="grid grid-cols-5 gap-1.5" role="group" aria-label={props.label ?? "Pálya választása"}>
        {levels.map((level) => {
          const locked = level > props.unlocked;
          const selected = level === props.value;
          return (
            <button
              key={level}
              type="button"
              data-testid={`level-${level}`}
              aria-label={`${level}. pálya${locked ? " (zárva)" : ""}`}
              aria-pressed={selected}
              disabled={locked}
              onClick={() => props.onChange(level)}
              className={`flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-lg border text-sm font-bold transition-colors ${
                selected
                  ? "border-amber-200 bg-amber-500 text-slate-950"
                  : locked
                    ? "cursor-not-allowed border-white/10 bg-black/40 text-white/40"
                    : "border-white/25 bg-black/30 text-white hover:bg-white/10"
              }`}
            >
              {locked ? <Lock className="h-3.5 w-3.5" aria-hidden="true" /> : null}
              {level}.
            </button>
          );
        })}
      </div>
    </div>
  );
}
