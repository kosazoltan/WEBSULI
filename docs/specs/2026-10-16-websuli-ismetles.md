# Websuli Design — memóriakártya és ismétlés-ütemezés a lecke-lejátszóban — terv

Tulajdonosi kérés (2026-10-16): a Websuli Design implementációját végig kell vinni. A `2026-10-16-websuli-design.md`
terv 4. döntése a memóriakártyát és az ismétlés-ütemezést, valódi mentéssel, külön szeletbe tette. Ez az a szelet.

Forrás: `docs/design/Websuli_Design_AI_Implementacios_Utasitas.md`:
- §3: memóriakártya, értékelés mentése tanulási eseményként, ismétlés;
- §6: a `FlashCard` mintakomponens és az éles használat szabályai;
- §7: az ütemezés és az adatséma;
- §8: hozzáférhetőség.

A vizuális minta a `docs/design/Websuli_Design.html` „Memorizálókártya” csempéje: `.flash`, `.actionrow`, `.result`.

## Cél
- A fúziós lecke kap egy ötödik fület: **Ismétlés**. Ezen memóriakártyák vannak:
  - az előlapon a kérdés, a hátlapon a megoldás;
  - a megfordítás valódi `button`, Enter/Space-szel és érintéssel is működik;
  - két önértékelés van: **Még gyakorlom** és **Már tudom**.
- A kártyák a lecke saját, már ellenőrzött anyagából készülnek, determinisztikusan. Új MI-tartalom nem kell.
  - A kvíz felidéző kérdései (`intent` nincs vagy `"recall"`): előlap `question`, hátlap `options[correctIndex]`. Az
    azonosító `q:<quiz.id>`.
  - A nyelvi lecke szószedete: előlap `word`, hátlap `translation`. Az azonosító `g:<index>`.
- Az ütemezés külön, tesztelt modul (`shared/review-schedule.ts`), a §7 MVP-algoritmusa szó szerint:
  - `again`: 10 perc múlva újra esedékes, az ismétlésszám 0;
  - `known`: 1 nap, utána duplázódik, legfeljebb 60 nap.

  ISO 8601 időpontot tárol; a megjelenített dátum `hu-HU` formátumú. Az algoritmus később cserélhető.
- **Bejelentkezett tanuló (valódi mentés):**
  - `review_states`: tanuló × lecke × kártya, egy aktuális állapot;
  - `review_events`: minden értékelés egy tanulási esemény.

  Az új állapotot a szerver számolja a saját órájával. A kliens csak az értékelést küldi. A kártya „Mentve” jelzést csak
  sikeres szerverválasz után kap. Hibánál újrapróbálás gombot kap, és az állapot nem lép tovább.
- **Vendég (nincs bejelentkezés):** az állapot a böngészőben marad (`localStorage`), és a felület ezt kiírja: „Vendégként
  gyakorolsz: az ismétlés csak ezen az eszközön, ebben a böngészőben marad meg.” Szerverre semmi nem megy.

## Nem-cél
- A tanulói keret (irányítópult, tantárgykártyák, `StudyPlan`). Ez a tulajdonosi döntés szerint a hatókörön kívül esik.
- Az FSRS / SM-2. A §7 szerint később komponensként cserélhető.
- Nem fúziós (régi, `experience` nélküli) lecke. Ott nincs ellenőrzött kérdés–válasz pár, ezért fül sincs.
- Tanári riport az ismétlésből.

## Érintett fájlok
- **C szelet (adat, szerver):**
  - `shared/review-schedule.ts`, `shared/lesson-flashcards.ts`;
  - `shared/schema.ts` (`reviewStates`, `reviewEvents`), `migrations/0027_review_states.sql`;
  - `server/rewards/review-store.ts`, `server/rewards/review-router.ts`, `server/studio/lesson-routes.ts` (felcsatolás);
  - tesztek: `tests/review-schedule.test.ts`, `tests/lesson-flashcards.test.ts`, `tests/review-db.integration.ts`,
    `scripts/run-learning-db-tests.ts`.
- **D szelet (felület):**
  - `client/src/lesson-runtime/FlashcardReview.tsx`, `LessonExperienceView.tsx` (ötödik fül), `lesson-design.css`;
  - teszt: `tests/lesson-flashcards.spec.ts`.

## Rögzített döntések
- **Kulcs:** `lessons.id` (a mentett gyakorlókör mintájára, `lesson_attempts`). Új leckeverzió új állapotot jelent.
- **Jogosultság:** a szerver csak publikált leckét fogad el. A kártya-azonosítót a lecke JSON-jából újraszámolja; ismeretlen
  azonosító 400. Más tanuló állapota nem olvasható (minden lekérdezés `user_id`-re szűr).
- **Adattakarékosság (§7):** csak azonosítók, értékelés (`again` | `known`) és időpontok. Szöveget nem tárol.
- **Párhuzamosság:** tanuló × lecke advisory lock, egy tranzakcióban esemény és állapot.
- **Sorrend:**
  - először az esedékes kártyák (`dueAt <= most`), a legkorábbi elöl;
  - utána az új kártyák a lecke sorrendjében;
  - a nem esedékesek nem kerülnek elő („Mára kész” és a következő esedékesség `hu-HU` szerint).

## Szélső esetek
- **Kártya nélküli lecke** (nincs felidéző kvíz, nincs szószedet): a fül nem jelenik meg.
- **Kijelentkezés közben (401):** a felület vendég módra vált, ezt kiírja, és a szerveres állapotot nem keveri a helyivel.
- **Hálózati hiba:** „Nem sikerült menteni” és újrapróbálás. A kártya nem lép tovább.
- **Gyors dupla kattintás:** a gombok a mentés alatt tiltottak.
- **Régi lecke leckeverzió-váltással:** a régi `card_id`-k a régi `lesson_id` alatt maradnak, nem okoznak hibát.
- **11–12. o. sötét téma:** a kártya a téma tokenjeiből színez, a kontraszt mérve.

## Elfogadás (EARS)
- HA a fúziós leckének van felidéző kvíze vagy szószedete, AKKOR megjelenik az „Ismétlés” fül, és a kártya Enterrel,
  Space-szel és kattintással is megfordul (`aria-pressed`, látható fókusz).
- HA bejelentkezett tanuló „Már tudom”-ot választ, AKKOR egy `review_events` sor és a `nextReview` szerinti
  `review_states` állapot jön létre, és a felület csak a 200-as válasz után írja ki: „Mentve”.
- HA a mentés hibázik, AKKOR a felület hibát és újrapróbálást mutat, és nem ír ki mentett állapotot.
- HA vendég értékel, AKKOR szerverkérés nincs, és a felület kiírja, hogy az ismétlés csak ezen az eszközön marad meg.
- `nextReview` egységtesztje a §7 képletét fedi (10 perc, 1 → 2 → 4 … ≤ 60 nap, `again` nullázás).
- Ismeretlen kártya, publikálatlan lecke vagy más tanuló adata: 400 / 404, a DB-tesztben valódi Postgresszel.
- Mind az öt témában, 390 / 768 / 1440 px-en: nincs kilógás, a kártya szövege ≥ a téma minimuma, a gombok kontrasztja
  ≥ 4,5:1.
