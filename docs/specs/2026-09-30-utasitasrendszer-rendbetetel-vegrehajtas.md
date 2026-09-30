# Végrehajtás — utasításrendszer rendbetétele (ügynöknek; a v6 terv és az Astra 6. kör feltételei szerint)

Terv: `2026-09-30-utasitasrendszer-rendbetetel.md` (v6, Astra: ELFOGADHATÓ a §C-V feltételekkel). Astra-körök és nyers
bizonyítékok: `2026-09-30-utasitasrendszer-rendbetetel-astra/`. Ez a fájl a kötelező sorrend, a fájlok, a tesztek és a
lezárási feltételek. **Tesztet, kaput, minimumot gyengíteni tilos; a bukó teszt a kód hibája.** Minden egység: teljes
unit (`npm.cmd test`), `npx tsc --noEmit -p .` és `-p tsconfig.test.json`, eslint, CI zöld, az egység regressziós
példái, saját PR (egy PR nem vág ketté működési függőséget), külön `.audit-ok` + push, merge után Render/Vercel igazolás.
Élő futás alatt nincs merge/deploy.

## 0. Nyitott és részlegesen javított hibák státusz-nyilvántartása (kötelezően karbantartva)
`docs/specs/2026-09-30-utasitasrendszer-rendbetetel-status.md`: H-tételenként `nyitott / részleges / lezárt (PR, teszt) /
ismert maradó`. Ismert maradó: szöveges válasz globális tagadás-heurisztikája (H1/H2 nem teljesen lezárt); H40 külön spec.

## U0 — Verziózott utasításcsomag és szerepszűrés (B0, B5, C1)
Fájlok: `shared/runtime-knowledge.ts`, `shared/lesson-skill.ts`, `server/workflows/engine.ts`, `server/studio/run-step.ts`,
`server/studio/role-skills.ts`, `server/studio/support-skills.ts`, `server/studio/repair-skill.ts`, új
`shared/instruction-bundles/{websuli-runtime-2,websuli-runtime-3}.ts`, `server/studio/step-runner.ts` (skilledPromptLookup).
1. `INSTRUCTION_BUNDLE_VERSION = "websuli-runtime-3"`; az eddigi `runtimePrompt`-szövegek (soul/iam/recovery, 45/75-ös
   mondat, `SKILL_RULES` 15 szövege) változatlanul a `websuli-runtime-2` archívumba; a `runtimePrompt(snapshot, mode, role)`
   és `skillRuleText(snapshot, role)` a `snapshot.runtimeVersion` szerint választ archívumot; az engedélylista helyett
   archívum-lookup (ismeretlen verzió → hiba, mint ma).
2. Szerepszűrés: `SKILL_RULE_ROLES: Record<SkillCode, RoleSkillRole[]>`; a 45/75-ös mondat csak `bank`; a `role` a
   `callStepModel` paramétere (`StepCallInput.role`), a hívó adja (bankhívás `bank`, ábra `animator`, akkor is, ha az
   `animator` lépésen belül fut — §C-V/3). Hiányzó `role` → a lépés neve (átmeneti), naplózott figyelmeztetéssel.
3. `roleSkillBlock(role, version)`, `withSupportSkill(key, system, version)`, `repairSkill(version)`: a `websuli-runtime-2`
   verzió a MOSTANI szövegeket adja (archívumból), a 3-as az újakat (U1–U6 tölti fel). A `skilledPromptLookup` a futás
   indulásakor feloldott TELJES promptot (DB-törzs + skill) a pillanatképbe menti (`snapshot.prompts[name]`), folytatáskor
   onnan olvas (§C-V/2).
4. Három kulcs: `contentKey` (forrás + tanítás ábra nélkül + csomag-bemenet), `verificationKey` (bundle-verzió +
   ellenőrző-verziók + vak megoldások hash + cím/évfolyam/fejezet), `bundleVersion` (napló). `computeStepHash` és
   `unitTeaching` a `contentKey`-t, a lektor/bank-ellenőr/instruction-check a `verificationKey`-t használja.
5. Régi futás archivált szöveg nélkül (runtimeVersion 1): nem folytatható új utasítással → lezárás explicit üzenettel
   (§C-V/11).
Tesztek: régi pillanatkép (runtime-2) bájtra a régi szöveget kapja; új futás role-szűrt; bank-szabály nem jut a
lektorhoz; DB-prompt pillanatkép változatlansága; `contentKey` nem változik ábracserére.

## U1 — Pontozó és válaszmodell (C13, B4 `OPEN_ANSWER_RULES_HU`)
Fájlok: `shared/lesson-experience.ts` (openTaskSchema), `shared/lesson-experience-score.ts`, új
`shared/answer-value.ts`, `server/studio/tools/arithmetic-claims.ts`, kliens pontozó hívásai, `server/routes` lecke-API.
1. `openTaskSchema`: opcionális `typedAnswers: [{part, kind: 'number'|'fraction'|'expression', value: string, unit?, form?:
   'simplified-fraction'|'decimal'|'intermediate-step'|'any'}]`, `requiredDistinct?: [{category, from: string[][], count}]`,
   lecke-szintű `scoringVersion` (`LESSON_SCORING_VERSION = 2`; hiányzik = 1).
2. `answer-value.ts`: kifejezésnyelv (egész, tizedes `,`/`.`, közönséges tört, `+ − · × * : /`, zárójel, egység a végén);
   normalizált érték-összevetés (tört egyszerűsítve, előjel); `form` ellenőrzés; `intermediate-step`: műveleti állapot
   egyezése (szóköz és azonos jelentésű jel nem különbség); nem értelmezhető → `undecidable`. `evaluateOpenAnswer` v2:
   ha `typedAnswers` van, részfeladatonként az érték dönt (felcserélt részeredmény hibás), a `required` a szöveges részt méri;
   `requiredDistinct`: kategóriánként a különböző találatok száma (szinonimacsoport = 1 elem); a `+ · : /` megmarad a
   `normalizeAnswer`-ben (v2-nél); v1 lecke a régi függvényen (`evaluateOpenAnswerV1`) pontozódik.
3. Referencia igazsága: `arithmetic-claims` bővítése — a `q`-ban álló kifejezésből az `typedAnswers[].value` újraszámolva; eltérés
   = csomaghiba (nem figyelmeztetés).
4. Kompatibilitás (§C-V/1, 11): a lecke-API a kliens `X-Websuli-Scoring` fejlécét (hiányzik → 1) a lecke verziójához méri;
   újabb lecke → 409 + frissítés-üzenet; a kliens az új verziót küldi; `tolerantLessonInput` megjelenít, nem pontoz némán.
5. `OPEN_ANSWER_RULES_HU` a konstansokból generálva (STEM_SUFFIXES, SENTENCE_CONNECTIVES exportálva).
Tesztek: `2/1` vs `1/2` (0 / 1), `0,5` vs `1/2` `form` szerint, felcserélt részeredmények, „alma” egy elem ≠ 2, két
szinonima = 1 elem, `intermediate-step` 35 + 8 · 8 − 12 ≠ 35 + 64 − 12, v1 lecke változatlan pontszám (rögzített
fixture-ekkel), régi kliens 409, negatív példák minden szabályra.

## U2 — Bank (C2, C8, C9, B1 bank, B3, B4 `BANK_PACKET_CONTRACT`, B2 részlet)
Fájlok: `server/studio/experience-builder.ts`, `shared/lesson-experience.ts` (közös `questionKey`), új
`server/studio/bank-schema.ts` (Zod → JSON-séma), `server/ai/studio-provider.ts` (json_schema út), `role-skills.ts` bank +
`TOOL_SKILLS`, `support-skills.ts` bank-verifier és lektor válaszszerződés-része, `step-io.ts` lektor H53 korrekció.
1. `questionKey()` egy helyen: kisbetű, NFC, szóköz-összevonás, a `+ − · × * : /` és számok megtartva, egyéb írásjel törölve;
   mindhárom hely ezt használja (H44).
2. Bank prompt: `BANK_PACKET_CONTRACT` + `OPEN_ANSWER_RULES_HU` + pontos darabszám (target; Count alatt elutasítás) + a
   korábbi csomagok kérdései ÉS kapukérdései; a fejezet ábra NÉLKÜL (`unitTeaching` és a bemenet `stripAnimate`); a
   `validate` elutasítja az ábra-sorszámra/„az ábrán látható” fordulatra hivatkozó tételt (szükséges feltétel) és a
   `match` többértelműségét; csomagonként `oral`+`written` előre kimondva.
3. Szigorú séma: `bank-schema.ts` a `packetSchema` és a javító-lista sémájából (két külön séma), `.refine/.transform` nélkül;
   csak `providerForModel === "openai"` közvetlen úton (`luna`, `terra`), `response_format: json_schema strict`; első feladat
   a valódi séma szolgáltatói elfogadásának élő próbája (naplózva `evidence-so-bank.txt`); tartalék úton JSON-mód marad.
4. C9: determinisztikus rubrika-ellenőrzés csak típusos válaszra (U1) — nincs heurisztika; hibakód → javítási jogosultság
   (`repairAllows: {itemId, fields}`), a javítómód csak ezt engedi cserélni.
5. H52: utolsó kísérlet csak-aritmetikai jelzéssel → nyitott lelet a csomagon (`openFindings`), kivehető tétel a
   limit-táblában, nem néma figyelmeztetés.
6. Skill: B1 bank szövege (≤ 5200 az eszközökkel); `bank-packet-autofix` leírás a pontozóhoz; az ábratervező csak
   `section-visuals`-t kapja; lektor „első menet” kalibráló példa cseréje (H53).
Tesztek: `8:2` ≠ `8·2`, `15 + 4` ≠ `15 · 4`; ábracsere → azonos `contentKey`; kapukérdés-ismétlés a prompt alapján
elkerülve; javítómód idegen tételt nem cserél; `match` többértelmű → hiba; a 7-elemű ismételt próbakimenet duplikátumként
bukik; skill-hossz és kulcsmondat tesztek frissítve e spec szerint.

## U3 — Tanári pontjegyzék (C14, B2 instruction-checker, B4 owner-blokk, `gaps` tárolás, B1 pontjegyzék-részek)
Fájlok: új `server/studio/instruction-points.ts`, `instruction-check.ts`, `owner-instruction.ts`, `step-runner.ts`
(pedagógus/szerző/kapu bekötés), `step-io.ts` (owner-blokk, pedagógus prompt), `shared/lesson-schema.ts` (`gaps`).
1. `OWNER_INSTRUCTION_MAX` → tárolás teljes; a pontjegyzék-hívás kerete a kérés hosszához (≤ 32 k karakter), fölötte
   `truncated: true` + `unprocessed` pont (§C-V, H47/H50).
2. Pontjegyzék EGYSZER a pedagógus előtt (Opus 5.5): két független kivonat → unió = JELÖLTLISTA; végleges pont csak
   `requestSpan` (betűhű részlet az eredeti kérésből) visszakötéssel; ismétlés/kizárt/ellentmondó → kiesik vagy
   `ambiguous`; „forrás alátámasztja” (idézet + `supports: yes/no` + indok) és „tanár kérte” külön mező. Állapotok:
   feldolgozottság (`processed/unprocessed`) × tartalom (`taught / source_available_missing / not_in_source / undecidable`).
3. A pedagógus a `taught`-ra váró és `source_available_missing` pontokat fejezethez rendeli (prompt + skill); a szerző csak
   igazolt pontot tanít; `not_in_source` → `gaps` (séma, tárolás `job.output.gaps`, panel jelzés) — U3-ban készül el.
4. A kész leckén: fejezetre szűkített bizonyíték, fejezetcím kizárva; `parseInstructionCheck` üres pontlistát kérés mellett
   elutasít; a kimenet azonosítóit a jegyzékhez méri (teljesség = azonosító-egyezés); `verificationKey`.
Tesztek: csonkolt kérés jelölve; tanár által kizárt többletpont kiesik; cím nem bizonyíték; másik fejezet szövege nem
bizonyíték; hiányzó pont-azonosító → részleges ellenőrzés; Egyiptom-korpusz pontjai (16) visszajátszva.

## U4 — Szerző és pedagógus (C3, C4, C12, H39, H50, B1 author/pedagogue, B2 kid-text-fixer, B4 `TEACHING_CONTRACT`)
Fájlok: `step-io.ts`, `step-runner.ts`, `section-patch.ts`, `source-reference.ts`, `role-skills.ts`, `support-skills.ts`,
`shared/lesson-experience.ts` (TEACHING_CONTRACT szelet), `grounding.ts`/`coverage.ts` (`sectionIdx`).
1. Forrás-hivatkozás törlés + jelentésmegőrző átírás a szerzői lépés VÉGÉN (a bank előtt); a `kid-text-fixer` skill:
   csak a hivatkozó tagmondat törlése, új állítás tilos, forrásra szoruló eset `needsSource` jelzés.
2. Célzott javítás: az újrakérés folt-alakot kér, `parseSectionPatch`/`mergeSectionPatches` a retry után is; teljes lecke
   célzott módban = hiba (fail), nem WARN; `ungrounded[].sectionIdx`.
3. Hatókör-őrök: fejezetcím, `probaEnabled`, `emoji`, `misconceptions`, `experience` összevetése.
4. H50: `outlineSectionSchema` `raw` megőrzése + `clamped` jelzés a `qualityNotes`-ban; a szerzőnek a vágott érték megy, de
   megsérült `keyPhrases` nem kötelező kiemelés; a korlátok a pedagógus promptban kimondva.
5. Prompt magyar, `TEACHING_CONTRACT` egyszer; „reportba írd”/„mapId változatlan” törölve; megalapozás szabálya,
   hosszkorlátok, ív a skillben; pedagógus kivétel (Gyakori hibák/Ellenőrzés).
Tesztek: retry patch-alakban egyesül; teljes lecke célzott módban bukik; átírt szöveg után a bank egyszer épül; „a forrás
szerint” → jelentésőrző átírás (regressziós mondatpárok); vágott mező jelzett.

## U5 — Lektor és ellenőrzők (C5, C6, C18, H24, H32, H37, H45, H48, H49, H51, ábra-szerződés, B1 lektor, B2)
Fájlok: `step-io.ts` (lektor prompt, séma), `lektor.ts`, `bank-verifier.ts`, `blind-solver.ts`, új
`server/studio/figure-check.ts`, `step-runner.ts`, `support-skills.ts` (blind-solver, bank-verifier, figure-check).
1. Lektor bemenet: kiírt útvonalas, tömör nézet (`sections[i].blocks[j]`, `experience.tasks[n]`); ábra: fajta + caption +
   SVG-ből kinyert feliratok/számok/elemszám, strukturált fajtánál teljes params; `TEACHING_CONTRACT` egyszer; javító körben
   a változott fejezetek/tételek és az igazolt tételek jelölése; a jelentés `solutions` + `notes` kötelező, `{}` érvénytelen;
   `solutions` vágás helyett `solutionsTruncated` + darab → azonosító szerinti pótlás a közös keretben, különben részleges
   lektorálás (nem teljes igazolás).
2. Bank-ellenőr: megkapja a fejezet explain/example szövegét és a tételek fogalmainak quote-ját; tételenként kötelező
   ítélet (`verified/error/undecidable`), teljesség azonosító-egyezéssel; `truths` hibás hossz = ellenőrző-hiba →
   `undecidable`; `parseBankVerifierErrors`: azonos útvonalon több kifogás MEGMARAD (kifogás-kulcs: útvonal + mező +
   állítás-lenyomat), nincs 600-as vágás a tárolásban (megjelenítés rövidülhet); `mergeVerifierRetry` csak az
   ítélethiányt cseréli; `mergeBankVerifierNotes`: csak azonos kifogás vonható össze, nincs `bank_check_late`;
   `cleared` kizárt nyitott lelet mellett; leletek stabil tétel-azonosító + tartalomváltozat szerint.
3. Vak megoldó: saját skill; elemenkénti séma-hiba → elem kimarad, `partial: true`; „NINCS ELÉG ADAT” megőrizve.
4. `figure-check.ts`: renderelt ábra (PNG) + „mit mutat?” Opus-hívás a fejezet tanítása ellen, saját skill és
   `FIGURE_CHECK_VERSION`; felismerési arány mérése a korpusz ábráin (§C-V/12) — a mérés eredménye nélkül csak figyelmeztető.
5. `verificationKey` mindenhol (H37).
Tesztek: ugyanazon tételen két külön hiba → az egyik javítása után a másik nyitott (parser → tárolás → összefésülés →
újrahívás → `cleared` → kapu, tételátrendezéssel is); üres jelentés bukik; sikertelen újrahívás → `undecidable`;
`solutionsTruncated` kezelése; lektor bemenet nem tartalmaz SVG-törzset.

## U6 — Limit-policy, javítószabály, keret, költség (C7, C10, C11, C15, C16, B1 animator/extract/ocr, B2 scope/web-*)
Fájlok: `limit-policy.ts`, `repair-skill.ts`, `run-step.ts`/`studio-provider.ts` (keret, cache), `ClaudeProvider.ts`
(`cache_control`), `run-extraction.ts`, `role-skills.ts`, `support-skills.ts`, `shared/lesson-visual-params.ts`.
1. C15 (H42): minden címke megalapozatlan → címkék le; címke nélküli nem-recap blokk → egy célzott javítás, különben kivétel;
   §C-L teljes újramérés (fedettség, 45/75, csomag-követelmények, 10 módszer, 2 kapukérdés, 15/25 kör, ív, Próba); a
   vak-megoldás-eltérés külön sor (`undecidable` → figyelmeztetés, nem bukás, nem igazolás); közös kapu minden sor fölött.
2. C16 (H43): szóegyüttállás → JELÖLT; javító-lektor „a régi állítást állítja-e?” (igen/nem/bizonytalan); csak „igen”
   blokkol; korábban bizonyított hiba javításának bizonytalan ellenőrzése nem zár le (§C-V/9); `REPAIR_SKILL` szövege azonos elv.
3. C11: `length` → egyszer nagyobb keret (modellenkénti plafon: `MAX_OUTPUT_BY_MODEL`), közös próbálkozás-számláló a
   szolgáltatói/séma/tartalom/tartalék körökön; C7: quote-javítókör csak a hibás fogalmak saját fájljával.
4. C10: prompt-sorrend (skill → szerződés → térkép → változó rész), Anthropic `cache_control` a stabil prefixen,
   `cached_tokens`/`cache_write_tokens` a `visits`-be; ársávok figyelése (272 k / 200 k) naplóban.
5. Skillek: animator (≤ 2 ábra, példás fejezetbe ábra, 800×520, ≥ 10 elem, font-size, allowlist, `url(#id)`, caption),
   `VISUAL_PARAMS_CONTRACT` 800×520; extract/ocr („[N. oldal]”, hosszak, idegen írás, döntő olvasás); scope (SCOPE_PROMPT
   is kimondja); `web-research` gyűjtés és új `web-extract`.
Tesztek: limit-tábla minden sora; „Nem a Föld…” helyes mondat nem blokkol; `length` egyszer újrapróbál plafonig;
`cached_tokens` naplózva; skill-hosszak.

## B6–B8 — a tényleges működés dokumentálása (U6 után)
`docs/lesson-improvement.md` (95%-os szabály, limit-tábla, szerepszeletek, pontozó v2, pontjegyzék; történeti rész
`docs/archive/`), `.agents/skills/tananyag-keszito`+`tananyag-javito` (közös törzs + eltérés), `websuli-internet-pipeline`,
`websuli-studio-tools`, `.cursor/rules/websuli-core.mdc`, `RUNBOOK.md §4`, `runtime-skill-learning.md`, `kanban.md`,
`BACKLOG.md`; Claude-memória 22 fájl (elavult tények javítva, napló tömörítve); DB: ismeretlen hibaosztály szövege a
futásnaplóban; `tananyag-okosito` a tulajdonos döntése. Csak a MEGVALÓSULT működést írja le.

## Élő mérés (a terv D pontja)
Visszajátszható készlet a mentett checkpointokból (matek, történelem, nyelv, OCR; régi futás folytatása; szolgáltatói
hiba; `length`; hiányos ellenőrző-válasz; sérült bemenet; több helyes párosítás; elérhetetlen Próba). Mérőszámok: teljes
költség / használható lecke (ársávokkal és cache-írással), bukott próbák költsége, elsőre elfogadott csomagok aránya,
újragenerált tételek, cache-olvasás/-írás, késleltetés, végső hibaarány, limit-tábla szerinti kivételek listája. Több
ismételt Egyiptom-futás, összevetés 767d9813-mal. A publikálás nem javulhat hibás válasz elfogadásával, ellenőrzés
kihagyásával vagy hiány elrejtésével.
