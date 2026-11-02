# Elmaradt feladatok — végrehajtás (AI-ügynöknek)

Terv: `docs/specs/2026-10-22-elmaradt-feladatok.md`.

1. **S1 (adat, kód nélkül):** csak olvasó előellenőrzés (a mentett eredeti évfolyam = 0); egy köteg / tranzakció Neon HTTP-n:
   - `html_files.classroom`;
   - `lessons.json.classroom`;
   - `knowledge_maps.classroom` (feltétel: a mostani 9/11/12).

   Utána visszaolvasás.
2. **S2:** a `fix/...fokuszgyuru` ág újraalapozása `origin/main`-re (új commit, force-push nélkül → új ág, ha szükséges), lint, tsc, teszt,
   Playwright `lesson-design.spec.ts`, összevonás.
3. **S3 (kód):**
   - `source/server/workflows/store.ts` `stop(id, owner, message)`: feltételes UPDATE, visszaad: leállt-e.
   - `source/server/workflows/routes.ts` `POST /workflows/:id/stop`: 404 / 409 / 200; az `improved_html_files` sor lezárása.
   - `source/server/improveAsync.ts` hibaág: ha a sor már a leállítás megjegyzésével `error`, nem írja felül.
   - `source/client/src/components/studio/WorkflowPhaseBar.tsx`: „Leállítás” gomb (running / waiting), `window.confirm`, POST, újratöltés.
   - Tesztek:
     - a tiszta döntés (`canStopWorkflow`) és a megjegyzés;
     - Playwright: a gomb futó állapotban látszik, megerősítés után POST, befejezett állapotban nem látszik.
