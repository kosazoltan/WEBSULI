# Évfolyam-arculat látható — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-19-evfolyam-arculat-lathato.md`. Munkakönyvtár: `source/`. Ág: `fix/evfolyam-arculat`.

1. **`shared/lesson-design.ts`:** a `DesignTheme` kiegészül a `heroFrom`, `heroTo`, `accent2` és `accent3` mezőkkel.
   - A színátmenet értékei a terv táblázatából jönnek.
   - Az `accent2` / `accent3` a `tokens.json` értékei.
2. **`client/src/lesson-runtime/lesson-design.css`:**
   - **Témablokkok:** témánként `--ws-hero-from`, `--ws-hero-to`, `--ws-accent-2`, `--ws-accent-3`.
   - **Gyökér háttere:** `linear-gradient(170deg, var(--ws-hero-from), var(--ws-hero-to))`.
   - **Sötét téma:** a future sötét színátmenete is (eddig `background-image: none`).
   - **Csendes nézet:** a `background-image: none` marad.
   - **Kártyák:** a `.lesson-block`, `.fusion-task` és `.fusion-method` felső szegélye `4px solid var(--ws-accent)`.
   - **Gomb állapota:** `.learning-quiet[aria-pressed="true"]` kitöltése `var(--ws-strong)`, felirata `var(--ws-strong-ink)`.
3. **`client/src/lesson-runtime/LessonExperienceView.tsx`:**
   - A kulcs `websuli:learning-quiet-v2`.
   - A gomb felirata `quiet ? "Színes nézet" : "Csendes nézet"`, ikonja `Palette` / `Leaf`, `aria-pressed` marad, `title`
     magyarázattal.
4. **Tesztek:**
   - `tests/lesson-design.test.ts`: új teszt (a régiek változatlanok):
     - a CSS ↔ TS egyezés a négy új tokenre;
     - kontraszt ≥ 4,5 (ink, muted, title) a két végponton;
     - a sávok `heroFrom` értékei különbözők.
   - `tests/lesson-band-colors.spec.ts` + `playwright.band-colors.config.ts` (vite + `VITE_ENABLE_RUNTIME_PROBE=1`):
     - öt évfolyamon a gyökér `background-image` a sáv színátmenete, és a sávok különböznek;
     - a régi `websuli:learning-quiet=true` mellett színes nézet;
     - a gomb „Csendes nézet” → kattintás → „Színes nézet”, a háttér halk;
     - nincs kilógás 390 / 1440 px-en;
     - képernyőkép sávonként.
   - A meglévő `tests/lesson-design.spec.ts` csendes nézetes tesztje a `.learning-quiet` gombot kattintja (változatlanul jó).
5. **Ellenőrzés:**
   - `check`, `check:test`, `eslint`, `npm test`, `build`, az új Playwright-konfig;
   - élő leckék (websuli.vip adat, helyi kliens) képernyőképe sávonként.
