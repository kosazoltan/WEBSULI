# Mély elemzés: miért akad el a tananyaggyártás és -javítás — és a javítás terve

Állapot: tulajdonosi kérés 2026-10-20 („ez így már nagyon drága … Készíts egy iszonyatosan nagy, mély elemzést … olvass utána …
majd javítsd meg a működést”). Ez a dokumentum az elemzés és a terv; a végrehajtás szeletekben (R1, R2, …) történik.

## 1. Mért helyzet (éles adatbázis, csak olvasva, 30 nap)
- **Sikerarány:** 152 futásból 82 sikeres (54 %).
  - Feltöltött forrás: 48 %.
  - HTML-okosítás: 25 % (4-ből 1).
  - Teljes lecke javítása: 56 %.
- **Pazarolt munka:** 30 futás az UTOLSÓ kapun állt meg, miután a tanítás és a bankok elkészültek; a legtöbb 1–6 tétel miatt.
- **Telemetria (új út, 10 job):**
  - a gyakorlóbank hívásainak 49 %-a javítókör;
  - a javítókörökre jut a kimeneti tokenek kb. 31 %-a (becslés);
  - két bukott job teljes kimenete (316 ezer token) veszett el.
- **Okcsoportok (70 nem sikeres futás):**

| okcsoport | db | megjegyzés |
|---|---|---|
| lektor-blokkoló az utolsó körben | 8 | az új úton csak banktétel (a3ede678, e1f59f8d) |
| fogalom-megalapozottság | 9 | nagyrészt az egyeztető hibája; javítva (#326, 10-04/05) |
| körlimiten maradt banktétel, kivétel után padló alatt | 8 | régi út (10-01–10-05) |
| szolgáltatói hiba | 8 | 4 egyszeri (kivezetett modell) |
| bankcsomag a javítókör után sem jó | 6 | kb. 4 determinisztikusan javítható |
| kitelepítés / újraindulás / leállítás | 10 | S1 (#324) óta a futás kivárva |
| HTML-okosítás záró kapuja | 3 | 1e169ace, a0d16870, f2c2f102 |

## 2. Gyökérokok (kód + adat)
1. **„Mindent vagy semmit” az utolsó lektorkörben.**
   - `server/studio/single-run/engine.ts`: a 3. (utolsó) lektorkörben bármely blokkoló jegyzet azonnal hibát dob, MIELŐTT a
     banktétel-kivétel (`splitLimitBlockers` → `resolveChoiceGate`, a padló lazításával) lefutna. Ez az ág csak a korábbi
     körökben él.
   - Így egy kivehető, hibás feladat a teljes, kész leckét elveszti.
2. **A „Teljes lecke javítása” lektorlépésének nincs kivételi ága.**
   - `server/studio/structured-improvement.ts` `finishStructuredImprovement`: egyetlen lektorhívás után BÁRMELY blokkoló
     jegyzetre megáll.
3. **A HTML-okosítás egyetlen lövésben generál, tartalék és gépi javítás nélkül.**
   - 45 feladat + 75 kvíz egy HTML-ben (`server/improveAsync.ts`), a záró kapu (`verifyLessonMethodHtml`) bármely hibára elutasít.
   - **Mért hibák:**
     - fogalom két csomagból (f2c2f102: `["watch","clock"]`);
     - csomagonkénti szóbeli/írásos hiány;
     - mintaválasz.
   - Ezek determinisztikusan javíthatók, vagy a minimum fölött elhagyhatók.
4. **Kijavíthatatlan kérés a modellnek.**
   - Ha a pontozó a hibás (#330: must / mustn't), a modell a rubrikával nem teljesítheti a kaput, és a javítókör kimerül.
   - Nincs „a validátor gyanús” / „ugyanaz a hiba ismétlődik” állapot.
5. **Teljes újragenerálás javítókörben.**
   - A bankcsomag javítóköre a teljes csomagot újraírja: a jó tételek is elromolhatnak (regresszió), és a token is itt fogy.

## 3. Mit mond a szakirodalom és a gyakorlat
(A kutatási jelentés URL-ekkel a munkamenetben; itt a lényeg.)
- **Az önjavítás korlátai:**
  - az önjavítás külső visszajelzés nélkül megbízhatatlan, és nem jobb a friss mintavételnél (Huang et al., ICLR 2024,
    arXiv:2310.01798; Olausson et al., ICLR 2024, arXiv:2306.09896);
  - a javítókör pontos visszajelzéssel és korlátos körszámmal ér valamit (Anthropic: „Building effective agents” —
    evaluator-optimizer).
- **Túlgenerálás + szűrés:** a hibás tétel kiesik, a futás sikeres, ha a minimum teljesül; előbb a determinisztikus javítás, utána
  a modell.
  - Heilman–Smith, NAACL 2010 (N10-1086);
  - Guardrails AI `on_fail`: `FILTER`, `FIX_REASK`;
  - DSPy Assertions `Suggest` (arXiv:2312.13382).
- **Tételszintű javítás zárolással:** csak a hibás tétel megy vissza, a többi változatlan (aider-mérések a diff vs. teljes
  újraírás regressziójáról).
- **Doom-loop / stuck-detektálás** (OpenRouter Agent SDK): ugyanaz a hiba kétszer → nincs több kör, a tétel karanténba kerül.
- **Rövid válaszok pontozása:** a tagadás külön állapot („Negated” — ETS c-rater, Sukkarieh–Blackmore 2009); a pontozónak saját
  regressziós korpusz kell.
- **Kérdésgenerálás minőségbiztosítása:** a nyereség zöme az első két javítókörből jön (ASEE 2025, agentes MCQ-generálás).

## 4. Terv — szeletek
- **R1 (ez a szelet) — „kivétel megállás helyett” mindkét lektorútvonalon.**
  - **Egyfutásos gyártás, utolsó lektorkör:**
    - ha csak banktétel-blokkolók vannak, és mind kivehető, a `resolveChoiceGate` (padló-lazítással) kiveszi őket;
    - a lecke figyelmeztetéssel a végkapura megy;
    - különben a régi hibaüzenet.
    - Tanítási (nem bank) blokkoló az utolsó körben továbbra is megáll — azt modellnek kell javítania.
  - **Teljes lecke javítása:** ugyanez — csak bank-blokkolók és sikeres kivétel → a jelölt a kivett tételek nélkül megy tovább, a
    kivétel a visszatérési értékben.
- **R2 — HTML-okosítás, determinisztikus bankjavítás a kapu előtt** (a #327 rubrika-igazítás kiterjesztése):
  - **több csomagba nyúló tétel:** a `coversConceptIds` szűkítése az első fogalom csomagjára;
  - **szóbeli/írásos hiány:** a csomagban egy feladat módváltása, ha a csomagban ≥ 2 feladat van;
  - **a saját mintájára sem teljes pontos feladat:** elhagyás, ha utána a bank nem kap új hibát (padló-próba
    `experienceProblems`-szel).
- **R3 — stuck-detektálás:** ugyanaz a banktétel két egymást követő lektorkörben blokkoló → a következő döntés a kivétel (nincs
  újabb bankjavítás), ha a padló engedi.
- **R4 — tételszintű patch-javítókör a bankcsomagnál:** csak a hibás tételek mennek vissza, a jó tételek zárolva. Az S3b-kerettel
  mérve.
- **R5 — pontozó-regressziós korpusz:** a valódi buktatókból (tagadás, ragozás, rövid fogalom), minden pontozóváltozás előtt fut.

## 5. Elfogadás (a teljes tervre)
- **Kivehető banktétel:** HA a lektor az utolsó körben csak kivehető banktételt blokkol, és a kivétel után a bank megfelel, AKKOR a
  lecke elkészül (figyelmeztetéssel), nem áll meg.
- **HTML-okosítás:** HA a modell kimenete csak determinisztikusan javítható bankhibát tartalmaz, AKKOR a jelölt átmegy a záró
  kapun.
- **Mérés:** a sikerarányt és a javítókör-arányt a szeletek után a telemetriából mérjük (cél: az utolsó kapus megállások felére
  csökkenése).
