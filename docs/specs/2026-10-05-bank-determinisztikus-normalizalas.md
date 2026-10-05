# Bank: determinisztikus normalizálás a modell-javítókörök helyett (tulajdonosi utasítás, 2026-10-05)

Tulajdonosi utasítás (kötelező érvényű): „keress másik irányú javítási megoldást” — a 3 napos foltozás után.

## Mért kiindulás (5 élő futás, 2026-10-05: live7, live8, live9, live-ido, live-ido2)
- 54 bukott bankcsomag-kísérlet: 29 „a mintaválasz nem teljes pont”, 27 „Ismétlődő kérdés egy korábbi csomaggal”, 5 javítási
  jogosultság/azonosító-hiba. Mindegyik modell-javítókört (és orkesztrátor-elemzést) indított; a live-ido2-ben a keret elfogyott.
- A két megállás közül az egyik hamis kapu-lelet volt: a csak rövidítésből álló fogalom („Kr. u. / i. sz.”) érdemi szólistája üres
  (`significantWords` ≥ 3 betű), ezért a blokk szó szerinti „Kr. u. / i. sz.” szövege mellett is „megalapozatlan” (job 5b33202a).

## Cél
1. A GÉPIES bankhibát a kód javítja, modellhívás nélkül, a csomag ellenőrzése előtt (`server/studio/bank-normalize.ts`):
   - a mintában RAGOZVA szereplő kötelező alak („30 évnyi” ↔ „30 év”, „magra” ↔ „mag”) a szinonimacsoportba kerül;
   - az ismétlődő kérdés (feladat/kvíz) kikerül, a csomag minimális darabszáma alá soha.
2. A csak rövidítésből álló fogalom megalapozottsága: a teljes kifejezés (≥ 2 szó) szóhatáros előfordulása dönt (`grounding.ts`).

## Nem-cél (a meglévő követelmények VÁLTOZATLANOK)
- A szószám-küszöb (`minWords`) SOHA nem csökken; a rövid minta a modell-javítókörben marad.
- A javíthatatlan tétel a meglévő hibaúton (javítókör → mentőkör → kivétel) marad; a gyerekhez hibás tétel nem jut.
- A mintában nem szereplő fogalom nem kerül a rubrikába (a rubrika nem lazul vakon); a hiányos válasz továbbra sem teljes pont.

## Spec-változás a meglévő tesztekben (csak a MECHANIZMUS; a követelmény-állítások maradnak)
- `tests/lesson-experience.test.ts` „rubric repair names the exact missing short-word group…”: a „magra” alakot a kód pótolja, ezért
  nincs modell-javítókör (`calls === 1`); a követelmény-állítások (a minta teljes pont, „gyökér” egyedül 0, `experienceProblems` üres)
  változatlanok. A javítókör üzenetét (a hiányzó csoport megnevezése, „ne töröld a hiányzó fogalmat”) ÚJ teszt őrzi arra az esetre,
  amikor a minta a fogalmat valóban nem tartalmazza.
- „élő mérés 2026-09-24 (run 9c0169b7): az ismétlődő kérdés…”: az ismétlődő kérdést a kód veszi ki (van tartalék a minimum felett),
  ezért nincs javítókör; a követelmény („nincs ismétlődő kérdés”) változatlan. A minimum-közeli esetet (nincs mit kivenni → a régi,
  megnevező javítókör) a `tests/bank-normalize.test.ts` őrzi.

## Elfogadás (EARS)
- HA a minta a kötelező alakot ragozva tartalmazza, AKKOR a csomag modellhívás nélkül érvényes.
- HA egy kérdés korábbi csomagban már szerepel ÉS van tartalék, AKKOR kikerül; ha nincs, a régi javítókör dönt.
- A „Kr. u. / i. sz.” fogalom a szó szerinti előfordulással megalapozott; magányos betű nem.
- Teljes unit, tsc (app + tests), lint zöld; új élő futás a tulajdonos 4 történelem-lapján.
