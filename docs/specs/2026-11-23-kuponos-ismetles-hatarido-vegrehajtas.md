# Végrehajtás — P-010 kuponos ismétlés határidő (terv: `docs/specs/2026-11-23-kuponos-ismetles-hatarido.md`)

1. `source/tests/game-question-director-kupon.test.ts` (új): seedelt szerződés-tesztek a director tiszta bemenetén — K1–K5
   8 / 10 / 11 / 12 tételre (80 seed × 7 pontosság), K6 (12 tételes lecke, hiba + megszakított visszatérés). Futtatás
   javítás ELŐTT: bukniuk kell (RED, a mért számokat a naplóba).
2. `source/client/src/game-engine/play/questionDirector.ts`: `couponDeadline()` + a kupon ág első lépése; az `abort` a
   megszakított menetközi ismétlés `returns`-ét visszaveszi. A fejléc-megjegyzés kupon-mondata frissül.
3. Futtatás: az új teszt + `game-question-director.test.ts` + `brainrot-sim.test.ts` (GREEN), `npx tsc` a `source`-ban.
4. `docs/specs/2026-11-16-jatekok-jatekelmeny-vegrehajtas.md` J5a 23. „Jegyre” sora: hivatkozás erre a szeletre.
5. Kapuk: `npm run gate:stage` → `npm run gate:push` → `node scripts/qa/gates/local-review.mjs` → `npm run gate:pr` → push → PR.

## Végrehajtási napló

- 2026-11-23 — a `fix/brainrot-kozos-kupon` ág (és `origin/higienia-backup/…`, azonos fej `87d3d5d8`) átnézve: a J5a 23. kupon-
  munkája (a Brain Rot lapi `couponRepeat` kiváltása a közös director kupon-ágával, a sim-teszt `min(2n, 10)` ablaka) a mainben
  már benne van (`couponRepeat.ts` a mainen nincs, a `brainrot-sim.test.ts` a `LAZÍTÁS`-t és a plafon-kivételt tartalmazza); az
  ág a mainhez képest csak régebbi (J1a) állapotot hordoz. Határidő / felső határ / 10–12 tételes teszt nincs rajta → új ág
  `origin/main`-ről.
- 2026-11-23 — RED (javítás előtt, `node --import tsx --test tests/game-question-director-kupon.test.ts`): 5/5 bukás —
  K1–K5 szerződés-sértés 8 tételnél 25, 10-nél 5221, 11-nél 5839, 12-nél 6524 (mind K1: a plafon alatti hiba 11–15 kérdés
  múlva vagy egyáltalán nem jön vissza); K6: `seed 1: L0 3. feltevése ismétlésként (L0: 0,6,7,19,31)` — a megszakított
  visszatérés a plafonba számított, a következő hiba után a tétel csak a körforgásban (12 kérdés múlva) jött.
- 2026-11-23 — első kísérlet plafon NÉLKÜLI határidővel: K1 minden méretre teljesült, de csupa rossz válasznál 12+ tételes
  leckénél a lecke nem haladt (60 kérdésben a 11–12. tétel sosem került sorra — minden hely határidős visszatérés lett). Ezért
  a határidő a menetenkénti plafon (`MAX_RETURNS_PER_RUN`) alatti hibára él; a plafon fölötti a körforgással jön (K2, mért
  legrosszabb 400 seeden: 8 → 13, 10 → 17, 11 → 23, 12 → 27, 16 → 35 kérdés; teszt-korlát 3n). K3 mért legrosszabb (csupa rossz
  válasz): 12 tétel → 28., 16 tétel → 38. kérdésig minden tétel sorra kerül.
- 2026-11-23 — K6 a határidő-javítás után is bukott, amíg az `abort` nem vette vissza a `returns`-t (ellenőrizve: a visszavétel
  kikapcsolásával ugyanaz a hiba) → a megszakított menetközi ismétlés visszatérés-számlálója visszaáll.
- 2026-11-23 — GREEN: `game-question-director-kupon` + `game-question-director` + `brainrot-sim` + `game-director`: 58/58 zöld;
  `npx tsc --noEmit` (source): 0 hiba.
