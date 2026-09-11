# Végrehajtás

1. Olvasd az éles futást és mentett tanítást a meglévő readback segéddel. Izolált, legfeljebb két modellhívásos próba a jelenlegi banképítővel; mentsd a válasz JSON-ját helyben, a naplóba csak méret, darabszám, idő, token és lezárási ok kerülhet.
2. A bizonyított eltérés alapján javítsd az `experience-builder.ts` csomagkérését és célzott javítását. A kész bankok sémája és tartalmi követelménye változatlan. Adj regressziós tesztet a ténylegesen kapott hibaalakra.
3. Futtasd: `node --import tsx --test tests/lesson-experience.test.ts tests/lesson-pipeline-runner.test.ts`. Elvárt: minden teszt PASS; a hibás/csonka/rossz fogalmú csomag elutasítva marad.
4. Futtasd az izolált növényes bankgyártást az új kóddal; mérd a teljes bank darabszámait és kapuit. Rögzítsd a gyökérokot és eredményt a specben/közös módszerben.
5. `npm.cmd run verify`, célzott Chrome böngészőpróba, diff önellenőrzés. Mentés után feature branch → PR → zöld CI → merge → mindkét éles verzió visszaolvasása.
6. A már feltöltött eredeti forrást a bejelentkezett admin felületéről indítsd újra. Kövesd a futást a tényleges közzétett lecke linkjéig. Olvasd vissza a teljes adatot, futtasd a forrás-/séma-/pontozáskapukat és Chrome négy-lapos mobil/asztali próbát. Csak futtatott eredményt jelents késznek.
