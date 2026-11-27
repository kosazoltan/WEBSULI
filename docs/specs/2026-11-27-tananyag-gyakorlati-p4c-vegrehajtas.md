# Végrehajtás — TG-P4c (TANANYAG-GYAKORLATI, PR 4 második része: a végleges bank mérése és meta-kapuja)

Terv: `docs/specs/2026-11-26-tananyag-gyakorlati.md` — „PR 4 — Aránytervezés és tartalmi kapu a Stúdióban” (116. sor).
Feladat (SQL): `TANANYAG-GYAKORLATI`. Előzmény: TG-P4a (#629, csomagszintű meta-szűrés), TG-P4b (#631, csomagkvóta, `STUDIO_PRACTICE_QUOTA=on`).

Hiány: a P4a/P4b a bankcsomag ÁTVÉTELÉT kapuzza. A végleges bankot (tartalékos kivétel, vakellenőrzés, lektori javítás, végső
összeillesztés UTÁN) senki nem méri — a #631 review is ezt kérte (vállalva a P4c-be). A kiadott lecke gyakorlati aránya így nem
látszik a jobon, és egy lektori javítás által visszacsempészett meta-tétel is kimehetne.

1. Bukó teszt (`tests/practice-policy.test.ts`): `finalPracticeReport(experience)` — kvíz- és nyílt bank külön mérve
   (`auditExperience`), tételazonosító-lista nélküli rövid jelentés; nem teljesülő sávnál látható minőségi jelzés
   (`practice_low` / `practice_high`, bankonként), fogalompár által korlátozott banknál `practice_limited` (tájékoztató);
   meta-tételnél a tétel azonosítója a hibában.
2. Bukó teszt (`tests/single-run-engine.test.ts`): a teljes futás közzétett jobja tartalmazza a `practiceAudit`-ot
   (szabályverzióval, bankonként). A meta-tétel végkapus megállítását a `finalPracticeReport().metaProblems` unit-tesztje és a
   `finalProblems` bekötése fedi (a teszt-forgatókönyvben a csomagkapu a meta-tételt már az átvételkor kiszűri).
3. Kód: `shared/practice-policy.ts` `finalPracticeReport`; `server/studio/single-run/engine.ts` végkapu: meta → `finalProblems`
   (csak bekapcsolt kapcsolónál), jelentés a `done` kimenetbe (mindig), látható jelzés a kapcsoló mellett (KI mellett a kimenet változatlan). Az arány a végkapun NEM állít meg (jelzés) — a csomagkvóta
   már kapuz; a megállítás bekapcsolása mért éles adatok után külön döntés.
4. Ellenőrzés: practice-policy + single-run-engine + bank-* tesztek, tsc, lint.

5. Élő hiba (2026-11-27 01:45, tulajdonosi gyártás `d241d7fa`): a P4b csomagkvóta kemény kapuként megállította a leckét
   („1. fejezet … quiz: 16 tételből 9 igazolt alkalmazás; legalább 10 kell” a javító kör után is). Javítás: ha az utolsó kísérlet
   után CSAK az arány hiányzik (esetleg aritmetikai lelettel), a csomag nyitott leletként átmegy (`onToolFix("practice-quota")`),
   a végkapu méri és jelzi. RED: `tests/practice-policy.test.ts` „élő hiba (d241d7fa) …”. A kapcsolót a javítás élesítéséig
   kikapcsoltuk (Render).

Nem cél: a javítójelölt (structured-improvement) kapuja — PR 7; a tanulói kör mintavétele — PR 6.
