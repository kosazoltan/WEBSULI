# Ciklus 3 — a kategóriakvóta sémahibáinak gépi javítása (modellkör nélkül)

Állapot: a 98 futás naplóbányászata (`scratchpad/mine-logs.mjs`). A bank 366 javítókörének egy része tiszta sémahiba, amelyet a
modell javítókörrel (teljes csomag újraírása, kimeneti token) javított.

## Mérés
- **`requiredDistinct` ismétlődés:** „A kategória elemei (szinonimái) nem ismétlődhetnek csoportok között” — 7 javítókör.
- **Üres `required` felsoroló (kvótás) feladatnál:** „tasks.N.required: Array must contain at least 1 element” — 7 javítókör.

## Cél
- **Az előfeldolgozó (`autofixBankPacket`), modellkör nélkül:**
  1. a kvóta csoportjai közt ismétlődő elem csak az első csoportban marad, az üres csoport kiesik. A `count` SOHA nem csökken (review
     #354: a kérdés követelménye) — ha a szűrés után kevesebb különböző csoport marad, a sémahiba a javítókörre marad (tartalmi pótlás);
  2. a kvótás feladat üres `required`-je a kvóta bármely elemét elfogadó egy csoport (a kvótát a `requiredDistinct` méri).
- **Kvóta nélkül** az üres `required`-hez nem nyúl (az valódi hiba marad).

## Elfogadás (EARS)
- HA a kvóta csoportjai közt ismétlődés van, AKKOR a javított kvóta sémahelyes, és a javítás naplózott.
- HA a kvótás feladat `required`-je üres, AKKOR a `required` a kvóta elemeiből áll; kvóta nélkül nem változik.
