# Spec — Aritmetika-ellenőrző: előjeles szám és vegyes tört (2026-09-24)

## Háttér (mért, élő futás 351e14cc, 2026-09-24)

A teljes éles gyártás a 10. fejezet (egész számok) bankjavító körében hibára futott. A javító kör 1. és
3. kísérletét KIZÁRÓLAG az `arithmetic-claims` téves riasztása buktatta: a helyes „–6 + 11 = 5” és
„–4 + 9 = 5” állítást „6 + 11 = 5”-nek olvasta (a számmintában nincs előjel). A 2. kísérlet időtúllépés, a
mentőkör hibás JSON — a lecke elveszett. Ugyanebben a futásban „1 1/2 = 3/2” is téves riasztást adott (a
vegyes tört egészrésze kimaradt), és a „17/12 = 1 5/12” alak is téves riasztást adna.

## Cél

A helyes, előjeles számmal kezdődő vagy azzal végződő, illetve vegyes törtet tartalmazó állítás ne legyen
hiba; a valódi hiba ugyanezekben az alakokban továbbra is kiderüljön.

## Nem-cél

Zárójeles kifejezések értékelése; műveleti jel utáni előjel („5 · –3”) értékelése (nem ítéljük meg).

## Elfogadás (EARS)

- HA a szöveg „–6 + 11 = 5”, „Reggel –6 °C … –6 + 11 = 5 °C”, „5 – 8 = –3” vagy „–4 + 9 = 5”, AKKOR nincs hiba.
- HA a szöveg „–6 + 11 = 17” vagy „5 – 8 = 3”, AKKOR hiba (a helyes értékkel).
- HA a szöveg „1 1/2 = 3/2” vagy „17/12 = 1 5/12”, AKKOR nincs hiba; „1 1/2 = 5/2” hiba.
- A meglévő tesztek változatlanul zöldek.

## Végrehajtás (AI-ügynöknek)

1. `tests/live-exam-pdf-2026-09-24.test.ts` mellé ÚJ teszt a fenti esetekkel (előbb bukik).
2. `server/studio/tools/arithmetic-claims.ts`: a kifejezés első száma elé opcionális előjel (csak ha közvetlenül
   szám követi); `evaluateExpression` kezeli a vezető előjelet; vegyes tört („W a/b”, W előtt nem szám/tört)
   `W + a/b` alakra normalizálva a kiértékelés előtt.
3. Kapu, PR, CI, merge, deploy; utána újabb teljes éles gyártás ugyanazzal a feladatlappal.
