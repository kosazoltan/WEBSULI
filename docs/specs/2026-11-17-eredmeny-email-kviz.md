# Eredmény-e-mail: a kvíz eredménye is menjen el, kérdésenkénti részletezéssel

**Állapot:** S1a + S1b kész; a vak ellenőrzés (2026-11-18) leleteinek javítása: R1–R8; tulajdonosi döntés és telepítési sorrend: R9–R10 (2026-11-18); a második vak ellenőrzés leletei: R11–R14 – ág `fix/eredmeny-email-kviz` (PR #510)
Végrehajtási utasítás: [`2026-11-17-eredmeny-email-kviz-vegrehajtas.md`](2026-11-17-eredmeny-email-kviz-vegrehajtas.md)
Előzmény: [`2026-10-17-eredmeny-email.md`](2026-10-17-eredmeny-email.md)

Tulajdonosi hibajelentés (2026-11-17, szó szerint): „Még egy hiba: csak a szöveges feladatok eredményeit küldi el a tananyag a
szülőknek, a kvíz eredményét nem.”

## Cél

1. A vendég / párosított tanuló HELYI kvízének eredménye akkor is elmenjen, ha a tanuló minden kérdésre válaszolt, de a „Kvíz
   kiértékelése” gombot nem nyomta meg.
2. A kvíz levele kérdésenként mutassa: a kérdés, a gyerek válasza, a helyes válasz, jó / rossz; a kihagyott kérdés „nem válaszolt”.
   A szöveges feladatok levele ugyanígy: a kérdés, a gyerek válasza, a jelölés és a mintaválasz.

## Nem-cél

- A kézbesítés-nyilvántartás versenyhelyzete (`server/lesson-result-email.ts:48-66`, külön jegy) — nem nyúlunk hozzá, nem rontjuk.
- A címzettek köre (ma: az `ADMIN_EMAILS` környezeti változó listája) és a levél szétküldése tanulónkénti szülőcímre.
- A feladatok és a kvíz EGY közös levélbe vonása (a két rész külön időpontban zárul; a nyilvántartás részenként egyedi).
- A bejelentkezett felhasználó szerveres kvíze (`server/rewards/lesson-attempts.ts`) — lásd a döntési pontokat.
- A három régi HTML-anyag saját eredményküldése (éles adat, saját kód).
- A `tests/lesson-result-email.spec.ts` meglévő tesztje (a nyitott #492 PR módosítja): új teszt ÚJ fájlba kerül.

## A felderítés tényei (2026-11-17; útvonalak a `source/` alatt)

Az eredmény útja Stúdió-leckénél (az éles anyagok 241 / 245-e):

| Lépés | Hely | Feladatok | Kvíz |
|---|---|---|---|
| Gyűjtés | `client/src/lesson-runtime/useExperienceRound.ts:5-8` | `answers` (feladatazonosító → szöveg) | `picks` (kérdésazonosító → opcióindex) |
| Beküldés feltétele | `client/src/lesson-runtime/resultReport.ts:26` | `round.finishedAt` + a döntőbíró ítéletei (vagy 45 s) | `round.finishedAt` |
| Mikor lesz `finishedAt` | `client/src/lesson-runtime/LessonExperienceView.tsx:148` és `:164` | „Feladatok kiértékelése” gomb — nélküle a tanuló SEMMILYEN visszajelzést nem kap | „Kvíz kiértékelése” gomb — de a tanuló kérdésenként azonnal látja a helyes / hibás jelzést (`:155-156`) és a futó pontszámot (`:152`) |
| Kérés | `resultReport.ts:36-42` → `POST /api/lessons/:id/results` | `{ kind: "tasks", roundId, answers }` | `{ kind: "quiz", roundId, picks }` (a kihagyott: −1) |
| Szerver | `server/lesson-result-email.ts:86-131`, séma: `shared/lesson-result-email.ts:14-17` | `gradeTasks` (szerveroldali újrapontozás) | `gradeQuiz` |
| Nyilvántartás | `lesson_result_emails` (lecke, fajta, körkulcs) egyedi | fajta `tasks` | fajta `quiz` |
| Levél | `shared/lesson-result-email.ts:95-113` (`buildResultEmail`) | minden feladat: kérdés, jelölés, válasz | összesítés + CSAK a hibás kérdések; hibátlannál egy mondat |
| Címzettek | `server/lib/material-result.ts:96-108` (`resolveAdminRecipients`) | az `ADMIN_EMAILS` (tartalék: `ADMIN_EMAIL`) környezeti változó listája — nem tanulónkénti szülőcím | ugyanaz |

**Gyökérok (a):** a kliens a kvízt csak a „Kvíz kiértékelése” gomb megnyomása után küldi be (`resultReport.ts:26`,
`LessonExperienceView.tsx:88`), miközben a kvíz kérdésenként azonnal visszajelez és a pontszámot is mutatja — a gomb megnyomására
semmi nem készteti a tanulót. A feladatoknál a gomb nélkül nincs visszajelzés, ezért ott mindig megnyomják. A szerver (b) és a
levél (c) a kvízt kezeli: a meglévő `tests/lesson-result-email.spec.ts` a gomb megnyomása után a kvíz-beküldést igazolja.
UNVERIFIED: az éles `lesson_result_emails` tábla fajtánkénti darabszáma (adatbázis-hozzáférés nélkül nem mérhető; az orkesztrátor
`select kind, count(*) … group by kind` lekérdezéssel megerősítheti).

**Hiány (c):** a kvíz levele csak a hibás kérdéseket sorolja fel; a helyes válaszok kérdésenként nem látszanak. A feladatok
leveléből a mintaválasz hiányzik.

Egyéb tények: a tanuló szövege a levélben escape-elt (`shared/lesson-result-email.ts:92`, `esc`; teszt:
`tests/lesson-result-email.test.ts:40`); a levélben nincs dátum (időzóna-kérdés nincs); bejelentkezett felhasználónál a kvízt a
szerver a kör lezárásakor küldi (`server/rewards/lesson-attempts.ts:151`, `sendPracticeResult`); a régi HTML-anyagok (3 db) közül
egy tartalmaz `mailto:` hivatkozást, a `sendResultEmail` hívását egyik sem (éles, nyilvános tartalom alapján).

## A helyes viselkedés

- V1. A helyi kvíz beküldése megtörténik, amint (i) a tanuló lezárta a kört, VAGY (ii) a kör minden kérdésére válaszolt. Körönként
  egyszer (a meglévő `localStorage`-jelző és a szerver egyedi kulcsa); a későbbi lezárás nem küld újra.
- V2. A részben kitöltött, le nem zárt kvíz nem megy el (mint a feladatoknál) — döntési pont.
- V3. A kvíz levele: összesítés (pont / összes, százalék, osztályzat — változatlan), alatta MINDEN kérdés sorszámozva: ✅ / ❌, a
  gyerek válasza, hibásnál a helyes válasz; kihagyottnál „(nem válaszolt)” + a helyes válasz.
- V4. A feladatok levele: soronként a kérdés, a jelölés és a válasz (változatlan), alatta „Mintaválasz: …”.
- V5. Minden, a tanulótól vagy a leckéből származó szöveg escape-elve; más személyes adat nem kerül a levélbe (a tanuló neve / a
  „Vendég tanuló” felirat változatlan).
- V6. Kvíz nélküli körre nincs kvíz-levél (üres `picks` → `202 { queued: false }`, változatlan) — nincs „0 / 0”.

## Edge case-ek

- Minden kérdés megválaszolva, gomb nélkül → 1 beküldés; utána gombnyomás → nincs második; újratöltés → nincs újabb.
- 24 / 25 megválaszolva, gomb nélkül → nincs beküldés; „Lezárom a kihagyásokkal” → 1 beküldés, a kihagyott −1.
- Új kvíz indítása → új körazonosító → új beküldés.
- A beküldés hálózati hibája → a meglévő újrapróbálás; a jelző csak siker után íródik.
- Régi kliens (frissítés előtt megnyitott oldal): a szerver változatlanul fogadja; a levél új alakja a szerveren dől el.
- Bejelentkezett felhasználó: a helyi kvíz nem jelenik meg (`SavedLessonQuiz`), a szerver küld — változatlan.

## Elfogadás (EARS)

- E1. AMIKOR a vendég tanuló a helyi kvíz minden kérdésére válaszolt, A RENDSZER a gomb megnyomása nélkül egyszer beküldi a kvízt.
- E2. AMIKOR a tanuló ezután megnyomja a gombot vagy újratölti az oldalt, A RENDSZER nem küld újra.
- E3. AMÍG van megválaszolatlan kérdés és a kör nincs lezárva, A RENDSZER nem küld kvíz-eredményt.
- E4. A kvíz levele minden kérdést tartalmaz a gyerek válaszával, a helyes válasszal és a jelöléssel; a kihagyott „(nem válaszolt)”.
- E5. A feladatok levele a mintaválaszt is tartalmazza.
- E6. A tanuló szövege a levélben escape-elt (a meglévő teszt + új eset a kvíz opciószövegére).
- E7. A meglévő tesztek (`lesson-result-email.test.ts`, `learner-attribution.test.ts`, `lesson-result-email.spec.ts`) módosítás nélkül
  zöldek.

## S1b — félbehagyott kvíz, dátum a levélben, korkorlát (független review M1/1 és K1; orkesztrátori döntés 2026-11-17)

**Mit old meg és mit nem.** Az S1a a „mind megválaszolva, csak a gomb maradt el” esetet javítja. Az S1b a FÉLBEHAGYOTT helyi kvízt
(pl. 18 / 25 kérdés után bezárt lap) is elküldi. A bejelentkezett felhasználó szerveres kvíze külön szelet (S2:
`2026-11-17-eredmeny-email-foglalas.md`, ág `fix/eredmeny-email-foglalas`). Ez az ág önmagában tehát a panaszt a vendég / párosított
tanuló útján oldja meg, a bejelentkezett úton nem.

**Választott megoldás: késleltetett, szerveroldali küldés a legutolsó pillanatképből.** A kliens a lap háttérbe kerülésekor
(`visibilitychange` → rejtett) és elhagyásakor (`pagehide`) elküldi a kör PILLANATKÉPÉT (`partial: true`), ha van legalább egy
válasz és több, mint a legutóbb elküldött pillanatképben. A szerver a pillanatképet memóriában tartja (körönként a legutolsót), és
csak akkor küld „félbehagyva” levelet, ha 15 percig nem érkezik újabb pillanatkép vagy végleges beküldés. A végleges beküldés (kör
lezárva / mind megválaszolva) törli a várakozó pillanatképet.
- Miért nem azonnali küldés: telefonon a megbízható esemény a `visibilitychange`, amely alkalmazásváltáskor is jön — azonnali
  küldéssel a szülő „3 / 25 félbehagyva” levelet kapna, miközben a gyerek folytatja; körönként egyszeri korláttal pedig a későbbi,
  pontosabb állapot nem menne el. A késleltetés körönként legfeljebb EGY, a legutolsó állapotot mutató „félbehagyva” levelet ad.
- Nincs ellentmondó levélpár: ha a gyerek a 15 percen belül befejezi, csak a végleges levél megy. Ha később (a „félbehagyva” levél
  után) fejezi be, a végleges levél kimondja: „Ez a befejezett kör eredménye — a korábbi, »félbehagyva« jelzésű levél helyébe lép.”
- Ár (vállalt, dokumentált): a várakozó pillanatkép memóriában él — szerver-újraindításkor (telepítés) a még el nem küldött
  „félbehagyva” levél elvész (a végleges levelet ez nem érinti). Adatbázis-séma nem változik. Több példány esetén a pillanatkép és
  a végleges beküldés más példányra eshet (ma egy példány fut) — akkor a „félbehagyva” levél a végleges mellett is kimehet; a
  végleges levél felülíró mondata ezt az esetet is kezeli.
- Védelem: a `/results` végpont CSRF-tokenes (nem kivétel a `server/routes.ts:826-845` listáján) → a pillanatkép `fetch` +
  `keepalive: true` hívással megy, a már gyorsítótárazott tokennel (a `sendBeacon` nem tud fejlécet küldeni); a tokent a kliens az
  első kvízválasznál előre lekéri. GET-en nincs mellékhatás. Külön korlát a pillanatképekre (40 / 15 perc / IP), hogy a végleges
  beküldés kerete (20 / 15 perc) ne fogyjon el.
- Alsó küszöb: 0 megválaszolt kérdésnél nincs pillanatkép, nincs levél.

**A „félbehagyva” levél tartalma:** tárgy „… — Kvíz (félbehagyva: 18 / 25) — 72% (…)”; a pont és a százalék a MEGVÁLASZOLT
kérdésekre vonatkozik (13 / 18), a lista csak a megválaszolt kérdéseket mutatja; a fejben: „Állapot: félbehagyva — 18 / 25 kérdésre
válaszolt; a pont a megválaszolt kérdésekre vonatkozik.”

**Dátum (K1):** minden eredménylevél fejében „Beküldve: 2026. 11. 17. 20:41 (magyar idő)” (Europe/Budapest), és ha a kliens küldi,
„A kör kezdete: …”. A kérés új, opcionális `startedAt` mezője (ezredmásodperc; a szerver csak a múltbeli, 400 napnál nem régebbi
értéket fogadja el megjelenítésre).

**Korkorlát (K1), N = 7 nap:** a 7 napnál régebben kezdett, LE NEM ZÁRT kör utólag nem megy el (sem „mind megválaszolva”, sem
pillanatképként). Indok: a tároló leckénként egy kört őriz; egy hétnél régebbi, félbehagyott kör levele már nem a mostani tanulást
mutatja, és a mostani párosítás nevére menne. A lezárt kör (a tanuló kifejezett döntése) korlát nélkül megy, mint eddig.

**Független review (2026-11-17, `959f286c`: NEM) — javítva ebben a szeletben:**
- **B1 (blokkoló):** vendégnél a pillanatkép ujjlenyomat nélkül, a végleges ujjlenyomattal ment → más kulcs, a végleges nem törölte a
  várakozót, és ellentmondó „félbehagyva” levél ment ki. Javítás mindkét oldalon: a kliens az ujjlenyomatot az első válasznál előre
  lekéri, és a pillanatkép ugyanazzal megy (`peekFingerprint`); a szerver a végleges beküldésnél MINDKÉT vendég-kulcsot (ujjlenyomat és
  IP) törli és nézi. Teszt a valódi kliens törzsével (ujjlenyomat nélküli pillanatkép + ujjlenyomatos végleges).
- **K1:** a pillanatkép-keret 40 → 10 / 15 perc / IP; tanulónként legfeljebb 3 várakozó kör, telítéskor a LEGRÉGEBBI szorul ki
  (naplózva), a jogos új pillanatkép nem vész el csendben.
- **K4:** a várakozó-küldés naplója csak a hiba osztályát írja (a közös `errorClass` az S2-vel jön; összefésüléskor arra cserélendő).
- **K2 — példányszám:** a `render.yaml` a `websuli-api-eu` szolgáltatásnál `numInstances`-t nem ad meg (`plan: starter`); a Render
  alapértelmezése egy példány. A dashboardon beállított skálázás nem ellenőrzött (UNVERIFIED). Több példánynál a várakozó levél és a
  végleges beküldés más példányra eshet — jegy: kanban #135.

**PR #510 — Codex-leletek (2026-11-18), mind a négy valós, a pillanatkép-küldés szabályai így pontosulnak:**
- **P1 — elhagyás az alkalmazáson belül:** a leckéből a főoldalra navigálás (útvonalváltás) nem vált ki `pagehide`-ot és nem teszi
  rejtetté a lapot. Új szabály: a pillanatkép a beküldő komponens LEBONTÁSAKOR is megy (ugyanazokkal a feltételekkel).
- **P2 — új kör ugyanabban a nézetben:** a „legutóbb elküldött” számláló a KÖR azonosítójához kötött; új kör tiszta lappal indul.
- **P3 — csak az elfogadott küldés rögzül:** a pillanatkép „elküldve” állapota csak a szerver sikeres (2xx) válasza után íródik be.
  Hálózati hiba, 429 és 5xx után az állapot újrapróbálható marad. Ha a válasz a lap bezárása miatt nem várható meg, semmi nem
  rögzül: a következő betöltéskor a böngészőben tárolt kör a következő háttérbe kerüléskor / lebontáskor újra megy. Az ismételt
  küldés ártalmatlan: a szerver körönként a legutolsó pillanatképet tartja, a már kiment „félbehagyva” levelet a kézbesítés-
  nyilvántartás nem küldi újra. Egyidejűleg egy pillanatkép-kérés van úton (az azonos állapot nem megy kétszer párhuzamosan).
- **P4 — késve érkező pillanatkép a végleges után:** a szerver a pillanatkép fogadásakor ÉS a várakozó levél küldése előtt ellenőrzi,
  hogy a kör végleges eredménye megérkezett-e; ha igen, a pillanatkép nem ütemeződik / a levél nem megy ki. Két forrás: memóriában a
  véglegesített körök (lecke + körazonosító, 24 óráig, korlátos méret — a vendég eltérő kulcsát is fedi), és a kézbesítés-
  nyilvántartás végleges sora (újraindítás után is). Mindkét kérési sorrendre teszt.

**Vak hibakereső ellenőrzés (2026-11-18, `fec8d8b9`: NEM; 4 közepes, 6 kicsi) — a szabályok így változnak / pontosulnak:**
- **R1 — kizárás a „félbehagyva” levél és a véglegesítés között (K1, S1).** A „félbehagyva” levél MINDEN küldési kísérlete (az időzítő
  első küldése és a 60 mp-es újrapróba is) és a végleges beküldés „kiment-e már részleges levél?” vizsgálata ugyanazon a körönkénti
  (lecke + körazonosító) kizáráson megy át. A részleges kísérlet a kizárás ALATT ellenőrzi, hogy a kör véglegesült-e (memória és
  nyilvántartás), és a küldés végéig tartja; a végleges beküldés a kört azonnal (szinkron) véglegesítettnek jelöli, a felülírás-
  vizsgálatot és a végleges levél küldését a kizárás megszerzése után, a háttérben végzi (a tanuló válasza nem vár rá). Így csak két
  kimenet lehet: (a) a részleges levél a végleges ELŐTT kiment → a végleges levél tartalmazza a felülíró mondatot; (b) nem ment ki →
  a véglegesítés után már soha nem megy ki, a végleges levélben nincs felülíró mondat. Vállalt korlátok: a kizárás példányon belüli
  (több példány: kanban #135, a nyilvántartás-ellenőrzés ott is fut); ha a részleges levél csak a címzettek egy részének ment ki, a
  felülíró mondatot minden címzett megkapja; az időkorlát (30 mp) után bukottnak vett küldés sorsa a szolgáltatónál nem ismert.
- **R2 — a 7 napos korhatár az UTOLSÓ VÁLASZHOZ mér (K2; az E12 módosul).** A kör tárolja az utolsó kvízválasz idejét
  (`lastAnsweredAt`). A le nem zárt kör akkor „régi”, ha az utolsó válasza (ennek hiányában — régebbi tárolt körnél — a kezdete)
  7 napnál régebbi. A régen megnyitott, de MA megválaszolt kör tehát megy (végleges és pillanatkép is); a levél „A kör kezdete”
  sora a valódi, régi kezdést mutatja. A lezárt kör továbbra is korlát nélkül megy.
- **R3 — kör-csere a kör közepén (K3).** Ha a kör a nézeten belül lecserélődik („Új kvíz” → „Új kör indítása”), az ELHAGYOTT körről
  a csere pillanatában pillanatkép megy, ugyanazokkal a feltételekkel, mint háttérbe kerüléskor (rejtés nélkül is).
- **R4 — lejárt / érvénytelen CSRF-token (K4).** A `keepalive`-os küldés 403 válasz után érvényteleníti a gyorsítótárazott tokent, újat
  kér, és EGYSZER megismétli a kérést. Ha nincs gyorsítótárazott token (a korábbi előtöltés elbukott), a küldés előbb kér egyet;
  gyorsítótárazott tokennel azonnal, előzetes hálózati kör nélkül küld. Ha a lap közben bezárul (az ismétlésre nincs mód), semmi nem rögzül: a következő betöltéskor a tárolt kör
  friss tokennel újra megy.
- **R5 — a pillanatkép „összes” száma és a korhatár a szerveren (S3).** A „félbehagyva” levél összes-száma a szerver által ismert
  körméret (`experienceRoundSizes(...).quizRound`), nem a kliens által küldött azonosítók száma (ha a megválaszoltak száma ennél
  nagyobb, akkor az). A szerver a pillanatképet nem fogadja el, ha a kliens által küldött utolsó tevékenység (`lastAnsweredAt`,
  ennek hiányában `startedAt`) 7 napnál régebbi (`202 { queued: false, stale: true }`). Korlát: mindkét időbélyeg a klienstől jön —
  a szerver a becsületes (régi / hibás) klienst fogja meg, a szándékos hamisítást nem (azt a keret korlátozza). A VÉGLEGES beküldésnél
  a szerver nem érvényesít korhatárt (a lezárt kör korlát nélkül megy, és a szerver nem tudja megkülönböztetni a lezárt kört a
  „mind megválaszolva” körtől), és az összes-szám ott a beküldött kérdések száma marad (S1a, változatlan).
- **R6 — igaz visszajelzés (S4).** Ha a körről már kiment „félbehagyva” levél, a későbbi pillanatkép nem ütemeződik, és a válasz ezt
  mondja: `202 { queued: false, partial: true, alreadySent: true }` (a „körönként legfeljebb EGY” szabály marad; a kliens a 2xx választ
  továbbra is elfogadottként rögzíti, mert újraküldeni nincs mit).
- **R7 — a LEGTÖBB választ tartalmazó pillanatkép marad (S5).** Ha egy körre kevesebb választ tartalmazó pillanatkép érkezik, mint a
  várakozó (sorrendcsere, két fül), a várakozó tartalma marad; az időzítő újraindul.
- **R8 — a teljes kör végleges beküldése is `keepalive` (S5).** A kvíz végleges kérése `keepalive: true` jelzővel megy, hogy az utolsó
  válasz utáni azonnali lapbezárás ne szakítsa meg (a feladatoké nem: a törzsük meghaladhatja a `keepalive` 64 KB-os keretét).
  Sikeres végleges beküldés után a kör `…:partial:<kör>` kulcsa törlődik a `localStorage`-ból.
- **Mérlegelve, NEM változik (indokkal):** (1) a tanulónkénti „3 várakozó kör” leckénként értendő (`lecke|tanuló`), és vendégnél
  megkerülhető — a tényleges védelem az IP-keret és a teljes (5000) korlát; a szigorúbb kulcs a több leckét egymás után félbehagyó
  tanuló jogos leveleit dobná el. (2) A véglegesített körök memóriája tanulótól független, a körazonosító 32 bites lenyomat: ütközéshez
  ugyanazon lecke két köre kell 24 órán belül azonos lenyomattal (a lenyomat a kezdés ezredmásodpercét is tartalmazza); a következmény
  egy elmaradó „félbehagyva” levél — elfogadott. (3) A `…:sent:<kör>` jelzők körönként halmozódnak (néhány bájt / kör, a főágon is így
  van) — nem takarítjuk.
- **S2 — a pillanatkép-keret: ELDÖNTVE (tulajdonos, kérdőív, 2026-11-18: „Egy osztályra méretezve”) → R9.**

**Tulajdonosi döntés és telepítési sorrend (2026-11-18) — dokumentált spec-változás:**
- **R9 — a keretek egy osztályra méretezve (S2; a K1 korábbi 10-es kerete és a végleges 20-as kerete módosul).** Egy osztály közös IP
  mögött (iskolai wifi) ül: kicsengetéskor ~30 pillanatkép és ~30 végleges beküldés érkezik egy címről percek alatt. A pillanatkép-
  keret 60 / 15 perc / IP, a végleges beküldés kerete is 60 / 15 perc / IP — a két keret független (a pillanatképek nem fogyasztják a
  véglegesét). Egy helyen áll: `server/lesson-result-limits.ts` (`RESULT_RATE_LIMIT`); a kulcs változatlanul a valódi kliens-IP
  (`clientIpKeyGenerator`). Ár: a visszaélési plafon IP-nként 60 „félbehagyva” + 60 végleges levél / 15 perc (címzettenként).
- **R10 — a kliens visszafelé kompatibilis a régi szerverrel.** A kliens (Vercel) és a szerver (Render) egymástól függetlenül települ, a
  Vercel jellemzően hamarabb kész: a telepítés perceiben az új kliens a régi szervert hívja, amelynek sémája szigorú (`.strict()`), és
  az új mezőket (`startedAt`, `lastAnsweredAt`, `partial`) 400-zal utasítja el. Szabály: ha a VÉGLEGES beküldés 400-at kap, és a törzs
  új mezőt tartalmazott, a kliens EGYSZER megismétli a kérést az új mezők nélkül (a régi kliens alakjával; a szerver így is pontoz,
  csak a dátumsor marad ki). A PILLANATKÉP nem lép vissza: a régi szerver a `partial` nélküli pillanatképet végleges beküldésnek
  venné (a kihagyott kérdések hibásként, a végleges levél foglalná a kör kulcsát) — a pillanatkép 400 után nem rögzül elküldöttként,
  és a szerver telepítése után a következő háttérbe kerüléskor / betöltéskor megy.
  Választás indoka (a „szerver jelzi, hogy ismeri” megoldással szemben): csak kliensoldali, a régi szerverhez nem kell semmi; a jelzéses
  megoldáshoz új szerverjelzés és a lap elhagyásakor nem megvárható előzetes kör kellene, és a régi szerver úgysem jelezne.

- **Párhuzamos távoli commitok (2026-11-18 este):** a távoli ágra egy másik folyamat a régi `0eb6a4a1` fejre három commitot töltött
  (`569178f4`, `189ddb10`, `ab7dfe88`) ugyanarra a négy Codex-leletre (P1–P4), amelyet a `fec8d8b9` már megold. A beolvasztásban ez az
  ág (P1–P4 + R1–R10) az alap: a `189ddb10` új esetet nem kezel (a véglegesítési jelzője a pillanatkép-kulcshoz kötött, a mienk a
  lecke + körhöz, és a nyilvántartást is nézi), a tesztjei a meglévő P1–P4 tesztek megfelelői. Az `ab7dfe88` forrásmintái
  (`if (!token) return null;`, `void sending.then(…)`) a `189ddb10` szerződését rögzítik, amely nem került be — visszavonva; a mögöttes
  viselkedést (csak 2xx rögzül, token nélkül nincs kérés) a böngészős „503” és „R4 + S6” tesztek mérik.

**Második vak ellenőrzés (2026-11-18, `0d120177`: NEM; 3 közepes, 4 kicsi) — a szabályok így változnak (dokumentált spec-változás):**
- **R11 — a „félbehagyva” levél a LECKE + KÖR szerint egy (K1, K2).** A várakozó pillanatkép kulcsa, a „már kiment” vizsgálat (R6) és a
  felülírás-vizsgálat (R1) nem a tanuló-kulcstól (`who`: fiók / párosítás / vendég-ujjlenyomat / vendég-IP) függ, hanem a lecke +
  körazonosítótól — mint a kör kizárása és a véglegesített körök tárolója. A kézbesítés-nyilvántartásban a pillanatkép körkulcsa
  `roundKeyOf("partial-round", "quiz-partial", körazonosító)`: tanulótól független, így a „körönként legfeljebb EGY” az újraindítás és
  több példány esetén is az egyedi kulcson áll. Így ujjlenyomat nélküli → ujjlenyomatos, IP-váltásos, be- / kijelentkezéses esetben sem
  megy két levél, és a végleges levél felülíró mondata a más kulcson kiment részleges levelet is látja.
  **Védelem a kliens által választott körazonosítóval szemben (első rögzítő):** a várakozó pillanatképet csak a kör ELSŐ rögzítőjével
  „összeférő” beküldő írhatja felül vagy törölheti (végleges beküldéssel), és a véglegesített kör is csak összeférő pillanatképet nyom
  el. Összeférő: ugyanaz a tanuló-kulcs, VAGY az első rögzítő vendég (`guest:…`) — a vendég azonosítója (ujjlenyomat, IP) nem igazolt,
  ezért vendég körét bárki átveheti (a levél neve ekkor is „Vendég tanuló”), az igazolt (fiók / párosított) tanuló körét viszont csak ő.
  Nem összeférő pillanatkép: `202 { queued: false, partial: true, conflict: true }`. Vállalt korlát: a kör közbeni kijelentkezés
  (fiók → vendég) után a vendég-pillanatkép nem írja felül a fiókét (a fiók korábbi, kevesebb válaszú pillanatképe megy).
- **R12 — képesség-jelzés a telepítési átmenethez (K3; az R10 módosul).** A kliens (Vercel) és a szerver (Render) külön, nem
  vezérelhető sorrendben települ. A szerver a `GET /api/csrf-token` válaszában jelzi, hogy ismeri az új eredmény-API-t
  (`resultApi: 2`); a régi szerver ezt nem küldi. A kliens CSAK jelzés esetén küld pillanatképet és új mezőt (`startedAt`,
  `lastAnsweredAt`, `clientNow`); jelzés nélkül a régi viselkedés: pillanatkép nincs, a végleges beküldés egyszer, a régi alakkal megy.
  A végleges beküldés előtt a kliens megvárja a token (és vele a jelzés) lekérését; ha a token nem kérhető le, a régi alak megy. Az R10
  egyszeri, új mezők nélküli ismétlése csak jelzés MELLETT marad (ha egy átfedő, még régi példány 400-at ad); jelzés nélkül ismétlés
  nincs. Így régi szerver mellett gyerekenként pontosan annyi kérés megy, mint a régi kliensnél (a régi 20-as keret szerint).
- **R13 — a „félbehagyva” levél szövege (K6) és a kliens órája (K7).** Részleges levélben, ha minden megválaszolt kérdés helyes: „Minden
  megválaszolt kérdésre helyes választ adott.” (nem „Minden kérdésre…”). A részleges levél dátumsora „Utolsó válasz: …” (a gyerek
  utolsó válaszának ideje) a 15 perccel későbbi küldési idő helyett. A kliens elküldi a saját „most” idejét (`clientNow`); a szerver a
  7 napos határt a kliens két időbélyegének KÜLÖNBSÉGÉBŐL méri, és a levélbe írt időpontokat a saját órájára számolja át
  (`fogadás ideje − (clientNow − időbélyeg)`), így a késő / siető kliensóra nem dob el valódi pillanatképet és nem ír hamis időt.
  `clientNow` nélkül (régi kliens) a régi viselkedés (a szerver órájához mér).
- **R14 — leállításkor a várakozó „félbehagyva” levelek kimennek (K4).** A szerver leállításakor (SIGTERM / SIGINT) a várakozó
  pillanatképek a késleltetés kivárása nélkül, a szokott kapun (kizárás + véglegesítés-ellenőrzés) át azonnal küldődnek, legfeljebb
  15 másodpercig, az adatbázis-pool lezárása ELŐTT (a meglévő tananyag-eredmény ürítés mintájára). Az időkorlát után a leállás
  folytatódik (a még nem kézbesített levél elvész, naplózva). A 15 percnél korábbi küldés ára: a gyerek az ablakon belül még
  folytathatná — ekkor a végleges levél felülíró mondattal megy (R1).
- **Jegyre (nem javítva ebben a szeletben):** K5 — hamisított pillanatkép, amelyben a megválaszolt kérdések száma eléri a körméretet
  (a becsületes kliens ilyet nem küld; javítás iránya: `answered >= körméret` → `queued: false`).

Elfogadás (S1b):
- E8. AMIKOR a lap háttérbe kerül vagy a tanuló elhagyja, és a le nem zárt kvízkörben legalább egy új válasz van, A RENDSZER
  pillanatképet küld (`partial: true`); válasz nélkül vagy változatlan állapotnál nem.
- E9. AMIKOR egy pillanatkép után 15 percig nem jön újabb pillanatkép vagy végleges beküldés, A RENDSZER egy „félbehagyva” levelet
  küld a legutolsó pillanatképből; a végleges beküldés a várakozó pillanatképet törli.
- E10. AMIKOR a „félbehagyva” levél után a kör végleges eredménye megjön, A RENDSZER a végleges levélben jelzi a felülírást.
- E11. Minden eredménylevél tartalmazza a beküldés idejét magyar idő szerint.
- E12. Az a le nem zárt kör, amelynek UTOLSÓ VÁLASZA 7 napnál régebbi, nem megy el (R2; a régen megnyitott, ma megválaszolt kör megy).
- E17. Véglegesített körre „félbehagyva” levél SOHA nem megy ki — az újrapróbából sem; ha a részleges levél már kiment, a végleges
  levél tartalmazza a felülíró mondatot (R1; bukó küldővel és legalább 50 ismételt versenyhelyzettel mérve).
- E18. AMIKOR a kör a nézeten belül lecserélődik, A RENDSZER az elhagyott körről pillanatképet küld (R3).
- E19. AMIKOR a pillanatkép 403-at kap, A RENDSZER új tokent kér és egyszer ismétel; ha nem tud, a következő betöltés pótol (R4).
- E20. A „félbehagyva” levél összes-száma a szerver körmérete; a 7 napnál régebbi utolsó tevékenységű pillanatképet a szerver sem
  fogadja el (R5).
- E21. Már kiment „félbehagyva” levél utáni pillanatképre a válasz `queued: false, alreadySent: true` (R6).
- E22. Körönként a legtöbb választ tartalmazó pillanatkép marad (R7).
- E23. A kvíz végleges beküldése `keepalive` kérés (R8).
- E24. Ugyanarról a címről a 60. pillanatkép és a 60. végleges beküldés átmegy, a 61. 429; más cím kerete független (R9).
- E26. Egy körre — eltérő tanuló-kulcsú (ujjlenyomat nélküli / ujjlenyomatos, IP-váltásos) pillanatképekkel is — legfeljebb egy
  „félbehagyva” levél megy; a végleges levél a más kulcson kiment részleges levél után is felülíró mondatot tartalmaz; igazolt tanuló
  várakozó körét más nem írja felül és nem törli (R11).
- E27. Jelzés (`resultApi: 2`) nélkül a kliens nem küld pillanatképet, a végleges beküldést egyszer, régi alakkal küldi; „régi
  szerver” mellett 30 gyerek egy címről legalább annyi végleges eredményt ad át, mint a régi kliens (20), kettős küldés nincs (R12).
- E28. A részleges levél nem állítja, hogy minden kérdésre helyes választ adott; a dátumsora az utolsó válasz ideje; a 7 napos határ
  a kliens órájától független (R13).
- E29. Leállításkor a várakozó „félbehagyva” levél korlátos időn belül kimegy (R14).
- E25. AMIKOR a régi szerver az új mezők miatt 400-at ad, A RENDSZER a végleges beküldést egyszer az új mezők nélkül megismétli (az
  eredménylevél kérése sikerül); a pillanatképet nem alakítja végleges beküldéssé (R10).

## Tulajdonosi döntést igénylő pontok

1. Részben kitöltött, le nem zárt kvíz — ELDÖNTVE (orkesztrátor, 2026-11-17): elmegy „félbehagyva” jelöléssel (S1b).
2. Bejelentkezett felhasználó szerveres kvíze — ELDÖNTVE (orkesztrátor, 2026-11-17): külön szelet (S2), a kézbesítés-foglalással.
3. Címzettek: ma az `ADMIN_EMAILS` közös listája. (A — javasolt) marad; (B) tanulónkénti szülőcím a párosításhoz kötve (új adat,
   adatvédelmi terv kell).
4. Egy közös levél a feladatokról és a kvízről: (A — javasolt) marad a két külön levél; (B) napi összesítő.

<!-- acceptance-checklist -->
- [x] E1 – minden kérdés megválaszolva → egy beküldés gomb nélkül (böngésző)
- [x] E2 – gombnyomás / újratöltés után nincs újabb
- [x] E3 – hiányos, le nem zárt kör nem megy el
- [x] E4 – a kvíz levele kérdésenként (egységteszt)
- [x] E5 – mintaválasz a feladatok levelében
- [x] E6 – escape
- [x] E7 – a meglévő tesztek változatlanul zöldek
- [x] E8 – pillanatkép háttérbe kerüléskor / elhagyáskor (böngésző)
- [x] E9 – késleltetett „félbehagyva” levél a legutolsó pillanatképből; a végleges törli (valódi DB)
- [x] E10 – a végleges levél jelzi a felülírást
- [x] E11 – dátum a levélben (Europe/Budapest)
- [x] E12 – 7 napos korkorlát a le nem zárt körre, az UTOLSÓ VÁLASZHOZ mérve (böngésző + egységteszt)
- [x] E13 – pillanatkép a komponens lebontásakor (alkalmazáson belüli elhagyás) (böngésző)
- [x] E14 – új kör első válaszai is mennek (körhöz kötött számláló)
- [x] E15 – sikertelen pillanatkép (hálózati hiba / 429 / 5xx) újrapróbálható marad
- [x] E16 – véglegesített kör késői pillanatképe nem küld „félbehagyva” levelet (mindkét sorrend, valódi DB)
- [x] E17 – véglegesített körre nincs „félbehagyva” levél: újrapróba (bukó küldő) + 60 ismételt versenyhelyzet (valódi DB)
- [x] E18 – kör-csere a kör közepén → pillanatkép az elhagyott körről, rejtés nélkül (böngésző)
- [x] E19 – 403 → új token + egyszeri ismétlés; sikertelen tokenkérés után a következő betöltés pótol (böngésző)
- [x] E20 – összes-szám a szerver körméretéből; szerveroldali 7 napos határ a pillanatképre (valódi DB)
- [x] E21 – igaz válasz a már kiment „félbehagyva” levél utáni pillanatképre (valódi DB)
- [x] E22 – a legtöbb választ tartalmazó pillanatkép marad (valódi DB)
- [x] E23 – a kvíz végleges beküldése `keepalive` (böngésző)
- [x] E24 – keret 60 / 15 perc / IP mindkét fajtára, a kulcs ellenőrzésével + mutációs ellenpróba (egységteszt + valódi DB)
- [x] E26 – lecke + kör kulcs, első rögzítő védelme (valódi DB)
- [x] E27 – képesség-jelzés; „régi szerver” + 30 gyerek egy címről ≥ 20, nincs kettős küldés (böngésző)
- [x] E28 – részleges levél szövege, utolsó válasz ideje, kliensóra-független határ (egységteszt + valódi DB)
- [x] E29 – leállításkor a várakozók kimennek, korlátos időben (valódi DB)
- [x] E25 – „régi szerver” csonk mellett a végleges kérés sikerül, a pillanatkép nem degradálódik (böngésző + egységteszt)
