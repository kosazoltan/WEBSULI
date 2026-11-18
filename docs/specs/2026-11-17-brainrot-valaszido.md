# Brain Rot — több idő a válaszadásra (terv)

Állapot: folyamatban – 2026-11-17, ág `fix/brainrot-valaszido`, munkafa `.claude/worktrees/brainrot-valaszido`.
Tulajdonosi hibajelentés (2026-11-17, szó szerint): „A Brain Rotban nagyon kevés időt adsz a válaszadásra.”
Végrehajtás: [`2026-11-17-brainrot-valaszido-vegrehajtas.md`](2026-11-17-brainrot-valaszido-vegrehajtas.md).

## Mérés (előtte, `b4b84db6`, kódból és szimulációból)

- **Az ablak képlete** (a közös director, `readingAware`): `min(9 s, max(windowMsFor(prompt), readingMsFor(prompt, válaszok)))`;
  a `windowMsFor` = alap 6 s (`CAGE_WINDOW_MS`) + 50 ms / karakter a prompt 60. karaktere fölött, 3–4. évfolyamon × 1,25,
  legfeljebb 9 s (`WINDOW_MAX_MS`); a `readingMsFor` a válaszokat FÉL súllyal számolja (90–180 szó/perc + 1,5 s döntés).
  Felső korlát 9 s (`READING_WINDOW_CAP_MS`) — a közös director nem enged többet.
- **Mikor indul az óra:** a kérdés megjelenésekor (`startedAtSimMs` = a megjelenés kérdés-órája); a ketrecek csak 600 ms
  előjelzés után élesek (`CAGE_ARM_MS`), így ez a 600 ms is az ablakból fogy.
- **Lejáratkor:** a lény elszökik, a kombó megszakad, a helyes ketrec ≥ 1,8 s-ig zöld; a nyilvántartásban „lejárt”
  (az ismétlési sorba kerül). A pont NEM függ az időtől (`xp × kombó-szorzó`); a lassú, de helyes válasz ugyanannyit ér —
  csak a lejárat büntet (szökés + kombó).
- **Gyorsítók:** szintenkénti / körönkénti rövidülés nincs (a J5a menete egy 90 mp-es kör); a nehézség-sáv nem hat az
  ablakra; a „Ketrec-zár” maga a válaszmód (a 600 ms előjelzés az egyetlen levonás).
- **A mozgás költsége** (a sim, azonnal döntő, mindig pontos bot, 20 seed, a megjelenéstől a válaszig): 4. évf. medián
  0,88 s, 90% 1,40 s, max 1,67 s; 7. évf. medián 0,93 s, 90% 1,45 s, max 1,75 s.

| Évf. | Tétel (a bankból) | Szó (prompt + 4 válasz) | Ablak most | Végigolvasás 140–100 szó/perc (becslés) | Maradék a 600 ms előjelzés után, mozgás nélkül |
|---|---|---|---|---|---|
| 4. | legrövidebb | 7 | 7,5 s | 3,0–4,2 s | 2,7 … 3,9 s |
| 4. | medián | 12 | 7,8 s | 5,1–7,2 s | 0,0 … 2,1 s |
| 4. | 90. percentilis | 15 | 8,5 s | 6,4–9,0 s | −1,1 … 1,5 s |
| 4. | leghosszabb | 19 | 8,8 s | 8,1–11,4 s | −3,2 … 0,1 s |
| 7. | legrövidebb | 7 | 6,0 s | 3,0–4,2 s | 1,2 … 2,4 s |
| 7. | medián | 14 | 6,1 s | 6,0–8,4 s | −2,9 … −0,5 s |
| 7. | 90. percentilis | 20 | 8,3 s | 8,6–12,0 s | −4,3 … −0,9 s |
| 7. | leghosszabb | 28 | 7,9 s | 12,0–16,8 s | −9,5 … −4,7 s |

A maradékból még a mozgás (0,9–1,75 s) is lejön. A medián tételnél egy átlagos olvasású gyerek a végigolvasás után már nem
ér oda a ketrechez — a panasz mért tény.

## Cél

- Az ablak a kérdés ÉS a négy válasz teljes hosszához igazodik (végigolvasás az évfolyam olvasási tempójával + döntés +
  a ketrechez jutás), alsó korláttal; érdemben több idő alapból.
- Az óra csak akkor indul, amikor a kérdés látszik és a ketrecek élesek (az előjelzés nem fogy az ablakból).
- A hátralévő idő jól látható, és a vége előtt jelez (a közös kérdés-sáv csíkja + másodperc-számláló, 35% alatt
  figyelmeztető szín — megvan; ellenőrizzük).
- A pontozás nem bünteti a lassú, helyes választ (a pont most sem függ az időtől — marad).

## Nem cél

- A közös director / `game-engine/play/` módosítása (más játékok is használják): a Brain Rot a director presentation-jét
  burkolja (a Szólétra-javítás `paceDirector`-mintája, `fix/szoletra-olvashatosag`; az a modul nincs a mainen, ezért saját,
  a Brain Rot-hoz igazított modul).
- A kérdés-óra és a játékidő szétcsúszása lassú gépen (jegy, közös hurok) — nem romlik: az ablak a kérdés-órán marad.
- A #483 közös kupon-átállása.

## Döntések

- **D1 — a Brain Rot válaszablaka** (`lib/brainRot/pacing.ts`, tiszta modul; a lap és a sim ugyanezt hívja):
  `ablak = tájékozódás 1,0 s + teljes olvasás (prompt + MIND a 4 válasz, teljes súllyal) az évfolyam tempójával + döntés
  (2,0 s; 3–4. évf. 2,5 s) + a ketrechez jutás 1,8 s` (a mért 90%-os mozgás 1,45 s + megállás 0,16 s + ráhagyás).
  Olvasási tempó (szó/perc, a 8–12 évesek hangos-olvasási 100–140 sávjának lassabb végéhez igazítva, becslés):
  3–4. évf. 90, 5–6. 100, 7–8. 120, 9–12. 140, évfolyam nélkül 100. Alsó korlát 9 s, és legalább a mostani (közös) ablak
  1,25-szöröse; felső korlát 30 s.
- **D2 — az óra az előjelzés után indul:** a presentation `startedAtSimMs`-e `CAGE_ARM_MS`-mal (600 ms) később — a kérdés
  és a ketrecek addig is látszanak, de az ablakból nem fogy.
- **D3 — gyorsítók:** a Brain Rotban ablakot rövidítő elem nincs; a burkoló az alsó korlátot minden esetre érvényesíti.
- **D4 — pontozás:** változatlan (`xp × kombó-szorzó`, időtől független); döntés nem kell.
- **D5 — a menet-óra áll, amíg a kérdés nyitva van (TULAJDONOSI DÖNTÉS, 2026-11-17, a választott opció szó szerint:
  „Álljon meg”).** A 90 mp-es menet-óra (a HUD „mp” sávja, a menet vége) csak akkor halad, ha nincs nyitott kérdés (a
  director aktív kérdése — az előjelzés alatt is az) és nincs szünet. A kérdés-óra (a kérdés határideje) külön, változatlanul
  jár. Így a hosszabb ablak nem veszi el a játékidőt, és a menet vége nem szakíthat félbe kérdést. A meghajtó
  `remainingMs()` a menet-órából számol; a `clockMs()` a kérdés-óra marad. Spec-változás: a „90 mp-es óra a kérdés alatt
  is jár” (terv 5.5, J5a K.2) e tesztjei erre a döntésre hivatkozva igazodnak (a kérdés alatt a menet-óra nem fogy; a menet
  vége nem esik nyitott kérdésre). A régi önellenőrző (e) eset („az óra lejártakor nyitott kérdés megszakad”) helyébe a
  „menet vége nem eshet nyitott kérdésre” lép.
- **D6 (review L2) — a számláló az előjelzés alatt:** a hátralévő idő az előjelzés alatt legfeljebb az ablak (nem
  ablak + a hátralévő előjelzés).

## Spec-változás (dokumentált)

- `brainrot-core.test.ts` „J10” a közös `windowMsFor` + a Brain Rot director-beállítás értékeit méri (6 / 7,5 / ≤ 9 s) —
  ezek változatlanok (a director nyers ablaka); az ÉRVÉNYES Brain Rot-ablak mostantól a `brainRotWindowMs` (új tesztek).
  A végrehajtási fájl J10 / J5a sora (rövid tétel 6 mp, 3–4. évf. 7,5 mp, hosszú ≤ 9 mp) erre a tervre hivatkozva módosul.

## Elfogadás (EARS)

- AMIKOR a Brain Rot kérdést ad, AKKOR az ablak ≥ max(9 s, 1,25 × a mostani ablak), és ≥ a teljes szöveg végigolvasása
  100 szó/perccel + 1,8 s.
- AMIKOR a kérdés megjelenik, AKKOR a hátralévő idő az első 600 ms-ban nem csökken.
- AMIKOR a 390 px-es telefonon a leghosszabb kérdést (prompt + válaszok) a tanuló 100 szó/perccel végigolvassa, majd a jó
  ketrecre bök, AKKOR a válasz időben (helyesként) rögzül.
- HA az ablak a régi képletre áll vissza, AKKOR az e2e és az egységteszt bukik (mutációs ellenpróba).
- A determinizmus-őr, a meglévő sim- és e2e-tesztek változatlanul zöldek.
