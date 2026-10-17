# Lecke megnyitása: egyetlen, sávszínű betöltés, és a mentéskor rögzített arculat — terv

**Tulajdonosi bejelentés (2026-10-17):** a pipeline-nal, illetve az egymodelles leckekészítővel készült leckék megnyitásakor
„valamit újragenerál”, és gyorsan eltűnik. A kérés: az elkészült lecke az új dizájn szerint, statikusan, az adatbázisból
jelenjen meg; ne számolódjon újra a felület, és ne kerüljenek elő régi dizájnelemek.

## Mérés (élesben, websuli.vip, 2026-10-17, csak olvasás)
A felvétel Playwright-tel készült, a DOM-változások és a hálózati kérések időbélyeggel naplózva, valamint sorozatkép a betöltés
alatt. A 4. osztályos „A víz körforgása” lecke, 390 px:

| idő | látvány | ok |
|---|---|---|
| 0–1,4 s | üres oldal | HTML + JS letöltés |
| 1,6 s | fehér „Betöltés…” | `Preview.tsx`: a `/api/config` **és** a `/api/html-files/:id` kérésre vár |
| 2,4 s | fehér „Lecke betöltése…” (másik szöveg, másik elrendezés) | `LessonView.tsx`: a `/api/lessons/by-file/:id` csak az anyag megérkezése **után** indul (vízesés) |
| 3,6 s | a lecke a sáv színeiben, de kép nélkül | a lejátszó ekkor **számolja ki** a képválasztást (`pickLessonArt`) |
| 5,0 s | a hős, a kabala és az ikon betöltődik | a képkérés csak a renderelés után indul |

Négy különböző képernyő követi egymást: fehér, fehér (más szöveg), színes kép nélkül, végül színes képpel. A szem ezt
„újragenerálásnak” látja.

Ellenőrzött, hogy **nincs** régi dizájnelem:
- négy pipeline-leckén (4., 5., 7. és 9. évfolyam) a betöltés után **0** futó animáció van, `data-flair` és vizuális világ
  nincs, és a téma a sávé (`adventure` / `studio` / `laboratory`);
- a lecke-JSON nem generálódik újra: egyetlen GET, MI-hívás nincs.

Egy sötétkék első képkockát a felvétel mutatott, de a forrása nem igazolt (az oldal HTML-jében és CSS-ében nincs ilyen háttér):
UNVERIFIED, nem része a javításnak.

## Gyökérok
0. **(A tulajdonos képernyőképe igazolta.)** Adminnak a betöltés alatt azonnal megjelenik a nyitott „Tananyag javítása” űrlap
   („A lecke és a gyakorlóbankok újragyártódnak…”). A betöltött lecke ezt lejjebb tolja. A látvány olyan, mintha a megnyitás
   javítást indítana, pedig nem fut semmi.
1. **Betöltési vízesés két külön töltőképernyővel:** a lecke kérése az anyag-metaadat után indul, és a config-kérésre is vár,
   pedig a leckéhez nem kell.
2. **Semleges (fehér) töltőképernyő:** a lecke sávja már az anyag-metaadatból (`classroom`) ismert, mégis fehér a háttér,
   majd hirtelen a sáv színére vált.
3. **A képválasztás megjelenítéskor számolódik**, nem mentéskor. A hős, a borító és a kabala a lejátszóban dől el minden
   megnyitáskor. Ez a tulajdonos szerint „újragenerálás”, és ellentmond az „adatbázisból olvassa ki” elvnek. Az ikon már
   mentéskor rögzül (#274).

## Cél
1. **Párhuzamos betöltés:** a `/api/lessons/by-file/:id` az anyag-metaadattal együtt indul. A főoldali listáról érkezve a lista
   már tudja a típust; ilyenkor előtöltés is van.
2. **Egyetlen töltőképernyő**, a sáv színeiben és a sávfejléc alakjában (váz), ha az évfolyam ismert. Csak egy szöveg látszik:
   „Lecke betöltése…”. A config-kérés nem tartja vissza a leckét.
3. **A teljes arculat mentéskor rögzül:** `art = { subjectIcon, picture, mascot }`, ugyanazzal a rotációval, mint ma.
   - A `picture` hős vagy borító azonosító; seed a lecke azonosítója.
   - Csak az adatbázisban (`design_assets`) létező azonosító kerülhet be.
   - A lejátszó a tárolt azonosítókat olvassa (`/api/design-assets/<id>`). Hibánál egyszer a katalógusképre vált.
   - Régi, `art` nélküli leckénél marad a mai számolás.
4. **A hős-kép előre töltődik** (`fetchpriority="high"`), a helye előre fenntartott: nincs ugrás.

## Nem-cél
- A lecke HTML-jének szerveroldali előrenderelése. A lejátszó interaktív (kvíz, feladatok, ismétlés), ezért a JSON → saját
  futtató marad.
- A régi leckék `art` mezőjének pótlása (backfill): éles adatváltozás, külön tulajdonosi engedéllyel.
- A régi HTML-anyagok (iframe) megjelenítése.

## Szélső esetek
- **Nem lecke típusú anyag** (HTML/PDF): az előtöltés csak akkor indul, ha a típus „lesson”, vagy a típus még ismeretlen.
  Közvetlen link esetén a `by-file` 404-et ad; ez nem hiba, és nem jelenik meg.
- **A tárolt kép időközben törölve:** a `/api/design-assets` 404-et ad, a lejátszó egyszer a katalógus-választásra vált.
- **Az évfolyam a mentés óta megváltozott:** a más sávú tárolt képet a lejátszó nem használja (mint az ikonnál).
- **A pontozó-verzió kapuja (409):** változatlan; a töltőképernyő után a mai hibaüzenet jelenik meg.

## Elfogadás (EARS)
- HA egy lecke megnyílik, AKKOR legfeljebb egy töltőképernyő látszik, és ismert évfolyamnál annak háttere a sáv felülete.
- HA az anyag-metaadat és a lecke kérése fut, AKKOR a kettő párhuzamosan indul. A Playwright-mérés szerint a `by-file`
  kérés nem az anyag válasza után indul.
- HA egy leckét a leckekészítő ment, AKKOR a JSON `art` mezője tartalmazza a sáv ikonját, a választott képet és (1–5.
  évfolyamon) a kabalát. Mindegyik létező `design_assets` azonosító.
- HA a leckének van tárolt `art`-ja, AKKOR a lejátszó nem számol képválasztást, hanem a tároltat tölti be.
- A reszponzív eszközmátrix (8 méret × 5 sáv) zöld marad.
