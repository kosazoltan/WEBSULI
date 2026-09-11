import { useEffect, useState } from "react";
import { z } from "zod";
import { sampleIds } from "@shared/lesson-experience-score";

const roundSchema = z.object({
  ids: z.array(z.string()), answers: z.record(z.string()).default({}), picks: z.record(z.number().int().min(0).max(3)).default({}),
  sampleViewed: z.array(z.string()).default([]), startedAt: z.number().nonnegative(), finishedAt: z.number().positive().optional(),
});
export type ExperienceRound = z.infer<typeof roundSchema>;
export function experienceFingerprint(value: unknown): string {
  let hash = 2166136261;
  for (const c of JSON.stringify(value)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}
export function useExperienceRound(bank: Array<{ id: string }>, count: number, storageKey: string, sample = () => sampleIds(bank, count)) {
  const fresh = (): ExperienceRound => ({ ids: sample(), answers: {}, picks: {}, sampleViewed: [], startedAt: 0 });
  const [round, setRound] = useState<ExperienceRound>(() => {
    try {
      const parsed = roundSchema.safeParse(JSON.parse(localStorage.getItem(storageKey) ?? "null"));
      if (parsed.success && parsed.data.ids.length === count && new Set(parsed.data.ids).size === count && parsed.data.ids.every(id => bank.some(t => t.id === id))) return parsed.data;
    } catch { /* Storage is optional in private browsing. */ }
    return fresh();
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(round)); } catch { /* In-memory round remains usable. */ }
  }, [round, storageKey]);
  return { round, setRound, reset: () => setRound(fresh()) };
}
