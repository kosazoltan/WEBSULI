# Ciklus 4 — a minta kifejezés-alakja és a számos referencia gépi javítása (modellkör nélkül)

Állapot: a 98 futás naplóbányászata. A bank javítóköreinek egy része olyan hiba, amelyet a program biztosan javíthat.

## Mérés
- **18 javítókör:** „a mintaválasz nem teljes pont … A helyes nyelvtani alak vagy szórend még hiányzik”. A modell `requiredPhrases`-e
  nem szerepel szó szerint (a pontozó v2-tokenjeivel) a saját mintájában.
- **3 javítókör:** „tasks.N.typedAnswers.N.value: Expected string, received number”.

## Cél (előfeldolgozó, `autofixBankPacket`)
1. **Minta-kifejezés:** ha egy kifejezéscsoport egyik alternatívája sincs meg pontosan a mintában, de a mintában van olyan egymás
   utáni, azonos hosszú szósor, amely a kifejezés szavait a pontozó tűrő illesztésével tartalmazza, ez a szósor (a minta alakjában)
   új alternatívaként a csoportba kerül. A minta a feladat saját, teljes pontos válasza, így ez a szándékolt alak.
2. **Szám → szöveg:** a `typedAnswers[].value` számértéke szöveggé alakul.

## Nem-cél
- **A sorrendi (minta ↔ `requiredOrder`) és a kvízmagyarázat-eltérés:** a szándék nem dönthető el gépileg.

## Elfogadás (EARS)
- HA a minta a kifejezést más (tűréssel egyező) alakban tartalmazza, AKKOR a javítás után a minta teljes pontot kap, a javítás naplózott.
- HA nincs ilyen szósor, AKKOR a csomag változatlan (a javítókör dönt).
- HA a `typedAnswers.value` szám, AKKOR szöveg lesz, azonos értékkel.
