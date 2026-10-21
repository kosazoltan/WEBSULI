# Tanulói párosítás — QR-kód, igaz riasztás, vendég-eredmény útmutató

**Tulajdonosi jelzés (2026-10-21):** „Léna három napja nem tanult” riasztás, miközben ott van a megoldott Egyiptom-kvíz („Vendég
tanuló”); Dominik, Léna és Marcell „nem kapja” a tananyag- és a felfedezés-leveleket.

**Mért:** a Resend szerint 10-19–21 között MIND a 4 gyerek MIND a 6 címére minden napi tananyag- és felfedezés-levél `delivered`
(a fogadó szerver átvette) — a levelek valószínűleg a Spam / Promóciók mappában vannak (a gyerekek postafiókja nem érhető el). A
tanulói tevékenység-napló egyetlen gyereknél sem tartalmaz eredményt (csak Kristóf 2 megnyitása) → az eszközök nincsenek párosítva;
a párosítás EGYETLEN útja a levél személyes linkje (`?t=`). Léna 10-19-i levelének anyaga épp „Az ókori Egyiptom” volt — a kvízt
párosítatlan eszközön, vendégként oldotta meg. A riasztás ezért tévesen állítja, hogy „nem tanult”.

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
