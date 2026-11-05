# Végrehajtás — Render-beállítás összevetése (2026-11-05)

Terv: `docs/specs/2026-11-05-render-beallitas-ellenorzes.md`.

1. `scripts/qa/verify-render-settings.mjs`: tiszta `compareRenderSettings(service, { buildCommand })` és
   `renderYamlBuildCommand(text)`; CLI: `RENDER_API_KEY` → `GET https://api.render.com/v1/services/srv-d6h9oq9drdic73cied30`
   (15 s időkorlát), kilépés 0 / 1 / 2. Ellenőrzés: `node --check scripts/qa/verify-render-settings.mjs` → nincs kimenet.
2. `scripts/qa/verify-render-settings.test.mjs`: egyezés, mezőnkénti eltérés, sorrend-függetlenség, a mai éles állapot,
   `render.yaml`-olvasás. Ellenőrzés: `node --test scripts/qa/verify-render-settings.test.mjs` → `# fail 0`.
3. `.github/workflows/ci.yml`: a QA-tesztlépés az új tesztet is futtatja. Új `.github/workflows/render-settings.yml`
   (push `main`, napi ütemezés, kézi indítás; PR-ra nem), `RENDER_API_KEY` titokkal, titok nélkül kihagyva.
   Ellenőrzés: `grep -c "verify-render-settings.test.mjs" .github/workflows/ci.yml` → `1`;
   `grep -c "verify-render-settings.mjs" .github/workflows/render-settings.yml` → `1`.
4. `VERCEL_RENDER_TELEPITES.md` „Élesítés ellenőrzése”: a szkript és a titok leírása. Ellenőrzés:
   `grep -c "verify-render-settings" VERCEL_RENDER_TELEPITES.md` → `1`.
