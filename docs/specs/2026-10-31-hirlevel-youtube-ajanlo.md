# YouTube-csatorna-ajánló a „Mai felfedezés” hírlevélben

Állapot: tulajdonosi kérés 2026-10-31 — „a gyerekeknek ajánlott tananyagok cikkekbe vond bele különböző magyar nyelvű
tanító YouTube videók ajánlását is … ezeket is nyugodtan ajáld a napi e-mailek során. Keresd meg őket, és helyezd el a
javaslati metodikában.”

## Cél
A napi „Mai felfedezés” levél a cikk és a kapcsolódó WebSuli-anyag mellett ajánljon egy magyar nyelvű, tanító/
ismeretterjesztő YouTube-csatornát is, a tanuló érdeklődéséhez és évfolyamához illesztve. A csatornalista kézzel
gondozott, ELLENŐRZÖTT bank (nem modellkeresés): minden URL 2026-10-31-én böngészőben ellenőrizve létezik.

## A csatornabank (2026-10-31-én ellenőrizve)
| Csatorna | URL | Témák | Évfolyam |
|---|---|---|---|
| 10-es lista | https://www.youtube.com/@tizeslista | történelem, űr, érdekességek | 5–12 |
| TÖRTÉNELEM TANANYAGTÁR | https://www.youtube.com/channel/UCeRF89ZHgtzUGsnMN431mCQ | általános iskolai történelem oktatóvideók | 5–8 |
| Szertár | https://www.youtube.com/szertar | kísérletek, fizika, kémia, természettudomány | 4–12 |
| Hogyan működik? Röviden - Tömören | https://www.youtube.com/@HogyanMukodik | animált tudomány, technika, űr | 3–10 |
| Videotanár - digitális tananyag | https://www.youtube.com/user/videotanar | felső tagozatos tantárgyi magyarázatok (matek, nyelvtan, irodalom, történelem, természettudomány) | 5–8 |
| KerekMese | https://www.youtube.com/@kerekmese | mesék, dalok, tudomány kicsiknek | 1–3 |

Elvetett jelöltek: Zanza.tv és Matek Oázis (nincs használható hivatalos YouTube-csatorna — a @zanzatv és @matekoazis
fogantyú 404), angol nyelvi magyar csatorna (nem találtunk ellenőrizhetőt; később bővíthető).

## Nem-cél
- A reggeli tananyag-emlékeztető bővítése (külön szelet lehet később).
- Konkrét VIDEÓ ajánlása: csak csatornát ajánlunk — a videó-szintű link gyorsan elavul, a csatorna-főoldal stabil.
- Modellhívás vagy YouTube API: a választás determinisztikus, a kézzel gondozott bankból.
- A cikk-kereső `NEWSLETTER_DOMAINS` listájába NEM kerül be a youtube.com (a cikk-letöltő/szűrő lánc videooldalra
  alkalmatlan).
- Leiratkozás / külön kapcsoló a videoblokkra: a hírlevél meglévő kapcsolója vonatkozik rá.

## Működés
1. Új tiszta modul: `source/shared/youtube-channels.ts` — a bank + `pickYoutubeChannel(interests, grade, seed)`.
2. Illesztés: a csatornákhoz ékezet-lehajtott kulcsszavak tartoznak; az érdeklődési címkék szavait tőillesztéssel
   (a tanmenet-illesztő `sameStem`-logikájának megfelelő egyszerű prefix-szabállyal) vetjük a kulcsszavakra.
3. Választás: az évfolyamhoz illő csatornák közül a legjobb kulcsszó-pontszámúak halmazából determinisztikus rotáció
   (nap + tanuló-azonosító hash) — így naponta és tanulónként változatos, de egy napon belüli újrapróbánál stabil.
4. Ha nincs kulcsszó-találat, évfolyam szerinti általános csatorna jön (1–3: KerekMese; 4–8: Videotanár / Hogyan
   működik?; 9–12: 10-es lista / Szertár) — szintén rotálva.
5. A `newsletterHtml` új, opcionális `channel` blokkot kap („VIDEÓ-AJÁNLÓ”), a meglévő kártyastílusban, a híd után.
6. A `runNewsletters` a küldés előtt hívja a választót, és átadja a sablonnak. DB-változás nincs.

## Adatvédelem és biztonság
- Nincs modellhívás, nincs külső kérés: a bank statikus, a link mindig `https://www.youtube.com/...`.
- A tanulóról semmi nem kerül az URL-be (se token, se név): a link a nyilvános csatorna-főoldal.
- A csatornaleírásokat mi írjuk (gyereknyelven), a `unsafeForChild` szűrőn ez nem múlik — de a leírások fixek, nem
  felhasználói/modell-tartalom.

## Edge case-ek
- Üres érdeklődés (elvben nem fordul elő, a futás szűri) → általános évfolyam-csatorna.
- Évfolyamon kívüli tanuló (pl. 0) → nincs videoblokk, a levél többi része változatlan.
- Újrapróba ugyanaznap → ugyanaz a csatorna (determinisztikus seed), nincs kettősség.
- A cikkválasztás `skipped`/`failed` → nincs levél, így videoblokk sincs (a blokk nem önálló levél).

## Elfogadás (EARS)
- HA a hírlevél kimegy ÉS a tanuló évfolyama 1–12, AKKOR a levélben van egy „VIDEÓ-AJÁNLÓ” blokk, amelynek linkje a
  bank egyik URL-je (teszt: a kimenet URL-je a bankból való).
- HA az érdeklődés kulcsszava egy csatornához illik (pl. „történelem”), AKKOR csak témába vágó csatorna jöhet
  (teszt: történelem-érdeklődésű 6.-os → 10-es lista vagy TÖRTÉNELEM TANANYAGTÁR vagy Videotanár nem-történelem
  csatorna NEM).
- HA nincs illeszkedő kulcsszó, AKKOR az évfolyamhoz illő általános csatorna jön (teszt: 2.-os → KerekMese).
- HA ugyanaz a tanuló ugyanazon a napon kétszer kap tervezést (újrapróba), AKKOR ugyanazt a csatornát kapja (teszt).
- HA két egymást követő napon fut a választó ugyanannak a tanulónak, és több illő csatorna van, AKKOR nem feltétlenül
  ugyanaz jön (rotáció — teszt: a seed változtatása más elemet ad a halmazból).
