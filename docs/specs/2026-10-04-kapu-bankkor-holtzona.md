# Kapu-javítás utáni csak-bank kör — holtzóna a látogatási keretnél (2026-10-04)

Tulajdonosi bejelentés: a „Negatív számok kivonása” lecke újra megállt (job 3b4b165c, map 64f93bca, run fade891d,
2026-10-04 10:40–11:10, élesen 0ecc217). A #181-es forrás-helyesbítés működött (7 tanulói hiba negatív példaként).

## Mért lefutás (run fade891d `visits`, job `repairLedger`)
pedagogue → (author, animator, lektor) ×3 → animator+lektor (csak-bank kör, 3. kör) → gate → célzott kapu-javítás
(author 4, animator 5, lektor 5; dinamikus keret: 1/2 grant) → a lektor/bank-ellenőr a kapu-javítás ÚJRAÉPÍTETT
bankcsomagjaiban 9 hibát talált → gate: 9 tétel kivétele után 2 core fogalomnak nem maradt „apply” kvíze → nem publikálható.
`repairLedger`: `bankOnly` 1/2, `targetedGate` 1/1, `gateBank` 0/1.

## Gyökérok
`server/studio/step-runner.ts` (lektor lépés): a 2026-10-01-kapu-javitas-bankkor spec (és a #169-es review) a kapu-bankkört
csak akkor engedi, ha a csak-bank körök DARABSZÁMA elfogyott (`repairRemaining(bankOnly) === 0`). Itt 1 maradt, de a rendes
csak-bank kör javítóútjára (animator 5/5, lektor 5/5) nem volt látogatás, és a `bankOnly` fajta nem kérhet dinamikus keretet
(`REPAIR_KINDS.bankOnly.dynamicBudget = false`). A kapu-bankkör viszont kérhetett volna (1 grant maradt). Holtzóna: a kapu-javítás
új bankjának hibái semmilyen javító kört nem kaptak — pontosan az az eset, amire a kapu-bankkör készült.

## Cél (dokumentált spec-változás a 2026-10-01-kapu-javitas-bankkor EARS-éhez)
A kapu-bankkör feltétele: a lektor a célzott kapu-javítás körében fut ÉS a rendes csak-bank kör most NEM költhető el
(a limitje elfogyott, VAGY a javítóútjára nincs látogatás) ÉS bankhiba van ÉS a kapu-bankkör még nem járt ÉS a dinamikus keret
engedi. A #169-es kötés a körszámhoz megmarad (csak a célzott kapu-javítás körében).

## Nem-cél
Új keret-mechanizmus; a limitek, a grantok száma, a kapu vagy a publikálási padló változása.

## Edge case-ek
- A rendes csak-bank kör elkölthető → az megy (változatlan).
- Nem a célzott kapu-javítás köre (pl. q3: elfogyott keret, nincs kapu-javítás) → változatlan: kapu-kivétel.
- Kimerített dinamikus keret → változatlan: a kapuhoz megy (#169-es teszt).
- A kapu-bankkör jobonként egyszer (változatlan).

## Elfogadás (EARS)
- HA a lektor a célzott kapu-javítás körében fut, a `bankOnly` limitből marad, de az animator/lektor látogatás elfogyott, van
  bankhiba és van még dinamikus grant, AKKOR a következő lépés animator (kapu-bankkör), a főkönyvben `gateBank` elköltve,
  `bankOnly` változatlan.
- Ugyanez kimerített grantokkal → a kapuhoz megy, `gateBank` nincs elköltve.
- A meglévő tesztek (2026-10-01, #169, q3) változatlanul zöldek; teljes unit + visszajátszás + tsc + lint zöld.
