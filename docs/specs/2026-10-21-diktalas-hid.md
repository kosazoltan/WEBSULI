# Diktálás-híd — a régi HTML-anyagok diktálásának gyökérok-javítása

**Tulajdonosi jelzés (2026-10-21):** a szöveges feladatok diktálása „eddig működött az előző verziókban”, most nem; Android (Chrome,
Edge, a telefon saját böngészője) és iPhone Safari alatt is működnie kell.

## Gyökérok (visszakeresve)
- A régi működés: a szerver minden `/dev/:id` anyagba globális diktáló segédet injektál (🎤 minden szövegmező mellé; `server/routes.ts`),
  a `tananyag-keszito` skill v7.3+ anyagai pedig saját diktálást tartalmaznak; a `Preview.tsx` megjegyzése szerint a diktáláshoz az
  kellett, hogy a `/dev/:id` UGYANARRÓL az originről töltődjön („The /dev/:id endpoint is served from the same origin”).
- 2026-09-02 (`8b8e2622`, „izolált tananyag-origin”, biztonsági audit): a `/dev/:id` élesben KÜLÖN originről (RENDER_EXTERNAL_URL)
  jön, kereszt-domaines iframe-ben. A böngészők a Web Speech API beszédfelismerését kereszt-domaines keretben elutasítják
  (`not-allowed`), a segéd ezt csak a konzolba írta — a diktálás azóta CSENDBEN nem működik.

## Cél
1. Az izoláció megtartásával a keretbe a `<head>` elején (minden anyagscript előtt) `SpeechRecognition`-HÍD kerül: azonos felület,
   a felismerést a WebSuli főoldala futtatja `postMessage`-en (a főoldal csak a saját iframe-jének válaszol, a keret originjére címezve;
   felhasználói interakció nélküli indítást elutasít). Így a WebSuli 🎤 és az anyagok SAJÁT diktálása is működik.
2. A segéd hibája nem néma: látható üzenet a gomb mellett (engedély, csend, nem támogatott → billentyűzetes diktálás útmutató).
3. Keret nélkül (külön lapon) a natív felismerés marad; WebSuli-főoldal nélkül (nincs nyugta) a híd nem ragad be.

## Nem-cél
Az izolált origin visszavonása; szerveroldali hangfelismerés.

## Elfogadás (EARS)
- HA az anyag a WebSuli előnézeti keretében fut, AKKOR a keretbeli `SpeechRecognition` indítása a főoldalon futó felismerést indítja,
  és az eredmény a natív eseményalakban érkezik vissza.
- HA a felismerés hibával zárul, AKKOR a tanuló látható üzenetet kap.
