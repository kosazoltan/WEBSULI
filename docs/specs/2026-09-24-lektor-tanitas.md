# Lektor-tanítás a felvételi feladatlap öt élő futásából (2026-09-24)

Tulajdonosi kérés: „ebből a készítésből tanítsd föl tovább a lektort a te futásod tapasztalatai alapján”.

## Mérés (5 élő futás, 31 lektori jegyzet a saját, ellenőrzött megoldókulcshoz mérve)
- **Erős:** helyi számolási hibák (20+100+31=151; 1452 kerekítése; vágási irány; 4 meccsnél 800 < 820) — kb. 20 pontos találat helyes iránnyal.
- **1. hibaosztály — horgony:** a lecke saját részeredményét fogadja el. A 7×11×5 = 385-ös hibás tanítást egyik futásban sem jelezte; ahol ellentmondást látott, a hibás 385-ből indult („a 273 maradék kettejüké”).
- **2. hibaosztály — nem konvergáló javítási irány:** érték nélkül („ne add mindkettőnek”, „bontsd szét”) vagy hiányos listával („csak pl. 2123, 2120, 2321” — öt szám kell) → a bank három körön át sem javult.

## Kísérletek (A/B, ugyanaz a hibás lecke)
| Változat | Eredmény |
|---|---|
| régi lektor (3 kör, élesben) | a téglatest-hibát nem jelezte |
| új skill + önálló megoldás (solutions) | 22 megoldás, de a téglatestre a lecke hibás 5, 7, 11 / 385-ét adta — a leckét látva horgonyoz |
| **vak** megoldás, lecke nélkül — grok-4.6 (idézetekből) | élek 6, 7, 11 ✅; ahol adat hiányzott, kitalált értéket adott |
| **vak** megoldás — Opus 5.5 a teljes forrásszövegből | 33 feladatrészből 26 megoldva, **mind helyes**; 7 „NINCS ELÉG ADAT” (szétesett PDF-táblázat, törtek), kitalálás nélkül |
| **új lektor + vak megoldások** | első körben blokkoló a TANÍTÁSRA (sections.9.blocks.1): „(h−1)·7=35, h=6, 6·7·11=462”, az érintett banktételekkel |

## Változás
- `server/studio/blind-solver.ts`: a forrás feladatainak vak megoldása (Opus 5.5, a lecke ismerete nélkül), jobonként egyszer, a forrás hash-éhez kötve (`job.output.blindSolutions`); hiba esetén a lektor nélküle fut. A „NINCS ELÉG ADAT” tétel kimarad.
- Lektor-prompt: FÜGGETLEN VAK MEGOLDÁSOK blokk; ÖNÁLLÓ MEGOLDÁS ELŐSZÖR (`solutions` a jelentésben, tárolva); a javítás iránya a kiszámolt, TELJES helyes válasz (lista minden eleme, rubrika pontos szerkezete).
- Lektor skill átírva (4615/4800 karakter), a tesztek által rögzített kulcsmondatokkal.
- Futtató: napló a lektor önálló megoldásairól; figyelmeztetés, ha eltérést talált, de nem adott blokkolót.

## Nem-cél
A lektormodell cseréje (grok-4.6 marad; a vak megoldó oldja fel a horgonyt). Gemini nem.

## Elfogadás
- A hibás téglatest-leckén az új lektor blokkolót ad a tanításra a helyes értékkel — élőben mérve ✅.
- Tesztek: `tests/blind-solver.test.ts`, runner: a vak megoldó egyszer fut, nem látja a leckét, a lektor megkapja, körönként gyorsítótár.
