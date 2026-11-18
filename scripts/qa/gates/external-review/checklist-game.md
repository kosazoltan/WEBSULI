# Kötelező ellenőrzőlista — játékszelet (J-hullám)

Forrás: a 2026-11-17-i független review-k ismétlődő leletei (#482 J7a, #483 J1a, #484 J3a, #485 J5a, #486 J6a, #487, J7b).
Minden pontnál írd le: TELJESÜL / SÉRÜL (fájl:sor + forgatókönyv) / NEM ELLENŐRIZHETŐ a kapott anyagból.

## (a) Véletlen válasz — a legsúlyosabb, ismétlődő hibatípus
1. Számít-e válasznak olyan bemenet, amely mögött nincs olvasás / szándék? Keresd meg MINDEN utat, amely `onAnswer` / `answer` / `pick*` / `choose*` jellegű hívást vált ki (vászon-`pointerup`, sugár-találat, ütközés, lövedék-találat, megállás, áthaladás, időzítő), és mindegyiknél nézd meg az alábbiakat.
2. Élesítés: a cél (kapu, kő, ketrec, kristály, gomb) a kérdés MEGJELENÉSE után legalább 400 ms-ig nem fogad választ (KSZ-11: ≥ 400 ms előjelzés). Ellenőrizd, hogy az időt a tényleges megjelenéstől (első kirajzolt képkocka) méri-e, nem a kérdés kiválasztásától.
3. A kérdés ELŐTT indult bemenet (tartott tűz, folyamatban lévő bányászás, már repülő lövedék, tartott joystick, mozgásban lévő vadász) nem válaszolhat (pl. lövedék `bornAt ≥ shownAt`).
4. Húzás ≠ koppintás: a célon vagy gombon KEZDŐDŐ / VÉGZŐDŐ húzás (joystick, kameraforgatás) nem koppintás. Gyanús minta: `inside || notMoved`, vagy a `pointerup` a célon húzástól függetlenül.
5. A játék-gesztus (bányászás, lövés, ugrás, kitérés) nem válasz: ugyanaz a mozdulat nem lehet egyszerre játékművelet és választás.
6. Passzív átfutás / időtúllépés: a szándék nélküli kimenet a tanulási nyilvántartásban „nem válaszolt”, nem „rossz” és nem „jó”; nem kerül az ismétlési sorba rosszként, és nem torzítja az áramlat- / nehézség-jelet.
7. Kétszeres válasz (ugyanarra a kérdésre két esemény) kizárt-e.

## (b) Kupon / lecke-jutalom mód
8. Kis leckével (kevés tétel) elfogy-e a kérdés? Mi történik utána: beragad, kérdés nélkül ad pontot / győzelmet, vagy a közös director szabálya szerint jár el (ismétlés / megtartás)?
9. A lejárt kupon minden kuponos játékot megállít-e (#477), és a megállítás nem oldódik-e fel más ok miatt.

## (c) Olvashatóság — levágott válasz
10. A leghosszabb tananyag-válaszok TELJES szöveggel olvashatók-e (nincs `line-clamp` / `max-width` / `text-overflow` csonkítás kiolvasási lehetőség nélkül; a „Mutasd” a válaszokat is kibontja).
11. A beférés-ellenőrzés a cél VALÓDI szélességével számol-e (ketrec, kapu-tábla, kristály), nem egy rögzített becsült értékkel; 360×640, 390×844 és fekvő 844×390 nézetben.
12. A kérdés-elemek nem takarják-e el a játékost / a pályát / a célt (fekvő nézet!).

## (d) Szimuláció ≠ lap
13. A szimuláció ugyanazt a magot, directort, kérdés-sávot és szabályt hajtja-e, mint a lap (nem saját, egyszerűsített másolatot). Ami a lapon van, de a sim-ből hiányzik (pickupok, bányászás, mozgás, kamera, tárcsa, pálya-tempó), azt sorold fel: a sim-ből vont egyensúly-állítás arra nem bizonyíték.
14. Emberi reakcióidővel modellez-e (nem azonnali válasz), és több seeddel.
15. A pontosabb játékos nem veszíthet többet: a jó válasz soha nem nehezíti a pályát a rossz válaszhoz képest, és a kérdéssel játszott menet nem rosszabb, mint kérdés nélkül.

## (e) Győzelem ↔ vereség
16. A győzelem után (főellenfél legyőzése, cél elérése) a „finish” késleltetés alatt bekövetkező esemény (utolsó élet elvesztése, lejárat) nem írhatja át vereségre — és fordítva. Keress `setGameWon`, `endRun`, `finishRunAfter`, `runOverRef` jellegű kettős utakat.
17. Ugyanabban a lépésben bekövetkező győzelem + lejárat dokumentált és determinisztikus.

## (f) Megállítási okok
18. A szünet / kérdés / lejárt idő / háttérbe kerülés / WebGL-elvesztés / modális réteg megállítási okok egymást nem oldják fel (pl. „Folytatás” a szünetből nem indítja el a lejárt kuponos játékot; a `glLost` alatt nem jár az óra). Okonkénti számláló vagy halmaz, nem egyetlen boolean.

## (g) Nehézség
19. A pálya / világ nehézségét (sűrűség, sebesség, ellenfél) nem a kérdés-sáv állapota hajtja (különben a rossz válasz könnyít, a jó nehezít). A nehézség a játékidőből / szintből jöjjön.

## (h) Tesztek
20. Gyengült-e, törlődött-e, kapott-e `skip` / `only`-t teszt? Lett-e lazább küszöb indoklás nélkül?
21. Vannak-e forrásszöveget néző „tesztek” (regex a forráskódra, `readFileSync(...).includes(...)`) viselkedési teszt helyett? Ezek nem bizonyítják a működést.
22. Tautologikus teszt (a ciklusváltozó nem szerepel az állításban; ugyanazt a hívást ellenőrzi többször).
23. A K.4 kapu `[x]`-szel jelölt pontjai mögött tényleg van-e bizonyíték a kapott anyagban.

## (i) Közös fájlok
24. A szelet hatókörén kívüli közös fájlt (game-engine, questionUi, pointerTap, közös director, szóbank, szerver) módosít-e? Ha igen: regresszió a többi játékban (hívók listája), és szerepel-e a specben.

## Általános (AGENTS.md „Review guidelines”)
25. Adatszerződés a lépések között: mezőnevek, formátumok, típusok (kliens ↔ szerver ↔ shared).
26. Biztonság és adatvédelem: token / titok / személyes adat URL-ben, naplóban, linkben; CSRF / origin; mellékhatás GET-en.
27. Regresszió: névtelen látogató, bejelentkezett felhasználó, régi anyag, Stúdió-lecke.
28. Időzóna és dátumhatár (Europe/Budapest).
29. Migráció ↔ Drizzle-séma egyezés.
30. Indítás / cron / leállítás és e2e-mód.
31. Teljesítmény: képkockánkénti allokáció / closure / React-állapotfrissítés a forró hurokban; teljes újraépítés eseményenként; memóriaszivárgás (eseményfigyelők, WebGL-erőforrások felszabadítása).
