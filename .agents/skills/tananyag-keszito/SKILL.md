---
name: tananyag-keszito
description: Feltöltött forrásból vagy internetes keresésből készülő HTML és Studio JSON tananyagok közös fúziós módszere. Aktiválódjon tananyag készítése esetén.
---

# Tananyag készítése — fúzió 7.4

Először olvasd el a [közös, forrásalapú módszert](../../../docs/lesson-improvement.md), majd a feladathoz szükséges [v7.4 referenciarészeket](../../../docs/specs/tananyag-keszito-SKILL-v7_4.md). A feltöltött v7.4 tudása kötelező minimum (tulajdonosi utasítás, 2026-09-12). A közös szerződés a biztonságos pontozást, automatikus besorolást és technikai formátumokat pontosítja, a pedagógiai minimumot nem csökkentheti.

## Kötelező menet

A [futó skill-tanulási eljárás](../../../docs/runtime-skill-learning.md) is része a készítésnek. A program minden végrehajtás után mentett utóellenőrzést készít, a kijavított hibákat is megőrzi, és a saját aktív módszertani kiegészítéseit a következő modellhívásokhoz betölti. Az aktuális alkalmazás-SKILL.md az admin Futások felületéről tölthető le. Új hibafajta kötelező megfigyelés, nem szabad szöveges utasítás; a kapuk és a 45/75 minimum ettől nem lazulhatnak.

1. Olvasd a repo vezérlőfájljait; terv és külön AI-végrehajtási leírás előzze meg a kódot.
2. Azonosítsd a tényleges forrást és tartalomtípust. `contentType=lesson` esetén a `lessons.json` a tananyag; HTML-helyőrzőt tilos javítómodellnek küldeni. Feltöltött kép/PDF/szöveg vagy webes forrás azonosítását, bizonytalanságát és idézeteit őrizd meg.
3. A program a forrás tartalmából állapítja meg a tantárgyat és évfolyamot. A készítőtől ne kérj osztályt; a keresési korosztály csak támpont. Javítás nem írhatja felül a kurált besorolást.
4. Mindkét formátumban négy lap szükséges: teljes Tananyag, témához illő Módszerek, fogalomfedő írásbeli-szóbeli bank, külön felidéző/alkalmazó Kvíz. Az új fusion-7.4-4 legalább 45 pontozott szöveges feladatot és 75 kvízkérdést készít, 15/25-ös körökkel, mind a tíz módszertípussal és legalább két kapukérdéssel. A régi fusion-7.4-1/2/3 továbbra is olvasható, új publikálással nem kerülheti meg a minimumot. Nyelvleckénél szószedet és célnyelvi felolvasás. Kérdés kizárólag ténylegesen tanított tartalomból.
5. Studio esetén a legfeljebb hatfogalmas, önállóan ellenőrzött csomagokat készítő bankgyártót és a közös runtime-ot használd. HTML esetén a teljes közös promptot és az egyetlen JSON-bankot olvasó négylapos megjelenítést. Egyéni prompt nem helyettesítheti a módszerszerződést.
6. A meglévő jó tanítást és konkrét kidolgozott példákat őrizd meg. Ne tömöríts vázlattá és ne találj ki tartalmat a bankszámért. Célzott javításnál az idegen tanítási blokkok érintetlenek; a kapcsolódó bankok újraellenőrzendők. A változatlan fejezet és forrás azonos kivonatú csomagja újrahasználható; megváltozott forrás/módszerverzió mellett tilos a régi válasz átvétele.
7. Kötelező a séma-, forrás-, fedettség-, mintaválasz-, lektor- és csonkolásvizsgálat. Minden saját minta teljes pont, üres válasz nulla. Hiányos bank vagy blokkoló lektorhiba nem publikálható kész anyagként. A HTML minden tanítási fejezete legyen alapból látható, magyarázattal, kidolgozott példával, összegzéssel és valódi szemléltetéssel. Internetes készítéskor ténylegesen letöltött forrásszöveg és külön tartalmi lektor szükséges; találati lista nem elég. A forrásfedettség mellett érdemi oktatási többletet is ellenőrizni kell.
8. Valódi böngészőben próbáld ki mind a négy lapot, téves/részleges/helyes válaszokat, újrasorsolást és eredménymegőrzést. Ellenőrizd az évfolyammal csökkenő színintenzitást (1–2, 3–4, 5–6, 7–8, 9+), ékezeteket, ábrákat, átfedést, túlcsordulást, 44 px vezérlőket 320 px mobilon, álló/fekvő és asztali nézetben. A nyílt/szóbeli pontozás helyi heurisztika; ezt a tanuló is lássa. Publikált Studio-kvíznél bejelentkezve a szerver rögzíti az első választ és a segítséget; próbáld ki a mentési hibát, újrapróbálást, újratöltést, bankverzió-váltást, jutalomkorlátot és tanári riportot is. A vendég/HTML/előnézet helyi eredménye nem szerveres mérés.
9. Javítást külön jelöltként készíts. Alkalmazás előtt teljes mentés, előállapot-/forráshash és konkurens gyártás ellenőrzése; lecke+metaadat+kvízbank egy tranzakcióban; utána visszaolvasás. A visszaállítás sem írhat felül későbbi szerkesztést.
10. Külön jelentsd az elkészült jelöltet, ellenőrzött jelöltet, alkalmazott adatot és kiadott programkódot. Teszt nélkül nem írható PASS. Lokális fájlra valós abszolút hivatkozást adj; ne feltételezz `/mnt` útvonalat vagy nem elérhető megjelenítőeszközt.

A részletes méretkeretek, pontozás, hibakörök, publikus és tárolási szerződés a közös módszerben és az ott hivatkozott forráskódban van. Ezt a skillt az összes gyártási/javítási útvonalra alkalmazd; a Studio nem kivétel a négylapos tanulási módszer alól.

## Magyar tipográfia — jóváhagyott korrekció (2026-09-10)

A közös módszer 2026-09-11-es kiegészítése is kötelező: tényleges PDF/DOCX szöveg, teljes-forrás összevetés, indokolt gépi besorolás; témához illő közös geometriai labor/döntési történet HTML-ben és Studio-ban; szerveren ellenőrzött első játékbónusz-válasz és visszatérés a leckéhez. A grafika és a szóbeli gyakorlat nem helyettesíti a forráshű tanítást vagy a tanári értékelést.

A korábbi Google Fonts / glyph-warmup előírást felváltja a `source/shared/lesson-typography.ts` szerződés. Kizárólag a repóban ellenőrzött Nunito, Source Sans 3, Source Serif 4 családok használhatók tananyagszöveghez; normál és dőlt fájlok a `source/client/public/fonts/` alatt. HTML-ben `/fonts/lesson-fonts.css`, külső font nélkül. Az ékezethelyességet a tényleges cmap és Chrome által használt font ellenőrzi, nem a fallback neve. A hibás Unicode-szöveget külön vizsgáld; ne állítsd, hogy betűcsere önmagában javítja.
