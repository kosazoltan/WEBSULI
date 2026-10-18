# Gyakorlóbank: az üres választható lista nem buktathatja a gyártást — terv

**Tulajdonosi jelzés (2026-10-18, képernyőkép):** a tananyagkészítés „Tartalmi lektorálás” lépésnél megállt: „A 3. fejezet
bankcsomagja a javító kör után sem megfelelő: [{ "code": "too_small", … "path": ["tasks", 0, "typedAnswers"] }, … "requiredDistinct"
…]”. Kérés: „Keresd meg a gyökérokot, és tégy róla, hogy a továbbiakban rendesen tudjon lefutni a tananyagkészítés.”

## Gyökérok (kódból és élő adatból)
- **A modell válasza:** a nem számolós feladatnál a `typedAnswers` és a `requiredDistinct` értékét üres listaként (`[]`) adta, nem
  `null`-ként vagy elhagyva.
- **A helyi séma:** a `shared/lesson-experience.ts` és a `server/studio/bank-schema.ts` mindkét mezőnél `min(1)` elemet kér, ha a
  mező jelen van, ezért a `[]` sémahiba.
- **A szigorú kimenet:** a szolgáltatói strukturált kimenet (és a tartalék JSON-mód) az elemszám-minimumot nem kényszeríti ki, ezért
  a modell a javító körben is `[]`-t adott. A futás így megállt.
- **A normalizálás:** a `normalizeStrictPacket` csak a `null`-t alakította „hiányzó” mezővé, az üres listát nem.
- **Előfordulás:** az elmúlt 30 nap éles `studio_jobs` hibái között ez az első ilyen eset (2026-10-18 10:27); a korábbi bankhibák más
  okúak.

## Döntés
- **Szemantika:** a választható (nullable) lista-mezőknél az üres lista ugyanazt jelenti, mint a hiány („ennél a feladatnál nincs
  típusos válasz / kategória”).
- **Normalizálás két helyen:**
  - `normalizeStrictPacket`: minden modellválaszon;
  - `autofixBankPacket`: a mentett és gyorsítótárból visszatöltött csomagokon is, javítási bejegyzéssel.
- **Mezők:** `tasks[].typedAnswers`, `tasks[].requiredDistinct`, `methods[].options`, `methods[].steps`.
- **Változatlan:** a kötelező listák (pl. `required`, `coversConceptIds`, a kvíz `options`) ürességét továbbra is a séma utasítja
  el (az valódi hiba).

## Elfogadás (EARS)
- HA a modell a fenti mezők valamelyikét üres listaként adja, AKKOR a csomag a séma szerint érvényes (a mező hiányzónak számít), és
  a gyártás továbbmegy.
- HA egy kötelező lista üres, AKKOR továbbra is sémahiba.
