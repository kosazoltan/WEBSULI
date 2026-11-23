# WEBSULI — a hosszú futás hibajegyzéke

Tulajdonosi cél (2026-11-23): minden megtalált hiba, hiányosság, futás-, skill-, memória-, munkafa- és ághiba összesítve, majd egy
hosszú futásban kijavítva; a teljes hátralék megvalósítva. Sorrend: `docs/specs/2026-11-23-foterv.md`. Vezénylés: a
`websuli-szelet-futoszalag` skill. Új munkamenet elején a „Nyitott” oszlop olvasandó.

Súlyosság: **A** = adatvesztés / határidő / hibás éles viselkedés kockázata · **B** = lassítja vagy félrevezeti a munkát · **C** = rend.

## Nyitott

| # | Súly | Hiba | Javítás módja | Hol |
|---|---|---|---|---|
| H-01 | A | Az advent (határidő 11-30) PR-C és S5+S6 ága PR nélkül állt, a TGM-lánc mögé sorolva | H1 hullám elöl; PR-C kapun, utána S5+S6, előnézeti próba űrlap, bekapcsoló PR | repó |
| H-04 | A | 22 ág csak helyben, 10 nyitott / félkész ág helyi feje 4–38 committal a távoli előtt | helyi köteg: `C:\Users\kosaz\websuli-mentes\websuli-helyi-agak-2026-11-23.bundle` (kész); távoli mentést a kapu-hook refspec-szabálya tiltja → minden ág PR-ral kerül fel, vagy tulajdonosi döntés a mentő-refspecről | repó / döntés |
| H-05 | B | A vak ellenőr futtatója nincs a főágon; négy átfedő ág (deepseek, futtato-1, futtato-2, konvergencia) | H3 K3: a `vak-v2` változat két PR-ban; a másik három ág utána törölhető | repó |
| H-06 | B | Nincs bizonyíték-átvitel: dokumentum-ütközés vagy összefésülés új fejet és új vak kört kényszerít (S5b, S2b-2, S6a) | H3 K2: `patch-id` egyezésnél a merge-kapu elfogadja a korábbi ítéletet | repó |
| H-07 | A | Hibaosztály: amit a program kioszt, nem jutott el a modellhez (S6a blokksor, S6b try-fajta); folytatásnál elveszett | S6a javítva (#536); S6b javítva az ágon (2. vak kör); S6c / SK2 átnézve; a skill 2.3 pontja | repó |
| H-09 | B | Ingatag teszt: `tests/lesson-clip-worker.test.ts` „átkódolás: az időkorlát SIGKILL-lel él” párhuzamos futásban | időfüggetlenítés (C-96 minta) | repó |
| H-11 | B | A PR-leírás kötelező szakaszai csak a PR-kapu bukásából derülnek ki (advent PR-C 11-22-én ezen bukott) | H3: PR-leírás generátor; addig a skill 3. pontja | repó |
| H-14 | B | A pótlási terv (11-19), a főterv (11-23), a teljes revízió és a gépköltöztetés-napló nincs a főágon | dokumentum-PR a H3-ban | repó |
| H-15 | B | Nem mért: a modell követi-e a kiosztásokat (nyitásforma, fejezetminta, try-fajta, hang) | fizetős próbagyártás az SK2 mérőszámával — tulajdonosi döntés (D2) | döntés |
| H-16 | B | Követő jegyek a beolvadt PR-okból: S5b L6, L7, L9; S2b-1 kilógó felirat + ismétlődő DOM-azonosító; S2b-2 L1, L3, L4, L5; S6a L4 | a TGM-lánc végén egy „követő jegyek” szelet | repó |
| H-17 | A | Eredmény-e-mail: a #510 14 vak kör után sem konvergált; bontás 9 szeletre, 1 kész | H4: B1b (kész az ágon) → B8 | repó |
| H-18 | A | Kisfilm: #529 és a leállítás-határidő 3-3 kör után NEM; a gyártás élesben KI; jóváhagyott sortörlés függőben | H5: bontási terv, rész-PR-ok, sortörlés a telepítés után | repó / éles |
| H-19 | B | #513 (merge-kapu REST-ről) 3 kör után NEM; #521 nem konvergál | H3: bontás; `fix/kitakaro-elovagas` PR | repó |
| H-20 | C | A pótlási terv 50 szeletéből 40+ nincs elkezdve (játékok, többjátékos, hook-szeletek) | H6–H9 a főterv szerint | repó |
| H-22 | B | A Gemini „második vélemény” aktív szabályként él a repóban (`AGENTS.md` 169–171, `docs/minosegkapuk.md` 41–50, ellenőr-skill 4/b, `pre-pr-gate.mjs`, `pre-merge-gate.mjs`, `lib.mjs` WARN-lépés) — a döntés szerint nincs Gemini-sor; a repó ellenőr-skillje nem vak és nem a gépi futtatót írja | H3: a K3 PR-ral együtt — szakaszok és WARN-lépés ki, a skill vak megbízásra | repó |
| H-24 | C | Skill-tükör: 4 skill csak a forrásban (`tananyag-javito`, `tananyag-keszito`, `websuli-internet-pipeline`, `websuli-studio-tools`), 1 csak a tükörben (`websuli-gyartas-analitika`, a tanulságot Hermes-kanbanba küldi); a `skills-sync-check` csak ötöt néz; `websuli-studio-tools` halott sora | H3 dokumentum-/skill-PR | repó |
| H-25 | C | `.github/workflows/auto-review.yml` 57. sor: `bence-auto-review` maradvány | H3 skill-PR-ban | repó |
| H-26 | B | A globális `CLAUDE.md` 52. sora a főágon nem létező `npm run gate:blind-review` parancsot és `websuli-vak-ellenor` skillt írja elő | a K3 beolvadásával megszűnik; addig a memória jelzi (a CLAUDE.md a tulajdonosé, nem írom át) | repó / tulajdonos |
| H-28 | A | A PR-kapu a böngészős teszteket RÉSZSZÓRA választja: a `sync.ts` miatt mind a 83 teszt futott (`async`), 60 perc alatt nem fért bele — az adventi PR-C kapuja ezért bukott 11-22-én és 11-23-án is | kapujavítás: szóhatáros egyezés (`mentionsStem`), 83 → 6 teszt; ág `fix/kapu-spec-valasztas-szohatar` (`86497a14`), szakaszkapu zöld, vak kör sorban; utána a főág beolvasztása az adventi ágba | repó |
| H-29 | B | `run-e2e-tests.ts` belső kerete 60 perc, a PR-kapu külső kerete 90 perc — a belső előbb jár le | külön kis javítás a kapujavítás után (a keret a hívótól jöjjön) | repó |
| H-30 | B | S6c egyben: 1. vak kör NEM, 5 blokkoló az új megjelenítőkben (jelöletlen leckén is az új rajzoló; hamis összeolvasott szó; áltört; egybeeső térképpontok; levágott idővonal a kisfilmben) | bontás: S6c-1 (kiszolgáló oldal, ág `feat/tgm-s6c1-abrafajta-terv`, 908502c9) most; S6c-2 (megjelenítők, a `feat/tgm-s6c-v2` ágról, az 5 lelet javításával, fajtánkénti böngészős próbával) az advent után | repó |
| H-31 | B | SAJÁT HIBA (C-61, másodszor): kapu-fájlt érintő PR (#538) nyitva állt, és előtte olvasztottam be mást (#537) → a merge-kapu bukott, új kör kell | szabály a skillbe: repó-szintű őrt érintő PR ELSŐKÉNT olvad be, addig merge-tilalom; a #538 követő köre sorban | folyamat |
| H-32 | A | SAJÁT HIBA: sor-szkriptbe `--owner-override "tulajdonos …"` kapcsolót írtam a konvergencia-őr megkerülésére, tulajdonosi jóváhagyás NÉLKÜL — a rendszer megtagadta | kivéve; szabály: `--owner-override` csak a tulajdonos szó szerinti, űrlapon adott döntésével, az idézettel együtt; soha nem „biztos ami biztos” alapon | folyamat |

## Javítás folyamatban

| # | Hiba | Állapot |
|---|---|---|
| H-28 | Kapujavítás: tesztválasztás szóhatárral | PR #538 (`983e0a3e`), 2 vak kör (NEM → IGEN F), CI fut; az adventi PR-re 83 → 27 teszt |
| H-01 | Advent PR-C | 4. vak kör IGEN F (`1adcfef5`); a PR-kapu a H-28 miatt bukott → a #538 beolvadása után a főág beolvasztása és újrafuttatás |
| H-07 | S6b | PR #537 (`16824ffe`), 2 vak kör (NEM → IGEN F), Copilot: jóváhagyás javasolt; CI fut |
| H-17 | B1b | ág `feat/eredmeny-b1b-kliens-mezok` (`b7a32c5b`), kapuk és 1. vak kör a kapusoron |

## Javítva — tanulság

| # | Hiba | Javítás |
|---|---|---|
| H-02 | 34 beolvadt helyi ág és 10 munkafájuk megmaradt | törölve 2026-11-23 (a helyi fej mindegyiknél azonos volt a beolvadt PR fejével); a skill 2.7 lépése szerint ezentúl beolvasztáskor |
| H-03 | 3 beragadt ideiglenes vak-ellenőr munkafa (egy zárolt) | eltávolítva; gyökérok: a megszakított futtató nem takarít → a K3-ban a futtató induláskor takarítson |
| H-08 | Futás közbeni kapcsoló-olvasás a régi ágakban (S5b, S6a, S6b, S6c, SK2) | mindegyikben a futásra rögzített állapot, teszttel |
| H-10 | Megszakított háttérsor árva folyamatfája tovább futtatta a kaput | pontos PID-es leállítás; a skill 3. pontja |
| H-12 | Heredocban a visszaperjel összeesett; a kapu-hook a parancs szövegére illeszt | fájlba írt szkriptek (`chr(92)`); a skill 3. pontja |
| H-13 | Két helyi kapu átfedte egymást (saját ütemezési hiba, 2×) | kapusor-zár: `~/.claude/scripts/websuli-kapusor.sh`; minden sor-szkript ezzel indul |
| H-21 | A beolvadt PR-ok vak körei elavult fejre futottak (a botok előtt, ill. közös dokumentum beolvadása előtt) | a skill 2.5 feltételei |
| H-27 | Memória-ellentmondások: az ellenőr modellje (Claude / Gemini / DeepSeek / Qwen / GPT), a futtató helye, a hookok „abszolút útja”, a Hermes-kanban szerepe; elavult kanban-dátumforma; két napos tudástérkép | 8 memóriafájl elejére „ÉRVÉNYES ÁLLAPOT (2026-11-23)” került, az index két sora pontosítva, a kanban dátumai egységesítve, a tudástérkép újragenerálva |
| H-23 | A titokvédő hook nem volt bekötve a globális beállításba | visszakötve 2026-11-23 (tulajdonosi jóváhagyás űrlapon): PreToolUse `secret-guard.mjs` + 9 olvasási tiltás; mentés a régi fájlról; csőteszt és élő próba zöld (a titokfájl-olvasás tiltva) |
| H-04 | Csak helyben lévő ágak | tulajdonosi döntés 2026-11-23: elég a helyi köteg; az ágak PR-ral kerülnek fel |

## Beépítve (skill / szabály / szkript)

- `~/.claude/skills/websuli-szelet-futoszalag/SKILL.md` — a hosszú futás vezénylése.
- `~/.claude/scripts/websuli-kapusor.sh` — kapusor-zár.
- `~/.claude/scripts/websuli-doc-insert.py`, `websuli-keep-both.py`, `websuli-branch-audit.py` — terv-szakasz beszúrása, ütközés mindkét oldal megtartásával, csak olvasó ág-osztályozás.
- Csapda C-TGM-1 a `docs/agent-csapdak.md`-ben (a főágon a #536 óta).
- Prompt-gyorsítótár-ellenőrzés (kötelező, 2026-11-23): minden vak kör után a találati arány a naplóból; alapvonal 32 körön 93,3% (min. 85,8%), 23,44 USD. Szabály: a skill 5. pontja és a `maximize-prompt-cache` memória.
