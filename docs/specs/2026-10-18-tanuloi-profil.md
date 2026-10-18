# Tanulói profil: ki tanul, mit, milyen eredménnyel — terv

**Tulajdonosi kérés (2026-10-18):** „Tudod azonosítani a telefont? Mert akkor a gyerekek neve és a gyerekek tevékenysége is
monitorozható. Adj rá ötleteket…” A javaslat elfogadva: „A teljes javaslatod érdekel, … vidd végig a teljesed.”

## Kiinduló helyzet (mérve)
- **A tanulók:** az `extra_email_addresses` sorai. Mezők: `student_name`, `classrooms[]` (évfolyam), egy tanulónak több címe is
  lehet (Kristóf: 2, Marcell: 2). Önálló tanuló-azonosító nincs.
- **Látogató:** névtelen. A `material_views` csak `user_agent`-et és anyagot tárol, a `[TRACKING] … by anonymous user` naplósor
  szerint. Az eszköz (IP + böngésző) nem azonosítható megbízhatóan: közös otthoni vagy iskolai IP, változó cím.
- **Az anyag kerete:** más eredetű (`MATERIAL_ORIGIN`). A `/preview/:id` semmilyen paramétert nem ad tovább a keretnek.
- **Eredménylevelek:**
  - régi anyag: `/api/material-result`;
  - Stúdió-lecke: `/api/lessons/:id/results`, a név „Vendég tanuló”.
- **Napi emlékeztető:** névre szól (`server/daily-reminder.ts`), de a link (`getMaterialPreviewUrl`) nem személyes.

## Döntések
1. **Azonosítás: személyes, aláírt link, ujjlenyomat nélkül.**
   - **Token:** `t=<tanuló-azonosító>.<verzió>.<HMAC>` (`LEARNER_LINK_SECRET`, hiányában `SESSION_SECRET`).
   - **Párosítás:** a napi emlékeztető minden linkje tartalmazza. Az első megnyitáskor az eszköz eltárolja (localStorage), és a
     címsorból azonnal eltávolítja. Ettől kezdve „ez az eszköz Dominiké”.
   - **Kézi párosítás:** az admin a „Tanulók” fülről másolhat párosító linket (pl. közös tablethez).
   - **Visszavonás:** a verzió léptetése minden eszközt érvénytelenít.
   - Nincs nyilvános névválasztó: a gyerekek neve a nyilvános oldalon nem jelenik meg.
2. **Adatmodell:**
   - **`learners`:** a tanuló egy sor (név, évfolyam, tokenverzió). Az e-mail-címek `learner_id`-vel kapcsolódnak, a meglévő
     nevekből visszamenőleg feltöltve. A név- vagy évfolyam-szerkesztés után a kapcsolat újraszinkronizálódik.
   - **`learner_activity`:** megtekintés (`view`) és eredmény (`result`, százalék, rövid összegzés), anyagonként.
   - **Megőrzés:** egy tanév, 365 nap; naponta törlődik.
3. **Hozzárendelés:**
   - a `/preview/:id` a párosított eszköz tokenjét átadja a keretnek;
   - a `/dev/:id` ellenőrzi, megtekintést rögzít, és a beinjektált eredményküldő szkriptek a tokent is elküldik;
   - a Stúdió-lecke eredménykérése fejlécben viszi.

   Így az eredménylevél tárgya névvel indul: „Dominik – Igék témazáró: 23/25”.
4. **Tanulói élmény:**
   - **Évfolyam:** a párosított eszközön a profil évfolyama az irányadó (a Léna-féle félresorolás nem fordulhat elő).
   - **Napi sorozat:** a köszöntőkártyán „N napja tanulsz egymás után”.
5. **Admin:**
   - **„Tanulók” fül:** tanulónként az utolsó aktivitás, a 7 napos aktív napok és a legutóbbi eredmények, plusz párosító link és
     visszavonás.
   - **Heti összefoglaló e-mail:** vasárnap 18:00, tanulónként.
   - **Inaktivitás-riasztás:** 3 egymást követő tanítási nap aktivitás nélkül, 18:00-kor, egyszer.
6. **Okosabb emlékeztető:**
   - a még meg nem nyitott, aktuális anyag elsőbbséget kap;
   - a 70% alatti eredmény 7 nap múlva „Ismétlés” ajánlásként visszatér.

## Szeletek (egy szelet = egy PR, saját végrehajtási utasítással)
- **S1 Azonosítás:** migráció, token, `GET /api/learner/me`, személyes emlékeztető-link, kliensoldali párosítás + profilévfolyam.
- **S2 Hozzárendelés:** keret-token, megtekintés és eredmény `learner_activity`-be, névvel ellátott eredménylevelek (régi anyag +
  Stúdió-lecke).
- **S3 Tanulói élmény:** napi sorozat a köszöntőkártyán.
- **S4 Admin:** „Tanulók” fül, párosító link + visszavonás, heti összefoglaló, inaktivitás-riasztás, megőrzési törlés.
- **S5 Okos emlékeztető:** még meg nem nyitott anyag előnyben, 70% alatti eredmény ismétlése.

## Adatvédelem
- **Csak a regisztrált tanulók:** a párosítatlan látogatóról nem gyűlik személyes adat.
- **A név helye:** a gyereknév nem kerül naplóba, kódba vagy URL-be. A token nem tartalmaz nevet.
- **Megőrzés:** 365 nap, utána automatikus törlés.
- **Átláthatóság:** a köszöntőkártyán „Szia, Dominik!”, a gyerek tudja, hogy a haladását látjuk.
- **Tulajdonosi teendő (nem kód):** a nem családtag tanuló szüleinek hozzájárulása az adatkezeléshez.

## Nem-cél
Eszköz-ujjlenyomat, nyilvános névlista, idegen látogatók követése, bejelentkezés kötelezővé tétele.

## Elfogadás (EARS)
- HA a tanuló a napi emlékeztető linkjére kattint, AKKOR az eszköz párosul, a címsorból a token eltűnik, és a köszöntő a nevén szól.
- HA a párosított eszközön más évfolyam volt tárolva, AKKOR a profil évfolyama lép életbe.
- HA a párosított eszközön kvízt vagy feladatot értékelnek ki, AKKOR az eredménylevél tárgya a tanuló keresztnevével kezdődik, és
  az eredmény a `learner_activity`-be kerül.
- HA a token hamis vagy visszavont, AKKOR a szerver névtelennek kezeli, és a kliens eldobja a tokent.
- HA egy tanuló 3 tanítási napon át inaktív, AKKOR az adminok egyszer riasztást kapnak.
