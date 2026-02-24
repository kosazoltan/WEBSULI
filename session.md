# WEBSULI Fejlesztési Napló

---

## 2026-02-24 Session – AI Improvement Apply javítás + Kódaudit

### Összefoglaló
Az AI-generált tananyag-javítások mentési és alkalmazási folyamatának teljes javítása. Több gyökérok azonosítva és javítva, 5×-ös kódaudit végrehajtva.

---

### 🔴 GYÖKÉROK #1 – AlertDialog Race Condition (Apply)
**Fájl:** `source/client/src/components/MaterialImprover.tsx`

**Probléma:** A Radix UI `AlertDialogAction` automatikusan lezárta a dialógust az `onClick` handler ELŐTT. A `confirmApply()` mindig `null` ID-t kapott, ezért az API hívás soha nem futott le.

**Javítás:** 
- `AlertDialog` és `confirmApply()` eltávolítva
- `handleApply()` **közvetlenül** hívja `applyMutation.mutate()`
- Nincs dialóg → nincs race condition

---

### 🔴 GYÖKÉROK #2 – AlertDialog Race Condition (Delete)
**Fájl:** `source/client/src/components/MaterialImprover.tsx`

**Probléma:** A Delete dialóg **UGYANAZT** a race condition mintát használta mint az Apply. A `confirmDelete()` a `deletingId`-t olvasta, de az `onOpenChange` resetelte mielőtt futhatott volna.

**Javítás:**
- Delete `AlertDialog` és `confirmDelete()` eltávolítva
- `handleDelete()` **közvetlenül** hívja `deleteMutation.mutate()`
- `deletingId` state eltávolítva

---

### 🔴 GYÖKÉROK #3 – Beszorult fájlok (status lock)
**Fájl:** `source/server/routes.ts`

**Probléma:** 
- DELETE endpoint: Csak `pending` és `rejected` fájlokat engedte törölni
- `applied` státuszú fájl → **kitörölhetetlen** → beszorult
- Gombok: státuszfüggő megjelenítés → `applied` fájlnál nem volt törlés gomb

**Javítás:**
- DELETE endpoint: bármilyen státuszú fájl törölhető
- UI: MINDIG megjelenik Alkalmaz + Törlés gomb, bármilyen státuszban

---

### 🔴 GYÖKÉROK #4 – In-memory job store (Render restart)
**Fájl:** `source/server/improveAsync.ts`

**Probléma:** Az AI improvement job állapotát in-memory `Map<string, ImprovementJob>` tárolta. Render deploy/restart → Map törlődik → futó job elvész → 10 perc timeout a kliensen.

**Javítás (TELJES ÁTÍRÁS):**
- **Régi:** `Map` (RAM) → Render restart = elvész
- **Új:** `improvedHtmlFiles` tábla `status: 'processing'` → PostgreSQL = perzisztens
- POST → DB INSERT `(status: 'processing', content: placeholder)` → record.id mint jobId
- AI kész → DB UPDATE `(status: 'pending', content: HTML)`
- Hiba → DB UPDATE `(status: 'error', improvementNotes: hibaüzenet)`
- Poll → DB SELECT (nem memory)
- `setInterval` cleanup eltávolítva (nem kell DB-vel)

---

### 🟡 Kódaudit javítások (5×-ös átvizsgálás)

#### Frontend (`MaterialImprover.tsx`)
| # | Hiba | Javítás |
|---|------|---------|
| 1 | `makeRunnableHtml` sima function | `useCallback` – re-render prevention |
| 2 | Üres sorok (`deletingId` maradék) | Eltávolítva |
| 3 | `"4 perc"` timeout üzenet | `"10 perc"` (helyes érték: 600000ms) |
| 4 | `updateStatusMutation` holt kód (23 sor) | Eltávolítva |
| 5 | `isLoadingFiles` unused variable | Eltávolítva |
| 6 | `startData: any` | Proper TypeScript interface |
| 7 | Blob URL memory leak (`useEffect` closure) | `useRef` pattern |
| 8 | `onSuccess: (data: any) =>` | `onSuccess: () =>` (nem használt param) |
| 9 | Unused imports (8 db) | `Skeleton, AlertDialog*, XCircle, ArrowRight, AlertTriangle, useRef` eltávolítva |
| 10 | Unused functions (3 db) | `handleApprove, handleReject, confirmDelete` eltávolítva |
| 11 | Előnézet Alkalmaz gomb hiányzott `applied` státusznál | Mindig megjelenik |
| 12 | Előnézet Törlés gomb hiányzott | Hozzáadva |
| 13 | Elavult leírás szöveg | Frissítve |
| 14 | `processing` / `error` státusz kezelés | Badge + hibaüzenet a listában |

#### Backend (`routes.ts`)
| # | Hiba | Javítás |
|---|------|---------|
| 1 | `req.user.id` (crash ha null) | `req.user?.id` + 401 check |
| 2 | Dupla DB query (route + storage) | Route delegál storage-nak |
| 3 | Response: teljes `originalFile` (60KB+) | Csak `id` és `title` |
| 4 | Debug endpoint production-ban | Eltávolítva (security) |
| 5 | Unicode escape stringek | Olvasható ékezetek |

#### Backend (`improveAsync.ts`)
| # | Hiba | Javítás |
|---|------|---------|
| 1 | `result?: any` | `ImprovementJobResult` interface |
| 2 | `originalFile: any` | `HtmlFile` (schema import) |
| 3 | In-memory Map | PostgreSQL tábla |

#### Storage (`storage.ts`)
| # | Hiba | Javítás |
|---|------|---------|
| 1 | `const updates: any` | `Partial<typeof improvedHtmlFiles.$inferInsert>` |
| 2 | Hiányzó `updateImprovedHtmlFileContent` metódus | Hozzáadva |
| 3 | Interface hiányzó deklaráció | `IStorage` interface frissítve |

#### Frontend Polling (`MaterialImprover.tsx`)
| # | Hiba | Javítás |
|---|------|---------|
| 1 | 404 → "network error" → 10 perc várakozás | 3× 404 → azonnali hibajelzés |
| 2 | 401 kezelés hiányzott | Azonnali „Jelentkezz be újra" |

---

### Érintett fájlok összesítése
```
source/client/src/components/MaterialImprover.tsx  (frontend UI + polling)
source/server/routes.ts                            (API endpoints)
source/server/improveAsync.ts                      (AI job kezelő – TELJES ÁTÍRÁS)
source/server/storage.ts                           (DB operations)
source/shared/schema.ts                            (nem módosítva, csak reference)
.github/workflows/deploy.yml                       (eltávolítva – korábbi session)
```

### Git commitok (időrendben)
1. `fix: AlertDialog teljesen eltávolítva + diagnosztikai endpoint`
2. `fix: GYÖKÉROK - beszorult fájlok kezelése javítva`
3. `fix: 6 bug javítva - 5×-ös kódaudit eredménye`
4. `refactor: teljes audit javítások - 12 hiba/minőségi probléma`
5. `fix: polling 404 kezelés - Render restart után azonnali hibajelzés`
6. `fix: 5×-ös audit kör2 - any típusok + unicode olvashatóság`
7. `fix: GYÖKÉROK JAVÍTÁS - job állapot DB-ben, nem memóriában`

---

### Tanulságok
1. **Radix UI AlertDialogAction** – Mindig lezárja a dialógust az onClick ELŐTT → Ne használj AlertDialogAction-ben aszinkron műveleteket
2. **In-memory állapot** – Render/Heroku/Railway BÁRMIKOR újraindulhat → Mindig DB-ben tárold az állapotot
3. **Státusz-függő UI** – Ha a gombok státusztól függenek, a fájl beszorulhat → Legyen mindig elérhető legalább a törlés
4. **Kód push deployolás közben** – Render auto-deploy → futó job megszakad → Ne pusholj amíg AI job fut
