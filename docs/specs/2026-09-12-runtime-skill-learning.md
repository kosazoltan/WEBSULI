# Futásonkénti önellenőrzés és alkalmazásszintű skill-tanulás

## Cél és hatókör
A tulajdonos kérésére minden közös tananyag-folyamat végállapotában legyen bizonyítékalapú önellenőrzés, a közben javított hibák is maradjanak meg, és az ellenőrzött tapasztalatok automatikusan befolyásolják a következő készítés/javítás modellutasítását. A feltöltés, Studio, internetes készítés, teljes/célzott/HTML-javítás és alkalmazás tartozik ide.

Nem cél a modellek súlyainak tanítása, tetszőleges programkód automatikus telepítése, a kapuk lazítása vagy a tanulási hatásosság bizonyítatlan állítása. A forrás és modellválasz adat, nem globális szabály. Új, még nem értelmezett hibafajta kötelezően rögzítendő megfigyelés, nem ellenőrizetlen utasítás.

## Döntések
- A közös workflow végrehajtó gyűjti a determinisztikus ellenőrzők megállapításait és készít utóellenőrzést. Az ellenőrzés a folyamat és a kapuk bizonyítékára vonatkozik; nem állít emberi pedagógiai minősítést vagy böngészőpróbát.
- Az alkalmazás skilljei tartós PostgreSQL-tárban élnek, készítőhöz, készítés/javítás skillhez, lépéshez és módszerverzióhoz kötve. Adminisztrátori Markdown-export mutatja a futó SKILL.md tartalmát. A repó skilljei erre hivatkoznak; az éles szerver nem ír Git-munkafát.
- Ismert, programellenőrző által észlelt hiba rövid, karbantartott megelőzési szabályt aktivál. Ismeretlen hibából csak ujjlenyomat, lépés és bizonyítékhivatkozás kerül a skillbe; nyers forrás, kulcs, felhasználói utasítás nem kerül globális promptba. Szolgáltatói és megszakadási hiba nem pedagógiai szabály.
- Az audit és a tanulságok tranzakcióban, futás/végrehajtás szerint egyszer kerülnek be. Félbeszakadt vagy nem auditált futásokat induláskor és időszakosan pótol a rendszer, aktív végrehajtó módosítása nélkül.
- Futáson belül rögzített skillverzió: folytatáskor változatlan prompt és checkpoint. Új futás új tapasztalatot tölt be. A bankgyártás hashében is szerepel az alkalmazott változat.
- Az automatikusan aktivált szabály admin API-val kikapcsolható; a bizonyíték megmarad. A korábbi kötelező séma-, forrás-, 15/15-, lektor-, mentési és visszaolvasási kapuk megmaradnak.

## Érintett fájlok
Új `source/shared/lesson-skill.ts`, `source/server/workflows/learning.ts`, `learning-store.ts`, `source/migrations/0020_lesson_skill_learning.sql`; közös workflow engine/store/routes/index; Studio modellhívás/kivonatolás/besorolás/bankgyártás/runner; webes és HTML-javító prompt; WorkflowGraph; célzott unit/DB/böngészőtesztek és DB-harness; a két repo-skill és `docs/lesson-improvement.md`.

## Edge case és elfogadás
1. HA egy ismert hiba javítókörben kijavul, AKKOR a végső siker mellett a hiba tapasztalata is megmarad, és új futás modelljéhez eljut.
2. HA a futás hibás/megszakadt/döntésre vár, AKKOR az audit nem állíthat teljes tananyagot vagy teljes kapusikert.
3. HA ugyanazt a kész futást vagy auditot újra kérik, AKKOR nincs új tananyag, duplázott tanulság vagy megváltozott statisztika.
4. HA forrásban/hibában idegen utasítás vagy titok található, AKKOR az nem kerül a tanult szabályszövegbe.
5. HA eltérő készítő vagy módszerverzió kér skillt, AKKOR nem kaphat másik készítőre/verzióra vonatkozó tapasztalatot.
6. HA a tanulás tára átmenetileg hibás, AKKOR nincs csendes tanulási siker; a mentett workflow alapján pótolható az audit. Aktív futást a pótlás nem szakíthat meg.
7. HA szabályt kikapcsolnak, AKKOR új futásban nem jelenik meg; futó/folytatott munka megőrzi a már használt verziót.

## Kiadás és visszaállás
Additív két tábla és indexek, meglévő tananyag módosítása nélkül. Első ellenőrzés kizárólag eldobható PostgreSQL-en. Visszaállási pont a kiinduló `ffffaff7737c38d50c08edd8bf3ace12f3eb9aba` commit; visszaállításkor az új táblák megőrizhetők. Éles migráció/deploy csak sikeres releváns ellenőrzés után, külön kiadási bizonyítékkal. A korábbi kézi feltöltés böngészőengedély-blokkolója ettől külön marad.
