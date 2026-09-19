# Studio folytatás: rövid HTTP elfogadás

## Cél és bizonyíték
A valódi helyi folytatás POST kérései körülbelül öt perc után `net::ERR_FAILED` hibával lezárultak, miközben a DB-ben a lease aktív és a bankgyártás halad. A route a teljes `driveTracked` hívást megvárja; a kliens `apiRequest` időkorlátja 60 másodperc, és siker után nem érvényteleníti a megállt job lekérdezését.

## Szerződés
- Előfeltétel: admin, saját workflow, megszerzett lease és sikeres bank/lektor recovery. Ezek előtt nincs 202.
- Elfogadás után 202 `{jobId}` azonnal; ez nem gyártási siker. A szerver a meglévő, körlimitált drive-ot végigfuttatja.
- Elfogadás előtti hiba 409; utána nincs második HTTP válasz, a tartós job/workflow hibája és biztonságos napló marad.
- Kész futás idempotens 200 válasza megmarad, nincs új gyártás. A korábbi, nem követett job csak a meglévő recovery-védelemmel indulhat.
- A ResumeButton siker/elfogadás után újraolvassa saját job- és workflow-queryjét. Újrapróbálás nem automatikus. Upload folytatás kezdetén a progress is az aktuális lépést mutatja, nem a régi hibát.
- Nincs auth/lease/körlimit/publikációs kapu lazítása. Aktív szervert nem indítunk újra a kód betöltéséért; megvárjuk a futások végét.

## Fájlok és elfogadás
- Review-kiegészítés: a drive-ból kiszökő kivétel a lease-en belül, a PipelineStore védett mentésével zárja hibára a nem terminális jobot. Már kész/hibás állapotot nem ír felül. Az upload-query prefix és workflow-query prefix is újraolvasandó, mivel a feltöltési runId eltérhet a jobId-tól. A kész legacy job onAccepted nélkül térjen vissza.
`source/server/studio/resume-response.ts`, `lesson-pipeline-routes.ts`, `source/client/src/components/studio/JobMonitor.tsx`; új HTTP regresszió, új böngészős eset a meglévő Studio próbafelületen. A HTTP teszt bizonyítsa, hogy a válasz a blokkolt gyártás befejezése előtt megérkezik, a korai elutasítás 409 és a késői hiba nem küld második választ. Chrome-ban az Újra gomb után a running állapot, majd végállapot jelenjen meg újratöltés nélkül.

## Forrás
- A végső hibazárás nem támaszkodik a PipelineStore általános saveStep metódusára (az csak jobazonosítót használ): a route külön tranzakciós adaptere workflowFence előtti/utáni ellenőrzést és nem terminális állapotot kikötő SQL feltételt használ. Legacy futásnál nincs kitalált workflow lease, de a terminális SQL-védelem megmarad.
Express 4 Response API: https://expressjs.com/en/4x/api/response/ ; TanStack Query v5 invalidation: https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation . Context7 a munkamenetben jogosultsági hibával nem elérhető; közvetlen hivatalos dokumentáció olvasva.

## Ellenőrzés és helyi betöltés
- Végső `npm.cmd run verify`: 1254 PASS, 0 FAIL, 0 skipped; typecheck, lint (0 warning), teszttípusok és build PASS.
- Új HTTP regresszió 4/4 PASS; az elfogadási válasz megérkezik a blokkolt munka befejezése előtt, a késői hiba nem küld második választ. A terminális job állapotmegőrzése tesztelt.
- Studio Chrome-regresszió 5/5 PASS: a job és feltöltési jelző egyaránt error→running→error állapotot mutat újratöltés nélkül; 320/1440 px screenshot és overflow-ellenőrzés. A korábbi három feltöltési teszt is sikeres.
- Független végső review: a követett ág lease-védett hibazárása igazolt, nincs revízióeltérés; a legacy ág nem kap kitalált lease-t.
- A helyi szerver végleges kóddal újraindult. Valódi job-readback: egyik done/ok, másik error/error. A kész job ismételt resume-ja 269 ms alatt 200, új gyártás nélkül. Új fizetős gyártást csak a 202 méréséért nem indítottunk: azt a valódi Express HTTP-regresszió bizonyítja.
- Éles push/deploy, CI és production böngészőpróba NOT RUN: nincs kiadási megbízás. A körlimitnél megállt tananyag nem kész; a teljes újragyártás vagy külön jelöltmunka külön döntést igényel.