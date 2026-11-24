# Végrehajtás: a 12 variációs tengely (tananyag-változatosság, 2026-11-24)

Forrás: tulajdonosi döntés, 2026-11-24 (űrlap): **„Mind a 12, szakaszolva”**, élesben **azonnal minden új leckére**. Kutatási minták:
- **H5P** (45+ tartalomtípus: kártyafordító, kiemelés, sorba rendezés, elágazó történet, keresztrejtvény);
- **Oppia** (beszélgetős kártyafelépítés, tippek);
- **Khan Academy Perseus** (kb. 30 interaktív elem: kategorizáló, számegyenes, becslés).

Alap: a `docs/specs/2026-11-20-tgm-valtozatossag-abrak.md` lánc. Az S5a–S6c szeletek beolvadtak. Élesítésük a V0-ban: `docs/specs/2026-11-24-valtozatossag-alapbol-be.md`.

| # | Tengely | Állapot / szelet |
|---|---|---|
| 1 | Fejezetváz-készlet | kész (S6a, hat minta) |
| 2 | Nyitásformák | kész (S5b); bővítés: kihívás, képtalálós, „híres történet” → **V1** |
| 3 | Új interaktív feladatok: igaz/hamis sorozat, szókiemelés, kategorizálás, számegyenesre helyezés, becslés csúszkával | **V2** (két rész: séma + megjelenítő + pontozó; gyártási prompt + kapu) |
| 4 | Kártyaformák: fordítókártya, lépésenkénti felfedés, „Tudtad?”, összehasonlító tábla, idővonal-kártya | **V3** |
| 5 | Elágazó mini-történet | részben kész (`decisionStory` ábra); döntés–következmény feladat → **V3** |
| 6 | Témakontextus a példákban (sport, űr, állatok, játék, főzés) | **V1** (determinisztikus kiosztás a lecke azonosítójából) |
| 7 | Narrátor / szerzői hang | kész (S6b) |
| 8 | Összefoglaló formák (gondolattérkép, 3-2-1, „Tanítsd meg a barátodnak!”, villámkártyák) | **V1** (szöveges formák); villámkártya → **V3** |
| 9 | Kvízkérdés-típusok keverése (többválasztós, igaz/hamis, képválasztós, beírós szám) | **V4** |
| 10 | Ritmus- és hosszvariáció | **V1** (fejezethossz-sáv a vázzal) |
| 11 | Játékos elemek: fejezetvégi „boss-kérdés”, sorozatjelvény | **V5** |
| 12 | Szókereső, keresztrejtvény (szókincsleckék) | **V5** |

Közös szabályok minden szeletre:
- a kiosztás determinisztikus (a lecke azonosítójából számolt mag);
- a gyártási kapu ellenőrzi, hogy két egymás utáni lecke ne kapja ugyanazt a vázat, és hogy fejezetenként legalább N különböző blokktípus legyen;
- az új blokkfajták a tárolt leckében engedékenyen olvasódnak, a régi kliens a nem ismert fajtát kihagyja;
- minden szelet a szokásos kapulánccal megy.
