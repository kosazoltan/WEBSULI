# Leckénkénti, tartalomhoz illő borítókép minden éles leckének

Tulajdonosi kérés 2026-11-03: az Antigoné-lecke (`7900a871…`) borítója (`cover-gorog-drama`, tengerparti antik színház) a minta —
MINDEN lecke kapjon a saját tartalmának megfelelő, jó minőségű kezdő borítóképet, minden tantárgyban és évfolyamon (3–12.), az
évfolyam szintjén (kisebbeknek barátságosabb, idősebbeknek érettebb képi világ). Ne a sáv általános hős-képe (`hero-*`) jelenjen meg.

**Tulajdonosi pontosítás (2026-11-03, a szülő munkameneten át):** a borítókat KÉZZEL cseréljük, a tananyagot NEM gyártjuk újra.
Tilos a Tananyagjavító, az újragyártás és bármilyen lecke-/bankgenerálás. Minden éles leckét egyenként olvasunk ki (cím, tantárgy,
évfolyam, fejezetcímek, tanítószöveg), és ebből a fejlesztő maga dönti el a kép tartalmát; a kép a meglévő katalógus-mintára készül
(mint a `cover-gorog-drama`, PR #377). Az adatbázisban CSAK a lecke `art.picture` mezője változik, tranzakcióban, előzetes mentéssel
és visszaállítási listával; a `json` minden más része változatlan (leckénként `art` nélküli kanonikus hash-egyezés). A mentés- vagy
betöltéskori újraválasztás nem írhatja felül a kézzel beállított képet. Az Antigoné-lecke kimarad (a szülő munkamenet állítja helyre).

## Leltár (éles DB, 2026-11-03, csak olvasás)
- 269 lecke (212 publikált). Ma látszó kép (`resolveStoredArt` → `pickLessonArt`, a lejátszó szabálya szerint):
  **173 sávhős**, 84 témaköri borító (arculati bank, pl. „Törtek” → pizza), 12 kulcsszavas borító.
- Évfolyam × kép: 3.: 23 hős / 4 témaköri; 4.: 35 / 20; 5.: 51 / 29; 6.: 17 / 2 / 7 kulcsszavas; 7.: 5 / 3; 8.: 21 / 25 / 2;
  9.: 14 / 1 / 3; 10.: 1 hős; 0. (felnőtt/AI-tananyag): 5 hős; 2.: 1 hős.
- Tantárgyak: matematika 83, angol 31, történelem 31, természetismeret 22, magyar (nyelvtan/irodalom, 6 írásmód) 31, környezetismeret 15,
  informatika/digitális kultúra 15, biológia 10, földrajz 8, fizika 8, kémia 4, ének-zene 3, egyéb 8.
- Egyedi tartalom (sáv + tantárgy + cím, ékezet- és írásjel-tűrően): 225, ebből **210-nek van publikált leckéje** (a vázlatok gyakran
  ugyanazt a címet ismétlik: 9× „Műveleti sorrend tanulása”, 8× „Medve Szabadtéri Csapatverseny”).
- A 12 kulcsszavas borítóból 9 csak általános egyezés (pl. „6. osztályos matematika gyakorló feladatlap” → `cover-tortek`); a
  témaköri borítók a témakört mutatják, nem a leckét („Családi kör”, „Hunyadi János”, „Ionvegyületek” → sávhős).

## Megoldás
- **Tartalomkulcs** (`shared/lesson-cover.ts`): `lessonCoverId({ subject, title }, band)` = `cover-l-` + 16 hex (két FNV-1a 32 bites
  lenyomat) a (sáv, ékezet-/írásjel-/kis-nagybetű-tűrő tantárgy, ugyanígy a cím) hármasból; böngészőben és Node-ban azonos. Ugyanaz a
  tartalom (vázlat-másolatok) ugyanazt a képet kapja.
- **Képek a katalógusban** (`kind: cover`, `band` = a lecke sávja, `topic` nincs, `subjects` = a lecke tantárgya, `keywords` = a cím),
  ugyanazzal a folyamattal, mint a `cover-gorog-drama`: `design-assets/prompts.json` tétel (a fejlesztő által a lecke kivonatából írt
  angol jelenetleírás + magyar `alt`) → `scripts/design-assets/generate.ts` (Seedream 5.0 Pro, `--resolution 1K`, 3:2) → szemle
  (válogatóoldal, feliratos / idegen / ijesztő kép újragenerálva) → `scripts/design-assets/approve.ts` (WebP 1200 px,
  `client/public/design/<sáv>/`, katalógusbejegyzés). Az induló szinkron a `design_assets` táblába tölti.
- **Évfolyamhoz illő stílus:** a `style.md` sávstílusa (`BAND_*`, a generátor automatikusan hozzáfűzi) és a jelenetleírás:
  3–4.: barátságos, mesekönyvszerű; 5–6.: kalandos, festői; 7–8.: érett, félrealisztikus; 9–12. és 0.: realisztikus, felnőttes.
  A leírás tartalmi szabályai: konkrét jelenet a lecke tárgyából (irodalom: a mű világa, korhű; történelem: a kor és hely, emberek csak
  távolról / hátulról; nyelv: a téma helyzete; matematika/természettudomány: a fogalom kézzelfogható, valós képe); szöveg, szám, betű,
  felirat, címkés térkép nincs; azonosítható valós arc, ijesztő vagy erőszakos elem nincs.
- **Választás** (`shared/design-assets.ts`):
  - `pickLessonArt`: ha a katalógusban van a lecke tartalomkulcsú borítója, az nyer (minden más borító és a sávhős előtt).
  - `pictureFits`: a tárolt `cover-l-*` kép a lecke sávjában érvényes (kézi választás — nem kell a kulcsnak egyeznie).
  - `computeLessonArt(…, pinned)` / `withLessonArt`: ha a lecke korábbi `art.picture`-je `cover-l-*`, a táblában megvan és a lecke
    mostani sávjáé, mentéskor megmarad (a kézi kép az újraválasztás után is ugyanaz, átnevezés után is). Sávváltáskor (más
    korosztály) nem marad — az a korosztálynak nem illő stílus lenne.
  - Review #382: ha a mentendő json-ban nincs `art.picture` (a Stúdió-javítás jelöltje modellkimenet, az opcionális `art`-ot
    kihagyhatja), a `withLessonArt` a tárolt lecke `art.picture`-jét veszi (a seed meglévő leckénél az azonosítója; ugyanazzal a
    lekérdezővel, a javítás tranzakciójában) — így átnevező javításnál sem vész el a kézi kép.
  - Review #382: átmeneti képtábla-hibánál a `withLessonArt` a meglévő `art`-ot megtartja (eddig eldobta); `art` nélkül csak az eddig
    is arculat nélküli lecke ment.
- Review #382 (csereszkript): `art` nélküli leckét nem ír (csak `picture`-ös `art` mellett a lejátszó nem pótolná a kabalát és az
  ikont; ott a katalógusból úgyis a tartalomkulcsú borító jelenik meg); a mentésfájl `0600` jogosultságú; a visszaállítás leáll, ha
  a lecke `art`-ja a csere óta bármiben változott.
- **Éles csere** (`scripts/design-assets/pin-lesson-covers.mts`), a deploy UTÁN (amikor a kép a táblában és a statikus fájl a CDN-en):
  egy író tranzakcióban `SELECT … FOR UPDATE`, mentés (`--write <mentés.json>`: az érintett sorok teljes `json`-ja + `art`-lista),
  `jsonb_set(json, '{art}', art || {"picture": id})`, majd ugyanabban a tranzakcióban leckénként az `art` nélküli kanonikus hash
  összevetése (előtte = utána); bármely eltérés → ROLLBACK. `--restore <mentés.json>`: az `art` visszaírása, ugyanazzal a
  hash-ellenőrzéssel. Próbafutás (alapértelmezés): csak olvas, kiírja a tervezett cseréket. Antigoné (`html_file_id 7900a871…`) kimarad.
  Érintett: minden lecke, amelynek tartalomkulcsú borítója a katalógusban van — a publikáltakkal azonos tartalmú vázlatok is (így
  publikáláskor sem kell újra hozzányúlni). A szkript leáll, ha egy katalógusborító még nincs a `design_assets` táblában.

## Új leckék
- Ugyanazon tartalmú új lecke (azonos sáv + tantárgy + cím) mentéskor automatikusan megkapja a kész képet (`pickLessonArt`).
- Új tartalomhoz ebben a körben nincs automatikus képgyártás (a tulajdonosi pontosítás kézi cserét kér): az új lecke a mai szabály
  szerinti képet kapja, a borítója ugyanezzel a folyamattal pótolható. Szerveroldali automatizmus külön döntés.

## Költség
- 210 kép × 0,045 USD (1K) ≈ 9,5 USD + a szemlén elvetett képek újragenerálása (≈ 10–20 %) ≈ **11 USD** egyszer. Szövegmodell-hívás nincs.

## Nem-cél
- A lecke tartalmának bármilyen változása; Tananyagjavító / újragyártás.
- A csak vázlatban lévő 15 tartalom (publikált lecke nélkül); a régi, iframe-es HTML-tananyagok; az Antigoné-lecke.
- A sávhős, a kabala, a tárgyikon, a témaköri és kulcsszavas katalógusborítók törlése.

## Edge case-ek
- Ismeretlen tantárgy (Bibliaismeret, kompetenciamérés) is kap borítót (a kulcs a tantárgy szövegéből jön), 0. évfolyam → `studio` sáv.
- A csere óta átnevezett lecke: a kézi kép marad (pin), amíg a sáv ugyanaz.
- A lecke a csere és a mentés között változott (cím/tantárgy/évfolyam): a szkript `FOR UPDATE` alatt olvas; a hash-ellenőrzés a
  tranzakción belül fut, így párhuzamos írás nem keveredhet bele.
- A kép végpontja hibázik → a katalógusfájl statikus útvonala (`ArtImage` tartalékváltása).
- A korábbi (elvetett, automatikus) próbakör 4 `cover-l-*` sora a táblában: ugyanazon kulcsú katalógusképpel az induló szinkron
  felülírja; a többit a csere nem használja.

## Elfogadás (EARS)
- HA két lecke sávja, tantárgya és címe ékezet- / írásjel- / kis-nagybetű-eltéréstől eltekintve azonos, AKKOR a `lessonCoverId` azonos;
  HA a cím vagy a sáv eltér, AKKOR eltér; az id illeszkedik a `^cover-l-[a-f0-9]{16}$` mintára.
- HA a katalógusban van a lecke tartalomkulcsú borítója, AKKOR `pickLessonArt` azt adja (sávhős és más borító helyett).
- HA a tárolt `art.picture` egy azonos sávú `cover-l-*`, AKKOR `resolveStoredArt` azt mutatja, és `computeLessonArt` mentéskor
  megtartja (átnevezés után is); HA más sávú, AKKOR nem.
- HA a csereszkript fut, AKKOR minden érintett leckénél csak az `art.picture` változik (az `art` nélküli kanonikus hash egyezik), és
  a mentésből visszaállítható; HA bármely lecke hash-e eltér, AKKOR semmi sem íródik.
- HA a csere lefutott, AKKOR minden publikált lecke (Antigoné kivételével) `art.picture` = a tartalomkulcsú borító (lista), és a
  lejátszó 390 és 1280 px szélességen ezt mutatja (képernyőképek).
- HA `npm test`, `tsc` (app + teszt), `eslint --max-warnings 0`, `npm run build`, AKKOR zöld.

## Spec-változás miatti tesztmódosítás
- `tests/design-assets.test.ts` („sávkép…”): a „A vulkánok – vulkáni működés” (6. o.) eddig a sávhőst várta; a lecke most saját
  tartalomkulcsú borítót kap (e terv). Az eredeti szándék (borító nélküli címnél sávhős, idegen témaborító soha) egy borító nélküli
  címmel („A vulkánok – gyakorló feladatsor” → `hero-studio`) megmarad; a mérce nem gyengült.
- `tests/lesson-art-compute.test.ts` („a mag determinisztikus…”): „Az ókori Egyiptom” (5. o.) eddig a témaköri borítót várta; most a
  saját borítóját kapja (új állítás), a témaköri választást az „Az ókori Egyiptom piramisai” cím vizsgálja ugyanazzal az elvárással.

## Szemle (2026-11-03)
- 210 kép (1K), mind a 210 kontaktlapon átnézve, a feliratgyanúsak (óra, térkép, könyv, pergamen, mérőléc) nagyítva. Újragenerálva
  javított leírással: 3 (fogsor-modell ijesztő hatású; íróasztalon pisztoly; valós nemzeti zászlóra emlékeztető zászló). Költés ≈ 9,6 USD.
