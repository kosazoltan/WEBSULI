import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Achievement } from "@/lib/achievements";

type Props = {
  /** Az újonnan unlockolt jelvények — hívó felelős a kiürítésért. */
  achievements: Achievement[];
  /** Egy jelvény-toast hány másodpercig látható. */
  durationMs?: number;
};

const TIER_STYLES: Record<Achievement["tier"], string> = {
  common: "border-slate-400/60 bg-slate-900/95 from-slate-700/50 to-slate-900/50",
  rare: "border-blue-400/70 bg-blue-950/95 from-blue-700/55 to-indigo-900/50",
  epic: "border-fuchsia-400/70 bg-fuchsia-950/95 from-fuchsia-700/55 to-purple-900/50",
  legendary: "border-amber-300 bg-amber-950/95 from-amber-600/55 to-orange-800/50",
};

/**
 * Stack-alapú jelvény-megjelenítő. Ha új achievement érkezik, hozzáadja
 * a queue-hoz; mindegyik `durationMs` másodpercig látható, sorban (1
 * jelvény / 1 toast). Több egyszerre érkező jelvény fade-elve cserélődik.
 */
export default function AchievementToast({ achievements, durationMs = 3500 }: Props) {
  const [queue, setQueue] = useState<Achievement[]>([]);
  const [current, setCurrent] = useState<Achievement | null>(null);

  useEffect(() => {
    if (achievements.length === 0) return;
    setQueue((prev) => [...prev, ...achievements]);
  }, [achievements]);

  useEffect(() => {
    if (current || queue.length === 0) return;
    const next = queue[0]!;
    setCurrent(next);
    setQueue((prev) => prev.slice(1));
    const timer = window.setTimeout(() => {
      setCurrent(null);
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [current, queue, durationMs]);

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.id}
          initial={{ x: 320, opacity: 0, scale: 0.85 }}
          animate={{ x: 0, opacity: 1, scale: 1 }}
          exit={{ x: 320, opacity: 0, scale: 0.85 }}
          transition={{ type: "spring", stiffness: 360, damping: 24 }}
          className={`fixed top-20 right-3 sm:right-6 z-[80] max-w-sm rounded-xl border-2 ${TIER_STYLES[current.tier]} bg-gradient-to-br backdrop-blur-md shadow-2xl p-3 flex items-start gap-3`}
          data-testid={`achievement-toast-${current.id}`}
        >
          <div className="text-3xl flex-shrink-0">{current.icon}</div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300 mb-0.5">
              ✨ Új jelvény
            </p>
            <p className="text-sm font-extrabold text-white leading-tight">{current.title}</p>
            <p className="text-[11px] text-white/75 leading-snug mt-0.5">{current.description}</p>
            <p className="text-[10px] text-amber-200/80 mt-1">+{current.points} pont</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
