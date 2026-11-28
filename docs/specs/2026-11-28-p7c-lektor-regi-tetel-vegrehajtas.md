# P7C-LEKTOR-REGI — végrehajtási utasítás

Terv: docs/specs/2026-11-28-p7c-lektor-regi-tetel.md

1. `server/studio/structured-improvement.ts`: `LektorBankBlockError` (a kifogásolt banktételek fogalmai); a
   `finishStructuredImprovementScoped` ezt dobja, ha minden blokkoló létező banktételre mutat, de a kivétel nem lehetséges; az
   üzenet a régi szöveg + kivételi ok + útvonalak.
2. `buildPracticeBankRepair`: egyszeri újrakör `staleConceptIds ∪ fogalmak` értékkel; második hibánál továbbdob.
3. Teszt: `tests/practice-bank-repair.test.ts` — L1 (két lektorhívás, sikeres jelölt), L2 (kétszeri blokk → hiba, pontosan 2 lektorhívás).
4. Ellenőrzés: célzott tesztek, `tsc`, kapulánc; élesben a 9370eb25… lecke csak-bank javítása (a próbaszkripttel) — várható: lefut.
