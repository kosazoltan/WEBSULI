# Admin menü nevei — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-19-admin-menu-nevek.md`. Munkakönyvtár: `source/`. Ág: `fix/admin-menu-nevek`.

1. **`client/src/lib/admin-tabs.ts`:** a csoportcímkék: `communication` → „Tanulók és levelek”, `system` → „Rendszer és mentések”;
   a másik kettő változatlan.
2. **`client/src/components/MobileBottomNav.tsx`:**
   - `SHORT_LABEL` = `{ materials: "Tananyagok", authoring: "Készítés", communication: "Tanulók", system: "Rendszer" }`;
   - a `communication` ikonja `UserRound`;
   - `data-testid={`mobile-nav-${category.value}`}`.
3. **Tesztek (dokumentált spec-változás):**
   - `tests/admin-korszerusites.test.ts` és `tests/admin-korszerusites.spec.ts`: a címkelista;
   - `tests/admin-draft-lessons.spec.ts`: az „Anyagok menü megnyitása” → „Tananyagok menü megnyitása”;
   - `tests/studio-one-menu.test.ts`: a mobil menü forrás-őre, ha a feliratra illeszt.
   - Új forrás-őr: a mobil rövid nevek pontos listája, és a testid a csoport-id-ből.
4. **Ellenőrzés:**
   - `check`, `check:test`, `eslint`, `npm test`, `build`;
   - valós render (Playwright e2e): `admin-korszerusites.spec.ts`, `admin-draft-lessons.spec.ts`, 375 és 1280 px, kilógás nélkül.
