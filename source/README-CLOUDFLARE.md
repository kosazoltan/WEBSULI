# Cloudflare SSL Beállítás (Error 521 Javítása)

Az "Error 521: Web server is down" hiba Cloudflare használatakor azt jelenti, hogy a Cloudflare nem tud kapcsolódni a szerveredhez. Ennek leggyakoribb oka a titkosítási mód (SSL/TLS) helytelen beállítása.

**A megoldás lépései:**

1.  Jelentkezz be a **Cloudflare** vezérlőpultjára.
2.  Válaszd ki a domainedet (`websuli.vip`).
3.  A bal oldali menüben kattints az **"SSL/TLS"** menüpontra.
4.  Az **"Overview"** (Áttekintés) fülön nézd meg a beállítást.

**Két lehetőséged van:**

**OPCIÓ A: "Flexible" mód (Gyors javítás)**
Ha még nem telepítettél SSL tanúsítványt (Certbot) a szerverre, akkor állítsd át a módot **Flexible**-re.
*   Így a kapcsolat: `Látogató <--(HTTPS)--> Cloudflare <--(HTTP)--> Szerver`.
*   Mivel a szerveren jelenleg csak a 80-as (HTTP) porton figyelünk, ez azonnal működni fog.

**OPCIÓ B: "Full" mód (Biztonságosabb - Ha futtattad a Certbot-ot)**
Ha lefuttattad a `certbot --nginx` parancsot a szerveren, akkor használhatod a **Full** vagy **Full (strict)** módot.

**Tűzfal Ellenőrzés (Hostinger):**
Győződj meg róla, hogy a Hostinger hPanelen a Tűzfal beállításoknál a 80-as (és 443-as) port engedélyezve van! Ha a Hostinger tűzfala blokkolja a Cloudflare IP-címeit, akkor is 521-es hibát kapsz.

**Jelenlegi állapot:**
A szerver fut és válaszol (ellenőriztem), és átírtam az Nginx konfigban a domain nevet `websuli.vip`-re. Ha átállítod a Cloudflare-t **Flexible** módra, azonnal működnie kell.
