# 🚀 AZONNALI DEPLOYMENT - Másold és Futtasd!

## 1. Nyisd meg a terminált/SSH-t és kapcsolódj a VPS-re:

```bash
ssh root@VPS_IP
# vagy
ssh felhasznalo@websuli.vip
```

## 2. Másold és futtasd ezeket a parancsokat EGYENESEN:

```bash
cd /var/www/websuli/source && \
git pull origin main && \
npm install && \
rm -rf dist node_modules/.vite && \
npm run build && \
pm2 delete websuli 2>/dev/null || true && \
sleep 2 && \
pm2 start deploy/ecosystem.config.cjs --name websuli --update-env && \
sleep 3 && \
pm2 save && \
echo "✅ DEPLOYMENT KÉSZ!" && \
pm2 list | grep websuli
```

## VAGY futtasd a scriptet:

```bash
cd /var/www/websuli/source
bash deploy/deploy-to-vps.sh
```

## ✅ Ellenőrzés deployment után:

```bash
# Nézd meg, hogy fut-e
pm2 list

# Nézd meg a logokat
pm2 logs websuli --lines 50

# Ellenőrizd a build output-ot
ls -la dist/public/assets/ | head -10
```
