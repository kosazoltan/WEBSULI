/**
 * Spec 2026-09-20 (docs/specs/2026-09-20-home-list-refresh.md): a főoldal tananyaglistája
 * mobilon is magától frissüljön. Mérve: a react-query alapértelmezett 30 mp-es staleTime és a
 * szerver 60 mp-es max-age együtt azt adta, hogy egy nyitva hagyott vagy visszalépéssel elért
 * főoldal nem vette észre az új tananyagot, kézi újratöltés kellett.
 */

export const HOME_FILES_QUERY_KEY = ["/api/html-files"] as const;

/** Milyen gyakran kérdezzen újra a látható főoldal (a rejtett lap nem). */
export const HOME_FILES_REFETCH_MS = 60_000;

export function homeFilesQueryOptions() {
  return {
    queryKey: HOME_FILES_QUERY_KEY,
    retry: 2,
    /** Mindig újrakérdez, ha a főoldal (újra) megjelenik — visszalépés a leckéből is. */
    staleTime: 0,
    refetchOnMount: "always" as const,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    /** Nyitva hagyott főoldal: percenként, csak látható lapon. */
    refetchInterval: HOME_FILES_REFETCH_MS,
    refetchIntervalInBackground: false,
  };
}

export type LessonListItem = { id: string; createdAt?: string; title?: string };

/**
 * A lecke oldalán az előző/következő tananyag a lista sorrendje szerint (a lista maga már
 * a szerver sorrendjében jön: legújabb elöl). A szélen `null`.
 */
export function lessonNeighbours<T extends LessonListItem>(files: readonly T[], currentId: string): { prev: T | null; next: T | null } {
  const index = files.findIndex((f) => f.id === currentId);
  if (index === -1) return { prev: null, next: null };
  return { prev: files[index - 1] ?? null, next: files[index + 1] ?? null };
}
