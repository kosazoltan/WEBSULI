# Elakadás-vezérlő — szerverbe épített, haladás-alapú automatikus folytatás (2026-10-15)

Tulajdonosi kérés (2026-10-15): „a szerverbe építve készítsd el ezt a logikát, az általad javasolt lazítások nélkül, de úgy, hogy valóban ne legyen
elakadás, és … lássák, hogy mi készült el, és csak a szükséges ismétlést, további futtatást végezzék el, de azt profi módon.”

Állapot: 1. fázis (terv). A minőségi mérce (45/75 padló, tényhelyesség, egyválasztósság, lektor-bizonyíték) **semmilyen ponton nem lazul**.

## 1. Mért helyzet
- 21 nap: 37 gyártásból 12 kész; a megállások jelentős része *folytatható* állapotban maradt, és csak kézi kattintással ment tovább — vagy
  sehogy (job `416ad01d`: 5 végrehajtás, 4 kapu-futás ugyanazon a bankon; a kiút a stratégiaváltás volt: bank-újraépítés).
- Meglévő elemek: `sweepStudioJobs` (100 s-onként: lejárt lízingű, NEM hibás jobok folytatása), `resumeKindOf` (bank / gate / review / rebuild /
  lektor), `retryFailedBankBuild` / `retryFailedGate` / `retryTimedOutLektor`, `workflowAllowResumeEdge`, mentett részeredmények
  (`experienceCheckpoint`, workflow-checkpointok, `lesson`).
- Hiány: hibás (`status = error`) jobot semmi nem visz tovább magától; a keretek darabszám-alapúak, nem haladás-alapúak; a bank-újraépítés
  a TELJES bankot újraírja akkor is, ha csak egy-két fejezet hibás.

## 2. Cél
1. **Nincs néma elakadás:** minden megállt, nem publikált, mentett leckéjű job vagy automatikusan továbbmegy, vagy pontosan megindokolt
   tulajdonosi döntésre vár (a felületen és a naplóban) — harmadik állapot nincs.
2. **Csak a szükséges ismétlés:** a vezérlő a mentett állapotból dönt (mi kész: tanítás, csomagok, bizonyíték, látogatások), és a legkisebb
   elégséges lépést indítja (pl. csak a hibás fejezetek bankcsomagja épül újra).
3. **Haladás-alapú korlát a darabszám helyett:** ugyanaz a stratégia ugyanarra a hiba-ujjlenyomatra nem fut kétszer; a lépcső véges; a
   költség minden lépésnél naplózott.
4. **Profi működés:** determinisztikus döntési függvény (tiszta, tesztelt), lízing- és idempotencia-biztos végrehajtás, teljes napló.

## 3. Nem-cél
- A kapuk, a lektor, a padló és a tényellenőrzés lazítása — tilos.
- Publikált lecke módosítása.
- Python-futtatókörnyezet a Renderen (tulajdonosi döntés: szerverbe építve, TypeScript).

## 4. Tervezés

### 4.1 Hiba-ujjlenyomat és haladás
- `failureFingerprint(job)`: a hiba osztálya (resumeKind) + a hibás tételek/blokkok normalizált útvonal-halmaza + a padló-hiányok
  („c4: hiányzó recall kvíz”, „45/75”) — szövegfüggetlen, rendezett.
- Haladás = az ujjlenyomat változott ÉS nem bővült (kevesebb hibás tétel / más osztály), vagy a lépcső következő fokára léptünk.

### 4.2 A döntési lépcső (`planRecovery`, tiszta függvény)
Bemenet: a job (hiba, kimenet, kör, mentett csomagok), az utolsó workflow-látogatás, a vezérlő eddigi lépései (`output.recovery[]`:
stratégia + ujjlenyomat + idő + token). Kimenet: a következő stratégia vagy `ask-owner` indoklással.
1. **Szolgáltatói / időtúllépési hiba** (`bank`, `lektor`, `author` modellhívás) → ugyanaz a lépés újra (átmeneti hiba), legfeljebb 2× ugyanarra
   az ujjlenyomatra, növekvő várakozással (2 → 10 perc).
2. **Bizonyíték-eltérés** → `review` (a lektor a mostani leckén).
3. **Bank-eredetű kapuhiba** → `gate` (a kapu részleges javítással), ha még nem futott erre az ujjlenyomatra; utána
4. **Célzott bank-újraépítés** → CSAK a hibás tételeket tartalmazó fejezetek csomagjai épülnek újra (a többi csomag megmarad), a T1 tartalékával;
   ha ugyanaz az ujjlenyomat marad, utána
5. **Teljes bank-újraépítés** (T1b, a tanítás marad); ha ugyanaz marad, utána
6. **Szerzői javítókör** a hibás fejezetekre (a tanítás hiányossága okozza a bankhibát, pl. nincs mit kérdezni egy fogalomról); utána
7. **Teljes újragyártás** ugyanabból a forrásból (új futás, új keret; a régi piszkozat megmarad hivatkozással).
8. Ha a 7. is ugyanarra az ujjlenyomatra fut: **`ask-owner`** — a hiba a forrásban vagy a feladatban van (pl. a forrás nem tanít eleget egy
   fogalomhoz); a felület a pontos okot és a javasolt tulajdonosi lépést mutatja (forrásellenőrzés, fogalom kizárása, forrás bővítése).

### 4.3 Végrehajtás
- A meglévő söprő (`sweepStudioJobs`) kiterjesztése: a `status = error`, nem publikált, mentett leckéjű, workflow-naplós jobokra is;
  minimális szünet a megállás után (2 perc), hogy a tulajdonos kézi döntése elsőbbséget kapjon.
- A végrehajtás a meglévő utakon (`retryFailedGate`, `retryFailedBankBuild`, …) a workflow-lízing alatt; a kézi gomb és a vezérlő ugyanazt a
  `planRecovery`-t használja (egy szabály).
- Végrehajtási keret: a darabszám-keret (4 / 6) helyett a vezérlő lépései a lépcső szerint korlátosak (legfeljebb 8 fok, mindegyik egyszer
  ugyanarra az ujjlenyomatra); a `WORKFLOW_EXPLICIT_RESUME_BUDGET` a vezérlőre nem vonatkozik, a haladás-őr igen.
- Költségnapló: lépésenként token és modell a `output.recovery[]`-ben; a felület összegzi.

### 4.4 Felület
- A futás kártyáján: „Automatikus folytatás: <stratégia> (n. lépés)”, vagy „Tulajdonosi döntés szükséges: <ok>”.
- A kézi „Folytatás” gomb a vezérlő következő lépését indítja azonnal (nem kell a 2 percet kivárni).

## 5. Szeletek
- **V1** — `failureFingerprint`, `planRecovery` (tiszta) + tesztmátrix; a kézi gomb a tervezőt használja.
- **V2** — célzott (fejezetenkénti) bank-újraépítés.
- **V3** — a söprő kiterjesztése hibás jobokra (automatikus végrehajtás, várakozás, lízing), költségnapló, felület.
- **V4** — szerzői javítókör és teljes újragyártás fokai, `ask-owner` felület.

## 6. Elfogadás (EARS)
- E1: HA egy job bank-eredetű kapuhibával megáll, AKKOR a vezérlő tulajdonosi kattintás nélkül a lépcső szerint továbbviszi, és a lecke
  publikál VAGY `ask-owner` állapotba kerül pontos okkal — néma `error` nem marad.
- E2: Ugyanaz a stratégia ugyanarra az ujjlenyomatra nem fut kétszer (tesztmátrix).
- E3: A célzott újraépítés csak a hibás fejezetek csomagjainak modellhívását indítja (a többi csomag gyorsítótárból).
- E4: A kapuk mércéje változatlan (a meglévő kapu-tesztek zöldek, új teszt: a vezérlő hibás tételt nem publikál).
- E5 (élő): egy szándékosan nehéz forráson a gyártás emberi beavatkozás nélkül végigér vagy `ask-owner`-rel áll meg.

## 7. Tulajdonosi döntések (2026-10-15, a V3 élesítése után)
- **V4 — mindkét fok automatikusan:** a lépcső végén előbb célzott szerzői javítás a hibás fejezetekre, ha az sem segít, egyszer teljes
  újragyártás ugyanabból a forrásból; csak ezután tulajdonosi döntés. Futásonként egyszer, naplózva.
- **Folyamat:** a háromfázisú rend (terv → végrehajtási utasítás → kód) a CI-ban kikényszerítve (a #227 és a #232 sérülése után).
