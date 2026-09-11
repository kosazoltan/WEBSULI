# Végrehajtás

1. step-runner.ts author: a javítási feltétel a séma- vagy forrásazonosító-hiba legyen. A javító prompt kapja a teljes jelöltet, eredeti inputot, hibajegyzéket és engedélyezett forrásazonosítókat. A két ellenőrzést ismételni kell mentés előtt. A meglévő checkpoint és tokenösszegzés megmarad.
2. lesson-pipeline-runner.test.ts: válaszsorozatos providerrel sikeres ID-javítás, hibás ID-javítás, javításkor elromló séma, szolgáltatói hiba és legfeljebb egy javítókör tesztje. Forrásadatok és teljes jelölt jelenlétének ellenőrzése.
3. node --import tsx --test tests/lesson-pipeline-runner.test.ts, majd npm.cmd run verify. PASS szükséges. Mentett éles hibás válasszal külön Terra próba; nem szabad éles adatot közvetlen DB-írással módosítani.
4. Diff önellenőrzése, dokumentált eredmény és atomi commit. Közzétételt csak tényleges publikált visszaolvasás alapján szabad sikeresnek nevezni.
