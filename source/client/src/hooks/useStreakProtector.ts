import { useCallback, useRef, useState } from "react";

/**
 * Streak-protector hook: minden run-on egyszer abszorbál egy hibás választ,
 * mielőtt a sorozat resetelődne — figyelmeztető üzenettel.
 *
 * Használat egy quiz-játékban:
 *
 *   const { handleWrong, resetProtector, warning } = useStreakProtector();
 *
 *   const onAnswer = (idx: number) => {
 *     if (idx !== quiz.correctIndex) {
 *       const result = handleWrong({ streak });   //  "warned" | "broken"
 *       if (result === "warned") {
 *         // FIGYELMEZTETÉS — a streak NEM resetelődik még
 *         showToast("Streak megmentve! Vigyázz, a következő hiba törli a sorozatodat.");
 *       } else {
 *         // RESET
 *         setStreak(0);
 *       }
 *       return;
 *     }
 *     // helyes válasz → tovább
 *   };
 *
 *   const startNewRun = () => {
 *     resetProtector();
 *     setStreak(0);
 *     ...
 *   };
 *
 * A protector csak akkor aktiválódik, ha a streak ≥ 3 (különben semmi védendő).
 */
export type StreakProtectorOutcome = "warned" | "broken";

export function useStreakProtector(minStreakToProtect = 3) {
  const usedRef = useRef(false);
  const [warning, setWarning] = useState<string | null>(null);

  const handleWrong = useCallback(
    ({ streak }: { streak: number }): StreakProtectorOutcome => {
      if (usedRef.current || streak < minStreakToProtect) {
        return "broken";
      }
      usedRef.current = true;
      setWarning("Streak megmentve! Vigyázz, a következő hiba törli a sorozatodat.");
      window.setTimeout(() => setWarning(null), 2200);
      return "warned";
    },
    [minStreakToProtect],
  );

  const resetProtector = useCallback(() => {
    usedRef.current = false;
    setWarning(null);
  }, []);

  return { handleWrong, resetProtector, warning, used: usedRef.current };
}
