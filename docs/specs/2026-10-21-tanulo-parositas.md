# Tanulói párosítás — QR-kód, igaz riasztás, vendég-eredmény útmutató

**Tulajdonosi jelzés (2026-10-21):** egy tanulóról „3 napja nem tanult” riasztás jött, miközben egy általa megoldott kvíz eredménye
„Vendég tanuló” néven megérkezett; több tanuló „nem kapja” a tananyag- és a felfedezés-leveleket.

**Mért:** a Resend szerint 10-19–21 között MIND a 4 gyerek MIND a 6 címére minden napi tananyag- és felfedezés-levél `delivered`
(a fogadó szerver átvette) — a levelek valószínűleg a Spam / Promóciók mappában vannak (a gyerekek postafiókja nem érhető el). A
tanulói tevékenység-napló egyetlen gyereknél sem tartalmaz eredményt (egy tanulónál 2 megnyitás) → az eszközök nincsenek párosítva;
a párosítás EGYETLEN útja a levél személyes linkje (`?t=`). A vendégként érkezett eredmény anyaga megegyezett az érintett tanuló
napi levelének anyagával — párosítatlan eszközön oldotta meg, ezért a profiljában nem jelenik meg, és a riasztás tévesen állítja,
hogy „nem tanult”.

## Cél
1. Admin „Tanulók” fül: a párosító link QR-kódként is (a gyerek telefonjával beolvasva azonnal párosít, e-mail nélkül).
2. A riasztás igaz: „a profiljához 3 tanítási napja nem érkezett tevékenység”, az ok (párosítatlan eszköz / a levél a Spam mappában)
   és a teendő (párosítás QR-kóddal, a feladó a névjegyekhez) megnevezésével.
3. A vendég-eredménylevél útmutatót ad a párosításhoz.

## Nem-cél
Automatikus (titok nélküli) gyerekválasztás az eszközön (megszemélyesíthető lenne); a postafiókok beállítása.

## Elfogadás (EARS)
- HA a tanuló profiljához 3 tanítási napja nincs tevékenység, AKKOR a riasztás tárgya és szövege a profilra vonatkozik, és megnevezi a párosítást.
- HA az admin a Tanulók fülön a QR-kódot kéri, AKKOR a párosító link QR-kódja jelenik meg.
- HA az eredmény vendégtől jön, AKKOR a levél útmutatót ad a párosításhoz.

## Kiegészítés — párosítási útmutató e-mailben (tulajdonosi kérés 2026-10-21)
„A gyereknek is, meg a szülőnek is küldj egy e-mailt, hogy hogyan kell párosítani az eszközöket, mert azt egyik sem fogja kitalálni
magától.” Tulajdonosi pontosítás: a QR-kód a SZÜLŐ képernyőjén jelenik meg, a gyerek a saját telefonjával arról olvassa be.

- **Gyereklevél** (a tanuló minden aktív címére): gyerekhangon, nagy „Párosítom ezt az eszközt” gombbal (a személyes `?t=` link);
  lépések: a telefonján nyissa meg a levelet és koppintson a gombra; minden használt böngészőben egyszer; ellenőrzés: a kezdőlap
  „Szia, ‹keresztnév›!”; a link csak az övé (ne küldje tovább); a noreply@websuli.vip a névjegyekhez (ne a Spambe menjen a napi levél).
- **Szülőlevél** (ADMIN_EMAILS, egy levél az összes tanulóval): a három út — a gyerek a saját levelében a gombra koppint; QR-kód a
  szülő képernyőjén (Admin → Tanulók → „Párosító QR-kód”), a gyerek a kamerájával olvassa be; második eszköz nélkül „Párosító link
  másolása” → üzenetben a gyereknek. Ellenőrzés: az eredménylevél a gyerek nevével érkezik, a Tanulók fülön látszik a tevékenység.
- **Indítás:** admin végpont `POST /api/admin/learners/pairing-guide` (CSRF, adminRouter) és „Párosítási útmutató küldése” gomb a
  Tanulók fülön (megerősítéssel); a választ a darabszámok adják (gyereklevél / szülőlevél / hiba). Naplóba nem kerül név vagy cím.
- **Első kiküldés:** a tulajdonos kérésére most, a meglévő éles küldővel (Resend), ugyanazzal a levélépítővel.

### Elfogadás (EARS) — kiegészítés
- HA az admin a párosítási útmutatót küldi, AKKOR minden címmel rendelkező tanuló minden aktív címe megkapja a saját párosító linkjét
  tartalmazó gyereklevelet, és minden admin-címzett egy szülőlevelet.
- HA egy cím küldése hibázik, AKKOR a többi levél kimegy, és a válasz a hibák számát jelzi.
- A gyereklevél csak a saját tanulója linkjét tartalmazza; a szülőlevél nem tartalmaz linket (a QR / másolás az admin felületen van).
