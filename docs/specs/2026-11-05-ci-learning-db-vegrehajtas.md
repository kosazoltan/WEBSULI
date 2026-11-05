# Végrehajtás — DB integrációs tesztek a CI-ben (2026-11-05)

Terv: `docs/specs/2026-11-05-ci-learning-db.md`.

1. `.github/workflows/ci.yml`: új `learning-db` job a `unit-tests` után (checkout, Node 24 + npm cache, `npm ci`,
   `npm run test:learning-db`, `working-directory: source`, `needs: lint-typecheck`, `timeout-minutes: 15`).
   Ellenőrzés: helyben `npm run test:learning-db` → `# fail 0` (a #397 tesztjavításával).
2. A #397 összevonása után a `main` beolvasztása ebbe az ágba; a CI „DB integrációs tesztek” job → success.
