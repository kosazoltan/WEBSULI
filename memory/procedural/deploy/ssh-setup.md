---
id: procedural_deploy_20260410_115
type: procedural
domain: deploy
created: 2026-04-10
source: source/SSH-SETUP.md
tags: [ssh, setup, hostinger, authorized-keys, config]
project: websuli
---

# SSH Hozzáférés Beállítása

## Nyilvános kulcs másolása Hostingerre
1. Terminálban: `type "C:\Users\Kósa Zoltán\.ssh\id_rsa.pub"`
2. Tartalom másolása (`ssh-rsa AAAA...`)
3. hPanel → VPS → Settings → SSH Keys → Add SSH Key

**Alternatív (ha van jelszavas SSH):**
```powershell
type "C:\Users\Kósa Zoltán\.ssh\id_rsa.pub" | ssh root@VPS_IP "cat >> .ssh/authorized_keys"
```

## SSH Config fájl (`~/.ssh/config`)
```
Host websuli
    HostName A_SZERVERED_IP_CIME
    User root
    IdentityFile "C:\Users\Kósa Zoltán\.ssh\id_rsa"
```

## Tesztelés
```powershell
ssh websuli  # jelszó nélkül be kell engedjen
ssh websuli "pm2 restart all"
```
