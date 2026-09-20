# Spec: modellmátrix lépésenként + Opus 5 tervkészítő + tokentakarékos gyártás

> Dátum: 2026-09-19 · Szerző: Claude (Fable 5.1) · Állapot: JÓVÁHAGYVA (tulajdonosi döntés 2026-09-19 este: „Jóváhagyom”; a tervkészítő Anthropic Opus 5 medium efforttal, körbebástyázott prompttal)

## 1. Cél
Egy tananyag előállítási költségének és idejének drasztikus csökkentése minőségvesztés nélkül:
(a) minden lépéshez a feladathoz illő, külön-külön kiválasztott modell és effort; (b) a tömeges,
sablonos lépések (gyakorlóbank, ábrák, besorolás, kapu-segéd) olcsó OpenRouter-modellre;
(c) a tervkészítés (pedagógus) a legerősebb modellre, hallucináció- és körpazarlás-ellenes
promptkorlátokkal; (d) a szerzői javító körök célzottak, hogy a változatlan fejezetek
bankcsomagjai újrahasznosuljanak (a bank „egyszer” hatás).

## 2. Nem cél
- A workflow lépéssorának átrendezése (lesson-flow-2 marad); a bank továbbra is az animátor lépésben épül, de a változatlan fejezetek csomagjai a meglévő checkpoint-hashsel újrahasznosulnak.
- Belső angol nyelvű kommunikáció a modellek között (mérés szerint 5–10 % nyereség, D1-idézet-kockázattal) — külön döntés.
- A webes ág modelljeinek cseréje (Anthropic web_search marad).

## 3. Mért alap (2026-09-19, két 46–49 fogalmas futás, workflow-napló)
| Lépés | Látogatás | Bemenet | Kimenet | Modell ma | Költség (OpenRouter ár) |
| --- | --- | --- | --- | --- | --- |
| pedagógus | 1 | 8–11 e | 2–3 e | grok-4.6 | ~0,03 USD |
| szerző | 3 | 67–90 e | 33–40 e | gpt-5.6-terra (2/12) | ~0,5 USD |
| animátor (ábra + **bank**) | 3–4 | 443–453 e | 172–182 e | gpt-5.6-terra | **~3,0 USD** |
| lektor | 3–4 | 258–260 e | 3 e | grok-4.6 (2/6) | ~0,55 USD |
Összesen ≈ 4,1 USD és 35–40 perc egy leckére, a bank a költség 3/4-e.

Olcsó modellek valódi próbája (magyar bankcsomag JSON, 2 feladat + 2 kvíz, reasoning effort low):
`z-ai/glm-5.3-flash` 6,3 s, 615 kimeneti token, 0 gondolkodó, érvényes JSON; `deepseek/deepseek-v4-flash`
28,8 s, 386 gondolkodó, érvényes; `qwen/qwen3.8-flash` 37,7 s, 1744 gondolkodó (pazarló). Árak (USD/M
be/ki): deepseek-v4-flash 0,04/0,08; glm-5.3-flash 0,09/0,30; qwen3.8-flash 0,15/0,47; gemini-3.5-flash 1,50/9,00.

## 4. Modellmátrix (döntés)
| Szerep | Elsődleges | Tartalék | Effort | Indok |
| --- | --- | --- | --- | --- |
| ocr | qwen/qwen3-vl-32b-instruct (marad) | google/gemini-3.1-flash-lite | low | képes, olcsó |
| extract | gpt-5.6-terra (marad) | grok-4.6 | medium | D1 idézethűség |
| **pedagogue (tervkészítő)** | **claude-opus-5** (közvetlen Anthropic) | grok-4.6 | **medium** | a terv minősége dönti el a körök számát |
| author | gpt-5.6-terra (marad) | — | medium | család ≠ lektor |
| animator (csak ábrák) | z-ai/glm-5.3-flash | deepseek/deepseek-v4-flash | low | kozmetika |
| **bank** (45/75, új szerep) | z-ai/glm-5.3-flash | deepseek/deepseek-v4-flash | low | tömeges; a rubrikát determinisztikus kód ellenőrzi; 3 bukott kísérlet után terra |
| lektor | grok-4.6 (marad) | anthropic/claude-sonnet-5 | low | független család |
| gateHelper, quizPolish | deepseek/deepseek-v4-flash | z-ai/glm-5.3-flash | low | osztályozás |
`assertDistinctFamilies` továbbra is author×lektor (primer és tartalék) párokra fut; a pedagógus és a bank nem tagja a függetlenségi őrnek. Minden OpenRouter-hívás `reasoning: { effort }` paraméterrel megy (deepseek/qwen gondolkodó-tokenek korlátozása).

## 5. Tervkészítő (pedagógus) promptkorlátok — Opus 5, medium
- Bemenet: a kurált térkép (localId, term, definition, quote, examWeight), tantárgy, osztály, a cél-tananyag minta (§7b a másik specben). Kimenet: KIZÁRÓLAG a vázlat-JSON, próza nélkül, ≤ 12 fejezet.
- Tilalmak (a prompt kimondja, a kód ellenőrzi): csak létező conceptId (`outlineCoversMap`); minden fejezet ≥ 1 fogalom; nincs ismétlődő fejezetcím; `misconceptions.conceptId` létező; `animationSuggestions` ≤ 120 karakter; a forrás adatait nem találja ki és nem „javítja”.
- Körpazarlás ellen: a terv fejezetenként megadja a tanítási sorrendet (explain → example[lépések] → check), az ábra fajtáját és a forrás feladatait, hogy a szerző ne találjon ki szerkezetet, a lektor pedig a tervhez mérjen.
- Anthropic-hívás: `thinking: { type: "adaptive" }`, `output_config: { effort: "medium" }`, `max_tokens` 16 000, nem streamelt (a vázlat kicsi).

## 6. Célzott szerzői javítás (bank egyszer)
Round ≥ 1: a szerző csak a lektor/kapu által megnevezett fejezeteket kapja vissza javításra
(`sections: { "<index>": section }` alak), a runner determinisztikusan egyesíti az előző leckével;
a nem érintett fejezetek hash-e nem változik → az `experienceCheckpoint.parts` csomagjai újrahasználódnak,
nincs újraépítés. Ha a lektor fejezet nélkül jelez (általános), a teljes újraírás marad.

## 7. Elfogadás (EARS)
- WHEN a bank vagy az ábra lépés fut THEN a szolgáltatói kérés modellje `z-ai/glm-5.3-flash` (tartalék deepseek), `reasoning.effort = low`; 3 bukott csomagkísérlet után a csomag `gpt-5.6-terra`-n épül.
- WHEN a pedagógus fut THEN a hívás a közvetlen Anthropic API-n `claude-opus-5`, adaptív gondolkodás, effort medium; a vázlat a §5 korlátokat teljesíti, különben a meglévő séma/fedettség-ellenőrzés elutasítja.
- WHEN round ≥ 1 szerzői kör fejezetlistával indul THEN csak a felsorolt fejezetek változnak, a többi fejezet blokkjai bájtra azonosak, a bank checkpoint újrahasznosul (teszt: 1 fejezet javítása után a többi csomag modellhívás nélkül marad).
- Mérés: a Műveleti sorrend (a5747585) és az UK-földrajz (e8d8c2ba) térképen előtte/utána tokenszám és perc a workflow-naplóból; elvárt bank-költség < 0,2 USD, teljes lecke < 1,2 USD, idő < 20 perc.

## 7c. Mérés 1 (run 45233b4b, Műveleti sorrend, a mátrix a régi kódúton, 2026-09-19 21:13)
| Lépés | Modell | Be | Ki | Idő |
| --- | --- | --- | --- | --- |
| pedagogue | claude-opus-5 medium | 9 973 | 2 714 | 35 s |
| author (1 kör) | gpt-5.6-terra | 10 467 | 8 307 | 66 s |
| animator (ábra + 3 kész bankcsomag + 1 javítás) | z-ai/glm-5.3-flash low | 46 099 | 23 504 | 936 s → hiba |
Hiba: egy bankcsomag-válasz elérte a 16k kimeneti keretet, és a szolgáltatói hiba kivételként
kilépett a csomag-ciklusból (3 kész csomag után halt meg a futás). Javítás: a szolgáltatói/hossz-hiba
bukott kísérlet (újra → `FALLBACK_MODELS.bank` → mentőkör), bank/animator keret 24k. Költség-arány a
régi (443k/172k Terra) animátorhoz képest: eddig ~1/10 token, ~1/200 ár.

## 7d. Mérés 3 (run b5d07f3d, javított kód + eszközök, 2026-09-19 21:38)
| Lépés | Modell | Be | Ki | Idő |
| --- | --- | --- | --- | --- |
| pedagogue | claude-opus-5 medium (lélek + skill) | 10 994 | 2 212 | 25 s |
| author 1 | gpt-5.6-terra | 10 608 | 7 260 | 59 s |
| animator 1 (ábrák eszközből, 10 bankcsomag glm) | glm-5.3-flash | 107 908 | 56 960 | 563 s |
| lektor 1 (1 banktétel-blokkoló: experience.tasks.24) | grok-4.6 | 70 991 | 434 | 13 s |
| author 2 (teljes újraírás) | gpt-5.6-terra | 26 342 | 7 579 | 52 s |
| animator 2 (6 csomag újraépítve) | glm-5.3-flash | ~46 000 | ~23 000 | ~400 s |
| lektor 2 → **végkapu hiba** | | | | |
Két gyökérok, mindkettő javítva (PR #78): (1) egyetlen banktétel-blokkolónál a szerző újraírta a
tanítást → csak-bank javító kör bármelyik körben (`nextStep`, runner); (2) a végkapu a lektor
bemenetét `previousBlockers` nélkül hashelte, ezért minden 2. körös, blokkolómentes lektorálás a
kapun bukott (a kapu ugyanazt a bemenetet építi). Token-fegyelem: a lektor és a szerző nem kap
eszközleírást; a bank-skill előírja a példa lépéseinek/irányának szó szerinti követését (a
blokkoló oka: „jobbról balra” a mintában).

## 7e. Mérés 4 (run 525b2797, #78 kóddal, 2026-09-19 21:43–)
| Lépés | Modell | Be | Ki | Idő |
| --- | --- | --- | --- | --- |
| pedagogue | claude-opus-5 | 11 007 | 2 302 | 32 s |
| author 1 | gpt-5.6-terra | 10 189 | 7 225 | 56 s |
| animator 1 (ábrák eszközből; 10 csomag, 1 deepseek-tartalék, 1 terra-mentőkör) | glm/deepseek/terra | 81 245 | 50 452 | **1 795 s** |
| lektor 1 (1 kvíz-számhiba, experience.quiz.10) | grok-4.6 | 68 189 | 1 123 | 23 s |
| animator 2 = **csak-bank kör** (nem szerzői újraírás ✅) | glm | 15 454 | 9 447 | 850 s |
| lektor 2 (0 blokkoló) → **kapu**: 2 címke megalapozatlan (example blokkok) → author 3 | | | | |
| author 2 (kapu-visszajelzés) | gpt-5.6-terra | 25 377 | 7 595 | 55 s |
| animator 3 (teljes bank-újraépítés) | glm | 40 843 | 25 027 | 1 773 s |
| lektor 3: 1 új kvíztétel-blokkoló (experience.quiz.74), csak-bank kör már elhasználva → **hiba a limiten, 4 627 s** | | | | |
Tanulságok: (a) a csak-bank kör működik; (b) a kapu egyik elutasítása hamis pozitív (a forrás
kidolgozott példája számokkal) → PR #79 determinisztikus szabály; (c) tétel-szintű bankhibáért
nem dobható el egy lecke → `MAX_BANK_ONLY_ROUNDS = 2` (PR #80); (d) az idő a spec 20 percét
messze túllépi: a glm ~15–100 tok/s, csomagonként 1–4 kísérlet, SOROS csomagépítés — a
párhuzamos csomagépítés (3 egyidejű egység) a következő lépés (nyitott). Költség a 4. futásra
(≈ 470k be / 140k ki, döntően glm): ≈ 0,15 USD + Opus/terra/grok ≈ 0,6 USD.

## 7f. Mérés 5 — `done` (run 2210c108, #78+#79+#80 kód, 2026-09-19 23:02–23:24)
| Lépés | Modell | Be | Ki | Idő |
| --- | --- | --- | --- | --- |
| pedagogue | claude-opus-5 medium (lélek + skill) | 11 007 | 2 170 | 31 s |
| author 1 | gpt-5.6-terra | 10 177 | 6 998 | 61 s |
| animator 1 (ábrák eszközből, 10 csomag SOROSAN) | glm/deepseek/terra | 146 475 | 57 090 | 1 052 s |
| lektor 1 (1 kvíz: correctIndex ≠ magyarázat, quiz.62) | grok-4.6 | 68 206 | 891 | 19 s |
| animator 2 = csak-bank kör (1 csomag) | glm | 40 249 | 13 098 | 149 s |
| lektor 2: 0 blokkoló → kapu ✅ → readback ✅ | grok-4.6 | 68 891 | 483 | 13 s |
**Eredmény:** `done` 1 333 s (22 perc), lecke `cfdaca52` / html_files `3084206c` „Műveleti sorrend tanulása”,
9 fejezet a cél-tananyag mintája szerint (motiváció → szabályonként → „A feladat megoldva lépésről
lépésre” → „A leggyakoribb hibák” → „Ellenőrzés – hogyan légy biztos magadban?”), 45 feladat, 75 kvíz,
19 módszer. Költség ≈ 0,6–0,7 USD (glm ≈ 0,04; grok ≈ 0,28; terra ≈ 0,1; Opus ≈ 0,2) a korábbi ≈ 4,1 USD
helyett; idő 22 perc a 35–40 helyett (a 20 perces cél a #81 párhuzamos csomagépítéssel várható).
A quiz.62 hibaosztály (correctIndex ≠ magyarázat) determinisztikus ellenőrzést kapott (#81), így a
következő futásban a lektor elé sem jut.

## 7g. Mérés 6 — `done` (run 3aafddb1, #81 párhuzamos csomagok, 2026-09-19 23:29–23:55)
| Lépés | Modell | Be | Ki | Idő |
| --- | --- | --- | --- | --- |
| pedagogue | claude-opus-5 | 11 007 | 2 264 | 33 s |
| author 1 | gpt-5.6-terra | 10 410 | 8 651 | 75 s |
| animator 1 (ábrák eszközből; 10 csomag, 3 egyszerre) | glm | 134 034 | 78 628 | **740 s** (soros: 1 052 / 1 795) |
| lektor 1: 0 blokkoló → kapu: 3 example/try címke (hamis pozitív → #82) → author 2 | grok | 73 818 | 1 703 | 34 s |
| author 2 + animator 2 (érintett csomagok, párhuzamosan) | terra / glm | 27 766 + 25 131 | 8 729 + 13 195 | 55 + 123 s |
| lektor 2: 2 kvíztétel (quiz.67 „menet”, quiz.60 opció 990 ≠ indoklás 970) → csak-bank kör | grok | 75 299 | 2 191 | 41 s |
| animator 3 (csak-bank) | glm | 58 208 | 23 887 | 434 s |
| lektor 3: 0 → kapu ✅ → readback ✅ | grok | 75 244 | 1 214 | 24 s |
**Eredmény:** `done` 1 564 s (26 perc), lecke `7ec84713` / html_files `90f53a1a`, 12 fejezet, 45/75 bank.
A #82 (fejezet-szintű megalapozottság) nélkül a 2. kör elmaradt volna (−3 perc), a quiz.60 osztályt
a kiterjesztett `quizCorrectIndexProblems` (#83) a lektor előtt fogja meg (−7 perc) → várható ≈ 15 perc.

## 7h. Mérés 7–8 és a tulajdonos 49 fogalmas térképe (2026-09-20 hajnal, két futás párhuzamosan)
- **Run 7** (a5747585, #83 kód): hiba 1 031 s-nál — a #83 minden-opciós kvíz-ellentmondás szabálya hamis
  pozitív („27 helyett 10” egy hibás opció indoklásában jogos) → 4 kísérlet után megölte a 11. fejezet
  csomagját → **#84 hotfix** (csak a helyes opcióra). Tanulság a lektor jegyzeteiből: a szerzői kör oka
  valódi tanítási hiba volt (recap „nem mindig balról jobbra”), a lektor pontos.
- **49 fogalmas térkép** (08af437e, biológia „Zöldségek növényi szervei”, run e1b57553): **`done` 2 072 s**,
  lecke `35a75fbb`, 12 fejezet, 59 feladat / 118 kvíz / 33 módszer. Tokenek: Opus 12k/2,5k; terra 53k/24k;
  glm ≈ 468k/174k; grok 393k/4k → ≈ 1,4 USD (korábban ≈ 4,1 USD, 2 317 s). A 2. szerzői kör (jogos: a bank
  tanítatlan tényt kérdezett) után szinte minden csomag újraépült (817 s) — a célzott fejezet-javítás (§6)
  a maradék nagy tényező.
- **Run 8** (a5747585, #84 kód): **`done` 2 382 s** (két futás párhuzamosan osztozott a modelleken), lecke
  `b643e839`, 9 fejezet, 45/75. Kapu-elutasítás: „A leggyakoribb hibák” explain→check terv vs. ív-szabály
  (kérdés előtt példa) → **#85**: a terv példát ad a kérdés előtt. Nyitott: a csak-bank kör egyszer 482 s /
  123k tokent evett (több csomag épült újra egyetlen tétel miatt) — kivizsgálandó.
- **Időcél:** a 20 perc egyedül futó Műveleti-leckére a fenti javításokkal várható (bank 666–740 s + 1–2
  rövid kör); párhuzamos két futásnál nem teljesül. Költségcél (< 1,2 USD) a 10 fejezetes leckén teljesül
  (≈ 0,65 USD), a 49 fogalmas térképen ≈ 1,4 USD.

## 7i. Mérés 9 — `done` egyedül, célzott javítás + aritmetikai ellenőrzés (run 128fda1b, 2026-09-20 08:27–08:52)
| Lépés | Modell | Be | Ki | Idő |
| --- | --- | --- | --- | --- |
| pedagogue | claude-opus-5 | 11 038 | 2 124 | 33 s |
| author 1 | gpt-5.6-terra | 10 227 | 8 285 | 65 s |
| animator 1 (ábrák eszközből; 10 csomag 3 egyszerre, aritmetikai ellenőrzéssel) | glm | 131 267 | 58 183 | **1 134 s** |
| lektor 1: 1 banktétel (rubrika-szinonima „nyolcvannégy”) | grok | 71 359 | 378 | 14 s |
| animator 2 = csak-bank kör | glm | 38 254 | 8 944 | 225 s |
| lektor 2: 0 → kapu ✅ → readback ✅ | grok | 71 971 | 133 | 13 s |
**Eredmény:** `done` 1 487 s (24,8 perc), lecke `2afa67ea`, 10 fejezet, 45/75/21; szerzői újraírás
nem kellett, mentőkör/tartalék nem futott, aritmetikai hiba a lektorhoz nem jutott. A bank a lecke
idejének 76 %-a → `PACKET_CONCURRENCY` 3 → 5 (PR #87), várható bank ≈ 600 s, lecke ≈ 15 perc.

## 7j. Mérés 10 — `done` 14 perc, a §7 időcél teljesül (run 924dbfaf, #87 kód, 2026-09-20 08:54–09:08)
| Lépés | Modell | Be | Ki | Idő |
| --- | --- | --- | --- | --- |
| pedagogue | claude-opus-5 | ~11 000 | ~2 200 | 33 s |
| author 1 | gpt-5.6-terra | ~10 000 | ~8 000 | 60 s |
| animator 1 (10 csomag, 5 egyszerre) | glm | 133 021 | 58 808 | **602 s** |
| lektor 1: 0 blokkoló; kapu: 1 lelet a 3. fejezetben → **célzott javítás** | grok | 69 527 | 603 | 15 s |
| author 2 (csak a 3. fejezet, patch) | gpt-5.6-terra | 25 313 | 897 | **11 s** |
| animator 2 (csak a változott csomag) | glm | 7 399 | 5 232 | **100 s** |
| lektor 2: 0 → kapu ✅ → readback ✅ | grok | 68 927 | 586 | 15 s |
**Eredmény:** `done` **839 s (14 perc)**, lecke `5ece9c8c`, 9 fejezet, 45/75/20. A §7 elfogadás időcélja
(< 20 perc) és költségcélja (< 1,2 USD; ≈ 0,6 USD) teljesül; a bank-költség (< 0,2 USD) is (glm ≈ 0,03).
A célzott javítás mérve: szerzői kör 11 s (volt 42–94 s), animátor 2 100 s (volt 480–1 010 s).

## 7k. Értelmező lektor (tulajdonosi utasítás 2026-09-20) és mérés 11 (run 4a4fb9f2)
Kutatás-alapú elvek (Langfuse RAG-faithfulness, DeepEval LLM-as-a-judge, Deepchecks judge-kalibráció,
FutureAGI judge-prompting, Anthropic evals): szemantikus egyezés a lexikális helyett; kimondott „nem
kicsinyes” politika; bináris blokkoló-döntés horgonyokkal (hamis ÉS félrevezető); indoklás a döntés előtt;
kalibráló példák; dimenziók elkülönítése. Beépítve: lektor skill + prompt (3 kérdéses ellenőrzőlista,
NEM-blokkoló lista, kalibráló példák a mért esetekből), lektor effort low → medium.
Mérés 11: bank 641 s; a lektor két körben 1–1 valódi, ellenőrizhetően hamis disztraktor-magyarázatot
blokkolt (egy „154·8 nem 1232” állítás; egy hamis „zárójel nélküli sorrend” állítás), hamis pozitív
nélkül → 2 csak-bank kör (140 s, 30 s). A végkapu a limiten egy explain-címkén bukott (példa-típusú
fogalom, a számokat a fejezet PÉLDÁJA hordozza) → két javítás: a fejezet-szintű megalapozottság
kétirányú (bármely megalapozott blokk igazolja a fejezet többi címkéjét ugyanarra a fogalomra), és a
kapu a limiten fejezethez köthető lelettel egy célzott szerzői javítást ad (jobonként egyszer) ahelyett,
hogy a leckét eldobná. Mérés 12 igazolja.

## 8. Kockázatok
- Olcsó modell gyengébb bank → a determinisztikus ellenőrzés több kísérletet indít; a 3. bukás után terra.
- Opus 5 közvetlen hívás új provider-útvonal a Studio-ban (ClaudeProvider effort-paraméterrel) — teszt a kérés alakjára.
- A célzott javítás rossz egyesítése → a runner a teljes leckét sémaellenőrzi és a kapun méri, mint eddig.

## 10. Szerep-skillek (tulajdonosi kiegészítés 2026-09-19 este)
Kérés: „Készíts a tervezőnek és mindegyik modellnek egy-egy skillt, amiben teljesen pontosan leírod a
teendőiket, így a rögtönzés megszűnik, mindegyik hívja meg a maga szakaszának a skilljét."
- Hét szerep, egy-egy skill: `extract`, `ocr`, `pedagogue`, `author`, `animator`, `bank`, `lektor`
  (`server/studio/role-skills.ts`, a szöveg markdown TS-konstansban, mert a szerver bundle-ölve fut).
- Minden skill kötelező szakaszai: Szerep / Bemenet / Kimenet (pontos alak) / Lépések / Tilalmak /
  Önellenőrzés a válasz előtt; tömör (< 3200 karakter), a kimenet „Kizárólag JSON” vagy „Csak sima szöveg”.
- Bekötés: a skill a rendszerutasítás ELEJÉN áll (`withRoleSkill`), verziózott fejléccel
  (`=== SZAKASZ-SKILL: <role> (v<hash12>) ===`). Helyek: runner `promptLookup` burkolása
  (pedagogue/author/authorFix/animator/lektor — a DB-s `system_prompts` felülírás is megkapja), bank
  csomag-rendszerutasítás (`experience-builder`, a `teaching` hashben `roleSkill` verzió), kivonatoló
  `basePrompt` (cache-kulcs része), `OCR_SYSTEM_PROMPT` (OCR cache-kulcs része).
- Következmény: skill-módosítás után a lépés-hash, a bank-checkpoint és a kivonat-cache új kimenetet kér.
- Nem cél: a webes ág (Anthropic web_search) promptjai; a tanult futásidejű skill (`workflowSkillPrompt`)
  változatlanul a prompt VÉGÉRE kerül, a szerep-skill nem váltja ki.
- Elfogadás: WHEN bármely fenti szerep modellhívása indul THEN a rendszerutasítás a szerep skill-blokkjával
  kezdődik (teszt: `tests/studio-role-skills.test.ts`, runner hash-teszt (a)).

## 11. Eszközök (determinisztikus szkriptek) és a tervező lelke (tulajdonosi kiegészítés 2026-09-19 este)
Kérés: „készítsd el a megfelelő szkripteket, hogy azokat toolként tudja használni a rendszer … készíts
skilleket a szkriptekhez is"; „készíts egy lelket a tervező ügynöknek … tömör, pontos, hatékony, hazugság,
hallucinációs, lost in the middle hibákat el nem követő, túl nem polírozó".
- **Eszközök** (`server/studio/tools/`, + `section-visuals.ts`), a pipeline futtatja, modellhívás helyett/előtt:
  - `outline-autofix`: a pedagógus válaszán a séma előtt — ismeretlen/ismétlődő id, csak-ismeretlen fejezet,
    ismétlődő cím „(2)", ábra-javaslat ≤120, 12 feletti fejezet az utolsóba olvasztva, idegen tévhit.
  - `bank-packet-autofix`: minden bankcsomag-válaszon a séma előtt — ismétlődő opció (index/feedback átkötés),
    a minta TÉNYLEGES szóalakja a hiányzó required-csoportba, needsSentence, hiányzó intent. **Nem** nyúl a
    kötéshez (sectionIndex/coversConceptIds — tartalmi, `bank-binding-diagnostics`), nem csökkenti a minWords-öt.
  - `section-visuals`: ha minden fejezet a saját példájából kap ábrát, az animátor **nem hív modellt**
    (`model = tool:section-visuals`, 0 token). Javított hiba: a képaláírás a térkép szavaival nevezi meg a
    fogalmat, különben a #196 címke-őr eldobta a determinisztikus ábrát (runner-teszt (n2)).
- **Eszköz-skillek**: `TOOL_SKILLS` + `ROLE_TOOLS` (`role-skills.ts`) — a szerep-skillek „Eszközök" szakasza
  kimondja, mit javít a kód és mit nem; repo-skill a futtatáshoz: `.agents/skills/websuli-studio-tools/SKILL.md`;
  CLI: `npm run studio:tool -- <eszköz> …` (`scripts/studio-tool.ts`).
- **Lélek**: `ROLE_SOULS.pedagogue` a pedagógus skill-blokk elején (a verzió-hash része). Tartalma: identitás
  (gyakorlott 5–8. osztályos tervező), munkamód (teljes térkép + a közepe egyenlő figyelemmel, végén
  újraszámolás; egy menet, nincs alternatíva-sorolás; ami nincs a térképen, nem létezik; csak JSON), tilalmak.
- Elfogadás: WHEN a bankcsomag formai hibás THEN az eszköz javítja modell-kör nélkül (teszt: `studio-tools`);
  WHEN minden fejezetnek van példája THEN az animátor lépés 0 tokennel, `tool:section-visuals` modellel zárul
  (runner (n2)); WHEN a pedagógus fut THEN a rendszerutasítás a lélekkel kezdődik (`studio-role-skills`).

## 9. Végrehajtás
`docs/specs/2026-09-19-model-matrix-and-planner-vegrehajtas.md`
