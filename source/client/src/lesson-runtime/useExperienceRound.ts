import { useEffect, useState } from "react";
import { z } from "zod";
import { sampleIds } from "@shared/lesson-experience-score";

const roundSchema = z.object({
  ids: z.array(z.string()), answers: z.record(z.string()).default({}), picks: z.record(z.number().int().min(0).max(3)).default({}),
  sampleViewed: z.array(z.string()).default([]), startedAt: z.number().nonnegative(), finishedAt: z.number().positive().optional(),
  // Spec 2026-11-17-eredmeny-email-kviz (R2): az utolsó kvízválasz ideje — az eredményküldés 7 napos korhatára ehhez mér (a régebbi
  // tárolt körben nincs ilyen mező: ott a kezdés számít).
  lastAnsweredAt: z.number().positive().optional(),
  // #510 vak kör 13 L1: a kör létrehozásakor EGYSZER generált, nagy entrópiájú kulcs (UUID) — ebből a körazonosító. A régi tárolt
  // körben nincs ilyen: ott a régi (ujjlenyomatos) azonosító marad, hogy a már elküldött körből ne legyen újraküldés.
  roundKey: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/).optional(),
});
export type ExperienceRound = z.infer<typeof roundSchema>;
export function experienceFingerprint(value: unknown): string {
  let hash = 2166136261;
  for (const c of JSON.stringify(value)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
}

/** Véletlen v4-es UUID (a `crypto.randomUUID` nem biztonságos kontextusban hiányozhat: ott `getRandomValues`-ból). */
function newRoundKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Új kör a megadott kérdéssorral, saját kulccsal. */
export function newExperienceRound(ids: string[]): ExperienceRound {
  return { ids, answers: {}, picks: {}, sampleViewed: [], startedAt: 0, roundKey: newRoundKey() };
}

/** A kör azonosítója — minden beküldési úton EZ (claim, végleges, pillanatkép, helyi jelzők). */
export function roundIdOf(round: Pick<ExperienceRound, "ids" | "startedAt"> & { roundKey?: string }): string {
  return round.roundKey ? `round-${round.roundKey}` : `round-${experienceFingerprint({ ids: round.ids, startedAt: round.startedAt })}`;
}

export function useExperienceRound(bank: Array<{ id: string }>, count: number, storageKey: string, sample = () => sampleIds(bank, count)) {
  const fresh = (): ExperienceRound => newExperienceRound(sample());
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
