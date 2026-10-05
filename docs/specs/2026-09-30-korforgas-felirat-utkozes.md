# Körforgás-ábra: a fázisfelirat nem csúszhat a számozott körre (2026-09-30)

## Kiváltó ok (élő mérés, 2026-09-30, 1280 px)
Mezopotámia-lecke (`bdcddf67`) 2. fejezet, `animKind: "cycle"`, center „Mezopotámia”, négy fázis:
„Áradás előrejelzése”, „Tavaszi áradás”, „Száraz időszak”, „Tavak és csatornák”. A kétsoros fázisfelirat
rácsúszott a számozott színes körre (az ábrát a leckéből kézzel kivettük).

## Gyökérok (a kódból, `source/client/src/lesson-runtime/blocks/explanatory-visuals.tsx`, `CycleAnim`)
- A felirat helye rögzített: `R + node + 14/16` a sugár irányában, `twoLines(label, 9 | 6)` tördeléssel.
- Oldalsó fázisnál, ha a becsült szélesség (≈ 0,62 em/betű) nem fér ki a 400-as rajzterületen, a kód
  **befelé** tolja: `lx = Math.min(lx, W - 4 - widest)` — egy 12 betűs szó („előrejelzése” ≈ 119 egység)
  így a 304-es x-en ülő, 22-es sugarú kör fölé kerül.
- Felül/alul a kétsoros felirat a `ly` körül **középre** igazodik, így a második sor lefelé, a kör és a
  jobb felső sarokban ülő számjelvény (r = 13) felé nyúlik.
- Semmilyen ütközésvizsgálat nincs (körök, jelvények, középfelirat, egymás közti feliratok).

## Cél
A fázisfelirat a saját körének külső oldalára kerül, a sugár irányában, `node + margó` távolságra; ha ott
ütközne (rajzterület széle, bármelyik kör vagy jelvény, a középső felirat/Föld-kör, másik felirat, a
nyilas gyűrű), akkor eltolódik: először kifelé és a kör körül elfordulva, végül a gyűrű sugara csökken.

## Nem-cél
- A `?visuals=1` mérőlecke öt ábrájának és a `tests/explanatory-visuals.spec.ts`-nek a módosítása (TILOS).
- A többi ábrafajta (labeledShape, barChart, venn, numberLine) módosítása.
- A betűméret csökkentése, a `viewBox` szélesítése (mindkettő a telefonos olvashatóságot rontaná — a
  meglévő teszt ≥ 11,5 px-et mér 360 px-en).
- A Mezopotámia-lecke élő visszaírása (külön, kézi lépés; nem része ennek a kódváltozásnak).
- A séma (`cycleParamsSchema`) vagy a szerveroldali kapu módosítása.

## Rögzített döntések
1. **Tiszta elrendező függvény**: `layoutCycle(labels, center, hasMoon)` (exportált, ugyanabban a fájlban)
   → `{ R, node, labels: [{ lines, x, y }] }`; a komponens csak rajzol.
2. **Becsült dobozok** (böngészőmérés nélkül, determinisztikus): szélesség = leghosszabb sor × 16 × 0,62;
   magasság = (sorok − 1) × 24 + 22 (felső 17, alsó 5 egység az alapvonalhoz képest). A felirat
   `textAnchor="middle"` a doboz közepén, így a valós (keskenyebb) szöveg mindig a dobozon belül marad.
3. **Tördelés** változatlan elv: oldalt (|cos a| ≥ 0,3) legfeljebb 6, felül/alul 9 karakteres sorcél.
4. **Jelöltek**: a doboz a kör középpontjától `d = node + 8 (+0/6/12)` távolságra, `θ = a + eltérés`
   irányban, ahol az eltérés 0, ±15°, …, ±90°. A doboz középpontja `node + u·(d + s)`, ahol
   `s = |cos θ|·w/2 + |sin θ|·h/2` (így a doboz minden pontja ≥ d-re van a kör középpontjától).
   Rangsor: `|eltérés|/15 + többlet/6`, holtversenyben a felsorolás sorrendje.
5. **Kemény feltételek** (margó 1–2 egység): a rajzterületen belül; nem metsz egyetlen fázis-kört vagy
   számjelvényt; nem metszi a középső felirat dobozát (holdábránál a Föld-kört sem); nem metsz korábban
   elhelyezett feliratot. **Gyűrű-feltétel**: a doboz legközelebbi pontja a középponttól ≥ R + 4 (a felirat
   nem lóg bele a nyilas gyűrűbe).
6. **Visszalépés**: R = 104-től 4-esével `Rmin`-ig (a középső felirat + a szomszédos körök távolsága szabja
   meg) minden feliratot elhelyez a gyűrű-feltétellel → az első teljes siker nyer. Ha nincs ilyen:
   ugyanez a gyűrű-feltétel nélkül. Ha az sem: R = 104 és a legkisebb átfedésű jelölt (sosem dob hibát,
   sosem hagy ki feliratot).
7. **Új mérőminta**: `?cycle-long=1` a `LessonRuntimeProbe.tsx`-ben — a Mezopotámia négy fázisa
   (center „Mezopotámia”) és egy hatfázisú, hosszú feliratú víz-körforgás. A `?visuals=1` változatlan.
8. **Új teszt**: `tests/cycle-labels.spec.ts` (360/390/1280 px) + helyi `playwright.cycle-labels.config.ts`
   (alap baseURL `http://127.0.0.1:5188`, a port `CYCLE_PROBE_PORT`-tal felülírható, mert az 5188-at más
   checkout is foglalhatja).

## Edge case-ek
- 3 fázis (120°-os lépés), 12 fázis (`node = 18`), holdábra (8 fázis, Föld-kör + „Föld” a körön belül).
- Egyetlen, törhetetlen hosszú szó (≤ 40 karakter a séma szerint) — ha semmi sem fér, a 6. döntés
  harmadik lépcsője a legkisebb átfedésű helyet adja (nem omlik össze).
- Center nélküli ábra: `Rmin` csak a körök távolságából.

## Elfogadás (EARS)
- **E1** WHEN a `?cycle-long=1` mérőlecke 360, 390 vagy 1280 px szélességen renderel, THEN egyetlen
  fázisfelirat (és a középső felirat) valós `getBoundingClientRect` doboza SHALL NOT metszeni egyetlen
  `<circle>` elemet sem (fázis-kör, számjelvény, Föld-kör).
- **E2** Ugyanott SHALL NOT: levágott felirat (az SVG dobozán kívül), egymást fedő feliratok,
  vízszintes görgetősáv; a legkisebb betű ≥ 11,5 px.
- **E3** Minden fázisfelirat SHALL a saját köréhez legközelebb esni (a legközelebbi fázis-kör a sajátja).
- **E4** A `tests/explanatory-visuals.spec.ts` változatlanul zöld (a holdciklus 7 megvilágított fázisa
  megmarad).
- **E5** Az új spec a javítás előtti kódon SHALL bukni (E1-re), utána zöld.
- **E6** `npx tsc --noEmit`, `npm run lint` hibátlan.

## Finomítás — review #199 (2026-10-05, dokumentált spec-változás)
Három igazolt P2-lelet a `layoutCycle`-ben; a fenti döntések ezekkel pontosulnak:
1. **Mennyiségi átfedés-mérték (6. döntés 3. lépcsője).** A „legkisebb átfedés” eddig az első, a
   *legkevesebb feltételt* sértő jelölt volt. Most mennyiség: `hit` = behatolási mélységek összege
   egységben (kilógás a rajzterületből + `kör/jelvény r + 2 − távolság` + feliratdobozok behatolása
   (2 egység réssel) + gyűrű-feltételnél `R + 4 − távolság`). `hit = 0` ⇔ minden kemény feltétel teljesül.
   A tartalék feliratonként a legkisebb `hit`-ű jelöltet adja (törhetetlen, ≤ 40 karakteres szónál számít).
2. **Saját kör a legközelebbi (E3 a kemény feltételek között).** `stray` = feliratsoronként (sor közepe:
   `top + k·24 + 11`) Σ max(0, d(saját kör) + 2 − d(másik kör)). Pontos elfogadás: `hit = 0` ÉS `stray = 0`.
   Ha így semmilyen sugáron nincs hely, egy **`drift`** lépcső jön a 3. lépcső előtt: csak `hit = 0`
   jelölt, feliratonként a legkisebb `stray`, a gyűrűsugarak (gyűrű-feltétellel, majd nélküle) közül a
   legkisebb összes `stray`. Ok: a takarás/levágás rosszabb, mint az elcsúszás. A 3. lépcső (`overlap`)
   lexikografikusan a legkisebb (`hit`, `stray`) jelöltet adja. Az eredmény `fit` mezője:
   `"exact" | "drift" | "overlap"`. Mért eset (review): 8 fázis, center „Középpont”, hét „A” és a 6. helyen
   „Párolgás a tengerből” — a jelöltrácsban nincs elcsúszás-mentes hely (a folytonos keresés szerint is csak
   R = 76–84-en, a szélhez ≤ 2 egységre és a kör + 8 margónál közelebb volna), ezért `drift`: R = 88, egy
   sor csúszik (a régi kód R = 104-en mindkét sort a szomszéd kör mellé tette és pontosnak fogadta el).
3. **Nyílhézag-korlát a gyűrűsugárra.** A nyíl mindkét végén `(node + 8)/R` szöghézag van; ha a kettő
   eléri a `2π/n` fázisközt, az ív visszafelé fordul. Ezért a 6. döntés sugárlistájába csak
   `R > n·(node + 8)/π` kerülhet (12 fázisnál ≈ 99,3; 8 fázisnál ≈ 76,4); `R_MAX = 104` minden n ≤ 12-re
   megfelel. Mért régi hiba: 8 fázis/R = 76 (ív −0,3) és 9 fázis/R = 64 (ív −7,3 egység).

### Elfogadás (kiegészítés)
- **E7** WHEN `layoutCycle` bármely 3–12 fázisú bemenetre fut, THEN `R·2π/n − 2·(node + 8)` SHALL > 0.
- **E8** WHEN `fit = "exact"`, THEN minden feliratsor közepe SHALL a saját fázis-köréhez legközelebb esni;
  WHEN `fit ∈ {exact, drift}`, THEN nincs kilógás, kör-/jelvény- és feliratátfedés.
- **E9** WHEN `fit = "overlap"`, THEN minden felirat `hit`-je SHALL ≤ bármely spec-jelöltjéé (4. döntés
  rácsa, a korábban elhelyezett feliratokkal).
- Ellenőrzés: `tests/cycle-layout.test.ts` (unit, a spec geometriájából függetlenül újraszámolva; a régi
  kódon bukik) + a változatlan `tests/cycle-labels.spec.ts` és `tests/explanatory-visuals.spec.ts`.
