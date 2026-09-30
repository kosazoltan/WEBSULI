# Végrehajtás — témafókusz résztéma-döntés (ügynöknek)

1. `source/tests/topic-focus.test.ts`: új teszt, amely szerint a `TOPIC_FOCUS_SYSTEM`
   - a résztémát a tudástár fogalmaihoz méri (`/tudástár/`);
   - a felsoroló kérést résztémának nevezi (`/felsorolja/`, `/csak ezeket/`).
   Futtasd a régi kódon: bukjon.
2. `source/server/studio/topic-focus.ts`: a `TOPIC_FOCUS_SYSTEM` első négy mondatának cseréje a spec „Döntés” pontja szerint.
   A választó rész, a JSON-alak és a meglévő szerződés (előfeltétel / példa / kétes / "narrow") szó szerint marad.
3. Kapuk: `npx tsc --noEmit`, `npm run lint`, `node --import tsx --test tests/topic-focus.test.ts` és a teljes
   `tests/*.test.ts`.
4. Utána-mérés a kész kóddal: `source/focus-narrow-rate.local.mts` (glm, a Mezopotámia-térkép), valamint a stílus- és
   oszthatósági kontroll. Az eredményt írd a spec végére.
