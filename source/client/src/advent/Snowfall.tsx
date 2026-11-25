/**
 * Adventi naptár — hóesés tisztán CSS-ből (docs/specs/2026-11-18-adventi-naptar.md R12): legfeljebb 24 elem, csak `transform` és
 * `opacity` animáció, képkocka-hurok nélkül. Csökkentett mozgásnál semmit sem rajzol; `paused` alatt az animáció áll.
 */
import { useReducedMotion } from "@/game-engine/useReducedMotion";

export const SNOWFLAKE_COUNT = 24;

/** Determinisztikus „szórás”: nincs véletlen, így a kép minden betöltéskor ugyanaz (a mérések is stabilak). */
const FLAKES = Array.from({ length: SNOWFLAKE_COUNT }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  size: 4 + ((i * 7) % 5),
  duration: 9 + ((i * 5) % 8),
  delay: -((i * 13) % 15),
  drift: ((i * 29) % 40) - 20,
}));

export default function Snowfall({ paused }: { paused: boolean }) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <div className="advent-snow" aria-hidden="true" data-testid="advent-snow" data-paused={paused ? "true" : "false"}>
      {FLAKES.map((f, i) => (
        <span
          key={i}
          className="advent-snow__flake"
          style={{
            left: `${f.left}%`, width: f.size, height: f.size,
            animationDuration: `${f.duration}s`, animationDelay: `${f.delay}s`,
            ["--advent-drift" as string]: `${f.drift}px`,
          }}
        />
      ))}
    </div>
  );
}
