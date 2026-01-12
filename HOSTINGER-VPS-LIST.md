# 📋 Hostinger VPS Lista

## ⚠️ MCP Szerver Használata

Az MCP szerver csak a **Cursor IDE kontextusában** érhető el. A `hostinger-api-mcp` package az MCP (Model Context Protocol) protokollt használ, ami a Cursor IDE-vel integrálódik.

Ha az MCP szerver be van állítva és a Cursor újraindítva, akkor a Cursor IDE-ben közvetlenül kérdezheted:
- "Listázd a Hostinger VPS-eket"
- "Mutasd a WebSuli VPS információit"

## 📊 Ismert VPS Információk (Dokumentumok alapján)

### 1. **31.97.44.1** (Hostinger - WebSuli VPS?)

**Státusz:** Valószínűleg a WebSuli VPS  
**Szolgáltató:** Hostinger  
**Domain:** `websuli.vip`  
**SSH Config:** `Host websuli` → `HostName 31.97.44.1`

**Kapcsolat:**
```bash
ssh websuli
# vagy
ssh root@31.97.44.1
```

**GitHub Actions:**
- A `VPS_HOST` secret valószínűleg tartalmazza ezt az IP-t
- Utolsó frissítés: 2025-12-13T14:58:16Z

**Megjegyzés:**
- Az SSH kapcsolat időnként timeout-ol (tűzfal vagy hálózati probléma)
- A dokumentumok szerint ez a valószínű WebSuli VPS

### 2. **95.216.191.162** (Hetzner - REPZ Projekt)

**Státusz:** NEM WebSuli - REPZ projekt fut rajta  
**Szolgáltató:** Hetzner  
**Projekt:** REPZ (Backend API Server + Frontend)  
**Technológia:** Docker containers, Node.js, PostgreSQL

**Megjegyzés:**
- Ez NEM a WebSuli VPS
- A REPZ projekt fut ezen a VPS-en

## 🔍 VPS Információk Lekérdezése

### Módszer 1: MCP Szerver (Ajánlott)

Ha az MCP szerver be van állítva a Cursor-ban:

1. **Ellenőrizd, hogy az MCP szerver fut-e:**
   - Cursor IDE → Settings → MCP Servers
   - Látod-e a `hostinger-mcp` szervert?

2. **Kérdezd meg közvetlenül a Cursor IDE-ben:**
   - "Listázd a Hostinger VPS-eket"
   - "Mutasd a WebSuli VPS részleteit"

### Módszer 2: GitHub Secrets Ellenőrzése

A GitHub Secrets-ben látható a `VPS_HOST` értéke:

1. Menj a GitHub repository-hoz: https://github.com/kosazoltan/WEBSULI
2. Settings → Secrets and variables → Actions
3. Kattints a `VPS_HOST` secret-re
4. Látod az IP címet (szerkesztéshez)

### Módszer 3: Hostinger hPanel

1. Jelentkezz be: https://hpanel.hostinger.com
2. Menj a **VPS** menüpontra
3. Láthatod az összes VPS-edet, IP címüket, státuszukat

### Módszer 4: SSH Kapcsolat Tesztelése

```powershell
# 31.97.44.1 (Hostinger - WebSuli?)
ssh -v websuli
ssh -v root@31.97.44.1

# 95.216.191.162 (Hetzner - REPZ)
ssh -v root@95.216.191.162
```

## 📝 API Token Információk

**API Token:** `s71buGgJnOVyUnMxn9L26ugezYR3DgNYT8L6z2mycc3eecac`

**⚠️ Fontos:**
- Az API token csak a Cursor MCP konfigurációban legyen
- NE commitold a repository-ba
- Az API token a Hostinger hPanel-ben generálható

## 🔧 Következő Lépések

1. **Ha az MCP szerver elérhető:**
   - Használd a Cursor IDE-ben az MCP szerver funkcióit
   - Kérdezd meg közvetlenül: "Listázd a Hostinger VPS-eket"

2. **Ha az MCP szerver nem elérhető:**
   - Ellenőrizd, hogy a Cursor újraindítva lett-e az MCP konfiguráció után
   - Ellenőrizd a Cursor settings fájlt: `%APPDATA%\Cursor\User\settings.json`
   - Nézd meg, hogy az `mcpServers.hostinger-mcp` helyesen van-e konfigurálva

3. **Alternatíva:**
   - Használd a Hostinger hPanel-t a VPS lista megtekintéséhez
   - SSH-n keresztül kapcsolódj a VPS-hez

## 📚 Kapcsolódó Dokumentumok

- `MCP-SETUP-COMPLETE.md` - MCP konfiguráció állapota
- `HOSTINGER-API-TOKEN-SETUP.md` - API token beállítás
- `SSH-CONNECTION-SUMMARY.md` - SSH kapcsolat információk
- `VPS-IPS-SUMMARY.md` - VPS IP címek összefoglalója
- `VPS-CONFIG.md` - VPS konfigurációs információk
