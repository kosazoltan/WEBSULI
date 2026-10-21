# Ciklus 4 — a minta kifejezés-alakja és a számos referencia gépi javítása (modellkör nélkül)

Állapot: a 98 futás naplóbányászata. A bank javítóköreinek egy része olyan hiba, amelyet a program biztosan javíthat.

## Mérés
- **18 javítókör:** „a mintaválasz nem teljes pont … A helyes nyelvtani alak vagy szórend még hiányzik”. A modell `requiredPhrases`-e
  nem szerepel szó szerint (a pontozó v2-tokenjeivel) a saját mintájában.
- **3 javítókör:** „tasks.N.typedAnswers.N.value: Expected string, received number”.

## Cél (előfeldolgozó, `autofixBankPacket`)
1. **Minta-kifejezés (felülvizsgált döntés):** gépi javítás NEM lesz. A v2-normalizálás már elnyeli a kis- és nagybetűt, az
   ékezetet és az írásjelet, így ha a kifejezés a mintában pontosan nincs meg, a szavak valóban különböznek (nyelvtani eltérés). A
   tűrő illesztéssel a hibás minta-alak kerülne a pontos rubrikába. Helyette **célzott diagnózis**: a javítókör üzenete megnevezi a
   mintából pontosan hiányzó kifejezéscsoportokat és a sorrendi eltérést. Eddig csak a fogalmakat nevezte meg, a modell ezért
   ugyanarra a feladatra többször is javítókört futott (s9-t8, s8-t2).
2. **Szám → szöveg:** a `typedAnswers[].value` számértéke szöveggé alakul.

## Nem-cél
- **A sorrendi (minta ↔ `requiredOrder`) és a kvízmagyarázat-eltérés:** a szándék nem dönthető el gépileg.

## Elfogadás (EARS)
- HA a minta a kifejezést más (tűréssel egyező) alakban tartalmazza, AKKOR a javítás után a minta teljes pontot kap, a javítás naplózott.
- HA nincs ilyen szósor, AKKOR a csomag változatlan (a javítókör dönt).
- HA a `typedAnswers.value` szám, AKKOR szöveg lesz, azonos értékkel.

## Kiegészítés (2026-10-21 07:45): a lektori jegyzetek archívuma
- **Mérés:** a lektori kivétel 2,25 tétel / anyag (98 futás), szinte mind nyílt feladat — az OKUK nem maradt meg (csak az útvonal a figyelmeztetésben).
- **Cél:** a lektor blokkoló jegyzetei körönként a job kimenetébe (`lektorArchive`: kör, fajta, alfajta, útvonal, üzenet; legfeljebb 200, az üzenet 600 karakterre vágva), hogy a kivételek oka offline elemezhető legyen.
