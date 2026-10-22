# Stúdió-lecke szélesség — végrehajtás (AI-ügynöknek)

Terv: `docs/specs/2026-10-22-lecke-szeles-elrendezes.md`.

1. **Konténer:** `LessonRuntime.tsx:515` `max-w-3xl` → a szélességet a CSS adja; `lesson-experience.css:17` → `width:100%;
   max-width:2400px; margin-inline:auto; padding-inline:clamp(16px,2.6vw,72px)`. A hős / sávfejléc / fülsor a szélességet követi.
2. **Tananyag fül (`#…-fusion-panel-teaching`):** ≥ 1200 px:
   - kétoszlopos rács, bal oldalon sticky fejezetlista (a meglévő fejezetválasztó adatával; gomb / link, `aria-current`);
   - a legördülő (`learning-book-head`) ≥ 1200 px-en rejtett, alatta látszik.
   - A fejezet blokkjai (`.lesson-block`, `data-block`) 2 oszlopos rácsban; `data-block` ∈ {animate, visual, try, recap} és a fejezetcím
     `grid-column: 1/-1`.
   - ≥ 1500 px: a `data-block="explain"` szövege `column-count:2`, `p { break-inside: avoid }`.
3. **Módszerek:** `.fusion-method-grid` ≥ 2000 px 3 oszlop. **Feladatok:** a feladatlista konténere ≥ 1200 px 2, ≥ 2000 px 3 oszlop
   (`minmax(0,1fr)`, `align-items:start`).
4. **Kvíz:** a futó kör `max-width: 900px; margin-inline:auto`.
5. **Fix szabályok:** `p { max-width: 90ch }`; `svg, canvas, img` a blokkban `max-width: min(100%, 920px); height: auto`.
6. **Teszt:** `tests/lesson-responsive.spec.ts` DEVICES bővítése a terv mátrixára + állítások (kitöltés ≥ 80% ≥ 1200 px-en, sticky lista,
   bekezdés ≤ 90ch, ábra ≤ 920 px), képernyőkép `test-results/websuli-responsive/`. A meglévő állítások maradnak (nem gyengítünk).
