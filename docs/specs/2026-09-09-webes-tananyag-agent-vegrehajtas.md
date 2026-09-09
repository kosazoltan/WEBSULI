# Végrehajtási utasítás: webes tananyag-ügynök, mentés, 80%

> Spec: `docs/specs/2026-09-09-webes-tananyag-agent-es-mentes.md`
> Nyelv: magyar a felhasználónak; azonosítók angolul.
> Tiltott: titok a kódban; Studio pipeline lecserélése; teszt gyengítése.

**Goal:** A tananyagkészítésen chat + internetes keresés Claude Opus 5 `low` efforttal; az elkészült HTML a `html_files` listába kerül; a készítő felület 0.8-as méretű.

**Tech:** Express, Anthropic SDK 0.123, React, Drizzle, node:test, Playwright probe.

---

### Task 1: Lista-cache invalidálás Studio publikáláskor

**Files:**
- Modify: `source/server/studio/step-runner.ts` (`publishLesson` után, a `return { htmlFileId, … }` előtt a tranzakción KÍVÜL)
- Test: `source/tests/audit-2026-09-static.test.ts` (új teszt) VAGY `source/tests/studio-gate-publish.test.ts` ha a store mockot bővíteni kell

A `publishLesson` DB-implementációja `step-runner.ts` ~950–1003. A tranzakció után, siker esetén:

```typescript
import { getHtmlFilesCache } from "../cache/HtmlFilesCache";
// a defaultStore.publishLesson return előtt, a transaction callback-en KÍVÜL:
getHtmlFilesCache().invalidate();
```

A `invalidate()` a transaction `return` UTÁN fusson, különben sikertelen commit mellett is ürülne a cache (rossz). A defaultStore metódusban:

```typescript
async publishLesson(input) {
  const result = await db.transaction(async (tx) => { /* meglévő test */ });
  getHtmlFilesCache().invalidate();
  return result;
}
```

- [ ] **Step 1: Bukó teszt**

`source/tests/audit-2026-09-static.test.ts` végére:

```typescript
test("studio publishLesson invalidálja a html-files listacache-t", () => {
  const src = read("server/studio/step-runner.ts");
  assert.match(src, /getHtmlFilesCache/);
  assert.match(src, /invalidate\(\)/);
});
```

Futtatás (Windows): `cd source; npx.cmd --yes tsx --test tests/audit-2026-09-static.test.ts`
Elvárt: FAIL, nincs `getHtmlFilesCache`.

- [ ] **Step 2: Implementáció** a fenti import + invalidate.
- [ ] **Step 3: Teszt PASS.**

---

### Task 2: `contentType: 'lesson'` a insert sémában

**Files:**
- Modify: `source/shared/schema.ts` 71. sor: `z.enum(['html', 'pdf'])` → `z.enum(['html', 'pdf', 'lesson'])`
- Test: új `source/tests/html-file-schema.test.ts`

```typescript
import assert from "node:assert/strict";
import test from "node:test";
import { insertHtmlFileSchema } from "../shared/schema";

test("insertHtmlFileSchema elfogadja a lesson contentType-ot", () => {
  const r = insertHtmlFileSchema.safeParse({
    title: "Kör - 7. osztály",
    content: "<html></html>",
    classroom: 7,
    contentType: "lesson",
  });
  assert.equal(r.success, true);
});

test("insertHtmlFileSchema elutasítja az ismeretlen contentType-ot", () => {
  const r = insertHtmlFileSchema.safeParse({
    title: "X",
    content: "<p>a</p>",
    contentType: "video",
  });
  assert.equal(r.success, false);
});
```

- [ ] Bukó teszt, majd séma, majd PASS.

---

### Task 3: Enhanced készítő publikálása a listába

**Files:**
- Modify: `source/client/src/components/EnhancedMaterialCreator.tsx` `handlePublish`

Kötelező payload:

```typescript
await apiRequest("POST", "/api/html-files", {
  title: titleWithClassroom,
  description,
  content: generatedHtml,
  classroom,
  contentType: "html",
}, { timeout: 180000 });
```

Siker után:
- `queryClient.removeQueries({ queryKey: ["/api/html-files"] });`
- `await queryClient.refetchQueries({ queryKey: ["/api/html-files"], type: "all" });`
- Toast: a cím + „megjelent a Fájlok / főoldal listában”
- NE hívd azonnal a `resetWizard()`-ot; maradjon a „Megnyitás” link `/preview/${id}` ha a válaszban van `id`. A válasz típusa a meglévő `HtmlFile`.

```typescript
const file = await apiRequest<{ id: string }>("POST", "/api/html-files", { … }, { timeout: 180000 });
```

- [ ] Statikus teszt: a komponens forrása tartalmazza `classroom,` a POST bodyban és `contentType: "html"`.

`source/tests/audit-2026-09-static.test.ts`:

```typescript
test("EnhancedMaterialCreator publikáláskor küldi a classroomot", () => {
  const src = read("client/src/components/EnhancedMaterialCreator.tsx");
  assert.match(src, /contentType:\s*["']html["']/);
  assert.match(src, /classroom,/);
});
```

---

### Task 4: Modell + effort a webes ügynökhöz

**Files:**
- Modify: `source/server/ai/models.ts`
- Modify: `source/tests/ai-model-routing-complete.test.ts`

`LEGACY_MODELS` új kulcs:

```typescript
webResearch: "claude-opus-5",
```

`TASK_EFFORT`:

```typescript
webResearch: "low",
```

`TASK_KEYS`:

```typescript
webResearch: "anthropic",
```

A meglévő teszt `a hosszú generáló feladatok medium reasoning efforttal futnak` **ne** tartalmazza a `webResearch`-t. Új teszt:

```typescript
test("a webes tananyag-ügynök Opus 5 low efforton fut", () => {
  assert.equal(resolveLegacyModel("webResearch"), "claude-opus-5");
  assert.equal(effortFor("webResearch"), "low");
  assert.equal(providerForModel(LEGACY_MODELS.webResearch), "anthropic");
  assert.equal(requiredKeyFor("webResearch"), "AI_INTEGRATIONS_ANTHROPIC_API_KEY");
});
```

A `requiredKeyFor` teszt `tasks` listájához add `webResearch`-t.

A `LegacyTask` típus a `keyof typeof LEGACY_MODELS` — automatikus.

---

### Task 5: Web-research tiszta séma + HTML kivonat

**Create:** `source/server/studio/web-research-agent.ts`
**Test:** `source/tests/web-research-agent.test.ts`

```typescript
import { z } from "zod";

export const webResearchChatSchema = z.object({
  message: z.string().trim().min(1).max(8000),
  classroom: z.number().int().min(0).max(12),
  conversationHistory: z
    .array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }))
    .max(50)
    .optional(),
  title: z.string().trim().max(255).optional(),
});

export const HTML_START = "<!-- HTML_START -->";

export function extractGeneratedHtml(fullText: string): string | null {
  const i = fullText.indexOf(HTML_START);
  if (i < 0) return null;
  const html = fullText.slice(i).trim();
  return html.includes("<html") || html.includes("<HTML") ? html : null;
}

export function webResearchSystemPrompt(classroom: number): string {
  return [
    "Te a WEBSULI tananyagkészítő ügynöke vagy (Tananyag Készítő v7.1).",
    `Célosztály: ${classroom}. osztály (0 = programozási alapismeretek).`,
    "Ha a felhasználó tananyagot kér, KERESS az interneten (web_search) magyar tantervi, tankönyvi vagy OFI/NAT-hoz illő forrásokat.",
    "Csak a megtalált, idézhető forrásokból dolgozz. Minden állításhoz URL.",
    "Ha a felhasználó kéri a tananyag elkészítését, adj TELJES önálló HTML-t, és kezdd így: <!-- HTML_START -->",
    "A HTML 4 tab: Tananyag, Módszerek, Feladatok (45→15), Kvíz (75→25).",
    "TILOS: alert/confirm/prompt; Google Fonts; allow-same-origin igény.",
  ].join("\n");
}

export const WEB_SEARCH_TOOL = {
  type: "web_search_20250305" as const,
  name: "web_search" as const,
  max_uses: 8,
  allowed_callers: ["direct"] as const,
};
```

Teszt: üres message fail; classroom 7 ok; extractHtml a marker nélkül null; markerrel html string.

---

### Task 6: SSE route

**Create:** `source/server/studio/web-research-routes.ts`
**Modify:** `source/server/routes.ts` — `app.use("/api/studio", webResearchRouter)` a `lessonPipelineRouter` mellett.

Router: `isAuthenticatedAdmin`. Nincs kulcsérték logban.

```typescript
webResearchRouter.post("/web-research/chat", async (req, res) => {
  const parsed = webResearchChatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Hibás kérés." });
  const key = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!key || !key.trim()) {
    return res.status(503).json({ message: "Az Anthropic API kulcs nincs beállítva." });
  }
  // SSE headers mint claude-chat
  const anthropic = new Anthropic({ apiKey: key, baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL });
  const stream = anthropic.messages.stream({
    model: resolveLegacyModel("webResearch"),
    output_config: { effort: effortFor("webResearch") },
    max_tokens: 16384,
    system: webResearchSystemPrompt(parsed.data.classroom),
    tools: [WEB_SEARCH_TOOL],
    messages: [
      ...(parsed.data.conversationHistory ?? []),
      { role: "user", content: parsed.data.message },
    ],
  });
  // text_delta → {type:'content_delta', content}
  // stream végén extractGeneratedHtml → {type:'html_generated', html} ha van
  // error → {type:'error', message} magyarul, kulcs nélkül
});
```

Timeout: 180_000 ms (keresés + HTML). Abort a kliens disconnectre.

Timeout a meglévő claude-chat 60s-a kevés web_searchhez — ez a route 180s.

---

### Task 7: UI panel + 80% méret + mobil menü

**Create:** `source/client/src/components/studio/WebResearchAgentPanel.tsx`
**Modify:**
- `source/shared/studio-ui.ts` — `export const CREATOR_PAGE_SCALE = 0.8;`
- `source/client/src/components/studio/LessonStudioPanel.tsx`
- `source/client/src/components/EnhancedMaterialCreator.tsx` — wrapping div
- `source/client/src/components/MobileBottomNav.tsx`
- `source/client/src/components/studio/StudioPanelProbe.tsx` — a webes fül is a probe-on (alap feltöltés marad első)
- Tests: `source/tests/studio-one-menu.test.ts`, `source/tests/studio-one-menu.spec.ts`

LessonStudioPanel tetején két mód, nem új admin-tab:

```tsx
const [mode, setMode] = useState<"upload" | "web">("upload");
```

Gombok: `data-testid="studio-mode-upload"` / `data-testid="studio-mode-web"`.
`mode === "web"` → `<WebResearchAgentPanel />`.
A feltöltő űrlap `mode === "upload"`-nál marad.

Wrapper:

```tsx
<div
  data-testid="creator-page-scale"
  style={{ zoom: CREATOR_PAGE_SCALE }}
>
```

EnhancedMaterialCreator gyökér `div.max-w-7xl` ugyanígy.

Chat magasságok 80%: `h-[600px]` → `h-[480px]`, `h-[400px]` → `h-[320px]`, `h-[350px]` → `h-[280px]`.

WebResearchAgentPanel:
- Osztály `<Select>` CLASSROOMS-ból, kötelező.
- Cím Input (mentéshez).
- `ChatInterface` — `onSendMessage` fetch `/api/studio/web-research/chat` SSE, CSRF header mint a többi mutáló fetch. Használd `apiRequest` helyett SSE-hez a meglévő EnhancedMaterialCreator claude-chat mintáját (`fetch` + `X-CSRF-Token`). A CSRF tokent a `/api/csrf-token` adja — másold az Enhanced készítő `handleClaudeMessage` fetch mintáját, ne találj ki új authot.
- Előnézet iframe: sandbox `allow-scripts allow-forms allow-popups allow-modals allow-downloads` (NINCS allow-same-origin) — a meglévő audit teszt mintája.
- Gomb `data-testid="web-research-save"`: `apiRequest POST /api/html-files` title, description (források röviden), content: html, classroom, contentType html.
- Siker: invalidate html-files, link `/preview/:id`, szöveg: „A tananyag a többi anyag között van.”

MobileBottomNav `adminCategories` Anyagok `tabs` tömbjébe, a pdf-upload után:

```typescript
{ value: "lesson-studio", label: "Tananyag készítése", icon: Sparkles },
```

`Sparkles` már importálva.

- [ ] Unit: `CREATOR_PAGE_SCALE === 0.8`
- [ ] Unit: LessonStudioPanel tartalmazza `studio-mode-web` és `creator-page-scale`
- [ ] Unit: MobileBottomNav tartalmazza `lesson-studio`
- [ ] Playwright: a probe-on a `studio-mode-web` látható; kattintásra a chat placeholder; a feltöltő űrlap a web módban nincs a képernyőn (vagy hidden). A LS-8 feltöltés-elsődleges teszt a default `upload` módban maradjon zöld.

---

### Task 8: Verifikáció

Windows, `source` könyvtár:

```
npx.cmd --yes tsx --test tests/audit-2026-09-static.test.ts tests/html-file-schema.test.ts tests/web-research-agent.test.ts tests/ai-model-routing-complete.test.ts tests/studio-one-menu.test.ts tests/models-routing.test.ts
```

Ha van Playwright a probe-ra: `npx.cmd playwright test tests/studio-one-menu.spec.ts`

Lint a módosított TS/TSX fájlokon.

Böngésző (ha a dev szerver fut): `/admin?tab=lesson-studio` — feltöltés + Internetes keresés; `/admin?tab=enhanced` 80%. Ha nincs bejelentkezés, a probe-on ellenőrizd.

Kész csak futtatott paranccsal.

---

### 2. kör (Claude Code, 2026-09-09) — a felülvizsgálat 10. pontja szerint

**Files:**
- Modify: `source/server/studio/web-research-agent.ts` — v7.1 követelményblokk, cím a promptban, `htmlLooksComplete`, SSE-eseménytípusok.
- Modify: `source/server/studio/web-research-routes.ts` — folytatási ciklus `pause_turn`-re, `stop_reason` kapu, tétlenségi időkorlát, `status`/`sources`/`content_replace` események.
- Modify: `source/client/src/components/studio/WebResearchAgentPanel.tsx` — státuszsor, forráslista, leírás forrásokkal, `content_replace`.
- Test: `source/tests/web-research-agent.test.ts` — új esetek (csonka HTML, cím a promptban, statikus őr a route-ra: `pause_turn`, `stop_reason`).

Verifikáció: `npx.cmd tsc --noEmit`; `npx.cmd eslint <érintett fájlok>`; `node --import tsx --test tests/web-research-agent.test.ts ...`; Playwright `tests/studio-one-menu.spec.ts` (build:e2e + saját szerver az 5000-en). Valós Anthropic-hívás helyben NEM futtatható (nincs kulcs a `.env`-ben) — NOT RUN, kockázat: a request-alak a hivatalos doksi példájával egyezik.
