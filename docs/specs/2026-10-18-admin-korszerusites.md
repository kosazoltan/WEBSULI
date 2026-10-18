# Admin felület korszerűsítése: keresőmező, felhasználókezelés, menü, halott kód — terv

**Tulajdonosi kérés (2026-10-18):**
1. „Admin felületen belül a tananyagkereső mező fehér alapon fehér betűkkel ír.”
2. „Az admin felületen belül is korszerűsítsd a feliratokat, ikonokat, legyenek átláthatóbbak, jobban összeszedve.”
3. „Ellenőrizd, hogy vannak-e inaktív, nem használt funkciók … döntsd el, hogy szükség van rájuk, csak nincs kifejlesztve, vagy
   van már rá jobb megoldás, és akkor töröld.”

## Felmérés (kódból ellenőrizve)
- **Keresőmező:**
  - a mező: `AdminFileDashboard.tsx` keresőmezője; az `ui/input.tsx` alaposztályában nincs szövegszín;
  - a `body` szövegszíne világos (`index.css`, `color: hsl(210 40% 98%)`);
  - világos témában a Card nélküli mező így fehér alapon közel fehér szöveget mutat.
- **Felhasználók fül:**
  - a kliens a `GET /api/admin/users`, `DELETE /api/admin/users/:id`, `PATCH …/ban`, `PUT …/toggle-admin` végpontokat hívja (`admin.tsx`);
  - a szerveren egyik sincs, a fül nem működik;
  - a tároló műveletei megvannak: `getAllUsers`, `deleteUser` (FK-kezeléssel), `toggleUserBan`, `toggleUserAdmin`;
  - a kitiltást a bejelentkezés figyeli (`auth.ts`);
  - éles adat: 14 felhasználó, ebből 3 admin.
- **„AI” fül (`enhanced`):** ugyanazt a `LessonStudioPanel`-t mutatja, mint a „Tananyag készítése” — duplikátum.
- **Sehonnan nem importált komponensek:**
  - `EnhancedMaterialCreator.tsx` (1801 sor);
  - `SystemPromptEditor.tsx` (csak az előbbi importálja);
  - `PushNotificationToggle.tsx`.
- **Csak a halott komponensből vagy semmiből hívott szerver-végpontok (`server/routes.ts`):**
  - `/api/ai/enhanced-creator/{analyze-files, analyze-file, chatgpt-chat, claude-chat}`;
  - `/api/admin/html-fix/{responsive, errors, theme, chat, apply}`;
  - `/api/admin/material-creator/chat`;
  - `/api/admin/system-prompts` (CRUD).

  A `system_prompts` táblát futásidőben csak a `html-fix/chat` és a `material-creator/chat` olvassa.
- **Működő, külön célú fülek (maradnak):**

  | Fül | Szerep |
  |---|---|
  | Fájlok | anyagok kezelése |
  | PDF | a Fájlok feltöltője csak HTML-t fogad |
  | Címkék | címkék kezelése |
  | Nézetek | megtekintések |
  | E-mail | címzettek |
  | E-mail diagnosztika | csak olvasó |
  | Szülői összesítő | szülőknek szóló összesítés |
  | Tananyag készítése | új lecke |
  | Futások | gyártási futások |
  | Tananyagjavító | strukturált leckék javítása |
  | Okosítás | a régi HTML-anyagok egyetlen javítóútja |
  | Okos mentések | javítás előtti pillanatképek |
  | Másolat | teljes export / import |
  | Adatbázis | statisztika |

## Döntések
1. **Keresőmező:** az `ui/input.tsx` alaposztálya `text-foreground`-ot kap (globális javítás). Minden Card nélküli mező is olvasható.
2. **Felhasználók:** szükséges, csak a szerveroldal hiányzik → a négy végpont elkészül az `adminRouter`-en (admin-jogosultság).
   - **Válasz:** jelszó-hash nélkül (`id, email, firstName, lastName, profileImageUrl, isAdmin, isBanned, lastSeenAt, createdAt`).
   - **Önvédelem:** a saját fiók nem törölhető, nem tiltható, és nem vehető el tőle az admin jog.
   - **Utolsó admin:** az utolsó admin nem törölhető, és nem vehető el tőle az admin jog.
   - **Hibakódok:** 400 hibás bemenetre, 404 ismeretlen azonosítóra.
3. **„AI” fül:** megszűnik. A régi `?tab=enhanced` link a „Tananyag készítése” fülre visz (mint a `knowledge-maps`). A mobil alsó
   menüben is.
4. **Halott kód törlése:** a három komponens és a fenti 14 végpont. A már feleslegessé váló segédek (pl. `legacy-fallback.ts`
   elemzési keret) csak akkor törlődnek, ha semmi más nem használja őket. A rájuk vonatkozó tesztek a funkcióval együtt
   megszűnnek (dokumentált spec-változás).
   - A `system_prompts` tábla és az adatai maradnak (nincs migráció).
5. **Menü:** a fülek négy feliratos csoportban, egységes ikon- és színrendszerrel, olvasható betűmérettel (13 px, nem 11 px).

   | Csoport | Fülek |
   |---|---|
   | Tananyagok | Fájlok, PDF-feltöltés, Címkék, Megtekintések |
   | Készítés és javítás | Tananyag készítése, Futások, Tananyagjavító, Régi anyag okosítása |
   | Kommunikáció | E-mail címzettek, E-mail diagnosztika, Szülői összesítő |
   | Rendszer | Felhasználók, Mentés és visszaállítás, Javítási mentések, Adatbázis |

   - Minden fülnek van ikonja (a „Futások”-nak is).
   - A fül-azonosítók (`value`, `data-testid`) nem változnak, a deep linkek működnek.

## Nem-cél
- A működő fülek összevonása (E-mail + diagnosztika, Másolat + Adatbázis): csak csoportosítás.
- A `system_prompts` tábla törlése.
- Az `improved-files/:id/debug` és a `force-apply` (dokumentált API-kompatibilitás).
- A `file-backups` végpontok: ezeket a kliens nem hívja, de mentés-visszaállító útvonalak, külön döntést igényelnek. Ez a záró
  jelentésben jelezve lesz.
- A push-értesítések.

## Edge case-ek
- Ismeretlen `?tab=` → „Fájlok” (változatlan).
- A felhasználó-végpont a saját és az utolsó admin fiókjára 400-at ad magyar hibaüzenettel.
- Mobilnézet: az alsó menüből az „AI készítő” kikerül, a „Tananyag készítése” marad.

## Elfogadás (EARS)
- HA az admin a Fájlok fül keresőjébe gépel világos témában, AKKOR a szöveg sötét, olvasható (számított szín ≠ háttérszín).
- HA az admin a Felhasználók fület nyitja, AKKOR a lista betöltődik jelszó-hash nélkül. A tiltás, az admin-jog és a törlés
  működik, a saját és az utolsó admin fiók védett.
- HA a `?tab=enhanced` linket nyitják meg, AKKOR a „Tananyag készítése” fül nyílik.
- A menü négy feliratos csoportban jelenik meg; minden fülnek van ikonja; 1366 px-en és 390 px-en nincs vízszintes túlcsordulás.
- A törölt komponensekre és végpontokra nincs hivatkozás (`grep`), és a build zöld.
