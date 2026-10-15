# Végrehajtási utasítás — Tételgyár T6: kvíz vak megoldása gyártáskor

Terv: `docs/specs/2026-10-15-tetelgyar-t6-kviz-vak-megoldas.md`. Ág: `feat/tetelgyar-t6`.

## T6.0 — mérés (csak szkript, DB-írás nélkül)
- `source/scripts/measure/quiz-blind-trial.mts <kimeneti mappa> <jobId,…>` (legfeljebb 4 job, `withReadOnlyDb`):
  - a mentett lecke kvíztételei fejezetenként (legfeljebb 12 tétel / hívás), a fejezet tanításával, KULCS ÉS VISSZAJELZÉS NÉLKÜL;
  - az olcsó modell (a `gateHelper` szerep két modellje, glm elöl) opciónkénti igaz/hamis ítélete; a kód döntése a meglévő
    `choiceVerdictProblem`-mel;
  - összevetés: a job `lektor_notes`-ában az Opus bank-ellenőr egyválasztós lelete ugyanarra a tételre (`item_id`, különben útvonal);
  - kimenet: tételenként mindkét ítélet; összesítés: felidézés, téves riasztás, egyezés, hívások ideje.
- Mérési készlet: a 13 egyválasztós leletes job közül a 4 legtöbb lelettel.
- Kimenet: `docs/measurements/2026-10-15-t6-kviz-vak.json`; a döntés (modellválasztás) a tulajdonosé, a mérés számaival.
