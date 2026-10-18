# Nyilvános oldal: betöltési idő és felesleges háttérmunka — terv

**Tulajdonosi kérés (2026-10-18):** „a publikus oldalon nézd meg, hogyan lehet optimalizálni, hogy gyorsabban töltsön be, milyen
felesleges futó processzek vannak … és csak azok legyenek, amik valóban a működéshez szükségesek … csökkentsd az oldal
betöltődési idejét, latenciáját”.

## Mérés (éles websuli.vip, mobil 390 px, 4× CPU-lassítás, ~16 Mbps / 150 ms; 3 futás)
- **Időzítések:** FCP ~1,0 s; a lista megjelenése 3,3–6,2 s; LCP 2,9–4,9 s.
- **TBT (fő szál blokkolva): 2,6–4,3 s.**
- **Hosszú feladatok:** betöltéskor 16–18; 30 s tétlenségben 12–31.
- **DOM:** 4948 elem (210 kártya).
- **CPU-profil:**
  - betöltéskor a JS ~1,6 s, a böngésző saját munkája („program”: stílus / elrendezés / rajzolás) 4,8 s;
  - **tétlenségben 20 s-ból 20 s**.
- **Nyomkövetés (6 s tétlen):** Paint 4,2 s, raszterizálás 1,3 s, UpdateLayoutTree 1,0 s, Layerize 0,8 s.
- **Okok (kódból és élő DOM-ból):**
  - 218 végtelen CSS-animáció: `honeycomb-shift` a `.glass-card::before`-on (`index.css`), 20 s-os ciklus, minden képkockán újra
    kell rajzolni;
  - 652 `backdrop-filter: blur` elem: `.glass-card` (20 px), a kártyák ikondoboza (`backdrop-blur-md`), a jelvények. Minden
    rajzolásnál a mögöttük lévő réteget is homályosítani kell;
  - 210 `motion.div` (framer-motion) kártyánként, és a képernyőn kívüli kártyák is teljesen renderelődnek.
- **Szerver** (curl, 5×): a `/`, `/api/html-files`, `/api/auth/user`, `/api/csrf-token` 0,25–0,45 s (ebből ~0,25 s a hálózat).
  Nem ez a szűk keresztmetszet.

## Döntések (a színek és a kinézet megmaradnak)
1. **`index.css`:** a `honeycomb-shift` animáció kikerül a `.glass-card::before`-ról és a `.honeycomb-bg`-ről; a minta statikus
   marad.
2. **`.glass-card`:** nincs `backdrop-filter`. A háttér kicsit fedőbb (asztali gradiens 0,5/0,3 → 0,62/0,48; mobil 0,6 → 0,74),
   így a sötét kártya ugyanolyan olvasható.
3. **`UserFileList`:**
   - a kártyák ikondobozán és jelvényén nincs `backdrop-blur`;
   - a kártya-burkoló sima `div` (nem `motion.div`): a hover-emelést a meglévő CSS adja, a nyíl hover-nagyítása CSS;
   - a képernyőn kívüli kártyák nem renderelődnek: `content-visibility: auto` + `contain-intrinsic-size`.
4. **Ami marad:**
   - **Háttér-canvas:** mobilon statikus, asztalon 30 kép/s; a homályosítás megszűnésével a kártyák nem rajzolódnak újra miatta.
   - **Szivárvány-felirat és a „Böngészés” nyíl:** 1-1 elem.
   - **Percenkénti lista-frissítés:** csak látható lapon, változatlan adatnál nem renderel újra.

## Mérési mód (A/B)
- **Környezet:**
  - ugyanaz a mérőszkript (Chromium, mobil, 4× CPU, 30 s tétlen);
  - az alap és az új kliens-build ugyanazzal a lementett éles listával (`/api/html-files` pillanatkép), helyi statikus szerverről;
  - így csak a kliens változása mér.
- **Élesben:** deploy után ugyanez a szkript az éles oldalon.

## Elfogadás (EARS)
- HA a főoldal betölt, AKKOR a TBT legalább a felére csökken, és a tétlen 30 s alatt nincs folyamatos újrarajzolás (a
  `document.getAnimations()` nem tartalmaz végtelen kártya-animációt; a tétlen Paint-idő töredéke az alapnak).
- A lista, a szűrők, a „Most tanuljuk” és az üdvözlő kártya böngészős tesztjei változatlanul zöldek; 390 és 1366 px-en nincs
  túlcsordulás.
