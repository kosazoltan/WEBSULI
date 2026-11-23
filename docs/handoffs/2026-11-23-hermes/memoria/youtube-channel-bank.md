---
name: youtube-channel-bank
description: A napi hírlevél YouTube-csatornabankja a source/shared/youtube-channels.ts-ben él — bővítés csak böngészőben ellenőrzött URL-lel
metadata:
  node_type: memory
  type: project
  modified: 2026-10-31T14:36:00.197Z
---

A „Mai felfedezés” hírlevél VIDEÓ-AJÁNLÓ blokkja (#369, merge 2026-10-31) a `source/shared/youtube-channels.ts`
kézzel gondozott bankjából választ (érdeklődés-kulcsszó + évfolyamsáv + nap|tanulóId FNV-1a rotáció, modellhívás nélkül).
Bővítésnél a csatorna-URL-t böngészőben ellenőrizni KELL (a sima fetch a YouTube consent-falán elakad); a Zanza.tv és a
Matek Oázis azért maradt ki, mert nincs használható hivatalos csatornájuk, magyar angol-oktató csatornát 2026-10-31-én
nem találtunk. Terv: `docs/specs/2026-10-31-hirlevel-youtube-ajanlo.md`. Kapcsolódó: [[lesson-results-email-rule]].
