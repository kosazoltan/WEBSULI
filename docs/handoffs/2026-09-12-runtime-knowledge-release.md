# Futó Websuli tudástár – kiadási jelentés

## Éles állapot

PR #60 merge: 82a646621592a0d32a86c5728aad6d1b3d6e6b63, 2026-09-12 09:29:47 UTC.
Frontend és backend ugyanazon a kiadáson, ellenőrizve 09:32:20 UTC.
Mindkét tanulási tábla létezik. Három történeti audit elkészült (egy passed, kettő stopped), nulla elmaradt audit. A 178 tananyag tartalmának összesített ellenőrzőértéke változatlan.

A normál bejelentkezett Chrome-admin munkamenetben a Futások auditpanel megjelent és olvasható. A készítő és javító runtime API egyaránt a saját nyolc dokumentumot adta vissza, websuli-runtime-1 verzióval. A javító módszerkeresése a forrás kifejezésre három releváns szabályt adott. Belépés nélkül HTTP 401. Nem készült kikerülő vagy szintetikus éles bejelentkezés.

## Jogosultság

A kért személy címét a Gmailben tőle érkezett levelek feladóadata azonosította. Az éles adatbázisban pontosan egy egyező fiók: is_admin=true, is_banned=false. A Websuli nem külön e-mailes whitelistre, hanem erre az adminjelzőre építi a tananyagkészítés hozzáférését. A normál munkamenet-visszatöltés minden kérésnél friss felhasználót olvas, és a tiltott felhasználót elutasítja. Jogosultságot nem kellett módosítani. Szilvia saját bejelentkezésével külön készítési próba nem történt.

## Működés és határ

Az új futás saját identitást és módszerhez illeszkedő runbookot kap a tényleges modellhívásban. A saját SOUL.md, IAM.md, RUNBOOK.md, QMD.md, COGNI.md, MEMORY.md, KANBAN.md és SKILL.md az alkalmazásból elérhető, a karbantartott alapmódszer és a tartós, tulajdonoshoz kötött adat egyetlen forrásából.

QMD/IAM/Cogni itt beépített funkciók, nem külső termékhez létesített kapcsolat. A 13 karbantartott hibacsalád szabályai automatikusan aktiválhatók, az ismeretlen hibák megfigyelésként és vizsgálati tételként megmaradnak. Nyers támadó szöveg nem válik rendszerutasítássá. A sikeres futások melletti megfigyelésszám nem bizonyított pedagógiai javulás vagy hibaarány-csökkenés. A történeti, verzió nélküli futások legacy-unversioned adatai nem tanítják automatikusan az új módszert; az új aktív memória jelenleg üres.

A review során javítva: több lépés egyetlen hibacsaládjának összes előfordulási helye; kézi kivonatolás betöltött skillkontextusa; lektori fedettségi és forráshűségi hibák elkülönítése; általános Required sémahiba osztályozása; audithoz rögzített módszerverzió; csonka HTML javításának és scope-hibának a megőrzése.

## Ellenőrzések

- PASS: npm.cmd run verify, exit 0: típusok, teszttípusok, lint, 1179/1179 unit, build.
- PASS: npm.cmd run test:learning-db: 20/20 eldobható PostgreSQL/HTTP teszt, saját tesztadatbázis eltávolítva.
- PASS: végleges PR CI 34685643051: 1179 unit, 150 Playwright E2E és 3 pontozási/újratöltési próba.
- PASS: éles backend/frontend verzióazonosság, táblák, auditpótlás, 401 hozzáférésvédelem, adminos dokumentum- és keresés-visszaolvasás, valós Chrome-képernyő.
- PASS: git diff --check. A merge tartalma megegyezik a tesztelt bb6aea2 commit tartalmával.
- A pre-push hook számtípus-figyelmeztetést adott; a lint sikeres és a teljes verify/CI külön futtatva sikeres. A hook nem lett megkerülve.
- PASS: főági CI 34685998566 is sikeres, a kiadás utáni teljes ellenőrzés lezárult.

## Mentés és visszaállás

Kiadás előtt nem volt aktív Studio-job vagy webes gyártás. Korábbi kód: ffffaff7737c38d50c08edd8bf3ace12f3eb9aba. Friss pg_dump: tmp/release/before-release-2026-09-12T09-13-24-784Z.dump, 6430288 bájt, archívum olvashatósága igazolva; ez nem teljes restore-próba. A két additív tábla kód-visszaállításkor megőrizhető. Telepítéshez db:migrate kell; a régi db:push nem a SQL-workflow táblák teljes telepítési eljárása.

## Fennmaradó elfogadási pont

NOT RUN: az előző kérés új feltöltésből induló teljes éles készítés és abból javítás/alkalmazás. Az előző munkamenetben a böngésző fájlválasztójának setFiles művelete Not allowed hibát kapott. Új jogosultság vagy kézi fájlkiválasztás nem történt; az akadályt nem kerültük meg. Ezt a próbát a mostani kiadás és teszteredmény nem helyettesíti. Nem történt új fizetett éles tananyaggyártás.

Bizonyítékok: tmp/runtime-knowledge-verify.log, tmp/runtime-knowledge-db.log, tmp/runtime-knowledge-deploy.log, tmp/runtime-knowledge-before.json, tmp/runtime-knowledge-release-readback.json és a jelen munkamenet CUA-visszaolvasása.

## Módosított fájlok az előző éles kiadáshoz képest
- .agents/skills/tananyag-javito/SKILL.md
- .agents/skills/tananyag-keszito/SKILL.md
- docs/handoffs/2026-09-12-runtime-skill-learning.md
- docs/lesson-improvement.md
- docs/runtime-skill-learning.md
- docs/specs/2026-09-12-runtime-knowledge-vegrehajtas.md
- docs/specs/2026-09-12-runtime-knowledge.md
- docs/specs/2026-09-12-runtime-skill-learning-vegrehajtas.md
- docs/specs/2026-09-12-runtime-skill-learning.md
- source/client/src/components/studio/WorkflowGraph.tsx
- source/migrations/0020_lesson_skill_learning.sql
- source/scripts/run-learning-db-tests.ts
- source/server/improveAsync.ts
- source/server/index.ts
- source/server/studio/experience-builder.ts
- source/server/studio/lesson-pipeline-routes.ts
- source/server/studio/one-step.ts
- source/server/studio/routes.ts
- source/server/studio/run-extraction.ts
- source/server/studio/run-step.ts
- source/server/studio/step-runner.ts
- source/server/studio/structured-improvement.ts
- source/server/studio/web-research-runner.ts
- source/server/workflows/engine.ts
- source/server/workflows/learning-store.ts
- source/server/workflows/learning-worker.ts
- source/server/workflows/learning.ts
- source/server/workflows/routes.ts
- source/server/workflows/store.ts
- source/shared/lesson-skill.ts
- source/shared/lesson-workflow.ts
- source/shared/runtime-knowledge.ts
- source/tests/lesson-skill-db.integration.ts
- source/tests/lesson-skill.test.ts
- source/tests/runtime-knowledge.test.ts
- source/tests/workflow.spec.ts
