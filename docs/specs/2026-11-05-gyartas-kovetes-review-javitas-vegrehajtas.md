# Végrehajtás — futó gyártás követése, review-javítás (2026-11-05)

Terv: `docs/specs/2026-11-05-gyartas-kovetes-review-javitas.md`.

1. `source/server/studio/lesson-pipeline-routes.ts` `/lessons/one-step/active`: `w.snapshot->'definition'->>'mode' IN
   ('upload','studio','webStudio')`; az `r.updated_at` korhatár helyett `w.lease_until > now()`.
2. `source/client/src/components/studio/SourceUploadForm.tsx`: ha `runId !== null`, az `adoptTried` igazra áll
   (a már követett futás elhasználja az egyszeri csatlakozást).
3. `source/tests/admin-draft-lessons.spec.ts`: e2e — tárolóból visszaállított, hibával megállt futás „Bezárás”-a után
   az `/active` nem nyitja újra a futást.
4. Ellenőrzés: `npm run check`, eslint, célzott e2e, `three-phase-check`.
