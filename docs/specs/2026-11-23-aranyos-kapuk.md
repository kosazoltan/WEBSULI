# Arányos helyi kapuk (2026-11-23)

Tulajdonosi utasítás (2026-11-23, lényegében szó szerint): „Ellenőrizd … hogy ne legyenek aránytalanok. A futtatások arányos legyen. A
kis javítás ne kérjen fizetős ellenőri kört, és a helyi pushkapu csak a kapcsolódó teszteket futtassa. A teljes készletet a GitHub úgy is
le fogja futtatni, és 30 sornyi kód legyen a kis javítás határa.”

## Felülvizsgálat (TÉNY — csak olvasó audit, 2026-11-23)

- A PR- és a merge-kapu független ellenőri ítéletet követel (`scripts/qa/gates/lib.mjs` `verdictResult`: ítélet nélkül FAIL); méret- vagy
  fajta-alapú kivétel nincs. A push-kapu nem kér ítéletet.
- A push-kapu (`pre-push-gate.mjs`) a lint-blokkot `full` módban futtatja (teljes `npm run lint`) és a TELJES egységtesztet
  (`tests/*.test.ts`, ~76 s a ~125 s-ból). A szakasz-kapu (`stage-gate.mjs` `mapTests`) már célzottan választ (név / közvetlen import /
  játékkulcs) + minden őr-teszt.
- A PR-kapu (`pre-pr-gate.mjs`) a push-kapu MINDEN lépését újrafuttatja ugyanarra a fejre (~120 s), külön `npm run build`-et futtat akkor
  is, ha a böngészős út maga is buildel, és a DB-integrációs tesztet (~150 s) bármely `source/server/` változásra.
- A CI (`.github/workflows/ci.yml`) mindezt lefuttatja: teljes lint, mindkét tsc, teljes egységteszt (x64 és ARM64), build, teljes
  böngészős készlet, DB-integrációs teszt minden PR-on.

## Döntések

1. **Kis javítás** = a változás ÉLES kódja legfeljebb 30 sor (hozzáadott + törölt) a merge-base óta. Éles kód: `source/**`, kivéve a
   teszteket (`source/tests/**`, `*.test.*`, `*.spec.*`), a dokumentációt (`*.md`) és a zárolt / generált fájlokat. Kis javítás SOHA nem
   lehet az a változás, amely a kapukat, a CI-t, az ügynök-beállítást, a skilleket, a sémát / migrációt vagy a telepítést érinti
   (`scripts/qa/`, `.github/`, `.claude/`, `.agents/`, `source/migrations/`, `source/shared/schema`, `package.json`, `render.yaml`), és
   az sem, amelyben bináris fájl változik (fail-closed).
2. Kis javításnál a független ellenőri ítélet NEM kötelező: a PR- és a merge-kapu ítélet hiányában PASS-t ad „kis javítás (N éles sor)”
   megjegyzéssel. Ha mégis van ítélet, az számít (egy `NEM` kis javításnál is bukás). A merge-kapu a sorokat a GitHub fájllistájából
   (`additions`, `deletions`) maga számolja újra — a helyi bizonyítéktól függetlenül.
3. **Push-kapu:** a lint-blokk gyors módban (a változott fájlok ESLintje; a két tsc, ha .ts / teszt változott); az egységteszt a szakasz-kapu
   leképezése (`mapTests`) + minden őr-teszt. Visszaesés a teljes egységtesztre, ha van leképezetlen éles kódfájl, vagy közös / szelet-közös
   fájl, `tsconfig*`, `package.json` változott.
4. **PR-kapu:** ha ugyanarra a fejre zöld push-bizonyíték van (`pre-push-<fej>.json`, `ok: true`), a push-lépéseket nem ismétli; a
   `git fetch` és a friss-main (C-61) ellenőrzése akkor is lefut. A külön `npm run build` kimarad, ha böngészős út fut (az maga buildel).
   A DB-integrációs teszt kiválasztása változatlan (1. vak kör L7). A push-bizonyíték újrahasználása csak tiszta munkafán.
5. A dokumentáció (`docs/minosegkapuk.md`, `AGENTS.md`, a `websuli-fejlesztesi-ellenor` skill) a szabályt leírja.

## Nem-cél

A CI változtatása; a három-fázis-, titok-, tiltott-minta-, repó-szabály- és őr-ellenőrzések gyengítése; a böngészős út kiválasztása (azt a
#538 rendezi); a Gemini-sor kivezetése (külön jegy, H-22).

## Edge case-ek

- Darabolás: a küszöb a TELJES PR éles-kód változására vonatkozik (merge-base óta), nem egy commitra.
- Átnevezés: `--no-renames`, így az átnevezett fájl törlésként + hozzáadásként számít (nem lesz „kis”).
- Bináris fájl (`-` a numstatban) a `source/**` alatt: nem kis javítás.
- Nagy, már ellenőrzött PR utólagos kis javítása (review-lelet, CI-hiba): EBBEN a szeletben NEM kis javítás (a teljes PR számít). Az
  ítélet-átvitel (A7) az 1. vak kör után kikerült (L4–L6: a helyi review-rekord nincs PR-hoz kötve; a főágból beolvasztott azonos fájlú
  változás és egy újabb `NEM` sorrendje nem kezelhető biztonságosan) — külön szelet: PR-hoz kötött ítélet-rekord, a két fej saját
  foltjának összevetése.
- Kis javításban csak éles kód (`source/**`), teszt és dokumentáció (`docs/**`, `*.md`) lehet; minden más útvonal (pl. gyökérszintű
  kapukonfig) kizárja. A számítás NUL-határolt `numstat`-ból (a különleges fájlnév sem esik ki); a merge-kapu a GitHub REST fájllistájából
  (bináris fájl, az átnevezés régi útja is); hiányzó vagy csonka adatnál nem kis javítás.
- A DB-integrációs teszt helyi kiválasztása VÁLTOZATLAN marad (minden szerverváltozásnál): a tárolók köre nem fedhető le biztonságosan
  útvonal-mintával (1. vak kör L7).
- A push-kapu célzott egységtesztje egy tranzitív függőség bukását elmulaszthatja: a CI teljes készlete fogja meg (vállalt kockázat).

## Elfogadás (EARS)

- **A1** — WHEN a PR éles-kód változása ≤ 30 sor és nem érint kizárt útvonalat, THE PR- és merge-kapu SHALL ítélet nélkül PASS-t adni.
- **A2** — WHEN 31 sor vagy kizárt útvonal vagy bináris fájl, THE kapu SHALL a mai módon ítéletet követelni; `NEM` ítélet SHALL mindig bukás.
- **A3** — THE merge-kapu SHALL a sorokat a GitHub fájllistájából számolni.
- **A4** — THE push-kapu SHALL a leképezett és az őr-teszteket futtatni, és SHALL a teljes készletre visszaesni leképezetlen vagy közös fájlnál.
- **A5** — WHEN zöld push-bizonyíték van ugyanarra a fejre, THE PR-kapu SHALL NOT újrafuttatni a push-lépéseket, de SHALL a C-61-et ellenőrizni.
- **A6** — THE PR-kapu SHALL NOT külön buildelni böngészős futás mellett.

<!-- acceptance-checklist -->
- [ ] A1 kis javítás ítélet nélkül
- [ ] A2 küszöb fölött / kizárt útvonal / bináris → ítélet kell; NEM mindig bukás
- [ ] A3 merge-kapu a GitHub adatából
- [ ] A4 push-kapu célzott + visszaesés
- [ ] A5 PR-kapu nem ismétel, C-61 marad
- [ ] A6 build arányos
