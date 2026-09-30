# Végrehajtás: A tanári kérés forrásból igazolt pontjai

Spec: `docs/specs/2026-09-30-tanari-keres-forrasbol.md`. Munkakönyvtár: `source/`. Ág: `feat/tanari-keres-forrasbol`.

1. `server/studio/instruction-check.ts`: `buildInstructionCheckPrompt(instruction, lesson, sourceText?)` a `source` mezővel;
   `parseInstructionCheck(json, lesson, sourceText?)` a `sourceQuote` betűhív ellenőrzésével; `InstructionPoint.sourceQuote?`;
   új `instructionConceptsFrom(points)`.
2. `server/studio/support-skills.ts` `instruction-checker`: a kimenet `sourceQuote` mezővel.
3. `server/studio/step-runner.ts`: `focusedMapOf` a `job.output.instructionConcepts`-t hozzáadja (ismeretlen localId-kat);
   a kapu a `map.meta.sourceText`-et adja az ellenőrzőnek; a célzott tanári-kérés körnél `instructionConcepts` mentése.
4. Tesztek: `tests/instruction-check.test.ts` (elfogadott/elvetett idézet, determinisztikus azonosító, prompt forrással);
   `tests/lesson-pipeline-runner.test.ts` („tanári kérés: a forrásból igazolt hiányzó pont kiegészítő fogalom lesz …”).
5. Parancsok: `npx tsx --test tests/instruction-check.test.ts`, teljes suite, `tsc` (main + test), eslint — mind zöld.
6. Élő: `source/instr-egy-live.local.mts` (az Egyiptom-leckén 4/4 idézet), majd új teljes gyártás élesítés után.
