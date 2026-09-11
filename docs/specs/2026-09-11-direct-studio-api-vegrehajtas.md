# Végrehajtás

1. models.ts: natív Terra/Grok alapértékek, korábbi prefixek kompatibilis feloldása, xAI kulcs és OpenAI alias, szolgáltató és modellcsalád meghatározása. GLM és külső author/lektor fallback törlése.
2. OpenAIProvider.ts és studio-provider.ts: kizárólag rögzített hivatalos endpoint, saját kulcs, tokenlimit és abort továbbítása. Hiányzó kulcs explicit hiba.
3. step-runner.ts, run-extraction.ts, structured-improvement.ts: közös gyár használata. routes.ts: valós szolgáltatói readiness. improveAsync.ts: Terra fallback saját API-n.
4. ENV példa: xAI és OpenAI alias dokumentálása, érték nélkül.
5. tests/direct-studio-api.test.ts: routing, kulcsszeparáció, alias, régi override, hiányzó kulcs, GLM hiánya. Futtatás: node --import tsx --test tests/direct-studio-api.test.ts; npm.cmd run check; npm.cmd run lint; npm.cmd run check:test. Elvárt: PASS. Régi modellkonfiguráció-tesztek elvárásai az új specifikációhoz igazítandók.
6. Diff önellenőrzése. Éles modellhívás csak igazolt saját kulccsal; hiányában ezt külön jelezni kell, deploy nem bizonyított.
