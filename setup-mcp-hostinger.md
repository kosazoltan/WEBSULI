# 🔧 Hostinger MCP Szerver Beállítása

## 📋 Cursor MCP Konfiguráció

Az MCP konfigurációt a Cursor settings fájlban kell beállítani.

### 1. Cursor Settings Fájl Megnyitása

1. **Cursor menü** → **Settings** (vagy `Ctrl+,`)
2. Kattints a jobb felső sarokban a **`{}`** ikonra (Open Settings JSON)
3. Vagy közvetlenül nyisd meg: `%APPDATA%\Cursor\User\settings.json` (Windows)

### 2. MCP Konfiguráció Hozzáadása

Add hozzá ezt a részt a `settings.json` fájlhoz:

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

**Fontos:** Ha már van `mcpServers` rész a fájlban, akkor csak a `hostinger-mcp` objektumot add hozzá a meglévőhöz!

### 3. Cursor Újraindítása

Miután mentetted a settings fájlt, **indítsd újra a Cursor-t**.

### 4. Ellenőrzés

Az újraindítás után az MCP szerver elérhetőnek kell lennie. Próbáld meg kérdezni:
- "Listázd a Hostinger VPS-eket"
- "Mutasd a WebSuli VPS információit"

## 🔍 API Token

Az API token: `s71buGgJnOVyUnMxn9L26ugezYR3DgNYT8L6z2mycc3eecac`

**⚠️ Ez a token csak a Cursor settings-ben legyen, ne commitold sehova!**
