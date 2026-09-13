# Végrehajtási utasítás: elavult internetes jelölt minőségjelzése

1. Olvasd a kapcsolódó specet, a `docs/lesson-improvement.md` módszert és a
   tananyag-készítő skillt. Ne módosíts meglévő tananyagot vagy adatbázist.
2. Hozd létre a `source/server/lib/web-lesson-quality-notice.ts` modult. A
   `hasHtmlLessonData`, `readHtmlLessonData`, `LESSON_METHOD_VERSION` és
   `verifyLessonMethodHtml` alapján adjon vissza `null`, `legacy` vagy `invalid`
   státuszt; a publikus szöveg legyen statikus és magyar.
3. A `/dev/:id` HTML ágában csak a `qualityNotice` által visszaadott statikus
   elemet szúrd be a dokumentum elejére. A HTML törzsét, JSON-bankját,
   válaszait és eredményeit ne módosítsd.
4. Írj unit tesztet: JSON nélküli HTML nincs jelzés; érvényes v4 nincs jelzés;
   v2 vagy hiányos bank `legacy`/`invalid` jelzést ad; a jelzés elhelyezhető
   teljes HTML-ben és nem tartalmaz belső diagnosztikát.
5. Futtasd a célzott unit tesztet, `git diff --check`-et és a TypeScript/lint
   ellenőrzést. A `/dev` előnézetet Chrome-ban ellenőrizd legalább 390 és 1440
   px szélességen; a jelzés ne okozzon vízszintes túlcsordulást.
6. A webes admin-készítést csak hitelesített adminból lehet indítani. Ha ilyen
   munkamenet nincs, a tényleges új Trója-generálás **NOT RUN**, és ezt a záró
   naplóban külön kell jelölni.

