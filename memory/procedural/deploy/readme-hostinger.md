---
id: procedural_deploy_20260410_113
type: procedural
domain: deploy
created: 2026-04-10
source: source/README-HOSTINGER.md
tags: [hostinger, vps, setup, ubuntu, firewall]
project: websuli
---

# Hostinger VPS Telepítés

## VPS létrehozás (hPanel)
1. hPanel → VPS → Create New VPS
2. Csomag: KVM 1/2 (min 2GB RAM)
3. OS: Ubuntu 22.04 64bit (Clean OS)
4. Szerver lokáció: Amsterdam

## Kapcsolódás
```powershell
ssh root@A_SZERVERED_IP_CIME
```

## Telepítés script-tel
```bash
nano setup.sh  # deploy/setup_ubuntu.sh tartalma
chmod +x setup.sh && ./setup.sh
```

## Tűzfal (Hostinger specifikus!)
hPanel → VPS → Firewall:
- Port 80 (HTTP) → engedélyezve
- Port 443 (HTTPS) → engedélyezve
- Port 22 (SSH) → alapból engedélyezve

Ezután folytatás: source/README-VPS.md 3. ponttól.
