/**
 * A forrás vizuális leltárának FUNKCIÓKAPCSOLÓJA (docs/specs/2026-11-18-tananyag-gyartas-minoseg.md, 0. elv: önálló beolvaszthatóság).
 *
 * Alapból KI: az 1. állomás nem kér és nem dolgoz fel leltárt, a térképbe nem kerül `visuals`, a lejjebb lévő állomások kérése és
 * a telemetria a kapcsoló előtti állapottal azonos — így a szeletek egyenként is beolvaszthatók az éles gyártás változása nélkül.
 * BE: `STUDIO_SOURCE_VISUALS=on` (kis- / nagybetű és szóköz nem számít); minden más érték és a hiány KI (biztonságos alapérték).
 *
 * A környezetet EZ az egy függvény olvassa; a motor a `SingleRunDeps.sourceVisuals` befecskendezett értékét veszi előre (teszt,
 * mérőharness), és csak annak hiányában hívja ezt.
 */
export const SOURCE_VISUALS_ENV = "STUDIO_SOURCE_VISUALS";

export function sourceVisualsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[SOURCE_VISUALS_ENV]?.trim().toLowerCase() === "on";
}
