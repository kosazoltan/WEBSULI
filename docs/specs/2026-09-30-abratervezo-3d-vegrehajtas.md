# Végrehajtás: Ábratervező ügynök + scene3d + Mezopotámia-összefésülés

Spec: `docs/specs/2026-09-30-abratervezo-3d.md`. Munkakönyvtár: `source/`. Ág: `feat/abratervezo-3d`.
Sorrend kötelező; minden feladat után a megadott tesztparancs, valós kimenettel.

## 1. `scene3d` ábrafajta — adat és szerződés

1.1 `shared/lesson-schema.ts`: `ANIM_KINDS` végére `"scene3d"` (komment: spec 2026-09-30).
1.2 `shared/lesson-visual-params.ts`:
  - `scene3dParamsSchema` (zod): `{ objects: Scene3dObject[] (1–40), labels?: {text, at:[x,y,z]}[] (≤ 8), ground?: #hex, view?: "iso"|"front"|"top" }`.
    `Scene3dObject = { shape: "box"|"cylinder"|"cone"|"sphere"|"stairs"|"plane"|"river", at:[x,y,z] (−10…10), size:[w,h,d] (0.05…20; river: ignored), color:#rrggbb, label?: ≤ 40 kar., steps?: 2–8 (stairs), points?: [x,z][] 2–12 (river), rotY?: fok −180…180 }`.
    `superRefine`: river-nél `points` kötelező; a feliratok száma (objektum + labels) ≤ 8.
  - `VISUAL_PARAM_SCHEMAS.scene3d`, `Scene3dParams` típus, `renderedVisualTexts` `scene3d` ág: objektum- és labels-feliratok.
  - `VISUAL_PARAMS_CONTRACT`: új sor a scene3d alakjával és mikor használd (épület, táj, térbeli elrendezés).
1.3 Teszt `tests/scene3d-params.test.ts`: érvényes zikkurat-jelenet 0 probléma; river pontok nélkül hiba; 41 objektum hiba;
  9 felirat hiba; `renderedVisualTexts("scene3d", …)` visszaadja a feliratokat.
  Parancs: `npx tsx --test tests/scene3d-params.test.ts tests/lesson-visual-params.test.ts` → mind pass.

## 2. `scene3d` kliens-rajzoló

2.1 Új `client/src/lesson-runtime/blocks/scene3d-anim.tsx`: `Scene3dAnim({params, caption})`.
  - `parseVisualParams("scene3d", params)`; null → `return null`.
  - `useEffect`: `import("three")` lazy; WebGLRenderer (antialias, alpha), PerspectiveCamera, Hemisphere+Directional light
    (árnyék), talaj (ground szín, kör alakú lap), objektumok: box → BoxGeometry; cylinder/cone/sphere; stairs → `steps` egymásra
    rakott, felfelé kisebbedő doboz; plane → vékony doboz; river → a pontsorra fektetett lapos, kék szalag (Shape → ExtrudeGeometry, 0.05 vastag).
    Színek: MeshStandardMaterial az objektum színével; élek: EdgesGeometry sötét vonallal (jobb olvashatóság).
  - Kamera: a jelenet befoglaló gömbjére illesztve, `view` szerinti kiinduló szög (iso: 35° magasság, 45° azimut).
  - Forgatás: pointer húzás vízszintesen (azimut) és függőlegesen (magasság 10–75° közé szorítva); a vászon `touch-action: pan-y`;
    „↻” gomb alaphelyzetbe; `prefers-reduced-motion` nélkül lassú automatikus forgás, első érintésnél leáll.
  - Feliratok: abszolút pozicionált HTML-címkék, minden frame-ben a 3D pont vetítésével; a vászonra szorítva; stílus: fehér
    lekerekített doboz, `#0f172a` szöveg, 13 px+, kis mutatópont.
  - Méret: szélesség 100%, arány 4:3, `ResizeObserver`; takarítás unmountkor (renderer.dispose, geometriák/anyagok dispose, rAF cancel).
  - WebGL hiba (renderer konstruktor dob) → feliratlista `<ul>` + caption.
  - `data-anim="scene3d"`, `aria-label` = caption.
2.2 `client/src/lesson-runtime/blocks/animate-blocks.tsx`: `ANIMATE_REGISTRY.scene3d = Scene3dAnim`.
2.3 `client/src/lesson-runtime/...` runtime-probe mintái közé (ha van `?visuals=1` mintakészlet: `grep -rn "visuals=1\|VISUAL_SAMPLES" client/src`) egy zikkurat-jelenet.
  Parancs: `npx tsx --test tests/animate-try-kinds.test.ts tests/studio-author-catalog.test.ts` + `npm run check` → pass.

## 3. Ábratervező ügynök (szerver)

3.1 `server/ai/studio-provider.ts`: `STUDIO_STEP_POLICY.visualDesigner = { timeoutMs: 300_000, maxTokens: 24_000, reasoningEffort: "high" }`.
  `server/studio/run-step.ts` `stepDeadlineMs`: ellenőrizd, hogy policy-név alapján számol-e; ha igen, a `visualDesigner` is kapjon határidőt.
3.2 `server/studio/prompt.ts`: `STUDIO_PROMPT_NAMES.animatorSection = "studio.animator.section.v1"`.
3.3 `server/studio/step-io.ts`: `buildSectionDesignerPrompt(lesson, sectionIndex, map)`: a fejezet blokkjai `i` sorszámmal,
  a fejezetben tanított fogalmak (term, definition), tantárgy/évfolyam, a lecke címe és a többi fejezet címe (kontextus),
  `VISUAL_PARAMS_CONTRACT`, a kimenet alakja: `{"visuals":[{ "after"|"replace", "animKind", "params", "caption", "coversConceptIds" }]}`,
  fejezetenként 1 (legfeljebb 2) ábra, és: „ha a fejezetben nincs rajzolható tartalom: {"visuals":[]}”.
3.4 Új `server/studio/visual-designer.ts`:
  ```ts
  export type DesignerCall = (system: string, user: string, sectionIndex: number) => Promise<{ json: unknown; usage?: Usage | null }>;
  export async function designLessonVisuals(lesson, concepts, opts: { call, systemFor: (i) => Promise<string>, concurrency = 4, sections?: number[], log? })
    : Promise<{ patch: { sections: { index: number; visuals: unknown[] }[] }; usage; rejected: string[]; failed: number[] }>
  ```
  Fejezetenként: hívás → `{visuals}` kinyerése (tűri a `{sections:[{index,visuals}]}` alakot is) → próba-beillesztés
  `applyVisualPatch(lesson, {sections:[{index:i, visuals}]}, concepts)` → ha elutasított vagy `weakVisuals` (csak az új blokkokra)
  talál → EGY újrakérés `weakVisualsInstruction`-szerű szöveggel (a fejezet okai) → a jobbik (kevesebb elutasítás) marad.
  Hívás-hiba → `failed` lista, a fejezet kimarad. Párhuzamosság: egyszerű munkasor `concurrency` szállal.
3.5 `server/studio/visual-quality.ts`: `sparse` osztály: `illustration`, ahol a tisztított SVG rajzelemeinek (nem text/tspan/defs/stop/title/desc,
  nem a papír) száma < 10 → „kevés rajzelem — a fogalmat részletesebben, térhatással kell megmutatni”.
3.6 `server/studio/step-runner.ts`, `case "animator"` (modellhívás ága, ~610. sor): ha `process.env.STUDIO_VISUAL_DESIGNER !== "off"`
  és van `job.output.lesson`, a `json` a `designLessonVisuals(...).patch` lesz; a hívás `callStepModel(providerFactory(m, "visualDesigner"), { step, policy: "visualDesigner", model: m, system, user })`,
  elsődleges modell hibájára egyszer a `FALLBACK_MODELS.animator`. A `system` = `promptLookup(STUDIO_PROMPT_NAMES.animatorSection, buildSectionDesignerPrompt(...))`.
  Napló: fejezetenként modell, idő, token, elutasítás. A későbbi egész-leckés gyenge-ábra újrakérés csak akkor fut, ha a tervező NEM futott.
3.7 `server/studio/role-skills.ts`: az `animator` skill szövege → ábratervező (a scratchpad-os, bake-offon mért `designer-skill-draft.md` alapján,
  a scene3d-vel kiegészítve), < 5200 karakter, a kötelező fejlécekkel (`ROLE_SKILL_REQUIRED_HEADINGS`).
3.8 Teszt `tests/visual-designer.test.ts`: (a) 3 fejezetes lecke, hamis `call` → 3 hívás, a folt 3 fejezetet tartalmaz;
  (b) egy fejezet első válasza elutasított illusztráció → pontosan 1 újrakérés annál a fejezetnél, a többi 1-1 hívás;
  (c) egy fejezet `call`-ja dob → `failed=[i]`, a többi ábra megvan; (d) párhuzamosság ≤ `concurrency` (számláló);
  (e) `weakVisuals` `sparse` jelzés 3 elemes SVG-re.
  Parancs: `npx tsx --test tests/visual-designer.test.ts tests/studio-role-skills.test.ts tests/role-skills-everywhere.test.ts tests/animator-invariants.test.ts tests/studio-provider-policy.test.ts` → pass; `npm run check` → 0 hiba.

## 4. Böngészős mérés (UI-változás, kötelező)

4.1 `.claude/launch.json` „websuli-visual-probe” (létezik) → `/__lesson-runtime-probe?visuals=1`; 375×812 és 1280×900:
  scene3d vászon látszik, forgatható (húzás után más kép), feliratok a vásznon belül, konzol hibamentes.
4.2 Bake-off-szkripttel (`source/visual-bakeoff.local.mts`) a tervező valódi kimenete a probe-ban (`?candidate=1`).

## 5. Mezopotámia összefésülés (élő, a helyi kóddal, az éles DB-n)

5.1 Mentés: a két lecke (f24853ac / 3a9acc22) JSON + html + kvízexport a scratchpadra (`mezo-list.local.mts` már menti a JSON-t).
5.2 `source/web-live-mezo-merge.local.mts`: a `web-live-mezo-kombi` mintájára, DE: nincs új webes keresés — a fájlok a két térkép
  `source_text`-jéből, URL szerint egyesítve (6 egyedi oldal), plusz a füzetfotó. Tanári kérés (összefésülés): minden, amit
  a két lecke tanít (ellenőrzőlista 5.4), és „Babilon városa Kr. e. 2500 körül jött létre” (a füzet sora).
5.3 Futtatás egyedül (nincs közben merge/deploy). Napló: `tmp/web-live-mezo-merge.log`; `lektor_notes`, gate-kimenet.
5.4 Ellenőrzőlista (mind szerepeljen a tanításban): folyóköz név; Tigris és Eufrátesz; meleg, száraz éghajlat; Délnyugat-Ázsia / Közel-Kelet;
  tavaszi áradás → termékeny föld, síkság; öntözéses földművelés (tavak, csatornák, száraz idő); csatornák kiásása és karbantartása,
  munkairányító szakemberek, közmunka, a gát karbantartásának felelőssége; az állam kialakulása (öntözés + közös raktározás → vezető réteg → állam),
  az állam = város és környéke; sumerok őslakók, első fallal körülvett városok, első írásrendszer Kr. e. 3100 táján;
  Babilon: fontos város, **Kr. e. 2500 körül**, babiloniak, agyagtégla, város–vidék, Istár kapu, Bábel tornya; zikkurat: toronytemplom,
  kisebbedő teraszok, szentély a tetején, agyagtégla, bitumen, ≠ palota; papkirály, előkelők (papok, katonák), parasztok és kézművesek;
  Mezopotámia öröksége; leggyakoribb hibák. Hiány → kézi, ellenőrzött javítás a `mezo-fix-apply` módszerével (§3–4 lesson-improvement).
5.5 Visszaolvasás + éles böngészős ellenőrzés 375/1280 px (minden fejezet ábrája, 3D-jelenet, konzol).

## 6. Zárás

`npx tsx --test` a 3.8-as listára + `npm run check`; PR ≤ ~400 soros szeletekben (1–2: scene3d; 3: tervező); merge/deploy CSAK az
élő futás után; Render/Vercel deploy-ellenőrzés; memória + ledger frissítés.
