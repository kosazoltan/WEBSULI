# R3 — ismétlődő hiba — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-20-elakadas-r3-ismetlodo-hiba.md`. Munkakönyvtár: `source/`. Ág: `fix/r3-ismetlodo-hiba`.

1. **`server/studio/experience-builder.ts`, kísérleti ciklus:**
   - `let previousIssueKey: string | null = null;` a ciklus előtt.
   - Az `issues` kiszámítása után: `const issueKey = issueSignature(issues)`;
     `const stuck = parsed?.success && issues.length > 0 && issueKey === previousIssueKey;`
     `previousIssueKey = issueKey`.
     - Az `issueSignature` exportált, tiszta függvény: a hibaszövegek rendezett, összefűzött alakja.
   - A `salvaged` és a `keyTrimmed` feltételében a `lastAttempt` helyett: `(lastAttempt || stuck)`.
     - Az aritmetikai szelep (`arithmeticOnly`) változatlanul CSAK `lastAttempt`.
   - Ha `stuck` és sikerül a kivétel: `deps.onToolFix?.("bank-stuck", [...])` a kivett tételekkel.
2. **Teszt — `tests/elakadas-r3.test.ts`:**
   - `buildLessonExperience` hamis `call`-lal (a `tests/` meglévő banképítő-tesztjeinek mintájára), amelyik minden kísérletben
     ugyanazt a hibás tételt adja vissza (pl. egy feladat, amelynek mintája nem kap teljes pontot, a tartalékon felül);
   - elvárás: 2 hívás után kész csomag (a hibás tétel kivéve), a `bank-stuck` jelzés megérkezik;
   - eltérő hibáknál a régi menet (hívásszám változatlan).
   - `issueSignature`: sorrendfüggetlen.
3. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `build`.
4. **Kitelepítés:** az aktív-futás őr = 0.

## Pontosítás a megvalósítás során (meglévő teszt alapján)
- **Küszöb:** az elakadás küszöbe HÁROM egymást követő azonos hibalista (`STUCK_SAME_ISSUE_RUNS = 3`; doom-loop: figyel 2-nél,
  blokkol 3-nál), nem kettő.
- **Miért:** a `tests/bank-repair.test.ts` „javító kör a gyakorlatban” esete mutatja, hogy két azonos kör még nem elakadás. A
  jogosultságon kívüli, figyelmen kívül hagyott csere után a 3. kör javíthat.
- **Megtakarítás:** a 4. (mentő, erős modellre irányítható) hívás.
- **Dokumentált specváltozás:** a `bank-salvage` és a `bank-answer-keys` teszt a 4 helyett 3 hívást vár; a szándék (a hibás tétel
  kikerül, a bank elkészül) változatlan.
