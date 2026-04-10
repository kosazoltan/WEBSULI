---
id: episodic_deploy_20260410_401
type: episodic
domain: deploy
created: 2026-04-10
source: DEPLOYMENT-STATUS.md
tags: [deployment, status, github-actions, pm2, commit]
project: websuli
---

# Deployment Státusz Snapshot

## Utolsó ismert állapot
- Commit: `7556dd3` - "fix: Sötét világűr háttér megjelenítése"
- Branch: main, GitHub Actions auto-deploy aktív

## Deployment workflow lépések
1. Checkout code
2. Setup Node.js 20
3. Install dependencies
4. Build application
5. Deploy to VPS via SSH
6. PM2 Restart

## Tartalmazott feature-ök
- Sötét világűr háttér (#0A0E27)
- Kopernikuszi naprendszer animáció (Canvas)
- Méhsejtes hatszög pattern
- Narancs-sárga kártya színek
- Glassmorphism effekt
- SPA catch-all route javítás (/admin működik)

## Ellenőrzési linkek
- GitHub Actions: https://github.com/kosazoltan/WEBSULI/actions
- VPS: `ssh user@31.97.44.1` + `pm2 status`
- Oldal: https://websuli.vip
