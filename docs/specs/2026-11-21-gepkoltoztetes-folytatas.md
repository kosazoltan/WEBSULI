# Spec: Gépköltöztetés utáni folytatás — a félbe maradt WEBSULI-munkák leltára és befejezési terve

> Dátum: 2026-11-21 · Szerző: Claude (orkesztrátor) · Állapot: JÓVÁHAGYVA (a tulajdonos kérése 2026-11-21: leltár → csoportosítás → terv → szeletenkénti végrehajtás)
> Végrehajtás: `docs/specs/2026-11-21-gepkoltoztetes-folytatas-vegrehajtas.md`
> Hatókör: kizárólag a WEBSULI repó és a WEBSULI-mentések (tulajdonosi utasítás, 2026-11-21). Más repóhoz nem nyúlunk, más repóból nem hozunk át semmit.

## 1. Cél

A régi gépről átköltözött WEBSULI-fejlesztés **minden** félbe maradt, kimaradt, elfelejtett és végre nem hajtott tétele egy helyen,
forrásra hivatkozva legyen összegyűjtve, csoportosítva és befejezési sorrendbe téve. A sorrend szerint szeletenként, a kötelező
kapukon át kell végrehajtani (`docs/minosegkapuk.md`), amíg a teljes lista le nem zárul.

## 2. NEM cél

- Más repó (pl. EC Residence, valutavalto) bármilyen módosítása vagy adatainak átvétele.
- A már beolvasztott munkák újraírása. Ha egy tétel a főágon teljesül, a lezárás a bizonyíték rögzítése, új kód nem kell.
- Fizetős AI-futás (képgyártás, TGM-próbagenerálás, Astra) tulajdonosi keret nélkül.
- Éles adatbázisba írás, `npm run db:push`, valódi e-mail küldése, távoli ág törlése jóváhagyás nélkül.

## 3. Források (mért, 2026-11-21)

| # | Forrás | Hely | Tartalom |
|---|---|---|---|
| F1 | Mentés-összefoglaló | `tmp/websuli-mentes-osszefoglalo-2026-11-20.md` (nem követett; az eredeti a Drive „websuli adatok” mappában) | 896 sor: nyitott PR-ok, helyi ágak, döntések, csapdák, kanban, a gépváltás lépései |
| F2 | Astra-revízió | `.claude/worktrees/teljes-revizio/docs/revizio/00…05-*.md` (nem követett, 4,05 MB) | **935 munkacsomag (MCS-001…MCS-935)**, 1570 nyitott forrástétel: 823 részben teljesült, 64 ágon kész, 122 nem valósult meg, 561 ellenőrizetlen |
| F3 | Pótlási terv | helyi ág `docs/websuli-potlasok` (`7ed789ee`; mentés: `origin/higienia-backup/docs/websuli-potlasok`) | 68 P-tétel, 50 szelet, D-01…D-16 döntés |
| F4 | Kanban | `.hermes/kanban.db` (megvan; CLI: `HERMES_KANBAN_CLI` üres) | 212 jegy: 67 kész, 6 folyamatban, 5 review, 134 todo |
| F5 | GitHub | `gh pr list` | 10 nyitott PR, mind zöld CI-vel; a #484 és a #486 ütközik |
| F6 | Git | 92 helyi ág; 62 mentési ág `origin/higienia-backup/*` alatt; 4 munkafa | a csak helyi munka mind megvan, a fontosabb ágak távoli mentéssel is |

A gép-ellenőrzés eredménye: a fő checkout `main` = `origin/main` = `d9d1e6c6`, tiszta. Node `v24.22.3`, `source/node_modules` megvan.
`OPENROUTER_API_KEY` be van állítva. A kanban-adatbázis átjött. Az F1 7. fejezetében felsorolt helyi ágak közül egy sem veszett el (a
fejük egyezik az F1-ben rögzítettel).

## 4. Rögzített döntések és kényszerek

- A kapuk sorrendje és a megkerülés tilalma: AGENTS.md „Minőségkapuk” és `docs/minosegkapuk.md`.
- A független ellenőr kizárólag a gépi vak futtató (`npm run gate:blind-review`, `openai/gpt-6.2-sol`, high). Claude-alügynök nem lehet
  ellenőr (globális CLAUDE.md, 2026-11-19). **A futtató csak a `chore/vak-ellenor-deepseek` ágon van**, a főágon nincs. Ezért az első
  szelet ennek a futtatónak a beolvasztása. Az ágról futtatva (`.claude/worktrees/vak-ellenor-deepseek`) bármely `--base/--head`
  párt képes vizsgálni, a bizonyítékot a közös `.git` alá írja.
- A tulajdonosi döntések D-01…D-16 (F3 8. fejezet) érvényesek; D-15 törölve.
- Advent határidő: bekapcsolás legkésőbb **2026-11-30**, a tulajdonos előnézeti próbája után (D-11).
- A TGM-változatosság KIEMELT (memória: `lesson-variety-priority`), de kapcsolója (`STUDIO_LESSON_VARIETY`) alapból KI marad a lánc végi mérésig.
- Halmozott láncnál minden PR önmagában is semleges legyen (memória: `stacked-pr-standalone-neutral`).
- WIP ≤ 4, egyszerre egy nehéz kör (gépi zár), vak körök max 3 PR-onként (memória: `gate-speed-decisions`).
- Tulajdonosi döntések 2026-11-21 (űrlap): sorrend H0 futtató → H1 advent → H2 kész PR-ok → H3 TGM → H4–H6; a vak ellenőr köreire
  ebben a futásban legfeljebb 30 USD OpenRouter-keret, elfogyáskor megállás és kérdés; az F1/F2 fájlok nem kerülnek a repóba (munkafa
  + Drive-mentés), csak személytelen kivonat; az adventi képek fizetős próbaköre a PR-C után, újabb kérdéssel.

## 5. Leltár — csoportok

### C0 · Kapu-infrastruktúra (minden más ennek a függvénye)
| Tétel | Ág / PR | Állapot (F1, F6) |
|---|---|---|
| Vak ellenőr futtató | `chore/vak-ellenor-deepseek` (`1e564a01`, nincs PR) | helyi kapuk zöldek; a főágon nincs `gate:blind-review` |
| GPT teljesítési őr | `feat/gpt-teljesitesi-or` (`736e1860`) | 103 teszt zöld; push-kapu + ellenőr hátra |
| Gépi zár | `feat/gepi-zar` (`a707d24d`) | 33/33 Win+Linux, mutációs 26/26 |
| Kapugyorsítás, ítélet-fej, célzott e2e | `fix/kapu-gyorsitas`, `fix/itelet-fej-egyeztetes`, `fix/gate-pr-celzott-e2e` | helyi, nincs PR |
| Session-zárás | `feat/session-zaras-kereses-osszevetes` (`5b18e18d`) | 55/55; tulajdonosi lépés: Stop hook bekötése |
| Szkriptkapuk P2 | `chore/szkriptkapuk-p2-bizonyitek-lanc` (`77e69552`) | P3–P5 később |
| Régebbi kapu-ágak | `chore/kapu-ingadozo`, `chore/kapu-allitas-ellenor`, `chore/kapu-teszt-integritas`, `chore/kapuk-beepites`, `chore/allapot-ellenorok`, `chore/vak-hibakereso-ellenor`, `fix/idozitesfuggo-tesztek` | tartalom szerinti összevetés kell (lehet, hogy beolvadtak vagy elavultak) |
| Nyitott kapu-PR-ok | #521 kitakaró regex, #513 merge-kapu REST, #522 Bence-maradvány, #524 1/4096 ingadozás | CI zöld; vak ítélet hiányzik |

### C1 · Adventi naptár (határidő 11-30)
- #523 PR-B adatmodell + végpontok (fej `79d35d16` = `wip/advent-b-egyesites`), CI zöld, 4. vak kör hiányzik.
- PR-C felület: `wip/advent-c-javitas` (`ebd03a42`), nincs PR; a PR-B-re épül.
- A-1 (S6: admin-előnézet, 60 napos takarító, bekapcsolás) és A-2 (S5: eredménylevél az adminoknak) — nem indult.
- S3c képek (`feat/advent-s3c-kepek`, `chore/advent-s3c0-kepgyarto`): fizetős kör ≤ 7 USD, előbb 10 képes próba, csak jóváhagyással.
- MCS-039, MCS-051–053, MCS-286 (F2).
- Régi szeletágak (`feat/advent-s1…s4`, `tmp/advent-merge`, `feat/jatek-adventi-naptar`, `docs/adventi-naptar-terv`, `wip/advent-b-olvasas`): tartalmi összevetés a PR-B/PR-C-vel, utána takarítás.

### C2 · Tananyag-változatosság és forrásábrák (TGM, KIEMELT)
- Halmozott helyi lánc, PR nélkül: S5a → S5b → S6a → S6b → S6c → SK2 → S2b-1 → S2b-2 (`feat/tgm-*`, fej `3e101941`) = MCS-001…012.
- S3a-1 (`feat/tgm-s3a1-abrakeszito-forrasra`, `3e9d2e4e`; csak terv az elődjéhez képest), S3a-2, S3b = MCS-013…017.
- Folytatás: MCS-018…031 (S4a, S4b, SK3, S10/0, S10/1, SK1c, S7a, S7b, S8c, SK4, SK5, S9, S10/2).
- Kanban #146, #183. A bekapcsolás tulajdonosi döntés az S10/2 mérés után.

### C3 · Tananyag-eredmény, pontozó, üzemeltetés (P1-blokk)
- #510 eredmény-e-mail a kvízekhez S1b: 5 nyitott review-lelet (offline kvíz → másik tanuló, 7 napnál régebbi kör, két fül, leállítási határidő, első beküldő kiléte).
- T-1 pontozó (`fix/pontozo-polinom-ket-szam`, `63bc94a4`), I-1 kliens-IP (`fix/kliens-ip-cloudflare-ut`, `1416cbf1`), I-2 kisfilm #418 (480 MB küszöb: tulajdonosi jóváhagyás), T-3 tartós küldési sor, T-2, Q-1…Q-3 (F3).
- MCS-032, 037, 038, 040–050, 054–060 (F2).

### C4 · Játékok
- Nyitott PR: #504 Kockavadász telefon, #484 J3a Rúnabánya (ütközik, a #504 után, D-04), #486 J6a Aszteroida (ütközik, D-08).
- Helyi ágak: J7b Tornado (`feat/jatek-j7b-tornado-utelagazas`, M10 ingadozó teszt), Szökőár (`fix/szokoar-tema-es-sebesseg`, 57 commit), joystick jobb kézre (`feat/joystick-jobb-kez`, a Szökőár után), kabala (`feat/kabala-fooldal`, `kiserlet/kabala-maki`; D-12), hang-előmelegítés (`fix/hang-elomelegites`).
- Nem indult: G-21 Szólétra (szövegárnyék, haladássáv-szín, helyőrző, „Villámot” tárgyrag; D-05, D-16), G-1…G-20, J1b/c, J2b, J3b/c, J6b, J7c, J8, J9, közös játék M-1…M-8 (D-07).
- Kanban #52, #76, #78, #79, #81, #87, #89, #90, #101. MCS-033–035, 041 (F2).

### C5 · Az Astra-revízió többi csomagja
- MCS-061…MCS-935 (F2), témák szerint: biztonság és hozzáférés (pl. 060, 063–065, 068), dokumentum- és memóriahigiénia (070), kisfilm, push-értesítés, borítók, régi PR-szálak maradéka.
- A csomagokat triázzsal kell rendezni: (a) a főágon már teljesül → bizonyíték és lezárás; (b) kódhiba → célzott PR; (c) tulajdonosi döntés vagy éles próba → űrlap a tulajdonosnak.

### C6 · Tulajdonosi teendők (ügynök nem végezheti)
- `RENDER_API_KEY` GitHub-titok; a session-zárás Stop hookjának bekötése a `.claude/settings.json`-ba; #418 480 MB küszöb; advent előnézeti próba és bekapcsolás; TGM bekapcsolás az S10/2 után; kanban #9 titokrotáció, #10, #15, #68, #77, #99, #112, #138/#139, #185; az F2 „Tulajdonosi döntést igénylő pontok” 8 sora.
- A két régi felhős Claude-munkamenet leállítása (F1 3.5).

### C7 · Higiénia
- ~90 helyi ág és 62 `higienia-backup/*` távoli ág: a beolvasztott (MERGED PR) ágak helyi törlése tartalmi összevetés után. Távoli ág törlése csak jóváhagyással.
- Kanban: a CLI helyének visszaállítása (`HERMES_KANBAN_CLI`), a review-ban ragadt jegyek rendezése.
- Doksi-ellentmondások: a `docs/minosegkapuk.md` még a Gemini-ellenőrt írja; a `docs/kanban.md` #6–#11-ről szóló része elavult.
- Az Astra-revízió és a mentés-összefoglaló tartós helye (jelenleg nem követett fájlok).

## 6. Végrehajtási sorrend (szeletek)

| Hullám | Tartalom | Feltétel |
|---|---|---|
| H0 | A vak futtató beolvasztása (`chore/vak-ellenor-deepseek`), utána gépi zár és GPT teljesítési őr | a futtató az ágról önmagát vizsgálja |
| H1 | Advent: #523 → PR-C → A-1 + A-2 → (képek jóváhagyással) | H0; 11-30 határidő |
| H2 | A zöld, kész PR-ok: #524, #521, #513, #522, #418, #510 (5 lelet javítása után) | H0 |
| H3 | TGM-lánc: S5a … S2b-2 beolvasztása, majd S3a-1 → S3a-2 → S3b, MCS-018…031 | H0 |
| H4 | P1-maradék: T-1, I-1, T-3, T-2, Q-1…Q-3; session-zárás, szkriptkapuk P2, kapu-ágak | H0 |
| H5 | Játékok: #504 → #484 → #486 → J7b → Szökőár → joystick → G-21 → kabala → G-*/J-*/M-* | H0 |
| H6 | C5 triázs és csomagonkénti javítás | H2–H5 |
| H7 | C7 higiénia, retró, tudástérkép | minden hullám végén részben, a végén teljesen |

A hullámok a gépi zár miatt sorosan merge-elnek, de a fejlesztésük párhuzamos lehet (WIP ≤ 4).

## 7. Edge case-ek

- Egy helyi ág fejét a mentés óta más gépről módosították → a `origin/higienia-backup/<ág>` és a helyi fej összevetése, eltérésnél megállás.
- Egy MCS-tétel a főágon már teljesül → bizonyíték rögzítése, kód nincs.
- A vak futtató nem tud lefutni (kulcs, OpenRouter, keret) → a munka megáll, a tulajdonos dönt (nincs csendes tartalék).
- Ütköző PR (#484, #486) → `origin/main` beolvasztása az ágba (rebase és force-push tilos), utána új kapukör.
- Tulajdonosi lépést igénylő tétel → űrlapon kérdezünk, addig a tétel NOT DONE + ok.

## 8. Elfogadási kritériumok (EARS)

<!-- acceptance-checklist -->
- WHEN a terv elkészül THEN SHALL minden F1–F6 forrás tétele egy C-csoportba sorolva, forrásra hivatkozva szerepelni.
- WHEN egy szelet beolvad THEN SHALL zöld `gate:stage`, `gate:push`, vak futtató ítélet (`record-review`), `gate:pr`, zöld CI és `gate:merge` bizonyíték tartozni hozzá.
- WHEN egy hullám lezárul THEN SHALL a kanban, a memória (`retro-naplo.md`) és ez a terv „Állapotnapló” szakasza frissülni.
- WHEN egy tétel tulajdonosi döntést igényel THEN SHALL az űrlapon (AskUserQuestion) feltett kérdés, javaslattal, megelőzni a végrehajtást.
- WHEN a C5 triázs lefut THEN SHALL mind a 935 MCS-csomag állapota (kész / PR / döntés) gépileg megszámolva rögzítve lenni.

## 9. Kockázatok

- A teljes lista több napos (a vak ellenőr ~30–40 perc/kör, egyszerre egy). Az advent határidő miatt a H1 megelőzi a H2-t.
- A F2 statikus összevetés: az „ellenőrizetlen” 561 tétel egy része éles próbát igényel, ezt a repóból nem lehet lezárni.
- A nem követett F1/F2 fájlok elveszhetnek. Ezek tartós helye a C7 része, a nyilvános repóba csak személyes adat nélkül kerülhetnek.

## 10. Állapotnapló

- 2026-11-21: leltár és terv kész; a gép-ellenőrzés zöld (3. szakasz).
- 2026-11-21: a régi gép kapubizonyítékai (`.git/websuli-qa-evidence`, 525 fájl) átjöttek. #523 (advent 2/3) és #524 (1/4096-os
  ingadozás) beolvasztva, a nyitott review-szálak megválaszolva (`fe123959`, `114eaa63`).
- 2026-11-21: H0 vak kör a futtatóra (`5c6bceb3`): NEM, 2 blokkoló + 7 közepes + 1 kicsi (0,95 USD) — javítás folyamatban.
- 2026-11-21: a #510, #521, #504 és #418 helyi ágán a review-javítások már megvannak (a régi gépen készültek, push nélkül); csak a
  kapukör hiányzik. A PR-C az élesítés előtti javításokkal egy PR-ban megy (`feat/advent-c-felulet-es-elesites`, a fa bájtra azonos a
  `wip/advent-d-elesites-elott` ággal).
