/**
 * J0c — a `game-win-paths.spec.ts` esetei játékonként (végrehajtás K.1/7, J0c 7. lépés). Egy fájl = egy `export default`
 * objektum; a spec ebből a hét fájlból építi a régi `GAMES` táblát, változatlan értékekkel és elvárásokkal.
 */
export type GameWinCase = {
  path: string;
  force: Record<string, unknown>;
  resultTestId: string;
};
