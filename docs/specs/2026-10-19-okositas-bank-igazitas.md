# HTML-okosítás: a záró kapu gépi rubrika-igazítása és célzott újrapróba — az okosítás gyökéroka

Állapot: tulajdonosi kérés 2026-10-19 („keresd meg a gyökérokot … se a gyártás, se az okosítás, se a javítás”).
- A gyártás gyökéroka külön szelet: `2026-10-19-rovid-fogalom-megalapozas`.
- A javítás 09:48-as megszakadása (c74c38f9, kitelepítés közben) az S1-ben javítva (#324).

## Mérés (éles, csak olvasva)
- Az elmúlt 7 napban 2 HTML-okosítás futott, mindkettő a záró kapun bukott:
  - **1e169ace** („4. osztály – Who's vs Whose”, angol): 12 feladatnál „a saját mintaválasz nem kap teljes pontot”.
  - **a0d16870** („4. osztály – Tört részek és mértékek”): „A nyílt bank mérete, írásos vagy szóbeli változata hiányos”, és a
    t26 mintaválasza.
- A tárolt hiba a MÁSODIK próbáé (a tartalék modellé). A bukott jelölt nem maradt meg.

## Gyökérok (fájl:sor)
1. **Nincs gépi igazítás a HTML-ágon.**
   - A Stúdió-ág a kapu előtt determinisztikusan a saját mintájához igazítja a rubrikát (`server/studio/bank-normalize.ts`
     `alignTaskToSample`, hívója az `experience-builder.ts` `normalizeBankPacket`-je).
   - Az okosítás (`server/improveAsync.ts`, a `verifyLessonMethodHtml` előtt) ezt nem hívja. Egyetlen ellentmondó minta 45+
     feladatból elbuktatja a teljes futást.
2. **Vak újrapróba.**
   - Kapubukáskor a tartalék modell nulláról generál (`processImprovementJob` → `processImprovementCore` `isOutputRetry`).
   - A felhasználói prompt nem tartalmazza az első próba hibalistáját, így ugyanazokat a hibákat ismételheti.
3. **Kétértelmű bankszerződés a HTML-promptban.**
   - A `shared/lesson-html-data.ts` `HTML_LESSON_DATA_CONTRACT` szerint: „legalább egy oral és egy written”.
   - A séma (`shared/lesson-experience.ts`) viszont CSOMAGONKÉNT méri a szóbeli és az írásos feladatot (és a
     max(2, fogalomszám) darabot).

## Cél
1. **Gépi igazítás a kapu előtt:** a kiolvasott JSON-bank minden nyílt feladatára lefut az `alignTaskToSample`, és az
   eredményt a `writeHtmlLessonData` írja vissza.
   - A HTML többi bájtja változatlan.
   - Olvashatatlan bank esetén nem nyúl semmihez (a kapu jelenti).
2. **Célzott újrapróba:** a tartalék modell felhasználói promptja megkapja az első próba záró kapujának hibalistáját (legfeljebb
   4000 karakter) „ezeket javítsd” utasítással.
3. **Egyértelmű szerződés:** a HTML-szerződés kimondja, hogy MINDEN bankcsomagban (bankPlan-egységben) legalább
   max(2, fogalomszám) nyílt feladat kell, köztük legalább egy oral és egy written.

## Nem-cél
- **A pontozó és a minimumok:** a pontozó, a szószám-küszöb és a darabszám-minimumok változatlanok (nem lazítunk a mércén).
- **Tételenkénti modell-javítókör:** a HTML-ágon ez nagyobb munka, külön szelet, ha a mérés szerint kell.
- **A bukott jelölt diagnosztikai mentése:** külön szelet.

## Edge case-ek
- **Típusos feladat:** az `alignTaskToSample` nem nyúl hozzá (változatlan szabály).
- **Rövid minta:** a szószám-küszöb nem csökken.
- **Hiányos rubrika:** ha a feladatnak nincs `required` tömbje vagy `sample` szövege, kihagyjuk.

## Elfogadás (EARS)
- **Igazítás:** HA a bank egy feladatának mintája csak ragozott alakban tartalmazza a kötelező fogalmat, AKKOR a kapu előtt a
  rubrika kiegészül, és a kapu nem jelez mintaválasz-hibát.
- **Változatlan HTML:** HA az igazítás fut, AKKOR a HTML a JSON-bankon kívül bájtra azonos.
- **Hibalista az újrapróbában:** HA az első próba a kapun bukik, AKKOR a tartalék prompt tartalmazza a hibalistát.
- **Szerződés:** a HTML-szerződésben szerepel a csomagonkénti oral / written szabály.
