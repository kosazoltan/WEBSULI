# Lecke-hős: a sáv saját képe, témaborító csak célzottan

Állapot: tulajdonosi hibajelzés és döntés 2026-10-19.
> „a halloweeni kép nem jó, és a Föld űrnézete nincs benne, és a hidas kép sincs benne”

A tulajdonos a felkínált lehetőségek közül ezt választotta:
- **Alap:** a sáv saját hős-képe a koncepciókép szerint (1–2. róka-erdő, 3–5. zászlós hegy, 6–8. a Föld az űrből, 9–10. függőhíd,
  11–12. túrázó a csúcson).
- **Témaborító:** csak akkor, ha a cím kulcsszava és a tantárgy egyezik, és ugyanabból a sávból van.

Ez felváltja a `docs/specs/2026-10-17-websuli-lecke-hos.md` „változatos képválasztás” kiegészítésének képszabályát; a
kabala-rotáció marad.

## Mérés
- **9. osztályos matek (élő, „Kéttagú kifejezések négyzete”):** halloweeni füzér a fejlécben. Ez a `cover-ismetlodes`
  (6–8. sáv, matematika; kulcsszavai: „ismétlődő minta”, „füzér”, „osztás maradékkal”).
- **Gyökérok:** a `pickLessonArt` (`shared/design-assets.ts:75-80`) kulcsszó nélkül a következőkből sorsolt:
  - a sáv hőse kétszeres súllyal;
  - az azonos korosztály többi sávhőse;
  - az azonos korosztály MINDEN azonos tárgyú borítója, sávtól és témától függetlenül.
  - Egy idősebb matek-leckénél így a 6–8. sáv témaspecifikus borítói (köztük a halloweeni) és más sávok hősei is bekerültek,
    a saját sávkép (Föld, híd) pedig ritkán nyert.
- **Tárolt választás:** a választás mentéskor a leckébe kerül (`lesson.art.picture`), és megjelenítéskor nem számolódik újra.
  - A már mentett leckék a rossz képet tartják meg.
  - Az éles adatbázist nem írjuk, ezért a megjelenítéskori érvényesség-ellenőrzés javítja ezeket.

## Cél
1. **`pickLessonArt` képválasztása:**
   1. a témakör borítója (a lecke sávjából) — változatlan;
   2. kulcsszavas borító: a cím kulcsszava ÉS a tantárgy egyezik, ÉS a borító a lecke sávjáé (más sáv és más korosztály borítója
      nem); több illeszkedőnél determinisztikus rotáció;
   3. különben a sáv saját hős-képe;
   4. ha a sávnak még nincs hős-képe, a korosztály többi sávhőse közül (a régi tartalék).
   - Kabala és tárgyikon: változatlan.
2. **`resolveStoredArt`:** opcionálisan megkapja a lecke tárgyát és címét. A tárolt kép csak akkor marad, ha az új szabály
   szerint is illik:
   - a sáv saját hőse;
   - a tárolt témakörű, azonos sávú borító;
   - vagy a címre és a tárgyra illeszkedő, azonos sávú kulcsszavas borító.
   - Különben `null`, és a hívó a friss választást mutatja.
   - A kliens (`lessonArtFor`) és a stúdió-összefoglaló (`artSummary`) átadja a leckét.
3. **Új mentés:** a szerveroldali választás (`computeLessonArt`) automatikusan az új szabályt használja.

## Nem-cél
- Adatbázis-írás (a tárolt `art` mező backfillje). Ez külön, a tulajdonos által futtatható szkript: `docs/specs/2026-10-18-arculat-backfill.md`.
- A képkészlet módosítása.

## Elfogadás (EARS)
- **Kulcsszó nélkül:** HA a lecke címe egyik borító kulcsszavát sem tartalmazza, AKKOR a fejléckép a sáv saját hős-képe:
  - 9. o. → `hero-laboratory` (híd);
  - 6–8. o. → `hero-studio` (Föld);
  - 1–2., 3–5., 11–12. o. → a saját sávhős.
- **Halloweeni borító:** HA a lecke 9. osztályos matek, AKKOR a fejléc nem `cover-ismetlodes`. A halloweeni borító csak 6–8. o.
  matek-leckén, „ismétlődő minta / füzér / osztás maradékkal” címszóra jöhet.
- **Kulcsszavas borító:** HA a cím kulcsszava és a tárgy egy azonos sávú borítóra illik (pl. 9–10. o. biológia „A sejt
  felépítése” → `cover-sejt`), AKKOR az a borító jelenik meg.
- **Régi tárolt kép:** HA a tárolt kép az új szabály szerint nem illik (pl. `cover-ismetlodes` egy 9. o. leckén), AKKOR
  megjelenítéskor a sáv hős-képe látszik.
