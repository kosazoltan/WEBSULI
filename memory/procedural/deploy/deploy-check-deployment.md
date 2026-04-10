---
id: procedural_deploy_20260410_101
type: procedural
domain: deploy
created: 2026-04-10
source: CHECK-DEPLOYMENT.md
tags: [github-actions, deployment, vps, pm2, websuli]
project: websuli
---

# Deployment Ellenőrzés

A GitHub Actions workflow automatikusan elindul push után.

## Ellenőrzési lépések
1. GitHub Actions státusz: https://github.com/kosazoltan/WEBSULI/actions
2. Ha sikeres: PM2 újraindul, build elérhető
3. Ha sikertelen: ellenőrizd a logokat és secreteket (VPS_HOST, VPS_USERNAME, VPS_SSH_KEY)

## Manuális deployment (fallback)
```bash
ssh root@VPS_IP
cd /var/www/websuli/source
bash deploy/deploy-to-vps.sh
```
