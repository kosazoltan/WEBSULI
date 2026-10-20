# R5 — a pontozó regressziós korpusza (+ a korpusz által talált ragozási hiba)

Állapot: tulajdonosi kérés 2026-10-20 („fejezd be autonóm módon … minden nyitott pontot”). Elemzés:
`docs/specs/2026-10-20-elakadas-gyokerok-elemzes.md` (R5).

## Miért
- **Élesben előkerült pontozóhibák a héten:**
  - angol tagadás — must / mustn't, a Where I Live lektor 3 körön át (#330);
  - hamis tagadás — „PIN-t”, „dönt”, „legyen t” (#330 review);
  - rövid fogalomnév (#326).
- **A javításuk eseti volt;** nincs egy hely, ahol minden ismert buktató egyszerre fut minden pontozóváltozás előtt.
- **A minta** (kutatás, ASAG / ETS c-rater): a pontozónak saját, a valódi buktatókból épített regressziós korpusz kell, és az
  LLM-lektort is ehhez kell kalibrálni.

## Cél
1. **`tests/fixtures/scorer-corpus.json`:** esetenként rubrika, minta, válasz és a válasz elvárt pontja, forrás-hivatkozással.
   - **Témák:** angol tagadás, hamis tagadás, magyar tagadás, ragozás, rövid szó, szám/előjel, angol összevonás, túl rövid válasz.
2. **`tests/scorer-corpus.test.ts`:**
   - minden esetben a minta 1 pont, a válasz az elvárt pont;
   - a megosztott (v1) pontozón ÉS a HTML-referencián (`ee_evaluate`) is.
3. **A korpusz által talált hiba javítása:**
   - **a hiba:** a pontozó nem ismerte az összehasonuló -val/-vel ragot („fotoszintézissel”, „kalappal”, „kézzel”). A
     „fotoszintézis” rubrika a „fotoszintézissel” mintán 0 pontot adott.
   - **`stem`:** dupla mássalhangzó + al/el végződésnél (≥ 6 betű) a rag (3 betű) levágása.
   - **`wordHit`:** a rövid (≥ 2 betűs) szó is egyezik pontosan ezzel a ragos alakjával. Egyéb rövidszó-illesztés változatlanul
     tiltott („kör” ≠ „korszak”).
   - **`ee_stem` / `ee_wordHit` (HTML-referencia):** ugyanez, paritásban.
   - **`OPEN_ANSWER_RULES_HU` 2. pont:** leírja.

## Nem-cél
- **A „Whose” válasz pontja:** fél pont marad (az egyik kötelező csoport talál). Ez rubrikakérdés, nem pontozóhiba; a korpusz
  rögzíti.
- **Teljes magyar morfológiai elemző (Hunmorph):** későbbi döntés.

## Elfogadás (EARS)
- **Változás előtt:** HA a pontozó változik, AKKOR a korpusz minden esete az elvárt pontot adja mindkét pontozón.
- **A talált hiba:** HA a rubrika „fotoszintézis” / „kalap” / „kéz”, és a válasz a -val/-vel alakot használja, AKKOR teljes pont.
- **Rövid szó:** HA a válasz „korszak”, a rubrika „kör”, AKKOR 0 pont (változatlan).
