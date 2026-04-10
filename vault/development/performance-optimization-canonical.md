# VAULT: Performance Optimization Kanonikus

## Javított problémák

### N+1 LikeButton (KÉSZ)
- Régi: 50 anyag → 50x fingerprint + 50x API = 10s betöltés
- Új: Batch endpoint `/api/materials/likes/batch?ids=...` + fingerprint cache
- React Query: explicit `queryFn`, `staleTime: 60000`

### Canvas animációk (KÉSZ)
- HeroSection + ScientificBackground: Page Visibility API → szünetel inaktív tab-nál

### React optimalizálás (KÉSZ)
- `useMemo` a `filteredFiles` számításhoz
- `React.memo` a UserFileList-re

## Bundle méret (kritikus, TODO)
- Client bundle: 2031 kB (gzip: 536 kB)
- Megoldás: `React.lazy` + `Suspense` nagy komponensekre
  ```typescript
  const PdfViewer = lazy(() => import('./components/PdfViewer'));
  const EnhancedMaterialCreator = lazy(() => import('./components/EnhancedMaterialCreator'));
  ```
- Várható javulás: 30-40%

## Backend optimalizálás (TODO)
- Pagináció/limit az API-n
- Response caching (Redis/memória, 5 perc)
- `server/routes.ts` szétbontása (10 függőség)
