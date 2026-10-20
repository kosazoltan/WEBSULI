# S3b — a „fordított irányú” válaszkulcs-hiba azonnali kivétele (nincs hiábavaló javítókör)

Állapot: tulajdonosi jóváhagyás (az erőforrás-elemzés S3b pontja, 2026-10-19; „fejezd be autonóm módon … minden nyitott pontot”,
2026-10-20). Előzmény: R3 (#333).

## Mérés (éles, csak olvasva, 10 nap)
- **A javítókörök aránya:** a gyakorlóbank hívásainak 49 %-a javítókör.
- **A javítókörök okai** (a futások `skillFindings` / `unknownFindingSamples` mezői): az animator (bank) állomás „unknown” hibái
  közül 90 mintából kb. 55: „válaszkulcs-teszt: a hibás (fordított irány) válasz […] teljes pontot kap — a rubrika túl
  megengedő”.
- **Gyökérok:**
  - a nyílt feladat pontozója kulcsszó-alapú és SORRENDVAK (`shared/lesson-experience-score.ts`: ÉS-csoportok, csoporton belül
    VAGY, sorrend nincs);
  - az „A okozza B-t” és a „B okozza A-t” válasz ugyanazokat a kulcsszavakat tartalmazza, ezért egy szinonimacsoport-rubrika ezt
    szerkezetileg NEM tudja megkülönböztetni;
  - a modell a javítókörben nem javíthatja (újrafogalmaz, de a rubrika sorrendvak marad), és a feladat végül az utolsó
    kísérletnél úgyis kikerül (`trimAnswerKeyFailures`, a tartalék terhére).

## Cél
- **Azonnali kivétel:** ha egy kísérlet MINDEN hibája válaszkulcs-hiba, és mind „fordított irány” fajtájú, akkor a tesztbukott
  feladatok kivétele azonnal fut (mint az R3 korai kivételénél).
  - **Feltétel:** minden bukott feladat kikerül, és a maradék csomag érvényes (`quotaAndValidate`).
  - **Ha teljesül:** a csomag kész, a javítókör elmarad (`bank-stuck` jelzés: „fordított irány — azonnali kivétel”).
  - **Ha nem:** a régi út (javítókör).
- **Vegyes hibalistánál** (más hiba is van): a régi út.

## Nem-cél
- **A pontozó sorrendérzékennyé tétele:** ez más rubrika-formátumot igényelne — később, külön döntés.
- **A tartalék mérete és a minimumok:** nem változnak.

## Mérés a kitelepítés után
- Az egyfutásos telemetria `stations.gyakorlóbank.fixTurns / turns` aránya a következő gyártásokban (alapvonal: 49 %).

## Elfogadás (EARS)
- **Csak fordított irány:** HA egy csomag egyetlen hibája egy „fordított irány” válaszkulcs-bukás, és a tartalékból kivehető,
  AKKOR a csomag az 1. kísérlet után elkészül (nincs 2. hívás).
- **Más hiba is:** HA a hibák között más is van, AKKOR a javítókör a régi.
- **Kivétel nem lehetséges:** HA a kivétel a padló alá vinne, AKKOR a javítókör a régi.
