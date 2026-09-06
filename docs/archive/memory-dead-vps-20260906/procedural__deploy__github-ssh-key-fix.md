---
id: procedural_deploy_20260410_107
type: procedural
domain: deploy
created: 2026-04-10
source: GITHUB-SECRETS-SSH-KEY-FIX.md
tags: [ssh, github-secrets, troubleshooting, fix]
project: websuli
---

# GitHub Secrets SSH Kulcs Fix

## Gyakori hibák
1. Hiányzó BEGIN/END sorok
2. Windows CRLF sortörések (Unix LF kell)
3. Kulcs nem teljes

## Helyes beállítás lépések
1. `powershell -ExecutionPolicy Bypass -File check-github-secrets.ps1` (LF formátum)
2. GitHub Secrets → VPS_SSH_KEY → Update → teljes kulcs illeszt be → Save
3. VPS_HOST = `31.97.44.1`, VPS_USERNAME = `root`

## SSH kapcsolat tesztelése
```powershell
ssh -i "$env:USERPROFILE\.ssh\id_rsa_websuli" root@31.97.44.1 "echo 'SSH test successful' && hostname"
```

## VPS authorized_keys ellenőrzés
```bash
ssh root@31.97.44.1 "cat ~/.ssh/authorized_keys"
```

## Hiba üzenetek
- "Permission denied (publickey)" → rossz kulcs vagy nincs authorized_keys-ben
- "Connection refused" → VPS nem elérhető, tűzfal probléma
