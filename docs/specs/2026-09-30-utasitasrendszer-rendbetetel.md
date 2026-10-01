# Utasításrendszer rendbetétele — skillek, lélek, runbook, promptok, pontozó, dokumentáció, memória (2026-09-30, v6)

Tulajdonosi utasítások (2026-09-30): (1) 100%-os hibaösszesítés minden forrásból; (2) az összes modellnek szóló utasítás
(skill, lélek, runbook, prompt, dokumentáció, memória) rendbetétele a programjavítás ELŐTT; (3) a terv független
ellenőrzése a programban elérhető GPT-6 Astra modellel (high effort) a kódolás előtt; (4) a mérce a szakmai helyesség,
külső minták csak akkor, ha mért hibát javítanak.

Ellenőrzési előzmény: v1 → Astra 1. kör „JAVÍTANDÓ” (10 kritikus hiány, 12 téves/nem igazolt állítás); v2 → Astra 2. kör
„JAVÍTANDÓ, lényegesen javult” (7 hiány); v3 → Astra 3. kör „JAVÍTANDÓ, a fő irány megfelelő” (6 hiány); v4 → Astra 4. kör „JAVÍTANDÓ, nem újabb teljes áttervezés szükséges” (4 döntési szabály korrekciója + végrehajtási feltételek). v5 → Astra 5. kör „JAVÍTANDÓ egyetlen döntési szabály (H48) miatt; a többi végrehajtási feltétel”. Ez a v6 a H48 szabályt cseréli, a §C-V-t kiegészíti, és nyers bizonyítékfájlokat csatol (`tmp/evidence-*.{txt,json}`) a korábban NEM IGAZOLT mérésekhez; a kód-ellenőrzött tényeket
`[kód]`, a mért adatokat `[mért]`, a nem bizonyítottat `NEM IGAZOLT` jelöli.

---

## A. ÖSSZESÍTÉS

### A1. Beolvasott források
| Forrás | Tartalom |
|---|---|
| Éles DB (`tmp/hibakorpusz.txt`, 2026-09-30) | 63 `studio_jobs` (hiba, lektori jegyzet, kapuok, tanári-kérés hiány), 109 `lesson_workflow_runs` (lépéssor, lépésenkénti tokensIn/Out, hiba, lelet), 185 `lesson_skill_lessons`, `system_prompts` (3 régi sor: `material_creator`, `html_fixer` — a régi HTML-utak használják; `tananyag-okosito` — semmi nem használja) |
| Élő naplók | `tmp/web-live-*.log` (Egyiptom 1–4, Mezopotámia, oszthatóság, 4/25, Hunyadi) |
| Modellnek szóló szövegek | `role-skills.ts` (7 szerep, 5 eszköz, 1 lélek), `support-skills.ts` (14), `repair-skill.ts`, `runtime-knowledge.ts`, `lesson-skill.ts` (`SKILL_RULES` 15), `lesson-skill-checks.ts`, `LESSON_METHOD/QUALITY/ARC_CONTRACT`, `VISUAL_PARAMS_CONTRACT`, `DECISION_STORY_CONTRACT`, `ownerInstructionPromptBlock`, `D1_RULE_TEXT`, `TRANSCRIPTION_RULE_TEXT`, `SOURCE_REVIEW_RULES`, `AUTHOR_BLOCK_CATALOG` |
| Promptépítő szkriptek | `step-io.ts`, `step-runner.ts`, `experience-builder.ts`, `visual-designer.ts`, `bank-verifier.ts`, `blind-solver.ts`, `instruction-check.ts`, `source-reference.ts`, `one-step.ts`, `run-extraction.ts`, `extractor.ts`, `ocr.ts`, `web-research-*.ts`, `repair-skill.ts` |
| A program valós szabályai | `lesson-experience-score.ts`, `lesson-experience.ts`, `experience-builder.ts validate`, `single-choice-check.ts`, `arithmetic-claims.ts`, `grounding.ts`, `coverage.ts`, `lesson-arc.ts`, `lektor.ts`, `limit-policy.ts`, `bank-item-ref.ts`, `section-patch.ts`, `illustration-svg.ts`, `visual-patch.ts`, `visual-quality.ts`, `verbatim.ts`, `source-transcript.ts`, `owner-instruction.ts` |
| Ügynök-utasítások | `AGENTS.md`, `RUNBOOK.md`, `.agents/skills/*/SKILL.md` (4), `.cursor/rules/*.mdc`, `.cursorrules` |
| Dokumentáció | `docs/lesson-improvement.md`, `runtime-skill-learning.md`, `kanban.md`, `agent-haromfazisu-munka.md`, `memory/projects/websuli/{BACKLOG,LEDGER}.md` |
| Claude-memória | 22 fájl |
| Független auditok | 4 csak-olvasó szerep-audit (bank; szerző+pedagógus; lektor+ellenőrzők; ábratervező+kivonatoló), 5 Astra-kör; a kulcsleletek kódból megerősítve |
| Nyers bizonyítékfájlok | `tmp/evidence-visits-tokens.txt` (lépésenkénti `visits.tokensIn/Out` a 3 legutóbbi futásból), `tmp/evidence-so-probe.txt` (szigorú séma élő próba nyers kimenete), `tmp/evidence-models-raw.json` (OpenRouter `/models` szűrt nyers válasza) |

A „100%-os összesítés” az A1 forrásjegyzék teljes bejárását jelenti; a bejárás ténye a jegyzékből és a hivatkozott fájl:sor helyekből ellenőrizhető, teljességi garanciát nem állítunk (ismeretlen hibaosztályt a H11 szerinti emberi jelentés fog el).

### A2. Hibajegyzék (bizonyítékhoz kötött)
A számlálók (`lesson_skill_lessons`) regex-detektorokból jönnek és átfedhetnek; a `source_fidelity@lektor` a tanítási
és a bank-tényhibát együtt számolja — ezért **előfordulás-jelzők, nem független hibaszámok**.

| # | Hibaosztály | Bizonyíték | Gyökérok | Állapot |
|---|---|---|---|---|
| H1 | Banktétel tényhiba (rossz érték a csoportban: „52”/72, „feltűnő”/„kevéssé feltűnő”, „jelent”/„jelenkor”; hiányzó végeredmény-csoport; balról-jobbra hiba; két jó opció; ellentmondó szöveges feladat) | `source_fidelity@lektor` 50 [mért]; jobok 222202f1, 5e9e2a84, d6f5d4bc, 06f5e6ae, d76548dd | Két külön ok: (a) rubrika-hiba — hiányos és ellentmondásos pontozási szerződés a bank utasításában, nincs típusos válasz; (b) tartalmi számolási/következtetési hiba (pl. 5e9e2a84 hibás `111`), amit típusos mező sem javít — ezt a determinisztikus kifejezés-kiértékelés (C13: a REFERENCIÁRA is), a vak megoldás és a bank-ellenőr fogja | JELENLEGI |
| H2 | Minta ≠ saját rubrika | `sample_score` 47 [mért] | A pontozó TELJES algoritmus-szerződése nincs közölve (az ÉS/VAGY szerkezet és a teljes-pont követelmény igen), és az utasítások ellentmondanak: alternatíva minden szava bárhol, sorrend nélkül; szám csak pontosan; ≥4 betű: 1 toldalék, ≥5 betű: 1 elütés, 8 betű fölött 2 `[kód]`; tagadás globális; a szám is szó. A skill és az eszközleírás ellentétes irányt ad a minWords-re | JELENLEGI |
| H3 | Csomag darabszám/alak | `bank_cardinality` 34, `schema@animator` 37 [mért, átfedő] | „fogalmanként egy nyílt kérdés / egy recall+apply” ↔ a kvóta többet kér; `*Count/*Target` magyarázatlan; a jelenlegi séma minimum+felső korlát `[kód]`; a teljes-termék szerződés (45/75, UI) minden csomaghoz megy | JELENLEGI |
| H4 | Ismétlődő kérdés | `duplicate_question` 28 [mért] | Korábbi kapukérdések nincsenek a promptban; társcsomagok nem látják egymást; hamis duplikátum három, egymástól eltérő kulccsal `[kód]`: `crossProblems` (`normalizeAnswer`: a `+ · : /` elvész, a számhoz tapadó mínusz marad), `experiencePacketSchema` és `gateQuestionProblems` (`[\p{P}\p{Z}]` törlés: a `+` marad, a `· : -` elvész) — `8:2` ≡ `8·2` | JELENLEGI |
| H5 | Szerzői javítókör „title/subject Required” | 21 naplósor | Folt-kérés ↔ újrakérés „teljes leckét”; a válasz nem megy át az egyesítésen `[kód]` | JELENLEGI |
| H6 | Megalapozatlan fogalomcímke a kapun | 15+ job | A megalapozás pontos szabálya nincs kimondva; az `ungrounded` lelet lapított indexű | JELENLEGI |
| H7 | Tanári kérés pontja tanítatlan | Egyiptom 5–7/16–22 pont | Senki nem kapja meg pontlistaként; a kivonatolás nem készít fogalmat a pontokra (upstream); az ellenőrző küszöbei rejtettek | JELENLEGI |
| H8 | Lektor költsége és téves indexe | a lektor-lépés összesített bemenete (látogatásokon át összeadott `visits.tokensIn`, nem egy kérés kontextusa) [mért, `evidence-visits-tokens.txt`]: 767d9813 → 731 366; cb55182c → 829 642; 6e00a1a2 → 764 851 — a három futás bemeneti tokenjeinek ~45%-a | Számozatlan, behúzott JSON (a modell számolja az indexet); minden kör teljes lecke + SVG + bank + térkép; minőségi szerződés 3×; igazolt tételek újrabejárva | JELENLEGI |
| H9 | Lektor altípus/útvonal | korpusz | `coverage_gap` core/supporting nincs a kimenetben; „3.1” útvonal blokk-kulcs; ≤ 32 nincs kimondva | JELENLEGI |
| H10 | Runbook + tanult szabály szerep nélkül | minden hívás `[kód run-step.ts:128]` | a kivonatoló, vak megoldó, lektor is „45/75”-öt és bank-szabályt kap, a hívás VÉGÉN | JELENLEGI |
| H11 | ~100 egyszeri „unknown” lelet | 185 sor | A normalizálás (szám, UUID, idézet) MÁR megvan `[kód learning.ts]`; az `unknown` szándékosan nem lesz szabály; a lenyomatból a szöveg nem állítható vissza. Hiány: az ismeretlen osztály nem jut el emberhez | JELENLEGI (megfigyelés, nem zaj) |
| H12 | Pedagógus ellentmondás | skill 2. ↔ prompt kötelező fejezetei | „egy fogalom egy fejezet” ↔ „Leggyakoribb hibák”/„Ellenőrzés” fejezet ismételt fogalmat kíván | JELENLEGI |
| H13 | Szerző teljesíthetetlen utasítás | `step-io.ts` | „írd a reportba” (nincs mező); „mapId változatlan” (nincs a promptban); vegyes nyelv; hosszkorlát, ív, forrás-hivatkozás tilalma hiányzik a skillből | JELENLEGI |
| H14 | Ábratervező | audit + `[kód]` | bank-eszközök leírása; elavult `section-visuals`; „EGY ábra” ↔ „≤ 2”; „üres lista” ↔ szövegdoboz-pótlás; viewBox 800×520 ↔ 400×260; ≥10 rajzelem, font-size-alapérték, attribútum-allowlist, `url(#id)` kimondatlan; geometry mindig gyenge | JELENLEGI |
| H15 | Vak megoldó | `blind-solver.ts` | nincs skill; séma-túllépésnél az egész lista `[]` és gyorsítótárazva; „NINCS ELÉG ADAT” elvész | JELENLEGI |
| H16 | Dokumentáció ↔ 95%-os szabály | `lesson-improvement.md`, `.agents/skills/tananyag-*` | „körlimitnél / blokkoló lektorhibával nem publikálható” ellentétes a limit-policyval; a két skill 90%-ban azonos | JELENLEGI |
| H17 | Claude-memória elavult | 22 fájl | CI E2E „bukik” (zöld); régi modellmátrix; „csak forrásfogalmat tanít” | JELENLEGI |
| H19 | Ábra a bank ujjlenyomatában | `experience-builder.ts:257` `[kód]` | a teljes fejezet (SVG-vel) a hash-ben és a bank bemenetében → ábracsere = csomag-újraépítés + felesleges token | JELENLEGI |
| H20 | Forrás-hivatkozás törlése a bank UTÁN | `step-runner.ts:975-990` `[kód]` | a tanítás a bank után módosul → következő körben új baseHash; az átíró modell fut, amíg találat marad | JELENLEGI |
| H21 | Kivonatoló csonkolás; quote-javítókör minden fájlt újraküld | élő futás 3; `run-extraction.ts` | 8192-es keret gondolkodó modellel (javítva #156) | RÉSZBEN JAVÍTVA |
| H22 | Kivonatoló/OCR/scope | audit | „[oldal N]” ↔ „[N. oldal]”; mezőhosszak, idegen írás kimondatlan; döntő OCR-olvasás: a skill mindent átjavít ↔ a program csak vitatott helyet enged; `classroom ∈ gradeRange` a skill önellenőrzésében igen, a SCOPE_PROMPT-ban nincs | JELENLEGI |
| H23 | Webes gyűjtő/kivonatoló | audit | ugyanaz a skill a kivonatolásnak, ahol nincs eszköz; PDF nem számít; keret és néma eldobás kimondatlan; `bankPlan` a `HTML_TEACHING_CONTRACT`-ban szerepel, a brief nem adja | JELENLEGI |
| H24 | Bank-ellenőr bemenete | `bank-verifier.ts promptView/buildBankVerifierPrompt` `[kód]` | „a visszajelzést is számold” — nem kapja; fejezetfüggő tényt kér, de a fejezet tanítását és forrás-bizonyítékát nem kapja (csak cím, évfolyam, tételek, vak megoldások) | JELENLEGI |
| H25–H29 | Ügynök-utasítás, RUNBOOK §4, runtime-skill-learning, kanban, BACKLOG | fájlok | kikapcsolt 09-13-as webes lánc, admin-jóváhagyás, elavult állapot | JELENLEGI |
| H30 | DB `system_prompts.tananyag-okosito` | DB | használatlan | tulajdonosi döntés |
| H31 | **Pontozó sorrend- és törtvak** | `2/1 → 1` lefuttatva [mért] `[kód normalizeAnswer/conceptHit]` | „1/2” mintára a „2/1” teljes pont; törtvonal és műveleti jel elvész | JELENLEGI, gyereket érintő |
| H32 | Bank-ellenőr: nyílt tétel ítélet nélkül „igazolt”; `{}` alakilag érvényes; hibás `truths`-hossz tartalmi hibának számít | `bank-verifier.ts:186-194`, `errorsSchema`, `choiceVerdictProblem` `[kód]` | | JELENLEGI |
| H33 | `kid-text-fixer` új tényt vezet be; tilalom ↔ 4. lépés | `support-skills.ts` `[kód]` | | JELENLEGI |
| H34 | Tanári-kérés ellenőrző: üres lista elfogadva; egész leckében keres; cím is bizonyíték; forrás 60 000-re vágva | `instruction-check.ts` `[kód]` | | JELENLEGI |
| H35 | Több helyes párosítás (`match` 1/2, 2/4, 3/6) | job 986b7f82 | az egyválasztós őr nem fedi | JELENLEGI |
| H36 | Elérhetetlen Próba-jutalom | job e880571c; #141/#143 | kód: `lesson-arc.ts` Próba-szabály | JAVÍTVA (NEM IGAZOLT itt) — regresszió őrzi |
| H37 | Ellenőrzési gyorsítótár verziózatlan | `instructionCheckHash` (nincs skillverzió), `bankItemHash` (vak megoldás, cím, évfolyam, fejezet nincs benne) `[kód]` | | JELENLEGI |
| H38 | Runbook-verzióemelés töri a folyamatban lévő futást; régi szabályszöveg nem archivált | `runtime-knowledge.ts` engedélylista `[kód]` | | JELENLEGI |
| H39 | Hatókör-őrök: `checkAnimatorResult` a lecke `title`-t nézi, de a FEJEZETCÍMET, `probaEnabled`, `emoji`, `misconceptions` mezőt nem; célzott javításnál teljes lecke csak WARN | `step-io.ts`, `step-runner.ts` `[kód]` | | JELENLEGI |
| H40 | Megszakadt futás nem folytatódik | jobok 0fb4afeb, e79ab9da, e880571c; run 86f264f5 | | KÜLÖN SPEC; a megtakarítást ide nem számoljuk |
| H41 | Történeti, már javított: UUID a promptban (22b397c4 → `mapJson`), érvénytelen blokk-kind (0e7674bb → `AUTHOR_BLOCK_CATALOG`); sérült PDF (a1707ade), hiányzó térkép (98b1a526), megszűnt parkolás (6df4acbe…) | korpusz | a PDF/térkép/parkolás javítása NEM IGAZOLT itt | regresszió őrzi |
| H42 | **Limit-policy címkehiba:** ha egy blokk MINDEN címkéje megalapozatlan, változatlanul marad, és a 95%-os core-arány mellett a valótlan címke publikálódhat | `limit-policy.ts:79` `[kód]` | | JELENLEGI |
| H43 | Régi-alak tiltás JOBB OLDALI szóhatár nélkül (bal oldali van), globálisan: „föld-változása”→„Hold” után a `fold` a „Föld”/„földrajz” szóra is tilt | `repair-skill.ts staleForms/staleFormProblems` `[kód]` | | JELENLEGI |
| H44 | Duplikátum-kulcsok írásjel-törléssel három helyen: `8:2` ≡ `8·2` | `lesson-experience.ts:111,127`, `experience-builder.ts:245` `[kód]` | | JELENLEGI |
| H45 | Üres lektori jelentés `{}` alakilag érvényes (notes default `[]`, solutions opcionális) | `step-io.ts lektorReportSchema` `[kód]` | | JELENLEGI |
| H46 | Szóbeli/írásbeli csomagonként kötelező, a skill csak „legalább egy”-et mond | `oral_written` 17 [mért]; `lesson-experience.ts:77,89` `[kód]` | | JELENLEGI |
| H47 | Tanári kérés némán 2000 karakterre vágva | `owner-instruction.ts OWNER_INSTRUCTION_MAX` `[kód]` | | JELENLEGI |
| H48 | Bank-ellenőri tényhiba elnyomható/leminősülhet: a `taken` MINDEN útvonalas lektori jegyzetet (figyelmeztetést is) lefoglal; nem blokkoló körben a nem egyválasztós tartalmi hiba `bank_check_late` altípust kap | `bank-verifier.ts:218-224 mergeBankVerifierNotes` `[kód]` | a keret elfogyása nem cáfolja a hibás mintát | JELENLEGI |
| H49 | Lektori `solutions` némán 40-re vágva; a részlegesség nem jelölt | `step-io.ts:93` `[kód]` | | JELENLEGI |
| H51 | Bank-ellenőr újrahívás-összefésülése: az újraellenőrzött útvonal MINDEN korábbi jegyzete törlődik (a tartalmi hiba is), akkor is, ha az újrahívás elbukik | `bank-verifier.ts mergeVerifierRetry` `[kód]` | | JELENLEGI |
| H52 | Utolsó bankkísérlet: csak-aritmetikai jelzés mellett a csomag elfogadott, a lelet figyelmeztetés — bizonyítékalapú lezárás nélkül | `experience-builder.ts buildUnit lastAttempt && arithmeticOnly` `[kód]` | | JELENLEGI |
| H53 | Lektori kalibráló példa téves: „első menet eredménye” kérdésnél a köztes sort (35 + 8 · 8 − 12) `language`-nek minősíti, pedig a kérdésre nem válaszol | `step-io.ts buildLektorPrompt` „Kalibráló példák”; job c3a878a5 `[kód]` | | JELENLEGI |
| H50 | Pedagógusi vázlat mezői (`animationSuggestions` 120, `keyPhrases` 40, `emoji` 8), tanári kérés (2000), lektori `solutions` (40) csendben vágva — a csonkolás sehol nem jelölt állapot | `step-io.ts:44,49`, `owner-instruction.ts` `[kód]` | | JELENLEGI (H47 általánosítása) |

### A3. Szakmai minták — csak ami mért hibát javít
| Minta | Forrás | Javított hiba | Döntés |
|---|---|---|---|
| Szigorú JSON-séma a szolgáltatónál (`json_schema`, `strict`, `minItems/maxItems`, `enum`) | OpenAI Structured Outputs; élő próba 2026-09-30 [mért]: `gpt-6-luna`, `gpt-5.6-terra` közvetlen OpenAI-úton a „3-at kérek” promptra a séma PONTOSAN 7 elemét adta | H3 | ÁTVÉVE ott, ahol élő próbával igazolt (bank luna/terra közvetlen); a bemutatott próba csak a darabszám/alak kikényszerítését igazolja — a tényleges bank- és javítóséma szolgáltatói elfogadása és a tartalék ág még igazolandó (U2 első feladata). A próba kimenete mindkét modellnél 3 kérdést ismételt 7 elemre: **a darabszám teljesülése nem jelent jó csomagot** — regressziós példa, a helyi duplikátum/tartalmi/pontozási ellenőrzés marad. Minden más út (OpenRouter, xAI, Anthropic): mérendő, addig JSON-mód + helyi validálás. |
| Zod-sémából származtatott szigorú séma + kifejezett „bail/gaps” | Oak Aila `LLMQuizComposer.ts` (`zodResponseFormat`, `status: "bail"`) | H3, H13 | ÁTVÉVE; a `.refine/.transform` NEM fordítható át — az helyi validáció marad. A `gaps` jelzés, nem felmentés. |
| Referenciához horgonyzott, típusos válasz; determinisztikus ellenőrzés csak formalizálható feladatra | ASAG-irodalom (LLM-Grading), DoerKit kritériumonkénti bool | H1, H2, H31 | ÁTVÉVE: típusos válasz (C13). A v2 két heurisztikája („minden csoport-szám a mintában”, „részhalmaz-alternatíva tilos”) **ELVETVE** — helyes rubrikát is bukott volna (2/4/6/8; „Nílus”/„Nílus folyó”). |
| Kritériumonkénti igaz/hamis ítélet | Cross-CoVe, DoerKit | H1 | már így működik (bank-ellenőr `truths`); teljesség-követés kell (H32). |
| Prompt-gyorsítótár | OpenAI Prompt Caching; Anthropic `cache_control` | H8, H19 | ÁTVÉVE (C10); találati arány és írási költség mérendő. |

### A4. Modell–útvonal–feladat profilok
Hivatalos adatok: OpenRouter `/api/v1/models` (2026-09-30 lekérve: kontextus, max. kimenet, ár, `supported_parameters`);
közvetlen OpenAI `/v1/models` a program kulcsával. Az árak/paraméterek a szolgáltató közlései; a viselkedést útvonalanként
élő próba dönti el.

| Modell (út) | Szerep | Kontextus / max. kimenet | Ár be/ki (cache-olvasás) USD/M | Mért hiba nálunk | Kezelés |
|---|---|---|---|---|---|
| gpt-6-luna (OpenAI közvetlen) | szerző, bank | 1,05 M / 128 k | 0,10 / 0,50 (0,01) | bank: rubrika/darabszám → ~14× terra-tartalék leckénként; szerző: 1× érvénytelen JSON; OCR-en átfogalmaz | szigorú séma igazolt (C8); pontozó-szabály; verbatim feladatra nem |
| gpt-5.6-terra (OpenAI közvetlen) | kivonatoló (elsődleges); bank/ábra tartalék és mentő | 1,05 M / 128 k | 2,00 / 12,00 (0,20) | gondolkodás a kimeneti keretből → csonka kivonat (#156); vak megoldóként 6/900 hamis matek-riasztás | keret = kimenet + gondolkodás; `length` → egyszer nagyobb keret plafonnal (C11) |
| claude-opus-5 (Anthropic) | pedagógus | 1 M / 128 k | 5,00 / 25,00 (0,50) | szolgáltatói hiba → tartalék | `cache_control` a stabil prefixen (C10) |
| claude-opus-5-5 (Anthropic) | ábratervező, vak megoldó, bank-ellenőr, tanári-kérés ellenőrző, szövegjavító | 1 M / 128 k | 4,00 / 20,00 (0,20) | ábratervezőként 3× `length` (24 k, high) | C11; fejezetenkénti közös prefix cache alá |
| grok-4.6 (xAI Responses) | lektor | 500 k / 450 k | 2,00 / 6,00 (0,50) | 480 s időtúllépés; üres válasz hosszú bemenetnél; horgonyzás; index-elszámolás | kisebb, számozott bemenet (C5); szigorú séma: mérendő, nem ígért |
| claude-sonnet-5 (OpenRouter) | lektor-tartalék | 1 M / 128 k | 2,00 / 10,00 (0,20) | 32 k-nál csonka jelentés | C5 csökkenti a bemenetet; a kimenetet külön korlátozni és mérni |
| qwen3-vl-32b (OpenRouter) | OCR | 131 k / 32 k | 0,10 / 0,42 | 95,4% kézírás-recall [mért] | változatlan; prózai kimenet, séma nem releváns |
| glm-5.3-flash (OpenRouter) | OCR 2. olvasó, témafókusz | 1 M / 944 k | 0,15 / 0,50 (0,03) | ~1/8 törött JSON (U+201D); „nem résztéma” 4/8 | szigorú séma a témafókuszra: mérendő |
| deepseek-v4-flash (OpenRouter) | kapu-segéd, kvíz-csiszolás, fókusz-tartalék | 1 M / 384 k | 0,08 / 0,16 (0,016) | `effort=low` figyelmen kívül → keret elfogy; 60 s alatt 1/5 | csak apró osztályozás |

Ársávok (katalógusadat, `evidence-models-raw.json` `pricing.overrides`): hosszú bemenetnél felár — Luna 272 k token fölött 0,20 / 0,75 (cache 0,02); Terra 272 k fölött 4,00 / 18,00 (0,40); Grok 200 k fölött 4,00 / 12,00 (1,00); a cache-ÍRÁS külön költség. A küszöb hívásonként értendő, nem a lépés összegére. A táblázat alapárai és kapacitásai az OpenRouter-katalógus szerint igazoltak; a közvetlen OpenAI/Anthropic/xAI út díjazása és képességei onnan NEM igazoltak (saját mérés kell). Az OCR 95,4%, a 6/900 hamis riasztás és a ~14 tartalékhívás a korábbi munkamenetek mérései (memória/`models.ts` kommentek), e csomagból NEM igazoltak.

Következtetések: a `length` csak a keret elérését bizonyítja (nem azt, hogy nagyobb kerettel helyes lesz) → egyszeri
újrapróba plafonnal és közös számlálóval; a gondolkodó modellnél a keret = kimenet + gondolkodás; cache csak mérve.

---

## B. AZ UTASÍTÁS-ANYAGOK — megírás és lektorálás a program előtt, élesítés a társ-kóddal, verziózott csomagban

Elv: **egy szabály egy helyen.** Skill = viselkedés (a teszt-korlátokon belül). Szerepszelet-szerződés = a program
mérőszabályai, a kód konstansaiból generálva. Runbook/lélek = közös identitás, szerepre szűrve. Egynyelvű, ellentmondásmentes.

**B0 — Verziózott utasításcsomag (előfeltétel).**
- Összetevők jegyzéke: szerep-skillek (7), eszközleírások (5), lélek, támogató skillek (14+2 új), `REPAIR_SKILL`, runbook
  (soul/iam/recovery/chain), `SKILL_RULES` szövegei, szerződések (`TEACHING_CONTRACT`, `BANK_PACKET_CONTRACT`,
  `OPEN_ANSWER_RULES_HU`, `VISUAL_PARAMS_CONTRACT`, owner-blokk), kimeneti sémák, ellenőrző-verziók (`LEKTOR_REVIEW_VERSION`,
  `VERDICT_VERSION`, `INSTRUCTION_CHECK_VERSION`).
- `INSTRUCTION_BUNDLE_VERSION` **származási azonosító** (a futás pillanatképében), NEM újragenerálási kulcs.
- Három külön kulcs: **tartalom-kulcs** (mi épült miből: forrás + tanítás + csomag-bemenet ábra nélkül) — ez dönt az
  újrahasznosításról; **ellenőrzés-kulcs** (skill/szabály/ellenőrző-verzió + vak megoldások + kontextus) — ez dönt arról,
  hogy egy korábbi ítélet érvényes-e; **utasítás-verzió** — csak naplózás/audit.
- Régi szövegek archívuma: `instruction-bundles/<verzió>.ts`; **verziófeloldás minden összetevőre**, nem csak a
  szerep-skillre: `roleSkillBlock(role, v)`, `withSupportSkill(key, v)`, `repairSkill(v)`, `runtimePrompt(.., v)`,
  `skillRuleText(.., v)`, `contracts(v)`; a DB-s `system_prompts` felülírás a `skilledPromptLookup`-on át ugyanígy
  verziózott skillt kap. A futás pillanatképe a verziót az induláskor rögzíti; a mostani engedélylista-törés (H38) megszűnik.
- **Pontozás- és adatformátum-verzió** (`LESSON_SCORING_VERSION`) a leckében: a kliens a saját támogatott verziójánál
  újabbat NEM pontoz némán — frissítést kér (a `tolerantLessonInput` megjelenít, a pontozó elutasít és üzen). Régi
  lecke (mező nélkül) a régi úton pontozódik; a régi és az új normalizáló külön függvény, a lecke verziója választ.
- **Újrahasznosítási tábla** (mikor él egy régi eredmény): bankcsomag → tartalom-kulcs egyezik ÉS a csomag a
  pontozás-verzióval kompatibilis (típusos mező hiánya = régi csomag → csak régi verziójú leckébe); lektori ítélet /
  bank-ellenőri igazolás → ellenőrzés-kulcs egyezik; ábra → ábra-kulcs; kivonat → forrás+prompt-kulcs (változatlan).

**B1 — Szerep-skillek egyenként.**
- `bank`: pontozó-szabály hivatkozás (generált szerződés); rubrika: a végeredmény külön csoport; **zárt matematikai
  feladatnál típusos `answer`** (C13); hibás érték soha; a csoport a kérdés kérdezett tartalmát méri; **több különböző
  elemet kérő feladatnál `requiredDistinct: [{category, from: [[szinonimák]], count}]`** — kategóriánként külön kvóta
  (2 fás + 2 lágy szárú), a szinonimák EGY elemnek számítanak (C13); minWords: a legrövidebb teljes helyes válasz
  szószáma (nem a minta hosszából; a program a `sample`-t és a `requiredDistinct` elemszámát is ellenőrzi ellene); balról-jobbra és részösszeg-ellenőrzés; pontosan egy
  igaz opció (mindet kiszámolni); `match` egy bal → egy jobb; csomagonként legalább egy `oral` és egy `written` (H46);
  darabszám = target; javítómód: csak a hibakódban engedélyezett tétel/követelmény cserélhető.
- `author`: magyar; módonként egy kimeneti alak; megalapozás pontos szabálya; hosszkorlátok; ív; a tanári PONTJEGYZÉK
  forrásból igazolt pontjai kimondva explain/example/recap szövegben (a nem igazolható pont NEM tanítandó — `gaps`-ben jelezve); forrás-hivatkozás tilalma; `gaps` (jelzés).
- `pedagogue` (+ lélek): „Gyakori hibák / Ellenőrzés” kivétel; a pontjegyzék pontjai fejezethez rendelve.
- `lektor`: a téves „első menet” kalibráló példa törölve; helyette: „ha a kérdés köztes műveleti állapotot kér, az értékazonos, de más állapotú opció HIBÁS válasz” (H53, regresszió a c3a878a5 esetre); `coverage_gap` core/supporting; blockPath a kiírt útvonalból (≤ 32); solutions korlátok; a gap két szabálya
  egyesítve; megcáfolt/javított kifogást nem nyit újra, ÚJ bizonyított tényhibát jelenthet; a jelentés mindig
  `solutions` + `notes` kulccsal (üres jelentés csak kimondva: `reviewedAll: true`).
- `animator`: csak saját eszköz; ≤ 2 ábra; példás fejezetbe ábra; viewBox 800×520; ≥ 10 rajzelem; font-size; allowlist;
  `url(#id)`; caption-szabály; fajták listája.
- `extract`, `ocr`: „[N. oldal]”; mezőhosszak; tömörség; idegen írás; döntő olvasás csak a vitatott helyen.

**B2 — Támogató skillek.** `instruction-checker` (a pontjegyzék azonosítói ellen, fejezetben keres, cím nem bizonyíték,
csonka forrás/kérés jelzése, négy állapot, a forrásidézet **igazolja-e az állítást**: igen/nem + indok); `bank-verifier`
(tételenként ítélet; a visszajelzést nem látja; hibás `truths`-hossz = ellenőrző-hiba, nem tételhiba); új `blind-solver`;
`scope`; `web-research` gyűjtés és `web-extract` külön; `kid-text-fixer` jelentésmegőrző (H33); `REPAIR_SKILL` „régi alak
sehol” helyett: „a helyesbített ÁLLÍTÁS sehol ne maradjon; a régi szó önmagában (más értelemben) megengedett” (H43).

**B3 — Eszközleírások** a mai működés szerint. **B4 — Szerződések** (`TEACHING_CONTRACT`, `BANK_PACKET_CONTRACT`,
`OPEN_ANSWER_RULES_HU`, `VISUAL_PARAMS_CONTRACT` 800×520, owner-blokk pontjegyzékkel). **B5 — Runbook/lélek/szabályok**
szerepre szűrve, B0 szerint. **B6 — Dokumentáció, ügynök-utasítások**, **B7 — Memória**: a működés véglegesítése után.
**B8 — DB:** az „unknown” marad; ismeretlen hibaosztály szövege a futás naplójába; `tananyag-okosito` tulajdonosi döntés.

## C. PROGRAM — atomi működési egységek (a PR-méret nem bonthatja szét)

| Egység | Tartalom | Zárja |
|---|---|---|
| **U0 Csomag és szerepszűrés** | B0; C1: `runtimePrompt(snapshot, mode, role)`, `skillRuleText(.., role)`, `roleSkillBlock(role, version)`, archívum; `callStepModel` a lépésből képzi a szerepet; kompatibilitási teszt: régi pillanatkép régi szöveget kap | H10, H38 |
| **U1 Pontozó és válaszmodell** | C13 teljes adatúttal: `openTaskSchema` opcionális `answers: [{part, kind: number/fraction/expression, value, unit?, form?: 'simplified-fraction'|'decimal'|'intermediate-step'|'any'}]` (részfeladatonként; `intermediate-step`: a kért KÖZTES műveleti állapot — pl. „az első menet eredménye” — csak a megadott alakkal teljesül, az értékazonos más alak nem; H53); a sorrend/részfeladat kötött — a négy művelet felcserélt eredménye hibás) és `requiredDistinct` (kategóriakvóta); közös pontozó (`shared/lesson-experience-score.ts`, a kliens is) érték-összevetéssel (tört egyszerűsítve, előjel, tizedes, mértékegység ha kért) ÉS formai követelménnyel (`form`: „egyszerűsített tört” kérésnél a `0,5` nem elég); **elsőbbség:** ha `answers` van, az dönt a számról, a `required` csak a szöveges részt méri; a `+ · : /` jel megmarad a normalizálásban; szöveges válasz tagadása: a jelenlegi globális heurisztika MARAD — ismert, dokumentált maradó hiba, H1/H2 nem tekinthető ettől lezártnak; `LESSON_SCORING_VERSION` (B0) — régi lecke a régi úton; a típusos referencia igazságát a megengedett kifejezésnyelv determinisztikus kiértékelése (a `arithmetic-claims` bővítése: a referencia `value`-ja a `q`-ban álló kifejezésből újraszámolva) + a vak megoldás + a bank-ellenőr méri; pozitív ÉS negatív példák | H31, H2 (részben), H35 alapja |
| **U2 Bank** | C2 (kulcs műveleti jellel — EGY közös `questionKey()` mindhárom helyen, H44; korábbi kapukérdések a promptban; csomag-hash és bemenet ábra nélkül H19); C8 (külön szigorú séma TELJES és JAVÍTÓ listára; Zod-ból; csak luna/terra közvetlen úton; tartalék út: JSON-mód + validálás); C9 = típusos ellenőrzés (C13) + hibakódhoz kötött javítási jogosultság (heurisztika nincs); `match` egyértelműség a bankban ÉS a szerzői `try.match` blokkban (a bank-ellenőr a `try` blokkokat is megkapja, H35); `oral/written` csomagonként előre kimondva; B1 bank, B3, B4; **együtt aktiválva:** a bank-ellenőr és a lektor utasításának az új válaszszerződést értő része (B2 részlet) | H1, H3, H4, H19, H35, H46 |
| **U3 Tanári pontjegyzék** | C14: EGYSZER, a tervezés előtt, stabil azonosítós pontjegyzék a TELJES eredeti kérésből (a kérés teljes szövege tárolva; a modellhívás kerete a kérés hosszához igazodik; ha a keretbe így sem fér: `truncated: true` és a feldolgozatlan rész külön `unprocessed` állapotú pont — H47/H50); teljesség: második, független kivonatolás — az unió JELÖLTLISTA; minden végleges pontnak visszakötése van az eredeti kérés betűhű részletéhez (`requestSpan`), a visszakötés nélküli, ismétlődő vagy a kérés által kizárt jelölt kiesik, az azonos kérésrészlethez tartozó jelöltek egy pontot alkotnak, `ambiguous` csak a két kivonat betűhű idézettel ellentétes forrás-ítélete (`supports` yes és no) — **spec-módosítás 2026-10-01**, tulajdonosi jóváhagyással; előtte: „az egymásnak ellentmondó értelmezés `ambiguous`”, amit a program csak szöveg-heurisztikával közelíthetett (élő mérés ba8e35bb: 14/27 hamis többértelmű); „a forrás alátámasztja” és „a tanár kérte” két külön ellenőrzés; feldolgozottsági állapot (`processed/unprocessed`) és tartalmi állapot külön mező; pontonként forrás-idézet + „igazolja-e az állítást” ítélet indokkal; fogalom-hozzárendelés; **négy állapot:** `taught` (fejezetre szűkített betűhű bizonyíték, a cím kizárva), `source_available_missing` (idézet van, tanítás nincs → javítás), `not_in_source` (nincs igazoló idézet → `gaps`, nem tanítandó), `undecidable` (csonka forrás/kérés, ellenőrző-hiba → ok megnevezve); a pedagógus csak a `taught`/`source_available_missing` pontokat rendeli fejezethez; **együtt aktiválva** a pedagógus és a szerző pontjegyzéket használó utasításával; B2 checker, B4 owner-blokk | H7, H34, H47, H50 |
| **U4 Szerző/pedagógus** | C3 (forrás-hivatkozás törlése a bank ELŐTT, jelentésmegőrző B2-vel); C4 (módhelyes újrakérés + egyesítés; teljes lecke célzott módban = hiba); `ungrounded.sectionIdx`; C12 `gaps` (séma+parser+tárolás+panel); H39 hatókör-őrök: `checkAnimatorResult`/`checkConceptFixResult` a fejezetcímet, `probaEnabled`, `emoji`, `misconceptions`, `experience` mezőket is összeveti; **H50 pedagógusi ág**: az `outlineSectionSchema` csonkolása helyett az eredeti érték megőrzése (`raw`), a módosítás jelzése (`clamped: [mező]`) a job `qualityNotes`-ban, és a modellnek a korlát kimondása a promptban (nem új modellhívás); B1 author/pedagogue, B4 | H5, H6, H12, H13, H20, H39 |
| **U5 Lektor és ellenőrzők** | C5 (kiírt útvonalas, tömör bemenet; az `illustration` SVG-jéből kinyert ellenőrizhető adat: feliratok, számok, elemszám, a caption — és a strukturált fajták teljes params-a; a lektor a felirat-tény egyezést méri, a térbeli helyességet az ábra-kapu); C6 (vak megoldó: elemenkénti séma-hiba → az elem kimarad, a lista állapota részleges; „NINCS ELÉG ADAT” megőrizve); H32 (tételenkénti ítélet, `{}` érvénytelen, `truths`-hossz = ellenőrző-hiba, a kért és visszaadott ítéletek számának egyezését a program méri — a `reviewedAll` önbevallás nem elég); **H48** (döntési szabály, Astra 5. kör szerint): azonos útvonalú lektori és bank-ellenőri leletek közül CSAK AZONOS KIFOGÁSOK vonhatók össze (kifogás-kulcs: útvonal + érintett mező + állítás-lenyomat); minden eltérő tartalmi kifogás bizonyítéka és lezárási kötelezettsége megmarad, a másik jegyzet súlyosságától függetlenül; egyetlen megjelenített jegyzet elég, ha az összes különálló kifogást és bizonyítékot tartalmazza; lezárás csak ellenőrzött javítással, indokolt cáfolattal vagy az elem kivételével (mint H51); nem blokkoló körben sincs `bank_check_late` leminősítés; `cleared` nem lehet érvényes olyan tartalomváltozatra, amelyhez nyitott lelet tartozik; a leletek stabil tétel-azonosítóhoz + tartalomváltozathoz kötve (nem tömbindexhez); regresszió: ugyanazon tételen két külön hiba — az egyik javítása után a másik nyitott marad az egyesített listában ÉS a `cleared` állapotban is; **H24**: a bank-ellenőr megkapja a fejezet explain/example szövegét és a tételek fogalmainak quote-ját (ez az ellenőrzés-kulcs része); H37 (ellenőrzés-kulcs a B0 szerint); **H51**: az újrahívás összefésülése csak az ítélethiányt cseréli, a korábbi tartalmi jegyzet marad, amíg ellenőrzött javítás, indokolt cáfolat vagy az elem kivétele le nem zárja; elbukott újrahívás = a tétel `undecidable`; **H52**: az utolsó kísérlet csak-aritmetikai jelzése nyitott lelet marad (kivehető tételként a limit-táblában), nem néma figyelmeztetés; a teljesség ítélet-AZONOSÍTÓ egyezéssel mérve, nem darabszámmal; **H49**: a `solutions` levágása helyett `solutionsTruncated: true` + a vágott elemek száma a jelentésben, a kapu ezt részleges lektorálásként kezeli; C18 lektori `{}` érvénytelen (H45); **ábra-szerződés**: a lektor az SVG-ből kinyert feliratokat/számokat méri a tényekhez; a térbeli/kapcsolati helyességet az ábratervező második, független Opus-hívása ítéli (rendereltábra-ellenőrzés: PNG + „mit mutat?” kérdés a fejezet tanítása ellen) — ez az ábra-kapu szerződése; B1 lektor, B2 | H8, H9, H15, H24, H32, H37, H45, H48, H49 |
| **U6 Limit-policy, javítószabály, keret, költség** | C15: H42 — a teljesen megalapozatlan blokk címkéit is levesszük; címke nélkül maradó nem-recap blokk: célzott javítás vagy kivétel, utána ÚJRAMÉRÉS (fedettség, 45/75, oral/written, Próba, hivatkozás) — a limit döntési tábla lent (§C-L); C16 (H43): a szóegyüttállás (régi alak + a fogalom kulcsszava egy mondatban) CSAK JELÖLTET képez, nem blokkol; a jelölt mondatokat a javító-lektor kapja „a régi állítást állítja-e?” kérdéssel (igen/nem/bizonytalan + indok); csak az „igen” blokkoló, a „bizonytalan” figyelmeztetés a jobban — a puszta szóelőfordulás soha nem hiba; a B2 REPAIR_SKILL szövege ugyanezt az elvet mondja ki; C11 (`length` → egyszer nagyobb keret, modellenkénti plafon, közös próbálkozás-számláló szolgáltatói/séma/tartalom/tartalék körökön át); C10 (prompt-sorrend, `cache_control`, `cached_tokens` napló); C7 (quote-javítás csak a saját fájllal) | H21, H42, H43 + költség |

Sorrend: U0 → U1 → U2 → U3 → U4 → U5 → U6 → B6–B8. Egy egység egy vagy több PR, de egy PR nem vág ketté működési
függőséget. Minden egység után: teljes unit, tsc (fő+teszt), eslint, CI, és az egység saját regressziós példái.

### C-L. Limit döntési tábla (a körlimiten / elfogyott kereten)
| Lelet | Döntés | Utána újramérendő |
|---|---|---|
| Banktétel tényhiba (lektor VAGY bank-ellenőr, útvonallal) | tétel kivétele | 45/75 minimum; csomagonként fogalom-fedés, ≥1 recall+apply, oral+written; 10 módszertípus; ≥2 különböző kapukérdés; 15/25 kör |
| Egyválasztós tétel ítélet nélkül | tétel kivétele | ugyanaz |
| Check blokk hibás | blokk kivétele | ív (example a check előtt, ≤75% drill); Próba ≥5 check, különben `probaEnabled:false` |
| Ábra hibás | ábra kivétele/cseréje determinisztikus pótlásra | minden fejezetnek van szemléltetése (különben figyelmeztetés a jobban) |
| Tanítási címke megalapozatlan (részben) | címke le | core 100% / supporting ≥90% (limiten core ≥95%, supporting ≥80%) |
| Tanítási címke megalapozatlan (a blokk MINDEN címkéje, H42) | címkék le; címke nélküli nem-recap blokk → egy célzott javítás, különben a blokk kivétele | fedettség újramérve a kivétel UTÁN; ív |
| Tanítási tényhiba — ELDÖNTÖTT (contradicts_source forrás-idézettel vagy determinisztikus újraszámolással igazolva) | 1 célzott szerzői kör, utána bukás | teljes lektor újra |
| Vak megoldás eltér a leckétől, de nincs eldöntve (a vak megoldó is tévedhet) | determinisztikus újraszámolás, ha formalizálható; különben `undecidable` → figyelmeztetés a jobban, nem bukás és nem publikálási igazolás | — |
| `coverage_gap` tanításra, nem kivehető elemre | figyelmeztetés (`quality`), publikálható | — |
| Ismeretlen fogalomazonosító | bukás | — |
| Forrás-hivatkozás a gyerekszövegben | gépi törlés + átírás a bank ELŐTT | a tartalom-kulcs a már átírt tanításból képződik, ezért a bank egyszer épül (a szövegváltozás hash-hatását nem szünteti meg, a felesleges újraépítést előzi meg) |
| Tanári pont `source_available_missing` | 1 célzott kör (dinamikus keret), utána `quality` bejegyzés | — |
| Utolsó bankkísérlet csak-aritmetikai jelzéssel (H52) | a jelzett tétel kivétele vagy determinisztikus újraszámolással cáfolat | 45/75 és csomag-követelmények |

**Közös kapu minden sor fölött:** a kivétel/javítás utáni ÚJ jelöltre teljes érvényes ellenőrzési állapot kell; a `coverage_gap → quality` sor nem kerüli meg a core/supporting minimumot; a 95% fedettségi küszöb, nem tényhiba-arány.

### C-A. Aktiválási térkép (melyik B-szöveg melyik egységgel él)
| B-szöveg | Egység |
|---|---|
| B0 csomag, B5 runbook/lélek/szabályok | U0 |
| B4 `OPEN_ANSWER_RULES_HU` | U1 |
| B1 bank, B3 eszközök, B4 `BANK_PACKET_CONTRACT`, B2 bank-verifier és lektor válaszszerződés-része | U2 |
| B2 instruction-checker, B4 owner-blokk, B1 pedagogue pontjegyzék-része, B1 author pontjegyzék-része | U3 |
| B1 author (többi), B1 pedagogue (többi), B2 kid-text-fixer, B4 `TEACHING_CONTRACT` | U4 |
| B1 lektor, B2 blind-solver, bank-verifier (többi) | U5 |
| B2 REPAIR_SKILL szűkítés, B1 animator, B1 extract/ocr, B2 scope, web-research/web-extract, B4 `VISUAL_PARAMS_CONTRACT` | U6 |
| B6 doksi, B7 memória, B8 DB | U6 után |

### C-V. A végrehajtási fájlban kötelezően rögzítendő feltételek (Astra 4. kör)
1. Régi kliens: a `LESSON_SCORING_VERSION`-t a kiszolgálás is érvényesíti (a lecke-API a kliens által küldött támogatott verzióhoz méri; újabb lecke → 409 + frissítés-üzenet), nem csak a kliens kódja.
2. DB-s prompt pillanatképe: a `skilledPromptLookup` a futás indulásakor feloldott teljes promptot (DB-törzs + skill) a pillanatképbe menti; teszt a teljes feloldott prompt változatlanságára.
3. U0 szerepszűrés hívásonkénti tényleges szerep szerint (`role` paraméter a `callStepModel`-ben: a bankhívás `bank`, az ábra `animator`, akkor is, ha az `animator` lépésen belül fut).
4. `gaps` tárolása és jelzése U3-ban készül el (előrehozva U4-ből), különben U3 nem aktiválható.
5. A rendereltábra-ellenőrző saját skill és ellenőrzés-verzió (U5), nem a tervezői skill.
6. Teljesség mindenhol azonosító-egyezéssel; részleges jelentés soha nem teljes igazolás.
7. Regressziók: helyes helyesbítő mondat (Föld/Hold), sikertelen ellenőrző-újrahívás, tanár által kizárt többletpont, értékazonos de nem kért köztes alak, ábra-sorszámra hivatkozó banktétel, ugyanazon tételen két külön hiba (H48).
8. Elsőbbség: a hívásonkénti tényleges szerep (3.) felülírja az U0 „lépésből képzett szerep” rövidítését; a `gaps` tárolás U3 előfeltétele; H53 korrekciója az U2 lektori válaszszerződés-részébe tartozik; a képi ellenőrző saját utasítása és verziója U5 része.
9. H43: a szóegyüttállásból származó bizonytalan jelölt csak figyelmeztetés; de ha egy KORÁBBAN BIZONYÍTOTT téves állítás javításának ellenőrzése bizonytalan, az eredeti lelet nyitva marad (H51 elve).
10. Pontozási szerződés értelmezési szabályai a végrehajtási fájlban: megengedett kifejezésnyelv (egész, tizedes, közönséges tört, `+ − · : ( )`, egység), törtkezelés (normalizált alak összevetése, `form` külön), részfeladat-hozzárendelés `part` szerint, mértékegység-átváltás nélkül (a kért egységben); `intermediate-step` = a kifejezés műveleti állapotának egyezése (szóköz és azonos jelentésű jel — `·`/`*`/`×`, `:`/`/` — nem különbség); nem értelmezhető kifejezés → `undecidable`, nem „ellenőrzött”; `requiredDistinct`: kategórián belül a szinonimacsoport egy elem.
11. Régi kliens: verziómezőt nem küldő kliens = a legrégebbi támogatott verzió (nem az új pontozó támogatója); archivált szöveg nélküli régi futás: a pillanatképben tárolt teljes prompt hiányában NEM folytatható új utasítással — lezárás vagy explicit migráció (nem rekonstrukció verzióazonosítóból).
12. Ábrafüggetlenség: az „ábra-sorszám / az ábrán látható” szűrés csak szükséges feltétel; a bank promptja ábra nélkül épül, ezért a tétel csak a tanítás szövegére hivatkozhat — a parafrázisos ábra-utalás a bank-ellenőr külön kérdése; a képi ellenőrző felismerési arányát mérni kell (nem feltételezzük).
13. B6–B8 a TÉNYLEGES működést dokumentálja az egységek élesítése után, nem a tervezett képességet.

## D. Mérés és elfogadás
- Regressziós példa minden H-tételhez a korpuszból (pontozónál helyes ÉS hibás válasz). Skill-kulcsmondat-tesztek csak e
  spec alapján frissülnek; a tesztben rögzített korlátok (szerep-skill eszközleírással < 5200, lélek < 1800; a lektor
  külön korlátja a `role-skills-everywhere` tesztből olvasandó) maradnak. Új szabály = új teszt.
- Visszajátszható mérőkészlet (mentett checkpointok): matek (oszthatóság, műveleti sorrend), történelem (Egyiptom,
  Mezopotámia), nyelvi, OCR-es; régi futás folytatása új kiadás után; szolgáltatói hiba, `length`, hiányos ellenőrző-válasz,
  sérült bemenet, több helyes párosítás, elérhetetlen Próba.
- Mérőszámok: teljes költség / használható lecke; bukott próbák költsége; elsőre elfogadott csomagok aránya; újragenerált
  tételek; cache-olvasás/-írás; késleltetés; végső hibaarány; a limit döntési tábla szerint kivett/leminősített elemek listája.
  A H40-ből származó megtakarítás nem számít bele. Több ismételt futás, összevetés a 767d9813 futással.

## E. Nem-cél
Kapu/küszöb/teszt gyengítése; modellcsere; a 45/75 és a fedettségi minimum változtatása; régi leckék tömeges átírása; éles
adat törlése; megszakadt futás folytatása (H40 — külön spec).

## F. Elfogadás (EARS)
- HA a feladat zárt eredményt kér, AKKOR a „2/1” nem kap pontot „1/2”-re; az értékazonos alak (0,5) csak akkor, ha a
  feladat nem ír elő alakot; részfeladatok eredménye nem cserélhető fel; kategóriakvótás feladatnál egy elem vagy egy
  kategória két szinonimája nem ér teljes pontot.
- HA a lecke pontozás-verziója újabb a kliensnél, AKKOR a kliens frissítést kér és nem pontoz némán.
- HA bármely szerep hívást kap, AKKOR csak a saját szerepe szabályait kapja, a futás csomagverziójával; régi pillanatkép
  régi szöveget kap.
- HA a bank csomagot kér, AKKOR a prompt a generált pontozó-szabályt, pontos darabszámot, korábbi kérdéseket és
  kapukérdéseket tartalmazza; az ábra változása nem változtatja a csomag-hash-t, HA a csomag nem hivatkozik az ábrára (előfeltétel: a bank promptja ábra nélkül épül, és a `validate` elutasítja az ábra-sorszámra/„az ábrán látható” fordulatra hivatkozó tételt); a `8:2` és `8·2` különböző.
- HA a bank-ellenőr vagy a lektor válaszol, AKKOR minden tétel/jelentés kimondott ítélettel zárul; üres válasz érvénytelen;
  a bank-ellenőr bizonyított tényhibáját lektori figyelmeztetés vagy körlimit nem nyomja el; a levágott `solutions` jelölt.
- HA tanári kérés van, AKKOR a pontjegyzék a teljes kérésből készül (csonkolás jelezve, feldolgozatlan rész külön
  állapot), és minden pont a négy állapot egyikében zárul; csak az igazolt pont tanítása kötelező.
- HA a limiten minden címke megalapozatlan egy blokkon, AKKOR a címkék lekerülnek, és a §C-L teljes újramérése (fedettség,
  45/75, csomag-követelmények, módszerek, kapukérdés, kör, ív, Próba) után dől el a publikálás.
- HA a célzott szerzői javítás sémahibás, AKKOR folt-alakú újrakérés és egyesítés; teljes lecke célzott módban hiba.
- A publikálás nem javulhat hibás válaszok elfogadásával, ellenőrzés csendes kihagyásával vagy hiányok elrejtésével.
