# Végrehajtás — magyarázó ábrák (ügynöknek)

Terv: `docs/specs/2026-09-24-magyarazo-abrak.md`. Minden szelet külön ág + PR; meglévő tesztet nem módosítunk (kivéve dokumentált spec-változás).

## 1. szelet — rajzolók (`fix/abrak-1-rajzolok`)
1. `shared/lesson-visual-params.ts` (új): zod-sémák fajtánként (`cycle`, `labeledShape`, `barChart`, `venn`, bővített `numberLine`, régi fajták). `safeVisualParams(kind, params)` → `{ ok, params } | { ok: false, reason }`.
2. `shared/lesson-schema.ts` ANIM_KINDS bővítése (`cycle`, `labeledShape`, `barChart`, `venn`, `illustration`); a régi kliens tolerancia (`tolerantLessonInput`) ismeretlen fajtát kihagy.
3. `client/src/lesson-runtime/blocks/` új komponensek, közös SVG-stílus (téma-színek, `currentColor`), `role="img"` + `aria-label`; hibás paraméternél nincs ábra.
4. Tesztek: `tests/lesson-visual-params.test.ts`; böngészős render a `LessonRuntimeProbe`-bal 375 px / 1280 px, képernyőkép.

## 2. szelet — illusztráció (`fix/abrak-2-illusztracio`)
1. `server/studio/tools/svg-illustration.ts`: tisztítás allowlisttel (svg, g, path, circle, ellipse, rect, line, polyline, polygon, text, tspan, defs, linearGradient, radialGradient, stop, marker, title), attribútum-allowlist, méretkorlát, `viewBox` kötelező; `<text>` tartalma a lecke szövegében szerepeljen (normalizált).
2. Kliens: `IllustrationAnim` isomorphic-dompurify SVG-profillal újratisztít, inline renderel.
3. Tesztek: támadó minták kiesnek; érvényes holdfázis-SVG átmegy.

## 3. szelet — folyamat, modell, skill (`fix/abrak-3-modell`)
1. `step-runner.ts`: `deterministicSectionVisuals` csak az animátor-modell HIBÁJA után fut.
2. `server/ai/models.ts`: animator elsődleges/tartalék modell a döntés szerint.
3. `role-skills.ts` animator skill újraírása (≤ 6000 kar.): fajta-választási táblázat, tilalom a szövegdobozos ábrára, illusztrációs szabályok (viewBox, magyar címkék, egyszerű formák, kontraszt).
4. `shared/runtime-knowledge.ts` SOUL: egy mondat az ábrák céljáról.

## 4. szelet — kapu és lektor (`fix/abrak-4-kapu`)
1. `server/studio/visual-quality.ts`: `process` = példa-lépések szó szerint → hiba; fajtánkénti minimum.
2. Lektor skill: „az ábra mutatja-e a fogalmat” (language/info, nem blokkoló, ha nem hamis).

## Minden szelet végén
tsc (+test), `npx eslint client/src server --max-warnings 0`, teljes teszt, build, böngészős render; PR → CI → merge → Render/Vercel ellenőrzés; a 3. szelet után élő futás (felvételi PDF + holdciklus), képernyőképpel.
