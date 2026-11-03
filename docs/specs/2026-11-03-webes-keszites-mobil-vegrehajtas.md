# Végrehajtás: webes készítés mobilnézet (terv: `docs/specs/2026-11-03-webes-keszites-mobil.md`)

Munkakönyvtár: `source/`.

## T1: RED — `tests/web-research-completion.spec.ts`

- Új teszt „mobil: a hosszú csevegés nem lóg ki…”: 390×844, hosszú felhasználói üzenet, markdownos ügynök-szöveg;
  futás közben és kész állapotban `elementFromPoint`-takarásvizsgálat négy elemre; `strong` = „Új teljes letöltés:”,
  nincs `**`.
- `npx.cmd playwright test --config playwright.web-research.config.ts -g "mobil:"` → FAIL (takarás).

## T2: `client/src/lib/chat-markdown.ts`

- `export type ChatInline = { text: string; bold: boolean }`;
  `export type ChatBlock = { kind: "heading" | "paragraph"; inlines: ChatInline[] } | { kind: "list"; items: ChatInline[][] }`.
- `parseChatInline(text)`: `**…**` párok → `bold: true`; páratlan `**` szövegként marad.
- `parseChatMarkdown(text)`: üres sor tagol; `- ` / `* ` / `• ` kezdetű sorok egy listába; `#{1,6} ` → heading;
  a többi sor egy bekezdésbe (sortörés `\n`-ként megmarad a szövegben).

## T3: `components/ChatInterface.tsx`

- `Card`: `flex flex-col h-full min-h-0 overflow-hidden`, `data-testid="chat-interface"`.
- `CardHeader`: `p-3 sm:p-6 pb-2`; cím `text-base sm:text-lg`; leírás `text-xs sm:text-sm`.
- `CardContent`: `flex flex-col flex-1 min-h-0 gap-3 p-3 sm:p-4`.
- `ScrollArea`: `flex-1 min-h-0 pr-2 sm:pr-4`.
- Buborék: `max-w-[88%] sm:max-w-[80%] min-w-0 text-sm sm:text-base`; ikonok `w-6 h-6 sm:w-8 sm:h-8`.
- Beviteli mező: küldés után `scrollTop = 0`, hogy a helyőrző az első sorától látsszon.
- Assistant-tartalom: `ChatMarkdown` (React elemek, `strong`, `ul/li`, `p`) — nincs `dangerouslySetInnerHTML`.
- Beviteli sor: `shrink-0`; `Textarea` `min-w-0` (a mobil minimum a `studio.css` 7.75em-es szabálya, T3b); gomb `w-[52px] h-[52px] sm:w-[60px] sm:h-[60px]`.

## T3b: `studio.css` és a panel lábléce

- `studio.css` 18–19. sor: a `textarea` törlése a 44 px-es `:is()` listából (a 7.75em-es szabály így érvényesül; ≥ 44 px).
- `WebResearchAgentPanel.tsx`: csevegődoboz `h-[min(560px,72dvh)] sm:h-[min(480px,62dvh)]`; mentés gomb
  `w-full whitespace-normal sm:w-auto sm:flex-1`; Megnyitás / Új készítés `flex-1 !whitespace-nowrap sm:flex-none`.
- Ellenőrzés: böngészőben 375 px, `getComputedStyle(chat-input).minHeight` ≈ 7.75em (124 px), nem 44 px.

## T4: unit — `tests/chat-markdown.test.ts`

- félkövér, lista, címsor, páratlan `**`, üres bemenet.
- `npx.cmd tsx --test tests/chat-markdown.test.ts` → pass.

## T5: verifikáció

- `npx.cmd playwright test --config playwright.web-research.config.ts` → mind zöld; képernyőképek 390 px futás/kész.
- `npm.cmd run check`, `npm.cmd run check:test`, `npm.cmd run lint`.
- Csapda-bejegyzés: `docs/agent-csapdak.md` C-07 (flex `min-h-0`, csak vízszintes túlcsordulást mérő teszt).
