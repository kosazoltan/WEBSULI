# GitHub Secrets SSH Kulcs - Mit Kell Beírni?

## ✅ HELYES: Privát Kulcs (Privát Key)

A GitHub Secrets-ben a **PRIVÁT kulcsot** kell beírni, **NEM a nyilvános kulcsot**.

### Privát Kulcs (id_rsa_websuli) - EZT KELL HASZNÁLNI

```
-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAACFwAAAAdzc2gtcn
... (több sor)
-----END OPENSSH PRIVATE KEY-----
```

**Jellemzők:**
- ✅ Kezdődik: `-----BEGIN OPENSSH PRIVATE KEY-----` VAGY `-----BEGIN RSA PRIVATE KEY-----`
- ✅ Végződik: `-----END OPENSSH PRIVATE KEY-----` VAGY `-----END RSA PRIVATE KEY-----`
- ✅ Hossza: kb. 1500-3500 karakter (formátumtól függően)
- ✅ Sok sor (általában 20-50 sor)

## ❌ ROSSZ: Nyilvános Kulcs (Public Key) - EZT NE HASZNÁLD!

```
ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAACAQDPx2C0ORqTddga2qink38KeexvOi1dPsw13ehSRACN/5fiwheHRnGIyu9TIdJXsHe/QY9yj9fQnsLITUFXUMILduZ9M/czTfwfjzfEZnshL6zjiQY5TP0Fhw4Hrj2J42KPSAd9eh2BQmXgxllgzyXgRmoZuyj3owbMzQbkgVLPdDsjodfctSkl8WB/X4suhHAyDTUUsAJDlS1Tb6QDpd7F8bBmryxbsthw1+GMOkJAbzfnc3GUFbsWPUKouFk/vR7XCR2pC67+HsHr+GitBvnoqk52sEO+kJRkqLA/kC/wRl1kxOhurAgJbWIEH+fiFih1e05VAU9VCv0go2kLpWN1/2hZUaIivQPs5n2N8RlZdscQhzGEbnDL6S3TeK/Er3el1Y9YNdawUYC6CvcldHjvBuNfQL0rEN7+bF1TdJ8SPEIV3qcM+xCqX16NqeuglxXkwAkxZNO/3WlDRO6gTfU4YJ0fkxv5fWk01gaAbuxPqzNHiWL5NfXEGwc9INh9Ca7CwZ/o/dBC/TSSbwGspV/pXMHaQ0dTlBzmrufoCSAZTbQP5QP2eJd0QC1HwEqYOYzXaaSGKA4p2Y2IFh7rqU9XXdvcewT/isoT5PjCI8VfgSK9M+o9UZRjE/lbC/8MsLAHvCXkN6Ru/IgEffezh/tlGr5LDKeqyQmfvfo+r0/jyQ== websuli-vps-20260111-212028
```

**Jellemzők:**
- ❌ Kezdődik: `ssh-rsa` vagy `ssh-ed25519`
- ❌ Egyetlen hosszú sor
- ❌ Rövidebb (kb. 300-500 karakter)

## 🔍 Hogyan Különböztetheted Meg?

### Privát Kulcs (✅ HELYES GitHub Secret-hez):
- Fájl: `id_rsa_websuli` (nincs `.pub` kiterjesztés)
- Kezdés: `-----BEGIN`
- Több sor
- Hosszabb (több ezer karakter)

### Nyilvános Kulcs (❌ ROSSZ GitHub Secret-hez):
- Fájl: `id_rsa_websuli.pub` (van `.pub` kiterjesztés)
- Kezdés: `ssh-rsa` vagy `ssh-ed25519`
- Egy sor
- Rövidebb (több száz karakter)

## 📋 GitHub Secrets Beállítása

### VPS_SSH_KEY Secret Tartalma:

1. **Nyisd meg a privát kulcs fájlt:**
   ```powershell
   Get-Content "$env:USERPROFILE\.ssh\id_rsa_websuli"
   ```

2. **Másold ki a TELJES tartalmat** (BEGIN-től END-ig, minden sorral)

3. **Illeszd be a GitHub Secret mezőbe:**
   - Menj ide: https://github.com/kosazoltan/WEBSULI/settings/secrets/actions
   - Kattints a `VPS_SSH_KEY` secret-re
   - Kattints az "Update" gombra
   - Illeszd be a teljes privát kulcs tartalmát
   - Mentsd el

## 🔐 Biztonsági Megjegyzés

- ✅ **Privát kulcs** → GitHub Secrets (titkos, senki más nem láthatja)
- ✅ **Nyilvános kulcs** → VPS authorized_keys (nyilvános, a VPS-en)

**SOHA ne oszd meg a privát kulcsot!** Csak a GitHub Secrets-ben tárold.

## ✅ Ellenőrző Lista

A GitHub Secret-ban a `VPS_SSH_KEY` tartalmának:

- [ ] Kezdődik `-----BEGIN` sorral
- [ ] Végződik `-----END` sorral
- [ ] Több sor (nem egyetlen hosszú sor)
- [ ] Hosszú (több ezer karakter)
- [ ] Nincs `ssh-rsa` a legelején (az csak a nyilvános kulcsban van)

Ha ezek mind igazak, akkor ✅ **HELYES**!

## 🚀 Gyors Script Használata

Futtasd ezt a scriptet, ami kiírja a helyes privát kulcs tartalmát:

```powershell
cd C:\Dev\GIThub\WEBSULI
powershell -ExecutionPolicy Bypass -File check-github-secrets.ps1
```

A script kiírja a teljes privát kulcs tartalmát, amit be kell másolnod a GitHub Secret-ba.
