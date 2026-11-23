# PR-kapu — spec-választás szóhatárral: végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-11-23-kapu-spec-valasztas-szohatar.md`.

1. Bukó teszt a `scripts/qa/gates/pre-pr-gate.test.mjs`-ben: `sync` tő + csak `async`-ot tartalmazó teszt → nincs kiválasztva; `advent/sync`
   útvonalat tartalmazó teszt → kiválasztva; különleges karakteres tő szó szerint; a meglévő három `pickE2eSpecs` teszt változatlanul zöld.
2. `scripts/qa/gates/pre-pr-gate.mjs`: exportált `mentionsStem(text, stem)` (azonosító-határos egyezés, a tő szó szerint véve), a
   `pickE2eSpecs` nem-játék ága ezt hívja a részszó-keresés helyett.
3. Mérés (K4): a `pickE2eSpecs` futtatása az adventi PR-C változott fájllistájára a főág `source/tests/*.spec.ts` fájljain — a szám a
   PR leírásába.
4. `npm run gate:stage` → `gate:push` → vak kör → `gate:pr` → PR. A kapu saját tesztjei: `node --test scripts/qa/gates/*.test.mjs`.
5. Beolvadás után: `git merge origin/main` az adventi PR-C ágon, és a PR-kapu újrafuttatása.
