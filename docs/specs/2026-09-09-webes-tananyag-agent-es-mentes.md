# Spec: Internetes tananyag-ügynök, mentés a listába, 80%-os készítőfelület

> Dátum: 2026-09-09 · Szerző: Cursor Grok 4.6 · Állapot: JÓVÁHAGYVA (tulajdonosi kérés 2026-09-09: végezd el; a folyamatot ugyanaznap kötelezővé tette)
> Szabály: háromfázisú munka — végrehajtás: `docs/specs/2026-09-09-webes-tananyag-agent-vegrehajtas.md`

## 1. Cél

A Tananyag készítése admin-felületen a tulajdonos szövegesen utasíthassa a Claude Opus 5 ügynököt, hogy az interneten keressen az adott osztályhoz tananyagot, abból készítsen tananyagot, és az eredmény a többi anyag között megjelenjen. Az előnézet után a mentés működjön. A készítő oldal görgetése csökkenjen: a felület a jelenlegi méret 80%-án jelenjen meg.

## 2. NEM cél (out of scope)

- A Studio `lesson-schema` / one-step feltöltős gyártás lecserélése.
- OpenAI / OpenRouter a webes ügynökhöz.
- Új Anthropic kulcs a kódban vagy a chatben; a meglévő `AI_INTEGRATIONS_ANTHROPIC_API_KEY` marad.
- A többi Claude-feladat (`improve`, `htmlFix`, …) effortjának tömeges átírása.
- A főoldal kozmikus hátterének vagy a játékok UI-jának módosítása.
- Tananyag-skill HTML-export mappa (`/mnt/user-data/outputs`) — Studio/HTML a meglévő `html_files` táblába megy.

## 3. Érintett területek

- `source/server/studio/step-runner.ts` — `publishLesson` után a lista-cache invalidálása (ellenőrzött hiány).
- `source/server/cache/HtmlFilesCache.ts` — `getHtmlFilesCache().invalidate()`.
- `source/shared/schema.ts` — `insertHtmlFileSchema.contentType` jelenleg `'html' | 'pdf'`; a Studio `lesson` típust ír.
- `source/client/src/components/EnhancedMaterialCreator.tsx` — publikálás, méret.
- `source/client/src/components/studio/LessonStudioPanel.tsx` — webes kereső fül + méret.
- `source/client/src/pages/admin.tsx` — menü.
- `source/client/src/components/MobileBottomNav.tsx` — a `lesson-studio` fül hiányzik a mobil Anyagok listából (ellenőrzött).
- `source/server/ai/models.ts` — új legacy task, `claude-opus-5`, effort `low`.
- Új: `source/server/studio/web-research-agent.ts`, `web-research-routes.ts`, `source/client/src/components/studio/WebResearchAgentPanel.tsx`.
- Tesztek: `source/tests/`.

## 4. Rögzített döntések és kényszerek

Ellenőrzött tények (kódból, 2026-09-09):

- A Studio kapu `publishLesson` `html_files` sort hoz létre (`contentType: "lesson"`), a GET `/api/html-files/:id` előnézet ezért működhet. A lista-cache (`HtmlFilesCache`, 5 perc TTL) invalidálása **csak** `source/server/routes.ts` html-files CRUD-jában van; a `source/server/studio/` **egyetlen** `getHtmlFilesCache` hívást sem tartalmaz. Ez magyarázza: előnézet van, a többi tananyag listája késik / üres marad a TTL-ig.
- `POST /api/html-files` a `insertHtmlFileSchema`-t használja; `contentType` enumja `'html' | 'pdf'` — `'lesson'` POST-tal elutasított lenne. Az Enhanced készítő `contentType` nélkül küld, a DB default `'html'`.
- Az Enhanced készítő `handlePublish` **nem küldi** a `classroom` mezőt; a backend a címből olvassa vagy 1. osztályra esik.
- Claude HTML-generálás: modell `claude-opus-5`, `output_config.effort` jelenleg `medium` (`LEGACY_MODELS.claudeHtml` / `TASK_EFFORT`).
- Internetes kereső tool a kódban nincs. A `@anthropic-ai/sdk` 0.123 típusai tartalmazzák: `web_search_20250305`, `web_search_20260209`, `web_search_20260318`. Hivatalos példa `claude-opus-5` + `web_search_20260318`: https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool
- Effort `low` = `output_config: { effort: "low" }` (https://platform.claude.com/docs/en/build-with-claude/effort). A tulajdonos a webes ügynökre **minimum effortot** kért.
- Kulcs: `AI_INTEGRATIONS_ANTHROPIC_API_KEY` (már a Claude-route-ok ezt olvassák). Értéket a kód/chat/commit nem tartalmazhat.
- A webes ügynök **HTML tananyagot** készít (v7.1 / meglévő Claude system prompt), nem Studio JSON-leckét. Mentés: `POST /api/html-files` `contentType: "html"` + `classroom`.
- A készítő oldal 80%-a: `CREATOR_PAGE_SCALE = 0.8` a Studio panelen és az Enhanced készítőn (`zoom: 0.8`). Nem a teljes admin.

## 5. Edge case-ek

- Üres utasítás / hiányzó osztály → 400, nincs modellhívás.
- Hiányzó Anthropic kulcs → 503, magyar üzenet, kulcsérték nélkül.
- A modell beszél, de nem ad HTML-t → előnézet üres, mentés gomb tiltva.
- Mentés CSRF: a kliens `apiRequest`-et használ (SEC-107).
- Lista-cache: publikálás után azonnal `invalidate()`, a kliens `['/api/html-files']` refetch.
- Osztály 0–12; a webes keresőben az osztály kötelező mező (a tulajdonos „adott osztályra” kérése). A feltöltős one-step továbbra sem kér osztályt.
- `web_search` 400: `allowed_callers: ["direct"]` a 20250305/20260209 típusokon, ha a default code-execution 400-at adna. Elsődleges tool: `web_search_20250305` + `max_uses: 8` (SDK-ban benne van, kevesebb függő tool).

## 6. Elfogadási kritériumok (EARS)

- WHEN a tananyagkészítés fülön az „Internetes keresés” mód aktív THEN the system SHALL szöveges chatet mutatni, kötelező osztályválasztóval.
- WHEN az admin utasítja a chatet tananyag-keresésre THEN the system SHALL Claude Opus 5-öt hívni `AI_INTEGRATIONS_ANTHROPIC_API_KEY`-jel, `output_config.effort: "low"`, és `web_search` tool-lal.
- WHEN a modell HTML-t ad `<!-- HTML_START -->` jellel THEN the system SHALL előnézetet mutatni ÉS működő „Mentés a tananyagok közé” gombot, amely `POST /api/html-files` hívást végez címmel, leírással, classroommal és HTML tartalommal.
- WHEN a mentés sikeres THEN the system SHALL a GET `/api/html-files` listában az új sort visszaadni (cache invalidálva), és a főoldalon a többi anyag között megjelenik.
- WHEN a Studio kapu `publishLesson` lefut THEN the system SHALL a `HtmlFilesCache`-t invalidálni.
- WHEN a tananyagkészítés vagy az Enhanced készítő panel renderelődik THEN the system SHALL 0.8-as nagyítással megjelenni (`data-testid="creator-page-scale"`).
- WHEN az admin mobilon az Anyagok menüt nyitja THEN the system SHALL a „Tananyag készítése” (`lesson-studio`) elemet is listázni.

## 7. Tesztterv

- Unit: cache invalidálás `publishLesson` statikus őr (step-runner olvassa a `getHtmlFilesCache`).
- Unit: `insertHtmlFileSchema` elfogadja a `lesson` contentType-ot.
- Unit: `effortFor("webResearch") === "low"` és `resolveLegacyModel("webResearch") === "claude-opus-5"`.
- Unit: web-research kérés séma (üres üzenet / hiányzó osztály).
- Unit: `CREATOR_PAGE_SCALE === 0.8` és a panelek `creator-page-scale` tesztid-t renderelnek.
- Statikus: MobileBottomNav tartalmazza a `lesson-studio` tabot.
- Playwright: `/__studio-panel-probe` — internetes keresés vezérlő látható; a scale wrapper létezik. (A meglévő LS-8 feltöltés-teszt ne törjön.)

## 8. Kockázatok / visszavonási terv

- Az Anthropic web_search költséges; `max_uses: 8` és `effort: "low"` korlátozza.
- A `zoom: 0.8` Firefoxban hiányos; `@supports not (zoom: 1)` fallback `transform: scale(0.8)` + `width: 125%`.
- Visszavonás: a spec-hez kötött commitok revertje; a cache-invalidálás önállóan is biztonságos.

## 9. Végrehajtási utasítás

- Végrehajtás: `docs/specs/2026-09-09-webes-tananyag-agent-vegrehajtas.md`

## 10. Felülvizsgálat — Claude Code, 2026-09-09 (2. kör)

Kódolvasás + hivatalos doksi (platform.claude.com web-search-tool, 2026-09-09) alapján ellenőrzött tények:

- `web_search_20250305` + `claude-opus-5` a hivatalos példákban szerepel; `allowed_callers: ["direct"]` ezen a verzión az alapérték (ártalmatlan).
- `output_config.effort: "low"` az Opus 5 legalacsonyabb szintje — a „minimum effort" kérés teljesül. Kulcs: `AI_INTEGRATIONS_ANTHROPIC_API_KEY` (render.yaml:44 deklarálja; a helyi `.env`-ben NINCS, ezért helyi valós hívás nem tesztelhető).
- `POST /api/html-files` már invalidálja a lista-cache-t; a Studio `publishLesson` invalidálása az 1. körben bekerült.

Talált hibák az 1. kör route-jában (`server/studio/web-research-routes.ts`):

1. Nincs `pause_turn` kezelés — a szerveroldali keresőciklus 10 iteráció után szünetel, a válasz csonkán „kész"-nek látszott. Javítás: folytatási ciklus (max. 5), a szüneteltetett assistant-üzenet változatlan visszaküldésével.
2. `max_tokens` (16384) elérése nem volt észlelve — csonka HTML is menthető volt. Javítás: `stop_reason` ellenőrzés (`max_tokens` / `refusal` → hiba), `max_tokens` 32000, a HTML csak záró `</html>` mellett menthető.
3. 180 s abszolút időkorlát — több keresés + hosszú HTML Opus-sebességgel könnyen túllépi, a stream félbeszakadt. Javítás: 120 s tétlenségi (esemény nélküli) időkorlát + 15 perc kemény plafon.
4. Nincs visszajelzés keresés közben, és a forráslista nem került a leírásba. Javítás: `status` és `sources` SSE-esemény, a források a panelen és a mentett leírásban.
5. A teljes HTML a chat-buborékba ömlött (sok görgetés). Javítás: a `<!-- HTML_START -->` után a chat csak státuszt kap (`content_replace`), a HTML az előnézetbe megy.
6. A `title` mező a sémában volt, de a prompt nem használta. Javítás: a kért cím a system promptba kerül.
7. A system prompt a v7.1 követelmények töredékét tartalmazta. Javítás: a claude-chat v7.1 blokk (4 tab, kognitív elemek, technikai tiltások) átemelve.

### 10.1 Valós API-próba (2026-09-09, helyi kulccsal a Hermes `.env`-ből)

A route pontos request-alakjával (`claude-opus-5`, `effort: low`, `web_search_20250305`, v7.1 prompt, 5. osztály) futtatott szkript: `stop_reason: end_turn`, 1 keresés / 9 találat, 537 kimeneti token, 13 s, `pause_turn` nem történt. A Render `websuli-api-eu` szolgáltatás env-listájában az `AI_INTEGRATIONS_ANTHROPIC_API_KEY` kulcsnév szerepel (érték nem ellenőrzött).

### 10.2 Elavult modell (tulajdonosi kérés, 2026-09-09)

Az OpenRouter nyilvános `/models` listájában a `qwen/qwen3.8-max` (Studio `lektor` primary) már nem létezik (csak `qwen3.8-max-0902`). Tulajdonosi döntés: a lektor `x-ai/grok-4.6`; az author-fallback ezért `qwen/qwen3.8-max-0902` (a D1-garancia — author és lektor különböző család, fallbackokkal együtt — áll, `tests/models-routing.test.ts` zöld). Minden más modell-id (Anthropic Models API, OpenAI `/v1/models`, OpenRouter `/models`) létezik.

### 10.3 Éles felületi próba (websuli.vip, 2026-09-09 19:48–19:52, admin-munkamenettel)

- A tananyagkészítés fül a friss frontenddel: „Feltöltés / Internetes keresés” váltó, 80%-os méret, egy képernyőn elfér görgetés nélkül (1409×633-as nézetben is). A tulajdonos saját fülén a régi bundle volt gyorsítótárban (nincs váltó, 100% méret) — frissítés kell.
- Internetes keresés mód: 5. osztály + törtek utasításra az ügynök keresett (Sulinet, oktatas.hu kerettanterv, kooperativ.hu, matekmegoldasok.hu), forrásokkal összefoglalt, majd elkezdte a 4 fülös HTML-t (45-ös feladatbank, 75-ös kvízbank, forrásblokk).
- **Bizonyított hiba az 1. körös (ce87955, éles) route-ban:** ~3 perc után „Időtúllépés: a keresés vagy a tananyagkészítés túl sokáig tartott.” — a 180 s abszolút korlát a HTML közepén megszakította a streamet, a kliens pedig eldobta a választ (konzol: `[WebResearchAgent] Error: Időtúllépés…`). A 2. körös javítás (tétlenségi korlát + 15 perc plafon) ezt oldja meg; élesre csak deploy után kerül.
- További éles lelet: a modell a `<!-- HTML_START -->` után ```html kerítésbe tette a dokumentumot → `extractGeneratedHtml` mostantól leszedi a kerítést, a prompt tiltja.
- Mentést élesben nem nyomtam meg: a `POST /api/html-files` e-mail-értesítést küld az osztály feliratkozóinak.

### 10.4 A javított logika teljes futása (valós API, 2026-09-09 19:53–19:56)

Ugyanaz az utasítás, mint az éles próbán, a 2. körös route-logikával (idle-timeout, 32 000 token, kerítés-szűrés): `end_turn`, 2 keresés, **223 s**, **17 347 kimeneti token**, lezárt `</html>`, kerítés nélkül, max. eseményköz 9,9 s. Mindkét szám a régi route korlátja felett van (180 s, 16 384 token) — a régi verzió ezt az anyagot sem tudta volna elkészíteni. A kész HTML fejnélküli Chrome-ban: 4 fül működik, Feladatok 15 beviteli mező, Kvíz 25 kérdés A/B/C, nincs `alert`, nincs Google Fonts, nincs túlcsordulás, nincs JS-hiba.
