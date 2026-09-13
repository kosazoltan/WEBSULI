# Internetes tananyag: tudásbázis és 7.4 fúziós gyártás

> Dátum: 2026-09-13 · Szerző: Cursor Grok 4.6 · Állapot: JÓVÁHAGYVA (tulajdonosi kérés: végezd el; a 2. fázis után azonnal a 3.)
> Szabály: `docs/agent-haromfazisu-munka.md`. Végrehajtás: `docs/specs/2026-09-13-web-knowledge-pipeline-vegrehajtas.md`.

## 1. Cél

Az internetes tananyagkészítés a programon belül megadott témára ténylegesen letöltött forrásokból **először tudásbázist** (fogalom, idézet, forráshely) építsen, és **ebből** készítsen 7.4-es, fusion-7.4-4 minőségű HTML tananyagot. A keresési találat, a snippet és a modell emlékezete nem helyettesítheti a forrásszöveget. A feltöltős Studio lánc (kivonat → tanítás → csomagonkénti bank) pedagógiai szerződését a webes út is kövesse; a kimenet továbbra is önálló HTML a közös JSON-bankkal.

## 2. NEM cél (out of scope)

- Nem írunk kézzel Trója-, Egervár- vagy más tananyagot, és nem indítunk fizetett éles gyártást ebben a szeletben.
- Nem módosítjuk a feltöltős/Studio `knowledge_maps` sémát, az authot és a nyilvános HTML-előnézet minőségjelzését.
- Nem lazítjuk a 45/75, 15/25, tíz módszer, két kapukérdés, forrásidézet és független lektor kapuit.
- Nem cseréljük le az Anthropic `web_search` / `web_fetch` eszközöket külső MCP-keresőre.
- A Enhanced készítő és az Okosítás továbbra is a meglévő `lessonHtmlSpecPrompt` utat használja; ez a szelet a webes ügynökre vonatkozik.
- A futó alkalmazás élő QMD/Cogni/SOUL exportja admin-munkamenet nélkül nem pótolható kitalált tartalommal.

## 3. Ellenőrzött előállapot

- A webes mód lépései: `generate → gate → publish → readback` (`source/shared/lesson-workflow.ts`). Nincs `knowledge` lépés. A feltöltésé: `source → scope → knowledge → sourceCheck → pedagogue → author → animator → lektor → gate → readback`.
- `generateWebResearchLesson` egyetlen Claude Opus 5 hívásban keres, letölt és HTML-t ír; `effort: low` (`models.ts`). A 2026-09-09-es költségkérés ezt kérte; ugyanott a komment rögzíti, hogy a hosszú HTML-nél a low rontja a minőséget.
- A szerzői prompt a teljes `LESSON_HTML_SPEC_V74` JS-kiértékelő dumpot, a fúziós szerződést és a „KIMENET-TAKARÉKOSSÁG” (rövid kérdés, tömör minta) utasítást **egyszerre** adja. Ez ellentmond a közös futtatónak (`HTML_LESSON_DATA_CONTRACT`: ne gyárts saját pontozó JS-t) és a tanítási mélységnek.
- A letöltött szöveg csak a natív tool-eredményben él; nincs strukturált tudásbázis-prompt. A lektor a `fetchedTeachingSources` parserre támaszkodik. A korai éles baseline (`tmp/web-research-diagnosis/baseline-evidence.json`) `web_fetch_requests: 0` mellett is HTML-t adott.
- A 2026-09-12-i grounded jelölt szerkezetileg átment a 45/75 kapun, a tartalmi lektor tényszerűséget és magyarázati mélységet elutasította. A régi Trója-rekord `fusion-7.4-2`, 17/34, publikálva maradt, minőségjelzéssel.
- `autonomous.ts` (Studio feltöltés) 2026-09-06-os döntése a **tudásbázis emberi elfogadását** kapcsolta ki, nem a webes kivonatot. A webes út ettől függetlenül soha nem épített térképet.

## 4. Érintett területek

- `source/shared/lesson-workflow.ts` — webes lépéssor: keresés, tudásbázis, szerző, kapu.
- `source/server/studio/web-research-agent.ts` — külön gyűjtő- és szerzői prompt; `web_fetch` korlát.
- `source/server/studio/web-knowledge.ts` — új: forrásszöveg → fogalomjegyzék, tanítás HTML → Lesson, bank beillesztése.
- `source/server/studio/web-research-runner.ts` — kétfázisú gyűjtés, majd szerző + banképítő.
- `source/server/studio/web-research-jobs.ts` — a új lépések látogatása.
- `source/server/ai/models.ts` — gyűjtés `low`, szerzői HTML `medium`.
- `source/shared/lesson-html-data.ts` — JSON-bank beírása.
- Tesztek: `web-knowledge`, `web-research-agent`, `web-research-jobs`, `lesson-workflow`, `lesson-html-spec`, `lesson-skill`, `runtime-knowledge` (dinamikus lépésjárás).
- Dokumentáció/memória/Cursor-szabály/skill: lásd a végrehajtás 8. feladatát.

## 5. Rögzített döntések és kényszerek

1. A keresés és a tananyagírás külön modellhívás. A szerzői hívás nem kap `web_search` eszközt. A tanítás bemenete a letöltött szövegekből képzett, idézetellenőrzött fogalomjegyzék **adatként**, nem utasításként.
2. A webes tudásbázis a meglévő kivonatoló szerződést (`completeExtractionConcepts`, `applyVerbatimChecks`) használja; csak `verbatimOk` fogalom tanítható. Üres vagy idézet nélküli jegyzék nem indíthat szerzői hívást.
3. A 45/75 bankot a meglévő `buildLessonExperience` készíti a tanítás fejezeteiből, csomagonként, nem egyetlen 64k-s HTML-válaszban. A szerzői HTML a tanítást és a négy panelt adja; a JSON-bankot a program írja be.
4. A `web_fetch` `max_uses` 8 marad; `allowed_callers: ["direct"]`; `max_content_tokens` elég nagy a teljes oldalhoz (50_000). Hozzáférési hibaoldal továbbra sem forrás.
5. Gyűjtés: Claude Opus 5, effort `low`. Szerzői HTML és bank: a Studio author modell, effort/timeout a meglévő author lépés szerint. A lektor változatlan.
6. A folyamatverzió `lesson-flow-2`. Régi, `lesson-flow-1` webes futás nem folytatható ezzel a kóddal (nincs aktív webes futás a legutóbbi preflight szerint).
7. A kapu és a tartalmi lektor a teljes, bankkal együtt álló HTML-re fut, a meglévő `checkedResearchArtifact` szerint.

## 6. Edge case-ek

- `web_fetch` nélkül készült HTML: a gyűjtés újrapróbálása, majd hiba; nincs publikálás.
- A fetch-parser nem ismeri a PDF/`encrypted` alakot: az a forrás kiesik; ha semmi nem marad, hiba.
- Az idézetellenőrzésen megbukó fogalom nem kerül a tanításba; ha így nulla tanítható fogalom marad, hiba.
- A tanítás `data-teaching-concepts` ID-i el kell térjenek a jegyzék ID-itől? Nem: pontos másolat kell, különben a Lesson-konverzió hibával megáll, és a szerző javítókört kap.
- Workflow-tesztek, amelyek `generate → gate` ugrást feltételeznek: a közbülső lépéseket be kell járniuk; a kapu nem kerülhető meg.
- A `createResearchJobs` mockolt `generate` függvénye továbbra is teljes artefaktumot adhat; a lépéslátogatást a job-futtató vagy a mock járja be.

## 7. Elfogadási kritériumok (EARS)

- WHEN a webes készítés forrást talál THEN the system SHALL `web_fetch`-csel letöltött, hibás oldal nélkül maradó szöveget tárolni, mielőtt tananyagot ír.
- WHEN a letöltött szöveg megvan THEN the system SHALL idézetellenőrzött fogalomjegyzéket készíteni, és ezt adatként adni a szerzőnek; a keresési snippet önmagában nem lehet szerzői bemenet.
- WHEN a szerzői HTML elkészül THEN the system SHALL a tanított fejezetekből a `buildLessonExperience` csomagonkénti bankját beilleszteni a `websuli-lesson-data` elembe, a tanítás HTML-jének egyéb bájtjait változatlanul hagyva.
- WHEN a webes rendszerprompt a gyűjtőhöz készül THEN it SHALL keresést és letöltést kérni, és SHALL NOT tartalmazni az ES5 `ee_evaluate` dumpot vagy kimenet-takarékossági rövidítési utasítást.
- WHEN a webes szerzői prompt készül THEN it SHALL a fúziós `HTML_LESSON_DATA_CONTRACT` + tanítási minőséget tartalmazni, és SHALL NOT saját pontozó JavaScriptet előírni.
- WHEN hiányzik a letöltött forrás, a tanítható fogalom vagy a 45/75 kapu THEN the system SHALL hibával megállni, és nem publikálni.
- WHEN a folyamatábra webes módot mutat THEN it SHALL a keresés, forrásjegyzék, tananyagírás, kapu, közzététel, visszaolvasás sorrendjét használni.

## 8. Tesztterv

- Unit: fetch-parser PDF/hibaoldal; tudásbázis csak verbatim fogalmakat tanít; HTML→Lesson ID-kötés; bank beírása a tanítást nem módosítja.
- Unit: gyűjtő prompt tiltja a JS-dumpot; szerzői prompt tartalmazza a fúziós szerződést.
- Unit: webes workflow `generate → knowledge → author → gate`; átugrott knowledge/author írás nélkül hibázik.
- Meglévő: `checkedResearchArtifact`, lektor, bankjavítás, HTML-kapu regressziói zöldek maradnak.
- `npm.cmd run check` és a célzott tesztfájlok. Teljes `verify` a kódváltozás után.

## 9. Kockázatok / visszavonási terv

- A banképítő plusz modellhívásai növelik az időt; a 25 perces job-óra a fázisok `updatedAt` frissítésével él, a 20 perces kemény időzítő fázisonként újraindul.
- Régi `lesson-flow-1` webes folytatás elutasított; aktív futás hiányában ez elfogadott.
- Visszaállítás: a szelet commitjainak revertje; éles tananyagot nem írunk.

## 10. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-09-13-web-knowledge-pipeline-vegrehajtas.md`
