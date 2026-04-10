---
id: procedural_development_20260410_501
type: procedural
domain: development
created: 2026-04-10
source: source/CODE_ANALYSIS_REPORT.md
tags: [code-quality, typescript, bundle-size, security, audit]
project: websuli
---

# Kódellenőrzési Jelentés (2025-01-13)

## Eredmények
- TypeScript: ✅ HIBAMENTES (strict mode)
- Dependency-Cruiser: ✅ 142 modul, 0 hiba, körkörös függőség nincs
- Madge: ✅ 69 import warning (nem kritikus)

## Build méret
- Client bundle: **2031.56 kB** (gzip: 535.81 kB) ⚠️ NAGY
- Mammoth.browser.js: 498.98 kB
- Server: 227.4 KB ✅

## Projekt struktúra
- 140 TypeScript fájl, 0.95 MB
- `client/src/components/ui/`: 47 fájl (shadcn/ui)
- `server/routes.ts`: 10 függőség (legnagyobb)

## Biztonsági audit: 26 sebezhetőség
- axios: HIGH (CSRF, DoS, SSRF)
- esbuild: MODERATE (csak dev)
- pdfjs-dist: HIGH (nincs fix)

## Javaslatok
1. Lazy load nagy komponenseket (PdfViewer, EnhancedMaterialCreator)
2. `build.rollupOptions.output.manualChunks` konfigurálása
3. TODO: Bulk email küldés (`server/routes.ts:3430`)

**Általános értékelés: 8/10**
