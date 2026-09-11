# Végrehajtás

1. A source/server/studio/step-runner.ts author ágában a previousLesson alapján mérd meg checkCoverageGate és checkLessonArc eredményét, és szükség esetén add át ugyanazon gateFeedback mezőben és rendszerüzenetben, mint a késői kapuhibát. A meglévő tárolt jelentés elsőbbsége maradjon meg.
2. Kapuhiba és üres friss bankfeedback esetén az előző kör bankReview feloldott elemeit őrizd meg; ellenőrizd a kör sorszámát, és szűrd ki az admin-only jegyzetet. Tárold az aktuális kör sorszámával, így az animátor meglévő körvédelme érvényes marad.
3. A source/tests/lesson-pipeline-runner.test.ts fájlban adj regressziót a korai kapuvisszajelzésre, a tiszta lektor után kapujavításon át megőrzött bankfeedbackre, és a régi/admin-only visszajelzés kizárására. Előbb futtasd a tesztet a régi kódon: célzott FAIL. Ezután javítsd a kódot: célzott PASS.

A végső lektori elutasításhoz külön regresszió: előző üres jelentés mellett aktuális blocker érkezik; az aktuális jelentés és körszám a hibával együtt kerüljön a jobba, a konkrét indok legyen a hibaüzenetben. A fail segéd opcionális output-patch értékét egyetlen saveStep hívásban mentse az állapottal; más hibautak változatlanok.
4. Frissítsd docs/lesson-improvement.md folytonossági szabályát. Futtasd a source könyvtárban a célzott pipeline-tesztet, majd npm.cmd run verify. Futtasd a git diff --check ellenőrzést. Elvárt: minden ellenőrzés PASS.
5. A PR leírását a tényleges teljes javításhoz igazítsd; zöld CI és az éles futás lezárása után merge/push/deploy. Az új éles kiadásban végzett tananyaggyártás végén adatbázis-visszaolvasás, nyilvános API-próba és valódi Chrome-ellenőrzés szükséges.
