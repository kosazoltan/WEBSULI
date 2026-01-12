# GitHub Actions Deployment Hiba - Hibakeresési Útmutató

## 🔴 Probléma
A "Deploy to VPS" workflow sikertelen volt (42 másodperc alatt).

## 🔍 Lehetséges Okok és Megoldások

### 1. GitHub Secrets Hiányoznak vagy Hibásak

A workflow három secretet használ:
- `VPS_HOST` - A VPS IP címe (pl. `31.97.44.1`)
- `VPS_USERNAME` - SSH felhasználónév (pl. `root`)
- `VPS_SSH_KEY` - Privát SSH kulcs teljes tartalma

#### Ellenőrzés:
1. Menj a GitHub repository-hoz: https://github.com/kosazoltan/WEBSULI
2. Kattints a **Settings** fülre
3. Bal oldali menüben: **Secrets and variables** → **Actions**
4. Ellenőrizd, hogy a következő secret-ek léteznek:
   - ✅ `VPS_HOST`
   - ✅ `VPS_USERNAME`
   - ✅ `VPS_SSH_KEY`

#### Ha hiányoznak vagy frissíteni kell őket:

**VPS_HOST:**
- Érték: `31.97.44.1` (WebSuli VPS IP)

**VPS_USERNAME:**
- Érték: `root`

**VPS_SSH_KEY:**
A privát SSH kulcs tartalma. Jelenleg a kulcs itt található:
- Windows path: `C:\Users\Kósa Zoltán\.ssh\id_rsa_websuli`
- Vagy: `%USERPROFILE%\.ssh\id_rsa_websuli`

### 2. SSH Kulcs Tartalma Helyes Formátumban Van-e?

A `VPS_SSH_KEY` secret **teljes SSH privát kulcsot** kell tartalmaznia, beleértve:
```
-----BEGIN OPENSSH PRIVATE KEY-----
...
(teljes kulcs tartalom)
...
-----END OPENSSH PRIVATE KEY-----
```

VAGY (régebbi formátum esetén):
```
-----BEGIN RSA PRIVATE KEY-----
...
(teljes kulcs tartalom)
...
-----END RSA PRIVATE KEY-----
```

#### Hogyan kapd meg a kulcsot:

**PowerShell-ben:**
```powershell
Get-Content "$env:USERPROFILE\.ssh\id_rsa_websuli"
```

**Vagy Command Prompt-ban:**
```cmd
type "%USERPROFILE%\.ssh\id_rsa_websuli"
```

**Fontos:** 
- Másold ki a **TELJES** kimenetet (beleértve a BEGIN és END sorokat)
- Ne adj hozzá vagy távolíts el sortöréseket
- Ne módosítsd a kulcs tartalmát

### 3. SSH Kapcsolat Tesztelése

Mielőtt a GitHub Secrets-eket beállítanád, teszteld, hogy működik-e az SSH kapcsolat:

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_rsa_websuli" root@31.97.44.1 "echo 'SSH connection test successful'"
```

Ha ez működik, akkor a kulcs helyes.

### 4. Workflow Logok Megtekintése

A pontos hiba okának megtudásához:

1. Menj a GitHub repository-hoz: https://github.com/kosazoltan/WEBSULI
2. Kattints az **Actions** fülre
3. Válaszd ki a legutóbbi sikertelen workflow futtatást
4. Kattints a **deploy** job-ra
5. Nézd meg a részletes logokat

A logokból látszani fog:
- ❌ SSH kapcsolat hiba (pl. "Permission denied", "Connection refused")
- ❌ Build hiba (npm install/build sikertelen)
- ❌ PM2 hiba (alkalmazás nem indult el)
- ❌ Egyéb parancs hibák

### 5. Gyors Javítási Lépések

#### Lépés 1: Ellenőrizd a Secrets-eket
1. GitHub → Settings → Secrets and variables → Actions
2. Ellenőrizd, hogy mindhárom secret létezik és helyes értéket tartalmaz

#### Lépés 2: Frissítsd a SSH kulcsot (ha szükséges)
Ha a kulcs módosult vagy új kulcsot kell használni:
1. Másold ki a teljes kulcs tartalmát (lásd fent)
2. GitHub → Settings → Secrets and variables → Actions
3. Kattints a `VPS_SSH_KEY` secret-re
4. Kattints **Update**
5. Illeszd be a teljes kulcs tartalmát
6. Kattints **Update secret**

#### Lépés 3: Manuális Workflow Futtatás
Miután frissítetted a secrets-eket, futtasd manuálisan a workflow-t:
1. GitHub → Actions fül
2. Válaszd a "Deploy to VPS" workflow-t
3. Kattints a **Run workflow** gombra
4. Válaszd a **main** branch-t
5. Kattints a **Run workflow** gombra

### 6. Alternatív Megoldás: Manuális Deploy

Ha a GitHub Actions továbbra sem működik, manuálisan is deploy-olhatsz:

```powershell
$keyPath = "$env:USERPROFILE\.ssh\id_rsa_websuli"
ssh -i $keyPath root@31.97.44.1 "cd /var/www/websuli/source && git pull origin main && npm install && npm run build && pm2 restart websuli"
```

## 📝 Ellenőrző Lista

- [ ] `VPS_HOST` secret létezik és értéke: `31.97.44.1`
- [ ] `VPS_USERNAME` secret létezik és értéke: `root`
- [ ] `VPS_SSH_KEY` secret létezik és tartalmazza a teljes privát kulcsot
- [ ] SSH kapcsolat működik manuálisan
- [ ] GitHub Actions logok átnézve (pontos hiba azonosítva)
- [ ] Secrets frissítve (ha szükséges)
- [ ] Workflow újra futtatva

## 🔗 Hasznos Linkek

- GitHub Repository: https://github.com/kosazoltan/WEBSULI
- GitHub Actions: https://github.com/kosazoltan/WEBSULI/actions
- GitHub Secrets: https://github.com/kosazoltan/WEBSULI/settings/secrets/actions
