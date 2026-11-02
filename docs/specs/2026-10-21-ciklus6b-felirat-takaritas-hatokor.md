# Ciklus 6b — a belső minőség-felirat csak adminnak, elavult piszkozatok takarítása, a június utáni régi anyagok is

**Tulajdonosi jelzések (2026-10-21):**
1. Az „Ez egy korábbi módszerverziójú előnézet…” belső minőség-felirat a tanulóknak is megjelent (Odysseus, Angol gyakorlás) — „teljesen
   oda nem illő”. 2. A Tananyag draftok között a régi anyag sor elbukott korábbi próbálkozásai maradtak (7 db; kézzel elvetve) — „nagyon
   megtévesztő”. 3. A tulajdonos döntése: a 2026-06-01 után készült 18 régi formátumú (HTML) anyag is Stúdió-leckévé alakuljon.

## Cél
1. `/dev/:id`: a minőség-felirat csak bejelentkezett adminnak.
2. Régi anyag sor: a kész elem korábbi (nem aktuális, hibás, nem publikált) Stúdió-piszkozatai `recoveryState = discarded` jelölést kapnak
   (ugyanaz, mint a felület „Törlés” gombja; visszafordítható).
3. A jelöltek köre: minden HTML anyag (a határnap nem szűr); a kizárások (Abigél, média, beágyazás, méret) változatlanok.

## Nem-cél
A felirat logikájának (`webLessonQualityNotice`) átírása; a ciklus-kapu (5 / ciklus) módosítása.

## Edge case-ek
Nem bejelentkezett / tanulói látogató: nincs felirat. A futó és az aktuális job érintetlen. A már lecke típusú anyag továbbra sem jelölt.

## Elfogadás (EARS)
- HA a látogató nem admin, AKKOR a HTML anyag felirat nélkül jelenik meg.
- HA a sorelem kész, AKKOR ugyanannak az anyagnak a régebbi hibás, nem aktuális piszkozatai elvetett jelölést kapnak.
- HA egy HTML anyag 2026-06-01 után készült és nem kizárt, AKKOR jelölt.
