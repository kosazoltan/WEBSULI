# Kapu: elérhetetlen Próba determinisztikus kikapcsolása + célzott javítás csak kerettel (2026-09-29)

## Kiváltó ok (élő újramérés)
Élő újramérés 2026-09-29 („Oszthatóság 4-gyel és 25-tel”, 6. o., job `697296d4…`, Studio-job `e880571c…`), 1126 s után `error`, „Váratlan hiba történt”:
- A #139 élesben működött: a körlimiten két hibás feladat (`experience.tasks[9]`, `[36]`) kivéve; a tartalék miatt a bank 48 → 46 feladat maradt (≥ 45), kvíz 76.
- A kapu didaktikai-ív mérése (`shared/lesson-arc.ts:137`) egyetlen leletet adott: `proba_unreachable`. A 8. szakasz 1 kérdést hoz, a Próba jutalmához 5 helyes válasz kell. A lelet saját javaslata: „Írj legalább 5 kérdést, vagy kapcsold ki a Próbát.”
- A limiten a kapu célzott szerzői javítást kért (`step-runner.ts`, „Kapu-lelet a limiten, célzott javítás”). A szerzői lépés látogatási kerete (`shared/lesson-workflow.ts:69`) viszont elfogyott, ezért a motor kivételt dobott, és a job „Váratlan hiba”-val zárult. A kapu a keretet nem ellenőrizte előre; a lektor-ág ugyanezt 2026-09-24 óta ellenőrzi.

## Cél
1. Az elérhetetlen Próba ne kerüljön modellkörbe. A kapu determinisztikusan kikapcsolja (`probaEnabled: false`) azokon a szakaszokon, ahol `0 < kérdés < szükséges`. Ez a lelet saját, második javaslata, és a gyerektől semmit nem vesz el, ami működött volna (a jutalom úgysem volt elérhető).
2. A kapu célzott szerzői javítást CSAK akkor kérjen, ha a javítási út minden lépésére (szerző, animátor, lektor, kapu) van még látogatási keret. Különben tiszta, okot megnevező hibával álljon meg, ne kivétellel.

## Nem cél
- A Próba küszöbe, a jutalom-szabály és a többi ív-lelet (pl. `drill_heavy`) változatlan; azokra a célzott javítás marad.
- A workflow-keret mérete nem változik.

## Rögzített döntések
1. `disableUnreachableProba(lesson, minChecks)` (a `shared/lesson-arc.ts`-ben, tiszta): visszaadja az új leckét és a
   kikapcsolt szakaszindexeket. A kapu a fedettségi és ív-mérés ELŐTT alkalmazza. Ha változott, `upsertLesson` +
   `job.output.lesson` + `logger.warn` + `job.output.probaDisabled`. A 7.4 lektor-bizonyíték az eredeti,
   lektorált leckéhez kötött (`rawLesson`), mint a #134/#139-es kivételnél; a kikapcsolás csak elvesz.
2. A célzott javítás feltétele: `["author", "animator", "lektor", "gate"].every(s => workflowStepVisitsLeft(s) > 0)`.
   Ha nem teljesül, `fail`: „A fúziós lecke tanítása hiányos (a célzott javításhoz nincs több lépéskeret): …”.

## Edge case-ek
- Kérdés nélküli szakasz (0 kérdés): a lelet nem is jön; változatlan.
- Workflow-n kívüli futás (a tesztek, a kézi futtatás): a keret Infinity, így a meglévő (u) teszt változatlan.

## Elfogadás (EARS)
- **E1** A limiten, egyetlen `proba_unreachable` lelettel a kapu SHALL NOT szerzői kört kérni; SHALL publikálni, a szakasz `probaEnabled: false`-szal (teszt; a régi kódon szerzői kör).
- **E2** Elfogyott szerzői kerettel a kapu SHALL tiszta hibával megállni, kivétel nélkül (teszt; a régi kódon `next: author`).
- **E3** Kapuk zöldek; élő újramérés ugyanazzal a témával: `done`, publikált lecke.

## Review-kör (PR #141)
- **P1 (aktív jutalomküszöb): javítva.** A Próba-küszöb deploy nélkül hangolható (`reward_policy`), a kapu eddig az
  alapértelmezett 5-tel számolt; a meglévő `checkLessonArc` hívás sem kapta meg az aktív küszöböt. Új, injektálható
  `PipelineDeps.rewardPolicy`: élesben `loadRewardPolicy()`, injektált tárral `DEFAULT_REWARD_POLICY`. A kikapcsolás
  és az ív-mérés is ezt kapja. Teszt: 1-es küszöbnél az egykérdéses Próba nem kapcsol ki.
- **P2 (újrafuttathatóság): javítva, a #134/#139-es kivételre is.** A kapu nem írja felül a `job.output.lesson`-t.
  A lektorált eredeti marad, a kivétel és a kikapcsolás csak metaadat (`choiceGate`, `probaDisabled`), a módosított
  lecke a `lessons` táblába és a publikációba megy. Így a megszakadt léptetés utáni újrafutás ugyanabból számol, és
  a lektor-bizonyíték hash-e érvényes marad. A régi viselkedés az index-alapú kivételnél újrafuttatáskor rossz tételt
  is kivehetett volna. Teszt: újrafuttatva ugyanaz, a job leckéje az eredeti.
