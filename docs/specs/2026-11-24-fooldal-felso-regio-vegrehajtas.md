# Végrehajtás: főoldal felső régió (#1984)

Terv: `docs/specs/2026-11-24-fooldal-felso-regio.md`

1. Bukó teszt: `source/tests/home-layout.spec.ts` (E1–E3; 1440, 1100 és 390 px).
2. Megvalósítás:
   - `UserFileList.tsx`: `home-top` és `home-toolbar` szerkezet;
   - `SponsorBar.tsx`: `variant="tile"`;
   - `index.css`: rács, csempe, eszközsor.
3. Forrásőr-tesztek igazítása, dokumentált spec-változással: `advent-home-card.test.ts`, `sponsor-bar.test.ts`.
4. Próbahiba: a csempe-változat kiiktatásával a két asztali esetnek bukni kell.
5. Kapulánc: `gate:stage` → `gate:push` → helyi ellenőr → `gate:pr` → PR.
