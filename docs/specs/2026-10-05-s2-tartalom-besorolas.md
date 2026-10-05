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
