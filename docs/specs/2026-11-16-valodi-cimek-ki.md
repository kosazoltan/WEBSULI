# Terv — valódi e-mail-címek eltávolítása a nyilvános repóból + a #462 review N2–N4 lelete

**Dátum:** 2026-11-16 · **Kanban:** #57, #61 (első pont: #462 N2–N4) · **Ág:** `fix/valodi-cimek-ki`
**Végrehajtási utasítás:** `docs/specs/2026-11-16-valodi-cimek-ki-vegrehajtas.md`

## Háttér

A repó nyilvános (GitHub). Független audit (2026-11-16): a jelenlegi fában 7 helyen szerepel két valódi személy (a tulajdonos és
egy másik admin) Gmail-címe — három dokumentációban / archívumban és négy kódfájlban, ebből egy (`AdminDocumentation.tsx`) az éles
kliens JS-csomagba is bekerül. A címeket ez a terv sem írja ki: a helyeket fájl:sor alakban sorolja.

| # | Hely | Mire szolgál |
|---|---|---|
| 1 | `source/GOOGLE_AUTH_SETUP.md:22` | `.env`-minta: az `ADMIN_EMAIL` példaértéke |
| 2 | `docs/archive/memory-dead-vps-20260906/procedural__deploy__google-auth-setup.md:18` | archivált `.env`-minta, ugyanaz |
| 3 | `memory/projects/websuli/LEDGER.md:193` | napló: egy Resend-próbalevél címzettje |
| 4 | `source/server/scripts/setAdmin.ts:10` | kézi szkript: a beégetett cím kap admin-jelzőt (és beégetett név) |
| 5 | `source/client/src/pages/AdminDocumentation.tsx:860-861` | admin-dokumentáció szövege: „két adminisztrátor” címmel és névvel |
| 6 | `source/server/pushNotifications.ts:11` | VAPID `subject` (`mailto:`) a web-push JWT `sub` mezőjében |
| 7 | `source/server/routes.ts:3011` | ugyanaz a VAPID `subject` az admin teszt-push végponton |

A 6–7. hely NEM jogosultság: a `web-push` (3.6.7) a `subject`-et csak a push-szolgáltatónak küldött VAPID-JWT `sub` mezőjébe
teszi (`node_modules/web-push/src/vapid-helper.js` `getVapidHeaders`), kapcsolattartási adatként. A feliratkozás a kulcspárhoz
(`applicationServerKey` = `PUBLIC_VAPID_KEY`) kötött, ezért a subject cseréje a meglévő feliratkozásokat nem érinti.

## Cél

1. A jelenlegi fában (minden követett fájl) ne maradjon valódi személy e-mail-címe; a buildelt kliensben 0 találat.
2. A kód viselkedése élesben ne romoljon: a push tovább működik, a `setAdmin` szkript paraméterrel ugyanazt teszi.
3. Őr-teszt: új valódi cím ne kerülhessen vissza (engedélylistán kívüli cím → bukás fájl:sor üzenettel, cím nélkül).
4. A #462 review három alacsony súlyú lelete:
   - **N2:** a forrás-őr (`tests/admin-access-source-guard.test.ts`) az alapértékes destrukturálást
     (`const { isAdmin = false } = u`, `{ isAdmin: a = false }`) is fogja meg;
   - **N3:** az engedélylista `:`-ot tartalmazó eleme (pl. `mailto:` előtag) érvénytelen legyen (hangos, cím nélküli napló);
   - **N4:** az induláskori napló az engedélylistáról csak darabszámot és forrást írjon (maszkolt címet se).

## Nem-cél

- A git-történet átírása (filter-repo, rebase, force-push) — tulajdonosi döntés; ez a PR csak tájékoztat.
- Éles környezeti változó beállítása, éles adat módosítása.
- Az admin-engedélylista működésének bármely más változása (forrás `ADMIN_ALLOWLIST`, a kizárás elleni őr, a mátrix).
- A `docs/agent-csapdak.md` módosítása (csapda-javaslat a zárójelentésben).

## Megoldás

- **Dokumentáció (1–3.):** a cím helyén `<ADMIN_EMAIL>` / „az admin-címre” megfogalmazás; a szöveg értelme marad.
- **`setAdmin.ts` (4.):** a cím kötelező parancssori argumentum (`node --import tsx server/scripts/setAdmin.ts <email>`); hiányzó /
  hibás alakú cím → érthető hibaüzenet, exit 1, DB-kapcsolat nélkül. A beégetett név kikerül (az új sor `first_name` /
  `last_name` mezője üres; a Google-belépés tölti ki). A napló a címet maszkolva írja.
- **VAPID subject (6–7.):** új `server/lib/vapid-subject.ts`: `vapidSubject(env)` — a `VAPID_SUBJECT` környezeti változó, ha
  érvényes `mailto:<cím>` vagy `https://` URL; különben (nincs / hibás) a nem személyes `https://websuli.vip` (az éles domain;
  a `web-push` az `https:` subjectet elfogadja, RFC 8292 2.1). Hibás értéknél figyelmeztetés az érték kiírása nélkül. Mindkét hely
  ezt hívja. `.env.example`: kommentezett `VAPID_SUBJECT=` sor.
- **`AdminDocumentation.tsx` (5.):** általános szöveg: az admin-jogot az engedélylistán (`ADMIN_ALLOWLIST`) szereplő fiókok kapják;
  cím és név nincs a kódban.
- **Őr-teszt:** `source/tests/no-real-emails-guard.test.ts` — `git ls-files` a repó gyökeréből, lock-fájlok / `node_modules` /
  bináris fájlok kivételével; minden e-mail-alakú szövegrészt (Unicode-betűs helyi rész is) összevet egy indokolt engedélylistával:
  példa- és teszt-domainek, a projekt saját technikai domainjei (`websuli.vip`, `websuli.org`), technikai címek
  (`noreply@anthropic.com`, GitHub `users.noreply`), valamint a valódi szolgáltatói domainen (Gmail) lévő szintetikus
  teszt-címek PONTOS listája. Hibaüzenet: `fájl:sor` + maszkolt domain-nélküli jelzés, a cím nélkül. Ellenpróba a tesztben:
  egy futásidőben összerakott álcím a szűrőn megbukik.
- **N2:** új FORBIDDEN-minta: `\bisAdmin\s*=(?!=)` (alapértékes destrukturálás / értékadás), és az átnevezős-alapértékes alak a
  meglévő `isAdmin\s*:` mintán már bukik; ellenpróba-esetek bővítése. A meglévő engedélyezett sorok közül egyik sem illik az új
  mintára (`user.isAdmin = isAdminUser(user)` a `.isAdmin` miatt már eddig is találat volt, engedélyezve).
- **N3:** `EMAIL_RE` kizárja a `:`-ot is → a `mailto:x@y` elem érvénytelen (számolva), `ADMIN_EMAIL` esetén hangos hiba. A
  meglévő figyelmeztetés kiegészül a „`mailto:` előtag / kettőspont” utalással.
- **N4:** a sor: `admin-engedélylista forrása: <forrás>, <n> cím.` — cím nélkül.

## Edge case-ek

- `setAdmin` argumentum nélkül / `--help` / hibás alak → exit 1, használati sor; nem nyúl a DB-hez.
- `VAPID_SUBJECT` üres, szóközös, `mailto:` cím nélkül, `http://`, `javascript:` → alapérték + figyelmeztetés.
- Az őr-teszt git nélkül nem futhat — hangosan bukik (a CI-ban és helyben van git).
- Gmail-normalizálási tesztek szintetikus címei maradnak (pontos lista).
- N3: a felhasználói cím `:`-tal (gyakorlatilag nem fordul elő) nem lehet listás admin — szigorúbb irány.

## Elfogadás (EARS)

- AMIKOR a fán `git grep` fut a két valódi címre, AKKOR 0 találat van.
- AMIKOR a kliens build elkészül, AKKOR a `dist` kimenetében a két cím 0 találat.
- HA egy követett fájlba engedélylistán kívüli cím kerül, AKKOR a `no-real-emails-guard` teszt fájl:sorral bukik, a cím kiírása nélkül.
- AMIKOR a `setAdmin` argumentum nélkül fut, AKKOR exit 1 és használati üzenet.
- AMIKOR a `VAPID_SUBJECT` nincs beállítva, AKKOR a push a `https://websuli.vip` subjecttel konfigurálódik; HA be van állítva és
  érvényes, AKKOR azzal.
- AMIKOR a forrás-őr `const { isAdmin = false } = u` vagy `{ isAdmin: a = false }` sort lát, AKKOR bukik; a meglévő kód zöld.
- AMIKOR az engedélylista `mailto:` előtagú elemet tartalmaz, AKKOR az érvénytelen és számolva van; senki nem lesz általa admin.
- AMIKOR a szerver indul, AKKOR az engedélylista-sor nem tartalmaz `@`-ot.
- A `admin-access*` egységtesztek, a `test:learning-db` mátrix és az `admin-allowlist.spec.ts` e2e zöld.

<!-- acceptance-checklist -->
- [ ] 7 hely kitisztítva, `git grep` 0
- [ ] build-kimenet 0 találat
- [ ] őr-teszt + ellenpróba
- [ ] setAdmin argumentumos, teszttel
- [ ] VAPID subject környezeti változóból, alapérték, teszttel
- [ ] N2, N3, N4 teszttel
- [ ] lint / check / check:test / build / npm test / test:learning-db zöld
