# Cél (tulajdonosi követelmény)

TGM S2b-1 (`docs/specs/2026-11-22-tgm-s2b1-dontesi-fa-kepes-kartya.md`): két új megjelenítő a forrás ábráihoz — elágazó döntési fa és
képes kártyák —, a `STUDIO_SOURCE_VISUALS` kapcsoló mögött (élesben KI). KI állapotban a gyártás kérései és a meglévő leckék megjelenítése
a főágéval azonosak maradjanak; a régi leckék olvashatók maradjanak.

Keress:
- sémaváltozást, amely régi tárolt leckét érvénytelenít, vagy KI állapotban megváltoztatja a modellkimenet elfogadását;
- megjelenítési hibát: átfedés, levágott szöveg, vízszintes görgetés 360×640, 844×390 és 1280×800 nézetben; a sötét / világos téma;
- akadálymentességi hibát (a fa bejárhatósága billentyűzettel, a kártyák alternatív szövege);
- XSS-t vagy tisztítatlan SVG / HTML beillesztést a modell által adott paraméterekből;
- osztálynév-ütközést a meglévő kártyákkal (a `.sv-pcard*` elkülönítése).

Hibát keress, ne megerősítést. A „Mit NEM vizsgáltam” szakasz kötelező.
