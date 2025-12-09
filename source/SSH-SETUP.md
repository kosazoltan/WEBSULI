# SSH Hozzáférés Beállítása (AI Számára)

Ahhoz, hogy közvetlenül tudjak parancsokat futtatni a VPS-en (pl. telepítés, frissítés, logolás), **jelszó nélküli SSH hozzáférést** kell beállítanunk. Így a parancssorból tudom vezérelni a szervert anélkül, hogy interaktívan jelszót kéne begépelni.

## 1. SSH Kulcs Ellenőrzése

Látom, hogy már létezik SSH kulcs a gépeden (`C:\Users\Kósa Zoltán\.ssh`).
Valószínűleg a `id_rsa.pub` vagy hasonló nevű fájl a nyilvános kulcs.

## 2. Nyilvános Kulcs Másolása a Hostingerre

Ez a legfontosabb lépés. A Hostinger VPS-nek ismernie kell a géped "aláírását" (nyilvános kulcs).

1.  Nyisd meg a nyilvános kulcsot egy szerkesztőben (vagy másold a tartalmát):
    *   Futtasd terminálban: `type "C:\Users\Kósa Zoltán\.ssh\id_rsa.pub"`
    *   (Ha nincs `id_rsa.pub`, generáljunk egyet: `ssh-keygen -t rsa -b 4096`)
2.  Másold ki a teljes szöveget (úgy kezdődik: `ssh-rsa ...`).
3.  Jelentkezz be a **Hostinger hPanel**-re.
4.  Menj a **VPS** kezelőfelületére.
5.  Keresd meg a **"Settings"** -> **"SSH Keys"** menüpontot.
6.  Kattints az **"Add SSH Key"** gombra.
7.  Illeszd be a kulcsot és mentsd el.

*Alternatív megoldás (ha már van SSH jelszavas elérésed):*
Futtathatod ezt a parancsot a saját gépeden (PowerShell):
```powershell
type "C:\Users\Kósa Zoltán\.ssh\id_rsa.pub" | ssh root@A_SZERVERED_IP_CIME "cat >> .ssh/authorized_keys"
```

## 3. SSH Config Fájl Létrehozása (Opcionális, de ajánlott)

Ahhoz, hogy én könnyen tudjam kezelni a szervert, érdemes létrehozni egy aliast a `config` fájlban.

Hozd létre (vagy szerkeszd) a `C:\Users\Kósa Zoltán\.ssh\config` fájlt a következő tartalommal:

```text
Host websuli
    HostName A_SZERVERED_IP_CIME
    User root
    IdentityFile "C:\Users\Kósa Zoltán\.ssh\id_rsa"
```
*(Cseréld ki az `A_SZERVERED_IP_CIME` részt a valódi IP-re!)*

## 4. Tesztelés

Ha mindent jól csináltál, ezt a parancsot beírva jelszó nélkül be kell hogy engedjen:

```powershell
ssh websuli
```

Ha ez működik, akkor én is tudok majd parancsokat küldeni, pl.:
`ssh websuli "pm2 restart all"`
