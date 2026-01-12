# 🔑 Hostinger API Token Beállítása

## 📋 Áttekintés

Ha az SSH kapcsolat nem működik, használhatod a Hostinger API-t az MCP szerveren keresztül a VPS kezeléséhez.

## 🔧 Hostinger API Token Létrehozása

### 1. Hostinger hPanel Bejelentkezés

1. Menj a Hostinger hPanel-be: https://hpanel.hostinger.com
2. Jelentkezz be a fiókodba

### 2. API Token Generálása

1. A hPanel-ben keresd meg az **API** vagy **Developer** menüpontot
2. Válaszd az **API Tokens** vagy **API Keys** opciót
3. Kattints az **"Generate New Token"** vagy **"Create API Key"** gombra
4. Adj neki egy nevet (pl. "WebSuli MCP")
5. Válaszd ki a szükséges jogosultságokat (VPS management, stb.)
6. Kattints a **"Generate"** vagy **"Create"** gombra
7. **Másold ki a tokent** - ezt csak egyszer láthatod!

### 3. MCP Konfiguráció Frissítése

A tokent be kell állítanod az MCP konfigurációban:

```json
{
  "mcpServers": {
    "hostinger-mcp": {
      "command": "npx",
      "args": [
        "hostinger-api-mcp@latest"
      ],
      "env": {
        "API_TOKEN": "ITT_A_HOSTINGER_API_TOKEN"
      }
    }
  }
}
```

## ⚠️ Fontos Megjegyzések

- Az API token csak **egyszer** látható generáláskor
- Ha elveszíted, új tokent kell generálnod
- Ne oszd meg a tokent senkivel
- Ne commitold a tokent a git repository-ba!

## 🔍 Alternatív Megoldás: SSH Kapcsolat Javítása

Ha az SSH kapcsolat nem működik, először próbáld meg ezt:

1. **Tűzfal ellenőrzése:** A Hostinger hPanel-en ellenőrizd, hogy a 22-es port (SSH) engedélyezve van-e
2. **SSH kulcs ellenőrzése:** Ellenőrizd, hogy a helyes SSH kulcs van-e beállítva
3. **VPS státusz:** Ellenőrizd, hogy a VPS fut-e

## 💡 Javaslat

Ha csak a VPS információkat szeretnéd megnézni, próbáld meg először:
- A Hostinger hPanel-en megnézni a VPS részleteket
- Vagy használd az SSH config-ot: `ssh websuli`

Az API token csak akkor kell, ha programozottan szeretnél hozzáférni a VPS-hez.
