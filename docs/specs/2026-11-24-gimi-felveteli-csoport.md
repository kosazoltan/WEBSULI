# 6-osztályos gimnáziumi felvételi tananyagcsoport

Forrás: tulajdonosi kérés (2026-11-24, feladat #1986), döntések az űrlapon:

- A csoport neve: **„6-osztályos gimnáziumi felvételi”** (rövid: „Gimi felv.”). A főoldali osztályválasztóban a „Prog.” után külön pont.
- Tantárgyak: **matematika** és **magyar nyelv** (a felvételi ezekből van).
- **Mindenki láthatja.** Kósa Marcel Noel fiókjánál (e-mail-hozzárendelés) kiemelve jelenik meg. Nála a 6. osztályos anyagok között is ott vannak, és külön is kiválaszthatók.
- Ugyanazok a szabályok érvényesek, mint a többi tananyagra: kvíz, szöveges feladat, eredménylevél és változatosság. A csoportosítás az egyetlen különbség.

## Adatmodell

- A csoportazonosító, a felirat, a tartalmi évfolyam (6) és a tantárgyak egy helyen, a `shared/tracks.ts`-ben vannak.
- `html_files.tracks text[]` (alapértelmezés `{}`). A csoport anyaga **6. osztályos** (`classroom = 6`), ezért a 6. osztály szűrője is mutatja. Ugyanez adja a korosztályt, az arculatot és a pontozást, így ezeken nem kell változtatni.
- `track_assignments (track, email_key)`: fiók–csoport hozzárendelés a fiókkulcs alapján. A kulcs képzése megegyezik a P-020-éval (Gmailnél a pontok és a `+címke` nélkül), így Google-bejelentkezésre és játékosfiókra is működik. A hozzárendelést az **admin veszi fel** a „Csoport-hozzárendelések” kártyán (tulajdonosi döntés, 2026-11-24, űrlap). A repó nyilvános, ezért valódi cím nem kerülhet sem a migrációba, sem a kódba (`no-real-emails-guard`). Kósa Marcel Noel fiókját a tulajdonos élesben egyszer veszi fel.

## Felület

- **Főoldal:** a „Prog.” után megjelenik a „Gimi felv.” csip; csak akkor, ha van anyag a csoportban, vagy a látogató hozzá van rendelve. Kiválasztva csak a csoport anyagai látszanak. A hozzárendelt fióknál a csip kiemelt, csillagot és „Neked” jelzést visel.
- **`GET /api/tracks/mine`:** a bejelentkezett fiók (Google-munkamenet vagy játékosmunkamenet) csoportjai. Vendégnek `[]`.
- **Admin, Tanulók → „Csoport-hozzárendelések” kártya:** csoport és e-mail-cím megadása, a felvett hozzárendelések listája és törlése. Végpontok (admin): `GET`, `POST {track, email}` és `DELETE {track, emailKey}` a `/api/admin/track-assignments`-en. A cím a fiókkulcsra normalizálódik.
- **Admin, Fájlok:** a szerkesztésnél egy jelölőnégyzettel tehető a csoportba. A csoportba tett anyag a csoport tartalmi évfolyamára kerül; a szerver a 6. osztálytól eltérő évfolyamú anyagot nem engedi a csoportba, és a csoportos anyag évfolyamát sem engedi elállítani (review #582).

## Elfogadás

- E1: WHEN egy anyag a `gimi6` csoportban van THEN a főoldalon a „Gimi felv.” csip kiválasztásakor csak a csoport anyagai látszanak, a „6.” csipnél pedig a többi 6. osztályos anyaggal együtt.
- E2: WHEN a bejelentkezett fiók e-mail-kulcsa hozzá van rendelve THEN a `/api/tracks/mine` a `["gimi6"]` értéket adja, és a csip kiemelt. Vendégnek és más fióknak `[]`, a csip nem kiemelt.
- E3: WHEN az admin a szerkesztésnél bejelöli a csoportot THEN a `tracks` mentődik, és a lista frissül.
- E4: A migráció additív és idempotens; hozzárendelést nem ír.
- E5: WHEN az admin felvesz egy címet THEN a fiókkulcs mentődik (Gmailnél pontok és `+címke` nélkül). Az ismétlés idempotens, a hibás csoport vagy cím 400, nem adminnak tiltott.
- E6: WHEN az admin törli a hozzárendelést THEN a fiók `/api/tracks/mine` válasza `[]`.
- E7: Az admin-kártya listázza, felveszi és törli a hozzárendeléseket (e2e).
- E8: WHEN a csoport évfolyamától eltérő anyagot tesz a csoportba, vagy a csoportos anyag évfolyamát állítja el THEN 400, és nem mentődik.
- E9: A mentés visszaállítása megtartja a csoporttagságot. E10: A játékosfiók törlése a postafiók hozzárendelését is törli.

## Később (U3b, külön szelet)
- A tananyagkészítőben „Gimi felvételi (6. o.)” gyártási cél (évfolyam 6, matematika vagy magyar), közzétételkor `tracks = ['gimi6']`. Addig az anyag a fájlszerkesztő jelölőjével kerül a csoportba.
