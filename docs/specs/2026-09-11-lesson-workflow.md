# Tananyag-folyamatok közös végrehajtása és élő ábrája

## Cél és felhatalmazás

A tulajdonos jóváhagyta a közös, program által ellenőrzött folyamatleírás, tartós futáskövetés és ebből készülő ábra megvalósítását. A nézet a ténylegesen futtatott lépéseket mutassa feltöltés, Studio, internetes készítés, teljes javítás, célzott javítás és HTML-okosítás esetén. Ne készüljön AI által rajzolt, a működéstől külön élő folyamatábra.

## Ellenőrzött alapállapot

Külön `pipeline.ts`, `one-step-progress.ts`, `web-research-jobs.ts` és `improveAsync.ts` vezérlők vannak. A webes keresés és HTML-írás egyetlen szolgáltatói folyamat. A Studio animátor lépése a bankokat is elkészíti. Teljes javítás külön jelöltet ment, az alkalmazás külön művelet; a célzott javítás automatikusan alkalmazza a jelöltet. Az új réteg nem állíthat ezekről több részletet, mint ami mérhető.

## Döntések

- Verziózott TypeScript folyamatleírás a shared könyvtárban, ugyanebből végrehajtási feltételek és reszponzív adminábra. Új n8n/rajzoló keretrendszer nem kell.
- Saját, additív `lesson_workflow_runs` tábla; tulajdonos, mód, verziózott definíció, lépésnapló, biztonságos részeredmények és végső anyaghivatkozás. A nyilvános admin DTO nem tartalmaz promptot, forrásszöveget vagy modellválaszt.
- A meglévő tartalmi kapuk és tranzakciók megmaradnak. A közös réteg a lépéssorrendet, körkorlátot és a terminális eredmény feltételeit ellenőrzi. Valótlan siker tiltott.
- A befejezett, változatlan bemenetű AI-részeredmény újrahasználható; megváltozott bemenet vagy folyamatverzió nem. Megszakadt, még választ nem mentett szolgáltatói kérés egyszeri kiszámlázása nem garantálható.
- A tárolt eredmény és a közzététel külön állapot. Javítójelölt végállapota „alkalmazásra vár”, nem „éles”. Mentési/apply művelet előtt a tényleges kaput és előállapotot újra ellenőrizni kell.
- Futástörténet az adminban, az egyes készítő/javító felületekről is elérhető. A lépésre kattintva tényleges idő, ismétlés, hiba és ahol mérhető tokenszám látható. Ismeretlen adat nincs becsléssel kitöltve.

## Nem-cél

Pedagógiai módszer, prompttartalom, fontok, játékok vagy meglévő tananyagok tömeges megváltoztatása. Új szolgáltató és vizuális szerkesztő telepítése. AI-válasz szakmai helyességének garantálása pusztán a gráffal.

## Érintett területek és szeletek

1. `source/shared/lesson-workflow.ts`, `source/server/workflows/`, additív migráció: gépi szerződés, tartós állapot és tulajdonosi API, regressziós tesztek.
2. `source/server/studio/{lesson-pipeline-routes,step-runner,structured-improvement,web-research-jobs,web-research-routes}.ts`, `source/server/improveAsync.ts`, `source/server/routes.ts`: tényleges útvonalak és ellenőrzött lezárás bekötése.
3. `source/client/src/components/studio/`, `MaterialImprover.tsx`, admin integráció: közös futásábra és visszanézhető futások.
4. Célzott unit/DB/böngészőpróba, teljes verify, PR/CI és éles ellenőrzés; a korábbi #56 előnézetjavítás külön megmarad.

## EARS elfogadás és edge case-ek

- Amikor egy mód elindul, akkor a valós végrehajtás ugyanannak a verziózott definíciónak a lépéseit használja, mint az ábra.
- Ha egy előfeltétel hiányzik, a következő védett lépés nem indul és érthető hiba marad.
- Ha ugyanaz a futás párhuzamosan indul, egy aktív végrehajtó dolgozhat rajta; elavult írás nem írhat felül kész eredményt.
- Ha a lap újratöltődik, az adatbázisból ugyanaz a történet jelenik meg. Hiányzó régi naplóról nem gyártunk kitalált történetet.
- Ha hiba vagy megszakadás történik, látható legyen az utolsó tényleges lépés; a kész részek maradjanak meg. Újrapróbálás csak megengedett állapotból, változatlan bemenettel és érvényes kapukkal lehetséges.
- Ha csak jelölt készült, „alkalmazásra vár” látszik. Kész/alkalmazott állapot csak visszaolvasott valódi eredményazonosítóval állítható be.
- Ha más tulajdonos kérdezi a futást, ne kapjon hozzáférést.
- 320 px, 390 px, fekvő mobil és asztali Chrome esetén az ábra kezelhető, nincs vízszintes túlcsordulás vagy levágott hibaszöveg; státusz nem csak színnel jelzett.

## Kiadási kockázat és visszaállás

Kiadás előtti review-szelet: a felhasználó törlése a saját futásnaplóit kaszkáddal törölje, hogy a meglévő törlés/visszaállítás ne ütközzön új FK-ba. A checkpoint mentése és a webes job ready állapota közötti megszakadás után a felület külön folytatást kínáljon, kizárólag érvényes, pontos bemenetű mentett eredményből, új AI-hívás nélkül. Másik javítójelölt megnyitása annak saját naplóját mutassa. Elfogadás: izolált DB-törlés, webes újraindulási teszt és két jelölt közötti böngészős váltás.

A migráció kizárólag új táblát/indexet hoz létre. Élesítés előtt aktív futások ellenőrzése és friss visszaállítható mentés kell. Kódvisszaállításkor a naplótábla megmaradhat; éles adatot nem törlünk. Új folyamat csak az adott verziójához tartozó kóddal folytatható.

## Állapot

Megvalósítva a hét mód, a tényleges lépésvédelmek, a tulajdonosra szűrt tartós napló és az adminba integrált mobilábra. A régi AI-fül a közös készítőt használja. A külön force-apply gomb megszűnt; régi API-címe is a normál mentéses alkalmazást hívja. A teljes Studio-lánc próbája közben a státuszpatch javítva: lektor/pedagógus nem ad át undefined leckeazonosítót.

Helyi ellenőrzés (2026-09-11):
- `npm.cmd run verify`: PASS, typecheck, lint, teszt-typecheck, 1150 unit teszt, build.
- `npm.cmd run test:learning-db`: PASS, 13 eset. Az új migráció kétszer futott idempotensen az eldobható PostgreSQL 17-en. Valódi mentés/visszaolvasás, hibás jelölt, egyszeri alkalmazás, konkurens engedély, tulajdonosi HTTP API és felhasználótörlés ellenőrizve.
- `npx.cmd playwright test --config playwright.workflow.config.ts --reporter=line`: PASS, 9 eset, 320/390/844/1440 px, mind a hét mód; kontraszt, átfedés, vízszintes túlcsordulás, újratöltés, megszakadás, régi AI-menü, mobil navigáció, jelöltváltás és a mentett webes eredmény folytatása.
- Külön önreview: a fehér felirat/fehér háttér kontrasztja javítva, megszakadt lépés részlete nem mutat „Folyamatban” állapotot, alkalmazáskor teljes tartalomegyezés és sorzár védi a mentést. A meglévő kapuk nem lazultak.

Korlát: a réteg nem automatikus munkasor, és nem hoz újra létre megölt, még nem mentett AI-kérést. A tartós napló és a kész részeredmény megmarad, megszakadás látszik. A hibára váltott webes futás teljes, ellenőrzött checkpointja külön gombbal folytatható új AI nélkül; ezt a ready állapot előtti mentési résben is teszteltük. Régi anyagok és futások naplóját nem generáljuk utólag. Fizetős éles próbagyártás mind a hét módban NOT RUN; a hét mód regressziója izolált/modellezett szolgáltatói válaszokkal történt. Az éles adminellenőrzéshez jelenleg nincs elérhető bejelentkezett tulajdonosi munkamenet. Kiadás következik; a végső kiadási evidencia a PR #57-hez kerül.
