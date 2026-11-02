# Az évfolyamsávos arculat látható — a Csendes nézet nem ragad be, telítettebb sávháttér

Állapot: tulajdonosi hibajelzés 2026-10-19.
> „nincs színbeli különbség a … évfolyamok között … az összes tananyag egyszínű, fehér alapú”

A tulajdonos telefonos képernyőképei: 4., 6. és 9. osztály.

## Mérés
- **Mit mutatnak a képek:** mindhárom évfolyamon ugyanaz a palettás kép.
  - törtfehér háttér `#F7F6F2`;
  - palaszürke jelvény `#384F68`;
  - halványított borítókép.
  - Ez pontosan a **Csendes nézet** palettája (`client/src/lesson-runtime/lesson-design.css`, `:has(.fusion-view[data-quiet="true"])`).
- **Ugyanezek a leckék alapállapotban** (Playwright, websuli.vip, 2026-10-19) sávonként színezettek:
  - 4–5. o.: `#FFF0D2`;
  - 6–7. o.: `#EFEFFF`;
  - 9. o.: `#E6F3FF`.

## Gyökérok
1. **A Csendes nézet beragad, és nem látszik, hogy be van kapcsolva.**
   - Állapota EGY közös `localStorage` kulcsban él (`websuli:learning-quiet`), minden leckére.
   - A gomb felirata mindkét állapotban „Csendes nézet”. Bekapcsolt állapotban a háttere a csendes palettában `#EEEFEA` a
     `#FFFEFA` mellett, ami gyakorlatilag láthatatlan.
   - Egy (akár véletlen) érintés után tehát minden lecke végleg egyszínű, és a felhasználó ezt nem látja.
2. **A színes nézet is túl halvány a koncepcióképhez képest.**
   - A szabályterv (`docs/design/Websuli_Grafikai_Szabalyterv.md` 1.2, „Háttér” sor; 2. pont `--ws-hero-from` / `--ws-hero-to`)
     sávonkénti színátmenetet ír elő: halványzöld → krém, homok → barack, levendula → halványlila, jégkék → fehér, sötét éjkék.
   - A design-rendszer tokenjei (`docs/design/design-system/project/tokens.json`) két kísérőszínt is adnak (`accent-2`, `accent-3`).
   - A lejátszóba egyik sem került be: a háttér a halvány alapfelületből FEHÉRBE fut, a kártyák fehérek.

## Cél
1. **Csendes nézet:**
   - A gomb felirata és kinézete az állapotot mutatja: kikapcsolva „Csendes nézet”, bekapcsolva „Színes nézet”, a
     sáv-színű, jól látható gombbal.
   - Új tárolókulcs (`websuli:learning-quiet-v2`): a régi, láthatatlanul beragadt érték egyszer elengedődik, mindenki színes
     nézettel indul.
2. **Sávháttér:** új tokenek: `--ws-hero-from`, `--ws-hero-to`, `--ws-accent-2`, `--ws-accent-3`.
   - A gyökér háttere a két végpont közti színátmenet, fehérbe futás nélkül.
   - A kártyák (blokk, feladat, módszer) felső szegélye 4 px-es sávszín.
   - A fejezetszám-jelvény a sáv főszíne.
   - Mért értékek; minden szövegpár ≥ 4,5:1 a két végponton:

     | Sáv | Színátmenet | Szöveg / halvány szöveg (legrosszabb) |
     |---|---|---|
     | explorer | `#C9EDC0` → `#FBF6DC` | 7,88 / 5,27 |
     | adventure | `#F9D9A6` → `#FFD9C2` | 6,59 / 5,78 |
     | studio | `#D9D6FF` → `#EEE2FF` | 8,95 / 5,33 |
     | laboratory | `#C9E3F8` → `#F3F9FF` | 8,64 / 5,57 |
     | future | `#0B1A2E` → `#1D3557` | 11,50 / 7,82 |
3. **Minden stúdiós lecke** ezt kapja, adatmódosítás nélkül: a téma a lecke évfolyamából, megjelenítéskor jön
   (`designThemeForClassroom`).

## Nem-cél
- A sávhatárok változtatása.
  - A tulajdonos hat csoportot sorolt (1–2., 3–4., 5–6., 7–8., 9–10., 11–12.), a mellékelt koncepciókép és a szabályterv ötöt
    (1–2., 3–5., 6–8., 9–10., 11–12.). A kép az irányadó, a hat csoportra bontás külön döntés.
- Lábléc-szalag, alsó navigáció, haladás-kártyák (a szabályterv képi rétege, külön szelet).

## Elfogadás (EARS)
- **Kezdőállapot:** HA a régi kulcsban `true` áll, AKKOR a lecke színes nézettel nyílik.
- **Bekapcsolt állapot:** HA a Csendes nézet be van kapcsolva, AKKOR a gomb felirata „Színes nézet”, és a gomb kitöltése a
  `--ws-strong` szín.
- **Háttér:** HA a lecke 1–2. / 3–5. / 6–8. / 9–10. / 11–12. évfolyamos, AKKOR a gyökér háttere a sáv `hero-from` → `hero-to`
  színátmenete.
  - A sávok páronként eltérő háttérszínt adnak (böngészős mérés), nincs kilógás 390 és 1440 px-en.
- **Kontraszt:** a szöveg- és a halvány szövegszín a két végponton ≥ 4,5:1 (egységteszt).
