# Ciklus 6 — a lektor által kifogásolt gépi csoport ne kerüljön vissza + a két elakadt anyag célzott újragyártása

**Mért (5. ciklus, `lektorArchive`, 50 blokkoló jegyzet):** 11 „túl szigorú” (helyes válasz nem kap teljes pontot). A „Tulajdonságot
kifejező szavak” 2× elbukott: a lektor a S3d csoportos szigorítás (`coverGroup`) önkényes mintaszó-csoportját kifogásolta
(`["egy","megsimogatta","hópihéket","kiscica","barack"]`), a javítás után a jegyzet „javítatlan” maradt. Ok: a lektori bankjavítás után
a `calibrateRubric` az új csomagon újra lefut, és a hibás próba miatt ugyanazt a csoportot ismét hozzáadja.

## Cél
1. A lektori javítókörben (a `reviewFeedback` által érintett feladat-azonosítókra) a `coverGroup` nem fut — a lektor ítélete erősebb.
2. A két elakadt anyag (A főnév; Tulajdonságot kifejező szavak) egyszeri, célzott utasítással újra sorra kerül (tulajdonosi döntés 2026-10-21).
3. Ciklus-kapu 127 → 132.

## Nem-cél
A `coverGroup` általános átalakítása (a lektor nélküli első építésben marad — ott mért haszna van: javítókör 3,72 → 0,75).

## Edge case-ek
A lektor nélküli építés változatlan; a kifogásolt feladat SZÓ- és kifejezés-szigorítása marad; az újragyártás egyszer (redo-jelző).

## Elfogadás (EARS)
- HA a feladat a lektori javítókörben kifogásolt, AKKOR a kalibráció nem ad hozzá csoportos (`szigorítás (csoport)`) követelményt.
- HA a sorelem hibás ÉS az anyag a célzott újragyártási listán van ÉS még nem gyártottuk újra, AKKOR egyszer újra sorba kerül a célzott utasítással.
