# Napi tananyag-emlékeztető a regisztrált tanulóknak — terv

**Tulajdonosi kérés (2026-10-18):**
- „a regisztrált tanulóinknak küldjél mindig emlékeztető e-mailt, hogy a tantervből kiszedett dátumok és tanulási időszakok
  alapján minden nap ajánlj nekik egy aktuális tananyagot … rákattintva nyíljon meg egyből a tananyaguk”;
- „A négy regisztrált … tanulónak nincs leiratkozási lehetősége. Ez a lényeg: tanuljanak a gyerekeink.”;
- „rendelj hozzájuk neveket is”. A négy tanuló neve a tulajdonostól ismert; az e-mail-címekből egyértelmű, ki kicsoda.

## Felmérés (kódból és éles, csak olvasó lekérdezésből)
- **Címzettek:** `extra_email_addresses`, 8 aktív cím; mezők: e-mail, évfolyamok, aktív.
  - A négy tanulóhoz 6 cím tartozik (két tanulóhoz kettő-kettő).
  - A többi 2 cím több évfolyamos (szülő / tanár).
- **Név:** nincs név mező.
- **Küldés:**
  - Resend (`server/resend.ts`), naplózás az `email_logs` táblába;
  - az ütemezés folyamaton belüli `node-cron`, időzóna nélkül;
  - a Render egy példányon fut.
- **Tanítási napok:** a `shared/school-calendar.ts` ismeri a tanítási napokat (hétvége és szünet nélkül), de nem exportálja.
- **Mélylink:** `/preview/:id` (`getMaterialPreviewUrl`).

## Döntések
1. **Tanulónév** (`extra_email_addresses.student_name`, nem kötelező, legfeljebb 80 karakter, migráció `0031`):
   - az admin E-mail címzettek fülén látható és szerkeszthető;
   - a négy tanuló nevét a deploy után a tulajdonos kérésére egyszeri, nem commitolt szkript állítja be;
   - személyes adat a repóba nem kerül.
2. **Ki kap levelet:** az aktív, nevesített cím (a tanulók), mindegyik címre.
   - A tulajdonos döntése szerint a tanuló nem iratkozhat le.
   - Az admin a címet inaktiválhatja vagy a nevet törölheti; ezzel áll le a küldés.
3. **Mikor:** minden tanítási napon 6:45-kor, magyar idő szerint (`Europe/Budapest`); hétvégén és szünetben nem.
4. **Mit:** a tanuló évfolyamának (a cím első évfolyama) a tanmenet szerint a mai naphoz legközelebbi anyaga.
   - **Rendezés:** ugyanaz, mint a „Most tanuljuk” listáé (`curriculumSort`, előbb a következő hetek).
   - **Ismétlés kerülése:** amelyik anyagot az utolsó 10 tanítási napban már megkapta, kimarad.
   - **Tartalékok:**
     - tanmenet-pozíció nélkül a legújabb, még nem küldött anyag;
     - ha nincs anyag az évfolyamon, nincs levél.
5. **Levél:**
   - **Tárgy:** „{Keresztnév}, a mai tananyagod: {cím}”.
   - **Törzs:** „Szia, {keresztnév}!”, a napi lelkesítő mondat, a cím és a tanmenet-téma, egy nagy „Megnyitom a tananyagot” gomb
     (`/preview/:id`).
   - A keresztnév a teljes név második tagja (magyar névsorrend).
6. **Ismétlésvédelem:**
   - új tábla: `daily_reminder_emails` (e-mail, nap, anyag, státusz, egyedi: e-mail + nap);
   - egy címre naponta legfeljebb egy levél, újraindítás vagy két példány esetén sem több;
   - sikertelen küldés `failed` státusszal marad, és aznap egyszer újrapróbálható.
7. **Admin:** „Mai emlékeztetők” előnézet: a kiválasztott anyag címenként, küldés nélkül. Ehhez egy „Küldés most” gomb tartozik,
   ugyanazzal az ismétlésvédelemmel.
8. **Fejlesztői környezet:** a cron csak éles környezetben indul. A tesztek befecskendezett küldővel futnak, éles levél nélkül.

## Nem-cél
- Szülői összesítő, leiratkozó link, a nyilvános oldal névkártyájának összekötése a címekkel.
- Munkaszüneti napok (pl. okt. 23.) levonása; a naptár nem ismeri őket.

## Edge case-ek
- Ugyanannak a tanulónak a két címe ugyanazt a napi anyagot kapja; a választás determinisztikus.
- Ha a mai anyag már szerepelt, a következő legközelebbi jön.
- Ha nincs Resend-beállítás, nincs küldés, és ez naplózódik.

## Elfogadás (EARS)
- HA tanítási nap van, AKKOR minden nevesített, aktív cím pontosan egy levelet kap, a saját évfolyamának tanmenet szerint aktuális
  anyagával, és a link azt nyitja meg.
- HA hétvége vagy szünet van, AKKOR nincs levél.
- HA a feladat aznap kétszer fut, AKKOR sincs második levél.
- HA egy cím nincs nevesítve vagy nem aktív, AKKOR nem kap levelet.
