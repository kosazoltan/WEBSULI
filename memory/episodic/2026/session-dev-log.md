---
id: episodic_development_20260410_406
type: episodic
domain: development
created: 2026-04-10
source: session.md
tags: [dev-log, bugfix, ai-improvement, database, migration, race-condition]
project: websuli
---

# WEBSULI Fejlesztési Napló

## 2026-02-24: AI Improvement Apply javítás + Kódaudit

### 5 gyökérok javítva

**#1 AlertDialog Race Condition (Apply)**: Radix UI `AlertDialogAction` lezárta a dialógust az onClick ELŐTT → ID null → API nem futott. Fix: AlertDialog eltávolítva, `handleApply()` közvetlenül hívja `applyMutation.mutate()`

**#2 AlertDialog Race Condition (Delete)**: Ugyanaz a minta. Fix: `handleDelete()` közvetlenül hívja `deleteMutation.mutate()`

**#3 Beszorult fájlok**: DELETE endpoint csak pending/rejected-et engedett → applied törölhetetlen. Fix: minden státusz törölhető

**#4 In-memory job store**: Render restart → Map törlődik → job elvész. Fix: `improvedHtmlFiles` tábla status='processing' → PostgreSQL perzisztens

**#5 Atomi content+status update**: Két külön DB UPDATE → race condition. Fix: Egyetlen `SET {content, status}` UPDATE

**#6 LikeButton 404 spam**: queryKey URL-ként használva → 404. Fix: explicit `queryFn` POST-tal

### Tanulságok
- Radix UI AlertDialogAction: NE használj aszinkron műveleteket benne
- In-memory állapot: Render BÁRMIKOR újraindul → mindig DB
- React Query queryKey: MINDIG adj meg explicit `queryFn`-t
- DB UPDATE: MINDIG `.returning()` + verifikáció

## 2026-02-25: Production DB migráció + Pipeline fix

**#7 Hiányzó tábla production DB-ben**: `improved_html_files` NEM LÉTEZETT Neon-ban. Fix: `server/migrate.ts` - automatikus migrációs pipeline

**3 szintű védelem**:
1. Build-time: `render.yaml` buildCommand → `npm run db:migrate`
2. Runtime: szerver induláskor tábla ellenőrzés
3. Manuális: `npm run db:migrate`

### Tanulságok
- Drizzle push lokálisan működik, production DB-t külön kell migrálni
- ALWAYS add `db:migrate` to deploy pipeline BEFORE server build
