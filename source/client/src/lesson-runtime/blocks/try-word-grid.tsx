import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, RotateCcw } from "lucide-react";

import { buildCrossword, buildWordSearch, readCrossword, readWordSearch, scoreCrossword } from "@shared/word-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { TrySnapshot } from "../useLessonProgress";

/**
 * V5a (docs/specs/2026-11-24-valtozatossag-12-tengely-vegrehajtas.md): szókereső és keresztrejtvény. A rács determinisztikus
 * (shared/word-grid.ts) — újranyitáskor ugyanaz; az állapot (megtalált szavak, beírt megfejtések) visszaáll.
 */
type TryProps = { spec: Record<string, unknown>; persisted?: TrySnapshot; onPersist?: (snap: TrySnapshot) => void };
const up = (w: string) => w.trim().normalize("NFC").toLocaleUpperCase("hu");

export function WordSearch({ spec, persisted, onPersist }: TryProps) {
  const { words } = readWordSearch(spec);
  const ws = useMemo(() => buildWordSearch(words), [words.join("\u0001")]); // eslint-disable-line react-hooks/exhaustive-deps
  const [found, setFound] = useState<string[]>(() => (persisted?.kind === "wordSearch" ? persisted.found : []));
  const [start, setStart] = useState<{ r: number; c: number } | null>(null);
  const [focus, setFocus] = useState({ r: 0, c: 0 });
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  if (words.length < 3) return <div className="text-sm text-muted-foreground border rounded-lg p-4" data-try="wordSearch">Ehhez a szókeresőhöz nincs tartalom.</div>;

  const inFound = (r: number, c: number) => ws.placements.some((p) => found.includes(p.word) && [...p.word].some((_, i) => p.row + p.dr * i === r && p.col + p.dc * i === c));
  const pick = (r: number, c: number) => {
    if (!start) { setStart({ r, c }); return; }
    const hit = ws.placements.find((p) => {
      const n = [...p.word].length - 1, end = { r: p.row + p.dr * n, c: p.col + p.dc * n };
      return (p.row === start.r && p.col === start.c && end.r === r && end.c === c) || (p.row === r && p.col === c && end.r === start.r && end.c === start.c);
    });
    setStart(null);
    if (hit && !found.includes(hit.word)) { const next = [...found, hit.word]; setFound(next); onPersist?.({ kind: "wordSearch", found: next }); }
  };
  const move = (e: KeyboardEvent, r: number, c: number) => {
    const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[e.key as "ArrowUp"];
    if (!d) return;
    e.preventDefault();
    const nr = Math.min(ws.size - 1, Math.max(0, r + d[0])), nc = Math.min(ws.size - 1, Math.max(0, c + d[1]));
    setFocus({ r: nr, c: nc });
    refs.current[`${nr},${nc}`]?.focus();
  };
  const done = found.length === words.length;
  return (
    <div className="border rounded-lg bg-card p-4 space-y-3" data-try="wordSearch">
      <p className="text-sm text-muted-foreground">Keresd meg a szavakat! Válaszd ki a szó első, majd utolsó betűjét (nyilakkal mozoghatsz, Enterrel választasz).</p>
      <div role="grid" aria-label="Szókereső" className="inline-grid gap-0.5" style={{ gridTemplateColumns: `repeat(${ws.size}, minmax(0, 2.25rem))` }}>
        {ws.grid.map((row, r) => (
          <div role="row" key={r} className="contents">
            {row.map((ch, c) => (
              <button key={c} type="button" role="gridcell" ref={(el) => { refs.current[`${r},${c}`] = el; }}
                tabIndex={focus.r === r && focus.c === c ? 0 : -1} aria-label={`${r + 1}. sor, ${c + 1}. oszlop: ${ch}`}
                aria-selected={start?.r === r && start?.c === c}
                onClick={() => { setFocus({ r, c }); pick(r, c); }} onKeyDown={(e) => move(e, r, c)}
                className={cn("w-9 h-9 rounded text-sm font-semibold border", inFound(r, c) ? "bg-emerald-200 dark:bg-emerald-900" : "bg-muted/40", start?.r === r && start?.c === c && "ring-2 ring-primary")}>{ch}</button>
            ))}
          </div>
        ))}
      </div>
      <div data-testid="found-words" aria-live="polite" className="text-sm">
        Megtaláltad ({found.length}/{words.length}): {found.length ? found.join(", ") : "még semmit"}
      </div>
      {done && <span role="status" data-testid="try-verdict" data-verdict="teljes" className="text-emerald-600 text-sm">Mind megvan!</span>}
      <ul className="flex flex-wrap gap-2 text-xs" aria-label="Keresendő szavak">
        {words.map((w) => <li key={w} className={cn("px-2 py-0.5 rounded border", found.includes(w) && "line-through text-muted-foreground")}>{up(w)}</li>)}
      </ul>
    </div>
  );
}

export function CrosswordBlock({ spec, persisted, onPersist }: TryProps) {
  const { entries } = readCrossword(spec);
  const cw = useMemo(() => buildCrossword(entries), [JSON.stringify(entries)]); // eslint-disable-line react-hooks/exhaustive-deps
  const restored = persisted?.kind === "crossword" ? persisted : null;
  const [answers, setAnswers] = useState<string[]>(() => entries.map((_, i) => restored?.answers[i] ?? ""));
  const [checked, setChecked] = useState(() => restored?.checked ?? false);
  if (entries.length < 3) return <div className="text-sm text-muted-foreground border rounded-lg p-4" data-try="crossword">Ehhez a keresztrejtvényhez nincs tartalom.</div>;
  const save = (a: string[], ch: boolean) => { setAnswers(a); setChecked(ch); onPersist?.({ kind: "crossword", answers: a, checked: ch }); };
  const cells = new Map<string, { ch: string; number?: number }>();
  cw.placements.forEach((p, idx) => {
    const typed = [...up(answers[idx] ?? "")];
    [...up(p.answer)].forEach((_, i) => {
      const k = p.dir === "across" ? `${p.row},${p.col + i}` : `${p.row + i},${p.col}`;
      const prev = cells.get(k);
      cells.set(k, { ch: typed[i] ?? prev?.ch ?? "", number: i === 0 ? p.number : prev?.number });
    });
  });
  const result = checked ? scoreCrossword(spec, answers) : null;
  return (
    <div className="border rounded-lg bg-card p-4 space-y-3" data-try="crossword">
      <div aria-hidden className="inline-grid gap-0.5" style={{ gridTemplateColumns: `repeat(${cw.cols}, 2rem)` }}>
        {Array.from({ length: cw.rows * cw.cols }, (_, n) => {
          const cell = cells.get(`${Math.floor(n / cw.cols)},${n % cw.cols}`);
          return <div key={n} className={cn("w-8 h-8 relative text-center leading-8 text-sm font-semibold", cell ? "border bg-background" : "")}>
            {cell?.number && <span className="absolute left-0.5 top-0 text-[9px] leading-none text-muted-foreground">{cell.number}</span>}{cell?.ch}
          </div>;
        })}
      </div>
      <ol className="space-y-2">
        {cw.placements.map((p, i) => {
          const label = `${p.number}. ${p.dir === "across" ? "vízszintes" : "függőleges"}: ${p.clue} (${[...p.answer].length} betű)`;
          const ok = checked && up(answers[i] ?? "") === up(p.answer);
          return (
            <li key={i} className="flex flex-col gap-1">
              <label className="text-sm" htmlFor={`cw-${i}`}>{label}</label>
              <Input id={`cw-${i}`} aria-label={label} value={answers[i] ?? ""} maxLength={[...p.answer].length + 2}
                onChange={(e) => save(answers.map((a, j) => (j === i ? e.target.value : a)), false)}
                className={cn("max-w-xs uppercase", checked && (ok ? "border-emerald-500" : "border-red-400"))} />
            </li>
          );
        })}
      </ol>
      <div className="flex items-center gap-3">
        <Button className="min-h-11" data-testid="try-check" onClick={() => save(answers, true)}><Check className="w-4 h-4 mr-1" aria-hidden />Ellenőrzés</Button>
        <Button variant="ghost" className="min-h-11" onClick={() => save(entries.map(() => ""), false)} aria-label="Újra"><RotateCcw className="w-4 h-4" /></Button>
        {result && <span role="status" data-testid="try-verdict" data-verdict={result.verdict} className={result.verdict === "teljes" ? "text-emerald-600 text-sm" : result.verdict === "részleges" ? "text-amber-600 text-sm" : "text-red-500 text-sm"}>
          {result.verdict === "teljes" ? "Szuper, minden megfejtés jó!" : result.verdict === "részleges" ? `Részben jó: ${result.points}/${result.max}` : "Még nem jó — próbáld újra!"}
        </span>}
      </div>
    </div>
  );
}
