---
name: game-multiplayer-decisions
description: "Tulajdonosi döntések a játékok közös módjáról és a szerepekről (2026-11-16) — csak online párbaj, hibrid jogosultság, baráti szintű csalásvédelem"
metadata:
  node_type: memory
  type: project
  originSessionId: 99a9b29f-318a-40fe-a572-f8ecf28ad2ae
  modified: 2026-11-17T08:00:00.000Z
---

Tulajdonosi döntések (Kósa Zoltán, 2026-11-16) a WEBSULI játékok közös játékáról:

1. **Csak hálózatos párbaj.** Az egy eszközön, osztott (megfordított) képernyős párbajt törölni kell; a közös játék
   kizárólag internetes, fiókos. **Why:** a mai gyerekek nem játszanak ketten egy telefonon (a kezük sem fér el), és
   sokszor nem is egy lakásban vannak; a kutató alügynök egyeszközös javaslatát a tulajdonos kifejezetten elvetette.
   **How to apply:** ne javasolj újra egyeszközös / „hot-seat” módot; a belépő: szoba létrehozása, csatlakozás kóddal / linkkel.
2. **Hibrid jogosultság.** Az adminok a kódban / konfigurációban rögzített engedélylistán maradnak, szigorúan; a már
   rögzített tanulók és szülők JÁTÉKOS-fiók jogot kapnak (saját „miniprofil”), admin-jogot soha; a kettő nem keveredhet.
   **How to apply:** a régi nem admin Google-felhasználókat nem törölni / kizárni, hanem játékos-szinten megtartani; az
   admin-jog forrása kizárólag az engedélylista. Részlet (#462): a kizárás elleni őr MARAD (hibás lista esetén a tárolt
   admin-jelzők érvényesek); a kockázatot a listán kívüli régi admin-jelzők levétele szünteti meg a Felhasználók fülön — a
   szigorú, őr nélküli listát a tulajdonos NEM választotta. Tiltott játékos letöltheti / törölheti az adatait, az admin
   véglegesen törölhet fiókot (N2 döntés).
3. **Csalásvédelem: baráti szint.** A letöltött bankból kikereshető helyes válaszok ellen külön védelem nem kell; a
   szerver dönti el a helyességet, a gyanús (tökéletes / irreálisan gyors) menet nem kerül ranglistára.
4. **Online párbaj részletei:** szobát csak regisztrált játékos (vagy párosított tanulói profil) nyithat, csatlakozni
   vendégként is lehet kóddal; a szóbankos nyelvi párbaj a második online szeletben (a kétszemélyes tantárgyi párbaj éles
   mérése után); gépi ellenfél KELL, hogy egyedül is játszható legyen.
5. **Éles állapot (2026-11-16 este):** `PLAYER_ACCOUNTS=on` a Renderen (tulajdonosi kérésre); az `ADMIN_ALLOWLIST` él (2
   cím: a tulajdonos és a másik admin; a Google-belépés az egyetlen admin-út); `MP_MODE` még KI — előbb admin-próbamód
   éles teszt. A törölt tiltott fiók lenyomatának megőrzése 12 hónap (tulajdonosi döntés). A Render-változókat a Render
   API-val lehet olvasni / állítani (token: [[api-keys-location]]) — a tulajdonos kifejezetten kérte („csináld meg”), de
   minden új beállítás előtt futásőr kell, címet / titkot soha nem szabad kiírni.
6. **Állapot 2026-11-17 hajnal:** #476 (token-forgatás nyugtával, szerveroldali visszavágó) és #475 (tiltás
   kulcsváltása) élesben; az `MP_MODE=admin` éles próba indítható (két telefon, tulajdonosi jelenlét); `MP_MODE=on` előtt
   a 3–4 fős szoba hibája (kanban #73) csak `MP_ROOM_MAX_PLAYERS` > 2 esetén kötelező. A `PLAYER_BAN_KEY` NINCS beállítva:
   külön, későbbi telepítésben (soha nem a kódot élesítőben; runbook: `docs/jatek-fiok-uzemeltetes.md`). **Tulajdonosi
   döntésre vár:** „az első meccs után a szoba ne engedjen be új játékost” (ügynöki alapértelmezés, most ez él), és a
   játékos-fiók kanonikus egyedisége (kanban #77).
7. **Joystick marad (tulajdonos, 2026-11-17: „Maradjon meg a joystick is”):** a Szökőár háromsávos futásában (J1a, D-J1a-1)
   a tárcsa a húzás MELLETT megmarad. **How to apply:** játék-átalakításnál a meglévő joystick-vezérlést ne vedd ki új
   gesztus kedvéért; az új vezérlés mellé kerüljön.

Kapcsolódó: [[game-accounts-student-self-registration]], [[orchestration-lessons-games]], [[no-deploy-during-active-runs]]
