# Végrehajtás: B8 — körazonosító

Terv: `docs/specs/2026-11-25-eredmeny-email-b8.md` (a `docs/specs/2026-11-22-eredmeny-email-bontas.md` B8 sora).

1. **Bukó tesztek:** `tests/round-id.test.ts` (`roundIdOf`, `sentFlagsOf`, `newRoundNonce`); `tests/lesson-result-email-roundid.spec.ts`
   (új azonosító + két jelző; régi kliens nonce-vesztése után sincs újraküldés; régi jelzős kör nem megy újra).
2. **Zöldre hozás:** `shared/round-id.ts` (+ `shared/experience-fingerprint.ts`); `useExperienceRound.ts` (`nonce` a sémában és az új
   körben); `resultReport.ts` (a három azonosító-képzés helyett `roundIdOf`, minden jelző ellenőrzése / írása; `alsoFlags` a sorban);
   `shared/result-outbox.ts` (`alsoFlags`).
3. **Próbahiba:** a régi jelző ellenőrzését kiiktatva a „régi jelzős kör” e2e bukik.
4. **Kapulánc:** a B7 beolvadása után.

### B8 — review #613 (2026-11-25): nonce-vesztés nem vált körazonosítót
- A megkezdett kör nonce-a a régi azonosító szerinti külön kulcson is tartósan megmarad (`rememberRoundNonce`); ha a régi kliens visszaírása a kör rekordjából eldobja, a betöltés visszaveszi (`recoverRoundNonce`) — a kilét-rekord, a jelzők, a sor bejegyzése és a szerveres kör ugyanaz marad.
- A tartós sor bejegyzésének elsődleges jelzője (és kulcsa) a régi azonosítóé, az új az `alsoFlags`-ben (`outboxFlagsOf`): a még nyitott B7-es ürítő így a régi kliens jelzőjét írja. Elutasítás-jelző mindkét azonosítóra.
- A kliens a régi azonosítót is elküldi (`legacyRoundId`, opcionális, szigorú séma); a szerver a kettőt egy logikai körként kezeli: a végleges beküldés a régi azonosítót is lefoglalja (a régi kliens késői véglegese duplikátum; a régi azonosítóval már véglegesített kör új beküldése duplikátum), és bármelyik azonosítóval történt véglegesítés elnyomja a várakozó „félbehagyva” pillanatképet.
- Tesztek: `round-id.test.ts` (alias, sor-jelző), `lesson-result-email-partial-db.integration.ts` (két új eset, 16/16), e2e 14 passed (RED `ca28e05f`).
