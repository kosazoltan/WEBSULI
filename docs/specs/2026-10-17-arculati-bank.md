# Websuli arculati bank — előre gyártott díszítőelemek az adatbázisból — terv

**Tulajdonosi döntések (2026-10-17):**
- **Első hullám:** MINDEN díszítőelem előre gyártva: témaköri borítók, blokktípus-jelzők, kabalapózok blokktípusonként,
  fejezetelválasztók.
- **Ismétlődő feliratok:** kódszótárban élnek; a modell legfeljebb kulcsot választ.
- **Tárolás:** minden képbájt a `design_assets` táblában.
- **Jóváhagyás:** Claude hagy jóvá önellenőrzés után, a tulajdonos szúrópróbáz és visszadobhat.
- **Cél:** egységes arculat, gyorsabb készítés, és a leckekészítő a lecke azonosítása után a bankból olvas.

Előzmény: az ikonkészlet (#274, 72 tantárgy × sáv ikon) és a mentéskori arculat (#275, `art = { subjectIcon, picture, mascot }`).

## Mérés (2026-10-17, csak olvasás)
- **Adatbázis:** 93 MB; a `design_assets` 108 képe 2,4 MB.
- **Szöveg-ismétlés** (24 publikált lecke, 2,53 millió karakter): szinte csak gépi adat ismétlődik (`sourceHash`, azonosítók,
  felsorolás-értékek). Valódi felirat-ismétlés 1% alatt van (pl. „Helyes.” 324×; „A leggyakoribb hibák” 11×).
  - Következmény: a feliratszótár szűk (visszajelzések és fejezetcímek). A bank haszna az arculat, nem a token.
  - A modellnek **nem** kell díszítőt választania: a választás determinisztikus (tantárgy, sáv, témakör, blokktípus).
- **A katalógus témakörei** (`catalog_items.topic_area`, 23 209 tétel): 172 név, szinonimákkal (pl. „Elektromosság” és
  „Elektromosságtan”), főleg a 3–8. évfolyamon. Borítókulcsnak alkalmatlan. Kell egy saját, rendezett témakör-taxonómia.
- **Régi örökség:** 11 leckében ott van a régi `experience.flair` adat; a lejátszó nem használja (élőben igazolva).

## Cél
1. **Témakör-taxonómia** (`shared/topic-taxonomy.ts`): minden tanított tantárgy × sáv párhoz 3–6 NAT 2020 szerinti
   témakör, kulccsal, címkével és ékezettűrő kulcsszavakkal.
   - Becslés: kb. 72 pár × 5 ≈ 360 témakör.
   - A besorolás tiszta függvény: `topicKeyOf(subject, classroom, title, catalogTopicArea?)`. Előbb a katalógus-témakör, aztán
     a cím kulcsszavai; ha nincs egyezés, `null`.
2. **Gyártás és jóváhagyás** (Seedream 5.0 Pro, a meglévő `generate.ts` és `approve.ts`):

   | Elem | Darab | Méret |
   |---|---|---|
   | témaköri borító `cover-<tantárgy>-<sáv>-<témakör>` | ≈ 360 | 3:2, 1200 px |
   | blokkjelző `marker-<blokktípus>-<sáv>` | 6 × 5 = 30 | 1:1, 256 px |
   | kabalapóz blokktípusonként `mascot-<blokktípus>` | 6 | 1:1, 512 px |
   | fejezetelválasztó `divider-<sáv>-<1|2>` | 10 | 8:1, 1600 px |

   - Összesen ≈ 406 kép; költség ≈ 37 USD és a referenciák.
   - Önellenőrzés áttekintő lapokon: nincs szöveg a képen, a stílus a sávé, nincs referenciamásolás, nincs két egyforma motívum.
3. **Adatbázis:** `migrations/0029`: a `design_assets.kind` CHECK bővül (`marker`, `divider`), és bekerül a `topic` mező
   (nullable). Az induláskori szinkron változatlanul tölt.
4. **Mentéskori választás** (`withLessonArt`): a `picture` elsőként a lecke témakörének borítója, ha az a táblában megvan;
   különben a mai rotáció. Az `art.topic` is mentődik.
5. **Lejátszó:**
   - A blokkjelző és a fejezetelválasztó a sávból és a blokktípusból adódik (tiszta függvény), a kép a
     `/api/design-assets/`-ről jön, katalógus-tartalékkal.
   - Az 1–5. évfolyamon a blokk mellett a blokktípus kabalapóza jelenik meg, legfeljebb egyszer fejezetenként (nem zsúfol).
   - Mindez a reszponzív eszközmátrixon (8 méret × 5 sáv) zöld marad.
6. **Feliratszótár** (`shared/lesson-captions.ts`): a visszajelzések („Helyes.” stb.) és a fejezetcímek kulccsal; a lejátszó
   innen jelenít meg. A régi `flair` a gyártásból kikerül (a mező a sémában olvasható marad a régi leckék miatt).
7. **Lefedettségi tesztek:**
   - minden taxonómia-témakörhöz van jóváhagyott borító;
   - minden blokktípus × sáv párhoz van jelző;
   - minden sávhoz 2 elválasztó.

## Nem-cél
- Képbank-kezelő admin felület (nem kért).
- A meglévő leckék `art`-jának pótlása: külön engedéllyel.
- A katalógus `topic_area` mezőjének átírása (csak olvassuk).

## Szeletek (PR-onként ≤ ~400 sor kód; a képek és a generált katalógus nem számít bele)
1. **S1:** taxonómia, besoroló és tesztjei; a borítók tételei a `prompts.json`-ban; gyártás, jóváhagyás, migráció 0029;
   a mentéskori témakör-borító.
2. **S2:** blokkjelzők és fejezetelválasztók: gyártás és lejátszó.
3. **S3:** kabalapózok blokktípusonként (1–5.).
4. **S4:** feliratszótár és a `flair` kivezetése a gyártásból.

## Szélső esetek
- **Ismeretlen témakör:** a mai rotáció (sávhős vagy tantárgyi borító).
- **Több témakör illik:** a katalógus-témakör nyer, utána a leghosszabb kulcsszó-egyezés; döntetlennél a taxonómia sorrendje.
- **Témazáró (több témakör):** a sáv hős-képe.
- **Hiányzó kép az adatbázisban:** a választás csak létező azonosítót ír; a lejátszó hibánál katalógus-tartalékra vált.
- **DB-méret:** ≈ 406 kép, becslés szerint ≈ 25–40 MB WebP-ben. A Neon-csomag kerete UNVERIFIED; az S1 előtt a valós
  méretet a 360 borító mintájából számoljuk, és túllépés-kockázatnál megállunk.

## Elfogadás (EARS)
- HA egy lecke témaköre besorolható, AKKOR mentéskor a lecke a témakör borítóját kapja, és a lejátszó azt az adatbázisból tölti.
- HA egy lecke blokkja megjelenik, AKKOR a blokktípus jelzője a lecke sávjáé.
- A lefedettségi tesztek szerint a taxonómia minden eleméhez, illetve minden blokktípus × sáv párhoz van jóváhagyott kép.
- A gyártott képeken nincs szöveg; az önellenőrzés áttekintő lapjai a PR-ban vannak, a tulajdonos szúrópróbázhat.
