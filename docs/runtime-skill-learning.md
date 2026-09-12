# A WEBSULI futásból tanuló módszere

## Saját futási tudástár

Az új futások verziózott identitást és a tényleges munkamód lépéseiből felépülő runbookot kapnak minden bekötött modellhívásban. Az alkalmazás alapeljárása a kiadott kódban, tanult tapasztalatai PostgreSQL-ben vannak; működéshez nincs szükség a fejlesztő gépének fájljaira. A korábbi, runtime-verzió nélküli futás eredeti promptja folytatáskor változatlan.

`GET /api/studio/skills/tananyag-keszito/runtime` (vagy `tananyag-javito`) a belépett admin saját tudástára. A `q` paraméter legfeljebb 200 karakteres módszerkeresés. A `document` paraméterrel letölthető: `SOUL.md`, `IAM.md`, `RUNBOOK.md`, `QMD.md`, `COGNI.md`, `MEMORY.md`, `KANBAN.md`, `SKILL.md`. Ezek a futó alkalmazásból előállított, saját tartós adatokra támaszkodó nézetek; külön másolatok helyett egy adatforrásból frissülnek.

A QMD itt belső módszerindex, IAM az identitás és jogosultsági határ, Cogni a számlálókból képzett állapot és következtetési korlát. Nem kapcsolódnak automatikusan azonos nevű külső termékhez. A Kanban vizsgálatra váró, megfigyelés alatt álló és kikapcsolt tapasztalatokat különít el. Sikeres futás nem jelenti automatikusan egy javítás bizonyított eredményességét.

Az injekciós hibajelzés ismert védekező szabályt aktiválhat; támadó szöveg nem másolódik saját utasításba. Ez a jelzett hibákból tanulás, nem minden bemenetet felismerő biztonsági detektor. A védekező alapelv már az első új futásban érvényes. Az autonómia a karbantartott szabályok aktiválására, tartós megfigyelésére és auditpótlására terjed ki; új ismeretlen eljárás bizonyíték nélkül nem kerül végrehajtásra.

A kézi Studio-forráskivonatolás egyetlen betöltött skillkontextust használ a besoroláshoz és a kivonatoló prompthoz, így az utóbbi gyorsítótára is módszerfüggő. Ez előkészítő részfeladat, nem külön teljes tananyagfutás. Az új snapshot a módszerverziót is rögzíti; az audit ezt használja. A verzió nélkül örökölt történeti futások auditja és megfigyelése `legacy-unversioned` alatt megmarad, de nem tanítja automatikusan az új módszert.

A rendszer a végrehajtás tapasztalatait tanulja meg, nem a nyelvi modell súlyait módosítja. A feltöltés, internetes készítés, Studio, teljes/célzott/HTML-javítás és alkalmazás a közös végrehajtót használja.

## Egy futás menete

1. A készítő saját, az aktuális módszerverzióhoz tartozó aktív skill-kiegészítései betöltődnek. A készítési és javítási tapasztalatok külön skillhez tartoznak.
2. A forrásfeldolgozás, besorolás, Studio, bankgyártás, webes és HTML-javító modellhívás a tényleges rendszerutasításban megkapja az alkalmazható kiegészítéseket. A kiegészítés nem cseréli le az alapmódszert. Az effektív utasítás/verzió része a releváns modell-, kivonatolási és bank-gyorsítótár azonosítójának.
3. A javítókörökben észlelt hiba azonnal mentett megfigyelés. A későbbi siker nem törli ezt a bizonyítékot.
4. A végén determinisztikus utóellenőrzés vizsgálja a kötelező lépéseket, a kapu lefutását és a visszaolvasott eredményt. Ez a korábban elvégzett tartalmi/séma/bankellenőrzéseket összegzi a folyamatról; nem új, független emberi pedagógiai lektorálás és nem automatikus böngészőpróba.
5. Az audit és a tanulságok a futás végállapotával egy tranzakcióban mentődnek. Futás/végrehajtás szerint egyszer számítanak, nem HTTP-kérésenként. Az alkalmazás induláskor és percenként legfeljebb 100 elmaradt auditot pótol; az aktív, érvényes végrehajtási engedélyű munkát kihagyja. Ez nem indít újra félbeszakadt fizetett AI-hívást és nem publikál tananyagot.

## Miből lesz aktív szabály?

A karbantartott katalógus ismert ellenőrzési hibáiból automatikusan rövid megelőzési utasítás lesz: fogalomazonosító, JSON-séma, bankméret, mintaválasz pontozása, ismétlés, írásbeli/szóbeli gyakorlat, fedettség, forráshűség, teljes HTML, hivatkozás, tipográfia és célzott javítás hatóköre.

Ismeretlen hibafajta mindig külön ujjlenyomatos megfigyelés. A skillben megmarad a bizonyítékot adó futás hivatkozása és a lépés; hibával megállt futásnál a szűrt hibaüzenet is elérhető az admin futásnaplójában. Közben kijavított ismeretlen hibánál a megfigyelés nem tartalmazza a nyers modellválaszt vagy hibaszöveget. Az ismeretlen szövegből nem lesz automatikusan rendszerutasítás. Új végrehajtható funkcióhoz vagy új szabálycsaládhoz továbbra is kód, teszt és kiadás szükséges. Az egyszerű időtúllépés/API-hiba nem pedagógiai tapasztalat.

Az új futás az addigi tapasztalatokat használja; az éppen futó vagy kifejezetten folytatott munka a már rögzített verzióját őrzi meg. A tapasztalat használata nem garantál hibátlan modellválaszt: a független minőségkapuk minden alkalommal megmaradnak. A kiegészítések növekedése korlátos, nem kerül minden korábbi hibaszöveg a promptba.

Azonos ismert hibafajta végrehajtásonként egyszer növeli a számlálót; az audit `steps` listája minden érintett lépést megőriz. A skill összesítőjében a `step` és `lastRun` együtt az utolsó megfigyelésre utal. Több lépés miatt sem duplázódik a szabályszöveg, és a kikapcsolt szabály sem éled újra.

## Tárolás, ellenőrzés, visszaállítás

Az alkalmazás futó skilljei a `lesson_skill_lessons`, auditjai a `lesson_skill_audits` táblában élnek; nem a telepítéskor elvesző szerverlemezen. A repó `.agents/skills/` fájljai az alapeljárást adják. A futó SKILL.md letölthető a Futások → Önellenőrzés és tanult tapasztalatok részből.

Saját admin API-k:

- `GET /api/studio/skills/tananyag-keszito` és `tananyag-javito`: állapot és megfigyelések.
- Ugyanez `?format=markdown`: az aktuális SKILL.md-export.
- `POST /api/studio/skills/:skill/:fingerprint/disable`: a saját kiegészítés kikapcsolása. Azonos ismert hibafajta későbbi előfordulása nem kapcsolja vissza. A futó munka változatlan verzióval fejeződik be.

Módszerverzió-váltásnál a korábbi tapasztalat megmarad, de nem töltődik automatikusan az új szerződésbe. A programnak nincs önálló Git-írási, kulcsmódosítási, kapukikapcsolási vagy kódtelepítési joga. A tanulási adatbázishiba nem jelenthető tanulási sikernek: a naplózás jelzi, a megőrzött futásból később pótolható az audit.

Bevezetés: additív `source/migrations/0020_lesson_skill_learning.sql`. Régi alkalmazáskódra visszaállításkor a táblák megtarthatók, tananyag-visszaírás nincs. Ellenőrzés: `npm.cmd run verify`, `npm.cmd run test:learning-db`, `npx.cmd playwright test --config playwright.workflow.config.ts`. Az izolált teszt bizonyítéka nem éles tananyaggyártás és nem pedagógiai hatásmérés.
