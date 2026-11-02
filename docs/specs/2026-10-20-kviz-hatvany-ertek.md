# Kvíz-kulcsellenőrzés: a hatványalak értéke (a „7²” nem 7)

Állapot: hibajavítás. A tulajdonos 2026-10-20-án élesítés utáni mérést és minden nyitott pont javítását kérte.

## Mérés (éles, 2026-10-20, „Kéttagú kifejezések négyzete – kifejezéskártyák”, job be3bd5d2)
- **Javítókörök:** a gyakorlóbank 6 hívásából 4 javítókör volt.
- **Okok:** ebből 2-t a kvíz `correctIndex`-gyorsellenőrzés okozott (b0-q8, b0-q11, s1-q32: „a correctIndex a(z) N opciót jelöli, a
  magyarázata viszont M értéket nevez helyesnek”).
- **A gyanú:** a hamis jelzés a négyzetre emelés témakörében.

## Gyökérok (fájl:sor, reprodukálva)
- **A hatványalak elvész:** `server/studio/experience-builder.ts` `quizCorrectIndexProblems` → `numbersOf` a `normalizeAnswer`-rel számol.
  Ez a felső indexes kitevőt (`²`, `³`) eldobja, így a „7²” → „7”.
- **Hamis jelzés:** a helyes 49-es opció magyarázata („(3 + 4)² = 7²”) így a 7-es (elfelejtett négyzetre emelés) disztraktort
  „nevezi helyesnek”.
- **Reprodukció:** `quizCorrectIndexProblems` a fenti tétellel hibát jelez; ha a magyarázatba bekerül a „= 49”, nem.

## Cél
- **A hatvány értéke számít:** a magyarázat számainak kigyűjtésekor a hatványalak (`a²`, `a³`, `a^n`; a számjegyes alap és a kitevő)
  az ÉRTÉKÉT adja (7² → 49), és nem az alapját (7).
- **A többi szám** változatlan.

## Nem-cél
- **A heurisztika többi szabálya** változatlan: csak egyszámos opciók, csak a helyes opció magyarázata.
- **A modell** és a lektor.

## Elfogadás (EARS)
- HA a helyes (49) opció magyarázata „(3 + 4)² = 7²”, AKKOR nincs jelzés.
- HA a helyes opció magyarázata valóban egy másik opció értékét mondja helyesnek (régi tesztek), AKKOR a jelzés megmarad.
