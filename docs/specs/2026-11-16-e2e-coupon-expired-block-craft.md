# Kockavadász: lejáratkor a játék megáll (ingadozó `coupon-expired` e2e, kanban #58)

**Állapot:** folyamatban – 2026-11-16, ág `fix/e2e-coupon-expired-block-craft`
**Végrehajtási utasítás:** `docs/specs/2026-11-16-e2e-coupon-expired-block-craft-vegrehajtas.md`

## Tünet

A `source/tests/coupon-expired-all-games.spec.ts` › `block-craft-quiz: lejáratkor a Vissza a leckéhez…` eset a CI
„Playwright E2E” jobjában (GPU nélkül, szoftveres WebGL, buildelt szerver, 1 worker) mindhárom kísérletben
`Test timeout of 30000ms exceeded`-del bukott, kódot nem érintő PR-okon is:

| futás | fej | eredmény |
| --- | --- | --- |
| 43892703356 | b3d7bccc (`feat/jatek-j2a-szoletra`) | 31,8 s és 41,8 s időtúllépés, a 3. kísérlet 20,0 s alatt átment (flaky) |
| 43902839880 | 17fa5d3a (`feat/jatek-jbc-evfolyam-bank`) | 36,0 s / 40,6 s / 30,3 s, mind időtúllépés |
| 43907199578 1. kísérlet | 5536e179 (`fix/jatek-fiok-becenev-szuro`) | 33,6 s / 43,7 s / 32,6 s, mind időtúllépés |

A hibaüzenet (`game-pause-menu` `toHaveCount(0)` vagy `coupon-expired` `toBeVisible`, „Received: undefined”) félrevezető:
a riport lépésidői szerint (playwright-report artifact, a riport-JSON lépései) **minden elvárás teljesült**, a szünet menü
nem nyílt meg, a párbeszéd látszott (az `error-context.md` oldalpillanatképe: `dialog "Idő lejárt"`, szünet menü nincs).
A 30 s-os tesztkeret fogyott el, és az éppen futó lépés kapta a megszakítást („Received: undefined” = nem volt
kiértékelt eredmény).

## Mérés (CI-riport)

- A lejárat UTÁNI minden Playwright-művelet egy ~0,6–0,7 s-os kvantum többszöröse: `toHaveCount` 707 ms,
  `toBeVisible` 712 ms, `toBeFocused` 708 ms, egy `keyboard.press` (keydown + keyup) 1,42–1,47 s, a 2. kísérletben 2,6–3,0 s;
  az `elementFromPoint`-os `evaluate` 4,4–6,2 s. A 8 billentyű egymagában 11–21 s.
- Ugyanebben a futásban a többi négy kuponos játék ugyanezen esete 5,8–10,1 s alatt fut le.
- A szám egy renderer-képkocka ideje: a CDP bemeneti esemény és a kiértékelés a következő képkockára vár, a
  képkockát pedig a lejárat UTÁN is folyamatosan futó three.js voxel-render foglalja szoftveres WebGL-en.

## Gyökérok

`source/client/src/pages/BlockCraftQuiz.tsx` render-ciklus-vezérlője (`shouldRun = (phase === "play" || phase === "quiz")
&& !paused`) és a játékóra (`if (phase !== "play" || paused) return;`) nem ismeri a kupon lejáratát. A
`CouponExpiredOverlay` (közös `game-engine/CouponHud.tsx`) a játékot inertté teszi és a billentyűket elnyeli, de a
Kockavadász a sötét fedőréteg alatt **tovább szimulál és renderel**: a voxel-jelenet minden képkockában újrarajzolódik
(CPU-n, SwiftShaderrel ~0,15–0,7 s / képkocka), és a játékóra is tovább jár (a `setInterval` csak a `phase` / `paused` szerint áll le; helyi
mérés: a végrehajtási utasítás „Mérés” része). A többi négy kuponos játék 2D / DOM-alapú, ott a háttérben futó ciklus olcsó — ezért csak a
Kockavadásznál fogy el a keret.

Ez termékhiba is: a lejárt játékidő után a játék nem áll meg (a gyerek nem tud beavatkozni, mégis fogy a pálya ideje és
pörög a GPU / akku), ellentétben a szünettel, ahol a S11 óta a render-ciklus és az óra is áll.

## Javítás (cél)

- A Kockavadászban a kupon lejárata ugyanúgy megállítja a render-ciklust és a játékórát, mint a szünet — a szünet menü
  megnyitása NÉLKÜL (a lejárati párbeszéd marad az egyetlen réteg).
- Lejáratkor a játék elengedi a futó mozgást és (ha volt) a pointer lockot játék-kezdeményezett módon, hogy a
  böngésző Esc-es lock-elengedése ne nyisson szünet menüt a párbeszéd alatt.
- A teszt-kampó `probe()` új `frames` mezője (a render-lépések száma) teszi mérhetővé, hogy a ciklus áll.

## Nem cél

- A teszt időkorlátjának emelése vagy az elvárások lazítása (a teszt változatlan marad).
- A közös `CouponHud.tsx` / `useCouponSession` átírása, a többi négy kuponos játék módosítása (azoknál a háttérben futó
  óra külön jegy — ld. a végrehajtási utasítás „Nyitott” részét).

## Edge case-ek

- Lejárat kvíz közben: a render-ciklus a `quiz` fázisban is áll (a kvízkártya inert a párbeszéd alatt).
- Lejárat szünetben: a szünet menü a párbeszéd alatt inert marad; a ciklus eddig is állt.
- Kupon nélkül (szabad játék) a `coupon.expired` mindig hamis: a viselkedés változatlan.

## Elfogadás (EARS)

- AMIKOR a kupon lejár játék közben, a Kockavadász render-ciklusa megáll (`probe().frames` nem nő), és a játékóra nem
  jár (a HUD másodperc-felirata nem változik).
- AMIKOR a kupon lejár, a szünet menü NEM nyílik meg, a „Vissza a leckéhez” gomb fókuszban marad (a meglévő teszt
  változatlanul zöld).
- HA nincs kupon, a játék viselkedése változatlan (a Kockavadász meglévő e2e-i zöldek).
- A CI-ban a teljes E2E zöld; a javított eset futásideje a lejárat utáni szakaszban képkocka-várakozás nélküli.

<!-- acceptance-checklist -->
- [ ] Lejáratkor a render-ciklus áll (új e2e: `frames` nem nő).
- [ ] Lejáratkor a játékóra áll (új e2e: a HUD-felirat változatlan).
- [ ] A meglévő `coupon-expired-all-games` mind az 5 játékra zöld, változatlan elvárásokkal.
- [ ] Mérés előtte / utána (GPU, SwiftShader, CPU-lassítás) a végrehajtási utasításban.
- [ ] Kockavadász többi e2e-je + a közös mobil mérő `-g block-craft` esetei zöldek.
- [ ] CI teljes E2E zöld a PR-on.
