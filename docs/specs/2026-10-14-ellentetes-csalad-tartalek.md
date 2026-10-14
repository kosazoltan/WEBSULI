# Ellentétes családú tartalékmodell mindenhol (2026-10-14)

Végrehajtás: `docs/specs/2026-10-14-ellentetes-csalad-tartalek-vegrehajtas.md`.

## Tulajdonosi kérés és döntések (2026-10-14)
- „Mindenhova tedd be fallbackként az API kulccsal az ellentétes AI modellt: ahol OpenAI GPT modell van, oda az Anthropic
  Opus 5.5 medium efforton, ahol Anthropic modell van, oda az OpenAI GPT-6.1 Sol medium efforton.”
- Ütközés a független lektor (D1) szabályával → tulajdonosi döntés: „a szerző és a lektor is megkapja az ellentétes
  tartalékot, de ha a szerző GPT-re esik vissza, a lektor egy harmadik családra — QWEN 3.8 MAX 0902 — vált”.
  Pontosítás: a Qwen 3.8 Max 0902 az OpenRouteren **high** efforton fut.
- Meglévő tartaléknál: **az első tartalék cserélődik** az ellentétes családúra; a későbbi lépcsők (második tartalék,
  mentőkör) maradnak.

## Tények (forrásból; leltár 2026-10-14)
- `qwen/qwen3.8-max-0902` létezik az OpenRouter `/models` listáján (2026-10-14), `reasoning`/`reasoning_effort` paraméterrel.
- Az OpenAI chat-completions út (`OpenAIProvider.chat`/`chatStreamed`, nem Responses módban) **nem küld** gondolkodási
  effortot — ma csak a lektor (Responses mód) kap effortot. A GPT-6.1 Sol „medium” tartalékhoz ezt az utat ki kell egészíteni.
- Az Anthropic út az effortot `output_config.effort`-ként küldi, ha a konfiguráció ad effortot (`ClaudeProvider.ts:99-101`);
  a lektor-ág ma csak xai/openai modellnek ad effortot (`studio-provider.ts:187`).
- A lektor ma statikusan választ (`resolveStudioModel("lektor")` + `FALLBACK_MODELS.lektor`); a lecke tényleges szerzőjét
  a job nem őrzi meg (a `studio_jobs.model` oszlopot a későbbi lépések felülírják).
- A webes szerző javító körei (attempt ≥ 1) mindig a szerző-tartalékon futnak (`webAuthorModelForAttempt`) — a tartalék
  GPT-re cserélésével a webes lecke rendszeresen vegyes (Claude + GPT) szerzőségű lesz.

## Alapszabály
- **Ellentétes tartalék:** OpenAI GPT elsődleges → `claude-opus-5-5`, medium; Anthropic Claude elsődleges → `gpt-6.1-sol`,
  medium. Más családú elsődleges (qwen, glm, deepseek, grok) változatlan.
- **Effort:** a tartalékhívás a lépés szabályzatától függetlenül **medium** (a GPT-6.1 Sol chat úton is ténylegesen elküldve).
- **Lektor-lánc a tényleges szerzőség szerint:** a lektor modellcsaládja SOHA nem egyezhet egyetlen olyan családdal sem,
  amelyből a leckébe modell írt (`authorModels`). Sorrend:
  - ha a szerzők között van OpenAI (GPT-tartalék írt): `[qwen/qwen3.8-max-0902 (high), lektor-elsődleges, ellentétes tartaléka]`;
  - különben: `[lektor-elsődleges (gpt-6.1-sol), ellentétes tartaléka (claude-opus-5-5), qwen/qwen3.8-max-0902]`;
  - a lánc a szerzők családjait kiszűri. Eredmény a mai modellekkel: csak Claude írt → `gpt-6.1-sol → qwen`; csak GPT →
    `qwen → claude-opus-5-5`; mindkettő → `qwen`.
- **Indítási őr** (`assertDistinctFamilies`): a konfigurált lektor-elsődleges nem lehet a konfigurált szerző-elsődleges
  családjában (env-hiba), és minden lehetséges szerzői családhalmazra a lektor-lánc nem üres.

## Szeletek
### A1 — Studio feltöltéses gyártás (ez a PR)
- `models.ts`: `CROSS_FAMILY_FALLBACK` (gpt→opus-5-5, claude→gpt-6.1-sol), `crossFamilyFallback(model)`;
  `FALLBACK_MODELS`: pedagogue `gpt-6.1-sol` (volt grok-4.6), author `gpt-6.1-sol` (volt qwen3.8-max-prime), animator
  `gpt-6.1-sol` (volt gpt-5.6-terra), bank `claude-opus-5-5` (volt gpt-5.6-terra; a mentőkör `BANK_RESCUE_MODEL` marad),
  lektor: dinamikus lánc (`lektorChainFor`). `LEKTOR_THIRD_FAMILY_MODEL = "qwen/qwen3.8-max-0902"`,
  `MODEL_REASONING_EFFORT` + `qwen/qwen3.8-max-0902: high`. `SECOND_FALLBACK_MODELS.pedagogue` (terra) marad.
- `studio-provider.ts`: `createStudioStepProvider(model, step, { fallback })` — tartalékhívásnál medium effort; OpenAI chat
  úton `chatReasoningEffort` → `reasoning_effort` elküldve; a lektor-ág Anthropic modellnek medium, OpenRouter-modellnek a
  `MODEL_REASONING_EFFORT` szerinti effortot ad.
- `OpenAIProvider.ts`: `chatReasoningEffort` konfiguráció → `reasoning_effort` a chat (és streamelt chat) kérésben.
- `step-runner.ts`: a tartalékhívások `{ fallback: true }`-val; a szerző sikeres mentésekor `output.authorModels`
  (halmozott, körökön át); a lektor lánca `lektorChainFor(authorModels)`; ismeretlen szerzőség (a telepítés előtt írt job)
  → a konfigurált szerző-elsődleges számít szerzőnek (`gpt-6.1-sol → qwen`). Indok: a régi szerző-tartalék Qwen volt, GPT
  nem írhatott bele; a „tartalék is szerző” feltevés minden folyamatban lévő jobot indokolatlanul Qwen-lektorra vinne.
  Maradék kockázat: régi, Qwen-tartalékkal írt job + bukó elsődleges lektor → a Qwen-lektor ugyanabból a családból jön (ritka).
- Indítási őr átdolgozva.
### A2 — Webes gyártás (az A1-gyel EGY PR-ban)
- Indok: a webes szerző javító körei (attempt ≥ 1) mindig a szerző-tartalékon futnak — az A1 egyedül élesítve GPT-írta HTML-t
  GPT-lektorral ellenőriztetne (D1-sértés). Ezért a két szelet együtt megy ki.
- A webes szerzői HTML checkpointja a HTML-t író modellt is hordozza (`web-author-html-2`; a régi `-1` checkpoint nem
  használható újra — folyamatban lévő webes futás folytatáskor a szerzői HTML-t újra elkészíti). Minden kör a TELJES HTML-t írja,
  így a szerző a sikeres kör modellje; a tartalmi javító (`callTeachingRepair`, a szerző elsődlegesén) is szerzőnek számít.
- A webes lektor (`callTeachingReviewer`) a `lektorChainFor(authorModels)` láncon fut (kulcs nélküli tag kimarad); a webes
  szerző-tartalék és a webes bank első tartaléka medium efforttal.
### B — Tartalék nélküli hívóhelyek
- Ma tartalék nélkül futó OpenAI/Anthropic hívások kapnak ellentétes tartalékot: vak megoldó, bank-ellenőr, szövegjavító,
  tanári kérés ellenőrzése, scope, kivonatoló (extract), webes forrásgyűjtés, legacy útvonalak (htmlFix, theme, chat,
  analyzeFiles, quizGenerator), HTML-modernizálás (`improve`: terra → gpt-6.1-sol), fogalomjavítás. Külön PR.
- Nem változik: az OCR-fúzió (két olvasója már két család, egymás tartalékai), a katalógus-besoroló (konszenzus, nem
  tartalék), a nem OpenAI/Anthropic elsődlegesek.

## Nem cél
- Elsődleges modellek cseréje; a második tartalék / mentőkör lépcsők cseréje; az OpenRouter kvóta-átállás (ugyanaz a modell).

## Edge case-ek
- A lektor-lánc üres → indítási hiba (őr), futásidőben érthető hiba.
- Régi, `authorModels` nélküli job → a konfigurált szerző-elsődleges családja kizárva (lásd A1).
- A tartalék kulcsa hiányzik → a meglévő viselkedés (a lánc következő tagja / hiba).
- A Qwen lektor `high` gondolkodása a 32k lektor-keretből fogy — a keret marad (mért max a szerzőnél 24k+); csonkulás esetén
  a meglévő egyszeri nagyobb keretű újrapróba (`maxOutputForModel`) érvényes.

## Elfogadás (EARS)
- **E1** WHEN egy OpenAI elsődleges modell hívása szolgáltatói/kimeneti hibával bukik, THE tartalék SHALL `claude-opus-5-5`
  lenni medium efforttal; Anthropic elsődlegesnél `gpt-6.1-sol`, és a kérés SHALL `reasoning_effort: "medium"`-ot küldeni.
- **E2** THE lektor SHALL NOT olyan családból futni, amelyből modell a leckébe írt; GPT-szerzőnél az első lektor SHALL
  `qwen/qwen3.8-max-0902` lenni high efforttal.
- **E3** THE indítási őr SHALL a mai alapértelmezésekkel nem dobni, és SHALL dobni, ha a lektor-elsődleges a
  szerző-elsődleges családjában van.
- **E4** `check`, `check:test`, `lint`, `test`, `build` zöld; a régi tartalékokat rögzítő tesztek a dokumentált
  spec-változás szerint frissülnek (lista a végrehajtási dokumentumban).
- **E5** Élő próbahívás (kis, csak olvasó, nem éles adat): `gpt-6.1-sol` chat úton `reasoning_effort: "medium"` + JSON-mód →
  200; `qwen/qwen3.8-max-0902` `reasoning.effort: "high"` → 200.
