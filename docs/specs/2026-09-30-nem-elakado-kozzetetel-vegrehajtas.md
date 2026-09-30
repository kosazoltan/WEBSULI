# Végrehajtás: Nem elakadó közzététel — 1. szelet

Spec: `docs/specs/2026-09-30-nem-elakado-kozzetetel.md`. Munkakönyvtár: `source/`. Ág: `feat/nem-elakado-kozzetetel`.

## 1. Közös szabály-modul — `server/studio/limit-policy.ts` (új)
- `classifyReviewNotes(raw: RawNote[], priorBlockers: RawNote[], round: number): LektorNote[]` =
  `applyLektorConvergence(classifyNotes(raw), priorBlockers, round).notes`.
- `LIMIT_CORE_MIN = 0.95`, `LIMIT_SUPPORTING_MIN = 0.8`.
- `splitLimitBlockers(lesson, blockingNotes)` → `{ removable: ChoiceFlag[]; incomplete: LektorNote[]; factual: LektorNote[] }`:
  banktétel / check / **animate** blokk → `removable` (`origin:"limit"`); `coverage_gap` tanítási blokkon → `incomplete`;
  minden más (tanítási `source_conflict`, nem létező tétel, nem blokkra mutató útvonal) → `factual`.
- `downgradeAtLimit(notes, atLimit)`: a limiten a `coverage_gap` blokkolók figyelmeztetéssé válnak (üzenet-előtag:
  „Körlimiten hiányként továbbvitt:”).
- `limitAcceptance(lesson, concepts, gate: CoverageGateResult)` → `{ ok, lesson, core, supporting }`: ismeretlen id → nem ok;
  a megalapozatlan címke lekerül a blokkról, ha a blokknak marad másik címkéje; a core/supporting arány a MEGALAPOZOTT
  címkékből; ok, ha core ≥ 0,95 és supporting ≥ 0,8.

## 2. Lektor lépés a limiten — `server/studio/step-runner.ts` (~1009–1047)
- A `notes` számítása: `classifyReviewNotes(...)`, majd `downgradeAtLimit(notes, atLimit)`, ahol
  `atLimit = job.round >= MAX_AUTHOR_ROUNDS && fusion && !bankOnlyRepair` (a `bankOnlyRepair` a downgrade ELŐTT számolódik
  a nyers blokkolókból — változatlan logika).
- A limit-ágban `limitBankFlags` helyett `splitLimitBlockers`:
  - `factual` nem üres → ha van látogatási keret (`["author","animator","lektor","gate"].every(workflowStepVisitsLeft>0)`) és
    `!job.output.targetedLektorRepairRound` → mentés (`report`, `reportRound`, `reviewInputHash`, `blockers`,
    `targetedLektorRepairRound: round+1`) és `{ next: { step: "author", round: round+1 } }`; különben
    `fail("Tényhiba maradt a tanításban, nem publikálható: …")`.
  - `removable` → a meglévő `choiceFlags`-egyesítés.
- A `blockers` szám (a transition-höz) a downgrade UTÁNI blokkolók száma.

## 3. Kapu — `server/studio/step-runner.ts`
- `resolveChoiceGate`: a `limitOrigin` jelzésű `sections[i].blocks[j]` animate blokk is kivehető (mint a check).
- `runGate` limit-ág (~1277): ahol ma `fail("… tanítása hiányos …")` van (keret nélkül vagy a célzott javítás után),
  előbb `limitAcceptance`; ok → a lecke (lecímkézve) megy tovább publikálásra, `qualityNotes += gate_limit_accepted`
  (a kapu okaival); nem ok → a mostani `fail`.
- A 7.4 végkapu (~1349): `classifyNotes(report.data.notes)` helyett
  `downgradeAtLimit(classifyReviewNotes(report.data.notes, gatePriorBlockers, job.round), job.round >= MAX_AUTHOR_ROUNDS)`.
- Publikáláskor `quality: { removed: choiceGate.removed, warnings: qualityNotes-ból a note szövegek }`.

## 4. Forrás-hivatkozás őr — `server/studio/source-reference.ts` (új)
- `sourceReferenceFindings(lesson)` → `{ path, text }[]` a nem-animate blokkok és a bank szöveges mezőiben
  (`id`, `sourceHash`, `required`, `bonus` kivételével), minta: `/\b(forrás|füzet|tankönyv)\w*/i`.
- `stripSourceReferences(lesson)` → `{ lesson, fixed: number }`: biztonságos minták törlése
  (`/\b[Aa] (forrás|füzet|tankönyv) szerint,?\s*/g`, `/,\s*a (forrás|füzet|tankönyv) szerint,?/g`), mondatkezdő nagybetű
  visszaállítása; egy feladat változása visszavonva, ha a minta a törlés után nem kap teljes pontot (`evaluateOpenAnswer`).
- Bekötés: az animátor ágban a `completedLesson` véglegesítése előtt (a lektor már a tisztított leckét látja), naplóval;
  a kapun a maradék találatok `qualityNotes` (`source_reference`) figyelmeztetések.
- `role-skills.ts` bank skill, Tilalmak: egy sor a forrás/füzet-hivatkozás tilalmáról (a hossz < 5200).
- `rewriteSourceReferences(lesson, call)`: a maradék találatok egy hívásban (`support-skills.ts` `kid-text-fixer`,
  `TEXT_FIX_MODEL`, `STUDIO_STEP_POLICY.textFix`), tételenkénti ellenőrzéssel; a hívás hibája csak figyelmeztetés.
- `lektor.ts` `noteSectionKey`: a zárójeles alak is fejezet-kulcs.

## 5. Tesztek (új fájlok) és ellenőrzés
- `tests/limit-policy.test.ts`: classifyReviewNotes = lektor-oldali besorolás; splitLimitBlockers (animate→removable,
  coverage_gap→incomplete, source_conflict explain→factual); limitAcceptance (ungrounded lecímkézés, 95/80 küszöb).
- `tests/source-reference.test.ts`: biztonságos törlés + nagybetű; nem biztonságos marad találatként; mintaválasz-védelem.
- `tests/non-blocking-publish.test.ts` (a `lesson-pipeline-runner.test.ts` `makeDeps` mintájával): (a) késői coverage_gap
  a 7.4 kapun nem buktat; (b) limit + animate blokkoló → publikál, a blokk kivéve; (c) limit + tanítási coverage_gap →
  publikál figyelmeztetéssel; (d) limit + tanítási source_conflict + keret → pontosan egy célzott szerzői kör;
  (e) ugyanez keret/második kör nélkül → fail „Tényhiba”.
- Parancsok: `node --import tsx --test "tests/*.test.ts"`, `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.test.json`,
  `npx eslint server/studio --max-warnings 1166`.
- Meglévő, a régi „limit → fail”-t rögzítő teszt nem-ténybeli leletre: csak a spec hivatkozásával frissíthető; ténybeli
  hibára vonatkozó teszthez nem nyúlunk.
