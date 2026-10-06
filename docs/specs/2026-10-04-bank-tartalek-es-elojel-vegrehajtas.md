# Végrehajtás — kötelező banktartalék és előjel-szabályok (2026-10-04)

Spec: `docs/specs/2026-10-04-bank-tartalek-es-elojel.md`. Sorrend kötelező; minden lépés után a célzott teszt.

1. `shared/arithmetic-expression.ts`: `normalizeSignedParens` ide költözik (változatlan viselkedés);
   `server/studio/source-corrections.ts` innen importálja és újraexportálja (a meglévő importálók nem változnak).
2. `shared/single-choice-check.ts` `duplicateProblems`: új `trueEqualityValue(option)` — egyetlen `=` jel, mindkét oldal
   kiértékelhető (`normalizeSignedParens`, a jobb oldal vezető `+` jele eredmény-jelölés), és a két oldal egyenlő → az
   érték; különben `null`. Két opció azonos igaz-egyenlőség-értékkel → „…opció ugyanazt jelenti” (csak ha nem
   `ABOUT_FORM`). A magányos-szám ág érintetlen.
3. `server/studio/tools/arithmetic-claims.ts`: `signAmbiguousRubricProblems(task)` — required/bonus csoportonként a nem
   nulla magányos szám és az ellentettje → `${id}: előjel-kétértelmű rubrika: …`; az `arithmeticClaimProblems` hívja.
   `server/studio/bank-repair.ts` `fieldsFor`: az „előjel-kétértelmű rubrika” → `TASK_RUBRIC`.
4. `server/studio/experience-builder.ts`:
   - `packetSchema`: `tasks.min(taskTarget)`, `quiz.min(quizTarget)` (a `salvagePacket` a `quotaAndValidate`-en át
     automatikusan a tartalékig mehet le);
   - a prompt darabszám-sora és a hibaüzenet „elvárt” része a tartalékos darabszámot mondja;
   - `SIGNED_NUMBER_RULES_HU` (export) + `needsSignedNumberRules(subject, section)`: matematika-tárgy
     (`/matematik|matek|math/i`) ÉS a fejezet szövegében negatív szám (`[-−–]\d` szó elején / zárójelben) → a rendszerprompt
     végére (az `OPEN_ANSWER_RULES_HU` után) kerül. A `teaching` (hash) nem változik.
5. Teszt: `tests/bank-reserve-sign-rules.test.ts`; a meglévő tesztek, amelyek a minimum-darabszámú csomagot fogadták el,
   csak dokumentált spec-változás alapján igazíthatók (ez a spec 1. célja) — gyengítés tilos.
6. Teljes kapu: `npm run check`, `npm run check:test`, `npm run lint`, `npm test`, `npm run build`. Utána LEDGER-bejegyzés,
   commit, push, draft PR.
