import { memo } from "react";
import { Flag } from "lucide-react";
import { cn } from "@/lib/utils";

export type GoalAccent = "cyan" | "amber" | "lime" | "fuchsia";

const shell: Record<GoalAccent, string> = {
  cyan: "border-cyan-400/55 bg-gradient-to-br from-cyan-500/20 via-slate-950/40 to-blue-900/30 shadow-[0_0_24px_rgba(34,211,238,0.15)]",
  amber: "border-amber-400/55 bg-gradient-to-br from-amber-500/20 via-slate-950/40 to-orange-900/25 shadow-[0_0_24px_rgba(251,191,36,0.12)]",
  lime: "border-lime-400/55 bg-gradient-to-br from-lime-500/18 via-slate-950/40 to-emerald-900/28 shadow-[0_0_24px_rgba(34,197,94,0.14)]",
  fuchsia: "border-fuchsia-400/50 bg-gradient-to-br from-fuchsia-500/18 via-slate-950/40 to-cyan-900/25 shadow-[0_0_24px_rgba(217,70,239,0.12)]",
};

const barFill: Record<GoalAccent, string> = {
  cyan: "bg-gradient-to-r from-cyan-300 via-sky-300 to-blue-400",
  amber: "bg-gradient-to-r from-amber-300 via-orange-300 to-amber-400",
  lime: "bg-gradient-to-r from-lime-300 via-emerald-300 to-teal-400",
  fuchsia: "bg-gradient-to-r from-fuchsia-400 via-pink-400 to-cyan-400",
};

export type GameNextGoalBarProps = {
  accent: GoalAccent;
  /** Rövid, hangzatos cél (gyereknek) */
  headline: string;
  /** Opcionális második sor (számok, idő) */
  subtitle?: string;
  /** Sáv: jelenlegi / cél (0–100%) */
  current: number;
  target: number;
  showBar?: boolean;
  className?: string;
};

/** Állandó „következő cél” sáv — Duolingo-szerű látható haladás */
function GameNextGoalBar({
  accent,
  headline,
  subtitle,
  current,
  target,
  showBar = true,
  className,
}: GameNextGoalBarProps) {
  const pct = target > 0 ? Math.min(100, Math.max(0, (current / target) * 100)) : 0;
  return (
    <div
      className={cn("rounded-xl border-2 px-3 py-2.5 backdrop-blur-sm", shell[accent], className)}
      role="region"
      aria-label="Következő cél"
    >
      <div className="flex gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-black/30 border border-white/15">
          <Flag className="h-4 w-4 text-white drop-shadow" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[0.14em] text-white/60">Következő cél</p>
          <p className="text-sm font-extrabold leading-snug text-white drop-shadow-sm">{headline}</p>
          {subtitle ? <p className="text-[11px] text-white/78 mt-0.5 leading-snug">{subtitle}</p> : null}
          {showBar && target > 0 ? (
            <div className="mt-2">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-black/40 ring-1 ring-white/10">
                <div
                  className={cn("h-full rounded-full transition-[width] duration-500 ease-out", barFill[accent])}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[10px] font-semibold text-white/55 mt-1 tabular-nums">
                {current} / {target} · {Math.round(pct)}%
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default memo(GameNextGoalBar);
