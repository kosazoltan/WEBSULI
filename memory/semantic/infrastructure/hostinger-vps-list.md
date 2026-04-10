---
id: semantic_infrastructure_20260410_204
type: semantic
domain: infrastructure
created: 2026-04-10
source: HOSTINGER-VPS-LIST.md
tags: [hostinger, vps, ip-addresses, mcp]
project: websuli
---

# Hostinger VPS Lista

## Ismert VPS-ek

### 31.97.44.1 (Hostinger - WebSuli?)
- Domain: websuli.vip
- SSH Config: `Host websuli` → `HostName 31.97.44.1`
- GitHub Actions VPS_HOST valószínű értéke
- SSH timeout problémák jellemzőek

### 95.216.191.162 (Hetzner - REPZ projekt)
- WebSuli NEM fut rajta
- REPZ Docker containers, Node.js, PostgreSQL

## VPS infó lekérdezés módjai
1. MCP szerver (Cursor IDE): "Listázd a Hostinger VPS-eket"
2. GitHub Secrets: VPS_HOST értéke
3. Hostinger hPanel: https://hpanel.hostinger.com → VPS
4. SSH tesztelés: `ssh websuli "hostname"`
