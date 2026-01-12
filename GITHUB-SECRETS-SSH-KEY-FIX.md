# GitHub Secrets SSH Kulcs Beállítási Útmutató

## 🔴 Probléma
Az új SSH kulcs beállítása után a GitHub Actions deployment még mindig nem működik.

## 🔍 Gyakori Okok és Megoldások

### 1. SSH Kulcs Formátum Probléma

A GitHub Secrets a **teljes privát kulcsot** várja, pontos formátumban:

#### ✅ Helyes formátum:
```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAABFwAAAAdzc2gtcn
... (több sor)
-----END OPENSSH PRIVATE KEY-----
```

**VAGY (régebbi formátum):**
```
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA...
... (több sor)
-----END RSA PRIVATE KEY-----
```

#### ❌ Gyakori hibák:

1. **Hiányzó BEGIN/END sorok**
   - ❌ Rossz: Csak a kulcs középső részét másoltad be
   - ✅ Jó: Teljes kulcs BEGIN-től END-ig

2. **Túl sok vagy kevés sortörés**
   - ❌ Rossz: Sortörések módosítva
   - ✅ Jó: Pontosan úgy, ahogy a fájlban van

3. **Windows line endings (CRLF)**
   - ⚠️  GitHub Unix formátumot vár (LF)
   - A `check-github-secrets.ps1` script automatikusan konvertál

### 2. SSH Kulcs Tartalma Nem Teljes

#### Ellenőrzés:
1. Nyisd meg a privát kulcs fájlt:
   ```powershell
   notepad "$env:USERPROFILE\.ssh\id_rsa_websuli"
   ```

2. Ellenőrizd, hogy:
   - ✅ Kezdődik: `-----BEGIN` sorral
   - ✅ Végződik: `-----END` sorral
   - ✅ Nincs hiányzó rész a közepén
   - ✅ A fájl hossza kb. 1500-2500 karakter

### 3. GitHub Secret Hozzáadása Lépésről Lépésre

#### Lépés 1: Kulcs tartalmának másolása

**Opció A: PowerShell script használata (Ajánlott)**
```powershell
cd C:\Dev\GIThub\WEBSULI
powershell -ExecutionPolicy Bypass -File check-github-secrets.ps1
```
A script kiírja a kulcs tartalmát LF formátumban.

**Opció B: Manuális másolás**
```powershell
Get-Content "$env:USERPROFILE\.ssh\id_rsa_websuli" -Raw
```
Másold ki a **teljes kimenetet**.

#### Lépés 2: GitHub Secret frissítése

1. Menj ide: https://github.com/kosazoltan/WEBSULI/settings/secrets/actions
2. Kattints a `VPS_SSH_KEY` secret-re
3. Kattints az **"Update"** gombra
4. **Töröld ki** a régi tartalmat
5. **Illeszd be** az új teljes kulcs tartalmát (BEGIN-től END-ig)
6. Kattints a **"Update secret"** gombra

#### Lépés 3: Egyéb Secrets ellenőrzése

Ellenőrizd, hogy a következő secret-ek is helyesen vannak beállítva:

**VPS_HOST:**
- Érték: `31.97.44.1`
- Formátum: IP cím (nincs http://, nincs port)

**VPS_USERNAME:**
- Érték: `root`
- Formátum: Csak a felhasználónév (nincs @, nincs IP)

**VPS_SSH_KEY:**
- Érték: Teljes privát kulcs (BEGIN-től END-ig)
- Formátum: Unix line endings (LF)

### 4. SSH Kapcsolat Tesztelése (Helyi)

Mielőtt a GitHub Secrets-eket frissítenéd, teszteld, hogy a kulcs helyi gépen működik-e:

```powershell
ssh -i "$env:USERPROFILE\.ssh\id_rsa_websuli" root@31.97.44.1 "echo 'SSH test successful' && hostname"
```

Ha ez **működik**, akkor a kulcs helyes, és csak a GitHub Secret beállítása a probléma.

Ha ez **nem működik**, akkor először javítsd a kulcsot vagy a VPS hozzáférést.

### 5. GitHub Actions Logok Megtekintése

Miután frissítetted a secrets-eket és futtattad a workflow-t:

1. Menj ide: https://github.com/kosazoltan/WEBSULI/actions
2. Nyisd meg a legutóbbi workflow futást
3. Kattints a **"deploy"** job-ra
4. Nézd meg a részletes logokat

#### Gyakori hibaüzenetek:

**"Permission denied (publickey)"**
- ❌ A kulcs nem megfelelő vagy nincs hozzáadva a VPS authorized_keys-hoz
- ✅ Megoldás: Ellenőrizd a kulcs tartalmát és a VPS hozzáférést

**"Host key verification failed"**
- ⚠️  SSH host key probléma
- ✅ Megoldás: A workflow-ban van `StrictHostKeyChecking=no`, szóval ez nem kellene előfordulnia

**"Connection refused"**
- ❌ A VPS nem elérhető vagy a port nem megfelelő
- ✅ Megoldás: Ellenőrizd a VPS IP-t és a tűzfalat

### 6. VPS Authorized Keys Ellenőrzése

Ha a helyi SSH működik, de a GitHub Actions nem, akkor ellenőrizd a VPS-en:

```bash
ssh root@31.97.44.1 "cat ~/.ssh/authorized_keys"
```

A nyilvános kulcsnak (`id_rsa_websuli.pub`) benne kell lennie.

Ha nincs benne, add hozzá:
```bash
# Windows PowerShell-ben:
Get-Content "$env:USERPROFILE\.ssh\id_rsa_websuli.pub" | ssh root@31.97.44.1 "cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

### 7. Workflow Újrafuttatása

Miután frissítetted a secrets-eket:

1. Menj ide: https://github.com/kosazoltan/WEBSULI/actions
2. Válaszd a **"Deploy to VPS"** workflow-t
3. Kattints a **"Run workflow"** gombra
4. Válaszd a **"main"** branch-t
5. Kattints a **"Run workflow"** gombra

Várj 1-2 percet, majd nézd meg az új futás logjait.

## 📋 Ellenőrző Lista

- [ ] SSH kulcs helyi gépen létezik (`$env:USERPROFILE\.ssh\id_rsa_websuli`)
- [ ] SSH kapcsolat helyi gépen működik (`ssh -i ... root@31.97.44.1`)
- [ ] SSH kulcs formátuma helyes (BEGIN/END sorokkal)
- [ ] SSH kulcs tartalma teljes (nincs hiányzó rész)
- [ ] GitHub Secret `VPS_HOST` = `31.97.44.1`
- [ ] GitHub Secret `VPS_USERNAME` = `root`
- [ ] GitHub Secret `VPS_SSH_KEY` = teljes privát kulcs (BEGIN-től END-ig)
- [ ] GitHub Actions logok átnézve (pontos hiba azonosítva)
- [ ] Workflow újra futtatva

## 🛠️ Hasznos Scriptek

### SSH Kulcs Ellenőrző Script
```powershell
cd C:\Dev\GIThub\WEBSULI
powershell -ExecutionPolicy Bypass -File check-github-secrets.ps1
```

Ez a script:
- ✅ Ellenőrzi, hogy a kulcs létezik-e
- ✅ Ellenőrzi a kulcs formátumát
- ✅ Teszteli az SSH kapcsolatot
- ✅ Kiírja a kulcs tartalmát (GitHub Secret-höz másolható formátumban)

## 🔗 Linkek

- GitHub Secrets: https://github.com/kosazoltan/WEBSULI/settings/secrets/actions
- GitHub Actions: https://github.com/kosazoltan/WEBSULI/actions
- Workflow fájl: `.github/workflows/deploy.yml`
