# Szökőár — vissza az emelkedő vízhez: végrehajtási utasítás (ügynöknek)

Terv: `docs/specs/2026-11-18-szokoar-tema-es-sebesseg.md` (tulajdonosi döntések: 0. fejezet; mi jön vissza / marad / szűnik meg: 0.2;
tesztek: 0.3). Ág: `fix/szokoar-tema-es-sebesseg`, munkafa: `.claude/worktrees/szokoar-tema`. A régi változat: `b4b84db6`
(`.claude/worktrees/szokoar-regi`).

Állapot: a koordinátori döntések (2026-11-18) után — kompakt kérdés kis képernyőn (A), akadály nincs (D2-b: A), menetindítás
javítva. Valódi telefon: UNVERIFIED.

### Teljesítmény-mérés (4× lassított CPU, valódi GPU, `measure-game-frames.mjs`; a #491 csak a mérő-munkafában, ideiglenesen)

| Változat | Telefon: indítás leghosszabb képkocka | Kihajtott: indítás | Leghosszabb megakadás menet közben |
|---|---|---|---|
| ág, #491 nélkül | 3133 ms | 12 533 ms | 5,3 s (kihajtott, séta) |
| ág + #491 | 2600 ms | 2267 ms | nincs > 100 ms (p99) |
| + jelenet a menü alatt előkészítve | 167 / 250 ms | 217 / 167 ms | menüben 4,4 s blokk (kézi bank) |
| + azonos méretnél nincs újraépítés, Lambert-díszlet (nem „high” szint) | 100 ms | 83 / 100 ms | menüben / tétlenben 4–5 s (kézi bank) |
| + a kézi bank szeletelt feldolgozása (végleges) | 250 / 117 ms | 83 / 150 ms | nincs 1 s feletti; p99 ≤ 250 ms |

Ok-feltárás (CPU-profil): az 5,3 s-os és a menübeli 4–11 s-os blokk a `mergedPools` `useMemo` — a ~10 MB-os kézi bank minden
tételének ellenőrzése egyben (`splitBankItemsByTier` → `isPlayableQuestion`); nem szemétgyűjtés, nem textúra, nem árnyék. Az
indítás akadása a jelenet felépítése (geometria, környezet-térkép, shader-fordítás) volt. Az utolsó mérési kör (r11–12) a gépen
közben futó idegen tesztkonténer miatt végig 12–30 fps volt (menüben is) — nem értékelhető, ezért nincs a táblában. A 200 ms-os
indítási cél a telefonos nézetben egy mérésben (250 ms) még nem teljesült.

## Lépések

1. **Víz-mag (tiszta TS, seedelt):** `client/src/lib/tsunami/water.ts` — a régi lap hurok-logikája (`b4b84db6`
   `TsunamiEscapeEnglish.tsx:1128-1220`) kiemelve: víz % (12 → 88 = vereség), emelkedés (alap × (0,62 + stressz × 1,18) × zóna-szorzó ×
   pálya-tempó), zóna (16–84 %, 5,2 / 6,3 / 7,6 mp-enként új hely a menet RNG-jéből — nem `Math.random`), sodrás (szinusz), Sprint,
   a kérdés alatti lassítás (`slowMo` szorzó), D4-hatás (jó: −X % + permet-esemény; rossz / lejárt: +Y % ugrás + rázás-esemény),
   győzelem (N jó válasz → menedék), fix lépés (1/60 s). Események a nézetnek (`waterDrop`, `waterSurge`, `won`, `lost`).
2. **Kérdés:** a közös `usePlayQuestion` + `InlineQuestion` „buttons” módban (4 gomb, `portal={false}`, testid `ts-question`,
   gyökér `ts-quiz`), a director-config a régi tempóból (kérdés 6–11 mp-enként, a terv J-mérőszámai szerint ≥ 5 / perc); a kérdés NEM
   állítja meg a világot. Élesítés: a válaszgombok a kérdés-óra szerint (`ANSWER_ARM_MS`). A kupon-szabály, a kérdésbank-sorrend, az
   ismétlési sor a mostani lapból (provider) változatlanul.
3. **Lap:** a régi lap szerkezete (zóna-jelzés, sodrás, Sprint, joystick, HUD: CÉL / HULLÁM / PONT, eredmény-képernyő) a mostani
   közös komponensekkel (GameShell, CouponHud, QuizFeedbackCard, „Miért?”, ResultReview, achievements, napi kihívás, pontküldés).
   A régi kvíz-fázis és a megállító `setTimeout`-ok nem jönnek vissza.
4. **Jelenet:** a régi `TsunamiScene3D` (függőleges öböl, deszkák, világítótorony, víz), bővítve: (a) **menedék fent** — a felső
   deszkán kis menedék-ház zászlóval, a képen MINDIG látszik, a HUD-on „Még N jó válasz a menedékig”; (b) **D4** — a víz szintje
   simán (≤ 400 ms) visszahúzódik + permet-részecskék jó válasznál, ugrás + rázás (a közös `feel.addTrauma`, csökkentett mozgásnál nincs)
   + mély hang (közös `audioEngine`) rossz / lejárt válasznál; (c) **győzelem** — a figura a menedékbe ér, a víz alatta megtörik
   (taraj-összeomlás + permet). Akadály NINCS (D2-b döntésig).
5. **Teljesítmény:** mérés előtte / utána (a #491 mérőjével, helyi build, élő adat): a menet eleji hosszú feladat, a telefonos szint
   (pixelarány-plafon, PBR → Lambert a telefonos szinten, ha a mérés indokolja). Valódi telefon: UNVERIFIED.
6. **Tesztek** (terv 0.3): új `tsunami-water.test.ts` + `tsunami-sim.test.ts` (víz-sim, J-mérőszámok), a `tsunami-play.spec.ts` és az
   esetfájlok átírása dokumentált SPEC-VÁLTOZÁSsal; a futó-mag tesztjei a mag törlésével együtt mennek (a helyettük írt tesztek
   ugyanazt a mércét tartják: kérdés/perc, kérdés nélküli szakasz, determinizmus, élesítés, ≥ 48 px, levágás, takarás).
7. **Kapuk:** szakaszonként `gate:stage`; böngészős kör E2E-sorompóval, `--workers=1`; előtte / utána képek 390×844 és 827×896;
   push NEM — mérföldkő a koordinátornak.

8. **Látvány C irány — Blender (terv 7.2):**
   a. `source/scripts/blender/szokoar/` — `common.py` (paletta, lekerekítés, vertex-szín, export), elem-szkriptek,
      `build_all.py`; futtatás: `"$BLENDER_BIN" -b -P source/scripts/blender/szokoar/build_all.py`.
   b. Kimenet: `source/client/public/models/szokoar/*.glb` + `manifest.json`; csak a kész fájl kell a futáshoz.
   c. Betöltés `GLTFLoader`-rel a menü alatt; hiány / hiba esetén a mostani primitív díszlet a tartalék.
   d. Őr-teszt a keretre (`tests/tsunami-models-budget.test.ts`).
   e. Minden lépés után valódi böngészős kép (390×844 és asztali), teljes útvonallal; a #491-mérővel indítás ≤ 200 ms
      (4× CPU), ~60 fps.

9. **Látvány 4. lépés (terv `docs/specs/2026-11-18-szokoar-tema-es-sebesseg.md` 7.4):**
   a. Előtte-képek és mérés (rajzolási hívás, fps, indítási tüske) valódi GPU-val; a kifakulás okának szétválasztása.
   b. `source/scripts/blender/szokoar/build_all.py`: sRGB-paletta → lineáris csúcs-szín (függőleges átmenettel), egy közös anyag,
      modellenként egy primitív; új modellek: `cliff`, `hill`, `debris_log`, `kid_board`, `kid_torso`, `kid_head`, `kid_arm`,
      `kid_leg`. Futtatás: `"$BLENDER_BIN" -b -P source/scripts/blender/szokoar/build_all.py`.
   c. `source/tests/tsunami-models-budget.test.ts`: az új nevek és a „modellenként egy primitív” őre.
   d. `source/client/src/game-engine/scenes/TsunamiScene3D.tsx`: hullámfal-shader (taraj, ajak, köd; a vízszinttel nő és
      közelít), ég / fény / tónus, vízfelszín-színek és habgyűrű a szikla-hegy körül, `InstancedMesh` a díszletre és a
      törmelékre, összevont deszkák cölöpökkel, Blender-figura a meglévő forgáspontokra, `renderer.compile` a modellek
      betöltése után (a menü alatt).
   e. Minden lépés után kép (390×844 és asztali; alacsony / közepes / magas víz) a
      `docs/measurements/szokoar-tema/latvany/` alá (`c4-*`), a készítés módjával; a képeket meg kell nézni.
   f. Mérés a végén: rajzolási hívás ≤ 130, 390×844-en ≥ 57,7 fps, 4× CPU-s indítási tüske ≤ 200 ms.
   g. Kapuk: `tsunami-play.spec` teljes, a közös mérők Szökőár-köre, `gate:stage`, `gate:push`.

10. **Csiszoló kör (terv `docs/specs/2026-11-18-szokoar-tema-es-sebesseg.md` 7.5):**
   a. Profil (`long-animation-frame` + CDP-mintavételezés) a menet első 30 másodpercére, 1× és 4× CPU; az ok tényből.
   b. Javítás a forrásnál (ha közös modul érintett: csak hozzáadó változtatás, a meglévő viselkedés marad).
   c. `TsunamiEscapeEnglish.tsx`: általános eltolás-megoldó (álló és fekvő nézet), a teszt-kampó `x` mezője, a súgó helye.
   d. `TsunamiScene3D.tsx`: lépcsőzetes stégek kötélkorláttal, álló nézetben magasabb taraj, a kirajzolt eltolás visszaírása.
   e. `tsunami-play.spec.ts`: új eset — a figura a két szélre mozog nyitott kérdés alatt, ≤ 600 ms-on belül szabad.
   f. `build_all.py`: normalizált tartalmi lenyomat a fájlnévben, 3 futással igazolva.
   g. Mérés nyugodt gépen 5–5-ször; képek (`c5-*`); kapuk.

## Elfogadás
- A víz MINDIG látszik, a menedék MINDIG a képen van; jó válasznál a víz képi szintje 0,5 s-on belül csökken, rossznál nő.
- A kérdés nem állítja meg a világot (a víz lassítva emelkedik); a válaszgombok ≥ 48 px, nem takarják a figurát és a tárcsát.
- Autó, kapu, sáv nincs a pályán.
- Közös mobil mérő Szökőár 3 nézet, meta-mérő, lejárt kupon, `tsunami-play`, joystick-mérő Szökőár: zöld.
