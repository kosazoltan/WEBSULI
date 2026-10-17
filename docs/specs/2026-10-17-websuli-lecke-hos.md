# Websuli lecke-hős és sávfejléc a képkészletből — terv

**Forrás:** `docs/design/Websuli_Grafikai_Szabalyterv.md`. Ez annak 5/3. szelete (lecke-hős és sávfejléc), és felhasználja az 5/2.
szelet jóváhagyott képkészletét (`shared/design-assets.json`, `docs/specs/2026-10-17-websuli-kepkeszlet.md`). Hatókör a tulajdonosi
döntés szerint: előbb a lecke-lejátszó.

## Cél
A lecke teteje a koncepciókép oszlopfejének és hős-kártyájának mintájára készül el.

1. **Sávfejléc** a mostani felső sáv helyett.
   - Ikonjelvény: 56 px-es kör, főszín kitöltés, fehér jelkép.
   - Évfolyam a mért címszínnel.
   - A téma neve és a hármas mottó, a szabályterv 1.2 szerint:

     | Sáv | Mottó |
     |---|---|
     | 1–2. | Kíváncsiság • Játék • Alapok |
     | 3–5. | Fedezz fel • Próbáld ki • Fejlődj |
     | 6–8. | Gondolkodj • Alkoss • Oldj meg |
     | 9–10. | Elemezz • Kísérletezz • Valósítsd meg |
     | 11–12. | Tudás • Célok • Lehetőségek |
2. **Lecke-hős kép** a mostani három rögzített rajz (`LessonCoverArt`) helyett.
   - A katalógusból választ a `pickLessonArt(lesson)`. A választás tiszta, tesztelt függvény, sorrendben:
     - a tárgy és a lecke kulcsszavai alapján illeszkedő **borító**;
     - ha nincs ilyen, a sáv **hős-képe**;
     - ha az sincs, a meglévő rajzos tartalék.
   - A kép mindig kap alt szöveget a katalógusból.
3. **Kabala-buborék** az 1–5. évfolyamon (explorer, adventure).
   - A jóváhagyott kabala-kép mellett fehér szóbuborék, sötét szöveggel.
   - 1–2.: „Szia! Ma is felfedezünk valami újat!”; 3–5.: „Minden lépés egy új felfedezés!”, a koncepcióképről.
   - A 6–12. évfolyamon nincs kabala.
4. **Tárgyikon** a tantárgy-címke mellett.
   - Ha a katalógusban van ilyen ikon: 1–5. évfolyamon a `-young` változat, 6–12.-en a másik.
   - Ha nincs, nem jelenik meg ikon.

## Nem-cél
- Horog és tanulási célok mező. Séma- és pipeline-változás, külön szelet.
- Ikoncsempés fülek, tanulási kártyák. Ezek az 5/4. és 5/5. szelet.
- A tanulói keret.

## Rögzített döntések
- **Képek:** csak a katalógusból. Külső kép nincs. `loading="eager"` a hősön, `decoding="async"`; a képarányt a CSS rögzíti, így az
  oldal nem ugrál.
- **Szöveg a képen:** nincs. A cím a képen kívül, a kártyán áll, így a kontraszt a meglévő mért tokeneken múlik. Ezért nincs szükség
  sötétítő rétegre.
- **Hiányzó kép** (még nem jóváhagyott sáv): a meglévő rajzos tartalék (`LessonCoverArt`), hiba nélkül.
- **Mozgás:** nincs.

## Szélső esetek
- **Régi lecke `experience` nélkül:** ugyanúgy kap képet. A borító a `data-cover` jelölés szerint van jelen.
- **Mobil (390 px):** a kép a cím fölé kerül, teljes szélességben, 16:9 vagy 3:2 aránnyal. Vízszintes kilógás nincs.
- **11–12. sötét téma:** a kép sötét panelen jelenik meg. A fejléc szövegei a mért tokeneket használják.

## Elfogadás (EARS)
- HA a lecke tárgyához és kulcsszavaihoz van borító a katalógusban, AKKOR a hős azt mutatja, a katalógus alt szövegével; különben a
  sáv hős-képét; ha az sincs, a rajzos tartalékot.
- HA az évfolyam 1–5, AKKOR a kabala és a sáv buboréka látszik; 6–12-nél nem.
- A sávfejléc mutatja: ikonjelvény, évfolyam, téma neve, hármas mottó. Minden szövege ≥ 4,5:1 a ténylegesen mért háttéren.
- Mind az öt sávban, 390 / 768 / 1440 px-en: nincs kilógás, a kép betöltődik (`naturalWidth > 0`), képernyőkép készül.

## Kiegészítés (2026-10-17): változatos képválasztás
**Tulajdonosi döntés:** mind a 36 kép jóváhagyva. A leckék a tárgyukhoz és a korosztályukhoz illő képek közül változatosan kapjanak
képet.

- **Determinisztikus választás:** a lecke azonosítója alapján történik (FNV-1a lenyomat, ha nincs azonosító, akkor a cím). Ugyanaz a
  lecke mindig ugyanazt a képet mutatja; különböző leckék között a képek rotálnak.
- **Korosztály:** a fiatal (`explorer`, `adventure`) és az idősebb (`studio`, `laboratory`, `future`) sávok képei nem keverednek. Ha a
  kulcsszavas borító csak a másik korosztályból van, azt is használhatja.
- **Kép:**
  - ha van kulcsszavas borító, az illeszkedő borítók közül rotál;
  - különben a sáv hős-képe és az azonos korosztályú, azonos tárgyú borítók közül.
- **Kabala:** az 1–5. évfolyamon a kabala pózai közül rotál, a 3–5. évfolyamon a felfedező pózzal együtt.
- **Elfogadás:**
  - ugyanarra az azonosítóra a választás stabil;
  - 20 különböző azonosító legalább 2 különböző képet ad egy tárgyra;
  - a választott kép mindig a lecke korosztályához tartozik, kivéve a kulcsszavas, csak a másik korosztályban meglévő borítót.
