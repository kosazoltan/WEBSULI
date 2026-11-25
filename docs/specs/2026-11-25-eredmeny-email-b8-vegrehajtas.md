# Végrehajtás: B8 — körazonosító

Terv: `docs/specs/2026-11-25-eredmeny-email-b8.md` (a `docs/specs/2026-11-22-eredmeny-email-bontas.md` B8 sora).

1. **Bukó tesztek:** `tests/round-id.test.ts` (`roundIdOf`, `sentFlagsOf`, `newRoundNonce`); `tests/lesson-result-email-roundid.spec.ts`
   (új azonosító + két jelző; régi kliens nonce-vesztése után sincs újraküldés; régi jelzős kör nem megy újra).
2. **Zöldre hozás:** `shared/round-id.ts` (+ `shared/experience-fingerprint.ts`); `useExperienceRound.ts` (`nonce` a sémában és az új
   körben); `resultReport.ts` (a három azonosító-képzés helyett `roundIdOf`, minden jelző ellenőrzése / írása; `alsoFlags` a sorban);
   `shared/result-outbox.ts` (`alsoFlags`).
3. **Próbahiba:** a régi jelző ellenőrzését kiiktatva a „régi jelzős kör” e2e bukik.
4. **Kapulánc:** a B7 beolvadása után.
