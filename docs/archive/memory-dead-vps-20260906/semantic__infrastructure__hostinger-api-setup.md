---
id: semantic_infrastructure_20260410_202
type: semantic
domain: infrastructure
created: 2026-04-10
source: HOSTINGER-API-SETUP.md
tags: [hostinger, api, mcp, vps-management]
project: websuli
---

# Hostinger API Token Beállítás

Az MCP szerveren keresztül programozottan kezelhető a VPS, ha az SSH nem működik.

## API Token létrehozás
https://hpanel.hostinger.com → API / Developer → API Tokens → Generate

## MCP Konfiguráció
```json
{
  "mcpServers": {
    "hostinger-mcp": {
      "command": "npx",
      "args": ["hostinger-api-mcp@latest"],
      "env": { "API_TOKEN": "<TOKEN>" }
    }
  }
}
```

**NE commitold a tokent!** Csak IDE config-ban.

## Alternatíva: SSH javítása
- Hostinger hPanel → VPS → Firewall → SSH port (22) engedélyezése
- SSH kulcs beállítása a hPanel-en
