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

## Tulajdonosi döntés (2026-10-15): az olcsó jelölt a MiniMax M3, max efforttal
- A GLM 5.3 Flash helyett a **`minimax/minimax-m3`** (OpenRouter; 0,30 / 1,20 USD / 1M token, 1M kontextus). Élő próba (OpenRouter API, 2026-10-15):
  a MiniMax saját szolgáltatóján `reasoning: { effort: "xhigh", enabled: true }` mellett ténylegesen gondolkodik (127–162 reasoning-token,
  helyes ítélet, 3–5 s); a Together-szolgáltatón a gondolkodás 0 tokenes volt → a hívás a MiniMax szolgáltatót részesíti előnyben.
- A mérés a két jelöltet (MiniMax M3 xhigh; GPT-6.1 Sol) ugyanazokon a tételeken veti össze az Opus-leletekkel.
- Élesítésnél (T6.1) az `OpenRouterProvider` a `reasoning.enabled`-et és a szolgáltató-preferenciát is küldje — ma csak az `effort` megy ki.
