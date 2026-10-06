// Spec 2026-10-06-s6-katalogus-bekotes — az ingyenes A/B-visszajátszás valószínűségi modellje (TISZTA, determinisztikus függvények).
// Review #202: egy egység+fogalom csoportban a Q generált kvízből PONTOSAN V-t vált ki a katalógus (visszatevés nélküli választás),
// ezért több tétel együttes kiváltása hipergeometrikus (nem független szorzat); ugyanazon tétel több jegyzete EGY esemény.

/** Egy lektori bank-jegyzet a visszajátszásban. `item` nélkül feloldatlan; `group` nélkül nem kvíz (nyílt feladat / módszer). */
export type ReplayNote = { round: number; item?: string; group?: string };
/** Csoport (egység + fogalom): V = szó szerint beszúrt katalógus-tétel, Q = a lecke csoportbeli kvízeinek száma. */
export type ReplayGroup = { verbatim: number; quizzes: number };

/** P(adott m különböző tétel MIND a Q-ból visszatevés nélkül választott V között van) = C(Q−m, V−m) / C(Q, V). */
export function allReplacedProbability(m: number, verbatim: number, quizzes: number): number {
  const v = Math.min(verbatim, quizzes);
  if (m <= 0) return 1;
  if (m > v || quizzes <= 0) return 0;
  let p = 1;
  for (let i = 0; i < m; i++) p *= (v - i) / (quizzes - i);
  return p;
}

export type LessonReplayStats = {
  notes: number; quizNotes: number; unresolvedNotes: number;
  /** Várható megmaradó jegyzet: Σ (1 − V/Q) — a tétel peremvalószínűsége, a jegyzetek összegére a linearitás miatt pontos. */
  notesWithCatalog: number;
  /** Legjobb eset: csoportonként a min(V, Q) legtöbb jegyzetű tétel kiváltva. */
  notesOptimistic: number;
  rounds: number;
  /** Várható megmaradó kör: Σ_kör (1 − Π_csoport hipergeometrikus(m_csoport, V, Q)); nem-kvíz / feloldatlan jegyzetnél a kör marad. */
  roundsWithCatalog: number;
  /** Legjobb eset: a kör elmarad, ha minden csoportban m ≤ min(V, Q) és minden jegyzete kvíz. */
  roundsOptimistic: number;
  /** Elméleti plafon: minden kvíz-jegyzet tétele kiváltva. */
  notesQuizCeiling: number; roundsQuizCeiling: number;
};

export function replayLessonStats(notes: readonly ReplayNote[], groups: ReadonlyMap<string, ReplayGroup>): LessonReplayStats {
  const share = (g: string | undefined) => {
    const s = g ? groups.get(g) : undefined;
    return s && s.quizzes > 0 ? Math.min(s.verbatim, s.quizzes) / s.quizzes : 0;
  };
  const quizNotes = notes.filter((n) => n.item && n.group).length;
  const unresolvedNotes = notes.filter((n) => !n.item).length;
  const notesWithCatalog = notes.reduce((a, n) => a + 1 - (n.item && n.group ? share(n.group) : 0), 0);

  // Legjobb eset jegyzetre: csoportonként a legtöbb jegyzetű tételek (döntetlennél az azonosító szerint, determinisztikusan).
  const perItem = new Map<string, { group: string; count: number }>();
  for (const n of notes) if (n.item && n.group) perItem.set(n.item, { group: n.group, count: (perItem.get(n.item)?.count ?? 0) + 1 });
  let removedOptimistic = 0;
  for (const [g, stat] of groups) {
    const cap = Math.min(stat.verbatim, stat.quizzes);
    if (cap <= 0) continue;
    removedOptimistic += [...perItem.entries()].filter(([, v]) => v.group === g)
      .sort(([ia, a], [ib, b]) => b.count - a.count || ia.localeCompare(ib)).slice(0, cap).reduce((a, [, v]) => a + v.count, 0);
  }

  const byRound = new Map<number, ReplayNote[]>();
  for (const n of notes) byRound.set(n.round, [...(byRound.get(n.round) ?? []), n]);
  let roundsWithCatalog = 0, roundsOptimistic = 0, roundsQuizCeiling = 0;
  for (const list of byRound.values()) {
    const allQuiz = list.every((n) => n.item && n.group);
    if (!allQuiz) { roundsWithCatalog++; roundsOptimistic++; roundsQuizCeiling++; continue; }
    const itemsByGroup = new Map<string, Set<string>>();
    for (const n of list) itemsByGroup.set(n.group!, (itemsByGroup.get(n.group!) ?? new Set()).add(n.item!));
    let gone = 1, possible = true;
    for (const [g, items] of itemsByGroup) {
      const s = groups.get(g) ?? { verbatim: 0, quizzes: 0 };
      gone *= allReplacedProbability(items.size, s.verbatim, s.quizzes);
      if (items.size > Math.min(s.verbatim, s.quizzes)) possible = false;
    }
    roundsWithCatalog += 1 - gone;
    if (!possible) roundsOptimistic++;
  }
  return {
    notes: notes.length, quizNotes, unresolvedNotes, notesWithCatalog, notesOptimistic: notes.length - removedOptimistic,
    rounds: byRound.size, roundsWithCatalog, roundsOptimistic, notesQuizCeiling: notes.length - quizNotes, roundsQuizCeiling,
  };
}
