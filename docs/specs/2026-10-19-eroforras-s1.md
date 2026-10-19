# Erőforrás-optimalizálás S1 — az adatbázis elaludhat, 1 órás AI-gyorsítótár, kitelepítés futás közben

Állapot: tulajdonosi jóváhagyás 2026-10-19 („Mindegyik javaslatodat elfogadom. Szépen sorban, szeletenként hajtsd végre, de
figyelj a deploynál a futó tananyagkészítésre.”). Az elemzés mért adatai alább; a többi szelet: S2 (forgalom + tárhely),
S3 (AI-gyártás pazarlása).

## Mérés (2026-10-19)
- **Neon** („Anyagok Profiknak - DEV” = WEBSULI éles, Scale csomag), okt. 1. óta:
  - aktív idő 1 616 184 s = a teljes időszak, soha nem függesztett fel;
  - kb. 449 CU-óra a min. 1 CU-n;
  - endpoint autoscale 1–8 CU.
- **Az ébren tartó időzítők** (mindegyik adatbázist kérdez):
  - `scheduledPublishing` cron `* * * * *` — a `scheduled_jobs` tábla ÜRES, és a kódban semmi nem ír bele;
  - `learning-worker` 60 s;
  - stúdió-söprés 100 s;
  - okosítás-söprés 120 s;
  - munkamenet-takarítás 15 perc.
- **AI:** 4 nap, 425 Opus-hívás, a bemenet 24,3%-a jön a gyorsítótárból.
  - A hosszú gyártás (`single-run/conversation.ts`) az alapértelmezett 5 perces TTL-t használja.
  - A körök (generálással) gyakran 5 percnél hosszabbak — a dokumentáció szerint az 5–60 perces köztes időnél az 1 órás TTL
    a helyes.
- **Render** (Starter, 1 példány):
  - naponta 6–31 kitelepítés, autoDeploy, nincs build-szűrő (a csak doksi commit is újraindít);
  - a szerver 30 s-ot vár leálláskor;
  - 2026-10-19 09:56 egy kitelepítés megszakított egy okosítást.

## Cél
1. **Időzítők** (az adatbázis tétlenségben elaludhasson):
   - `scheduledPublishing`: óránként (`0 * * * *`) — a funkció megmarad, a percenkénti üres lekérdezés megszűnik;
   - `learning-worker`: indításkor + 30 percenként;
   - stúdió-söprés: 15 perc (indításkor marad);
   - okosítás-söprés: 15 perc (review #324: az 5 perc egybeesne a Neon 5 perces elalvási küszöbével);
   - munkamenet-takarítás: 6 óra.
2. **AI-gyorsítótár:** a hosszú gyártás mindkét töréspontja (`system` és kérés-szintű) `ttl: "1h"`.
3. **Kitelepítés futás közben:**
   - **Számláló:** `executeWorkflow` számolja az élő futásokat (`activeWorkflowRuns()`).
   - **Leállás:** SIGTERM-re a szerver nem fogad új kérést, és legfeljebb 270 s-ig vár, amíg a számláló 0 lesz (a kivárás azonnal indul, a cron leáll); 3 s takarítás után
     zárja a poolt (review #324).
   - **Render-beállítás** (a kód összevonása után, API-val): `maxShutdownDelaySeconds = 300`, build-szűrő a `docs/**`,
     `**/*.md`, `source/tests/**`, `.github/**` útvonalakra.
4. **Neon:** az összevonás és a mérés után az endpoint minimuma 0,25 CU, felfüggesztés az alapértelmezett 5 perc után.
   - Csak ha a következő 1 órában az aktív idő valóban megszakad (mérés).
   - Visszaállítási pont: 1 CU minimum.

## Nem-cél
- A forgalom (S2) és az AI-gyártás pazarlása (S3).
- A gyakorlóbank modellje (a 2026-10-16-i tulajdonosi döntés szerint Opus marad).

## Elfogadás (EARS)
- **Ütemezés:** HA a szerver fut, AKKOR a `scheduled_jobs`-t legfeljebb óránként kérdezi; a tanulási ellenőrzés legfeljebb
  30 percenként fut.
- **Gyorsítótár:** HA hosszú gyártási kérés megy, AKKOR mindkét töréspont `ttl: "1h"` (egységteszt a kérés alakjára).
- **Leállás:** HA SIGTERM jön, miközben futás él, AKKOR a szerver legfeljebb 270 s-ig vár a futás végére (egységteszt a
  várakozó függvényre).
- **Kitelepítés:** a kitelepítés csak akkor indul, ha a csak olvasó őr szerint nincs futó gyártás, javítás vagy okosítás.
