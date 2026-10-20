# R1 — kivétel megállás helyett az utolsó lektorkörben — végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-10-20-elakadas-gyokerok-elemzes.md` (4. pont, R1). Munkakönyvtár: `source/`. Ág: `fix/elakadas-tetelkivetel`.

1. **`server/studio/single-run/engine.ts`, lektorciklus:** a `if (round === SINGLE_RUN_REVIEW_ROUNDS) throw …` helyett:
   - **Ha van tanítási (nem `experience…`) blokkoló:** a régi hiba.
   - **Különben (csak bank):**
     - `splitLimitBlockers(lesson, blocking)`;
     - ha `removable` nem üres, és sem `factual`, sem `incomplete` nincs → `resolveChoiceGate(lesson, split.removable)`.
     - **Siker:** `lesson = removal.lesson`, `telemetry.gates.lektorRemoved += …`, figyelmeztetés, mentés, kilépés a ciklusból →
       végkapu.
     - **Sikertelen:** a régi hiba (a kivétel okával).
   - A kivehetőségi döntést egy tiszta, exportált segédfüggvény hozza: `removeLektorBankBlockers(lesson, blocking)` →
     `{ lesson, removed } | { error }`. Mindkét útvonal ezt használja.
2. **`server/studio/structured-improvement.ts` `finishStructuredImprovement`:** blokkolók esetén `removeLektorBankBlockers`.
   - **Siker:** a `candidate` a kivett tételek nélkül megy tovább; a visszatérési érték `lektorRemoved` listát kap.
   - **Hiba:** a régi hiba.
3. **Tesztek — `tests/elakadas-r1.test.ts`:**
   - **`removeLektorBankBlockers`:**
     - csak bank-blokkoló → kivétel;
     - tanítási blokkoló → hiba;
     - nem létező útvonal → hiba.
   - **`finishStructuredImprovement`** hamis `call`-lal (a meglévő `tests/lesson-fusion-repair.test.ts` mintájára): a lektor egy
     banktételt blokkol → a jelölt a tétel nélkül tér vissza; tanítási blokkolónál → hiba.
   - **Egyfutásos gyártás:** forrásszintű ellenőrzés — az utolsó körben a kivétel a dobás előtt fut.
4. **Ellenőrzés:** `check`, `check:test`, `eslint`, `npm test`, `build`.
5. **Kitelepítés:** az aktív-futás őr = 0.

## Review #331 — pontosítás
- **Kivehető tétel:** CSAK gyakorlóbank-tétel (`experience.tasks|quiz|methods[i]`). Az ellenőrző blokk, az ábra és a tévhit-elem a
  tanítás része, ezért itt nem vehető ki — a leckeív-invariáns (`no_engagement_layer`) sem sérülhet.
- **Nincs kivétel, a régi megállás marad, ha:**
  - a lektor eltérő tanítási megoldást jelez (`solutions[].match === false`);
  - vagy a leckének nincs bankja.
- **A kivett tételek listája:**
  - **egyfutásos gyártás:** a mentett kimenetben (`output.lektorRemoved`), folytatás után is a figyelmeztetésben;
  - **javítás:** a `lessonRepairSchema.lektorRemoved`-ben;
  - **admin:** a javítópanel alkalmazás előtt mutatja (`data-testid="lesson-repair-lektor-removed"`, böngészős teszt mobil + asztal).
- **Tesztek:** a PONTOS tétel hiányát és a többi tétel megmaradását ellenőrzik; a forrásszintű sorrendteszt mindkét részlet
  jelenlétét is.
