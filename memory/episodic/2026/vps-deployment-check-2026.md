---
id: episodic_deploy_20260410_402
type: episodic
domain: deploy
created: 2026-04-10
source: VPS-DEPLOYMENT-CHECK.md
tags: [deployment, design-2026, vps, check]
project: websuli
---

# VPS Deployment Ellenőrzés - 2026-os Design

## Commitolt változások
1. Google Fonts import (magyar ékezet-barát)
2. Tailwind config font stack
3. CSS változók (korcsoport-specifikus)
4. useClassroomTheme hook
5. Hero Section Framer Motion + Aurora gradient
6. UserFileList Bento Grid + staggered animációk

## Ellenőrzési lépések
```bash
ssh root@31.97.44.1 "cd /var/www/websuli/source && git log --oneline -3 && pm2 status websuli"
```

## Weboldal ellenőrzés
https://websuli.vip/ → Google Fonts, Aurora gradient, korcsoport-specifikus kártyák, Framer Motion

## Ha változások nem jelennek meg
```bash
cd /var/www/websuli/source && rm -rf dist node_modules/.vite && npm run build && pm2 restart websuli
```
Böngésző: Service Worker Unregister + Ctrl+Shift+R
