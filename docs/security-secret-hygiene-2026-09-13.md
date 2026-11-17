# Titok- és fájlhigiéniai jegyzet — 2026-09-13

## Talált állapot

- A gitleaks munkafán végzett vizsgálata több találatot adott, de ezek közül csak az `add-mcp-config.ps1` volt Git által követett fájl.
- Ebben a scriptben egy Hostinger API-token közvetlenül a forrásban szerepelt. Az érték ebben a jegyzetben, diffben és commitban nem szerepel.
- További találatok lokális vagy ignorált `.env`, backup, OAuth- és konfigurációs fájlokból származtak. Ezeket nem stage-eltük és nem töltjük fel.

## Elvégzett korrekció

- Az `add-mcp-config.ps1` most a `HOSTINGER_API_TOKEN` környezeti változót ellenőrzi.
- Hiányzó változó esetén a script leáll, és nem ír üres vagy beégetett értéket.
- A konfigurációba írt érték JSON-kódolása futáskor történik; a titok nem kerül a repóba.

## Nyitott üzemeltetési kockázat

A token korábbi Git-történetben és külső rendszerben való jelenléte ettől nem bizonyítottan szűnik meg. A Hostinger-token visszavonása és újragenerálása, valamint szükség esetén a Git-történet tisztítása külön üzemeltetési feladat. Force-push ebben a munkában nem történt.

## `SESSION_SECRET` rotáció — a játékos-fiók következményei (runbook, 2026-11-16)

A `SESSION_SECRET`-ből levezetett kulcs (`server/player/codes.ts` `playerAuthKey`) hash-eli a belépőkódokat és a tanulói
linkeket; a törölt, tiltott játékos-fiókok cím nélküli tiltás-ujjlenyomatát (`player_ban_fingerprints`, megőrzés: 12 hónap) a
külön `PLAYER_BAN_KEY` — ennek hiányában szintén a `SESSION_SECRET`. Rotáció előtt:

1. Ha a `PLAYER_BAN_KEY` NINCS beállítva: Admin → „Játékosok” → „Törölt, de tiltva maradt fiókok” — ezek a bejegyzések a rotáció
   után NEM egyeznek többé (a HMAC visszafejthetetlen, nem migrálható); az érintett címekkel ismét tiltatlan fiók nyitható. A
   sorokat semmi nem törli kulcs alapján (12 hónap után a megőrzés). Javasolt előbb a `PLAYER_BAN_KEY`-t beállítani.
2. Az élő tiltott fiókok tiltása kulcstól független (`player_accounts.banned_at` + a kanonikus cím összevetése) — megmarad.
3. A függő belépőkódok (10 perc) és a tanulói linkek érvénytelenek lesznek (a tanulói eszközöket újra kell párosítani).

## Stage-kapu

Commit előtt kötelező a staged tartalomra futtatott gitleaks-vizsgálat. A jelentés nem tartalmazhat tokenértéket, privát kulcsot, jelszót vagy személyes e-mail-címet.
