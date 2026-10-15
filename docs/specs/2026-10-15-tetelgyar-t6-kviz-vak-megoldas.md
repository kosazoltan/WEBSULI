# Tételgyár T6 — a kvíz vak megoldása tételenként, gyártáskor — terv (2026-10-15)

Szülőterv: `docs/specs/2026-10-15-tetelgyar-bank-lektor-uj-modszertan.md` (3. fejezet 5. pont: „Kvíz vak megoldása tételenként (G6)”;
sorrend: T2 → T7 → **T6** → T5 → T3).

## Kódból és élő adatból ellenőrzött tények
- A bank-ellenőr (`server/studio/bank-verifier.ts`, Opus 5.5) ma a lektor lépésnél, a KÉSZ bankon ítél: egyválasztós tételnél opciónként
  igaz/hamis a kulcs ismerete nélkül, a KÓD dönt (`choiceVerdictProblem`: pontosan egy igaz, és az a kulcs). A lelet csak-bank javítókörbe
  vagy kapu-jelzésbe megy (`openChoiceFlags`).
- Mérés (csak olvasás, 2026-09-24 óta, 39 job): 319 kvíz-blokkoló jegyzet; a bank-ellenőr 274 kvízlelete 25 jobban, ebből 142 egyválasztós
  ítélet 13 jobban; 4 job kvízút miatt állt meg. Leggyakoribb: „0 helyes opció a független ítélet szerint” (82), „egyedül X igaz, nem a kulcs”.
- A bankgyártás csomagonként épül, 130%-os tartalékkal (T1); a T2 a tesztbukott feladatot a tartalék terhére veszi ki (`trimAnswerKeyFailures`).

## Cél
A kétértelmű vagy rossz kulcsú kvíztétel már a GYÁRTÁSKOR kiessen (a tartalék terhére, javítás nélkül), így a lektor/bank-ellenőr lépésnél
kevesebb kvízlelet, kevesebb csak-bank javítókör és kapu-megállás legyen.

## Nem-cél
- A bank-ellenőr (lektor lépés) megszüntetése — a végső ítélet ott marad.
- A kvíz sémájának vagy a gyerekfelületnek a változtatása.

## Szeletek
- **T6.0 mérés (kód nélkül):** egy olcsó modell (a T2 tesztírójának lánca, glm-5.3-flash elöl) opciónkénti ítélete a mentett bankok
  kvíztételein, összevetve az Opus bank-ellenőr meglévő egyválasztós leleteivel (ugyanazokon a tételeken). Mérőszámok: az Opus-leletek hány
  %-át fogja meg (felidézés), a nem jelölt tételek hány %-át jelöli hibásnak (téves riasztás), költség és idő.
- **T6.1 (a mérés után, döntéssel):** gyártáskori vak kvízmegoldás csomagonként; a bukott tétel kiesik a tartalék terhére (a padlóig), a
  maradék figyelmeztetés. A modellválasztás a mérésből: olcsó előszűrő, vagy az Opus ítélete gyártáskor (és a lektor lépés a már igazolt
  tételt nem ellenőrzi újra).

## Elfogadás (EARS)
- E1: HA a vak ítélet szerint nem pontosan a kulcs az egyetlen igaz opció, AKKOR a tétel nem kerül a bankba (amíg a padló engedi).
- E2: HA a vak megoldó hívása hibázik, AKKOR a csomag a T6 előtti szabályok szerint épül.
- E3: A gyerekfelület és a pontozás nem változik.
