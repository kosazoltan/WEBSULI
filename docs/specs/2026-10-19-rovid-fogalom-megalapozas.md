# Rövid (1–2 betűs) fogalomnév megalapozása — a „Where I Live” gyártás gyökéroka

Állapot: tulajdonosi kérés 2026-10-19 („keresd meg a gyökérokot, hogy mi … nem működik se a gyártás, se az okosítás, se a
javítás”). Ez a szelet a GYÁRTÁS gyökérokát javítja; az okosítás és a javítás külön szelet.

## Mérés (éles, csak olvasva)
- Ma három „Feltöltött forrás” futás bukott ugyanazon a kapun:
  - 639b5201: 9 nem megalapozott címke;
  - 6f1158ce: 6 nem megalapozott címke („article-a („a”) a(z) 46. explain blokkon …”);
  - 55736ce3: „2 kulcsfogalmat egyetlen blokk sem tanít: article-a, article-an” — a javítókörben a szerző inkább levette a címkét.
- A térkép (`km_concepts`) fogalmai:
  - `article-a`: term „a”, quote „a = before consonant sounds: a lamp, a sofa”;
  - `article-an`: term „an”, quote „an = before vowel sounds: an armchair, an orange”;
  - `article-the`: term „the” — ez átmegy.

## Gyökérok (fájl:sor)
- **A rövid szavak kiszűrése:** `server/studio/grounding.ts` `significantWords` csak a ≥ 3 betűs szavakat tartja meg, így „a” és
  „an” esetén a szólista üres.
- **A korai visszatérés:** üres szólistánál és képlet nélkül a `checkGrounding` azonnal visszatér. Igazat csak akkor ad, ha a
  kifejezés legalább KÉT szó, és szó szerint benne van a blokkban.
- **A következmény:** egy egyszavas, 1–2 betűs fogalom (angol névelő vagy elöljáró: a, an, in, on, at, to) SOHA nem lehet
  megalapozott. A definíció alapú tartalék és a forrásidézet alapú tartalék kódja le sem fut, így a lecke semmilyen tartalommal
  nem mehet át.

## Cél
1. **Továbbengedés:** üres érdemi szólistánál a kétszavas kifejezés-egyezés megmarad. Ha az nem dönt, a vizsgálat NEM tér
   vissza hamissal, hanem a meglévő tartalékokkal folytatódik:
   - a definíció érdemi szavai (fele, min. 2);
   - a forrásidézet számai.
2. **Új tartalék rövid névre — a forrás saját példája:**
   - a forrásidézet (`quote`) vesszővel / kettősponttal / pontosvesszővel tagolt szakaszai közül azok, amelyek a rövid nevet
     önálló szóként tartalmazzák, és legalább két szóból állnak (pl. „a lamp”, „an armchair”);
   - ha ezek közül legalább egy szóhatárosan szerepel a blokkban, a címke megalapozott.

## Nem-cél
- Az érdemi szavak 3 betűs küszöbe, a „minden szó” konjunkció, a képlet-ág — változatlan.
- Az okosítás / javítás hibái (külön szelet).

## Edge case-ek
- **Magyar szövegben előforduló „a”:** a puszta „a” névelő a magyar szövegben nem elég. Kell a forrás példája („a lamp”) vagy a
  definíció szavainak fele.
- **Rövidítés-fogalom** („Kr. u. / i. sz.”): a kétszavas kifejezés-egyezés marad. Ha az nem talál, a definíció-tartalék
  dönthet — ugyanaz a mérce, mint a többi fogalomnál.
- **Üres term** (régi sor): a `groundingReport` ezeket nem adja ide (változatlan).

## Elfogadás (EARS)
- **Forráspélda:** HA a fogalom neve „an”, az idézet „an = before vowel sounds: an armchair, an orange”, és a blokk az
  „an armchair” példát tanítja, AKKOR a címke megalapozott.
- **Definíció:** HA a fogalom neve „a”, és a blokk a definíció szavainak felét tartalmazza, AKKOR a címke megalapozott.
- **Más téma:** HA a blokk más témáról szól, és csak a magyar „a” névelő van benne, AKKOR a címke NEM megalapozott.
- **Régi viselkedés:** a meglévő grounding-tesztek zöldek.
