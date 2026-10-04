# Tanári kérés pontjai — képlet-sor mint betűhű forrás-idézet (2026-10-04)

Forrás: a tulajdonos által engedélyezett 2. élő próba (run 5de56159, job 49657518, „Negatív számok kivonása”) — a lecke
publikált (0414c274), de a kapu „Tanári kérés: 0 pont, 0 hiányzik”-ot mért.

## Mért gyökérok
- A tanár kérésének 3 pontja (hasonló feladatsorok, megoldási magyarázat, gyakorló feladatok) a jegyzékben `not_in_source`:
  „a forrás-idézet nem igazolható betűhűen: „-5-(-8)=+3””, „… „-2-(-8)=+10”” — holott mindkettő a forrás teljes, betűhű sora.
- `server/studio/instruction-points.ts` `verbatimInSource`: igazolt, ha az idézet ≥ 20 betű/szám, VAGY teljes forrássor ≥ 8 betű/szám.
  A képlet-sor betű/szám-tartalma 3–5 karakter („5835”), így soha nem igazolható; ráadásul a `lineKey` a sor eleji mínuszjelet
  felsorolásjelnek veszi és levágja.
- Következmény: a `not_in_source` pont nem tanítandó → a kapu nem méri a tanár kérését (0 pont), és a tanár hiány-jelzést kap
  egy ténylegesen teljesített kérésre.

## Cél
Képlet-sornál (számjegy + műveleti jel + „=”, betű nélkül; a sorvégi pipa/iksz levágva) a TELJES forrássor pontos, előjel-
pontos egyezése betűhű igazolás. A mínuszjel képlet-sor elején nem felsorolásjel.

## Verzió (review #185)
A jegyzék szemantikája változik → `INSTRUCTION_POINTS_VERSION` v2-inventory → v3-inventory (a mentett jegyzék hash-e
változik, így újraszámolódik); a meglévő teszt elvárása ennek megfelelően v3. A pipa és a záró írásjel bármilyen sorrendben levágódik.

## Nem-cél
A szöveges idézetek szabálya (20 / 8 karakter) változatlan; a pontok tartalmi besorolása (supports igen/nem) változatlan.

## Edge case-ek
- Képlet-töredék (nem teljes sor, pl. „-5-(-8)”) → nem igazol (változatlan szigor).
- Másik sor előjelben eltérő változata („5-(-8)=+3” a „-5-(-8)=+3” helyett) → nem igazol.
- Szöveges rövid sor („igen”) → változatlan: nem igazol.

## Elfogadás (EARS)
- HA az idézet a forrás egy teljes képlet-sora (pipával vagy anélkül), AKKOR a pont `pending` (igazolt), nem `not_in_source`.
- HA az idézet előjelben eltér vagy csak töredék, AKKOR nem igazolt.
- A meglévő instruction-points tesztek változatlanul zöldek; teljes unit, tsc, lint zöld; új teszt a javítás nélkül bukik.
