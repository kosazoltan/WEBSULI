import { apiRequest } from "@/lib/queryClient";

/**
 * A tárolt lecke lekérdezése (docs/specs/2026-10-17-lecke-betoltes.md): a `LessonView` és a `Preview` ugyanazt a kulcsot és
 * kérést használja, így a megnyitáskor az anyag-metaadattal párhuzamosan indított kérés eredményét a lejátszó újra felhasználja
 * (nincs vízesés).
 */
export type LessonByFile = { lesson: unknown; lessonId?: string };
export function lessonByFileQuery(fileId: string) {
  return {
    queryKey: ["/api/lessons/by-file", fileId] as const,
    queryFn: () => apiRequest<LessonByFile>("GET", `/api/lessons/by-file/${fileId}`),
    // Audit 2026-09-24: mobilon egy pillanatnyi hálózati hiba eddig zsákutca volt (az alapbeállítás retry:false).
    // A Preview előtöltése és a lejátszó ugyanazt a választ használja (nem kér újra azonnal).
    staleTime: 60_000,
    // Review #275: a 404 végleges (nem lecke anyag, vagy nincs publikálva) — arra nincs újrapróbálás; átmeneti hibára 2×.
    retry: (failures: number, error: Error) => (error as Error & { status?: number }).status !== 404 && failures < 2,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 4000),
  };
}
