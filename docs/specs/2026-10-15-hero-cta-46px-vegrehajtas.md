# Végrehajtási utasítás — a hero CTA-gombok 46 px-esek

Terv: `docs/specs/2026-10-15-hero-cta-46px.md`. Ág: `fix/e2e-cta-subpixel` (PR #240).
1. `source/client/src/components/HeroSection.tsx`: a négy `min-h-11 min-w-11` → `min-h-[46px] min-w-[46px]`.
2. `source/tests/websuli.spec.ts`: a kerekítő segéd visszavonva; a ≥ 44 px-es kapu kerekítés nélkül, a megjegyzés az okot rögzíti.
3. Ellenőrzés: `check`, `lint`, LS-0b böngészőben (360 px), képernyőkép; a hero sortörése és a vízszintes görgetés vizsgálata.
