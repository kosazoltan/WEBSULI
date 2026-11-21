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

## A PR #510-ből átkerült böngészős tartós kimenő sor (tulajdonosi döntés, 2026-11-21)

A tulajdonos 2026-11-21-én űrlapon, szó szerint: „Szűkítés: tartós sor külön (Javasolt)”. A #510 böngészős TARTÓS kimenő sora
(`shared/result-outbox.ts`, a `client/src/lesson-runtime/resultReport.ts` sorkezelése, az induláskori ürítés a `client/src/App.tsx`-ben)
a kódban marad, de kapcsoló mögött áll, ALAPBÓL KI (`client/src/lib/resultOutboxFlag.ts`; élesben csak a build-idejű
`VITE_RESULT_OUTBOX_ENABLED=1` kapcsolja be). Ebben a szeletben kell véglegesíteni és bekapcsolni, a 202 utáni szerveres sorral együtt
tervezve. Átkerült terv-pontok: R24 (tartós sor, induláskori ürítés), R28 (írhatatlan tároló), R30 (korhatár), R31 / R35 (kilét-címke),
R32 (fülbiztosság); a #510-ben BE kapcsolóval futó böngészőtesztjeik: `R24 / L2`, `R28 / L4`, `R35 / L1`, `R39 / L1`, `R40 / L2`
(`source/tests/lesson-result-email-quiz.spec.ts`).

### Nyitott pontok (a #510 8. gépi vak köréből, e36518e5)

- **T3-N1 (L1, blokkoló a bekapcsolás előtt): a címke nélkül felvett bejegyzés megkaphatja egy később belépett fiók címkéjét.** Az
  `enqueuedHere` csak a dokumentumot azonosítja, a munkamenetet nem: ha a kör a sorba kerüléskor címke nélkül áll (nincs gyorsítótárazott
  token), és mire a lap első tokenválasza megjön, egy másik fülben más fiók lépett be, a bejegyzés az ő címkéjét kapja, a szerver pedig az
  ő nevén küldi. A #510 KI állásában részben kezelt (R43: tokenhiba utáni kísérletnél nincs utólagos pótlás), de a hiba nélküli, késői
  első tokenválasz ablaka megmarad. Javítási irány: a felvételkori kilét ellenőrizhető munkamenet-állapotból (pl. a felvételkor kötelező,
  a bejegyzéshez kötött tokenválasz vagy a szerver által aláírt munkamenet-azonosító); ha ez nem bizonyítható, `?`.
  Elfogadás: címke nélküli felvétel → token-502 / késői token → B fiók tokenje ugyanabban a dokumentumban → a levél nem B nevén megy.
- **T3-N2 (L4): a lejárt, lezárt kör friss időbélyeggel visszakerül a tartós sorba.** Az induló ürítés törli a 7 napnál régebbi
  bejegyzést, de a lecke újranyitásakor a helyreállított, lezárt kör (`finishedAt`) új bejegyzést kap `Date.now()` aktivitással, és
  elmegy. KI állásban nem áll elő (nincs tartós bejegyzés és induló ürítés). Javítási irány: a lejárati döntés körönkénti megőrzése
  (pl. a `sent` jelző mellett „lejárt” jelző) vagy a lezárásból képzett, változatlan aktivitási idő. Elfogadás: lejárat és törlés a
  főoldalon → vissza ugyanabba a lezárt leckébe → nincs új sor és nincs POST.
- **T3-N3:** a 44487292-es közbenső build közös kulcsú tömbje (#510 7. kör L5) — a feltétel a `docs/specs/2026-11-17-eredmeny-email-kviz.md`
  L5 pontjában; bekapcsolás előtt újra el kell dönteni.
