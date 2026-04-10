---
id: procedural_deploy_20260410_108
type: procedural
domain: deploy
created: 2026-04-10
source: SSH-KEY-INFO.md
tags: [ssh, key-generation, hostinger, github-secrets]
project: websuli
---

# SSH Kulcs Generálás és Beállítás

## Generált kulcspár helye
- Privát: `C:\Users\Kósa Zoltán\.ssh\id_rsa_websuli`
- Nyilvános: `C:\Users\Kósa Zoltán\.ssh\id_rsa_websuli.pub`

## SSH Config (`~/.ssh/config`)
```
Host websuli
    HostName 31.97.44.1
    User root
    IdentityFile C:\Users\Kósa Zoltán\.ssh\id_rsa_websuli
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
```

## Nyilvános kulcs hozzáadása VPS-hez
**Opció A (Hostinger hPanel):** VPS → Settings → SSH Keys → Add SSH Key

**Opció B (PowerShell):**
```powershell
type "$env:USERPROFILE\.ssh\id_rsa_websuli.pub" | ssh root@31.97.44.1 "cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

## GitHub Secrets frissítése
1. https://github.com/kosazoltan/WEBSULI/settings/secrets/actions
2. VPS_SSH_KEY → Update → privát kulcs tartalma
