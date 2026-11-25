# Végrehajtás — P-057 / P-064 / P-065 átvezetése (terv: `docs/specs/2026-11-23-h0-dontesek-atvezetese.md`)

1. RED: `scripts/qa/hooks/hook-scope.test.mjs` — importálja a még nem létező `./hook-scope.mjs`-t (`hookScopeViolations(settings)`,
   `settingsTracked(repoRoot)`); esetek: a valódi settings hibátlan; mutációk — üres matcher, `*`, `.*`, ismeretlen eszköz, `onFailure` a
   destruktív hookon — mind jelzett; a settings `git ls-files`-ban szerepel és `git check-ignore` szerint nem ignorált.
   `node --test scripts/qa/hooks/hook-scope.test.mjs` → bukik (a modul hiányzik).
2. GREEN: `scripts/qa/hooks/hook-scope.mjs` (tiszta függvények, magyar kommentekkel). Ugyanaz a parancs → zöld.
3. Terv-szöveg: `docs/specs/2026-11-18-tananyag-gyartas-minoseg.md` (fejléc-módosítás, 5 jelölés, 400. sor környéke, SK3, E41, E42,
   D8, D9) és a végrehajtási fájl (fejléc, 1030. és 1165. sor környéke, SK3 bevezető); `docs/specs/2026-11-18-hook-onfailure.md`
   „Kiegészítés 4”. A CRLF sorvégek maradnak (Pythonnal szerkesztve).
4. Kapuk: `npm run gate:stage` → `npm run gate:push` → `node scripts/qa/gates/local-review.mjs` → `npm run gate:pr -- --body-file …`
   → push → PR (`--base main`). Merge nincs.
