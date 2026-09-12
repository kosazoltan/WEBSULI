# Lektori hatókör és forrásváltozat-kezelés

## Cél

A webes tananyag lektora a felhasználó által kért témát és évfolyamot kérje
számon teljes körűen, miközben egy szélesebb forrás életkoron kívüli vagy nem
kért mellékváltozata nem válik automatikusan blokkoló hiánnyá. A tényleges
tényhibák, belső ellentmondások, hiányzó hogyan/miért magyarázatok és a
tanítatlan kérdések továbbra is blokkolók maradnak.

## Nem-cél

- A forráshűségi, tényhelyességi vagy 7.4-es pedagógiai követelmények
  gyengítése.
- A lektori negatív döntés automatikus átfordítása pozitívra.
- Forrás nélküli állítás engedélyezése.
- A meglévő tananyagok tömeges átírása.

## Ellenőrzött érintett terület

- `source/server/studio/web-teaching-review.ts`
- `source/tests/lesson-teaching-quality.test.ts`
- lektori módszertani dokumentáció a `docs/specs/` alatt

## Döntések

1. A `requestedTopic` és az évfolyam az elsődleges hatókör. A forrásban szereplő
   minden részlet nem lesz automatikusan kötelező tananyag.
2. `source_coverage` hibaként a lektor csak a kért témához szükséges tudás,
   előfeltétel, magyarázat vagy kifejezetten vállalt összehasonlítás hiányát
   jelölheti.
3. Két forrás eltérő év- vagy darabszáma önmagában nem blokkoló. A
   `source_conflict` csak akkor indokolt, ha a tananyag láthatóan több
   változatot hasonlít össze, vagy a felhasználó kifejezetten összehasonlítást
   kér, és a változatok nincsenek megjelölve.
4. A `factual_error` és a belső ellentmondás bizonyítéka megmarad; ezek nem
   sorolhatók át pusztán forrásváltozatként.
5. A forrásváltozat-kezelés ellenőrzése determinisztikus: a lektori bizonyíték
   vizsgálata visszaküldi a lektornak a túl tág `source_coverage` hibajegyet,
   nem továbbítja azt vakon a javítónak.

## Elfogadási feltételek (EARS)

- Ha a kért téma nem kér változat-összehasonlítást, és a lektori hibajegy egy
  jelöletlen, életkorhoz illő főváltozatot csak egy másik forrás eltérő
  számadata miatt hiányosnak nevez, akkor a bizonyíték-ellenőrzés kérjen
  korrekciót.
- Ha a tananyag láthatóan megnevezi a két változatot, akkor a két forrásból
  idézett valódi `source_conflict` hibajegy elfogadható.
- Ha a tananyag egy tényben önmagával ellentmond, akkor a `factual_error`
  hibajegy változatlanul blokkoló és elfogadható marad.
- Ha a lektori tesztek bármelyike a túl tág hibajegy átengedését mutatja, a
  változtatás nem tekinthető késznek.

## Kockázat

A modell továbbra is tévesen osztályozhat hibát. Ezért a kapu korrekciót kér és
fail-closed marad; a valós mérésben külön kell figyelni, hogy a valódi
tényhibák ne vesszenek el a szűrésben.
