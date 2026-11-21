# Végrehajtási utasítás: gépköltöztetés utáni folytatás

> Terv: `docs/specs/2026-11-21-gepkoltoztetes-folytatas.md` · Dátum: 2026-11-21
> Hatókör: kizárólag a WEBSULI repó és mentései. Más repó tilos.

## 0. Minden szeletre érvényes eljárás (kötelező, ebben a sorrendben)

1. Munkafa: `git worktree add .claude/worktrees/<név> <ág>`; benne `cd source && npm.cmd ci --ignore-scripts` (a `node_modules` másolása tilos).
2. Friss alap: `git fetch origin && git merge origin/main` az ágban (rebase és force-push tilos). Ütközésnél a főág viselkedése és az ág célja szerint oldd fel.
3. Szakasz-kapu: `npm run gate:stage` a munkafa gyökeréből. Csak zöld után lehet továbblépni.
4. Push-kapu: `npm run gate:push`.
5. Vak ellenőr a vak futtató munkafájából (`.claude/worktrees/vak-ellenor-deepseek`), amíg a futtató nincs a főágon:
   `npm run gate:blind-review -- --base origin/main --head <40 jegyű fej> --spec <terv.md> --goal <scratchpad>/cel.md --out <scratchpad>/jelentes.md`.
   A `cel.md` csak a tulajdonosi kérést, a célt és a 8a–8f hibakereső pontokat tartalmazza (skill: `websuli-vak-ellenor` 4. pont).
6. Ítélet rögzítése: `node scripts/qa/gates/record-review.mjs --head <fej> --verdict <ítélet> --report <jelentes.md>`.
   NEM ítéletnél: javítás, majd vissza a 3. lépésre (vak körök max 3; a 3. NEM után bontás vagy tulajdonosi döntés).
7. PR-kapu: `npm run gate:pr -- --body-file <scratchpad>/pr.md`; push külön, egyszerű paranccsal a munkafa gyökeréből; meglévő PR-nál csak push.
8. Zöld CI után, közvetlenül a merge előtt: `bash scripts/qa/active-runs-guard.sh` (AKTIV=0), majd `npm run gate:merge -- <PR>`, végül `gh pr merge <PR> --squash`.
9. Merge után: `git -C D:/repo/WEBSULI pull --ff-only origin main`; a terv „Állapotnapló” sora; a kanban-jegy frissítése.

## 1. H0 — vak futtató a főágra

1. `.claude/worktrees/vak-ellenor-deepseek` (ág `chore/vak-ellenor-deepseek`, fej `1e564a01`): a 0. eljárás 2–4. lépése.
2. Vak kör a futtató saját fejére, ebből a munkafából. Terv: `docs/specs/2026-11-18-vak-ellenor-deepseek.md`, valamint `docs/specs/2026-11-18-vak-hibakereso-ellenor.md`, ha az ágon megvan.
3. A 0. eljárás 6–9. lépése, új PR-ral (`chore(qa): vak ellenőr futtató a főágra`).
4. Utána ugyanígy: `feat/gepi-zar`, majd `feat/gpt-teljesitesi-or` (a futtató már a főágról fut).

## 2. H1 — advent (határidő 2026-11-30)

1. #523 (`feat/advent-b-adatmodell-vegpontok`, fej `79d35d16`): munkafa, 0. eljárás 2–9. Terv: `docs/specs/2026-11-18-adventi-naptar.md`.
2. PR-C: a `wip/advent-c-javitas` ág a #523 merge-e után `origin/main`-nel összefésülve, új PR, 0. eljárás.
3. A-1 (S6) és A-2 (S5): a pótlási terv (`docs/websuli-potlasok` ág) A-1/A-2 szelete szerint új ágak. A bekapcsolás (D-11) csak a tulajdonos előnézeti próbája után.
4. Képek: fizetős kör csak a tulajdonos űrlapos jóváhagyása után (≤ 7 USD, előbb 10 kép).

## 3. H2 — kész PR-ok

Sorrend: #524 → #521 → #513 → #522 → #418 → #510. Mindegyiknél: munkafa a PR ágáról, `origin/main` összefésülése, 0. eljárás 3–9.
A #510-nél előbb az 5 nyitott review-lelet javítása, bukó teszttel előre (terv: `docs/specs/2026-11-17-eredmeny-email-kviz.md`).
A #418 élesítési küszöbe (480 MB) tulajdonosi jóváhagyás. A kód beolvasztható a küszöb bekapcsolása nélkül.

## 4. H3 — TGM-lánc

1. Alulról felfelé, PR-onként egy szelet: S5a, S5b, S6a, S6b, S6c, SK2, S2b-1, S2b-2 (ágak: `feat/tgm-s5a-visszajelzes-nyitasok` … `feat/tgm-s2b2-megjelenito-leletek`).
   Minden PR önmagában semleges (a `STUDIO_LESSON_VARIETY` kapcsoló KI). Terv: `docs/specs/2026-11-20-tgm-valtozatossag-abrak.md` (az ágon).
2. Utána S3a-1 → S3a-2 → S3b (MCS-013…017), majd MCS-018…031 a revízió 00-ás fájlja szerint.

## 5. H4–H6

- H4: T-1 (`fix/pontozo-polinom-ket-szam`), I-1 (`fix/kliens-ip-cloudflare-ut`), session-zárás, szkriptkapuk P2, a kapu-ágak tartalmi összevetése (ami már bent van: takarítás; ami nincs: PR).
- H5: #504 → #484 → #486 → J7b → Szökőár → joystick → G-21 → kabala → további G-*, J-*, M-* szeletek (pótlási terv 7.1 táblázat).
- H6: a revízió `00-osszegzes-es-munkacsomagok.md` MCS-032…935 csomagjai. Előbb egy szkript számolja meg, melyik csomag melyik állapotú (kész / PR / döntés), és ezt rögzítse. Utána csomagonként a 0. eljárás.

## 6. H7 — higiénia és zárás (minden hullám végén)

- A beolvasztott ágak helyi törlése tartalmi összevetés után (`git diff origin/main...<ág> --stat` üres vagy a PR MERGED). Távoli ág csak jóváhagyással.
- Munkafák: `git worktree remove` a lezártakra.
- Retró: `retro-naplo.md` bejegyzés; csapda a `docs/agent-csapdak.md`-be; a tudástérkép frissítése: `python -X utf8 ~/.claude/scripts/tudasterkep.py`.

## 7. Megállási pontok

- A vak futtató nem fut (2-es kilépési kód) → megállás, tulajdonosi döntés.
- Tulajdonosi lépés (C6) → űrlap, a tétel addig NOT DONE.
- Ugyanazon a ponton 3 sikertelen megközelítés → megállás, opciók a tulajdonosnak.
