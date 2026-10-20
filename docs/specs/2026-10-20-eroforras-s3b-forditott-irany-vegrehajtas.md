# S3b fordított irány — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-20-eroforras-s3b-forditott-irany.md`. Munkakönyvtár: `source/`. Ág: `perf/s3b-forditott-irany` (az R3 ágára
épül).

1. **`server/studio/experience-builder.ts`:**
   - `export const isReversedDirectionKeyFailure = (issue: string) => /válaszkulcs-teszt: a hibás \(fordított irány\)/.test(issue);`
   - A kísérleti ciklusban:
     `const reversedOnly = answerKeyOnly && issues.length > 0 && issues.every(isReversedDirectionKeyFailure);`
   - `removalAttempt = lastAttempt || stuck || reversedOnly`.
   - A korai lezárás feltétele (R3 / #333) változatlan: `kept` üres és `quotaAndValidate` üres; különben javítókör.
   - A jelzés: ha `reversedOnly && !stuck && !lastAttempt`: „fordított irány — azonnali kivétel …”.
2. **Teszt — `tests/s3b-forditott-irany.test.ts`** (a `tests/bank-answer-keys.test.ts` mintájára):
   - csak „forditott” fajtájú bukás egy tartalék feladaton → 1 hívás, a feladat kikerül, `bank-stuck` jelzés;
   - „tevhit” fajtájú bukás → a régi javítókör (több hívás).
3. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `build`.
4. **Kitelepítés:** az R3 után; az aktív-futás őr = 0. Mérés: `fixTurns / turns` a következő gyártásokban.
