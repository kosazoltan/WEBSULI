# Terv: az ingadozó „joystick-reakció: tsunami-english” mérő stabilizálása az okánál

> Állapot: megvalósítva helyben (2026-11-18); a CI-futás a push után · Ág: `test/joystick-tsunami-stabil` · Végrehajtás:
> `docs/specs/2026-11-18-joystick-tsunami-stabil-vegrehajtas.md` · Testvér-munka (külön ág, külön PR):
> `docs/specs/2026-11-18-ci-e2e-szeleteles.md`.

## 1. Probléma (mért tények)

A `source/tests/joystick-response.spec.ts` „joystick-reakció: tsunami-english” esete (a CI-naplóban `:741:3`) 2026-11-18-án két
PR kötelező „Playwright E2E” körét buktatta meg — mindkét bukás újabb teljes (~1,5 órás) kört jelentett:

| Futás | Kísérlet | Hiba |
|---|---|---|
| 44301362954, 1. kísérlet (#500) | 1. és 3. | **(a)** `locator.click: Timeout 5000ms` a `clearQuiz`-ben (`:391`): a gomb az ellenőrzéskor `data-state="idle"`, engedélyezett; a kattintás pillanatában a kérdés-sáv már `data-state="reveal"` (`data-tone="bad"`), a `play-question-card` fogja el az eseményt, a gomb letiltott, majd lecserélődik |
| 44301362954, 1. kísérlet (#500) | 2. | **(c)** `tsunami-english: teljes kitérés — Expected > 0, Received 0`: az 55%-os lépcsőben a bemenet 0,32, a mozgás 0; a 70 és a 100%-osban a bemenet 0 |
| 44317537385 (#504) | mindhárom | **(b)** `5 próbából sincs kérdés nélküli álló ablak — a render-szám nem mérhető` |

A zöld futásokban is látszik a feszültség: a render-ablakok száma 4–7 a szükséges 2 helyett (44321935761: 4, 44317092042: 4,
44308711704: 7), és a 44317092042 futásban a „rezgő” ablak lap-renderje 2 volt az „álló” 29-ével szemben — a mérő olyan ablakot
fogadott el, amelyben a játék nem futott.

## 2. Gyökérok (a főág kódjából)

A #483 (J1a) óta a Szökőár ütemezett kapukérdéseket ad: `tsunamiDirectorConfig` (`source/client/src/lib/tsunami/core.ts:196`)
— a kérdés-INDÍTÁSOK célköze 60000 / (5 × 1,1) × (1 − 0,25 × intenzitás) = **8,2–10,9 mp**
(`game-engine/play/questionDirector.ts:157-160`), a válaszablak 4. évfolyamon 5,6–9 mp, a megoldás-kijelzés hibás / lejárt válasznál
2 mp, helyesnél 0,9 mp (`game-engine/play/questionUi.ts:16-18`).

1. **(b) A render-ablak hosszabb, mint a kérdés nélküli szakasz.** A mérő egy 30 érintés-eseményes ablakot kér kérdés nélkül
   (`cleanHold`, `:563-572`). A CI-n egy ablak 2,8–7,0 mp (mért `stillMs` / `dragMs`: 3355 / 2760, 5192 / 5078, 4238 / 3025,
   6953 / 6967). Ha a kérdésre senki nem válaszol (a mérő az ablak alatt nem válaszol), a kérdés nélküli szakasz
   8,2…10,9 − (5,6 + 2) = **0,6–3,3 mp** — ebbe az ablak nem fér be. Tiszta ablak csak akkor jön létre, ha az ablak ELEJÉN éppen
   nyitott, élesített kérdés áll, amelyet az `ensurePlaying` → `clearQuiz` helyesen megválaszol: utána 8,2…10,9 − (válaszidő +
   0,9) ≈ 5,8–8,5 mp a kérdés nélküli szakasz. A mérő ezt a fázist nem keresi: a kérdéssel érintett ablak után véletlen
   pillanatban próbálkozik újra, ötször. Lassú futtatón (6–7 mp-es ablak) az ablak az igazított szakaszba sem fér be → mind az
   öt próba, mindhárom kísérletben bukik (#504).
2. **(a) Versenyhelyzet az állapotváltással.** A `clearQuiz` külön hívásban nézi meg, hogy a „jó válasz” gomb látható és
   engedélyezett-e (`:385-386`), majd feltétel nélkül kattint (`:391`). A két hívás között a kérdés lejárhat (vagy a tétlen
   átfutás eldöntheti): a sáv `reveal`-be vált, a gomb `aria-disabled`, a kártya elfogja a mutatóeseményt, majd a gomb a következő
   kérdés (még nem élesített, rejtett) gombjára cserélődik — a kattintás 5 mp után időtúllépéssel bukik. A körülötte álló
   várakozások időre várnak (500 / 1500 ms), nem állapotra.
3. **(c) A mérő nem ellenőrzi, hogy a játék az ablak / a lépcső alatt élt-e.** A kitérés nélkül vezetett futót a hullám
   utoléri (a tanító szakasz után minden ütközés viszi a rést; a teszt 0,5–2 percig fut), a kör véget ér, a tárcsa lecsatolódik
   (`TsunamiEscapeEnglish.tsx:2079`: csak `phase === "play"` alatt él; `:1170` a bemenetet nullázza). Az `ensurePlaying` csak a
   mérés ELŐTT nézi a tárcsát; ami a mérés ALATT ér véget, az „eredményként” megy tovább.
   - Render-ablaknál BIZONYÍTVA (helyben, CI-szerű késéssel, `JOY_CI_LAG_MS=200 JOY_CPU=2`, a javítás előtt 6 futásból 5 bukott:
     3× a (b) alak, 2× „a mozgás-események többlet-renderje a lapon: 64 / 45 > 6”): a „tiszta” álló ablak 33, a rezgő 95
     lap-rendert adott — az egyik álló, a másik élő játékon mért. A 44317092042 CI-futás 2 ↔ 29 párja ugyanennek a hamis zöldje.
   - Lépcsőnél VALÓSZÍNŰ ok (a CI-nyomkövetés nem maradt meg, nem bizonyított — UNVERIFIED): a 0 bemenet a lecsatolt tárcsa
     jele. A 100%-os lépcső 0 bemenetét ez az út nem magyarázza teljesen (az `ensurePlaying` a következő lépcső előtt új kört
     indít); ha a CI-n újra előjön, a bukott kísérlet nyomkövetését (`trace.zip`, a 2. kísérlettől készül) kell megnézni: a
     tárcsa a lépcső alatt a helyén volt-e, és mi volt az érintés pontja alatt.

## 3. Cél és nem-cél

**Cél:** a mérő állapotra várjon, ne időre és ne szerencsére: (1) kérdést csak nyitott, élesített állapotban válaszoljon meg, és
az állapotváltást ne hibaként kezelje; (2) a render-ablakot a kérdés nélküli szakaszhoz igazítsa, és akkora darabokban mérje,
amelyek abba beleférnek; (3) csak olyan ablakot / lépcsőt fogadjon el, amely alatt a játék végig élt. A mérés szigora nem változik.

**Nem-cél:** küszöbök (`≤ 2 / 3 képkocka`, `≤ 6 többlet-render`, `tárcsa ≤ lap + 2`), a 30 mozgás-esemény, a kitérések, a teszt
időkerete, a `retries` módosítása; termékkód (a Szökőár lapja, a kérdés-ütemező) módosítása; a `fix/szokoar-tema-es-sebesseg` ág;
a másik három játék mérési menete (náluk a render-ablak egy darab marad).

## 4. Megoldás (csak `source/tests/joystick-response.spec.ts`)

1. **`clearQuiz` állapot szerint.** Két lokátor: `correct` (a jó válasz gombja bármilyen állapotban) és `answerable` (ugyanez, de
   nem `aria-disabled` és nem `disabled`). Kattintás csak az `answerable`-re, rövid (2 mp) kerettel; ha a kattintás nem megy
   végbe, mert közben a kérdés eldőlt, az NEM hiba: a kör újraolvassa az állapotot. Megoldás-kijelzés alatt (látható, de nem
   megválaszolható) a következő állapotra vár (megválaszolható lett, eltűnt, vagy kártya jött); sikeres válasz után arra vár, hogy a
   megválaszolt kérdés eltűnjön. A mérés feltételei nem változnak: az állapotra várás UTÁN a korábbi rögzített várakozás (1500 ms a
   válasz, 500 ms a kártya bezárása óta) alsó korlátként megmarad — a lépcső soha nem indul korábban, mint eddig, csak a még
   látszó kérdésnél később. A körök száma korlátos marad.
2. **Render-ablak darabokban, a kérdés nélküli szakaszhoz igazítva (csak a Szökőárnál).** Új `GameSpec.renderChunks` (Szökőár:
   3; a többi játék: 1 = a mostani menet változatlanul). A 30 mozgás-esemény 3 × 10-re oszlik; az álló szakasz ugyanígy 3 részben
   fut, a rezgővel összemérhető hosszon (darabonként 10 × a mért érintés-idő). A darabok számlálói és hossza ÖSSZEADÓDNAK; az
   arányosítás és a küszöbök az összegre vonatkoznak (30 esemény, ≤ 6 többlet-render — változatlan). A számláló-olvasás minden
   darabban a lenyomás és az első elmozdulás UTÁN nyit és a felengedés ELŐTT zár (ahogy eddig), ezért a darabolás nem ad a
   mérésbe húzás-kezdeti / -végi rendert.
3. **Igazítás (csak a darabolt játéknál).** MINDEN darab előtt a mérő megvárja a KÖVETKEZŐ megválaszolható kérdést (állapot; felső
   korlát 16 mp = az ütemező 15 mp-es legnagyobb köze + 1), helyesen megválaszolja, megvárja, hogy a kérdés-jel eltűnjön, és
   onnan indítja a darabot — ez a leghosszabb kérdés nélküli szakasz eleje, és így minden álló és rezgő darab ugyanabban a
   játékfázisban fut (a lap render-üteme a fázistól függ; az első, csak a kérdéssel érintett darab után igazító változat helyben
   −3…+4 többletet adott a 6-os küszöb mellett). Ha a korláton belül nem jön kérdés, a darab így is elindul. Egy darab legfeljebb
   5-ször ismételhető (a korábbi „ablakonként legfeljebb 5×” szabály a darabra). A nem darabolt játékoknál nincs igazítás: a
   kérdéssel érintett ablak ismétlése a korábbi (azonnali) úton megy.
4. **Élő játék az ablak / a lépcső alatt.** A render-ablak képkockánkénti figyelője a kérdés-jel mellett azt is jelzi, ha a tárcsa
   az ablak alatt bármikor eltűnt (a kör véget ért); az ilyen darab nem mérési eredmény: ismétlés (az `ensurePlaying` új kört
   indít). A lépcsőnél a záró olvasás ugyanabban a lap-hívásban jelzi, hogy a tárcsa még él-e; ha nem, a lépcső ismétlődik (a
   meglévő, legfeljebb háromszori ismétlési úton). Ez szigorítás: a mérő eddig elfogadott álló játékon mért ablakot is.
## 5. Kockázatok

| Kockázat | Kezelés |
|---|---|
| A darabolás megváltoztatja a mérést | Az események száma (30), a kitérés, a rezgés mintája, a küszöbök és az arányosítás azonosak; a számláló a húzás belsejében nyit / zár. Helyben az 1-darabos és a 3-darabos menet eredménye összevetve (végrehajtás 4. lépés). A másik három játéknál `renderChunks: 1` — a menetük bájtra azonos úton fut. |
| A `clearQuiz` változása a másik három játékot is érinti | Mind a négy játék helyben, CI-azonos úton (szoftveres WebGL, buildelt szerver, egy worker) többször lefuttatva. |
| Hosszabb teszt | Darabonként egy kérdésciklus (8–11 mp): a Szökőár render-szakasza a mostani 4–7 véletlen ablak (~20–45 mp) helyett 6 igazított darab (~55–65 mp). A 240 mp-es keret nem változik; a helyben mért tesztidő a PR-leírásban. |
| A Szökőár egy másik ágon átépül | A javítás csak a mérőben van, a lap `data-correct` / `aria-disabled` jeleire és a tárcsa meglétére épít (közös játékkeret) — az ütemezés számai a mérőben nincsenek beégetve, csak a 16 mp-es felső korlát. |
| A CI-n nem futott | NOT RUN a push előtt; helyben CI-szerű késéssel (`JOY_CI_LAG_MS`, `JOY_CPU`) és anélkül is mérve. |

## 6. Elfogadás

<!-- acceptance-checklist -->

- [x] J1 — Reprodukció a javítás ELŐTT: CI-szerű késéssel a teszt helyben bukik (parancs + kimenet a PR-leírásban).
      (mért: `JOY_CI_LAG_MS=200 JOY_CPU=2`, 6 futásból 5 bukott)
- [x] J2 — A javítás UTÁN `--repeat-each=10 --workers=1`, CI-azonos úton: 10 / 10 zöld (késés nélkül).
      (mért: 10 passed, 14,9 perc; futásonként pontosan 6 darab, ismétlés nélkül; többlet-render −3…+2)
- [x] J3 — A javítás UTÁN CI-szerű késéssel is zöld (ugyanazzal a paranccsal, amely előtte bukott). (mért: 4 / 4, 10,8 perc)
- [x] J4 — Mind a négy játék joystick-mérője zöld helyben (a `clearQuiz` közös). (mért: 2 × 4 játék, 8 / 8, 12,0 perc)
- [x] J5 — A küszöbök, az események száma, a teszt időkerete és a `retries` változatlan (`git diff` a spec-fájlra: nincs módosított
      `expect`, `setTimeout`, küszöbszám).
- [ ] J6 — `npm run gate:stage` és `npm run gate:push` zöld a munkafa gyökeréből.
