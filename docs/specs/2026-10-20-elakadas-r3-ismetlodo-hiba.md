# R3 — ismétlődő hiba: nincs újabb, azonos javítókör a bankcsomagnál

Állapot: tulajdonosi kérés 2026-10-20 („fejezd be autonóm módon a teljes javítást … minden nyitott pontot”). Elemzés:
`docs/specs/2026-10-20-elakadas-gyokerok-elemzes.md` (4. pont, R3).

## Mérés / gyökérok
- **A javítókörök súlya:** a gyakorlóbank hívásainak 49 %-a javítókör (10 job telemetriája), és a javítókörökre jut a kimenet
  kb. 31 %-a.
- **A csomagépítő menete** (`server/studio/experience-builder.ts`, kísérleti ciklus):
  - csomagonként `PACKET_ATTEMPTS + PACKET_RESCUE_ATTEMPTS` (3 + 1) kísérlet;
  - tételhibánál már most tételszintű „JAVÍTÁSI MÓD” (a jó tételek megmaradnak — ez a terv R4-ének lényege, tehát megvan);
  - a hibás tételek kivétele (`salvagePacket`, `trimAnswerKeyFailures`) viszont CSAK az utolsó kísérletnél fut.
- **A következmény:** ha a modell egymás után kétszer PONTOSAN ugyanazokat a hibákat adja vissza, a javítás nem halad (a hiba a
  modell számára kijavíthatatlan — pl. a pontozó tévedése, #330). A maradék kísérletek mégis lefutnak (teljes Opus-hívások),
  és csak a végén jön a kivétel.
- **A minta** (doom-loop / stuck-detektálás): ugyanaz a hiba kétszer → nincs több azonos kör (OpenRouter Agent SDK: figyel 2-nél,
  blokkol 3-nál).

## Cél
- **Elakadás felismerése:** ha egy kísérlet hibalistája (rendezett, a sorszámtól független szöveg) PONTOSAN megegyezik az előző
  kísérletével, és a csomag sémahelyes, akkor a hibás tételek kivétele (`salvagePacket`, illetve válaszkulcs-hibánál
  `trimAnswerKeyFailures`) azonnal lefut — úgy, mintha az utolsó kísérlet volna.
- **Ha a kivétel sikerül:** a csomag kész, a maradék kísérlet elmarad; a napló jelzi („ismétlődő hiba — korai kivétel”).
- **Ha nem sikerül:** a ciklus a régi módon folytatódik (mentőmodell stb.).

## Nem-cél
- **A kísérletszám:** nem változik.
- **A kivétel szabályai** (padló, kvóta): nem változnak.
- **A csomagszintű (nem tétel) hiba ismétlődése:** marad a régi út; ott a mentőmodell segíthet.

## Elfogadás (EARS)
- **Azonos hiba:** HA két egymást követő kísérlet hibalistája azonos, és a hibás tételek kivehetők, AKKOR a csomag a 2. kísérlet
  után elkészül (nincs 3. és 4. hívás).
- **Eltérő hiba:** HA a hibalista eltér, AKKOR a viselkedés változatlan.
- **Régi viselkedés:** a meglévő banképítő-tesztek zöldek.

## Pontosítás a megvalósítás során (meglévő teszt alapján)
- **Küszöb:** az elakadás küszöbe HÁROM egymást követő azonos hibalista (`STUCK_SAME_ISSUE_RUNS = 3`; doom-loop: figyel 2-nél,
  blokkol 3-nál), nem kettő.
- **Miért:** a `tests/bank-repair.test.ts` „javító kör a gyakorlatban” esete mutatja, hogy két azonos kör még nem elakadás. A
  jogosultságon kívüli, figyelmen kívül hagyott csere után a 3. kör javíthat.
- **Megtakarítás:** a 4. (mentő, erős modellre irányítható) hívás.
- **Dokumentált specváltozás:** a `bank-salvage` és a `bank-answer-keys` teszt a 4 helyett 3 hívást vár; a szándék (a hibás tétel
  kikerül, a bank elkészül) változatlan.
