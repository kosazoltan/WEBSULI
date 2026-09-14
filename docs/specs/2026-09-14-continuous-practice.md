# Folyamatos feladat- es kvizlista

## Cel es hatokor
A tulajdonos kepernyokepei szerinti fusion Feladatok es Kviz fulon az aktualis kor minden tetele egymas alatt jelenjen meg, normal oldalgorgetessel. Nincs kerdesenkenti lapozas, attekintes-kapcsolo vagy belso kartya-gorgetosav. A tananyag fejezetnezetet es a regi, kulon HTML-widgeteket ez a szelet nem valtoztatja.

## Nem-cel es invariansok
Nincs adatbazis-, bank-, pontozas-, jutalom-, hitelesites- vagy API-valtozas. A 15 feladat/25 kerdes meretu jelenlegi kor nem bovul a teljes 45/75 elemre. Meglevo mentett valaszok es eredmenyek megmaradnak. Nincs deploy/push; az eles oldal ettol a helyi modositastol meg nem frissul.

## Ellenorizheto helyi hipotezis
A LessonExperienceView taskOverview/quizOverview hidden feltetelei rejtik a helyi teteleket; a SavedLessonQuiz egyetlen indexelt kerdest renderel. A data-overview=false/data-quiz-guided=true stilusok kapcsoljak a belso gorgetest. Teljes listaval es overview=true/guided=false allapottal a meglevo normal dokumentumfolyam mukodik CSS-atalakitas nelkul. Ezt a 25 lathato kartya es overflow-y ellenorzese megcafolhatja.

## Elfogadas
- Amikor a diak a Feladatok fulre lep, mind a 15 textarea lathato DOM-elem, nincs feladatlapozo vagy teljes-lista kapcsolo.
- Amikor vendeg vagy bejelentkezett diak Kvizre lep, mind a 25 kartya lathato DOM-elem, nincs kerdeslapozo. A 25. kerdes megvalaszolhato az elso elott.
- Amikor hianyos kort folytat, az elso megvalaszolatlan tetelre gorget es fokuszal; minden mas tetel tovabbra is lathato.
- Mentett valasz 200/SQL-egyezes, offline hiba/retry, reload, elso valasz valtoztathatatlansaga, 50 valasz/2kor/1kupon valtozatlan.
- 320x900, 844x390 es 1365x612 nezetben nincs vizszintes overflow, kartyan beluli gorgetes vagy fedett valaszvezerlo; valodi Chrome screenshotok megtekintve.

## Fajlok es ellenorzes
source/client/src/lesson-runtime/SavedLessonQuiz.tsx; LessonExperienceView.tsx. A specifikacio-valtozas miatt a lapozast kereso meglevo bongeszotesztek uj listakovetelmenyre frissithetok, minden pontozasi/mentesi allitas megorzesevel. Elso ellenorzes npm.cmd --prefix source run check; majd celzott bongeszotesztek, izolalt real-learning-harness, lint es build. Meglevo mas worktree-modositasok erintetlenek.

## Vegrehajtas es bizonyitek
- Modositott alkalmazasfajlok: source/client/src/lesson-runtime/SavedLessonQuiz.tsx, LessonExperienceView.tsx es a kiadasi review soran ExperienceSpeech.tsx. Minden aktualis tetel renderelodik, a folytatas az elso hianyzo valaszhoz gorget/fokuszal; egyszerre egy diktalas aktiv, kesoi eredmeny elutasitva. Tananyaglapozas valtozatlan.
- Modositott regressziok: source/tests/learning-flow.browser.ts, lesson-fusion.spec.ts, lesson-practice.browser.ts; helyi teljes alkalmazasos runner: source/real-learning-tests.local.mts (gitignored).
- PASS: npm.cmd --prefix source run check, mindket alkalmazaskomponens modositasa utan; vegso run lint es run build; szerkesztoi diagnosztika az alkalmazaskomponensekre es helyi runnerre hiba nelkul.
- PASS: eredeti alugenok-futas learning-flow 10, fusion 9, saved practice 8; kiadasi diktalasjavitas utan a teljes fusion csomag 10 PASS (21.0s), kulon live-source 3 es preview-navigation 10 PASS. A tesztek helyi fixture/mock alapuak; nem helyettesitik az alabbi teljes alkalmazasos probat.
- PASS: node --import ./source/node_modules/tsx/dist/loader.mjs ./source/real-learning-harness.local.mts --snapshot (17:12Z): valodi Chrome + Express/Vite + izolalt PostgreSQL17, 2 kor/50 valasz, masodik kor forditott sorrendben; 24/25 es 25/25 pont, 23 onallo helyes elso kori valasz, pontosan 1 kupon. Offline retry, elso valasz valtoztathatatlansaga, hint/reload/export es uj kor ellenorizve.
- PASS: 15 helyi es 15 vendegfeladat, mindketto 12.5 pont; vendegkviz 25 lathato kerdes, utolso kerdes eloszor, hianyzo valasz fokusz es reload. Vendeg practice API keres 0, szerverkorok szama valtozatlan.
- PASS: tanari kimutatas 50 valasz/3 oldal, SQL-egyezes; scheduled-publishing DB-teszt 1 PASS; sajat tesztadatok cleanup 0 maradvany, forrasmasolat hash valtozatlan. Izolalt app es kontener leallitva.
- PASS: mobil/allo, fekvo es desktop valodi bongeszos overflow/fedes ellenorzes; saved-320.png, saved-landscape.png, saved-desktop.png kepek megtekintve a tmp/real-learning-tests alatt. Nincs belso kartya-gorgetes vagy vizszintes tulcsordulas.
- PASS: adatbazis nelkuli helyi demo http://127.0.0.1:5199/__lesson-runtime-probe?fusion=1, kulon Chrome-proba 15 feladat/25 kerdes. Az elso inditas rossz munkakonyvtarbol Tailwind border-border hibaval bukott; source munkakonyvtarbol ujrainditva sikeres. A demo fixture-anyagot mutat, nem az eles lecket.
- Build figyelmeztetesek: regi caniuse-lite, pdfjs eval, ures mammoth chunk. Ezeket a megjelenitesi valtozas nem javitja.
- NOT RUN: eles deploy/push, teljes tesztsuite, AI-generalas es OAuth. Nem reszei ennek a megjelenitesi szeletnek. A teljes alkalmazasos proba korabbi forrasmasolatot hasznal; aktualis eles tartalomellenorzest nem bizonyit.