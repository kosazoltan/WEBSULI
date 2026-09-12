# Végrehajtás

1. Készíts `codex/runtime-skill-learning` ágat, őrizd meg az ismeretlen untracked fájlokat.
2. `shared/lesson-skill.ts`: típusozott hibakatalógus, módszerverzió, rövid megelőzési utasítások, biztonságos Markdown-export. `workflows/learning.ts`: tiszta audit, ismert/új/technikai hibák elkülönítése.
3. `0020_lesson_skill_learning.sql` és `workflows/learning-store.ts`: futásonként egy audit, tartós deduplikált tanulság, tulajdonosi szűrés, kikapcsolás, atomikus mentés, megszakadt futások pótlása. `store.ts` és `engine.ts`: integráció, rögzített skillkontextus és futáson belüli hibák mentése.
4. Kösd az aktív skillt a tényleges Studio-, forrás-, webes- és HTML-javító promptokhoz; a hash a hatásos utasítást tartalmazza. Kösd a bank-, vázlat-, szerző-, lektor- és kapuellenőrzések javítható hibáit az auditba.
5. `routes.ts`: admin skill-lekérdezés, Markdown-letöltés és kikapcsolás. `index.ts`: pótló ellenőrzés induláskor és 60 másodpercenként, átfedő futás nélkül. `WorkflowGraph.tsx`: audit és alkalmazott szabályok rövid, tényszerű megjelenítése.
6. Új célzott unit tesztek: siker/hiba/várakozás, kijavított hiba, ismeretlen hiba, titok/utasítás kizárása, következő futás tényleges promptja, folytatás stabilitása. `node --import tsx --test tests/lesson-skill.test.ts tests/lesson-workflow.test.ts`.
7. DB-harness migráció kétszeri alkalmazással; valódi tranzakciós/újraindítási/deduplikációs/izolációs tesztek. `npm.cmd run test:learning-db`.
8. `npm.cmd run check`, `npm.cmd run lint`, `npm.cmd run check:test`, teljes unit és build a lezárás előtt. Chrome workflowpróba asztali, mobil álló/fekvő nézetben; nincs átfedés vagy levágás. Repo-skillekben és közös módszerben dokumentáld a tényleges futó tanulást és korlátait.
9. Külön önreview: kapuk nem lazultak; a prompt valóban használja a tanult szabályt; nincs nyers hibaszövegből utasítás; auditvesztés/dupla tanulás/idegen hozzáférés nincs. Csak futtatott bizonyíték alapján jelents kész állapotot.
