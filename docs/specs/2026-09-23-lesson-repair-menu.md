# Külön „Tananyagjavító” menüpont

Dátum: 2026-09-23 · Tulajdonosi kérés · Ág: `feat/lesson-instructions-repair` (az előző szelet folytatása)

## Cél
Az admin felületen az „Okosítás” mintájára külön „Tananyagjavító” fül: (1) a javítás tudása látható — a javító út lépései, a tanult `tananyag-javito` szabályok és a szerep-skillek (szerző, lektor, bankkészítő, OCR); (2) tananyag kiválasztható; (3) szöveges prompttal megadható a javítás iránya, szempont-gombokkal (skill-szabályokból) gyorsan összeállítható; (4) indítás, követés, alkalmazás a meglévő `LessonRepairPanel` úton.

## Nem cél
Új javító backend (a meglévő `/api/admin/improve-material` + `/improved-files/:id/apply` marad); HTML-anyagok javítása itt (az az Okosítás fül).

## Megoldás
- Szerver: `GET /api/studio/skills/tananyag-javito/roles` (admin) → `{ roles: [{ role, version, text }] }` az author/lektor/bank/ocr szerep-skillből (`roleSkillVersion`, `ROLE_SKILLS`).
- Kliens: `LessonRepairWorkbench.tsx` — tudás-kártya (a `workflowDefinition("repair")` lépései, a `/api/studio/skills/tananyag-javito` aktív szabályai `SKILL_RULES` címmel, szerep-skillek lenyitható `<details>`-ben), leckeválasztó (csak `contentType === "lesson"`, keresővel), alatta `LessonRepairPanel` `presets` szempont-gombokkal.
- `admin.tsx`: új `lesson-repair` fül (validTabs + TabsTrigger + TabsContent, lazy).

## Elfogadás
1. Az új fül megjelenik az admin felületen, a lista csak strukturált leckéket mutat. (böngészős próba vagy build + kódellenőrzés)
2. A szerep-skill végpont adminnak a 4 szerepet adja verzióval, nem-adminnak 401/403. (unit a tiszta összerakó függvényre)
3. A szempont-gomb a szabály szövegét a promptmezőhöz fűzi. (kódellenőrzés)
4. tsc, eslint, teljes teszt, build zöld.

## Kiegészítés (tulajdonosi kérés a munka közben): saját tananyagjavító skill, minden javításnál
- Mért hiány: a javító út (structured-improvement.ts) szerzői és lektori hívása SEMMILYEN szerep-skillt nem kapott.
- `server/studio/repair-skill.ts` `REPAIR_SKILL` (kötelező szakaszok: Szerep/Bemenet/Kimenet/Lépések/Tilalmak/Önellenőrzés) a négy hibaosztály ellen, munkamódként: kérés-lista (hazugság: nincs csendes elhagyás, nincs „elvégeztem” állítás), teljes bejárás első→utolsó fejezet (lost-in-the-middle), tényforrás csak a térkép/helyesbítés (hallucináció), minimális beavatkozás karakterre (túlpolírozás), belső igazság (check-opció ↔ visszajelzés, újraszámolás).
- Alkalmazás MINDEN javító szerzői hívásnál: `withRepairSkill` a rendszerutasítás elején (javító skill + szerző skill), `repairChecklistTail` a kérés VÉGÉN; a lektor a lektor-skillt kapja. Determinisztikus őr: `staleFormProblems` — a helyesbített régi alak bárhol a leckében → szerzői javító kör.
- A menü a javító skillt és a szerep-skilleket verzióval mutatja (`GET /api/studio/skills/tananyag-javito/roles`).
