# Forrás-olvasás és tantárgy/évfolyam-felismerés: OpenRouter helyett saját kulcs (2026-10-14)

## Kérés és döntés
Tulajdonos (2026-10-14): az egylépéses gyártás elakadt és hibát jelzett. A rossz MI van bekötve OpenRouteren át; ezt
el kell felejteni, és saját API-kulccsal kell dolgozni. A forrás olvasása és a tantárgy/évfolyam felismerése OpenAI API-n
fusson, „GPT-6.1 Luna” modellel. Pontosítás: hasonlítsuk össze a GPT-6 Lunát és a Claude Haiku 5.5-öt (mindkettő high effort,
tudás és költség), és az olcsóbb, de még észszerűen okos legyen.

- **„GPT-6.1 Luna” nem létezik.** Ellenőrizve 2026-10-14: OpenAI `GET /v1/models` a fiók kulcsával → `gpt-6-luna`,
  `gpt-6-sol`, `gpt-6-astra`, `gpt-6.1-sol`, `gpt-5.6-luna/sol/terra`; a `gpt-6.1-luna` hívás → 404 `model_not_found`;
  a hivatalos árlista (developers.openai.com/api/docs/pricing) sem tartalmazza. Tulajdonosi választás: **gpt-6-luna**.
- **Hatókör** (tulajdonosi választás): csak a forrás-OCR, a tantárgy/évfolyam-felismerés (scope) és a katalógus-besoroló.

## Kiváltó hiba (mérve, élő DB, csak olvasás)
`one_step_runs` 2026-10-14 11:47–11:54 (4 futás, mind `error`): „Nem sikerült felismerni a tantárgyat/osztályt (404 Qwen3 VL 32B
Instruct was deprecated on Oct 9, 2026 …)”. Út: `lesson-pipeline-routes.ts:411` és `studio/routes.ts:227` →
`callScopeModel(…, resolveStudioModel("ocr"))` → `DEFAULT_MODELS.ocr = "qwen/qwen3-vl-32b-instruct"` (OpenRouter).

## Modellválasztás (mérve 2026-10-14)
Mérőkészlet (csak olvasás az élő DB-ből): (a) 56 egyedi, jóváhagyott tudástérkép-forrásszöveg a tulajdonos által rögzített
tantárgy/évfolyam címkével, a valódi scope-prompttal (`scopeRequestParams` + `inferScope`); (b) a 10 leckés kézi pilot
(`docs/measurements/2026-10-05-classify-pilot-expected.json`) a valódi besoroló-prompttal, évfolyam visszatartva. 2 futás.

| feladat | modell (high effort) | hívás | tantárgy | évfolyam pontos | ±1 | $/hívás | medián / p95 / max idő |
| --- | --- | --- | --- | --- | --- | --- | --- |
| scope | gpt-6-luna | 112 | 102 | 67 | 93 | 0,00106 | 7,0 / 19,3 / 27,8 s |
| besorolás | gpt-6-luna | 20 | 20 | 19 | 20 | 0,00047 | 5,1 / 12,2 / 12,2 s |

- A tantárgy-eltérések egy része pontozási (pl. „Magyar irodalom” vs „magyar nyelv és irodalom”), valódi tévedés pl. a
  „Nagy-Britannia földrajza” → „Angol”. Az évfolyam-eltérések nagy része címke-zaj: ugyanaz a Mezopotámia-forrás 5. és 6.
  évfolyammal is jóvá lett hagyva.
- Kimeneti tokenek (scope, high): p50 476, p95 1475, **max 2448** → a mostani 2000-es keret csonkítana.
- **Claude Haiku 5.5 (pótmérés 2026-10-14, ugyanaz a készlet, pontozó és high effort):**

  | feladat | modell | tantárgy | évfolyam pontos | ±1 | $/hívás | medián idő |
  | --- | --- | --- | --- | --- | --- | --- |
  | scope (112) | gpt-6-luna | **102** | **67** | **93** | **0,00106** | 7,0 s |
  | scope (112) | claude-haiku-5-5 | 94 | 55 | 91 | 0,00152 | 5,5 s |
  | besorolás (20) | gpt-6-luna | 20 | **19** | **20** | **0,00047** | 5,1 s |
  | besorolás (20) | claude-haiku-5-5 | 20 | 18 | 18 | 0,00088 | 5,3 s |

  A Haiku jellemző hibái: a 5. évfolyamos természetismeretet 7× „Biológia”-nak sorolta (Luna: 1×), egy forrást „nem tantárgyi
  forrás / 0”-nak, a Hunyadit 10. évfolyamnak; egy pilot-leckénél nem adott évfolyamot. Azonos listaár mellett ~1,4–1,9×
  több tokent használt. **Döntés: a gpt-6-luna marad** — pontosabb és olcsóbb. Közös gyengeség: több 5. évfolyamos
  Mezopotámia-forrást mindkét modell 9. évfolyamnak sorolt (a scope-prompt évfolyam-horgonyai lehetséges javítási pont).
  A mérés egy érvényes Anthropic-kulccsal futott; a repók helyi `.env`-jeiben lévő példány visszavont (401) — a kulcsok helye
  nem kerül trackelt fájlba (AGENTS.md).
- Hivatalos árak (Standard, rövid kontextus, per M token): gpt-6-luna 0,10 / 0,50 $; gpt-6.1-sol és gpt-6-sol 2 / 10 $;
  claude-haiku-5-5 0,10 / 0,50 $ (≤100K prompt).

## Cél
- **C1** Új Studio-lépés: `scope` (tantárgy/évfolyam-felismerés), alapmodell `gpt-6-luna`, közvetlen OpenAI. A két hívóhely
  (`lesson-pipeline-routes.ts:411`, `studio/routes.ts:227`) a `resolveStudioModel("scope")`-ot használja az `ocr` helyett.
  Felülírás: `STUDIO_MODEL_SCOPE`.
- **C2** `callScopeModel`: közvetlen OpenAI-n `reasoning_effort: "high"` (a mért beállítás), kimeneti keret 2000 → 8000
  (a mért max 2448 háromszorosa). OpenRouter-modellnél (csak env-felülírással) a régi `reasoning` mező marad.
- **C3** Katalógus-besoroló: `CLASSIFIER_MODELS = ["gpt-6-luna", "gpt-6.1-sol", "gpt-6-sol"]`. A konszenzus két KÜLÖNBÖZŐ
  modellt követel (pilot-lelet 2026-10-05), ezért a Luna mellé független második vélemény és döntő kell, mind közvetlen OpenAI.
- **C4** A forrás-OCR-lépés (`ocr`) modellcseréje a kézírásos mérés UTÁN (lásd Nyitott kérdés).

## Nem cél
- A többi OpenRouter-hívás (szerző-tartalék Qwen, gateHelper/quizPolish DeepSeek, OCR-tartalék GLM, a kimerült-keret
  átállás) — a tulajdonos a szűk hatókört választotta; külön döntés.
- A forrás-OCR kétolvasós fúziója (gpt-6.1-sol + claude-opus-5-5) változatlan.

## Edge case-ek
- `STUDIO_MODEL_OCR` környezeti felülírás továbbra is elsőbbséget élvez.
- Hiányzó OpenAI-kulcs: a scope-hívás érthető „hiányzó kulcs” hibát ad, nem OpenRouterre esik.
- High effortnál a gondolkodás elviheti a kimeneti keretet → a keretet a mért maximum fölé kell tenni (csonka válasz = hiba).

## Nyitott kérdés: az `ocr` lépés
A `tests/studio-ocr-recall.test.ts` rögzíti: a beállított OCR-modell a mért kézírásos mezőny legjobbja. A `gpt-6-luna`
nincs a fixture-ben, a mintaképek (#190, 3 lap; S11/5, 5 lap) nincsenek a gépen. Mérés nélküli csere = a teszt gyengítése,
ezért TILOS. Az élő forrás-OCR a kétolvasós fúzión fut (gpt-6.1-sol + claude-opus-5-5), az `ocr` modell csak tartalékúton olvas.
Kockázat: ha az élő Anthropic-kulcs is érvénytelen, a fúzió B-olvasója bukik — ezt az élő futás mutatja meg.

## Érintett fájlok
`server/ai/models.ts`, `server/studio/one-step.ts`, `server/studio/lesson-pipeline-routes.ts`, `server/studio/routes.ts`,
`server/catalog/classify.ts`; tesztek: `tests/direct-studio-api.test.ts`, `tests/catalog-classify.test.ts`, új célzott tesztek.

## Elfogadás (EARS)
- **E1** WHEN egylépéses gyártás tantárgyat/évfolyamot ismer fel, THE rendszer SHALL a `gpt-6-luna`-t közvetlenül az OpenAI-n
  hívni, OpenRouter-kulcs nélkül is.
- **E2** A scope-kérés SHALL `reasoning_effort: "high"`-t és ≥ 8000 kimeneti keretet küldeni, `reasoning` mező nélkül.
- **E3** `STUDIO_MODEL_SCOPE` felülírás SHALL elsőbbséget élvezni; az `ocr` lépés modellje változatlan.
- **E4** A besoroló SHALL a `gpt-6-luna`-val kezdeni, és két különböző közvetlen OpenAI-modell egyezését követelni.
- **E5** `npm test`, `check`, `check:test`, `lint`, `build` zöld; élő próbahívás a scope-úton `gpt-6-luna`-val sikeres.

## Jóváhagyás
Tulajdonos, 2026-10-14: „Most csak a scope” (az `ocr` lépés cseréje a kézírásos mérés után) és „gpt-6.1-sol + gpt-6-sol”
a besoroló második véleményének/döntőjének.

## Megvalósítás és bizonyíték
- RED: `tests/scope-luna-openai.test.ts` 4/4 bukott a várt helyen (nincs `scope` lépés; a hívóhelyek az `ocr` modelljén).
- Reverz-mutáció: a `studio/routes.ts` hívóhely visszaírása `ocr`-ra és a `SCOPE_EFFORT` `low`-ra állítása → 2 bukás.
- Élő E5 (OpenRouter-kulcs nélkül, a valódi `callScopeModel` + `inferScope` út): „Oszthatóság 3-mal és 9-cel” → Matematika / 6
  (6,3 s); „A víz körforgása a természetben” → Környezetismeret / 4 (4,1 s) — mindkettő egyezik a jóváhagyott címkével.
- A `scopeRequestParams` effort-paramétert kap (alap `low` → 2000 keret, változatlan a GLM-mérés tesztje); a `scope` lépés
  `SCOPE_EFFORT = "high"` → 8000 keret; a gyártóspecifikus mezőt az `ocrVendorRequest` képzi (OpenAI: `reasoning_effort`).

## Dokumentált tesztmódosítás (spec-változás)
- `tests/catalog-classify.test.ts`: a `CLASSIFIER_MODELS` rögzített listája a tulajdonosi döntés szerinti új lista.
- `tests/direct-studio-api.test.ts`: a modelltérkép-állítás kiegészül a `scope: "gpt-6-luna"` állítással; az `ocr` állítás marad.
- `tests/models-routing.test.ts`: a lépésenkénti szolgáltató-mátrix az új `scope` lépéssel bővül (`openai`); a meglévő sorok változatlanok.
