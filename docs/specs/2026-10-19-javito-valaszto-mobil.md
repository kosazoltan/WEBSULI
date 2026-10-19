# Tananyagjavító — a régebbi tananyagok is kiválaszthatók (mobilon is)

Állapot: tulajdonosi hibajelzés 2026-10-19 (telefon-képernyőkép, „4 osztályos angol” keresés):
> „A tananyag javítását nem tudom elvégezni, mobilon nem jelenik meg normálisan, kiválasztható módon a régebbi tananyag.”

## Probléma (mérve az éles `/api/html-files` listán: 214 anyag — 30 `lesson`, 183 `html`/`text/html`, 1 `pdf`)
- **A régi anyagok kimaradnak.** A `client/src/components/LessonRepairWorkbench.tsx` csak a `contentType === "lesson"` sorokat
  listázza. A 183 régi HTML-tananyag (köztük minden 4. osztályos angol) nem választható.
  - A szerver (`POST /api/admin/improve-material/:id`, `server/improveAsync.ts`) a HTML-anyagot is javítja (`html` mód).
- **A keresés csak a címben keres, szó szerint.** A „4 osztályos angol” egyetlen címre sem illik. Az évfolyam a `classroom`
  mezőben van, a cím pedig „4. osztály”, „English” stb. alakban írja.
- **Mobilon a választó mélyen lent van:** a hosszú skill-lista alatt, a billentyűzet és az alsó menü takarja.
- **A javító panel a HTML-jelöltet nem tudná alkalmazni:** az „Alkalmazás” gomb a lecke-javítás JSON-ját várja
  (`parseLessonRepair`).

## Cél
1. **Választható anyagok:** `lesson` és a régi HTML (`html`, `text/html`); a PDF nem.
   - Minden sor mutatja a típust („Lecke” / „Régi HTML”) és az évfolyamot.
2. **Keresés:** ékezet- és kisbetű-független, szavanként (minden szónak illeszkednie kell).
   - A szám az évfolyamra (`classroom`) vagy a cím önálló számára illik.
   - Az „osztályos” / „osztály” szó az évfolyam jelölése.
   - Kis szinonimaszótár: angol ↔ english, német ↔ german/deutsch, matek ↔ matematika/math.
3. **Mobil sorrend:** felül „1. Tananyag kiválasztása”, alatta a „2. A javítás iránya”, a tudás-kártya (lépések, szabályok,
   skillek) leghátul. Választás után a 2. lépés a látótérbe görget.
4. **Javító panel HTML-anyagra:** az „Alkalmazás” a kész, nem üres HTML-jelöltnél engedélyezett (a meglévő
   `/api/admin/improved-files/:id/apply` úton, mentéssel). A leckénél a mostani feltétel marad.

## Nem-cél
- Szerveroldali változás; a PDF javítása; a lecke-javítás folyamata.

## Elfogadás (EARS)
- **Keresés:** HA a lista régi HTML-anyagot tartalmaz 4. évfolyammal és „Angol” / „English” címmel, AKKOR a
  „4 osztályos angol” keresés listázza.
- **Választás mobilon:** HA a kiválasztás 390 px széles nézetben történik, AKKOR a sor kattintható, a 2. lépés megjelenik a
  „Régi HTML” anyagra is, és nincs vízszintes kilógás (390 és 1440 px).
- **HTML-jelölt:** HA a HTML-jelölt kész, AKKOR az „Alkalmazás” engedélyezett, és a megfelelő apply-végpontot hívja.
- **Lecke-jelölt:** HA a lecke-jelölt nem értelmezhető, AKKOR az „Alkalmazás” tiltott (változatlan).
