# Terv — játékos-fiók egyedisége postafiókonként (normalizált Gmail-cím + egyedi index)

Tulajdonosi döntés **P-020** (2026-11-23): a játékos-fiók postafiókonként egyedi. Ugyanannak a postafióknak az aliasai
(Gmailnél pont a helyi részben, `+címke`, `googlemail.com`) EGY fióknak számítanak. A meglévő ütközéseket a rendszer NEM
vonja össze és NEM törli automatikusan, hanem listázza kézi összevonáshoz.

## Tény (main, 8b26289e)

- `source/migrations/0040_player_accounts.sql`: `player_accounts.email` `UNIQUE (email)` — a megadott, kisbetűsített cím
  (`codes.ts` `normalizeEmail`) a fiók kulcsa. `a.b+x@gmail.com` és `ab@gmail.com` így KÉT fiók lehet (review #445 K2 óta
  szándékosan; a korlátok és a tiltás már a kanonikus `limitKey`-en közösek).
- Fiók-létrehozás két helyen: `store.ts` `confirmVerifiedEmail` (kódos / linkes belépés) és `account-store.ts`
  `upsertGooglePlayer` (Google-út), mindkettő `INSERT … ON CONFLICT (email)`, a `lockBanCanonical` (limitKey-alapú
  advisory-zár) alatt.
- `limitKey` minden domainen levágja a `+címkét` — ez a korlát- / tiltáskulcs, NEM fiókkulcs.
- A migrációs futtató (`server/migrate.ts`) a „duplicate key” hibát csendben átugorja → egy sima `UNIQUE` index meglévő
  ütközésnél némán elmaradna. Ezért kell ütközés-biztos index.

## Döntések

1. **Fiókkulcs (`accountEmailKey`, `codes.ts`)** — konzervatív: CSAK `gmail.com` / `googlemail.com` címen: kisbetű, a
   `+címke` levágva, a pontok törölve a helyi részből, `googlemail.com` → `gmail.com`. Minden más domain: csak trim + kisbetű
   (a `+címke` MEGMARAD, mert más szolgáltatóknál nem garantált, hogy ugyanaz a postafiók). A `limitKey` változatlan
   (korlátok / tiltás továbbra is a tágabb kulcson).
2. **Séma (migráció 0045)**: `email_key` GENERÁLT (`GENERATED ALWAYS AS (…) STORED`) oszlop ugyanazzal a szabállyal SQL-ben —
   nem felejthető el beírni, a régi kód beszúrása is kitölti, a visszatöltés automatikus. `email_key_dup smallint NOT NULL
   DEFAULT 0`: a migráció a meglévő ütköző csoport sorait sorszámozza (legrégebbi 0, a többi 1, 2, …). Egyedi index a PÁRON:
   `player_accounts_email_key_unique ON (email_key, email_key_dup)` — meglévő ütközésen nem bukik, de minden új sor (0) ütközik
   a csoport legrégebbi sorával, így új alias adatbázis-szinten sem jöhet létre (a régi alkalmazáspéldányból sem); a kulcs
   szerinti keresést is kiszolgálja. (Az első változat részleges indexe — `WHERE NOT email_key_conflict` — a jelölt csoport
   mellé engedett volna új sort; Copilot review #554.) Egy csoporttag alkalmazáson belüli törlése (`deleteAccount`, saját és
   admin) után a megmaradt sorok sorszáma 0-tól újraszámozódik (Vercel review #554), hogy a 0-s hely ne szabaduljon fel.
   Alkalmazáson KÍVÜLI kézi SQL-törlésnél ezt az üzemeltetőnek kell megtennie (ugyanaz a két lépés, mint `renumberMailboxDuplicates`).
3. **Belépés**: a fiók feloldása `email_key` szerint (a kanonikus zár alatt). Van már fiók → AZ a fiók (a tárolt `email` nem
   íródik át; ütköző csoportnál a pontosan egyező cím, különben a legrégebbi); nincs → új sor. Google-út ugyanígy (ismert
   `sub` → az a fiók; különben `email_key` szerinti fiók, `google_sub` csak ha még nincs).
4. **Ütközés-lista**: admin végpont `GET /api/admin/game-accounts/email-collisions` — csoportonként a fiókok (azonosító,
   becenév, MASZKOLT cím, létrehozás, utolsó belépés, tiltott-e). A kulcs maga nem megy ki (cím-tartalmú). Kézi összevonás után
   a megmaradt sor jelölője maradhat (a lista csak a ≥ 2 sorú csoportokat mutatja).
5. **Admin-tiltás postafiókra** (review #554): a `users.is_banned` összevetése a `users.email` kanonikus kulcsán
   (`mailboxKeySql`) = a fiók `email_key`-e — belépéskor, a kérésenkénti őrben (`getPlayer`), az admin-listában és az adventi
   alany-feloldásban is. **Törlés**: a postafiók aliasaira kért, még be nem váltott kódok / linkek is törlődnek.
6. Naplóba valódi cím nem kerül; a tesztek szintetikus címekkel (`pelda.hu`, engedélylistás szintetikus Gmail-szavak).

## Elfogadás

- [ ] E1 WHEN `accountEmailKey` Gmail-aliast kap THEN SHALL `ab@gmail.com` alakot adni; más domainen a `+címke` megmarad.
- [ ] E2 WHEN egy Gmail-fiók aliasával (pont / `+címke` / googlemail) kódos belépés történik THEN SHALL ugyanaz a fiók-azonosító.
- [ ] E3 WHEN a Google-út aliasos címmel jön THEN SHALL a meglévő fiókhoz kötődni (nem új fiók).
- [ ] E4 WHEN két azonos `email_key`-ű nem jelölt sor kerülne be THEN SHALL az egyedi index elutasítani.
- [ ] E5 WHEN a 0045 meglévő ütközésen fut THEN SHALL nem bukni, nem törölni / összevonni, a sorokat jelölni; kétszer futtatva is.
- [ ] E6 WHEN az admin lekéri az ütközés-listát THEN SHALL a ≥ 2 soros csoportokat maszkolt címmel kapni; nem admin 401/403.
- [ ] E7 Az SQL-kifejezés és a TS-függvény ugyanazt adja (DB-teszt mintákon).

## Kockázat / visszaállítás

Additív migráció. Down: `DROP INDEX IF EXISTS player_accounts_email_key_unique; ALTER TABLE player_accounts DROP COLUMN
IF EXISTS email_key_dup, DROP COLUMN IF EXISTS email_key;` — csak a kód visszavonásával együtt.
