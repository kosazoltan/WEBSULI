# Szerzői fogalomazonosító javítás

Cél: a sémahelyes, de elírt fogalomazonosítót tartalmazó szerzői válasz egyszeri, célzott javítókört kapjon az azonnali elutasítás helyett.
Gyökérok: a step-runner author ága csak sémahibánál javít, az utána végzett lessonIdsSubsetOfMap ellenőrzés közvetlenül leállítja a futást.

Nem-cél: fuzzy azonosítócsere, forrástartalom módosítása, kapuk lazítása, automatikus újraindító rendszer. A lektor és publikálási kapu továbbra is kötelező.

Érintett: source/server/studio/step-runner.ts; source/tests/lesson-pipeline-runner.test.ts. A javítási kérés tartalmazza az eredeti feladatot, teljes hibás jelöltet, engedélyezett azonosítókat és konkrét hibákat. Egyetlen javítási hívás engedett a séma- és azonosítóhibákra együtt; az eredmény mindkét vizsgálaton menjen át mentés előtt. Sikertelen javításkor nincs mentett lecke. A javítás is a meglévő checkpointon keresztül fut, külön bemenettel.

Elfogadás: elírt ID → két hívás → helyes ID → mentett lecke és animator következő lépés; továbbra is hibás vagy új sémahibás jelölt → legfeljebb két hívás, nulla lecke; tokenhasználat összeadódik. Modellhiba nem jelent sikert. Az éles hibának megfelelő elírás külön regresszió.

Verifikáció: célzott pipeline teszt, teljes verify; mentett éles jelölt javítása saját Terra API-val helyi, írásmentes próbában, ha az artefaktum rendelkezésre áll. Éles közzététel külön ellenőrzendő, nem következik a unit tesztből.

## Ellenőrzött eredmény

- npm.cmd run verify: PASS, 1158/1158 teszt, lint, két típusellenőrzés, frontend/backend build. Utólag hozzáadott tokenösszeg-assertion: célzott 39/39 PASS; check:test újrafuttatva PASS. git diff --check PASS.
- A korábbi éles hibás lecke a tényleges runPipelineStep ágon került visszajátszásra, helyi memóriatárral. Első válasz a megőrzött hibás JSON, második a saját OpenAI API-n valódi Terra-javítás. Eredmény: ok=true, next=animator, 2 hívás a futtatóban (ebből 1 új fizetős), unknownIds=[], helyi jelölt mentve. Éles adatbázis-írás: 0.
- Az első helyi próba az export snake_case mezőit nem alakította át a futtató camelCase mezőire; ezt megszakítottuk. A megismételt próba előtt ellenőriztük, hogy pontosan az ismert terulet-mertekegyseg hiba reprodukálódik.
- Helyi bizonyíték: tmp/workflow-acceptance/real-id-repair-result.json. Ez javított szerzői jelölt, nem publikált vagy lektorált teljes tananyag.
- Éles deploy és teljes publikált visszaolvasás: NOT RUN. A javítás a futtató hibakezelését módosítja, az éles kiszolgáló kódját önmagában nem cseréli le.
