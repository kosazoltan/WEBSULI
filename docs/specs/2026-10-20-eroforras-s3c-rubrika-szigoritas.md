# S3c — gépi rubrika-szigorítás: a teljes pontot kapó hibás válasz kizárása modellhívás nélkül

Állapot: tulajdonosi jóváhagyás (az erőforrás-elemzés S3b pontja; „fejezd be autonóm módon … minden nyitott pontot”, 2026-10-20).
Az S3b (#337) első változata lezárva: a review (Codex) igazolta, hogy a blokkoló „fordított irányú” válaszkulcs-bukások
rubrikával JAVÍTHATÓK. A modell irányszót cserél: „csökken” a „nő” helyett. A valóban sorrendvak eseteket pedig a J1 ág
(`shared/answer-key-tests.ts`) már ma sem blokkolja. Ez a szelet a helyes megoldás.

## Mérés (éles, 10 nap)
- **A javítókörök aránya:** a gyakorlóbank hívásainak 49 %-a javítókör.
- **A fő ok:** az animator „unknown” hibáinak 90 mintájából kb. 55 „válaszkulcs-teszt: a hibás (fordított irány) válasz …
  teljes pontot kap — a rubrika túl megengedő”. Továbbá tévhit / hiányos / témaidegen változatok.

## Gyökérok (fájl:sor)
- **Csak lazítás:** a gépi kalibráció (`shared/answer-key-calibrate.ts` `calibrateRubric`) csak LAZÍT — a helyes válasz alakját
  felveszi, csoportot bónuszba sorol, mondatfeltételt és szóminimumot old.
- **Korai kilépés:** ha bármely HIBÁS válasz teljes pontot kap, az elején kilép (`!guardHolds(original, cases)` → nincs változás).
- **A következmény:** a túl megengedő rubrika minden esetben modellhez megy (javítókör), pedig sokszor egyetlen megkülönböztető
  szó (pl. „nő”) kötelező csoportként kizárná a hibás választ.

## Cél — új 0. lépés a kalibrációban („szigorítás”)
- **Feltétel:** a minta `ok`, és legalább 2 (kevesebb esetnél mind) helyes válasz jelenleg teljes pontos — bizonyíték nélkül nincs szigorítás.
- **A teljes pontot kapó hibás válaszok mindegyikére** keresünk a minta szavai közül (normalizált, ≥ 2 betű — a „nő” is —, nem tagadószó, nem kötőszó/névelő
  (`SENTENCE_CONNECTIVES`), nem szám; hosszabb előre) olyat, amelyre:
  - a hibás válasz NEM tartalmazza (a pontozó szerint: `missingAnswerConcepts`);
  - MINDEN, jelenleg teljes pontos helyes válasz tartalmazza a szót vagy igazolt rokon alakját (`relatedForms`, mint az 1.
    lépésben);
  - a csoport [szó, rokon alakok] kötelezővé tétele után: a minta `ok`, a jelenleg teljes pontos helyes válaszok `ok`-k maradnak,
    és az adott hibás válasz már nem `ok`.
- **Az első ilyen szó** új kötelező csoport lesz („szigorítás: + csoport …”).
- **Ha minden hibás válasz kizárható:** a kalibráció a meglévő lazító lépésekkel folytatódik.
- **Különben:** az eredeti rubrika marad (a javítókör dönt).

## Nem-cél
- **A pontozó és a minimumok:** nem változnak. A régi leckék pontozása azonos.
- **A típusos (v2) feladatok:** változatlanok (a kalibráció ma sem nyúl hozzájuk).

## Kockázat
- **Túl szigorú rubrika:** a tanuló egy olyan helyes válaszát is elutasíthatja, amelyben a szó más formában szerepel.
- **Mérséklés:**
  - csak olyan szó kerülhet be, amely MINDEN tesztelt helyes válaszban (3–5 eltérő megfogalmazás) szerepel, rokon alakjával együtt;
  - a csoport tartalmazza az igazolt rokon alakokat.

## Elfogadás (EARS)
- **Szigorítás:** HA a hibás válasz egy irányszót cserél („csökken” a „nő” helyett), és minden helyes válasz tartalmazza a „nő”
  rokonát, AKKOR a kalibráció kötelező csoportot vesz fel, a hibás válasz 0,5 / 0 pontot kap, a helyesek és a minta 1-et, és nincs
  javítókör.
- **Nincs megkülönböztető szó:** HA nincs ilyen szó, AKKOR a rubrika változatlan.
- **Régi viselkedés:** a meglévő kalibrációs és bankteszt-tesztek zöldek.
