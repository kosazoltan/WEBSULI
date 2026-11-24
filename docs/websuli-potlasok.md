# WEBSULI pótlások

- **Készítés ideje (UTC)** — 2026-11-19T16:45:57Z (első kör). Második kör — az azonos mainhez kapott PR-export és a tananyag oldalszál feldolgozása.
- **Vizsgált időszak** — 2026-11-12–2026-11-19, mindkét naptári nap beleértve, Europe/Budapest.
- **Rögzített main** — `b7165a56955991c9a4bdf913f0cdd8974463077e`, a vizsgálatkor a helyi `origin/main` és `main` feje. **Leltárág** — `docs/websuli-potlasok`.
- **Tételek** — 68 folytatási tétel, 88 mainen igazolt heti részeredmény. NEM VALÓSULT MEG 7, ÁGON KÉSZ, NINCS BENT 14, RÉSZBEN 31, ELLENŐRIZETLEN 5, TULAJDONOSI DÖNTÉSRE VÁR 11.

## Források és bizonyítás

- Main git-fa és történet. A `docs/specs/` heti terv–végrehajtás párok elfogadási pontjai, `docs/handoffs/`, `docs/agent-csapdak.md`, `docs/kanban.md`, `docs/measurements/` heti mérési jegyzőkönyvei, `memory/projects/websuli/LEDGER.md`, a heti MD/YAML/QMD változások, valamint célzott `TODO`/`FIXME`, követő és nyitott jelölések. A heti git-nézetben a módosított YAML-ok a `.github/workflows/auto-review.yml`, `.github/workflows/ci.yml` és `render.yaml`, QMD-változás nem jelent meg.
- Git bizonyíték. `git log --all` (862 egyedi heti hash), `git branch -a`, `git for-each-ref`, `git log origin/main..<ref>`, `git diff --name-only` és célzott tartalmi összevetés, `git show`, `git grep -n`. Az ág-összevetés 111 dátumszűrt refet tartalmaz az origin szimbolikus HEAD nélkül. A műveletek a helyileg tárolt távoli referenciákat használták.
- Munkafák. `git worktree list` és munkafánként `git --no-optional-locks … status --short --untracked-files=all`. A parancsonkénti `safe.directory` beállítás nem írta a konfigot. Az első teljes söprésben 50 munkafa, a későbbiben 51. A későbbiben 48 tiszta, 3 módosított, 0 státuszhiba. A külső aktív munkafák változhattak a két olvasás között.
- Kanban (első kör). A megtalált Hermes `software-development/hermes-kanban-workflow/scripts/kanban.mjs` `list --repo WEBSULI` és `show` olvasórészét használtam a `WEBSULI/.hermes/kanban.db` táblán. A CLI szokásos inicializálása írhat, ezért a forrást memóriában olvastam be, és a kapcsolatot írásvédetten nyitottam, inicializáló DDL nélkül. 204 sorszámozott jegy. A státuszt és létrehozási dátumot a tábláról, a main-állapotot a forráskódból vagy a rögzített diffből vettem. A 2026. októberi, ezen a héten változatlan jegyek a heti összesítésen kívül esnek.
- Repón kívüli ügynökmemória. A WEBSULI-projekt `MEMORY.md` indexe és a heti módosítású fájlok, köztük a vak ellenőr, gate speed, fő munkafa, futásidejű szkriptőrök, halmozott PR, játékmódok, koordináció, archiválás és régi migráció.
- Repón kívüli átadók. A közös git-könyvtár `websuli-atadas-2026-11-19.md` fájlja és az olvasható scratchpad projektjegyzetei. A scratchpadból a leltárakat, PR-leírásokat, jegytervezeteket, szálválaszokat, vak és QA-jelentéseket használtam. A generált függőség- és tesztkimeneteket útvonal- és tartalommintával szűrtem.

- **GitHub PR-állapot és review-szálak (második kör).** Elérhető a letöltött `pr-nyitott.json` és `pr-lezart.json`, valamint mind a nyolc `szalak-<PR>.json`. A mentésben 8 nyitott PR, 20 review-szál (6 feloldatlan), és 80 lezárt PR-rekord szerepel (79 összevont, 1 lezárt összevonás nélkül). A nyitott PR távoli fejét az export, a helyi fej és a tartalom eltérését a git adja. A lezárt export 79 összevont PR-ja szerepel a 88 heti main-sor között. A fennmaradó 9 main-sor gitből igazolt.
- **Claude oldalszál (második kör).** Elérhető a `side-session-notes/tananyag-minoseg/` másolata a `99-ATADAS-fo-szalnak.md` átadóval, a 00–07 jegyzetekkel, a #516 PR-leírással és a vak review mentésével. Csak a nyilvánosan hivatkozható műszaki következtetések szerepelnek. A munkamenet korábbi állapotát a rögzített main és a PR-export későbbi bizonyítékaival egyeztettem.

### Hozzáférési és verifikációs korlátok

- **A PR-export határai.** A mentés pillanatképet ad. A draft, aktuális CI, jóváhagyások, összevonhatóság és a mentésen kívüli PR-ok szerveroldali állapota nem igazolt. A #515 és #516 által kiváltott hat előd formális lezárását a mentés nem tartalmazza. Az exportban megadott sorszámok a szál mentett helyei, a helyi javítást külön hash jelöli. A beolvasztás általános feltétele az egyeztetett fejen a kötelező zöld CI, a jóváhagyások és a szálak rendezése, majd a közvetlen merge-kapu. Az adott PR saját feltétele a tételnél áll.
- **Éles állapot és végrehajtás — NOT RUN.** Kód, tesztforrás és dokumentált mérés alapján állapít meg repoállapotot a leltár. E2E, kapuk, deploy, szerver, alkalmazás-adatbázis és fizetős hívás nem része ennek az ellenőrzésnek. Az olvasott teszt neve a teszt létezését jelzi. A kiadott flag, eszközön mért állapot és kézbesítés külön ellenőrzést igényel.
- Az `ÁGON KÉSZ, NINCS BENT` a látható fő ági implementációhoz tartozó állapot, a PR és a review vagy mérési feltételek az adott tétel hiányai között szerepelnek. A `RÉSZBEN` lehet mainen lévő működő szelet vagy bizonyított WIP. Az `ELLENŐRIZETLEN` tételekhez célzott visszaellenőrzést adtam.

### Rövid forráshivatkozások

- **Átadó** — a közös git-könyvtárbeli `websuli-atadas-2026-11-19.md`, utánajegyezve a sorszám. **Scratchpad** — a megbízásban megjelölt 2026-11-18–19-i jegyzetgyűjtemény, relatív úttal. **Memória** — a repón kívüli WEBSULI-projektmemória, fájlnévvel.
- **JÁTÉK** — `docs/specs/2026-11-16-jatekok-jatekelmeny.md` és `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md`. A „Játékszeletek végrehajtása” sorszámai az utóbbira mutatnak.
- **TGM** — `docs/specs/2026-11-18-tananyag-gyartas-minoseg.md` és `docs/specs/2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md`. A TGM sorszámai a tervre mutatnak, ahol másként nem jelölt. **Oldalszál** — a `tananyag-minoseg/` másolatán belüli relatív hivatkozás. **PR-export** — a letöltött PR-lista és szálfájlok. A távoli PR-állapot és a leltár implementációs állapota külön mező.
- **ADVENT** — `docs/specs/2026-11-18-adventi-naptar.md` és `docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md`. B/C/S3c sorszámoknál a megadott ág változatát használd. Ha a folytatási helyen nem szerepel ág, munkafa vagy PR, az a forrásból nem igazolt. A `#` kanban vagy PR jelentése a mező címkéjéből következik.

## Összesítő táblázat

| Azonosító | Cím | Állapot | Terület | Prioritás-javaslat | Forrás(ok) |
|---|---|---|---|---|---|
| P-001 | Kockavadász J3a – Rúnabánya | ÁGON KÉSZ, NINCS BENT | játékok | P1 | Kanban #79. Játékszeletek végrehajtása 1249–1329, átadó 14, scratchpad review-jatekok/vak-j3a-jelentes-1.md; PR-export #484, szalak-484.json |
| P-002 | Aszteroida J6a – Kristály-válasz | ÁGON KÉSZ, NINCS BENT | játékok | P1 | Kanban #81. Játékszeletek végrehajtása 1680, átadó 14, scratchpad review-j6a/vak-486-jelentes-1.md; PR-export #486, szalak-486.json |
| P-003 | Tornádó J7b – útelágazás és turbó | ÁGON KÉSZ, NINCS BENT | játékok | P1 | Kanban #83, #87. Játékszeletek végrehajtása 1803, átadó 14, scratchpad pr-j7b.md és review-jatekok/vak-j7b-jelentes-1.md 83–133 |
| P-004 | Kockavadász mobil teljesítmény és perf panel | ÁGON KÉSZ, NINCS BENT | játékok | P1 | Kanban #90, #117, #123. Átadó 12, scratchpad review-kockavadasz/vak-504-jelentes-2.md és leltar-arva.md 88–89; PR-export #504, szalak-504.json |
| P-005 | Szökőár – téma, sebesség, 3D modellek és olvashatóság | ÁGON KÉSZ, NINCS BENT | játékok | P1 | Kanban #129, #186. Átadó 15, scratchpad pr-szokoar.md és review-jatekok/vak-szokoar-jelentes-2.md 66–80 |
| P-006 | Joystick jobb kézre | ÁGON KÉSZ, NINCS BENT | játékok | P2 | Átadó 15, scratchpad leltar-2026-11-18.md, kanban #178 |
| P-007 | Főoldali kabala kompakt sávja | ÁGON KÉSZ, NINCS BENT | egyéb | P2 | Átadó 15, scratchpad leltar-arva.md |
| P-008 | Kuponos Brain Rot közös ismétlése és tesztutómunka | ELLENŐRIZETLEN | játékok | P2 | Kanban #95, #109, #133, #141. Kanban #95/#109/#133/#141, JÁTÉK, scratchpad review-485/jelentes-kupon-atallas.md és leltar-arva.md:22–23 |
| P-009 | Kérdésbank S2–S3, lenyomat és mérhetőség | RÉSZBEN | játékok | P2 | Kanban #71, #101, #149. docs/specs/2026-11-17-kerdesbank-karcsusitas.md és párja, kanban #71/#101/#149 |
| P-010 | Kuponos ismétlés – határidő és visszatérés | NEM VALÓSULT MEG | játékok | P1 | Kanban #108, #136. Kanban #108/#136 és scratchpad review-485/jelentes-kupon-atallas.md |
| P-011 | Szólétra – telefonos felirat, tárgyrag és versenyjelölők | NEM VALÓSULT MEG | játékok | P2 | Átadó 24–27, 2026-11-19 |
| P-012 | Szólétra tempó, XP és pacing-felosztás | RÉSZBEN | játékok | P2 | Kanban #112, #148. Kanban #112/#148, docs/specs/2026-11-17-szoletra-olvashatosag.md, 69547067 |
| P-013 | J1b/c – Szökőár folytatása | RÉSZBEN | játékok | P2 | Kanban #94. Játékszeletek végrehajtása 948–1162, kanban #94 |
| P-014 | J2b, J3b/c, J6b, J7c és játékhullám-zárás | NEM VALÓSULT MEG | játékok | P2 | Kanban #93, #104. Játékszeletek végrehajtása 1162,1249,1680,1803,1906,1980, képernyőlista 2026-11-16 |
| P-015 | J5b – Brain Rot rivális, arany lény és visszalopás | RÉSZBEN | játékok | P2 | Kanban #88. Játékszeletek végrehajtása 1467–1679, kanban #88 |
| P-016 | Játékmotor – kérdéssáv, főszál és órák | RÉSZBEN | játékok | P2 | Kanban #86, #98, #102, #114, #134, #199. Játékszeletek végrehajtása 169, kanban #86/#98/#102/#114/#134/#199 |
| P-017 | Éles játékképernyők és új kis leletek | ELLENŐRIZETLEN | játékok | P2 | Kanban #64, #74, #111, #178, #196, #197, #198. Kanban #64/#74/#111/#178/#196–198, scratchpad vak-szokoar/kovetojegyek-577c.md 5–22 |
| P-018 | Online párbaj JM3b és csoportos mód | RÉSZBEN | játékok | P1 | Kanban #52, #73, #97. Játékszeletek végrehajtása 2249–2402, kanban #52/#73/#97 |
| P-019 | JM7c-2 és JM8–JM11 – fiókátmenet, jutalom és közösségi réteg | RÉSZBEN | játékok | P1 | Kanban #62, #75, #96. Játékszeletek végrehajtása 2769,2829–2896 és későbbi JM-fejezetek, kanban #62/#75/#96 |
| P-020 | Játékosfiók Gmail-alias egyedisége | TULAJDONOSI DÖNTÉSRE VÁR | játékok | P2 | Kanban #77. Kanban #77, #475 utóreview |
| P-021 | Aszteroida utómunka és budapesti napi seed | ELLENŐRIZETLEN | játékok | P2 | Kanban #85. Kanban #85, scratchpad review-j6a/vak-486-jelentes-1.md |
| P-022 | Játékosfiók és többjátékos mód élesítési sorrendje | TULAJDONOSI DÖNTÉSRE VÁR | játékok | P1 | docs/handoffs/2026-11-16-jatekelmeny-fiok-retro.md:137–156, memória game-multiplayer-decisions.md és game-accounts-student-self-registration.md |
| P-023 | Adatvédelmi címőr utáni történetdöntés | TULAJDONOSI DÖNTÉSRE VÁR | infrastruktúra | P2 | Kanban #57. Kanban #57, docs/specs/2026-11-16-valodi-cimek-ki.md |
| P-024 | Leckeeredmény e-mail S1b – félbehagyott kvíz | ÁGON KÉSZ, NINCS BENT | tananyag | P1 | Kanban #119, #135, #137, #138, #139. docs/specs/2026-11-17-eredmeny-email-kviz.md és párja, átadó 11, scratchpad dev510/pr-510-leiras.md és review-lecke-hibak/vak-510-jelentes-5.md; PR-export #510, szalak-510.json |
| P-025 | Leckeeredmény e-mail – tartós jelző és kézbesítési szélek | RÉSZBEN | tananyag | P1 | Kanban #127, #128, #189, #190, #191. Kanban #127/#128/#189–191, scratchpad review-lecke-hibak/vak-510-jelentes-5.md:34–72 |
| P-026 | Tananyag címében az osztály – keresési szélek | RÉSZBEN | tananyag | P2 | Kanban #116, #142. docs/specs/2026-11-17-tananyag-cim-osztaly.md és párja, kanban #142 |
| P-027 | Pontozó – polinom, tagolás, rubrika és kérdésmásolás | RÉSZBEN | tananyag | P1 | Kanban #121, #122, #130, #132. Kanban #121/#122/#130/#132, docs/specs/2026-11-17-nyilt-feladat-rovid-valasz.md |
| P-028 | Stúdió S1–S3 és SK1c – forráshű vizuálok teljes élesítése | RÉSZBEN | tananyag | P1 | Kanban #146, #157, #163. TGM 439–469, 512 és 578–579, kanban #146/#157/#163, átadó 9; Oldalszál 01–02 és átadó 27–34 |
| P-029 | Stúdió S4 és SK3 – számolási ellenőrzés és költségjelzés | RÉSZBEN | tananyag | P1 | Kanban #145, #146. TGM S4, S4b:300 és SK3:470, kanban #145 J1 és #146; Oldalszál 04:447–479 |
| P-030 | Stúdió S5–S6 és SK2 – lecke változatossága | NEM VALÓSULT MEG | tananyag | P2 | Kanban #146. TGM 330–350 és 489–495; Oldalszál 03:378–459 |
| P-031 | Stúdió S7 – rövid válasz promptja és döntőbíró plafon | RÉSZBEN | tananyag | P2 | Kanban #131, #146. TGM 351–358, kanban #131; Oldalszál 04:334–422 |
| P-032 | Brit TTS S8c – hanggyártás és tartaléklánc utómunka | RÉSZBEN | TTS | P1 | Kanban #150, #165, #183. TGM 360–407, kanban #150/#165/#183, scratchpad review-lecke-hibak/vak-516-merge-jelentes.md; Oldalszál átadó 10–34 és `vak-hanglanc-4-jelentes.md` |
| P-033 | Stúdió S9, S10, SK4 és SK5 – kiadási őr és zárómérés | RÉSZBEN | tananyag | P1 | Kanban #146. TGM 307–329, 495–504, 191 és végrehajtási pár, kanban #146; Oldalszál 02–04/06 és átadó 34; TGM végrehajtás S10/S9 |
| P-034 | Advent PR-B – adatmodell és végpontok | RÉSZBEN | advent | P1 | Kanban #152, #156, #166, #170, #171, #173. Advent végrehajtás 95–182 és 409, átadó 13, scratchpad pr-B-adatmodell-vegpontok.md és review-advent/vak-prb-jelentes-3.md |
| P-035 | Advent PR-C – naptároldal és főoldali kártya | RÉSZBEN | advent | P1 | Kanban #162. Advent végrehajtás 183–289, átadó 13, scratchpad pr-C-felulet.md és review-advent/vak-prc-jelentes-2.md |
| P-036 | Advent S3c – képkiválasztás és végleges eszközök | RÉSZBEN | advent | P1 | Kanban #154, #161. Advent végrehajtás 499 és 636, kanban #154/#161, scratchpad leltar-arva.md:80–87 |
| P-037 | Advent képgyártó – költség és megszakítás utómunka | RÉSZBEN | advent | P2 | Kanban #200, #201, #202, #203. Kanban #200–203, scratchpad review-advent/vak-kepgyarto-jelentes-1.md:21–30 és -2.md:15–19 |
| P-038 | Advent S5/S6/S8 – levelek, admin előnézet, takarítás | NEM VALÓSULT MEG | advent | P1 | Kanban #155, #172. Advent végrehajtás 290–342,416–453 és terv 15. szakasz, kanban #155/#172 |
| P-039 | Advent kérdéskészlet átfedése és első osztályos felolvasás | RÉSZBEN | advent | P2 | Kanban #151, #153. Kanban #151/#153, Advent végrehajtás 386–407 |
| P-040 | Játékhang felhasználói mozdulat utáni előmelegítése | ÁGON KÉSZ, NINCS BENT | játékok | P2 | Kanban #93. Scratchpad pr-hang.md és vak-hang/kovetojegyek-1.md:1–16 |
| P-041 | Kisfilm memória és párhuzamosság | ÁGON KÉSZ, NINCS BENT | infrastruktúra | P1 | Kanban #35. Kanban #35, origin/kisfilm-memoria-javitas ág, helyi előzmény PR #418; PR-export #418, szalak-418.json |
| P-042 | Szkriptkapuk P1–P5 – terv, bizonyítéklánc, állítás és tesztszigor | RÉSZBEN | kapuk-QA | P1 | Kanban #91, #187, #188. Kanban #91/#187/#188, scratchpad szkriptkapuk/jegyek-kanbanra.md, review-szkriptkapuk/vak-p1-jelentes-6.md és vak-p1p2-jelentes-2.md; PR-export #517, szalak-517.json |
| P-043 | Vak ellenőr gépi futtatója és kizárólagos ítélete | ÁGON KÉSZ, NINCS BENT | kapuk-QA | P1 | Kanban #99. Memória blind-bug-hunting-reviewer.md:13–52 és blind-review-runner.md, átadó 15/19, ág 57252fa7/f84742c7; Oldalszál 00:26–37 és #515/#516 leírás |
| P-044 | Merge-kapu REST, lapozás és ítélet | ÁGON KÉSZ, NINCS BENT | kapuk-QA | P1 | Scratchpad review-hook-memo/vak-513-jelentes-1.md–3.md, ág tervpár; PR-export #513, szalak-513.json |
| P-045 | Audit-hook kapuindítás és hookok követő szigorítása | RÉSZBEN | kapuk-QA | P1 | Kanban #100, #120, #124, #125, #140, #158, #159, #160, #164, #174, #175, #176, #177, #179, #180, #181, #182, #184, #185, #192, #193, #194, #195. Átadó 10, scratchpad review-hook-memo/vak-506-jelentes-2.md–4.md, vak-auditok-jelentes-1.md–3.md, mut3/szalvalasz-520.md, kanban; PR-export #520, szalak-520.json |
| P-046 | Kapu gyorsítás – célzott e2e, őrök és futásidő | RÉSZBEN | kapuk-QA | P1 | Kanban #92, #106, #107, #113, #115, #144, #168. Memória gate-speed-decisions.md és main-checkout-must-be-current.md, kanban #92/#107/#113/#115/#144/#168, scratchpad review-szkriptkapuk/vak-kapugyorsitas-jelentes-1.md |
| P-047 | Állapot-ellenőrzők és kapuk bekötése minden környezetben | RÉSZBEN | kapuk-QA | P2 | Kanban #103. Kanban #103, scratchpad leltar-arva.md:66–79, ág commit ab69f000 és ab87bf16 |
| P-048 | Régi automata-review maradványainak eltávolítása | ÁGON KÉSZ, NINCS BENT | kapuk-QA | P2 | Scratchpad bence/body.md, bence/vak-jelentes-1.md és -2.md |
| P-049 | Titokkitakarás lineáris futásideje | ÁGON KÉSZ, NINCS BENT | kapuk-QA | P1 | Scratchpad kitakaro/vak-jelentes-1.md, ág docs/specs/2026-11-19-kitakaro-negyzetes-regex.md és párja |
| P-050 | CI E2E szelethangolás és kis review-utókörök | RÉSZBEN | kapuk-QA | P2 | Kanban #76, #105, #143, #167, #204. Scratchpad ci-e2e/kanban-jegyek-514-L1-L3.md, kanban-jegyek-L4-L6.md, vak-518-merge-jelentes.md:21–30, kanban #76/#105/#143/#167/#204 |
| P-051 | Ügynökvezérlés második lépcső és takarítás | RÉSZBEN | egyéb | P3 | Kanban #34. docs/specs/2026-11-17-vezerles-dieta.md és párja, kanban #34, memória cleanup-delete-archives.md és orchestrator-owns-all-websuli-flows.md; Oldalszál 06–07 |
| P-052 | Telepítés előtti aktívfutás-őr és éles konfiguráció | RÉSZBEN | infrastruktúra | P1 | Kanban #63, #68, #169. docs/telepites-elotti-or.md, kanban #63/#68/#169, memória no-deploy-during-active-runs.md |
| P-053 | Havi teljesítmény-audit – Vercel és sokat olvasó végpontok | RÉSZBEN | infrastruktúra | P2 | Kanban #69, #72. Kanban #69/#72, 2026-11-17 utómunka retro, #478 felmérés |
| P-054 | Futásidejű szkript-őrök J3–J10 | NEM VALÓSULT MEG | infrastruktúra | P2 | Kanban #145. Kanban #145, scratchpad szkript-orok/leltar.md, 2026-11-18 |
| P-055 | Advent vendéghaladás átvitele párosításkor | RÉSZBEN | advent | P1 | Kanban #170. Kanban #170, feat/advent-b-adatmodell-vegpontok:docs/specs/2026-11-18-adventi-naptar.md:1065–1085 és scratchpad review-adventi/vak-pr-b-jelentes-1.md:63 |
| P-056 | Advent végleges képek és levélindítás jóváhagyása | TULAJDONOSI DÖNTÉSRE VÁR | advent | P2 | Kanban #154, #155. Advent terv 15. szakasz és végrehajtás 416,499 |
| P-057 | Hook eszközhatár és projekt-helyi beállítás | TULAJDONOSI DÖNTÉSRE VÁR | kapuk-QA | P1 | Kanban #175, #179, #181, #185. Kanban #175/#179/#181/#185, scratchpad review-hook-memo/vak-506-jelentes-4.md:57–66 |
| P-058 | Kapu rekord és napló – munkafánkénti bizonyíték | NEM VALÓSULT MEG | kapuk-QA | P2 | Scratchpad szkriptkapuk/jegyek-kanbanra.md:3–19, docs/agent-csapdak.md C-75 |
| P-059 | Korábbi migrációs tananyagok és hetente frissített módszertan | ELLENŐRIZETLEN | tananyag | P3 | Memória legacy-migration-cycles.md, frissítés 2026-11-17, régi kanban #6/#7/#15/#16 |
| P-060 | Linkek és háttérfigyelők életciklusa | ELLENŐRIZETLEN | infrastruktúra | P2 | Memória learner-profile-tokens.md, taskstop-orphan-monitor.md, main-checkout-must-be-current.md, 2026-11-17–19 |
| P-061 | Nyitva maradt PR-szálak és lezárt, be nem olvasztott PR-ok | RÉSZBEN | egyéb | P2 | PR-export `pr-nyitott.json`, `pr-lezart.json`, mind a nyolc `szalak-<PR>.json`; Átadó 6–16 és a rögzített main. |
| P-062 | Claude oldalszál-átadó és helyi próbaanyagok | RÉSZBEN | egyéb | P3 | Oldalszál `99-ATADAS-fo-szalnak.md`, `00-tulajdonosi-dontesek.md`, `01`–`07` jegyzetek és kapcsolódó mérőanyagok; első körös git-átadó és scratchpad. |
| P-063 | Kockavadász J3a pontskála és korábbi rekordok | TULAJDONOSI DÖNTÉSRE VÁR | játékok | P1 | PR-export #484, „Pontszám-skála (L6)”; helyi `3a42110e`. |
| P-064 | Brit TTS néma próbakimondás és hangtárplafon | TULAJDONOSI DÖNTÉSRE VÁR | TTS | P1 | Oldalszál `99-ATADAS-fo-szalnak.md:36–39`, `00-tulajdonosi-dontesek.md:18–20`; TGM 373–374 és végrehajtás 1030–1031. |
| P-065 | Stúdió SK3 új leállítási korlátainak hatóköre | TULAJDONOSI DÖNTÉSRE VÁR | tananyag | P1 | Oldalszál `00-tulajdonosi-dontesek.md:9–17`, `99-ATADAS-fo-szalnak.md:39`; TGM végrehajtás 602–659. |
| P-066 | Stúdió vizuális kapcsoló és az enforce kapu hibaága | TULAJDONOSI DÖNTÉSRE VÁR | tananyag | P1 | Oldalszál `00-tulajdonosi-dontesek.md:22–25,47–52`, `99-ATADAS-fo-szalnak.md:27–34`; TGM végrehajtás S10/1. |
| P-067 | Automatikus PR-összevonás és az Auto Review szövege | TULAJDONOSI DÖNTÉSRE VÁR | kapuk-QA | P2 | Oldalszál `99-ATADAS-fo-szalnak.md:23,39`; main `.github/workflows/auto-review.yml:82–83`, P-048. |
| P-068 | Külön GitHub-hozzáférésű munkamenet szükségessége | TULAJDONOSI DÖNTÉSRE VÁR | egyéb | P3 | Oldalszál `99-ATADAS-fo-szalnak.md:36–45`; PR-export #515/#516; main `f756588c`, `b7165a56`. |

## Tételek

### P-001 – Kockavadász J3a – Rúnabánya

- **Azonosító** — P-001
- **Cím** — Kockavadász J3a – Rúnabánya
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A játék használhatósága vagy a következő szelet függ tőle.
- **Eredeti utasítás / ötlet** — A bányászjátékot rúnazáras, mozgásra és erőforrásgyűjtésre épülő menetté kell átalakítani.
- **Forrás** — Játékszeletek végrehajtása 1249–1329, átadó 14, scratchpad review-jatekok/vak-j3a-jelentes-1.md. Kanban létrehozási dátum és táblastátusz — #79 (2026-11-17, `in_review`).
- **Mi van már kész** — A #435 mobilváltozat mainen. Az ágon a core.ts, sim.ts és BlockCraftQuiz.tsx módosult, a 1afe5959 a kőkoppintást, szünetet és összesítést javítja, 3a42110e tesztet igazít.
- **Mi hiányzik** — A rúnazár, bányászhurok és ágtesztek integrálása, a mai PR-fej és a K1–K6 zárása.
- **Folytatás helye** — feat/jatek-j3a-kockavadasz-runabanya @ 3a42110e, jatek-j3a, #484, JÁTÉK.
- **Következő lépés** — Kövesd a blockcraft-sim.test.ts és block-craft-real-touch.spec.ts feltételeit, ellenőrizd a távoli 9083a7c0 és helyi fej közti tesztkülönbséget.
- **Függőség / ütközés** — Kockavadász mobil sebesség, közös kérdéssáv.
- **PR-állapot** — #484 nyitott a mentésben, ág `feat/jatek-j3a-kockavadasz-runabanya`, GitHub-fej `9083a7c01c27be4bfdacf8999232a8d8f7814d13`, frissítve 2026-11-17T10:45:27Z (UTC).
- **Nyitott review-szálak** — 0 nyitott, 3 lezárt. A K1–K6 független ellenőri kör külön követendő.
- **Beolvasztás feltétele** — A `3a42110e` helyi fej K1/K2/K4–K6 javításait (`1afe5959`) és mérésstabilizálását egyeztesd a PR-fejjel. A PR-leírás a B1, B1+M3 és L7 korábbi CI-bukásának célzott javítását közli, ezért a beolvasztandó fejen kell zöld CI és független ítélet. A kiadás előtt a pontskáláról P-063 szerint kell dönteni.

### P-002 – Aszteroida J6a – Kristály-válasz

- **Azonosító** — P-002
- **Cím** — Aszteroida J6a – Kristály-válasz
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A játék használhatósága vagy a következő szelet függ tőle.
- **Eredeti utasítás / ötlet** — Az űrjátékban a kapufázis helyett célzott kristálylövés legyen a válasz.
- **Forrás** — Játékszeletek végrehajtása 1680, átadó 14, scratchpad review-j6a/vak-486-jelentes-1.md. Kanban létrehozási dátum és táblastátusz — #81 (2026-11-17, `in_review`).
- **Mi van már kész** — A #434 mobil alap mainen. Ágon crystals.ts, physics.ts és sim.ts, 2c39ab0d a célzáskorlát őrét és 3ea10f06 a sortávot javítja.
- **Mi hiányzik** — Az új kristályos játékmenet mainre kerülése és a helyi és távoli fej egyeztetése.
- **Folytatás helye** — feat/jatek-j6a-aszteroida-kristaly @ 9a296216, jatek-j6a, #486, JÁTÉK.
- **Következő lépés** — Vesd össze a 9da0e8c2 távoli fejjel és nézd meg a kristály-célzást, kuponos kérdést és fekvő mobil elrendezést a game-mobile-cases/space-asteroid-quiz.ts eseteiben.
- **Függőség / ütközés** — J6b és a többjátékos Aszteroida.
- **PR-állapot** — #486 nyitott a mentésben, ág `feat/jatek-j6a-aszteroida-kristaly`, GitHub-fej `9da0e8c25e8767ffba8f13d3489d4a6ba6e7843f`, frissítve 2026-11-19T03:16:03Z (UTC).
- **Nyitott review-szálak** — 0 nyitott, 3 lezárt. A `SpaceAsteroidQuiz.tsx` három szála az exportban lezárt.
- **Beolvasztás feltétele** — A `9a296216` helyi fej tartalmazza a PR-leírásban előkészített követő javításokat és újabb main-beolvasztást. Az `e21933f8` és `3ea10f06` lefedi a vak L1–L5 kör érintett játékmeneti és mérési javításait. Az egyeztetett fejre kell friss bizonyíték, különösen a SwiftShaderes mobilmérőre és a Kristály-válasz érintési útjára. A seed és az egyujjas mód utómunkája P-021.

### P-003 – Tornádó J7b – útelágazás és turbó

- **Azonosító** — P-003
- **Cím** — Tornádó J7b – útelágazás és turbó
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A játék használhatósága vagy a következő szelet függ tőle.
- **Eredeti utasítás / ötlet** — A Tornádó kérdése a pályán választható útjelzőkhöz és turbóhoz kapcsolódjon.
- **Forrás** — Játékszeletek végrehajtása 1803, átadó 14, scratchpad pr-j7b.md és review-jatekok/vak-j7b-jelentes-1.md 83–133. Kanban létrehozási dátum és táblastátusz — #83 (2026-11-17, `todo`), #87 (2026-11-17, `in_progress`).
- **Mi van már kész** — Mainen J7a #482 és a valódi tantárgy #487. Az ágon az útelágazás, turbó, szél és horgony viselkedése módosult.
- **Mi hiányzik** — Az ág J7b integrációja, a fekvő címke, kontraszt, determinisztikusság és a veszteségi teszt ellenőrzése. Az álló garázssáv-mérés külön fennmarad.
- **Folytatás helye** — feat/jatek-j7b-tornado-utelagazas @ 2b0b6720, jatek-j7b, JÁTÉK.
- **Következő lépés** — Hasonlítsd össze a távoli bc91a969 és helyi 2b0b6720 ágfejet, keresd vissza a PR-azonosítót, majd ellenőrizd a junctions.ts és a tesztintegritási leletek javításait.
- **Függőség / ütközés** — J7c, kapu-integritás.

### P-004 – Kockavadász mobil teljesítmény és perf panel

- **Azonosító** — P-004
- **Cím** — Kockavadász mobil teljesítmény és perf panel
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A játék használhatósága vagy a következő szelet függ tőle.
- **Eredeti utasítás / ötlet** — Kihajtott telefonon diagnosztizálni és csökkenteni kell a Kockavadász akadását.
- **Forrás** — Átadó 12, scratchpad review-kockavadasz/vak-504-jelentes-2.md és leltar-arva.md 88–89. Kanban létrehozási dátum és táblastátusz — #90 (2026-11-17, `in_progress`), #117 (2026-11-17, `todo`), #123 (2026-11-17, `todo`).
- **Mi van már kész** — A memoizálás mainen #491. A #504 ágon a világ és megjelenítés könnyítése, a 93d4e213 és 0219e4dd a panel elrendezését, érintését és képkockás mérését javítja. Korábbi kutatás 895c85d1, mérések 58969f07.
- **Mi hiányzik** — Az integráció és a kihajtott valódi telefon igazolása, az utolsó felülvizsgálati feltételek visszanézése.
- **Folytatás helye** — perf/kockavadasz-telefon-gyors @ 4dbc3a8b, kockavadasz-telefon-gyors, #504, ág saját docs/specs fájljai.
- **Következő lépés** — A BlockCraftQuiz.tsx és a #504 perf-tesztjei mellé olvasd be a mobil kutatást, majd külön igazold a panel kis fekvő és nagy hajlítható nézetét és a teljesítményjavulást.
- **Függőség / ütközés** — J3a átfedés, közös mobil mérő, nem commitolt próba wt504c.
- **PR-állapot** — #504 nyitott a mentésben, ág `perf/kockavadasz-telefon-gyors`, GitHub-fej `635e5d017c42c753dc7198ed60a0abd69b8ceaa8`, frissítve 2026-11-19T02:54:00Z (UTC).
- **Nyitott review-szálak** — 0 nyitott, 1 lezárt (`source/client/src/game-engine/perf/perfOverlay.ts`).
- **Beolvasztás feltétele** — A `4dbc3a8b` helyi fej `0219e4dd` javításával együtt értékelendő (GPU-idősor, nagy nézet, érintés átengedése). A PR-leírás korábbi futásaiban a teljes játék-körben volt Brain Rot-időzítési bukás, és az idézett független ítélet másik fejhez kötött. Az összevonásra kijelölt fejen kell zöld CI és friss ítélet. A tényleges telefonos gyorsulást külön, a perf panellel kell megmérni.

### P-005 – Szökőár – téma, sebesség, 3D modellek és olvashatóság

- **Azonosító** — P-005
- **Cím** — Szökőár – téma, sebesség, 3D modellek és olvashatóság
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A játék használhatósága vagy a következő szelet függ tőle.
- **Eredeti utasítás / ötlet** — A Szökőár új látványa és kontrollja mellett mobilon olvashatónak kell maradnia a kérdésnek.
- **Forrás** — Átadó 15, scratchpad pr-szokoar.md és review-jatekok/vak-szokoar-jelentes-2.md 66–80. Kanban létrehozási dátum és táblastátusz — #129 (2026-11-18, `todo`), #186 (2026-11-19, `todo`).
- **Mi van már kész** — Mainen J1a #483. Az ág kijelzést és hangot módosít, a scratchpad vak visszanézése az 577c9945 fejre IGEN. A tulajdonos elfogadta a mért lassított teljesítményt.
- **Mi hiányzik** — Beolvasztás és a tényleges PR-fej ellenőrzése, valamint a leletek külön követése.
- **Folytatás helye** — fix/szokoar-tema-es-sebesseg @ 577c9945, szokoar-tema, ág saját docs/specs párja.
- **Következő lépés** — A TsunamiScene3D.tsx és az ág mobiltesztjeiben ellenőrizd a játékos láthatóságát, a hosszú kérdést és az előtöltést. Tartsd külön a későbbi optimalizálást.
- **Függőség / ütközés** — J1b/c, jobbkezes joystick, hang-előmelegítés.

### P-006 – Joystick jobb kézre

- **Azonosító** — P-006
- **Cím** — Joystick jobb kézre
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — A joystick és a fontos vezérlők elhelyezése igazodjon a jobb kézhez.
- **Forrás** — Átadó 15, scratchpad leltar-2026-11-18.md, kanban #178.
- **Mi van már kész** — Az fc012178 a Tornádó őrt a kezesség-gombok megszüntetéséhez igazította. Mainen a #456 csak joystick-reakció javítás.
- **Mi hiányzik** — A jobb oldali elrendezés integrálása és valós érintőteszt, a Szökőár súgóütközésével együtt.
- **Folytatás helye** — feat/joystick-jobb-kez @ fc012178, joystick-jobb, docs/specs/2026-11-18-joystick-jobb-kez.md és párja az ágon.
- **Következő lépés** — Az ág diffjéből ellenőrizd a jobb oldalt minden érintett játékban és a fekvő/álló viewportban.
- **Függőség / ütközés** — Szökőár témaváltás, közös HoldButton/VirtualJoystick.

### P-007 – Főoldali kabala kompakt sávja

- **Azonosító** — P-007
- **Cím** — Főoldali kabala kompakt sávja
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — egyéb
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — A főoldali kabala kis helyen, mért költséggel jelenjen meg.
- **Forrás** — Átadó 15, scratchpad leltar-arva.md.
- **Mi van már kész** — A feat/kabala-fooldal 80f4c6cc mérési anyagot és képeket tartalmaz. A kiserlet/kabala-maki bc3196e0 ettől külön álló prototípus.
- **Mi hiányzik** — A főoldali változat kiadási és tulajdonosi állapotának lezárása, a maki prototípus sorsának tisztázása.
- **Folytatás helye** — feat/kabala-fooldal @ 80f4c6cc, kabala-fooldal, kiserlet/kabala-maki @ bc3196e0, kabala-maki, ág saját docs/specs párja.
- **Következő lépés** — Összevetéskor nézd a főoldali diffet, a kompakt sáv mérését, méretét és betöltését. A prototípust külön mutasd be.
- **Függőség / ütközés** — A két ág eszközei ütközhetnek.

### P-008 – Kuponos Brain Rot közös ismétlése és tesztutómunka

- **Azonosító** — P-008
- **Cím** — Kuponos Brain Rot közös ismétlése és tesztutómunka
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Megerősítés után célzott, önálló javításként ütemezhető.
- **Eredeti utasítás / ötlet** — A Brain Rot kuponos tételei a közös ismétlési viselkedést kövessék.
- **Forrás** — Kanban #95/#109/#133/#141, JÁTÉK, scratchpad review-485/jelentes-kupon-atallas.md és leltar-arva.md:22–23. Kanban létrehozási dátum és táblastátusz — #95 (2026-11-17, `todo`), #109 (2026-11-17, `todo`), #133 (2026-11-18, `todo`), #141 (2026-11-18, `todo`).
- **Mi van már kész** — A közös director a BrainRotSteal.tsx-en már látszik, a #497 a főágon külön pacing burkolót tett köré. Az ági diff ezt a későbbi burkolót veszti el, a két régi ág önmagában ezért nem folytatási alap.
- **Mi hiányzik** — A #95 pontos ütemezési és ismétlési kulcsának szerződéses igazolása, illetve a `returnCapReached` komment és a J10/J5a hivatkozás visszaellenőrzése.
- **Folytatás helye** — Main #485/#497, régi referenciák fix/brainrot-kozos-kupon @ 87d3d5d8 és fix/brainrot-e2e-idozites @ 50c31a29, jatek-j5a, JÁTÉK.
- **Következő lépés** — A main BrainRotSteal.tsx és brainrot-play.spec.ts útján kezdd, a két régi ág diffjét csak a regressziós tesztekhez használd. Mérd a ketrecbe visszalépést és ismétlési időt.
- **Függőség / ütközés** — Közös kupon-visszatérés és J5b.

### P-009 – Kérdésbank S2–S3, lenyomat és mérhetőség

- **Azonosító** — P-009
- **Cím** — Kérdésbank S2–S3, lenyomat és mérhetőség
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — A játék csak a szükséges kérdéseket töltse le, új látogatáskor használja a korábbi választ, ahol lehet.
- **Forrás** — docs/specs/2026-11-17-kerdesbank-karcsusitas.md és párja, kanban #71/#101/#149. Kanban létrehozási dátum és táblastátusz — #71 (2026-11-16, `todo`), #101 (2026-11-17, `in_progress`), #149 (2026-11-18, `todo`).
- **Mi van már kész** — #478 kivette a teljes lecke-beolvasást, #502 ETag és évfolyamszűrés a routes.ts:1235–1241-nél, #491 stabil hook.
- **Mi hiányzik** — Létrehozás/törlés invalidálásának, Vercel tömörítésnek, építési mérésnek és a kliens migráció további szeleteinek igazolása.
- **Folytatás helye** — perf/kerdesbank-karcsusitas-s1 @ 68286951, kerdesbank-karcsu, #502, fenti tervpár.
- **Következő lépés** — Kövesd a gameQuizBankResponse hívóit, készíts létrehozás/törlés tesztet, ellenőrizd a méretet és a változatok ETag-jét.
- **Függőség / ütközés** — Kockavadász sebesség és szerveroldali nagy beolvasások.

### P-010 – Kuponos ismétlés – határidő és visszatérés

- **Azonosító** — P-010
- **Cím** — Kuponos ismétlés – határidő és visszatérés
- **Állapot** — NEM VALÓSULT MEG
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A játék használhatósága vagy a következő szelet függ tőle.
- **Eredeti utasítás / ötlet** — A hibázott kuponos tétel a menetben is újra előkerüljön, kiszámítható határon belül.
- **Forrás** — Kanban #108/#136 és scratchpad review-485/jelentes-kupon-atallas.md. Kanban létrehozási dátum és táblastátusz — #108 (2026-11-17, `todo`), #136 (2026-11-18, `todo`).
- **Mi van már kész** — A közös rendezésben LATE_RETURN_MAX = 10 és a késési csoportozás látszik a questionDirector.ts:140,241 soron.
- **Mi hiányzik** — A nyolc és a 10–12 tételes eset szerződése, valamint tényleges felső korlát és visszakerülés.
- **Folytatás helye** — Main, JÁTÉK, külön ág és PR nem igazolt.
- **Következő lépés** — A questionDirector.ts tiszta bemenetén futtasd a jegyek seed-eseteit és külön ellenőrizd a hosszabb sorban a lejárt kupon és hibás válasz együttállását.
- **Függőség / ütközés** — Brain Rot közös átállása.

### P-011 – Szólétra – telefonos felirat, tárgyrag és versenyjelölők

- **Azonosító** — P-011
- **Cím** — Szólétra – telefonos felirat, tárgyrag és versenyjelölők
- **Állapot** — NEM VALÓSULT MEG
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — A Szólétra felirata legyen olvasható telefonon és természetes magyar mondatot mutasson.
- **Forrás** — Átadó 24–27, 2026-11-19.
- **Mi van már kész** — A #498 és #500 javított az olvashatóságon. A WordLadderHuEn.tsx:1744 árnyékol, 808 és 1816 értéke még sablonból ragoz. A main 1687–1693 stílusa a címke és pont színét egyezően adja meg.
- **Mi hiányzik** — A szövegárnyék és a két hibás tárgyragos mondat javítása. A jelölő helyzete és a hárompontos kérdés készüléken ellenőrizendő.
- **Folytatás helye** — Main, WordLadderHuEn.tsx, #498/#500 előzmény, új ág vagy PR nem igazolt.
- **Következő lépés** — Ellenőrizd a győzelmi és előzési feliratot az összes rivális névre, a kérdéskártyát és haladássávot keskeny telefonon. Az átadó szerint ez kerüljön a sor végére.
- **Függőség / ütközés** — Korábbi Szólétra olvashatósági javítások.

### P-012 – Szólétra tempó, XP és pacing-felosztás

- **Azonosító** — P-012
- **Cím** — Szólétra tempó, XP és pacing-felosztás
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — A Szólétra tempója, a jutalom és a ranglista szerződése legyen következetes és automatikusan ellenőrizhető.
- **Forrás** — Kanban #112/#148, docs/specs/2026-11-17-szoletra-olvashatosag.md, 69547067. Kanban létrehozási dátum és táblastátusz — #112 (2026-11-17, `todo`), #148 (2026-11-18, `todo`).
- **Mi van már kész** — A nyugodt tempó és a célszókiemelés #498, a statisztika és fogás-panel #500. A forrás szerint 2026-11-18 a nyugodt tempó azonos XP-t ad.
- **Mi hiányzik** — A tiszta időzítés és localStorage szétválasztása, döntés a ranglisták/tempóajánlás szétválasztásáról, ha még aktuális.
- **Folytatás helye** — fix/szoletra-olvashatosag @ 69547067, szoletra-olvashatosag, #498, fenti pár.
- **Következő lépés** — A pacing.ts használatát vedd a determinizmus-őr alá, az XP szabályt igazítsd a későbbi döntéshez, és ellenőrizd a 40/40 botmérés értelmezését.
- **Függőség / ütközés** — #112 XP-javaslatát a későbbi döntés felülírja.

### P-013 – J1b/c – Szökőár folytatása

- **Azonosító** — P-013
- **Cím** — J1b/c – Szökőár folytatása
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — A Szökőár J1a után folytassa a pályahurkot, a versenyt és a hosszú kérdés javítását.
- **Forrás** — Játékszeletek végrehajtása 948–1162, kanban #94. Kanban létrehozási dátum és táblastátusz — #94 (2026-11-17, `todo`).
- **Mi van már kész** — J1a #483 mainen. A témasebesség-köteg külön ágon halad.
- **Mi hiányzik** — A tétlen időzítő, láthatatlan akadálytakarítás, hosszú kérdés miatti főszálmérés és a J1b/c fennmaradó játékszabályai.
- **Folytatás helye** — JÁTÉK, külön J1b/c ág vagy PR nem igazolt.
- **Következő lépés** — A J1b/c elfogadását vedd át a végrehajtásból, hasonlítsd a Tsunami motor és a kérdésablak main/ág változatát.
- **Függőség / ütközés** — Szökőár témaváltása és közös mobil mérő.

### P-014 – J2b, J3b/c, J6b, J7c és játékhullám-zárás

- **Azonosító** — P-014
- **Cím** — J2b, J3b/c, J6b, J7c és játékhullám-zárás
- **Állapot** — NEM VALÓSULT MEG
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — A már elindult játékfejlesztések maradék alhurkai és a közös zárás készüljenek el.
- **Forrás** — Játékszeletek végrehajtása 1162,1249,1680,1803,1906,1980, képernyőlista 2026-11-16. Kanban létrehozási dátum és táblastátusz — #93 (2026-11-17, `todo`), #104 (2026-11-17, `todo`).
- **Mi van már kész** — J2a #454, J7a #482 és J4a/b #451/#466 mainen, három további mag ágakon.
- **Mi hiányzik** — A későbbi játékszeletek, megmaradt mobil és hosszú kérdés esetek, J8 fiókhoz kötődő fejlődés és J9 zárási feltételek a végrehajtás szerint.
- **Folytatás helye** — JÁTÉK, az alapágak a J3a/J6a/J7b tételeknél.
- **Következő lépés** — Bontsd külön szeletekre a terv elfogadási pontjai szerint. J3c-ben mérd a kérdés alá eső köveket, J7c-ben a levél-komponens jelentőségét, J9-ben a teljes mobil mátrixot.
- **Függőség / ütközés** — J3a/J6a/J7b, fiók és fejlődés.

### P-015 – J5b – Brain Rot rivális, arany lény és visszalopás

- **Azonosító** — P-015
- **Cím** — J5b – Brain Rot rivális, arany lény és visszalopás
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — Legyen aktív rivális és önálló visszalopási játék, kiszámítható szándékérzékeléssel.
- **Forrás** — Játékszeletek végrehajtása 1467–1679, kanban #88. Kanban létrehozási dátum és táblastátusz — #88 (2026-11-17, `todo`).
- **Mi van már kész** — A Lény-aréna, ketrec és óra #485/#497 a mainen.
- **Mi hiányzik** — Rivális, Visszalopás-párbaj, Arany lény, fordulók, Tolvajkirály. A véletlen válasz döntése és a ketrec peremtesztek hátravannak.
- **Folytatás helye** — JÁTÉK, ág és PR nem igazolt.
- **Következő lépés** — A BrainRotSteal.tsx és brainrot-play.spec.ts tesztjein vedd fel a konkrét peremátlépést és a szándékos megállás esetét, a küszöböket seedelt próbával mérd.
- **Függőség / ütközés** — Kupon átállás, közös két óra, tulajdonosi döntés.

### P-016 – Játékmotor – kérdéssáv, főszál és órák

- **Azonosító** — P-016
- **Cím** — Játékmotor – kérdéssáv, főszál és órák
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — A közös motor simább legyen, egységes kezelőszervekkel és alacsony képkockaszámon is követhető döntési idővel.
- **Forrás** — Játékszeletek végrehajtása 169, kanban #86/#98/#102/#114/#134/#199. Kanban létrehozási dátum és táblastátusz — #86 (2026-11-17, `todo`), #98 (2026-11-17, `todo`), #102 (2026-11-17, `todo`), #114 (2026-11-17, `todo`), #134 (2026-11-18, `todo`), #199 (2026-11-19, `todo`).
- **Mi van már kész** — Közös UI #446/#450 és közös kör #457 a mainen. A questionDirector.ts még külön válaszablakot kezel.
- **Mi hiányzik** — Első hosszú kérdés költsége, szünetcél mérete, hajlítható mérő/másodpercenkénti render, lassú képkockán az órák egyeztetése, burkolt ablak és vezérlő szélső esetei.
- **Folytatás helye** — JÁTÉK és source/client/src/game-engine/play, több játék érintett.
- **Következő lépés** — A közös mobil minőségtesztben 827×896 és 896×827 nézetet mérj, a questionUi.ts/flow.ts óráját pedig ugyanazon lassított bemeneten hasonlítsd a loop.ts-hez.
- **Függőség / ütközés** — Szökőár, Szólétra, Brain Rot, Aszteroida.

### P-017 – Éles játékképernyők és új kis leletek

- **Azonosító** — P-017
- **Cím** — Éles játékképernyők és új kis leletek
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Megerősítés után célzott, önálló javításként ütemezhető.
- **Eredeti utasítás / ötlet** — Az éles játékképernyők és mobil interakció apró vizuális hibáit ellenőrizni kell.
- **Forrás** — Kanban #64/#74/#111/#178/#196–198, scratchpad vak-szokoar/kovetojegyek-577c.md 5–22. Kanban létrehozási dátum és táblastátusz — #64 (2026-11-16, `todo`), #74 (2026-11-17, `todo`), #111 (2026-11-17, `todo`), #178 (2026-11-18, `todo`), #196 (2026-11-19, `todo`), #197 (2026-11-19, `todo`), #198 (2026-11-19, `todo`).
- **Mi van már kész** — Vihargarázs alapjait #467, Kockavadász memoizálást #491 javította. A Szökőár-ágban a többi lelet igazolására helyi jegy van.
- **Mi hiányzik** — Súgó/joystick fedés, lassú modellbetöltés és szélső figura, WebGL-vesztés, nyugalom-jelző, profilozás. Külön ellenőrizendő a Tornádó buborék, Brain Rot felirat, Kockavadász nyitókamera, Neon célütközés, párbaj gomb és szünet alatti render.
- **Folytatás helye** — Szökőár helyi ága 577c9945 és JÁTÉK, egyébként main.
- **Következő lépés** — A jegyeket egyesével próbáld reprodukálni a játékoldalon. Használd a game-meta-quality.spec.ts nézeteit és külön WebGL-vesztési esetet.
- **Függőség / ütközés** — Szökőár, Kockavadász, Neon, közös motor.

### P-018 – Online párbaj JM3b és csoportos mód

- **Azonosító** — P-018
- **Cím** — Online párbaj JM3b és csoportos mód
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A játék használhatósága vagy a következő szelet függ tőle.
- **Eredeti utasítás / ötlet** — A kétfős párbaj alapjából közös, 3–4 játékos mód induljon megbízható visszavágóval.
- **Forrás** — Játékszeletek végrehajtása 2249–2402, kanban #52/#73/#97. Kanban létrehozási dátum és táblastátusz — #52 (2026-11-16, `in_progress`), #73 (2026-11-16, `todo`), #97 (2026-11-17, `todo`).
- **Mi van már kész** — JM3a és utójavítás #464/#476 mainen, valós idejű csatorna #452 alapból kikapcsolt móddal.
- **Mi hiányzik** — 3–4 fős szoba és host/join/visszavágó, maradók bennragadása kilépéskor, JM4–JM6 játékmódok és a szerveres ellenőri leletek.
- **Folytatás helye** — Main, JÁTÉK, room-machine.ts és kapcsolódó tesztek.
- **Következő lépés** — Vedd fel a kilépő résztvevő utáni új visszavágót a szoba állapotgép tesztjébe, majd a JM3b saját elfogadási feltételeit valósítsd meg.
- **Függőség / ütközés** — Itt alkalmazandó a #97 visszaellenőrzés az admin próba előtt.

### P-019 – JM7c-2 és JM8–JM11 – fiókátmenet, jutalom és közösségi réteg

- **Azonosító** — P-019
- **Cím** — JM7c-2 és JM8–JM11 – fiókátmenet, jutalom és közösségi réteg
- **Állapot** — RÉSZBEN
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A játék használhatósága vagy a következő szelet függ tőle.
- **Eredeti utasítás / ötlet** — A régi és új fiókbelépési út kapcsolódjon, a jutalom és közös mód szerver-ellenőrzéssel bővíthető legyen.
- **Forrás** — Játékszeletek végrehajtása 2769,2829–2896 és későbbi JM-fejezetek, kanban #62/#75/#96. Kanban létrehozási dátum és táblastátusz — #62 (2026-11-16, `todo`), #75 (2026-11-17, `todo`), #96 (2026-11-17, `todo`).
- **Mi van már kész** — JM7a/b és JM7c-1 #445/#449/#462, fiók belépő #472, tiltás és kezelés #471/#475 a mainen.
- **Mi hiányzik** — Régi nem admin profil kapcsolása és a nyilvános login átvezetése, JM8 hiteles jutalom, JM9–11 közösségi/fiók-szeletek, tiltás holtpont és visszaváltási DB-teszt, szerveres leletek visszaellenőrzése.
- **Folytatás helye** — Main, JÁTÉK, source/server fiókmodul, docs/jatek-fiok-uzemeltetes.md.
- **Következő lépés** — A JM7c-2 migráció és auth mátrix tesztjével kezdj, majd ellenőrizd a profiladatok útját és a tiltás tranzakcióit. A JM8–11 szeleteket a terv sorrendjében folytasd.
- **Függőség / ütközés** — Alias-egyediségi döntés és éles funkciókapcsolók.

### P-020 – Játékosfiók Gmail-alias egyedisége

- **Azonosító** — P-020
- **Cím** — Játékosfiók Gmail-alias egyedisége
- **Állapot** — TULAJDONOSI DÖNTÉSRE VÁR
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — Egy postafiók aliasai ne szaporíthassák a ranglistás játékosprofilt, ha a tulajdonos ezt az egyediséget választja.
- **Forrás** — Kanban #77, #475 utóreview. Kanban létrehozási dátum és táblastátusz — #77 (2026-11-17, `todo`).
- **Mi van már kész** — A játékosfiók #445/#449 a mainen, a jegy új oszlopot és egyedi indexet javasol.
- **Mi hiányzik** — A közös postafiókra történő összevonás és a meglévő ütközések kezelése tulajdonosi döntést igényel.
- **Folytatás helye** — JÁTÉK, fiókséma és migráció, ág/PR nem igazolt.
- **Következő lépés** — Készíts szintetikus példatáblát és követelményt a normalizáláshoz. A meglévő fiókokhoz csak jóváhagyott stratégia után nyúlj.
- **Függőség / ütközés** — JM7c-2 és ranglista.

### P-021 – Aszteroida utómunka és budapesti napi seed

- **Azonosító** — P-021
- **Cím** — Aszteroida utómunka és budapesti napi seed
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — játékok
- **Prioritás-javaslat** — P2. Megerősítés után célzott, önálló javításként ütemezhető.
- **Eredeti utasítás / ötlet** — A kristályos játék követő köre foglalkozzon a teljesítménnyel, balkezes és többujjas használattal, valamint napi váltással.
- **Forrás** — Kanban #85, scratchpad review-j6a/vak-486-jelentes-1.md. Kanban létrehozási dátum és táblastátusz — #85 (2026-11-17, `todo`).
- **Mi van már kész** — A #486 külön ágon a kristályt hozza, a halasztott K.4 elemeket a jegy tételesen őrzi.
- **Mi hiányzik** — Objektum-pool, InstancedMesh, 4× CPU, kétujjas és tükrözött vezérlés, jelvényszöveg, valamint napi seed Budapest szerint. Egyujjas mód külön döntést igényel.
- **Folytatás helye** — JÁTÉK, feat/jatek-j6a-aszteroida-kristaly @ 9a296216, #486.
- **Következő lépés** — A kristálymag után ellenőrizd az egyes K.4 pontokat külön. Napi váltásnál a Budapest éjfél és óraátállás legyen teszteset az Aszteroidában és Matekban.
- **Függőség / ütközés** — J6a és közös mobil, egyujjas döntés.

### P-022 – Játékosfiók és többjátékos mód élesítési sorrendje

- **Azonosító** — P-022
- **Cím** — Játékosfiók és többjátékos mód élesítési sorrendje
- **Állapot** — TULAJDONOSI DÖNTÉSRE VÁR
- **Terület** — játékok
- **Prioritás-javaslat** — P1. A függő döntés adatkezelést vagy kiadási feltételt érint.
- **Eredeti utasítás / ötlet** — A belépők és többjátékos mód korlátozott sorrendben legyen kipróbálva az általános élesítés előtt.
- **Forrás** — docs/handoffs/2026-11-16-jatekelmeny-fiok-retro.md:137–156, memória game-multiplayer-decisions.md és game-accounts-student-self-registration.md.
- **Mi van már kész** — Az alap flag és bejárat #445/#452/#472, JM3a #464/#476. A riport korábbi éles állapotot rögzít.
- **Mi hiányzik** — Az aktuális éles kapcsolóállapot és a pilot időpontja igazolatlan. A tanulóönregisztrációhoz tartozó feltételeket az élesítés előtt egyeztetni kell.
- **Folytatás helye** — Main, JÁTÉK, docs/jatek-fiok-uzemeltetes.md.
- **Következő lépés** — Ellenőrizd az üzemeltetési beállítást jóváhagyott hozzáféréssel. A forrás szerinti sorrendben először admin-próba, majd korlátozott és nyilvános engedélyezés.
- **Függőség / ütközés** — JM3b és G-A/G-B leletek, tulajdonos.

### P-023 – Adatvédelmi címőr utáni történetdöntés

- **Azonosító** — P-023
- **Cím** — Adatvédelmi címőr utáni történetdöntés
- **Állapot** — TULAJDONOSI DÖNTÉSRE VÁR
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — A publikus forrásból már eltávolított címadat előzményeinek sorsáról külön szülessen döntés.
- **Forrás** — Kanban #57, docs/specs/2026-11-16-valodi-cimek-ki.md. Kanban létrehozási dátum és táblastátusz — #57 (2026-11-16, `done`).
- **Mi van már kész** — A követett fájlok tisztítása és őr #474, szintetikus kivétel #479 a mainen.
- **Mi hiányzik** — A publikus git-előzmények és korábbi terjesztett példányok sorsa, ha a tulajdonos kéri.
- **Folytatás helye** — Main, #474/#479, fenti tervpár.
- **Következő lépés** — Határozd meg az érintett előzmények körét hozzáférés-ellenőrzött helyen, majd kérj döntést a megőrzés vagy szervezett átírás között.
- **Függőség / ütközés** — Destruktív történetátírás csak külön engedéllyel.

### P-024 – Leckeeredmény e-mail S1b – félbehagyott kvíz

- **Azonosító** — P-024
- **Cím** — Leckeeredmény e-mail S1b – félbehagyott kvíz
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A kiadott lecke helyességét, értékelését vagy az eredmény kézbesítését érinti.
- **Eredeti utasítás / ötlet** — A lecke kvízeredménye véglegesítéskor és félbehagyáskor is jusson el az eredménylevélbe az iskolai hálózatok kezelése mellett.
- **Forrás** — docs/specs/2026-11-17-eredmeny-email-kviz.md és párja, átadó 11, scratchpad dev510/pr-510-leiras.md és review-lecke-hibak/vak-510-jelentes-5.md. Kanban létrehozási dátum és táblastátusz — #119 (2026-11-17, `todo`), #135 (2026-11-18, `todo`), #137 (2026-11-18, `todo`), #138 (2026-11-18, `todo`), #139 (2026-11-18, `todo`).
- **Mi van már kész** — Mainen atomi foglalás #495 és végleges kvízlevél S1a #496. A #510 ágon késleltetett pillanatkép, véglegesítés, deduplikálás, leállításkori kiküldés, R18 tartós jelző 84ae9040 és R19 újrapróba cd05b7ea.
- **Mi hiányzik** — S1b integráció. Iskolai NAT mögött a tulajdonos által kért tanulóhoz kötött keret és a többpéldányos/leállítási eset állapota külön visszaellenőrizendő.
- **Folytatás helye** — fix/eredmeny-email-kviz @ 6b5f2e68, eredmeny-email-kviz, #510, PR-fej külön a PR-állapot mezőben.
- **Következő lépés** — A lesson-result-email.ts, lesson-result-limits.ts és resultReport.ts útját együtt ellenőrizd. Külön teszt a hálózatváltás, azonos iskola két tanulója és eltérő folyamatba érkező véglegesítés esetére.
- **Függőség / ütközés** — #189–191 külön, tulajdonosi döntés a tanulói keretről már IGEN.
- **PR-állapot** — #510 nyitott a mentésben, ág `fix/eredmeny-email-kviz`, GitHub-fej `f5a1e7127389939104749b54d711c0676b224997`, frissítve 2026-11-19T09:52:04Z (UTC).
- **Nyitott review-szálak** — 1 nyitott, 7 lezárt. `source/server/lesson-result-email.ts:119` a mentésben — a `roundFinalized()` átmeneti hibája a részleges levél küldése előtti ellenőrzésben a levelet újrapróba nélkül elveszítheti. A helyi `cd05b7ea` ugyanazon ellenőrzésen át egyszer újrapróbál. A regressziós teszt commitja `772962b3`. A javítás ott van a `6b5f2e68` helyi fejben.
- **Beolvasztás feltétele** — A helyi tartós jelzőt és R19-javítást tartalmazó fejet kell a PR-ra vinni, az adatbázishibás és véglegesítés–újrapróba versenyhelyzetre friss bizonyítékkal, majd a szálat lezárni. A kézbesítési és eszközös maradék P-025.

### P-025 – Leckeeredmény e-mail – tartós jelző és kézbesítési szélek

- **Azonosító** — P-025
- **Cím** — Leckeeredmény e-mail – tartós jelző és kézbesítési szélek
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A kiadott lecke helyességét, értékelését vagy az eredmény kézbesítését érinti.
- **Eredeti utasítás / ötlet** — Megszakítás vagy szolgáltatóválasz-hiba után is legfeljebb a megfelelő levél menjen ki.
- **Forrás** — Kanban #127/#128/#189–191, scratchpad review-lecke-hibak/vak-510-jelentes-5.md:34–72. Kanban létrehozási dátum és táblastátusz — #127 (2026-11-17, `todo`), #128 (2026-11-17, `todo`), #189 (2026-11-19, `todo`), #190 (2026-11-19, `todo`), #191 (2026-11-19, `todo`).
- **Mi van már kész** — Main #495 foglal. #510 ág lesson-result-email.ts:267–283 tartós jelzőt használ, a rövid életideje és a dedikált kulcs tere ellenőrizhető.
- **Mi hiányzik** — A 24 órás és hét napos ablak közti eltérés, a jelzőírás hibája utáni ablak és kulcsütközés. Kézbesített, de elveszett szolgáltató-válasz és errorClass napló külön ellenőrizendő.
- **Folytatás helye** — fix/eredmeny-email-kviz @ 6b5f2e68, #510, 2026-11-17-eredmeny-email-kviz tervpár.
- **Következő lépés** — Készíts óravezérelt tesztet 24 órán túlra, jelzőírás-hibára, szerver-újraindításra és elveszett eredményre. Őrizd meg az atomi foglalást.
- **Függőség / ütközés** — S1b integráció és szolgáltatói viselkedés.

### P-026 – Tananyag címében az osztály – keresési szélek

- **Azonosító** — P-026
- **Cím** — Tananyag címében az osztály – keresési szélek
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — Az osztályfelirat és a tananyagkereső a ragos, tartományos és többértelmű címeket is értse.
- **Forrás** — docs/specs/2026-11-17-tananyag-cim-osztaly.md és párja, kanban #142. Kanban létrehozási dátum és táblastátusz — #116 (2026-11-17, `todo`), #142 (2026-11-18, `todo`).
- **Mi van már kész** — Main #494 főoldal/admin cím és kereső, e5db9c9b ági többtagú minta. A közös kód source/shared/material-title.ts.
- **Mi hiányzik** — A képzős osztály, a kötőjeles tartomány és a whitespace hamis találatainak #142 szerinti tesztje és javítása.
- **Folytatás helye** — fix/tananyag-cim-osztaly @ e5db9c9b, tananyag-cim-osztaly, #494 előzmény.
- **Következő lépés** — A material-title.ts-ben külön kezeld a tartományt és a valódi felsorolás-elválasztót. Teszteld az aktív szűrőt üres és meglévő találatnál.
- **Függőség / ütközés** — Korábbi évfolyamjelölés #459/#465/#468.

### P-027 – Pontozó – polinom, tagolás, rubrika és kérdésmásolás

- **Azonosító** — P-027
- **Cím** — Pontozó – polinom, tagolás, rubrika és kérdésmásolás
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A kiadott lecke helyességét, értékelését vagy az eredmény kézbesítését érinti.
- **Eredeti utasítás / ötlet** — A pontozó a matematikai alakot és a választ helyesen értelmezze, a szöveg nem releváns részére ne adjon pontot.
- **Forrás** — Kanban #121/#122/#130/#132, docs/specs/2026-11-17-nyilt-feladat-rovid-valasz.md. Kanban létrehozási dátum és táblastátusz — #121 (2026-11-17, `todo`), #122 (2026-11-17, `todo`), #130 (2026-11-18, `todo`), #132 (2026-11-18, `todo`).
- **Mi van már kész** — #493 általános írásjel-kezelés, #509 rövid válasz a mainen. A source/shared/answer-value.ts:184–185 a tagoló szóköz szabályát még külön kezeli.
- **Mi hiányzik** — A polinom végpontozása, két számeredmény elkülönítése, igen/nem és szám rubrika hamis részpontjai, kérdésszöveg megismétlésének elutasítása.
- **Folytatás helye** — Main, source/shared/polynomial.ts és answer-value.ts, #493/#509 előzmény.
- **Következő lépés** — Negatív és pozitív szintetikus feladatpárokon futtasd az összehasonlítót. A tizedespont, valódi ezrestagolás és tényleges tömör helyes válasz külön őrzendő.
- **Függőség / ütközés** — S7 pontozási prompt és determinisztikus plafon.

### P-028 – Stúdió S1–S3 és SK1c – forráshű vizuálok teljes élesítése

- **Azonosító** — P-028
- **Cím** — Stúdió S1–S3 és SK1c – forráshű vizuálok teljes élesítése
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A kiadott lecke helyességét, értékelését vagy az eredmény kézbesítését érinti.
- **Eredeti utasítás / ötlet** — A lecke tartsa meg a forrás tanításhoz szükséges vizuális szerkezetét, és jelezze a tényleges kihagyásokat.
- **Forrás** — TGM 439–469, 512 és 578–579, kanban #146/#157/#163, átadó 9. Kanban létrehozási dátum és táblastátusz — #146 (2026-11-18, `in_progress`), #157 (2026-11-18, `done`), #163 (2026-11-18, `todo`).
- **Mi van már kész** — f756588c #515: vizuális leltár, fedettség és S2a render. source-coverage-gate.ts:321, source-visuals-flag.ts:11–13. A flag alapból ki van.
- **Mi hiányzik** — S2 hátralévő megjelenítők és kompatibilitás, S3a/b pótlás és enforce, SK1c hamis bukás/elfogadás, újramérés és üres ábra kezelése. Tényleges mért élesítési bizonyíték.
- **Folytatás helye** — feat/tgm-s2a-megjelenitok @ 7ea69555, tananyag-gyartas-minoseg-8fa0b9, #515 már main, TGM.
- **Következő lépés** — A gate és renderer teszteket vedd alapul. Rakd egymás mellé az SK1c E1–E6/J1–J8 feltételeit, az S10 hiánytáblát és a tényleges blokk-kimenetet.
- **Függőség / ütközés** — S10 első mérés, SK3.
- **Oldalszál és main** — Az `01-forrasbeolvasas-kod.md:106–130` és `02-minta-pdf-hianytabla.md:219–231` veszteségi pontjai az S10 alapvonalához tartoznak. A #515 az S1a, S1b + SK1, SK1b és S2a láncot egyben integrálta. A `source/client/src/lesson-runtime/blocks/source-visuals.tsx` S2a-megjelenítői mellé S2b-ben döntési fa és képes kártya kell (TGM végrehajtás 355–418). S3a a forrás és az ábrák állomását köti össze, az eldobás okát rögzíti. S3b a szókeretet, a szerzőt, a lektort és a bankot igazítja a forrástételekhez (419–543). Az SK1c-hez a kis leltár lényegi tételének elfedését is ellenőrizni kell (#163, `00-tulajdonosi-dontesek.md:12–25`). A kapcsoló és az `enforce` döntése P-066.

### P-029 – Stúdió S4 és SK3 – számolási ellenőrzés és költségjelzés

- **Azonosító** — P-029
- **Cím** — Stúdió S4 és SK3 – számolási ellenőrzés és költségjelzés
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A kiadott lecke helyességét, értékelését vagy az eredmény kézbesítését érinti.
- **Eredeti utasítás / ötlet** — A gyártás gépileg ellenőrizze a számolást, a futásokat és a próbakeretet a rögzített döntések szerint.
- **Forrás** — TGM S4, S4b:300 és SK3:470, kanban #145 J1 és #146. Kanban létrehozási dátum és táblastátusz — #145 (2026-11-18, `todo`), #146 (2026-11-18, `in_progress`).
- **Mi van már kész** — A vizuális kapu #515 mainen. Az aritmetikai eszköz és korábbi bankbekötés már ott van a source/server/studio/experience-builder.ts:21,797 és source/tests/c8-szamolas-kapu.test.ts alatt.
- **Mi hiányzik** — Az S4 szerinti kiterjesztett aritmetikai őr és telemetria, idézethelyreállítás és az S4b hibák, egységes körszám/telemetria, futás- és napi költségjelzés, próba-keményplafon.
- **Folytatás helye** — TGM, source/server/studio és source/shared, dedikált ág/PR nem igazolt.
- **Következő lépés** — A tervben felsorolt arithmetic-claims.ts, outline-autofix.ts és engine.ts belépőit vesd össze mainnel, majd az elfogadási feltételeket egység- és próbafutásba kösd.
- **Függőség / ütközés** — D7 szerint éles költség csak jelez, próba megállhat. S10.
- **Oldalszál és main** — Az `04-prompt-audit-javitokorok.md:447–479` S4-be kerülő feladatai: számolási hamis riasztások (kitevő, index, arány, tartomány), meglévő idézet-áthelyező használata a modellkör előtt, zárt ábravilág-lista, szókeret-utasítás és a javítókör okainak job-kimenete. A TGM végrehajtás 544–601 írja le az átvételt. Az SK3 602–659 az egy helyről olvasott jelenlegi körkorlátokat, a futásonkénti és napi riasztást, valamint a próbakeret kemény stopját írja elő. A két további leállítási korlát kihagyásának döntése P-065.

### P-030 – Stúdió S5–S6 és SK2 – lecke változatossága

- **Azonosító** — P-030
- **Cím** — Stúdió S5–S6 és SK2 – lecke változatossága
- **Állapot** — NEM VALÓSULT MEG
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — Legyen mérhető változatosság a lecke egészében és külön a gyakorlófeladatokban.
- **Forrás** — TGM 330–350 és 489–495. Kanban létrehozási dátum és táblastátusz — #146 (2026-11-18, `in_progress`).
- **Mi van már kész** — A változatosság kívánt sorrendje és mérése a tervben van. A #515 diffjében a vizuális lánc található.
- **Mi hiányzik** — Változatos blokksorozat, kiosztott minta, ívkapu, fajtaarány, determinisztikus mérő és küszöb a terv szerint.
- **Folytatás helye** — TGM, a tervben kijelölt source/shared/variety-metrics.ts és hívói.
- **Következő lépés** — A meglévő blokkokra számold a terv metrikáit, majd a tervező és futás kimenetét egy minimális szerződéses próbára kösd.
- **Függőség / ütközés** — S4 alapok, SK2 mért alapvonal.
- **Oldalszál és main** — `03-valtozatossag-meres.md:378–459`, gépi táblák és helyi `variety-measure.mjs`: az első hét javaslatot viszi az S5a/b, S6a/b/c és SK2 (TGM végrehajtás 741–903). Ide tartozik a kódból kiosztott bátorítás, magozott módszersorrend és nyitás, fejezetív, `try`-minimum és rotáció, szerzői hang, ábrafajta-arány, majd újramérés. A tervezett `variety-metrics` és `lesson-section-shapes` útvonal a rögzített main fájllistájában nem szerepel. A nyolcadik javaslat (sávon belüli megjelenési variáció és új képkészlet) külön jelölt követő ötlet, a jelen körből kizárt (`00-tulajdonosi-dontesek.md:66`).

### P-031 – Stúdió S7 – rövid válasz promptja és döntőbíró plafon

- **Azonosító** — P-031
- **Cím** — Stúdió S7 – rövid válasz promptja és döntőbíró plafon
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — A szerző és a döntőbíró a tömör, de teljes nyílt válaszra a pontozó szabályát alkalmazza.
- **Forrás** — TGM 351–358, kanban #131. Kanban létrehozási dátum és táblastátusz — #131 (2026-11-18, `todo`), #146 (2026-11-18, `in_progress`).
- **Mi van már kész** — #509 mainen elfogad tartalmilag elégséges rövid választ. A D6 előfeltétel ezzel teljesült.
- **Mi hiányzik** — OPEN_ANSWER_RULES_HU 1. és 3. szabálya, S7b 0,5 determinisztikus plafon, mért regressziópróba.
- **Folytatás helye** — TGM, #509 + source/shared/answer-value.ts előzmény.
- **Következő lépés** — A terv szövegét a #509 pontozói szerződéséből vezesd le. A döntőbíró eseteit külön ellenőrizd a teljes és tömör válaszra.
- **Függőség / ütközés** — Pontozó szélső esetek és S7 döntés már rögzítve.
- **Oldalszál és main** — A fél pont tulajdonosi döntés (`00-tulajdonosi-dontesek.md:7`, átadó 30). A `source/shared/lesson-experience-score.ts:346` szabályszövege és annak gyártási hívói (`single-run/engine.ts:179,199`, `experience-builder.ts:37`) megvannak. Az `04-prompt-audit-javitokorok.md:334–422` és a TGM végrehajtás 904–963 szerint a szabály 1. és 3. pontját, a bankot és válaszkulcsírót, verziót és lenyomatot együtt kell igazítani a döntőbíró determinisztikus félpontos plafonjával.

### P-032 – Brit TTS S8c – hanggyártás és tartaléklánc utómunka

- **Azonosító** — P-032
- **Cím** — Brit TTS S8c – hanggyártás és tartaléklánc utómunka
- **Állapot** — RÉSZBEN
- **Terület** — TTS
- **Prioritás-javaslat** — P1. A mért lejátszási cél a hangkészlet és a megbízható tartalékút nélkül nem igazolható.
- **Eredeti utasítás / ötlet** — A leckéhez előre készüljön ellenőrzött brit hang, és a tartalék mód is működjön kis késéssel.
- **Forrás** — TGM 360–407, kanban #150/#165/#183, scratchpad review-lecke-hibak/vak-516-merge-jelentes.md. Kanban létrehozási dátum és táblastátusz — #150 (2026-11-18, `todo`), #165 (2026-11-18, `in_progress`), #183 (2026-11-19, `todo`).
- **Mi van már kész** — b7165a56 #516 a hangrangsor, tábla/lejátszó és előtöltés. source/shared/speech-chain.ts:24 maga az S8c utáni mérésre utal.
- **Mi hiányzik** — A lecketartalomból hangkészlet, gyártómodul, tényleges állomány és ellenőrzés. A nyolc nyitott lelet, a rangsor, az offline brit tartalék, a hangkey és a mért koppintási késés véglegesítése.
- **Folytatás helye** — feat/tgm-s8d-hang-eloetoltes @ 6bfd2d48, #516 main, TGM.
- **Következő lépés** — Vedd végig a kanban #150/#183 és az S8c feltételeit a speech-preload.test.ts, speech-chain.test.ts és tts-audio-db.integration.ts szerint. Engedélyezett külön körben mérd az előre gyártott hangot.
- **Függőség / ütközés** — S8a/b/d függvényei már mainen, fizetős gyártás külön engedélyezett kör.
- **Oldalszál és main** — A jegyzetben nyitott #516 és helyi csendkeret-javítás már beépült `b7165a56` alatt. A main `source/shared/speech-chain.ts:34,87–93` és `source/tests/speech-chain.test.ts:112` tartalmazza a `f023f197` 250 ms-os feltételét és annak egységtesztjét. Az átadó push/merge lépései történeti állapotot írnak. A `vak-hanglanc-4-jelentes.md:16–41` J1–J3 utómunka: a küszöb késői kemény hibánál kihagyhat még használható helyi hangot, az érték indoklásához mérés kell, a küszöb alatti/fölötti maradékokra lejátszós lefedés kell. Az átadó 27. sora további #183 feladatokat rögzít (korai szerverhibák cache-fejléce, valódi belépőponton mért sebességkorlát, negatív hangítélet, jegyzék újrapróba, admin-előnézet, aláírás és doksi).
- **S8c folytatás** — A #516 leírása és a TGM végrehajtás 1060–1141 szerint az előtöltés főági, a gyártómodul, a hangtár feltöltése és a visszaellenőrzés külön szelet. Előtte #183 és valódi iPad/Android próba, utána a tényleges hangindulás tipikus és legrosszabb idejének mérése. A `05-brit-tts.md:211–220` szolgáltató/tárhely/kör választása lezárt: ElevenLabs, adattáblában, csak leckék. A hangminta indítása, a végső hang és felhasználási feltételei még ellenőrizendők, a gyártás tulajdonosi indítású.

### P-033 – Stúdió S9, S10, SK4 és SK5 – kiadási őr és zárómérés

- **Azonosító** — P-033
- **Cím** — Stúdió S9, S10, SK4 és SK5 – kiadási őr és zárómérés
- **Állapot** — RÉSZBEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P1. A kiadott lecke helyességét, értékelését vagy az eredmény kézbesítését érinti.
- **Eredeti utasítás / ötlet** — A változás eredményét ismételhető mérés, publikálási őr és mutációs vizsgálat támassza alá.
- **Forrás** — TGM 307–329, 495–504, 191 és végrehajtási pár, kanban #146. Kanban létrehozási dátum és táblastátusz — #146 (2026-11-18, `in_progress`).
- **Mi van már kész** — A #515 hoz mérőszkriptet és forráskaput. A source/scripts/measure/single-run-measure.mts a diffben létezik.
- **Mi hiányzik** — Két minta eleje/vége összevetése, teljes analitikai skill és eljárás, kiadás előtti séma és hangőrzés, majd kapunként mutációs minimum és regressziós alapvonal.
- **Folytatás helye** — TGM, main, #515/#516 előzmény.
- **Következő lépés** — Az első S10 méréshez olvasd az SK3 próba feltételeit, rögzíts hiánytáblát, majd az SK4/SK5 átvételnél ellenőrizd a megállás és a mutációk kimenetét.
- **Függőség / ütközés** — SK3 után indulhat a mérés, SK1c/S3b és S8c függ.
- **Oldalszál és main — S10** — A `02-minta-pdf-hianytabla.md:63–186` és a `03-valtozatossag-meres.md:442–459` a két minta és a változatosság kiindulópontja. S10/0: gépi hiánytábla, két saját szavas fixture és próbafőkönyv. A `source/scripts/measure/` main-fájllistáján a `single-run-measure.mts` létezik, a tervezett `source-gap-table.mts` és `trial-ledger.mts` hiányzik. S10/1: S2b és S3 megnevezett leleteinek lezárása, SK3 és száraz futás után két mérés és legfeljebb két tartalék elkülönített, eldobható környezetben, összesen legfeljebb 30 USD. Kell a hiánytábla, a renderképek és telemetria, lefedettség- és változatosság-újramérés, majd S10/2 zárómérés S9 után (TGM végrehajtás 665–739).
- **Oldalszál és main — SK4/SK5, S9** — Kiadási őr séma, tiltott minták, pontozási lenyomat és TTS-meglét ellen, majd mutációs ellenpróbák és alapvonal (TGM végrehajtás 1225–1271). S9 (1272–1294): a `docs/lesson-improvement.md` egyfutásos útjának átírása, az analitika skill forrás/tükör egyeztetése (mainen a `.claude/skills/websuli-gyartas-analitika/SKILL.md` megvan, az `.agents` párja hiányzik), és `docs/kanban.md` CLI-leírásának ellenőrzése az eltérő opciók miatt. A `06-tanulsagok-retro-gyujto.md:5–48` csapdapontjai közül külön rögzítendő a repo-relatív tervhivatkozás, tanúsítványlánc, halmozott PR önálló viselkedése, terhelési sorompó, natív modulok másolási tilalma, Node-verzió, fájlból vett commitüzenet, tényleges middleware-belépőn futó teszt és a tört időmaradék. A megbízási fejlécek kapcsolódó része P-051.
- **S9 követő jegyek** — A TGM végrehajtás S9/4 szerint bevezetendő vagy meglévő jegyhez rendelendő: játékhangválasztás, lecke utáni hanggyártás, négy nem megfelelt ábrafajta és a sávon belüli megjelenés, valamint a `04-prompt-audit-javitokorok.md:457–467` P2/P3/P9–P12 javaslatai (rubrikaszigorítás, lektori gyorsítótár, mintaválasz-egyeztetés, hibás bank-JSON, próbák száma, promptduplikáció). A kód- és méréstervet az S9-ben a teljes E1–E49 bizonyítéktáblával és az átfogó záró review-val kell összekötni.

### P-034 – Advent PR-B – adatmodell és végpontok

- **Azonosító** — P-034
- **Cím** — Advent PR-B – adatmodell és végpontok
- **Állapot** — RÉSZBEN
- **Terület** — advent
- **Prioritás-javaslat** — P1. A naptár szezonális működése vagy adatkezelése függ tőle.
- **Eredeti utasítás / ötlet** — Az adventi állapot tartósan mentődjön, a végpontok szezon, alany és jogosultság szerint működjenek.
- **Forrás** — Advent végrehajtás 95–182 és 409, átadó 13, scratchpad pr-B-adatmodell-vegpontok.md és review-advent/vak-prb-jelentes-3.md. Kanban létrehozási dátum és táblastátusz — #152 (2026-11-18, `todo`), #156 (2026-11-18, `todo`), #166 (2026-11-18, `todo`), #170 (2026-11-18, `done`), #171 (2026-11-18, `todo`), #173 (2026-11-18, `todo`).
- **Mi van már kész** — A #511 csak mag és készlet. A B ág hozza az 0042 migrációt, tárolót, szerver útvonalakat és teszteket. b9048b51 és eeb6fae1 két továbbfejlesztési fej.
- **Mi hiányzik** — A B fejek egyeztetése, vendégből párosított átvétel és kérdéssorrend elfogadása, 403/404 dokumentálása, DB-próba két folyamatra bontása és játékos UI tesztje.
- **Folytatás helye** — feat/advent-b-adatmodell-vegpontok @ eeb6fae1 és wip/advent-b-egyesites @ b9048b51, adventi-b, ADVENT.
- **Következő lépés** — Hasonlítsd a két fej source/server és migrációs változásait. Szintetikus párosítással ellenőrizd a lezárt/nyitott ablak, rossz évfolyam és 409/429 eseteket, majd jóváhagyott körben a DB tesztet.
- **Függőség / ütközés** — PR-A #511 alap, PR-C erre épül, adatkapcsolás döntési nyoma külön.

### P-035 – Advent PR-C – naptároldal és főoldali kártya

- **Azonosító** — P-035
- **Cím** — Advent PR-C – naptároldal és főoldali kártya
- **Állapot** — RÉSZBEN
- **Terület** — advent
- **Prioritás-javaslat** — P1. A naptár szezonális működése vagy adatkezelése függ tőle.
- **Eredeti utasítás / ötlet** — A gyermek játéka és az advent főoldali bejárata kis képernyőn, billentyűzettel és érintéssel működjön.
- **Forrás** — Advent végrehajtás 183–289, átadó 13, scratchpad pr-C-felulet.md és review-advent/vak-prc-jelentes-2.md. Kanban létrehozási dátum és táblastátusz — #162 (2026-11-18, `todo`).
- **Mi van már kész** — A 4fdf3177/41bdaa86 fejeken lazy kártya, flag, fókusz és koppintásszűrés javítva. Az adventi-naptar munkafában az advent-robustness.spec.ts módosított.
- **Mi hiányzik** — C integráció, billentyűzet és látható eltűnt/zárt üzenet, nem commitolt teszt és teljes mobil elfogadás.
- **Folytatás helye** — wip/advent-c-javitas @ 4fdf3177, feat/advent-c-felulet @ 41bdaa86, adventi-naptar, ADVENT.
- **Következő lépés** — Olvasd a két fej és a munkafa teszt-diffjét, majd a lassú hálózat, dupla koppintás, fókusz és flag KI eseteket vizsgáld a naptároldalon.
- **Függőség / ütközés** — PR-B, S3c végleges art.

### P-036 – Advent S3c – képkiválasztás és végleges eszközök

- **Azonosító** — P-036
- **Cím** — Advent S3c – képkiválasztás és végleges eszközök
- **Állapot** — RÉSZBEN
- **Terület** — advent
- **Prioritás-javaslat** — P1. A naptár szezonális működése vagy adatkezelése függ tőle.
- **Eredeti utasítás / ötlet** — A jóváhagyott adventi képek váltsák a helyőrzőket ellenőrzött darab- és méretkorláttal.
- **Forrás** — Advent végrehajtás 499 és 636, kanban #154/#161, scratchpad leltar-arva.md:80–87. Kanban létrehozási dátum és táblastátusz — #154 (2026-11-18, `todo`), #161 (2026-11-18, `todo`).
- **Mi van már kész** — #519 S3c-0 előkészítő main. A b198047c WIP-ben approve-advent.ts, méretcél és statikus mappa jelent meg.
- **Mi hiányzik** — Tulajdonosi válogatás, végső képek, art-manifest, promptazonosítók egyenlősége, méretőr és a hiányzó viselkedésteszt.
- **Folytatás helye** — feat/advent-s3c-kepek @ 28949f20, ADVENT, #519 előzmény.
- **Következő lépés** — A meglévő source/design-assets/advent és art registry között ellenőrizd az ID-kat és méreteket. A képcserét a jóváhagyott jelöltek után folytasd.
- **Függőség / ütközés** — PR-C képfoglalás, képgyártó költségmaradéka, tulajdonosi válogatás.

### P-037 – Advent képgyártó – költség és megszakítás utómunka

- **Azonosító** — P-037
- **Cím** — Advent képgyártó – költség és megszakítás utómunka
- **Állapot** — RÉSZBEN
- **Terület** — advent
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — A képgenerátor költésének valódi állapota és megszakítás utáni újraindíthatósága legyen mérhető.
- **Forrás** — Kanban #200–203, scratchpad review-advent/vak-kepgyarto-jelentes-1.md:21–30 és -2.md:15–19. Kanban létrehozási dátum és táblastátusz — #200 (2026-11-19, `todo`), #201 (2026-11-19, `todo`), #202 (2026-11-19, `todo`), #203 (2026-11-19, `todo`).
- **Mi van már kész** — #519 main, az érintett útkör azonos a 9e264fb4 ággal. A zár sorrendjét ágteszt őrzi, a valós ár elszámolását main tartalmazza.
- **Mi hiányzik** — Élő zár beragadása, többletár kezelése, hibás hívás számlázása és viselkedési teszt. A #202 referenciát/MIME-ot külön nézd meg a végső fejben.
- **Folytatás helye** — chore/advent-kepgyarto-vedelmek @ 9e264fb4, adventi-s3c0, #519 előzmény, ADVENT.
- **Következő lépés** — A generator és advent-art-pipeline.test.ts körében tervezz mockolt fetch, megszakítás és kerethatár próbát.
- **Függőség / ütközés** — S3c valódi költés előtt.

### P-038 – Advent S5/S6/S8 – levelek, admin előnézet, takarítás

- **Azonosító** — P-038
- **Cím** — Advent S5/S6/S8 – levelek, admin előnézet, takarítás
- **Állapot** — NEM VALÓSULT MEG
- **Terület** — advent
- **Prioritás-javaslat** — P1. A naptár szezonális működése vagy adatkezelése függ tőle.
- **Eredeti utasítás / ötlet** — A naptárnak legyen admin előnézete, megőrzési szabálya és jóváhagyott, egyszeri levélútja.
- **Forrás** — Advent végrehajtás 290–342,416–453 és terv 15. szakasz, kanban #155/#172. Kanban létrehozási dátum és táblastátusz — #155 (2026-11-18, `todo`), #172 (2026-11-18, `todo`).
- **Mi van már kész** — #511 és #519 main. S2 tároló- és kliensmunka ágakon. A naptár-élesítési rétegek külön szeletek.
- **Mi hiányzik** — Évadonként egyszeri szülői levél, 60 napos megőrzés takarító, admin előnézet, flag engedélyezése és S8 engedélyezett, egyszer indítható értesítés.
- **Folytatás helye** — ADVENT, B ágak tárolója, dedikált PR nem igazolt.
- **Következő lépés** — Csatlakoztasd a sweep-et a jóváhagyott életciklushoz. Szintetikus, küldés nélküli címzett- és idempotenciateszt után kérj száraz futásra döntést.
- **Függőség / ütközés** — B/C és S3c, címzettek és jóváhagyás.

### P-039 – Advent kérdéskészlet átfedése és első osztályos felolvasás

- **Azonosító** — P-039
- **Cím** — Advent kérdéskészlet átfedése és első osztályos felolvasás
- **Állapot** — RÉSZBEN
- **Terület** — advent
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — A karácsonyi tételek ne árulják el egymás megoldását, és az olvasni még nehezen tudó gyerek hallhassa a kérdést.
- **Forrás** — Kanban #151/#153, Advent végrehajtás 386–407. Kanban létrehozási dátum és táblastátusz — #151 (2026-11-18, `todo`), #153 (2026-11-18, `todo`).
- **Mi van már kész** — dc76ba52 #511 mainen 300 tétel és advent-christmas-bank.test.ts.
- **Mi hiányzik** — A koszorús tételek közötti válasz-utalás csökkentése, és első osztályos felolvasó út egyszerű, használható felülettel.
- **Folytatás helye** — Main, shared/advent/christmasBank és PR-C, ADVENT.
- **Következő lépés** — A készlet validátorával őrizd az évfolyamsáv és darabszám szerződését. A C ágon próbáld ki a kérdés felolvasását hang nélküli tartalékkal.
- **Függőség / ütközés** — C és brit TTS külön használati kör.

### P-040 – Játékhang felhasználói mozdulat utáni előmelegítése

- **Azonosító** — P-040
- **Cím** — Játékhang felhasználói mozdulat utáni előmelegítése
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — játékok
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — Az első játékhangeffekt ne késsen a betöltéstől, a böngésző aktiválási szabályait meg kell tartani.
- **Forrás** — Scratchpad pr-hang.md és vak-hang/kovetojegyek-1.md:1–16. Kanban létrehozási dátum és táblastátusz — #93 (2026-11-17, `todo`).
- **Mi van már kész** — a91fe552 mozdulatra halasztott konstruktor, némítás és leválasztás. Ági egységteszt 0c9ba6e6. A #516 a leckefelolvasást fedi.
- **Mi hiányzik** — Integráció és végső teljesítménymérés, iOS interrupted állapot és a Szökőár saját hangútjának migrációja külön követő.
- **Folytatás helye** — fix/hang-elomelegites @ a91fe552, hang-elomelegites, docs/specs/2026-11-19-hang-elomelegites.md és párja.
- **Következő lépés** — Vizsgáld a source/client/src/lib/audioEngine.ts eseményregisztrálását, majd mutass mérési bizonyítékot elnémítva és az első valódi érintésre.
- **Függőség / ütközés** — Szökőár témaváltás, másik TTS-rendszer.

### P-041 – Kisfilm memória és párhuzamosság

- **Azonosító** — P-041
- **Cím** — Kisfilm memória és párhuzamosság
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1. A szolgáltatás folytonosságát vagy a biztonságos kiadást érinti.
- **Eredeti utasítás / ötlet** — A fejezet-kisfilm készítésének memóriaigényét úgy kell mérsékelni, hogy a szolgáltatás stabil maradjon.
- **Forrás** — Kanban #35, origin/kisfilm-memoria-javitas ág, helyi előzmény PR #418. Kanban létrehozási dátum és táblastátusz — #35 (2026-11-16, `todo`).
- **Mi van már kész** — Main source/server/lesson-clips.ts:20,309 CLIP_PARALLEL még 2. Ág eltér ugyanitt, a szolgáltatóban, worker tesztekben és dokumentációban.
- **Mi hiányzik** — Az ág integrációja, draft/lezárt státusz és tartós memóriahatás bizonyítéka.
- **Folytatás helye** — origin/kisfilm-memoria-javitas @ 4fabc5ad, #418, docs/specs/2026-11-10-kisfilm-memoria.md és párja az ágon.
- **Következő lépés** — Hasonlítsd a két lesson-clips fájlt és a lesson-clip-worker.test.ts-et, majd engedélyezett körben vizsgáld a worker memóriahatárát.
- **Függőség / ütközés** — Éles kisfilmkapcsoló jelenlegi állása nem igazolt.
- **PR-állapot** — #418 nyitott a mentésben, ág `kisfilm-memoria-javitas`, GitHub-fej `4fabc5adb5a4130b0233c727c832ab0e711a557b`, frissítve 2026-11-19T08:45:07Z (UTC).
- **Nyitott review-szálak** — 0 szál az exportban.
- **Beolvasztás feltétele** — A PR-leírás a `4fabc5ad` fejhez helyi push-kaput és független IGEN-t közöl. Az összevonás előtt a rögzített fej frissességét, a kötelező CI-t és őröket kell igazolni. A memória első éles mérése az engedélyezett visszakapcsolás utáni külön lépés, a PR-leírás szerinti kikapcsolási feltétellel.

### P-042 – Szkriptkapuk P1–P5 – terv, bizonyítéklánc, állítás és tesztszigor

- **Azonosító** — P-042
- **Cím** — Szkriptkapuk P1–P5 – terv, bizonyítéklánc, állítás és tesztszigor
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A kiadási folyamat helyességét vagy áteresztőképességét közvetlenül érinti.
- **Eredeti utasítás / ötlet** — A munkafázisokra géppel ellenőrzött állítások, tesztintegritás és visszakereshető bizonyíték készüljön.
- **Forrás** — Kanban #91/#187/#188, scratchpad szkriptkapuk/jegyek-kanbanra.md, review-szkriptkapuk/vak-p1-jelentes-6.md és vak-p1p2-jelentes-2.md. Kanban létrehozási dátum és táblastátusz — #91 (2026-11-17, `in_progress`), #187 (2026-11-19, `todo`), #188 (2026-11-19, `todo`).
- **Mi van már kész** — #489 alapkészlet main. P1 terv 07bbb6d7, P2 tényleges kód 9d68cbfa. Korábbi nyers prototípusok chore/kapu-allitas-ellenor @ 82ea5b1a, chore/kapu-teszt-integritas @ f894999e, chore/kapu-ingadozo @ f98dfc42.
- **Mi hiányzik** — A teljes vertikum integrációja, lánc javítási és párhuzamossági feltételek, P3 előtt a ≤10% határ és tolerance-changed iránya, majd P3–P5 megvalósítása.
- **Folytatás helye** — chore/szkriptkapuk-p1-terv @ 07bbb6d7 és chore/szkriptkapuk-p2-bizonyitek-lanc @ 9d68cbfa, szkriptkapuk / szkriptkapuk-p2, #517 a PR-exportban, docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md és párja.
- **Következő lépés** — Vesd össze P1 távoli 7210b922 és helyi fejét, majd a P2 helyreállítás és láncmegszakítás tesztjeit. A korábbi S1–S3 ágak kódját forrásként használd az új terv sorrendjében.
- **Függőség / ütközés** — #506 main, #513 eltérő ág, vak ellenőr és kapu-gyorsítás.
- **PR-állapot** — #517 nyitott a mentésben, ág `chore/szkriptkapuk-p1-terv`, GitHub-fej `7210b92288031c0b01b73f2fcff39b464417c7b3`, frissítve 2026-11-19T08:17:57Z (UTC).
- **Nyitott review-szálak** — 2 nyitott, azonos lelet a `docs/specs/2026-11-17-szkriptkapuk-teljes-vertikum.md:391` soron. Az A5 minden jelöletlen leletre CI-bukást követelt, a 6.3a szerint viszont kezdetben `warn` van, a `block` csak mérés és tulajdonosi jóváhagyás után jön, és a commit-nézet minden módban tájékoztató. A helyi `2f1232e1` és `66f63699` átvezeti ezt, a `07bbb6d7` helyi fej A5-je a 393–401. sorban már az új szabályt írja.
- **Beolvasztás feltétele** — A terv és a végrehajtási fájl egységesített helyi változatát kell a PR-on felülvizsgálni és mindkét szálat lezárni. Az S1 implementáció külön lépés, a figyelmeztetésről tiltásra váltás a 6.3a feltételeihez kötött.

### P-043 – Vak ellenőr gépi futtatója és kizárólagos ítélete

- **Azonosító** — P-043
- **Cím** — Vak ellenőr gépi futtatója és kizárólagos ítélete
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A kiadási folyamat helyességét vagy áteresztőképességét közvetlenül érinti.
- **Eredeti utasítás / ötlet** — Az önálló vak ellenőrző futtató legyen a kötelező ítélet forrása a friss tulajdonosi döntés szerint.
- **Forrás** — Memória blind-bug-hunting-reviewer.md:13–52 és blind-review-runner.md, átadó 15/19, ág 57252fa7/f84742c7. Kanban létrehozási dátum és táblastátusz — #99 (2026-11-17, `todo`).
- **Mi van már kész** — Main #489 friss ellenőrt kér és #490 Gemini második vélemény. Ágon gate:blind-review futtató, tesztek és skillek, 679c23e4 modell/érvelés bizonyíték. Az újabb rögzített döntés GPT-6.2 Sol high és exclusive BE.
- **Mi hiányzik** — Az ökoszisztéma összes belépőjének integrációja, régi külső szerep kivezetése a kötelező láncból és egységes, mérésen alapuló átvétel.
- **Folytatás helye** — chore/vak-ellenor-deepseek @ 679c23e4, vak-ellenor-deepseek, előd chore/vak-hibakereso-ellenor @ eda8fff9, vak-ellenor, ág saját tervpár.
- **Következő lépés** — Ellenőrizd a gates.config.json, record-review, PR/merge gate, skillek és CI közös ítéletszerződését. A modellnevet a döntés commitjából vedd.
- **Függőség / ütközés** — A Qwen és DeepSeek bejegyzések korábbi állapotok. #513 és P2.
- **Oldalszál** — A `00-tulajdonosi-dontesek.md:26–37` DeepSeek/Qwen és átmeneti emberi irányítású vak kör leírása korábbi állapot. A láncok egybevonása miatt a régi részszeletek külön utólagos ellenőrzése helyett a #515 és #516 teljes láncáról van független jelentés. A régi PR-okra külön visszafuttatást kérő felvetéshez nincs igazolt választás.

### P-044 – Merge-kapu REST, lapozás és ítélet

- **Azonosító** — P-044
- **Cím** — Merge-kapu REST, lapozás és ítélet
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A kiadási folyamat helyességét vagy áteresztőképességét közvetlenül érinti.
- **Eredeti utasítás / ötlet** — A merge-kapu megbízhatóan olvassa a PR-adatokat, és ellenőrizze a felülvizsgálat helyi bizonyítékát.
- **Forrás** — Scratchpad review-hook-memo/vak-513-jelentes-1.md–3.md, ág tervpár.
- **Mi van már kész** — 2373a3f4 módosítja pre-merge-gate.mjs és tesztjét. A lista lapozása, szál-keret és helyi vak rekord már az ágon található.
- **Mi hiányzik** — Az aktuális PR-fej és a W1–W4 feltételek lezárása, fennmaradó lapozási és PR szöveges ítélet út ellenőrzése.
- **Folytatás helye** — fix/merge-kapu-rest @ 2373a3f4, merge-kapu-rest, #513, távoli c96e4801, docs/specs/2026-11-18-merge-kapu-rest.md és párja.
- **Következő lépés** — Pre-merge-gate.test.mjs-ben külön ellenőrizd a többlapos és üres listát, a szigorú vak rekordot és a hibás válasz tiltását.
- **Függőség / ütközés** — Vak ellenőr, P2 és C-61.
- **PR-állapot** — #513 nyitott a mentésben, ág `fix/merge-kapu-rest`, GitHub-fej `c96e480130bf50a0772ea4ddc3be658344025e1e`, frissítve 2026-11-18T21:57:29Z (UTC).
- **Nyitott review-szálak** — 0 szál az exportban. A vak ellenőrzés követő körei külön források.
- **Beolvasztás feltétele** — A `2373a3f4` helyi fejen ellenőrizendő a szigorú mód helyi vak ítélete és a hiányos CCR-adatok kezelése. A mentett PR-leírás IGEN-je a régebbi távoli fejre szól, és teljes zöld felhős merge-kaput nem dokumentál. A végleges fejet újra kell ellenőrizni, az összevonást az aktívfutás-őrhöz is hozzáférő környezetből végezve.

### P-045 – Audit-hook kapuindítás és hookok követő szigorítása

- **Azonosító** — P-045
- **Cím** — Audit-hook kapuindítás és hookok követő szigorítása
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A kiadási folyamat helyességét vagy áteresztőképességét közvetlenül érinti.
- **Eredeti utasítás / ötlet** — A kapuk és audit minden támogatott belépőn következetesen alkalmazzák a repó védelmét és a hibakezelést.
- **Forrás** — Átadó 10, scratchpad review-hook-memo/vak-506-jelentes-2.md–4.md, vak-auditok-jelentes-1.md–3.md, mut3/szalvalasz-520.md, kanban. Kanban létrehozási dátum és táblastátusz — #100 (2026-11-17, `todo`), #120 (2026-11-17, `todo`), #124 (2026-11-17, `todo`), #125 (2026-11-17, `todo`), #140 (2026-11-18, `todo`), #158 (2026-11-18, `todo`), #159 (2026-11-18, `todo`), #160 (2026-11-18, `todo`), #164 (2026-11-18, `todo`), #174 (2026-11-18, `todo`), #175 (2026-11-18, `todo`), #176 (2026-11-18, `todo`), #177 (2026-11-18, `todo`), #179 (2026-11-19, `todo`), #180 (2026-11-19, `todo`), #181 (2026-11-19, `todo`), #182 (2026-11-19, `todo`), #184 (2026-11-19, `todo`), #185 (2026-11-19, `todo`), #192 (2026-11-19, `todo`), #193 (2026-11-19, `todo`), #194 (2026-11-19, `todo`), #195 (2026-11-19, `todo`).
- **Mi van már kész** — Mainen #499 tokenizer, #506 hiba esetén tiltás és audit-időtúllépés. A #520 fix/audit-hook-kapuinditas 682aad88 Windows-indítót kezel, távoli 14f91e97 korábbi.
- **Mi hiányzik** — A #520 integrációja és a repo-cél, külső eszköz és hibás bemenet védelme, ConfigChange és futásidejű korlátok, runbook és teszt-formázási függés. Maradék hamis tiltások és függő beállításdöntés.
- **Folytatás helye** — fix/audit-hook-kapuinditas @ 682aad88, hook-auditok, #520, 2026-11-18-hook-onfailure és ági audit tervpárok.
- **Következő lépés** — Csoportosítsd a kanban-listát input-validálás, eszközút, teljesítmény és runbook szerint. A check-quality-gates.mjs és check-audit-ok.mjs mellé egy-egy szintetikus pozitív és negatív viselkedési próba kerüljön.
- **Függőség / ütközés** — #506 bizonyos jegyei már teljesültek, check-local és MCP stratégia tulajdonosi döntés.
- **PR-állapot** — #520 nyitott a mentésben, ág `fix/audit-hook-kapuinditas`, GitHub-fej `14f91e97d1a9637c89a2378a34d99dc35b6672bf`, frissítve 2026-11-19T13:34:56Z (UTC).
- **Nyitott review-szálak** — 3 nyitott. `scripts/qa/hooks/check-audit-ok.mjs:47` — a Git-aliasok felismerésének hiánya mindkét hookot érinti, a terv állítását `3230d13e` javítja, a lefedés #192 marad. `:44` — a Windows Git-indítóburkolók felismerésének hiánya, helyi kód- és tesztjavítás `682aad88`. `:61` — idézett szöveg vagy parancshatár miatt ártalmatlan művelet hamis tiltása, a helyi `hasGitThenPush` szókeresése alapján a határok teljes kezelése továbbra is nyitott.
- **Beolvasztás feltétele** — A helyi javítást egyeztesd a távoli fejjel. A három szálhoz külön kell javítás vagy elfogadott követő jegy, az alias és a hamis tiltás kérdését a #192-vel egyeztesd. A végleges fejen kell a friss független ítélet és a hook használati próbájának bizonyítéka.

### P-046 – Kapu gyorsítás – célzott e2e, őrök és futásidő

- **Azonosító** — P-046
- **Cím** — Kapu gyorsítás – célzott e2e, őrök és futásidő
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A kiadási folyamat helyességét vagy áteresztőképességét közvetlenül érinti.
- **Eredeti utasítás / ötlet** — A kapuk célzott tesztekkel, mért időkorláttal és bizonyíthatóan azonos változásnál átvihető rekorddal fussanak.
- **Forrás** — Memória gate-speed-decisions.md és main-checkout-must-be-current.md, kanban #92/#107/#113/#115/#144/#168, scratchpad review-szkriptkapuk/vak-kapugyorsitas-jelentes-1.md. Kanban létrehozási dátum és táblastátusz — #92 (2026-11-17, `todo`), #106 (2026-11-17, `todo`), #107 (2026-11-17, `todo`), #113 (2026-11-17, `todo`), #115 (2026-11-17, `todo`), #144 (2026-11-18, `todo`), #168 (2026-11-18, `todo`).
- **Mi van már kész** — #518 mainben szétosztja a CI E2E-t. 9765df58 célzott PR-kapu, c10a128a helyi futás-optimalizálás és őr viselkedésteszt. #491/#492 javította a #106-hoz kötött utat.
- **Mi hiányzik** — Futásidő-döntés és két ág egyeztetése, meglévő PR-ra célzott push, futási sorompó, squash után pontos háromfázisú ellenőrzés, mért lépéskorlát, C-61 és biztonságos előre számított merge-eredmény.
- **Folytatás helye** — fix/kapu-gyorsitas @ c10a128a, kapu-gyorsitas, fix/gate-pr-celzott-e2e @ 9765df58, gate-pr-celzott-e2e, 2026-11-19-gate-pr-celzott-e2e tervpár.
- **Következő lépés** — A pre-pr-gate, pre-push-gate, three-phase-check és lib.mjs tesztjeiben külön fedj őr-változást, forrásváltozást, squash utáni követőt és időtúllépést. A forrás szerinti lassulást mérd.
- **Függőség / ütközés** — CI E2E szelethangolás, P2 rekord-átvitel, #513.

### P-047 – Állapot-ellenőrzők és kapuk bekötése minden környezetben

- **Azonosító** — P-047
- **Cím** — Állapot-ellenőrzők és kapuk bekötése minden környezetben
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — A memória, kanban, eszközkörnyezet és termék-keresés állapota automatizáltan ellenőrizhető legyen.
- **Forrás** — Kanban #103, scratchpad leltar-arva.md:66–79, ág commit ab69f000 és ab87bf16. Kanban létrehozási dátum és táblastátusz — #103 (2026-11-17, `todo`).
- **Mi van már kész** — #489 alap törzs main. A korábban commitolatlan kanban-check és memory-check most ab69f000. ab87bf16 külön eltérésben CI-őr, git pre-push hook, Codex setup és vezérlődoksik.
- **Mi hiányzik** — env-doctor, termék-kereső aranykészlet, skill és tényleges használat, valamint CI/git/Codex kiterjesztés behúzása teszttel.
- **Folytatás helye** — chore/allapot-ellenorok @ ab69f000, allapot-ellenorok, chore/kapuk-beepites @ ab87bf16, kapuk-beepites, ágak saját tervpárjai.
- **Következő lépés** — A scripts/qa/checks és scripts/qa/hooks/install-git-hooks.test.mjs változásait ellenőrizd a #489 ellen, majd külön szakaszban próbáld a platformfüggetlen telepítőt.
- **Függőség / ütközés** — Szkriptkapuk és vezérlődokumentumok.

### P-048 – Régi automata-review maradványainak eltávolítása

- **Azonosító** — P-048
- **Cím** — Régi automata-review maradványainak eltávolítása
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — Az elavult automata-review fájlokat ki kell vezetni a használt workflow ellenőrzése mellett.
- **Forrás** — Scratchpad bence/body.md, bence/vak-jelentes-1.md és -2.md.
- **Mi van már kész** — 90313892 ágon az auto-review.yml változik, .harness fájlok kikerülnek, workflow-szkript viselkedését őrző teszt kerül be.
- **Mi hiányzik** — A módosítás mainre kerülése, az aktív automation-út igazolása és a vak leletek ellenőrzése.
- **Folytatás helye** — chore/bence-maradvany-tisztitas @ 90313892, bence-tisztitas, docs/specs/2026-11-19-bence-maradvany-tisztitas.md és párja.
- **Következő lépés** — A .github/workflows/auto-review.yml jogosultságát és lépéseit ellenőrizd a source/tests/auto-review-workflow-guard.test.ts mellett.
- **Függőség / ütközés** — Vak ellenőri konfiguráció átfedése.

### P-049 – Titokkitakarás lineáris futásideje

- **Azonosító** — P-049
- **Cím** — Titokkitakarás lineáris futásideje
- **Állapot** — ÁGON KÉSZ, NINCS BENT
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A kiadási folyamat helyességét vagy áteresztőképességét közvetlenül érinti.
- **Eredeti utasítás / ötlet** — A kimenet kitakarása hosszú bemeneten is határidőn belül fusson és tartsa meg a titokszűrést.
- **Forrás** — Scratchpad kitakaro/vak-jelentes-1.md, ág docs/specs/2026-11-19-kitakaro-negyzetes-regex.md és párja.
- **Mi van már kész** — f024bb3d módosítja a gate lib, external-review és design-assets szűrőit, valamint tesztjeiket. A diff eltér a mainen.
- **Mi hiányzik** — Integráció, hosszú és hibás bemenet, kimeneti vágás és kitakarás helyes sorrendje.
- **Folytatás helye** — fix/kitakaro-negyzetes-regex @ f024bb3d, kitakaro-regex, fenti tervpár.
- **Következő lépés** — Fiktív értékekkel és hosszú szöveggel bizonyítsd a lineáris futást és a maszkolást a lib.test.mjs és design-assets.test.ts útjain.
- **Függőség / ütközés** — P2 redakció és külső/vak futtatók.

### P-050 – CI E2E szelethangolás és kis review-utókörök

- **Azonosító** — P-050
- **Cím** — CI E2E szelethangolás és kis review-utókörök
- **Állapot** — RÉSZBEN
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — Az összevont CI és joystick változtatások után a mérősúlyokat, megbízhatóságot és workflow jogosultságait is rendbe kell tenni.
- **Forrás** — Scratchpad ci-e2e/kanban-jegyek-514-L1-L3.md, kanban-jegyek-L4-L6.md, vak-518-merge-jelentes.md:21–30, kanban #76/#105/#143/#167/#204. Kanban létrehozási dátum és táblastátusz — #76 (2026-11-17, `in_review`), #105 (2026-11-17, `todo`), #143 (2026-11-18, `todo`), #167 (2026-11-18, `todo`), #204 (2026-11-19, `todo`).
- **Mi van már kész** — #514 időzítés és #518 szeletrendszer mainen. Az e2e-shards.mjs és a CI workflow tesztlistát és eredményt ellenőriz.
- **Mi hiányzik** — Új specek súlyai (TTS is), tervszámok, forráshely/spec csoportosítás, workflow permissions és SHA-rögzítés. A maradék ingadozók és hosszú Vihargarázs 915×412 külön gyökérokot igényelnek.
- **Folytatás helye** — chore/ci-e2e-szeleteles @ c7ec1085, ci-e2e-gyorsitas, #518, test/joystick-tsunami-stabil @ 2eb1fdf6, #514, azonos nevű tervpárok.
- **Következő lépés** — A hibaelőzményekből különítsd el a terhelt futást a termékhibától, majd vizsgáld e2e-shards.mjs súlyait, a joystick-response.spec.ts diagnosztikáját és a game-meta-quality.spec.ts beragadását.
- **Függőség / ütközés** — Kapu gyorsítás és E2E-sorompó.

### P-051 – Ügynökvezérlés második lépcső és takarítás

- **Azonosító** — P-051
- **Cím** — Ügynökvezérlés második lépcső és takarítás
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P3. A közvetlenül használt működést nem blokkoló rendezési feladat.
- **Eredeti utasítás / ötlet** — A vezérlési dokumentumok és a havi átvilágítás szerint elavult elemek takarítását folytatni kell.
- **Forrás** — docs/specs/2026-11-17-vezerles-dieta.md és párja, kanban #34, memória cleanup-delete-archives.md és orchestrator-owns-all-websuli-flows.md. Kanban létrehozási dátum és táblastátusz — #34 (2026-11-16, `todo`).
- **Mi van már kész** — #488 első archívum/vezérlés-szelet mainen. Az átvilágítás holt kódot és dokumentációt csoportosít.
- **Mi hiányzik** — A következő lépcső, felesleges függőségek, régi márkanév, VPS-doksik és munkafahigiénia forrás szerinti kezelése.
- **Folytatás helye** — Main, #488 és docs/archive/agent-vezerles-2026-11-17, külön ág/PR nem igazolt.
- **Következő lépés** — A terv szerinti link- és hívóleltárral válaszd szét az átnevezést, megőrzést és eltávolítást. Az ágak összevetéséhez a leltár mellékletét használd.
- **Függőség / ütközés** — Állapot-ellenőrzők és publikus git-előzmények.
- **Oldalszál** — `07-megbizas-fejlecek.md:3–5,47–63`, `06-tanulsagok-retro-gyujto.md:17–19,38–48`: továbbviendő a stabil fejléc és a célzott újraolvasás, javításnál az eredeti megvalósító folytatása és a friss vak ellenőr kivétele. A reprodukciót a saját munkafában, önálló PR-állapottal és bizonyítékkal kell leírni. S9-nél a megbízássablonban külön szerepeljen a natív binárisok másolási tilalma, a valódi alkalmazás-belépő vizsgálata és halmozott PR-nál az önálló beolvaszthatóság. Az AGENTS.md már rögzíti a gépenkénti natív telepítést és a független review elvét.

### P-052 – Telepítés előtti aktívfutás-őr és éles konfiguráció

- **Azonosító** — P-052
- **Cím** — Telepítés előtti aktívfutás-őr és éles konfiguráció
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P1. A szolgáltatás folytonosságát vagy a biztonságos kiadást érinti.
- **Eredeti utasítás / ötlet** — Futó gyártás esetén legyen gépi telepítési védelem és ellenőrzött infrastruktúra-beállítás.
- **Forrás** — docs/telepites-elotti-or.md, kanban #63/#68/#169, memória no-deploy-during-active-runs.md. Kanban létrehozási dátum és táblastátusz — #63 (2026-11-16, `in_progress`), #68 (2026-11-16, `todo`), #169 (2026-11-18, `todo`).
- **Mi van már kész** — #473 dokumentálja a telepítési őrt. A verify-render-settings.test.mjs:64 régi konfigurációt tesztmintaként tartalmaz, az audit éles eltérést rögzített.
- **Mi hiányzik** — Kötelező automatizált bekötés és igazolt élő konfiguráció. Éles build/migráció eltérés, óvatos proxy-bizalmi vizsgálat és elérhetőségi státusz.
- **Folytatás helye** — Main render.yaml, docs/telepites-elotti-or.md és source/server/lib/client-ip.ts, külön PR nem igazolt.
- **Következő lépés** — A konfigurációt csak jóváhagyott olvasó hozzáféréssel hasonlítsd össze. A megállási és bizalmi szabályokat lokális, szintetikus tesztben ellenőrizd.
- **Függőség / ütközés** — Deploy engedély, futó gyártások, külön infrastruktúra.

### P-053 – Havi teljesítmény-audit – Vercel és sokat olvasó végpontok

- **Azonosító** — P-053
- **Cím** — Havi teljesítmény-audit – Vercel és sokat olvasó végpontok
- **Állapot** — RÉSZBEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — Csökkenteni kell a fölösleges nagy olvasásokat, klienscsomag-terhelést és preview forgalmat.
- **Forrás** — Kanban #69/#72, 2026-11-17 utómunka retro, #478 felmérés. Kanban létrehozási dátum és táblastátusz — #69 (2026-11-16, `todo`), #72 (2026-11-16, `todo`).
- **Mi van már kész** — #478 kérdésbank javítása mainen. A routes.ts és storage út szerinti további végpontok külön vizsgálandók.
- **Mi hiányzik** — Sitemap és listák felesleges nagy JSON olvasása, admin lapozás, preview API célzás, design asset cache, eager szóbank, sok főoldali kártya, kezdeti animációs csomag és üresjárati render.
- **Folytatás helye** — Main source/server/routes.ts, source/vercel.json, kérdésbank #478/#502.
- **Következő lépés** — Vegyél fel route-onkénti hívás/méret mérőt szintetikus mintán. A cache és preview kockázatokat elkülönítve mérd.
- **Függőség / ütközés** — Kérdésbank S2–S3, közös játékhurok.

### P-054 – Futásidejű szkript-őrök J3–J10

- **Azonosító** — P-054
- **Cím** — Futásidejű szkript-őrök J3–J10
- **Állapot** — NEM VALÓSULT MEG
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — Néhány éles művelet korlátját és ellenőrzését determinisztikus szkriptre kell bízni.
- **Forrás** — Kanban #145, scratchpad szkript-orok/leltar.md, 2026-11-18. Kanban létrehozási dátum és táblastátusz — #145 (2026-11-18, `todo`).
- **Mi van már kész** — A repo QA-őr és telepítési kézi őr alapjai #489/#473, az egyes termékőrök a kanban szerint külön szeletek.
- **Mi hiányzik** — Aláírt visszapattanás/panasz webhook és értesítés, postdeploy füstpróba, borító újrapróba tartós számláló, fejlesztői USD-plafon, éles írásőr, push e2e, döntőbíró-indoklás szűrése, éjszakai invariáns-söprés.
- **Folytatás helye** — Main, a részletes forrás szerinti J3–J10 sorrend, külön ágak nem igazoltak.
- **Következő lépés** — Minden őrhöz jelöld előre a termék belépőjét és szintetikus szerződéses tesztjét. A push e2e-t a kapu-gyorsítással egyeztesd.
- **Függőség / ütközés** — J1 TGM SK3, J2 elvetve. Resend és éles adat külön felhatalmazást igényel.

### P-055 – Advent vendéghaladás átvitele párosításkor

- **Azonosító** — P-055
- **Cím** — Advent vendéghaladás átvitele párosításkor
- **Állapot** — RÉSZBEN
- **Terület** — advent
- **Prioritás-javaslat** — P1. A naptár szezonális működése vagy adatkezelése függ tőle.
- **Eredeti utasítás / ötlet** — Az azonosított vendég és tanulói haladás az engedett esetben egyesüljön, ablakonként a jobb eredménnyel.
- **Forrás** — Kanban #170, feat/advent-b-adatmodell-vegpontok:docs/specs/2026-11-18-adventi-naptar.md:1065–1085 és scratchpad review-adventi/vak-pr-b-jelentes-1.md:63. Kanban létrehozási dátum és táblastátusz — #170 (2026-11-18, `done`).
- **Mi van már kész** — A tulajdonos 2026-11-18-án jóváhagyta az átvételt, 11-19-én az ablakonkénti egyesítést. A fióktörlésnél a tanulói haladás megmarad. A B ági átvétel b9048b51/eeb6fae1.
- **Mi hiányzik** — A különböző ágfejek eltérő kísérletáthelyezésének egyeztetése és az átvétel, importált kérdéssorrend, párhuzamos írás integrációja mainre.
- **Folytatás helye** — Advent PR-B fej és ADVENT.
- **Következő lépés** — A server/advent/adoption.ts és store.ts viselkedését lefedő szintetikus tesztben ellenőrizd a jobb ablak választását, a tanulói eredmény és a megnyitott kérdéssorrend megőrzését.
- **Függőség / ütközés** — PR-B, szerver-állapot és párosítási tájékoztató.

### P-056 – Advent végleges képek és levélindítás jóváhagyása

- **Azonosító** — P-056
- **Cím** — Advent végleges képek és levélindítás jóváhagyása
- **Állapot** — TULAJDONOSI DÖNTÉSRE VÁR
- **Terület** — advent
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — A képek stílusát és az értesítés száraz adatait a tulajdonos nézze meg a végrehajtás előtt.
- **Forrás** — Advent terv 15. szakasz és végrehajtás 416,499. Kanban létrehozási dátum és táblastátusz — #154 (2026-11-18, `todo`), #155 (2026-11-18, `todo`).
- **Mi van már kész** — A tulajdonos döntött 10 képes próbáról és 7 USD maximális keretről, címzett feliratkozók és aktív adminlistás címzettek. A technikai előkészítés #519.
- **Mi hiányzik** — A próbaképek válogatása után döntés a teljes körről, valamint a száraz jelentés jóváhagyása az értesítéshez.
- **Folytatás helye** — ADVENT, #519 előzmény, PR-C és S3c.
- **Következő lépés** — Mutasd meg a jelölt képeket, külön a száraz címzettösszesítést. Az engedélyt pontosan a választáshoz és a futáshoz kösd.
- **Függőség / ütközés** — Képgyártó és értesítő funkció.

### P-057 – Hook eszközhatár és projekt-helyi beállítás

- **Azonosító** — P-057
- **Cím** — Hook eszközhatár és projekt-helyi beállítás
- **Állapot** — TULAJDONOSI DÖNTÉSRE VÁR
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P1. A függő döntés adatkezelést vagy kiadási feltételt érint.
- **Eredeti utasítás / ötlet** — A hook-projekt helyi beállításainak és egyéb belépőinek szabályát külön kell jóváhagyni.
- **Forrás** — Kanban #175/#179/#181/#185, scratchpad review-hook-memo/vak-506-jelentes-4.md:57–66. Kanban létrehozási dátum és táblastátusz — #175 (2026-11-18, `todo`), #179 (2026-11-19, `todo`), #181 (2026-11-19, `todo`), #185 (2026-11-19, `todo`).
- **Mi van már kész** — #506 tartalmazza az alap projektvédelmet, a runbook részben dokumentál.
- **Mi hiányzik** — Döntés a követett projekt-helyi settings szándékáról, jogosultsági szűkítés vagy matcher köréről és további hookok hiba utáni szabályáról.
- **Folytatás helye** — Main #506, követő kör #520 és vak ellenőr.
- **Következő lépés** — Készíts döntési összevetést a dokumentált lehetőségekből. A szigorítást csak viselkedésteszt után kérd.
- **Függőség / ütközés** — Hook követő szigorítás és vak ellenőr CI-út.

### P-058 – Kapu rekord és napló – munkafánkénti bizonyíték

- **Azonosító** — P-058
- **Cím** — Kapu rekord és napló – munkafánkénti bizonyíték
- **Állapot** — NEM VALÓSULT MEG
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2. A következő fejlesztési körben elkülöníthető javítás vagy mérési feladat.
- **Eredeti utasítás / ötlet** — A bizonyíték és a napló ne vesszen el párhuzamos munkafák futásakor, az ítélet legyen hiteles rekordhoz kötve.
- **Forrás** — Scratchpad szkriptkapuk/jegyek-kanbanra.md:3–19, docs/agent-csapdak.md C-75.
- **Mi van már kész** — A records/evidence keret #489. A naplóút ütközését a 2026-11-19-i forrás feljegyezte, W4 szöveges ítélet a pre-pr kaput érinti.
- **Mi hiányzik** — Fejhez és munkafához kötött napló, forgatás és helyi ítélet egységes forrása. A felhős CCR-állapot összevetése csak felhős merge újraengedése esetén.
- **Folytatás helye** — Main scripts/qa/gates/pre-pr-gate.mjs és lib.mjs, #513 és P2 ági terv.
- **Következő lépés** — Teszteld két munkafa párhuzamos logját és távoli ítélet nélküli helyi rekordot. Egyeztesd a REST és P2 új szerződését.
- **Függőség / ütközés** — Kapu-gyorsítás és vak runner.

### P-059 – Korábbi migrációs tananyagok és hetente frissített módszertan

- **Azonosító** — P-059
- **Cím** — Korábbi migrációs tananyagok és hetente frissített módszertan
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — tananyag
- **Prioritás-javaslat** — P3. A közvetlenül használt működést nem blokkoló rendezési feladat.
- **Eredeti utasítás / ötlet** — A régi tananyagok átalakításánál az iteratív ellenőrzés és az esetek átadása követhető legyen.
- **Forrás** — Memória legacy-migration-cycles.md, frissítés 2026-11-17, régi kanban #6/#7/#15/#16.
- **Mi van már kész** — A migrációs ciklusok külön PR-jai a táblán #353/#354/#355. A régebbi nyitott jegyek 2026. októberben keletkeztek.
- **Mi hiányzik** — A heti memóriamódosítás felvetette-e a konkrét régi tananyagok folytatását vagy csak a futásmódszert rendezte. Éles anyagállapot innen nem igazolható.
- **Folytatás helye** — Memória és a rögzített main, konkrét új ág nem igazolt.
- **Következő lépés** — Nézd át a ciklusban szereplő teendőket a táblán, és csak szintetikus mintán futtasd a kategória és tartalom vizsgálatát.
- **Függőség / ütközés** — Az éles eredmények hozzáférést igényelnek.

### P-060 – Linkek és háttérfigyelők életciklusa

- **Azonosító** — P-060
- **Cím** — Linkek és háttérfigyelők életciklusa
- **Állapot** — ELLENŐRIZETLEN
- **Terület** — infrastruktúra
- **Prioritás-javaslat** — P2. Megerősítés után célzott, önálló javításként ütemezhető.
- **Eredeti utasítás / ötlet** — Az üzemeltetési várakozó folyamatok ne maradjanak árva állapotban, a párosítás kezelje a linkek élettartamát.
- **Forrás** — Memória learner-profile-tokens.md, taskstop-orphan-monitor.md, main-checkout-must-be-current.md, 2026-11-17–19.
- **Mi van már kész** — A #473 telepítési út és #506 hook a mainen. A memóriában külön utasítás él korlátos várakozásra és a fő munkafa frissítésére.
- **Mi hiányzik** — Az automatizált időkorlát, árva figyelő elkerülés és a munkafa-frissesség programból kikényszerített ellenőrzése nincs igazolva. A párosító linkek újrakiadásának eljárása ellenőrizendő rotáció előtt.
- **Folytatás helye** — docs/telepites-elotti-or.md, docs/minosegkapuk.md és kapu-gyorsítás ág.
- **Következő lépés** — A futás és leállítás útját vizsgáld rövid, ártalmatlan próbafolyamattal. A kulcsforgatás hatását előbb szintetikus párosító tesztben igazold.
- **Függőség / ütközés** — Telepítési őr, admin-pilot és titokkezelés.

### P-061 – Nyitva maradt PR-szálak és lezárt, be nem olvasztott PR-ok

- **Azonosító** — P-061
- **Cím** — Nyitva maradt PR-szálak és lezárt, be nem olvasztott PR-ok
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P2. Megerősítés után célzott, önálló javításként ütemezhető.
- **Eredeti utasítás / ötlet** — Az összes nyitva maradt távoli review-kérést össze kell vetni a rögzített repóállapottal.
- **Forrás** — PR-export `pr-nyitott.json`, `pr-lezart.json`, mind a nyolc `szalak-<PR>.json`; Átadó 6–16 és a rögzített main.
- **Mi van már kész** — 8 nyitott PR, 20 exportált review-szálból 6 nyitott (5 külön felvetés). Leképezés: #418 → P-041, #484 → P-001, #486 → P-002, #504 → P-004, #510 → P-024, #513 → P-044, #517 → P-042, #520 → P-045. A 80 lezárt rekordból 79 összevont, 1 összevonás nélkül zárt. Az utóbbi #441 kiváltója a #443 (`c53040a9`), a #443 leírása kifejezetten megnevezi az elődjét. Elveszett tartalmú PR az exportban nem igazolt.
- **Mi hiányzik** — Az összevonásnál az akkor érvényes GitHub-fej, draft/mergeability, check-runok, jóváhagyások és a feloldások visszaigazolása. A két kiváltott TGM lánc hat korábbi PR-jának formális lezárási adata nincs a mentésekben.
- **Folytatás helye** — A fenti P-tételek, a lezárt export és a Duplikátumok és ellentmondások szakasz.
- **Következő lépés** — Beolvasztáskor a kiválasztott fejen ellenőrizd a helyi javításokat, a kötelező CI-t és merge-bizonyítékot, valamint hogy az exportban nyitott szálakat lezárták-e. Ha szükséges, a hat TGM-előd formális állapotát is igazold.
- **Függőség / ütközés** — GitHub-pillanatkép és helyi ágak eltérő feje. A pillanatkép a CI-t és az élő merge-állapotot nem exportálja.

### P-062 – Claude oldalszál-átadó és helyi próbaanyagok

- **Azonosító** — P-062
- **Cím** — Claude oldalszál-átadó és helyi próbaanyagok
- **Állapot** — RÉSZBEN
- **Terület** — egyéb
- **Prioritás-javaslat** — P3. A közvetlenül használt működést nem blokkoló rendezési feladat.
- **Eredeti utasítás / ötlet** — A tananyag oldalszál és a megmaradt próbaanyagok további teendői kerüljenek vissza a már azonosított tételekhez.
- **Forrás** — Oldalszál `99-ATADAS-fo-szalnak.md`, `00-tulajdonosi-dontesek.md`, `01`–`07` jegyzetek és kapcsolódó mérőanyagok; első körös git-átadó és scratchpad.
- **Mi van már kész** — A tananyag oldalszál másolata olvasható. S2b–S9 és S10/SK folytatása P-028–P-033. Review és megbízássablon P-043/P-051. A döntések P-064–P-068. A #515 és #516 beolvadását main és export igazolja.
- **Mi hiányzik** — A két előző körben talált leválasztott review-próba tartalmi összevetése, az S9 záró visszavezetése, valamint az S10 és S8c további bizonyítéka. A mintanyersanyagok és képernyők a munkamenet jegyzeteiben vannak.
- **Folytatás helye** — Oldalszál `tananyag-minoseg/`, TGM, P-028–P-033. Az adventi C munkafa fókusztesztje P-035.
- **Következő lépés** — Az S9/S10 körben a megőrzendő, publikálható mérőlogikát és szintetikus fixture-t rögzítsd a terv szerint. A helyi review-próbákból csak a követett tesztekben valóban hiányzó esetet vedd át.
- **Függőség / ütközés** — A próbaanyagok nyers tartalma és a régebbi mérési bizonyítékok helyi források. Publikus leltárban csak a forráshivatkozások és az összesített műszaki következtetések szerepelnek.
- **Átadói környezet és takarítás** — Az átadó 41–45. sora natív modul újjáépítését, a terhelt gép futási sorompóját és a két lánc munkafáinak merge utáni rendezését írja le. A két helyi láncág teljes fájlfája egyezik a saját squash-commitjával. A hanglánc munkafája a második körben még zároltan szerepel a munkafalistán. A natív modul ottani állapotát az átadó korábbi pontja rögzíti, jelenlegi futtathatóságát külön kell igazolni.

### P-063 – Kockavadász J3a pontskála és korábbi rekordok

- **Azonosító** — P-063
- **Cím** — Kockavadász J3a pontskála és korábbi rekordok
- **Állapot** — TULAJDONOSI DÖNTÉSRE VÁR
- **Terület** — játékok
- **Prioritás-javaslat** — P1
- **Eredeti utasítás / ötlet** — Döntés arról, hogyan legyenek összevethetők a régi kvízes és az új bányászós menetek pontjai.
- **Forrás** — PR-export #484, „Pontszám-skála (L6)”; helyi `3a42110e`.
- **Mi van már kész** — Az ág az új pontskálát alkalmazza. A `source/client/src/pages/BlockCraftQuiz.tsx:1097,3321,3340` ugyanazt a játékazonosítót használja a helyi rekordhoz és a pontbeküldéshez.
- **Mi hiányzik** — Tulajdonosi döntés a régi ranglista és helyi rekord nullázása, illetve verziózott új skála között.
- **Folytatás helye** — P-001, PR #484, `feat/jatek-j3a-kockavadasz-runabanya`.
- **Következő lépés** — A kiadás előtt rögzítsd a választást és igazold az új menet, a régi ranglista és a helyi rekord viselkedését.
- **Függőség / ütközés** — P-001; a rekordok visszavonhatatlan módosítása külön felhatalmazást igényel.

### P-064 – Brit TTS néma próbakimondás és hangtárplafon

- **Azonosító** — P-064
- **Cím** — Brit TTS néma próbakimondás és hangtárplafon
- **Állapot** — TULAJDONOSI DÖNTÉSRE VÁR
- **Terület** — TTS
- **Prioritás-javaslat** — P1
- **Eredeti utasítás / ötlet** — Erősítse meg a tulajdonos a néma próbakimondás kivételét és a hangcsere átmeneti tárhelykeretét.
- **Forrás** — Oldalszál `99-ATADAS-fo-szalnak.md:36–39`, `00-tulajdonosi-dontesek.md:18–20`; TGM 373–374 és végrehajtás 1030–1031.
- **Mi van már kész** — A `b7165a56` #516 mainen van. A `source/server/tts/audio-store.ts:44–47,87` már hangverziónként 40 MB-os és abszolút 80 MB-os korlátot használ. Mindkettő benne van a tervpárban.
- **Mi hiányzik** — A néma próbakimondás eltávolításának és a 80 MB-os abszolút plafonnak a tulajdonosi jóváhagyása. A dokumentálásra vonatkozó korai átadói teendő teljesült.
- **Folytatás helye** — P-032, #516, TGM S8b–S8d.
- **Következő lépés** — A jóváhagyást az iPad/Android tartalékút és a hangcsere tárhelyigényének bizonyítékával rögzítsd.
- **Függőség / ütközés** — S8c indítási és hangválasztási döntése, #183.

### P-065 – Stúdió SK3 új leállítási korlátainak hatóköre

- **Azonosító** — P-065
- **Cím** — Stúdió SK3 új leállítási korlátainak hatóköre
- **Állapot** — TULAJDONOSI DÖNTÉSRE VÁR
- **Terület** — tananyag
- **Prioritás-javaslat** — P1
- **Eredeti utasítás / ötlet** — Erősítse meg a tulajdonos, hogy az új éles futásidő- és összesített javítókör-korlát kimaradjon-e az SK3-ból.
- **Forrás** — Oldalszál `00-tulajdonosi-dontesek.md:9–17`, `99-ATADAS-fo-szalnak.md:39`; TGM végrehajtás 602–659.
- **Mi van már kész** — A végrehajtás rögzíti a D7 döntéseit: éles költség- és tokenküszöbnél csak jelzés, nincs vészleállító, a jelenlegi körkorlát él, a 30 USD próbakeret kemény. A két új megállító korlát kihagyása már szerepel a tervben.
- **Mi hiányzik** — A terv hatókörének megerősítése az éles futásidőre és az összesített javítókörre. A D7 közvetlenül a költség- és tokenkeretről, valamint a vészleállítóról döntött.
- **Folytatás helye** — P-029, TGM SK3.
- **Következő lépés** — A jóváhagyott hatókört vezessétek át az SK3 elfogadási feltételeibe és a költségriasztó szerződésébe.
- **Függőség / ütközés** — P-029 és S10 első mérés.

### P-066 – Stúdió vizuális kapcsoló és az enforce kapu hibaága

- **Azonosító** — P-066
- **Cím** — Stúdió vizuális kapcsoló és az enforce kapu hibaága
- **Állapot** — TULAJDONOSI DÖNTÉSRE VÁR
- **Terület** — tananyag
- **Prioritás-javaslat** — P1
- **Eredeti utasítás / ötlet** — Az első mérést követően döntés az éles kapcsolóról és az `enforce` kapu saját kivételének kezeléséről.
- **Forrás** — Oldalszál `00-tulajdonosi-dontesek.md:22–25,47–52`, `99-ATADAS-fo-szalnak.md:27–34`; TGM végrehajtás S10/1.
- **Mi van már kész** — A #515 mainen lévő `source/server/studio/source-visuals-flag.ts:11–14` szerint a kapcsoló alapból KI. A vizuális kapu bekötve, a `report` viselkedés forrásból vizsgálható (`source/server/studio/single-run/engine.ts:717`).
- **Mi hiányzik** — Az S10 mért eredménye, az SK1c megkülönböztetett hibaútja és a tulajdonosi döntés: belső kapuhibánál leállás vagy értesítés. Ismert lefedettségi bukás az `enforce` módban továbbra is bukásként kezelendő.
- **Folytatás helye** — P-028, P-033, kanban #163.
- **Következő lépés** — Az S2b/S3 és a mért hiánytábla alapján külön rögzítsd a flag bekapcsolásának és a tiltó módnak a feltételét.
- **Függőség / ütközés** — S2b, S3, SK1c és S10 első mérés.

### P-067 – Automatikus PR-összevonás és az Auto Review szövege

- **Azonosító** — P-067
- **Cím** — Automatikus PR-összevonás és az Auto Review szövege
- **Állapot** — TULAJDONOSI DÖNTÉSRE VÁR
- **Terület** — kapuk-QA
- **Prioritás-javaslat** — P2
- **Eredeti utasítás / ötlet** — Döntés arról, legyen-e automatikus összevonás, vagy a munkafolyamat a tényleges review-indítást írja le.
- **Forrás** — Oldalszál `99-ATADAS-fo-szalnak.md:23,39`; main `.github/workflows/auto-review.yml:82–83`, P-048.
- **Mi van már kész** — A main workflow botreview-t indít és hozzászólást ír. A hozzászólás szövege automatikus összevonást ígér, miközben a workflow-ban nincs merge-lépés. A kapcsolódó takarítás ága a P-048 alatt áll.
- **Mi hiányzik** — Tulajdonosi döntés az automatizmus szerepéről és az ellentmondó PR-üzenet sorsáról.
- **Folytatás helye** — P-048 és `.github/workflows/auto-review.yml`.
- **Következő lépés** — A döntést egyeztesd a merge-kapu feltételeivel, és annak megfelelően igazítsd a működést vagy a tájékoztató szöveget.
- **Függőség / ütközés** — P-044 és P-048; az automatikus merge éles GitHub-beállítása az exportból nem látható.

### P-068 – Külön GitHub-hozzáférésű munkamenet szükségessége

- **Azonosító** — P-068
- **Cím** — Külön GitHub-hozzáférésű munkamenet szükségessége
- **Állapot** — TULAJDONOSI DÖNTÉSRE VÁR
- **Terület** — egyéb
- **Prioritás-javaslat** — P3
- **Eredeti utasítás / ötlet** — Tisztázni, kell-e még harmadik, GitHub-hozzáférésű munkamenet a fő szál mellett.
- **Forrás** — Oldalszál `99-ATADAS-fo-szalnak.md:36–45`; PR-export #515/#516; main `f756588c`, `b7165a56`.
- **Mi van már kész** — A két átadott láncot a #515 és #516 már integrálta. A helyi PR-export és az átadó olvasható, a pillanatkép ellenőrzéséhez elegendő volt.
- **Mi hiányzik** — A tulajdonos válasza a külön munkamenetre. Ha a fő szál intézi a további PR- és release-lépéseket, a két lánc miatt külön munkamenet már nem szükséges.
- **Folytatás helye** — P-061, P-062, tananyag-átadó 5–6. szakasza.
- **Következő lépés** — A még nyitott hozzáférési igény alapján zárd le a kérdést, vagy jelölj ki felelőst a jövőbeli GitHub-ellenőrzésre.
- **Függőség / ütközés** — P-061 élő PR- és CI-állapota, ha új állapotfelvétel kell.

## Tulajdonosi döntésre vár

- **Játékosfiók egyedisége** (kanban #77) — maradnak cím szerint külön profilok, vagy normalizált postafiók és új egyedi index kell. Az utóbbihoz a meglévő profilütközések átvezetését is meg kell határozni.
- **Játékosfiók és többjátékos élesítés** (játék-fiók retro, JÁTÉK) — marad KI, csak admin pilot indul, vagy a pilot feltételei után szűkebb/nyilvános bekapcsolás. Az önregisztráció és a szerepkörök korábbi döntései rögzítettek.
- **Aszteroida egyujjas mód** (kanban #85) — marad a jelenlegi irányítás, vagy készül külön egyujjas út. A forrás az automata tüzelés véletlen válaszait kockázatként írja le.
- **Brain Rot megállásos válasz** (kanban #88) — megerősítés vagy hosszabb megállás. A mért önkéntelen válaszra kér döntést a forrás.
- **Szólétra ranglista és tempóajánlás** (kanban #112, ág `69547067`) — közös vagy tempónkénti lista, illetve tempóajánlás vagy felső korlát. Az XP-egyenlőség 2026-11-18-i döntés.
- **Szünet alatti háttér** (kanban #74) — a 3D és díszítő háttér rajzolása szünetben is fusson, vagy álljon le. A választás a szünet megjelenését érinti.
- **Advent S3c és S8** (ADVENT 15., 17. szakasz) — a próbaképek után teljes kör a jóváhagyott referenciával, vagy új válogatás. Az egyszeri értesítő szövegének és száraz címzettszámának jóváhagyása vagy elhalasztása külön döntés. A címzettkör és költségplafon rögzítve.
- **Hook beállítás** (kanban #175/#179/#185) — a követett projekt-helyi beállítás szándékos-e. A további lefedés forrás szerinti opciói a matcher/jogosultság szűkítése és a CI-ítélet-őr, a többi hook hiba utáni tiltása külön döntési pont.
- **Publikus git-történet** (kanban #57) — a megtisztított main mellett az előzmények megőrzése, vagy összehangolt történeti takarítás. A megvalósítás külön engedélyt igényel.

- **Kockavadász pontskála** (P-063, #484 L6) — a régi helyi rekord és ranglista nullázása vagy új verziókulcs az új XP-skálához.
- **Brit TTS** (P-064, átadó 39) — a néma próbakimondás eltávolítása és a teljes hangtár 80 MB-os abszolút korlátja jóváhagyásra vár. A hangminta és az S8c gyártás indítása külön döntés (P-032).
- **SK3 megállítási korlátok** (P-065) — erősítendő meg a tervezett új futásidő- és összesített körszámkorlát elhagyása. Az éles költségjelzés és a próba kemény kerete már eldőlt.
- **Forrásvizuálok élesítése** (P-066, #163) — S10 után a kapcsoló bekapcsolása és a kapu belső hibájának leállító vagy értesítő kezelése `enforce` módban.
- **Automatikus PR-összevonás** (P-067) — legyen-e ilyen működés, és hogyan igazodjon hozzá a review-trigger üzenete.
- **Külön GitHub-munkamenet** (P-068) — szükséges-e a következő PR- és kiadási feladatokhoz. A két átadott lánc már beolvadt.

## Duplikátumok és ellentmondások

- **#441 → #443 (JM0).** A `pr-lezart.json` egyetlen `mergedAt` nélküli rekordja #441 (lezárás 2026-11-16T07:25:05Z). A #443 leírása megnevezi a #441 kiváltását a háromfázisú sorrend és a P2-javítás miatt. A main `c53040a9` diffjében ott a ranglista megjelenítési neve, naplómaszkolás, pontbeküldési keret és `runId`-deduplikálás (`source/server/gameScoreService.ts`, `source/server/routes.ts`, `source/server/lib/score-run-dedup.ts`, `source/tests/jm0-privacy-guards.test.ts`). A zárt export alapján elveszett PR-tartalom nincs igazolva.
- **#501/#505/#507 → #515, #503/#508/#512 → #516.** A két utód PR leírása név szerint megadja az elődöket, a rögzített mainen `f756588c` és `b7165a56` a bizonyíték. A hat előd egyik PR-listában sem szerepel, így a tartalmi kiváltás igazolt, az elődök formális lezárása nem igazolt. A szerveroldali archívum lefedettségéről csak a mentett rekordok alapján lehet állítani. A #516 címe S8a–S8d, a hanggyártás (S8c) külön nyitott P-032.
- **A tananyag-átadó #516 állapota időközben változott.** A `99-ATADAS-fo-szalnak.md:10–22` még nyitottként és a csendkeret-javítást csak helyiként rögzíti. A lezárt export összevonási ideje 2026-11-19T15:50:19Z. A `f023f197` javítás a #516 main-változatában tartalmilag ott van; a régi PR-frissítési lépések helyett #183 és az S8c folytatása maradt. A #515/#516 teljes láncról szóló review-i kiváltják a rész-PR-onkénti beolvasztási sorrendet.
- **#517 két szála ugyanarról az A5 eltérésről szól.** Egy javítási tétel P-042 alatt, két külön szállezárással. A #510 R19 a P-024 alatti PR-blokkoló, P-025 tartalmazza a tágabb kézbesítési utómunkát. A #520 alias és parancshatár leletei a P-045 szerinti #192 alá tartoznak.

- A 2026-11-19-i éjféli átadó #514, #515 és #506 ügyét még merge-sorban tartja, a CI-szeletelést pedig PR-ra várónak. A mainen az érintett változatok `b930c0f3` #514, `f756588c` #515, `14c859ee` #506 és `ce5205dc` #518. A #519 és #516 is integrálva van. A fő láncok utómunkái külön tételben szerepelnek.
- Advent S1 és készlet → #511, képgyártó S3c-0 → #519. Az S2a/S2b és S3/S4 elődágak tartalmi folytatása a B és C köteg, az ideiglenes `tmp/advent-merge` és `wip/advent-b-olvasas` összevetési forrás. A 11-18-i és a 11-19-i átvételi döntések között a későbbi ablakonkénti szabály érvényes. Az értesítési címzettkört a 15. szakasz szűkítette. Az évadonként egyszeri szülői szabály a korábbi körönkénti logikát felülírta.
- Advent kanban #152/#167/#173 ugyanazon DB-kör futásidő problémájának külön megfigyelései. A B/C státuszát a main és az ágfa dönti el. A főoldali kártya vagy API teljesülését a korábbi #511 készletből nem lehet levezetni.
- A független ellenőrről szóló #489 és #490 bekerült. A későbbi memória és ági döntés szerint a vak futtató kötelező, GPT-6.2 Sol high, exclusive bekapcsolva. A DeepSeek, Qwen és a korábbi kiegészítő külső út korábbi állapot. A célidő, WIP és bizonyíték-átvitel újabb döntése a működő ági kóddal ellenőrizendő.
- Kockavadász #90/#117/#123 és #504 a mobil teljesítmény és panel közös családja, a #491 csak a hook memoizálása. `perf/kockavadasz-telefon` az előző panel, `perf/kockavadasz-megjelenites` kutatási dokumentuma azonosított egyedi anyag. A J3a külön játékmeneti változás.
- A scratchpad egy régi állapot-ellenőrző kódot commitolatlannak mond, a friss ág `ab69f000` commitban őrzi. A C munkafa korábbi dokumentumütközése már nincs a státuszban, jelenleg az összesítő fókuszát pontosító tesztmódosítás látszik.
- #31, #78, #89, #110, #118, #126 és #165 táblán nyitott vagy review állapotú is lehet, az adott main-szeletek rendre #492, #483, #498/#500, #495, #493, #506 és #516 alatt igazoltak. A maradék tünetek külön szerepelnek.
- Az újabb döntés szerint az eredménylevél kerete iskolai NAT esetén tanulóhoz kötődjön (#139). A kérdésként megőrzött #138 ugyanaz a téma. A dokumentált szolgáltatói idempotenciakulcs (`source/server/lesson-result-email.ts:23–45`) alapot ad a #128 ellenőrzéséhez.
- A régebbi `fix/brainrot-kozos-kupon` változat külön teszt- és fejlesztési nyom. A main `BrainRotSteal.tsx:521` közös directort használ, a #497 későbbi pacing rétegét meg kell őrizni a maradék tesztek vizsgálatakor.
- A korábbi nyers szkriptkapu ágakból a P1/P2 újraszervezett lánc készült. A `chore/kapu-ingadozo` ágon maradt P3–P5 forrás megőrzendő bemenet, a P1 terv újabb sorrendjét és figyelmeztető módját kell követni.
- A távoli refs `pr/424`, `pr/425`, `pr/426`, `pr/430` squash előtti támpontok. A PR-szeletek a mainen `7ae49b33`, `50c6041c`, `d3628b50` és `e729789c`. Az eltérő hash önmagában nem jelez nyitott munkát.

## Ellenőrzési melléklet

### Heti main terv–végrehajtás párok

Az alábbi sorszámok az elfogadási, szelet- és állapotfejezetek keresési pontjai. A végrehajtás teljesülésére a tétel és a main-szelet bizonyítéka vonatkozik. A terv utolsó módosítása lehet egy követő PR is.

- `docs/specs/2026-11-15-jatekok-mobil-szobank.md` + `2026-11-15-jatekok-mobil-szobank-vegrehajtas.md` ugyanott. Tervfejezetek 190, 247, végrehajtási fejezetek 1808, 1844, 1874. Utolsó heti main érintés `bf100e9f`.
- `docs/specs/2026-11-16-e2e-coupon-expired-block-craft.md` + `2026-11-16-e2e-coupon-expired-block-craft-vegrehajtas.md` ugyanott. Tervfejezetek 80, végrehajtási fejezetek 83, 87. Utolsó heti main érintés `66b67317`, diffben `source/client/src/pages/BlockCraftQuiz.tsx`, `source/tests/block-art.spec.ts`.
- `docs/specs/2026-11-16-e2e-ingadozok-2.md` + `2026-11-16-e2e-ingadozok-2-vegrehajtas.md` ugyanott. Tervfejezetek 44, végrehajtási fejezetek a lépéseknél. Utolsó heti main érintés `bab40853`, diffben `source/client/src/game-engine/CouponHud.tsx`, `source/client/src/game-engine/mobile/PauseMenu.tsx`.
- `docs/specs/2026-11-16-jatek-telefonos-reszponzivitas.md` + `2026-11-16-jatek-telefonos-reszponzivitas-vegrehajtas.md` ugyanott. Tervfejezetek 130, végrehajtási fejezetek 9, 88. Utolsó heti main érintés `6a4f7a48`, diffben `source/client/src/components/GamePedagogyPanel.tsx`, `source/client/src/components/useScrollHint.ts`.
- `docs/specs/2026-11-16-jatekok-jatekelmeny.md` + `2026-11-16-jatekok-jatekelmeny-vegrehajtas.md` ugyanott. Tervfejezetek 71, 156, 758, 767, 786, 922, 969, végrehajtási fejezetek 472, 793, 933, 1143, 1233, 1317, 1424, 1665, 1736, 1890, 1952, 2003, 2178. Utolsó heti main érintés `b826932d`, diffben `source/server/index.ts`, `source/server/player/account-store.ts`.
- `docs/specs/2026-11-16-quiz-bank-memoria.md` + `2026-11-16-quiz-bank-memoria-vegrehajtas.md` ugyanott. Tervfejezetek 116, végrehajtási fejezetek a lépéseknél. Utolsó heti main érintés `76cf426a`, diffben `source/server/curriculum/load.ts`, `source/server/gameQuizBankService.ts`.
- `docs/specs/2026-11-16-tananyag-evfolyam-jeloles.md` + `2026-11-16-tananyag-evfolyam-jeloles-vegrehajtas.md` ugyanott. Tervfejezetek 87, végrehajtási fejezetek 76. Utolsó heti main érintés `340e63dd`, diffben `source/client/src/components/AdminFileDashboard.tsx`, `source/client/src/components/ClassroomBadge.tsx`.
- `docs/specs/2026-11-16-tananyag-evfolyam-modositas.md` + `2026-11-16-tananyag-evfolyam-modositas-vegrehajtas.md` ugyanott. Tervfejezetek 1, 95, végrehajtási fejezetek a lépéseknél. Utolsó heti main érintés `fe7c89fb`, diffben `source/server/material-classroom.ts`, `source/server/routes.ts`.
- `docs/specs/2026-11-16-tananyag-programozas-felirat.md` + `2026-11-16-tananyag-programozas-felirat-vegrehajtas.md` ugyanott. Tervfejezetek 1, 50, végrehajtási fejezetek a lépéseknél. Utolsó heti main érintés `78809df3`, diffben `source/client/src/lesson-runtime/LessonRuntime.tsx`, `source/client/src/lesson-runtime/LessonView.tsx`.
- `docs/specs/2026-11-16-valodi-cimek-ki.md` + `2026-11-16-valodi-cimek-ki-vegrehajtas.md` ugyanott. Tervfejezetek 77, végrehajtási fejezetek a lépéseknél. Utolsó heti main érintés `38861d28`, diffben `source/client/src/pages/AdminDocumentation.tsx`, `source/server/lib/admin-access.ts`.
- `docs/specs/2026-11-17-brainrot-valaszido.md` + `2026-11-17-brainrot-valaszido-vegrehajtas.md` ugyanott. Tervfejezetek 95, végrehajtási fejezetek a lépéseknél. Utolsó heti main érintés `21c81998`, diffben `source/client/src/lib/brainRot/core.ts`, `source/client/src/lib/brainRot/pacing.ts`.
- `docs/specs/2026-11-17-e2e-ingadozok-3.md` + `2026-11-17-e2e-ingadozok-3-vegrehajtas.md` ugyanott. Tervfejezetek 51, végrehajtási fejezetek a lépéseknél. Utolsó heti main érintés `54620024`, diffben `source/tests/duel-online.spec.ts`, `source/tests/game-win-paths.spec.ts`.
- `docs/specs/2026-11-17-eredmeny-email-foglalas.md` + `2026-11-17-eredmeny-email-foglalas-vegrehajtas.md` ugyanott. Tervfejezetek 63, 78, végrehajtási fejezetek a lépéseknél. Utolsó heti main érintés `3ff4d173`, diffben `source/server/lesson-result-email.ts`, `source/server/resend.ts`.
- `docs/specs/2026-11-17-eredmeny-email-kviz.md` + `2026-11-17-eredmeny-email-kviz-vegrehajtas.md` ugyanott. Tervfejezetek 77, végrehajtási fejezetek a lépéseknél. Utolsó heti main érintés `b7622adf`, diffben `source/client/src/lesson-runtime/LessonExperienceView.tsx`, `source/client/src/lesson-runtime/resultReport.ts`.
- `docs/specs/2026-11-17-kerdesbank-hook-memo.md` + `2026-11-17-kerdesbank-hook-memo-vegrehajtas.md` ugyanott. Tervfejezetek 57, 88, végrehajtási fejezetek a lépéseknél. Utolsó heti main érintés `2b873e3c`, diffben `source/client/src/hooks/useMaterialQuizzes.ts`, `source/tests/material-quizzes-hook-memo.test.ts`.
- `docs/specs/2026-11-17-kerdesbank-karcsusitas.md` + `2026-11-17-kerdesbank-karcsusitas-vegrehajtas.md` ugyanott. Tervfejezetek 80, 94, 113, 143, végrehajtási fejezetek a lépéseknél. Utolsó heti main érintés `cd3f7744`, diffben `source/server/gameQuizBankService.ts`, `source/server/lib/conditional-get.ts`.
- `docs/specs/2026-11-17-kulso-ellenor.md` + `2026-11-17-kulso-ellenor-vegrehajtas.md` ugyanott. Tervfejezetek 47, 59, végrehajtási fejezetek 22. Utolsó heti main érintés `49a849ef`, diffben `scripts/qa/hooks/check-quality-gates.mjs`, `scripts/qa/hooks/check-quality-gates.test.mjs`.
- `docs/specs/2026-11-17-minosegkapuk.md` + `2026-11-17-minosegkapuk-vegrehajtas.md` ugyanott. Tervfejezetek 113, 161, végrehajtási fejezetek 186. Utolsó heti main érintés `26bae97f`, diffben `.github/workflows/ci.yml`, `scripts/qa/gates/_fake.mjs`.
- `docs/specs/2026-11-17-nyilt-feladat-rovid-valasz.md` + `2026-11-17-nyilt-feladat-rovid-valasz-vegrehajtas.md` ugyanott. Tervfejezetek 138, végrehajtási fejezetek a lépéseknél. Utolsó heti main érintés `a1342ba8`, diffben `source/server/ai/lesson-html-spec.ts`, `source/tests/fixtures/scorer-corpus.json`.
- `docs/specs/2026-11-17-szoletra-olvashatosag.md` + `2026-11-17-szoletra-olvashatosag-vegrehajtas.md` ugyanott. Tervfejezetek 43, 207, 256, végrehajtási fejezetek a lépéseknél. Utolsó heti main érintés `e0dba1db`, diffben `source/client/src/data/wordLadder/de.ts`, `source/client/src/data/wordLadder/en.ts`.
- `docs/specs/2026-11-17-szoveges-valasz-irasjel.md` + `2026-11-17-szoveges-valasz-irasjel-vegrehajtas.md` ugyanott. Tervfejezetek 9, 87, végrehajtási fejezetek a lépéseknél. Utolsó heti main érintés `56d1a9af`, diffben `source/client/src/lesson-runtime/blocks/try-blocks.tsx`, `source/tests/fill-blank-punctuation.spec.ts`.
- `docs/specs/2026-11-17-tananyag-cim-osztaly.md` + `2026-11-17-tananyag-cim-osztaly-vegrehajtas.md` ugyanott. Tervfejezetek 40, 139, 157, 164, végrehajtási fejezetek 106. Utolsó heti main érintés `a7b3b787`, diffben `source/client/src/components/AdminFileDashboard.tsx`, `source/client/src/components/FileCard.tsx`.
- `docs/specs/2026-11-17-vezerles-dieta.md` + `2026-11-17-vezerles-dieta-vegrehajtas.md` ugyanott. Tervfejezetek 60, 77, végrehajtási fejezetek a lépéseknél. Utolsó heti main érintés `46931d8c`.
- `docs/specs/2026-11-18-adventi-naptar.md` + `2026-11-18-adventi-naptar-vegrehajtas.md` ugyanott. Tervfejezetek 300, 412, 429, 537, 557, 564, 712, 727, 826, 943, végrehajtási fejezetek 313, 355, 612. Utolsó heti main érintés `dc76ba52`, diffben `source/tests/advent-assignment.test.ts`, `source/tests/advent-calendar.test.ts`.
- `docs/specs/2026-11-18-ci-e2e-szeleteles.md` + `2026-11-18-ci-e2e-szeleteles-vegrehajtas.md` ugyanott. Tervfejezetek 1, 52, 152, 164, végrehajtási fejezetek a lépéseknél. Utolsó heti main érintés `ce5205dc`, diffben `.github/workflows/ci.yml`, `scripts/qa/e2e-shard-weights.json`.
- `docs/specs/2026-11-18-hook-onfailure.md` + `2026-11-18-hook-onfailure-vegrehajtas.md` ugyanott. Tervfejezetek 43, 95, végrehajtási fejezetek a lépéseknél. Utolsó heti main érintés `14c859ee`, diffben `scripts/qa/gates/lint-gate.mjs`, `scripts/qa/gates/lint-gate.test.mjs`.
- `docs/specs/2026-11-18-joystick-tsunami-stabil.md` + `2026-11-18-joystick-tsunami-stabil-vegrehajtas.md` ugyanott. Tervfejezetek 96, 106, végrehajtási fejezetek a lépéseknél. Utolsó heti main érintés `b930c0f3`, diffben `source/tests/joystick-click-settle.test.ts`, `source/tests/joystick-response.spec.ts`.
- `docs/specs/2026-11-18-szoletra-kovetes.md` + `2026-11-18-szoletra-kovetes-vegrehajtas.md` ugyanott. Tervfejezetek 23, végrehajtási fejezetek a lépéseknél. Utolsó heti main érintés `99c6dc29`, diffben `source/client/src/lib/wordLadder/sim.ts`, `source/client/src/pages/WordLadderHuEn.tsx`.
- `docs/specs/2026-11-18-tananyag-gyartas-minoseg.md` + `2026-11-18-tananyag-gyartas-minoseg-vegrehajtas.md` ugyanott. Tervfejezetek 179, 251, 564, 671, végrehajtási fejezetek 63. Utolsó heti main érintés `b7165a56`, diffben `source/client/src/lesson-runtime/ExperienceSpeech.tsx`, `source/client/src/lesson-runtime/LessonExperienceView.tsx`.

### Ágak és munkafák

- Nem commitolt munkák az utolsó söprésben. `adventi-naptar` (`wip/advent-c-javitas`) — `source/tests/advent-robustness.spec.ts:316`, az összesítő bezárása után a 24. nap gombja legyen fókuszban. `wt504c` leválasztott review-munkafa — `source/tests/zz-vak504c-probe.spec.ts`. Egy másik leválasztott vak futtatói `wt` — `source/tests/zz-blind-review-scenario.spec.ts` és több kizárólag futási `.blind-review-tmp/` próbaanyag. Az utóbbi kettő hasznosíthatósága ellenőrizetlen.
- Az `egyedi commit` az `origin/main..ref` száma. Az `ágdiff utak` a közös őstől számolt fájllista mérete. Az `eltérő utak` ugyanezen fájlokra számolt fej ↔ main különbség. A nulla teljes útazonosságot mutat ezen a fájlkörön. A nem nulla érték későbbi main-módosítást, dokumentumeltérést vagy valóban függő kódot is jelenthet.

| Ref | Fej | Egyedi commit | Ágdiff utak | Eltérő utak |
|---|---|---:|---:|---:|
| `refs/heads/feat/jatek-j6a-aszteroida-kristaly` | `9a296216` | 23 | 27 | 27 |
| `refs/heads/chore/vak-ellenor-deepseek` | `679c23e4` | 33 | 58 | 58 |
| `refs/heads/fix/eredmeny-email-kviz` | `6b5f2e68` | 44 | 21 | 21 |
| `refs/heads/fix/hang-elomelegites` | `a91fe552` | 10 | 11 | 11 |
| `refs/heads/docs/websuli-potlasok` | `b7165a56` | 0 | 0 | 0 |
| `refs/heads/main` | `b7165a56` | 0 | 0 | 0 |
| `refs/remotes/origin/main` | `b7165a56` | 0 | 0 | 0 |
| `refs/heads/fix/kitakaro-negyzetes-regex` | `f024bb3d` | 3 | 8 | 8 |
| `refs/heads/fix/kapu-gyorsitas` | `c10a128a` | 8 | 16 | 16 |
| `refs/heads/fix/szokoar-tema-es-sebesseg` | `577c9945` | 51 | 112 | 112 |
| `refs/heads/feat/tgm-s8d-hang-eloetoltes` | `6bfd2d48` | 30 | 32 | 0 |
| `refs/remotes/origin/feat/tgm-s8d-hang-eloetoltes` | `6bfd2d48` | 30 | 32 | 0 |
| `refs/heads/feat/jatek-j7b-tornado-utelagazas` | `2b0b6720` | 39 | 32 | 32 |
| `refs/heads/chore/bence-maradvany-tisztitas` | `90313892` | 3 | 8 | 8 |
| `refs/heads/fix/gate-pr-celzott-e2e` | `9765df58` | 2 | 9 | 9 |
| `refs/heads/fix/audit-hook-kapuinditas` | `682aad88` | 8 | 4 | 4 |
| `refs/heads/chore/advent-kepgyarto-vedelmek` | `9e264fb4` | 10 | 8 | 0 |
| `refs/remotes/origin/chore/advent-kepgyarto-vedelmek` | `9e264fb4` | 10 | 8 | 0 |
| `refs/heads/wip/advent-c-javitas` | `4fdf3177` | 35 | 50 | 50 |
| `refs/heads/wip/advent-b-egyesites` | `b9048b51` | 23 | 22 | 22 |
| `refs/heads/chore/ci-e2e-szeleteles` | `c7ec1085` | 5 | 6 | 0 |
| `refs/remotes/origin/chore/ci-e2e-szeleteles` | `c7ec1085` | 5 | 6 | 0 |
| `refs/heads/perf/kockavadasz-telefon-gyors` | `4dbc3a8b` | 20 | 23 | 23 |
| `refs/remotes/origin/fix/audit-hook-kapuinditas` | `14f91e97` | 5 | 4 | 4 |
| `refs/remotes/origin/fix/eredmeny-email-kviz` | `f5a1e712` | 40 | 21 | 21 |
| `refs/heads/chore/szkriptkapuk-p1-terv` | `07bbb6d7` | 7 | 2 | 2 |
| `refs/remotes/origin/kisfilm-memoria-javitas` | `4fabc5ad` | 8 | 9 | 9 |
| `refs/heads/feat/advent-c-felulet` | `41bdaa86` | 31 | 50 | 50 |
| `refs/heads/feat/advent-b-adatmodell-vegpontok` | `eeb6fae1` | 19 | 22 | 22 |
| `refs/heads/chore/szkriptkapuk-p2-bizonyitek-lanc` | `9d68cbfa` | 13 | 13 | 13 |
| `refs/heads/feat/jatek-j3a-kockavadasz-runabanya` | `3a42110e` | 27 | 26 | 26 |
| `refs/heads/fix/merge-kapu-rest` | `2373a3f4` | 10 | 5 | 5 |
| `refs/heads/feat/advent-s3c-kepek` | `28949f20` | 18 | 61 | 42 |
| `refs/heads/chore/allapot-ellenorok` | `ab69f000` | 2 | 6 | 6 |
| `refs/remotes/origin/chore/hook-onfailure-tilt` | `289ffcc8` | 25 | 13 | 0 |
| `refs/remotes/origin/chore/szkriptkapuk-p1-terv` | `7210b922` | 3 | 2 | 2 |
| `refs/heads/feat/kabala-fooldal` | `80f4c6cc` | 24 | 78 | 78 |
| `refs/heads/feat/tgm-s2a-megjelenitok` | `7ea69555` | 30 | 51 | 5 |
| `refs/remotes/origin/feat/tgm-s2a-megjelenitok` | `7ea69555` | 30 | 51 | 5 |
| `refs/heads/test/joystick-tsunami-stabil` | `2eb1fdf6` | 4 | 5 | 0 |
| `refs/remotes/origin/test/joystick-tsunami-stabil` | `2eb1fdf6` | 4 | 5 | 0 |
| `refs/heads/feat/joystick-jobb-kez` | `fc012178` | 4 | 23 | 23 |
| `refs/remotes/origin/fix/merge-kapu-rest` | `c96e4801` | 3 | 5 | 5 |
| `refs/remotes/origin/perf/kockavadasz-telefon-gyors` | `635e5d01` | 9 | 21 | 21 |
| `refs/heads/chore/vak-hibakereso-ellenor` | `eda8fff9` | 15 | 32 | 32 |
| `refs/heads/fix/tgm-sk1b-fedettsegi-kapu-kemenyites` | `6a8e81da` | 17 | 33 | 14 |
| `refs/heads/feat/tgm-s1b-sk1-forras-fedettseg` | `e800d853` | 14 | 31 | 20 |
| `refs/heads/claude/tananyag-gyartas-minoseg-8fa0b9` | `94d6a83a` | 9 | 17 | 11 |
| `refs/heads/feat/tgm-s8b2-lecke-hanglejatszas` | `19925a11` | 16 | 33 | 24 |
| `refs/remotes/origin/feat/tgm-s8b2-lecke-hanglejatszas` | `19925a11` | 16 | 33 | 24 |
| `refs/heads/kiserlet/kabala-maki` | `bc3196e0` | 8 | 25 | 25 |
| `refs/heads/fix/brainrot-valaszido` | `79707456` | 13 | 12 | 0 |
| `refs/remotes/origin/fix/brainrot-valaszido` | `79707456` | 13 | 12 | 0 |
| `refs/heads/wip/advent-b-olvasas` | `a3eb9bb0` | 9 | 33 | 19 |
| `refs/heads/feat/advent-a-mag-keszlet` | `e855d8a7` | 3 | 17 | 1 |
| `refs/remotes/origin/feat/advent-a-mag-keszlet` | `e855d8a7` | 3 | 17 | 1 |
| `refs/heads/tmp/advent-merge` | `109acc95` | 27 | 50 | 34 |
| `refs/heads/feat/tgm-s8b-hangtar` | `1d241073` | 10 | 30 | 24 |
| `refs/remotes/origin/feat/tgm-s8b-hangtar` | `1d241073` | 10 | 30 | 24 |
| `refs/remotes/origin/fix/tgm-sk1b-fedettsegi-kapu-kemenyites` | `d302bb5e` | 11 | 28 | 13 |
| `refs/heads/feat/advent-s4-fooldali-kartya` | `4ecc044f` | 25 | 49 | 36 |
| `refs/heads/feat/advent-s3-naptar-oldal` | `a31fc28a` | 23 | 45 | 32 |
| `refs/heads/feat/jatek-adventi-naptar` | `94ab5a84` | 33 | 57 | 37 |
| `refs/heads/fix/nyilt-feladat-rovid-valasz` | `33558ef5` | 5 | 8 | 1 |
| `refs/remotes/origin/fix/nyilt-feladat-rovid-valasz` | `33558ef5` | 5 | 8 | 1 |
| `refs/heads/feat/advent-s2b-vegpontok` | `ad46b364` | 21 | 32 | 19 |
| `refs/remotes/origin/feat/tgm-s1b-sk1-forras-fedettseg` | `c73e14a9` | 9 | 26 | 19 |
| `refs/heads/feat/advent-s1b-karacsonyi-keszlet` | `9ae67890` | 16 | 16 | 3 |
| `refs/heads/chore/advent-s3c0-kepgyarto` | `bbabfc49` | 4 | 7 | 3 |
| `refs/heads/feat/tgm-s8a-brit-bongeszohang` | `744b8443` | 6 | 18 | 14 |
| `refs/remotes/origin/feat/tgm-s8a-brit-bongeszohang` | `744b8443` | 6 | 18 | 14 |
| `refs/heads/perf/kerdesbank-karcsusitas-s1` | `68286951` | 2 | 11 | 2 |
| `refs/remotes/origin/perf/kerdesbank-karcsusitas-s1` | `68286951` | 2 | 11 | 2 |
| `refs/heads/fix/eredmeny-email-kviz-s1a` | `456281ba` | 6 | 9 | 1 |
| `refs/remotes/origin/fix/eredmeny-email-kviz-s1a` | `456281ba` | 6 | 9 | 1 |
| `refs/heads/fix/szoveges-valasz-irasjel` | `efdc4e11` | 8 | 8 | 1 |
| `refs/remotes/origin/fix/szoveges-valasz-irasjel` | `efdc4e11` | 8 | 8 | 1 |
| `refs/remotes/origin/chore/hook-tokenizalas` | `69b1c41a` | 42 | 7 | 2 |
| `refs/heads/worktree-agent-ae61ed0600d39ba2f` | `2b873e3c` | 0 | 0 | 181 |
| `refs/remotes/origin/claude/tananyag-gyartas-minoseg-8fa0b9` | `740466a5` | 5 | 12 | 9 |
| `refs/heads/fix/szoletra-kovetes-2` | `8eb0572d` | 5 | 7 | 0 |
| `refs/remotes/origin/fix/szoletra-kovetes-2` | `8eb0572d` | 5 | 7 | 0 |
| `refs/heads/feat/advent-s2a-adatmodell` | `b1532322` | 15 | 21 | 10 |
| `refs/heads/feat/advent-s1-mag` | `9418eecd` | 10 | 10 | 3 |
| `refs/heads/docs/adventi-naptar-terv` | `588fac55` | 6 | 2 | 2 |
| `refs/heads/perf/kerdesbank-hook-memo` | `4eef590b` | 6 | 5 | 0 |
| `refs/remotes/origin/perf/kerdesbank-hook-memo` | `4eef590b` | 6 | 5 | 0 |
| `refs/heads/fix/tananyag-cim-osztaly` | `e5db9c9b` | 9 | 12 | 1 |
| `refs/remotes/origin/fix/tananyag-cim-osztaly` | `e5db9c9b` | 9 | 12 | 1 |
| `refs/heads/fix/eredmeny-email-foglalas` | `896f4fc4` | 7 | 7 | 0 |
| `refs/remotes/origin/fix/eredmeny-email-foglalas` | `896f4fc4` | 7 | 7 | 0 |
| `refs/heads/fix/szoletra-olvashatosag` | `69547067` | 14 | 38 | 6 |
| `refs/remotes/origin/fix/szoletra-olvashatosag` | `69547067` | 14 | 38 | 6 |
| `refs/heads/chore/kulso-ellenor` | `d4674ad2` | 42 | 26 | 9 |
| `refs/remotes/origin/chore/kulso-ellenor` | `d4674ad2` | 42 | 26 | 9 |
| `refs/heads/perf/kockavadasz-telefon` | `58969f07` | 24 | 32 | 32 |
| `refs/heads/chore/kapu-ingadozo` | `f98dfc42` | 28 | 24 | 24 |
| `refs/heads/fix/brainrot-e2e-idozites` | `50c31a29` | 4 | 2 | 2 |
| `refs/heads/fix/brainrot-kozos-kupon` | `87d3d5d8` | 37 | 36 | 15 |
| `refs/heads/chore/kapu-allitas-ellenor` | `82ea5b1a` | 9 | 19 | 19 |
| `refs/heads/chore/kapu-teszt-integritas` | `f894999e` | 6 | 8 | 8 |
| `refs/heads/docs/szkriptkapuk-terv` | `cfe88a12` | 3 | 2 | 2 |
| `refs/heads/chore/kapuk-beepites` | `ab87bf16` | 4 | 24 | 24 |
| `refs/heads/perf/kockavadasz-megjelenites` | `895c85d1` | 18 | 24 | 24 |
| `refs/remotes/origin/feat/jatek-j7b-tornado-utelagazas` | `bc91a969` | 27 | 31 | 31 |
| `refs/remotes/origin/feat/jatek-j3a-kockavadasz-runabanya` | `9083a7c0` | 16 | 23 | 23 |
| `refs/remotes/origin/feat/jatek-j6a-aszteroida-kristaly` | `9da0e8c2` | 12 | 26 | 26 |
| `refs/remotes/pr/426` | `dfdd4192` | 7 | 14 | 5 |
| `refs/remotes/pr/424` | `5ea84392` | 5 | 15 | 4 |
| `refs/remotes/pr/430` | `b919a703` | 4 | 15 | 9 |
| `refs/remotes/pr/425` | `b152e3c1` | 3 | 14 | 5 |

## Mainen megvalósult heti részeredmények

A sorok a main elsőszülői láncán lévő, igazolt PR-szeletek. A fájlnevek a változáshoz tartozó diffből valók. A nyitott folytatások az előző szakaszokban saját azonosítót kaptak.

- 2026-11-19 `b7165a56` — brit felolvasás lánca — rangsorolt hang, hangtár, előtöltés (hanglánc egyben, S8a–S8d) (#516). `source/client/src/lesson-runtime/ExperienceSpeech.tsx`, `source/tests/admin-route-guard.test.ts`. A felsorolásból S8c gyártás külön nyitott.
- 2026-11-19 `7176046f` — adventi képkészlet — képgyártó előkészítés és költségvédelmek (S3c-0) (#519). `docs/specs/2026-11-18-adventi-naptar-vegrehajtas.md`, `source/tests/advent-art-pipeline.test.ts`.
- 2026-11-19 `ce5205dc` — a böngészős kör (Playwright E2E) hat súlyozott szeletben, egy záró Playwright E2E ellenőrzéssel (#518). `.github/workflows/ci.yml`, `scripts/qa/e2e-shards.test.mjs`.
- 2026-11-19 `b930c0f3` — a Szökőár joystick-mérő stabilizálása – állapotra vár, a mérés szigora változatlan (#514). `docs/specs/2026-11-18-joystick-tsunami-stabil-vegrehajtas.md`, `source/tests/joystick-click-settle.test.ts`. `source/tests/joystick-response.spec.ts`.
- 2026-11-19 `14c859ee` — a kapu-hook hibája tiltás (onFailure: block), az audit-hook időtúllépéskor tilt (kanban 100, 126) (#506). `scripts/qa/gates/lint-gate.mjs`, `scripts/qa/gates/lint-gate.test.mjs`. Kanban #126.
- 2026-11-19 `f756588c` — a forrás ábrái a leckében — vizuális leltár, fedettségi kapu, új megjelenítők, kapcsoló mögött, alapból KI (fő lánc: #501 + #505 + #507 + S2a) (#515). `source/client/src/lesson-runtime/LessonRuntime.tsx`, `source/tests/explain-paragraphs.test.ts`.
- 2026-11-18 `dc76ba52` — Adventi naptár A – terv, közös mag és karácsonyi kérdéskészlet (flag mögött, futásidőben hatástalan) (#511). `source/shared/advent/assignment.ts`, `source/tests/advent-assignment.test.ts`.
- 2026-11-18 `a1342ba8` — nyílt feladat – rövid szöveges válasz elfogadása (#509). `source/server/ai/lesson-html-spec.ts`, `source/tests/open-answer-short.spec.ts`.
- 2026-11-18 `21c81998` — Brain Rot – több válaszidő (olvasási idő szerint), a menet-óra a többletidőre megáll (#497). `source/client/src/lib/brainRot/core.ts`, `source/tests/brainrot-core.test.ts`.
- 2026-11-18 `99c6dc29` — követő javítás – sim menetvégi statisztika (R1), tömör fogás-panel hosszú válaszoknál (R2) (kanban 89) (#500). `source/client/src/lib/wordLadder/sim.ts`, `source/tests/word-ladder-readability.spec.ts`.
- 2026-11-18 `cd3f7744` — kérdésbank S1 – ETag/304, ?classroom= változat, isPlayableQuestion-gyorsítótár (kanban #101) (#502). `source/server/gameQuizBankService.ts`, `source/tests/game-quiz-contract-cache.test.ts`.
- 2026-11-18 `b7622adf` — a kvíz eredménye is elmegy az eredménylevélben (részleges javítás, S1a) (#496). `source/client/src/lesson-runtime/LessonExperienceView.tsx`, `source/tests/lesson-result-email-quiz.spec.ts`.
- 2026-11-18 `56d1a9af` — szöveges válasz – a mondatvégi írásjel, szóköz és tipográfiai változat nem buktat (#493). `source/client/src/lesson-runtime/blocks/try-blocks.tsx`, `source/tests/fill-blank-punctuation.spec.ts`. Kanban #118.
- 2026-11-18 `49a849ef` — kapu-hook — héj szerinti parancs-értelmezés, kevesebb hamis tiltás (kanban 100, 3-4. kör) (#499). `scripts/qa/hooks/check-quality-gates.mjs`, `scripts/qa/hooks/check-quality-gates.test.mjs`.
- 2026-11-18 `2b873e3c` — useMaterialQuizzes – referencia-stabil kimenet (Kockavadász / Szökőár akadás gyökéroka, kanban #90) (#491). `source/client/src/hooks/useMaterialQuizzes.ts`, `source/tests/material-quizzes-hook-memo.test.ts`.
- 2026-11-18 `e0dba1db` — olvasható, nyugodt tempó és kiemelt célszó (kanban 89) (#498). `source/client/src/data/wordLadder/de.ts`, `source/tests/game-explanation-pause.spec.ts`. Kanban #89 alapkérése.
- 2026-11-18 `a7b3b787` — osztály a tananyag címénél és a keresőben — főoldal + admin (S1, #116) (#494). `source/client/src/components/AdminFileDashboard.tsx`, `source/tests/home-views.test.ts`.
- 2026-11-18 `3ff4d173` — eredménylevél – atomi foglalás a küldés előtt, szerveres kvíz az utolsó válasznál (#495). `source/server/lesson-result-email.ts`, `source/tests/learning-db.integration.ts`. Kanban #110.
- 2026-11-18 `3924beb7` — külső, más rendszerű (Gemini) ellenőr a minőségkapuk mellé — második vélemény (a #489-re épül) (#490). `scripts/qa/gates/external-review.mjs`, `scripts/qa/gates/external-review.test.mjs`.
- 2026-11-18 `54620024` — ingadozók 3. kör – CI-stabilizálás: joystick-mérő, eredmény-e-mail, párbaj, győzelmi képernyő, Neon védőtorony, Brain Rot (kanban #76, #31, #106) (#492). `docs/specs/2026-11-17-e2e-ingadozok-3-vegrehajtas.md`, `source/tests/duel-online.spec.ts`. Kanban #31, a többi ingadozó külön tétel.
- 2026-11-18 `a11b1b79` — J1a – Szökőár „Hegyre fel!”: háromsávos futás + Kapukérdés (#483). `source/client/src/game-engine/play/questionDirector.ts`, `source/tests/brainrot-core.test.ts`. Kanban #78.
- 2026-11-17 `b4b84db6` — J5a – Brain Rot „Lény-aréna”: aréna-mozgás, menekülő lények, Ketrec-zár, valós óra (#485). `source/client/src/lib/brainRot/core.ts`, `source/tests/brainrot-core.test.ts`.
- 2026-11-17 `26bae97f` — kötelező minőségkapuk — lint / szakasz / push / PR / merge kapu, független fejlesztési ellenőr, hook, öt skill (#489). `.github/workflows/ci.yml`, `scripts/qa/gates/lib.test.mjs`.
- 2026-11-17 `46931d8c` — ügynök-vezérlő anyagok diétája – 1. lépcső (csapda-index, skillek, kanban) (#488). `.agents/skills/tananyag-javito/SKILL.md`.
- 2026-11-17 `25fc2841` — #84 – a material-quizzes tétel valódi tantárgya (subject), Tornado-besorolás (#487). `source/client/src/lib/tornado/questions.ts`, `source/tests/quiz-bank-scale-db.integration.ts`.
- 2026-11-17 `443d6b76` — J7a – Tornado Hunter 200: javítások (#482). `source/client/src/lib/tornado/questions.ts`, `source/tests/tornado-j7a.spec.ts`.
- 2026-11-17 `81510522` — retro 2026-11-17 + csapdák C-61…C-72 (#481). `docs/agent-csapdak.md`.
- 2026-11-17 `31dfcdea` — JM3a-2 – a #464 review-utómunkája: token-forgatás, kétoldalú visszavágó, megtelt-képernyő, e2e és meta-mérő a Párbajra (#476). `source/client/src/lib/duel/session.ts`, `source/tests/duel-bot.spec.ts`.
- 2026-11-17 `b826932d` — JM7b-utójavítás K1b – kulcsrotáció-egyeztetés nem töröl, tiltás-karbantartás csak élesben, runbook (#475). `source/server/index.ts`, `source/tests/player-account-db.integration.ts`.
- 2026-11-17 `eb2a4ebe` — a megoldás-kijelzés az első képkockától számít, Matek e2e lapon belüli mérés (main CI 43943054869) (#480). `source/client/src/game-engine/play/questionUi.ts`, `source/tests/game-play-question-ui.test.ts`.
- 2026-11-17 `bab40853` — a lejárt kupon minden kuponos játékot megállít, joystick-mérő és szóbank-napló e2e (#58, 2. kör) (#477). `source/client/src/game-engine/CouponHud.tsx`, `source/tests/coupon-expired-all-games.spec.ts`.
- 2026-11-17 `76cf426a` — #67 quiz-bank végpont – nincs kérésenkénti teljes lecke-beolvasás (OOM-javítás) (#478). `source/server/curriculum/load.ts`, `source/tests/quiz-bank-scale-db.integration.ts`.
- 2026-11-17 `f7894087` — címőr – szűk kivétel a szintetikus Gmail-tesztcímekre (main piros) (#479). `docs/specs/2026-11-16-valodi-cimek-ki-vegrehajtas.md`, `source/tests/no-real-emails-guard.test.ts`.
- 2026-11-16 `24add8b6` — J4b – Matek főellenfél: Zéró-robot és Hibagyár, Számlánc, Becslő-bomba (#466). `source/client/src/game-engine/play/questionDirector.ts`, `source/tests/speed-math-boss.spec.ts`.
- 2026-11-16 `38861d28` — valódi e-mail-címek ki a nyilvános repóból + őr-teszt, #462 N2–N4 (#57, #61) (#474). `source/client/src/pages/AdminDocumentation.tsx`, `source/tests/admin-access-source-guard.test.ts`.
- 2026-11-16 `2c21484b` — retro + csapdák C-47…C-60 + terv-állapotsorok + telepítés előtti őr (#65, #63) (#473). `scripts/qa/active-runs-guard.sh`.
- 2026-11-16 `5cb3cd3e` — JM7b-utójavítás K1 – a tiltás megmarad a fiók törlése után (tiltás-ujjlenyomat, migráció 0041) (#471). `source/client/src/components/PlayersPanel.tsx`, `source/tests/admin-authz-matrix-db.integration.ts`.
- 2026-11-16 `83a648c8` — Belépés / Fiókom belépő a Játékok oldalon (PLAYER_ACCOUNTS mellett) (#472). `source/client/src/components/PlayerEntry.tsx`, `source/tests/player-entry.spec.ts`.
- 2026-11-16 `5bb648ca` — JM3a – Párbaj online két főre + gépi ellenfél (D21 szobanyitási jog, olvasási idő-alapú ablak) (#464). `source/client/src/App.tsx`, `source/tests/admin-route-guard.test.ts`.
- 2026-11-16 `66b67317` — Kockavadász – lejáratkor a játék megáll, a main E2E-ingadozásai (#58) (#470). `source/client/src/pages/BlockCraftQuiz.tsx`, `source/tests/block-art.spec.ts`.
- 2026-11-16 `6a4f7a48` — Vihargarázs telefonon – lapgörgetés, járműsor felül, SVG-járműkép, fejlesztés árral, meta-képernyő mérő (X1–X7) (#59) (#467). `source/client/src/components/GamePedagogyPanel.tsx`, `source/tests/game-meta-quality.spec.ts`.
- 2026-11-16 `1db45c5f` — JM7b-utójavítás N1b – a becenév-szűrő maradék kijátszásai (futam-tűrés, 2/6/9, rn/vv/cl, szólista) (#469). `source/shared/player-nickname.ts`, `source/tests/nickname-filter.test.ts`.
- 2026-11-16 `015b5a9a` — JM7c-1 – az admin-jog egyetlen forrása az engedélylista + state a meglévő Google-úton (#462). `render.yaml`, `source/tests/admin-access-source-guard.test.ts`.
- 2026-11-16 `78809df3` — „Programozás” felirat a programozási lecke oldalán, e2e-módban nincs eseményalapú mentés (#54) (#468). `source/client/src/lesson-runtime/LessonRuntime.tsx`, `source/tests/auto-backup-event.test.ts`.
- 2026-11-16 `d5c91060` — J2a – Szólétra „Szikla-verseny”: mag, szó-kapaszkodó, rivális, vereség (#454). `source/client/src/game-engine/scenes/LadderScene3D.tsx`, `source/tests/game-explanation-pause.spec.ts`.
- 2026-11-16 `fe7c89fb` — az admin évfolyam-módosítása Studio-leckénél is következetes (#54) (#465). `source/server/material-classroom.ts`, `source/tests/classroom-badge.spec.ts`.
- 2026-11-16 `13160155` — JM7b-utójavítás – becenév-szűrő l/I/1 csere (N1), a fióktörlés nem akasztható meg (N3) (#461). `source/server/player/account-routes.ts`, `source/tests/nickname-filter.test.ts`.
- 2026-11-16 `d2c4c7d0` — JM7b-utójavítás N2 – tiltott játékos saját adatai (letöltés, törlés), admin végleges törlés (#463). `source/client/src/components/PlayersPanel.tsx`, `source/tests/admin-authz-matrix-db.integration.ts`.
- 2026-11-16 `ba9c666c` — JBc – évfolyam-bank 10–12. évfolyam (90 → 285) + független számoló 10–12.-es alakokra (#458). `source/client/src/data/gradeQuizBank/grade-10.ts`, `source/tests/grade-quiz-bank-coverage.test.ts`.
- 2026-11-16 `e1852e89` — JM1r – az egyeszközös párbaj törlése (D20), bot-szimuláció a room-machine-en, megjelenítő komponensek kiemelve (#460). `source/client/src/App.tsx`, `source/tests/duel-arena.spec.ts`.
- 2026-11-16 `340e63dd` — évfolyam-felirat a főoldali és az admin tananyagkártyákon (#54) (#459). `source/client/src/components/AdminFileDashboard.tsx`, `source/tests/classroom-badge.spec.ts`.
- 2026-11-16 `ef43d4ca` — közös utójavítás – calm(), React-mentes questionUi, pointerTapHandlers, mozgó cél a mérőben (#457). `source/client/src/game-engine/play/director.ts`, `source/tests/game-director.test.ts`.
- 2026-11-16 `9038fce2` — joystick-reakció – egy holtsáv, folytonos görbe, analóg bekötés (kanban #49) (#456). `source/client/src/game-engine/VirtualJoystick.tsx`, `source/tests/game-touch-controls.test.ts`.
- 2026-11-16 `62f50954` — K.7 – a szóbank hiányos mondata rövid játék-alakban (fordítás nélkül, egyértelműségi szabállyal) (#455). `source/client/src/game-engine/vocab/questionGenerator.ts`, `source/tests/play-lab-cloze-game.spec.ts`.
- 2026-11-16 `50605100` — JM7b – játékos Google-út, becenév + avatar, kis fiók, adatletöltés / törlés, admin Játékosok tiltás (PLAYER_ACCOUNTS, alapból KI) (#449). `source/client/src/App.tsx`, `source/tests/admin-authz-matrix-db.integration.ts`.
- 2026-11-16 `bad7bd59` — JBb – évfolyam-bank 7–9. évfolyam (90 → 285) + évfolyamonkénti lusta betöltés (#453). `source/client/src/data/gradeQuizBank/grade-03.ts`, `source/tests/grade-quiz-bank-coverage.test.ts`.
- 2026-11-16 `f06c35df` — JM2 – valós idejű réteg: Socket.IO (/api/rt/io), belépőjegy, szerver-tekintélyű szoba, korlátok, drain (MP_MODE alapból off) (#452). `source/client/src/lib/rt/rtClient.ts`, `source/tests/admin-route-guard.test.ts`.
- 2026-11-16 `b82ea71d` — J4a – Neon védőtorony: drón-célpontos matek, fosztogató-hullámok, tiszta mag (#451). `source/client/src/game-engine/play/questionDirector.ts`, `source/tests/game-feedback-wiring-guard.test.ts`.
- 2026-11-16 `59a647f2` — J0c-b – a hosszú kérdés koppintás nélkül végigolvasható a kérdés-sávban (#450). `source/client/src/game-engine/play/InlineQuestion.tsx`, `source/tests/game-prompt-fit.test.ts`.
- 2026-11-16 `17d95333` — JM1 – párbaj-szabálymotor (shared/duel) + egyeszközös Párbaj aréna (#447). `source/client/src/App.tsx`, `source/tests/duel-arena.spec.ts`.
- 2026-11-16 `ca3d7141` — JBa – évfolyam-bank bővítése (3–6. évfolyam, 90 → 285 tétel) (#448). `source/client/src/data/gradeQuizBank/grade-03.ts`, `source/tests/grade-quiz-bank-coverage.test.ts`.
- 2026-11-16 `57bd1b0e` — J0c – közös UI: nem blokkoló kérdés-sáv, Miért?, Gyakorold még, felolvasás, play-lab (#446). `source/client/src/App.tsx`, `source/tests/game-play-question-ui.test.ts`.
- 2026-11-16 `9bda1373` — JM7a – admin-jogosultsági mátrix + őr, Google e-mail-megerősítés, player_accounts + e-mailes belépés (PLAYER_ACCOUNTS, alapból KI) (#445). `source/client/src/App.tsx`, `source/tests/admin-authz-matrix-db.integration.ts`.
- 2026-11-16 `bf804bfb` — J0b – tanulási mag (ismétlési sor, áramlat, kombó, hullám, statisztika, kérdés-ütemező, harness, őrök) (#444). `source/client/src/game-engine/play/clock.ts`, `source/tests/game-combo-waves.test.ts`.
- 2026-11-16 `c53040a9` — JM0 – adatvédelem: ranglista becenévvel, e-mail ki a naplóból, pontbeküldés korlát + runId (#443). `source/client/src/lib/gameScoreRetry.ts`, `source/tests/jm0-game-score-privacy.spec.ts`.
- 2026-11-16 `19aa86e6` — J0a – determinizmus és játékérzet (#442). `source/client/src/game-engine/play/director.ts`, `source/tests/game-director.test.ts`.
- 2026-11-16 `d1794c91` — játékélmény-terv és végrehajtási utasítás (J0–J9) (#440). `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md`.
- 2026-11-16 `ee01f349` — Tornado magyar HUD és menüfeliratok (E24) + felirat-javítások az éles próbából (#439). `source/client/src/game-engine/feedback.ts`, `source/tests/block-craft-real-touch.spec.ts`.
- 2026-11-16 `86a39ae2` — S13b – záró szelet: review-leletek, közös modális réteg, mérő-szigorítás, záró őrök, retro (#438). `source/client/src/components/AchievementToast.tsx`, `source/tests/coupon-expired-all-games.spec.ts`.
- 2026-11-16 `b5041240` — S13a – játéklista és kártyák arculata, szóbank-utójavítások, mérő-pontosítás (#437). `source/client/src/components/HomePracticeGames.tsx`, `source/tests/game-answer-btn-layer.test.ts`.
- 2026-11-16 `6aa94ed7` — a lejárt játékidő párbeszéde a szünet- és eredményréteg fölött (#436). `source/client/src/game-engine/CouponHud.tsx`, `source/tests/coupon-expired-layer.test.ts`.
- 2026-11-16 `892097ca` — S12 – Tornado Hunter 200 mobilra + szóbank (#433). `source/client/src/lib/tornado/questions.ts`, `source/tests/games-touch-controls.spec.ts`.
- 2026-11-16 `8a92cd7a` — S10 – Galaktikus Aszteroida mobilra + szóbank (#434). `source/client/src/game-engine/scenes/spaceBackdrop.ts`, `source/tests/remaining-learning.spec.ts`.
- 2026-11-16 `fbb00395` — S11 – Kockavadász kvíz mobilra + szóbank (#435). `source/client/src/lib/blockCraftSubjects.ts`, `source/tests/blockcraft-mobile.test.ts`.
- 2026-11-16 `e729789c` — S6 – Szólétra mobilra + központi szóbank (#430). `source/client/src/game-engine/scenes/LadderScene3D.tsx`, `source/tests/word-ladder-vocab.test.ts`.
- 2026-11-16 `50c6041c` — S7 – Gyors matek sprint mobilra (#425). `source/client/src/pages/SpeedQuizMath.tsx`, `source/tests/speed-quiz-mobile.test.ts`.
- 2026-11-16 `7ae49b33` — S8 – Brain Rot Lopás mobilra + szóbank (#424). `source/client/src/game-engine/scenes/BrainRotArena3D.tsx`, `source/tests/brainrot-tuning.test.ts`.
- 2026-11-16 `d3628b50` — S9 – Szökőár szökés mobilra + szóbank (#426). `source/client/src/game-engine/scenes/TsunamiScene3D.tsx`, `source/tests/tsunami-mobile.test.ts`.
- 2026-11-16 `0b386870` — a kérdésgenerátor kizárja az átfedő jelentésű elterelőket (#432). `source/client/src/game-engine/vocab/index.ts`, `source/tests/vocab-distractor-overlap.test.ts`.
- 2026-11-16 `4075df5c` — S3 – angol szóbank-tartalom (2664 bejegyzés) + vak megoldó (#431). `source/client/src/data/vocabBank/en/level-0.ts`.
- 2026-11-16 `09f8307f` — a mobil mérő kiszűr két környezeti WebGL-figyelmeztetést (#429). `source/client/src/components/AchievementToast.tsx`, `source/tests/game-mobile-quality.spec.ts`.
- 2026-11-16 `cf5b591c` — S5 – francia szóbank-tartalom (2064 bejegyzés) + vak megoldó (#428). `source/client/src/data/vocabBank/fr/level-0.ts`.
- 2026-11-16 `e51c9926` — S4 – német szóbank-tartalom (2080 bejegyzés) + vak megoldó (#427). `source/client/src/data/vocabBank/de/level-0.ts`.
- 2026-11-15 `ad49a9ca` — a szóbank riport-tesztje a nyelv stage-éhez igazodik (S3–S5 élesítés tesztmódosítás nélkül) (#423). `source/tests/vocab-bank-validate.test.ts`.
- 2026-11-15 `9f87c942` — S1 – szóbank-infrastruktúra (#421). `source/client/src/data/vocabBank/de/level-0.ts`, `source/tests/vocab-bank-validate.test.ts`.
- 2026-11-15 `050778d5` — S2 – közös mobilos játékkeret (#422). `source/client/src/game-engine/HoldButton.tsx`, `source/tests/game-mobile-quality.spec.ts`.
- 2026-11-15 `bf100e9f` — S0 – terv és végrehajtási utasítás (játékok mobilra + nyelvi szóbank) (#419). `docs/specs/2026-11-15-jatekok-mobil-szobank-vegrehajtas.md`.
- 2026-11-15 `25c89d57` — a Playwright E2E job ubuntu-24.04-en fut (az ubuntu-latest 26.04-et a Playwright 1.57 nem támogatja) (#420). `.github/workflows/ci.yml`.
