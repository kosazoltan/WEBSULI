# Admin felület korszerűsítése — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-18-admin-korszerusites.md`. Munkakönyvtár: `source/`. Ág: `feat/admin-korszerusites`.
Minden feladat után: `npx.cmd tsc --noEmit -p .` → 0 hiba.

## 1. Keresőmező olvashatósága
1. **Fájl:** `client/src/components/ui/input.tsx`. Az alaposztály-listában a `bg-background` után illeszd be: `text-foreground`.
2. **Teszt:** az `tests/admin-korszerusites.test.ts` (új) statikusan ellenőrzi, hogy az `input.tsx` alaposztálya tartalmazza a
   `text-foreground`-ot.
3. **Böngészős teszt:** a `tests/admin-korszerusites.spec.ts` (új) a `/__admin-tabs-probe` oldalon:
   - a keresőmező számított `color` ≠ `background-color`;
   - a szöveg kontrasztja ≥ 4.5.

## 2. Felhasználó-végpontok
1. **Fájl:** `server/admin-users.ts` (új).
   - **Export:**
     - `publicUser(u)`: a terv szerinti mezők, jelszó nélkül;
     - `adminUserGuard({ actorId, targetId, action, users })`: `null` vagy magyar hibaüzenet.
   - **Szabályok:**
     - `delete` / `ban` / `revokeAdmin` saját fiókra → hiba;
     - `delete` / `revokeAdmin`, ha a cél az utolsó admin → hiba.
   - **`registerAdminUserRoutes(router, storage)`:**

     | Végpont | Bemenet | Hívás |
     |---|---|---|
     | `GET /users` | – | `storage.getAllUsers().map(publicUser)` |
     | `DELETE /users/:id` | – | `storage.deleteUser` |
     | `PATCH /users/:id/ban` | `{ banned: boolean }` | `storage.toggleUserBan` |
     | `PUT /users/:id/toggle-admin` | `{ isAdmin: boolean }` | `storage.toggleUserAdmin` |

     - Hibás body → 400; ismeretlen id → 404; guard-hiba → 400 `{ message }`.
     - Az aktor azonosítója `req.user.id`.
2. **Fájl:** `server/routes.ts`. Az `adminRouter` létrehozása után hívd meg: `registerAdminUserRoutes(adminRouter, storage)`.
3. **Teszt** (`tests/admin-korszerusites.test.ts`):
   - `publicUser` nem ad `password` mezőt;
   - a guard négy esete (saját törlés, saját tiltás, utolsó admin jogának elvétele, másik admin jogának elvétele 2 adminnál → `null`);
   - a `routes.ts` meghívja a `registerAdminUserRoutes`-t.

## 3. Közös fül-definíció és menü
1. **Fájl:** `client/src/lib/admin-tabs.ts` (új).
   - `ADMIN_TAB_GROUPS: { id, label, tabs: { value, label, icon }[] }[]` — a terv 5. pontjának négy csoportja, lucide ikonokkal:

     | Fül | Ikon |
     |---|---|
     | Fájlok | `FolderOpen` |
     | PDF-feltöltés | `FileUp` |
     | Címkék | `Tag` |
     | Megtekintések | `Eye` |
     | Tananyag készítése | `Sparkles` |
     | Futások | `ListChecks` |
     | Tananyagjavító | `Wrench` |
     | Régi anyag okosítása | `Wand2` |
     | E-mail címzettek | `Mail` |
     | E-mail diagnosztika | `Activity` |
     | Szülői összesítő | `GraduationCap` |
     | Felhasználók | `Users` |
     | Mentés és visszaállítás | `HardDriveDownload` |
     | Javítási mentések | `History` |
     | Adatbázis | `Database` |

   - `ADMIN_TAB_VALUES` (lapos lista).
   - `resolveAdminTab(param)`:
     - `knowledge-maps` és `enhanced` → `lesson-studio`;
     - ismeretlen vagy üres → `files`.
2. **Fájl:** `client/src/pages/admin.tsx`.
   - A `validTabs` és a redirect helyett `resolveAdminTab`.
   - A `TabsList` a csoportokból renderel: csoportonként kis felirat (`text-[11px] uppercase tracking-wide`), alatta a gombok
     (`text-[13px] h-8 px-2.5`, ikon `h-4 w-4`, aktív: `bg-orange-700 text-white`).
   - Az `enhanced` `TabsContent` és a nem használt importok törlése.
   - A `value` / `data-testid` értékek változatlanok (`tab-<value>`).
3. **Fájl:** `client/src/components/MobileBottomNav.tsx`. Az `adminCategories` az `ADMIN_TAB_GROUPS`-ból képződik, a
   kategóriaikonok rendre `FileText`, `Sparkles`, `Mail`, `Settings`. Így a mobilon a Fájlok és az Adatbázis is elérhető, az
   „AI készítő” kikerül.
4. **Próbaoldal:** `client/src/pages/AdminTabsProbe.tsx` (új, csak fejlesztői / teszt route, mint a `__lesson-runtime-probe`):
   - a csoportos menü statikus renderje (Tabs);
   - egy `Input` a kereső osztályaival.

   **Route:** `App.tsx` a meglévő probe-route-ok mellé: `/__admin-tabs-probe`.
5. **Teszt:**
   - `tests/admin-korszerusites.test.ts`:
     - `resolveAdminTab("enhanced") === "lesson-studio"`, `resolveAdminTab("x") === "files"`;
     - minden fülnek van ikonja;
     - 15 fül, 4 csoport, az `enhanced` nincs közte.
   - `tests/admin-korszerusites.spec.ts`, 390 és 1366 px:
     - négy csoportfelirat;
     - nincs `scrollWidth > clientWidth` a dokumentumon;
     - minden fülgomb látható szöveggel.

## 4. Halott kód törlése
1. **Fájlok törlése:**
   - `client/src/components/EnhancedMaterialCreator.tsx`;
   - `client/src/components/SystemPromptEditor.tsx`;
   - `client/src/components/PushNotificationToggle.tsx`.
2. **`server/routes.ts` végpontjainak törlése:**
   - `adminRouter.post("/html-fix/responsive" | "/html-fix/errors" | "/html-fix/theme" | "/html-fix/chat" | "/html-fix/apply" | "/material-creator/chat")`;
   - `app.post("/api/ai/enhanced-creator/analyze-files" | "analyze-file" | "chatgpt-chat" | "claude-chat")`;
   - `adminRouter.get/post/put("/system-prompts…")` (minden system-prompts kezelő).

   Utána az eslint/tsc által jelzett nem használt importok és segédek törlése. A `server/ai/legacy-fallback.ts` exportjai közül
   azok törlődnek a tesztjükkel együtt, amelyekre `grep -rn` szerint már nincs hivatkozás.
3. **Tesztek (dokumentált spec-változás: a funkció megszűnt):**
   - `tests/audit-2026-09-static.test.ts`: a két `EnhancedMaterialCreator` teszt törlése;
   - `tests/s7-workflow-guard.test.ts`: a törölt útvonalak sorai a listákból;
   - `tests/client-csrf-guard.test.ts:122`: a fixture-sor egy létező POST-útvonalra cserélve (pl. `/api/html-files`), a teszt
     célja (CSRF-fejléc) változatlan;
   - `tests/cross-family-fallback-b3b.test.ts`: csak a ténylegesen törölt segéd tesztje esik ki.
4. **Ellenőrzés:** `grep -rn "enhanced-creator\|EnhancedMaterialCreator\|SystemPromptEditor\|PushNotificationToggle\|html-fix/\|material-creator/chat\|/system-prompts" client/src server tests` → 0 találat. A skill-címke szótárak (`"html-fix"` szerepnév) maradhatnak.

## 5. Verifikáció
- `npx.cmd tsc --noEmit -p .`, `npx.cmd eslint` az érintett fájlokon, `npm.cmd test`, `npm.cmd run build`.
- `npx.cmd playwright test tests/admin-korszerusites.spec.ts`.
- Deploy után élesben, Chrome-ban (Browser 2) az `/admin` oldalon:
  - a keresőben gépelt szöveg látszik;
  - a Felhasználók lista betölt;
  - a csoportos menü látszik.
