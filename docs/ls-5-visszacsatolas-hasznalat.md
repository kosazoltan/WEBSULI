# LS-5 — Visszacsatolási kör: fogalmak, javítás, játék-kvíz export

**Mi változott (2026-09-05):** a leckék gyakorlatai eddig helyben
osztályoztak, és az eredmény eltűnt. Mostantól a hibák a fogalomhoz kötve
visszakerülnek hozzád — és ami gyenge, azt a Studio egy paranccsal újraíratja.

## Ami a gyereknek látszik

- **Fogalmankénti haladás.** Minden Próba-válasz a lecke fogalmához kötve
  rögzül (a `concept_results` tábla — ez a LS-3a óta létezik, mostantól
  használjuk). A gyerek élménye nem változik; a szülői összegző adata lett.
- **A játékokban hibázott fogalom is a fogalom.** Ha egy lecke check-blokkjait
  a játék-kvíz bankba exportálod, az elemek a fogalom-azonosítóval együtt
  kerülnek be — a játékbeli hibák így ugyanabba a fogalom-kosárba számítanak.

## Amit TE kapsz (Studio, admin)

- **`GET /api/studio/lessons/:id/concept-stats`** — fogalmankénti
  összesítés: hány válasz, hány jó, arány. (Szülői összegző adatforrása.)
- **`POST /api/studio/lessons/:id/fix-concept`** `{conceptId}` — a gyenge
  fogalom célzott újraírása a szerző-modellel. **Szigorú szerződés:** CSAK a
  célfogalmat fedő blokkok változhatnak; minden más mondat, cím és azonosító
  bájtra azonos marad; új fogalom nem születhet (D1). Ha a gép mégis
  túllépne, a kérés hibával tér vissza, és a lecke ÉRINTETLEN marad.
- **`POST /api/studio/lessons/:id/export-quiz`** `{gameId, topic?}` — a lecke
  check-blokkjai a játék-kvíz bankba, az első fedett fogalommal kötve.
  Fogalom nélküli check KIMARAD (a köthetetlen elem csendben nem kerül be).

## Működés közben

- A gyenge fogalom listáját a `weakConceptIds(agg, küszöb)` számolja; a
  küszöb és a minimális mérésszám a `server/rewards/aggregate.ts`-ben van
  egy helyen (jelenleg: küszöb 0,7, minimum 3 mérés — kevesebb mérésből nem
  csinálunk riasztást).
- A migráció: `0011_game_quiz_items_concept.sql` — új, opcionális
  `concept_id` oszlop a játék-kvíz bankon, a `km_concepts`-re mutató külső
  kulccsal. Additív: meglévő sort nem módosít, újrafuttatható.

## Amit MÉG nem tudsz

- A fix-concept és az export végpontnak nincs gombja az admin felületen — a
  Studio panel bővítése a következő UI-szelet dolga; a végpontok készen
  várnak.
- A szülői összegző oldala (ahol a concept-stats megjelenik) szintén későbbi
  felület; az adatforrás innentől adott.
