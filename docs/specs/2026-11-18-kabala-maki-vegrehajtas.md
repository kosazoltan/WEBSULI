# Kabala-maki — végrehajtási utasítás (AI-ügynöknek)

**Terv:** [`docs/specs/2026-11-18-kabala-maki.md`](2026-11-18-kabala-maki.md) (cél, nem-cél, stílus, technikai keret, K-1…K-12).
**Állapot (2026-11-18, második változat):** helyben kész — GLB `kabala-maki.af0e95d7.glb` (244 684 bájt, 26 380 háromszög,
25 csont, 4 anyag, 1 beágyazott kép, 6 klip), kétszeri gyártás azonos SHA-256, őr-teszt 3/3 az új kerettel, a végleges GLB
betöltve az előnézetben (hat klip, konzolhiba nélkül). Nincs push / PR; független ellenőr NOT RUN (PR előtt kötelező).
Telefonon nincs mérve.
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

## Finomító kör (tulajdonosi döntés 2026-11-18: „Ez az irány jó, finomítsd”; név: „A Websuli makija”)

1. Láb: az egyenes henger helyett gömbölyded comb + kerek talp három lábujj-dudorral (a „szögletesség” oka az egyenes palástú
   henger és a rá eső éles árnyék volt, nem hálóhiba — a gömbre cserélt forma ugyanazzal a fénnyel kerek).
2. Pofaszőr: öt, egymásba olvadó kerekded pamacs oldalanként (felhőszerű perem) a hegyes kúpok helyett.
3. Kar: hosszabb (felkar ~0,16, alkar ~0,15), vállgömb, a tőnél kiszélesedő cső; kézfej három ujj-dudorral és hüvelykkel;
   az integetés / ugrás pózai a kezet az arc elé-mellé, szemmagasságba emelik.
4. Pillaív: külön sötét cső a szemhéj alsó élén, a `blink` kulccsal együtt mozog.
5. Fej: a gömb pólusa előre néz, a gyűrűk az arc felé sűrűsödnek → sima folt-szélek.
6. Farok: a tő a hát színéből megy át az első gyűrűbe, a tőnél puha dudor; a pálya nem ér a földhöz.
7. Képek: JPG, 768 px; a régi PNG-k törölve. Manifest: `"name": "A Websuli makija"`.
8. Újra: kétszeri gyártás (azonos hash), őr-teszt, `gate:stage`. Retro: `docs/measurements/kabala-maki/retro-2026-11-18.md`.

## Második változat — élethűbb gyűrűsfarkú maki (terv: `docs/specs/2026-11-18-kabala-maki.md`, 7. szakasz)

Hatókör: ugyanaz, mint fent (a szkriptek, a GLB + manifest, az őr-teszt, a képek, az előnézet, a leírás). Sorrend:

1. **Docs-commit:** a terv 7. szakasza + ez a szakasz. Kód csak ezután.
2. **`maki_model.py` újraírása:**
   a. arányok a 7.2 szerint (fej : test ~1 : 1,7; karcsú törzs; hosszabb, erősebb hátsó láb; megnyúlt pofa; hegyesedő fül);
   b. „puha” alapformák (fej, pofa, fül, pofaszőr-tincsek, nyak, törzs, végtagok, faroktő) címkével, képletes színnel és súllyal;
   c. ezekből ideiglenes háló → Remesh (VOXEL) → Smooth → Decimate módosító, a kiértékelt háló kiolvasása;
   d. az új csúcsokra címke, szín és súly átvitele a legközelebbi alapforma-csúcsokról (KD-fa, távolsággal súlyozva, legfeljebb 4 csont);
   e. az arc: 512 px-es festett textúra (irány szerinti vetítés a fej közepéből, a szinguláris pont a tarkón); a fej elülső
      lapjai a `Fej` anyagot kapják, a többi a csúcsszínes `Bunda`-t; a két anyag határán a szín azonos;
   f. „kemény” részek változatlan elven: szem (fényes), orr, gyűrűs farok (14 sáv, fekete vég, kérdőjel-ív, tincses körvonal);
   g. csontváz ≤ 30 csont: gyökér, csípő, gerinc, mellkas, fej, 2 fül, 2×(felkar, alkar), 2×(comb, lábszár, lábfej), 8 farok;
   h. `MakiArc`: szemhéj, vékony pillaív (nyitva a szem felső ívén; csukva jól látható ív), fénypontok, száj — a száj a kész
      hálóra vetítve (sugárvetés).
3. **`maki_anim.py`:** a klipek az új csontnevekre; új `sunbathe` (3 mp: leül, karját széttárja, szemét behunyja, mosolyog, majd feláll).
4. **`build.py`:** UV-export a textúrához; manifest `sunbathe`-pel. **Őr-teszt:** az új keret (600 KB / 30 000 / 6 anyag / ≤ 30 csont /
   ≤ 1 kép / 6 klip) — dokumentált spec-változás.
5. **`render.py`:** hét kép (új: `08-napozo`), a tabló hat klippel; JPG 768 px.
6. **Javító körök:** legalább 3–4, nézetenként (elöl, háromnegyed, oldal, hátul, arc); a mérce a 7.1.
7. **Előnézet:** `sunbathe` gomb; az ÚJ GLB betöltése `localhost:4599`-en, mind a hat klip, konzolhiba nélkül, képernyőkép.
8. **Zárás:** kétszeri gyártás (hash), őr-teszt, `gate:stage`, a leírás és a retro frissítése, M-pontok tételes ellenőrzése.

Megállási feltétel: ha az összefüggő háló vagy a textúra szkriptből nem hozható vállalható minőségre, egyenes jelentés arról,
mi nem megy, és mi kellene hozzá (kézi szobrászat / retopológia) — nem a mérce csendes lejjebb vitele.

## Csiszoló kör (terv: `docs/specs/2026-11-18-kabala-maki.md`, 8. szakasz)

Kötött felület (a `feat/kabala-fooldal` ág erre épít): belépési pontok, klip-, csont-, háló- és alakkulcs-nevek, a manifest
kulcsai — változatlanok. Az arc festése, a szem, a fül és az arány-állandók (`HC`, `HR`, `EYE_*`, `SNOUT_*`) nem módosulnak.

1. **Docs-commit** (a terv 8. szakasza + ez a szakasz), kód csak utána.
2. **Farok (`maki_model.py`):** új, hosszabb pálya a figura oldalán; ívhossz szerinti paraméterezés (egyenlő gyűrűk, egyenlő
   csontok); kisebb sugár, a tincses körvonal marad.
3. **Kéz, láb:** a puha alapformákból kikerül a kéz- és lábfej; helyettük pontos rész: tenyér + négy ujj + hüvelyk, talp + öt
   lábujj (rövid, lekerekített csövek), sötét; súly: `forearm.*`, illetve `foot.*`.
4. **Felszín:** a decimált hálón Taubin-simítás (zsugorodás nélkül) csúcsonkénti súllyal — test: teljes, a fej hátulja:
   fokozatos, arc és fül: nulla. A száj vetítése a simított hálóra történik.
5. **Súlyok:** az átvitt csontsúlyok néhány körös simítása a háló szomszédsága mentén a testen (lágyabb csípő / térd / váll).
6. **Szín:** sötétebb szürke; keskenyebb fehér has; a végtagok belső világosítása kisebb.
7. **`maki_anim.py`:** a `sad` farka földközeli ívben; a `sunbathe` és az `idle` az új farokhoz hangolva. Klipnevek változatlanok.
8. **Képek, előnézet, zárás:** render nézetenként (2–3 kör), kétszeri gyártás, őr-teszt, `gate:stage`; az előnézetben az `idle`
   és a `cheer` valós idejű lejátszása egymást követő képernyőképekkel.

## Futtatás

```
"$BLENDER_BIN" -b --factory-startup -P source/scripts/blender/kabala-maki/build.py
"$BLENDER_BIN" -b --factory-startup -P source/scripts/blender/kabala-maki/render.py
cd source && node --import tsx --test tests/kabala-model-budget-guard.test.ts
```

## Megállási feltételek

- A keret (400 KB / 20 000 háromszög / 6 anyag) csak a stílus rovására tartható → jelentés opciókkal, nem a keret lazítása.
- A Blender fej nélkül sem EEVEE-vel, sem Cycles-szel nem renderel → NOT DONE a képekre, pontos hibaüzenettel.
