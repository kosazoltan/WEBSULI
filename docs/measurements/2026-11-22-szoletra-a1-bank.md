# Szólétra S3 — A1 szóbank-bővítés: generálás, vak megoldós ellenőrzés, költség

Dátum: 2026-11-22. Ág: `feat/szoletra-a1-bank`. Terv: `docs/specs/2026-11-22-szoletra-szintezes.md` 12. szakasz;
végrehajtás: `docs/specs/2026-11-22-szoletra-szintezes-vegrehajtas.md` 10–14. lépés. Keret: ≤ 25 USD (tulajdonos, 2026-11-22).

- Gyártó modell: `anthropic/claude-sonnet-5.5` (OpenRouter), `reasoning.effort: low`.
- Vak megoldó: `anthropic/claude-opus-5.5` (OpenRouter) — csak a kérdésfájlt kapja (kulcs és bank nélkül).
- Eszköz: `source/scripts/vocab-bank-generate.ts` (`generate` / `apply` / `solve`), `source/scripts/vocab-bank.ts`
  (`blind-export --only`, `blind-score`).
- Költségforrás: a szolgáltató válaszának `usage.cost` mezője, hívásonként a gépi naplóban:
  `docs/measurements/2026-11-22-szoletra-a1-bank-koltsegnaplo.jsonl` (78 sor). Becslés nincs.

## Költség (mért, a napló összege)

| Fázis | Hívás | USD |
|---|---|---|
| Próbakör (nyelvenként 15 jelölt; ebből 3 csonkolt hívás 0,1496 — C-SZL-2) | 6 | 0,2869 |
| Teljes generálás | 18 | 1,9281 |
| Vak megoldó (1. kör 2692 kérdés + próba-köteg + pótlások + 2 javító kör + fr +5 kör) | 54 | 5,1206 |
| **Összesen** | **78** | **7,3355** |

Token: 646 400 bemeneti, 348 240 kimeneti. Próbakör-vetítés 900 tételre: 7,17 USD (a csonkolt hívásokkal együtt;
nélkülük 3,43) ≤ 22 USD → a teljes futás indulhatott. A keret 29 %-a fogyott el.

## Tételszám (kézi + szóbank, egyes szó, `wordLadderGrading` mérce)

| Nyelv | 0. fokozat előtte → utána | 1. fokozat előtte → utána | Új 0. szintű tétel | Szóbank összesen | Phrase-arány |
|---|---|---|---|---|---|
| en | 222 → 372 | 181 → 328 | 297 | 2664 → 2961 | 34,6 % → 31,1 % |
| de | 171 → 316 | 145 → 300 | 300 | 2080 → 2380 | 36,0 % → 31,4 % |
| fr | 109 → 300 | 186 → 300 | 305 | 2064 → 2369 | 36,1 % → 31,5 % |

A fr-nél a két fokozat külön-külön ≥ 300-hoz 305 új szó kellett; a +5 tételt (1. fokozat) az orkesztrátor a kereten belül
engedélyezte, tartalék-jelöltekből, saját vak körrel (15 kérdés, kanári 2/2, jelzett 0; a „la pieuvre” jelentése utólag
„polip”-ra pontosítva). Minden új tétel egyes szó, 0. szint, mért fokozata 0 vagy 1.

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
