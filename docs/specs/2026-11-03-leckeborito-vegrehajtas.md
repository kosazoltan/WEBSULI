# Végrehajtás — leckénkénti borítókép (terv: `docs/specs/2026-11-03-leckeborito.md`)

Munkakönyvtár: `source/`.

## T1 — tartalomkulcs (`shared/lesson-cover.ts`)
- `lessonCoverId({ subject, title }, band)`, `isLessonCoverId(id)`, `lessonCoverAsset(id, band, lesson, fallbackSrc)`.
- Ellenőrzés: `node --import tsx --test tests/lesson-cover.test.ts` → `ℹ fail 0` (azonosság ékezet/írásjel-eltérésnél, eltérés
  más címnél / sávnál, minta).

## T2 — választás és megjelenítés
- `shared/lesson-art-compute.ts`: kulcsszavas borító híján a tárolt leckeborító nyer a témaköri borító és a sávhős előtt.
- `shared/design-assets.ts` `resolveStoredArt`: a lecke mostani kulcsával egyező leckeborító-id → borító (a katalógus szerinti
  tartalékkép `src`-jével); más leckeborító-id → `null`.
- `client/src/lesson-runtime/LessonArt.tsx`: változatlan felület (a `fromDb` út a végpontról tölt, hibánál a tartalékra vált).
- Ellenőrzés: `node --import tsx --test tests/lesson-cover.test.ts tests/cover-gorog-drama.test.ts tests/design-assets.test.ts`.

## T3 — gyártó modul (`server/lesson-covers.ts`)
- Kivonat → képterv (Haiku 5.5, JSON) → Seedream 5.0 Pro 1K 3:2 → minőségkapu (Haiku, képpel) → `design_assets` beszúrás → összekötés.
- A hálózati hívások befecskendezhetők (tesztben hamis kliens); napi plafon a mai `cover-l-*` sorokból.
- Ellenőrzés: `node --import tsx --test tests/lesson-covers-worker.test.ts` (kapu-bukás → újragenerálás, kétszeres bukás → nincs
  beszúrás, plafon → nincs hívás, kulcsszavas borító → kimarad, cím-változás → nem köt össze).

## T4 — háttérfolyamat és mentés utáni rúgás
- `server/index.ts`: `startLessonCoverWorker()` az induló szinkron után; `server/studio/pipeline-store.ts`: mentés után `kickLessonCovers()`.
- Ellenőrzés: `npx tsc --noEmit`, `npx tsc --noEmit -p tsconfig.test.json`.

## T5 — backfill-szkript (`scripts/design-assets/lesson-covers.mts`)
- `--dry-run` (kulcsok, becsült ár), `--max N`, `--only <id,…>`, `--link-only`; kontaktlap HTML a jelöltekről (`--sheet <fájl>`).
- Próbakör: 3 minta (5. o. irodalom, 6. o. történelem, 9. o. kémia) → kézi szemle → teljes futás.
- Ellenőrzés: a futás végén minden éles lecke (a kulcsszavas borítósak kivételével) `art.picture` = `lessonCoverId`.

## T6 — kapuk és élesítés
- `npm test`, `npx tsc --noEmit` (+ teszt-tsconfig), `npx eslint client/src server --max-warnings 0`, `npm run build`.
- PR → CI → merge; Render-revízió = merge commit (`https://websuli.vip/api/health`); képernyőképek 390 és 1280 px-en.
