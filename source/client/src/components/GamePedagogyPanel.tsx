import { memo, type ReactNode } from "react";
import { Target } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Accent = "cyan" | "amber" | "lime" | "fuchsia";

const accentStyles: Record<
  Accent,
  { border: string; bg: string; label: string; title: string }
> = {
  cyan: {
    border: "border-cyan-400/50",
    bg: "from-cyan-500/20 via-sky-500/10 to-blue-600/15",
    label: "text-cyan-200/95",
    title: "text-white",
  },
  amber: {
    border: "border-amber-400/50",
    bg: "from-amber-500/20 via-orange-500/10 to-rose-500/10",
    label: "text-amber-200/95",
    title: "text-white",
  },
  lime: {
    border: "border-lime-400/50",
    bg: "from-lime-500/20 via-emerald-600/10 to-teal-600/10",
    label: "text-lime-200/95",
    title: "text-white",
  },
  fuchsia: {
    border: "border-fuchsia-400/45",
    bg: "from-fuchsia-500/20 via-violet-600/10 to-purple-700/10",
    label: "text-fuchsia-200/95",
    title: "text-white",
  },
};

export type GamePedagogyPanelProps = {
  /** Rövid, hangos mondat 8–12 évesnek: cél + jutalom + akadály */
  kidMission: string;
  /** Szülőnek: NAT / készségek, mit erősít */
  parentBody: ReactNode;
  accent?: Accent;
  className?: string;
};

/** Duolingo-szerű: egyértelmű küldetés + összecsukható szülői oktatási réteg */
function GamePedagogyPanel({ kidMission, parentBody, accent = "amber", className }: GamePedagogyPanelProps) {
  const a = accentStyles[accent];
  return (
    <Dialog>
      <DialogTrigger className={cn("game-help shrink-0 min-h-[44px] rounded-lg border border-white/25 bg-slate-900 px-3 py-2 text-xs font-bold text-white text-left", className)}>
        <Target className="inline h-4 w-4 mr-2" aria-hidden /> Hogyan játsszak?
      </DialogTrigger>
      <DialogContent className="border-slate-600 bg-slate-950 text-white">
        <DialogTitle>A küldetésed</DialogTitle>
        <DialogDescription className="sr-only">Játékszabályok és tanulási célok</DialogDescription>
      <div
        className={cn(
          "rounded-xl border-2 bg-gradient-to-br px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]",
          a.border,
          a.bg,
        )}
        role="status"
        aria-live="polite"
      >
        <p className={cn("flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider mb-1", a.label)}>
          <Target className="w-3.5 h-3.5 shrink-0" aria-hidden />
          A te küldetésed
        </p>
        <p className={cn("text-sm sm:text-[15px] font-bold leading-snug", a.title)}>{kidMission}</p>
      </div>

        <div className="text-sm leading-relaxed text-slate-200">{parentBody}</div>
      </DialogContent>
    </Dialog>
  );
}

export default memo(GamePedagogyPanel);
