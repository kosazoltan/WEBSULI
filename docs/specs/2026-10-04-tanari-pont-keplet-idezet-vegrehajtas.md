# Végrehajtás — képlet-sor mint betűhű forrás-idézet

1. `server/studio/instruction-points.ts`: `formulaLineKey(s)` — normText, sorvégi pipa/iksz és záró írásjel le, szóköz ki,
   `−`/`–` → `-`; csak akkor nem null, ha számjegy + műveleti jel + „=” van benne és betű nincs. `buildInventory` a forrás
   képlet-sorainak kulcshalmazát is felépíti; `verbatimInSource` igaz, ha az idézet képlet-kulcsa ebben a halmazban van.
2. Teszt: `tests/instruction-points-formula.test.ts` — a mért kérés + forrás (map 64f93bca átirata), a modell-jelöltek
   `supports: "yes"` képlet-idézettel → `pending`; előjel-eltérés és töredék → nem igazolt; ellenpróba.
3. Teljes unit, tsc main+test, lint.
