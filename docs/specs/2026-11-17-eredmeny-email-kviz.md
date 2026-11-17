# Eredmény-e-mail: a kvíz eredménye is menjen el, kérdésenkénti részletezéssel

**Állapot:** S1a kész; S1b (félbehagyott kvíz, dátum, korkorlát) folyamatban – 2026-11-17, ág `fix/eredmeny-email-kviz`
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

Elfogadás (S1b):
- E8. AMIKOR a lap háttérbe kerül vagy a tanuló elhagyja, és a le nem zárt kvízkörben legalább egy új válasz van, A RENDSZER
  pillanatképet küld (`partial: true`); válasz nélkül vagy változatlan állapotnál nem.
- E9. AMIKOR egy pillanatkép után 15 percig nem jön újabb pillanatkép vagy végleges beküldés, A RENDSZER egy „félbehagyva” levelet
  küld a legutolsó pillanatképből; a végleges beküldés a várakozó pillanatképet törli.
- E10. AMIKOR a „félbehagyva” levél után a kör végleges eredménye megjön, A RENDSZER a végleges levélben jelzi a felülírást.
- E11. Minden eredménylevél tartalmazza a beküldés idejét magyar idő szerint.
- E12. A 7 napnál régebbi, le nem zárt kör nem megy el.

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
- [ ] E8 – pillanatkép háttérbe kerüléskor / elhagyáskor (böngésző)
- [ ] E9 – késleltetett „félbehagyva” levél a legutolsó pillanatképből; a végleges törli (valódi DB)
- [ ] E10 – a végleges levél jelzi a felülírást
- [ ] E11 – dátum a levélben (Europe/Budapest)
- [ ] E12 – 7 napos korkorlát a le nem zárt körre
