# S2 — Tartalom alapú besorolás: tantárgy · ág · évfolyam · téma · lecketípus (2026-10-05)

Terv: `2026-10-05-tantargyi-tudasbank-terv.md` (S2). Tulajdonosi döntések: a tantárgyat és a típust a TARTALOM alapján kell
megállapítani (nem a cím alapján — a cím szerinti becslés 52/177 leckét nem tudott besorolni); minden tantárgy és MINDEN
természettudományi ág külön bank; a 10 leckés fizetős pilot engedélyezve.

## Tantárgy-taxonómia (külön bankok, `shared/catalog-taxonomy.ts`)
matematika · magyar-nyelvtan · magyar-irodalom · tortenelem · tarsadalmi-ismeretek · kornyezetismeret (1–4.) ·
termeszetismeret (5–6.) · biologia · kemia · fizika · foldrajz · angol · nemet · francia · informatika · enek-zene ·
hit-es-erkolcstan · vizualis-kultura · technika. (A magyar nyelvtan és irodalom is külön: más mérce — ugyanaz az ok, amiért a
természettudományi ágak.) Vegyes lecke (pl. kompetenciamérés): `subject` = a fő tantárgy, `secondarySubjects` jelölve;
a bank-tagság csak a fő tantárgy szerint (a fejezetenkénti szétválogatás külön szelet).

## Lecketípusok
fogalomtanito · gyakorlo-feladatlap · szokincs-nyelvi · irodalmi-mu · temazaro-felkeszito · tanuloi-munka-javitas ·
gyakorlati-projekt · egyeb.

## Cél
1. `shared/catalog-taxonomy.ts`: a fenti listák + `subjectBankKey`.
2. `server/catalog/classify.ts`: `buildClassificationPrompt(lesson)` (cím, évfolyam-mező, a fejezetcímek és ~2500 karakter
   tanítás-szöveg, 12 tétel-minta) → olcsó modell (a meglévő `topicFocusModels()` lánc: glm-5.3-flash, tartalék
   deepseek-v4-flash) → zod-validált JSON `{ subject, secondarySubjects, grade, topicArea, topic, lessonType, confidence,
   evidence }`; a `grade` a lecke évfolyam-mezőjéből, ha az > 0 (a modell csak hiánynál becsül).
3. Új szerep `catalog-classifier` (`PROMPT_ROLES`) + saját támogató skill-szöveg (`SUPPORT_SKILLS`).
4. `scripts/catalog/classify.mts`: `--pilot` (10 rétegzett lecke) és `--all`; eredmény `docs/measurements/<dátum>-classify-*.json`
   (lecke → besorolás, tokenhasználat, idő). A DB-be írás az S3 dolga.

## Pilot (engedélyezve, 10 lecke)
Rétegzett minta: 3 a cím szerint besorolhatatlanból, 2 angol, 1 történelem, 1 matematika, 1 biológia/kémia/fizika jellegű,
1 magyar, 1 fúziós. Mérés: tokenszám/lecke, idő, és egyezés a KÉZI besorolással (a fejlesztő a tartalom alapján, előre rögzíti).

## Nem-cél
Fejezetenkénti tantárgy-szétválogatás; DB-tárolás; a katalógus felhasználása a gyártásban (S6).

## Elfogadás (EARS)
- A pilot 10/10 leckére érvényes (sémának megfelelő) besorolást ad; a kézi besorolással a tantárgy ≥ 9/10, a lecketípus ≥ 8/10
  egyezik; a mért tokenköltségből a teljes futás (201 lecke) költsége kiszámolható.
- HA a modell nem a taxonómia elemét adja, AKKOR a tartalék modell próbál; ha az sem, a lecke `unclassified` (nem kitalált).
- A szerep és a skill regisztrálva (forrás-ellenőrző teszt); tsc, lint, teljes unit zöld.

## Review #189 javítások (2026-10-05, a küszöb lazítása NÉLKÜL)
Mért eltérés: az első pilot a küszöb alatt maradt (tantárgy 8/10, típus 7/10; 2 lecke `review`), és egy lecke a melléktantárgy-korlát
miatt `unclassified` lett. Javítások (kód, nem a mérce):
- **2 a 3-ból:** ha a két első érvényes ítélet tantárgya eltér, a még nem használt modell dönt; ha valamelyikkel egyezik → `agreed`
  (a két egyező modell), különben `review` mindhárom jelölttel. Két modell mellett a régi viselkedés változatlan.
- **Melléktantárgy:** a 4+ érvényes melléktantárgy nem dobja el a leckét — sorrendben az első három marad (duplikátum nélkül).
- **Tétel-minta:** egyenletes indexelés az első ÉS az utolsó tétellel (a lecke végi módszer-tételek is bekerülnek). A régi teszt
  részszöveg-próbája („Kérdés 5”) a lecke utolsó tíz tételét is tiltotta, ellentmondva a teszt címének („vége”) — dokumentált
  javítás: a próba szigorúbb lett (első és utolsó tétel pontos egyezése).
- **Skill:** egyetlen témakör magyarázattal + gyakorlással nem `temazaro-felkeszito`.
- **Mérés:** az egyezés a 10 kézi mércéjű pilot-leckére vonatkozik → a mezők neve `pilotSubjectAgreement` / `pilotTypeAgreement`.
Újramérés: pilot 10/10 érvényes, tantárgy 10/10, típus 9/10 (`docs/measurements/2026-10-05-classify-pilot.json`).
Teljes újramérés (201 lecke, párhuzamosan 6 szálon): 197 agreed, 4 review, 0 unclassified (korábban 194 / 6 / 1);
1,28 M bemenő + 0,12 M kimenő token (`docs/measurements/2026-10-05-classify-all.json`).
