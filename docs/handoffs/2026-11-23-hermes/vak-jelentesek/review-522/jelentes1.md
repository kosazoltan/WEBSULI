# Független review — chore/bence-maradvany-tisztitas
Fej: 9ac86f8e2a5c35e377a7706d0e0c30c40eafe527
## Ítélet: IGEN, FELTÉTELLEL

A vizsgált fejen nem találtam megszüntetett review-indítót, módosított kötelező kaput vagy hozzáadott merge/push automatizmust. Az új őr viszont nem teljesíti a spec §6 utolsó elfogadási feltételét: átengedne olyan beállítási, illetve API-címzési hibát, amely miatt a PR nem kap review-kérést. L1–L3 jegyre menjen; a GitHub-oldali indulást ez a review nem igazolja.

## Leletek (blokkoló / jegyre menő; fájl:sor, forgatókönyv, evidencia, javítási javaslat)

- **L1 — közepes, jegyre: az eseményőr zöld maradhat, ha a workflow már nem indul `main` célágú PR-re.** `source/tests/auto-review-workflow-guard.test.ts:131–134`. Egy CI-karbantartó a `pull_request` alá a meglévő `types` mellé `branches: [develop]` szűrőt tesz. Innentől a `main` célágú PR szerzője sem nyitáskor, sem új commitnál nem kapja meg az indítókommentet. Az őr a fájlban az első `types` sort és az `on`/`pull_request` egymásutánját vizsgálja. A hozzáadott szűrő egyiket sem változtatja meg; a VM-es esetek az eseményszűrőt nem olvassák (`:114–119`). Ez a mutáns statikusan levezetett, nem mért eredmény; az érintetlen workflow célzott tesztje zöld. **Javítás:** a beolvasott workflow `on.pull_request` objektumán ellenőrizni az eseménytípusokat és a nem tervezett branch/path szűrők hiányát. Ugyanazon a beolvasott objektumon érdemes ellenőrizni azt is, hogy a futtatott szkript valóban a megnevezett `actions/github-script` lépés `with.script` mezője, ne pusztán egy bárhol talált `script: |` blokk legyen (`:72–82`). A szűrő hozzáadása legyen bukó ellenpróba.
- **L2 — közepes, jegyre: az őr nem ellenőrzi, melyik PR-re kerül a komment.** `source/tests/auto-review-workflow-guard.test.ts:101–106`. Egy karbantartó a Post lépés API-hívásában (`.github/workflows/auto-review.yml:97–102`) tévesen `context.issue.number + 1`-et ad meg PR-számnak. GitHubon az eredeti PR nem kap indítót; a komment másik ügyre kerülhet, vagy az API visszautasítja. A tesztstub a fogadott argumentumból csak a `body`-t tárolja, a listázást pedig a címzéstől függetlenül szolgálja ki. Így a darabszám- és szövegassert ugyanazt az értéket kapná helyes és hibás címzésnél. Ez statikus ellenpróba, a fejen a címzés helyes. **Javítás:** ellenőrizni mindkét hívás `owner`, `repo` és `issue_number` mezőjét az esemény `context`-jéhez képest, és a rossz PR-számot felvenni bukó mutánsnak.
- **L3 — kicsi, jegyre: a komment futónak mondja a botokat, pedig csak kérést küldött.** `.github/workflows/auto-review.yml:74,97–103`. A PR-t GitHubon megnyitó fejlesztő akkor is azt olvassa, hogy „A review botok most futnak”, ha a komment sikeresen létrejön, de valamelyik integráció nem veszi fel a kérést. A job kizárólag a komment elküldését várja meg, nincs visszaigazolás a botoktól. A pontos, semleges szöveghez elég „Review-kérést küldtünk az alábbi botoknak”; a parancssorok maradjanak változatlanok.

## A hibakereső pontok (ítélet + bizonyíték)

1. **Adatszerződés — az őrben talált hiba (L2); a jelenlegi átadás egyezik.** A PR `head.sha`-ból képzett kulcs a `state_key` outputon, majd a `STATE_KEY` env-en megy a komment első sorába, az `already` pedig `'true'`/`'false'` string (`.github/workflows/auto-review.yml:54–71,105–108`). A követett VM-es tesztek zöldek az új/régi azonos SHA, eltérő SHA és üres/hiányzó törzs eseteire. Kliens/DB nincs a láncban.
2. **Biztonság és adatvédelem — nem találtam új jogosultságot vagy titokkimenetet.** A `permissions` változatlan (`.github/workflows/auto-review.yml:28–31`); a változott naplóágban az állapotkulcsban a PR fej SHA-ja van, nem token (`:54–60,103`). A cím- és gitignore-őrök zöldek. A workflow olvasása és egyetlen író művelete a kommentelés; nincs alkalmazásbeli CSRF/Origin vagy GET-mellékhatás-változás. A repón kívüli tokenbeállításokat nem mértem.
3. **Regresszió — a diffben nem találtam megváltozott termékutat vagy törölt fájlra épülő futó hívót.** A négy törlés a base–head diffben látszik; az indexből való hiányt a valódi `git ls-files`-t hívó teszt ellenőrizte (`source/tests/auto-review-workflow-guard.test.ts:205–207`). A `memory/projects/websuli/LEDGER.md:81` történeti említés és explicit kivétel. Az `.harness/live` említések nem a négy törölt fájlra mutatnak; a helyi `source/.harness/` ignore megmaradt. Névtelen/bejelentkezett és Stúdió-lecke útvonal nem érintett.
4. **Időzóna, dátumhatár — nem alkalmazható.** A deduplikálás a fej SHA-ját használja, nem időpontot vagy naptári napot (`.github/workflows/auto-review.yml:54–60`).
5. **Migráció, Drizzle, szolgáltatás-életciklus, e2e — nem alkalmazható.** A nyolcfájlos diffben nincs migráció, alkalmazásindítás, cron, leállítás vagy e2e-konfig. A `.github/workflows/ci.yml` és a kapuk implementációja/configja nem változott; a `gate:stage` kiválasztja az új `*-guard.test.ts`-t (`scripts/qa/gates/stage-gate.mjs:64–84`), a CI a tesztglobot futtatja (`.github/workflows/ci.yml:89–90`).
6. **Verseny, ismétlés, megszakítás — a soros esetek zöldek; párhuzamos egyszeriséget nem igazoltam.** Nincs atomi művelet a listázás és a posztolás között (`.github/workflows/auto-review.yml:45–63,97–102`), ezért két átfedő futás ugyanazt az üres állapotot láthatja. Ez a base-ben is így volt; a lapozás hiánya külön dokumentált régi korlát (első 100 komment, `:49–53`). Visszaállításkor a régi szkript nem ismeri az új jelölőt; a vegyes verziójú újrafuttatás GitHubon UNVERIFIED. Nem állítok új versenyregressziót.
7. **Tesztminőség — talált hiba (L1, L2).** A VM a tényleges JS-részleteket futtatja, tehát több mint egyszerű szövegkeresés. A YAML eseményhatókörét nem értelmezi, az API-mock a célt nem vizsgálja. A végső mérce a spec `:83–105`; a VM-es megközelítés változása a végrehajtás `:71–82` szakaszában dokumentált. Nincs más, már létező teszt gyengítése a diffben. Saját mutáció futtatása: NOT RUN, a futtató elutasította.
8. **Workflow, indítók, kötelező kapuk — a fejen nem találtam kiesést; az őr hiányos és a státuszszöveg pontatlan (L1, L3).** A spec §6 tételesen: a négy eseménytípus és a draft-feltétel egyezik (`.github/workflows/auto-review.yml:24–38`); a három trigger és az átfogó bekezdés megvan (`:80–90`); régi/új deduplikálást mér a célzott teszt; a workflow neve `Auto Review`, a job neve az eredeti (`:1,34–35`); a szerepnevek közül csak a régi kulcs maradt (`:57`), a merge-mondat a minőségkapukra hivatkozik (`:94–95`); a gyökér `.harness/` alatt nincs követett fájl; a minden sérülésre bukó őr kritériuma nem teljesül (L1, L2). A három explicit kommentparancs a base-ben is Sourcery, Codex és **Vercel Agent** volt, nem Copilot. A Copilot külön utasításfájlja változatlan; ez nem automatikus indító. Az élő Copilot-konfiguráció UNVERIFIED, nem láttam törölt Copilot-triggert.
9. **Egyéb — megpróbáltam megcáfolni a merge/push mentességet, nem sikerült.** A változott workflow-ban két `github-script` lépés van (listázás, kommentírás) és egy `echo`; nincs `push` esemény, merge API, `gh pr merge`, git push vagy kapuindító parancs. A `gate:merge` említése a fejléc megjegyzésében szerepel, nem futó kód. A commitlistában a tervpár megelőzi a workflow-csomagot; a head merge commitja a megadott base-t olvasztja az ágba, így annak külön commit-diffje nem e feladat hatóköre.

## Mit próbáltam megtörni, és nem sikerült

- Megnéztem, kiesik-e az átálláskor a régi SHA-jelölő, vagy elnémít-e egy eltérő SHA-jú/üres komment egy új futást. A kódot futtató követett tesztekben az azonos SHA-ra nincs második komment, az eltérő SHA-ra van; mindhárom indító önálló sorban szerepel.
- Ellenőriztem, függ-e az index vagy valamelyik CI/szkript a törölt naplóktól: kerestem az útvonalakat és a jellegzetes fájlneveket, futtattam a memóriaindex-őrt; élő hívót nem találtam.
- Követtem a kapuellenőrzést a kötelező checkekig és a hook bizonyítékig: a követett tesztek hiányzó check, nyitott review-szál, main-elmozdulás, illetve hibás/hiányzó helyi bizonyíték mellett továbbra is bukó/tiltó döntést adnak.

## Mit NEM vizsgáltam

- **UNVERIFIED:** élő GitHub Actions-validáció és botválasz (same-repo/fork PR; draft → ready, reopen, synchronize; GitHub ruleset/branch protection; integrációs jogosultságok és kvóták). Nem nyitottam PR-t, nem küldtem kommentet és nem pusholtam. Valódi GitHub-hálózati hibát vagy párhuzamos futást nem mértem; a böngésző- és DB-harness nem ezt a láncot futtatja.
- Saját mutációs próba és teljes `gate:stage`: a futtató elutasította őket. A tesztvakfoltokat a vezérlés és az assert-ek olvasásával igazoltam; mutánsokra nem állítok futási eredményt.
- Álló/fekvő képernyőkép, alkalmazás-e2e és DB-teszt: nincs felületi vagy adatbázisos változás. A korábbi Git-történetet nem vizsgáltam tényleges hitelesítő adatok után, rotációt nem igazoltam.

## Megcáfolt gyanúk

- **„Eltűnt a harmadik trigger / Copilot-indító.”** Mindhárom explicit parancs változatlan a base-hez képest; a harmadik korábban is Vercel volt. Nem adnék hozzá új Copilot-parancsot a takarítás részeként.
- **„Az átnevezés a kötelező kaput is átnevezte.”** A repóban a job neve/azonosítója és az `auto-review.yml` elérési útja változatlan, a pre-merge kód a `CI` futást keresi (`scripts/qa/gates/pre-merge-gate.mjs:155–165`). Élő GitHub-beállításra ebből nem következtettem.
- **„A régi név visszakerül az új kommentbe.”** A régi kulcs csak az olvasási összehasonlításban van; az új komment a `state_key` új formáját kapja.

## Mit futtattam (parancs + eredmény)

- `npx tsx --test source/tests/auto-review-workflow-guard.test.ts source/tests/memory-index-guard.test.ts` — 12/12 PASS, ezen belül 8 auto-review eset.
- `npx tsx --test source/tests/no-real-emails-guard.test.ts source/tests/gitignore-guard.test.ts` — 7/7 PASS.
- `node --test scripts/qa/gates/stage-gate.test.mjs scripts/qa/gates/pre-merge-gate.test.mjs` — 17/17 PASS.
- `node --test scripts/qa/three-phase-check.test.mjs scripts/qa/hooks/check-quality-gates.test.mjs` — 35/35 PASS; Git sorvég-figyelmeztetésekkel.
- `npm run check:test` — 0 kilépési kód.
- `node .blind-review-tmp/auto-review-mutacio.mjs` — elutasítva: a futtató Node 24.22.3 alatt nem tudja kikényszeríteni az egyedi próba hálózati korlátozását. `npm run gate:stage` — elutasítva: nincs az engedélyezett npm-szkriptek között.

---
## Gépi összegzés (a futtató írta, nem az ellenőr)

A leletek fájl:sor hivatkozását és idézetét a futtató a vizsgált fej munkafájában ellenőrizte; a „futtatással igazolt” oszlop a
futtató saját parancsnaplójával egyezik (a parancs, a kimenet-részlet és a próba bemenete); „teljes út” csak böngészős vagy
adatbázisos futás lehet, a saját homokozós / egységteszt-próba legfeljebb „részben igazolt”. Ez azt igazolja, hogy a lelet valódi
kódra mutat és a futás megtörtént — a következtetés helyességét nem.

| Súlyosság | Leletek | Igazolt hivatkozás | Futtatással igazolt (teljes út) | Részben igazolt (elszigetelt próba) | Érvénytelen (nem visszaellenőrizhető) |
| --- | --- | --- | --- | --- | --- |
| blokkoló | 0 | 0 | 0 | 0 | 0 |
| közepes | 2 | 2 | 0 | 0 | 0 |
| kicsi | 1 | 1 | 0 | 0 | 0 |

### Blokkoló és közepes leletek (mind igazolt hivatkozással)
- **L1** (közepes) Az eseményőr nem ellenőrzi a pull_request szűrőit — `source/tests/auto-review-workflow-guard.test.ts:131` — hivatkozás igazolt
- **L2** (közepes) A tesztstub nem méri, melyik PR kapja a triggerkommentet — `source/tests/auto-review-workflow-guard.test.ts:102` — hivatkozás igazolt

### Érvénytelen leletek
(nincs)

### Futás
- modell (a válasz szerint): openai/gpt-6.2-sol; szolgáltató (a válasz szerint): OpenAI; modellhívás: 12 (újrapróba: 0)
- gondolkodó (reasoning) tokenek összesen: 2267
- tokenek: 663847 bemeneti (ebből gyorsítótárból: 577785, gyorsítótárba írva: 86026), 8678 kimeneti
- gyorsítótár-találati arány a 2. hívástól: 88.1%; becsült megtakarítás: 2.1096 USD
- költség (a tényleges usage alapján): 0.3597 USD
- gépi zár-várakozás összesen: 0.0 perc (a falióra-keretbe nem számít)
