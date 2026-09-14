# Kiadasi vegrehajtas

1. Hozz letre feature branch-et es kulon worktree-t. Az origin/main frissesseget ellenorizd. Mas munkajat ne stash/reverteld.
2. Vidd at a LessonExperienceView.tsx, SavedLessonQuiz.tsx, learning-flow.browser.ts, lesson-fusion.spec.ts, lesson-practice.browser.ts fajlokat es a ket continuous-practice tervpart. Csak ezeket stage-eld.
3. A tiszta worktree source konyvtaraban npm ci, majd npm run verify. Elvart: check, lint, check:test, unit tesztek es build PASS; warningok rogzites.
4. Futtasd a playwright.learning-flow.config.ts es playwright.lesson-practice.config.ts Chrome-teszteket a source munkakonyvtarbol. Elvart: 19 es 8 PASS. Nincs eles DB kapcsolat.
5. Ellenorizd a staged diffet es secret-szivargas hianyat, commit, push feature branch. A .github/pull_request_template.md alapjan keszits PR-t; emberi review-t ne allits elvegzettnek.
6. Olvasd vissza a PR checkeket, review-kat es kommenteket. Csak sikeres gate utan merge. Ellenorizd main CI es Vercel/Render deployment allapotat; a korabbi production deployment legyen visszaallithato.
7. Valodi Chrome-ban nyisd meg a felhasznalo eles preview oldalat vendegkent. Feladat es Kviz fulon ellenorizd a lathato teteleket es overflow-t desktop/mobilon, keszits screenshotot; ne kuldj eles pontozott valaszt.
8. Rogzitsd a commitot, PR-t, ellenorzeseket, telepitesi bizonyitekot es marado kockazatot. A helyi dirty munkafa maradjon meg.