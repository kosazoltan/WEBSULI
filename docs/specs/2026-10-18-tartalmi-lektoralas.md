# Tömeges tartalmi lektorálás a 2026. szeptember végéig készült tananyagokon — terv

**Tulajdonosi kérés (2026-10-18):** „Keress olcsó ügynököket, minden tananyagra engedd rá, és ellenőrizd a tananyagok tartalmát és
javítsd őket. Nem kell a kinézetet … tartalmi lektorálást végezz a 2026. 9. hónapig készült tananyagokban.”

**Tulajdonosi döntések (2026-10-18):**
- **Alkalmazás:** „Ellenőrzött javítás automatikusan”. Olcsó modell keres, erős modell csak a talált hibákat ellenőrzi; a
  megerősített javítás mentés után automatikusan bekerül, és visszaállítható.
- **Keret:** legfeljebb 20 USD, 5 anyagos próbakörrel indul.
- **Kör:** a HTML-anyagok és a Stúdió-leckék; a PDF kimarad.

## Felmérés (éles, csak olvasó lekérdezés)
- **Kör:** a `created_at < 2026-10-01` anyagok; 177 HTML (13,8 millió karakter, medián 70 KB), 16 publikált Stúdió-lecke
  (2,1 millió karakter JSON), 1 PDF.
- **Modellek és árak** (`claude-api` skill, `shared/models.md`):
  - **Hibakereső:** Haiku 5.5, 0,10 / 0,50 USD millió tokenenként (≤ 100 000 tokenes promptig).
  - **Ellenőrző:** Opus 5.5, 4 / 20 USD millió tokenenként.
- **Alkalmazási utak:**
  - **Stúdió-lecke:** a meglévő javítójelölt (`improved_html_files`, `lesson-repair-fusion-1`) +
    `applyTrackedImprovement`. Teljes mentést készít (`material_improvement_backups`, `structuredLesson`), frissességet ellenőriz,
    tranzakcióban dolgozik, a játékbankot is frissíti, visszaolvas, és a „Javítási mentések” fülről visszaállítható.
  - **Régi HTML:** a meglévő HTML-alkalmazás a mai tananyag-szerződést (`verifyLessonMethodHtml`) is kéri, ezt a régi anyagok
    nem teljesítik, ezért helyesírási javításuk sem menne át rajta. Szűk, saját út kell. Ennek mentésformája megegyezik a
    meglévővel (`backupData.{id, content, title, …}`), így a meglévő visszaállítás működik rá.

## Döntések
1. **Csak tartalmi hiba javítható:**
   - tárgyi tévedés;
   - hibás számítás vagy megoldás;
   - hibás megoldókulcs (helyes válasz / visszajelzés);
   - helyesírási és nyelvtani hiba.

   Kinézet, stílus, átfogalmazás és bővítés nem; a szerkezet változatlan.
2. **Hibakereső (Haiku 5.5, `effort: low`):**
   - **Bemenet:**
     - HTML-nél a nyers tartalom a `<style>`, a `<svg>` és a `data:` URI-k nélkül (a megmaradt részek betűhűek, így az idézet a
       forrásban pontosan megtalálható);
     - leckénél a szöveges mezők `[azonosító] szöveg` soronként.
   - **Kimenet:** JSON: `{ findings: [{ quote, replacement, category, reason }] }`. A `quote` betűhű, legfeljebb 300 karakter.
3. **Gépi szűrés az ellenőrzés előtt:**
   - **Előfordulás:** a `quote` pontosan egyszer szerepel (HTML: a teljes tartalomban; lecke: a megadott mezőben).
   - **Különbség:** a `replacement` eltér.
   - **Hossz:** ±50%-on belül.
   - **HTML-nél tiltott karakter:** nem vezethet be `" ' \` \\ < >` karaktert, amely a `quote`-ban nem volt (szkriptbe ágyazott szöveg
     épsége).
4. **Ellenőrző (Opus 5.5, `effort: medium`):**
   - anyagonként egy hívás; a tételek ±300 karakteres környezettel, a cím, a tantárgy és az évfolyam mellett;
   - tételenként `confirm | reject` + indok;
   - csak a `confirm` kerül be.
5. **Alkalmazás:**
   - **HTML:** egy tranzakcióban:
     - zárolás;
     - változatlansági ellenőrzés (a beolvasáskori tartalom hash-e);
     - mentés `material_improvement_backups`-ba (`improvedFileId: null`, megjegyzés: „Tartalmi lektorálás 2026-10-18: N javítás”);
     - a `content` frissítése;
     - visszaolvasás.
   - **Lecke:** `lesson-repair-fusion-1` jelölt (csak a javított szövegek), majd `applyTrackedImprovement` (minden meglévő kapu
     lefut).
6. **Költségkorlát:**
   - minden hívás tokenhasználata összegződik (USD a fenti árakkal);
   - a próbakör (5 anyag) után a mért átlagból becsült teljes költség > 20 USD → megállás és jelentés;
   - futás közben a 20 USD elérésekor megállás.
7. **Napló és folytathatóság:**
   - anyagonkénti JSONL a munkamenet ideiglenes mappájában (találat, ítélet, alkalmazás, költség);
   - újraindításkor a kész anyagok kimaradnak;
   - személyes adat nem kerül bele.
8. **Eszköz helye:** `source/scripts/content-review/proofread.mts`, a tiszta segédfüggvények a
   `source/scripts/content-review/lib.ts`-ben (tesztelhetők).

## Nem-cél
- Kinézet, a tanítás bővítése, a gyakorlóbank újragyártása, PDF.
- A 2026. október 1-je után készült anyagok.

## Kockázatok és kezelésük
- **Téves javítás:** a második, erős modell megerősítése kell, és a művelet anyagonként visszaállítható.
- **HTML / JS sérülése:** pontos egyezés kell, nem vezethet be idézőjelet vagy csúcsos zárójelet, és tranzakcióban fut.
- **Költségtúllépés:** mért próbakör, futás közbeni korlát.

## Elfogadás (EARS)
- HA egy javítást az ellenőrző nem erősít meg, AKKOR nem kerül be.
- HA egy anyag kap javítást, AKKOR előtte mentés készül, ami a „Javítási mentések” fülről visszaállítható, és az alkalmazás után
  a tartalom visszaolvasva a javítottal egyezik.
- HA a költség eléri a 20 USD-t, AKKOR a futás megáll, és a kész anyagok megmaradnak.
- A futás végén összesítő: anyagonként a javítások száma kategóriánként, a mért költség, és a kihagyott / elutasított tételek
  száma.
