# Tananyagkészítés: v7.4 és a Studio fúziója

Tulajdonosi kérés: feltöltés, javítás és webes készítés közös, gazdag módszere. A megvalósítás engedélyezett; külön új jóváhagyás nem szükséges.

## Bizonyított gyökérok

- A szeptember 9-i v7.4-integráció kifejezetten kizárta a Studio JSON-útvonalát. A helyi készítő/javító skill szintén csak HTML-exportra írta elő a négy lapot.
- A `shared/lesson-schema.ts` hat blokktípusa nem tartalmaz szöveges feladatbankot, kognitív módszerbankot, nyelvi szószedetet és külön kvízbankot. A runtime egy szakaszlistát rajzol, az évfolyam határozza meg a palettát.
- A HTML-útvonalak már kapnak v7.4 promptot, de a régi creator 8192, az okosító 32768 kimeneti tokent enged, miközben a korábbi dokumentált teljes HTML 34105 token volt. A HTML-ellenőrzés szintaktikai, a webes út csak figyelmeztet.
- Az általános okosító a `contentType=lesson` rekord HTML-helyőrzőjét is HTML-ként küldi tovább. Ez nem a tényleges tananyag javítása.

## Cél és határ

A forráshű, fogalomhoz kötött, automatikus évfolyam-besorolású Studio megmarad. Ehhez verziózott, sémaellenőrzött `experience` adatréteg és auditált négylapos runtime készül. A régi leckék tovább olvashatók; tömeges átírás és adatbázis-migráció nem része e szeletnek. Éles publikálás nincs a helyi fejlesztéssel összemosva.

## Szeletek / érintett fájlcsoportok

1. `shared/lesson-experience*`, `lesson-schema.ts`: közös módszer, tíz kognitív elem, 45/15 szöveges és 75/25 kvízbank, szószedet, szinonimás/fuzzy/minőségi értékelő, pont/félpont/százalék/osztályzat, determinisztikus változatos téma.
2. `server/studio/experience-builder.ts`, `step-runner.ts`, `step-io.ts`, `quiz-export.ts`: külön, korlátos méretű és menthető bankgyártási körök a szerző és animátor után, a lektor előtt; teljes látható tananyag és forrásadatok; új jobok kötelező módszerverziója; publikálás előtti kemény kapu. A címkézés nem helyettesít tartalmi ellenőrzést.
3. `client/src/lesson-runtime/`: Tananyag/Módszerek/Feladatok/Kvíz navigáció, eltérő paletták és kártyák, válaszok és sorsolás mentése, tudásmérés, idő, eredményexport, mintaválasz, szóbeli gyakorlás és támogatott böngészőn diktálás, nyelvi TTS; a meglévő kuponos Próba megmarad.
4. HTML-gyártók és okosító, tároló/előnézet: közös pedagógiai szerződés, megfelelő kimenetkeret, strukturált javítás a valódi JSON-ból, mentett jelölt és tranzakciós visszaállítási pont.
5. `docs/lesson-improvement.md`, készítő/javító skillek: az új közös módszer és a HTML/JSON technikai különbségeinek rögzítése.

## Edge case-ek / szerződés

- Az évfolyam a forrásból származik; a külső skill évfolyamkérő mondata helyett a tulajdonosi szabály érvényes.
- A forrásszöveg adat, nem rendszerutasítás. Kérdés csak a Tananyag lapon tanított állításból; tanított fogalomra visszamutató hivatkozás szükséges.
- Rövid forrást nem szabad kitalált tananyaggal feltölteni. Nem teljes vagy ismétlődő bank nem publikálható kész fúziós leckeként.
- A lokális heurisztikus szövegértékelés nem szemantikus bizonyíték; részpont és mintaválasz támogatja az önellenőrzést. Negációt/hibás számot nem javítunk fuzzy egyezéssel.
- Diktálás csak felhasználói kattintásra, támogatott biztonságos környezetben; elutasított engedély után gépelés működik. Mikrofon nélkül is lehetséges szóbeli önellenőrzés.
- Sorsolás nem ismétel tételt; válaszváltoztatással az első kvízpont nem növelhető. Üres válasz nulla. Új kör előtt alkalmazásbeli megerősítés.
- Régi tananyag/jutalomlogika kompatibilis. Javítás nem változtathat leckeazonosítót, évfolyamot vagy publikációs kapcsolatot; konkurens változásnál alkalmazás elutasítandó.

## EARS elfogadás

- WHEN új Studio-gyártás indul THEN mind a négy laphoz valódi tartalom és működő mérés készül; hiányos banknál a folyamat konkrét hibával áll meg.
- WHEN a felhasználó tananyagot okosít THEN a rendszer a tartalomtípusnak megfelelő forrást és közös módszert alkalmazza; JSON esetén nem HTML-helyőrzőt javít.
- WHEN bármely bankból új kör indul THEN pontosan 15/25 egyedi tétel kerül elő, eredménye pont/százalék/osztályzat/idő bontásban mérhető és exportálható.
- WHEN mobilon álló/fekvő vagy asztali nézetben megnyílik THEN 320–2560px között nincs vízszintes túlcsordulás, levágott vezérlő; 44px célterületek és ékezetbiztos betűk vannak.
- WHEN új változatú lecke javítása vagy animálása fut THEN az experience réteg nem veszhet el némán.

## Ellenőrzés

Célzott séma/értékelő/generálási/retry/publikálási tesztek; meglévő regressziók; valós Chrome megjelenítés és feladat/kvíz interakció; teljes typecheck/lint/unit/build a zárásnál. Valódi modellhívás lokális jelöltre, titkok kiírása és éles tartalomírás nélkül. Végén mért eredmények és fennmaradó korlátok.

Lezárt végrehajtás és mért eredmények: [ellenőrzési napló](2026-09-10-lesson-method-fusion-evidence.md).
