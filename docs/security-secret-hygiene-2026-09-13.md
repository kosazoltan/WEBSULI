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

A `SESSION_SECRET`-ből levezetett kulcs (`server/player/codes.ts` `playerAuthKey`) hash-eli a belépőkódokat, a tanulói
linkeket és a törölt, tiltott játékos-fiókok cím nélküli tiltás-ujjlenyomatát (`player_ban_fingerprints`, megőrzés: 12 hónap).
Rotáció előtt:

1. Admin → „Játékosok” → „Törölt, de tiltva maradt fiókok”: vedd tudomásul, hogy ezek a bejegyzések a rotáció után NEM
   egyeznek többé (a HMAC visszafejthetetlen, nem migrálható) — az érintett címekkel ismét tiltatlan fiók nyitható. Ha ez
   elfogadhatatlan, a rotációt halaszd a bejegyzések lejártáig.
2. Az élő tiltott fiókok tiltása megmarad (`player_accounts.banned_at`), az ujjlenyomatuk a fiók következő belépésekor az új
   kulccsal magától újraképződik.
3. A függő belépőkódok (10 perc) és a tanulói linkek érvénytelenek lesznek (a tanulói eszközöket újra kell párosítani).

## Stage-kapu

Commit előtt kötelező a staged tartalomra futtatott gitleaks-vizsgálat. A jelentés nem tartalmazhat tokenértéket, privát kulcsot, jelszót vagy személyes e-mail-címet.
