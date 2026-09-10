---
name: tananyag-keszito
description: Feltöltött forrásból vagy internetes keresésből készülő HTML és Studio JSON tananyagok közös fúziós módszere. Aktiválódjon tananyag készítése esetén.
---

# Tananyag készítése — fúzió 7.4

Először olvasd el a [közös, forrásalapú módszert](../../../docs/lesson-improvement.md), majd a feladathoz szükséges [v7.4 referenciarészeket](../../../docs/specs/tananyag-keszito-SKILL-v7_4.md). A referencia történeti; a közös fúziós szerződés pontosítja az értékelést, besorolást, bankokat és a két technikai formátumot.

## Kötelező menet

1. Olvasd a repo vezérlőfájljait; terv és külön AI-végrehajtási leírás előzze meg a kódot.
2. Azonosítsd a tényleges forrást és tartalomtípust. `contentType=lesson` esetén a `lessons.json` a tananyag; HTML-helyőrzőt tilos javítómodellnek küldeni. Feltöltött kép/PDF/szöveg vagy webes forrás azonosítását, bizonytalanságát és idézeteit őrizd meg.
3. A program a forrás tartalmából állapítja meg a tantárgyat és évfolyamot. A készítőtől ne kérj osztályt; a keresési korosztály csak támpont. Javítás nem írhatja felül a kurált besorolást.
4. Mindkét formátumban négy lap szükséges: teljes Tananyag, tízféle Módszer (legalább két kapu), 45/15 írásbeli-szóbeli feladat, 75/25 háromválaszos Kvíz. Nyelvleckénél szószedet és célnyelvi felolvasás. Kérdés kizárólag ténylegesen tanított tartalomból.
5. Studio esetén a hét részre bontott bankgyártót és a közös runtime-ot használd. HTML esetén a teljes közös promptot és az egyetlen JSON-bankot olvasó négylapos megjelenítést. Egyéni prompt nem helyettesítheti a módszerszerződést.
6. A meglévő jó tanítást és konkrét kidolgozott példákat őrizd meg. Ne tömöríts vázlattá és ne találj ki tartalmat a bankszámért. Célzott javításnál az idegen tanítási blokkok érintetlenek; a kapcsolódó bankok újraellenőrzendők.
7. Kötelező a séma-, forrás-, fedettség-, mintaválasz-, lektor- és csonkolásvizsgálat. Minden saját minta teljes pont, üres válasz nulla. Hiányos bank vagy blokkoló lektorhiba nem publikálható kész anyagként.
8. Valódi böngészőben próbáld ki mind a négy lapot, téves/részleges/helyes válaszokat, újrasorsolást és eredménymegőrzést. Ellenőrizd a változatos palettát, ékezeteket, ábrákat, átfedést, túlcsordulást, 44 px vezérlőket 320 px mobilon, álló/fekvő és asztali nézetben. A pontozás helyi heurisztika; ezt a tanuló is lássa.
9. Javítást külön jelöltként készíts. Alkalmazás előtt teljes mentés, előállapot-/forráshash és konkurens gyártás ellenőrzése; lecke+metaadat+kvízbank egy tranzakcióban; utána visszaolvasás. A visszaállítás sem írhat felül későbbi szerkesztést.
10. Külön jelentsd az elkészült jelöltet, ellenőrzött jelöltet, alkalmazott adatot és kiadott programkódot. Teszt nélkül nem írható PASS. Lokális fájlra valós abszolút hivatkozást adj; ne feltételezz `/mnt` útvonalat vagy nem elérhető megjelenítőeszközt.

A részletes méretkeretek, pontozás, hibakörök, publikus és tárolási szerződés a közös módszerben és az ott hivatkozott forráskódban van. Ezt a skillt az összes gyártási/javítási útvonalra alkalmazd; a Studio nem kivétel a négylapos tanulási módszer alól.

## Magyar tipográfia — jóváhagyott korrekció (2026-09-10)

A korábbi Google Fonts / glyph-warmup előírást felváltja a `source/shared/lesson-typography.ts` szerződés. Kizárólag a repóban ellenőrzött Nunito, Source Sans 3, Source Serif 4 családok használhatók tananyagszöveghez; normál és dőlt fájlok a `source/client/public/fonts/` alatt. HTML-ben `/fonts/lesson-fonts.css`, külső font nélkül. Az ékezethelyességet a tényleges cmap és Chrome által használt font ellenőrzi, nem a fallback neve. A hibás Unicode-szöveget külön vizsgáld; ne állítsd, hogy betűcsere önmagában javítja.
