---
id: semantic_infrastructure_20260410_203
type: semantic
domain: infrastructure
created: 2026-04-10
source: HOSTINGER-API-TOKEN-SETUP.md
tags: [hostinger, api-token, mcp, cursor]
project: websuli
---

# Hostinger API Token - MCP Szerver

## Cursor IDE MCP Konfiguráció
`%APPDATA%\Cursor\User\settings.json`:
```json
{
  "mcpServers": {
    "hostinger-mcp": {
      "command": "npx",
      "args": ["hostinger-api-mcp@latest"],
      "env": { "API_TOKEN": "<HOSTINGER_TOKEN>" }
    }
  }
}
```

Cursor újraindítása szükséges az MCP szerver eléréséhez.

**BIZTONSÁGI FIGYELMEZTETÉS: Soha ne commitold az API token értékét!**
