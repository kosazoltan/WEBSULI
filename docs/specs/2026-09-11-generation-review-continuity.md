# Javítások folytonossága a tananyaggyártásban

Cél: a lektori javítókör már a determinisztikus tanítási hibákat is megkapja; egy későbbi, kizárólag fogalmi javítás ne felejtse el az előző kör feloldott bankjavításait.

Mért ok: a növényes éles futásban a bank három hibájának javítása után a lektor üres jelentést adott. Csak ezután futott a fogalmi kapu, kilenc címkét kifogásolva. Az új szerzői kör több már jó bekezdést is átírt; a bank új hash-t kapott, a korábbi bankReview kiürült. Az új csomag ismét két tetszőleges lágy szárú példát kért, miközben a pontozás kizárólag tulipánt és búzát fogadott el.

Hatókör: source/server/studio/step-runner.ts; source/tests/lesson-pipeline-runner.test.ts; docs/lesson-improvement.md. Nem-cél: tokenkeret-emelés, modellváltás, minőségkapu-lazítás, séma-migráció, futó munka adatainak módosítása.

Szabály: korábbi lecke esetén a szerző előtt mérjük a fogalmi és didaktikai kaput. Ha nincs tárolt kapujelentés, a friss hibajelentés kerüljön a már létező gateFeedback adatcsatornába. A már tárolt konkrét kapujelentést megőrizzük. Kapujavításkor, ha a jelenlegi lektor nem adott új bankjegyzetet, az előző kör feloldott bankReview visszajelzése maradjon aktív. Régebbi kör, más térkép vagy admin-only jegyzet nem újraélesíthető. Új bankjegyzet az aktuális körből továbbra is elsőbbséget élvez.

Elfogadás: (1) a lektori javításra visszaküldött szerző már az első javítókörben megkapja a címkehibát; (2) tiszta lektori jelentés + kapujavítás után a banképítő a korábbi feloldott tételt és indokot kapja; (3) érvénytelen régi kör/admin-only jegyzet nem öröklődik; (4) minden meglévő teszt változatlanul zöld; (5) valódi mentett állapotból ellenőrzött továbbítás, éles publikáció és böngészős próba.

Kiadás: a jelenlegi éles futás terminális állapota előtt tilos deploy. Visszaállási pont a bf65335 kiadás és az igazolt teljes adatmentés. Nincs adatmigráció. A régi publikált lecke változatlan marad.

Ellenőrzés: a két új regresszió a korábbi kódon a hiányzó kapuadat és elveszett bankfeedback miatt bukott; javítás után 32/32 pipeline-teszt PASS. Teljes verify: 1119/1119, nulla kihagyott teszt, lint/typecheck/build PASS. A tényleges mentett növényes első és második javítókör adataiból végzett, kizárólag memóriabeli visszajátszás mindkét esetben 9 kapumegállapítást és 3 feloldott bankjavítást továbbít, modellhívás és éles írás nélkül. A 25 karakteres új promptverzió valódi PostgreSQL jobindítási próbája sikeres, tranzakciója visszagörgetve.
