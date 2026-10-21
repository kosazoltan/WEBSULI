# 1. ciklus — csoportos rubrika-szigorítás és analitikai archívum

Állapot: a régi anyagok éjszakai átalakításának (98 futás) elemzése alapján, tulajdonosi utasítás 2026-10-21. A futás „drága
analitika”: minden mért hibát vissza kell vezetni a gyártóba.

## Mérés (98 futás, telemetria + naplóbányászat, `scratchpad/mine-logs.mjs`)
- **Költség állomásonként:**
  - gyakorlóbank $239 (41%), átlag 3,7 javítókör / lecke (összesen 365);
  - ellenőrzés $129 (22%);
  - lektorálás $69;
  - tananyag $59.
- **A bank 366 javítókörének oka:**
  - **271 (74%):** „válaszkulcs-teszt: a hibás próba teljes pontot kap”, ebből fajta szerint:
    - **207 „fordított irány”** (a 271 76%-a);
    - 54 tévhit;
    - 9 hiányos;
    - 1 témaidegen;
  - 34 számolós / referenciaérték;
  - 26 a minta nem teljes pont;
  - 10 kvíz;
  - a maradék sémahiba.
- **A „fordított” próba jellege:** a viszony megfordítása vagy egy ellentétes ige („az igekötő elveszi az ige irányát”, „a szoros
  kapcsolatot különírással…”).
- **Miért nem fogja meg a szóalapú szigorítás (S3c):** a helyes válaszok eltérő szinonimákkal fogalmaznak, ezért nincs EGY olyan szó,
  amely MINDEN teljes pontos helyesben benne van, a hibásban nincs.
- **Mérési hiány:** a válaszkulcs-esetek nem maradnak meg (csak memóriában), így a futás offline nem játszható vissza.

## Cél
1. **Csoportos szigorítás (S3d):** ha sem szó (S3c), sem kifejezés (S5b) nem különböztet meg egy blokkoló, teljes pontos hibás próbát,
   a gép egy VAGY-csoportot keres a minta és a teljes pontos helyesek megkülönböztető szavaiból:
   - minden teljes pontos helyes válaszban (és a mintában) van legalább egy tagja, a hibásban egy sem (a pontozó tűrő illesztésével);
   - legfeljebb 6 tag, mohó lefedéssel;
   - felvétel után a minta és a helyesek `ok`, a hibás nem;
   - gépi szigorításként jelölve (`tightened`), így a tanulói mérés (S4) lazíthat.
2. **Analitikai archívum:** a válaszkulcs-esetek feladatonként (kérdés, minta, kötelező csoportok, helyes / hibás próbák) a job
   kimenetébe kerülnek (`answerKeyArchive`, legfeljebb 200 feladat, a szövegek vágva). A jövőbeli futások így offline visszamérhetők.
3. **Ciklus:** a korlát a tényleges sorelemszám + 5; a következő 5 anyag ezzel fut, és az A1-arány változását mérem.

## Nem-cél
- **A tesztíró és a pontozó szabályai:** változatlanok.

## Elfogadás (EARS)
- HA a helyes válaszok eltérő szinonimát használnak, és a hibás próba egyiket sem, AKKOR a csoportos szigorítás kizárja, és a minta
  és a helyesek teljes pontosak maradnak.
- HA a csoporthoz 6-nál több tag kellene, vagy a hibás tartalmaz egy tagot, AKKOR nincs csoportos szigorítás.
- HA a futás válaszkulcs-teszteket írt, AKKOR a job kimenetében megvan az `answerKeyArchive`.
