# Eredmény-e-mail: a kvíz eredménye is menjen el, kérdésenkénti részletezéssel

**Állapot:** S1a + S1b kész; a vak ellenőrzés (2026-11-18) leleteinek javítása: R1–R8; tulajdonosi döntés és telepítési sorrend: R9–R10 (2026-11-18); a második vak ellenőrzés leletei: R11–R14; a harmadiké: R15–R17; a negyediké: R18; Vercel-lelet: R19; gépi vak ellenőrzés: R20–R29; PR-review (44487292-es fej) leletei: R30–R34; a 6. gépi kör (804569c1) leletei: R35–R38, L2 követő szelet; a 7. gépi kör (0ec08148) leletei: R39–R42, L5 feltétellel dokumentálva; SZŰKÍTÉS (tulajdonos, 2026-11-21): a böngészős tartós sor kapcsoló mögött, alapból KI, véglegesítés a T-3-ban; a 8. gépi kör (e36518e5) leletei: R43–R46, L1 / L4 → T-3; a 9. gépi kör (87631382): R47 tervezési szabály (kilét rögzítése létrehozáskor) + R48; a 10. gépi kör (025d3d34): R49 (nincs eltérő kilétet engedő út); a 202 utáni tartós sor a T-3-ban – ág `fix/eredmeny-email-kviz` (PR #510)
Végrehajtási utasítás: [`2026-11-17-eredmeny-email-kviz-vegrehajtas.md`](2026-11-17-eredmeny-email-kviz-vegrehajtas.md)
Előzmény: [`2026-10-17-eredmeny-email.md`](2026-10-17-eredmeny-email.md)

Tulajdonosi hibajelentés (2026-11-17, szó szerint): „Még egy hiba: csak a szöveges feladatok eredményeit küldi el a tananyag a
szülőknek, a kvíz eredményét nem.”

## Kilét-invariáns (2026-11-22; minden kilétet érintő pont ehhez mérendő)

**Egy eredmény (pillanatkép vagy végleges) CSAK ahhoz a kiléthez — fiókhoz, párosított tanulóhoz — kerülhet, amely a kör első
tevékenységekor ebben a böngészőben (vagy a szerveres körnél a kör szerveres rekordjában) rögzült; ha ez a küldéskor nem igazolható, az
eredmény kilét nélkül („Vendég tanuló”) megy, vagy — ha a kilét nélküli út sem garantálható — nem megy el.**

Kilét-források, amelyekre az invariáns vonatkozik (a pontonkénti kezelés: a végrehajtási fájl „2026-11-22 — kilét-osztály leltár”
táblázata): bejelentkezett fiók (munkamenet-süti, a CSRF-tokenválasz álnevesített címkéje); párosító token (eszközön tárolt, linkkel
cserélhető); vendég (ujjlenyomat / IP — nem név, csak első rögzítő); régi (címkét nem ismerő) szerver és a 400 utáni visszalépés; 403 utáni
tokencsere; újrapárosítás; fiókváltás (másik fülön be- / kilépés); több fül ugyanazon a körön; rekord nélkül helyreállított kör
(korábbi kódverzió, privát mód); szerveres leállítás és ürítés; átmeneti DB-hiba a kilét feloldásakor / ellenőrzésekor; régi
klienscsomag (ismert korlát: címke nélkül küld, a munkamenet fiókja számít — a főági viselkedés).

**R51 — a kilétet a SZERVER rögzíti (tulajdonosi döntés, űrlap, 2026-11-22, szó szerint: „Szerver rögzíti a kilétet”).** A mélyebb vak kör
(13b3755e) L1-e: a böngésző által rögzített fiókcímke elavult lehet (a lap gyorsítótára A-é, az első választ már B adja). Ezért:
- A kör kiléte a SZERVEREN rögzül, a kör ELSŐ beérkező kérésénél: a kliens a kör első válaszánál kilét-rögzítő kérést küld
  (`POST /api/lessons/:lessonId/results/claim`, CSRF-fel, saját 60 / 15 perc / IP kerettel); ha ez nem ért célba, az első pillanatkép vagy
  végleges beküldés rögzít. A rögzített kilét a szerver saját munkamenetéből (fiók) és a párosító token általa ellenőrzött állapotából
  (párosított tanuló) jön, különben „vendég” — a kliens fiókcímkéje ebben nem vesz részt. Tárolás a meglévő táblán, sémaváltozás és
  migráció nélkül: tanulófüggetlen `round-claim` jelzősor + a rögzített kilét álnevesített `round-owner` sora egy tranzakcióban.
- Minden későbbi kérés (pillanatkép, végleges) kiléte a szerveres rögzítéshez vetődik: egyezés → az a kilét; eltérés → a kérés kilét
  nélkül (vendégként) fut, és létező végleges jelzőnél duplikátum (R27). A kilét feloldásának / rögzítésének átmeneti hibája → 503 a 202
  előtt, rögzítés nélkül.
- A kliens fiókcímkéje (`subject`) csak csökkentheti a kilétet (R31: eltérésnél fiók nélkül), kilétet nem ad; a kliens kilét-rekordja (R47 /
  R50) a párosító token küldését szűri (egyező lenyomat), a fiók kilétét nem dönti el.
- Ugyanebben a körben: **L2** — a létező végleges jelző élettartam-frissítésének hibája nem kerüli meg a tulajdonos-ellenőrzést; a jelzősor
  írásának hibája (bizonyíthatatlan állapot) 503 a 202 előtt. **L5** — a már elküldött körhöz újratöltéskor nem keletkezik kilét-rekord és
  kilét-rögzítés. **L3** — a pillanatkép-számláló körönként a legnagyobb elfogadott értéket tartja.

**PR-határ (tulajdonosi döntés, űrlap, 2026-11-22, szó szerint: „BONTÁS: KÉT PR”).**
**R53 — KIVÉVE.** Tulajdonosi döntés (űrlap, 2026-11-22, szó szerint): „R53 ÉS R52-SZABÁLY KI” — a 10. vak kör (cc332f2e) L1 / L2 nyomán az R53 (a lefokozott, megszakadt végleges küldés folytatása) és az R52 „lejárt kör késői kérése → vendég” szabálya kikerült; a takarítás marad. A lefokozott („idegen”) első végleges kérés 202 előtt megszakadt ismétlése duplikátumot kap — a levél
ilyenkor elmarad (vállalt korlát, követő PR-jegy).
- **A #510-ben:** S1a / S1b, R1–R52 a fentiek szerint (az R52-ből a takarítás; a tartós kimenő sor kapcsoló mögött, alapból KI).
- **A követő PR-ban** (a végrehajtási fájl „követő PR” jegyei): a 7. vak kör L2 (a `conflict` pillanatkép-válasz ne rögzüljön
  elküldöttként), L3 (a véglegesítés 503-a ne dobja el az elfogadott pillanatképet), L4 (E2E-módban kényszerített tesztküldő), valamint a
  korábban jegyre tett 8. vak kör L4 (a 403 utáni pillanatkép korhatára / `clientNow`).
- Tulajdonosi döntés 2026-11-22: a 403 utáni claim-ismétlés kilét-kockázata (9. kör L1) a követő PR hatóköre; addig vállalt korlát.
- Tulajdonosi döntés (űrlap, 2026-11-22, szó szerint): „AZ EGÉSZ OSZTÁLY KÖVETŐ PR”. **Az osztály:** közös eszközön, nyitva maradt
  leckefülben a fiókváltás közbeni kilét — minden olyan eset, amelyben a kör első tevékenysége egy munkamenetben (fiókban) történik, a
  kilét-rögzítés (claim) nem ér célba vagy nem igazolható, és egy későbbi kérés egy másik munkamenet (friss CSRF-token, egyező régi címke)
  alapján rendel nevet az eredményhez (a 9. kör L1-e, a 11. kör L1-e és minden további változat). **Az elv a követő PR-ban:** név csak az
  első tevékenységhez kötött szerveres igazolással, különben vendég. Addig az osztály vállalt korlát.
- A 9. kör L2-je (a kilét-takarítás adagjai között a jelzősor és a tulajdonos-sor szétválhat) szintén a követő PR jegye; addig vállalt korlát
  (csak a 8 napnál régebben rögzített, közben is folytatott körnél, a napi takarítás pillanatában áll elő).
- Vállalt korlátok a követő PR-ig (tulajdonosi döntés 2026-11-22, „R53 ÉS R52-SZABÁLY KI”): (1) a lefokozott, 202 előtt megszakadt végleges
  kérés ismétlése duplikátum, a levél elmarad; (2) a 8 napon túli kör a takarítás után a következő kérés munkamenetével újra rögzül;
  (3) a 10. vak kör L3-a (passzív helyreállítás is kilét-rögzítést indít) jegyként a követő PR-ban.

**R52 — a szerveres kilét-rögzítés korlátos élettartama (2026-11-22).** A `lesson_result_emails` táblára eddig nem volt takarítás. A
kilét-rögzítő sorok kulcsa felismerhető előtagot kap (`rc:` jelzősor, `ro:` tulajdonos; a többi körkulcs tiszta hex), és napi, adagos
takarítás törli őket a rögzítéstől számított 8 nap után (a le nem zárt kör 7 napos korhatára + 1 nap; legfeljebb 50 × 1000 sor
futásonként; csak élesben, a meglévő cron-útvonalon, a leállítás leállítja). A végleges jelző és tulajdonos-sora (duplikátum-védelem,
R27 / R42) nem érintett. A korábbi „lejárt kör késői kérése → vendég” szabály a tulajdonosi döntéssel („R53 ÉS R52-SZABÁLY KI”,
2026-11-22) kikerült. Vállalt korlát: a 8 napnál hosszabb ideig nyitott kör rögzítése a takarítás után a következő kérés munkamenetével
újra rögzül (követő PR-jegy).

## Cél

1. A vendég / párosított tanuló HELYI kvízének eredménye akkor is elmenjen, ha a tanuló minden kérdésre válaszolt, de a „Kvíz
   kiértékelése” gombot nem nyomta meg.
2. A kvíz levele kérdésenként mutassa: a kérdés, a gyerek válasza, a helyes válasz, jó / rossz; a kihagyott kérdés „nem válaszolt”.
   A szöveges feladatok levele ugyanígy: a kérdés, a gyerek válasza, a jelölés és a mintaválasz.

## Nem-cél

- **A 202 utáni tartós szerveres küldési sor** (DB-tábla + újraindításkori újrapróba) — tulajdonosi döntés (űrlap, 2026-11-19):
  „Szűkítés + tartós sor külön”. A pótlási terv T-3 szelete (`docs/specs/2026-11-19-websuli-potlasok-terv.md`, a `docs/websuli-potlasok`
  ágon) tartós sorral pótolja; tervvázlat: `docs/specs/2026-11-20-eredmenylevel-tartos-sor.md`.
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
- **K5:** a harmadik vak ellenőrzés után javítva, lásd R17.

**Harmadik vak ellenőrzés (2026-11-19, `0e411d47`: NEM; 1 közepes, 4 kicsi) — a szabályok így változnak (dokumentált spec-változás):**
- **R15 — BÁRMELY véglegesítés elnyomja a kör „félbehagyva” levelét (L1; az R11 „első rögzítő” szabálya szűkül).** Az elnyomás
  ártalmatlan irány (legfeljebb egy „félbehagyva” levél marad el), az elmaradása viszont ellentmondó levélpárt ad: ha a bejelentkezett
  tanuló munkamenete a kör közben megszűnik és vendégként fejezi be, a végleges beküldés a várakozót eddig nem törölte, és a
  „félbehagyva” levél a végleges UTÁN ment ki. Mostantól a végleges beküldés a kör (lecke + kör) várakozó pillanatképét a beküldő
  kilététől függetlenül törli, és a memóriabeli véglegesítés-jelző is tanulófüggetlen. Az „első rögzítő” védelem (`mayActOn`) CSAK a
  pillanatkép TARTALMÁNAK felülírására vonatkozik (igazolt tanuló pillanatképét más nem írhatja felül a saját válaszaival).
- **R16 — a vendég köre vendég kör marad (L2; az R11 állítása így teljesül).** Ha a kört vendég rögzítette, és egy másik beküldő
  (pl. a kör közben bejelentkező tanuló) veszi át, a „félbehagyva” levél attribúciója „Vendég tanuló” marad (vendég-útmutatóval), nem
  az átvevő neve; a kör első rögzítője is vendég marad. (A tartalom — a több válaszú állapot — az átvevőé lehet: a vendég azonosítója nem
  igazolt, ezért ez nem személyes adat kiadása.)
- **R17 — teljes kör nem „félbehagyva” (L3 = K5).** Ha a pillanatképben a megválaszolt kérdések száma eléri a szerver körméretét, a
  pillanatkép nem ütemez részleges levelet: `202 { queued: false, partial: true, complete: true }` (a becsületes kliens ilyenkor
  végleges beküldést küld).
- **Vállalt korlátok (kiegészítés):**
  - (L4) Hamis, a saját időbélyegeivel együtt eltolt `clientNow`-val a 7 napos határ megkerülhető, és a levélbe hamis „Utolsó válasz”
    kerül — csak a beküldő SAJÁT levelére hat; a hamisítást a keret korlátozza (R5, R9).
  - (L5) A telepítés átfedésében a régi példánytól kapott CSRF-token jelzés nélküli: a lap újratöltéséig nem megy pillanatkép és új
    mező. Eredmény nem vész el (a végleges beküldés a régi alakkal megy), csak a félbehagyott kör levele marad el addig.
  - (R15, M2) A körazonosítót ismerő más beküldő végleges beküldéssel elnyomhatja egy másik tanuló „félbehagyva” levelét (a körazonosító
    a kérdések és a kezdés ezredmásodpercének 32 bites lenyomata, csak a kérés törzsében utazik). Tudatos tervdöntés: személyes adat nem
    szivárog, legfeljebb egy „félbehagyva” levél marad el.

**Negyedik vak ellenőrzés (2026-11-19, `f847695a`: IGEN, FELTÉTELLEL; M1) — dokumentált spec-változás:**
- **R18 — a véglegesítés tartós, tanulófüggetlen nyoma (M1; az R15 kiegészül).** Az R15 korábbi „újraindítás után nincs késői
  »félbehagyva« levél” állítása hamis volt: véglegesítés → újraindítás (a memóriabeli jelző elvész) → MÁS kilétű (vendég, ujjlenyomat
  nélküli, más IP-jű) pillanatkép ugyanarra a körre → a pillanatkép ütemeződött, és a „félbehagyva” levél a végleges UTÁN ment ki. Mostantól
  a végleges kvízbeküldés a memóriabeli jelző mellett a kézbesítés-nyilvántartásba is ír egy tanulófüggetlen jelzősort (`kind = 'quiz'`,
  `round_key = roundKeyOf("final-round", "quiz", körazonosító)`, `delivered` üres, sémaváltozás nélkül), és a véglegesítés-ellenőrzés
  (a pillanatkép fogadásakor és a várakozó levél minden küldési kísérlete előtt) ezt is nézi — újraindítás után, más példányon és
  bármely kilétnél is. Korlátos élettartam: a jelzősor 24 óráig számít (`created_at`), mint a memóriabeli jelző. A jelzősor írásának
  hibája nem akasztja meg a beküldést (a memóriabeli jelző ilyenkor is védi az adott példányt; a hiba osztálya naplózódik).

**Vercel review (2026-11-19, szál 4626976445) — dokumentált spec-változás:**
- **R19 — a küldés előtti ellenőrzés átmeneti hibája után is egy újrapróba.** Ha a „félbehagyva” levél kapujában a véglegesítés-
  ellenőrzés (`roundFinalized`) dob (pl. átmeneti adatbázishiba), a levél eddig újrapróba nélkül elveszett (a 60 s-os újrapróba csak a
  kapun BELÜL ütemeződött). Mostantól a kapu hibája után is EGY újrapróba ütemeződik a szokott késleltetéssel, és az ugyanazon a kapun
  megy át — véglegesített körre így sem megy ki részleges levél. Az újrapróba hibája után nincs további (a hiba osztálya naplózódik).

**Gépi vak ellenőrzés (GPT-6.2 Sol, 2026-11-19, `6b5f2e68`: NEM; L1 blokkoló, L2 + L4 közepes, L3 + L5 kicsi) — dokumentált spec-változás:**
- **R20 — körönkénti beküldés-állapot a kliensen (L1).** A végleges beküldés „úton van” őre eddig a komponensé volt: ha az előző kör
  kérése még függőben volt, az új, teljesen megválaszolt kör beküldése elmaradt, és a kérés végén semmi nem indította újra. Mostantól az
  őr a kör azonosítójához kötött (más kör beküldése párhuzamosan mehet), és minden beküldés lezárulása után a beküldő újra kiértékeli a
  pillanatnyi kört, így függő kérés mellett befejezett kör sem marad el.
- **R21 — az újrapróba csak az aktuális pillanatképre vonatkozhat (L2).** A „félbehagyva” levél minden küldési kísérlete (az időzítő
  első küldése, a 60 s-os újrapróba és az R19 kapu-újrapróba) a kör (lecke + kör) aktuális pillanatkép-változatához kötött: ha közben
  újabb pillanatkép ütemeződött, a régi kísérlet nem küld (a kapu alatt ellenőrizve), és az újabb állapot megy ki a saját időzítőjén.
  Vállalt: ha a sikertelen küldés után KEVESEBB választ tartalmazó pillanatkép jön, az az aktuális (a becsületes kliens csak növekvő
  állapotot küld).
- **R22 — az első rögzítő ellenőrzése az utolsó várakozás után (L4).** A várakozó pillanatkép beolvasása, az első rögzítő (`mayActOn`)
  és a vendég-attribúció vizsgálata, valamint az ütemezés a pillanatkép-ág utolsó `await`-je UTÁN, egyetlen szinkron lépésben történik
  — párhuzamosan érkező pillanatképek nem kerülhetik meg.
- **R23 — 403 utáni ismétlés csak képesség-jelzés mellett (L3).** A pillanatkép 403 utáni egyszeri ismétlése előtt a kliens újra nézi
  az R12 jelzést: ha az új token jelzés nélküli (régi példány), nem küld újra, és nem rögzít elküldést.
- **Jegyre (L5, kicsi):** a „Beküldve” sor a levél összeállításának ideje, nem a fogadásé (éjfél körül napot csúszhat) — a fogadáskor
  rögzített idő átadása a küldési bemenetben.

**Gépi vak ellenőrzés, 2. célzott kör (GPT-6.2 Sol, 2026-11-19, `256f0b56`: NEM; L1 blokkoló, L2 + L3 közepes) — dokumentált spec-változás:**
- **R24 — tartós kimenő sor a végleges beküldésekre, korlátos újrapróbával (L1, L2; az R20 megvalósítása helyett).** A befejezett kör
  végleges törzse a befejezés pillanatában, VÁRAKOZÁS NÉLKÜL a böngésző tárolójába kerül (körönként egy bejegyzés, a már elküldött kör
  nem); a sort a lecke beküldője és az alkalmazás minden indulása üríti (más nézetből és későbbi megnyitáskor is), egyszerre egy ürítő
  fut, a közben érkező új bejegyzés is sorra kerül. A token és az ujjlenyomat a küldéskor kerül a kérésbe (a képesség-jelzés szerint új
  mezőkkel vagy régi alakkal, R12). Sikeres (2xx) válasz után a kör elküldöttként rögzül és kikerül a sorból; 400-as (érvénytelen)
  válasz után kikerül (újrapróba nincs); minden más hiba után a kör laponként legfeljebb 3 kísérletet kap, a 429-es válasz
  `Retry-After` idejét megtartva, egyébként növekvő (30 s, 60 s, legfeljebb 5 perc) késleltetéssel — azonnali ismétlés nincs; a
  kimerült kör a következő oldalbetöltéskor kap új kísérleteket.
- **R25 — a pillanatkép-felvétel záró szakasza a kör zárán (L3).** A „már kiment” vizsgálat (R6), a várakozó beolvasása, az első
  rögzítő vizsgálata és az ütemezés ugyanazon a körönkénti kizáráson megy át, mint a „félbehagyva” levél küldési kísérlete. Így vagy a
  régi küldés fejeződik be előbb (és az új pillanatkép igaz `alreadySent` választ kap), vagy az új pillanatkép váltja le a régit (és a
  régi kísérlet a változat-ellenőrzésen megáll) — elfogadott új állapot mellett régi levél nem megy ki.

**Gépi vak ellenőrzés, 3. célzott kör (GPT-6.2 Sol, 2026-11-19, `64d6710e`: NEM) és tulajdonosi döntés („Szűkítés + tartós sor külön”):**
- **Kockázat (vállalt, a T-3 pótolja — L1):** a szerver a 202 után a levelet memóriában ütemezett küldéssel (és egy memóriabeli
  újrapróbával) küldi. Ha a szolgáltató az első és az egyetlen újrapróbán is hibát ad, vagy a példány a 202 után, a háttérküldés előtt /
  közben újraindul, a végleges levél elveszhet (a kliens a 202 után eldobja a törzset). Ezt a pótlási terv T-3 szelete tartós szerveres
  sorral pótolja (`docs/specs/2026-11-20-eredmenylevel-tartos-sor.md`); a #510 nem kéri számon.
- **R26 — az eredmény-POST-nak nincs beágyazott újrapróbája (L2; a J5 forrásőr ehhez igazodik).** A végleges beküldés hálózati / 5xx
  hibavárakozását CSAK a kimenő sor kezeli (laponként legfeljebb 3 kísérlet, R24); az `apiRequest` belső újrapróbája ezen az úton 0. A
  protokoll szintű ismétlések maradnak: a 403 utáni egyszeri tokenfrissítés (`apiRequest`) és a 400 utáni egyszeri régi-alakú ismétlés
  (R10). Így folyamatos 503 mellett laponként legfeljebb 3 POST megy (nem 12).
- **R27 — körönként egy végleges levél, kiléttől függetlenül (L3).** A végleges beküldés (mindkét fajtánál) a kézbesítés-nyilvántartásba
  tanulófüggetlen végleges-jelzősort ír (`roundKeyOf("final-round", fajta, kör)`; a kvízé azonos az R18 jelzősorával). Ha a jelzősor már
  létezett (ugyanannak a körnek az ismételt beküldése), és a mostani beküldő saját végleges sora még nincs meg, a beküldés MÁS kiléttel
  ismételt (pl. elveszett 202 után fiókba lépve): `202 { queued: false, duplicate: true }`, második levél és más név nem megy. Ugyanazon
  kilét ismétlése változatlanul a meglévő címzettenkénti pótlásra fut.
- **R28 — a sikertelen tárolóírás nem rejti el a kimenő bejegyzést (L4).** Ha a kimenő sor írása dob (pl. kvóta), a bejegyzés egy csak
  memóriabeli sorba kerül, amelyet az ürítő a tárolóból olvasott bejegyzések MELLETT olvas (a lapon belül elmegy); siker után onnan is
  kikerül.
- **R29 — véglegesítés a felvétel közben (L5).** A pillanatkép-felvétel záró szakasza (a kör zárán, R25) az ütemezés előtt a memóriabeli
  véglegesítést is nézi: a felvétel közben véglegesített körre `202 { queued: false, finalized: true }`, várakozó nem keletkezik.

PR-review a 44487292-es fejre (Vercel 4642268402, Copilot 4642333188 / 4642333249 / 4642333294 / 4642333345; 2026-11-20):
- **R30 — a kimenő bejegyzésnek korhatára van (4642268402).** Minden bejegyzés a kör utolsó tevékenységének idejét viszi (`activityAt`:
  lezárt körnél a sorba kerülés ideje, le nem zártnál `roundActivityAt`). Az ürítő a 7 napnál (`STALE_ROUND_DAYS`) régebbi bejegyzést
  küldés nélkül eldobja; a le nem zárt, régi kör így a későbbi betöltéskor sem megy el (R2 a sor oldalán is).
- **R31 — a bejegyzés a sorba kerüléskori kilétéhez kötött (4642333188).** A szerver a `GET /api/csrf-token` válaszában a munkamenet
  fiókjának álnevesített címkéjét is küldi (`resultSubject`: `anon`, vagy a fiókazonosító SESSION_SECRET-tel kulcsolt HMAC-lenyomata). A
  kliens a címkét a sorba kerüléskor a bejegyzésbe (és a pillanatképbe) írja (`subject`); ha akkor még nincs meg, ugyanazon a lapon az első
  küldés előtt kéri le, más lapon a bejegyzés `?` címkét kap. A szerver, ha a kérés `subject` mezője nem egyezik a mostani munkamenet
  címkéjével, a munkamenet fiókját figyelmen kívül hagyja (a kérést fiók nélküliként — párosított tanulóként vagy vendégként — kezeli). Így
  a sorban maradt eredmény más (később bejelentkezett) fiók nevére nem kerül. A régi alak (R10 / R12) a mezőt nem küldi.
- **R32 — fülbiztos kimenő sor (4642333249).** A sor bejegyzésenként külön kulcson áll (`websuli:result-outbox:v1:<azonosító>`); a
  felvétel és a törlés egyetlen kulcs írása / törlése, a közös lista olvasás-módosítás-írása megszűnik, így két fül egyidejű írása nem
  veszít bejegyzést. Az R28 memóriasora bejegyzésenként marad.
- **R33 — a leállítás ürítései párhuzamosan, a közös határidőn belül (4642333294).** A pool lezárása előtti ürítések (régi anyagok
  eredményei, új-lecke értesítők, „félbehagyva” levelek) egyszerre indulnak; mindegyik a saját felső korlátja és a 295 s-os kényszerleállításig
  hátralévő idő (biztonsági tartalékkal) közül a kisebbikig vár. Legrosszabb esetben 270 + 3 + 2,5 + 15 s < 295 s.
- **R34 — az első rögzítő kiléte a teljes küldési ciklus végéig őrződik (4642333345).** Az időzítő lejártakor a várakozó kör első
  rögzítője (kilét + változat) egy „küldés alatt” nyilvántartásba kerül, és ott marad, amíg a küldési kísérlet és minden újrapróbája
  (a 60 s-os és az R19 kapu-újrapróba) be nem fejeződik, vagy a kör nem véglegesül. A pillanatkép-felvétel az első rögzítő vizsgálatát
  (R11 / R22) erre is elvégzi: kapuhibás vagy bukott első küldés után a vendég pillanatképe `conflict` választ kap, és nem tilthatja le
  az eredeti pótlását.

Gépi vak ellenőrzés, 6. kör (GPT-6.2 Sol, 804569c1, 2026-11-20):
- **R35 — címkét csak az ebben a dokumentumban LÉTREHOZOTT bejegyzés kaphat utólag (L1).** Az R31 pótlása kizárólag arra a bejegyzésre
  vonatkozik, amelyet ez a dokumentum ténylegesen újonnan vett fel a sorba; a korábbi dokumentumból megmaradt, címke nélküli bejegyzés
  (akkor is, ha a helyreállított kör újra felvenné) `?` címkével megy, így fiók nélküliként fut. Más munkamenet címkéjét sosem kapja meg.
- **R36 — a véglegesítés a pillanatkép-felvétel utolsó várakozása után is látszik (L3).** Az R29 vizsgálat a kör zárán a „már kiment”
  lekérdezés UTÁN, közvetlenül a várakozó beolvasása és az ütemezés előtt fut.
- **R37 — a kérés időkorlátja a válasz törzsének olvasását is fedi (L4).** Az `apiRequest` időzítője a törzs beolvasásáig él (a fejlécek
  megérkezése nem állítja le); a CSRF-token lekérése saját, 15 s-os határidőt kap.
- **R38 — az attribúció feloldása a küldési ciklus része (L5).** A „félbehagyva” levél nevének feloldása a küldési kísérleten belül fut:
  a hibája ugyanúgy egy újrapróbát kap, mint a küldésé, és a ciklus végén az első rögzítő bejegyzése (R34) felszabadul.
- **L2 (leckerevízió) — követő szelet, nem a #510 része.** A helyben tárolt kör nem viszi a leckerevíziót, a szerver a mostani bankból
  pontoz. A beküldés–pontozás e viselkedése a főágon is így van (a feladatoké is); a #510 tartós sora az ablakot legfeljebb 7 napra (R30)
  szélesíti. A javítás a revízió átvezetése a lekérdezéstől (`lessonId` + `version`) a beküldőig és a szerveri összevetés — három kliensréteg
  és a kérésszerződés változása, külön tervvel.

Gépi vak ellenőrzés, 7. kör (GPT-6.2 Sol, 0ec08148, 2026-11-21):
- **R39 — a kimenő bejegyzés törzse és tokenje egy tokenválaszból (L1).** A végleges beküldés törzse a CSRF-token MEGÉRKEZÉSE után,
  ugyanabból a tokenválaszból (képesség-jelzés + kilét-címke) áll össze, amelynek tokenjével a kérés ténylegesen megy; a 403 utáni
  tokenfrissítéskor az eredeti bejegyzés címkéjével újraépül. Ha a token nem kérhető le (átmeneti hiba), a képesség ISMERETLEN: a kérés
  nem megy el régi alakban, a bejegyzés a sor szokott várakozását kapja. (A valódi, jelzés nélküli régi szervernek továbbra is a régi
  alak megy, R12; R10 változatlan.)
- **R40 — a korhatár a tényleges küldés előtt is (L2).** A kimenő bejegyzés lejáratát (R30) a token- / ujjlenyomat-várakozás után,
  közvetlenül a kérés előtt (a 403 utáni és az R10 ismétlés előtt is) újra ellenőrzi; a közben lejárt bejegyzés küldés nélkül kikerül,
  elküldöttnek nem jelölődik.
- **R41 — leállításkor a küldés alatt álló és a halasztott „félbehagyva” levél sem marad ki (L3).** A „félbehagyva” levél éppen futó
  küldési kísérletei és a halasztott (60 s-os, R19 kapu-) újrapróbái nyilvántartottak; az ürítés (R14) a halasztottat a korábbi időzítő
  törlésével előrehozza — ugyanazon a kapun és záron (véglegesített / elavult körre így sem küld) —, és mindegyik végét megvárja a
  határidőig. Az ürítés alatt keletkező újrapróba azonnal fut.
- **R42 — a végleges jelzősor első rögzítője folytathatja a megszakadt utat (L4).** A tanulófüggetlen végleges jelzősorral (R27) EGY
  utasításban (tranzakcióban) a beküldő kilétéhez kötött tulajdonos-sor is rögzül (álnevesített körkulcs, üres kézbesítés). Ha a kérés a
  jelzősor után, a 202 előtt megszakad, az EREDETI beküldő ismétlése továbbmegy (levél megy), más kilét továbbra is duplikátum-választ kap.
- **L5 (a 44487292-es build közös kulcsú sora) — nincs migráció, feltétellel.** A közös kulcsú (`websuli:result-outbox:v1` tömb) sort
  csak a PR #510 ágának 44487292-es közbenső buildje írta; ez a commit nem része a főágnak (`git merge-base --is-ancestor 44487292
  origin/main` → hamis). Az éles kliens a főágból épül; egy PR-előnézeti (Vercel) build más eredetű (origin) címen fut, és a
  `localStorage` eredetenként külön van — az előnézeten írt sor az éles címen sosem látszik. Feltétel: ha a közbenső buildet valódi
  tanuló az ÉLES címen használta volna (ez a fenti okból nem lehetséges, hacsak az ág nem került élesbe a főágon kívül), a régi tömb elemei
  nem mennek ki (ismeretlen korúak, R30 / R31 szerint automatikusan nem is küldhetők biztonságosan) — ez esetben egyszeri, `?` címkés,
  korhatáros migráció kell külön szeletben. Az előnézeti címen maradt régi tömb (csak fejlesztői / ellenőri próbák) elhagyható.

**Szűkítés — tulajdonosi döntés (űrlap, 2026-11-21).** Kilenc vak kör után is NEM ítélet; a tulajdonos választása szó szerint:
„Szűkítés: tartós sor külön (Javasolt)”. Következmény:
- A #510-ben marad: a szerveroldali végleges és „félbehagyva” levél (R1–R23, R25, R27, R29, R33, R34, R36, R38, R41, R42 és az alábbi
  R45–R46), a leállítási ürítés, valamint a kliens AZONNALI beküldése (gomb nélküli teljes kör, pillanatkép, tokenes / `prepare`-es
  törzsépítés, R39 / R40 a lapon belül).
- Kapcsoló mögé kerül, ALAPBÓL KI (`client/src/lib/resultOutboxFlag.ts`, élesben csak `VITE_RESULT_OUTBOX_ENABLED=1`; az e2e-buildben
  futásidejű tesztkapcsoló): a böngészős TARTÓS kimenő sor — `localStorage`-sor (R24, R28, R32), induláskori ürítés (R24), a sor címkéje,
  lejárata és fülbiztossága a dokumentumok között (R30, R31, R35). KI állásban a beküldő a sort csak memóriában tartja (lapon belüli
  újrapróba, laponként legfeljebb 3 kísérlet, R26), a tárolóba nem ír, induláskor nem ürít. A véglegesítés a T-3 szeletben, külön PR-ban
  (`docs/specs/2026-11-20-eredmenylevel-tartos-sor.md`).

Gépi vak ellenőrzés, 8. kör (GPT-6.2 Sol, e36518e5, 2026-11-21) — a KI állásban is élő útra eső leletek:
- **R43 — a lapon belüli újrapróba sem veszi át egy később más fiókba lépett munkamenet címkéjét (L1, a KI állású memóriasoron).** Ha a
  címke nélkül felvett bejegyzés első kísérlete tokenválaszig sem jutott (átmeneti tokenhiba), a felvételkori munkamenet folytonossága
  nem bizonyítható: a címke utólag nem pótolható, a bejegyzés `?`-lel (fiók nélküliként) megy. A tartós soros (BE állású) teljes L1 a
  T-3 nyitott pontja.
- **R44 — a lap elhagyásakor küldött pillanatkép-kérésnek határideje van (L2).** Kísérletenként 15 s (az első és a 403 utáni is); utána
  a kérés megszakad, az állapot nem „úton lévő”, ugyanaz az állapot újra küldhető. A gyorsítótárazott tokennel induló első kérés nem vár
  előzetes hálózati körre.
- **R45 — leállítás közben befogadott pillanatkép sem marad ki (L3).** A várakozó kör küldésének egyetlen indító útja van (időzítő és
  ürítés is: az első rögzítő a „küldés alatt” nyilvántartásba kerül, R34). Az ürítés alatt befogadott pillanatkép azonnal, követve indul;
  a lezárult ürítés után a felvétel 503-at ad (nincs elfogadó 202, a kliens nem jelöli elküldöttnek).
- **R46 — a `/api/lessons` közös írási kerete nem írja felül a két eredménykeretet (L5).** A pontos eredmény-POST
  (`/api/lessons/:lessonId/results`) kimarad a közös 100 / 15 perc / IP keretből (a saját 60 + 60-as kerete és a CSRF-őr érvényes); a
  kivétel a közös kapuban (`lessonsWriteGate`, `server/lesson-result-limits.ts`), a `server/index.ts` ezt szereli fel.
- **L1 (tartós soros változat) és L4 (a lejárt, lezárt kör friss időbélyeggel visszakerül a tartós sorba) — T-3 nyitott pontok.** KI
  állásban a sor nem tartós és induláskor nincs ürítés, így az L4 „lejártnak nyilvánított bejegyzés feltámadása” nem áll elő (a lezárt
  kör újranyitáskori beküldése az R2 szerinti, a tanuló döntése); a böngészőteszt KI állásban mutatja, hogy nincs tárolóírás és induló
  ürítés.

Gépi vak ellenőrzés, 9. kör (GPT-6.2 Sol, 87631382, 2026-11-22) — a kilét késői (küldéskori) feloldásának hibaosztálya (R39 / R43 után
harmadszor), ezért foltozás helyett tervezési szabály:
- **R47 — TERVEZÉSI SZABÁLY: a kilét a kör / bejegyzés LÉTREHOZÁSAKOR rögzül, küldéskor nem oldódik fel újra (L1, L2, L3).**
  - *Kliens.* A kör kiléte a kör ELSŐ tevékenységekor (első kvízválasz / első kitöltött feladat, legkésőbb a lezáráskor) rögzül egy
    körönkénti kilét-rekordba (`<lecke-tár>:<fajta>:owner:<kör>`; írhatatlan tárolónál memóriában): (a) a fiók álnevesített címkéje
    (`resultSubject`, a gyorsítótárazott tokenválaszból — ha akkor nem ismert: `null`); (b) a párosító token LENYOMATA (nem maga a titok).
    A pillanatkép és a végleges bejegyzés ebből épül: a fiók címkéje a rögzített (ismeretlen: `?` — a kérés fiók nélküliként fut), a
    párosító token csak akkor megy, ha a MOSTANI token lenyomata a rögzítettel egyezik; eltérésnél (újrapárosítás, fiókváltás) a kérés
    párosítás nélkül megy — az új tanulónak / fióknak nem tulajdonítható. Utólagos címkepótlás nincs (felülírja az R31 pótlását, az R35-öt
    és az R43-at). A CSRF-token a lecke megnyitásakor előre töltődik, hogy a címke az első válasznál rendszerint már ismert legyen. A
    rekord a végleges siker után törlődik. Vállalt korlát: a kód előtti (rekord nélküli) helyreállított kör a dokumentumbeli első
    tevékenységekor kapja a rekordot.
  - *Szerver.* A párosítás feloldásának ÁTMENETI hibája nem azonos az érvénytelen tokennel: ekkor a kérés nem rögzül vendégként (se
    várakozó, se jelzősor), hanem újrapróbálható 503-at kap; érvénytelen / visszavont token → névtelen, mint eddig. A fiók egyezését a
    szerver változatlanul a rögzített címkéhez méri (R31): eltérés vagy `?` → a munkamenet fiókja nem kapja meg.
- **R49 — az R47 kiegészítése (gépi vak kör 10., 025d3d34, 2026-11-22): az eredmény SOHA nem mehet olyan úton, ahol a szerver a
  rögzítettől eltérő kilétet rendelhet hozzá.**
  - (a) *Régi (címkét nem ismerő) alak.* A kliens régi alakot (jelzés nélküli tokenválasznál, vagy az R10 400 utáni visszalépésénél)
    csak akkor küld, ha a kör rögzített fiókcímkéje nincs (`null`), VAGY a küldés tokenválasza igazolja, hogy ugyanaz a munkamenet (V2
    tokenválasz, azonos címke). Ha ez nem igazolható, a bejegyzés NEM megy el: memóriában vár (a sor szokott kísérletszámáig, majd a
    lejáratig), utána eldobódik — a vegyes telepítés ritka és rövid, a téves fiókhoz rendelés rosszabb, mint egy elmaradt levél.
  - (b) *Párosítás minden kísérlet előtt.* A kimenő bejegyzés és a pillanatkép nem visz nyers párosító tokent, csak a rögzített lenyomatot;
    a mostani token közvetlenül minden tényleges kérés előtt (a 403 utáni tokencserés ismétlésnél is) vetődik össze a lenyomattal,
    eltérésnél a kérés párosítás nélkül megy.
  - (c) *Szerver.* Létező végleges jelzősor mellett csak pozitívan igazolt tulajdonos (saját sor vagy R42 tulajdonos-sor) folytathatja; a
    tulajdonos-lekérdezés átmeneti hibája újrapróbálható 503 a 202 előtt, nem végleges küldés.
  - Vállalt korlát: a `null` (az első tevékenységkor ismeretlen) fiókcímkéjű kör régi szerver felé címke nélkül megy, és ott a munkamenet
    fiókja kerülhet hozzá (a tulajdonosi utasítás szerint megengedett eset; csak vegyes telepítésnél vagy visszaállításnál áll elő).
- **R50 — kilét-osztály leltár (2026-11-22, saját lelet): rekord nélkül helyreállított, már megkezdett kör kiléte nem igazolható.** A
  kilét EGYETLEN kliensoldali keletkezési pontja (`bindRoundOwner`) a mostani kilétet csak akkor rögzíti, ha a kört ebben a dokumentumban
  még tevékenység nélkül láttuk; a már megkezdett, rekord nélküli kör (korábbi kódverzió, privát módú újratöltés) ismeretlenként rögzül
  (`?`, párosítás nélkül).
- **R48 — a késői pillanatkép-válasz nem írja vissza a részleges jelzőt (L4).** Ha a kör végleges jelzője már megvan, a pillanatkép
  késői 202-je nem menti a részleges jelzőt (az R8 takarítása idempotens).

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
- E30. AMIKOR a kör véglegesül (bármely beküldő kilétével), A RENDSZER a kör „félbehagyva” levelét nem küldi ki — fiók → vendég
  váltásnál sem megy „félbehagyva” levél a végleges után (R15).
- E31. Vendég által rögzített kör átvételekor a „félbehagyva” levél neve „Vendég tanuló” (R16).
- E32. Teljes (a körmérettel egyenlő számú válaszú) pillanatkép nem ütemez levelet (R17).
- E35. AMIKOR az előző kör beküldése még függőben van, A RENDSZER az új, teljesen megválaszolt kört is beküldi, gombnyomás nélkül (R20).
- E36. Kapuhiba után érkező frissebb pillanatkép mellett a régi újrapróba nem küld; csak a frissebb állapot megy ki (R21).
- E37. Párhuzamos pillanatképeknél az igazolt első rögzítő pillanatképét más nem írja felül (R22).
- E38. 403 után jelzés nélküli új tokennél nincs második pillanatkép-kérés (R23).
- E39. 429 után a végleges beküldés nem ismétlődik azonnal; `Retry-After` mellett legfeljebb 3 kísérlet (R24).
- E40. AMIKOR a tanuló az utolsó válasz után azonnal elhagyja az oldalt (lassú token mellett), A RENDSZER a végleges kört a következő
  indításkor elküldi (R24).
- E41. Ha a régi pillanatkép küldése már fut, az új pillanatkép nem kap `queued: true` választ úgy, hogy közben a régi levél megy ki (R25).
- E42. Folyamatos 503 mellett a végleges beküldés laponként legfeljebb 3 POST-ot küld (R26).
- E43. Elveszett 202 utáni, más kiléttel ismételt végleges beküldés nem küld második levelet; az eredeti név marad (R27).
- E44. Olvasható, de nem írható tárolónál a befejezett kör a lapon belül elmegy (R28).
- E45. A felvétel közben véglegesített körre a pillanatkép nem kap `queued: true` választ (R29).
- E46. A 7 napnál régebbi tevékenységű kimenő bejegyzés küldés nélkül kikerül a sorból (R30).
- E47. AMIKOR a sorban maradt eredményt más fiók munkamenete küldené, A RENDSZER nem rendeli a mostani fiókhoz (R31).
- E48. Két fül egyidejű felvételénél egyik bejegyzés sem vész el (R32).
- E49. A leállítás ürítései párhuzamosan, a kényszerleállítás előtt végeznek (R33).
- E50. Kapuhibás első küldés után a vendég pillanatképe nem tiltja le az igazolt első rögzítő pótlását (R34).
- E51. A korábbi dokumentumból címke nélkül maradt kör ugyanabba a leckébe visszatérve sem kapja meg az új munkamenet címkéjét (R35).
- E52. A „már kiment” lekérdezés alatt véglegesített körre a pillanatkép nem kap `queued: true` választ (R36).
- E53. A fejlécek után megakadt választest az időkorláton belül megszakad (R37).
- E54. A névfeloldás átmeneti hibája után a „félbehagyva” levél egy újrapróbával kimegy, és az első rögzítő felszabadul (R38).
- E55. AMIKOR az ürítés tokenkérése átmenetileg bukik, és utána más fiók tokenje jön, A RENDSZER a régi eredményt nem küldi címke
  nélkül; később az eredeti címkével megy (R39).
- E56. A token várakozása alatt lejárt kimenő bejegyzés nem megy ki, és kikerül a sorból (R40).
- E57. Leállításkor a kapuhiba utáni, halasztott és a küldés alatt álló „félbehagyva” levél is kimegy a határidőn belül, ugyanazon a
  kapun (véglegesített körre nem) (R41).
- E58. A végleges jelzősor után, a 202 előtt megszakadt kérést az eredeti beküldő megismételve a levél kimegy; más kilét duplikátum (R42).
- E59. A tartós sor kapcsolója alapból KI: KI állásban a tartós sor kulcsára nincs `localStorage`-írás és induláskor nincs ürítés, a
  befejezett kör mégis pontosan egyszer kimegy (szűkítés, 2026-11-21).
- E60. Címke nélkül felvett kör tokenhiba utáni újrapróbája nem kapja meg a közben más fiókba lépett munkamenet címkéjét (R43).
- E61. A válasz nélkül függő pillanatkép-kérés határideje után ugyanaz az állapot újra elküldhető (R44).
- E62. Leállítás közben befogadott pillanatkép az ürítéssel kimegy, az első rögzítő őrzött, a lezárult ürítés után a felvétel 503 (R45).
- E63. Ugyanarról a címről 60 pillanatkép és 60 végleges beküldés a közös írási kapu mögött is átmegy; más lecke-írásra a közös keret
  érvényes (R46).
- E64. AMIKOR a kör első tevékenységekor a fiók még nem ismert, és az első (sikeres, de késői) tokenválasz már más fiókjáé, A RENDSZER a
  kört `?` címkével küldi, nem a később belépett fiók címkéjével (R47).
- E65. AMIKOR a nyitva hagyott leckefül alatt az eszköz újrapárosul, A RENDSZER a korábbi kör pillanatképét és végleges beküldését nem az
  új tanuló párosításával küldi; változatlan párosításnál a párosított tanulóval (R47).
- E66. AMIKOR a párosítás feloldása átmenetileg hibázik, A RENDSZER 503-at ad, vendégként nem rögzít (se várakozó, se jelzősor); a hiba
  elmúltával az ismétlés átmegy (R47).
- E67. A véglegesítés utáni késői pillanatkép-válasz nem írja vissza a részleges jelzőt (R48).
- E68. AMIKOR a rögzített fiókcímke nem igazolható a régi alakot fogadó szerver felé (403 utáni más fiók + 400-as régi példány, vagy
  jelzés nélküli frissített token), A RENDSZER régi (címke nélküli) alakú kérést nem küld, és a kört nem jelöli elküldöttnek (R49 a).
- E69. AMIKOR a végleges kérés vagy a pillanatkép 403-a alatt az eszköz újrapárosul, A RENDSZER az ismétlést párosítás nélkül küldi (R49 b).
- E70. AMIKOR létező végleges jelzősor mellett a tulajdonos-lekérdezés átmenetileg hibázik, A RENDSZER 503-at ad, második levél nem megy;
  a hiba után más kilét duplikátum-választ kap (R49 c).
- E71. AMIKOR egy már megkezdett kör kilét-rekord nélkül áll helyre, A RENDSZER a kört `?` címkével és párosítás nélkül küldi; a rekord a
  végleges siker után törlődik (R50).
- E34. A kapu átmeneti hibája után a „félbehagyva” levél egy újrapróbával kimegy; ha közben a kör véglegesült, nem megy ki (R19).
- E33. Véglegesítés és újraindítás után a más kilétű (vendég, ujjlenyomat nélküli, más IP-jű) pillanatkép ugyanarra a körre nem ütemez
  „félbehagyva” levelet; a 24 óránál régebbi jelzősor nem számít (R18).
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
- [x] E30 – bármely véglegesítés elnyomja a részlegest; fiók → vendég sorrend: csak végleges levelek (valódi DB)
- [x] E31 – vendég kör átvétele: „Vendég tanuló” név (valódi DB)
- [x] E32 – teljes pillanatkép nem ütemez (valódi DB)
- [x] E33 – tartós, tanulófüggetlen véglegesítési nyom; újraindítás után más kilét / IP sem küld részlegest (valódi DB)
- [ ] E34 – a kapu átmeneti hibája után egy újrapróba, a véglegesítés-ellenőrzéssel (valódi DB)
- [ ] E35 – függő előző kör mellett az új teljes kör is beküldődik (böngésző)
- [ ] E36 – kapuhiba után a frissebb pillanatkép megy ki, a régi újrapróba nem (valódi DB)
- [ ] E37 – párhuzamos pillanatképeknél az első rögzítő védelme (valódi DB)
- [ ] E38 – 403 után jelzés nélküli tokennél nincs második pillanatkép (böngésző)
- [ ] E39 – 429: nincs azonnali ismétlés; Retry-After mellett legfeljebb 3 kísérlet (böngésző + egységteszt)
- [ ] E40 – azonnali dokumentumváltás után a végleges kör a következő indításkor megy (böngésző)
- [ ] E41 – a pillanatkép-felvétel a kör zárán; futó régi küldés mellett igaz válasz (valódi DB)
- [ ] E42 – 503: laponként legfeljebb 3 POST (böngésző)
- [ ] E43 – más kiléttel ismételt végleges beküldés: egy levél, eredeti név (valódi DB)
- [ ] E44 – írhatatlan tároló: a kör a lapon belül elmegy (böngésző)
- [ ] E45 – felvétel közbeni véglegesítés: nincs queued:true (valódi DB)
- [ ] E46 – kimenő bejegyzés korhatára (egységteszt)
- [ ] E47 – kilétváltás: a sorban maradt eredmény nem kerül a mostani fiókhoz (egységteszt + valódi DB)
- [ ] E48 – bejegyzésenkénti kulcs, fülek közti elveszés nincs (egységteszt)
- [ ] E49 – a leállítás ürítései párhuzamosan, a határidőn belül (egységteszt)
- [ ] E50 – kapuhiba utáni vendég-pillanatkép: conflict, az eredeti pótlás kimegy (valódi DB)
- [ ] E51 – címke nélküli régi bejegyzés: `?`, nem az új munkamenet címkéje (böngésző + egységteszt)
- [ ] E52 – véglegesítés a „már kiment” lekérdezés alatt: nincs queued:true (valódi DB)
- [ ] E53 – megakadt választest: megszakad az időkorláton belül (böngésző)
- [ ] E54 – névfeloldási hiba: egy újrapróba, az első rögzítő felszabadul (valódi DB)
- [ ] E55 – tokenhiba után más fiók tokenje: nincs címke nélküli küldés, később az eredeti címkével (böngésző)
- [ ] E56 – a token alatt lejárt bejegyzés nem megy ki, kikerül (böngésző)
- [ ] E57 – leállítás: halasztott és futó „félbehagyva” levél is kimegy, a kapun át (valódi DB)
- [ ] E58 – a 202 előtt megszakadt végleges kérés: az eredeti beküldő pótolja, más kilét duplikátum (valódi DB)
- [ ] E59 – kapcsoló KI: nincs tárolóírás, nincs induló ürítés, a kör egyszer kimegy (böngésző)
- [ ] E60 – tokenhiba utáni újrapróba: nem a később belépett fiók címkéje (böngésző)
- [ ] E61 – függő pillanatkép határideje után újraküldhető (böngésző)
- [ ] E62 – leállítás közbeni felvétel: kimegy / első rögzítő / 503 (valódi DB)
- [ ] E63 – közös írási kapu: 60 + 60 átmegy, más írásra a közös keret (egységteszt, valódi HTTP)
- [ ] E64 – késői első token más fiókból: `?` címke (böngésző, KI állás)
- [ ] E65 – újrapárosítás: nem az új tanulóval; kontroll: változatlan párosítással igen (böngésző)
- [ ] E66 – párosítás-feloldási DB-hiba: 503, nincs vendég-rögzítés; ismétlés átmegy (valódi DB)
- [ ] E67 – késői pillanatkép-202 nem írja vissza a részleges jelzőt (böngésző)
- [ ] E68 – nem igazolható kilét: nincs régi alakú kérés, nincs elküldött-jelző (böngésző, két út)
- [ ] E69 – 403 alatti újrapárosítás: az ismétlés párosítás nélkül (böngésző, végleges + pillanatkép)
- [ ] E70 – tulajdonos-lekérdezési hiba: 503, nincs második levél, utána duplikátum (valódi DB)
- [ ] E71 – rekord nélkül helyreállított, megkezdett kör: `?`, párosítás nélkül; a rekord a végleges siker után törlődik (böngésző)
- [ ] E72 – szerveres kilét-rögzítés: A → B első válasz → A küld friss A-CSRF-fel → nem A nevére (valódi DB, rögzítő kéréssel és nélküle)
- [ ] E73 – a kliens az első válasznál egyszer küld kilét-rögzítést, fiókcímke nélkül (böngésző)
- [ ] E74 – létező jelző TTL-hibája: duplikátum; jelzősor-írási hiba: 503 (valódi DB)
- [ ] E75 – elküldött kör újratöltése: nincs kilét-rekord és rögzítés (böngésző); pillanatkép-számláló nem lép vissza (böngésző)
- [ ] E76 – kilét-rögzítés takarítása: lejárt sor törlődik, élő és végleges-jelzős nem (valódi DB)
- [x] E25 – „régi szerver” csonk mellett a végleges kérés sikerül, a pillanatkép nem degradálódik (böngésző + egységteszt)
