# Gyökérok-elemzés és egyben-javítás — Studio tananyag-pipeline (2026-10-01)

Tulajdonosi utasítás: „találd meg végre az összes hiba gyökerét, majd egyszer s mindenkorra, egy hosszú futásban javíts
meg mindent”. Alap: a 2026-10-01-i kilenc élő Egyiptom-futás és három kódaudit (kapuk + keret-számlálók; modell-kimenet
fogyasztók + szolgáltatói utak; bank-szabályok + specek). Minden állítás fájl:sor hivatkozással.

## 1. Mi történt (tények)

| Futás | Eredmény | Közvetlen ok |
|---|---|---|
| 59a9aff7 | bukott, 660 s | `scoringVersion` nem volt beállítva (típusos feladat) — javítva #166 |
| 14da552e | publikált, 825 s | pontjegyzék 14/27 hamis „ambiguous” — javítva #167 (spec-módosítás) |
| dd1413c7 | bukott, 1381 s | kapu-javítás új bankcsomagjaira nem járt kör — javítva #169 |
| 4e7a4d7c | bukott, 1456 s | blokk-kivétel után a bank a kivett tanításra épült — javítva #170 |
| 1a276e30 | bukott, 2371 s | hibás nyílt feladat kivétele → fejezet-csomag minimum — javítva #171 (tulajdonosi döntés) |
| 244bbea1 | bukott, 1546 s | ugyanez módszer-minimummal — javítva #173 |
| 651dadd2 | bukott, 810 s | `value.trim is not a function` a bankgyártásban — tünet javítva #174, **gyökérok: 2.2** |
| a0d0bf35 | publikált, 916 s | 1 letöltött forrás, 1 bennmaradt „tananyag”-hivatkozás — javítva #176 |
| ee6b93c9 | bukott, 30 s | OpenAI-kredit elfogyott; a kivonatolónak nincs átállása — **gyökérok: 2.3** |

Hét fizetős futás ment el arra, amit a 2.4 szerinti offline visszajátszással modellköltség nélkül lehetett volna mérni.

## 2. Gyökérokok

### 2.1 A körlimiten merev, szétszórt kapu-szabályok (5/9 futás)
A limit végén szinte mindig marad 1–3 hibás banktétel. A kapu kiveszi, de a bank minőségi szabályai a KIVÉTEL UTÁNI bankra
változatlan szigorral futnak, és minden egyes szabály külön zsákutca. A lazítások egyenként, külön PR-okban, külön mechanizmussal
kerültek be (`limitAcceptance`, `reconcileBankWithTeaching`, `trimmedSections`, `resolveChoiceGate` újramérés):
`server/studio/limit-policy.ts:67-137`, `server/studio/step-runner.ts:1405-1442`, `:1539-1564`. Az audit szerint a limiten
TOVÁBBRA SEM lazul — a következő futásban zsákutca: fejezetenkénti kvíz-minimum 2×fogalom (`shared/lesson-experience.ts:120`),
a 10 módszerfajta globális megléte (`:195`), 45/75 (`:194`, csak 48/80 tartalékkal), ≥2 kapukérdés (`:196`).

**Döntés (a tulajdonos 2026-10-01-i jóváhagyása: „a limiten csak a 45/75 és a fogalmankénti kvízpár kötelező”):**
a limiten történt tétel-/blokk-kivétel után a bank mércéje EGY helyen definiált **publikálási padló** (`bankPlan.limitRelaxed`):
- marad: séma-alak; 45 feladat / 75 kvíz; fogalmanként felidéző+alkalmazó kvíz; pontosan egy helyes opció; bankterv-konzisztencia
  (újraszámolva); tétel-egyediség; ismétlődő kérdés tilalma; minta = teljes pont; ≥2 kapukérdés; tényhiba tilalma;
- a limiten NEM él: fejezet-csomag módszer-minimum és -fajták; fejezet feladat darab és szóbeli/írásbeli pár; fogalmanként
  nyílt feladat; fejezet kvíz-minimum (2×fogalom); a 10 módszerfajta globális megléte.
- A padló alatt (45/75, kvízpár) és tényhibánál NINCS publikálás — tulajdonosi floor, dokumentált maradó eset.
- Egy függvény állítja be (`applyLimitRelaxation`), determinisztikusan, a kivétel mindkét ágán (`resolveChoiceGate`, blokk-kivétel);
  nem „újramérés, ha hibás”. A `trimmedSections` megmarad adatként, de a limiten a lecke-szintű zászló a mérce.

### 2.2 Determinisztikus eszközök NYERS modell-JSON-on; részleges válasz újrakérés nélkül
(a) `server/studio/experience-builder.ts:~416`: `autofixBankPacket(candidate)` a séma ELŐTT fut (a kommentje szerint szándékosan) →
`server/studio/tools/bank-packet-autofix.ts:76` `evaluateOpenAnswer` → `gradeTypedAnswers` → `referenceValue(a.value)`: a modell
szám típust írt a `value` mezőbe, `.trim()` kivétel, az egész animator-lépés meghalt (javító kör helyett). A zod `superRefine`
NEM fut típushibás adaton (mérve, zod 3.25.76; audit B szintén) — a #174 magyarázata hibás volt, a javítás helyes, de tünetet fedett.
(b) Részleges modellválasz gyorsítótárból újrakérés nélkül: vak megoldó (`step-runner.ts:473-489`, kulcs csak `sourceHash`, a
`partial: true` eredmény is újrahasznosul), tanári ellenőrzés (`step-runner.ts:1625-1640`, a cache a `complete`/`missingIds`
mezőt nem nézi). Ugyanaz az osztály, mint a #168 (átíró kihagyott tételei).

**Döntés:** (a) az előfeldolgozó (autofix) szándékosan a séma előtt fut (formai hibákat javít modell-kör nélkül), ezért a
hibaosztályt két szinten zárjuk: az autofix csak alakhelyes adaton hív pontozót (típus-őr: `sample`, `typedAnswers`), ÉS a
determinisztikus eszköz (autofix, szabályok) bármely kivétele BUKOTT KÍSÉRLET (javító kör), nem a lépés halála. A konkrét
`.trim()`-összeomlást a #174 `referenceValue`-őre már megelőzi (mérve: a próbált 10 alakhiba egyike sem dob kivételt); az itteni
javítás az osztályt zárja le (mutációval igazolva: a kivételt dobó eszköz a catch nélkül megöli a lépést, vele javító kör).
(b) A vak megoldó és a tanári ellenőrzés gyorsítótára csak TELJES eredményt használ újra; részleges eredménynél egy újrakérés.

### 2.3 Szolgáltatói keret-átállás nem egységes
`server/ai/studio-provider.ts:28-44`: kimerült OpenAI-keretnél ugyanaz a modell az OpenRouteren át (10 perces memória) — csak a
`createStudioProvider` útján. Nyers `new OpenAI(...)` kliens, átállás nélkül: kivonatoló `run-extraction.ts:146`, OCR `ocr.ts:240`
és `:305`, témakör-besoroló `one-step.ts:199`. Mért: `429 You have no credits remaining` → „A kivonatolás nem sikerült.”
`isQuotaExhausted` (`server/ai/AIProvider.ts:137-142`) kódra/típusra szűr; a mért üzenet nincs ellenőrizve ellene.

**Döntés:** közös `withQuotaFailover(connection, fn)` a `studio-provider.ts`-ben (ugyanaz a memória és napló; a tartalék
OpenRouter `openai/<model>`); a kivonatoló, az OCR két hívása és a témakör-besoroló ezen fut. `isQuotaExhausted`: 429 + üzenet
„no credits remaining” / „exceeded your current quota” is igaz (OpenAI előre fizetett számlázás; a hivatalos hibadokumentáció
típusa/kódja `insufficient_quota`).

### 2.4 Nincs offline visszajátszás a repóban
Minden javítás ellenőrzése fizetős élő futás volt. Iparági minta (PromptProof, Reenact, Agent Replay; AWS Agentic Lens
AGENTREL07-BP02: osztályozás, keret, tartalék, nem terminálás): rögzített futás determinisztikus, hálózat nélküli visszajátszása CI-ban.

**Döntés:** `scripts/studio/replay-gate.mts` (fixture-ből vagy éles DB-ből; csak olvas, modellt nem hív) + három rögzített bukott
futás (`tests/fixtures/replay/*.json`: lecke, kapu-jelzések, fogalmak) + `tests/limit-replay.test.ts`: a rögzített futások a kapu
limit-ágán PUBLIKÁLNAK. Új lazítási/kapu-szabály ezután csak fixture-rel együtt kerülhet be.

### 2.5 Keret-számlálók (dokumentált design-adósság; most NEM refaktor)
Audit: 8 külön számláló/zászló (`MAX_AUTHOR_ROUNDS`, `MAX_BANK_ONLY_ROUNDS`, `bankOnlyRepairRounds`, `targetedGateRepairRound`,
`targetedLektorRepairRound`, `instructionRepairRound`, `gateBankRepairUsed`, workflow `maxVisits`+`repairGrants`). Iparági ajánlás:
egy réteg, egy keret. A 2.1 padló mellett a limit végén a kapu publikál, így ezek már nem okoznak zsákutcát; a refaktor kockázata
most nagyobb a hasznánál — külön spec, ha a mérés indokolja.

## 3. Nem-cél
Modellválasztás, promptok újraírása, a webes gyűjtő (#176), a játékok, a felület; a 45/75 és a kvízpár floor változatlan.

## 4. Elfogadás (EARS)
- E1 HA a limiten tétel- vagy blokk-kivétel történt, AKKOR a bank a padló szerint mér: a rögzített bukott futások közül
  `d280388a` és `74b63038` a visszajátszásban publikál; `602481ef` a bank-zsákutcán már átmegy, de a 95/80-as fedettségi
  padlón (core 92%) jogosan nem publikál — az elvárt kimenet a fixture-ben rögzítve (`expected`), a visszajátszó csak az attól
  eltérő eredményt tekinti hibának.
- E2 HA a bankcsomag-jelölt alakhibás (pl. szám a szöveg mezőben), AKKOR javító kör indul, és a lépés NEM dob kivételt.
- E3 HA a szolgáltató 429-et ad `insufficient_quota` kóddal VAGY „no credits remaining” üzenettel, AKKOR a kivonatoló, az OCR és a
  besoroló a tartalék útvonalon fut tovább (teszt: hamis szolgáltatóval).
- E4 HA a vak megoldó / tanári ellenőrzés eredménye részleges, AKKOR egy újrakérés; teljes eredmény újrahasznosul.
- E5 Teljes unit + E2E zöld; ezután EGY fizetős élő futás bizonyítékként (tulajdonosi engedély megvan).

## 5. Források
AWS Well-Architected Agentic AI Lens AGENTREL07-BP02; tianpan.co „Retry budgets for LLM agents” (2026-04); mlflow.org
„Enforce, Validate, Observe”; PromptProof, Reenact, Agent Replay (GitHub); DeepLearningAI quiz-generator-v3 (ítélet + újragenerálás
után is publikál, nem bukik); instructor-js (séma-hiba visszacsatolva, `max_retries`); OpenAI 429 `insufficient_quota` dokumentáció.
