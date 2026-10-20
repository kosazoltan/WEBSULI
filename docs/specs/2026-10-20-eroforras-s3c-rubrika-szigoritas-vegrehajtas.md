# S3c rubrika-szigorítás — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-20-eroforras-s3c-rubrika-szigoritas.md`. Munkakönyvtár: `source/`. Ág: `perf/s3c-rubrika-szigoritas`.

1. **`shared/answer-key-calibrate.ts`:**
   - új `function tighten(task, cases): { task, changes } | null`:
     - minta nem `ok`, vagy 2-nél (kevesebb esetnél mindnél) kevesebb a teljes pontos helyes válasz → `null`;
     - a teljes pontot kapó hibás válaszok és a jelenleg teljes pontos helyes válaszok kigyűjtése;
     - minden ilyen hibás válaszra:
       - a minta szavai (normalizált, ≥ 2 betű, nem tagadószó — magyar és angol —, nem `SENTENCE_CONNECTIVES`, nem szám, egyedi, hossz szerint csökkenő);
       - az első szó, amelynél a csoport `[szó, ...minden helyes válasz relatedForms([szó], válasz)]` a hibás válaszból hiányzik, és
         minden ok helyes válaszban megvan;
       - a csoport felvétele után a minta ok, minden korábban ok helyes válasz ok, a hibás válasz nem ok.
     - Ha valamelyik hibás válaszra nincs ilyen szó → `null`.
   - **`calibrateRubric`:** a `guardHolds(original)` korai kilépés helyett:
     - ha az őr nem áll, `tighten`;
     - ha az eredmény `null`, akkor az eredeti `{ task: original, changes: [] }`;
     - különben a szigorított feladattal (és a `changes`-szel) a meglévő lépések futnak, ugyanazzal az őrrel.
2. **Teszt — `tests/s3c-rubrika-szigoritas.test.ts`:**
   - irányszó-csere („nő” → „csökken”) → szigorítás, a hibás nem ok, a helyesek és a minta ok;
   - nincs megkülönböztető szó (a hibás egy helyes minden szavát tartalmazza) → változatlan;
   - a tagadószó nem lehet megkülönböztető;
   - **banképítés hamis hívással:** a „forditott” bukás a kalibrációval eltűnik, 1 hívás.
3. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `build`.
4. **Kitelepítés:** az aktív-futás őr = 0. Mérés: `fixTurns / turns` a következő gyártásokban (alapvonal 49 %).
