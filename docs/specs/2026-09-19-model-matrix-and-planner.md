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
