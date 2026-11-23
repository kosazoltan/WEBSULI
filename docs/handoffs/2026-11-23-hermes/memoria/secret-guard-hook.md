---
name: secret-guard-hook
description: Titok soha nem kerülhet a chatbe — globális secret-guard hook + Read-tiltások; mentés csak néma szkripttel (2026-11-20)
metadata:
  node_type: memory
  type: feedback
  originSessionId: 6412743b-9003-4769-b466-6e2fb97c5d99
  modified: 2026-11-20T15:40:48.209Z
---

**ÉRVÉNYES ÁLLAPOT (2026-11-23):** a hook egy ideig NEM volt bekötve (a futás végi hook 2026-11-22-i telepítése valószínűleg felülírta a beállítást); a tulajdonos űrlapos jóváhagyásával 2026-11-23-án visszakötve (`~/.claude/settings.json`: PreToolUse + 9 `permissions.deny` Read-szabály; mentés: `settings.json.mentes-20261123-073942`), élő próba zöld. Tanulság: a globális beállítást módosító telepítő EGYESÍTSEN, ne írjon felül — minden ilyen módosítás után ellenőrizd, hogy a secret-guard bejegyzése megvan.

A tulajdonos 2026-11-20-án kérte: a titkokat (env-fájlok, Google OAuth client_secret, Samsung SDK-azonosítók, Neon-jelszó, SSH-kulcs) scriptekkel és hookokkal kell kezelni, hogy titok ne kerülhessen az API-chatbe.

Megvalósítva: `%USERPROFILE%\.claude\hooks\secret-guard.mjs` (PreToolUse, matcher `Read|Edit|MultiEdit|NotebookEdit|Grep|Bash|PowerShell`, `onFailure: block`, a `~/.claude/settings.json`-ban) + `permissions.deny` Read-szabályok (.env*, client_secret*.json, *.keystore, *.jks, id_rsa*, *neon-jelszo*, 06-titkok-es-kornyezet). 28 esetes pipe-teszt + élő próba zöld. Mentőszkript: `G:\Saját meghajtó\websuli mentés\00-szkriptek-es-hookok\websuli-mentes.ps1` (csak darabszám/méret a kimeneten, hash a MANIFEST.csv-ben).

**Why:** a chat-tartalom az API-hoz megy; a titok értéke onnan nem vonható vissza.
**How to apply:** titokfájlt csak másolni/archiválni (tar, robocopy, Copy-Item), soha nem kiolvasni; ellenőrzéshez csak létezés / hossz / hash, fájlba írva. Ha a hook tilt, ne fogalmazd át a parancsot a megkerüléshez. A settings.json-t is csak szkripttel módosítsd, mert `env` blokkjában kulcs lehet. Lásd [[api-keys-location]], [[check-chain-and-secret-output]].
