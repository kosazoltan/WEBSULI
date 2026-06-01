# Speech-to-Text (diktálás) az iframe-es tananyag-keretrendszerben

> Generálva: 2026-06-01 · PR #2 (`claude/zealous-wozniak-beLLH`)
> Tagek: speech-to-text, web-speech-api, iframe, sandbox, microphone, permissions-policy, getUserMedia

## Probléma

A tanulók **nem tudták diktálással (speech-to-text)** kitölteni a beágyazott
tananyagok szöveges feladatait. A tananyag az iframe **gyermekeként** önmagában
nem tudja megadni magának a mikrofon-engedélyt — erről mindig a **szülő oldal**
(websuli.vip / a kliens React iframe) dönt.

## Gyökérok (root cause)

A `/dev/:id` tananyagot betöltő iframe-eken az `allow="microphone"` attribútum
**már jelen volt**, a tényleges blokkoló viszont a `sandbox` attribútum volt:
`allow-scripts` szerepelt benne, de **`allow-same-origin` NÉLKÜL** (a `4fc9224`
"tighten iframe sandbox" commit távolította el).

`allow-same-origin` nélkül a betöltött dokumentum **opaque (null) origin**-ben
fut. A böngészők az opaque origin-nak **soha nem adnak** mikrofon-engedélyt —
sem a `getUserMedia`, sem a **Web Speech API** (`webkitSpeechRecognition`)
számára —, függetlenül attól, hogy az `allow="microphone"` ott van-e. A
Permissions Policy delegáció a frame origin-jára kulcsol, az opaque origin
viszont sosem szerepel az allowlistán → a mikrofon (és így a diktálás) tiltva.

**Kulcs-tanulság:** `allow="microphone"` **szükséges, de nem elégséges**.
Sandboxolt iframe-nél mellé KELL az `allow-same-origin` is, hogy a tananyag
valós origin-t kapjon, amelyhez a delegált engedély kötődhet. Mivel a `/dev/:id`
azonos origin-ról szolgál ki, ez biztonságosan megtehető.

## Megoldás

### 1. `allow-same-origin` visszaállítása a sandbox-ban

A tanuló- és szerkesztő-nézet preview iframe-jein:

| Fájl | Iframe |
|------|--------|
| `source/client/src/pages/Preview.tsx` | tanuló material player (`/dev/:id`) |
| `source/client/src/components/CodeViewer.tsx` | material viewer (`/dev/:id`) |
| `source/client/src/components/EnhancedMaterialCreator.tsx` | 2 db creator előnézet (`srcDoc`) |

Mindegyiken az `allow` tartalmazza: `microphone` + `autoplay`. A sandbox most:
`allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads`.

A `MaterialImprover.tsx` diff-előnézet iframe-jei **szándékosan szigorúak**
maradtak (nincs mikrofon, csak vizuális összehasonlítás).

### 2. Keretrendszer-szintű diktálás-segéd (szerver oldal)

`source/server/routes.ts` → `wrapHtmlWithResponsiveContainer()` egy
`speechToTextScript`-et injektál minden tananyagba (mindkét ágban: teljes HTML
dokumentum a `</body>` elé, illetve fragment ág). A script:

- Web Speech API-t használ (`SpeechRecognition || webkitSpeechRecognition`),
  `lang = document.documentElement.lang || 'hu-HU'`.
- Automatikusan 🎤 gombot tesz minden szöveges mező mellé:
  `textarea`, `input[type=text|search|email|url|tel|""]`, `[contenteditable]`.
- A felismert szöveget a **kurzorhoz** szúrja, `input`/`change` eseményt vált ki.
- `MutationObserver`-rel figyeli a **dinamikusan** beszúrt mezőket (kvíz lépések).
- Közzéteszi a `window.websuliDictation` API-t (`{supported, attach, start, stop}`).
- Nem támogatott böngészőn **csendben kikapcsol**; `data-no-dictation`
  attribútummal mezőnként kihagyható.
- Így a **meglévő tananyagok újraírás nélkül** diktálhatóvá válnak.

A wrapper CSP meta tagje már engedi: `media-src 'self' data: blob:`.

## Biztonsági megjegyzés

`allow-same-origin` + `allow-scripts` azonos origin-ú tartalomnál azt jelenti,
hogy a beágyazott tananyag elérheti a szülő kontextust. A `/dev/:id` a platform
**saját, admin/AI által generált** tananyagait szolgálja ki azonos origin-ról,
ezt a tartalmat a rendszer eddig is megbízhatónak kezelte. A tradeoff elfogadott.

## Érintett fájlok

- `source/client/src/pages/Preview.tsx`
- `source/client/src/components/CodeViewer.tsx`
- `source/client/src/components/EnhancedMaterialCreator.tsx`
- `source/server/routes.ts` (`speechToTextScript`, `wrapHtmlWithResponsiveContainer`)

## Validáció

- `tsc --noEmit`: 0 hiba a módosított fájlokban.
- `eslint`: 0 error (csak meglévő `no-console` warningok).
- Injektált böngésző-script: `node --check` → szintaktikailag valid.
