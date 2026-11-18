# Eredmény-e-mail S2: atomi kézbesítés-foglalás + a bejelentkezett felhasználó kvíze az utolsó válasznál is küld

**Állapot:** kész, PR előtt – 2026-11-17, ág `fix/eredmeny-email-foglalas`
Végrehajtási utasítás: [`2026-11-17-eredmeny-email-foglalas-vegrehajtas.md`](2026-11-17-eredmeny-email-foglalas-vegrehajtas.md)
Előzmény: [`2026-10-17-eredmeny-email.md`](2026-10-17-eredmeny-email.md); S1: `2026-11-17-eredmeny-email-kviz.md` (ág
`fix/eredmeny-email-kviz` — a helyi kvíz és a levél tartalma).

Tulajdonosi hibajelentés (2026-11-17): „…csak a szöveges feladatok eredményeit küldi el a tananyag a szülőknek, a kvíz eredményét
nem.” Független review (M1/2, K2): a bejelentkezett (Google-fiókos) felhasználó szerveres kvíze továbbra is csak a „Kvíz
kiértékelése” gombra küld; ehhez előbb az ismert kézbesítési versenyhelyzetet kell megszüntetni.

## Cél

1. **Atomi foglalás a küldés ELŐTT** (`server/lesson-result-email.ts`, `sendLessonResult`): két egyidejű hívás ugyanarra a körre
   címzettenként pontosan egy levelet küld.
2. **A szerveres kvíz az utolsó válasznál is küld** (`server/rewards/lesson-attempts.ts`, `answerPractice`): ha a kör minden
   kérdésére van válasz, a levél a lezárás nélkül is elindul; a későbbi lezárás nem küld másodszor.

## Nem-cél

- Adatbázis-séma változása: NEM kell (lásd lent) — nincs migráció, a Drizzle-séma változatlan.
- A kör automatikus lezárása (jutalom, kupon): a lezárás a tanuló döntése marad.
- A helyi (vendég) kvíz és a levél tartalma (S1), a félbehagyott kvíz (S1 folytatása).

## A felderítés tényei (útvonalak a `source/` alatt)

- Versenyhelyzet: `server/lesson-result-email.ts:48-66` — a sor beszúrása (`onConflictDoNothing`) után a hívó KIOLVASSA a
  `delivered` listát (`:56-57`), elküldi a hiányzóknak (`:63`), és csak UTÁNA írja vissza (`:65`). Két egyidejű hívás mindkettő
  üres listát olvas → címzettenként két levél. Kiváltók: újratöltés a kérés közben, két fül, a szerveres kvíz 6 egyidejű
  `finish` hívása (`tests/learning-db.integration.ts:122` ezt a mintát méri), és ezután az „utolsó válasz + gyors lezárás”.
- A `lesson_result_emails.delivered` oszlop `text[]` (`shared/schema.ts:1170`, `migrations/0030_lesson_result_emails.sql`), a sor
  körönként egyedi (`lesson_result_emails_round_unique`).
- A szerveres kvíz csak a `finishPractice` végén küld (`server/rewards/lesson-attempts.ts:151`); az `answerPractice` (`:91-107`)
  nem. A felület (`client/src/lesson-runtime/SavedLessonQuiz.tsx:89-96`) kérdésenként azonnal visszajelez, a gomb nem kötelező.

## Megoldás

**Foglalás séma nélkül:** címzettenként egy feltételes, atomi módosítás:
`UPDATE lesson_result_emails SET delivered = array_append(delivered, $cím) WHERE id = $sor AND NOT ($cím = ANY(delivered)) RETURNING id`.
A PostgreSQL sorzára miatt két egyidejű hívásból pontosan egy kap sort vissza — az küld. Ha a küldés elbukik, a foglalás
felszabadul (`array_remove`), a címzett a következő azonos hívással vagy a meglévő 60 s-os újrapróbával pótolható (a #280-as
viselkedés megmarad). A `delivered` jelentése így: „kézbesítve VAGY éppen küldés alatt”.

**Miért nem kell migráció (és mi az ára):** külön „foglalva ekkor” oszloppal a folyamat összeomlása utáni beragadt foglalás
időkorláttal feloldható volna. Enélkül, ha a szerver a foglalás és a küldés vége között áll le, az a címzett azt a levelet nem
kapja meg. Ez a kockázat ma is fennáll rokon alakban (a sikertelen küldés 60 s-os újrapróbája memóriában él, leálláskor elvész),
az ablak a levélküldés ideje (másodpercek), a telepítés pedig futás közben tilos. Döntési pont: (A — megvalósítva) séma nélkül;
(B) `claimed_at` oszlop migrációval, ha a tulajdonos a leállás alatti levélvesztést is ki akarja zárni.

**Szerveres kvíz:** az `answerPractice` a mentés után — ha a kör aktív és minden kérdésre van válasz — a tranzakció lezárulta
UTÁN, a háttérben meghívja a `sendPracticeResult`-ot (ugyanaz a körkulcs: `practice` + kísérlet-azonosító, mint a lezárásnál).
A lezárás hívása ezután a foglalás miatt nem küld újra. A válasz mentése a levéltől nem függ (a hiba csak napló).

## Edge case-ek

- Két egyidejű `sendLessonResult` ugyanarra a körre → címzettenként 1 levél; az egyik hívás `{ sent: n }`, a másik `{ sent: 0, duplicate: true }`.
- Az egyik címzett küldése elbukik → a foglalása felszabadul; a következő hívás csak neki küld.
- Utolsó válasz, majd azonnal lezárás (a levél még úton van) → 1 levél.
- Ugyanaz az utolsó válasz kétszer (idempotens újraküldés) → a második hívás a már meglévő választ adja vissza, nem küld.
- Hiányos kör lezárása a kihagyásokkal → a lezárás küld (változatlan).
- Nincs címzett (`ADMIN_EMAILS` üres) → nincs foglalás, nincs levél (változatlan).

## Elfogadás (EARS)

- E1. AMIKOR két hívás egyidejűleg küldi ugyanazt a kört, A RENDSZER címzettenként pontosan egy levelet küld.
- E2. AMIKOR egy címzett küldése elbukik, A RENDSZER a foglalását felszabadítja, és a következő hívás csak neki küld.
- E3. AMIKOR a bejelentkezett tanuló a szerveres kvíz utolsó kérdésére válaszol, A RENDSZER lezárás nélkül elküldi az eredményt.
- E4. AMIKOR a tanuló ezután lezárja a kört, A RENDSZER nem küld második levelet.
- E5. A meglévő tesztek (`lesson-result-email-db`, `learning-db`) módosítás nélkül zöldek; a séma és a migrációk változatlanok.

<!-- acceptance-checklist -->
- [x] E1 – párhuzamos küldés → egy levél címzettenként (valódi DB)
- [x] E2 – bukott címzett foglalása felszabadul, pótolható
- [x] E3 – szerveres kvíz: az utolsó válasz küld
- [x] E4 – az utána jövő lezárás nem küld újra
- [x] E5 – meglévő tesztek zöldek, séma változatlan

## Független review (2026-11-17) — K1–K3, ebben a szeletben javítva

- **Döntés:** az A út (séma és migráció nélkül) — az orkesztrátor 2026-11-17-i döntése.
- **K1:** a levél a foglalás ELŐTT áll össze; a nem kézbesített címzett foglalásának felszabadítása `finally` ágban fut — kivétel
  (adatbázis, küldő) után sem ragad be foglalás.
- **K2:** a levélküldés köré 30 s-os időkorlát kerül (`withSendTimeout`; a Resend SDK 6.6.0 `dist/index.mjs` fájljában időkorlát /
  megszakító jel nem található); lejáratkor a küldés bukottnak számít: a foglalás felszabadul, a meglévő 60 s-os újrapróba pótol.
  Vállalt következmény: ha a szolgáltató az időkorlát UTÁN mégis kézbesít, az újrapróba második levelet küldhet ugyanannak a
  címzettnek (ritka; a levélvesztésnél kisebb baj).
- **K3:** a `catch` csak a hiba osztályát és kódját naplózza (`errorClass`) — a lekérdezés hibaüzenete a paramétereket is tartalmazná.
- Tesztek (valódi DB, 200 / 200): kivétel a foglalás után → nincs beragadt foglalás, a következő hívás pótol; lefagyott küldő →
  az időkorlát után felszabadul, a másik címzett megkapja; adatbázishiba → a naplósorban nincs `@`. Mutáció: a felszabadítás
  kikapcsolva → 4 teszt bukik; a nyers hiba naplózva → a K3 teszt bukik. A K2 időkorlát elhagyásával a teszt nem tér vissza
  (nem futtatva: a harness 300 s-os korlátjáig állna).
- **Második visszanézés (2026-11-17):** (1) `idempotencyKey` a szolgáltató felé (`resultIdempotencyKey`: lecke + fajta + körkulcs +
  címzett lenyomata; a `sendAdminNotification` opcióként adja át, a többi hívó változatlan) — az időkorlát utáni újrapróba így nem
  kézbesít másodszor, ha az első küldés mégis célba ért; (2) az egyszeri újrapróba a külső `catch` ágban is ütemeződik. Valódi DB:
  202 / 202. Jegyre: kanban #127 (az `errorClass` a három régi naplósorban), #128 (véglegesült, de a válasz elveszett foglalás).
- **PR #495 (Codex P2, 2026-11-18):** ha a küldés bukik ÉS az `array_remove` is átmeneti adatbázishibát kap, a címzett a `delivered`
  listában ragadt volna. Javítás: `releaseClaim` — 3 kísérlet növekvő várakozással; végleges kudarcnál egy naplósor `errorClass`-szal.
  A végleg nem helyreállítható esetet a kanban #128 fedi. Teszt hibainjektálással (az első felszabadítás dob, a második sikerül → a
  következő hívás ténylegesen küld; tartós hiba → 3 kísérlet, cím nélküli naplósor). Valódi DB: 204 / 204; mutáció (1 kísérlet): 2 teszt bukik.
