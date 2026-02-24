/**
 * Async Material Improvement Module
 * 
 * Vercel proxy has a 30s timeout for rewrites, but AI processing takes 1-3 minutes.
 * Solution: POST returns immediately with jobId (= DB record id), processing runs in background,
 * client polls GET /status/:jobId which reads from DATABASE (not in-memory).
 * 
 * GYÖKÉROK JAVÍTÁS: Korábban in-memory Map-et használtunk, ami Render restart-kor törlődött.
 * Most az improvedHtmlFiles tábla 'processing' státuszú rekordja tárolja az állapotot.
 */

import { Router } from 'express';
import { storage } from './storage';
import type { HtmlFile } from '@shared/schema';

/**
 * Run the AI improvement in background and update the DATABASE record
 */
async function processImprovementJob(
  dbRecordId: string,
  originalFile: HtmlFile,
  customPrompt: string | undefined,
  userId: string,
  anthropicKey: string
) {
  const contentSizeKB = Buffer.byteLength(originalFile.content, 'utf8') / 1024;

  try {
    // Build prompts
    const systemPrompt = `Te egy professzionális HTML tananyag javító és modernizáló szakértő vagy (Tananyag Javító v2.0 – szinkronizálva Tananyag Készítő v7.1-gyel).

## FELADATOD
Régi, csonkolt vagy hibás HTML tananyagokat javítasz és bővítesz a Tananyag Készítő v7.1 specifikáció szerint.
A cél: a tananyag 4-oldalas struktúrába alakítása, kognitív elemekkel, feladatokkal és kvízzel kiegészítve.

## KRITIKUS FORMÁTUM SZABÁLYOK
- A válaszod KIZÁRÓLAG HTML kóddal kezdődik (<!DOCTYPE html>)
- TILOS bármilyen szöveg, magyarázat, markdown a HTML előtt vagy után
- NE használj markdown kódblokkot (\`\`\`html) - csak tiszta HTML-t adj vissza

## 4-OLDALAS STRUKTÚRA (v7.1 KÖTELEZŐ)
Minden javított tananyag 4 oldalt (tab-ot) KELL tartalmazzon:
| Tab | Cím | Tartalom |
|-----|------|----------|
| 1 | 📖 Tananyag | Részletes lexikális tudás, fejezetek, info-boxok |
| 2 | 🧠 Módszerek | Min. 10 kognitív aktivációs elem |
| 3 | ✏️ Feladatok | 45 feladat bankban, 15 véletlenszerűen megjelenítve |
| 4 | 🎯 Kvíz | 75 kérdés bankban, 25 véletlenszerűen, 3 válasz (A/B/C) |

Ha a régi tananyag 3 oldalas (v6): add hozzá a 🧠 Módszerek oldalt 2. pozícióba.
Tab navigáció: sticky, 4 gomb, reszponzív, min 44px magasság.

## JAVÍTÁSI PRIORITÁSOK (sorrendben)
1. **Csonkolt HTML záró tagek** → Összes hiányzó záró tag pótlása (</script>, </div>, </body>, </html>)
2. **Hiányzó Módszerek oldal** → Generálás min. 10 kognitív elemmel a 2. pozícióba
3. **Hiányzó oldalak (Feladatok/Kvíz)** → Generálás a tananyag tartalmából
4. **Tab navigáció 4 gombra javítása** → Módszerek tab hozzáadása
5. **alert()/confirm()/prompt() → HTML modal csere** → Minden natív dialógus HTML overlay-re cserélése
6. **IIFE wrapper hozzáadása** → (function(){ 'use strict'; ... })() – tab-váltókat window-ra!
7. **Touch events pótlása** → dragdrop elemekhez touchstart/touchmove/touchend
8. **Újragenerálás gombok** → Feladatok és Kvíz oldal TETEJÉN 🔄 gomb
9. **Kvíz kérdések pótlása** → Cél: 75 kérdés, **3 válasz (A/B/C)** – NEM 4!
10. **Feladatok pótlása** → Cél: 45 feladat, szinonima/kulcsszó-alapú kiértékelés
11. **JavaScript funkciók kiegészítése** → Kiértékelés, pontozás, JSON mentés
12. **CSS hiányosságok** → Reszponzivitás 320px–2560px, min-height: 44px, egyedi prefix

## KOGNITÍV ELEMEK – 2. OLDAL (min. 10 db, MIND szerepeljen)
| Elem | Leírás |
|------|--------|
| prediction-box | "Szerinted mi fog történni ha...?" – tanuló beír, majd megmutatja a valós választ |
| gate-question | Kapukérdés (2-3 db): csak helyes válasz után mutatja a továbbit |
| myth-box | Igaz/hamis tévhit, kattintásra megmutatja a magyarázatot |
| dragdrop-box | Húzd a helyére – toucheventtel mobilon is! |
| cause-effect | Ok→hatás lánc, kattintható lépésekkel |
| conflict-box | Meglepő tény vagy paradoxon |
| self-check | Önértékelő csúszka (1-100) visszajelzéssel |
| popup-trigger | Kattintásra/érintésre felugró kérdés |
| timeline | Folyamat vagy idősor interaktívan |
| analogy-box | Korosztályhoz illő hasonlat, ami az új fogalmat köti a meglévő tudáshoz |

## TILTOTT ELEMEK (v7.1)
| Tiltott | Helyes megoldás |
|---------|----------------|
| alert('...') | HTML modal overlay (<div class="PREFIX-overlay">) |
| confirm('...') | HTML modal confirm (Igen/Mégse gombokkal, addEventListener) |
| prompt('...') | HTML input modal |
| Inline JSON onclick="..." | Globális változó + addEventListener |
| Emoji képkártyák | Szöveges kártyák CSS-sel |

## IIFE WRAPPER (KÖTELEZŐ)
Minden JavaScript IIFE-be kell kerüljön. Tab-váltókat és onclick-ből hívott függvényeket window-ra:
\`\`\`
(function() {
  'use strict';
  // ... minden kód ...
  window.PREFIX_showTab = function(id) { ... };
  window.PREFIX_selectOpt = function(qi, oi) { ... };
})();
\`\`\`

## TOUCH EVENTS (v7.1 KÖTELEZŐ – dragdrop)
Minden draggable elemhez:
- mousedown + mousemove + mouseup (asztali)
- touchstart + touchmove + touchend (mobil, { passive: false })
- touchend-ben: document.elementFromPoint(touch.clientX, touch.clientY) a drop zone-hoz
- element.style.touchAction = 'none';

## KVÍZ SZABÁLYOK (v7.1)
- **75 kérdés bankban, 25 megjelenítve véletlenszerűen**
- **3 válaszlehetőség (A/B/C)** – NEM 4, NEM 2!
- Struktúra: { q: 'Kérdés?', opts: ['A', 'B', 'C'], correct: 0 }
- 🔄 Újragenerálás gomb a TETEJÉN
- ✅ Kiértékelés gomb az ALJÁN
- Konfirmációs HTML modal a kiértékelés előtt
- Eredmény az oldalon (NEM alert!)

## FELADAT SZABÁLYOK (v7.1)
- **45 feladat bankban, 15 megjelenítve véletlenszerűen**
- **KIZÁRÓLAG az 1. oldal (Tananyag) tartalmából** képzett kérdések
- Nyílt végű kérdések, textarea inputtal
- **Szinonima/kulcsszó-alapú kiértékelés** (NEM szó szerinti egyezés!)
- Kulcsszó-lista minden feladathoz, elfogadás ha >= 50% kulcsszó megvan
- 🔄 Újragenerálás gomb a TETEJÉN
- ✅ Kiértékelés gomb az ALJÁN
- Konfirmációs HTML modal

## ÉRTÉKELÉSI RENDSZER
- 90% = 5 🏆 Jeles
- 75% = 4 😊 Jó
- 60% = 3 🙂 Közepes
- 40% = 2 😐 Elégséges
- <40% = 1 😞 Elégtelen

## JSON MENTÉS (biztonságos, ékezetekkel)
- Globális változó az eredményhez (resultData)
- addEventListener a mentés gombra (NEM onclick attribútum!)
- Blob + URL.createObjectURL + a.click() + revokeObjectURL

## CSS SZABÁLYOK (v7.1)
- CSS változók: :root { --primary: COLOR; --success: #00b894; --error: #e17055; }
- **Egyedi prefix** minden osztálynéven (pl. fo-, tr-, mk-)
- Reset: * { box-sizing: border-box; margin: 0; padding: 0; }
- Font: font-family: Segoe UI, Noto Sans, system-ui, sans-serif;
- **TILOS**: @font-face, Google Fonts, külső CSS, CDN linkek
- Sticky nav: position: sticky; top: 0; z-index: 100;
- Reszponzív: clamp() font-size-okhoz, @media 480px és 1400px
- Minden gomb: min-height: 44px;
- Animációk: fadeIn, popIn keyframes

## NAVIGÁCIÓ HELYES MINTA (v7.1)
\`\`\`html
<nav class="PREFIX-nav">
  <button class="PREFIX-tab-btn active" onclick="PREFIX_showTab('p1')">📖 Tananyag</button>
  <button class="PREFIX-tab-btn" onclick="PREFIX_showTab('p2')">🧠 Módszerek</button>
  <button class="PREFIX-tab-btn" onclick="PREFIX_showTab('p3')">✏️ Feladatok</button>
  <button class="PREFIX-tab-btn" onclick="PREFIX_showTab('p4')">🎯 Kvíz</button>
</nav>
\`\`\`

## TARTALOM MEGŐRZÉSE (NAGYON FONTOS!)
1. Az eredeti tananyag TELJES szöveges tartalmát MARADÉKTALANUL őrizd meg
2. NE hagyj ki semmilyen információt, bekezdést, listát vagy adatot
3. A struktúrát javítsd, de a tartalom maradjon változatlan
4. BŐVÍTSD ki feladatokkal, kvízekkel, kognitív elemekkel
5. A téma és stílus NE változzon

## MINŐSÉGI KRITÉRIUMOK (v7.1) – MIND KÖTELEZŐ
✓ Érvényes HTML5 struktúra (DOCTYPE + html + head + body + záró tagek)
✓ 4 oldal (📖 Tananyag | 🧠 Módszerek | ✏️ Feladatok | 🎯 Kvíz)
✓ Min. 10 kognitív elem a Módszerek oldalon (mind a 10 típus!)
✓ 45 szöveges feladat (15 megjelenítve) – kulcsszó-alapú kiértékelés
✓ 75 kvíz kérdés (25 megjelenítve, **3 válasz A/B/C**)
✓ IIFE wrapper – window-ra exportált függvények
✓ NINCS alert()/confirm()/prompt() – csak HTML modal
✓ Touch events dragdrop-ban (touchstart/touchmove/touchend)
✓ Min. 44px kattintható területek
✓ CSS prefix minden osztálynéven
✓ Konfirmációs HTML modal kiértékelés előtt
✓ 🔄 Újragenerálás gomb Feladatok és Kvíz TETEJÉN
✓ JSON mentés globális változóval + addEventListener
✓ Értékelés: 90=5, 75=4, 60=3, 40=2, <40=1
✓ Reszponzív CSS 320px–2560px (clamp, @media)
✓ UTF-8 + Segoe UI font
✓ Sticky tab navigáció`;

    const userPrompt = `# Tananyag Modernizálása

## EREDETI TANANYAG ADATAI
- **Cím:** ${originalFile.title}
- **Évfolyam:** ${originalFile.classroom || 'Nincs megadva'}. osztály
- **Leírás:** ${originalFile.description || 'Nincs leírás'}
- **Fájl méret:** ${Math.round(contentSizeKB)} KB

${customPrompt ? `## EGYEDI UTASÍTÁSOK (FONTOS - KÖVESD EZEKET!)
${customPrompt}

` : ''}## MODERNIZÁLANDÓ HTML TARTALOM
Az alábbi HTML kódot alakítsd át a fenti szabályok szerint. ŐRIZD MEG A TELJES TARTALMAT!

${originalFile.content}

---
⚠️ EMLÉKEZTETŐ: A válaszod CSAK a teljes, javított HTML kód legyen - semmi szöveg előtte vagy utána!`;

    const { ClaudeProvider } = await import('./ai/ClaudeProvider');
    const improveProvider = new ClaudeProvider({
      apiKey: anthropicKey,
      model: 'claude-sonnet-4-20250514',
      timeout: 600000, // 10 min HTTP timeout
      maxTokens: 32768, // 32K tokens for full v7.1 HTML
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 min max

    console.log(`[IMPROVE] Record ${dbRecordId}: Calling AI...`);
    const startTime = Date.now();

    let aiResponse;
    try {
      aiResponse = await improveProvider.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ], controller.signal);
    } finally {
      clearTimeout(timeoutId);
    }

    const duration = Date.now() - startTime;
    console.log(`[IMPROVE] Record ${dbRecordId}: AI responded in ${duration}ms`);

    if (!aiResponse || !aiResponse.content) {
      throw new Error('Az AI nem adott vissza választ');
    }

    // Extract and clean HTML
    let improvedHtml = aiResponse.content.trim();
    const codeBlockMatch = improvedHtml.match(/```(?:html)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch) improvedHtml = codeBlockMatch[1].trim();

    const htmlStart = improvedHtml.search(/<!DOCTYPE|<html/i);
    if (htmlStart > 0) improvedHtml = improvedHtml.substring(htmlStart);

    const htmlEnd = improvedHtml.lastIndexOf('</html>');
    if (htmlEnd !== -1) improvedHtml = improvedHtml.substring(0, htmlEnd + 7);

    // Post-processing fixes
    improvedHtml = improvedHtml
      .replace(/:root\s*\{([^}]*)\}/gi, (_match: string, content: string) => {
        const fixed = content.replace(
          /(?<![a-z-])(\b(?:primary|secondary|accent|success|error|warning|info|background|text|border|shadow|spacing|radius)\b)\s*:/gi,
          '--edu-$1:'
        );
        return `:root {${fixed}}`;
      })
      .replace(/var\((?!--)([a-z][a-z0-9-]*)\)/gi, 'var(--edu-$1)')
      .replace(/var\(-([a-z][a-z0-9-]*)\)/gi, 'var(--edu-$1)')
      .replace(/@font-face\s*\{[^}]*\}/gi, '')
      .replace(/<link[^>]*fonts\.googleapis\.com[^>]*>/gi, '')
      .replace(/<link[^>]*fonts\.gstatic\.com[^>]*>/gi, '')
      .replace(/<link[^>]*cdnjs\.cloudflare\.com[^>]*>/gi, '')
      .replace(/<link[^>]*unpkg\.com[^>]*>/gi, '')
      .replace(/<link[^>]*jsdelivr\.net[^>]*>/gi, '')
      .replace(/<script[^>]*src=["'][^"']*(?:cdn|unpkg|jsdelivr|cloudflare)[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<html(?![^>]*lang=)/i, '<html lang="hu"')
      .replace(/<head>(?![\s\S]*viewport)/i, '<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">')
      .replace(/<head>(?![\s\S]*charset)/i, '<head>\n  <meta charset="UTF-8">');

    // Validate
    if (!improvedHtml || improvedHtml.length < 100) {
      throw new Error('A generált HTML túl rövid vagy üres');
    }
    if (!improvedHtml.includes('<html') && !improvedHtml.includes('<!DOCTYPE')) {
      throw new Error('A generált válasz nem tartalmaz érvényes HTML struktúrát');
    }

    // ✅ CRITICAL: Update content AND status in ONE atomic operation
    // If we did this in two steps, the user could "Apply" the file
    // between status→pending and content→HTML, getting the placeholder!
    await storage.updateImprovedHtmlFileContentAndStatus(dbRecordId, improvedHtml, 'pending');

    console.log(`[IMPROVE] Record ${dbRecordId}: ✅ Success! Content saved (${improvedHtml.length} bytes), status → pending`);

  } catch (error: any) {
    console.error(`[IMPROVE] Record ${dbRecordId}: Error:`, error.message);

    let userMessage = 'Hiba történt a javítás során';
    if (error.name === 'AbortError' || error.message?.includes('aborted')) {
      userMessage = 'Időtúllépés: Az AI túl sokáig dolgozott (10 perc). Próbáld kisebb fájllal.';
    } else if (error.message?.includes('rate') || error.message?.includes('429')) {
      userMessage = 'Túl sok kérés. Várj egy percet és próbáld újra.';
    } else if (error.message?.includes('credit') || error.message?.includes('balance')) {
      userMessage = 'AI egyenleg probléma.';
    } else if (error.message) {
      userMessage = error.message;
    }

    // ✅ UPDATE the DB record with error status
    try {
      await storage.updateImprovedHtmlFileStatus(dbRecordId, 'error', undefined, userMessage);
    } catch (dbError: any) {
      console.error(`[IMPROVE] Record ${dbRecordId}: Failed to save error status:`, dbError.message);
    }
  }
}

/**
 * Register async improvement routes on the admin router
 */
export function registerImprovementRoutes(adminRouter: Router) {
  // POST /api/admin/improve-material/:id - Start async AI improvement job
  adminRouter.post("/improve-material/:id", async (req: any, res) => {
    console.log(`[IMPROVE] Request received for file ID: ${req.params?.id}`);

    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { id } = req.params;
    const { customPrompt } = req.body || {};
    const userId = req.user.id;

    try {
      const originalFile = await storage.getHtmlFile(id);
      if (!originalFile) {
        return res.status(404).json({ message: 'Fájl nem található' });
      }

      const contentSizeKB = Buffer.byteLength(originalFile.content, 'utf8') / 1024;
      if (contentSizeKB > 500) {
        return res.status(400).json({
          message: `A fájl túl nagy (${Math.round(contentSizeKB)}KB, max 500KB)`
        });
      }

      const anthropicKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
      if (!anthropicKey) {
        return res.status(500).json({ 
          message: 'AI API kulcs nincs beállítva.' 
        });
      }

      // ✅ GYÖKÉROK JAVÍTÁS: Create DB record FIRST with 'processing' status
      const dbRecord = await storage.createImprovedHtmlFile({
        originalFileId: originalFile.id,
        title: originalFile.title,
        content: '<!-- Feldolgozás alatt... -->', // Placeholder until AI completes
        description: originalFile.description,
        classroom: originalFile.classroom,
        contentType: originalFile.contentType || 'html',
        improvementPrompt: customPrompt || 'Default improvement',
        status: 'processing',
        createdBy: userId,
      });

      console.log(`[IMPROVE] DB record ${dbRecord.id} created with status 'processing' for: ${originalFile.title}`);

      // Return immediately with DB record ID
      res.json({ 
        success: true, 
        jobId: dbRecord.id, 
        status: 'processing',
        message: 'Javítás elindítva' 
      });

      // Process in background (fire-and-forget)
      processImprovementJob(dbRecord.id, originalFile, customPrompt, userId, anthropicKey);

    } catch (error: any) {
      console.error('[IMPROVE] Error:', error.message);
      return res.status(500).json({ message: error.message || 'Hiba' });
    }
  });

  // GET /api/admin/improve-material/status/:jobId - Poll job status FROM DATABASE
  adminRouter.get("/improve-material/status/:jobId", async (req: any, res) => {
    const { jobId } = req.params;
    
    // ✅ Read from DATABASE, not in-memory Map
    const record = await storage.getImprovedHtmlFile(jobId);

    if (!record) {
      return res.status(404).json({ status: 'not_found', message: 'Job nem található' });
    }

    const elapsed = Math.round((Date.now() - new Date(record.createdAt).getTime()) / 1000);

    if (record.status === 'processing') {
      return res.json({ status: 'processing', elapsed });
    }

    if (record.status === 'pending') {
      // AI completed successfully - return the improved file info
      return res.json({ 
        status: 'completed', 
        elapsed, 
        improvedFile: {
          id: record.id,
          title: record.title,
          status: record.status,
        }
      });
    }

    if (record.status === 'error') {
      // AI failed - return error message, then clean up the record
      const errorMessage = record.improvementNotes || 'Ismeretlen hiba';
      await storage.deleteImprovedHtmlFile(jobId);
      return res.json({ status: 'error', elapsed, message: errorMessage });
    }

    // Any other status (approved, applied) - treat as completed
    res.json({ 
      status: 'completed', 
      elapsed,
      improvedFile: {
        id: record.id,
        title: record.title,
        status: record.status,
      }
    });
  });
}
