# Tananyaglista kapcsolati hiba — terv

## Cél és mért tények
- A főoldal ne mutasson üres könyvtárat sikertelen kérés után, és lehessen helyreállítani az adatbetöltést.
- 2026-09-10: a source/.env DATABASE_URL kapcsolatán SELECT count(*) FROM html_files = 177; a Render /api/html-files HTTP 200, 177 elem. Adatbázis-szakadás nem reprodukálható.
- A websuli.vip HTTPS kérése helyben időtúllépést/kapcsolat-visszaállítást ad, Chrome ERR_CONNECTION_RESET. DNS A rekord 76.76.21.21. A domainhiba végső infrastruktúra-oka még UNKNOWN.
- Home.tsx csak data/isLoading állapotot használ; hibánál files=[] miatt a UserFileList üres könyvtárat mutat. A globális query beállítás nem próbál újra.

## Nem-cél
Adatbázis-migráció, adatírás, kulcscsere, játékok módosítása. Éles DNS vagy deploy csak ellenőrzött beállítás és visszaállítási pont mellett.

## Érintett fájlok
- source/client/src/pages/Home.tsx: betöltési hiba és újrapróbálás továbbítása, korlátozott automatikus helyreállítás.
- source/client/src/components/UserFileList.tsx: hibajelzés, újrapróbálás, meglévő adatok megőrzése.
- source/tests/material-list-recovery.spec.ts: hibás kérés, helyreállítás, valóban üres lista és mobil/asztali megjelenés.
- source/playwright.material-recovery.config.ts: izolált Vite kiszolgáló, mockolt API; nem indít adatbázis-migrációt vagy szerveroldali időzített feladatot.

## Elfogadás (EARS)
- WHEN a lista kérése hibás, THEN kapcsolati hiba és újrapróbálás jelenjen meg; a „Még nincsenek anyagok” ne.
- WHEN a következő kérés sikeres, THEN a tananyagok teljes oldalfrissítés nélkül jelenjenek meg.
- WHEN a sikeres válasz üres tömb, THEN a valódi üres állapot maradjon.
- WHEN korábbi adatok mellett a frissítés hibás, THEN az adatok maradjanak láthatók figyelmeztetéssel.
- Mobilon és asztalon a hibaüzenet és gomb ne vágódjon le, ne okozzon vízszintes túlcsordulást.

## Kockázat és ellenőrzés
Csak olvasó kérések ismétlése, legfeljebb két automatikus retry. Nincs új backend-fallback vagy hitelesítés megkerülése. Typecheck, lint, célzott valódi Chrome E2E, diff-review. Vercel hozzáférés jelenleg lejárt, külön helyreállítandó.

## Végrehajtás és mérés — 2026-09-10
- PASS: közvetlen Neon SELECT, 177 tananyag. A lekérdezés nem módosított adatot.
- PASS: Render /api/health 200; /api/html-files 200 és 177 elem. Chrome-ban a Render főoldalán „177 tananyag”, a tényleges tananyagkártyák megjelentek.
- FAIL: websuli.vip HTTPS helyi curl/Node/Chrome próbákban kapcsolat-visszaállítás vagy timeout. Ez nem bizonyítja, hogy minden hálózatból fennáll, és nem bizonyít adatbázishibát.
- A GitHub legutóbbi production deployment státusza success. A külön Vercel deployment URL hitelesítésvédett (bejelentkezési HTML), ezért nem használható publikus API-ellenőrzésre.
- BLOCKED: Vercel connector reauthentication required; helyi CLI tokennel projektlekérés 403. A rendelkezésre álló Cloudflare tokenek alatt nincs websuli.vip zóna. Vercel újracsatlakoztatását kértem; DNS/éles beállítás módosítása nem történt.
- Bizonyított UI-gyökérok: a Home a query hibáját eldobta és files=[]-t adott át; UserFileList ezt valódi üres adatbázisként jelenítette meg. Javítva: error állapot, retry gomb, két automatikus retry, reconnect/focus refetch; korábbi adatok megmaradnak.
- PASS: npm run check, npm run lint, npm run check:test, npm run build:client.
- PASS: 5 célzott Chrome E2E (390×844 és 1366×768 hiba/kézi helyreállítás; sikeres üres válasz; hálózat visszatérése; hibás frissítés után korábbi adatok megőrzése). Képernyőképek szemrevételezve, hibaüzenet és gomb nem vágódik le.
- Tesztharness korrekció: a service worker fetch kikerülte a Playwright route mockot, ezért a kizárólag mockolt frontendtesztben serviceWorkers:block szükséges. Éles service worker nem módosult. Az eredeti három bukás után az izolált futás mind az öt esete PASS.
- Build figyelmeztetések: elavult Browserslist adatok, meglévő pdfjs eval figyelmeztetés, üres mammoth chunk; build kilépési kód 0.
- NOT RUN: éles kiadás és websuli.vip alkalmazás utáni visszaellenőrzés (Vercel hozzáférés hiányzik). Teljes szerveres suite nem indult; a javítás csak frontend és a célzott teszt nem indít migrációkat/időzített feladatokat.
- Nyitott: a domain hálózati hibájának végső gyökéroka és helyreállítása. A lokális UI-javítás ezt nem helyettesíti.
