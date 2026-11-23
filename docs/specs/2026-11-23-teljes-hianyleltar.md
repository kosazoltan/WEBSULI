# Terv — a WEBSULI teljes hiányleltárának maradéktalan lezárása (2026-11-23)

Tulajdonosi kötelező utasítás (2026-11-23): „addig javítsd a websuli programot, ameddig az összes hiánybejegyzés (visszatekintő,
leltár, fejlesztési igény, fejlesztési hiányosság) el nem készül; keresd vissza a leltárfájlokat, azokból állapítsd meg a célt, készíts
tervet, majd maradéktalanul, hibátlanul, hazugság-, hallucináció- és lustaságmentesen érd el a célt.”

## 1. Források (mind a repóban)

| Forrás | Hely | Tartalom |
|---|---|---|
| Pótlási leltár | `docs/websuli-potlasok.md` (+ `docs/specs/2026-11-19-websuli-potlasok-terv*.md`) — e PR hozza a főágra | P-001…P-068 (2026-11-19-i állapot) |
| Főterv | `docs/specs/2026-11-23-foterv*.md` — e PR hozza a főágra | hullámok H1–H9, döntési pontok D1–D6 |
| Backlog | `memory/projects/websuli/BACKLOG.md` | régi nyitott tételek (titok-rotáció, maps/extract, OCR…) |
| Hibajegyzék | `docs/handoffs/2026-11-23-hermes/kanban/hosszu-futas-hibajegyzek.md` (ág `docs/hermes-atadas-2026-11-23`) | H-01…H-32 |
| Kanban | `.hermes/kanban.db` (régi, 204 jegy) + Hermes `websuli` tábla | jegyek |
| Visszatekintők | `docs/handoffs/*retro*.md` | nyitott követő pontok |

A tételek MOSTANI állapotát (főág `fcf033ee`, 2026-11-23) négy független, csak olvasó ellenőrzés mérte újra git / `gh` bizonyítékkal;
a mester-nyilvántartás az SQL `feladat.tasks` tábla (`node D:/repo/Hermes-agent/scripts/feladat.mjs list --repo D:/repo/WEBSULI`),
tétel-azonosítóval a címben (`[P-0NN]`, `[BL-…]`, `[H-..]`, `[KB-…]`). A 2. táblázat ennek a pillanatképe.

## 2. Cél

Minden alábbi tétel a 3. pont szerinti állapotba kerül: **KÉSZ** (a főágon, zöld kapukkal és CI-vel, PR-hivatkozással), **DÖNTÉS**
(tulajdonosi űrlap-válasz rögzítve és végrehajtva), vagy **ELVETVE** (tulajdonosi döntéssel vagy igazoltan elavultként). Semmi nem marad
csak helyi ágon. Nem-cél: env-kapcsolók élesítése (`ADVENT_CALENDAR`, `STUDIO_*`, `MP_MODE`…) és fizetős modellfutás tulajdonosi
jóváhagyás nélkül; titok-rotáció (a tulajdonos végzi, mi csak a kód-oldali teendőt).

## 3. Állapot-pillanatkép (2026-11-23) és hullám-besorolás

Jelölés: KÉSZ / RÉSZ (részben) / ÁG (ágon kész, nincs bent) / NINCS (el sem kezdve) / DÖNT (tulajdonosi döntés) / ELAV (elavult).

| Tétel | Állapot | Hátralévő (röviden) | Hullám |
|---|---|---|---|
| P-001 J3a Rúnabánya | ÁG #484 | fejek egyeztetése, frissítés a #504-re, K1–K6, P-063 | H6 |
| P-002 J6a Kristály | ÁG #486 | fejek egyeztetése, mobilmérő, CI | H6 |
| P-003 J7b útelágazás | ÁG (nincs PR) | PR, fekvő címke / kontraszt / determinizmus | H6 |
| P-004 Kockavadász perf | RÉSZ (#504 bent) | valódi telefonos mérés (tulajdonos) | H6 |
| P-005 Szökőár téma | ÁG (csak helyi) | push, PR, CI | H6 |
| P-006 Joystick jobb kéz | ÁG (csak helyi) | push, PR, érintőteszt | H6 |
| P-007 Kabala sáv | DÖNT | kiadjuk-e; maki prototípus | H0 |
| P-008 Brain Rot közös ismétlés | RÉSZ | szerződéses teszt #95 | H6 |
| P-009 Kérdésbank S2–S3 | RÉSZ | S2–S3, invalidálás, mérés | H8 |
| P-010 Kuponos ismétlés határidő | NINCS | szerződés + teszt, felső korlát | H3 |
| P-011 Szólétra felirat / tárgyrag | NINCS | text-shadow, 2 mondat, telefonos ellenőrzés | H3 |
| P-012 Szólétra tempó / XP | RÉSZ | szintezés 2/2, időzítés szétválasztás | H6 |
| P-013 J1b/c Szökőár | NINCS | játékszabályok | H6 |
| P-014 J2b/J3b/c/J6b/J7c | NINCS | szeletek (J3a/J6a/J7b után) | H6 |
| P-015 J5b Brain Rot rivális | NINCS | szelet | H6 |
| P-016 Játékmotor órák | RÉSZ | mérés, órák | H6 |
| P-017 Éles képernyő-leletek | RÉSZ | egyenkénti reprodukció | H6 |
| P-018 Párbaj JM3b | RÉSZ | 3–4 fős szoba, JM4–6 | H6 |
| P-019 JM7c-2, JM8–11 | RÉSZ | fiókátmenet, jutalom | H6 |
| P-020 Gmail-alias | DÖNT | egyediség? | H0 |
| P-021 Aszteroida utómunka | NINCS (#486-tól függ) | pool, napi seed | H6 |
| P-022 Fiók / MP élesítési sorrend | DÖNT | sorrend, kapcsolók | H0 |
| P-023 Címőr utáni történet | DÖNT | történetátírás? | H0 |
| P-024 Eredmény-e-mail S1b | RÉSZ (B1a, B1b bent; #510 nyitott) | B2–B8, #510 lezárása | H4 |
| P-025 Tartós jelző, kézbesítési szélek | RÉSZ | óravezérelt tesztek, errorClass | H4 |
| P-026 Címben az osztály | ÁG (e5db9c9b) | új PR | H2 |
| P-027 Pontozó polinom / rubrika | RÉSZ | végpontozás, rubrika, tesztpárok; helyi ág `fix/pontozo-polinom-ket-szam` | H3 |
| P-028 Stúdió S1–S3, SK1c | RÉSZ | S3a/b, SK1c, mérés | H5 |
| P-029 Stúdió S4, SK3 | NINCS | aritmetikai őr, költségjelzés | H5 |
| P-030 Stúdió S5–S6, SK2 | RÉSZ (#540 nyitott) | S6c, SK2 mérő | H5 |
| P-031 Stúdió S7 | RÉSZ | S7b plafon, regressziópróba | H5 |
| P-032 Brit TTS S8c | RÉSZ | gyártómodul (fizetős kör: tulajdonos) | H5 |
| P-033 Stúdió S9/S10/SK4/SK5 | NINCS | kiadási őr, zárómérés | H5 |
| P-034 Advent PR-B | KÉSZ (#523) | squash-tartalom ellenőrzése (79d35d16) | H1 |
| P-035 Advent PR-C | ÁG (`feat/advent-c-felulet-es-elesites`) | kapu, PR, merge — folyamatban | H1 |
| P-036 Advent S3c képek | DÖNT | képválasztás | H0/H1 |
| P-037 Képgyártó utómunka | RÉSZ | zár, költség, teszt | H1 |
| P-038 Advent S5/S6/S8 | ÁG (`feat/advent-s5-s6-elesites`) | A1 után | H1 |
| P-039 Advent bank-átfedés, felolvasás | RÉSZ | koszorús tételek, 1. osztályos út | H1 |
| P-040 Hang-előmelegítés | ÁG (csak helyi) | push, PR | H2 |
| P-041 Kisfilm memória | KÉSZ (#418) | #529 bontása | H2 |
| P-042 Szkriptkapuk P2–P5 | RÉSZ (P2 helyi ág) | PR, P3–P5 | H7 |
| P-043 Vak ellenőr | ELAV → #541 (helyi GPU-ellenőr) | #541 merge | H2 |
| P-044 Merge-kapu REST #513 | ÁG | W1–W4, merge | H2 |
| P-045 Audit-hook szigorítás | RÉSZ | aliasok, Windows-indítók | H7 |
| P-046 Kapu gyorsítás | RÉSZ (#542 bent) | helyi ágak egyeztetése | H7 |
| P-047 Állapot-ellenőrzők | ÁG (csak helyi) | push, PR | H7 |
| P-048 Régi auto-review | KÉSZ (#522) | `bence-auto-review` legacyKey (H-25) | H7 |
| P-049 Kitakaró #521 | ÁG | rebase, CI, merge | H2 |
| P-050 CI E2E hangolás | RÉSZ | TTS súly, SHA-rögzítés | H7 |
| P-051 Ügynökvezérlés 2. lépcső | RÉSZ | függőségek, márkanév, VPS-doksik | H8 |
| P-052 Aktívfutás-őr, éles konfig | RÉSZ | deploy-útba kötés | H7 |
| P-053 Havi perf-audit | RÉSZ | sitemap, admin lapozás… | H8 |
| P-054 Szkript-őrök J3–J10 | NINCS | őrök | H7 |
| P-055 Advent vendéghaladás | KÉSZ (#523) | helyi ág takarítása | H1 |
| P-056 Advent képek / levél jóváhagyás | DÖNT | | H0 |
| P-057 Hook eszközhatár | DÖNT | | H0 |
| P-058 Kapu-napló munkafánként | ÁG (helyi P2-ág) | PR | H7 |
| P-059 Régi migrációs tananyagok | NINCS | kivizsgálás | H8 |
| P-060 Háttérfigyelők életciklusa | NINCS | időkorlát, árva figyelők | H7 |
| P-061 Nyitott PR-ok / ágak | RÉSZ | #484 #486 #510 #513 #521 #527 #529 #540 #541 | H2 |
| P-062 Oldalszál-átadó | RÉSZ | S9, S10, S8c bizonyíték | H5 |
| P-063 J3a pontskála | DÖNT | | H0 |
| P-064 TTS próbakimondás / hangtárplafon | DÖNT | | H0 |
| P-065 SK3 leállítási hatókör | DÖNT | | H0 |
| P-066 Vizuális kapcsoló hibaága | DÖNT | | H0 |
| P-067 Auto-merge szöveg | KÉSZ (#522) | — | — |
| P-068 Külön GitHub-munkamenet | ELAV | — | — |
| BL Google OAuth secret rotáció | DÖNT (tulajdonos) | rotáció a konzolon | H0 |
| BL Titok-rotáció 2026-10-14 (KB #9) | DÖNT (tulajdonos) | rotáció | H0 |
| BL `/maps/extract` más felhasználó térképe (KB #11) | NINCS — **biztonsági hiba** | felhasználóra szűkítés + teszt | H3 |
| BL OCR modell (KB #8) | RÉSZ | kézírásos mérés | H5 |
| BL withQuotaFailover → OpenRouter (KB #10) | DÖNT | | H0 |
| BL likes/batch böngészős újraellenőrzés | NINCS | mérés | H8 |
| BL nem QA-zott felületek (/admin, /preview, PDF) | NINCS | QA-kör | H8 |
| BL 1163 eslint-figyelmeztetés | NINCS | logger / szabály | H8 |
| BL doc-drift (docs/ alatt) | RÉSZ | ellenőrzés | H8 |
| H-09 lesson-clip-worker ingadozás | KÉSZ (#542) | — | — |
| H-11 PR-leírás generátor | NINCS | szkript | H7 |
| H-22 Gemini „második vélemény” szabály | NINCS | szabályok rendezése a #541 után | H7 |
| H-24 Skill-tükör eltérés | NINCS | szinkron + ellenőrző bővítése | H7 |
| KB #205 merged-probe időérzékeny | NINCS | | H3 |
| KB #206 parallel-bank időzítés | NINCS | hamis óra | H3 |
| KB #212 OAuth-bizonyíték órafüggetlen | NINCS | | H3 |
| KB #31, #78, #89, #110, #118, #126, #209 | KÉSZ a kódban | kártyák lezárása | H2 |
| Vihargarázs helyi e2e (új, 2026-11-23) | ÁG #543 | merge | H2 |

## 4. Sorrend (hullámok)

- **H0 — tulajdonosi döntések** (űrlapon, egy csomagban, 30 perces nyitvatartással): P-007, P-020, P-022, P-023, P-036/P-056,
  P-057, P-063, P-064, P-065, P-066, BL withQuotaFailover; a titok-rotációk emlékeztetőként.
- **H1 — Advent (határidő november 28.):** P-035 → P-038 → P-039 / P-037 → D1 előnézeti próba → bekapcsoló PR (tulajdonos).
- **H2 — kész vagy majdnem kész munkák beolvasztása:** #541, #543, #540, #513, #521, #529 bontása, P-026, P-040, csak helyi ágak
  feltöltése PR-rel, kész kanban-kártyák lezárása.
- **H3 — hibák és biztonság:** `/maps/extract` (P1 biztonság), P-010, P-027, P-011, KB #205/#206/#212.
- **H4 — eredmény-e-mail:** B2…B8 (P-024, P-025).
- **H5 — Stúdió / TGM:** P-028…P-033, P-062, OCR.
- **H6 — játékok és többjátékos mód:** P-001…P-006, P-008, P-012…P-019, P-021.
- **H7 — kapuk, infrastruktúra:** P-042, P-045…P-047, P-050, P-052, P-054, P-058, P-060, H-11, H-22, H-24, H-25.
- **H8 — teljesítmény, takarítás, QA:** P-009, P-051, P-053, P-059, BL-tételek.

## 5. Minden szeletre érvényes eljárás (a repó szabályai szerint)

Terv + végrehajtási utasítás (`docs/specs/`) → munkafa a főágból → kód + teszt → `gate:stage` → `gate:push` → `local-review.mjs`
(high leletet kódból ellenőrizni) → `gate:pr` → PR → botszálak javítása / megválaszolása → zöld CI → `gate:merge` (DATABASE_URL nélkül) →
merge → SQL-tétel lezárása (PR + commit hivatkozással) → záró hurok. A „KÉSZ” állítás csak lefuttatott parancs kimenetével igazolt.

## 6. Elfogadás (EARS)

- **F1** — WHEN egy tétel lezárul THEN the SQL-nyilvántartás SHALL `done` / `dropped` állapotot és PR- vagy döntés-hivatkozást tartalmazni.
- **F2** — THE 3. táblázat minden sora SHALL KÉSZ, DÖNTÉS (végrehajtva) vagy ELVETVE állapotba kerülni.
- **F3** — THE advent PR-C és S5+S6 SHALL november 28-ig a főágon lenni.
- **F4** — THE végrehajtási napló SHALL minden beolvasztás után frissülni.

<!-- acceptance-checklist -->
- [ ] F1 SQL-lezárás hivatkozással
- [ ] F2 minden sor lezárva
- [ ] F3 advent november 28-ig
- [ ] F4 napló naprakész
