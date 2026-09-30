# Végrehajtás — körforgás-felirat ütközés (spec: 2026-09-30-korforgas-felirat-utkozes.md)

Munkakönyvtár: `source/`. A `tests/explanatory-visuals.spec.ts` NEM módosul.

1. `client/src/lesson-runtime/LessonRuntimeProbe.tsx`: új `CYCLE_LONG_LESSON` a meglévő `visualSection`
   segédfüggvénnyel, két szakasz:
   - „Mezopotámia öntözése”: `cycle`, `center: "Mezopotámia"`, fázisok: „Áradás előrejelzése”,
     „Tavaszi áradás”, „Száraz időszak”, „Tavak és csatornák”.
   - „A víz körforgása”: `cycle`, `center: "Víz"`, fázisok: „Párolgás a tengerből”, „Felhőképződés”,
     „Csapadékhullás”, „Beszivárgás a talajba”, „Felszíni lefolyás”, „Visszatérés a tengerbe”.
   `probeLesson`: `if (q.has("cycle-long")) return CYCLE_LONG_LESSON;` a `visuals` ág után.
2. Új `playwright.cycle-labels.config.ts`: `testMatch: ["cycle-labels.spec.ts", "explanatory-visuals.spec.ts"]`,
   `workers: 1`, Desktop Chrome `channel: "chrome"`, `serviceWorkers: "block"`,
   `baseURL: http://127.0.0.1:${process.env.CYCLE_PROBE_PORT ?? 5188}`, webServer
   `npx cross-env VITE_ENABLE_RUNTIME_PROBE=1 vite --host 127.0.0.1 --port <port> --strictPort`,
   `reuseExistingServer: false` (idegen szerver esetén a futás megáll, nem idegen kódot mér).
3. Új `tests/cycle-labels.spec.ts`: 360/390/1280 px, `/__lesson-runtime-probe?cycle-long=1`;
   ábránként: `text`-dobozok, `circle`-ek (cx, cy, r → képernyő-koordináta a `getScreenCTM()`-mel);
   elvárás: 2 `cycle` ábra; nincs szám-nélküli szöveg ∩ kör (a doboz és a kör távolsága < r − 1 = hiba);
   nincs levágás; nincs szöveg ∩ szöveg; nincs vízszintes görgetés; min. betű ≥ 11,5 px; minden
   fázisfelirat legközelebbi fázis-köre a sajátja (a fázisfelirat-sorokat a fázis-körök sorrendjében
   `data-phase` attribútum köti össze: `<g data-phase={i}>`). Képernyőkép: `test-results/abrak/cycle-long-<w>.png`.
4. Bukás a régi kódon: `$env:CYCLE_PROBE_PORT=5190; npx playwright test -c playwright.cycle-labels.config.ts cycle-labels`
   → elvárt: FAIL (felirat ∩ kör). (A `data-phase` a régi kódban nincs — az E3-ellenőrzés csak akkor fut,
   ha van; az E1 nélküle is mér.)
5. `client/src/lesson-runtime/blocks/explanatory-visuals.tsx`:
   - új exportált `layoutCycle(labels: string[], center: string | undefined, hasMoon: boolean)` a spec
     4–6. döntése szerint (konstansok: `W = H = 400`, `R_MAX = 104`, `node = n > 8 ? 18 : 22`, jelvény
     `(x + 0,72·node, y − 0,72·node, r = 13)`, középfelirat doboza a meglévő rajzolás alapján);
   - `CycleAnim`: `useMemo(() => layoutCycle(...))`, az `at(i)` a kapott `R`-rel; a fázis `<g>` kap
     `data-phase={i}` attribútumot; a feliratsorok `textAnchor="middle"`, `x = box.x`,
     `y = box.top + 17 + k·24`.
6. Zöld futás: `$env:CYCLE_PROBE_PORT=5190; npx playwright test -c playwright.cycle-labels.config.ts`
   → mindkét spec (3 + 3 teszt) PASS.
7. Kapuk: `npx tsc --noEmit`, `npm run lint` → 0-s kilépési kód. A képernyőképeket megnézni (1280 és 360).
