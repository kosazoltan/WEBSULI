# Spec: a főoldal tananyaglistája mobilon is magától frissüljön; könnyű váltás a tananyagok között

> Dátum: 2026-09-20 · Kérés (tulajdonos): mobil nézetben a főoldal nem frissül, kézzel kell kikényszeríteni;
> automatikusan frissüljön, és minden esetben lehessen könnyedén váltani a tananyagok között.

## 1. Mért gyökérokok
1. `GET /api/html-files` a szerveroldali listacache-találatnál `Cache-Control: public, max-age=60` fejlécet ad →
   a mobil böngésző 60 mp-ig a saját HTTP-cache-éből válaszol, a kliens „frissítése" nem ér el a szerverig.
2. A kliens (`Home.tsx`) a react-query alapértelmezett `staleTime: 30000`-rel fut: visszalépéskor a lista 30 mp-ig
   nem kérdez újra; nincs `refetchInterval`, így egy nyitva hagyott főoldal sosem veszi észre az új tananyagot.
3. Böngésző-visszalépésnél (bfcache, `pageshow` persisted) sem kérdez újra.
4. A lecke oldaláról csak a „Vissza" gomb visz a listára; nincs előző/következő tananyag.

## 2. Javítás
- Szerver: a lista-válasz mindig `Cache-Control: no-cache, must-revalidate` (ETag marad → 304-gyel olcsó).
- Kliens (`client/src/lib/home-files-query.ts`, közös beállítás): `staleTime: 0`, `refetchOnMount: "always"`,
  `refetchOnWindowFocus`, `refetchOnReconnect`, `refetchInterval: 60 000` (csak látható lapon), `pageshow`
  eseményre újrakérdezés. A listán látható „Frissítés" gomb (mobilon is).
- Lecke oldal: „Előző / Következő tananyag" gombok (a lista sorrendje szerint, `lessonNeighbours`), mobilon is.

## 3. Elfogadás
- WHEN a lista-végpont válaszol THEN nincs `max-age` a Cache-Control-ban (statikus teszt a route-on).
- `homeFilesQueryOptions` a fenti értékekkel (teszt); `lessonNeighbours` a szomszédokat adja, szélen `null`.
- Élőben: a főoldal 60 mp-en belül magától mutatja az új tananyagot; a lecke oldalán váltható az előző/következő.
