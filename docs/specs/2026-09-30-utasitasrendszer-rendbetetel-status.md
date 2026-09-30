# Státusz-nyilvántartás — utasításrendszer rendbetétele (a végrehajtási fájl §0 szerint, karbantartandó)

Állapotok: `nyitott` · `részleges` · `lezárt (PR, teszt)` · `ismert maradó` · `külön spec` · `történeti (regresszió őrzi)`.
Csak futtatott teszt/PR hivatkozással állítható „lezárt”.

| # | Rövid név | Egység | Állapot | Bizonyíték |
|---|---|---|---|---|
| H1 | Banktétel tényhiba (rubrika + számolás) | U1, U2, U5 | nyitott | — |
| H2 | Minta ≠ rubrika; pontozó-szerződés hiányos | U1, U2 | nyitott (a tagadás-heurisztika: ismert maradó) | — |
| H3 | Csomag darabszám/alak | U2 | nyitott | — |
| H4 | Ismétlődő kérdés, három kulcs | U2 | nyitott | — |
| H5 | Szerzői javítókör „title/subject Required” | U4 | nyitott | — |
| H6 | Megalapozatlan címke, lapított index | U4 | nyitott | — |
| H7 | Tanári pont tanítatlan | U3 | részleges (#155: forrásból igazolt pont kiegészítő fogalom) | PR #155 |
| H8 | Lektor bemenet/költség | U5, U6 | nyitott | evidence-visits-tokens.txt |
| H9 | Lektor altípus/útvonal | U5 | nyitott | — |
| H10 | Runbook/tanult szabály szerep nélkül | U0 | lezárt (PR #158: `roles.ts` RULE_ROLES/QUALITY_ROLES/BANK_MINIMUM_ROLES; `callStepModel.role` KÖTELEZŐ — review után nincs lépés-alapú csendes tartalék; a 45/75 kivéve a `LESSON_QUALITY_CONTRACT`-ból; teszt `instruction-bundles.test.ts`) | tesztek: bank kapja a 45/75-öt, lektor/vak megoldó nem |
| H11 | Ismeretlen hibaosztály nem jut emberhez | B8 | nyitott | — |
| H12 | Pedagógus kivétel | U4 | nyitott | — |
| H13 | Szerző teljesíthetetlen utasítás | U4 | nyitott | — |
| H14 | Ábratervező skill/contract | U6 | nyitott | — |
| H15 | Vak megoldó skill, néma veszteség | U5 | nyitott | — |
| H16 | Dokumentáció ↔ 95% | B6 | nyitott | — |
| H17 | Memória elavult | B7 | nyitott | — |
| H19 | Ábra a bank ujjlenyomatában | U2a | lezárt (PR U2a: `withoutFigures` a bank tartalom-kulcsában és bemenetében; teszt: ábracsere nem épít újra) | `bank-hardening.test.ts` |
| H20 | Forrás-hivatkozás a bank után | U4 | nyitott | — |
| H21 | Kivonatoló csonkolás / quote-kör | U6 | részleges (#156: nagyobb keret) | PR #156 |
| H22 | Kivonatoló/OCR/scope szövegek | U6 | nyitott | — |
| H23 | Webes skillek | U6 | nyitott | — |
| H24 | Bank-ellenőr bemenete | U5 | nyitott | — |
| H25–H29 | Ügynök-utasítások, doksik | B6 | nyitott | — |
| H30 | `tananyag-okosito` DB-sor | B8 | tulajdonosi döntés | — |
| H31 | Pontozó sorrend-/törtvak | U1 | nyitott | `2/1 → 1` mérve |
| H32 | Bank-ellenőr ítélet nélkül igazolt | U5 | nyitott | — |
| H33 | kid-text-fixer új tényt vezet be | U4 | nyitott | — |
| H34 | Tanári-kérés ellenőrző hiányai | U3 | nyitott | — |
| H35 | Több helyes párosítás | U2a (+ U5 bank-ellenőr try-blokk) | részleges (PR U2a: `lessonSchema` try.match többértelműség-őr; a bank-ellenőr try-blokk bemenete U5) | `bank-hardening.test.ts` |
| H36 | Elérhetetlen Próba | — | történeti (regresszió őrzi) — regressziós teszt megléte ellenőrzendő | #141/#143 |
| H37 | Ellenőrzési gyorsítótár verziózatlan | U0, U5 | nyitott — eltérés a végrehajtási fájltól: a három kulcs (tartalom/ellenőrzés/származás) bekötése a fogyasztó egységekbe kerül (U2 bank `contentKey`, U5 ellenőrzők `verificationKey`), az U0 a származási verziót (`runtimeVersion` a pillanatképben) és a DB-prompt rögzítését (`workflowPinnedPrompt`) adja | — |
| H38 | Runbook-verzióemelés törés | U0 | lezárt (PR #158: `websuli-runtime-2.ts` archívum rögzített sha256-tal, `bundleRunbook`, verzió-tudatos `roleSkillBlock/withSupportSkill/withRepairSkill`; a runtime-2 pillanatkép promptja bájtra a régi képlet; runtime-1 explicit leállítás §C-V/11; workflow-n kívül élő csomag) | `instruction-bundles.test.ts` |
| §C-V/2 | DB-prompt rögzítés | U0 | részleges: a DB-sor jelenléte+szövege a pillanatképben (`workflowPinnedPrompt`), a végleges utasítás lenyomata hívásonként rögzítve és folytatáskori változás jelezve (`workflowNotePromptHash`); a promptépítők sablonszövegeinek csomagba emelése → U4 (`TEACHING_CONTRACT`) | review #158 |
| H39 | Hatókör-őrök | U4 | nyitott | — |
| H40 | Megszakadt futás folytatása | — | külön spec | — |
| H41 | UUID prompt, blokk-kind, PDF, térkép, parkolás | — | történeti — regresszió ellenőrzendő | `mapJson`, `AUTHOR_BLOCK_CATALOG` |
| H42 | Limit-policy címkehiba | U6 | nyitott | `limit-policy.ts:79` |
| H43 | Régi-alak tiltás | U6 | nyitott | — |
| H44 | Duplikátum-kulcsok írásjel-törlés | U2a | lezárt (PR U2a: közös `questionKey` a csomag-sémában, a kapukérdés-őrben és a csomagok közti összevetésben; a korábbi kapukérdések a promptban) | `bank-hardening.test.ts` |
| H45 | Üres lektori jelentés | U5 | nyitott | — |
| H46 | Oral/written csomagonként | U2 | nyitott | — |
| H47 | Tanári kérés 2000-re vágva | U3 | nyitott | — |
| H48 | Bank-ellenőri lelet elnyomása | U5 | nyitott | — |
| H49 | Lektori solutions 40-re vágva | U5 | nyitott | — |
| H50 | Vázlatmezők csendes vágása | U4 | nyitott | — |
| H51 | Újrahívás-összefésülés lelettörlés | U5 | nyitott | — |
| H52 | Utolsó kísérlet aritmetikai jelzés | U2a | lezárt (PR U2a: nyitott lelet → `bankOpenFindings` a jobban → a kapun `origin: "arithmetic"` kivehető tétel; a csomag továbbra is átmegy) | `bank-hardening.test.ts`, régi „biztonsági szelep” teszt változatlan |
| H53 | Lektori „első menet” példa | U2 | nyitott | — |
