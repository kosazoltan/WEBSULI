# Terv — a P-057, P-064, P-065 tulajdonosi döntések átvezetése a fő ágra

Tulajdonosi döntések (2026-11-23), forrás: `docs/websuli-potlasok.md` (ág `docs/websuli-potlasok`) P-057, P-064, P-065 pontjai.

- **P-064 (TTS):** mindkettő jóváhagyva — a brit TTS kéretlen, nulla hangerejű **néma próbakimondása megszűnik** (nem épül vissza),
  és a hangtár **abszolút 80 MB-os plafonja** (hangverziónként 40 MB mellett) marad.
- **P-065 (Stúdió SK3):** költség- és hibakorlátnál **mindenhol jelzés** (figyelmeztetés / riasztás); **vészleállítás kizárólag a
  fizetős próbafutás 30 USD-os kemény költségkereténél**. Az SK3-ba NEM kerül új megállító korlát sem az éles futásidőre, sem az
  összesített javítókörre; a meglévő, állomásonkénti körszám-plafonok változatlanok.
- **P-057 (hookok):** a projekt-helyi `.claude/settings.json` **verziókezelt marad**; a hookok **szűk matcherrel** futnak (egy-egy
  eszköznév, nincs üres / helyettesítő karakteres matcher); egy hook hibája **csak a saját lépését** (az őt kiváltó eszközhívást) tilthatja
  — fail-closed csak a saját lépésén.

## Tény (a fő ág `ccc5e99f` állapota, 2026-11-23)

- P-064: néma próbakimondás nincs a kliensben — a beszédlejátszó csak koppintásra mond ki (`source/client/src/lesson-runtime/speech-player.ts:344`,
  `source/shared/speech-preload.ts:80`), és teszt rögzíti: `source/tests/speech-player.test.ts:406` („koppintás nélkül semmi nem mond
  ki (kéretlen próba nincs)”). A 80 MB-os plafon: `source/server/tts/audio-store.ts:44–47` (`TTS_AUDIO_LIMITS.maxAbsoluteBytes`),
  `:87` (`absolute-exceeded`), teszt `source/tests/tts-audio-store.test.ts:25–26`. **Kód: megfelel.** Eltérés csak a tervben: öt
  helyen „a tulajdonosnak jelezve, megerősítésre vár” jelölés maradt.
- P-065: az SK3 még nem készült el (nincs `shared/run-budget.ts`, `budget-alert.ts`); a Stúdióban nincs éles futásidő- vagy összesített
  javítókör-megállító. A terv (D7, SK3, E41, E42) már jelző őrt ír elő; a P-065 megerősítése és a „hibakorlát is csak jelez” hatókör
  nincs rögzítve. **Kód: megfelel; terv: kiegészítendő.**
- P-057: `.claude/settings.json` verziókezelt (`git ls-files`), a `.gitignore` csak a `.claude/worktrees/`-t zárja ki; a matcherek
  `Bash`, `PowerShell`, `Edit|Write`; `onFailure: "block"` csak a kapu-hookon (`scripts/qa/hooks/hook-failure.test.mjs` F1); a
  kapu- és audit-hook belső hibája csak kapu-köteles / push-parancsot tilt (F2–F4, hibás bemenet-teszt). **Megfelel**, de a döntés
  három pontját egy őr-teszt még nem rögzíti együtt (verziókezeltség, szűk matcher).

## Döntés (e PR)

1. A terv (`2026-11-18-tananyag-gyartas-minoseg.md` + végrehajtási fájl): a P-064 jelölések „tulajdonos jóváhagyta 2026-11-23
   (P-064)”-re; új D8 (P-064) és D9 (P-065) a 9. szakaszban; az SK3 szakasz, az E41 és az E42 elfogadási feltétel kiegészül a
   P-065 hatókörével.
2. A hook-terv (`2026-11-18-hook-onfailure.md`) „Kiegészítés 4 — P-057” szakasza rögzíti a döntést.
3. Őr-teszt (`scripts/qa/hooks/hook-scope.test.mjs`) + tiszta ellenőrző (`scripts/qa/hooks/hook-scope.mjs`): a settings verziókezelt
   és nem ignorált; minden hook-csoport matchere szűk (csak ismert eszköznevek, `|`-vel); `onFailure` csak a kapu-hookon. A
   `.claude/settings.json` NEM változik (csak a tulajdonos kezével módosítható).

## Nem cél

- Termékkód-változás (mindhárom pont a kódban már megfelel).
- A `.claude/settings.json` / `settings.local.json` módosítása; a `docs/websuli-potlasok.md` (más ág) állapotainak frissítése.
- Az SK3 megvalósítása.

## Elfogadás (EARS)

- [ ] H1 WHEN a terv TTS-méretőr pontjait olvassuk THEN „megerősítésre vár” jelölés SHALL nem maradni, és a D8 SHALL rögzíteni a P-064-et.
- [ ] H2 WHEN az SK3-at és az E41 / E42-t olvassuk THEN SHALL kimondani: költség- és hibakorlátnál jelzés, vészleállítás csak a
  próbafutás 30 USD-os kemény keretén; új éles futásidő- és összesített javítókör-megállító nem épül (P-065).
- [ ] H3 WHEN a `.claude/settings.json` nincs verziókezelve, ignorált, egy hook-csoport matchere üres / helyettesítő karakteres /
  ismeretlen eszköz, vagy `onFailure` nem a kapu-hookon áll THEN a `hook-scope.test.mjs` SHALL bukni (mutációs esetekkel igazolva).
