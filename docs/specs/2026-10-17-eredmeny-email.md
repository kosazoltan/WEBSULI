# Tanulói eredmény e-mailben az adminoknak (strukturált leckék) — terv

**Tulajdonosi kérés (2026-10-17):** „Nem a felhasználói panelhez, hanem a motorháztető alá tartozik. Amikor a tanuló kitölti a
szöveges feladatot és a tesztet, azok eredményét küldje el e-mailben a két adminnak.”

## Tények (a kódból, 2026-10-17)
- **Szöveges feladatok** (`LessonExperienceView.tsx`, „Feladatok kiértékelése”):
  - a pontozás teljesen a kliensen fut (`evaluateOpenAnswer`, `shared/lesson-experience-score.ts`), a válaszok csak a
    localStorage-ben vannak;
  - befejezéskor semmi nem megy a szerverre (csak a választott szöveges válaszokra az arbiter-hívás).
- **Kvíz:**
  - vendégnél és lecke-azonosító nélkül helyi, a kliens pontoz;
  - bejelentkezett tanulónál a szerver számolja és menti (`finishPractice`, `lesson_attempts`).
- **Admin e-mail:** csak a régi HTML-anyagoknál van (`POST /api/material-result`):
  - címzettek: `resolveAdminRecipients` (`ADMIN_EMAILS` / `ADMIN_EMAIL`);
  - küldés: `sendAdminNotification` (Resend), naplózva az `email_logs` táblába;
  - korlát: 10 / 15 perc / IP, eredet-engedélylista.
  A strukturált leckékre nincs ilyen.
- **Admin jogú felhasználó** az adatbázisban 3 van; a „két admin” tehát az `ADMIN_EMAILS` címlistája (a régi
  eredményküldés címzettjei). Hogy az éles `ADMIN_EMAILS` a két címet tartalmazza-e, azt a tulajdonos erősíti meg (titkos
  környezetet nem olvasunk).

## Cél
1. **Automatikus beküldés, külön gomb nélkül:**
   - **Szöveges feladatok:** a „Feladatok kiértékelése” után a kliens a válaszokat beküldi:
     `POST /api/lessons/:lessonId/results`, `{ kind: "tasks", roundId, answers: { [taskId]: string } }`.
   - **Helyi kvíz:** a „Kvíz kiértékelése” után ugyanígy: `{ kind: "quiz", roundId, picks: { [questionId]: number } }`.
   - **Bejelentkezett tanuló kvíze:** a szerver a `finishPractice` első lezárásakor maga küld; kliens-beküldés nincs.
2. **A szerver újrapontoz:**
   - a beküldött válaszokat a tárolt, publikált lecke `experience` adataiból pontozza: feladatnál a megosztott
     `evaluateOpenAnswer`, kvíznél a `correctIndex`;
   - a kliens pontszámát nem fogadja el;
   - ismeretlen feladat- vagy kérdés-azonosítót figyelmen kívül hagy.
3. **E-mail a címlistának** (`ADMIN_EMAILS`, egy levél címzettenként):
   - **tárgy:** `[WebSuli eredmény] <lecke címe> — Feladatok|Kvíz — <százalék>% (<osztályzat>)`;
   - **törzs:** a lecke címe, évfolyama és linkje; a tanuló (bejelentkezettnél név, vendégnél „Vendég tanuló”); a pontszám és
     az osztályzat; feladatonként a kérdés, a tanuló válasza és az állapot (✅/🟡/❌), kvíznél a hibás kérdések listája;
   - minden szöveg HTML-escape-elve.
4. **Védelem:**
   - ismétlődés ellen egyedi kulcs: `(lesson, kind, roundId)`, a `lesson_result_emails` táblában, ezért ugyanaz a kör nem
     küld kétszer;
   - IP-nkénti korlát;
   - eredet-engedélylista (mint a `material-result`-nél), CSRF helyett, vendég miatt;
   - méretkorlát: válaszonként legfeljebb 2000 karakter, legfeljebb 60 feladat vagy 100 kérdés;
   - a küldés hibája nem rontja el a tanuló felületét („háttér”).
5. **Napló:** a meglévő `email_logs` (a `sendAdminNotification` írja), valamint a `lesson_result_emails` sor az ismétlésvédelemhez.

## Nem-cél
- Felhasználói felület (gomb, visszajelzés a tanulónak). A tulajdonos kifejezetten a háttérbe kérte.
- A régi HTML-anyagok eredményküldése (az már működik).
- Az eredmények statisztikai tárolása, riportja.

## Szélső esetek
- **Nincs címzett vagy a Resend nincs beállítva:** a beküldés 202-t kap; a szerver figyelmeztet a naplóban, levél nem megy, a
  tanulót ez nem érinti.
- **A lecke nincs publikálva, vagy nincs `experience`:** 404, levél nincs.
- **Üres válaszok:** a feladat ❌ „nem válaszolt”; ha minden üres, akkor sem küld (nincs érdemi eredmény).
- **Ugyanaz a kör újraküldve** (frissítés, hálózati ismétlés): az egyedi kulcs miatt nincs második levél.
- **Új kör** (újragenerált feladatsor): új `roundId`, új levél.

## Elfogadás (EARS)
- HA egy tanuló befejezi a szöveges feladatokat, AKKOR minden `ADMIN_EMAILS`-címre egy levél megy a szerver által újrapontozott
  eredménnyel.
- HA egy tanuló befejezi a kvízt (vendégként vagy bejelentkezve), AKKOR ugyanígy egy levél megy.
- HA ugyanaz a kör kétszer érkezik, AKKOR csak egy levél megy.
- HA a kliens hamis pontszámot küldene, AKKOR a levélben a szerver pontozása szerepel (a kliens pontszámát nem fogadja).
