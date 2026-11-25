# Végrehajtás: B5b — a pillanatkép kliensoldala

Terv: `docs/specs/2026-11-25-eredmeny-email-b5b.md` (a `docs/specs/2026-11-22-eredmeny-email-bontas.md` B5b sora).

1. **Bukó tesztek:** `tests/lesson-result-email-snapshot.spec.ts` (háttérbe kerülés, ismétlés, jelzés nélkül, kör-csere, teljes kör,
   séma); `tests/result-compat.test.ts` (a token `partial` jelzése — dokumentált spec-változás a forrásmintában);
   `tests/quiz-round-snapshot.test.ts` (`answeredCount`, `snapshotDue`).
2. **Zöldre hozás:** `shared/quiz-round.ts` (`answeredCount`, `snapshotDue`, `SnapshotState`); `server/routes.ts` (`resultPartial`
   hirdetése); `client/src/lib/queryClient.ts` (`partial` a tokenben, `resultPartialReady()`); `client/src/lesson-runtime/resultReport.ts`
   (pillanatkép-effekt, körönkénti „úton van” őr, a részleges kulcs törlése a végleges siker után).
3. **Próbahiba:** a jelzés-ellenőrzés kiiktatására a „jelzés nélkül” e2e bukik; a `snapshotDue` mindig-igaz változatára az ismétlés-teszt.
4. **Kapulánc:** gate:stage → gate:push (eredménylevél-e2e) → helyi ellenőr → PR.
