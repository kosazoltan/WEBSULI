# Végrehajtás — Render-telepítés leírása és revízió-ellenőrzés (2026-11-05)

Terv: `docs/specs/2026-11-05-render-telepites.md`.

1. `VERCEL_RENDER_TELEPITES.md`: a „CI/CD” szakasz cseréje a mért szabályra (táblázat, következmények, build-parancs
   eltérése, „Élesítés ellenőrzése”). Ellenőrzés: `grep -c "build-szűrő kizárt útvonalain" VERCEL_RENDER_TELEPITES.md` → `1`.
2. `scripts/qa/verify-render-revision.mjs` + `scripts/qa/verify-render-revision.test.mjs`. Ellenőrzés:
   `node --test scripts/qa/verify-render-revision.test.mjs` → `# fail 0`.
3. `.github/workflows/ci.yml`: a QA-tesztlépés a új tesztet is futtatja. Ellenőrzés:
   `grep -c "verify-render-revision.test.mjs" .github/workflows/ci.yml` → `1`; a „Háromfázisú rend” job zöld.
