Tulajdonosi kérés (szó szerint, dátummal):
- 2026-11-18: ÚJ játék: adventi naptár — minden tanuló kinyit egy kérdést a saját szintjén; 95%-nál: „Menj oda apukádhoz, mutasd meg neki, és kérj tőle ajándékot.”
- D-11 (2026-11-19): az advent a tulajdonos előnézeti próbája után kapcsolható be, legkésőbb november 30-án.
- Döntések: értesítő / szülői levél évadonként egyetlen levél (terv 18.1); a levél csak a kapcsoló BE állásában, a terv szabálya szerint mehet ki.

A változás célja a terv szerint (`docs/specs/2026-11-18-adventi-naptar.md`, S5 és S6; a 22. szakasz feltételei):
Az élesítés előtti utolsó szelet: admin-előnézet (`/api/admin/advent/preview`) a kapcsolótól függetlenül, csak adminoknak, választható nappal; napi takarító; az S5 szülői levél a terv döntése szerint; valamint a felület előző ellenőri körének feltételei (késve érkező átvételi válasz, „Újra” gomb, nyitási szándék átmeneti hibánál, a sérült ablakrács elutasítása). Az `ADVENT_CALENDAR` kapcsoló ebben a szeletben KI marad; a bekapcsolás külön lépés.

Feladat-specifikus hibakereső pontok:
8a. Adat- és állapotút: az előnézeti sor nem keveredhet a tanulói / vendég sorokkal; a takarító nem törölhet élő évadot; a szülői levél pontosan egyszer megy évadonként (ismételt, egyidejű, újraindított futásnál is); a késve érkező válaszok nem írhatják vissza a régebbi állapotot.
8b. A terv elfogadási pontjai egyenként: A16 (előnézet admin belépve / kilépve), A22, A25, A50, a 22. szakasz pontjai; a `?date=` csak ÉÉÉÉ-HH-NN, budapesti nap 12:00-ja, érvénytelen → 400.
8c. Adatvédelem és jogosultság: az előnézet és a `DELETE` csak admin munkamenettel és a meglévő CSRF-úton; nem admin felhasználónál a normál naptár töltődik; a levél címzettje csak a terv szerinti kör; a levél HTML-tartalma helyesen kódolt.
8d. Szerződés kliens és szerver között: az előnézeti mód és a normál mód válaszai azonos alakúak; régi kliens kezelése.
8e. Regresszió: kikapcsolt kapcsolóval a főoldal, a naptár és a játékok változatlanok; az e2e-mód; a szerver indítása / leállítása a takarítóval.
8f. Tesztminőség: a tesztek a viselkedést mérik-e, időfüggés (valós óra), valódi e-mail nem mehet ki.
