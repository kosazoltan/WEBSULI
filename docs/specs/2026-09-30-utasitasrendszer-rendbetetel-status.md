# Státusz-nyilvántartás — utasításrendszer rendbetétele (a végrehajtási fájl §0 szerint, karbantartandó)

Állapotok: `nyitott` · `részleges` · `lezárt (PR, teszt)` · `ismert maradó` · `külön spec` · `történeti (regresszió őrzi)`.
Csak futtatott teszt/PR hivatkozással állítható „lezárt”.

| # | Rövid név | Egység | Állapot | Bizonyíték |
|---|---|---|---|---|
| H1 | Banktétel tényhiba (rubrika + számolás) | U1, U2, U5 | részleges (U1: típusos referencia újraszámolva; U2c: `BANKCSOMAG-SZERZŐDÉS` + `OPEN_ANSWER_RULES_HU` a bank rendszerutasításában, bank skill B1 újraírva, bank-ellenőr a `typedAnswers`-t méri; a lektor/bank-ellenőr bemeneti része U5) | `bank-repair.test.ts` |
| H2 | Minta ≠ rubrika; pontozó-szerződés hiányos | U1, U2 | részleges (U1: `OPEN_ANSWER_RULES_HU` a kód konstansaiból; U2c: a szerződés a bank promptban, a skill a minWords/sample szabályt mondja; a tagadás-heurisztika ismert maradó) | `bank-repair.test.ts` |
| H3 | Csomag darabszám/alak | U2 | lezárt a U2 hatókörében (U2b: szigorú `json_schema` a közvetlen OpenAI-úton; U2c: a szerződés PONTOSAN target darabszámot mond, csomagszintű hiba → teljes újraírás, tételhiba → hibakódhoz kötött javítási jogosultság `bank-repair.ts`; a tartalék úton JSON-mód + helyi validálás) | `bank-schema.test.ts`, `bank-repair.test.ts` |
| H4 | Ismétlődő kérdés, három kulcs | U2 | lezárt (U2a: közös `questionKey`; U2c: a csomagon belüli ismétlődés a MÁSODIK tételt nevezi meg → célzott csere, a korábbi csomagok kérdései és kapukérdései a promptban) | `bank-hardening.test.ts`, `bank-repair.test.ts` |
| H5 | Szerzői javítókör „title/subject Required” | U4 | lezárt (C4: célzott módban a teljes lecke módhiba → egy folt-alakú újrakérés `buildSchemaRetryUser(issues, {targetSections})`, a folt egyesül; másodszor is teljes lecke → valódi hiba, nem WARN) | `lesson-pipeline-runner.test.ts` (U4 C4/H5) |
| H6 | Megalapozatlan fogalomcímke a kapun | U4 | lezárt (a megalapozás pontos szabálya a `TEACHING_CONTRACT` 1. pontjában a kódból; `ungrounded[].sectionIdx` a kapujelentésben, a célzott javítás abból dolgozik) | `u4-author-pedagogue.test.ts` |
| H7 | Tanári kérés pontja tanítatlan | U3 | lezárt a U3 hatókörében (`instruction-points.ts`: pontjegyzék EGYSZER a pedagógus előtt, két független kivonat uniója, `requestSpan`-visszakötés, igazolt pont kiegészítő fogalom, a tervező `instructionPointIds`-szel fejezethez rendeli, a szerző fejezetenként kapja; kapu azonosítónként) — a modell-kivonat minősége élő mérésre vár (D) | `instruction-points.test.ts` (valódi Egyiptom-kérés, 16 pont, szimulált kivonat) |
| H8 | Lektor bemenet/költség | U5, U6 | nyitott | evidence-visits-tokens.txt |
| H9 | Lektor altípus/útvonal | U5 | nyitott | — |
| H10 | Runbook/tanult szabály szerep nélkül | U0 | lezárt (PR #158: `roles.ts` RULE_ROLES/QUALITY_ROLES/BANK_MINIMUM_ROLES; `callStepModel.role` KÖTELEZŐ — review után nincs lépés-alapú csendes tartalék; a 45/75 kivéve a `LESSON_QUALITY_CONTRACT`-ból; teszt `instruction-bundles.test.ts`) | tesztek: bank kapja a 45/75-öt, lektor/vak megoldó nem |
| H11 | Ismeretlen hibaosztály nem jut emberhez | B8 | nyitott | — |
| H12 | Pedagógus ellentmondás | U4 | lezárt (a tervező prompt és skill kimondja: a záró „A leggyakoribb hibák” / „Ellenőrzés” fejezet fogalomismétlése nem duplikáció) | `u4-author-pedagogue.test.ts` |
| H13 | Szerző teljesíthetetlen utasítás | U4 | lezárt (magyar szerzői prompt; „reportba írd” és angol „Hard rules” törölve; `TEACHING_CONTRACT` egyszer a séma számaival: megalapozás, hosszkorlátok, forrás-hivatkozás tilalma, program által beírt mezők; a minőségi szerződés csak a közös módszer-szerződésben + runbook) | `u4-author-pedagogue.test.ts`, `lesson-band-theme.test.ts` (címke: Korosztály) |
| H14 | Ábratervező skill/contract | U6 | nyitott | — |
| H15 | Vak megoldó skill, néma veszteség | U5 | nyitott | — |
| H16 | Dokumentáció ↔ 95% | B6 | nyitott | — |
| H17 | Memória elavult | B7 | nyitott | — |
| H19 | Ábra a bank ujjlenyomatában | U2a | lezárt (PR U2a: `withoutFigures` a bank tartalom-kulcsában és bemenetében; teszt: ábracsere nem épít újra) | `bank-hardening.test.ts` |
| H20 | Forrás-hivatkozás törlése a bank UTÁN | U4 | lezárt (C3: törlés + jelentésőrző átírás a SZERZŐI lépés végén, a bank előtt; az ábra-lépés már nem módosítja a tanítást) | `lesson-pipeline-runner.test.ts` (U4 C3/H20) |
| H21 | Kivonatoló csonkolás / quote-kör | U6 | részleges (#156: nagyobb keret) | PR #156 |
| H22 | Kivonatoló/OCR/scope szövegek | U6 | nyitott | — |
| H23 | Webes skillek | U6 | nyitott | — |
| H24 | Bank-ellenőr bemenete | U5 | nyitott | — |
| H25–H29 | Ügynök-utasítások, doksik | B6 | nyitott | — |
| H30 | `tananyag-okosito` DB-sor | B8 | tulajdonosi döntés | — |
| H31 | Pontozó sorrend-/törtvak | U1 | nyitott | `2/1 → 1` mérve |
| H32 | Bank-ellenőr ítélet nélkül igazolt | U5 | nyitott | — |
| H33 | `kid-text-fixer` új tényt vezet be; tilalom ↔ 4. lépés | U4 | lezárt (skill: csak a hivatkozó tagmondat törlése, `needsSource` jelzés, a H33-as „jött létre” példa törölve; program: új tulajdonnév/szám → elutasítás, `needsSource` → eredeti marad) | `u4-author-pedagogue.test.ts` (regressziós mondatpárok) |
| H34 | Tanári-kérés ellenőrző: üres lista elfogadva; egész leckében keres; cím is bizonyíték; forrás 60 000-re vágva | U3 | lezárt (v3: üres lista kérés-pontok mellett hiba; bizonyíték csak a megnevezett fejezet törzsszövegéből, cím kizárva; nem jelentett id → részleges jelentés, `undecidable`; „a forrás alátámasztja” külön `supports` ítélet — a téma érintése nem igazol; a 60 000-es forráskeret marad, dokumentált) | `instruction-points.test.ts` |
| H35 | Több helyes párosítás | U2a (+ U5 bank-ellenőr try-blokk) | részleges (PR U2a: `lessonSchema` try.match többértelműség-őr; a bank-ellenőr try-blokk bemenete U5) | `bank-hardening.test.ts` |
| H36 | Elérhetetlen Próba | — | történeti (regresszió őrzi) — regressziós teszt megléte ellenőrzendő | #141/#143 |
| H37 | Ellenőrzési gyorsítótár verziózatlan | U0, U5 | nyitott — eltérés a végrehajtási fájltól: a három kulcs (tartalom/ellenőrzés/származás) bekötése a fogyasztó egységekbe kerül (U2 bank `contentKey`, U5 ellenőrzők `verificationKey`), az U0 a származási verziót (`runtimeVersion` a pillanatképben) és a DB-prompt rögzítését (`workflowPinnedPrompt`) adja | — |
| H38 | Runbook-verzióemelés törés | U0 | lezárt (PR #158: `websuli-runtime-2.ts` archívum rögzített sha256-tal, `bundleRunbook`, verzió-tudatos `roleSkillBlock/withSupportSkill/withRepairSkill`; a runtime-2 pillanatkép promptja bájtra a régi képlet; runtime-1 explicit leállítás §C-V/11; workflow-n kívül élő csomag) | `instruction-bundles.test.ts` |
| §C-V/2 | DB-prompt rögzítés | U0 | részleges: a DB-sor jelenléte+szövege a pillanatképben (`workflowPinnedPrompt`), a végleges utasítás lenyomata hívásonként rögzítve és folytatáskori változás jelezve (`workflowNotePromptHash`); a promptépítők sablonszövegeinek csomagba emelése → U4 (`TEACHING_CONTRACT`) | review #158 |
| H39 | Hatókör-őrök | U4 | lezárt (`checkAnimatorResult`: fejezetcím, `probaEnabled`, `emoji`, `misconceptions` is; `checkConceptFixResult` már mérte a címet) | `u4-author-pedagogue.test.ts` |
| H40 | Megszakadt futás folytatása | — | külön spec | — |
| H41 | UUID prompt, blokk-kind, PDF, térkép, parkolás | — | történeti — regresszió ellenőrzendő | `mapJson`, `AUTHOR_BLOCK_CATALOG` |
| H42 | Limit-policy címkehiba | U6 | nyitott | `limit-policy.ts:79` |
| H43 | Régi-alak tiltás | U6 | nyitott | — |
| H44 | Duplikátum-kulcsok írásjel-törlés | U2a | lezárt (PR U2a: közös `questionKey` a csomag-sémában, a kapukérdés-őrben és a csomagok közti összevetésben; a korábbi kapukérdések a promptban) | `bank-hardening.test.ts` |
| H45 | Üres lektori jelentés | U5 | nyitott | — |
| H46 | Oral/written csomagonként | U2c | lezárt (a szerződés 3. pontja és a prompt „EBBEN a csomagban legalább egy oral és egy written” — kimondva; a `experiencePacketSchema` csomagonként méri, a hiány csomagszintű → teljes újraírás) | `bank-repair.test.ts` |
| H47 | Tanári kérés némán 2000 karakterre vágva | U3 | lezárt (`OWNER_INSTRUCTION_MAX` 100 000 tárolási plafon; a 32 000-es hívási kereten túli rész JELÖLT `unprocessed` pont + `truncated: true`, a promptblokk is jelzi) | `instruction-points.test.ts` |
| H48 | Bank-ellenőri lelet elnyomása | U5 | nyitott | — |
| H49 | Lektori solutions 40-re vágva | U5 | nyitott | — |
| H50 | Pedagógusi vázlat mezői (`animationSuggestions` 120, `keyPhrases` 40, `emoji` 8), tanári kérés (2000), lektori `solutions` (40) csendben vágva | U3 (kérés), U4 (vázlat), U5 (solutions) | részleges (U3: a kérés vágása jelölt; U4: `outlineClamps` → `outline_clamped` qualityNote, a vágott keyPhrase nem kötelező kiemelés, a korlátok a promptban; a `solutions` U5) | `instruction-points.test.ts`, `u4-author-pedagogue.test.ts` |
| H51 | Újrahívás-összefésülés lelettörlés | U5 | nyitott | — |
| H52 | Utolsó kísérlet aritmetikai jelzés | U2a | lezárt (PR U2a: nyitott lelet → `bankOpenFindings` a jobban → a kapun `origin: "arithmetic"` kivehető tétel; a csomag továbbra is átmegy) | `bank-hardening.test.ts`, régi „biztonsági szelep” teszt változatlan |
| H53 | Lektori „első menet” példa | U2c | lezárt (a `buildLektorPrompt` kalibráló példája cserélve: köztes műveleti állapotot kérő kérdésnél az értékazonos más alak HIBÁS → blokkoló; a lektor skill 5. pontja és a bank-ellenőr is a `typedAnswers`/form szabályt ismeri) | `bank-repair.test.ts` |
