---
id: procedural_deploy_20260410_105
type: procedural
domain: deploy
created: 2026-04-10
source: GITHUB-ACTIONS-DEPLOYMENT-FIX.md
tags: [github-actions, deployment, ssh, secrets, debug]
project: websuli
---

# GitHub Actions Deployment Hibaelhárítás

## Cancelled státusz = NORMÁLIS
A `concurrency: cancel-in-progress: true` beállítás az előző futást törli. Ellenőrizd az utolsó futást.

## Szükséges Secrets
- `VPS_HOST`: `31.97.44.1` (WebSuli VPS IP)
- `VPS_USERNAME`: `root`
- `VPS_SSH_KEY`: teljes privát kulcs (BEGIN...END blokkokkal)

## Beállítás helye
https://github.com/kosazoltan/WEBSULI/settings/secrets/actions

## SSH kulcs lekérése
```powershell
Get-Content "$env:USERPROFILE\.ssh\id_rsa_websuli"
```

## Manuális deploy (fallback)
```powershell
$keyPath = "$env:USERPROFILE\.ssh\id_rsa_websuli"
ssh -i $keyPath root@31.97.44.1 "cd /var/www/websuli/source && git pull origin main && npm install && npm run build && pm2 restart websuli"
```

## Ellenőrző lista
- [ ] VPS_HOST = 31.97.44.1
- [ ] VPS_USERNAME = root
- [ ] VPS_SSH_KEY = teljes privát kulcs (BEGIN-től END-ig)
- [ ] SSH kapcsolat manuálisan működik
