# Adminfelületek reszponzivitás-revíziója — Honor Magic V6 külső és belső kijelző

Állapot: tulajdonosi kérés 2026-10-19.
> „A tananyaggyártás adminfelületeit mindet nézd át! … Honor Magic V6 … külső és széthajtott belső kijelzőin is megfelelően
> jelenjen meg, mivel nagyon sokszor lecsúsznak a gombok. A sima HTML-feltöltés gomb lecsúszik, amikor betöltöm az anyagot.
> A tananyag újragyártása gomb lecsúszik. … Készíts egy teljes revíziót.”

## Eszköz
Honor Magic V6:
- **Belső kijelző:** 7,95″, 2172 × 2352 px.
- **Külső kijelző:** 6,52″, 1080 × 2420 px.

Mérési nézetek (CSS-px, a böngésző sávjai nélkül):

| Név | Méret | Mit modellez |
|---|---|---|
| `magicv6-kulso` | 393 × 780 | külső kijelző |
| `magicv6-kulso-nagybetu` | 360 × 700 | nagyobb rendszer-betűméret |
| `magicv6-belso` | 835 × 810 | széthajtva, álló |
| `magicv6-belso-fekvo` | 904 × 740 | széthajtva, fekvő |
| `magicv6-kulso-billentyuzet` | 393 × 450 | nyitott billentyűzet szövegbevitelnél |

1024 px alatt az admin mobil elrendezést használ (`useIsMobile`), így **mindkét kijelzőn** látszik a fix, 64 px-es alsó menü
(`MobileBottomNav`).

## Módszer
Valódi render: vite + `VITE_ENABLE_RUNTIME_PROBE`, az `/admin?tab=…` oldal ál-adattal, admin szereppel.
- **Mérő:** `tests/admin-responsive-helpers.ts`.
  - Minden látható gombot és mezőt azonnali görgetéssel a nézet közepére hoz.
  - Ellenőrzi, hogy teljesen a nézetben van-e, és hogy a közepén ő van-e legfelül (`elementFromPoint`), vagyis nem takarja
    az alsó menü vagy más réteg.
  - Ellenőrzi a vízszintes kilógást.
- **Lefedett fülek:** 11, a teljes tananyaggyártási út (Fájlok, Készítés, Futások, Tananyagjavító, Okosítás, Javítási mentések,
  PDF, Címkék, Tanulók, Mentés, Adatbázis).
- **Lefedett folyamatok:**
  - HTML-feltöltés betöltött fájllal;
  - Tananyagjavító választás után;
  - fájlszerkesztő ablak;
  - internetes készítés panelje.
- **Leltár:** minden admin-felület fájl:sor bizonyítékkal (az alábbi táblázat).

## Mért gyökérokok
1. **Belső kijelzőn az alsó menü helyfoglalása elvész.**
   - `client/src/pages/admin.tsx:644`: `py-1.5 sm:py-2 … pb-20`.
   - A 640 px fölötti `sm:py-2` felülírja a `pb-20`-at, ezért az alsó tartalék 8 px.
   - Mért (835 × 810, Mentés fül, legalsó görgetés): az utolsó gomb a 733–777 px-sávban, a menü 745 px-től lefelé — takarva.
     Ugyanez az Okosítás „Alkalmaz” / „Törlés” gombjánál.
   - A külső kijelzőn (< 640 px) nem jön elő, ezért csak széthajtva „csúsznak le” a gombok.
2. **A felugró ablakok közös alapja nem görget.**
   - `ui/dialog.tsx:41` és `ui/alert-dialog.tsx:37`: középre igazított, `fixed`, magasságkorlát és görgetés nélkül.
   - A kijelzőnél magasabb ablak teteje és alja (a gombok) kilóg, és nem érhető el.
   - `ui/sheet.tsx`: az alsó vagy felső lap is korlát nélküli.
3. **A sima HTML-feltöltés fix, `100vh` magasságú.**
   - `SimpleHtmlUpload.tsx:117`: `h-[calc(100vh-8rem)] sm:h-[calc(100vh-5.5rem)]`, belül nem görgető flex-oszlop.
   - Mobilon a `100vh` a nagy nézet (a böngészősáv nélküli), így az aljára tett „Feltöltés” sor a menü mögé vagy a látható részen
     túlra kerül.
   - Fájlbetöltés után a szövegmező megtelik; ezt húzva a mező görög, nem az oldal, ezért a gombhoz nem lehet odagörgetni.
4. **Fix pixelmagasságok 780–810 px magas kijelzőn:**
   - `MaterialImprover` 600 px-es előnézet / iframe (`:664`, `:675`, `:708`, `:719`, `:727`, `:736`);
   - `WebResearchAgentPanel` 480 px-es csevegő (`:244`) és 320 px-es előnézet (`:304`);
   - `MaterialImprovementBackups` 400 px (`:270`).
   - Az utánuk álló gombokhoz egy érintésre görgető iframe-en kell átjutni.
5. **A fájlszerkesztő ablak nincs portálban.**
   - `FileEditDialog.tsx:69`: `fixed inset-0 z-50` az admin konténeren belül.
   - Az alsó menü (szintén `z-50`, később a DOM-ban) rárajzol az ablak aljára.
   - `max-h-[95vh]` (`vh`, nem `dvh`).
6. **Az alsó menü nem számol a rendszer gesztussávjával** (`env(safe-area-inset-bottom)`).

## Leltár (kockázat szerint; fájl:sor)

| # | Felület | Elérés | Kockázat | Bizonyíték | Javítás |
|---|---|---|---|---|---|
| 1 | Sima HTML-feltöltés (`SimpleHtmlUpload`) | Tananyagok › Fájlok › „Új” | MAGAS | :117 100vh fix, :245 akciósor, :239 szövegmező | 3. pont |
| 2 | Régi anyag okosítása (`MaterialImprover`) | Készítés › Okosítás | MAGAS | 600 px fix (:664…:736); 70% zoom (:470, tulajdonosi #173); nem törő sorok (:573, :629) | 4. pont, sortörés |
| 3 | Internetes készítés (`WebResearchAgentPanel`) | Készítés › Tananyag készítése | KÖZEPES–MAGAS | :244 480 px, :304 320 px | 4. pont |
| 4 | Fájlszerkesztő (`FileEditDialog`) | Fájlkártya ceruza | KÖZEPES | :69 nem portál, z-50; :70 95vh | 5. pont |
| 5 | Tananyagjavító (`LessonRepairPanel` / `-Workbench`) | Készítés › Tananyagjavító | KÖZEPES | a „Javítás indítása” a hajtás alatt; csak a lap alja véd | 1. pont (alsó tartalék) |
| 6 | Fájllista (`AdminFileDashboard`, `FileCard`) | Tananyagok › Fájlok | KÖZEPES (érintés) | 24–28 px-es ikongombok (:485, `FileCard`:145) | megjegyzés (külön döntés) |
| 7 | E-mail küldés (`EmailSendDialog`) | Fájlkártya | ALACSONY–KÖZEPES | :175 80vh, görgető törzs | 2. pont alap |
| 8 | Piszkozatok (`DraftLessons`) | Tananyagok › Fájlok | ALACSONY | sorok törnek, ≥ 44 px | — |
| 9 | Stúdió, forrásfeltöltés (`LessonStudioPanel`, `SourceUploadForm`, …) | Készítés › Tananyag készítése | ALACSONY | `KnowledgeMapEditor.tsx:138` nem törő sor | sortörés |
| 10 | Javítási mentések (`MaterialImprovementBackups`) | Rendszer › Javítási mentések | ALACSONY–KÖZEPES | :270 400 px; :238 nem törő fejléc | 4. pont, sortörés |
| 11 | PDF-feltöltés (`PdfUpload`) | Tananyagok › PDF | ALACSONY | :275 nem törő sor | sortörés |
| 12 | Futások (`WorkflowMonitor`) | Készítés › Futások | ALACSONY | saját `pb-24` | — |
| 13 | Tanulók (`LearnersPanel`) | Tanulók | ALACSONY | :82 nem törő gombsor | sortörés |
| 14 | Rendszer-fülek, AlertDialogok | Rendszer | ALACSONY | alap AlertDialog korlát nélkül | 2. pont alap |

Megjegyzés:
- **Okosító panel:** a 70%-os nagyítás tulajdonosi döntés (#173), ezért nem módosul. Mobilon az érintési célok így kb.
  22 px-esek (a 44 px-es ajánlás alatt). Javaslat: a nagyítás csak 1024 px fölött; ez külön döntés.
- **Fájllista ikongombjai** (24–28 px): javasolt nagyobb érintési célt adni nekik, ez is külön döntés.

## Cél (javítások)
1. **Alsó tartalék:**
   - Az admin konténer mobil elrendezésben minden szélességen `pb-[calc(5rem+env(safe-area-inset-bottom))]`, a felső
     kitöltés külön (`pt-1.5 sm:pt-2`).
   - Az alsó menü: `pb-[env(safe-area-inset-bottom)]`.
   - Az alsó menü lapja: `max-h-[80dvh] overflow-y-auto`.
2. **Közös ablakalapok:**
   - `DialogContent`, `AlertDialogContent`: `max-h-[calc(100dvh-2rem)] overflow-y-auto` és `w-[calc(100%-1rem)]`.
   - `Sheet` alsó és felső változata: `max-h-[85dvh] overflow-y-auto`, a bal és a jobb: `overflow-y-auto`.
3. **HTML-feltöltés:**
   - Fix magasság helyett természetes oldalfolyam.
   - A szövegmező `h-[38dvh] min-h-[160px]` (görgethető, de nem tölti ki a képernyőt).
   - Az akciósor `sticky` az alsó menü fölött (`bottom-[calc(4.5rem+env(safe-area-inset-bottom))]`, `lg:bottom-0`), teli
     háttérrel.
4. **Fix magasságok:** `min(<régi>px, <arány>dvh)`.
   - Okosítás előnézet: `min(600px,60dvh)`.
   - Csevegő: `min(480px,62dvh)`.
   - Webes előnézet: `min(320px,40dvh)`.
   - Mentés-előnézet: `min(400px,50dvh)`.
5. **Fájlszerkesztő:** `z-[60]` (az alsó menü fölött), `max-h-[calc(100dvh-1rem)]`.
6. **Sortörés:** a felsorolt, nem törő gombsorok `flex-wrap`-et kapnak.

## Nem-cél
- Az okosító 70%-os nagyítása, a fájllista ikongomb-mérete (tulajdonosi döntés kell).
- A tanulói lecke-lejátszó: külön eszközmátrix-teszt fedi (`tests/lesson-responsive.spec.ts`).

## Elfogadás (EARS)
- **Fülek:** HA a 11 fül bármelyike megnyílik a négy Magic V6-nézet egyikén, AKKOR minden látható gomb és mező a nézetbe
  görgethető, teljesen látszik, nem takarja az alsó menü, és nincs vízszintes kilógás.
- **HTML-feltöltés:** HA a HTML-feltöltésben egy nagy (≥ 200 kB) fájl betöltődött, AKKOR a „Feltöltés” és a „Mégse” gomb mind
  az öt nézetben (a billentyűzetes 393 × 450-et is) elérhető és kattintható.
- **Tananyagjavító:** HA a Tananyagjavítóban egy lecke ki van választva, AKKOR a „Javítás indítása” elérhető.
- **Fájlszerkesztő:** HA a fájlszerkesztő nyitva van, AKKOR a „Mentés” elérhető, nem takarja az alsó menü.
- **Felugró ablakok:** HA egy felugró ablak tartalma magasabb a kijelzőnél, AKKOR az ablak belül görget, és az alsó gombja
  elérhető.
