# A régi (2026. június 1. előtti) anyagok átalakítása Stúdió-leckévé

Állapot: tulajdonosi megbízás 2026-10-20 este. Mind a 2026-06-01 előtt készült anyag Stúdió-szintű lecke legyen, teljes
funkcionalitással:
- tartalom és formátum, interaktivitás;
- kiértékelés, eredmény-e-mail;
- a tanuló / évfolyam felismerése.

Döntések (2026-10-20):
- **„Helyben, ugyanazon a linken”:** az azonosító, a link, a nézettség, az értékelések és a tanulói kötések megmaradnak, a régi HTML
  mentésbe kerül.
- **„Előbb 3 próba, utána mind”:** a keret anyagonként kb. $5–10, összesen kb. $850–1700.

## Mérés (prod, csak olvasás, 2026-10-20)
- **Régi anyag:** 165 db `html_files` sor (`created_at < 2026-06-01`): 163 `html`, 1 `text/html`, 1 `pdf`.
- **Stúdió-lecke:** egyikből sincs (`lessons.html_file_id`), és okosítás sem futott rajtuk.
- **Évfolyam szerint:** 0 (ismeretlen): 10, 3.: 28, 4.: 45, 5.: 33, 8.: 49.
- **A mai „okosítás” (`POST /api/admin/improve-material/:id`):** új HTML-t ír, nem Stúdió-leckét. A Stúdió egyfutásos gyártása
  (`runSingleUpload`) forrásfájlokból teljes leckét készít: tananyag, bank, kvíz, arculat, lektor, kapuk. A publikálás
  (`publishLesson`) a lecke meglévő `htmlFileId`-jét újrahasználja (B6).
- **Egy mért gyártás** (job 102bedaa): 8 perc; kb. 0,68 M bemeneti és 0,13 M kimeneti token.

## Cél
1. **Cél-anyag a gyártásban:** a `targetHtmlFileId` a job mentett kimenetébe kerül (mint az `ownerInstruction`), így a folytatott
   futás is ismeri. A publikálás ezt az anyagot alakítja leckévé, egy tranzakcióban:
   - a régi sor (`title`, `content`, `description`, `classroom`, `contentType`) a `material_improvement_backups`-ba kerül,
     `notes`: `legacy-studio-migration`;
   - az anyag `contentType: lesson` lesz, a tartalma a lecke helyőrzője (mint az új leckéknél), a címe és az évfolyama a Stúdió által
     a FORRÁSBÓL megállapított érték.
2. **Átalakító sor** (`server/studio/legacy-migration.ts`), a szerverben, újraindításbiztosan:
   - **Kódba írt kapcsoló:** `off` | `pilot` (a 3 próba-anyag) | `all` (minden régi anyag a nézettség szerint csökkenő sorrendben).
   - **Párhuzamosság:** legfeljebb 3 gyártás egyszerre (a bank saját párhuzamossága mellett).
   - **A sor elemei:** `scheduled_jobs`, `type: legacy-studio-migration`, `payload: { htmlFileId, runId, attempt }`, `status`:
     `pending` → `running` → `done` | `error`, az `error` mezőben a gyártás hibaüzenetével.
   - **Kísérletek:** anyagonként legfeljebb 2. A második a mentett részekből nem folytat, újragyárt (a hiba oka naplóban).
   - **Forrás:** a régi HTML szövege (`htmlToText`), `kind: text`, a régi címmel. Utasítás: a forrás egy korábbi interaktív tananyag; a
     tanított tartalmat dolgozza fel, ne a weboldal-kezelőfelület szövegeit.
   - **A készítő** a régi anyag tulajdonosa, ha admin; különben az első admin.
3. **Kihagyás:**
   - a `pdf` (külön forrásút), a 300 kB-nál (bájtban) nagyobb, a képet / beágyazott keretet, hangot vagy videót tartalmazó anyag (a
    szövegkivonat ezeket elveszítené), és az Abigél (tulajdonosi kizárás); mind okkal naplózva;
   - a már `lesson` típusú cél (idempotens).

## Nem-cél
- **A régi `improve-material` (HTML-okosítás) út:** változatlan.
- **A tanulói eredmény-e-mail:** a Stúdió-lecke meglévő útja (`/api/lessons/:id/results`, két admin címzett, a párosított tanuló
  nevével) érvényes az átalakított anyagra is. Új címzettlogikát nem vezetünk be.

## Edge case-ek
- **Deploy a sor futása közben:** a gyártás megszakad, a sor újraindításkor egyezteti az állapotot.
  - Kész, ha a cél `lesson` típusú.
  - Különben a futás állapota dönt: hiba, vagy újrapróba a kereten belül.
  - A deploy-őr (AKTIV=0) ezért a sor futása alatt nem enged összevonást.
- **Gyártási hiba:** a régi anyag érintetlen marad (a mentés és a csere csak a publikáló tranzakcióban történik).
- **Visszaállítás:** a mentés (`material_improvement_backups`) tartalmazza a teljes régi sort.

## Elfogadás (EARS)
- HA a gyártás `targetHtmlFileId`-vel fut és sikeres, AKKOR:
  - az anyag azonosítója nem változik;
  - a `content_type` `lesson`;
  - van publikált `lessons` sor rá;
  - a régi tartalom mentésben van.
- HA a gyártás hibával áll meg, AKKOR a régi anyag változatlan.
- HA a kapcsoló `pilot`, AKKOR csak a 3 próba-anyag kerül sorba; HA `off`, AKKOR új gyártás nem indul.
- A sor újraindítás után sem indít kétszer gyártást ugyanarra az anyagra.

## Review #349 (pontosítás)
- **Határnap:** Budapest szerinti éjfél (`2026-06-01T00:00:00+02:00`).
- **Atomi foglalás:** tranzakciós zár mellett; a futás-azonosító az indítás ELŐTT rögzül. A párhuzamossági korlát az újrapróbákra is
  érvényes, `off` módban újrapróba sem indul.
- **Élőség:** az élő workflow-lízing a futás jele. A `parked` / `draft` futás `waiting` állapotba kerül, nem indul újra.
- **Változott anyag:** a publikálás a régi tartalom indításkori lenyomatát ellenőrzi; ha közben változott, a csere elmarad.
- **Visszaállítás:** a mentés `id`-t is tartalmaz, és a visszaállító a `contentType`-ot is visszaírja (a meglévő admin út).
- **Indítási hiba:** nem végleges; a foglalás megmarad, a türelmi idő után a kísérletkeret szerint újrapróba.
