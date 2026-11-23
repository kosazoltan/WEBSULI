# Összefoglaló

TGM S2b-2 — a forrás-ábrák megjelenítőinek korábbi vak-leletei. Terv: `docs/specs/2026-11-20-tgm-valtozatossag-abrak.md` (17. szakasz),
végrehajtás: `docs/specs/2026-11-20-tgm-valtozatossag-abrak-vegrehajtas.md`. Az S2b-1 (#533) folytatása; megjelenítési változás, adatírás
nélkül. A forrás-ábrák élesben a `STUDIO_SOURCE_VISUALS` kapcsoló (KI) miatt nem keletkeznek.

- A görgetésjelző a tábla fölött áll, a táblacím a görgő kereten kívül látható (a `<caption>` képernyőolvasónak megmarad).
- A „Példa” címke és a tónusjel kontrasztja a sávok tokenjeiből; őr-teszt a CSS-értékekből számol.
- A fejezet-kisfilm nem kínál és nem rajzol forrás-ábrát vagy hibás paraméterű blokkot ráúszó ábrának (az S2b-1 új fajtáit is beleértve).
- Rövid tartalmú tábla nem görög 360 px-en; nyomtatásban a görgő keret nem vág; a fejléc-illesztés a fejlécszöveg változására újramér.

## Elfogadás

- [x] V33: a jelző a tábla fölött, a cím a görgő kereten kívül.
- [x] V34: „Példa” címke ≥ 4,5:1, tónusjel ≥ 3:1 mind az öt sávban és a csendes nézetben (teszt a CSS tokenjeiből).
- [x] V35: a kisfilm nem kínál / rajzol forrás-ábrát; a kizárt hivatkozás helyén nem marad üres panel.
- [x] V36: a néhány oszlopos rövid tábla (pl. „1 | 2 | 3”) nem görög 360 px-en; nyomtatási szabály.
- [x] V37: a fejléc-illesztés a fejlécek szövegének változására újramér.

## Futtatott ellenőrzések

- `npm run gate:stage` → ZÖLD (16 célzott + 26 őr-teszt, tsc, ESLint)
- `npm run gate:push` → ZÖLD (build, böngészős UI-spec, DB-integrációs teszt)
- `npx playwright test -c playwright.lesson-clips.config.ts -g "leckeábra a kisfilmben"` → 6 passed (360 / 844 / 1280 px; az őr kivételével 3 bukik); `-c playwright.source-visuals.config.ts -g V37` → 1 passed
- `npm run gate:blind-review`: 1. kör IGEN, FELTÉTELLEL (0 blokkoló) → a főág beolvasztása + L2 javítva → 2. (követő) kör IGEN, FELTÉTELLEL (0 blokkoló) → review #535 leletei → 3. kör IGEN, FELTÉTELLEL (0 blokkoló)
- Független ellenőr ítélete: IGEN, FELTÉTELLEL (fej: 5db1cfc4784a)

Nem futtatott + ok: valódi kisfilm-gyártás (fizetős, élesben KI) NOT RUN — a szűrést egységteszt és a lejátszót böngészős próba fedi; kockázat: alacsony.

## Követő jegyek (a vak körök feltételei)

- L1 (meglévő hiba): a RÉGI ábrafajták hibás paraméterű blokkját (pl. üres `cycle`) a kisfilm továbbra is felkínálhatja, üres panellel.
- L4 (ismert korlát): négy hosszabb egyszavas oszlopnál a rövid tábla 360 px-en továbbra is görög (a főágon is így volt) — a terv V36 pontja ennél többet ígér; keskeny nézet külön szeletben.
- L5: a V37 böngészős teszt konstans fejléc-kulccsal is zöld (a méretfigyelő is újramér) — a viselkedést rögzíti, a kulcs szükségességét nem bizonyítja.
- L3: a kontraszt-őr a fejléc keverési arányát (14%) konstansként használja, nem a CSS-ből olvassa.

<!-- agentic-qa-kit:begin v1 -->
## Agent-PR ellenőrzőlista (kötelező AI-asszisztált PR-nál)

- [x] **CI-integritás:** a PR nem gyengít gate-et (nem törölt tesztet, nem csökkentett küszöböt, nem módosított CI-konfigot indoklás nélkül)
- [x] **Duplikáció:** nem vezet be máshol már létező utility/helper másolatot más néven
- [x] **Kritikus útvonal:** a fő kódútvonalat ember végigkövette és megértette
- [x] **Security boundary:** auth/jogosultság/input-validáció határai érintetlenek vagy szándékosan, dokumentáltan változtak
- [x] **Tesztbizonyíték:** a nem-triviális viselkedés-változásra van teszt, és a teszt valódi logikát ellenőriz (nem "paper test")
- [x] **Hatókör:** a diff csak a feladathoz tartozó fájlokat érinti; méret ~400 sor alatt (vagy indokolt)
<!-- agentic-qa-kit:end -->

🤖 Generated with [Claude Code](https://claude.com/claude-code)
