# Végrehajtás — javítópanel-cím kontrasztja

1. `source/client/src/components/LessonRepairPanel.tsx`: a kártya `div`-jére `text-card-foreground`.
2. `source/tests/repair-panel-contrast.spec.ts` (új): admin-mock, `/preview/:id`, 390×844, OS világos + sötét preferencia;
   a cím számított színe és a legközelebbi nem átlátszó háttér közti WCAG-kontraszt ≥ 4,5:1; képernyőkép.
3. Ellenőrzés: a teszt a javítás nélkül bukjon, vele menjen át (build + Playwright); eslint, tsc.
