# ✅ Deployment Trigger-elve!

A GitHub Actions workflow automatikusan elindult a push után.

## 🔍 Ellenőrzés

1. **GitHub Actions státusz:**
   - Menj ide: https://github.com/kosazoltan/WEBSULI/actions
   - Nézd meg a legfrissebb "Deploy to VPS" workflow futást
   - Várd meg, amíg befejeződik (általában 2-5 perc)

2. **Ha sikeres:**
   - ✅ Az alkalmazás frissül a VPS-en
   - ✅ PM2 újraindul
   - ✅ Az új build elérhető lesz

3. **Ha sikertelen:**
   - Nézd meg a logokat a GitHub Actions-ban
   - Ellenőrizd, hogy a secrets be vannak-e állítva:
     - `VPS_HOST`
     - `VPS_USERNAME`
     - `VPS_SSH_KEY`

## 🚀 Manuális Deployment (ha a GitHub Actions nem működik)

SSH-n keresztül futtasd:

```bash
ssh root@VPS_IP
cd /var/www/websuli/source
bash deploy/deploy-to-vps.sh
```
