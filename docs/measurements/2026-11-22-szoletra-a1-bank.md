# Szólétra S3 — A1 szóbank-bővítés: generálás, vak megoldós ellenőrzés, költség

Dátum: 2026-11-22. Ág: `feat/szoletra-a1-bank`. Terv: `docs/specs/2026-11-22-szoletra-szintezes.md` 12. szakasz;
végrehajtás: `docs/specs/2026-11-22-szoletra-szintezes-vegrehajtas.md` 10–14. lépés. Keret: ≤ 25 USD (tulajdonos, 2026-11-22).

- Gyártó modell: `anthropic/claude-sonnet-5.5` (OpenRouter), `reasoning.effort: low`.
- Vak megoldó: `anthropic/claude-opus-5.5` (OpenRouter) — csak a kérdésfájlt kapja (kulcs és bank nélkül).
- Eszköz: `source/scripts/vocab-bank-generate.ts` (`generate` / `apply` / `solve`), `source/scripts/vocab-bank.ts`
  (`blind-export --only`, `blind-score`).
- Költségforrás: a szolgáltató válaszának `usage.cost` mezője, hívásonként a gépi naplóban:
  `docs/measurements/2026-11-22-szoletra-a1-bank-koltsegnaplo.jsonl` (90 sor). Becslés nincs.

## Költség (mért, a napló összege)

| Fázis | Hívás | USD |
|---|---|---|
| Próbakör (nyelvenként 15 jelölt; ebből 3 csonkolt hívás 0,1496 — C-SZL-2) | 6 | 0,2869 |
| Teljes generálás (+ en / de 1. fokozat pótlás: 2 hívás 0,2029) | 20 | 2,1310 |
| Vak megoldó (1. kör 2692 kérdés + próba-köteg + pótlások + javító körök + tartalék- és pótló körök) | 64 | 5,5302 |
| **Összesen** | **90** | **7,9481** |

Token: 702 892 bemeneti, 377 718 kimeneti. Próbakör-vetítés 900 tételre: 7,17 USD (a csonkolt hívásokkal együtt;
nélkülük 3,43) ≤ 22 USD → a teljes futás indulhatott. A keret 32 %-a fogyott el. Az utolsó (en / de 1. fokozat) pótló kör saját futáskorlátja 2 USD volt; mért költsége 0,4585 USD.

## Tételszám (kézi + szóbank, egyes szó)

Mérce: `source/client/src/lib/wordLadderGrading.ts` a `feat/szoletra-szintezes-1` e2d8c86d fején (locale-független
normalizálás, nyelvenkénti névelők, célnyelvi oldal választása, bankközi korlát `ladderTermFloors`). „Előtte” = a bank az S3
tételei nélkül, ugyanezzel a mércével. Két oszloppár: korlát nélkül, és a kézi + szóbank összevont bankközi korlátjával
(`ladderTermFloors(ladderFloorSources(kézi) + vocabFloorSources(szóbank))` — a szigorúbb).

| Nyelv | 0. fok. előtte → utána | 1. fok. előtte → utána | 0. fok. korláttal | 1. fok. korláttal | Új 0. szintű szó | Szóbank |
|---|---|---|---|---|---|---|
| en | 222 → 372 | 180 → 337 | 205 → 355 | 149 → 304 | 307 | 2664 → 2971 |
| de | 171 → 317 | 145 → 333 | 154 → 300 | 118 → 306 | 334 | 2080 → 2414 |
| fr | 111 → 308 | 186 → 318 | 103 → 300 | 168 → 300 | 329 | 2064 → 2393 |

Phrase-arány utána: en 31,0 %, de 31,0 %, fr 31,2 % (≥ 30 %). **A korláttal mért 0. és 1. fokozat mindhárom nyelven ≥ 300.**

- Az új mérce alatt a fr és a de 0. fokozat hiánya a tartalék-jelöltekből pótolva (fr +24, de +4; saját vak kör, 1 javított
  tétel: `de0-freetime-032` „auf die Wippe” → új példamondat). Fizetős generálás ehhez nem kellett.
- Az en / de 1. fokozat maradék hiánya (−6 / −24) orkesztrátori engedéllyel fizetős pótlással (en +10, de +30, kis
  tartalékkal; 2 generáló hívás 0,2029 USD). Vak kör: en 30 kérdés (kanári 2/2, jelzett 0), de 90 kérdés (2/2, 5 tétel
  jelezve: névelő / eset / „im Himmel”); a jelzett 5 + 2 saját észrevétel (`der Planet`, `die Brezel`) javítva, újra vakon
  ellenőrizve (19 kérdés, 1/1, 0 jelzés). A „la pieuvre” módosított tétele (`fr0-animals-069`, hu „polip”) vak kört kapott:
  3 kérdés, 1/1, 0 jelzés. A javított `de0-school-048` a validátoron bukott (a „Die erste Seite” nem tartalmazza a
  „die Seite” alakot) → `alt: ["Seite"]`, újra vakon: 2 kérdés, 1/1, 0.
- Minden új tétel egyes szó, 0. szint, mért fokozata (korlát nélkül és korláttal is) 0 vagy 1.

## Szűrés (gépi, `apply`)

Elutasítva a jelöltekből: duplikátum (a teljes szóbank + a kézi Szólétra-bank célrészei, névelő nélkül), nem egyes szó,
rossz téma / szófaj, `vocabBankProblems`-hiba, tartalmatlan (a `vocab-bank-cognates.test.ts` szabálya), 2+ fokozat.
A tartalmatlan-szűrő az első alkalmazás után került a generátorba: a cognates-teszt 35 új tételt (pl. „pizza = pizza”)
jelzett; mind törölve és tartalékból pótolva (hibaosztály-javítás, nem egyenkénti).

## Vak megoldó

| Kör | Nyelv | Kérdés | Kanári | Jelzett |
|---|---|---|---|---|
| 1. | en / de / fr | 900 / 895 / 897 | 10/10 · 10/10 · 9/10 | 25 / 30 / 39 |
| pótlások | en / de / fr | 21 / 33 / 42 | 3/3 · 3/3 · 3/3 | 0 / 7 / 6 |
| javító 1. | en / de / fr | 31 / 48 / 57 | 3/3 · 3/3 · 3/3 | 0 / 0 / 2 |
| javító 2. | fr | 2 | 1/1 | 0 |
| fr +5 | fr | 15 | 2/2 | 0 |
| tartalék (új mérce) | de / fr | 12 / 72 | 2/2 · 2/2 | 3 (1 tétel) / 0 |
| javító 3. | de | 3 | 1/1 | 0 |
| en / de pótlás + pieuvre | en / de / fr | 30 / 90 / 3 | 2/2 · 2/2 · 1/1 | 0 / 15 (5 tétel) / 0 |
| javító 4.–5. | de | 19 + 2 | 1/1 · 1/1 | 0 |

- fr kanári 9/10: a kimaradt kanári (`fr0-animals-065` „le raton”) kérdésénél a megoldó „egyik sem jó” (null) választ adott
  és megjegyezte: a „mosómedve” franciául „raton laveur” — valódi tartalmi hiba, nem figyelmetlenség; a tétel törölve.
- Elbírálás (50 különböző tétel): 42 javítva (azonosító marad), 7 törölve és pótolva („thirst”, „le char”, „le coup”,
  „la voie”, „le raton”, „la fois”, „nul”), 1 megoldói / disztraktor-észrevétel elfogadva változtatás nélkül:
  `en0-food-043` „tasty” — a hiányos mondatnál a „good” disztraktor is illik (a kérdésgenerátor disztraktor-választása, a
  bank egészére jellemző, ebben a szeletben nem javítható).
- Jellemző hibák: kérdő mondat ponttal (a gyártói prompt „nincs ? ! : ;” szabálya miatt — en / de: 3 tétel, mind javítva),
  határozott névelő természetellenesen (de / fr), magyar fordítás pontatlansága, francia egyeztetés („pieds nu”, „pur”).
- Utolsó kör: valódi hiba 0.

Maradó kockázat: anyanyelvi lektorálás nem történt; a megoldó és a gyártó is LLM.
