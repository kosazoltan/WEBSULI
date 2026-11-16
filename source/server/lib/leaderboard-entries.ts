import { displayHandle } from "./display-handle";

/** A nyilvános ranglista-sor: kizárólag a felsorolt mezők kerülnek ki (a sor többi mezője — akár valódi név, e-mail — soha). */
export function toLeaderboardEntries(
  rows: ReadonlyArray<{ userId: string; bestRunXp: number; bestStreak: number; bestRunSeconds: number }>,
) {
  return rows.map((r, rank) => ({
    rank: rank + 1,
    // JM0: valódi név / e-mail soha nem kerül a nyilvános válaszba; a név a userId-ből képzett „Játékos #xxxx”.
    displayName: displayHandle(r.userId),
    bestRunXp: r.bestRunXp,
    bestStreak: r.bestStreak,
    bestRunSeconds: r.bestRunSeconds,
  }));
}
