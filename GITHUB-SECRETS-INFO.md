# 🔐 GitHub Secrets Információk

## 📋 Beállított Secrets

A GitHub repository-ban a következő secrets vannak beállítva:

1. **VPS_HOST** - Utolsó frissítés: 2025-12-13T14:58:16Z
2. **VPS_USERNAME** - Utolsó frissítés: 2025-12-13T14:57:03Z  
3. **VPS_SSH_KEY** - Utolsó frissítés: 2025-12-13T16:13:07Z

## ⚠️ Fontos Megjegyzés

**A GitHub secrets értékei NEM olvashatók ki biztonsági okokból!**

A GitHub API és CLI csak a secret neveket és metadata-t (létrehozás/frissítés dátum) adja vissza, de az értékeket nem.

## 🔍 Hogyan Ellenőrizd a Secrets Értékeit?

### 1. GitHub Webes Felület

1. Menj a repository-hoz: https://github.com/kosazoltan/WEBSULI
2. Kattints a **Settings** fülre
3. Bal oldali menü: **Secrets and variables** → **Actions**
4. Itt láthatod a secret neveket, de az értékek csak szerkesztéskor látszanak

### 2. GitHub Actions Logok

Nézd meg a legutóbbi deployment logokat, ahol látszik, hogy milyen IP-re deploy-ol:

1. GitHub → **Actions** fül
2. Kattints a legfrissebb "Deploy to VPS" workflow-ra
3. Kattints a "Deploy to VPS via SSH" step-re
4. A logokban látszik a deployment folyamat

### 3. SSH Config Fájl

Az SSH config fájlban van egy beállítás:
```
Host websuli
    HostName 31.97.44.1
    User root
```

Ez az IP cím valószínűleg a WebSuli VPS IP címe.

### 4. További Ismert IP Címek

- **31.97.44.1** - SSH config-ban beállítva (Hostinger - WebSuli?)
- **72.62.91.221** - Új IP (ellenőrizendő)
- **95.216.191.162** - Hetzner VPS (REPZ projekt, NEM WebSuli)

## 💡 Javaslat

Ha szeretnéd megtudni a pontos VPS_HOST értékét:
1. Menj a GitHub webes felületére
2. Settings → Secrets and variables → Actions
3. Kattints a VPS_HOST secret-re (szerkesztéshez)
4. Ott láthatod az értéket (vagy frissítheted)

Vagy futtasd ezt a parancsot, hogy megnézd a GitHub Actions logokat:
```bash
gh run view --log | grep -i "host\|deploy"
```
