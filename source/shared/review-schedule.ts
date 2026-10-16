/**
 * Websuli Design §7 — az ismétlés MVP-ütemezése, a felülettől külön, tesztelt modulban (docs/specs/2026-10-16-websuli-ismetles.md).
 * A képlet a mesterutasítás szövege szerint: „Még gyakorlom” → 10 perc múlva újra; „Már tudom” → 1 nap, majd duplázás, legfeljebb
 * 60 nap. Nem pedagógiailag validált optimum; később FSRS/SM-2-szerű stratégiára cserélhető (ugyanez a szignatúra).
 * Az esedékesség időzónától független ISO 8601 pillanat; a megjelenítés hu-HU.
 */
export type ReviewRating = "again" | "known";
export const REVIEW_RATINGS = ["again", "known"] as const satisfies readonly ReviewRating[];
export type ReviewState = { intervalDays: number; repetitions: number; dueAt: string };

export function nextReview(previous: ReviewState | null, rating: ReviewRating, now: Date): ReviewState {
  const prev = previous ?? { intervalDays: 0, repetitions: 0, dueAt: now.toISOString() };
  const days = rating === "again" ? 0 : prev.intervalDays === 0 ? 1 : Math.min(prev.intervalDays * 2, 60);
  const dueAt = new Date(now.getTime() + (rating === "again" ? 10 * 60_000 : days * 86_400_000));
  return { intervalDays: days, repetitions: rating === "again" ? 0 : prev.repetitions + 1, dueAt: dueAt.toISOString() };
}

export type ReviewQueue = { due: string[]; fresh: string[]; later: Array<{ id: string; dueAt: string }> };

/** Esedékesek (a legkorábbi elöl), majd az új kártyák a lecke sorrendjében; a többi „később”, a legközelebbi elöl. */
export function reviewQueue(cardIds: readonly string[], states: Readonly<Record<string, ReviewState>>, now: Date): ReviewQueue {
  const due: Array<{ id: string; at: number }> = [];
  const fresh: string[] = [];
  const later: Array<{ id: string; at: number }> = [];
  for (const id of cardIds) {
    const state = states[id];
    if (!state) { fresh.push(id); continue; }
    const at = Date.parse(state.dueAt);
    (at <= now.getTime() ? due : later).push({ id, at });
  }
  return {
    due: due.sort((a, b) => a.at - b.at).map(d => d.id),
    fresh,
    later: later.sort((a, b) => a.at - b.at).map(l => ({ id: l.id, dueAt: new Date(l.at).toISOString() })),
  };
}

/** A következő esedékesség hu-HU szerint (pl. „2026. október 18. 14:05”). */
export function formatDue(iso: string): string {
  return new Intl.DateTimeFormat("hu-HU", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}
