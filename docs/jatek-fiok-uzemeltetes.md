# Játékos-fiók (PLAYER_ACCOUNTS) — üzemeltetési figyelőlista

A játékos-fiók élesben be van kapcsolva (`PLAYER_ACCOUNTS=on`). Ez a lap a bekapcsolás utáni napi / heti figyelést írja le:
melyik naplósor mit jelent, és mi a teendő. A naplóban e-mail-cím soha nem szerepel (csak maszkolva); kód, token soha.
Háttér: `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md` „JM7b-utójavítás K1 / K1b”, titokrotáció:
`docs/security-secret-hygiene-2026-09-13.md`.

## Figyelendő naplósorok (Render-napló, `[PLAYER]` előtag)

| Naplósor | Jelentés | Teendő |
|---|---|---|
| `[PLAYER] kulcsrotáció: N régi kulcsú tiltás-ujjlenyomat megőrizve (a törölt fiókok tiltása ezekre nem érvényes)` (warn) | Az adatbázisban más kulccsal (`PLAYER_BAN_KEY`, ennek hiányában a `SESSION_SECRET`) készült, TÖRÖLT fiókhoz tartozó tiltás-ujjlenyomat is van: vagy kulcsváltás történt, vagy egy MÁSIK, eltérő titkú szerverpéldány (pl. helyi fejlesztés, előnézet) írt az éles adatbázisba. A sorok nem törlődnek (12 hónap után a megőrzés-takarító viszi el őket). Az ÉLŐ fiókok tiltását ez nem érinti (az kulcstól független). | Ha nem volt szándékos kulcsváltás: derítsd ki, melyik példány csatlakozik az éles adatbázishoz más titokkal, és állítsd le. |
| `[PLAYER] PLAYER_BAN_KEY nincs beállítva — …` (info, induláskor) | A törölt fiókok ujjlenyomata a `SESSION_SECRET`-ből levezetett kulccsal készül, így a munkamenet-titok rotációja érvényteleníti őket. | Javasolt: állíts be egy külön, stabil `PLAYER_BAN_KEY`-t (Render → Environment) MÉG mielőtt törölt-tiltott bejegyzés keletkezik; a beállítás után a korábbi sorok nem illenek (a fenti warn jelzi). |
| `[PLAYER] tiltás-ujjlenyomat lejárt és törölve: N` | A 12 hónapnál régebbi, törölt fiókhoz tartozó tiltások megszűntek (tulajdonosi döntés). | Nincs. |
| `[PLAYER] kódrekord-takarítás hiba:` / `tiltás-ujjlenyomat számlálás hiba:` / `… megőrzés-takarítás hiba:` | Az óránkénti takarító egyik lépése hibára futott (a többi ettől lefut). | Ismétlődve: adatbázis-kapcsolat / jogosultság ellenőrzése. |
| `[PLAYER] belépőkód-kérés címenkénti korláton:` / `a belépő levelek napi szerverszintű plafonja betelt (PLAYER_LOGIN_EMAIL_DAILY_MAX)` | Egy címre túl sok kódkérés (alias-címek is ugyanannak számítanak), ill. a napi levélplafon betelt — a küldés szünetel. | Sok egymás utáni: visszaélés gyanúja; a plafon emelése csak tudatos döntéssel. |
| `[PLAYER] törlési kód korláton` / `a törlés-értesítők napi plafonja betelt` | Törlési kód vagy törlés-értesítő a keretnél. | Ritkán várható. |

**Becenév-elutasítás aránya:** a `POST /api/player/profile` `400 BAD_NICKNAME` válaszainak aránya (Render-napló / HTTP-statisztika).
Tartósan magas arány (pl. a kérések > 30 %-a) hamis tiltásra utalhat — ilyenkor a konkrét neveket a tulajdonos jelezze, és a
szűrő ellenpróba-listája bővüljön (`tests/nickname-filter.test.ts`).

## Csak olvasó ellenőrző lekérdezés (heti)

```sql
SELECT count(*) AS ujjlenyomat, count(DISTINCT key_id) AS kulcsok FROM player_ban_fingerprints;
```

A `kulcsok` értéke **1** legyen (vagy 0, ha nincs törölt-tiltott bejegyzés). 1-nél több: kulcsváltás óta még nem járt le minden
régi sor, vagy egy eltérő titkú példány írt az adatbázisba (lásd fent). (Az élő tiltott fiókokhoz nincs ujjlenyomat — azok a
`player_accounts.banned_at`-ben élnek.)

## Helyi fejlesztés

A `source/.env` `DATABASE_URL`-je jelenleg az ÉLES adatbázisra mutat. Helyi szervert csak a `DEV_DATABASE_URL` (fejlesztői
adatbázis) beállításával indíts. A tiltás-karbantartás (számlálás, megőrzés-takarítás) helyi indításkor nem fut
(`NODE_ENV≠production`, kivéve `PLAYER_BAN_MAINTENANCE=on`), de a többi indulási feladat (pl. a belépőkód-takarítás, amely a
szokásos szabály szerint töröl) igen — és egy eltérő titkú helyi példány a törléskor saját kulcsú ujjlenyomatot írna.
