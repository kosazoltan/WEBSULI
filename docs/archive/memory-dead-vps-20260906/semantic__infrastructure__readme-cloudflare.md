---
id: semantic_infrastructure_20260410_211
type: semantic
domain: infrastructure
created: 2026-04-10
source: source/README-CLOUDFLARE.md
tags: [cloudflare, ssl, error-521, nginx, websuli-vip]
project: websuli
---

# Cloudflare SSL Beállítás (Error 521 Fix)

## Error 521: Web server is down
Cloudflare nem tud kapcsolódni a szerverhez → SSL/TLS mód probléma.

## Megoldás
1. Cloudflare → websuli.vip domain → SSL/TLS → Overview
2. **OPCIÓ A (Flexible)**: Ha nincs SSL cert → Flexible mód (HTTP szerver)
3. **OPCIÓ B (Full)**: Ha Certbot lefutott → Full/Full (strict)

## Tűzfal (Hostinger)
hPanel → VPS → Firewall:
- Port 80 és 443 engedélyezve kell legyen a Cloudflare IP-k számára

## Jelenlegi konfig
- Nginx config: `server_name websuli.vip`
- Cloudflare Flexible módban: azonnal működik
