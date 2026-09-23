# Minden szerepkörnek kötelező skill (runbook) — és a lektor támpontjai

Dátum: 2026-09-23 · Tulajdonosi kérés · Ág: `feat/lesson-instructions-repair`

## Cél
Minden modellhívás a saját szerepkörének skilljével (működési leírás / runbook) induljon, egységes szerkezetben (Szerep, Bemenet, Kimenet, Lépések, Tilalmak, Önellenőrzés), tűpontosan és token-takarékosan, a négy hibaosztály ellen: hallucináció, hazugság, túlpolírozás, lost-in-the-middle. A lektor kapja meg a hiányzó támpontokat. A meglévő skillek felülvizsgálva.

## Mért kiindulás (kód-audit, 2026-09-23)
- Skillel fut: ocr, extract, pedagogue, author, animator, bank (minden úton), lektor (Studio + javító út).
- Skill NÉLKÜL (17 hívási pont): besoroló (`one-step.ts`), forrás-helyesbítő (`source-corrections.ts`, két úton), fogalomjavítás utáni lektor (`step-runner.ts` `fixConceptOnLesson`), a teljes webes ág (forrásgyűjtő/kivonatoló, HTML-szerző, webes lektor, webes tanítás- és bankjavító), HTML-okosító (`improveAsync.ts`), HTML-hibajavító/téma/chat, „AI készítő” elemzők és chatek, anyagkészítő chat, kvízgenerátor (`routes.ts`, `gameQuizGeneratorService.ts`).
- A lektor skilljéből hiányzó támpontok: mérce-sorrend (helyesbítés > térkép > átirat > tanári kérés > saját tudás), kötelező bejárási sorrend, cáfolás a jelentés előtt, „egy gyökérok = egy jegyzet” (a 4756f8c2 futás ugyanarra a hibára 4 blokkolót adott), kötött jegyzet-alak.

## Megoldás
- `server/studio/support-skills.ts`: a gyártó 7 szerep (role-skills.ts, tesztben rögzített lista) mellé a TÁMOGATÓ szerepek skilljei ugyanabban a szerkezetben, verzió-hash-sel: `scope`, `corrector`, `web-research`, `web-author`, `web-lektor`, `web-repair`, `html-improve`, `html-fix`, `creator-analyze`, `creator-chat`, `quiz-generator`. `withSupportSkill(key, system)` idempotens, a rendszerutasítás ELEJÉRE.
- Lektor-skill átírva a hiányzó támpontokkal (a tesztben rögzített horgony-mondatok megmaradnak); a fogalomjavítás utáni lektor-hívás is megkapja.
- Meglévő skillek felülvizsgálata: extract (átírási hiba ≠ forráshiba: a quote betűhű, a term/definition a szándékolt olvasat), author (teljes bejárás, belső igazság) — csak mért hibaosztályhoz kötött, rövid kiegészítés.
- Kikényszerítés: statikus teszt — minden `server/**/*.ts` fájl, amely modellt hív (`callStepModel(`, `chat.completions.create(`, `messages.create(`, `.streamChat(`, `provider.chat(`), skill-segédet is használ (`withRoleSkill`, `roleSkillBlock`, `withSupportSkill`, `withRepairSkill`, `skilledPromptLookup`), és minden skill a kötelező szakaszokat tartalmazza, méretkorláttal.
- Admin „Tananyagjavító” menü: a skill-lista a támogató skilleket is mutatja.

## Nem cél
A régi felületek (HTML-okosító, AI készítő) funkcionális átalakítása; modellcsere.

## Elfogadás
1. Minden skill tartalmazza a 6 kötelező szakaszt, ≤ 2600 karakter (a lektor ≤ 4600). (unit)
2. A statikus teszt a mai kódon zöld, és egy skill nélküli új hívás bukást okozna. (unit)
3. A lektor-skill: mérce-sorrend, bejárás, cáfolás, egy gyökérok = egy jegyzet, jegyzet-alak; a régi horgonyok megmaradnak. (unit)
4. A fogalomjavítás utáni lektor, a besoroló, a helyesbítő, a webes és a régi hívások system promptja a skill-fejléccel indul. (unit, ahol a prompt tiszta függvényből jön; kód-ellenőrzés a routes.ts-ben)
5. tsc, eslint, teljes teszt, build zöld.

## Mérés (2026-09-23, éles adatból, csak olvasás; `.measure-lektor` harness, lektor = grok-4.6)
Visszajátszás: a két valódi, lektoron bukott javító futás (4756f8c2, e3348439) jelöltje a futásnapló ellenőrzőpontjaiból újraépítve (szerzői kimenet + tárolt bankcsomagok, modellhívás nélkül), feltételenként 3 lektorhívás.

| Jelölt | RÉGI (dac806a prompt, skill nélkül — élesben ez futott) | ÚJ skill | ÚJ skill + tanári kérés/helyesbítés |
|---|---|---|---|
| A | 1,1,1 — hamis: „föld-változása” visszakövetelése | 0,0,0 | 2,2,2 — jogos: Stonehenge, kódex (a régi jelölt a helyesbítés előtti alakot tanítja) |
| B | 1,1,1 — hamis: c7 „10 év = 1 évszázad” tanításának követelése | 0,0,0 | 2,2,2 — jogos, mint fent |

A mérés közben talált második hibaosztály (önellentmondó forrásállítás: c7 ↔ c8) az első ÚJ-skill mérésen még 3/3 blokkolót adott; a lektor-skill 8. pontja (önellentmondó forrás → book_probably_wrong info) után 0/3. Hamis blokkoló: 6/6 → 0/6.
