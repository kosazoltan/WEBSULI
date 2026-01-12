# 🔑 Új SSH Kulcs Generálva

## ✅ Sikeresen Létrehozva

Egy új SSH kulcspár lett generálva a WebSuli VPS-hez:

- **Privát kulcs:** `C:\Users\Kósa Zoltán\.ssh\id_rsa_websuli`
- **Nyilvános kulcs:** `C:\Users\Kósa Zoltán\.ssh\id_rsa_websuli.pub`

## 📋 Nyilvános Kulcs (Hozzáadandó a VPS-hez)

```
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDPx2C0ORqTddga2qink38KeexvOi1dPsw13ehSRACN/5fiwheHRnGIyu9TIdJXsHe/QY9yj9fQnsLITUFXUMILduZ9M/czTfwfjzfEZnshL6zjiQY5TP0Fhw4Hrj2J42KPSAd9eh2BQmXgxllgzyXgRmoZuyj3owbMzQbkgVLPdDsjodfctSkl8WB/X4suhHAyDTUUsAJDlS1Tb6QDpd7F8bBmryxbsthw1+GMOkJAbzfnc3GUFbsWPUKouFk/vR7XCR2pC67+HsHr+GitBvnoqk52sEO+kJRkqLA/kC/wRl1kxOhurAgJbWIEH+fiFih1e05VAU9VCv0go2kLpWN1/2hZUaIivQPs5n2N8RlZdscQhzGEbnDL6S3TeK/Er3el1Y9YNdawUYC6CvcldHjvBuNfQL0rEN7+bF1TdJ8SPEIV3qcM+xCqX16NqeuglxXkwAkxZNO/3WlDRO6gTfU4YJ0fkxv5fWk01gaAbuxPqzNHiWL5NfXEGwc9INh9Ca7CwZ/o/dBC/TSSbwGspV/pXMHaQ0dTlBzmrufoCSAZTbQP5QP2eJd0QC1HwEqYOYzXaaSGKA4p2Y2IFh7rqU9XXdvcewT/isoT5PjCI8VfgSK9M+o9UZRjE/lbC/8MsLAHvCXkN6Ru/IgEffezh/tlGr5LDKeqyQmfvfo+r0/jyQ== websuli-vps-20260111-212028
```

## 🔧 Következő Lépések

### 1. Nyilvános Kulcs Hozzáadása a VPS-hez

**Opció A: Hostinger hPanel-on keresztül (Ajánlott)**

1. Jelentkezz be a Hostinger hPanel-be: https://hpanel.hostinger.com
2. Menj a **VPS** menüpontra
3. Válaszd ki a WebSuli VPS-t (31.97.44.1)
4. Menj a **Settings** → **SSH Keys** menüpontra
5. Kattints az **"Add SSH Key"** vagy **"Add Key"** gombra
6. Másold be a nyilvános kulcsot (fentebb)
7. Mentsd el

**Opció B: Ha van jelszó-hozzáférésed a VPS-hez**

```bash
# Windows PowerShell-ben:
type "$env:USERPROFILE\.ssh\id_rsa_websuli.pub" | ssh root@31.97.44.1 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && chmod 700 ~/.ssh"
```

### 2. SSH Kapcsolat Tesztelése

Miután hozzáadtad a kulcsot:

```bash
ssh websuli
```

Vagy közvetlenül az IP-vel:

```bash
ssh -i "$env:USERPROFILE\.ssh\id_rsa_websuli" root@31.97.44.1
```

### 3. GitHub Secrets Frissítése

Ha az SSH kapcsolat működik, frissítsd a GitHub Secrets-ben a privát kulcsot:

1. Menj a GitHub repository-hoz: https://github.com/kosazoltan/WEBSULI
2. Settings → Secrets and variables → Actions
3. Kattints a **VPS_SSH_KEY** secret-re (szerkesztéshez)
4. Másold be a **privát kulcs** tartalmát:

```powershell
# PowerShell-ben futtasd:
Get-Content "$env:USERPROFILE\.ssh\id_rsa_websuli"
```

5. Másold ki a **teljes kimenetet** (beleértve a `-----BEGIN` és `-----END` sorokat is)
6. Illeszd be a GitHub Secret mezőbe
7. Mentsd el

### 4. SSH Config Frissítve

Az SSH config fájl frissítve lett, hogy használja az új kulcsot:

```
Host websuli
    HostName 31.97.44.1
    User root
    IdentityFile C:\Users\Kósa Zoltán\.ssh\id_rsa_websuli
    StrictHostKeyChecking no
    UserKnownHostsFile /dev/null
```

## ⚠️ Biztonsági Megjegyzések

1. **NE oszd meg a privát kulcsot!** (`id_rsa_websuli`)
2. **NE commitold a kulcsot a git repository-ba!**
3. A privát kulcsot csak a GitHub Secrets-ben tárold
4. Ha elfelejtetted vagy elvesztetted a kulcsot, új kulcsot kell generálnod

## 🔍 Ellenőrzés

### Nyilvános kulcs megjelenítése:
```powershell
Get-Content "$env:USERPROFILE\.ssh\id_rsa_websuli.pub"
```

### Privát kulcs megjelenítése (GitHub Secrets-hez):
```powershell
Get-Content "$env:USERPROFILE\.ssh\id_rsa_websuli"
```

### SSH Config ellenőrzése:
```powershell
Get-Content "$env:USERPROFILE\.ssh\config"
```

## 📝 Visszavonás (Ha szükséges)

Ha eltávolítani szeretnéd a kulcsot a VPS-ről:

1. SSH-z be a VPS-re
2. Szerkeszd a `~/.ssh/authorized_keys` fájlt
3. Töröld a megfelelő kulcs sorát

Vagy a Hostinger hPanel-en keresztül:
- VPS → Settings → SSH Keys → Törlés
