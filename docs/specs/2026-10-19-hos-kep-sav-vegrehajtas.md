# Lecke-hős a sáv képe — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-19-hos-kep-sav.md`. Munkakönyvtár: `source/`. Ág: `fix/hos-kep-sav`.

1. **`shared/design-assets.ts` — `pickLessonArt`:**
   - `keyed = covers.filter(a => a.band === band && keywordHit(a) && subjectHit(a))`; a régi korosztályos tartalék megszűnik.
   - Nincs kulcsszavas és témaköri borító: `hero = own[0]` (a sáv hőse). Ha nincs, a `heroes` (azonos korosztály) közül
     `rotate`.
   - A tárgyi borítók nem kerülnek az általános készletbe.
2. **Közös érvényesség:** `pictureFits(picture, lesson, band, catalog, topic?)`.
   - **Hős:** igaz, ha a sáv saját hőse; ha a sávnak nincs hőse, akkor bármely azonos korosztályú hős.
   - **Borító:** `band` egyezik, és (`topic` adott, vagy a lecke címe és tárgya illeszkedik a kulcsszavas szabályra).
3. **`resolveStoredArt(stored, band, catalog, lesson?)`:** ha a `lesson` adott és a `!pictureFits(...)`, akkor `null`.
4. **Hívók:**
   - `client/src/lesson-runtime/LessonArt.tsx` `lessonArtFor` átadja a `{ subject, title }`-t;
   - `artSummary` (`shared/design-assets.ts`) kap egy opcionális `lesson` paramétert;
   - a hívóit nézd meg, és ahol a lecke elérhető, add át.
5. **Tesztek:**
   - `tests/design-assets.test.ts`:
     - a rotációs teszt képrésze dokumentált specváltozás → a kulcsszó nélküli lecke a saját sávhőst kapja (minden sávban);
     - a kabala-rotáció és a stabilitás marad;
     - a halloweeni borító 9. o. matekon nem jön, 6–8. o.-on a kulcsszóra igen.
   - `tests/stored-art.test.ts`: a tárolt, nem illő borító → `null`; a tárolt sávhős és témakörű borító marad.
   - A meglévő tesztek a fentieken kívül változatlanul zöldek.
6. **Ellenőrzés:**
   - `check`, `check:test`, `eslint`, `npm test`, `build`;
   - a lecke-hős böngészőtesztjei (`lesson-design.spec.ts` hős-része) a vite-próbán.
