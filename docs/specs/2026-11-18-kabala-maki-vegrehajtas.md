# Kabala-maki — végrehajtási utasítás (AI-ügynöknek)

**Terv:** [`docs/specs/2026-11-18-kabala-maki.md`](2026-11-18-kabala-maki.md) (cél, nem-cél, stílus, technikai keret, K-1…K-12).
**Állapot (2026-11-18):** helyben kész — GLB `kabala-maki.92974cd1.glb` (96 904 bájt, 16 904 háromszög, 22 csont, 3 anyag, 5 klip), kétszeri
gyártás azonos SHA-256, őr-teszt 3/3, `gate:stage` ZÖLD (1 WARN: az előnézeti kiszolgálónak nincs célzott tesztje). Nincs push / PR;
független ellenőr NOT RUN (PR előtt kötelező). Telefonon nincs mérve.
**Ág / munkafa:** `kiserlet/kabala-maki`, `.claude/worktrees/kabala-maki`. **Kísérlet:** push, PR, rebase, `--no-verify`, letöltés TILOS.

## Hatókör

Módosítható / új:
- `docs/specs/2026-11-18-kabala-maki.md`, `docs/specs/2026-11-18-kabala-maki-vegrehajtas.md`, `docs/kabala-maki.md`
- `source/scripts/blender/kabala-maki/*` (Python-szkriptek, előnézeti kiszolgáló)
- `source/client/public/models/kabala/*` (GLB + manifest)
- `source/tests/kabala-model-budget-guard.test.ts`
- `docs/measurements/kabala-maki/*` (PNG-k, `elonezet.html`)

NEM módosítható: `source/client/src/**`, `source/server/**`, `source/shared/**`, `scripts/qa/**`, `AGENTS.md`, `source/package*.json`,
bármely játék kódja, más munkafa / ág.

## Lépések

1. **Docs-commit:** ez a fájl + a terv. Kód csak ezután.
2. **Közös modul (`maki_model.py`):** tiszta jelenet (`--factory-startup` + minden adat törlése) → részek bmesh-sel (fej, test,
   szemek, fülek, pofa, orr, végtagok, farok), csúcsszín, anyagok (`Bunda`, `Szem`, `Csillogas`) → csontváz → képletes súlyok →
   külön `Arc` háló a szemhéjjal és a szájjal, `blink` + `smile` alakkulccsal. Véletlen csak rögzített maggal.
3. **Animációk (`maki_anim.py`):** akciók `idle` (48 képkocka, hurok: első = utolsó), `wave`, `cheer`, `sad`, `blink`; 24 fps.
   A pózok a csontváz terében megadott forgásokból (segédfüggvény váltja a csont helyi terébe).
4. **Export (`build.py`):** glTF-export (GLB, Draco, akciónként külön animáció, nem animált csatornák nélkül) ideiglenes névre →
   SHA-256 → `kabala-maki.<hash8>.glb`; a régi hash-es GLB-k törlése a mappából; `kabala-maki.manifest.json` (fájlnév, hash, bájt,
   háromszög, csont, anyag, klipek hosszal és hurok-jelzővel, alakkulcsok). A manifestben időbélyeg NINCS (determinizmus).
5. **Renderek (`render.py`):** világos háttér, puha három-pontos fény; nézetek: `01-elol`, `02-haromnegyed`, `03-oldal`,
   `04-hatul`, `05-arc-kozeli`, `06-tablo` (6 póz egy képen). EEVEE; ha fej nélkül nem megy: Cycles (CPU).
6. **Javító körök:** a PNG-k megnézése (Read), hibalista (átlógó háló, torz súlyozás, ijesztő szem, rossz arány) → javítás →
   újrarender; legalább 2–3 kör. A körök tanulságai a `docs/kabala-maki.md` „Ismert hiányok” részébe.
7. **Őr-teszt:** `source/tests/kabala-model-budget-guard.test.ts` — a manifest szerinti GLB létezik, a hash egyezik a névvel és
   a tartalommal, ≤ 400 KB, ≤ 20 000 háromszög, ≤ 6 anyag, megvan az öt klip és a két alakkulcs, pontosan egy GLB van a mappában.
8. **Determinizmus:** `build.py` kétszer → azonos SHA-256 (ha nem: az eltérés oka leírva).
9. **Leírás:** `docs/kabala-maki.md` (tulajdonosnak, közérthetően). **Előnézet (ha belefér):** `docs/measurements/kabala-maki/
   elonezet.html` + kis helyi kiszolgáló; a `three` a `source/node_modules`-ból jön (CDN nélkül).
10. **Kapuk:** az őr-teszt célzottan; `npm run gate:stage` a munkafa gyökeréből (függőség: `npm.cmd ci` a `source/` alatt megengedett).
11. **Zárás:** a terv K-pontjainak tételes újraellenőrzése futtatott parancs kimenetéből; atomi commitok, üzenet fájlból.

## Futtatás

```
"$BLENDER_BIN" -b --factory-startup -P source/scripts/blender/kabala-maki/build.py
"$BLENDER_BIN" -b --factory-startup -P source/scripts/blender/kabala-maki/render.py
cd source && node --import tsx --test tests/kabala-model-budget-guard.test.ts
```

## Megállási feltételek

- A keret (400 KB / 20 000 háromszög / 6 anyag) csak a stílus rovására tartható → jelentés opciókkal, nem a keret lazítása.
- A Blender fej nélkül sem EEVEE-vel, sem Cycles-szel nem renderel → NOT DONE a képekre, pontos hibaüzenettel.
