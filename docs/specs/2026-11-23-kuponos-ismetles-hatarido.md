# P-010 — kuponos ismétlés: a hibázott lecke-tétel felső határon belül visszajön

Végrehajtás: [`2026-11-23-kuponos-ismetles-hatarido-vegrehajtas.md`](2026-11-23-kuponos-ismetles-hatarido-vegrehajtas.md).

## Háttér

A közös kérdés-ütemező (`source/client/src/game-engine/play/questionDirector.ts`) kupon módban a hibázott lecke-tételt a
menet közbeni ismétlési soron hozza vissza (`inRunCandidates`, 30%-os ismétlési arány, menetenként ≤ 2 visszatérés). A
`LATE_RETURN_MAX = 10` csak rangsor-sáv volt (`tier`), nem határidő: ha a 30%-os helyek elfogytak, a késő tétel kimaradt.
A J5a 23. jegye (`docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md`): 10–12 tételes kupon-leckénél a hibázott
tétel 80 seedből 14–43 esetben nem jön vissza a menetben.

Mérés (a javítás előtt, a director tiszta bemenetén: 80 seed × pontosság 0 / 0,3 / 0,6 / 0,85, 40 kérdés): 8 tételnél
2400 hibából 5 jön 10 kérdésnél később (max. 11.), 10 tételnél 1440, 11-nél 1360, 12-nél 1280 (max. 16.); a nem visszatérők
egy része a menetenkénti plafon miatt, a többi a 30%-os arány miatt marad le.

## Cél

Kupon módban a hibázott lecke-tétel visszatérésének legyen **valódi felső határa** (`LATE_RETURN_MAX`), és ezt szerződés-
tesztek mérjék a director tiszta bemenetén (seedelt), a 8 és a 10–12 tételes esetre is.

## Nem-cél

- A nem kupon mód (tananyag + új tétel + menetek közötti ismétlés) viselkedése nem változik (a 30%-os arány és a 3.–6.
  kérdéses mérőszám marad).
- A menetenkénti visszatérési plafon (`MAX_RETURNS_PER_RUN = 2`, terv 6.2) nem változik.
- A játékok (Brain Rot, Szökőár stb.) kódja nem változik; a lejárt kupon továbbra is megállítja a játékot.

## Szerződés (kupon mód, `provider.couponOnly`)

- **K1 — felső határ.** WHEN egy lecke-tétel hibás (rossz válasz vagy lejárt válaszidő) a menet i. kérdésénél, AND a tétel a
  menetben eddig kevesebb mint `MAX_RETURNS_PER_RUN`-szor tért vissza ismétlésként, THEN a director SHALL a tételt a hiba utáni
  legfeljebb `LATE_RETURN_MAX` (10.) kérdésként újra feltenni — a lecke méretétől (1–16+) és a válaszsortól függetlenül.
  Kivétel: a menet ennél előbb véget ér.
- **K2 — plafon fölött is visszajön.** WHEN a plafont elért tétel hibázik, THEN a tétel a menetben a lecke körforgásával tér
  vissza; teszt-korlát (mért, nem levezetett): ≤ 3n kérdés (n = a lecke tételszáma).
- **K3 — a lecke halad.** A határidős visszatérés mellett is minden lecke-tétel sorra kerül legfeljebb 3n kérdésen belül (mért
  legrosszabb eset a csupa rossz válasz).
- **K4 — arány.** A 30%-os ismétlési arányt csak határidős visszatérés lépheti át (a hiba utáni ≥ `LATE_RETURN_MAX`. kérdés).
- **K5 — közvetlen ismétlés nincs** (≥ 2 tételes leckénél).
- **K6 — lejárt kupon + hiba.** WHEN a hibázott tétel visszatérése közben a menet megszakad (`abort`, kuponlejárat / kilépés),
  THEN a kimenet `aborted`, a hiba nem vész el (a tétel a `wrongList`-ben és az ismétlési sorban marad, `dueInRun` megmarad),
  és a megszakított feltevés NEM számít visszatérésnek: sem a határidőt nem teljesíti, sem a menetenkénti plafonba nem számít
  bele — ha a menet folytatódik, a tétel a határidőn belül (vagy túlcsúszva azonnal) visszajön.

## Megoldás

`choose()` kupon ágában a legelső lépés a **határidős visszatérés**: ha van olyan hibázott, a menetben már feltett, plafon
alatti tétel, amelynek hibája óta ez a hiba utáni `LATE_RETURN_MAX`. (vagy későbbi) kérdés, akkor az jön — a 30%-os
arány-korlát előtt. A hibák különböző sorszámon történnek, ezért egy kérdés-helyre legfeljebb egy határidő esik: a
kényszerítés mindig teljesíthető, és nem tol ki más határidőt (K1 levezetése). Az `abort` a megszakított menetközi
ismétlés visszatérés-számlálóját visszaveszi (K6).

## Edge case-ek

- 1 tételes lecke: a határidős tétel az egyetlen tétel, közvetlen ismétlés elkerülhetetlen (eddig is így volt).
- Megszakított visszatérés után folytatott menet: a túlcsúszott tétel a legkorábbi hibájú tételként azonnal jön.
- Más játék / lecke tétele az ismétlési sorban: kupon módban nem jön vissza (csak a menetben feltett `couponAsked` tétel).

## Elfogadás

- E1 WHEN 8 / 10 / 11 / 12 tételes kupon-lecke, 80 seed, pontosság 0…0,9 THEN minden plafon alatti hiba ≤ 10 kérdésen belül
  visszajön (K1).
- E2 WHEN ugyanez THEN a plafon fölötti hiba ≤ 3n-en belül visszajön, minden tétel sorra kerül ≤ 3n kérdésen belül, közvetlen
  ismétlés nincs, a 30% fölötti ismétlés mind határidős (K2–K5).
- E3 WHEN 12 tételes lecke, a hibázott tétel visszatérése alatt `abort` THEN K6 teljesül.
- E4 A meglévő director- és Brain Rot-sim tesztek zöldek maradnak.
