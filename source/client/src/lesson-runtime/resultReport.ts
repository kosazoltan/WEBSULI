import { useEffect, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";
import { getFingerprint } from "@/lib/fingerprintCache";
import { experienceFingerprint, type ExperienceRound } from "./useExperienceRound";

/**
 * Tanulói eredmény e-mailben az adminoknak (docs/specs/2026-10-17-eredmeny-email.md) — „motorháztető alatt”: a kör első lezárásakor
 * a válaszok egyszer a szerverhez mennek (az pontoz újra és küld). Nincs felület, nincs visszajelzés; a hiba csendes. Ugyanaz a kör
 * nem megy kétszer (localStorage-jelző + a szerver egyedi kulcsa).
 */
export function useResultReport(lessonId: string | undefined, kind: "tasks" | "quiz", round: ExperienceRound, storageKey: string) {
  const sending = useRef(false);
  useEffect(() => {
    if (!lessonId || !round.finishedAt || sending.current) return;
    const roundId = `round-${experienceFingerprint({ ids: round.ids, startedAt: round.startedAt })}`;
    const flag = `${storageKey}:${kind}:sent:${roundId}`;
    try { if (localStorage.getItem(flag)) return; } catch { /* privát módban a szerver egyedi kulcsa véd */ }
    sending.current = true;
    void (async () => {
      try {
        const fingerprint = await getFingerprint().catch(() => undefined);
        const body = kind === "tasks"
          ? { kind, roundId, answers: Object.fromEntries(round.ids.map(id => [id, round.answers[id] ?? ""])), ...(fingerprint ? { fingerprint } : {}) }
          : { kind, roundId, picks: Object.fromEntries(round.ids.filter(id => round.picks[id] !== undefined).map(id => [id, round.picks[id]])), ...(fingerprint ? { fingerprint } : {}) };
        await apiRequest("POST", `/api/lessons/${lessonId}/results`, body);
        try { localStorage.setItem(flag, "1"); } catch { /* elég a szerver egyedi kulcsa */ }
      } catch { /* csendes: a tanuló felülete nem függ a levéltől */ }
      finally { sending.current = false; }
    })();
  }, [lessonId, kind, round, storageKey]);
}
