# Összefoglaló

TGM S6a — fejezetív-készlet, a `STUDIO_LESSON_VARIETY` kapcsoló mögött (élesben KI). Terv: `docs/specs/2026-11-20-tgm-valtozatossag-abrak.md`
(12. szakasz), végrehajtás: `docs/specs/2026-11-20-tgm-valtozatossag-abrak-vegrehajtas.md`. Az S5b (#534) folytatása.

- Hat fejezetminta (`shared/lesson-section-shapes.ts`); a program a tananyagterv elfogadása UTÁN, a térkép magjából determinisztikusan osztja
  ki a fogalom-fejezetekre (szomszédos fejezet nem kapja ugyanazt; egy minta legfeljebb a fejezetek 40%-a).
- A különleges fejezetek és a tulajdonos jóváhagyott terve változatlan; az utolsó fejezet recap-pal zárul.
- A tervező promptja és a kiosztás a futásra rögzített változatossági állapotot olvassa (nem a környezetet).
- Az S5b 3. vak körének L8 lelete javítva: a mentett nyitásforma-azonosító az évfolyam korcsoportjának leírását adja (folytatás, javítás).
- A kiosztott blokksorokat a szerzői kérés kimondja (csak a program által kiosztott tervnél; a terv eredetét a job állapotának `sectionShapes` jelzője őrzi — jóváhagyott tervnél, folytatva is, a kérés a régi).
- KI állapotban a terv, a pedagógus-prompt és a szerzői kérés bájtra a főágé.

## Elfogadás

- [x] V13: mind a hat minta átmegy az ívkapun (`checkLessonArc`).
- [x] V14: 3…12 fejezet, 200 mag — nincs azonos szomszéd, egy minta ≤ 40% — a szerzőnek átadott VÉGLEGES blokksorokon is (visszalépéses keresés).
- [x] V15: BE-nél a fogalom-fejezetek `plannedBlocks`-a a kiosztott minta, a különlegeseké változatlan, a végén recap; KI-nél a terv bájtra a régi.
- [x] V16: szimuláció — a leggyakoribb minta < 35%, két véletlen fejezet azonos mintája < 20%.
- [x] A motorban (viselkedési teszt): BE — a mentett terv és a szerzői kérés a kiosztott sort hordozza; KI, jóváhagyott terv (folytatva is) és folytatás — az eredeti sorok.
- [x] L8: a formaazonosító korcsoportos feloldása minden csoportra és a javítási útra tesztelve.

## Futtatott ellenőrzések

- `npx tsx --test tests/lesson-section-shapes.test.ts tests/lesson-opening-forms.test.ts tests/lesson-variety-paths.test.ts` → 13/13 (lesson-section-shapes; benne 24 000 esetes tulajdonságteszt a végleges blokksorokon), a másik kettő zöld a szakaszkapuban
- `npm run gate:stage`, `npm run gate:push` → ZÖLD (cdc0cfbe); `node --import tsx scripts/measure/shape-simulation.mts` → leggyakoribb minta 0,195 (< 0,35), azonos minta 0,154 (< 0,20)
- `npm run gate:blind-review`: 1. kör NEM (2 blokkoló: a mohó kiosztás túllépte a 40%-ot; a záró recap azonos sorrá olvasztott két mintát — mindkettő javítva, teszttel) → 2. kör IGEN, FELTÉTELLEL → review #536: a kiosztott terv nem jutott el a szerzőhöz (javítva) → 3. kör NEM (1 blokkoló: jóváhagyott terv folytatása — javítva, teszttel) → 4. kör IGEN, FELTÉTELLEL (0 blokkoló)
- Független ellenőr ítélete: IGEN, FELTÉTELLEL (fej: cdc0cfbe3f95)

Nem futtatott + ok: valódi (fizetős) gyártás BE kapcsolóval NOT RUN — tulajdonosi jóváhagyással, az SK2 mérőszámával együtt; kockázat: a modell mintakövetése nem mért.

## Követő jegyek (a 4. vak kör feltételei)

- L9: nincs teszt a MODELLTERVES BE futás szerző előtti megszakítására és folytatására (a mentett `sectionShapes` jelző visszaolvasása) — a jóváhagyott tervű megfelelője tesztelt.
- L4: BE futásnál a rendszerutasítás pedagógus-szerepleírása még a régi ívet és JSON-alakot írja (a forduló kérése kifejezetten felülírja; modellreakció nem mért).
- A modell tényleges követése (a kiosztott sorok betartása) fizetős próbával mérendő, az SK2 mérőszámával együtt.

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
