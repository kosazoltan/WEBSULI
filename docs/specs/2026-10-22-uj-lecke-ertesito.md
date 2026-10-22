# Értesítő az új Stúdió-leckéről; a reggeli levél csak ismétlést ajánl

**Tulajdonosi döntés (2026-10-22):**
- „Küldjük ki az elkészült tananyagokról az értesítőt, amikor azok elkészülnek. Ütemezetten csak az ajánlott cikkek és az újra ajánlott tananyagok
  menjenek.”
- Választott változat: a reggeli ütemezett levélben csak az újra ajánlott anyag menjen, a délutáni cikk-hírlevél változatlan; a Stúdióban
  elkészült és publikált leckéről a hozzá tartozó évfolyam tanulója értesítőt kap.
- „A tegnapi tömeges átalakításról nem küldenék utólag 178 levelet. Nem is kell a most elkészült Stúdió megjelenési / átalakító javításokról
  külön e-maileket küldeni.”

## Felmérés (kód)
- **Reggeli levél:** `server/daily-reminder.ts`. A `runDailyReminders` a `planDailyReminders` teljes tervét küldi (cron 6:45 / pótfutás 7:15).
  A terv tételei a `pickSmartMaterial` szerint:
  1. ismétlés (`repeatPercent`, 70% alatti eredmény);
  2. a tanmenet szerinti, még meg nem nyitott anyag;
  3. a régi napi választás.
- **Publikálás:** `server/studio/pipeline-store.ts` `publishLesson`. Új `html_files` sor CSAK akkor keletkezik, ha a leckéhez nincs anyag és
  nincs átalakítási cél (`targetHtmlFileId`). Az újrapublikálás, a régi anyag helyben átalakítása és a javítás nem hoz létre új sort.
- **Régi feltöltés:** `POST /api/html-files` (kézi HTML) saját értesítőt küld — változatlan.

## Cél
1. Az ütemezett reggeli futás (`setupDailyReminders` cron) csak az ismétlés-tételeket küldi (`repeatOnly`). A `runDailyReminders`
   alapértelmezése változatlan (a meglévő integrációs teszt és a kézi futás). Az admin előnézet az ütemezett levelet mutatja (csak ismétlés).
2. Új Stúdió-lecke (az új `html_files` ága) sikeres publikálása után — a commit UTÁN, nem blokkolva, csak éles környezetben — értesítő
   minden aktív, nevesített tanulói címre, amelynek évfolyama egyezik a lecke évfolyamával. A link személyes (`?t=`, mint a reggeli levélnél).
   Hiba csak napló (név / cím nélkül), a publikálást nem érinti.
3. Az átalakítás, az újrapublikálás és a javítás NEM küld értesítőt (nincs utólagos tömeges levél).

## Nem-cél
A délutáni hírlevél; a kézi HTML-feltöltés értesítője; ismétlésvédelmi tábla az értesítőhöz (az új-sor ág leckénként egyszer fut).

## Edge case-ek
- Párosítatlan tanuló: nincs eredménye → reggel nem kap levelet (a délutáni cikk és az új-lecke értesítő megy).
- Több évfolyamos cím (szülő / tanár, név nélkül): nem kap értesítőt (csak a nevesített tanulói cím).
- A tanulónak két címe van: mindkettő megkapja (mint a reggeli levelet).

## Elfogadás (EARS)
- HA az ütemezett reggeli futás indul, AKKOR csak az ismétlés-tételek mennek ki.
- HA egy Stúdió-lecke új anyagként publikálódik, AKKOR az évfolyam nevesített tanulói címei értesítőt kapnak a lecke személyes linkjével.
- HA a publikálás meglévő anyagot frissít (átalakítás, újrapublikálás, javítás), AKKOR nem megy értesítő.
