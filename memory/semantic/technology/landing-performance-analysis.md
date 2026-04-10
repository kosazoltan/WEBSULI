---
id: semantic_technology_20260410_302
type: semantic
domain: technology
created: 2026-04-10
source: LANDING_PAGE_PERFORMANCE_ANALYSIS.md
tags: [performance, optimization, react, api, canvas, n+1]
project: websuli
---

# Landing Page Teljesítmény Elemzés

## Kritikus problémák (javítva)
1. **N+1 LikeButton API**: 50x FingerprintJS + API hívás → Batch endpoint (`/api/materials/likes/batch`) + fingerprint cache. 50 hívás → 1 hívás.
2. **Canvas animációk CPU**: HeroSection + ScientificBackground → Page Visibility API implementálva (szünetel inaktív tab-nál)

## Fontos (javítva)
3. **FilteredFiles**: `useMemo` hook hozzáadva
4. **UserFileList**: `React.memo` optimalizálás

## Jövőbeli optimalizálás
5. Backend pagináció
6. Response caching (Redis/memória)
7. Bundle code splitting (lazy load: PdfViewer, EnhancedMaterialCreator)

## Mérési adatok szükségesek
- Lighthouse Performance Score, TTI, FCP, API response times, Canvas FPS
