# Szerzőmodell: GPT-6 Luna elsődleges, GPT-5.6 Terra tartalék (2026-09-29)

## Kérés és döntés
Tulajdonos (2026-09-29): „Állítsd át az author lépés elsődleges modelljét GPT-6 Terra modellre, és a
GPT-5.6 Terra modell legyen a fallback.” GPT-6 Terra nem létezik (ellenőrizve: OpenAI `GET /v1/models`
a fiók kulcsával → `gpt-6-astra`, `gpt-6-luna`, `gpt-6-sol`, `gpt-5.6-terra`; OpenRouter `GET /api/v1/models`
→ nincs `gpt-6-terra`). A tulajdonos választása a felkínált GPT-6 modellek közül: **GPT-6 Luna**.

## Kiváltó hiba (mérve)
Élő webes próbagyártás (job `97e16600…`, Studio-futás `0f22a6af…`, „Oszthatóság 3-mal és 9-cel”):
az author-lépés `gpt-5.6-terra` válasza „nem érvényes JSON (29651 karakter, lezárt, a végén hibás,
ismeretlen pozíció)” volt → a teljes gyártás 302 s után `error`. Ugyanaz a lépés ugyanazzal a bemenettel
újrafuttatva (diagnosztikai harness, DB-írás nélkül) érvényes JSON-t adott → **alkalmi** hiba. Gyökérok:
az author-lépésnek NINCS tartalék modellje (`server/ai/models.ts:98` — „Author and reviewer have no
cross-vendor fallback”), ezért egyetlen hibás válasz az egész gyártást leállítja; a bank és az animátor
tartalékkal/újrapróbálással véd.

## Mérés GPT-6 Lunával (ugyanaz a bukott job, `STUDIO_MODEL_AUTHOR=gpt-6-luna`)
| futás | idő | hossz | JSON | séma/lefedettség |
| --- | --- | --- | --- | --- |
| 1 | 84 s | 33 391 kar. | érvényes | átment (→ animator) |
| 2 | 96 s | 34 589 kar. | érvényes | átment (→ animator) |
(Összevetés: `gpt-5.6-terra` ugyanitt 98 s, 30 297 kar., érvényes; az élő futásban egyszer hibás.)
Ár (OpenRouter-lista): GPT-6 Luna 0,10 / 0,50 $ per M token; GPT-5.6 Terra 2 / 12 $.

## Cél
- `DEFAULT_MODELS.author = "gpt-6-luna"`; `FALLBACK_MODELS.author = "gpt-5.6-terra"`.
- A lektor független marad: az author elsődleges és tartalék modellje is `openai` család, a lektor
  `grok-4.6` (xai) és tartaléka `anthropic/claude-sonnet-5` → a meglévő `assertDistinctFamilies` őr átmegy.

## Nem cél
- Más lépések modelljei (extract, bank-mentőkör, animator-tartalék marad `gpt-5.6-terra`).
- A tartalmi hatókör (a webes források teljes fogalomlefedése) — külön tulajdonosi döntés.

## Edge case-ek
- Kimerült OpenAI-keret: a `QuotaFailoverProvider` ugyanazt a modellt az OpenRouteren hívja
  (`openai/gpt-6-luna` — a listán elérhető).
- `STUDIO_MODEL_AUTHOR` környezeti felülírás továbbra is elsőbbséget élvez.
- A webes HTML-út (`resolveWebResearchAuthorModel`) is a Studio authorét használja → szintén GPT-6 Luna.

## Elfogadás (EARS)
- **E1** A szerzőlépés SHALL elsődlegesen `gpt-6-luna`-val futni.
- **E2** Ha az elsődleges modell hívása `StepModelError`-ral bukik (pl. érvénytelen JSON), a lépés SHALL
  egyszer `gpt-5.6-terra`-val lefutni, és a job SHALL a ténylegesen használt modellt rögzíteni.
- **E3** Minden author × lektor (elsődleges és tartalék) pár SHALL különböző családú maradni.
- **E4** `npm test`, `check`, `check:test`, `lint`, `build` zöld; élő próbagyártás `done`.

## Dokumentált tesztmódosítás (spec-változás)
`tests/lesson-pipeline-runner.test.ts` „(o) author hiba esetén nincs külső modellre visszaesés” és `tests/direct-studio-api.test.ts` „cheap OpenRouter helpers … independent Grok review”: a régi
`FALLBACK_MODELS.author === undefined` állítás a most megváltozott tulajdonosi döntést rögzítette. A teszt
szándéka (nincs KÜLSŐ családra visszaesés, a szerzőhiba hibára állítja a jobot) megmaradt és szigorúbb lett:
a tartalék a szerző saját családjában van (`providerForModel` egyezik), és ha az elsődleges ÉS a tartalék is
bukik, a job `error`, a hívássorrend `[elsődleges, tartalék]`.
A `direct-studio-api.test.ts`-ben a `FALLBACK_MODELS.author === undefined` helyett három állítás: a tartalék a
szerző családjában van, és különbözik a lektor elsődleges ÉS tartalék modelljének családjától.

## Review-kör (PR #131, 2026-09-29)
- **R1 (Codex, Copilot) — a régi webes HTML-út nem használta a tartalékot** (`web-research-runner.ts`, csak a
  `WEB_RESEARCH_PIPELINE=html` visszaállításnál aktív): a szerzői hívás mindig `authorModel`-lel futott. Javítás:
  `webAuthorModelForAttempt(attempt, primary, fallback)` — az első kísérlet az elsődleges modellen, a javítókör(ök)
  a tartalékon (ha a kulcsa be van állítva); ha az elsődleges szolgáltató HIBÁT ad, ugyanaz a kísérlet egyszer a
  tartalékon fut. Teszt: tiszta függvény + bekötés-őr.
- **R2 (Copilot) — a bukott hívás tokenje elveszett**: a `callUncachedStepModel` a hosszkorlát, üres és
  érvénytelen JSON ágon a `workflowUsage` NÉLKÜL dobott. Javítás: a használat ezeken az ágakon is rögzül
  (a sikeres ágon továbbra is a `callStepModel` rögzíti — nincs dupla számolás). Teszt: workflow-ban egy érvénytelen
  (20/10) és egy érvényes (5/5) hívás után a látogatás `tokensIn=25`, `tokensOut=15`.
