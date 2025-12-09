# Hostinger VPS Telepítési Segédlet

Mivel rendelkezel Hostinger fiókkal (és API hozzáféréssel a szolgáltatásokhoz), a Hostinger VPS remek választás az alkalmazás futtatásához.

Bár van API kulcsod, egyetlen szerver létrehozásához a legegyszerűbb és leggyorsabb módszer a Hostinger vezérlőpultjának (hPanel) használata. Az API-t jellemzően akkor érdemes használni, ha több tucat szervert szeretnél automatikusan létrehozni.

## 1. VPS Létrehozása a Hostingeren

1.  Jelentkezz be a **Hostinger hPanel**-be.
2.  Válaszd a **VPS** menüpontot.
3.  Kattints a **"Create New VPS"** vagy hasonló gombra (ha még nincs).
4.  **Válassz csomagot:** A "KVM 1" vagy "KVM 2" csomag már elegendő ehhez az alkalmazáshoz (Node.js + PostgreSQL). Javasolt legalább 2GB RAM.
5.  **Válassz operációs rendszert:**
    *   Válaszd az **OS with Control Panel** helyett a sima **Clean OS** (Tiszta OS) opciót.
    *   Válaszd: **Ubuntu 22.04 64bit**.
6.  Adj meg egy nevet (pl. `websuli-server`) és válassz szerver lokációt (hozzád vagy a felhasználókhoz legközelebb, pl. Amszterdam).
7.  **Jelszó:** Adj meg egy erős `root` jelszót. Ezt jegyezd meg!

## 2. Kapcsolódás

Miután a szerver elkészült (kb. 5 perc), látni fogod az IP címét a hPanelen (SSH IP).

1.  Nyiss egy terminált a saját gépeden (PowerShell vagy CMD).
2.  Csatlakozz SSH-val:
    ```powershell
    ssh root@A_SZERVERED_IP_CIME
    ```
    (A jelszó az, amit az 1. lépésben megadtál).

## 3. Telepítés a Scripttel

Innentől követheted a `README-VPS.md` leírását, vagy használd ezt a gyorsított módot:

1.  A szerveren (SSH-ban) hozd létre a telepítő scriptet:
    ```bash
    nano setup.sh
    ```
2.  Másold bele a `deploy/setup_ubuntu.sh` tartalmát a saját gépedről (Ctrl+A, Ctrl+C ott -> jobb klikk a terminálban beillesztéshez).
3.  Mentés: `Ctrl+X`, `Y`, `Enter`.
4.  Futtatás:
    ```bash
    chmod +x setup.sh
    ./setup.sh
    ```

## 4. Tűzfal (Fontos Hostinger specifikum!)

A Hostingernek van egy **külső tűzfala** is a hPanelen.
1.  A hPanelen menj a VPS áttekintéshez.
2.  Keresd a **"Firewall"** menüpontot.
3.  Győződj meg róla, hogy a **Port 80 (HTTP)** és **Port 443 (HTTPS)** engedélyezve van a bejövő forgalom számára.
4.  (Az SSH Port 22 alapból engedélyezett).

Ezután folytathatod a `README-VPS.md` 3. pontjától (Alkalmazás másolása és indítása).
