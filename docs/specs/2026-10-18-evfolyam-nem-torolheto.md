# A tanuló nem törölheti a megadott évfolyamát — terv

**Tulajdonosi kérés (2026-10-18):** „A tanuló ne tudja törölni a tananyagát!”

## Értelmezés (kódból ellenőrizve)
- **Tananyag törlése:** a tanuló a tananyagot nem tudja törölni. A törlő végpont admin-jogosultságot kér
  (`DELETE /api/html-files/:id`, `isAuthenticatedAdmin`); a törlés gomb csak az admin fájllistájában van.
- **Ami a tanuló kezében törölhető:** az üdvözlő kártyán a saját évfolyama. Az „Évfolyam (nem kötelező)” választással
  (#289/#291 óta) eltűnik a tárolt évfolyam, és vele az évfolyamra szűrt tananyaglista.

## Döntés (dokumentált spec-változás a 2026-10-18-nyilvanos-oldal-udvozlo tervhez képest)
- Ha a tanulónak már van évfolyama, a kártyán az évfolyam módosítható, de nem törölhető: az üres lehetőség nem jelenik meg.
- Az első megadásnál (még nincs évfolyam) az évfolyam továbbra sem kötelező.

## Elfogadás (EARS)
- HA a tanulónak van tárolt évfolyama, AKKOR a módosító űrlapon nincs „nincs évfolyam” lehetőség, és a mentés után is megmarad
  egy évfolyam.
- HA még nincs évfolyama, AKKOR az évfolyam megadása nem kötelező.
