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
| H10 | Runbook/tanult szabály szerep nélkül | U0 | nyitott | — |
| H11 | Ismeretlen hibaosztály nem jut emberhez | B8 | nyitott | — |
| H12 | Pedagógus kivétel | U4 | nyitott | — |
| H13 | Szerző teljesíthetetlen utasítás | U4 | nyitott | — |
| H14 | Ábratervező skill/contract | U6 | nyitott | — |
| H15 | Vak megoldó skill, néma veszteség | U5 | nyitott | — |
| H16 | Dokumentáció ↔ 95% | B6 | nyitott | — |
| H17 | Memória elavult | B7 | nyitott | — |
| H19 | Ábra a bank ujjlenyomatában | U2 | nyitott | — |
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
| H35 | Több helyes párosítás | U2 (+ szerzői try.match) | nyitott | — |
| H36 | Elérhetetlen Próba | — | történeti (regresszió őrzi) — regressziós teszt megléte ellenőrzendő | #141/#143 |
| H37 | Ellenőrzési gyorsítótár verziózatlan | U0, U5 | nyitott | — |
| H38 | Runbook-verzióemelés törés | U0 | nyitott | — |
| H39 | Hatókör-őrök | U4 | nyitott | — |
| H40 | Megszakadt futás folytatása | — | külön spec | — |
| H41 | UUID prompt, blokk-kind, PDF, térkép, parkolás | — | történeti — regresszió ellenőrzendő | `mapJson`, `AUTHOR_BLOCK_CATALOG` |
| H42 | Limit-policy címkehiba | U6 | nyitott | `limit-policy.ts:79` |
| H43 | Régi-alak tiltás | U6 | nyitott | — |
| H44 | Duplikátum-kulcsok írásjel-törlés | U2 | nyitott | — |
| H45 | Üres lektori jelentés | U5 | nyitott | — |
| H46 | Oral/written csomagonként | U2 | nyitott | — |
| H47 | Tanári kérés 2000-re vágva | U3 | nyitott | — |
| H48 | Bank-ellenőri lelet elnyomása | U5 | nyitott | — |
| H49 | Lektori solutions 40-re vágva | U5 | nyitott | — |
| H50 | Vázlatmezők csendes vágása | U4 | nyitott | — |
| H51 | Újrahívás-összefésülés lelettörlés | U5 | nyitott | — |
| H52 | Utolsó kísérlet aritmetikai jelzés | U2 | nyitott | — |
| H53 | Lektori „első menet” példa | U2 | nyitott | — |
