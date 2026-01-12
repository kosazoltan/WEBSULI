# 🔐 SSH Kapcsolat Összefoglaló - WebSuli VPS

## ✅ Megtalált SSH Konfigurációk

### 1. SSH Config Fájl (`~/.ssh/config`)

```
Host websuli
    HostName 31.97.44.1
    User root
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
```

**Kapcsolat:** `ssh websuli`

### 2. GitHub Actions Secrets

A következő secrets vannak beállítva a GitHub repository-ban:

- **VPS_HOST** (utolsó frissítés: 2025-12-13)
- **VPS_USERNAME** (utolsó frissítés: 2025-12-13)
- **VPS_SSH_KEY** (utolsó frissítés: 2025-12-13)

**⚠️ Megjegyzés:** A secrets értékei nem olvashatók ki biztonsági okokból. A GitHub csak a neveket és dátumokat adja vissza.

## 📋 Ismert VPS IP Címek

### **31.97.44.1** (Hostinger - WebSuli?)
- **SSH Config:** ✅ Beállítva (`Host websuli`)
- **Kapcsolat:** `ssh websuli` vagy `ssh root@31.97.44.1`
- **Státusz:** ❓ Nem teszteltem még (előzőleg timeout volt)

### **72.62.91.221** (Új IP - Ismeretlen)
- **Státusz:** ❓ Nem teszteltem
- **Kapcsolat:** `ssh root@72.62.91.221`

### **95.216.191.162** (Hetzner - REPZ projekt)
- **Státusz:** ✅ Elérhető, de **NEM WebSuli** (REPZ projekt fut rajta)

## 🔍 Hogyan Találjuk Meg a Valódi WebSuli VPS IP-t?

### 1. GitHub Actions Logok
Nézd meg a legutóbbi deployment logokat:
```bash
gh run view --log
```
A logokban látszik, hogy milyen IP-re deploy-ol.

### 2. GitHub Webes Felület
1. https://github.com/kosazoltan/WEBSULI
2. Settings → Secrets and variables → Actions
3. Kattints a **VPS_HOST** secret-re (szerkesztéshez)
4. Ott láthatod az értéket

### 3. SSH Config Tesztelése
```bash
ssh websuli "hostname && pwd"
```

### 4. Mindhárom IP Tesztelése
```bash
# 31.97.44.1
ssh root@31.97.44.1 "hostname"

# 72.62.91.221
ssh root@72.62.91.221 "hostname"

# 95.216.191.162 (REPZ, nem WebSuli)
ssh root@95.216.191.162 "hostname"
```

## 💡 Következő Lépések

1. **Teszteld az SSH config-ot:**
   ```bash
   ssh websuli "cd /var/www/websuli/source && pwd"
   ```

2. **Ha működik:** Ez a valódi WebSuli VPS (31.97.44.1)

3. **Ha nem működik:** 
   - Frissítsd az SSH config-ot a helyes IP-vel
   - Vagy használd közvetlenül az IP-t: `ssh root@72.62.91.221`

4. **GitHub Secrets ellenőrzése:**
   - Menj a GitHub webes felületére
   - Ellenőrizd, hogy a VPS_HOST secret tartalmazza-e a helyes IP-t
