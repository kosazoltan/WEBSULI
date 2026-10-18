# Pontos évfolyam a lecke fejlécében — terv

**Tulajdonosi kérés (2026-10-18):** „a tananyagoknál nem a pontos osztályt jelölöd, hanem így: egy-kettő, három-négy, öt-hat.
Pontos osztály kell a fejlécekbe mindenhova, mert a tanulót össze fogod zavarni.”

## Felmérés (kódból)
- **`client/src/lesson-runtime/LessonRuntime.tsx`:** a lecke sávfejléce (`ws-grade`) a `DESIGN_THEMES[sáv].grades` tartományt
  írja ki (pl. „5–6. osztály”). A sáv csak a színvilágot és a betűtípust választja ki.
- **`client/src/components/studio/LessonArtSummary.tsx`:** az admin arculat-összefoglaló ugyanígy a tartományt írja.
- **A nyilvános lista kártyái és a lecke chipje** (`{lesson.classroom}. osztály`) már a pontos évfolyamot mutatják.

## Döntés
- Mindkét helyen a lecke pontos évfolyama jelenik meg: `getClassroomLabel(classroom)`, a 0. évfolyam „Programozási
  alapismeretek”.
- A sáv neve és mottója marad (arculat), de évfolyam-tartomány nem jelenik meg felirataként.

## Nem-cél
- A sávok (színvilág) átalakítása.
- A témaköri képek akadálymentes leírásának (alt) átírása az eszközkatalógusban: ezek sávonként közös képek, nem fejlécek.

## Elfogadás (EARS)
- HA egy 5. évfolyamos lecke nyílik meg, AKKOR a sávfejléc „5. osztály”-t ír, és nem „5–6.”-ot; minden évfolyamra a sajátját.
- HA az admin megnyitja az arculat-összefoglalót, AKKOR a lecke pontos évfolyama látszik.
