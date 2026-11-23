# Független review — szóhatáros PR-kapu, 2. kör
Fej: 983e0a3e2b79599ff96e631c01db48d951f00dbc
## Ítélet: IGEN, FELTÉTELLEL
A korábbi blokkoló megszűnt. Új blokkolót nem igazoltam; két kis peremeset megy jegyre. A teljes adventi PR-C fájllistára vonatkozó K4-mérés független újramérése nyitott.

## Az előző kör leleteinek sorsa
- **L1 — megszűnt.** A `scripts/qa/gates/pre-pr-gate.mjs:40` szerint `_` és `-` határolhatja a tövet. A valódi spec-szövegeket olvasó teszt (`scripts/qa/gates/pre-pr-gate.test.mjs:92–99`) a tényleges `pickE2eSpecs` hívással ellenőrzi, hogy egyenként csak az `admin-tabs.ts`, `home-views.ts`, illetve `curriculum-order.ts` módosításakor bekerül a megfelelő spec. Mindhárom állítás átment. A `source/tests/admin-korszerusites.spec.ts:15`, `source/tests/home-views.spec.ts:104` és `source/tests/curriculum-order.spec.ts:49` hivatkozásain a böngészős szabály-összevetés mindháromszor `base=true, prior=false, head=true` eredményt adott. A három spec külön Playwright-futtatása eldobható adatbázison **9 passed**. Utóbbi a próbák működését, nem magát a kiválasztást igazolja.
- **L2 — megszűnt a korábban jelzett példákra.** Az `ésync` és `sync７` mintákat az előző matcher elfogadta, a fej elutasította. A tényleges Node-teszt (`scripts/qa/gates/pre-pr-gate.test.mjs:76–79`) átment; Chromiumban egy nem BMP-beli betűvel (`𐐀sync`) és decimális számjeggyel (`sync𝟟`) is ugyanez történt. A komment már pontosan leírja a kötőjel és az aláhúzás szerepét (`scripts/qa/gates/pre-pr-gate.mjs:33–36`). A javításban talált eltérő számkategória-esetet lásd L3.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

### L3 — Kicsi: a számjegyen kívüli Unicode-számjelek is megszüntetik a szóhatárt
**Hely:** `scripts/qa/gates/pre-pr-gate.mjs:40`. A terv számjegyet ír (`docs/specs/2026-11-23-kapu-spec-valasztas-szohatar.md:19`), a minta viszont minden Unicode-számkaraktert (`\p{N}`) kizár a határról. Ha egy fejlesztő egy `sync.ts`-t gyakoroltató Playwright-specben a tő egyetlen említését például `sync½` alakú megjegyzésben írja le, ez nem választja ki a specet. A `½` törtjel, nem számjegy. Izolált Chromium-próba: a base és az első kör mintája találatot adott, a fej nem; `\p{Nd}`-vel találat lett. Jelenlegi érintett specet nem igazoltam, ezért nem blokkoló. **Javítás:** a két határban `\p{Nd}` használata és regressziós teszt a törtjelre a meglévő teljes szélességű számjegyes teszt mellett.

### L4 — Kicsi: a valódi spec-eket olvasó új teszt fájlnevet értelmez URL-ként
**Hely:** `scripts/qa/gates/pre-pr-gate.test.mjs:95`. Ha egy fejlesztő `sync#retry.spec.ts` nevű fájlt tesz a `source/tests/` alá, a `readdirSync` listájában ez teljes névként szerepel, de a `new URL(s, dir)` a `#` utáni részt fragmentumnak veszi. Az izolált böngészős próba `file:///repo/source/tests/` alappal `/repo/source/tests/sync` fájlútvonalat eredményezett. Így a QA-egységteszt nem a listázott fájlt olvasná, és ha a csonka útvonal nem létezik, olvasási hibával állna le. Ez az új teszt hibája, nem a termelési kiválasztóé: az utóbbi `join`-nal olvas (`scripts/qa/gates/pre-pr-gate.mjs:160`). A CI futtatja ezt az egységtesztet (`.github/workflows/ci.yml:32–33`), de ilyen nevű fájllal nem futtattam CI-t. **Javítás:** a könyvtár-URL-t egyszer kell fájlútvonallá alakítani `fileURLToPath`-tal, majd a fájlneveket `join`-nal hozzáfűzni.

## A hibakereső pontok (ítélet + bizonyíték)
1. **Adatszerződés — talált hiba az új tesztben (L4).** A termelési láncban a `stemOf` kiterjesztés nélküli tövet ad (`scripts/qa/gates/stage-gate.mjs:16–20`), a valódi olvasó UTF-8 szöveget, a kiválasztó basename-listát, az `e2eArgs` `tests/<név>` argv-elemeket (`scripts/qa/gates/pre-pr-gate.mjs:63–65,102–105,160`). A lánc érintett darabjaira átmentek a követett Node-tesztek.
2. **Biztonság és adatvédelem — az érintett útvonalon próbáltam, nem sikerült megtörni.** A minta tőből épül; ponttal, szögletes zárójellel, `$`-ral, `+`-szal és `?`-lel nem sikerült megváltoztatni a minta jelentését vagy kivételt előidézni a kipróbált bemeneteken. A diff nem visz be új HTTP-műveletet vagy token-/titokkezelést.
3. **Regresszió — a célzott visszaellenőrzés átment.** L1 mindhárom fájlja visszakerült a kiválasztásba, és admin-, illetve vendég főoldali próbáik böngészőben átmentek. A Stúdió-említés, a játék- és közös játékmotor-ág, valamint az üres találat figyelmeztetése átment a Node-tesztekben (`scripts/qa/gates/pre-pr-gate.test.mjs:22–40`).
4. **Europe/Budapest, dátumhatár — nem alkalmazható.** A módosult minta csak szövegen fut; nincs óra- vagy dátumbemenete.
5. **Migráció, séma, indítás, cron, e2e-mód — séma és cron nem alkalmazható.** A diff csak tesztkiválasztást változtat. A visszaellenőrző Playwright-futásban a harness indította, migrálta és a végén eltávolította az eldobható adatbázist; a szerver e2e-módot naplózott.
6. **Párhuzamosság, ismétlés, megszakítás, időkeret — a módosult függvényre nincs új megosztott állapot vagy aszinkron művelet.** A regexp nem használ `g` vagy `y` flaget, a kiválasztás rendezett halmazt ad vissza (`scripts/qa/gates/pre-pr-gate.mjs:40,65`). A teljes időkeretet nem mértem újra.
7. **Tesztminőség — a viselkedésre érzékeny; egy peremeset az új tesztben (L4).** Izolált Chromium-mutációban a base `includes` visszarakásával a szintetikus `sync.ts` fixture elvárt két specje helyett mind a négy bekerült; a korábbi ASCII-minta visszarakásával az L1-hivatkozások elbuktak. Ez a szabály ellenpróbája, nem módosított Node-tesztszvit. Az aláhúzás és kötőjel elvárása tudatosan változott, a terv döntési szakasza ezt rögzíti (`:19–23`); a játék- és warning-tesztek változatlanok.
8. **Feladatspecifikus elfogadás.** **K1:** az `async` nem egyezik a `sync` tővel. **K2:** útvonal, idézőjeles fájlnév, `data-testid`, meghívott név és az L1 valódi hivatkozásai a tesztelt esetekben egyeznek; az Unicode-peremeset L3. **K3:** a játék-ág változatlan a base-diffben; a teszt szerint a módosított spec szövegegyezés nélkül is bekerül (`scripts/qa/gates/pre-pr-gate.test.mjs:82–88`). **K4:** részpróba átment, a teljes mérés UNVERIFIED. A `sync.ts` önmagában a valódi spec-korpuszon a fájlok kevesebb mint felét választja a követett teszt szerint (`:100–101`). Az ASCII-határral keresett `sync|busy` találatokat a kimenetből `.spec.ts`-re szűrve, fájlonként deduplikálva és a találati sorokat ellenőrizve 23 különböző specet számoltam (22 `sync`, egy további `busy`). Ez csak a név szerint megadott két tőre vonatkozik, nem a teljes PR-C listára.
9. **Egyéb — talált hiba.** A fixture-olvasást külön ellenőriztem, mert az új teszt az összes spec-fájlt beolvassa. Az URL-fragmentum miatti hibát L4 rögzíti.

## Mit próbáltam megtörni, és nem sikerült
- A három korábban elvesztett spec kiválasztását egyetlen változott kliensfájllal; külön-külön mind bekerült. A spec-eket külön, valódi böngészővel is lefuttattam.
- A szóhatárt `async`-kal, eltérő kis-/nagybetűvel, ékezetes és nem BMP-beli betűvel, valamint nem ASCII decimális számjegyekkel. A fej mindet az elvárt módon kezelte.
- A literális tövet regexp-metakarakterekkel, valamint a szövegben nem említett, de változott spec beválasztását. A kipróbált minták nem dobtak kivételt; az utóbbi spec bekerült.

## Mit NEM vizsgáltam
- **UNVERIFIED:** a pontos `83 → 27` K4-érték és a teljes `gate:pr` faliórája. A megadott snapshot nem tartalmazza az adventi PR-C pontos változott fájllistáját; a két ismert tő részpróbája nem méri a többi fájl és a módosult spec-ek együttes hatását.
- A saját Node-os korpuszpróbát a futtató a Node 24 homokozó hálózati korlátozásának hiánya miatt elutasította. Nem állítom, hogy minden kliensfájltő/spec párost összehasonlítottam vagy a Node-szvit mutált változatát futtattam. A követett teszteket az eredeti modulon, az ellenmintát Chromiumban ellenőriztem.
- Nem futtattam a teljes PR-kaput, a teljes Stúdió-/játékcsomagot vagy a DB-integrációs szvitet, és nem auditáltam újra az előző körben nem kifogásolt, azóta változatlan részeket. A három célzott E2E nem bizonyítja a teljes kapu időkeretét vagy az összes alkalmazásfolyamatot. Nem volt felületi diff, így külön képernyőkép- és töréspont-auditot nem végeztem.

## Megcáfolt gyanúk
- A Unicode `u` mód nem tette érvénytelenné a kipróbált, különleges karakteres töveket; a literális pozitív és negatív példák különböztek.
- A kötőjel újbóli elválasztóvá tétele visszahozza például a `sync-eligibility` találatokat, de nem hozza vissza az `async`-találatokat. A kötőjel miatti többlet a módosított terv szerint szándékos; az eredeti időkeret megoldását nem következtettem ki ebből.

## Mit futtattam (parancs + eredmény)
- `git_diff` stat és diff, `git_log`, `git_show` a fejre és a base-re — négy fájl változott a base-hez képest; az előző kör óta a matcher határfeltétele, a teszt és a terv változott.
- `node --test scripts/qa/gates/pre-pr-gate.test.mjs` — 9 átment; `node --test scripts/qa/gates/stage-gate.test.mjs scripts/qa/gates/pre-pr-gate.test.mjs` — 15 átment, 0 bukott.
- `node .blind-review-tmp/round2-audit.mjs` — a futtató elutasította; nem keletkezett mérési eredmény.
- `run_browser_scenario .blind-review-tmp/round2-regex.json` — a beágyazott fej-minta minden pozitív/negatív kontrollja megfelelt; a base-/első körös ellenminta a várt helyeken eltért. Külön izolált kiértékelés: L3 és L4.
- `run_e2e source/tests/admin-korszerusites.spec.ts source/tests/home-views.spec.ts source/tests/curriculum-order.spec.ts` — 9 átment, egy worker; az eldobható adatbázist a harness eltávolította.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 0 | 0 | 0 | 0 | 0 |
| közepes | 0 | 0 | 0 | 0 | 0 |
| kicsi | 2 | 2 | 0 | 2 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
(nincs)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 17 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 5486
- tokenek: 764301 bemeneti (ebből gyorsítótárból: 688042, gyorsítótárba írva: 76208), 17110 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 91.0%; becsült megtakarítás: 2.5384 USD
- költség (a tényleges usage alapján): 0.4305 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
