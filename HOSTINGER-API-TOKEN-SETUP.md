# 🔑 Hostinger API Token Beállítása - MCP Szerver

## ✅ API Token Megadva

Az API token: `s71buGgJnOVyUnMxn9L26ugezYR3DgNYT8L6z2mycc3eecac`

**⚠️ Ezt a tokent csak a Cursor MCP konfigurációban használd, ne commitold sehova!**

## ⚠️ BIZTONSÁGI FIGYELMEZTETÉS

**NE COMMITOLD AZ API TOKEN-T A GIT REPOSITORY-BA!**

A `MCP-CONFIG-EXAMPLE.json` fájl hozzá lett adva a `.gitignore`-hoz, de duplán ellenőrizd!

## 🔧 MCP Konfiguráció Beállítása Cursor-ban

Az MCP konfigurációt a Cursor/IDE beállításaiban kell beállítani, nem a repository-ban.

### 1. Cursor Settings Megnyitása

1. Cursor → Settings (vagy `Ctrl+,`)
2. Keresd az **MCP Servers** vagy **Model Context Protocol** beállítást
3. Vagy nyisd meg közvetlenül a settings JSON fájlt

### 2. MCP Konfiguráció Hozzáadása

Add hozzá ezt a konfigurációt:

```json
{
  "mcpServers": {
    "hostinger-mcp": {
      "command": "npx",
      "args": [
        "hostinger-api-mcp@latest"
      ],
      "env": {
        "API_TOKEN": "s71buGgJnOVyUnMxn9L26ugezYR3DgNYT8L6z2mycc3eecac"
      }
    }
  }
}
```

### 3. Cursor Újraindítása

Miután hozzáadtad a konfigurációt, indítsd újra a Cursor-t.

## 🔍 API Token Használata

Az MCP szerveren keresztül most már hozzáférhetsz a Hostinger VPS-ekhez API-n keresztül.

### Példa Használat:

Az MCP szerveren keresztül lehetőség van:
- VPS lista lekérdezése
- VPS információinak lekérdezése
- VPS kezelése (restart, stb.)

## 📋 Következő Lépések

1. ✅ API token megadva
2. ⏳ MCP konfiguráció hozzáadása a Cursor settings-hez
3. ⏳ Cursor újraindítása
4. ⏳ VPS információk lekérdezése az MCP-n keresztül

## 💡 Alternatíva: SSH Kapcsolat Javítása

Ha az SSH kapcsolat működne, akkor nem kellene az API token. Próbáld meg először:
- Hostinger hPanel → VPS → Firewall → SSH port (22) engedélyezése
- SSH kulcs beállítása a hPanel-en
