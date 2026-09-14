# Continuous practice kiadas

## Cel
A jovahagyott gorgetheto Fusion feladat- es kvizlista lint, PR, merge, push es eles telepitese. A felhasznalo 2026-09-14-en kifejezetten kerte a kiadast.

## Hatokor es nem-cel
Ket runtime komponens, harom kapcsolodo bongeszoteszt, a continuous-practice tervpar es ez a kiadasi tervpar. Mas dirty backendvaltozas, env, helyi runner es teszteredmeny nem kerul a commitba. Nincs adatbazis-migracio vagy eles tesztadatiras.

## Eljaras es kockazat
Kulon feature branch es tiszta worktree; csak a kijelolt fajlok atvitele. Teljes verify es celzott Chrome-proba a kiadasi fan. PR a main agra, CI es review visszaolvasas; merge csak sikeres kapukkal. Main automatikus Vercel/Render deployt indithat, ezt allapotlekerezessel ellenorizni kell. Kulcsok csak process-memoryban, ertek soha nem kimenet.

## Visszaallitas
Kiindulo helyi commit: d0624ef9efc378f12295a1a1c4279cda74672195. Merge elott aktualis origin/main es elozo Vercel production deployment rogzites. Regresszio eseten elozo jo production deployment visszaallitasa; adatbazis nem valtozik. Force push tilos.

## Elfogadas
Amikor a kiadas kesz, a PR merged, a commit tavoli mainen elerheto, CI sikeres es a production deployment READY. Az eles preview oldalon 15 feladat es 25 kvizkerdes normal gorgetheto listaban lathato, mobilon sincs belso scrollbar vagy vizszintes overflow. Ha hozzaferes vagy gate blokkol, merge/deploy sikert nem szabad allitani.

## Merge elotti bizonyitek
- PR #67 Copilot review nyoman a kapcsolodo source/tests/lesson-fusion-live.browser.ts is a dokumentalt listanezetre frissul: nincs pager/teljes-lista kapcsolo, minden aktualis tetel lathato, teljes pontozasi elvaras megmarad. Ez a SPEC-valtozasbol kovetkezo tesztfrissites, nem gate-gyengites.
- Tiszta worktree: D:/repo/WEBSULI-continuous-release; branch feat/continuous-practice-20260914. Origin/main es HEAD egyezik a kiindulaskor.
- Korabbi sikeres Vercel Production deployment: 6426824671, d0624ef9efc378f12295a1a1c4279cda74672195; URL https://websuli-2uw7c7xua-kosa-zoltans-projects.vercel.app.
- npm ci PASS; npm run verify PASS: app/test typecheck, lint, 1225 unit teszt/0 fail/0 skip, build.
- Chrome PASS: learning-flow 10 (32.9s), lesson-fusion 9 (20.6s), saved practice 8 (19.1s). Elso terminalos futasok lezarasa elakadt; kozvetlen Node spawnSync, explicit source cwd es CI=1 mellett valodi exit=0. Tesztek nem gyengultek.
- Fuggetlen statikus alugenok-review: nincs uj konkret finding a ket komponens diffjeben. Emberi review nem tortent.
- Meglevo warningok: deprecated transitive npm csomagok, regi caniuse-lite, pdfjs eval, ures mammoth chunk. Fuggosegfrissites nem resze a UI-kiadasnak.