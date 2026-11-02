# 1. ciklus — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-21-ciklus1-csoportos-szigoritas.md`.

1. **`shared/answer-key-calibrate.ts`:**
   - tiszta `coverGroup(sample, okCorrect, wrongText)`: mohó lefedés a megkülönböztető jelölt szavakból (`isDistinguishingCandidate`,
     a hibásban a tűrő illesztéssel nincs meg); legfeljebb 6 tag; a mintában is legyen tag;
   - a `tighten` blokkoló ágán, a szó után és a kifejezés előtt.
2. **`server/studio/single-run/engine.ts` `answerKeysWithNotes`:** az esetek feladatonként az `output.answerKeyArchive`-ba (legfeljebb 200
   feladat; a szövegek 300 karakterre vágva).
3. **`server/studio/legacy-migration.ts`:** `LEGACY_BATCH_LIMIT` = a tényleges sorelemszám + 5 (az összevonás előtti mérés szerint).
4. **Teszt:**
   - a csoportos szigorítás (szinonimák) — igen;
   - több mint 6 tag vagy a hibás tartalmaz tagot — nem;
   - az archívum alakja.
