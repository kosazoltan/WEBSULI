# Bukott okosítási jelölt megőrzése — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-20-okositas-bukott-jelolt.md`. Munkakönyvtár: `source/`. Ág: `fix/okositas-bukott-jelolt`.

1. **`server/improveAsync.ts`:**
   - `ImproveOutputError` új, opcionális konstruktor-paraméter: `readonly candidate?: string`.
   - Az `outputError(message, problems, candidate?)` ezt továbbadja; a záró kapu bukásakor `candidate = improvedHtml`.
   - **A hibaágban:** ha `error instanceof ImproveOutputError && error.candidate`, akkor
     `storage.updateImprovedHtmlFileContentAndStatus(id, error.candidate, 'error')`, utána a meglévő
     `updateImprovedHtmlFileStatus(id, 'error', undefined, userMessage)`.
     - A mentés hibája csak napló, a futás hibája változatlanul továbbmegy.
2. **Teszt — `tests/okositas-bukott-jelolt.test.ts`:**
   - forrásszintű: az `ImproveOutputError` hordozza a `candidate`-et, a kapu bukása átadja, a hibaág menti;
   - a `storage.applyImprovedFileToOriginal` státuszőre `error`-t nem enged (forrásszintű ellenőrzés a meglévő listára).
3. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `build`.
4. **Kitelepítés:** az aktív-futás őr = 0.
