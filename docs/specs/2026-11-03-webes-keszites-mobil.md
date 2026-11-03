# Webes tananyagkészítés — mobilnézet szétesése

**Dátum:** 2026-11-03 · **Tier:** S/M · **Forrás:** tulajdonosi képernyőképek (telefon, ~390 px):
a felhasználói és ügynök-buborékok a forrásdobozra, a „Mentés / Megnyitás / Új készítés” gombokra és a
beviteli mezőre lógnak; az ügynök szövegében nyers markdown (`**Új teljes letöltés:**`) látszik.

## Gyökérok (kódból, mérve)

1. `WebResearchAgentPanel.tsx`: a `ChatInterface` egy fix magasságú dobozban van (`h-[min(480px,62dvh)]`).
2. `ChatInterface.tsx`: a `Card` → `CardContent (flex-1)` → `ScrollArea (flex-1)` lánc egyik elemén sincs
   `min-h-0`. Flex-oszlopban az elem minimális magassága alapból a tartalom magassága, ezért a hosszú
   csevegés nem görget, hanem kinő a fix dobozból, és — mert sem a doboz, sem a Card nem vág — rárajzolódik
   a következő elemekre. Mobilon a keskeny buborék (80% − ikonok − `pr-4`) miatt a szöveg sokkal magasabb,
   ezért ott esik szét.
3. A buborék `<p className="whitespace-pre-wrap">{content}</p>`: a modell markdownja nyersen jelenik meg.
4. `components/studio/studio.css` (mérve a böngészőben, 375 px): a mobil `.ws-studio :is(button, …, textarea,
   input:not(…):not(…)…) { min-height: 44px }` szabály az `:is()` legerősebb argumentumának specificitását kapja
   (0,5,1), ezért felülírja a lenti `.ws-studio textarea { min-height: 7.75em }` szabályt (0,1,1) — a csevegőmező
   44 px (2 sor) lett, a helyőrző levágódott. A `.ws-studio button { white-space: normal; overflow-wrap: anywhere }`
   miatt a szűk gombban a felirat szó közepén tört („tananya-gok”).
5. Teszthiány: a meglévő `web-research-completion.spec.ts` csak vízszintes túlcsordulást mér, takarást nem.

RED (2026-11-03, a régi `ChatInterface`-szel): az új Playwright-teszt 390×844-en: „futás közben: web-research-save
takarva — chat-message-assistant-1” — pontosan a képernyőkép. (A letiltott gomb `pointer-events: none`, ezért a
takarásmérés idejére a teszt visszakapcsolja; enélkül a mérés a letiltott gombon átlátott volna.)

## Cél

- A csevegés a saját dobozán belül görget; semmi nem lóg ki; a gombok és a mező kattinthatók 390 px-en és asztalon.
- Az ügynök üzenetében a `**félkövér**`, a `- ` listák és a `#` címsorok formázva, nyers jelölők nélkül.
- Mobilon tömörebb fejléc és buborék, olvasható betűméret.

## Nem cél

- Teljes markdown (táblázat, kód, link). HTML-befecskendezés (`dangerouslySetInnerHTML`) tilos.
- Szerveroldali változás, a futás logikája.

## Érintett fájlok

- `source/client/src/lib/chat-markdown.ts` (új, tiszta elemző)
- `source/client/src/components/ChatInterface.tsx`
- `source/tests/chat-markdown.test.ts` (új unit)
- `source/tests/web-research-completion.spec.ts` (új mobil-teszt; meglévő teszt nem változik)
- `source/client/src/components/studio/studio.css` (a textarea kikerül a 44 px-es `:is()` listából)
- `source/client/src/components/studio/WebResearchAgentPanel.tsx` (mobilon magasabb csevegődoboz; a mentés
  gomb teljes szélességű, a Megnyitás / Új készítés egy sorban, törés nélkül)

## Elfogadás (EARS)

- WHEN 390×844-en hosszú üzenetváltás van, THEN a `chat-input`, `chat-send-button`, `web-research-save`,
  `web-research-new` közepén `elementFromPoint` maga az elem (vagy leszármazottja); nincs vízszintes görgetés.
- WHEN az ügynök szövege `**X:**`-t tartalmaz, THEN `<strong>X:</strong>` jelenik meg, és a buborékban nincs `**`.
- WHEN a meglévő `web-research` Playwright-tesztek futnak, THEN mind zöld.
