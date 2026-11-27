---
name: websuli-tananyag-gyakorlati
description: Use when producing, repairing or auditing WEBSULI lessons/quizzes. Practice-first balance, no meta questions.
---

# WEBSULI tananyag — gyakorlatias gyártás, javítás, mérés

Tulajdonosi utasítás (2026-11-26): minden tantárgyban egyensúly az **alkalmazás** (használat, felismerés, kiegészítés,
helyes / helytelen / mindkettő döntés, számolás) és a szükséges **fogalmi tudás** között; **nincs meta-kérdés** a
feladatlapról (pontozás, pontszám, feladattípus, a lap felépítése, a játék kezelése). Terv: `docs/specs/2026-11-26-tananyag-gyakorlati.md`.

## Mérce (egy helyen — ne írj párhuzamos szabályt)

- `source/shared/practice-policy.ts` — tételenként `alkalmazas | fogalmi | meta | bizonytalan` (`classifyQuizItem`,
  `classifyOpenTask`); bankonként külön 60–75% igazolt alkalmazás, célérték kétharmad (`practiceTarget`; a kötelező fogalmi párok
  ezt lejjebb szoríthatják — ilyenkor a `practiceTarget` értéke a mérce, nem a 60%); a modell `intent`
  címkéje nem bizonyíték.
- `source/shared/practice-rules.ts` — a promptok közös szövege (`PRACTICE_TEACHING_RULE`, `PRACTICE_BANK_RULE`,
  `SOURCE_SCOPE_RULE`). Új gyártási út ezt kapja, nem saját megfogalmazást.
- `source/shared/source-teaching-scope.ts` — a pontozási / időkeret / laprészlet-szöveg nem tanítandó fogalom
  (`adminConceptProblem`, soronként `adminLineProblem`); a vegyes sor tanítható része marad.

## Hol érvényesül (ne kerüld meg)

| Út | Kapu / viselkedés |
|---|---|
| Stúdió bankcsomag | `experience-builder`: meta → javító kör (P4a); arány `STUDIO_PRACTICE_QUOTA=on` mellett csomagkvóta, az utolsó kísérlet után csak jelzés (P4b/P4c) |
| Kiadott bank | `finalPracticeReport` a jobon; végleges bankban maradt meta megállít — CSAK `STUDIO_PRACTICE_QUOTA=on` mellett (élesben be; kikapcsolva csak jelzés) (P4c) |
| Külön játékkvíz (`generate-quiz`) | Stúdió-leckénél a lecke saját bankja, nincs generálás (P5b); régi HTML-nél tanítható kivonat (`gameQuizSource.ts`), meta-szűrés tételes okkal, legfeljebb 1 célzott pótlás, csak teljes bank cserél (P5a) |
| HTML-javítás záró kapuja | `verifyLessonMethodHtml` → `practiceMetaProblems` (P5b) |
| Tanulói kör | `practice-sampling.ts` (közös keverő) + `lesson-experience-score.ts` (`sampleIds` / `sampleTaskIds`): a 25-ös kvízkör 15–18, a 15-ös nyílt kör 9–11 alkalmazó, ha a készlet engedi (hiánynál a másik csoportból pótol — csak fogalmi bankból 0 is lehet); a szerveres gyakorlásban a csoporton belül az ismétlési rangsor marad (P6) |
| Meglévő lecke javítása | csak meta-hibás régi csomag → célzott tételcsere, a jó tételek azonosítója stabil (P7a); admin „Gyakorlati bankjavítás (a tanítás marad)” = `mode: "practice-bank"` (P7b) |

## Eljárás

1. **Mérés előbb, csak olvasva:** `cd source && npx tsx scripts/measure/practice-audit.mts --db --out <fájl>` (éles DB, `BEGIN READ ONLY`);
   egy leckére `--lesson <json>` / `--html <fájl>`. Bankonként a darabszám és az arány számít, nem a leckeátlag.
2. **Új lecke:** a Stúdió gyártja; utólag a job `practiceAudit` mezőjét nézd. `practice_low` jelzés nem hiba, hanem tétel a javítási listára.
3. **Meglévő Stúdió-lecke meta-tétellel** (régi HTML-leckénél a gomb nincs: HTML-javítás / `generate-quiz`): admin → lecke →
   „Gyakorlati bankjavítás” → a job lefuttatja a séma-, bank- és lektorkapukat → előnézet (a kifogásolt tétel változik; ha a
   csomagban érvénytelen helyes-válasz-index is van, a csomag egésze újraépül — szabályos) → jóváhagyás (biztonsági mentéssel)
   → visszaolvasás (`practice-audit --db`) → valódi böngészős próba egy leckén. Teljes újragyártás csak tanítási hibánál.
4. **Kérdésminta:** konkrét mondaton / adaton / helyzeten cselekvés (helyzethez illő szólás, hiányzó szó a mondat értelméből,
   helyes elválasztás kiválasztása, „Csak A / Csak B / Mindkettő”, adatos számolás, állandó változó a kísérletben, forrásrészlet
   kiválasztása). A puszta besorolás / definíció-felmondás fogalmi tétel — kell, de kisebbségben.

## Csapdák

- A kemény arány-kapu élesben megállította a gyártást (2026-11-27, `d241d7fa`): arányhiány az utolsó kísérlet után **jelzés**, nem megállás; meta-tétel viszont mindig javítandó.
- Meta-gyanús, de tanítási tartalom: sportpontszám, geometriai „pont”, versenypontos szöveges feladat — a mérce negatív kontrolljai; ne szigoríts úgy, hogy ezek kiessenek.
- A kanonikus Stúdió-bankot a játékok olvassák; a régi `game_quiz_items` sor fúziós leckénél nem él — ne generálj mellé.
