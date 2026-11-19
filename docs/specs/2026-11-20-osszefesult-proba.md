# Terv (VÁZLAT): gépi összefésült próba a merge-kapuban (C-61 új CI helyett) — PR-2, egyszerűbb konstrukció

> Tulajdonosi döntés (űrlap, 2026-11-19): „Szétbontás két PR-ra”. Ez a PR-2 terve; a kód csak a gépi zár és az időzítéses tesztek
> beolvadása UTÁN indul, a terv véglegesítése és a végrehajtási utasítás (`-vegrehajtas.md`) után. Előzmény: a `fix/kapu-gyorsitas`
> ág (archív; utolsó fej `037691a2`) és hat vak kör (1–6.) — a megvalósítás ott olvasható, kiindulópont, nem kész kód. A
> bizonyíték-átvitel külön terve: `docs/specs/2026-11-20-bizonyitek-atvitel.md` (a `fix/kapu-gyorsitas` ágon).

## 1. Cél

Ha a main elmozdult a PR CI-ja óta, és a PR repó-szintű ellenőrzést érint (C-61), a merge-kapu ne kérjen új, ~1 órás CI-t, hanem
egy gépi, node-os összefésült próbát futtasson PONTOSAN azon a (PR-fej, main-SHA) páron, amelyre a merge megtörténik; a merge csak
akkor engedett, ha a próba ugyanarra a main-SHA-ra futott, és az azóta sem mozdult.

## 2. Egyszerűbb konstrukció (a 3–6. kör tanulsága: a sok mozgó részből adódó versenyhelyzetek)

1. **Egy rögzített pár:** a merge-kapu elején a GitHub szerinti main-csúcs (`M`) és a PR-fej (`H`) — minden további lépés (próba,
   döntés, bizonyíték) CSAK ezt a két SHA-t használja; mozgó ref (`origin/main`) sehol.
2. **A próba (`merged-probe`):** ideiglenes munkafa `M`-en; a main őr-alapmérése; `H` + `M` összefésülése; szintetikus merge-commit;
   a hatókör a PR és a main elmozdulásának fájllistájából (régi és új nevek); egy együttes, monoton határidő (takarítással együtt).
3. **A bizonyíték:** `merge-<PR>-<H>` = { `H`, `M`, a próba fája, a helyi ítélet lenyomata (`review-<H>.json` hash-e), idő }.
4. **A merge:** csak `gh pr merge <PR> --match-head-commit <H>` alakban (a fej szerveroldalon ellenőrzött); közvetlenül előtte a hook
   újra lekéri a GitHub szerinti main-csúcsot és a helyi ítéletet: `M` ≠ aktuális main, vagy az ítélet-lenyomat eltér / NEM → DENY.
5. **A maradó versenyablak** (a hook ellenőrzése és a szerveroldali merge között a main elmozdulhat): kezelése tulajdonosi döntés —
   **(A, javasolt)** a merge-sort egyetlen orkesztrátor viszi, gép-zárral sorosítva (a WEBSULI merge-sor egy gazdája), és a merge után a
   main-CI fut; **(B)** atomi út: a kapu a próbált merge-commitot fast-forward pusholja a mainre (a main mozgása → elutasított push) —
   ág-védelmi változtatást igényel (UNVERIFIED, hogy a mostani védelemmel megengedett).

## 3. Nem cél

- Teljes CI kiváltása (böngészős E2E, build, lint): a próba csak node-os teszteket futtat — maradó kockázat, a runbookba.
- Bizonyíték-átvitel (külön terv).

## 4. Elfogadási pontok (a 3–6. vak kör összefésült-próba / merge-engedély leletei, kötelező)

<!-- acceptance-checklist -->
- [ ] **Bizalmi határ:** helyi próbát csak azonos tárolóból jövő PR, zöld kötelező ellenőrzések és erre a fejre rögzített, a jelentés
  záró `Fej:` sorával egyeztetett helyi ítélet indíthat; PR-szöveg nem (3. kör L1, 4. kör L1; a `record-review` része a PR-1).
- [ ] **Rögzített main-SHA:** a próba és minden feltétel `M`-en; a próba után a main újra lekérve, eltérés → FAIL (3. kör L4).
- [ ] **A merge-engedély a (PR, `H`, `M`, ítélet-lenyomat) négyeshez kötött;** a hook a merge előtt mind a négyet újraellenőrzi; régi
  formátum → DENY (3. kör L4, 6. kör L1, L3).
- [ ] **A próba alatt visszavont ítélet** (közben rögzített NEM / eltűnt / megváltozott rekord) a döntésig eljut: a zöld publikálása
  előtt visszaolvasva, a hook is elutasítja (6. kör L3).
- [ ] **Futásőr és RT-állapot a próba UTÁN** (3. kör L4).
- [ ] **A main őr-alapmérése érvényes** (nem 0 kilépés → FAIL), a korlát csak a ténylegesen sikeres esetekből (3. kör L5); a node:test
  teszt nélküli fájl áltesztje nem számít; 0 valódi teszt → FAIL.
- [ ] **Teljes QA-kör:** a kötelező ellenőrzők (`skills-sync-check`, `three-phase-check`) hiánya FAIL (3. kör L6); a beágyazott
  QA-tesztmappák is (a rögzített fa teljes követett QA-tesztlistája; 6. kör L7); a háromfázisú ellenőrző szintetikus merge-commiton
  (3. kör L7).
- [ ] **Hatókör:** a PR és a main elmozdulása szerint (teljes egységkör, ha mindkét oldal érint `source/`-t; teljes QA-kör, ha bármelyik
  érint QA-hatókört); átnevezésnél régi és új út (`--no-renames`, ellenőrzött kilépés; 3. kör L10).
- [ ] **A PR fájllistája hiánytalan:** pontosan `changed_files` darab érvényes, EGYEDI elsődleges fájlnév (duplikátum / hiányzó név →
  FAIL), utána a régi nevek; a lekérések ugyanahhoz a fejhez kötve (3. kör L10, 6. kör L4).
- [ ] **Határidő:** egy együttes, monoton határidő; minden lépés — a git és a takarítás is — a fennmaradó keretet kapja; a retry
  kísérletenként monoton időt mér, kivételnél is; a rekordban összidő, futásonkénti idő, hatókör (3. kör L9, 4. kör L5, 6. kör L5).
- [ ] **Takarítás:** futásonként egyedi segéd-refek, ellenőrzött törlés; sikertelen ref- / munkafa-takarítás nem marad csendben zöld
  (6. kör L6; 3. kör L8).
- [ ] **Egyszeri, jelölt újrafuttatás** (#205-ig): legfeljebb két futás, a jelölés a naplóban és a bizonyítékban, a második bukás FAIL.
- [ ] **Push / PR-kapu:** őr-only profil; a teszt a TÉNYLEGES hívás opcióit méri (4. kör L6, 6. kör L8).
- [ ] **Skill:** a merge-kapu skill C-61-nél előbb a próbát írja (feltételeivel), main-beolvasztás csak ütközés / piros próba esetén
  (4. kör L7).
- [ ] **Mérce:** a legrosszabb hatókörű próba ≤ 7 perc, gép-zárral MÉRVE (tulajdonosi döntés 2026-11-19).
- [ ] Minden pont bukó teszttel; mutációs ellenpróba; vak ellenőr (célzott körök a tulajdonosi szabály szerint).
