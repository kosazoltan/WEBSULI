# Websuli tantárgyi ikonkészlet adatbázisból — terv

**Tulajdonosi kérés (2026-10-17):** minden tantárgyhoz, korosztályonként külön, előre legyártott ikon kell. A készletet az
adatbázisba kell menteni, és a tananyagkészítő a lecke azonosítása (tantárgy, évfolyam) után onnan olvassa ki.

**Előzmények:**
- `docs/design/Websuli_Grafikai_Szabalyterv.md` 2.3 (képi nyelv);
- `docs/specs/2026-10-17-websuli-kepkeszlet.md` (gyártóeszköz, Seedream 5.0 Pro);
- `docs/specs/2026-10-17-websuli-lecke-hos.md` (képválasztás).

## Ellenőrzött tények
- **Tantárgyak:** a hivatalos lista 19 tantárgy (`shared/catalog-taxonomy.ts`, `CATALOG_SUBJECTS`). A szabad szöveges tantárgynevet a
  `subjectKeyOf()` képezi le erre (`shared/subject-key.ts`).
- **Ami ma él** (éles adatbázis, csak olvasva):
  - matematika 4–9.;
  - történelem 5–7.;
  - természetismeret 4–5.;
  - környezetismeret 4.;
  - magyar 4–5.;
  - biológia 5.;
  - informatika 9.;
  - földrajz 4.
- **Korosztály:** az öt évfolyamsáv (`DESIGN_THEMES`): explorer 1–2., adventure 3–5., studio 6–8., laboratory 9–10., future 11–12.
- **Lecke létrehozása:** a `server/studio/pipeline-store.ts` `insert(lessons)`, a tantárgy és az évfolyam a `json.subject` és a
  `json.classroom`.

## Cél
1. **Tantárgy × sáv mátrix** (`shared/subject-icons.ts`): melyik tantárgy melyik sávban tanítható, a NAT 2020 szerint. A pontos
   lista a végrehajtási utasításban van; kb. 73 pár.
2. **Ikonok gyártása:** páronként egy ikon `icon-<tantárgy>-<sáv>` azonosítóval, a sáv stílusában. Referencia:
   - 1–5. évfolyam: a jóváhagyott fényes 3D-s gyerekikon;
   - 6–12. évfolyam: a jóváhagyott fizika-ikon.

   Költség kb. 73 × 0,09 USD + referenciák ≈ 7 USD.
3. **Adatbázis** (`migrations/0028_design_assets.sql`): `design_assets` tábla.
   - Mezők: id, kind, band, subjects, keywords, alt, mime, sha256, bytes (bytea), origin, model, prompt_hash, approved_at.
   - A tábla az összes jóváhagyott képet tartalmazza: az új ikonokat és a meglévő 36 képet is.
4. **Szinkron induláskor:** a szerver a repóban lévő, jóváhagyott katalógust idempotensen feltölti a `design_assets`-be. Upsert
   azonosító szerint, csak akkor ír, ha az sha256 eltér. Így minden deploy után az adatbázis a forrás; kézi éles írás nincs.
5. **Kiszolgálás:** `GET /api/design-assets/:id` a bájtokat adja, `Cache-Control: public, max-age=31536000, immutable` fejléccel és
   sha256 ETaggel.
6. **Tananyagkészítés:** a lecke mentésekor (`pipeline-store` `insert`/`update`) a szerver a `design_assets`-ből kiválasztja a
   tantárgy és a sáv ikonját. A lecke JSON-ja ezt kapja: `art: { subjectIcon: "<id>" }`.
7. **Lejátszó:**
   - Ha a leckében van `art.subjectIcon`, az ikon a `/api/design-assets/<id>` címről jön.
   - Különben a mai katalógus-választás marad (a régi leckékre visszamenőleg is).
   - A régi leckék visszamenőleges kitöltése külön, egyszeri szkripttel, a tulajdonos engedélyével.

## Nem-cél
- A borító és a hős-kép adatbázisból választása a lecke mentésekor. A mostani lejátszóoldali rotáció marad; a következő lépésben
  ugyanígy átvihető.
- Képszerkesztő felület az adminban.

## Szélső esetek
- **Ismeretlen tantárgy** (`subjectKeyOf` → null): nincs ikon. A lejátszó a mai tartalékot használja.
- **Nem tanított pár** (például kémia 1–2.): nincs ikon. A sávhoz legközelebbi, azonos tantárgyú ikon sem jön, hogy a korosztályok
  ne keveredjenek.
- **Az adatbázis nem érhető el a szinkronkor:** a szerver indul, figyelmeztetést naplóz, és a következő induláskor újra próbálja.
- **Méret:** egy ikon ~10–15 KB, 110 kép összesen ~2,5 MB a táblában.

## Elfogadás (EARS)
- HA egy lecke tantárgya és évfolyama a mátrixban van, AKKOR mentéskor az `art.subjectIcon` a `icon-<tantárgy>-<sáv>`, és a kép a
  `/api/design-assets/<id>` címről 200-zal, `image/webp` típussal jön.
- A mátrix minden párjához van jóváhagyott ikon a katalógusban és az adatbázisban (egységteszt és DB-teszt).
- A szinkron kétszer futtatva sem ír újra változatlan képet (DB-teszt, eldobható Postgresben).
- A lejátszó az ikon nélküli régi leckén is hiba nélkül fut (e2e).
