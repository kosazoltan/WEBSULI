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
export function quizBankCacheStats(): { builds: number; gameBuilds: number; hits: number; fingerprint: string | null };
export function quizBankApiItem(r: GameQuizBankRow): { id; tier; topic; prompt; options; correctIndex; explanation; sourceMaterialId };
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
5. **Tanmenet-betöltő.** `DISTINCT ON (html_file_id) ... ORDER BY html_file_id, published_at DESC`, 16-os id-kötegek; csak
   `jsonb_build_object('sections', json->'sections')` (a `hintsFromLesson` csak a `sections`-t olvassa).
6. **Teszt** (`quiz-bank-scale-db.integration.ts`, a 300 lecke a fixture-ből, kicsiben tartva a futásidőt):
   - A5: az új eredmény = a régi algoritmus (minden közzétett sor + `canonicalBanks`) eredménye, mind a 6 játékra;
     a gzip kibontva = a route mostani leképezése.
   - A6: egyetlen lekérdezés sem ad vissza 16-nál több `json`-t tartalmazó sort (pg-kliens számláló).
   - A2: második kérés: 1 lekérdezés (ujjlenyomat), `builds` nem nő.
   - A3: 10 párhuzamos hideg kérés → `builds` +1.
   - A4: közvetlen SQL `UPDATE` (kvízkérdés-szöveg), új közzétett lecke, visszavonás, törlés → a következő válasz követi.
   - A7: a tanmenet-betöltő 2 verziós anyagnál a legutóbb közzétett JSON-t adja, kötegelve.
   - Route: a valódi `mountAppRoutes` + `compression` mögött gzip-pel és anélkül ugyanaz a szöveg (nincs dupla tömörítés).
7. **Mérés utána** ugyanazzal a mérővel; a számok a PR-leírásba és a zárójelentésbe.

## Parancsok (munkafa `source/`, mind külön kilépési kóddal)

`npm run lint` · `npm run check` · `npm run check:test` · `npm test` · `npm run test:learning-db` · `npm run build` ·
`node scripts/qa/three-phase-check.mjs --base origin/main` (a git-gyökérből) · e2e: a kérdésbankot hívó lapok specjei.

## M1 — legfeljebb egy építés egyszerre (független review #478, 2026-11-17)

**Lelet (verifikálva):** `source/server/gameQuizBankService.ts` `snapshotFor()` (@ `d2641467`, :239-258): építés közben érkező,
eltérő lenyomatú kérés új `flight`-ot indít, a futót nem állítja le → sorozatos írás + játékkérések mellett 2–3 átfedő teljes
építés (egyenként +86–89 MB halom) → OOM-út. L1: egy későn visszatérő, régebbi lenyomatú kérés a frissebb `current`-et
fölöslegesen újraépíttetné.

**Kért viselkedés / megvalósítás:**
1. Egyszerre legfeljebb EGY `buildSnapshot` fut (`building`). Ha közben más lenyomat jön, egyetlen várakozó követő építés
   (`next`) jön létre; a további eltérő lenyomatok csak a `next` lenyomatát frissítik („a legutóbbi nyer”). A követő a futó
   UTÁN indul (sikertől / hibától függetlenül); a várakozók a követő (friss) eredményét kapják.
2. Lenyomat-sorrend: a kérés a lenyomat-lekérdezés INDÍTÁSÁNAK idejét (`fpAt`, monoton számláló) is viszi; a pillanatkép és
   a futó / várakozó építés a saját `fpAt`-jét tárolja. Ha a kérés `fpAt`-je régebbi a `current`-énél (vagy a futó / várakozó
   építésénél), nem indít építést, hanem azt kapja (L1). A `current` csak nagyobb `fpAt`-ű pillanatképre cserélődik.
3. A tartalom mindig legalább olyan friss, mint a címkéje (a lenyomat az építés ELŐTT készül), így építés közbeni írás után
   az új lenyomat a következő kérésnél új építést kér — elavult tartalom új címkével nem rögzül.
4. Mérőpont: `quizBankCacheStats().maxConcurrentBuilds` (az egyidejű építések csúcsa).

**Tesztek (`quiz-bank-scale-db.integration.ts`):** (a) párhuzamos, ELTÉRŐ lenyomatú kérések (írás az építés közben, a
lecke-JSON lekérdezések késleltetve) → `maxConcurrentBuilds === 1`, legfeljebb 2 építés, a késői kérések a legutolsó írást
látják; mutációs ellenpróba: a korlát nélkül a teszt bukik. (b) Elbukott építés (egy lecke-JSON lekérdezés hibára állítva)
után a következő kérés újrapróbál és sikeres. (c) Építés közbeni írás után a következő kérés az új tartalmat adja.

**Terv-igazítás (L5):** az A1 hideg-idő célja (≤ 2 s) fejlesztői gépen 2,0–3,5 s-ot mért, 0,5 CPU-n NEM mérve → eltérésként
jelölve a tervben és a PR-ban (a mérce nem lazul).

## UNKNOWN

- Az éles adatmennyiség (sorok, verziók, JSON-méret, kvízkérdések száma) — UNVERIFIED; csak olvasó lekérdezés a jelentésben.
