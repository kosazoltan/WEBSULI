---
id: semantic_infrastructure_20260410_205
type: semantic
domain: infrastructure
created: 2026-04-10
source: MCP-CONFIG-FIXED.md
tags: [mcp, cursor, json, config, hostinger]
project: websuli
---

# MCP Konfiguráció (Javítva)

## Helyes JSON struktúra
```json
{
  "claudeCode.preferredLocation": "panel",
  "mcpServers": {
    "hostinger-mcp": {
      "command": "npx",
      "args": ["hostinger-api-mcp@latest"],
      "env": { "API_TOKEN": "<TOKEN>" }
    }
  }
}
```

## Korábban javított hibák
- Hiányzó vessző a `preferredLocation` után
- `\r\n` escape stringek a JSON értékekben
- Duplikált `mcpServers` struktúra

## Settings fájl helye
`C:\Users\Kósa Zoltán\AppData\Roaming\Cursor\User\settings.json`

Cursor újraindítása kötelező a konfig módosítás után.
