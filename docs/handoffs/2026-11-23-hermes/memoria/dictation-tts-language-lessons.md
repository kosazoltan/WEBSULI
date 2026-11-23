---
name: dictation-tts-language-lessons
description: Diktálás / felolvasás / kiejtésgyakorlás — a kereszt-domaines tananyag-keret gyökéroka (híd) és a nyelvleckék kötelező kiejtésgyakorlója
metadata:
  node_type: memory
  type: project
  modified: 2026-10-21T13:30:05.567Z
---

**Gyökérok (2026-10-21, PR #360):** 2026-09-02 óta (`8b8e2622`) a régi HTML-anyag (`/dev/:id`) KÜLÖN originről, kereszt-domaines
iframe-ben fut (biztonsági izoláció). Ott a böngésző a beszédfelismerést `not-allowed`-dal elutasítja, a régi segéd ezt csak a konzolba
írta → a diktálás csendben megszűnt. Javítás: `SpeechRecognition`-híd a keretben (`server/lib/speech-bridge.ts`), a felismerést a főoldal
futtatja (`client/src/lib/speech-bridge-host.ts`, `Preview.tsx`). Az izolációt visszakapcsolni TILOS (biztonság).

**Nyelvleckék (tulajdonosi szabály 2026-10-21):** minden nyelvleckénél kötelező a felolvasás (TTS) és a kiejtésgyakorlás — a Stúdió-lecke
„Kiejtés” füle a szószedetből épül (Meghallgatás + Mondd ki!); a gyártás fejezetenként legalább 4 szószedet-elemet kér példamondattal.
Androidon (Chrome, Edge, saját böngésző) és iPhone Safariban is működnie kell; beszédfelismerés nélkül a billentyűzet 🎤 diktálása az út
(a gomb soha nem tűnhet el nyom nélkül).

**Why:** a tulajdonos „hatalmas hiányosságként” jelezte, és azt, hogy a diktálás „eddig működött”.
**How to apply:** beszéd-funkciót érintő változásnál Playwright-teszt felismerővel ÉS nélküle; kereszt-domaines keretben a mikrofon csak a
hídon át. Kapcsolódó: [[lesson-results-email-rule]].
