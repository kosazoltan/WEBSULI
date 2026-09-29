# Körlimiten maradt banktétel-hiba: a tétel kiesik, nem a lecke (2026-09-29)

## Kiváltó ok (élő mérés)
Élő próbagyártás 2026-09-29 („Oszthatóság 4-gyel és 25-tel”, 6. o., job `44b5afa1…`, Studio-job `d6f5d4bc…`):
- 1327 s után `error`.
- A 3. lektorkör (a körlimit) két blokkolója kizárólag banktételre mutatott:
  - `experience.quiz.65`: a 418-at jelöli 4-gyel oszthatónak, holott „egyik sem osztható”;
  - `experience.tasks.13`: a kötelező csoport a hibás 52-t is elfogadja.
- A csak-bank javítókörök (MAX_BANK_ONLY_ROUNDS) már elfogytak, ezért a `step-runner.ts` lektor-ága a teljes leckét elbuktatta:
  `blockers > 0 && round >= MAX_AUTHOR_ROUNDS && fusion && !bankOnlyRepair → fail`.
- A #134 kapuja (`resolveChoiceGate`) épp erre ad megoldást (hibás banktétel ki, ha a bank így is megfelel), de:
  1. csak `experience.(quiz|methods)[N]` alakot ismer, a lektor pedig pontozott alakot ír (`experience.quiz.65`), és a `tasks` bankra is mutat;
  2. a lektor limitkori blokkolói a kapuig sem jutnak el;
  3. a 7.4 végkapu minden blokkoló lektor-jegyzetnél elbukik.

## Cél
A körlimiten maradt, KIZÁRÓLAG banktételre mutató blokkolók esetén:
- a hibás tételek kikerülnek a bankból (quiz, methods, tasks);
- a lecke publikálható, ha a bank a kivétel után is megfelel minden meglévő minimumnak (`experienceProblems`, `verifyLessonSkillBank`);
- ha a bank a kivétel után nem felel meg, a kapu nem publikál (egyértelmű hibaüzenettel).

## Nem cél
- A tanítási (`sections.*`) blokkoló a limiten továbbra is elbuktatja a leckét (a meglévő „(r) mixed” teszt változatlan).
- A csak-bank javítókörök száma és a lektor konvergencia-szabályai nem változnak.
- A bank-ellenőr késői figyelmeztetései (nem egyválasztós, nem blokkoló) változatlanok.

## Rögzített döntések
1. **Útvonal-normalizálás:** `bankItemRef(path)` a következő alakokat ugyanarra a tételre képezi: `experience.quiz[65]`,
   `experience.quiz.65`, és al-útvonallal is (pl. `experience.quiz[65].options[2]`, `experience.tasks.13.required`).
   Bankok: `quiz`, `methods`, `tasks`. Más útvonalra `null`.
2. **Lektor, limit:** ha van blokkoló, a kör a limiten van, csak-bank javítás már nem jár, és MINDEN blokkoló
   banktételre mutat, akkor nincs `fail`. A blokkolók `{path (normalizált, zárójeles), message}` alakban a kör
   `choiceFlags`-éhez adódnak, és a lépés a kapura megy. A `nextStep` a limiten eddig is a kapura vitt.
3. **Kapu:**
   - a `resolveChoiceGate` a `tasks` bankra is kivesz, és a normalizált útvonalakkal dolgozik;
   - a 7.4 lektor-bizonyítéknál a blokkoló lektor-jegyzet CSAK akkor megengedett, ha az útvonala egy ténylegesen kivett
     banktételre mutat, minden más blokkoló továbbra is elbuktatja;
   - a hibaüzenetek szövege: az egyválasztós esetre a meglévő, a limit-kivételre egy új mondat
     („Hibás banktétel maradt a limiten, és a kivétel után a bank nem felelne meg — nem publikálható: …”).
4. **Dokumentált tesztváltozás (spec-változás):**
   - `lesson-pipeline-runner.test.ts` „bank-only … a harmadik verdikt a limiten végleges” (`/tartalmi javítást kér/`):
     az új elvárás, hogy a limiten a banktétel-blokkolóval a lépés a kapura megy, `choiceFlags`-szel;
   - „(q3) … elfogyott workflow-keretnél nincs csak-bank kör”: a teszt fő szándéka (nincs 5. animátor-látogatás,
     nincs workflow-kivétel) megmarad; az új elvárás a kapura lépés `choiceFlags`-szel, nem a lektor hibája.

   Mindkettő a 2026-09-19 és 09-24 spec „a limit dönt → hiba” döntését követte. Ez a spec ezt felülírja a #134
   tulajdonosi elve alapján: hibás tétel ne jusson a gyerekhez, egyetlen hibás tétel se dobja el a jó leckét.

5. **Banktartalék** (mérve: a szabványos bank pontosan 45 feladat és 75 kvíz, a publikálási minimum is 45/75, így
   egyetlen kivétel is a minimum alá vinné): `LESSON_BANK_RESERVE = { tasks: 3, quiz: 5 }`. A `bankUnitQuota` a
   `LESSON_BANK_SIZES + LESSON_BANK_RESERVE` célra oszt (48 feladat, 80 kvíz). A kapu így legfeljebb ennyi hibás tételt
   vehet ki úgy, hogy a bank a minimum fölött marad. Költség: kb. 7% több banktétel leckénként. A kör mérete (15/25)
   és a publikálási minimum (45/75) nem változik. A kvóta a checkpoint-hash része, így a futó jobok bankcsomagja
   újraépül.

## Edge case-ek
- Ugyanarra a tételre a bank-ellenőr `choiceFlags`-e és a lektor-blokkoló is mutat: egyszer vesszük ki.
- Egy blokkoló tanítási, a többi bank: `fail`, mint eddig.
- A kivétel után a bank a minimum alá esik: a kapu `fail` (nem publikál).
- Érvénytelen index (a banknál hosszabb): nem banktétel, blokkolóként marad, így a lecke elbukik.

## Elfogadás (EARS)
- **E1** A `bankItemRef` SHALL a zárójeles, a pontozott és az al-útvonalas alakot ugyanarra a tételre képezni (teszt).
- **E2** A limiten, kizárólag banktétel-blokkolóval a lektor-lépés SHALL a kapura lépni, a blokkolókat `choiceFlags`-ként továbbadva (teszt; a régi kódon hiba).
- **E3** A kapu SHALL kivenni a `tasks` tételt is, és publikálni, ha a bank megfelel; a 7.4 bizonyíték a kivett tételre mutató blokkolót SHALL elfogadni (teszt).
- **E4** A kapu SHALL NOT publikálni, ha a kivétel után a bank nem felel meg, vagy ha bármely blokkoló nem kivett banktételre mutat (teszt).
- **E6** A `bankUnitQuota` összege a tartalékkal SHALL ≥ 48 feladat és ≥ 80 kvíz legyen (teszt).
- **E5** Kapuk zöldek; élő újramérés ugyanazzal a témával: `done`, publikált lecke, a kivett tételek a naplóban.

## Review-kör (PR #139)
- **Codex P1 („a célkvótát a sémában is kényszerítsd ki”): tudatosan nem.** A célkvóta minimumként való kikényszerítése
  minden 45/75-ös csomagra újrapróbát kérne (többletköltség, és a bankgyártás gyakrabban bukna), és a meglévő 45/75-ös
  tesztcsomagokat is érvénytelenítené. A tartalék ezért best-effort: a modell a promptban a célkvótát kapja, a séma
  a minimumot és a célkvótás felső korlátot ellenőrzi. Ha a modell csak a minimumot adja, a viselkedés azonos a
  változás előttivel (a kapu nem publikál), tehát semmi nem romlik.
- **Copilot (az ugyanarra a tételre mutató bank-ellenőri és lektori jelzés): javítva.** A jelzés egyszer marad, de
  limit-eredetű lesz, így a kapu a limit-üzenettel bukik. Új teszt: „spec limit-banktetel (review)”, a javítás előtt bukott.
