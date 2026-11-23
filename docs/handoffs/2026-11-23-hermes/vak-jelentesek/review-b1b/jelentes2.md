# Független review — eredmény-e-mail B1b, 2. kör
Fej: 75afa37f0f592d60857497e77a4fc9555d10454d
## Ítélet: IGEN, FELTÉTELLEL

Az előző blokkoló megszűnt. Az előző fej (`ce983598`) óta változott kódban nem találtam új blokkolót. Az újrapróbálási rés és az elavult komment külön jegyre mehet.

## Az előző kör leleteinek sorsa

- **L1 — megszűnt.** Az előző fej `roundActivityAt` függvénye hiányzó `lastAnsweredAt` esetén `startedAt`-ot adott. A mostani fej 0-t ad, vagyis ismeretlen kort (`source/shared/quiz-round.ts:16–26`), ezért a `source/client/src/lesson-runtime/resultReport.ts:33` őre nem dobja el a régi formátumú kört. A base (`49397146`) ilyen kört korvizsgálat nélkül küldött. Saját Chromium-próbában a régi sémának megfelelő, **8 napos kezdésű, 25 válaszos, lezáratlan**, válaszidő nélküli tárolt körből **1 kérés** ment; a base képletével kiszámolt azonosítóhoz került a jelző, a következő újratöltéskor **0 kérés** ment. A régi tárolóból az utolsó válasz tényleges kora nem állapítható meg.
- **L2 — nyitott, közepes, meglévő hiba.** A korvizsgálat továbbra is az `apiRequest` hívása előtt fut, nem minden HTTP-próbálkozás előtt. A 2. kör diffje ezt az utat nem változtatta meg.
- **L3 — az eredeti teszthiány megszűnt.** Az új Playwright-eset az első és a többi választ külön időpontra teszi: nyolcnapos kezdet és friss utolsó válasz mellett 1 beküldést vár, és ellenőrzi az eltérő időket a törzsben (`source/tests/lesson-result-email-quiz.spec.ts:149–162`). A régi tárolós eset méri a küldést és a mező kihagyását (`:164–188`), a negatív eset már a POST-kísérleteket is számlálja (`:139–144`). Mind lefutott.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

- **L2 — közepes, meglévő hiba: a korhatár nem érvényesül az egy küldésen belüli újrapróbákra.** `source/client/src/lesson-runtime/resultReport.ts:51`, `source/client/src/lib/queryClient.ts:93–117`. A tanuló mobilon kitölti a kvízt, az első kérés hálózati hibát kap, majd a böngésző a várakozás alatt felfüggeszti a lapot. Ha ugyanaz a lap nyolc nap után folytatódik, az újrapróba nem tér vissza a korvizsgálathoz. Az első kör ezt Chromiumban reprodukálta; itt a vezérlési láncot és a base-t ellenőriztem vissza, a hosszú felfüggesztést nem ismételtem meg. A base ugyanitt szintén küldött, tehát nem regresszió. **Javítás:** minden tényleges POST előtt ellenőrizni a lezáratlan kör határidejét, az `apiRequest` többi hívójának változtatása nélkül.
- **L4 — kicsi: a tárolós séma kommentje még a törölt visszaesést írja le.** `source/client/src/lesson-runtime/useExperienceRound.ts:8`. Aki egy régi, mező nélküli vendégkör beküldését vizsgálja, a komment alapján tévesen a kezdéshez fogja mérni a korhatárt. A függvény ehelyett 0-t ad (`source/shared/quiz-round.ts:25–26`), így nem tiltja a küldést. Az 1b megvalósítási jegyzet már helyes (`docs/specs/2026-11-22-eredmeny-email-bontas-vegrehajtas.md:40–42`). **Javítás:** a séma kommentje is mondja ki, hogy válaszidő hiányában nincs koralapú tiltás.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — próbáltam, nem sikerült megtörni.** A B1a szigorú sémája mindkét fajtánál opcionális, pozitív egész `startedAt`-ot, csak kvíznél opcionális, pozitív egész `lastAnsweredAt`-ot fogad (`source/shared/lesson-result-email.ts:14–21`). Chromiumban a feladatkör 15 válasszal és pozitív egész `startedAt`-tal, `lastAnsweredAt` nélkül ment; a követett teszt a rögzített kvíztörzsön hívja a sémát. A nullát a `startedAt > 0` ág kihagyja (`resultReport.ts:44`); a régi tárolós séma nullát megenged, de a `startedAt` kulcsot eleve megkövetelte. A szerveren a törzs ellenőrzése a `lesson-result-email.ts:174–175`, a levélmeta átvétele a `:198` soron van.
2. **Biztonság, adatvédelem — nem találtam diffből eredő rést.** A két időmező a meglévő POST JSON-törzsében van, nem kerül URL-be vagy új naplóba. A token, a CSRF-út és az útvonal változatlan (`resultReport.ts:40–52`, `queryClient.ts:57–67`); új GET-mellékhatás nincs a diffben. Ez diff-ellenőrzés, nem teljes biztonsági audit.
3. **Regresszió — a vizsgált vendégutakat nem sikerült megtörni.** Feladat és kvíz után egy-egy beküldés ment, ismétlés nélkül. A régi kör válaszai és azonosítója megmaradtak. A döntőbíró és a 45 másodperces tartalékág változatlan (`resultReport.ts:20–30`, `LessonExperienceView.tsx:78–89`); a döntőbíró kliensének célzott tesztjei zöldek, a teljes várakozási láncot nem mértem újra.
4. **Időzóna, dátumhatár — próbáltam, nem sikerült megtörni.** A korhatár eltelt idő, `7 × 86 400 000` ms: egységtesztben pontosan a határon küldhető, a következő ezredmásodperctől nem. A B1a Budapest-tesztje a nyári, téli és az éjfél utáni dátumot is ellenőrzi. A kvízfül megnyitása után nyolc nappal visszaállított órával is elment egy teljes kvíz; a két pozitív egész idő sorrendje megfordult, de a szerződés nem ír elő sorrendet.
5. **Migráció, Drizzle, indítás, cron, leállítás — közvetlenül nem alkalmazható.** A diff ezeket nem érinti. Az E2E eldobható PostgreSQL-lel indult, kihagyta az e2e háttérjobokat, zölden végzett, a futtató eltávolította az adatbázist.
6. **Versenyhelyzet, újrapróba — meglévő L2.** A `roundId`, a helyi jelző és a szerver egyedi kulcsa változatlan. A már jelölt kör nem ment újra. A hálózati/timeout újrapróba egységtesztje zöld; többfüles versenyt ebben a körben nem futtattam.
7. **Tesztminőség — az L3 próbái megkülönböztetik a kezdést és a válaszidőt.** A negatív eset tényleges POST-kísérletet mér; az 1b jegyzet dokumentálja a régi tároló kezelését. Megkíséreltem a védősor törlésével és a régi visszaesés visszarakásával az izolált mutációt, de a futtató Node 24 alatt nem engedte futni. A módosított kóddal futó Playwright-próba **UNVERIFIED**; a forrásőr és a böngészős ellenpróbák nem helyettesítik ezt.
8. **B1b-korhatár, köridentitás — az eredeti blokkolót nem sikerült újra előidézni.** Ismert, nyolcnapos válasznál a saját Chromium-próba lezárás előtt **0**, utána **1** kérést mért. Ismeretlen válaszidőnél a base-formátumú, nyolcnapos kezdésű kör ugyanazzal az azonosítóval elment. Hatnapos válaszidőt és nyolcnapos kezdés mellett friss válaszú esetet a követett tesztek mértek.
9. **Egyéb — L4.** A séma elavult kommentje az ellenkező viselkedést ígéri. A `git diff` szerint négy éles fájl, 30 hozzáadott és 4 törölt sor; nincs új kapcsoló.

## Mit próbáltam megtörni, és nem sikerült

- Régi alakú, teljes vendégkört töltöttem vissza hiányzó válaszidővel. Megmaradt mind a 25 válasz; egy kérés és a régi hash alapján várt jelző keletkezett. Újabb betöltés nem küldött ismét.
- Ismert, régi válaszidővel újratöltöttem, majd kézzel lezártam. Az első esetben nem volt eredménykérés, a másodikban volt. Megnéztem az álló (390×844) és fekvő (844×390) képet; mindkettőn látszott a visszatöltött válasz és a visszajelzés.
- A kvízfül megnyitása után visszaállítottam az órát, majd végigkattintottam a kvízt. Egy beküldés ment. A következő feladatkör törzsében nem jelent meg a kvízre fenntartott mező.

## Mit NEM vizsgáltam

- Nem küldtem valódi levelet, nem vizsgáltam az éles telepítést és nem futtattam az eredményvégpont DB-integrációját. A B1a éles megléte a megbízás előfeltétele; a böngészős POST-ok helyi mockra mentek. Az éles kézbesítésről és DB-s deduplikációról nem adok új igazolást.
- Nem jártam be újra a bejelentkezett szerveres kvízt, a régi HTML-anyag útját, a fiókváltást vagy a többfüles versenyhelyzetet. A döntőbíró késleltetését és a teljes 45 másodperces ágat sem mértem újra; ezeken a változatlan utakon a megállapítás a diffre és a célzott tesztekre korlátozódik.
- Nem futtattam teljes `gate:push`-t. A védősor nélküli build és a nullás kezdés teljes böngészős útja nem mért.

## Megcáfolt gyanúk

- A hiányzó válaszidő miatt a régi kör beolvasása vagy automatikus beküldése elmarad: a forma és a beküldés Chromiumban megmaradt.
- Az új mező megváltoztatja a régi `roundId`-t: a base és a fej azonos bemenetből hash-el, és a böngésző a base képletével előre számolt kulcs alá írt.
- A korhatár a már lezárt kört is eldobja: az elavult kör kézi lezárásakor ténylegesen megjelent az egyetlen POST.

## Mit futtattam (parancs + eredmény)

- `run_e2e source/tests/lesson-result-email-quiz.spec.ts source/tests/lesson-result-email.spec.ts` — **7 átment**.
- `npx tsx --test source/tests/result-report-complete.test.ts source/tests/lesson-result-email.test.ts` — **10 átment**; `npx tsx --test source/tests/lesson-result-email-date.test.ts` — **3 átment**; `npx tsx --test source/tests/request-retry.test.ts source/tests/arbiter-client.test.ts` — **4 átment**.
- `npx tsc --noEmit` — 0-s kilépés.
- `run_browser_scenario .blind-review-tmp/b1b-vissza.json` — régi alaknál **1**, második újratöltés után **0** kérés; ismert elavult válasznál lezárás előtt **0**, utána **1**. Az első beküldött forgatókönyvet névhossz miatt a futtató nem futtatta; ezek a javított változat eredményei.
- `run_browser_scenario .blind-review-tmp/b1b-szerzodes.json` — visszaállított órás kvíz és külön feladatkör: **1–1**; feladattörzs: `answers`, `fingerprint`, `kind`, `roundId`, `startedAt`.
- `node .blind-review-tmp/b1b-mutacio.mjs` — nem futott: a futtató elutasította, mert Node v24.22.3 alatt a homokozó nem tudja kizárni a hálózatot.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 0 | 0 | 0 | 0 | 0 |
| közepes | 1 | 1 | 0 | 0 | 0 |
| kicsi | 1 | 1 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L2** (közepes) Meglévő hiba: a korhatár nem érvényesül a folyamatban lévő küldés újrapróbáira — `source/client/src/lesson-runtime/resultReport.ts:51` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 23 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 5054
- tokenek: 1387147 bemeneti (ebből gyorsítótárból: 1292070, gyorsítótárba írva: 95008), 18452 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 93.8%; becsült megtakarítás: 4.8149 USD
- költség (a tényleges usage alapján): 0.5514 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
