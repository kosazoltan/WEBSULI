# Arculati bank S4: feliratszótár és a `flair` kivezetése — terv

Előzmény: `docs/specs/2026-10-17-arculati-bank.md` 6. pont és S4 („feliratszótár és a `flair` kivezetése a gyártásból”).
Tulajdonosi indítás: 2026-10-18 („csináld meg”).

## Felmérés (kód + 6 éles lecke mentése, 1 298 opció-visszajelzés)
- **Ítélet-előtag a visszajelzésekben:** a visszajelzések kb. 66%-a ítélettel kezdődik („Nem helyes:” 458+45, „Helyes:” 286+23+18,
  „Igen,” 24 …). Az ítéletet a lejátszó a `correctIndex`-ből amúgy is tudja. A HTML-kvíz saját előtagot is tesz elé, így
  „Helyes. Helyes: …” jelenik meg (hiba).
- **Sablonos fejezetcímek:** a tervező prompt szó szerint diktálja („A leggyakoribb hibák”, „Ellenőrzés – hogyan légy biztos
  magadban?”, „A feladat megoldva lépésről lépésre”); a modell ezeket másolja.
- **Módszercímek:** a „Kapukérdés: …”, „Tévhit: …” előtag megismétli a kódból jövő címkét (`LABELS[kind]`).
- **`flair`:** a kód választja; a lejátszó 2026-10-16 óta nem jeleníti meg (halott adat és CSS).

## Döntés
1. **Ítélet a kódszótárból** (`shared/lesson-ui-text.ts`: `VERDICT_TEXT`):
   - a lejátszó az ítéletet a szótárból írja ki, a modell ítélet-előtagját megjelenítéskor levágja (`stripVerdictPrefix`);
   - a modell továbbra is írja az előtagot, mert a minőségellenőrző (`quizCorrectIndexProblems`) erre támaszkodik;
   - adatmódosítás nincs.
2. **Fejezetszerep-szótár** (`SECTION_ROLE_HEADING`: `mistakes | selfCheck | workedSolution`):
   - a tervező promptja és a lejátszó ugyanebből a szótárból veszi a címet (egy forrás);
   - a prompt szövege bájtra azonos marad, a szerepkészség-verziók nem változnak.
3. **Módszercímkék a szótárban** (`METHOD_LABEL`): a lejátszó a címből levágja a címkét ismétlő előtagot.
4. **`flair` kivezetése a gyártásból:**
   - az új és a javított lecke nem kap `flair`-t;
   - a séma `optional` marad, az olvasás türelmes marad (régi leckék);
   - a halott CSS kikerül.

## Nem-cél
- A tárolt leckék átírása.
- A minőségellenőrző gyengítése.
- A befagyasztott `websuli-runtime-2` csomag módosítása.

## Elfogadás (EARS)
- HA a tanuló választ, AKKOR a visszajelzés ítélete a szótár szövege, utána a modell indoklása előtag nélkül (dupla „Helyes” nincs).
- HA egy új lecke készül, AKKOR nincs `experience.flair`.
- A régi `flair`-es leckék hiba nélkül nyílnak meg.

## Pontosítás a review #285 alapján (dokumentált spec-változás)
- **Csak ítéletből álló visszajelzés** („Igen.”, „Nem.”, „Helyes.”): üres maradék, az ítéletet a kód adja — nincs „Helyes! Igen.”.
- **Előjel:** a számhoz tapadó mínusz nem elválasztó („Helyes:-3 …” → „-3 …”; „Nem -5, hanem -3.” változatlan).
- **Kis- és nagybetű:** levágás után csak prózai szó kap nagy kezdőbetűt (csupa kisbetűs, legalább 4 betűs szó vagy gyakori
  névelő / kötőszó, utána nincs egyenlőség- vagy műveleti jel); a jelölés változatlan („pH = 7”, „x = 2 esetén”).
- **Szerep-skill rövid alakjai:** a pedagógus szerep-skillje „a feladat megoldva”, „leggyakoribb hibák”, „Ellenőrzés” néven
  hivatkozik a sablonos fejezetekre; ezeket a lejátszó szerep-aliasként ismeri fel, és a szótár címét mutatja. A skill szövege
  bájtra marad (a módosítása a szerepkészség-verziót és a futó checkpointokat érvénytelenítené).
- **LS-2 próba:** a helyes válasz visszajelzése a szótár „Helyes!” ítélete, az indoklás (kloroplasztiszok) megmarad.
- **Éles ellenőrzés után (2026-10-18):** a lejátszó élesben „Még nem helyes. Nem így van. …” szöveget mutatott. Mérés: 7 898
  publikált visszajelzésből 4 884-ben vágódott az ítélet. Az ítélet-szótár bővült a „Nem jó”, „Nem így van”, „Ez téves”, „Hibás”
  és „Helytelen” nyitással (írásjellel), így 5 902-ben vágódik. A tartalmi „Hibás lépés:” és „Hibás számítás:” változatlan.
