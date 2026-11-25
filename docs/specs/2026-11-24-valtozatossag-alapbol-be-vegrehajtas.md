# Végrehajtás: a tananyag-változatosság alapból BE (V0)

Terv: `docs/specs/2026-11-24-valtozatossag-alapbol-be.md`.

1. Bukó teszt a `source/tests/lesson-variety-flag.test.ts`-ben: V0 — élesben (`NODE_ENV=production`) beállítás nélkül BE, az `off` KI, az `on` BE; nem éles környezetben beállítás nélkül KI.
2. Megvalósítás: `source/server/studio/lesson-variety-flag.ts` — `lessonVarietyEnabled`.
3. Ellenőrzés: `npm test` (a teljes egységtesztkör változatlanul zöld); próbahiba: a régi kapcsolóval a V0-eset bukik.
4. Kapulánc: `gate:stage` → `gate:push` → `local-review` → `gate:pr` → PR.
