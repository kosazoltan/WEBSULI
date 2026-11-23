---
name: kapurendszer-audit
description: "2026-11-22 audit — miért bukott sok vak kör (123 kör, 76 NEM, 0 tiszta IGEN, 90,72 USD); a javítások (blokkoló-definíció, --previous, beépített őr) és ami még hátravan"
metadata:
  node_type: memory
  type: project
  modified: 2026-11-22T21:10:32.232Z
---

**ÉRVÉNYES ÁLLAPOT (2026-11-23):** a hivatkozott `docs/specs/2026-11-22-vak-ellenor-konvergencia.md` csak a `chore/vak-ellenor-konvergencia` ágon (munkafa `vak-v2`) van meg; az ágnak nincs távoli párja — helyi köteg-mentés: [[hosszu-futas-vezenyles]].

Mérés (`websuli-qa-evidence`, 2026-11-19…22): 123 vak kör, 76 NEM, 40 IGEN FELTÉTELLEL, 0 tiszta IGEN, 7 nem teljes; 90,72 USD
(0,74 / kör); 260 M bemeneti token; 4337 fájlolvasás. Okok: (1) a megbízás nem határozta meg a blokkolót („van hiba, találd meg”);
(2) minden kör nulláról indult; (3) a konvergencia-őr nem volt a futtatóban; (4) a futtató NINCS a mainen (leválasztott munkafa,
6,5 ezer sor, a saját PR-jai sem konvergáltak); (5) a merge-kapu minden main-beolvasztás után új kört kér; (6) minden push ~1 órás E2E;
(7) sorsolásfüggő adventi DB-teszt; (8) a PR-leírás kötelező szakaszai csak bukásból derülnek ki.

Javítva (tulajdonosi jóváhagyás, 2026-11-22; ág `chore/vak-ellenor-konvergencia`, munkafa `.claude/worktrees/vak-v2`, 3072389a; terv:
`docs/specs/2026-11-22-vak-ellenor-konvergencia.md`): „Mi számít blokkolónak” a megbízásban; `--previous <jelentések>` visszaellenőrző
kör; beépített őr (3 NEM, vagy 2 NEM nem csökkenő blokkolóval → 4-es kód; kivétel: `--owner-override "<indok>"`).

**Why:** a tulajdonos szerint túl sok a bukás és a tokenpazarlás; a kapu, nem a kód volt a fő ok.
**How to apply:** vak kört mostantól a `vak-v2` munkafából indíts, a 2. körtől MINDIG `--previous`-szal. Hátravan: K2 (bizonyíték-átvitel
`git patch-id`-vel a merge-kapuban; docs / teszt-only PR E2E nélkül), K3 (a futtató mainre vitele kis szeletekben), PR-leírás-váz
generátor, a skill és a `docs/minosegkapuk.md` frissítése; a K1 utáni első 10 kör eloszlását a terv 8. pontjába kell írni.
Kapcsolódik: [[vak-kor-konvergencia]], [[gate-speed-decisions]], [[foszal-allapot]].
