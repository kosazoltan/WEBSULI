# Végrehajtás — görög dráma borító (terv: `docs/specs/2026-11-02-irodalmi-borito.md`)

Munkakönyvtár: `source/`.

## T1 — prompt-elem
- `design-assets/prompts.json`: új elem a `cover-sejt` elé (id `cover-gorog-drama`, kind `cover`, band `laboratory`, subjects, keywords,
  alt, `aspect_ratio: "3:2"`, angol prompt: görög kőszínház alkonyatkor, oszlopos palotahomlokzat, két színházi maszk).
- Ellenőrzés: `npx tsx scripts/design-assets/generate.ts --only cover-gorog-drama --dry-run` → „1 kép · becsült költség ≈ 0.09 USD”.

## T2 — jelöltek és kiválasztás
- `npx tsx scripts/design-assets/generate.ts --only cover-gorog-drama` háromszor → `design-assets/candidates/cover-gorog-drama/*.jpg`.
- Kézi szemle (szöveg, logó, ijesztő elem nincs), tulajdonosi választás.
- Ellenőrzés: 3 fájl a jelöltmappában; a választás egy `{"cover-gorog-drama": "<id>/<fájl>.jpg"}` JSON.

## T3 — jóváhagyás
- `npx tsx scripts/design-assets/approve.ts <választás.json>` → `client/public/design/laboratory/cover-gorog-drama.webp` + katalógus.
- A „tragédia” kulcsszó törlése a `prompts.json`-ból és a katalógusból.
- Ellenőrzés: a `git diff shared/design-asset-catalog.ts` csak hozzáadás; `grep -c tragédia` → 0.

## T4 — tesztek
- Új `tests/cover-gorog-drama.test.ts` (Antigoné, Oidipusz, „görög dráma” → ez; más sáv / tantárgy / mű → nem; a fájl létezik).
- Ellenőrzés: `node --import tsx --test tests/cover-gorog-drama.test.ts tests/design-assets.test.ts` → `ℹ fail 0`;
  `npm test`, `npx tsc --noEmit`, `npx eslint client/src server --max-warnings 0` → zöld.

## T5 — élesítés
- PR → CI → merge; Render-revízió = merge commit; `https://websuli.vip/design/laboratory/cover-gorog-drama.webp` → 200.
- Az Antigoné célzott javítása (újramentés) után `lesson.art.picture` = `cover-gorog-drama`.
