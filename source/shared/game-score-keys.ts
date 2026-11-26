/**
 * Pontszám-tárolási kulcsok (D-04, tulajdonosi döntés 2026-11-19; terv: docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md,
 * J3a „D-04”). Új pontskála = új kulcs: a régi rekordok a régi kulcs alatt archívként megmaradnak (nincs nullázás, nincs
 * átváltás), az új menetek az új kulcs alá kerülnek. A játék azonosítója (útvonal, kérdésbank, jelvények) nem változik.
 */

/** A Kockavadász játék azonosítója és egyben a régi (archív) pontkulcs. */
export const BLOCK_CRAFT_LEGACY_SCORE_KEY = "block-craft-quiz" as const;

/** A Rúnabánya pontskálájának kulcsa (`game_scores.game_id`, helyi legjobb eredmény). */
export const BLOCK_CRAFT_SCORE_KEY = "block-craft-quiz-v2" as const;

/** A csak pontkulcsként létező katalógussorok — nem önálló játékok. */
export const SCORE_ONLY_GAME_KEYS: ReadonlySet<string> = new Set([BLOCK_CRAFT_SCORE_KEY]);

/** A lobbiban / játéklistában megjelenő katalógus: a csak pontkulcs-sorok nélkül. */
export function lobbyCatalog<T extends { id: string }>(rows: readonly T[]): T[] {
  return rows.filter((row) => !SCORE_ONLY_GAME_KEYS.has(row.id));
}
