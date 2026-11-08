# Spec: Tantárgyhoz illő nyitókép (híd helyett), a néma borítóhiba feltárása, tartalom szerinti blokkcímkék

> Dátum: 2026-11-08 · Szerző: Claude (Opus 5.5) · Állapot: **JÓVÁHAGYVA (tulajdonosi utasítás, 2026-11-08)**
> Végrehajtás: `docs/specs/2026-11-08-borito-blokkcimkek-vegrehajtas.md` · Kanban: #7

## 0. Kérés (tulajdonos, 2026-11-08, összefoglalva)
1. A legutóbb elkészült 9. osztályos biológialecke („Harasztok, nyitvatermők és zárvatermők”) nyitóképe megint a **híd** lett.
   Megbeszéltük, hogy **tantárgyanként** legyen nyitókép: a híd a földrajzhoz rendben van, a biológiához nem.
2. A blokkok kártyacíme mindig ugyanaz: a képeknél „Mozgókép”, a célnál, a mesénél és a magyarázatnál is „Magyarázat”.
   Legyen változatosabb, mindig a **tartalom** alapján.

## 1. Mért tények (2026-11-08)
- A 9–10. évfolyam sávja `laboratory` (`shared/lesson-design.ts` `designThemeForClassroom`); a sáv tartalék hős-képe a
  `hero-laboratory`, amelynek leírása: „Függőhíd naplementében…” (`shared/design-asset-catalog.ts`).
- `pickLessonArt` (`shared/design-assets.ts:79-118`): saját leckeborító → témaköri borító → kulcsszavas borító → **a sáv hőse**
  (a tantárgytól függetlenül). Ezért kap minden saját borító nélküli 9–10. osztályos lecke hidat.
- A `resolveStoredArt` / `pictureFits` (`:68-77`, `:132-153`) a tárolt hőst elfogadja, ha a sávja egyezik — a mentéskor
  választott híd így megmarad.
- Az új leckék automatikus, tartalomhoz illő borítója (`server/lesson-covers.ts`, spec `2026-11-03-leckeborito-auto`) élesben
  ma sorra bukott: Render-napló 15:42 „0 kész, 4 sikertelen”, 16:30 „0 kész, 1 sikertelen”, figyelmeztetés nélkül, ~6 s alatt
  (képgenerálás nélkül). Az egyetlen néma ág: a képterv-válaszból nem olvasható ki jelenet (`makeCover`, `:97-99`); a
  `max_tokens: 400` (`:117`) mellett a válasz csonkolódhat. A pontos ok a naplóból nem állapítható meg — UNVERIFIED.
- A katalógus sávonkénti, tantárgyi (nem témaköri) borítói: `cover-terkep` (laboratory, földrajz), `cover-sejt` (laboratory,
  biológia), `cover-gorog-drama` (laboratory, irodalom); témaköri borító a `laboratory` sávban 47.
- A lejátszó blokkfejléce típusonként rögzített (`client/src/lesson-runtime/LessonRuntime.tsx:107, 138, 198, 264, 306, 310`):
  explain → a sáv „Magyarázat” címkéje, animate → „Mozgókép”, try → „Próbáld ki”.

## 2. Cél
1. Saját (gyártott vagy katalógusos) borító híján a lecke **a saját tantárgyának** borítóját kapja a sávban; a sáv hőse (híd) csak
   akkor, ha a tantárgynak a sávban nincs borítója. A mentett hídkép is lecserélődik a megjelenítésben, ha van tantárgyi borító.
2. Az automatikus borítókészítés néma bukása **naplózott** legyen (ok, `finish_reason`, a válasz hossza), és a képterv válaszkerete
   ne csonkolja a választ.
3. A blokkfejléc a **tartalomból** származzon: Célkártya → „A lecke célja”, a mögötte álló mini mese → „Történet” (1–4. évfolyam:
   „Mese”), explain `why` → „Miért?”, `deeper` → „Mélyebben”; animate az ábra fajtája szerint (pl. „Körforgás”, „Diagram”,
   „Idővonal”, „Számegyenes”, „Térkép”, „3D-modell”); try a feladat fajtája szerint („Rendezd sorba”, „Egészítsd ki”, „Párosítsd”).

## 3. Nem cél
- A katalógus bővítése új tantárgyi borítókkal (képgyártás); a meglévő leckék adatbázisbeli `art` mezőjének átírása.
- A borítógyártás modelljének, költségének, plafonjának módosítása.
- A Stúdió vázlatnézetének címkéi (`OutlineReview.tsx`).

## 4. Döntések
- Tantárgyi tartalék sorrend: (a) a sáv azonos tantárgyú, nem témaköri borítója; (b) a sáv azonos tantárgyú témaköri borítója;
  (c) a sáv hőse. Választás a lecke seedjével (determinisztikus). A tantárgy-egyezés a meglévő `subjectHit` szabály.
- A tárolt hős akkor nem illik (`pictureFits` → false, friss választás), ha a sávban van az (a) vagy (b) szerinti tantárgyi borító.
- A blokkcímke tiszta függvény: `shared/lesson-block-label.ts` `blockLabel(blocks, index, sectionIdx, band)`; a Célkártya felismerése
  az első bekezdés vezető célcímkéjéről (a `lesson-opener.ts` címkéi), a mese az 1. fejezet Célkártyát követő `explain` blokkja.
- A sáv-címkék (`BAND_THEME.labels`) az alapértelmezettek maradnak minden más esetben.

## 5. Edge case-ek
- Tantárgy nélküli vagy ismeretlen tantárgy: (c) a sáv hőse (változatlan).
- A kulcsszavas / témaköri / saját borító továbbra is elsőbbséget élvez (változatlan).
- `explain` `why` / `deeper` és a fejléc: ha a fejléc már „Miért?” / „Mélyebben”, a külön mélységjelző chip nem ismétlődik.
- Ismeretlen `animKind`: „Ábra”; ismeretlen `tryKind`: „Próbáld ki”.
- A Célkártya nélküli (régi) lecke első `explain` blokkja „Magyarázat” marad.

## 6. Elfogadás (EARS)
- [ ] A1: WHEN egy `laboratory` sávú biológialecke nem kap saját / témaköri / kulcsszavas borítót THEN a `pickLessonArt` SHALL
  biológiai sávborítót adjon, nem a `hero-laboratory`-t. Mérés: új teszt.
- [ ] A2: WHEN a tárolt kép `hero-laboratory` és a lecke tantárgyának van `laboratory` borítója THEN a `resolveStoredArt` SHALL `null`-t
  adjon (friss választás). Matematikalecke (nincs `laboratory` matekborító) esetén a hős marad. Mérés: új teszt + a meglévő
  `stored-art.test.ts:63` és `design-assets.test.ts:153` (matematika) változatlanul zöld.
- [ ] A3: WHEN a képterv-válaszból nem olvasható ki jelenet THEN a `makeCover` SHALL figyelmeztetést naplózzon (a válasz hossza, a
  `finish_reason`), és a képterv `max_tokens` értéke SHALL legalább 1200 legyen. Mérés: új teszt (hamis `chat`).
- [ ] A4: WHEN a `blockLabel` Célkártyát, mesét, `why`/`deeper` magyarázatot, ismert `animKind`/`tryKind`-ot kap THEN a 2. cél
  szerinti címkét SHALL adja; egyébként a sáv címkéjét. Mérés: új teszt.
- [ ] A5: WHEN a lejátszó egy Célkártyás leckét mutat THEN a fejlécek „A lecke célja” és „Történet”, az ábráké a fajtájuk szerinti.
  Mérés: valós böngészős render (helyi fejlesztői szerver), képernyőkép.
- [ ] A6: `npm run check`, `lint`, `check:test`, `npm test` hibátlan.

## 7. Kockázat / visszavonás
- A friss tantárgyi választás a megjelenített képet változtatja a meglévő 9–12. osztályos leckéken is (szándékos). Revert visszaállít.
- A borító-naplózás csak naplót ad; a `max_tokens` emelése legfeljebb pár tized centes többletköltség képtervenként.
