# Tételgyár T7 — döntőbíró a nyílt feladatokra (GPT-6.1 Sol) — terv (2026-10-15)

Szülőterv: `docs/specs/2026-10-15-tetelgyar-bank-lektor-uj-modszertan.md` (7. fejezet D2/T7; 9. fejezet: a T2 utáni maradék helyes-eset
bukást a T7 kezeli). Sorrend: T2 → **T7** → T6 → T5 → T3.

## Kódból ellenőrzött kiinduló tények
- A gyerek nyílt válaszát ma KIZÁRÓLAG a böngésző pontozza: `client/src/lesson-runtime/LessonExperienceView.tsx` (`evaluateOpenAnswer`,
  összesítés `scoreSummary`), a válasz csak a localStorage-ban él (`useExperienceRound.ts`); a szerver a szöveget soha nem kapja meg.
- A publikált Studio-lecke a React-úton fut (`Preview` → `LessonView` → `LessonRuntime` → `LessonExperienceView`); a nyilvános lecke-JSON:
  `GET /api/lessons/by-file/:htmlFileId` (`server/studio/lesson-routes.ts`, csak publikált sor). A webes kutatású (HTML) leckék iframe-ben,
  külön originről futnak (`HtmlLessonTasks.tsx`).
- Gyerek nyilvános, anonim (session vagy ujjlenyomat: `learnerOf`, `lesson-routes.ts`). A `/api/lessons` nem-GET kérései: CSRF-token
  (`csrf-sync`) + `publicWriteLimiter` (100 / 15 perc / IP, `server/index.ts`).
- Ma nincs nyilvános, gyerek kérésére modellt hívó végpont; minden modellhívó útvonal admin. A GPT-6.1 Sol be van kötve
  (`createStudioStepProvider`, OpenAI-kulcs), gyorsítótár-minta: `ocr_transcripts` (DB, kulcs → eredmény).

## Cél
Ha a determinisztikus pontozó a gyerek válaszára nem ad teljes pontot, egy döntőbíró a feladat, a tanítás kulcsgondolatai és a mintaválasz
alapján eldönti, hogy a válasz tartalmilag helyes-e — a T2 mérése szerint a helyes, saját szavas válaszok jelentős része ma részpontot kap.

## Alapelvek (biztonság)
- **Csak emelhet:** a döntőbíró ítélete a determinisztikus ítéletnél jobb lehet, rosszabb soha (`ok` válaszra nincs hívás; hiba/időtúllépés
  → a determinisztikus ítélet marad).
- **A rubrika a szerveré:** a végpont a feladatot a publikált leckéből tölti (htmlFileId + taskId); a kliens csak a választ küldi.
- **Adatminimalizálás:** a szolgáltatóhoz csak a válasz szövege és a feladat tartalma megy — azonosító, ujjlenyomat, IP nem; e-mail/telefonszám
  mintázat kitakarva; a válasz hossza korlátozott.
- **Promptinjekció:** a válasz adatként, elválasztva kerül a promptba; szigorú JSON-kimenet; a döntőbíró utasítása a válasz szövegében lévő
  utasítást figyelmen kívül hagyja. A tét alacsony (a nyílt feladat pontja helyi, kupon nem függ tőle).
- **Költség és visszaélés:** IP-nkénti korlát, napi globális hívásplafon, gyorsítótár (feladat-hash + normalizált válasz) — azonos válaszra
  egyszer fizetünk.

## Szeletek
- **T7.1 szerver:** `POST /api/lessons/:htmlFileId/arbiter` { taskId, answer } → { state, score, reason, source: "pontozó" | "döntőbíró" | "gyorsítótár" }.
  Determinisztikus előszűrés a szerveren is; gyorsítótár; Sol-hívás rövid határidővel; korlátok; napló (összesítő számok, szöveg nélkül).
- **T7.2 kliens:** a React-lejátszó az értékeléskor a nem teljes pontos feladatokra hívja; a kártya mutatja („A döntőbíró elfogadta: …”),
  az összesítés az emelt ítélettel számol; hálózati hiba → változatlan.
- **T7.3 (később, külön döntés):** a HTML-leckék (külön origin) bekötése.

## Nem-cél
- A pontozó (v1/v2) és a régi leckék determinisztikus ítéletének változtatása; a gyerek felületének átalakítása az új sornál tovább.
- Válaszok tartós tárolása gyerekhez kötve.

## Tulajdonosi döntést igénylő pontok (a végrehajtási utasítás előtt)
1. Gyerekszöveg küldése az OpenAI-hoz (GPT-6.1 Sol) — adatminimalizálással.
2. A gyorsítótár helye: DB-tábla (migráció; újraindítás után is él) vagy memória (migráció nélkül; újraindításkor ürül).
3. Napi hívásplafon és IP-korlát értéke.
4. Hatókör: először csak a Studio (React) leckék.

## Elfogadás (EARS)
- E1: HA a pontozó `ok`-t ad, AKKOR nincs modellhívás.
- E2: HA a döntőbíró hibázik / időtúllép / a plafon elfogyott, AKKOR a determinisztikus ítélet marad.
- E3: A döntőbíró ítélete soha nem alacsonyabb a determinisztikusnál.
- E4: Azonos feladat + normalizált válasz → a második kérés gyorsítótárból (modellhívás nélkül).
- E5: A szolgáltatóhoz küldött tartalomban nincs tanuló-azonosító, ujjlenyomat, e-mail/telefonszám.
- E6: Nem publikált lecke / ismeretlen feladat → 404; túl hosszú válasz → 400; korlát → 429.

## Tulajdonosi döntések (2026-10-15)
1. **Adatvédelem:** igen, adatminimalizálással (csak a válasz szövege és a feladat tartalma; azonosító / ujjlenyomat / IP nem; e-mail és
   telefonszám kitakarva; legfeljebb 1000 karakter; a válasz nem tárolódik gyerekhez kötve).
2. **Gyorsítótár:** adatbázis-tábla (migráció; kulcs-hash → ítélet, a válasz szövege nélkül).
3. **Korlátok:** napi 2000 fizetett döntőbíró-hívás összesen; IP-nként 60 kérés / 15 perc.
4. **Hatókör:** a Studio (React) és a HTML-leckék (iframe, `/dev/:id`) egyszerre.
