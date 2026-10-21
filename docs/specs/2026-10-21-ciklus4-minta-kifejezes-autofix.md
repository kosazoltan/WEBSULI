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

## Kiegészítés (2026-10-21 08:16): félbevágott emoji → elutasított API-kérés
- **Mérés:** a „Felszín és Térfogat – 5. osztály” 2/2 kísérlete: `400 invalid_request_error: The request body is not valid JSON: unexpected end of hex escape`. Ok: a szöveg-vágások (`.slice()`) egy emoji karakterpárját kettévágják; a magányos fél-karakter (`\uD83E`) érvényes JS-szöveg, de a szigorú JSON-olvasó elutasítja (igazolva).
- **Cél:** a modellhívás határán (`conversation.ts`, Anthropic és OpenAI kliens) minden szöveg (rendszer + blokkok) érvényes UTF-16-ra tisztul: a magányos fél-karakter `U+FFFD` lesz. Node-verziótól független regex.

## Kiegészítés (2026-10-21 08:25): mojibake-őr (tulajdonosi kérés)
- **Vizsgálat (csak olvasás):** a repó (kód, promptok, AGENTS/CLAUDE, docs, skillek), valamint az adatbázis — 137 publikált lecke, 77 régi anyag, 214 cím / leírás, 3 rendszerprompt, 23 209 katalógustétel, 169 memóriakártya, 6155 fogalom, 33 kvízelem — **mojibake-mentes**. Az egyetlen U+FFFD szándékos (a fél-karakter-védelem a `scripts/content-review/lib.ts`-ben).
- **Tartós őr:** a `tests/mojibake-guard.test.ts` minden CI-futáson vizsgálja a kódot, a promptokat, a szabályokat, a skilleket és a dokumentációt (a minták karakterkódból épülnek; önellenőrzéssel).
