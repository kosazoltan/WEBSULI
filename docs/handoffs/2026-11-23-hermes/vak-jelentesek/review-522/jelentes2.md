# Független review — chore/bence-maradvany-tisztitas
Fej: 6ed0e355c59fc698cca34cedf4ff5d6a695c454d
## Ítélet: IGEN, FELTÉTELLEL

A feltétel az alábbi leletek jegyre vétele. A fej diffjében nem találtam megszűnt review-parancsot, megváltozott kötelező CI-jobot, új jogosultságot vagy merge/push automatizmust. Az új őr viszont nem védi teljesen a review-indítást, és a kulcsváltás dokumentált visszaállítása megismételhet egy már elküldött indítást.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

- **L1 — közepes, jegyre menő — Az őr nem észleli, ha a `Check` nem fut le a `Post` előtt.** `source/tests/auto-review-workflow-guard.test.ts:121–129,162–165`. Egy karbantartó a `Check` lépés `uses` sora után hozzáadja az `if: ${{ false }}` feltételt, vagy a `Post` lépést a `Check` elé teszi. GitHubon a `Post` számára nincs `already` kimenet, ezért a feltétele nem teljesül és a nem draft PR-ra sem kerül indító komment. Az őr név szerint keresi a lépéseket, nem ellenőrzi a sorrendjüket vagy a `Check` saját feltételét. A VM-próba ezzel szemben feltétel nélkül a `Check`-kel kezd. A böngészős, elszigetelt szerkezeti próbában mindkét mutáns átment a `checkStructure`-ön. A követett teszt többi assertionje és beépített mutánsai sem kötik meg ezt a két tulajdonságot, amit forrásból ellenőriztem. **Javítás:** a tényleges job `steps` listáján ellenőrizni, hogy a `Check` feltétel nélküli és a `Post` előtt áll; a két mutánst rögzíteni.
- **L2 — közepes, jegyre menő — A jogosultságőr csak a workflow-szintű blokkot nézi.** `source/tests/auto-review-workflow-guard.test.ts:189–201`. Ha egy karbantartó csak a `trigger-review-bots` jobhoz ad olvasási `permissions`-t, a felső blokk változatlan marad, az őr összehasonlítása továbbra is sikeres. A job tényleges tokenje viszont már nem tud kommentet írni. Ugyanezért egy job-szintű jogosultságbővülés sem látszana a tesztben. A VM-ben a `createComment` csak egy tömbbe ír (`:148–149`). A vizsgált fejen nincs ilyen felülírás. **Javítás:** ellenőrizni a job effektív jogosultságait vagy megtiltani a job-szintű felülírást; hozzáadni egy csak olvasási mutánst.
- **L3 — kicsi, jegyre menő — Egy üres YAML-sor hamis kapubukást okozhat.** `source/tests/auto-review-workflow-guard.test.ts:215–222`. A fejlesztő üres sort tesz a `Check` `id: check` és `uses` mezői közé. Az elszigetelt próba eredménye `[true,false]`: a szerkezeti ellenőrzés sikeres, de az egymást követő sorokat kereső mutátor nem változtat semmit. A követett teszt erre a `:221` soron bukik, holott a spec §7 formázástűrést ír elő, és az üres sor nem változtat a YAML jelentésén. **Javítás:** a mutációkat külön, stabil fixture-ön futtatni, vagy mezőt módosítani a szomszédos sorok szövege helyett.
- **L4 — kicsi, jegyre menő — A visszaállítás elveszti az új kulccsal már rögzített állapotot.** `docs/specs/2026-11-19-bence-maradvany-tisztitas.md:118`, `.github/workflows/auto-review.yml:54–60,69–72`. A fej kommentelt egy PR-ra. Egy karbantartó visszaállítja a régi workflow-t, majd ugyanarra a fejre olyan `reopened` futás érkezik, amely a régi definíciót használja. A base olvasója csak a régi kulcsot keresi, a mostani kommentben pedig csak az új van: ismét eljut a kommentírásig. Az ál-API-s próbában a base kulcsfeltétele nem illeszkedett az új kommentre; fordított irányban a kompatibilitás működött. **Javítás:** a visszaállítás tartsa meg a kétkulcsos olvasót, és írja elő az azonos SHA-s ellenpróbát.
- **L5 — kicsi, jegyre menő — A párhuzamos futás nincs benne az „egyetlen komment” kivételeiben.** `docs/specs/2026-11-19-bence-maradvany-tisztitas.md:85–88`, `.github/workflows/auto-review.yml:45–60,97–102`. Ha egy karbantartó változatlan fejjel gyorsan kétszer újranyit egy PR-t, mindkét listázás történhet az első írás előtt. A helyi ál-API-s próbában sorosan egy, párhuzamosan két komment keletkezett, mindkét párhuzamos döntés `already=false` volt. A base is két külön műveletet végzett; ez **nem új versenyhiba**, hanem a specben a lapozásnál korlátozott garancia pontatlan. **Javítás:** ebben a viselkedést megőrző szeletben pontosítani az elfogadást; valódi egyszeriséghez külön jegyen PR/SHA-szintű összehangolást tervezni.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — normál úton próbáltam, nem sikerült megtörni; visszaállításban találtam hibát (L4).** A `pull_request.head.sha` → `state_key` → `STATE_KEY` → komment első sora lánc illeszkedik (`auto-review.yml:54–72`). Üres listára posztol, azonos SHA új és régi kulcsa után sorosan nem, eltérő SHA után igen. A teszt a rossz PR-szám mutánst is ellenőrzi.
2. **Biztonság, adatvédelem — találtam őrhibát (L2), a tényleges diffet nem sikerült megtörni.** A workflow `permissions` és az action verziója változatlan. Az API-út csak listáz és PR-kommentet ír, a log állapotkulcsa commit-SHA-t tartalmaz; nem találtam új titkot, tokent vagy személyes adatot. Alkalmazásoldali CSRF/origin és GET-mellékhatás nem érintett.
3. **Regresszió — élő törött repóhivatkozást nem találtam; a rollback kivétel (L4).** Követett fájlokban kerestem a törölt neveket. A tervpáron kívüli konkrét találat a szándékosan megtartott történeti bejegyzés (`memory/projects/websuli/LEDGER.md:81`). A valódi `git ls-files` ellenőrzés és a memóriaindex-tesztek zöldek. A `source/.harness/` ignore-szabály és az alkalmazáskód változatlan; tanulói és Stúdió-folyamat nem alkalmazható.
4. **Europe/Budapest — nem alkalmazható.** A döntés PR-eseményhez, draft-jelzőhöz és SHA-hoz kötött, nem dátumhoz.
5. **Migráció, életciklus, e2e-mód — nem alkalmazható az alkalmazásra.** Nincs DB-/Drizzle-, cron- vagy indítási változás. A workflow négy PR-eseménye és a draft-feltétel azonos a base-szel (`auto-review.yml:24–38`).
6. **Versenyhelyzet, ismétlés, megszakadás — találtam hibát (L4, L5).** A soros ismétlések rendben; a párhuzamos próba két azonos SHA-s kommentet eredményezett. A listázás korlátja változatlan (`per_page: 100`). Az éles API-időtúllépés és a futás megszakítása UNVERIFIED.
7. **Tesztminőség és dokumentáció — találtam hibát (L1–L3, L5).** Meglévő kaputesztet a diff nem gyengített. Az új teszt tényleges JS-t futtat a törzsre és a kulcsra; a YAML-végrehajtási rendet és a job jogosultságát viszont nem méri teljesen. A tisztítás és az őr tesztmódszere dokumentált; a formázástűrés és az egyszeriség állításaihoz a fenti ellenpéldák tartoznak.
8. **Review-trigger, workflow, kapuk — a vizsgált fájlokban nem találtam tényleges konfigurációvesztést.** A három indító (`@sourcery-ai review`, `@codex review`, `@vercel run a review`) és az átfogó bekezdés azonos a base-szel (`auto-review.yml:80–90`). A harmadik szöveges indító Vercel, nem Copilot; a base-ben sem volt Copilot-parancs, a `.github/copilot-instructions.md` változatlan. A fájl, a job azonosítója és neve maradt; a workflow neve a terv szerint változott. A YAML vázát diffben és a JS-t futással néztem; GitHub Actions validálás UNVERIFIED. A `ci.yml`, a kapuszkriptek és a hatókör-konfig változatlanok. A szakaszkapu őrglobja és a CI Unit Tests globja is felveszi az új tesztet (`stage-gate.mjs:64–82`, `ci.yml:89–90`).
9. **Egyéb — kerestem, nem találtam új merge/push műveletet vagy élő szereposztást.** A zárómondat az orkesztrátorhoz rendeli a merge-et a kapuk után. Az egyetlen megengedett szerepnév-maradvány a régi kulcs olvasása (`auto-review.yml:57`). Nincs merge API, repóírás vagy push parancs.

## Mit próbáltam megtörni, és nem sikerült

- Normál, soros kulcsváltás: új kulcsos komment után ismételve összesen egy komment maradt; régi kulcs után nem született második. A követett teszt eltérő SHA-val, hiányzó és `null` törzzsel is zöld.
- Indítók és kapuk: a base-hez viszonyítva megmaradt a három indító, a PR-eseménylista, a job neve és a felső jogosultságblokk. A hiányzó kötelező checkre és a repószintű main-elmozdulásra vonatkozó elutasítás tesztje zöld.
- Törölt fájlok: a hivatkozáskeresés és az indexből olvasó őr nem mutatott működő függőséget a régi fájlokra.

## Mit NEM vizsgáltam

- **UNVERIFIED:** tényleges GitHub-ruleset/branch protection, a telepített botok reakciója, a fork-PR tokenje, az éles ütemezés és API-timeout. Nem hoztam létre PR-t, és nem írtam GitHubra. A böngészős próba csak helyi stubot futtatott.
- A teljes `gate:stage` a futtatóban nem engedélyezett; a saját Node-mutációs scriptet a sandbox letiltotta a rendelkezésre álló Node-verzión. A teljes őr mutált workflow-val **UNVERIFIED**. Nem használtam külön YAML-séma-validátort.
- Adatbázis- és termék-UI/E2E-próba, illetve álló/fekvő képernyőkép nem alkalmazható: egyik terület sem változott. A törölt naplóban említett történeti kulcsrotáció tényleges státusza **UNVERIFIED**; a Git-történet és a külső fiókok nem voltak a változtatás hatókörében.

## Megcáfolt gyanúk

- A névváltás nem törölte a `Trigger Sourcery + Codex review` jobot, és a repóban nincs talált futó függőség a régi workflow-névre. A távoli beállítások ebből nem következnek.
- Az eltűnt „Post-CI badge” nem törölt futási lépés: a base-ben is csak fejléc-megjegyzés volt.
- A `.harness/release-log.md` LEDGER-említése múltbeli esemény, nem betöltött fájl. A trigger új kommentje nem ígér automatikus merge-et.

## Mit futtattam (parancs + eredmény)

- `npx tsx --test source/tests/auto-review-workflow-guard.test.ts source/tests/memory-index-guard.test.ts` — 14 átment, 0 bukott.
- `node --test scripts/qa/gates/stage-gate.test.mjs scripts/qa/gates/pre-merge-gate.test.mjs scripts/qa/three-phase-check.test.mjs` — 25 átment, 0 bukott.
- `npx tsc --noEmit -p tsconfig.test.json` — kilépési kód 0.
- `run_browser_scenario .blind-review-tmp/review-workflow-guard-structure.json` — elszigetelt próba: a letiltott és a felcserélt lépés átment; az üres sor mellett a szerkezet átment, a beépített mutátor nem módosított.
- `run_browser_scenario .blind-review-tmp/review-workflow-race.json` — elszigetelt próba: sorosan 1, párhuzamosan 2 komment; régi → új 0 extra komment; az új kulcsra a régi feltétel nem illeszkedett.
- `npm run gate:stage` és `node .blind-review-tmp/workflow-guard-mutation.mjs` — futtató által elutasítva, nincs teszteredmény.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 0 | 0 | 0 | 0 | 0 |
| közepes | 2 | 2 | 0 | 1 | 0 |
| kicsi | 3 | 3 | 0 | 3 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (közepes) Az őr nem észleli, ha a Check nem fut le a Post előtt — `source/tests/auto-review-workflow-guard.test.ts:124` — hivatkozás igazolt; RÉSZBEN igazolt (elszigetelt próba: scenario)
- **L2** (közepes) A jogosultságőr csak a workflow-szintű blokkot nézi — `source/tests/auto-review-workflow-guard.test.ts:189` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 23 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 4568
- tokenek: 1280448 bemeneti (ebből gyorsítótárból: 1199107, gyorsítótárba írva: 81272), 21794 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 94.2%; becsült megtakarítás: 4.4753 USD
- költség (a tényleges usage alapján): 0.5412 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
