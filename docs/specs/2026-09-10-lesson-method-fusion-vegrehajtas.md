# AI-végrehajtás: tananyagmódszer-fúzió

Spec: `2026-09-10-lesson-method-fusion.md`. Sorrend: ez a terv és végrehajtás kész; most implementálj.

1. A megadott v7.4 skill és a jelenlegi pipeline olvasása alapján őrizd meg a strukturált leckét; additív, opcionális experience séma biztosítsa a régi JSON kompatibilitását. Új gyártásnál kötelező verziójelölés és kapu kell.
2. Előbb tiszta közös séma, értékelő, módszerkontraktus és tesztek. Ezután külön builder: methods, 3×15 tasks, 3×25 quiz. Minden kör pontos séma; hibára egy konkrét javító kör; részeredmény hash-hez kötött mentése. A lektor az összefűzött teljes eredményt vizsgálja.
3. Auditált React felület: négy fül, hozzáférhető vezérlés, érintéses/kattintásos módszerek; 15/25 tételes kör, visszajelzés és export. A szerveroldali kuponpontozás ne változzon.
4. Kösd a közös módszert minden generáló rendszerprompt végére. A HTML-korlátokat a mért teljes terjedelemhez igazítsd, a csonka eredményt ne mentsd késznek. A strukturált javítás a lecke JSON-t és fogalomtérképet használja, külön jelöltet ad; alkalmazáskor backup + konkurenciavédelem + lecke és kvíz együtt változik.
5. Frissítsd a repó módszertani dokumentációját és a két skill Studio-kivételét. Az önálló HTML technikai követelményeit ne kényszerítsd React-forráskódra; a pedagógiai funkciókat mindkettőnek teljesítenie kell.
6. Célzott tesztek, Chrome mobil álló/fekvő/asztali megjelenítés, valódi modellből lokális jelölt, majd teljes verify és diff-review. Ne módosíts éles tananyagot, ne keverd a folyamatban lévő domainhiba javításával, ne nyúlj más untracked fájlhoz.
