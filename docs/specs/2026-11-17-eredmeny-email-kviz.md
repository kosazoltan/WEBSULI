# Eredmény-e-mail: a kvíz eredménye is menjen el, kérdésenkénti részletezéssel

**Állapot:** kész, PR előtt – 2026-11-17, ág `fix/eredmeny-email-kviz`
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

## Tulajdonosi döntést igénylő pontok

1. Részben kitöltött, le nem zárt kvíz: (A — javasolt) nem megy el, mint a feladatoknál; (B) az oldal elhagyásakor a megválaszolt
   rész elmegy „félbehagyva” jelöléssel.
2. Bejelentkezett felhasználó szerveres kvíze: ott is csak a lezárás küld. (A — javasolt) az utolsó válasz után a kliens
   automatikusan lezárja a kört (jutalom is ekkor jár) — a kézbesítés versenyhelyzetének javítása UTÁN; (B) marad.
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
