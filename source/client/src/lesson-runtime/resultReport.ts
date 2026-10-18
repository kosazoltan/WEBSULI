import { useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { getFingerprint } from "@/lib/fingerprintCache";
import { getLearnerToken } from "@/lib/learnerProfile";
import { experienceFingerprint, type ExperienceRound } from "./useExperienceRound";

/**
 * Tanulói eredmény e-mailben az adminoknak (docs/specs/2026-10-17-eredmeny-email.md) — „motorháztető alatt”: a kör első lezárásakor
 * a válaszok egyszer a szerverhez mennek (az pontoz újra és küld). Nincs felület, nincs visszajelzés; a hiba csendes. Ugyanaz a kör
 * nem megy kétszer (localStorage-jelző + a szerver egyedi kulcsa).
 */
/** Review #280: a feladatok beküldése megvárja a döntőbíró ítéleteit (`ready`), hogy a levél ugyanazt a pontot kapja, amit a tanuló lát;
 *  biztonsági háló: a lezárás után legkésőbb 45 s-mal mindenképp beküld (a döntőbíró hibája esetén a pontozó ítélete marad). */
export const REPORT_FALLBACK_MS = 45_000;
export function useResultReport(lessonId: string | undefined, kind: "tasks" | "quiz", round: ExperienceRound, storageKey: string, ready = true) {
  const sending = useRef(false);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    setTimedOut(false);
    if (!round.finishedAt || ready) return;
    const timer = setTimeout(() => setTimedOut(true), REPORT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [round.finishedAt, ready]);
  useEffect(() => {
    if (!lessonId || !round.finishedAt || sending.current || !(ready || timedOut)) return;
    const roundId = `round-${experienceFingerprint({ ids: round.ids, startedAt: round.startedAt })}`;
    const flag = `${storageKey}:${kind}:sent:${roundId}`;
    try { if (localStorage.getItem(flag)) return; } catch { /* privát módban a szerver egyedi kulcsa véd */ }
    sending.current = true;
    void (async () => {
      try {
        const fingerprint = await getFingerprint().catch(() => undefined);
        // Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md, S2): a párosított eszköz tokenje — a szerver ellenőrzi.
        const learner = getLearnerToken();
        const body = kind === "tasks"
          ? { kind, roundId, answers: Object.fromEntries(round.ids.map(id => [id, round.answers[id] ?? ""])), ...(fingerprint ? { fingerprint } : {}), ...(learner ? { learner } : {}) }
          // Review #280: a kör minden kérdése megy; a kihagyott -1 (nulla pont), különben a levél pontszáma eltérne a képernyőétől.
          : { kind, roundId, picks: Object.fromEntries(round.ids.map(id => [id, round.picks[id] ?? -1])), ...(fingerprint ? { fingerprint } : {}), ...(learner ? { learner } : {}) };
        await apiRequest("POST", `/api/lessons/${lessonId}/results`, body);
        try { localStorage.setItem(flag, "1"); } catch { /* elég a szerver egyedi kulcsa */ }
      } catch { /* csendes: a tanuló felülete nem függ a levéltől */ }
      finally { sending.current = false; }
    })();
  }, [lessonId, kind, round, storageKey, ready, timedOut]);
}
