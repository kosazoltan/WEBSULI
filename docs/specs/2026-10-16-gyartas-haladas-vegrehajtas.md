# A tananyaggyártás észlelhetősége — végrehajtási utasítás (AI-ügynöknek)
Terv: `docs/specs/2026-10-16-gyartas-haladas.md`. Ág: `feat/gyartas-haladas`. Kapuk: tsc, check:test, lint, test, DB-test, célzott e2e.

1. **`experience-builder.ts`:** új dep: `onProgress?({ done, total, current? })`.
   - Az egységcsomag-ciklusban a csomag indítása előtt: `{ done: start, total: plan.units.length, current: chunk[0].sectionIndex }`.
   - A csomag lezárása után: `{ done: min(start + chunk.length, total), total }`.
   - Hiba a hívóban nem állítja meg a bankot (try/catch).
2. **`engine.ts`:**
   - A `phase` az utolsó fázist megjegyzi (`currentPhase`).
   - A `buildBank` címkét kap: „Gyakorlóbank” / „Bankjavítás a lektor jelzései alapján”. Az `onProgress` → `phase(currentPhase, "<címke>: d/N fejezet kész — a k. készül…")`.
   - `onAttemptFailure` → `phase(currentPhase, "<címke>: a k. fejezet javító kísérlete (a.)…")`.
   - `StationDeps.onFix?(name, round)`; a `runStation` a javító fordulóban hívja → `phase(currentPhase, "<állomás>: javító forduló (r.)…")`.
3. **`lesson-pipeline-routes.ts`:**
   - Az `OneStepRunView` új mezői: `elapsedSec`, `sinceUpdateSec`, `alive`.
     - A két idő a run `startedAt` / `updatedAt` mezőjéből, szerveroldali `Date.now()`-val; csak nem lezárt fázisnál.
     - `alive`: a workflow-sor `lease_until > now()` (SQL).
   - Az `OwnerDraft` futó tétele `progress: { detail, elapsedSec, sinceUpdateSec, alive }` mezőt kap: a job legutóbbi
     `one_step_runs` sora (LATERAL), az időket SQL-ben, `extract(epoch …)`-val, és a lízinget is.
4. **`shared/studio-ui.ts`:**
   - `OneStepRunView` + `elapsedSec?`, `sinceUpdateSec?`, `alive?`.
   - `progressTimingText(v)` → „Eltelt idő: 18 perc · utolsó jelzés: 1 perce · a háttérfolyamat él”; ha `alive === false`: „… · a
     háttérfolyamat nem jelez”. Perc alatt másodperc; idő nélkül `null`.
5. **Felület:**
   - `CreationProgress` a részlet alatt kiírja a `progressTimingText`-et (`data-testid="creation-progress-timing"`).
   - `DraftLessons` futó tételénél a `progress.detail` megy a `CreationProgress`-be, az idők is.
6. **Tesztek:**
   - unit: `progressTimingText`; a motor haladásszövegei (bank d/N, javító kísérlet, javító forduló);
   - `experience-builder` `onProgress`;
   - DB: a draftlista futó tételének `progress` mezője;
   - e2e: időjelzés a futáskövetőben és a draftlistán, telefonon kilógás nélkül.
