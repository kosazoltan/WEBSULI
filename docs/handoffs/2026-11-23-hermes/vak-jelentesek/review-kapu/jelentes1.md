# Független review — PR-kapu: spec-választás szóhatárral
Fej: 86497a140b4f0cd22888a667469c37ba9ea6fbf9
## Ítélet: NEM
A szűkítés kiszűri az `async` téves találatait, de olyan meglévő böngészős spec-eket is elhagy, amelyek a változott modult ténylegesen gyakorolják.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

### L1 — Blokkoló: a kapu valós admin- és főoldali regressziós próbákat hagy ki
**Hely:** `scripts/qa/gates/pre-pr-gate.mjs:63`. A base (`c87d1706e557112edd576bd4fcf751df04ec27f2`) `readSpec(s).includes(st)` ága az alábbi spec-eket bevette. A fej új `mentionsStem` ága ugyanazokra a teljes spec-szövegekre nem talál egyezést. A spec-ek nem változtak a diffben; a spec-fájlok kötelező futtatása ezért egyik esetben sem menti meg őket egy csak a kliensmodult módosító PR-nál.

| Egyetlen változott kliensfájl | Kimaradó spec és valós lefedettség |
| --- | --- |
| `source/client/src/lib/admin-tabs.ts` | `source/tests/admin-korszerusites.spec.ts:15` az `/__admin-tabs-probe` útvonalat nyitja meg, majd a csoportokat, füleket és a váltást ellenőrzi (`:18–31`). Az útvonal a tényleges `AdminTabBar`-t rendereli (`source/client/src/App.tsx:89`, `source/client/src/pages/AdminTabsProbe.tsx:16`), amely a módosított modul `ADMIN_TAB_GROUPS` listájából épül (`source/client/src/components/AdminTabBar.tsx:2,8`). A spec-ben ez az egyetlen `admin-tabs` előfordulás, aláhúzás és kötőjel mellett. A `workflow.spec.ts:89` önálló említése miatt továbbra is van UI-futás, tehát nincs „egyetlen spec sem” figyelmeztetés sem; az nem helyettesíti a fülsor csoport- és elemszám-ellenőrzését. |
| `source/client/src/lib/home-views.ts` | `source/tests/home-views.spec.ts:58–86` a főoldali nézeteket kapcsolja és a rendezett listát ellenőrzi. A módosított modul függvényeit a lista ténylegesen hívja (`source/client/src/components/UserFileList.tsx:116–127`). A tő kizárólag a képernyőképek `home-views-*` neveiben szerepel (`source/tests/home-views.spec.ts:104,113,120`); a kötőjel miatt mind kiesik. |
| `source/client/src/lib/curriculum-order.ts` | `source/tests/curriculum-order.spec.ts:32–42` a vendég főoldalán és évfolyamválasztás után is ellenőrzi a sorrendet, amely a módosított modul `curriculumSort` függvényének eredménye (`source/client/src/components/UserFileList.tsx:8,122`). A tő egyetlen előfordulása a `curriculum-order-*` képfájlnév (`source/tests/curriculum-order.spec.ts:49`). |

**Ellenpróba:** kis- és nagybetűt megkülönböztető kereséssel ellenőriztem a három teljes spec-ben a tő előfordulásait és külön a fej két határfeltételével vett egyezéseket: egyikben sincs másik, önálló találat. A böngészős ellenpróba a base részszótesztjével és a fej bemásolt matcherével mindhárom hivatkozásra `base=true head=false` eredményt adott. A három valódi spec-et külön, a kiválasztót megkerülve, eldobható adatbázissal futtattam: `9 passed`. Az admin útvonalat külön is megnyitottam álló és fekvő nézetben; állóban a Felhasználók fülre kattintva az aktív érték `users` lett. A diff tehát a kiválasztást gyengíti, nem a spec-ek futtathatósága hibás.

**Javítás:** tartsuk meg a szóhatárt az általános keresésben, de jelöljük explicit módon a valós függőségeket (például önálló fájltővel a spec-ben vagy fájl→spec leképezésben). A regressziós teszt a valódi spec-szöveggel ellenőrizze, hogy egy csak `admin-tabs.ts`-t, `home-views.ts`-t vagy `curriculum-order.ts`-t módosító PR a megfelelő próbát beválogatja, miközben az `async` és `aria-busy` továbbra sem számít egyezésnek.

### L2 — Közepes: a határ az ékezetes betűt és a nem ASCII számjegyet elválasztónak veszi
**Hely:** `scripts/qa/gates/pre-pr-gate.mjs:39`. Ha egy fejlesztő a `sync.ts` változása mellé olyan spec-szöveget olvastat be, amelyben a tő csak `ésync` vagy `sync７` részeként fordul elő, a fej mindkettőt találatnak veszi. A böngészőben kiértékelt azonos minta ezt megmutatta. A terv K1 és a döntési szakasz betűt és számjegyet ír, nem ASCII-karaktert. Ez a base részszókeresésének megmaradt téves találata; a kipróbált példák mesterségesek, nem igazoltam rájuk jelenlegi kapugyengülést. **Javítás:** Unicode-tulajdonságokra épülő határ `u` flaggel, az aláhúzás és kötőjel megtartásával, és teszt ékezetes betűre, illetve nem ASCII számjegyre. A matcher fölötti megjegyzést (`:34`) is igazítsuk a tényleges szabályhoz: most a kötőjelet sem említi.

## A hibakereső pontok
1. **Adatszerződés — talált hiba (L1).** A kapu Gitből kapott útvonalaiból a `stemOf` a várt töveket adja (`stage-gate.mjs:16–20`); a törés a tő és a spec szövege közti leképezésben van. A kiválasztott fájlnevek változatlanul `tests/<név>` argumentumként mennek a harnessnek (`pre-pr-gate.mjs:101–104`, `source/scripts/run-e2e-tests.ts:86–88`).
2. **Biztonság és adatvédelem — próbáltam, nem sikerült megtörni.** A tő regex-metakaraktereit literálisként kezelte a próba. A diff nem ad új URL-t, érzékeny mezőt vagy kimenetet, nem változtatja az argumentumtömbös indítást; a kapcsolódó naplószűrési egységteszt zöld. CSRF / origin / GET-mellékhatás nem alkalmazható erre a helyi kiválasztóra.
3. **Regresszió — talált hiba (L1).** A névtelen főoldal rendezését és nézeteit vizsgáló, illetve az admin fülsort renderelő meglévő próbák kiesnek. A játékág forrása és a közös `stemOf` változatlan; a kapcsolódó játék- és stage-szelet tesztek átmentek.
4. **Europe/Budapest és dátumhatár — nem alkalmazható a diffre.** A kiválasztó nem olvas órát vagy időzónát; a rögzített dátummal dolgozó tanmenet-spec kiesése lefedettségi hiba (L1), nem megváltozott alkalmazásoldali dátumszámítás.
5. **Migráció, indulás, cron, leállítás, e2e — próbáltam, nem sikerült megtörni.** A diff nem módosít migrációt, Drizzle-sémát, indítást vagy időzítőt. A célzott Playwright-futás eldobható PostgreSQL-lel elindult és a végén eltávolította a saját adatbázisát; a gate kiválasztási hibája ettől független.
6. **Párhuzamosság, megszakítás, időtúllépés — nem alkalmazható a módosított döntési logikára.** A szűrés szinkron, nem ír megosztott állapotot; a Playwright határideje és a worker-beállítás nem változott. A teljes adventi futás idejét nem mértem.
7. **Tesztminőség — az új teszt megfogja a régi szabályt, de az L1 ellen nem véd.** A `pre-pr-gate.test.mjs:76–82` fixture-ével kipróbált régi predikátum `a.spec.ts`-t és `b.spec.ts`-t is hozzáad a várt listához, a fej predikátuma nem. Ez izolált predikátumcsere volt, nem a követett fájl módosítása. A diff nem törölt és nem gyengített korábbi asserteket; a szűkítést a terv dokumentálja.
8. **Specifikus elfogadás.** **K1:** `async`, előtaggal ellátott kötőjeles név és aláhúzás a tesztek szerint nem egyezik; a Unicode-határ hibás (L2). **K2:** az `advent/sync`, a `sync.ts` és az idézőjeles `StudioPanel` egyezik; a tényleges lefedettséget adó összetett hivatkozások elvesztése L1. **K3:** a megváltozott spec beválogatása és a játék / közös játékmotor ág célzott tesztjei zöldek; az üres találat továbbra is WARN. **K4:** UNVERIFIED. A két dokumentált `sync` / `busy` tőre a határos keresés a top-level böngészős spec-ek között a `lesson-contrast.spec.ts` és `studio-ui.spec.ts` `PNG.sync` sorát találta; ez nem a teljes adventi fájllista mérése.
9. **Egyéb — próbáltam, nem sikerült megtörni.** A szövegolvasás most spec-enként egyszer történik, üres tőlista esetén is; a tényleges hívó az olvasási hibát üres szövegre váltja (`pre-pr-gate.mjs:159`), az üres tőlista nem választ ki mindent. A kis-/nagybetű megkülönböztetése megmaradt.

## Mit próbáltam megtörni, és nem sikerült
- Regex-metakarakteres fájltő: `file.[+$^(){}?]` literálisan egyezett, az `a.b[` nem egyezett `axb[`-re, egyik vizsgált minta sem dobott kivételt. Az üres/rövid tő a kapuhívóban ki van szűrve, ezért nem jut a matcherbe.
- `async` → `sync`, `aria-busy` → `busy`, kis-/nagybetű, továbbá pozitív útvonalas említés: a követett kaputeszt és az izolált böngészős összehasonlítás szerint a szándékolt ASCII-példák működnek.
- Játékút, `--grep`, közös játékmotor, változott nem játék spec és üres találat: a zöld kaputesztek és a base/head összevetés nem mutattak változást ezekben az ágakban.

## Mit NEM vizsgáltam
- **UNVERIFIED:** a K4 teljes `83 → 6` állítása. A külön adventi ág teljes változáslistája és korábbi kapunaplója nem állt rendelkezésre; ezt nem helyettesítettem két ismert fájl próbalistájával.
- Nem futtattam a teljes `gate:pr` CLI-t vagy a teljes spec-készletet, és nem teszteltem a kapu kényszerített időtúllépését, megszakítását vagy párhuzamos invokációját. A közvetlen matcher-összehasonlítás izolált; a valós komponensutat külön a Playwright-futás igazolta.
- A saját repószintű Node-szkenner futtatását a homokozó elutasította ezen a Node-verzión; a teljes korpusz minden tő–spec párjára nincs mérésem, így L1 további analóg esetei lehetségesek. Nem vizsgáltam külön a bejelentkezett és Stúdió-lecke teljes felhasználói útját vagy a DB-integrációs tesztcsomagot; a módosítás kiszolgálói viselkedést nem érint, de a selector ott is hagyhat ki korábban bevett spec-et.

## Megcáfolt gyanúk
- Az `admin-tabs.ts` változásnál maradó workflow-spec nem cáfolja L1-et: csak a mobil Futások elérhetőségét ellenőrzi, nem a másik spec-ben lévő csoport- és teljes fülsorpróbát.
- Az új regex nem nyeli el az `advent/sync` útvonalat vagy a kötőjelet tartalmazó teljes `tap-guard` tövet. A hibát nem hibás regex-escape, hanem az összetett hivatkozás külső határa okozza.

## Mit futtattam (parancs + eredmény)
- `node --test scripts/qa/gates/pre-pr-gate.test.mjs scripts/qa/gates/pre-push-gate.test.mjs scripts/qa/gates/stage-gate.test.mjs scripts/qa/gates/lib.test.mjs` — 30 átment, 0 bukás.
- `run_e2e source/tests/home-views.spec.ts source/tests/admin-korszerusites.spec.ts source/tests/curriculum-order.spec.ts` — 9 átment; az eldobható adatbázist a harness eltávolította.
- `run_browser_scenario .blind-review-tmp/kapu-hatar.json` — mindhárom eset lefutott. A másolt base/head predikátumok eltérése, a base-szabállyal elbukó sync-fixture és a működő admin-próbaút mérve. Az álló (`390×844`) és fekvő (`1366×768`) admin képet megnéztem: mindkettőn renderelődnek a csoportok és a kereső.
- `node .blind-review-tmp/scan.mjs` — futtató által elutasítva; nem keletkezett mérési eredmény.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 1 | 1 | 0 | 1 | 0 |
| közepes | 1 | 1 | 0 | 1 | 0 |
| kicsi | 0 | 0 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (blokkoló) A szóhatár miatt valós admin- és főoldali regressziós spec-ek maradnak ki — `scripts/qa/gates/pre-pr-gate.mjs:63` — hivatkozás igazolt; RÉSZBEN igazolt (elszigetelt próba: scenario)
- **L2** (közepes) Az ASCII-határ Unicode-betűt és -számjegyet határnak néz — `scripts/qa/gates/pre-pr-gate.mjs:39` — hivatkozás igazolt; RÉSZBEN igazolt (elszigetelt próba: scenario)

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 15 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 3590
- tokenek: 729201 bemeneti (ebből gyorsítótárból: 640062, gyorsítótárba írva: 89094), 11377 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 88.5%; becsült megtakarítás: 2.3431 USD
- költség (a tényleges usage alapján): 0.4006 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
