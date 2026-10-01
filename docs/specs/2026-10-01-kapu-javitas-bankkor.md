# Kapu-javítás utáni csak-bank kör (2026-10-01)

**Mért ok** (élő Egyiptom-mérés, run dd1413c7, job 74b63038, main 48b174e): a bank-ellenőr 1. kör 11 → 2. kör 2 →
3. kör **0 hiba** (mindkét csak-bank kör — `MAX_BANK_ONLY_ROUNDS = 2` — elhasználva, eredményesen). Ezután a kapu a
limiten célzott szerzői javítást indított (7. és 11. fejezet); a módosított fejezetek bankcsomagjai újraépültek, a
bank-ellenőr 5 új hibát talált, csak-bank kör már nem járt, a tételek kivétele után a bank nem felelt meg → a futás
1381 s után nem publikált.

**Cél:** a célzott kapu-javítás által újraépített bankra EGY saját csak-bank kör jár (jobonként egyszer), a meglévő
dinamikus javítási keret (`workflowEnsureRepairBudget`) határain belül.

**Nem-cél:** új keret-mechanizmus, a `MAX_BANK_ONLY_ROUNDS` emelése, a kapu vagy a limit-szabály módosítása.

**Edge case-ek:** nincs bankhiba → nincs keret-igénylés; a dinamikus keret elfogyott → a régi viselkedés (figyelmeztetés,
kapu-kivétel); a kör jobonként egyszer (`gateBankRepairUsed`).

**Elfogadás (EARS):** HA a lektor-lépés a célzott kapu-javítás körében fut ÉS a csak-bank körök elfogytak ÉS a
bank-ellenőr hibát talál ÉS a dinamikus keret engedi, AKKOR a következő lépés csak-bank kör (animator); EGYÉBKÉNT a
korábbi viselkedés. A lánc-keret (`MAX_CHAIN_STEPS`) +3 lépéssel bővül.
