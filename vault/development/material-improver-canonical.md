# VAULT: Material Improver Kanonikus Tudás

## Funkció
Claude Sonnet 4.5 AI-val régi HTML tananyagok modernizálása. SSE streaming, 90s timeout.

## Kritikus tanulságok (session.md alapján)
1. **AlertDialog race condition**: Radix AlertDialogAction lezárja a dialógust onClick ELŐTT. Megoldás: DialogAction helyett közvetlen mutáció hívás.
2. **In-memory job store**: Render restart → elvész. Megoldás: DB-ben perzisztens (status='processing').
3. **Atomi UPDATE**: content + status EGYETLEN SQL UPDATE-ben → race condition elkerülés.
4. **LikeButton queryKey**: React Query queryKey-t URL-ként kezeli ha nincs explicit `queryFn`. Mindig add meg!
5. **Production DB migráció**: Drizzle push csak lokálisan! Production Neon-ba külön kell: `npm run db:migrate`.

## DB táblák
- `improved_html_files`: pending → approved → applied státuszok
- `material_improvement_backups`: JSONB backup_data

## Frontend fájl
`source/client/src/components/MaterialImprover.tsx`

## Backend fájlok
- `source/server/routes.ts` (4102-5130 sor)
- `source/server/improveAsync.ts` (job kezelő)
- `source/server/storage.ts`
- `source/server/migrate.ts` (DB migráció)
