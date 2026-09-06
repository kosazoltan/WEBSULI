---
id: semantic_infrastructure_20260410_207
type: semantic
domain: infrastructure
created: 2026-04-10
source: SSH-CONNECTION-SUMMARY.md
tags: [ssh, vps, connection, ip-addresses]
project: websuli
---

# SSH Kapcsolat Összefoglaló

## SSH Config (`~/.ssh/config`)
```
Host websuli
    HostName 31.97.44.1
    User root
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
```

## GitHub Actions Secrets
- VPS_HOST, VPS_USERNAME, VPS_SSH_KEY (beállítva: 2025-12-13)

## Ismert IP-k
- **31.97.44.1**: SSH Config-ban, WebSuli valószínű VPS (korábbi timeout)
- **72.62.91.221**: Új, ismeretlen
- **95.216.191.162**: Hetzner, REPZ projekt

## WebSuli VPS megtalálás módjai
1. `gh run view --log | grep -i "host\|deploy"`
2. GitHub Settings → Secrets → VPS_HOST szerkesztés
3. `ssh websuli "hostname && pwd"`
