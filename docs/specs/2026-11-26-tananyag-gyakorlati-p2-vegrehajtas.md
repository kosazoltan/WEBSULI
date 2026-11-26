Terv: `docs/specs/2026-11-26-tananyag-gyakorlati.md` (PR 2 — A tanítható forrás elkülönítése; első rész: adminisztratív fogalom kizárása)

# Végrehajtás — TG-P2a: a pontozási / adminisztratív szöveg nem lehet tanítandó fogalom

Tulajdonosi döntés (2026-11-26): a konkrét feladat, példa és helyes megoldás tanítható marad akkor is, ha ugyanazon az oldalon
pontozási útmutató áll; a pontérték, időkeret, a lap felépítése nem kerülhet a tanítandó fogalmak közé (különben ebből lesz
„Hány pontot ér…?” kérdés). A P2a a forrásállomáson (`readSourceStation`) kéri és ellenőrzi ezt; a teljes szakaszjelölés
(tanítható / csak ellenőrzésre / adminisztráció, mentett jelölés, szabályverzió a hash-ben) a P2b.

1. `shared/source-teaching-scope.ts`: `adminConceptProblem({ id, term, definition, quote })` — determinisztikus: a fogalom
   neve / definíciója a pontozásra, időkeretre, a lap felépítésére vonatkozik, VAGY az idézet pontozási / időkeret-mondat
   tanított tartalom (példaszó, elválasztott alak, képlet, idézett szöveg) nélkül. A vegyes sor („Elfogadható: osz-tály — 1 pont”)
   tanítható része miatt elfogadott.
2. A forrásállomás kérése egy sorral kiegészül (`SOURCE_SCOPE_RULE`, `shared/practice-rules.ts`), a validátor a problémát
   javító fordulóra küldi.
3. Bukó teszt: `tests/source-teaching-scope.test.ts` (egységek + a forrásállomás: a pontozási fogalom javító fordulót kap,
   a térképbe nem kerül, a vegyes sor példája megmarad).

Állapot: TG-P2a 1/3 egység kész — következő: bukó teszt
