---
name: websuli-internet-pipeline
description: Internetes tananyagkészítés a programon belüli témára — keresés, web_fetch, tudásbázis, 7.4 fúziós HTML. Aktiválódjon webes tananyag, web-research, forrásjegyzék vagy tudásbázis-pipeline esetén.
---

# Internetes tananyag-pipeline

Aktiváld, ha a feladat internetes keresésből készülő tananyag, `web-research`, webes tudásbázis, fetch nélküli HTML vagy a 7.4 skill webes bekötése.

Először olvasd: [közös módszer](../../../docs/lesson-improvement.md), [v7.4](../../../docs/specs/tananyag-keszito-SKILL-v7_4.md), [készítő skill](../tananyag-keszito/SKILL.md), [2026-09-13-es spec](../../../docs/specs/2026-09-13-web-knowledge-pipeline.md).

## Kötelező sorrend

1. **Gyűjtés** (`generate`): Anthropic `web_search` + `web_fetch` (`allowed_callers: direct`, `max_content_tokens: 50000`). HTML ebben a fázisban nem kész tananyag. Fetch nélkül nincs tovább lépés.
2. **Jegyzék** (`knowledge`): a letöltött szöveg `ExtractorFile`, `completeExtractionConcepts` + `applyVerbatimChecks`. Csak `verbatimOk` fogalom tanítható. Nulla tanítható fogalom = hiba.
3. **Tanítás** (`author`): Studio `author` modell, `webLessonAuthorPrompt` + `knowledgeAuthorData`. Nincs `web_search`. A kimenet tanítás + négy panel + helyőrző JSON-bank; ne gyárts `ee_evaluate` pontozót.
4. **Bank**: `lessonFromTeachingHtml` → `buildLessonExperience` csomagonként → `writeHtmlLessonData`. A tanítás HTML-je a scripten kívül változatlan marad.
5. **Kapu**: meglévő 45/75, módszer, idézet, tartalmi lektor. Hiányos anyag nem publikálható.

## Mintaminőség

A jó tananyag nem vázlat: fejezetenként magyarázat, kidolgozott példa, összefoglaló, szemléltetés, kattintható felhasznált URL. A 3–4 hónapos, adatbázisban lévő hosszú HTML-ek a minőségi minta; a skill 7.4 a szerződés. Éles gyártást ne indíts diagnózis nélkül.

## Ne tedd

- Egyetlen modellhívásban keresni és HTML-t írni.
- A gyűjtő promptba tenni a `LESSON_HTML_SPEC_V74` JS-dumpot vagy kimenet-takarékosságot.
- Keresési találatot tudásbázisnak nevezni.
- Kaput lazítani, Trója/Egervár tananyagot kézzel írni, titkot chatbe írni.
