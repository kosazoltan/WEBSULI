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

## Stage-kapu

Commit előtt kötelező a staged tartalomra futtatott gitleaks-vizsgálat. A jelentés nem tartalmazhat tokenértéket, privát kulcsot, jelszót vagy személyes e-mail-címet.
