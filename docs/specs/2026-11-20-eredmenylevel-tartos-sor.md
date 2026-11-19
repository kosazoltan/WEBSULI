# Eredménylevél — tartós szerveres küldési sor (tervvázlat, a pótlási terv T-3 szelete)

**Állapot:** tervvázlat, 2026-11-19 — kidolgozandó a pótlási terv T-3 szeletében
(`docs/specs/2026-11-19-websuli-potlasok-terv.md`, a `docs/websuli-potlasok` ágon).
Előzmény: `docs/specs/2026-11-17-eredmeny-email-kviz.md` (PR #510); tulajdonosi döntés (űrlap, 2026-11-19): „Szűkítés + tartós sor külön”.

## Cél

A szerver által ELFOGADOTT (202) végleges eredmény levele ne veszhessen el akkor sem, ha a levélküldés átmenetileg és tartósan
sikertelen (szolgáltatói hiba az első és az egyetlen újrapróbán), vagy ha a példány a 202 után, a háttérküldés előtt / közben leáll.
Ma a küldés és az újrapróba memóriában ütemezett (`server/lesson-result-email.ts`, `sendLessonResult` + `setTimeout`); a kliens a 202
után eldobja a törzset, ezért ilyenkor a levél végleg elmarad.

## Nem-cél

- A „félbehagyva” pillanatképek tartós tárolása (azok leállításkor kimennek, R14; újraindítás utáni elnyomás: R18).
- A címzettek köre és a levél tartalma (változatlan).
- Több szerverpéldányos ütemező / külső sorkezelő (elég egy DB-alapú munkatábla, amelyet minden példány ürít).

## Elfogadás (EARS)

- T3-E1 (a PR #510 3. gépi vak körének L1 lelete). AMIKOR a szerver egy végleges beküldésre 202-t adott, és utána az e-mail-szolgáltató
  átmenetileg hibát ad, vagy a folyamat újraindul, A RENDSZER helyreálláskor címzettenként pontosan egy helyes levelet küld, újabb tanulói
  művelet nélkül.
- T3-E2. Az ismételt (idempotens) beküldés nem hoz létre második munkát és második levelet.
- T3-E3. A munka lejár (pl. 7 nap), utána nem küld; a lejárt sor adata törlődik.
- T3-E4. A naplóba és a munkatáblába nem kerül több személyes adat, mint amennyi a levélhez szükséges.

## DB-séma (vázlat)

Új tábla, pl. `lesson_result_jobs`:

| Oszlop | Típus | Megjegyzés |
|---|---|---|
| `id` | `varchar` PK, `gen_random_uuid()` | |
| `lesson_id` | `varchar` NOT NULL, FK `lessons(id)` ON DELETE CASCADE | |
| `kind` | `varchar(8)` NOT NULL, CHECK `tasks` / `quiz` | |
| `round_key` | `char(64)` NOT NULL | a kézbesítés-nyilvántartás körkulcsa (`lesson_result_emails`) |
| `payload` | `jsonb` NOT NULL | a levél összeállításához szükséges minimum: pontozott eredmény, attribúció (név / vendég), fogadási idő |
| `attempts` | `integer` NOT NULL DEFAULT 0 | |
| `next_at` | `timestamptz` NOT NULL DEFAULT `now()` | következő kísérlet |
| `status` | `varchar(12)` NOT NULL DEFAULT `'pending'` | `pending` / `done` / `expired` |
| `expires_at` | `timestamptz` NOT NULL | |
| `created_at` | `timestamptz` NOT NULL DEFAULT `now()` | |

Egyedi index: (`lesson_id`, `kind`, `round_key`) — az idempotencia. A címzettenkénti foglalás marad a meglévő `lesson_result_emails.delivered`
mezőn (a munka csak újraindítja a küldést; a dupla kézbesítést a meglévő atomi foglalás zárja ki).

## Migráció ↔ Drizzle

- Új migrációs fájl a következő sorszámmal (ma az utolsó: `0043_lesson_tts_audio.sql`), additív és idempotens (`CREATE TABLE IF NOT EXISTS`,
  `CREATE UNIQUE INDEX IF NOT EXISTS`).
- A `shared/schema.ts`-ben a megfelelő `pgTable` (azonos oszlopnevek, típusok, alapértékek és index), a migráció és a séma egyezését a DB-
  futtató ellenőrzi: a `scripts/run-learning-db-tests.ts` a táblát a migrációs fájlból tölti (kétszer, az idempotencia miatt), mint a 0030-at.
- Indítás: a szerver induláskor és időzítve (pl. percenként, `unref`-elt időzítővel) üríti az esedékes munkákat; leállításkor nem kell
  üríteni (a munka megmarad). E2E-módban az ürítő a teszt-küldőt használja.

## Nyitott kérdések (a T-3 kidolgozásakor)

- A `payload` mennyi adatot tartalmazzon (a teljes levél-HTML vagy a pontozott eredmény), és mennyi ideig maradhat meg (adatvédelem).
- A kliens kimenő sora (PR #510, R24) maradjon-e a 202 utáni sor mellett (a 202 előtti veszteségre igen).
