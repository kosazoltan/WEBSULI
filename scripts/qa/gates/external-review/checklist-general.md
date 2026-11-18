# Kötelező ellenőrzőlista — általános (nem játék) PR

Minden pontnál: TELJESÜL / SÉRÜL (fájl:sor + forgatókönyv) / NEM ELLENŐRIZHETŐ a kapott anyagból.

1. Megfelelés: a diff a megadott spec MINDEN elfogadási pontját teljesíti-e; mi hiányzik, mi több (hatókörön kívüli változás).
2. Helyesség: határesetek (üres / null / nagyon nagy bemenet, ismétlés, párhuzamos kérés, újrapróbálás), hibaút.
3. Adatszerződés: kliens ↔ szerver ↔ `shared/` mezőnevek, típusok, formátumok; régi kliens / régi adat kompatibilitás.
4. Biztonság: jogosultság-ellenőrzés minden új végponton (névtelen? játékos? admin-engedélylista?); CSRF / origin; mellékhatás GET-en; bemenet-validáció; sebességkorlát.
5. Adatvédelem: token / titok / e-mail / személyes adat URL-ben, naplóban, hibaüzenetben, linkben; a repó nyilvános.
6. Regresszió: névtelen látogató, bejelentkezett felhasználó, régi anyag, Stúdió-lecke, e2e-mód.
7. Időzóna és dátumhatár (Europe/Budapest).
8. Migráció ↔ Drizzle-séma; visszafelé kompatibilis-e a telepítés alatt (régi kód + új séma).
9. Indítás / cron / leállítás; hosszú futás megszakadása telepítéskor.
10. Teljesítmény: kérésenkénti teljes beolvasás, N+1, gyorsítótár-méret és -érvénytelenítés, memória (512 MB-os példány).
11. Tesztek: gyengült / törölt / `skip`-elt teszt; forrásszöveget néző „teszt”; mit NEM bizonyítanak a tesztek.
12. Holt kód, soha nem hívott függvény, kikapcsolt flag mögött ragadt út.
