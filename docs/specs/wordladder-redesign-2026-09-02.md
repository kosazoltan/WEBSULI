# Spec — Szólétra (WordLadderHuEn) grafikai és játékélmény-újratervezés (2026-09-02)

## Miről szól a játék (a kódból kiolvasva)
Magyar–angol szókincs-kvíz: a gyerek egy létrán mászik, minden helyes négyválasztós kérdés
egy fokkal feljebb visz (+XP, sorozat/láng), a hibás válasz egy fokot vissza. 22 fok, a
kérdések nehézségi sávokban (könnyű 8 / közepes 8 / nehéz 6) jönnek; a tananyagokból és a
szerver kvízbankjából is kap kérdést. A tetején "CÉL". XP, legjobb sorozat localStorage-ban;
szerver-pontszám, jelvények, napi kihívás — ezek maradnak.

## Brainstorming — 3 irány, döntés
1. **Csak csinosítás** (SVG-létra, emoji, konfetti): olcsó, de a fő élmény-hibát (a kvíz
   eltakarja a létrát; nincs helyes-válasz visszajelzés) nem oldja meg.
2. **Elrendezés + pedagógia újratervezés** (VÁLASZTOTT): a kvíz a létra MELLETT, a mászás
   végig látható; hibánál a helyes válasz zölden felvillan (tanulás); zónás létra
   (rét → erdő → felhők → csillagok), mérföldkő-üzenetek, kedves karakter, ünneplés.
3. **Canvas-játék** (fizika, ugrálás): sok kód, több hibalehetőség, a tanulási cél nem javul.

## Cél
Egy 7–11 éves gyerek számára vonzóbb, érthetőbb és tanulságosabb Szólétra, a meglévő
pontszám/jelvény/szinkron-logika és a kérdésbank változatlan megtartásával.

## Nem-cél
- Nem változik: kérdésbank, XP-képlet, szerver-pontszám küldés, jelvények, napi kihívás,
  hang-motor, osztály-kapu, ranglista.
- Nem lesz canvas/WebGL; nincs új függőség (framer-motion, lucide már van).

## Változások

### Játékmenet
- **16 fok** (6 könnyű / 5 közepes / 5 nehéz) — a 22 egy alsósnak túl hosszú; a queue-építő
  paraméteres marad (a hosszú-kör építés változatlanul több szeletet fűz).
- **Válasz-visszajelzés**: kattintás után a gombok 900 ms-ig mutatják: választott hibás =
  piros + ✗, helyes = zöld + ✓ (mindig, hibás választásnál is → a gyerek látja a jó szót);
  ezalatt a gombok letiltva. Utána jön a lépés-animáció és a következő kérdés.
- **Hiba**: a figura egy fokot "megcsúszik" (wobble), rövid bátorító üzenet
  ("Hoppá! A jó válasz: …"). A 0. fokról nem lehet lejjebb csúszni.
- **Mérföldkövek**: zónaváltáskor (5., 10., 15. fok) 1,5 mp-es felirat ("🌲 Elérted az
  erdőt!", "☁️ Fel a felhők közé!", "⭐ Csillagok között — mindjárt fent vagy!").
- **Sorozat**: 3-as és 5-ös sorozatnál felirat ("🔥 3-as sorozat!"), a láng-ikon nő.
- **Cél**: konfetti-eső (CSS-részecskék, 40 db, 2,5 mp), zászló 🏁, "Elérted a csúcsot!".
- Marad: időmérő, R = újra, hang, XP/sorozat fejléc.

### Grafika
- **Létra**: SVG — két sín, fokok; a fokok a zónák szerint színezettek; a megmászott fokok
  kiemelve (világosabb), a következő fok pulzál.
- **Zónák háttere**: a teljes játékháttér a fok szerint tolódik (rét zöld → erdő kékeszöld →
  felhők kék → csillagos éjkék), lágy átmenettel (CSS transition 800 ms), a zónában
  dekoráció: 🌼🌳 / 🌲🍄 / ☁️🐦 / ⭐🌙 (position: absolute, pointer-events: none).
- **Karakter**: kerek fejű, mosolygó mászó (SVG, nem téglalapok), spring-animációval ugrik
  fel, hibánál billen; sorozat ≥ 3-nál kis láng a hátán.
- **Kvíz-panel**: a létra jobbján, kártyán belül (nem fixed modal, nincs backdrop-blur), nagy
  gombok (min. 44px), emoji-mentes, jól olvasható 16–18px szöveg.
- **Mobil** (< 640px): létra keskeny (72px) bal oldalt, a kvíz mellette; a gombok
  egyoszloposak; a zóna-dekoráció ritkább.

### Kód-szerkezet
- `client/src/lib/wordLadderLogic.ts` (tiszta, tesztelt): zóna-számítás, mérföldkő-
  detektálás, XP-képlet, következő fok, bátorító üzenet választás.
- `client/src/pages/WordLadderHuEn.tsx`: a JSX és az állapotgép frissül; a kérdésbank és a
  szinkron-effektek változatlanok.
- Új teszt: `tests/word-ladder-logic.test.ts`.

## Edge case-ek
- 0. fokon hibázás → marad a 0. fokon, üzenet "Kapaszkodj, nem estél le!".
- Gyors dupla kattintás → a meglévő `answerLockedRef` véd; a felfedés alatt a gombok disabled.
- Kérdés-készlet kifogyása → a meglévő bővítés (buildLongRunQueue) marad.
- Unmount a felfedés/lépés alatt → a meglévő timeoutsRef/stepTimerRef cleanup.
- `prefers-reduced-motion` → konfetti és háttér-animáció kikapcsolva.

## Elfogadás (EARS)
- WHEN a gyerek hibás választ ad, THEN 900 ms-ig látja zölden a helyes választ és pirosan a
  sajátját, majd a figura egy fokot lecsúszik (0-nál marad).
- WHEN helyes a válasz, THEN a figura felugrik, +XP, a következő kérdés a létra mellett jön.
- WHEN a fok eléri az 5/10/15-öt, THEN mérföldkő-felirat és háttér-zónaváltás.
- WHEN eléri a 16. fokot, THEN "won" fázis, konfetti, pontszám-küldés (változatlan).
- `wordLadderLogic` unit tesztek zöldek; tsc 0; eslint 0 error; build OK; böngészőben
  végigjátszva legalább egy zónaváltásig, képernyőképpel.
