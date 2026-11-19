# Spec: Tananyaggyártás minősége — értelmezett forrásbeolvasás, változatosság, mért javítás, brit felolvasás

> Dátum: 2026-11-18 · Szerző: ügynök (tényfeltárás + terv) · Állapot: JÓVÁHAGYVA — tulajdonosi döntések 2026-11-18 (9. szakasz); a D6 egyeztetés alatt
> Módosítás 2026-11-18: az SK3 a tulajdonos kérdőíves döntéséhez igazítva (D7 — éles gyártásban a költségkeret túllépése csak jelez, nem állít meg; gyártás-stop kapcsoló nem épül).
> Végrehajtási utasítás: [`2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md`](2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md)
> Ág: `claude/tananyag-gyartas-minoseg-8fa0b9` (terv); a szeletek saját ágon, saját PR-ban készülnek.
> Jelölés: **TÉNY** = a kódból / mérésből ellenőrizve · **BECSLÉS** = számolt, nem mért · **UNVERIFIED** = nem ellenőrzött.
> Minden kódútvonal a `source/` alatt értendő, ha nem `docs/`, `.agents/`, `.claude/` vagy `scripts/qa/` kezdetű.

## 1. Cél

A tulajdonos kérése (2026-11-18) négy pont:

1. A gyártás **értse meg a forrás-PDF ábráit, táblázatait, folyamatait** (értelmezett, multimodális beolvasás), és ezek
   **jelenjenek meg a leckében**.
2. Legyen **változatosabb a megjelenítés és a szöveg**.
3. A **teljes folyamat, a promptok és az ellenőrzők átnézése és mért javítása** (hatékonyabb, szebb, okosabb).
4. **Élethű brit (en-GB) felolvasás** a nyelvleckékben.

A munka tíz tartalmi szeletben (S1–S10) és egy kapu-szeletben (SK1–SK5), szeletenként önálló, ~400 sor diff alatti PR-ban készül; minden javítás előtte–utána méréssel zárul.

## 2. NEM cél (out of scope)

- Játékok fájljai (`client/src/game-engine/**`, `client/src/data/vocabBank/**`, a játék-specek), a `scripts/qa/**` és a kapu-hookok —
  másik munkamenet dolgozik rajtuk; ez a munka nem nyúl hozzájuk.
- Adatbázis-migráció az S8b egyetlen új tábláján (`lesson_tts_audio`, D4 döntés) kívül (az S1 a meglévő `source_files` jsonb-be
  ment); `db:push`; éles adat átírása; a 239 kiadott lecke
  újragyártása (a változások új gyártásra hatnak; a régi leckéknél csak megjelenítési, adatírás nélküli javítás megengedett).
- A pontozás és a tanulási cél megváltoztatása a változatosság érdekében: a fogalomfedettség, a „tanítás a kérdés előtt” szabály,
  a 45 / 75-ös bank (tartalékkal 59 / 98) és a fejezet Próbája érintetlen. Az egyetlen pontozási változás az S7 (tulajdonosi döntés).
- Az arculati elv megváltoztatása: díszítőelem csak előre gyártva, felirat csak kódszótárból, az évfolyamsáv színvilága marad.
  A sávon belüli megjelenési változatok (új fejezetdíszek, blokkelrendezések — a 03-as jelentés 8. javaslata) képgyártási költség
  miatt külön tulajdonosi döntést igényelnek, ebben a tervben nincsenek.
- Forrás-PDF bájtjainak tárolása, kivágott kép beillesztése a leckébe (D1 döntés).
- Objektumtár bevezetése és a játék-szóbank hangjai (D4 döntés: adatbázis, csak a leckék).
- Ügynök által indított éles tömeges hanggyártás vagy éles adatbázis-írás (a tulajdonos indítja admin-végpontról).
- A gyakorlóbank modelljének cseréje (Opus marad — korábbi döntés), a lektor gyorsítótár-átszervezése, a válaszkulcs-próbák
  számának csökkentése, a gépi rubrika-szigorítás átírása (a 04-es jelentés P2, P3, P11 tétele) — mért, de külön szelet; kanbanba.
- DOCX / MHT forrás képi értelmezése (ezeknél a modell nem lát képet), a régi lépésenkénti csővezeték és a webes gyűjtő út.
- A 04-es jelentés „diktálási mondat” része (a tulajdonos kérésére nem értelmezzük).
- Vészleállító / egységes gyártás-stop kapcsoló (D7 döntés: „Nem kell”) és éles gyártásban a költség vagy a futásidő miatti
  megállítás (D7: „Csak jelezzen”) — nem épül. A meglévő körszám-plafonok értéke és viselkedése nem változik.
- Más őrök: a borító-újrapróba, az e-mail-visszapattanás webhookja, az éles adatbázis-írás hookja, az éjszakai invariáns-söprés és
  a telepítés utáni füstpróba — ez a munka nem nyúl hozzájuk (az SK3 riasztó őre önálló, a futás telemetriájára épül).

## 3. Tényfeltárás — az öt jelentés lényege

Forrás: öt csak olvasó jelentés a munkamenet jegyzeteiben (kód-olvasás, az éles adatbázison kizárólag `SELECT`, fizetős hívás
nélkül). A nyilvános repóba azonosító, cím szerinti tétellista, tanulói adat nem kerül.

### 3.1 A forrás útja a kódban — hol vész el az ábra (01-es jelentés)

- **TÉNY:** a PDF natív `document` blokként eljut a modellhez: `server/studio/single-run/conversation.ts:32`, `:80`;
  `server/studio/source-block.ts:11-18`. A fő beszélgetés előzményeként a terv, a tananyag és az ábra állomáson is jelen van.
- **TÉNY:** az 1. állomás kérése csak betűhű átiratot és `term / definition / quote` fogalmakat kér, vizuális elemről egy szót sem:
  `server/studio/single-run/engine.ts:293-297`; a kimenet típusa `SingleRunMap` (`engine.ts:93`).
- **TÉNY:** szöveges PDF-nél a program mércéje a `pdfjs` lapos szövegrétege, a modell átirata eldobódik (`engine.ts:314`, `:326`);
  a „van szó az oldalon” heurisztika: `server/studio/document-source.ts:143`.
- **TÉNY:** fogalom csak szó szerint idézhető szövegből lehet (`engine.ts:341-342`), ezért a rajzban hordozott tudás kiesik.
- **TÉNY:** a tudástérképen nincs mező vizuális elemre: `shared/schema.ts:604-608` (`source_files`: `{ name, kind, pages?,
  extractedText? }`), `:645-647` (`sourceRef.page` / `region` létezik, de a mentés csak `{ file }`-t ír:
  `server/studio/single-run/live.ts:35-39`); `shared/knowledge-map-schema.ts:70-75`.
- **TÉNY:** a lejjebb lévő promptok a térképből csak `localId, term, definition, quote, examWeight`-et kapnak
  (`server/studio/step-io.ts:272-288`; betöltés: `server/studio/pipeline-store.ts:172`, `:179`).
- **TÉNY:** az ábrakészítő bemenete a megírt lecke és a térkép; szabálya: „Numbers, names and labels in a figure come from the lesson
  text or the concept map only” (`step-io.ts:684`) — új ábrát talál ki, nem a forrásét veszi át. Hibás ábrafoltnál nincs újrakérés
  (`engine.ts:679-686`), a pótlék a példa lépéseiből készült `process` doboz (`server/studio/section-visuals.ts:21-22`, `:32`).
- **TÉNY:** a lecke sémájában hat blokkfajta van (`shared/lesson-schema.ts:55`), 16 ábrafajta (`:29-49`); táblázat, szabálydoboz,
  összehasonlító kártya, elágazó folyamat **nincs**. A `process` 2–8 lineáris lépés (`shared/lesson-visual-params.ts:72`).
- **TÉNY:** a bank a fejezet ábra nélküli változatából épül (`server/studio/experience-builder.ts:451-454`); a lektor csak a lapos
  átiratot kapja (`engine.ts:783`, `:809`; `server/studio/lektor-view.ts:30-31`).
- **TÉNY:** térképről indított gyártásnál a beszélgetésben nincs forrásblokk (`live.ts:129`) — a vizuális leltárnak ezért a térképen
  kell élnie.
- **TÉNY:** régi kliensnél az ismeretlen ábrafajtájú blokk olvasáskor kimarad (`shared/lesson-schema.ts:68-79`) — ez az új fajták
  visszafelé-kompatibilis útja.

### 3.2 A két minta-PDF és a kész lecke (02-es jelentés) — ez az S10 alapvonala

| Minta | Forrás | Leltári tétel | Teljesen megjelent | Részben | Nem |
|---|---|---:|---:|---:|---:|
| HM — „How much / How many” (angol, 6. o.) | 8 oldal | **38** | **6** | 23 | 9 |
| PT — „Prepositions of time” (angol, 4. o.) | 9 oldal | 39 | 0 (élesben nem készült belőle lecke) | — | — |

A HM-lecke vizuális bontása (TÉNY, a lecke JSON-ja és az élő oldal alapján):

| Forrás vizuális elemtípus | A forrásban | A leckében megmaradt |
|---|---:|---|
| Táblázat | 9 | **0** táblázatként (az élő oldalon 0 `<table>`); egy SVG-párokként él tovább |
| Döntési folyamatábra (elágazó) | 1 | 1, de az elágazás nélkül, lineáris címkesorként |
| Képes szókártya (8) és képes feladat (4 kép) | 12 kép | 0 |
| Színes szabály- / válaszkártya-pár | 2 pár | 0 |
| Kiemelt doboz | 5 | 0 dobozként (3-nak a szövege megvan) |
| Végigvitt színkód (zöld / narancs) | van | nincs |

- **TÉNY:** a futásban a modell 6 SVG-ábrát rajzolt, a program 4-et eldobott (köztük a kérdésépítő táblaábrát); az eldobás oka
  nincs tárolva, csak a szervernaplóba íródik (UNVERIFIED az ok; jelöltek: `server/studio/visual-patch.ts:64-65`, `:77-78`, `:83-88`).
- **TÉNY:** a szókeret rövidítő kört kényszerített ki (2319 látható szó → legfeljebb 2160).
- **TÉNY:** a fedettségmérő 100%-ot mutatott (kulcsfogalom 12/12, kiegészítő 8/8), mert csak fogalmat számol.
- **TÉNY:** a tárolt kinyert szövegben (18 497 karakter) az „ábra”, „táblázat”, „nyíl”, „szín” szavak 0-szor fordulnak elő; a képes
  feladat helyén négy üres vonal áll.
- **TÉNY:** a futás 18 perc 19 mp, 38 modellhívás; bemenet 503 372 token (gyorsítótárból 95 790), kimenet 131 990 token — a skill
  árképletével számolva ≈ 4,3 USD (BECSLÉS; pénzbeli költség nincs tárolva). Az 1. állomás: 26 617 kimeneti token, 181 mp.
- A teljes, tételes leltár (HM-01…HM-38, PT-01…PT-39) az S10-ben kerül a repóba mérő-adatként (rövid leírásokkal, szó szerinti
  forrásszöveg és forrásfájl nélkül).

### 3.3 Változatosság (03-as jelentés) — 239 kiadott lecke, 2104 fejezet; szöveges mérés 15 lecke mintán

| Mutató | Mért érték |
|---|---|
| Fejezetváz `explain → example → check → recap` (ábra és try nélkül) | **97,4%** |
| Pontosan egyező blokksor `explain, example, animate, check, recap` | **61,6%** |
| Két különböző leckéből vett fejezet azonos mintájú | **40,4%** |
| `try` blokk | a blokkok **0,7%-a**; 239 leckéből 196-ban egy sincs |
| Soha nem használt ábrafajta | **6 / 16** (`fraction`, `geometry`, `map`, `wordBuilder`, `sentenceParts`, `triangleArea`); szabad rajz + folyamat = 63% |
| Hibás válasz visszajelzése (4124 db) | **46,8% „Jó próba…”**; 97,2% bátorító nyitás; 91,7% „…, de” szerkezet |
| Helyes válasz visszajelzése (1754 db) | 85,8% három szóval indul (Pontosan / Így van / Helyes) |
| Nyitás | 15 / 15 lecke: négycímkés Célkártya → pontosan 5 mondatos mese → magyarázat; 15 hősből 9 három név |
| Módszersor | minden lecke `prediction`-nel indul; a leckék 40%-ában az első négy módszer azonos |
| Magyarázó próza | **nem** ismétlődik (421 bekezdésből 364 különböző kezdés) |

Az okok a szerződésben vannak, nem a modellben (TÉNY, kódhelyek):

- a fejezetív a kapuban rögzített: `shared/lesson-arc.ts:86`, `:107`, `:186`, `:198`, promptként `:221`;
- a tervező egyetlen ívet nevez meg, kétszer: `server/studio/step-io.ts:325`, `:341`; a szerző a terv sorrendjét követi:
  `server/studio/role-skills.ts:116`; a változatosságot kérő egyetlen mondat (`role-skills.ts:124`) ezekkel ütközik;
- a nyitás szó szerint előírt: `shared/lesson-opener.ts:72` („PONTOSAN 5 mondat”);
- a visszajelzés és a kérdésformák mintamondattal adottak: `shared/lesson-opener.ts:115`, `:133` („Peti szerint…”), `:136`
  („Jó próba, de itt a … a kérdés, ezért …”); az ítéletet már ma is a kód írja ki: `shared/lesson-ui-text.ts:7`;
- a módszerfajták rögzített körbeosztása: `shared/lesson-bank-plan.ts:43-46`;
- négy ábrafajta paramétereit egyik prompt sem írja le (`shared/lesson-visual-params.ts:170-177`); a fajtaválasztó 8 fajtát említ,
  és név szerint ad színeket (`role-skills.ts:145-146`); fejezetenként „legfeljebb 2 (inkább egy jó)” ábra (`role-skills.ts:138`).

### 3.4 Prompt- és ellenőrző-audit, javítókörök (04-es jelentés) — utolsó 30 telemetriás futás

- **TÉNY:** összesen 199,3 USD; **átlag 6,64 USD és 18,3 perc futásonként**. Állomásarány: gyakorlóbank 39,4%, ellenőrzés 19,7%,
  lektorálás 12,9%, tananyag 10,4%, forrás és tudásbank 7,3% (átlag 0,49 USD, 18 ezer kimeneti token), ábrák 4,9%, terv 2,8%.
- **BECSLÉS:** a javító és ismételt ellenőrző fordulók ára ≈ 1,2 USD futásonként (17–18%); a telemetria a javító fordulók tokenjeit
  nem bontja külön (`server/studio/single-run/telemetry.ts:36-45` csak darabszámot ír).
- **TÉNY:** `prompt_version` minden futásnál `single-run-1` (`engine.ts:48`), miközben a promptok többször módosultak — a futások
  promptgenerációja utólag nem választható szét.
- A bank javítóköreinek okai (66 naplósor, ~14 napos naplómegőrzés): hibás próba teljes pontot kap 39% · **számolási ellenőrző 20%**
  · egyválasztós tétel 12% · ismétlődő kérdés 11% (már javítva) · minta ≠ teljes pont 9% · nem értelmezhető JSON 8% · séma 2%.
- **TÉNY (reprodukálva, szintetikus bemenettel):** a számolási ellenőrző hamis riasztást ad kitevőre (`49 = 7²`), vegyjel- és
  jelindexre (`CO2 = 44`, `ΔH1 = −120`), arányra (`1 : 50 000`), vegyes számra (`4 2/7`), tartományra (`10–11`) és az „a” névelőre a
  kifejezés előtt. Helyek: `server/studio/tools/arithmetic-claims.ts:29`, `:161`; `shared/answer-value.ts:242`. Az éles tételek
  szövege UNVERIFIED (csak az üzenet alakja egyezik).
- **TÉNY:** a forrás-állomás idézethibája (a futások 23%-a) teljes JSON-t újrakérő modellkört kap (`engine.ts:221`), pedig a
  determinisztikus áthelyező megvan: `server/studio/verbatim.ts:118` — egyetlen hívója a `server/studio/source-transcript.ts:53`.
- **TÉNY:** a terv kért alakja `"visual": { "world": string }` (`step-io.ts:307`), a séma zárt felsorolás (`step-io.ts:112`); a
  lista csak prózában szerepel (`step-io.ts:294`) → mért javítókörök.
- **TÉNY:** a prompt szerint a szókeret túllépése „minőségi jelzés” (`step-io.ts:460`, `:502`), a program fizetős rövidítő kört indít
  (`engine.ts:661-662`); a futások 23%-ában volt ilyen kör (átlag 99 mp).
- **TÉNY:** a bankkísérletek okai csak a naplóba íródnak (`engine.ts:763-766`), a job kimenetébe nem.
- Nyílt válasz szabályai (kanban #131): `OPEN_ANSWER_RULES_HU` (`shared/lesson-experience-score.ts:305-309`) 3 491 karakter,
  verzió és lenyomat-őr nélkül; hosszkorlát-teszt `< 3500` (`tests/scoring-v2.test.ts:123`). A `main`-en a `minWords` alatti válasz
  0 pont (`lesson-experience-score.ts:239`, `:264`); a fél pontos változat a helyi `fix/nyilt-feladat-rovid-valasz` ágon van (távoli
  ág és PR nélkül — a 4 commit / 8 fájl / +551 sor adat UNVERIFIED, a jelentésből). A döntőbíró a pontozót felülírja, ha magasabbat
  ad (`server/arbiter/arbiter.ts:90-93`) — egy tömör helyes válasz így 1 pontot kaphat.
- Elavult dokumentum: `docs/lesson-improvement.md:7` a runtime-3 lépésgépet nevezi „tényleges működésnek”, a `:92` a `relocateQuote`
  hívását állítja; az analitika skill (`.claude/skills/websuli-gyartas-analitika/`) forrása hiányzik az `.agents/skills/` alól (TÉNY,
  könyvtárlista), és „92 kvízkérdést” ír (a kódban 75 + 23 tartalék: `shared/lesson-experience.ts:19`).

### 3.5 Brit felolvasás (05-ös jelentés)

- **TÉNY:** a lecke szószedete a böngésző hangját használja; a `pickVoice` a lista **első** `en-GB` hangját veszi minőségi rangsor
  nélkül, annak híján bármely `en-*` hangot (`client/src/lesson-runtime/ExperienceSpeech.tsx:78-84`).
- **TÉNY:** a szerveres tartalék a nem hivatalos Google Fordító-hang, a régiós kód levágva (`shared/speech-fallback.ts:8-11`,
  `:23-26`; `server/routes.ts:2641-2642`, `:2649`; a teszt ezt rögzíti: `tests/speech-fallback.test.ts:17`) — soha nem brit.
- **TÉNY:** a HTML-leckék előírása `u.pitch = 1.1`-et kér, és csak pontos nyelvegyezésre választ hangot
  (`server/ai/lesson-html-spec.ts:478-482`).
- **TÉNY:** van élő ElevenLabs-kulcs a szerver környezetében a kisfilmekhez (`server/lesson-clips-providers.ts:31`); objektumtár a
  kódban nincs; a tartalomcímzett kiszolgálás mintája megvan (`server/lesson-clip-media.ts:11`, `:16`); a lecke oldalának CSP-je
  `default-src 'self'` (`vercel.json:111-118`) → hang csak azonos eredetről játszható.
- **TÉNY (éles `SELECT`):** 37 `en-GB` lecke, 985 egyedi szó / kifejezés + 1 314 egyedi példamondat = **2 299 hangfájl, ~43 ezer
  karakter**; a játék-szóbankkal együtt ~7 600 fájl, ~152 500 karakter.
- **BECSLÉS:** ElevenLabs (80 USD / 1 M karakter) a leckékre 3,44 USD, a teljes körre 12,20 USD; Azure Neural (15 USD) 0,64 / 2,29 USD;
  tárhely 25 MB (leckék) / 80–90 MB (teljes kör), mono MP3-mal. Az árlisták egy része és az előfizetési csomag UNVERIFIED.

## 4. Érintett területek (szeletenként; a pontos lépések a végrehajtási fájlban)

| Szelet | Fő fájlok |
|---|---|
| S4 | `server/studio/tools/arithmetic-claims.ts`, `shared/answer-value.ts`, `server/studio/single-run/engine.ts`, `server/studio/step-io.ts`, `server/studio/tools/outline-autofix.ts`, `shared/run-telemetry.ts`, `server/studio/single-run/telemetry.ts`, tesztek |
| S1 | `shared/source-visuals.ts` (új), `shared/knowledge-map-schema.ts`, `shared/schema.ts` (csak típus), `server/studio/single-run/engine.ts`, `single-run/live.ts`, `server/studio/pipeline-store.ts`, `server/studio/step-io.ts`, `server/studio/coverage.ts`, `shared/lesson-schema.ts`, tesztek |
| S2 | `shared/lesson-schema.ts`, `shared/lesson-visual-params.ts`, `shared/lesson-block-label.ts`, `client/src/lesson-runtime/blocks/source-visuals.tsx` (új), `blocks/animate-blocks.tsx`, `lesson-runtime/lesson-design.css`, `explain-paragraphs.ts`, `server/studio/lektor-view.ts`, böngészős spec + konfig |
| S3 | `server/studio/step-io.ts`, `server/studio/role-skills.ts`, `server/studio/visual-patch.ts`, `server/studio/section-visuals.ts`, `server/studio/single-run/engine.ts`, `server/studio/lesson-metrics.ts`, `server/studio/experience-builder.ts`, `shared/run-telemetry.ts`, tesztek |
| S5 | `shared/seeded.ts` (új), `shared/lesson-feedback-openers.ts` (új), `shared/lesson-ui-text.ts`, `shared/lesson-opener.ts`, `shared/lesson-bank-plan.ts`, `client/src/lesson-runtime/VerdictFeedback.tsx`, tesztek |
| S6 | `shared/lesson-section-shapes.ts` (új), `shared/visual-kind-plan.ts` (új), `shared/lesson-arc.ts`, `shared/lesson-band.ts`, `shared/lesson-visual-params.ts`, `server/studio/step-io.ts`, `server/studio/role-skills.ts`, tesztek |
| S7 | `shared/lesson-experience-score.ts`, `shared/lesson-experience.ts`, `server/studio/role-skills.ts`, `server/studio/answer-key-writer.ts`, `server/studio/experience-builder.ts`, `server/arbiter/arbiter.ts`, `tests/scoring-v2.test.ts` és társai |
| S8 | `shared/voice-rank.ts`, `shared/tts-audio-key.ts` (újak), `migrations/00NN_lesson_tts_audio.sql` (új), `shared/schema.ts`, `server/tts/audio-store.ts`, `audio-routes.ts`, `audio-gate.ts`, `generate-lesson-audio.ts`, `admin-routes.ts` (újak), `scripts/tts/generate-lesson-audio.mts` (új), `client/src/lesson-runtime/ExperienceSpeech.tsx`, `server/ai/lesson-html-spec.ts`, `shared/speech-fallback.ts`, tesztek |
| S9 | `docs/lesson-improvement.md`, `.agents/skills/websuli-gyartas-analitika/SKILL.md` (új forrás) + `.claude/skills/…` tükör, `docs/agent-csapdak.md` |
| S10 | `scripts/measure/source-gap-table.mts`, `trial-ledger.mts`, `fixtures/source-inventory-{hm,pt}.json` (újak), `scripts/measure/single-run-measure.mts` (csak ha a fájlból indítás hiányzik) |
| SK | `server/studio/gates/{types,config,source-coverage-gate,variety-gate,release-gate}.ts`, `shared/run-budget.ts`, `shared/variety-metrics.ts`, `scripts/gates/run-gates.mts`, `scripts/measure/{variety-fetch,variety-measure}.mjs`, `run-budget-baseline.mts`, `gate-baseline.mts` (mind új), `server/studio/single-run/engine.ts`, `telemetry.ts`, `shared/run-telemetry.ts`, tesztek |

## 5. Rögzített döntések és kényszerek

1. **A vizuális leltár az 1. állomás kimenetének része, új modellhívás nélkül** — a PDF már ott van a modellnél (3.1).
2. **Mentés migráció nélkül:** a `knowledge_maps.source_files` jsonb elemeibe (`visuals` kulcs). A `shared/schema.ts` csak a
   `$type<…>` jelölésben változik (nincs SQL-változás); a régi sorok `visuals` nélkül érvényesek maradnak.
3. **A vizuális tétel önálló, oldalszámmal igazolt tanítható tartalom**, nem szó szerinti idézet. A fogalmak idézetkapuja
   (`checkVerbatim`) változatlan; a vizuális tételre külön, determinisztikus igazolás fut: létező forrásfájl, oldalszám ≥ 1, létező
   fogalom-hivatkozás, és — ahol van oldaljelölős kinyert szöveg — a tétel szövegének szóegyezése az oldal szövegével
   (`verified: "text"`), különben `verified: "visual-only"`.
4. **A hibás vizuális tétel nem indít fizetős javítókört:** a program a hibás tételt kihagyja és megszámolja (a javító forduló a
   teljes JSON-t az átirattal együtt újrakérné — 3.4).
5. **Új megjelenítők új ábrafajtaként** (`animKind`: `table`, `ruleBox`, `compareCards`, `decisionTree`, `pictureCards`), nem új
   blokkfajtaként — így a régi kliens a 3.1 szerinti úton kihagyja, a fejezetív kapuja és a blokk-elágazás változatlan.
6. **Színek csak az évfolyamsáv tokenjeiből** (`accent`, `accent2`, `accent3`, semleges): a forrás színkódja jelentésként
   („a” / „b” / „c” tónus) öröklődik, nem hexakódként. Felirat (blokkfejléc, „gépi hang”, bátorító nyitás) csak kódszótárból.
7. **A változatosságot a kód osztja ki determinisztikusan**, a térkép azonosítójából képzett magból; a modell a kiosztott formát
   tölti ki. Véletlen, óra, hálózat a kiosztásban nincs — a futás megismételhető és mérhető.
8. **Promptváltozás = verzióemelés:** a bank szerződését érintő változásnál `LESSON_OPENER_VERSION`, a pontozó szabályánál új
   `OPEN_ANSWER_RULES_VERSION`, a döntőbírónál `ARBITER_VERSION` emelkedik; a folyamatban lévő futások a régit kapják.
9. **Tesztet gyengíteni tilos.** Az egyetlen korlátváltozás (`tests/scoring-v2.test.ts:123`, `< 3500` → `< 3800`) dokumentált
   spec-változás: a tulajdonosi döntés (fél pont) szövege 3 491 → 3 657 karakter (a jelentés mérése); a „tömör maradjon” szándék
   megmarad, és mellé rögzített lenyomat-őr kerül.
10. **Fizetős próbafutás csak a D2 keretén belül** (30 USD, eldobható adatbázison; futásonként 7,5 USD programból tartott
    plafon); túllépés előtt megállás és kérdés. Ez a PRÓBAKERET kemény plafon marad (D7) — az éles gyártás költségkerete ettől
    eltérően csak jelez. Az éles adatbázist ügynök csak olvassa.
11. **A szeletek sorrendje:** S1a → S1b + SK1 → S2 → S3 → S4 → SK3 → S10 (első mérés) → S5 → S6 + SK2 → S7 → S8 → SK4 (+ SK5) →
    S9 → S10 (záró mérés).
12. **Állandó tulajdonosi elv (2026-11-18), szó szerint:** „A programon belül minél kiterjedtebb módon használd a webhookokat,
    hookokat, scripteket, hogy minél pontosabb tesztekkel behangolt scriptek, webhookok szabályozzák a működést. Nehogy valamelyik
    mesterséges intelligencia-ügynök hallucinációja, túlgondolása, túlfutása károsan hasson a program céljaira, futására.”
    Következmény ebben a tervben: (a) a modell kimenetét séma, szabály és mérőszám ítéli meg — másik modell csak ott, ahol szkript
    nem tud dönteni; (b) minden kapu bukásának következménye determinisztikus és véges (legfeljebb egy célzott pótló forduló,
    utána megállás és jelzés); (c) a meglévő körszám-plafont és a próbakeretet a program tartja, éles gyártásban a költségkeret
    túllépését a program jelzi (e-mail), de a futást nem állítja meg (D7); (d) minden kapuhoz mutációs ellenpróba és mért
    alapvonal tartozik (SK szelet); (e) minden szelethez tartozik szkript-ellenőr (6. szakasz vége). A kapuk a gyártás
    csővezetékébe kötött programpontok (belső hookok) és parancssori szkriptek; külső eseményre épülő webhook ebben a körben
    nincs — ahol később külső esemény vezérel folyamatot, ugyanez az elv érvényes.
13. **Hangfájlok az adatbázisban (D4):** külön tábla, tartalom-lenyomat szerinti kulcs, cserélhető tároló réteg, méretőr; a
    migráció a repó rendje szerint (`migrations/` + Drizzle-séma, a telepítés `db:migrate` lépése futtatja); `db:push` tilos.
14. **Önálló beolvaszthatóság — a forrás vizuális leltára funkciókapcsoló mögött áll**
    (*Spec-pontosítás 2026-11-18 — vak ellenőr: önálló beolvaszthatóság*). A szeletek PR-jai egyenként olvadnak a főágra, és minden
    beolvadás élesre telepít; a köztes állapotok órákig élhetnek. Ezért **minden PR önállóan beolvadva is változatlanul hagyja a
    mai éles gyártást**. Eszköze egyetlen szerveroldali kapcsoló a lánc alján: `STUDIO_SOURCE_VISUALS` (`on` = BE; bármi más és a
    hiány = **KI**, ez az alapérték), egy helyen olvasva (`server/studio/source-visuals-flag.ts`), a motorba függőségként is
    befecskendezhető (`SingleRunDeps.sourceVisuals`).
    - **KI:** az 1. állomás nem kéri és nem dolgozza fel a leltárt (a modell kéretlen `visuals` mezője sem jut a térképbe), a
      `source_files` sorába nem kerül `visuals`, a leltár számlálói nem jelennek meg a telemetriában, a térképen korábban mentett
      leltárt a futás nem használja, a különálló kinyerés tartalmi lenyomata változatlan. Következmény: a lejjebb lévő promptok
      bájtra azonosak a kapcsoló előttivel, az új ábrafajták neve nem jut a modellhez, a fedettségi kapu nem mér.
    - **BE:** az S1–S3 szeletek leírt viselkedése.
    - **Ki kapcsolja be:** a tesztek és a mérőharness (`scripts/measure/single-run-measure.mts`, S10). Az **éles bekapcsolás
      tulajdonosi döntés az első mérés (S10/1) után** — addig az éles környezetben a változó nincs beállítva.
    - **Bizonyíték:** `tests/source-visuals-flag.test.ts` — egy rögzített, modell nélküli mintafutáson a gyártás MINDEN modellnek
      küldött kérésének lenyomata KI állapotban egyezik a főág kódján lefuttatott ugyanazon mintafutáséval (az előállítás módja a
      `tests/helpers/production-prompt-fingerprint.ts` fejlécében). Ez a teszt a lánc minden ágán zöld kell legyen.

## 6. Szeletek

Minden szelet: saját ág `origin/main`-ről, `npm run gate:stage` szakaszonként, `gate:push`, független ellenőr, `gate:pr`, PR.
Ahol egy szelet a 400 soros irányelvet túllépné, alszeletekre bomlik (a / b / c) — mindegyik önálló PR.

### S1 — Forrás-vizuálleltár

- **S1a — séma, állomás, mentés, betöltés:** az 1. állomás kimenete `visuals[]` tömbbel bővül. Tétel: `id`, `kind`
  (`table` | `process` | `decisionTree` | `ruleBox` | `pictureCard` | `colorCode` | `exercise` | `diagram`), `sourceFile`, `page`,
  `role` (pedagógiai szerep, ≤ 200 karakter), `title?`, `conceptIds[]`, `data` (fajtánként strukturált: táblázat fejléce és sorai,
  lépések, a döntési fa ágai, a doboz pontjai, a kártyák felirata és a kép tartalma, a színkód jelentése, a feladat utasítása /
  tételei / megoldása / képei). A `diagram` fajta a hét kért fajtán felüli gyűjtő (tölcsér, páros ábra) — a minta-PDF-ek két
  ábrája másképp nem írható le. Korlát: legfeljebb 60 tétel, összesen ≤ 40 000 karakter.
- **S1b — átadás és fedettség:** a tervező, a szerző, az ábrakészítő és a lektor promptja megkapja a leltárt; a terv fejezetenként
  megnevezi a hozzá tartozó tételeket (`sourceVisualIds`); a lecke blokkja a megjelenített tételre hivatkozik (`sourceVisualId`);
  a fedettségmérő a vizuális tételeket is számolja (`coverage.visuals: { total, shown, missingIds }`) — a hiány **bukás**: a kaput az SK1 adja
  (ugyanabban a körben; `report` módban érkezik, az S3b élesíti — lásd SK1).
- **Visszamérés:** egységtesztek; az S10 első mérése (a leltár tételszáma a két mintán a 02-es jelentés leltárához mérve).
- **Funkciókapcsoló** (*Spec-pontosítás 2026-11-18 — vak ellenőr: önálló beolvaszthatóság*): az S1 teljes viselkedése a
  `STUDIO_SOURCE_VISUALS=on` kapcsoló mögött áll, alapból KI (5. szakasz 14. pont) — KI állapotban az 1. állomás kérése,
  feldolgozása és mentése a kapcsoló előttivel azonos.

### S2 — Új megjelenítők a leckében

- **S2a:** `table` (valódi `<table>`, fejléc-tónus, mobilon saját tárolón belüli vízszintes görgetés rögzített első oszloppal),
  `ruleBox` (szabály / figyelem / tipp), `compareCards` (2–3 egymás melletti kártya, mobilon egymás alatt); a magyarázat
  felsorolásának sortörés-hibája (a „•” sorok egy bekezdésbe folynak — oka UNVERIFIED, a szelet első lépése állapítja meg).
- **S2b:** `decisionTree` (elágazó, legfeljebb 3 szint, szintenként legfeljebb 4 ág; mobilon behúzott, összekötött lista) és
  `pictureCards` (2–8 kártya, kártyánként tisztított SVG-rajz a meglévő illusztráció-tisztítóval, felirat, példa).
- Ebben a szeletben csak séma, megjelenítő, címke-olvasó és teszt készül; a gyártó promptok az S3-ban kapják meg az új fajtákat
  (különben a címke-megalapozási kapu a forráscellákat eldobná).
- **Visszamérés:** valódi böngészős próba három nézetben (360×640, 390×844, 1280×800): átfedés, levágott szöveg, váratlan
  görgetősáv, viewport-túlcsordulás; képernyőképek a PR-leírásban.

### S3 — Ábrakészítő a forrásra kötve

- **S3a:** az ábrák állomás előbb a fejezethez rendelt forrástételeket jeleníti meg a megfelelő fajtával és `sourceVisualId`-val,
  csak utána talál ki újat; a forráshoz kötött ábra címkéit a program a forrástétel szövegéhez is méri (nem csak a lecke
  szövegéhez); az eldobott ábra oka a job kimenetébe kerül (`telemetry.visuals`); a forráshoz kötött, eldobott ábrákra egyetlen
  célzott javító forduló jár; a példát ismétlő pótló folyamatábra nem kerül be, ha a fejezetnek van forráshoz kötött ábrája.
- **S3b:** a forráshoz kötött táblázat / kártya / doboz szövege nem számít bele a Tananyag lap szókeretébe (külön korlátja van);
  a szerző a táblázatos tartalmat nem írja ki prózában is; a lektor a megjelenített ábrát a leltárhoz méri; a bank megkapja a
  fejezet `exercise` és `table` tételeit adatként (a forrás saját feladataiból is kérdez).
- **Visszamérés:** S10 első mérés — HM hiánytábla és a `telemetry.visuals` (javasolt / megtartott / eldobott okokkal).

### S4 — Olcsó, szkriptes javítások a javítókörök ellen (az S3 után)

- **S4a — a számolási ellenőrző hamis riasztásai:** kitevő (`²`, `³`, `^`), vegyjel- és jelindex, arány / méretarány, vegyes szám,
  tartomány, névelő a kifejezés előtt. A 3.4 táblázat hét bemenetosztálya regressziós teszt; a valódi hibák felismerése megmarad.
- **S4b — négy kis javítás:** (1) `relocateQuote` a forrás-állomáson a hibajelzés előtt; (2) a terv kimeneti alakjában a
  `visual.world` zárt listája + gépi javítás érvénytelen értékre; (3) a szókeret-mondat igazat mond („túllépésnél a program
  rövidítő fordulót kér”); (4) a bankkísérletek és az állomás-javítókörök okai a job kimenetébe (`telemetry.fixReasons`, legfeljebb
  60 tétel, tételenként ≤ 300 karakter).
- **Visszamérés:** egységtesztek (ingyenes); utána a telemetria `fixTurns` értékei (forrás: ma 0,30 / futás; terv: 0,13) és a
  `gates.lengthShortened` aránya (ma 23%) az S10 futásain.

### S10 — Mérés (első mérés az SK3 után, záró mérés a végén) — a D2 kerethez méretezve

- **Keret (D2):** 30 USD, eldobható adatbázison; futásonkénti kemény plafon 7,5 USD az SK3 próbakeret-paraméterével
  (4 × 7,5 = 30) — a plafont a program tartja, nem az ügynök. Túllépés előtt megállás és kérdés a tulajdonosnak. (A kemény plafon
  csak a próbafutásra érvényes; éles gyártásban a költségkeret túllépése jelzés — D7.)
- **Funkciókapcsoló** (*Spec-pontosítás 2026-11-18 — vak ellenőr: önálló beolvaszthatóság*): a mérőharness a forrás vizuális
  leltárát **bekapcsolva** futtatja (`sourceVisuals: true`; a kimenet `flags.sourceVisuals` mezője rögzíti), mert az éles
  alapérték KI (5. szakasz 14. pont). Az **éles bekapcsolásról a tulajdonos dönt az első mérés eredménye alapján** — a mérés
  jelentése ezt a döntést opciókkal és javaslattal külön kéri.
- **Fizetős futások:** a két minta-PDF egy-egy „utána” futása (HM, PT), **fájlból indítva** (a `MEASURE_SAME_MAP` mód a kész
  térképről indul, az 1. állomást nem méri — a fájlból indítás módja UNVERIFIED, a szelet első lépése ellenőrzi) + legfeljebb 2
  tartalék futás (megszakadt futás megismétlésére vagy a záró mérésre, ha a keret engedi).
- **Alapvonal („előtte”) fizetős futás nélkül:** HM — a meglévő éles lecke (38 tételből 6 teljes, 23 részben, 9 nem); PT — nincs
  „előtte” lecke, az alapvonal a forrásleltár 39 tétele, 0 megjelent; változatosság — a meglévő kiadott állomány (3.3).
- **Első mérés:** a két „utána” futás + hiánytábla + a kapuk (SK1, SK3) kimenete. **Záró mérés:** modellhívás nélküli részek
  (kapuk a mentett lecke-JSON-on, a kiosztás szimulációja, a kiadott állomány újramérése csak olvasva) + tartalék futás csak akkor,
  ha a halmozott számolt költség + 7,5 USD ≤ 30 USD.
- **Célértékek (javaslat — a záró mérés mércéje):** HM: teljes ≥ 22 / 38, nem ≤ 6; táblázat 9-ből ≥ 7 táblázatként; a döntési ábra
  elágazással; képes kártya 8-ból ≥ 6 rajzzal; kiemelt doboz 5-ből ≥ 4; a képes feladat megjelenik. PT: teljes ≥ 22 / 39.
  Változatosság (új gyártáson és a kiosztás modellhívás nélküli szimulációján): leggyakoribb fejezetminta < 35%, azonos minta
  valószínűsége < 20%, „Jó próba” nyitás < 10%, `try` a fejezetek ≥ 1/3-ában. Költség: futásonként legfeljebb +10% a 6,64 USD
  átlaghoz képest; a `fixTurns` összege csökken.

### S5 — Változatosság A

- **S5a:** bátorító / visszajelző nyitások kódszótárból (korosztályonként legalább 24 hibás- és 12 helyes-nyitás, kérdésenként a
  magból választva); a promptból kikerül a „Jó próba, de…” mintamondat és a „bátorító első mondat” előírás — a modell csak a
  tartalmi indoklást írja; a régi leckéknél a megjelenítő levágja a modell írta bátorító előtagot (adatírás nélkül).
- **S5b:** a módszerfajták sorrendje a magból keveredik (mind a tíz fajta és a két kapukérdés megmarad; csak új leckékre);
  3–4 nyitásforma a mostani egy helyett, a mese 3–6 mondat; a hős nevét a kód adja egy legalább 40 nevű készletből; a „Peti
  szerint…” példamondat kikerül a promptból.

### S6 — Változatosság B

- **S6a:** fejezetív-készlet (5–6 minta, mind megfelel a kapunak: magyarázattal kezd, példa a kérdés előtt), mag alapú kiosztás:
  szomszédos fejezet nem kapja ugyanazt, egy minta a fejezetek legfeljebb 40%-a; a tervező két, egyetlen ívet megnevező mondata
  helyére a kiosztott ív kerül; a `shared/lesson-arc.ts` kapuja minden mintát átenged (teszt bizonyítja; a kapu csak akkor
  változik, ha egy minta elbukna, és akkor sem lazul a „tanítás a kérdés előtt” és a „lecke összefoglalóval zárul” szabály).
- **S6b:** `try` minimum (a fejezetek legalább harmada; először nem blokkoló jelzés) és fajtarotáció (sorrend → `dragSort`,
  fogalom–jelentés → `match`, nyelvi alak → `fillBlank`); szerzői hang évfolyamsávonként (sávonként 2–3 leírt hang, a magból).
- **S6c:** ábrafajta-terv: a négy leíratlan fajta (`fraction`, `map`, `wordBuilder`, `sentenceParts`) paramétereinek leírása
  böngészős próba után; tantárgyi ajánlótábla; egy fajta a lecke ábráinak legfeljebb 40%-a; a rögzített színlista helyett a sáv
  tokenjei.

### S7 — Nyílt válasz szabályai v2 (kanban #131)

- **Előfeltétel (D6):** a `fix/nyilt-feladat-rovid-valasz` helyi ág sorsa — a szöveg csak akkor igaz, ha a pontozó a `main`-en van.
- **S7a:** az 1. és 3. szabály új szövege (tömör, tartalmilag helyes válasz = 0,5; 1 pont csak `minWords`-től);
  `OPEN_ANSWER_RULES_VERSION` + rögzített lenyomat-őr teszt; a hosszkorlát-teszt dokumentált emelése; minden fogyasztó egyszerre:
  bank skill, módszertani szerződés, válaszkulcs-író (a helyes próbák legalább egy teljes mondat), a bankcsomag kulcsa, telemetria.
- **S7b (D5 döntés: igen):** a döntőbíró determinisztikus plafonja — ha a pontozó a „tömör, de teljes” ágon adott 0,5-öt, a végső pont
  0,5; `ARBITER_VERSION` emelés.

### S8 — Brit TTS (D3: ElevenLabs előre gyártva; D4: adatbázisban, csak a leckék)

- **S8a — azonnali, ingyenes:** rangsorolt `en-GB` hangválasztás (ismert jó brit hangok előre, amerikai hang csak végső esetben);
  a `pitch = 1.1` törlése a HTML-előírásból, előtag-egyezéses hangválasztással; a szerveres tartalék ne vágja a régiót `en`-re, ha
  a szolgáltatás a brit kódot elfogadja (mérés a szelet elején; ha nem fogadja el, brit lecke esetén a nem brit tartalék csak
  akkor szól, ha a böngészőben egyáltalán nincs angol hang). Ez a javított böngészőhang az előre gyártott fájlok tartaléka.
- **S8b — tárolás és lejátszás:** új tábla `lesson_tts_audio` (migráció + Drizzle-séma, a kisfilmhangok `lesson_clip_media`
  mintájára: tartalom-lenyomat szerinti 32 jegyű kulcs, `bytea`, a sor soha nem módosul); kulcs: `sha256(hangverzió + nyelv +
  normalizált szöveg)` első 32 jegye — a lecke JSON-ja nem változik, a kliens a szövegből számolja; azonos eredetű végpont
  `GET /api/tts/lesson-audio/:id` tartós (`public, max-age=31536000, immutable`) fejléccel és tartománykéréssel, a 404 nem
  gyorsítótárazható; **cserélhető tároló réteg** (`TtsAudioStore` felület, adatbázisos megvalósítással) — későbbi átköltöztetésnél
  csak a megvalósítás cserélődik, a lecke és a kliens nem; **méretőr**: összméret-plafon (alapérték 40 MB a ~25 MB-os becsléshez),
  fájlonként 300 kB — túllépésnél az írás megtagadva, a gyártás megáll és jelez. Hiba / 404 esetén a kliens a böngészőhangra esik.
  **Spec-pontosítás 2026-11-18 (orkesztrátori döntés a független review alapján; a tulajdonosnak jelezve, megerősítésre vár):** a méretőr KÉT kemény, írást megtagadó plafon együtt — hangverziónként 40 MB és a teljes
  táblára abszolút 80 MB (2 × 40 MB: egy hangcsere átmeneti kettős készlete fér bele, több nem). Írni csak a kódban rögzített aktuális
  hangverzióra (`TTS_VOICE_VERSION`) lehet; a régi verziók sorainak takarítása kifejezett, őrzött művelet a tároló felületén.
  **Spec-pontosítás 2026-11-18 (független review J1–J2):** elérhetőségi jegyzék — `GET /api/tts/lesson-audio/available?keys=…` (csak olvas; csak a 32 hexa jegyes
  kulcsformátum, legfeljebb 200 kulcs; a válasz a meglévő kulcsok részhalmaza, 60 mp-ig gyorsítótárazható). A lecke a betöltésekor EGY
  kéréssel lekéri, így a kliens nem kattintásonkénti 404-ből tudja meg a hiányt: elérhető kulcsra az előre gyártott hang szól, különben
  azonnal, a kattintás gesztusában a rangsorolt böngészőhang. A hangtár (hangfájl + jegyzék) saját, osztályra méretezett sebességkorlátot kap.
- **S8c — hanggyártás ellenőrzéssel:** közös gyártómodul (egyedi szövegek kigyűjtése, ElevenLabs-hívás a szerver kulcsával, gépi
  hangkapu: hossz, csend, levágás, érvényes MP3; legfeljebb 2 újragenerálás; a kész kulcs kihagyva). Két hívó: (1) helyi szkript
  eldobható adatbázisra, alapértelmezetten száraz módban (darab-, karakter- és költségbecslés fizetős hívás nélkül); (2) **élesben
  admin-végpontról indított, a szerveren futó háttérfeladat — a tulajdonos indítja**, karakter- és méretplafonnal, állapot-
  lekérdezéssel. Ügynök éles adatbázist nem ír, és az éles tömeges gyártást nem indítja el.
- **Migráció:** a repó rendje szerint `migrations/00NN_*.sql` + a Drizzle-séma (`shared/schema.ts`); élesben a telepítés
  `npm run db:migrate` lépése futtatja (`render.yaml:7`, `server/migrate.ts`). A `db:push` tilos.
- Kör: csak a leckék (37 angol lecke, 2 299 fájl, ~43 ezer karakter); a játék-szóbank nem.
- **S8d — hang-előtöltés a lecke megnyitásakor (tulajdonosi kérés 2026-11-18):** „Én azt gondolom, hogy a hat meg három másodperces
  laggolás is eléggé gáz, úgyhogy automatikusan szerintem amikor megnyitja az adott tananyagot, pufferelje a hangokat a diáknak a
  tananyagban.” Cél: a gyerek koppintására a hang AZONNAL szóljon; a várakozás a lecke megnyitásakor, a háttérben történjen.
  - **Előtöltés:** az elérhetőségi jegyzék alapján a lecke előre gyártott hangjai a megnyitáskor, üresjáratban, legfeljebb 3
    párhuzamos letöltéssel lejátszásra kész állapotba kerülnek, a szószedet sorrendjében (az első szakasz előre). Koppintáskor a
    pufferelt hang szól, hálózati kör nélkül. **Technika (mérés alapján):** előre létrehozott, `preload="auto"` hangelemek — fejetlen
    Chrome-ban, 800 ms-mal késleltetett szerverrel mérve a koppintástól a `playing` eseményig: hideg hangelem 884 ms, csak a HTTP-
    gyorsítótár előmelegítve 61 ms, előtöltött hangelem 13 ms, Web Audio (dekódolt puffer) 14 ms. Az előtöltött hangelem a Web
    Audióval azonosan azonnali, de megtartja a hangmagasságot a csúszka sebességénél (a Web Audio lejátszási sebessége a hangmagasságot
    is eltolja — éppen a torzítás volt az eredeti panasz), tömörített bájtokat tart a memóriában dekódolt minták helyett, és a lecke
    CSP-jéhez (`default-src 'self'`, `blob:` / `data:` nélkül) nem kell hozzányúlni.
  - **A tartalék-út se várasson — a motorról csak VALÓDI koppintásból tanulunk** (spec-módosítás 2026-11-19, vak review B1–B3;
    orkesztrátori döntés): kéretlen, nulla hangerejű próba-kimondás NINCS — semmi nem mond ki, nem áll a beszédsorba és nem szakít
    meg kimondást a gyerek kifejezett koppintása nélkül (a lecke „Felolvasás” gombját és a kisfilm narrációját a lejátszó nem
    zavarhatja). Pozitív bizonyíték: ha egy koppintásra a böngészőhang `start` eseménye megjön, az a hang a munkamenetre igazolt, a
    következő koppintásokra közvetlenül az szól. Amíg nincs igazolás, az első koppintásnál az időkorlátos lánc fut — néma motornál ez
    3 mp (helyi első hang) vagy 6 mp (hálózati első hang) csend a tartalék előtt; tartósan néma motornál az ítélet lejárta után (minden
    3. koppintásnál) a lánc újra próbálkozik, tehát ez a várakozás ismétlődik. A háttérbe került lap alatti lejárat nem ítélet. A negatív ítélet soha nem
    végleges: a hibát adó / el nem induló hang és a néma motor csak a következő 2 koppintásra marad ki, utána a lánc újra megpróbálja
    a rangsor legjobbját; az ítélet a lecke nyelve szerint él. Nem a hang hibája: a megszakítás (`interrupted` / `canceled` —
    ugyanaz a hang kap egy újrapróbát, utána a tartalék jön), a hiányzó felhasználói aktiváció (`not-allowed`), és amit a lejátszó
    maga állított le. Az indulási őrök (3 / 6 mp összesített csendkeret, 1,5 mp az előre gyártott hangra, 8 mp a szerveres tartalékra)
    megmaradnak.
  - **Koppintás az előtöltés közben / a plafon fölötti szóra:** a még nem pufferelt szóra azonnal, a kattintás gesztusában a
    böngészőhang szól, a szó letöltése előre ugrik (a következő koppintásra már a pufferelt hang szól); ha böngészőhang nincs
    (néma motor), a hang kérésre töltődik. Egy koppintásra egy hang szól — a később megérkező letöltés nem szólal meg.
  - **Korlátok és őrök:** előtöltési összméret-plafon leckénként 3,5 MB (a jegyzék a fájlméreteket is adja), legfeljebb 60 hangelem;
    adatkímélő módban és 2g / slow-2g kapcsolaton csak az első szakasz (12 szöveg); a lecke elhagyásakor a letöltések megszakadnak és
    a hangelemek felszabadulnak; a hiba (429, hálókiesés) visszatartásos újrapróbát kap (legfeljebb 2), és a szót nem zárja ki a
    munkamenet végéig (60 mp után újra próbálható); a „nincs” jegyzék a lap újra láthatóvá válásakor (legfeljebb percenként) frissül;
    az utoljára ismert jegyzék helyben megmarad, így ismételt megnyitáskor hálózat nélkül is a tartós gyorsítótárból szól a hang;
    hiba esetén csendes visszaesés a láncra. A hangtár sebességkorlátja az előtöltéshez igazodik (egy osztály egyszerre nyit:
    a keret az előtöltés plafonjából, közös állandóból számol — 30 × 60 hang × 2 kérés a tartománykérések miatt + 30 jegyzék = 3 630,
    20% tartalékkal 4 500 kérés / 15 perc / IP; a hangtár 429-es, 500-as és ismeretlen alútra adott válasza kifejezetten `no-store`).
  - **Mérhető elfogadás (böngészőteszt, a hang tényleges indulási eseményéből):** koppintástól a hangig előtöltött hangnál ≤ 300 ms
    (cél ≤ 150 ms), böngészőhangnál ≤ 1 s, késleltetett hangtár-válasz mellett is; kikapcsolt előtöltéssel a teszt bukik. Kockázat: a
    fejetlen böngésző időmérése nem azonos a valós eszközével (iOS Safari a `preload`-ot gesztus nélkül figyelmen kívül hagyhatja —
    ott az első koppintás oldja fel a letöltést); valódi iPad- és Android-próba az éles hanggyártás előtt kell.

### S9 — Dokumentáció és tudás

- `docs/lesson-improvement.md` a tényleges egyfutásos folyamatra; a `websuli-gyartas-analitika` skill forrása az `.agents/skills/`
  alá (bájtazonos tükörrel), a „92” és a Render-napló elérésének javításával; `docs/agent-csapdak.md` új bejegyzései a munka
  tanulságaival (a következő szabad C-számtól; a legutóbbi ma C-72).

### SK — Determinisztikus gyártási kapuk (tulajdonosi elv, 5. szakasz 12. pont)

A kapuk tiszta, tesztelt programkód (nem modell): a gyártás csővezetékébe kötött ellenőrző pontok és parancssorból futtatható
szkriptek. Helyük: `server/studio/gates/` és `scripts/gates/`, `scripts/measure/` a `source/` alatt (a repó `scripts/qa/` kapuihoz
ez a munka nem nyúl). Minden kapu kimenete gépi: `{ gate, ok, problems[], metrics }`, a futás telemetriájába mentve.

- **SK1 — forrás-fedettségi kapu (az S1b-vel együtt):** a strukturált forrásleírás tételeire. Ami a forrásban megvan és a leckében
  nincs, az **bukás**, nem 100%.
  - *Megjelent* egy tétel, ha van rá hivatkozó blokk (`sourceVisualId`), a blokk fajtája a tétel fajtájához illik (táblázat →
    `table` vagy `compareCards`; folyamat → `process`; döntési fa → `decisionTree`; szabálydoboz → `ruleBox`; képes kártya →
    `pictureCards`), ÉS a tartalma hű: a forrás celláinak / lépéseinek / pontjainak / kártyáinak legalább 80%-a megjelenik, a
    döntési fa leveleinek száma nem kevesebb a forrásénál.
  - *Spec-pontosítás 2026-11-18 (független review F1–F3, F5–F6) — a hűség SZERKEZET szerint mér*, a megjelenítők megosztott
    paraméter-szerződéséből (`shared/source-visual-render.ts`), nem a blokk bármely szövegén: a táblázat cellái a megjelenítő
    celláiban (oszlop szerint igazítva), a folyamat lépései a lépésekben és SORRENDBEN, a döntési fa csomópontjai és ágfeliratai
    útvonal szerint, a szabálydoboz címe a címben és pontjai a pontokban, a képes kártya feliratával ÉS képével, a képes feladat a
    képeivel együtt; rész nélküli ábránál az üres blokk nem megjelenés. A felirat, a rejtett paraméter vagy a folyó szöveg nem pótol.
    Egész cella / egész lépés egyezik (szabad szövegű megjelenítőnél 3+ karakteres szöveg szóhatáron). Az összevetés normalizált
    (idézőjel, gondolatjel, hárompont, mondatvégi írásjel, szóköz, kis- / nagybetű, NFC); az ékezet nem hajtogatható. Több hivatkozó
    blokk tartalma összeadódik, egy forrásrész egyszer számít. A leltárban csonkolt (túl hosszú) cella a megjelenített cella
    elejével egyezik.
  - *Küszöb (kezdőérték, tesztekkel behangolva):* táblázat, folyamat, döntési fa, szabálydoboz: a nem kihagyott tételek **100%-a**;
    képes kártya, feladat, egyéb ábra: **legalább 80%-a**. A színkód nem önálló tétel (a tónusokban él tovább).
  - *Megengedett, indokolt kihagyás:* csak a tervező kifejezett jelölésével (`skippedVisuals: [{ id, reason }]`), zárt oklistából:
    `admin_meta` (iskolai adminisztráció, forrásjegyzék), `answer_key` (megoldókulcs), `duplicate` (a megnevezett, megjelenő tétel
    ismétlése), `decorative` (csak díszítő kép, fogalom-hivatkozás nélkül). A szabályt a program ellenőrzi: tanított fogalomra
    hivatkozó tétel csak `duplicate` okkal hagyható ki; a kihagyások a tételek legfeljebb 30%-a; érvénytelen kihagyás = hiány.
  - *Spec-pontosítás 2026-11-18 (független review F4):* a kihagyási keret `max(1, ⌊30%⌋)` — kis leltárnál (3 vagy kevesebb tétel)
    is legalább egy kihagyás megengedett. Az ok FAJTÁNKÉNT megengedett, zárt megfeleltetéssel: táblázat / folyamat / döntési fa /
    szabálydoboz nem lehet `decorative`; `answer_key` csak feladatnál; `admin_meta` és `duplicate` bármelyiknél, de a `duplicate`
    csak akkor érvényes, ha megnevezi a másik tételt, és az megjelent. Érvénytelen ok = hiány.
  - *A bukás következménye determinisztikus:* **egyetlen** célzott pótló forduló a hiányzó tételekre; ha a kapu utána is bukik, a
    futás megáll, a lecke nem jelenik meg, a hiányzó azonosítók a job kimenetébe és a tulajdonosnak szóló jelzésbe kerülnek.
    Újabb kör nincs.
  - *Élesítés:* a kapu három üzemmódú állandó (`off` / `report` / `enforce`). Az SK1 `report` módban érkezik (mér és ment, de nem
    állít meg), mert a megjelenítők (S2) és az ábrakészítő bekötése (S3) nélkül minden forrásábrás gyártás megállna; az S3b utolsó
    lépése kapcsolja `enforce`-ra, teszttel. Leltár nélküli forrásnál a kapu átmegy (0 / 0).
- **SK3 — körszám-plafon, költségjelzés, próbakeret (az S4 után; tulajdonosi döntés: D7, 2026-11-18):** egy helyen lévő táblázat
  (`shared/run-budget.ts`).
  - *Körszám:* a meglévő plafonok maradnak, ahogy vannak (a mai állandók: 3 javító forduló állomásonként, 2 + 1 lektorkör, 3 + 1
    bankkísérlet). A szelet csak egy helyre gyűjti őket; az értékük és a megállás mai módja nem változik. Új, futásonkénti
    összesített javítókör-plafon és futásidő-plafon NEM készül.
  - *Éles gyártás — „Csak jelezzen”:* a token- / költségkeret túllépésekor a futás megy tovább, a program NEM állít meg. A
    túllépésről e-mail megy a tulajdonosnak: futásonként egyszer, amikor a futás számolt költsége átlépi a futásonkénti küszöböt,
    és naponta egyszer (Europe/Budapest naptári nap), amikor az aznapi futások összege átlépi a napi küszöböt. A levél a meglévő,
    szerveroldali adminlevél-úton megy (az `ADMIN_EMAILS` címzettjeinek, a `sendResultEmail` mögötti út mintájára —
    `resolveAdminRecipients`, `server/lib/material-result.ts`); `mailto:` tilos. A levélküldés hibája a gyártást nem akasztja meg
    (naplózva; a jelzés a futás telemetriájában is megmarad).
  - *Küszöbök:* futásonkénti és napi küszöb, a meglévő futások telemetriájából hangolva (csak olvasó szkript; mért átlag
    6,64 USD, mért legnagyobb 11,34 USD). Kezdőérték futásonként 9 USD; a napi küszöb kezdőértékét az alapvonal-mérés adja.
  - *A riasztó őr* a `server/studio/single-run/telemetry.ts` rögzítésére épül: a `TelemetryRecorder` token-számaiból számolt
    költség; a döntés tiszta függvény, modell nélkül.
  - *Vészleállító / egységes gyártás-stop kapcsoló:* „Nem kell” — nem épül.
  - *Próbakeret (D2):* a 30 USD-os keret (a mérőharness főkönyve; futásonként 7,5 USD) kemény plafon marad: a próbafutás a keret
    elérésekor a következő modellhívás ELŐTT megáll. Ez kizárólag a mérőharness kifejezett indítási paraméterével kapcsolódik be;
    éles gyártásra nem hat.
- **SK2 — változatosság mérőszáma és küszöbe (az S6-tal):** tiszta mérőfüggvények (`shared/variety-metrics.ts`) + parancssori
  mérő a repóban, a kiadott állományból mért alapvonallal (csak összesített számok: 61,6% / 40,4% / 46,8% / 85,8% / 6 nem használt
  fajta). Leckeszintű kapu: a fejezetek blokksora egyezik a kiosztott mintával; a modell nem írt bátorító nyitást (ha mégis, a
  program levágja — modellkör nélkül). Leckeszintű jelzés: `try`-arány, egy ábrafajta aránya. Állományszintű küszöb (a mérő
  kilépési kódja): új gyártásokon a leggyakoribb fejezetminta < 35%, azonos-minta valószínűség < 20%, leggyakoribb
  visszajelzés-kezdet < 10%.
- **SK4 — kiadás előtti kapu (az S8 után):** közzététel előtt, modell nélkül: (1) a lecke sémája; (2) tiltott minták a gyereknek
  szóló szövegben (nyers `**` jelölés, helykitöltő, hivatkozás a forrásfájlra, üres táblacella, nyers URL); (3) a pontozási
  szabály lenyomat-őre (a futás `rulesVersion`-ja és lenyomata egyezik a kódéval); (4) `en-GB` leckénél a szószedet minden
  szavához és példamondatához van hangfájl — kapcsolóval: amíg a tulajdonos az új leckék automatikus, szerveren futó hanggyártását
  nem engedélyezi, a hiány jelzés, utána bukás. Bukásnál nincs közzététel, a hibák a job kimenetében.
- **SK5 — mutációs ellenpróbák és alapvonal (az SK4 után):** minden kapuhoz táblás teszt: egy átmenő minta + szándékosan
  elrontott változatok, amelyeket a kapunak a várt okkal meg kell fognia; őr-teszt, amely elbukik, ha egy bejegyzett kapunak
  háromnál kevesebb mutációja van; alapvonal-mérő szkript, amely a kapukat a kiadott állományon és a meglévő gyártási kimeneteken
  futtatja (csak olvasva) — hány lecke menne át ma, kapunként. A mutációs teszteket minden SK-alszelet a saját kapujához hozza;
  az SK5 az őr-tesztet és az alapvonal-jelentést adja.

**Szkript-ellenőr szeletenként** (a modell kimenetét séma, szabály és mérőszám ítéli meg; másik modell csak ott, ahol szkript nem
tud dönteni — a tartalmi forráshűség megítélése marad a lektornál):

| Szelet | Mit dönt el szkript |
|---|---|
| S1a | a leltár sémája, létező fájl / oldal / fogalom, korlátok, szóegyezés az oldal szövegével (`sanitizeSourceVisuals`) |
| S1b + SK1 | fejezethez rendelés érvényessége, a kihagyás szabálya, a fedettségi kapu |
| S2a / S2b | paraméter-séma, sorhossz, mélység, SVG-tisztító; böngészős mérő (átfedés, levágás, görgetés) |
| S3a / S3b | címke-megalapozás a forrástételhez, az eldobás oka, szókeret-számítás, a bankkulcs változatlansága |
| S4a / S4b | számolási állítások (hamis riasztás nélkül), idézet-áthelyezés, zárt világ-lista, okok mentése |
| SK3 | a meglévő körszám-plafon változatlansága, a költségküszöb-jelzés (futásonkénti és napi), a próbakeret kemény plafonja |
| S5a / S5b | a nyitás a szótárból jön, a régi előtag levágása, módszerfajták teljessége, verzióállandó |
| S6a–c + SK2 | a kiosztott minta betartása, ívkapu, `try`- és fajtaarány, a szimuláció küszöbe |
| S7a / S7b | lenyomat-őr, hosszkorlát, a döntőbíró plafonja (kódból, nem promptból) |
| S8a–c + SK4 | hangrangsor (tiszta függvény), hangkapu, méretőr, a hangfájlok megléte, kiadás előtti kapu |
| S8d | az előtöltés rendje és plafonjai, a munkamenet-szintű hangmotor-állapot, a lejátszó bekötése (ál-órával), a koppintás → hang idő (böngészőben mérve) |
| S9 | skill forrás ↔ tükör bájtazonosság (`skills-sync-check`) |
| S10 | hiánytábla gépi része, a futáskeret főkönyve |

## 7. Edge case-ek

- **Kép nélküli forrás** (TXT, DOCX, MHT) vagy térképről indított gyártás régi térképpel: `visuals` üres / hiányzik → a gyártás a
  mai úton fut, a vizuális fedettség „0 / 0” (nem 0%).
- **Képes PDF kinyert szöveg nélkül:** a tételek `verified: "visual-only"`; kiesés nincs.
- **A modell kitalált tételt ad** (nem létező oldal, üres táblázat): a tétel kimarad, számláló nő. **Nem létező fogalom-azonosító:**
  a tétel MEGMARAD (a forrás vizuális tartalmát egy rossz hivatkozás miatt nem dobjuk el), a rossz hivatkozás törlődik, külön
  számláló nő (`visualsConceptRefsRemoved`) és naplósor készül. *Spec-pontosítás 2026-11-18 (független review J2).* Az oldalszám
  felső határa csak a fájl tényleges (a program által kinyert szövegből ismert) oldalszáma lehet (review J1).
- **Túl nagy táblázat** (12 hónap, 30 szavas szólista): a leltár megtartja (≤ 40 sor), a megjelenítő legfeljebb 14 sort mutat
  táblánként; a szerző több táblára bonthatja. 6-nál több oszlop: a leltár megtartja, megjelenítéskor bontás.
- **Színkód három vagy több színnel:** legfeljebb három tónus (`a` / `b` / `c`); több szín esetén a többlet semleges, a lektor jelzi.
- **Döntési fa, amely valójában lineáris:** `process` fajtaként jelenik meg; három szintnél mélyebb fa: a leltár megtartja, a
  megjelenítő két ábrára bontva kapja (a szerző dolga), különben a séma elutasítja és az ok a kimenetbe kerül.
- **Képes feladat** (a kép tartalma a megoldás kulcsa): a leltár `pictures[]` mezője leírja, mit mutat a kép; a megjelenítés
  `pictureCards` + kérdés; ha a rajz nem készül el, a feladat szöveges leírással jelenik meg, nem üres vonalakkal.
- **Régi kliens / gyorsítótárazott csomag új ábrafajtával:** a blokk kimarad (3.1) — a lecke nem törik el.
- **Folytatott futás** (szerver-újraindulás gyártás közben) verzióemelés után: a mentett bankcsomag kulcsa a régi verziót hordozza,
  a régi csomag érvényes marad, az új csomag az új szabállyal készül (a kulcsba az S7a a szabályverziót is felveszi).
- **Magból kiosztott forma kevés fejezetnél** (1–2 fejezet): a „szomszéd ne egyezzen” és a 40%-os korlát nem teljesíthető —
  ilyenkor a kiosztás az első két mintát adja, hiba nélkül.
- **Bátorító előtag levágása régi leckén:** csak a rögzített nyitáslistára illik; ha a levágás után a szöveg üres vagy 12
  karakternél rövidebb lenne, az eredeti szöveg marad.
- **TTS:** nincs `en-GB` hang → rangsor szerinti más angol hang → (ha engedett) szerveres tartalék; üres hanglista első hívásnál
  (Android) → a `lang` beállítás dönt, a `voiceschanged` után újraválasztás; hangfájl 404 / lassú hálózat / iOS automatikus
  lejátszás tiltása → böngészőhang; a csúszka (0,5–1,2×) fájlnál `playbackRate`; csak kattintásra szól (a gesztus-szabály marad).
- **Időzóna:** a mérések dátumhatára Europe/Budapest; a tárolt időbélyegek zónája UNVERIFIED — a mérőszkript UTC-ben számol és ezt kiírja.
- **Adatvédelem:** a hanggyártóhoz csak a tananyag szövege megy; a mérőszkript kimenete (leckecímek, szövegminták) nem kerül a
  repóba; a `telemetry.fixReasons` a lecke tartalmából idéz, tanulói adatot nem.
- **Kapuk:** leltár nélküli forrás → a fedettségi kapu átmegy (0 / 0); a pótló forduló után is hiányzó tétel → megállás, nem
  harmadik kör; a kapunál megállt job folytatása modellhívás nélkül áll meg újra, ha a kapu a mentett leckén ismét bukik; a
  PRÓBAKERET (csak a mérőharness próbafutása — D7) a modellhívás ELŐTT állít meg (félbehagyott hívás nincs), az állapot
  folytatható — éles gyártásban költség miatt nincs megállás; kapu `report` módban soha nem állít meg, csak mér, és a kapu hibája
  (kivétel) sem állítja meg a gyártást.
- **Hangtár:** a plafon elérésekor az írás megtagadva, a gyártás megáll; azonos kulcs ismételt írása nem hiba (`exists`); hangverzió
  cseréje új kulcsokat ad, a régi sorok maradnak (törlésük külön, tulajdonosi döntés).
  **Spec-pontosítás 2026-11-18 (orkesztrátori döntés a független review alapján; a tulajdonosnak jelezve, megerősítésre vár):** hangcsere idejére a tár az abszolút 80 MB-os plafonig nőhet (verziónként 40 MB); a régi
  verziók takarítása megtagadva, ha a megtartandó verzió nem az aktuális, vagy még egyetlen sora sincs.

## 8. Kockázatok, költség- és időhatás, visszavonás

| Kockázat | Kezelés |
|---|---|
| A leltár kimeneti többlete drágítja és lassítja az 1. állomást | korlát (60 tétel, 40 000 karakter); mérés az S10-ben; a többlet a telemetriában az állomás sorában látszik |
| A modell hiányos vagy pontatlan leltárt ad (nem determinisztikus) | oldalszám + szóegyezés-igazolás; a lektor a leltárhoz mér; az S10 a 02-es leltárhoz hasonlít |
| Az új ábrafajták elrontják a mobil nézetet | kötelező böngészős próba három nézetben az S2-ben; a régi kliens kihagyja az ismeretlen fajtát |
| A változatosság rontja a tanulási ívet | minden minta átmegy a meglévő ívkapun (teszt); a pontozás és a fedettség érintetlen; a `try` minimum először csak jelzés |
| Promptváltozás rontja a bank minőségét | verzióemelés; mérés ugyanarról a térképről előtte–utána; a régi verzió visszaállítható egy commit visszavonásával |
| A hosszkorlát-teszt emelése precedenst teremt | dokumentált spec-változás (5. szakasz 9. pont), új lenyomat-őr mellett |
| A TTS-modell nem determinisztikus, egyszavas kimenetre nincs garancia | gépi hangkapu, újragenerálás, makacs szónál a tartalék hang; a böngészőhang mindig megmarad |
| Párhuzamos munkamenet ugyanahhoz a fájlhoz nyúl (`client/src/lib/tts.ts`, közös modulok) | a szelet elején `git fetch` + a nyitott PR-ok fájllistája; ütközésnél a lépés kimarad és jegy készül |
| A naplómegőrzés ~14 nap — a javítókörök okai elvesznek | az S4b a job kimenetébe menti |
| Az adatbázis mérete nő a hangfájlokkal (ma 350 MB; a leckék hangja ~25 MB; a csomag kerete UNVERIFIED) | méretőr (40 MB plafon, programból), cserélhető tároló réteg az átköltöztetéshez, a méret a gyártás összesítőjében |
| Egy kapu hamis riasztása megállítja a gyártást | `report` → `enforce` lépcső; mutációs tesztek és a kiadott állományon mért alapvonal (SK5) az élesítés előtt; a megállás oka a job kimenetében |
| A forrás-fedettségi kapu az S2 / S3 előtt minden ábrás gyártást megállítana | az SK1 `report` módban érkezik, az S3b utolsó lépése élesíti |

**Költség- és időhatás (BECSLÉS, a 3.4 mért állomásköltségeihez képest):**

- **S1 vizuálleltár:** új hívás nincs. Az 1. állomás kimenete ma átlag 18 ezer token (0,49 USD, 127 mp). A leltár várhatóan
  4–8 ezer kimeneti token (a HM-minta ~25 vizuális tétele alapján) → **+0,08–0,16 USD** (20 USD / 1 M kimeneti token) és
  **+30–60 mp** az 1. állomáson. A leltár a négy lejjebb lévő promptba (terv, tananyag, ábrák, lektor 1–3 kör) bemenetként is
  bekerül: legfeljebb 8 ezer token × 4–6 hívás × 4 USD / 1 M ≈ **+0,13–0,19 USD**. Együtt **+0,2–0,35 USD futásonként (3–5%)**.
- **S3:** a forráshoz kötött ábrák miatt az ábrák állomás kimenete nő (ma 9 ezer token, 0,33 USD): becslés +5–10 ezer token →
  +0,1–0,2 USD; a célzott javító forduló (ha kell) ≈ +0,3 USD az érintett futásokon. A szókeret-mentesség miatt a rövidítő kör
  (0,37 USD, 99 mp a futások 23%-ában) ritkul.
- **S4 megtakarítás:** forrás-javítókör ≈ 0,12 USD + 1–2 perc futásonként; számolási hamis riasztások a bank-javítókörök 15–20%-a;
  terv-javítókör ≈ 0,01 USD. Együtt **≈ −0,25–0,3 USD és −1–3 perc futásonként**.
- **Nettó:** futásonként nagyjából +0,1–0,3 USD (+2–5%) mellett lényegesen teljesebb vizuális tartalom; a tényleges számot az S10 méri.
- **S10 próbagyártás:** D2 — 30 USD keret: 2 „utána” futás + legfeljebb 2 tartalék, futásonként 7,5 USD plafonnal.
- **SK1 pótló forduló:** ha kell, futásonként egy (≈ 0,3 USD, BECSLÉS); **SK3:** éles futásnál költség miatt nincs megállás
  (D7) — a küszöb (kezdőérték 9 USD futásonként) átlépéséről e-mail megy, a mért legrosszabb futás (11,34 USD) is végigfut; a
  próbafutás kemény plafonja 7,5 USD.
- **S8:** leckék: ≈ 3,44 USD egyszeri ElevenLabs-költség (háromszoros ráhagyással ≈ 10 USD), új angol leckénként ≈ 0,09 USD;
  adatbázis: +~25 MB. Ez a D2 próbakeretén KÍVÜLI, tulajdonos által indított gyártás.
- **Fejlesztési idő:** 25 alszelet-PR (a D6 szerinti ág PR-ja nélkül); PR-onként egy ~1 órás kötelező E2E-kör a CI-ban (a push-fegyelem szerint szeletenként egy push).

**Visszavonás:** minden szelet önálló PR → `git revert` a merge commitra. Az S1 adata (`visuals` a jsonb-ben) ártalmatlan, ha a
kód visszaáll (az olvasó figyelmen kívül hagyja). Az S5–S7 verzióállandói visszaállíthatók; a már legyártott leckék érvényesek
maradnak. Az S8 hangfájljai tartalomcímzettek, a kliens hiba esetén a böngészőhangra esik vissza; az S8b migrációja csak új táblát ad
(visszavonás: a kód visszaállítása után a tábla eldobható, más táblát nem érint). A kapuk üzemmódja (`off` / `report` / `enforce`)
egysoros változtatással visszavehető.

## 9. Döntési pontok — tulajdonosi döntések (2026-11-18)

**D1 — A forrás ábráinak megjelenítése**
- **A (javasolt): újrarajzolás a lecke saját komponenseivel** (táblázat, kártya, döntési fa, tisztított SVG). Indok: megfelel az
  arculati elvnek, nincs szerzői jogi és tárolási kérdés (a forrás gyakran tankönyvi oldal), reszponzív és felolvasható, a régi
  kliens biztonságosan kihagyja; a rajz minőségét a kapu, a lektor és a mérés ellenőrzi.
- B: kivágott kép a PDF-ből. Hű a forráshoz, de bájt-tárolás kell, szerzői jogi kockázat, mobilon olvashatatlan táblázat, nem
  felolvasható, a színei ütik az arculatot.
- C: hibrid (alapból újrarajzolás, kivágott kép csak ott, ahol a rajz nem sikerült).
- **Döntés: A** — újrarajzolás a lecke saját új elemeivel; kivágott kép nem. A `diagram` gyűjtőfajta és az öt megjelenítő rendben.

**D2 — A fizetős próbagyártás kerete** (mért átlag 6,64 USD / futás; a HM-futás számolt ára ≈ 4,3 USD)
- A (javasolt volt): 4 futás ≈ 27 USD, 40 USD felső kerettel.
- B: 8 futás ≈ 53 USD, 80 USD kerettel.
- C: 2 futás ≈ 13 USD, 20 USD kerettel.
- **Döntés: 30 USD** fizetős próbakeret, eldobható adatbázison (kb. 4 futás); túllépés előtt megállás és kérdés. A két minta-PDF
  egy-egy „utána” futása + legfeljebb 2 tartalék; a HM „előtte” alapvonala a meglévő éles futás, a PT alapvonala a forrásleltár
  (39 tétel, 0 megjelent); a változatosság „előtte” mérése a meglévő kiadott állomány.

**D3 — TTS-szolgáltató**
- **A (javasolt): a meglévő ElevenLabs-előfizetés, előre gyártva, gépi hangkapuval.**
- B: Azure Neural brit hang (determinisztikus, olcsóbb, kevésbé élethű, új fiók kell).
- C: csak a böngészőhang javítása.
- **Döntés: A** — ElevenLabs a meglévő előfizetéssel, előre gyártott hangfájlok; tartalék a javított böngészőhang. (A csomag
  szintje és a kiválasztott hang felhasználási joga a gyártás előtt megerősítendő — UNVERIFIED.)

**D4 — A hangfájlok tárhelye és köre**
- A (javasolt volt): objektumtár azonos eredetű átírással; kör: a leckék szószedete.
- B: ugyanez a teljes körre a játék-szóbankkal.
- C: a fájlok a repóban.
- **Döntés: adatbázis** (a tulajdonos kifejezett kérése) — külön táblában, tartalom-lenyomat szerinti kulccsal, a kisfilmhangok
  mintájára; azonos eredetű végpont tartós (`immutable`) gyorsítótár-fejléccel; méretőr (összméret-plafon, túllépésnél megállás és
  jelzés); cserélhető tároló réteg, hogy később a lecke módosítása nélkül átköltöztethető legyen. Kör: csak a leckék (37 angol
  lecke, 2 299 fájl), a játék-szóbank nem. Migráció + Drizzle-séma; `db:push` tilos; ügynök éles adatbázist nem ír — az éles
  tömeges hanggyártás admin-végpontról indított, szerveren futó feladat, tulajdonosi indítással. Megjegyzés (TÉNY + BECSLÉS): az
  adatbázis ma 350 MB, a leckék hangja ~25 MB; az adatbázis-csomag keretének pontos értéke UNVERIFIED — ezért kötelező a méretőr.
  **Spec-pontosítás 2026-11-18 (orkesztrátori döntés a független review alapján; a tulajdonosnak jelezve, megerősítésre vár):** az összméret-plafon két kemény plafonra pontosodott — hangverziónként 40 MB + abszolút
  80 MB a teljes táblára; mindkettő túllépése megtagadja az írást és jelez, a kiszolgálás megy tovább.

**D5 — A döntőbíró fél pontos plafonja**
- **A (javasolt): determinisztikus plafon** — a „tömör, de teljes” ágon adott 0,5-öt a döntőbíró nem emelheti 1-re.
- B: nincs plafon.
- C: plafon csak `needsSentence` feladatnál.
- **Döntés: A** — igen: programból kikényszerített fél pontos plafon a döntőbírónál a tömör, tartalmilag helyes válaszra.

**D6 — A helyi `fix/nyilt-feladat-rovid-valasz` ág sorsa (az S7 előfeltétele)**
- **A (javasolt): az ág a saját tervével, friss `origin/main` beolvasztása után önálló PR-ként megy be az S7 előtt.** Indok: kész,
  saját specje van; az S7 így csak a szöveget és a fogyasztókat érinti, és 400 sor alatt marad.
- B: az ág tartalma az S7-be olvad (egy nagy PR, a méretkorlát felett).
- C: az ág elvetése, a pontozó újraírása az S7-ben.
- **Döntés: egyeztetés alatt** (az orkesztrátor egyeztet a szülő munkamenettel).

**D7 — Költségkeret és gyártás-stop éles gyártásban (tulajdonosi kérdőív, 2026-11-18)**
- Éles gyártásban a token- / költségkeret túllépése: **„Csak jelezzen”** — a futás megy tovább, e-mail megy a túllépésről
  (futásonkénti és napi küszöb, a meglévő telemetriából hangolva; a meglévő adminlevél-úton, `mailto:` nélkül); NEM állít meg.
- Vészleállító / egységes gyártás-stop kapcsoló: **„Nem kell”** — nem épül.
- A meglévő körszám-plafon marad, ahogy van. A 30 USD-os próbakeret (a mérőharness főkönyve) kemény plafon marad.
- Következmény: az SK3 a korábbi „megáll a keretnél” tervről jelző őrre változik (6. szakasz, SK3; E41, E42); a más őrök
  (borító-újrapróba, e-mail-visszapattanás webhook, éles adatbázis-írás hook, éjszakai invariáns-söprés, telepítés utáni füstpróba)
  nem tartoznak ehhez a munkához (2. szakasz).

**Orkesztrátori alapértelmezések:** a vizuális tétel önálló, oldalszámmal igazolt tanítható tartalom (5. szakasz 3. pont); a
változatosság 1–7. javaslata most készül (S5, S6), a 8. (új képgyártás) nem cél.

## 10. Elfogadási kritériumok (EARS)

<!-- acceptance-checklist -->

A tulajdonos 1. kérése — értelmezett forrás, megjelenő ábrák (S1, S2, S3):

- [ ] E1 WHEN a forrás PDF vagy kép THEN the system SHALL az 1. állomáson, új modellhívás nélkül, `visuals[]` leltárt kérni és
  ellenőrizni (fajta, oldalszám, szerep, strukturált adat).
- [ ] E2 WHEN egy vizuális tétel alakja hibás vagy oldala nem létezik THEN the system SHALL a tételt kihagyni, megszámolni, és
  javító fordulót emiatt nem indítani; WHEN a tétel fogalom-hivatkozása nem létezik THEN the system SHALL a tételt megtartani, a
  hivatkozást törölni, megszámolni és naplózni. *Spec-pontosítás 2026-11-18 (független review J2).*
- [ ] E3 WHEN a térkép mentődik THEN the system SHALL a leltárt a `source_files` jsonb-be írni migráció nélkül, és térképről
  indított gyártásnál onnan betölteni.
- [ ] E4 WHEN a terv, a tananyag, az ábrák vagy a lektorálás állomás fut THEN the system SHALL a leltárt a promptban átadni.
- [ ] E5 WHEN a forrásnak van megjelenítendő vizuális tétele, és a lecke nem jeleníti meg THEN the system SHALL a fedettséget
  100% alattinak mutatni a hiányzó tételek azonosítójával, és a hiányt kapuval kezelni (E37–E39).
- [ ] E6 WHEN a lecke `table`, `ruleBox`, `compareCards`, `decisionTree` vagy `pictureCards` ábrát tartalmaz THEN the system SHALL
  azt 360×640, 390×844 és 1280×800 nézetben átfedés, levágott szöveg és oldalszintű vízszintes görgetés nélkül megjeleníteni.
- [ ] E7 WHEN a döntési fa elágazik THEN the system SHALL az ágakat elágazásként megjeleníteni (nem lineáris címkesorként).
- [ ] E8 WHEN régi kliens új ábrafajtájú leckét olvas THEN the system SHALL a blokkot kihagyni, hiba nélkül.
- [ ] E9 WHEN az ábrák állomás fut THEN the system SHALL előbb a fejezethez rendelt forrástételeket megjeleníteni, és csak utána
  új ábrát javasolni.
- [ ] E10 WHEN a program egy ábrát eldob THEN the system SHALL az okot a job kimenetébe menteni.
- [ ] E11 WHEN a forráshoz kötött táblázat a leckében van THEN the system SHALL a szövegét a szókeretbe nem beszámítani, és
  emiatt rövidítő fordulót nem indítani.
- [ ] E12 WHEN a záró mérés lefut THEN the system SHALL a HM-mintán legalább 22 / 38 teljesen megjelent tételt és legalább 7
  táblázatként megjelenő táblázatot mutatni (alapvonal: 6 / 38 és 0).

A tulajdonos 2. kérése — változatosság (S5, S6):

- [ ] E13 WHEN a tanuló hibás vagy helyes választ ad THEN the system SHALL a bátorító / megerősítő nyitást kódszótárból,
  determinisztikusan választani; a gyártó prompt mintamondatot nem tartalmaz.
- [ ] E14 WHEN régi lecke visszajelzése jelenik meg THEN the system SHALL a modell írta bátorító előtagot adatírás nélkül levágni.
- [ ] E15 WHEN új lecke bankterve készül THEN the system SHALL a módszerfajták sorrendjét a magból keverni, mind a tíz fajtát és a
  két kapukérdést megtartva.
- [ ] E16 WHEN új lecke nyitása készül THEN the system SHALL a nyitásformát és a hős nevét a magból kiosztani.
- [ ] E17 WHEN a fejezetívek kiosztása fut THEN the system SHALL szomszédos fejezetnek eltérő mintát adni, egy mintát a fejezetek
  legfeljebb 40%-ára; ugyanarra a magra mindig ugyanazt.
- [ ] E18 The system SHALL minden kiosztható fejezetívre megfelelni a meglévő ívkapunak (tanítás a kérdés előtt; a lecke
  összefoglalóval zárul), a pontozás és a fogalomfedettség változása nélkül.
- [ ] E19 WHEN a kiosztás modellhívás nélküli szimulációja fut a kiadott leckék fejezetszámain THEN the system SHALL 35% alatti
  leggyakoribb mintát és 20% alatti azonos-minta valószínűséget adni.
- [ ] E20 WHEN új lecke készül THEN the system SHALL a `try` arányát mérni és jelezni, ha a fejezetek harmadánál kevesebben van.
- [ ] E21 WHEN az ábrakészítő fajtát választ THEN the system SHALL mind a 16 + 5 fajta paraméter-leírását megkapni, és egy fajta
  a lecke ábráinak legfeljebb 40%-a lehet.

A tulajdonos 3. kérése — folyamat, prompt, ellenőrző mért javítása (S4, S7, S9, S10):

- [ ] E22 WHEN a számolási ellenőrző a 3.4 hét bemenetosztályát kapja THEN the system SHALL hibát nem jelezni; valódi számolási
  hibára továbbra is jelez.
- [ ] E23 WHEN a forrás-állomáson egy idézet nem szó szerinti, de áthelyezhető THEN the system SHALL azt modellhívás nélkül
  áthelyezni.
- [ ] E24 WHEN a terv `visual.world` értéke érvénytelen THEN the system SHALL azt gépileg a javasolt világra javítani.
- [ ] E25 The system SHALL a szókeretről a promptban azt állítani, amit a program tesz.
- [ ] E26 WHEN egy állomás vagy bankcsomag javítókört kap THEN the system SHALL az okot a job kimenetébe menteni.
- [ ] E27 WHEN a tanuló válasza tömör, de minden kötelező feltételt teljesít THEN the system SHALL 0,5 pontot adni; a szabály
  szövege, verziója és lenyomata ezt rögzíti, és minden fogyasztó ugyanazt a mércét kapja.
- [ ] E28 WHEN a D5 döntés a plafon THEN the system SHALL a döntőbíró ítéletét a „tömör, de teljes” ágon 0,5-re korlátozni.
- [ ] E29 The system SHALL a gyártási dokumentumban és az analitika skillben a tényleges egyfutásos folyamatot leírni; a skill
  forrása és tükre bájtazonos.
- [ ] E30 WHEN a mérés lefut THEN the system SHALL előtte–utána hiánytáblát és változatosság-mutatókat adni a repóban lévő
  mérőszkriptekkel, eldobható adatbázison, a jóváhagyott kereten belül.

A tulajdonos 4. kérése — brit felolvasás (S8):

- [ ] E31 WHEN a lecke nyelve `en-GB` THEN the system SHALL a böngésző hangjai közül rangsor szerint a legjobb brit hangot
  választani, amerikai hangot csak brit hang híján.
- [ ] E32 The system SHALL a HTML-leckék előírásában `pitch = 1.1`-et nem kérni.
- [ ] E33 WHEN a szóhoz van előre gyártott hangfájl THEN the system SHALL azt azonos eredetű végpontról (adatbázisból, tartós
  `immutable` gyorsítótár-fejléccel) lejátszani, a csúszka szerinti sebességgel; hiba vagy 404 esetén a böngészőhangra visszaesni.
- [ ] E34 WHEN a hanggyártás fut (helyi szkript vagy a tulajdonos által admin-végpontról indított szerverfeladat) THEN the system
  SHALL minden hangfájlt gépi kapun ellenőrizni, a kész kulcsot kihagyni, alapértelmezetten száraz módban fizetős hívás nélkül
  költségbecslést adni, és ügynök által éles adatbázist nem írni.

Determinisztikus kapuk (SK1–SK5, tulajdonosi elv):

- [ ] E37 WHEN a forrásleírás egy nem kihagyott táblázata, folyamata, döntési fája vagy szabálydoboza nem jelenik meg hűen a
  leckében THEN the system SHALL a forrás-fedettségi kaput buktatni (képes kártya, feladat, egyéb ábra esetén 80% alatt).
- [ ] E38 WHEN a tervező tételt hagy ki THEN the system SHALL azt csak a zárt oklistából vett, programmal ellenőrzött indokkal
  elfogadni; az érvénytelen kihagyás hiánynak számít.
- [ ] E39 WHEN a forrás-fedettségi kapu bukik THEN the system SHALL pontosan egy célzott pótló fordulót indítani, és ismételt
  bukásnál megállni, a leckét nem közzétenni, a hiányzó azonosítókat jelezni.
- [ ] E40 WHEN új lecke készül THEN the system SHALL a változatosság leckeszintű kapuját (kiosztott fejezetminta, modell írta
  bátorító nyitás hiánya) futtatni; a repóban lévő mérő a kiadott állományból mért alapvonalhoz küszöbbel hasonlít.
- [ ] E41 WHEN egy állomás eléri a meglévő javítókör-korlátját THEN the system SHALL a mai módon zárni (változatlan érték és
  viselkedés, az állandók egy helyről olvasva); új, futásonkénti összesített kör- vagy időplafont a rendszer nem vezet be (D7).
- [ ] E42 WHEN egy ÉLES futás számolt költsége átlépi a futásonkénti küszöböt, vagy az aznapi futások összege a napi küszöböt THEN
  the system SHALL a futást FOLYTATNI, és a túllépésről küszöbönként egyszer e-mailt küldeni az adminlevél-úton (`mailto:` nélkül;
  a levél hibája a gyártást nem akasztja meg). WHEN egy PRÓBAFUTÁS (mérőharness) eléri a próbakeretét THEN the system SHALL a
  következő modellhívás ELŐTT megállni és az állapotot menteni. The system SHALL NOT vészleállító / gyártás-stop kapcsolót adni.
- [ ] E43 WHEN egy lecke közzététel előtt áll THEN the system SHALL a kiadás előtti kaput futtatni (séma, tiltott minták, a
  pontozási szabály lenyomat-őre), és bukásnál nem közzétenni.
- [ ] E44 WHEN `en-GB` lecke áll közzététel előtt, és a hangfájl-kötelezettség be van kapcsolva THEN the system SHALL a szószedet
  minden hangfájljának meglétét megkövetelni; kikapcsolt állapotban a hiányt jelezni.
- [ ] E45 The system SHALL minden kapuhoz legalább három mutációs ellenpróbát tartalmazni, amelyeket a kapu a várt okkal megfog;
  ezt őr-teszt kényszeríti ki.
- [ ] E46 The system SHALL kapunként mért alapvonalat adni a kiadott állományból és a meglévő gyártási kimenetekből (csak olvasva).
- [ ] E47 The system SHALL a modell kimenetéről ott, ahol szkript el tudja dönteni, szkripttel (séma, szabály, mérőszám) ítélni,
  nem másik modellel.
- [ ] E48 WHEN a hangfájlok összmérete elérné a plafont THEN the system SHALL az írást megtagadni, a gyártást megállítani és jelezni.
  **Spec-pontosítás 2026-11-18 (orkesztrátori döntés a független review alapján; a tulajdonosnak jelezve, megerősítésre vár):** a plafon kettős — hangverziónként 40 MB (`total-exceeded`) és abszolút 80 MB a teljes
  táblára (`absolute-exceeded`); bármelyik elérése megtagadja az írást, megállítja a gyártást és jelez.
- [ ] E49 The system SHALL a hangfájlokat cserélhető tároló rétegen át elérni; a tároló cseréje a lecke JSON-ját és a klienst nem
  érinti.
- [ ] E50 WHEN a tanuló megnyit egy `en-GB` leckét, és a jegyzék szerint van előre gyártott hang THEN the system SHALL a hangokat a
  háttérben, a megjelenítés blokkolása nélkül, legfeljebb 3 párhuzamos letöltéssel lejátszásra kész állapotba hozni, a leckénkénti
  összméret-plafonig (3,5 MB), adatkímélő / lassú kapcsolaton csak az első szakaszt.
- [ ] E51 WHEN a tanuló előtöltött hangú szóra koppint THEN the system SHALL a hangot hálózati kör nélkül, a koppintástól számított
  300 ms-on belül elindítani (böngészőtesztben a `playing` eseményből mérve; kikapcsolt előtöltéssel a teszt bukik).
- [ ] E52 The system SHALL a hangmotor állapotát kizárólag a tanuló valódi koppintásaiból megtanulni (kéretlen kimondás és más
  kimondásának megszakítása nélkül): a `start` eseménnyel igazolt hangot a következő koppintásokra 1 s-on belül indítani; néma motornál
  az első koppintás csendkerete (3 / 6 mp) után a következő 2 koppintásra a böngészőhang-lépést kihagyni, majd újra megpróbálni; a
  megszakított / nem engedett kimondást nem a hang hibájának tekinteni; az ítéletet a lecke nyelve szerint tartani.
- [ ] E53 WHEN a tanuló még nem pufferelt szóra koppint THEN the system SHALL azonnal, a gesztusban megszólaltatni a böngészőhangot
  (ha van), a szó letöltését előre venni, és egy koppintásra legfeljebb egy hangot megszólaltatni.
- [ ] E54 WHEN a tanuló elhagyja a leckét vagy leckét vált THEN the system SHALL a futó letöltéseket megszakítani és a hangelemeket
  felszabadítani; a régi lecke hangja nem szólalhat meg.
- [ ] E55 WHEN a hangfájl letöltése hibázik (429, hálókiesés) THEN the system SHALL visszatartással újrapróbálni (legfeljebb 2), és a
  szót legfeljebb 60 mp-re tekinteni nem elérhetőnek — a lecke közben a böngészőhanggal használható marad.

Általános:

- [ ] E35 The system SHALL nem módosítani játékfájlt, `scripts/qa/` fájlt, kapu-hookot, éles adatot, és az S8b egyetlen új tábláján
  kívül migrációt nem hozzáadni.
- [ ] E36 The system SHALL a repóba titkot, e-mail-címet, tanulói adatot, éles sorazonosítót nem írni.

## 11. Tesztterv

- **Egységtesztek (node teszt, `tests/*.test.ts`):** szeletenként a végrehajtási fájl szerint — új fájlok:
  `arithmetic-false-alarms`, `source-visuals`, `source-visual-coverage`, `lesson-source-visual-kinds`, `seeded`,
  `lesson-feedback-openers`, `lesson-section-shapes`, `visual-kind-plan`, `open-answer-rules-version`, `voice-rank`, `tts-audio-key`;
  bővülők: `single-run-engine`, `lesson-visual-params`, `visual-patch`, `section-visuals`, `lesson-arc`, `lesson-opener`,
  `scoring-v2`, `studio-role-skills`, `speech-fallback`, `coverage-gate`.
- **Böngészős próbák (Playwright, `--workers=1`, E2E-sorompó után):** `source-visuals` (S2), `lesson-fusion` a felolvasás-szűrővel (S8b-2, S8d); regresszió:
  `lesson-interactions`, `lesson-typography`, `band-colors`, `lesson-practice`.
- **Mérés (S10):** hiánytábla és változatosság-mutatók; a kiosztás szimulációja modellhívás nélkül.
- **Gyártási kapuk (SK):** `source-coverage-gate`, `run-budget`, `variety-metrics`, `release-gate`, `gate-mutations` (mutációs
  ellenpróbák + őr), `tts-audio-store`, `tts-audio-gate`, `tts-generate`, `trial-ledger`; alapvonal: `gate-baseline.mts`.
- **Kapuk:** `gate:stage` szakaszonként; `gate:push`; független ellenőr + `record-review`; `gate:pr -- --body-file`.

## 12. Nem ellenőrzött pontok (UNVERIFIED) egy helyen

1. A négy eldobott ábra pontos oka a HM-futásban (csak szervernaplóban volt).
2. A számolási hamis riasztások éles tételszövege (az üzenet alakja reprodukált).
3. A helyi `fix/nyilt-feladat-rovid-valasz` ág tartalma (commit- és sorszám a jelentésből; az ág létezése ellenőrzött).
4. A próbaharness fájlból indítható-e (az 1. állomással együtt) módosítás nélkül.
5. A szerveres hangtartalék elfogadja-e a brit régiókódot más írásmóddal.
6. Az ElevenLabs-csomag szintje, a brit hangok választéka és felhasználási joga; az adatbázis-csomag méretkerete.
7. A böngészők eszközönkénti hangsorrendje; a tárhelybecslés.
8. A négy soha nem használt ábrafajta megjelenítőjének mai minősége; a `try` eredményének szerepe a tanulói statisztikákban.
9. A futások közti természetes szórás (ugyanaz a forrás többször legyártva).
10. A felsorolás sortörés-hibájának oka az élő oldalon.
11. A natív PDF-blokk oldalképet is ad-e a modellnek minden PDF-típusnál; a szolgáltató PDF-korlátai.
12. A tárolt időbélyegek időzónája; a futás pénzbeli költsége (csak token tárolt).
13. A `client/src/lib/tts.ts` hívóinak teljes köre (a `tests/tts-guard.test.ts` egy hívóhelyet rögzít, a jelentés a játékokat is
    hívóként említi).
14. A költség- és időbecslések (8. szakasz) — az S10 méri.
15. A meglévő admin-végpontok hitelesítési és CSRF-mintája, valamint az `/api/` útvonal azonos eredetű elérése és CDN-gyorsítótárazása
    a lecke oldaláról (az S8b / S8c első lépése olvassa ki a kódból).
16. Hol véglegesül a szószedet az egyfutásos motorban (S8c 6. lépés). (A megállás útja ELLENŐRIZVE az SK1-ben: az állomás
    `SingleRunError`-t dob, a `runSingleLesson` ezt elkapja, a jobot `error` állapottal és a mentett kimenettel zárja —
    `server/studio/single-run/engine.ts`; az SK1 `enforce` módja és a próbakeret megállása ezt az utat használja.)
17. Az SK kapuk kezdő küszöbértékei (80% hűség, 30% kihagyás, 9 USD futásonkénti jelzési küszöb, a napi küszöb, 40 MB) — a szeletek
    tesztjei és az alapvonal-mérés hangolják.
