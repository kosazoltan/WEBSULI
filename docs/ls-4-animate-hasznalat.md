# LS-4 — Animáció, gyakorlat, hang és a maradék két játék: így fogod használni

**Mi változott (2026-09-05):** a leckék eddig a „következő szakasz" feliratot
mutatták ott, ahol animáció vagy gyakorlat lett volna. Ez a szelet elkészíti
mindet, plusz a lecke-oldal biztonsági fejlécét, a felolvasást és a Space +
BlockCraft játékok kupon-óráját.

## Ami a gyereknek látszik

- **8 animációfajta** a leckékben: számegyenes, tört, idővonal, alakzat,
  folyamatábra, térkép, szóépítés, mondatrészek. A gép (az „animátor" lépés)
  szúrja be őket a kész leckébe — és **csak animációt tehet hozzá**: minden más
  mondat bájtra ugyanaz marad, új fogalom nem születhet (D1). Ha a gép mégis
  hozzányúlna valamihez, a gépsor hibára fut, és a lecke érintetlen marad.
- **3 gyakorlatfajta:** sorba rendezés (44 px-es gombokkal, ujjbarát), hiányos
  mondat kitöltése, párosítás. Mindegyik azonnal osztályoz, magyarázattal.
- **Felolvasás gomb** a magyarázó blokkokon — csak ott, ahol a lecke kéri
  (`readAloud`), csak kattintásra indul (a böngésző ezt követeli meg), és
  csökkentett-mozgás beállításnál el sem jelenik.
- **Csökkentett mozgás:** aki ezt kéri a gépén, annak az animációk statikus
  képet mutatnak — ugyanaz a tartalom, mozgás nélkül.
- **Space és BlockCraft** mostantól ugyanazt a kupon-órát használja, mint a
  Tsunami és a BrainRot: a leckében szerzett játékidő itt is ketyeg, és a HUD
  mutatja. Kupon nélkül minden pont úgy működik, mint eddig — a szabad játék
  az alap.

## Ami a motorháztető alatt történik (és neked fontos)

- **Szigorú CSP a lecke-oldalon.** A `/lesson/*` válaszok fejlécében a
  script-szabály mostantól `'self'`-re szűkül — nincs inline script, nincs
  eval. Ez fejléc-szinten mondja ki azt, amit a LS-2 óta a szerkezet:
  **a lecke adat, nem program.** (Az örökölt, feltöltött HTML-anyagok profilja
  változatlan; azok inline kódja a régi anyagok sajátja.)
  Megjegyzés: emiatt a lecke-oldalakon a JSON-LD strukturáltadat-blokk nem fut
  — a funkciót nem érinti, a kereső-metaadatot igen; ha kell, nonce-csel
  visszahozható.
- **Az animátor a gépsorban** a szerző után, a lektor előtt fut (master plan
  §6). Modellje: `qwen/qwen3.8-flash`, a promptja a `system_prompts` táblában
  (`studio.animator.v1`) módosítható telepítés nélkül.

## Amit MÉG nem tudsz

- A gyakorlatok eredménye egyelőre helyben osztályoz — a fogalmankénti
  összesítés és a „javítsd ezt a fogalmat" a LS-5 visszacsatolási szeletben jön.
- A Space/BlockCraft kupon-órája a leckéből hozott kuponra vonatkozik; új
  játéktípus vagy jutalom-szabály nem került be.
