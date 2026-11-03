# Leckénkénti, tartalomhoz illő borítókép minden leckének

Tulajdonosi kérés 2026-11-03: az Antigoné-lecke (`7900a871…`) borítója (`cover-gorog-drama`, tengerparti antik színház) a minta —
MINDEN lecke kapjon a saját tartalmának megfelelő, jó minőségű kezdő borítóképet, minden tantárgyban és évfolyamon (3–12.), az
évfolyam szintjén (kisebbeknek barátságosabb, idősebbeknek érettebb képi világ). Ne a sáv általános hős-képe (`hero-*`) jelenjen meg.

## Leltár (éles DB, 2026-11-03, csak olvasás)
- 269 lecke (212 publikált). Ma látszó kép (`resolveStoredArt` → `pickLessonArt`, a lejátszó szabálya szerint):
  **173 sávhős**, 84 témaköri borító (arculati bank, pl. „Törtek” → pizza), 12 kulcsszavas borító (pl. Antigoné → `cover-gorog-drama`).
- Évfolyam × kép: 3.: 23 hős / 4 témaköri; 4.: 35 / 20; 5.: 51 / 29; 6.: 17 / 2 / 7 kulcsszavas; 7.: 5 / 3; 8.: 21 / 25 / 2;
  9.: 14 / 1 / 3; 10.: 1 hős; 0. (felnőtt/AI-tananyag): 5 hős; 2.: 1 hős.
- Tantárgyak: matematika 83, angol 31, történelem 31, természetismeret 22, magyar (nyelvtan/irodalom, 6 írásmód) 31, környezetismeret 15,
  informatika/digitális kultúra 15, biológia 10, földrajz 8, fizika 8, kémia 4, ének-zene 3, egyéb 8.
- Egyedi tartalom (sáv + tantárgy + cím, ékezet- és írásjel-tűrően): **225** (a vázlatok sokszor ugyanazt a címet ismétlik: pl.
  9× „Műveleti sorrend tanulása”, 8× „Medve Szabadtéri Csapatverseny”).
- A katalógus 238 témaköri borítója a témakört mutatja, nem a leckét („Családi kör”, „Hunyadi János”, „Ionvegyületek” → sávhős).

## Döntés: leckénkénti kép (nem katalógusbővítés)
- Katalógusbővítéssel (kulcsszavas borító műként, mint a görög dráma) minden új lecke új PR-t igényelne — az „új leckék automatikusan”
  követelmény így nem teljesíthető. Ezért a borító a lecke **tartalomkulcsához** tartozó, futásidőben generált kép az adatbázisban.
- **Tartalomkulcs:** `lessonCoverId(lesson, band)` = `cover-l-` + 16 hex (két FNV-1a 32 bites lenyomat) a (sáv, ékezet- és írásjel-tűrő
  tantárgy, ékezet- és írásjel-tűrő cím) hármasból. Böngészőben és Node-ban azonos (`shared/lesson-cover.ts`). Ugyanaz a tartalom
  ugyanazt a képet kapja (vázlat-másolatok: egy generálás); a cím vagy az évfolyamsáv változása új kulcsot ad — a régi kép nem illik.
- **Tárolás:** a `design_assets` táblában (`kind = cover`, a lecke sávja, `mime = image/jpeg`, `topic = null`, `origin`
  „MI-generált, saját (Seedream 5.0 Pro, leckeborító)”). A verziókezelt katalógusba NEM kerül; az induló szinkron nem törli.
- **Elsőbbség** (mentéskor `computeLessonArt`, megjelenítéskor `resolveStoredArt`): (1) a tulajdonos által kurált **kulcsszavas**
  borító (Antigoné → görög színház marad); (2) a **leckeborító**, ha a táblában megvan; (3) témaköri borító; (4) sávhős.
- **Megjelenítés:** a lejátszó a tárolt `art.picture`-t akkor fogadja el leckeborítóként, ha az pontosan a lecke mostani
  tartalomkulcsa; a kép a `/api/design-assets/<id>` végpontról jön, hibánál a katalógus szerinti kép statikus fájljára vált (`ArtImage`).
  Alt-szöveg: „<cím> — a lecke borítóképe.” A lecke-séma nem változik (az `art.picture` regexe már most is elfogadja).

## Képgyártás (szerveroldali modul `server/lesson-covers.ts`, közös a háttérfolyamattal és a backfill-szkripttel)
1. **Tartalomkivonat:** cím, tantárgy, évfolyam, a fejezetcímek (≤ 12) és az első magyarázó blokk eleje (≤ 700 karakter).
2. **Képterv** (OpenRouter, `anthropic/claude-haiku-5.5`, JSON): egyetlen konkrét, a lecke tartalmát mutató jelenet angolul (kor- és
   tárgyhű: irodalmi műnél a mű világa, történelemnél a kor, nyelvi leckénél a téma helyzete, matematikánál a fogalom szemléletes,
   valós tárgyi képe), szöveg / szám / betű nélkül; és egy rövid magyar leírás.
3. **Kép:** Seedream 5.0 Pro, `resolution: 1K`, `aspect_ratio: 3:2` (≈ 0,045 USD). A prompt: képterv + `KIND_COVER` + a sáv
   `BAND_*` stílusa + `COMMON` (`design-assets/style.md`, ugyanaz, mint a katalógusé) + évfolyam-hangolás:
   3–4.: barátságos mesekönyv; 5–6.: kalandos, festői; 7–8.: érett, félrealisztikus; 9–12.: realisztikus, fotószerű, felnőttes.
4. **Minőségkapu** (ugyanaz a modell, képpel): van-e a képen betű / szám / felirat, ijesztő vagy erőszakos elem, és a terv tárgyát
   mutatja-e. Bukásnál egy új generálás; ha az is bukik, nincs leckeborító (a lecke a mai képét tartja), a kulcs naplózva.
5. **Mentés:** `design_assets` beszúrás (ütközésnél nem ír felül), majd **összekötés**: minden lecke, amelynek kulcsa = az id és nincs
   kulcsszavas borítója, egy atomikus `jsonb` frissítést kap (`art.picture`), csak ha a cím / tantárgy / évfolyam azóta nem változott.

## Új leckék automatikusan
- Mentéskor (`withLessonArt`) a már meglévő leckeborító azonnal bekerül (ugyanazon tartalom újramentése, vázlatmásolat).
- **Háttérfolyamat** (`startLessonCoverWorker`, a szerver indulásakor): induláskor 60 s múlva, majd 10 percenként, és minden
  leckementés után (20 s késleltetéssel) végigmegy a hiányzó kulcsokon, sorban egyenként. Csak `OPENROUTER_API_KEY` mellett fut;
  `LESSON_COVERS=0` kikapcsolja. **Napi plafon:** `LESSON_COVER_DAILY_LIMIT` (alap 40 kép ≈ 1,8–3,6 USD/nap) — a mai napon
  (UTC) beszúrt `cover-l-*` sorok száma alapján, így újraindítás nem nullázza.
- A meglévő leckék pótlása (backfill) a `scripts/design-assets/lesson-covers.mts` szkripttel, ugyanazzal a modullal (`--dry-run`
  próbafutás, `--max N` fizetős plafon, `--link-only` csak összekötés).

## Költség
- Backfill: ≈ 220 kulcs × (0,045 USD kép + ≈ 0,001 USD képterv/kapu) + ≈ 10–15 % újragenerálás ≈ **11–12 USD** egyszer.
- Új leckénként ≈ 0,05 USD (vázlat-ismétlésnél 0).

## Nem-cél
- A régi, iframe-es HTML-tananyagok (strukturált lecke nélkül) borítója; a sávhős, a kabala, a tárgyikon és a sávszabály változatlan.
- Tulajdonosi képenkénti válogatás (225 kép) — helyette a gépi minőségkapu + szúrópróba-kontaktlap; egy kép a lecke újragenerálható
  (sor törlése a táblából → a háttérfolyamat újra gyártja).
- A kulcsszavas és témaköri katalógusborítók törlése.

## Edge case-ek
- Ismeretlen tantárgy (pl. Bibliaismeret, kompetenciamérés) is kap leckeborítót (a kulcs a tantárgy szövegéből jön), sávja az évfolyamé.
- 0. évfolyam (felnőtt AI-tananyag) → `studio` sáv (mint ma), érett stílus.
- A mentés óta átnevezett / más évfolyamra tett lecke: a tárolt id nem egyezik a kulccsal → a lejátszó nem fogadja el, a következő
  mentés / söprés az új kulcsot adja.
- A kép végpontja hibázik → a katalógus szerinti kép statikus fájlja (`ArtImage` tartalékváltása).
- OpenRouter-hiba / kvóta / üres válasz → a kulcs kimarad, a lecke a mai képét tartja; a következő söprés újrapróbálja (a napi
  plafon a sikeres beszúrásokat számolja; a sikertelen hívások száma futásonként legfeljebb a plafon kétszerese).
- Párhuzamos gyártás ugyanarra a kulcsra (szkript + szerver): beszúrás `ON CONFLICT DO NOTHING`.
- Kulcsszavas borítós lecke (Antigoné): nem kap leckeborítót, a görög színház marad.

## Elfogadás (EARS)
- HA két lecke sávja, tantárgya és címe ékezet- / írásjel- / kis-nagybetű-eltéréstől eltekintve azonos, AKKOR a `lessonCoverId` azonos;
  HA a cím vagy a sáv eltér, AKKOR eltér; az id illeszkedik a `^cover-l-[a-f0-9]{16}$` mintára.
- HA a táblában megvan a lecke leckeborítója és nincs kulcsszavas borítója, AKKOR `computeLessonArt` `picture` = a leckeborító id;
  HA kulcsszavas borítója van (Antigoné), AKKOR az marad.
- HA a tárolt `art.picture` a lecke mostani kulcsa, AKKOR `resolveStoredArt` borítóként adja (`src` = a katalógus szerinti tartalékkép);
  HA más leckeborító-id (átnevezett lecke), AKKOR `null`.
- HA a minőségkapu kétszer bukik, AKKOR nincs beszúrás; HA a napi plafon elfogyott, AKKOR nincs fizetős hívás.
- HA az összekötés közben a lecke címe megváltozott, AKKOR az a sor nem frissül.
- HA a backfill lefutott, AKKOR minden éles leckének (a kulcsszavas borítósak kivételével) tartalomkulcsú leckeborítója van
  (lista + kontaktlap), és a lejátszó 390 és 1280 px szélességen a leckeborítót mutatja.
- HA `npm test`, `tsc` (app + teszt), `eslint --max-warnings 0`, AKKOR zöld.
