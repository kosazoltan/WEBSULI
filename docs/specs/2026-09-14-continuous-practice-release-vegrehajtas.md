# Kiadasi vegrehajtas

Diktalas review-kapu: ExperienceSpeech.tsx-ben kozos megszakito callback, inditas elott elozo session torlese, cleanupkor callbackok levalasztasa. lesson-fusion.spec.ts uj tesztje bizonyitsa maximum egy aktiv felismerot, regi callbackbol nulla valaszvaltozast, uj callback helyes celpontjat es fulvaltas utani leallast. Elso kapu celzott diktalasteszt, majd check/lint es teljes fusion teszt.

1. Hozz letre feature branch-et es kulon worktree-t. Az origin/main frissesseget ellenorizd. Mas munkajat ne stash/reverteld.
2. A teljes kiadasi staginglista: LessonExperienceView.tsx, SavedLessonQuiz.tsx, ExperienceSpeech.tsx; learning-flow.browser.ts, lesson-fusion.spec.ts, lesson-practice.browser.ts, lesson-fusion-live.browser.ts, preview-navigation.spec.ts; a ket continuous-practice tervpar. Csak ezeket stage-eld. A review-javitasok a kiadasi worktree-ben keszultek; ezeket ne ird felul a regi munkafa masolataval.
3. A tiszta worktree source konyvtaraban npm ci, majd npm run verify. Elvart: check, lint, check:test, unit tesztek es build PASS; warningok rogzites.
4. Futtasd a playwright.learning-flow.config.ts es playwright.lesson-practice.config.ts Chrome-teszteket a source munkakonyvtarbol. Elvart: 20 (learning-flow 10 + fusion 10) es 8 PASS. Nincs eles DB kapcsolat.
5. Ellenorizd a staged diffet es secret-szivargas hianyat, commit, push feature branch. A .github/pull_request_template.md alapjan keszits PR-t; emberi review-t ne allits elvegzettnek.
6. Olvasd vissza a PR checkeket, review-kat es kommenteket. Csak sikeres gate utan merge. Ellenorizd main CI es Vercel/Render deployment allapotat; a korabbi production deployment legyen visszaallithato.
7. Valodi Chrome-ban nyisd meg a felhasznalo eles preview oldalat vendegkent. Feladat es Kviz fulon ellenorizd a lathato teteleket es overflow-t desktop/mobilon, keszits screenshotot; ne kuldj eles pontozott valaszt.
8. Rogzitsd a commitot, PR-t, ellenorzeseket, telepitesi bizonyitekot es marado kockazatot. A helyi dirty munkafa maradjon meg.

## PR review kiegeszites
9. A source/tests/lesson-fusion-live.browser.ts regi lapozo es Teljes lista kattintasait csereld folyamatos lista/all-items-visible ellenorzesre. A kiertékelo gombhoz scrollozz es ellenorizd a viewporton beluli helyzetet; a teljes pontszam elvaras maradjon. Futtatas: LESSON_LIVE_BROWSER=1, playwright.lesson-fusion.config.ts, a meglevo helyi candidate JSON masolataval; elvart 3 PASS, tavoli iras nelkul.
10. A source/tests/preview-navigation.spec.ts elso harom tesztjeben a kiertékelo gomb scrollIntoViewIfNeeded utan legyen a viewporton belul, es elementFromPoint hit-test szerint ne fedje mas elem. A lapozo hianya es minden kvizkartya lathatosaga is ellenorizendo. Celzott teljes preview-navigation tesztfajl futtatas helyi Vite-tal; majd uj PR CI, elvart minden E2E PASS.