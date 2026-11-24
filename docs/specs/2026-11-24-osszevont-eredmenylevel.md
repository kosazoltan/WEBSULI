# Összevont eredménylevél: szöveges feladatok + kvíz egy levélben (U4)

Forrás: tulajdonosi kérés, 2026-11-24 (feladat U4). A döntés az űrlapon született:

> „A leckében figyelmeztetés, levél csak a kettő együtt után; ha 7 napig nem pótolja, akkor a részleges eredmény megy el jelöléssel.”

Előzmény: `docs/specs/2026-11-17-eredmeny-email-kviz.md` és a B-szeletek (`2026-11-22-eredmeny-email-bontas-vegrehajtas.md`). Ma a `POST /api/lessons/:lessonId/result` a `kind: "tasks"` és a `kind: "quiz"` végleges beküldésére **két külön levelet** küld.

## Viselkedés

1. **Egyrészes lecke.** Ha a leckében csak szöveges feladat vagy csak kvíz van, minden marad a régiben: egy levél, azonnal.
2. **Kétrészes lecke, az első rész kész.** A szerver nem küld levelet: a végleges eredményt tartósan félreteszi (új tábla, lásd lent). A válasz `awaiting: "tasks"` vagy `awaiting: "quiz"`. A kliens a lecke végén és a lecke tetején figyelmeztet: „Az eredményedet akkor küldjük el, ha a szöveges feladatokat / a kvízt is megcsinálod.”
3. **Kétrészes lecke, a második rész is kész** (ugyanaz a tanuló, ugyanaz a lecke, 7 napon belül). Egyetlen **összevont levél** megy két szakasszal (Feladatok és Kvíz), közös összesítővel. Mindkét félretett sor `sent`.
4. **7 nap után sincs párja.** Egy tartós söprő (óránként és induláskor) elküldi a félretett részt egyedül, jelöléssel: „Csak a kvíz készült el — a szöveges feladatok hiányoztak” (vagy fordítva).
5. **Ismétlés.** Ha a tanuló ugyanabból a részből újabb végleges kört ad be, mielőtt a pár elkészült, a **legutóbbi** kör marad félretéve. Az összevont levél a legutóbbi két részt viszi.
6. **Azonosság és idempotencia** (review #583).
   - A tanuló a meglévő tulajdonoskulcs (`who`). Mindkét beküldési út ugyanazt a kulcsot adja a párosítónak: a vendég és a fiók nélküli `POST …/result`, valamint a bejelentkezett tanuló gyakorlókör-útja (`sendPracticeResult`).
   - Az összevont út a B5a kapcsolójától (`RESULT_PARTIAL_EMAIL`) **függetlenül** mindig lefuttatja a tulajdonos-ellenőrzést.
   - A körök felhasználását tartósan rögzíti: a félretett sor `sent_at` után is megmarad, a kör azonosítójával együtt. Egy már elküldött párban szereplő kör ismételt beküldése nem képez új párt; a válasz `alreadySent`.
   - Az összevont levél idempotencia-kulcsa a két kör kulcsából képződik. A kézbesítés pótlása ugyanezzel a kulccsal megy, a szolgáltatói deduplikáció is erre épül.
   - **Zárolás:** a félretétel, a párosítás és a söprő ugyanazt a tranzakciós zárat veszi fel a `(lesson_id, owner_key)` párra (`pg_advisory_xact_lock`). Így két egyszerre, két külön példányon érkező első beküldés sem zárulhat mindkettő pár nélkül. Sorzár (`FOR UPDATE`) nem elég, mert üres várakozóállapotból nincs mit zárolni.
7. **Kapcsoló:** `RESULT_COMBINED_EMAIL`. KI állapotban a régi kétlevelű viselkedés bájtra marad.
   - Az U4b–U4d szeletek alatt az alapérték mindenhol **KI**. Így a félkész folyamat (söprő és figyelmeztetés nélkül) nem élesedik (review #583).
   - Az **U4e** szelet állítja át az alapértéket: élesben (`NODE_ENV=production`) beállítás nélkül BE. Az explicit `on` vagy `off` mindig nyer.
8. A „félbehagyva” kvíz-pillanatkép (B5a, `RESULT_PARTIAL_EMAIL`) független marad. Ez nem végleges eredmény, és nem vesz részt a párosításban.

## Adatmodell

Új tábla: `lesson_result_pending`:
- mezők: `id`, `lesson_id`, `owner_key`, `kind` (`tasks` | `quiz`), `round_id`, `graded jsonb`, `learner jsonb` (név, keresztnév, vendég-e, címzett), `created_at`, `sent_at`, `sent_reason` (`pair` | `timeout`);
- egyedi: `(lesson_id, owner_key, kind)` WHERE `sent_at IS NULL` (részenként egy nyitott sor; az újabb kör felülírja).

A migráció additív. Valódi cím nem kerül a repóba (nyilvános repó).

## Elfogadás

- E1: WHEN egyrészes lecke THEN egy levél azonnal (változatlan).
- E2: WHEN kétrészes lecke, csak a kvíz kész THEN nincs levél, `awaiting: "tasks"`, egy nyitott sor.
- E3: WHEN utána a feladatok is készek (7 napon belül) THEN pontosan egy összevont levél megy mindkét szakasszal, és mindkét sor `sent (pair)`.
- E4: WHEN 7 nap telt el pár nélkül THEN a söprő egy jelölt részleges levelet küld (`sent (timeout)`); az újraindítás után is.
- E5: WHEN ugyanabból a részből újabb kör érkezik THEN a nyitott sor a legutóbbira cserélődik; az összevont levél a legutóbbit viszi.
- E6: WHEN a kapcsoló KI THEN a régi kétlevelű viselkedés (a meglévő tesztek változatlanul zöldek).
- E7: A kliens `awaiting` esetén a lecke végén és tetején figyelmeztet; a másik rész kész jelzése után a figyelmeztetés eltűnik.
- E8: Versenyhelyzet: üres várakozóállapotból két rész egyszerre érkezik, két külön DB-kapcsolaton → pontosan egy összevont levél, egyik rész sem marad pár nélkül (közös tanácsadó zár).
- E9: A bejelentkezett tanuló gyakorlókör-útja (`sendPracticeResult`) ugyanazon a párosítón megy át, ugyanazzal a tulajdonoskulccsal: a fiókos feladat + kvíz pontosan egy összevont levél, és a kliens az `awaiting`-et is megkapja.
- E10: WHEN egy már elküldött párban szereplő kört újra beküldenek, akár egy új másik résszel THEN nincs új összevont levél, a válasz `alreadySent`.
