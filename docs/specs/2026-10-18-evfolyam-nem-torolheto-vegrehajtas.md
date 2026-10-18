# A tanuló nem törölheti a megadott évfolyamát — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-18-evfolyam-nem-torolheto.md`. Munkakönyvtár: `source/`.

1. **`client/src/components/WelcomeCard.tsx`:**
   - a `welcome-grade` select üres opciója („Évfolyam (nem kötelező)”) csak akkor renderelődik, ha `grade == null`;
   - a mentésben a `clearGrade()` csak akkor fut, ha `grade == null` (nincs mit törölni); tárolt évfolyamnál az üres érték nem
     törli.
2. **Teszt** (`tests/welcome-card.spec.ts`), dokumentált spec-változás:
   - a #289/#291 „üres évfolyam törli” esetei úgy módosulnak, hogy tárolt évfolyam után az üres opció nem létezik
     (`option[value=""]` darabszáma 0), és a mentés után az évfolyam megmarad;
   - anyag nélküli évfolyamra váltáskor a lista továbbra is „Mind”.
3. **Ellenőrzés:**
   - `npx.cmd tsc --noEmit -p .`, `npm.cmd test`;
   - `npx.cmd playwright test tests/welcome-card.spec.ts tests/curriculum-order.spec.ts`.
