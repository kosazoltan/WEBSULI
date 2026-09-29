# Végrehajtás — egyválasztós tételek: pontosan egy helyes válasz (2026-09-29)

Terv: `docs/specs/2026-09-29-egy-helyes-valasz.md` (rögzített döntések 1–4). Parancsok a `source/`-ban.
Sorrend: T1 tesztek → bukás igazolása a régi kódon → T2–T6 kód → T7 kapuk.

## T0 — Közös kiértékelő áthelyezése (viselkedés-változás nélkül)
- Új: `shared/arithmetic-expression.ts` — a `server/studio/tools/arithmetic-claims.ts` `OPS`, `NUM`, `SIGN`, `ATOM`,
  `EXPR` mintái, `atomValue`, `evaluateExpression` VÁLTOZATLANUL ide kerül (exportálva), mert a `shared/` (és a kliens:
  `isPlayableQuestion`) nem importálhat futásidőben `server/` kódot.
- `arithmetic-claims.ts`: ezeket importálja, az `evaluateExpression`-t újraexportálja (a meglévő tesztek
  `tests/section-patch.test.ts`, `tests/live-exam-pdf-2026-09-24.test.ts` változatlanul futnak).
- Ellenőrzés: `node --import tsx --test tests/section-patch.test.ts tests/live-exam-pdf-2026-09-24.test.ts` → pass.

## T1 — Tesztek (a kód ELŐTT; mind bukik a régi kódon)
1. `tests/single-choice-check.test.ts` (új) — `singleChoiceProblems`:
   - E1: „Melyik szám osztható 9-cel?” 234/567/891/648 → nem üres, az üzenet „4 opció” és a négy szám.
   - „Melyik szám NEM osztható 3-mal?” 315/472/813/126, kulcs=1 → `[]`; ugyanez kulcs=0 → hiba (a kulcs nem a teljesítő).
   - „Melyik szám osztható 9-cel?” 234/568/892/649, kulcs=0 → `[]` (E2).
   - „Mennyi 12 · 3?” 36/38/32/34 kulcs 0 → `[]`; 36/36,0/… → hiba (egyenértékű); „7 + 8 = ?” 15/15/… stb.;
     „Mennyi 12 · 3?” kulcs=1 (38) → hiba; „Mennyi 12 · 3?” 36/38/32, 36 kétszer számként („36”, „36,0”) → hiba.
   - Egyenértékű opciók: „0,5” és „1/2” → hiba; „Alma”/„alma ” → hiba.
   - Hamis riasztás nélkül (`[]`): történelmi („Mikor volt a mohácsi csata?” 1526/1541/1456/1686), angol
     („Which word is a verb?” run/table/blue/slowly), „Hány szám osztható 9-cel: 18, 27, 30?” 1/2/3, „Melyik a
     legkisebb 9-cel osztható háromjegyű szám?”, „Melyik szám osztható 9-cel és páros?”, zárójeles „Mennyi (3 + 4) · 2?”.
   - `lessonSingleChoiceProblems` (check blokk + experience quiz + választós módszer útvonallal).
2. `tests/game-quiz-contract.test.ts` VÉGÉRE (új teszt): E5 — a 234/567/891/648 sor `isPlayableQuestion` → `false`;
   a „NEM osztható 3-mal” helyes sor → `true`.
3. `tests/lesson-skill-checks.test.ts` VÉGÉRE (új teszt): a fixture egy kvíztételét 9-es oszthatósági hibás tételre
   cserélve `verifyLessonSkillBank(...).checks` → `single_correct` bukik; a lecke-szekcióba tett hibás check blokk
   (3. paraméter `sections`) → `single_correct` bukik, útvonal `sections[0].blocks[k]`.
4. `tests/lesson-experience.test.ts` VÉGÉRE (új teszt): a bankmodell első csomagjában a q1 a 9-es hibás tétel →
   a 2. kísérlet `user` szövegében szerepel „Egyválasztós” hiba (a `validate` elkapja).
5. `tests/studio-quiz-export.test.ts` vagy új `tests/single-choice-wiring.test.ts`: `exportQuizItemsFromChecks` a hibás
   check blokkot kihagyja; `validateGeneratedQuizItems` (új, kiemelt tiszta függvény a
   `gameQuizGeneratorService.ts`-ből) a hibás tételt eldobja (`skipped`).
6. `tests/bank-verifier.test.ts` VÉGÉRE (új tesztek, E3):
   - a darabok tartalmazzák a lecke check blokkjait (`sections[0].blocks[k]`);
   - a prompt a választós tételekből kihagyja a `correctIndex`-et és a `feedbackPerOption`-t (és a választós módszer
     `answer`-ét), vak megoldás nélkül is épül (`[]`);
   - stub-modell `choices` ítélettel: 4 igaz → blokkoló jegyzet „Egyválasztós tétel”; 1 igaz, de nem a kulcs → jegyzet;
     hossz-eltérés → jegyzet; hiányzó ítélet → nincs „cleared”, `unverifiedChoices`-ben szerepel; helyes → cleared;
   - `mergeBankVerifierNotes(..., false)`: az egyválasztós jegyzet NEM lesz `bank_check_late`
     (experience útvonalon kimarad a jegyzetekből → `choiceFlags`; `sections` útvonalon blokkoló marad).
7. `tests/lesson-pipeline-runner.test.ts` VÉGÉRE (új tesztek):
   - E3/E4: vak megoldás nélkül a bank-ellenőr fut; csak-bank keret nélkül (limit) az egyválasztós hiba
     `output.choiceFlags`-be kerül, nem figyelmeztetés;
   - E4 kapu: `choiceFlags` experience tételre, a bank a kivétel után is megfelel → publikál a tétel nélkül, a mentett
     lecke nem tartalmazza; check blokk determinisztikus hibával → `fail`, nincs publikálás.
Futtatás a kód előtt: `node --import tsx --test tests/single-choice-check.test.ts tests/bank-verifier.test.ts …` → bukik.
A bukás igazolása: a kódfájl(oka)t `git stash push -m <egyedi-tag> -- <fájl>` paranccsal ideiglenesen visszaállítva,
majd SHA szerinti `git stash apply <sha>` + a bejegyzés eldobása.

## T2 — `shared/single-choice-check.ts` (új; döntés 1)
- `export type SingleChoiceItem = { prompt: string; options: readonly string[]; correctIndex: number }`.
- `singleChoiceProblems(item): string[]` — három osztály, csak biztosan kiszámolható esetben szól:
  a) oszthatóság: pontosan egy „oszthat” a promptban; „melyik/válaszd ki/jelöld” kérdés; nincs „hány/mennyi/leg…”,
     „és/de/vagy/páros/páratlan/prím/maradék…” további feltétel, nincs N-en kívüli szám; minden opció egész
     (ezres szóközzel is). „nem” a promptban → a NEM osztható opciók számolandók. ≠1 teljesítő → hiba; 1, de nem a
     kulcs → hiba.
  b) számtani: a teljes prompt `[Mennyi (az eredménye|értéke)? | Számold/Számítsd ki]? KIFEJEZÉS [=] [?]`, legalább
     egy művelettel, zárójel nélkül; minden opció szám/tört/vegyes tört; `evaluateExpression`-nel egyező opciók ≠1 →
     hiba; 1, de nem a kulcs → hiba.
  c) egyenértékű opciók: normalizált szöveg (NFC, kisbetű, szóköz-összevonás, záró írásjel nélkül) egyezése, vagy
     számként egyenlő (tizedesvessző, tört, vegyes tört; a „1.000” pontos ezres alak nem olvasott).
- `lessonSingleChoiceProblems(lesson: { sections?, experience? }): Array<{ path; id?; problems }>` — `sections[i].blocks[j]`
  check blokkok, `experience.quiz[k]`, `experience.methods[k]` (ha `options` + egész `correctIndex`).

## T3 — Bekötés (döntés 2)
1. `server/studio/experience-builder.ts` `validate`: `problems.push(...packetSingleChoiceProblems(packet))` — a kvíz és a
   választós módszer hibái `${id}: Egyválasztós tétel: …` alakban (meglévő javító kör).
2. `shared/lesson-skill-checks.ts` `verifyLessonSkillBank(experience, subject, sections?)`: új `single_correct` check a
   bankra és (ha adott) a check blokkokra. Hívók: `step-runner.ts` `runGate` (a lecke `sections`-szel),
   `structured-improvement.ts` `assertRepairCandidate` (`candidate.sections`), a webes HTML-út
   (`server/improve/verify-lesson-method.ts`) a bankra.
3. `server/gameQuizGeneratorService.ts`: a validálás `validateGeneratedQuizItems(capped)` tiszta függvénybe kiemelve,
   plusz `singleChoiceProblems(...).length === 0` feltétel (hibás → `skipped`).
4. `shared/game-quiz-contract.ts` `isPlayableQuestion`: + `singleChoiceProblems(q).length === 0`.
5. `server/studio/quiz-export.ts` `exportQuizItemsFromChecks`: a hibás check kimarad.

## T4 — Bank-ellenőr (döntés 3) — `server/studio/bank-verifier.ts`
- `bankVerifierChunks`: a lecke `check` blokkjai is (`sections[i].blocks[j]`, sectionIndex = i).
- Új `isChoiceItem`; a promptba a választós tétel `correctIndex`, `feedbackPerOption` (és módszernél `answer`) NÉLKÜL megy.
- `buildBankVerifierPrompt(chunk, blind | undefined, lesson)`: vak megoldás nélkül `[]`; a kimeneti alak:
  `{ "errors": [...], "choices": [{ "path", "truths": [bool…] }] }` — minden választós tételhez kötelező.
- `parseBankVerifierErrors` → a `choices` is (csak a darab választós útvonalai; útvonalanként az első).
- `runBankVerifier`: `blind?` opcionális. Választós tételenként a KÓD dönt: nincs ítélet → nem cleared +
  `unverifiedChoices`; hossz ≠ opciószám / igazak ≠ 1 / igaz ≠ kulcs → jegyzet
  `BANK_VERIFIER_NOTE_PREFIX + SINGLE_CHOICE_NOTE_MARK + …` (`contradicts_source` → blokkoló), nem cleared.
  Ha ugyanarra az útvonalra szabad szöveges hiba is jött, az üzenet hozzáfűződik (útvonalanként egy jegyzet).
- `mergeBankVerifierNotes(lektor, verifier, blocking)`: egyválasztós jegyzet sosem `bank_check_late`; ha `!blocking`,
  az experience-útvonalú egyválasztós jegyzet kimarad a jegyzetekből (a kapu kezeli), a `sections` útvonalú blokkoló marad.
- Új `openChoiceFlags(result, blocking)` → `Array<{ path; message }>`: `!blocking` esetén az experience-útvonalú
  egyválasztós jegyzetek + a hiányzó ítéletű választós tételek („nincs független ítélet”).
- `server/studio/support-skills.ts` `bank-verifier`: bemenet — a vak megoldás lehet üres; választós tételnél a kulcs
  nincs megadva, minden opciót külön ítélsz; kimenet `choices`.

## T5 — Lektor-lépés — `server/studio/step-runner.ts`
- `startBankVerifier`: a `!blind?.solutions.length` feltétel törölve (vak megoldás nélkül is fut).
- A lektor ágban: `job.output.choiceFlags = openChoiceFlags(bankChecked, bankRepairPossible)` (a bank-ellenőr minden
  futásakor felülírva; ha nem futott, a korábbi érték törölve).

## T6 — Kapu (döntés 4) — `runGate`
- A `lessonSchema` után: `resolveChoiceGate(lesson, job.output.choiceFlags)`:
  nyitott = determinisztikus (`lessonSingleChoiceProblems`) ∪ `choiceFlags`. `sections` útvonal → `fail`
  („Egyválasztós hiba maradt … nem publikálható”). Experience útvonal → a tételek kivétele; ha
  `experienceProblems(csökkentett)` üres ÉS `verifyLessonSkillBank(csökkentett).ok` → a csökkentett lecke megy tovább
  (`store.upsertLesson` + `output.lesson`, `output.choiceGate = { removed }`), különben `fail`.
- A lektor-hash ellenőrzés az EREDETI (lektorált) `rawLesson`-nal számol (a kivétel csak elvesz).

## Szükséges meglévő-teszt változások (dokumentált spec-változás, döntés 3)
- `tests/lesson-pipeline-runner.test.ts` „vak megoldás nélkül nem fut” → a döntés 3 („vak megoldás NÉLKÜL is fut”) ezt
  megfordítja: az állítás 0 → 1 hívásra változik; a teszt második fele (cleared cache) változatlan.
- `bankVerifierSetup` stub-modellje eddig csak `errors`-t adott; a döntés 3 szerint az ítélet nélküli választós tétel
  nem „cleared”, ezért a stub a lecke kulcsából helyes `choices` ítéletet ad (a helyes modell viselkedése). Az állítások
  (cleared-szám, egy hívás, cache) változatlanok.
- `tests/bank-verifier.test.ts` „a bukott darab nem dob…”: ugyanezen okból a stub a két kvíztételre helyes `choices`
  ítéletet ad; az állítások (a hibás tétel nem cleared, a hibátlan igen) változatlanok.
- `tests/lesson-pipeline-runner.test.ts` „teljes Studio futás” és „lektor receives measured inflection scores”: a
  bank-ellenőr most vak megoldás nélkül is fut a lektorral párhuzamosan, ezért a sorrendi stub a bank-ellenőr hívását
  tartalom szerint (TÁMOGATÓ SKILL fejléc) szolgálja ki, illetve a lektor-hívás tartalom szerint választott (nem a 0.).
  A lépéshívások száma (3) és a lektor-prompt állításai változatlanok; +1 állítás: egy bank-ellenőr hívás.

## Végrehajtás közbeni pontosítások
- `openChoiceFlags` CSAK csak-bank kör nélküli körben (`!blocking`) ad jelzést (a terv edge case-e: „ismételt hiány →
  blokkoló jegyzet a round-limitnél”); javítható körben az egyválasztós jegyzet a csak-bank körbe megy, az ítélet
  nélküli tétel nem „cleared”, így a következő lektor-kör újra ellenőrzi. A darab-szintű hiba (időtúllépés) nem jelzés
  (a determinisztikus őr a kapun ekkor is fut).
- `bankItemHash` verzió-sót kap (`single-choice-1`): a telepítés előtt (opciónkénti ítélet nélkül) „cleared” tételek a
  futó jobokban újra ellenőrzésre mennek.
- A bank-ellenőr skill (`support-skills.ts`) a 2800 karakteres korláton belül maradt (`tests/role-skills-everywhere.test.ts`).
- Egyenértékű opciók (1c): ahol a kérdés a szám ALAKJÁRÓL szól (egyszerűsít, bővít, alak, írásmód, tizedes/közönséges
  tört), az egyenlő értékű opciók nem hibák (hamis riasztás elkerülése, döntés 1 „csak akkor szól…”).

## T7 — Kapuk
`npx tsc --noEmit`; `npx tsc --noEmit -p tsconfig.test.json`; `npx eslint client/src server --max-warnings 0`;
`node --import tsx --test tests/*.test.ts`; `npx vite build`. Elvárt: 0 hiba, minden teszt pass.
