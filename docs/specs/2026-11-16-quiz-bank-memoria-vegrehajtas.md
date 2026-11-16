# Végrehajtási utasítás — a játék-kérdésbank végpont memória- és időigénye (kanban #67)

**Állapot:** folyamatban – 2026-11-16, ág `fix/quiz-bank-memoria`
**Terv:** `docs/specs/2026-11-16-quiz-bank-memoria.md` (cél, gyökérok, alapvonal, elfogadás — azt kövesd).

## Hatókör — csak ezek a fájlok változhatnak

| Fájl | Mit |
|---|---|
| `source/server/gameQuizBankService.ts` | kötegelt, `DISTINCT ON` betöltés; pillanatkép-gyorsítótár; ujjlenyomat; single-flight; `gameQuizBankResponse` |
| `source/server/routes.ts` | a `GET /api/games/quiz-bank/:gameId` a kész gzip-`Buffer`-t küldi (csak ez a route) |
| `source/server/curriculum/load.ts` | `DISTINCT ON (html_file_id)` + 16-os kötegek |
| `source/tests/quiz-bank-scale-db.integration.ts` (új) | 300 leckés valódi Postgres-védőháló |
| `source/scripts/run-learning-db-tests.ts` | az új tesztfájl felvétele a futtatóba (a lista VÉGÉRE) |
| `docs/specs/2026-11-16-quiz-bank-memoria*.md` | terv / utasítás, állapotsor |

Tilos: séma / migráció, játéklapok, `client/`, `docs/agent-csapdak.md`, más route.

## Szerződés (a meglévő nyilvános API változatlan)

```ts
export async function listGameQuizBank(gameId: string): Promise<GameQuizBankRow[]>;          // változatlan kimenet
export async function listLatestMaterialQuizzes(classroom: number, materialLimit?: number, lessonId?: string): Promise<LatestMaterialQuizzes>; // változatlan
// ÚJ
export type GameQuizBankResponse = { gzip: Buffer; bytes: number; items: number };
export async function gameQuizBankResponse(gameId: string): Promise<GameQuizBankResponse | null>; // null = ismeretlen játék
export function quizBankCacheStats(): { builds: number; hits: number; fingerprint: string | null; gzipBytes: number };
export function resetQuizBankCacheForTests(): void;
```

A gzip-pel kibontott tartalom pontosan: `JSON.stringify({ gameId, items: rows.map(r => ({ id, tier, topic, prompt,
options, correctIndex, explanation, sourceMaterialId })) })` — a route mostani leképezése, mezősorrendre is.

## Lépések

1. **Betöltő.** `latestPublishedRows(materialIds?)`: `SELECT DISTINCT ON (coalesce(html_file_id, id)) id, html_file_id,
   version, published_at FROM lessons WHERE published_at IS NOT NULL [AND html_file_id = ANY($ids)] ORDER BY
   coalesce(html_file_id, id), version DESC, published_at DESC`; utána JS-ben rendezés `version DESC, published_at DESC`.
   `loadPublishedCanonical(materialIds?, gameId?)`: a kiválasztott id-k 16-os kötegekben (`SELECT id, json ... WHERE id =
   ANY`), kötegenként `canonicalLessonQuiz`, az eredmény a kiválasztási sorrendben; a `canonicalBanks` szerkezetét adja
   (`items`, `materialIds`, `lessonIds`). A `publishedBanks` helyére lép mindkét hívónál.
2. **Ujjlenyomat.** Egyetlen lekérdezés: `md5(string_agg(id||':'||xmin::text, ',' ORDER BY id))` a közzétett `lessons`-ra
   és a `game_quiz_items`-re (`game_id = ANY(ALLOWED)`), összefűzve.
3. **Pillanatkép.** `{ fingerprint, builtAt, games: Map<gameId, GameQuizBankResponse> }`; építés: egy kanonikus betöltés,
   majd játékonként a legacy sorok + `uniqueQuizContent` → JSON → `gzipSync` → a nyers szöveg eldobva. TTL 15 perc.
   Single-flight: `inflight: { fingerprint, promise }`; azonos ujjlenyomatra közös ígéret; eltérőre új építés; csak akkor
   tároljuk, ha nem érkezett közben újabb ujjlenyomatú pillanatkép. Hiba → nem tárol, a várakozók hibát kapnak.
4. **Route.** `gameQuizBankResponse(gameId)`; `null` → `{ gameId, items: [] }` (mint eddig); különben `req.acceptsEncodings("gzip")`
   esetén `Content-Type: application/json; charset=utf-8`, `Content-Encoding: gzip`, `Vary: Accept-Encoding`,
   `Content-Length`, `res.end(buf)`; egyébként `gunzipSync`. A `isMissingGamesTableError` ág marad.
5. **Tanmenet-betöltő.** `DISTINCT ON (html_file_id) ... ORDER BY html_file_id, published_at DESC`, 16-os id-kötegek.
6. **Teszt** (`quiz-bank-scale-db.integration.ts`, a 300 lecke a fixture-ből, kicsiben tartva a futásidőt):
   - A5: az új eredmény = a régi algoritmus (minden közzétett sor + `canonicalBanks`) eredménye, mind a 6 játékra;
     a gzip kibontva = a route mostani leképezése.
   - A6: egyetlen lekérdezés sem ad vissza 16-nál több `json`-t tartalmazó sort (pg-kliens számláló).
   - A2: második kérés: 1 lekérdezés (ujjlenyomat), `builds` nem nő.
   - A3: 10 párhuzamos hideg kérés → `builds` +1.
   - A4: közvetlen SQL `UPDATE` (kvízkérdés-szöveg), új közzétett lecke, visszavonás, törlés → a következő válasz követi.
   - A7: a tanmenet-betöltő 2 verziós anyagnál a legutóbb közzétett JSON-t adja, kötegelve.
7. **Mérés utána** ugyanazzal a mérővel; a számok a PR-leírásba és a zárójelentésbe.

## Parancsok (munkafa `source/`, mind külön kilépési kóddal)

`npm run lint` · `npm run check` · `npm run check:test` · `npm test` · `npm run test:learning-db` · `npm run build` ·
`node scripts/qa/three-phase-check.mjs --base origin/main` (a git-gyökérből) · e2e: a kérdésbankot hívó lapok specjei.

## UNKNOWN

- Az éles adatmennyiség (sorok, verziók, JSON-méret, kvízkérdések száma) — UNVERIFIED; csak olvasó lekérdezés a jelentésben.
