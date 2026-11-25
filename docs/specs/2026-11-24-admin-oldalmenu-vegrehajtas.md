# Végrehajtás: admin oldalmenü (#1985)

Terv: `docs/specs/2026-11-24-admin-oldalmenu.md`

1. Bukó teszt: `source/tests/admin-oldalmenu.spec.ts`. A mérőoldal (`AdminTabsProbe`) tartalompanelt és magas töltelékmezőt kap.
2. Megvalósítás: `AdminTabBar.tsx` (oldalsáv, kapcsoló, megőrzött állapot, `ADMIN_TABS_LAYOUT`), `admin.tsx` (elrendezés).
3. Regresszió: `admin-korszerusites.spec.ts` (17 fül, kontraszt, 390 és 1366 px).
4. Próbahiba: a sticky kiiktatásával a „görgetés után is a nézetben” ellenőrzésnek bukni kell.
5. Kapulánc: `gate:stage` → `gate:push` → helyi ellenőr → `gate:pr` → PR.
