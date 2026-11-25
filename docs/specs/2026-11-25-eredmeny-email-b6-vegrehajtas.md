# Végrehajtás: B6 — leállításkori ürítés

Terv: `docs/specs/2026-11-25-eredmeny-email-b6.md` (a `docs/specs/2026-11-22-eredmeny-email-bontas.md` B6 sora).

1. **Bukó tesztek:** `tests/shutdown-flush.test.ts` (párhuzamos, saját korlát, közös keret, hiba nem akaszt);
   `tests/lesson-result-shutdown-db.integration.ts` (várakozó pillanatkép, halasztott „félbehagyva” és végleges újrapróba, küldés alatt
   álló, határidő, véglegesített kör kapuja, ürítés utáni azonnali küldés) — a `run-learning-db-tests.ts` listájában.
2. **Zöldre hozás:** `server/shutdown-flush.ts` (a #510-ből); `server/lesson-result-email.ts` (`flushLessonResults`, nyilvántartott
   küldés / halasztás); `server/index.ts` (párhuzamos ürítések a közös határidővel).
3. **Próbahiba:** a halasztott újrapróbák előrehozását kiiktatva a megfelelő teszt bukik.
4. **Kapulánc:** gate:stage → gate:push (DB-tesztek) → helyi ellenőr → PR.
