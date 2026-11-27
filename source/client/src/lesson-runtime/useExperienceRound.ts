import { useEffect, useState } from "react";
import { z } from "zod";
import { sampleQuizIds } from "@shared/practice-sampling";
import { newRoundNonce, recoverRoundNonce, rememberRoundNonce, ROUND_NONCE } from "@shared/round-id";

const roundSchema = z.object({
  ids: z.array(z.string()), answers: z.record(z.string()).default({}), picks: z.record(z.number().int().min(0).max(3)).default({}),
  sampleViewed: z.array(z.string()).default([]), startedAt: z.number().nonnegative(), finishedAt: z.number().positive().optional(),
  // Eredmény-e-mail B1b (R2): az utolsó kvízválasz ideje — a beküldés 7 napos korhatára ehhez mér (régebbi tárolt körben nincs: ott a kezdés számít).
  lastAnsweredAt: z.number().positive().optional(),
  // B8 (docs/specs/2026-11-25-eredmeny-email-b8.md): a kör 128 bites véletlen azonosító-magja (`r2-<nonce>`); a régi kliens sémája eldobja.
  nonce: z.string().regex(ROUND_NONCE).optional(),
});
export type ExperienceRound = z.infer<typeof roundSchema>;
export { experienceFingerprint } from "@shared/experience-fingerprint";
// TG-P6: az alapértelmezett (kvíz-) sorsolás kiegyensúlyozott — 60–75% alkalmazó tétel; a nyílt kör saját választót ad át.
export function useExperienceRound(bank: Array<{ id: string; question?: string; options?: readonly string[] }>, count: number, storageKey: string, sample = () => sampleQuizIds(bank, count)) {
  const fresh = (): ExperienceRound => ({ ids: sample(), answers: {}, picks: {}, sampleViewed: [], startedAt: 0, nonce: newRoundNonce() });
  const [round, setRound] = useState<ExperienceRound>(() => {
    try {
      const parsed = roundSchema.safeParse(JSON.parse(localStorage.getItem(storageKey) ?? "null"));
      if (parsed.success && parsed.data.ids.length === count && new Set(parsed.data.ids).size === count && parsed.data.ids.every(id => bank.some(t => t.id === id))) return recoverRoundNonce(localStorage, storageKey, parsed.data);
    } catch { /* Storage is optional in private browsing. */ }
    return fresh();
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(round)); rememberRoundNonce(localStorage, storageKey, round); } catch { /* In-memory round remains usable. */ }
  }, [round, storageKey]);
  return { round, setRound, reset: () => setRound(fresh()) };
}
