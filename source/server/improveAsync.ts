/**
 * Async Material Improvement Module
 * 
 * Vercel proxy has a 30s timeout for rewrites, but AI processing takes 1-3 minutes.
 * Solution: POST returns immediately with jobId, processing runs in background,
 * client polls GET /status/:jobId every 5 seconds.
 */

import { Router } from 'express';
import { storage } from './storage';

// In-memory job store
interface ImprovementJob {
  status: 'processing' | 'completed' | 'error';
  fileId: string;
  startedAt: number;
  result?: any;
  error?: string;
}

const improvementJobs = new Map<string, ImprovementJob>();

// Cleanup old jobs every 10 minutes (remove jobs older than 1 hour)
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  Array.from(improvementJobs.entries()).forEach(([jobId, job]) => {
    if (job.startedAt < oneHourAgo) {
      improvementJobs.delete(jobId);
    }
  });
}, 10 * 60 * 1000);

/**
 * Run the AI improvement in background and update the job store
 */
async function processImprovementJob(
  jobId: string,
  originalFile: any,
  customPrompt: string | undefined,
  userId: string,
  anthropicKey: string
) {
  const contentSizeKB = Buffer.byteLength(originalFile.content, 'utf8') / 1024;

  try {
    // Build prompts
    const systemPrompt = `Te egy professzionális HTML tananyag javító és modernizáló szakértő vagy (Tananyag Javító v2.0).

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
| 1 | 📖 Tananyag | Részletes lexikális tudás |
| 2 | 🧠 Módszerek | Min 8-10 kognitív elem |
| 3 | ✏️ Feladatok | 45 feladat bankban, 15 véletlenszerűen |
| 4 | 🎯 Kvíz | 75 kérdés bankban, 25 véletlenszerűen |

Ha a régi tananyag 3 oldalas: add hozzá a 🧠 Módszerek oldalt 2. pozícióba.
Tab navigáció: sticky, 4 gomb, reszponzív.

## JAVÍTÁSI PRIORITÁSOK
1. Csonkolt HTML záró tagek → Pótlás
2. Hiányzó Módszerek oldal → Generálás min. 10 kognitív elemmel
3. Hiányzó oldalak (Feladatok/Kvíz) → Generálás a meglévő minta alapján
4. Tab navigáció 4 gombra javítása
5. alert() → HTML modal csere
6. IIFE wrapper hozzáadása ha hiányzik
7. Touch events pótlása dragdrop elemekhez
8. Újragenerálás gombok Feladatok és Kvíz tetején
9. Hiányzó kvíz kérdések pótlása (cél: 75, A/B/C/D válaszok)
10. Hiányzó feladatok pótlása (cél: 45, kulcsszó-alapú kiértékelés)
11. JavaScript funkciók kiegészítése/javítása
12. CSS hiányosságok: reszponzivitás, min-height, prefix

## KOGNITÍV ELEMEK (2. OLDAL – min 8-10 db)
Kötelező elemtípusok:
- prediction-box, gate-question (2-3 db), myth-box, dragdrop-box (touch events!)
- cause-effect, conflict-box, self-check, popup-trigger, timeline/process, analogy-box

## TECHNIKAI SZABÁLYOK – KÖTELEZŐ
- TILOS: natív alert()/confirm()/prompt() – csak HTML modal
- TILOS: inline JSON onclick – globális változó + addEventListener
- KÖTELEZŐ: touch events drag&drop-hoz (touchstart/touchmove/touchend)
- KÖTELEZŐ: min 44px kattintható területek
- KÖTELEZŐ: IIFE wrapper: (function(){ 'use strict'; ... })()
- KÖTELEZŐ: UTF-8 meta + Segoe UI, Noto Sans, system-ui font
- KÖTELEZŐ: reszponzivitás 320px–2560px
- KÖTELEZŐ: egyedi CSS prefix minden osztálynéven
- KÖTELEZŐ: konfirmációs HTML modal kiértékelés előtt

## CSS SZABÁLYOK
- CSS változók: :root { --primary: COLOR; --success: #00b894; --error: #e17055; }
- Egyedi prefix minden osztálynéven (pl. kt-, env-, mat-)
- Reset: * { box-sizing: border-box; margin: 0; padding: 0; }
- Font: font-family: Segoe UI, Noto Sans, system-ui, sans-serif;
- TILOS: @font-face, Google Fonts, külső CSS, CDN linkek

## ÉRTÉKELÉS
90%=5 Jeles, 75%=4 Jó, 60%=3 Közepes, 40%=2 Elégséges, <40%=1 Elégtelen

## TARTALOM MEGŐRZÉSE (NAGYON FONTOS!)
1. Az eredeti tananyag TELJES tartalmát MARADÉKTALANUL őrizd meg
2. NE hagyj ki semmilyen információt
3. BŐVÍTSD ki feladatokkal, kvízekkel, kognitív elemekkel

## MINŐSÉGI KRITÉRIUMOK (v7.1)
✓ Érvényes HTML5 struktúra ✓ 4 oldal ✓ Min. 10 kognitív elem
✓ 45 feladat ✓ 75 kvíz kérdés ✓ IIFE wrapper ✓ Nincs alert()
✓ Touch events ✓ CSS prefix ✓ Reszponzív 320px–2560px`;

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

    // Call AI
    const { ClaudeProvider } = await import('./ai/ClaudeProvider');
    const improveProvider = new ClaudeProvider({
      apiKey: anthropicKey,
      model: 'claude-sonnet-4-20250514',
      timeout: 180000,
      maxTokens: 16384,
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 180000);

    console.log(`[IMPROVE] Job ${jobId}: Calling AI...`);
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
    console.log(`[IMPROVE] Job ${jobId}: AI responded in ${duration}ms`);

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

    // Save to database
    const improvedFile = await storage.createImprovedHtmlFile({
      originalFileId: originalFile.id,
      title: originalFile.title,
      content: improvedHtml,
      description: originalFile.description,
      classroom: originalFile.classroom,
      contentType: originalFile.contentType || 'html',
      improvementPrompt: customPrompt || 'Default improvement',
      status: 'pending',
      createdBy: userId,
    });

    console.log(`[IMPROVE] Job ${jobId}: ✅ Success! Saved: ${improvedFile.id}`);

    // Update job with result
    const existingJob = improvementJobs.get(jobId);
    improvementJobs.set(jobId, {
      status: 'completed',
      fileId: originalFile.id,
      startedAt: existingJob?.startedAt || Date.now(),
      result: {
        improvedFile,
        stats: {
          originalSize: originalFile.content.length,
          improvedSize: improvedHtml.length,
          processingTime: duration,
        }
      }
    });
  } catch (error: any) {
    console.error(`[IMPROVE] Job ${jobId}: Error:`, error.message);

    let userMessage = 'Hiba történt a javítás során';
    if (error.name === 'AbortError' || error.message?.includes('aborted')) {
      userMessage = 'Időtúllépés: Az AI túl sokáig dolgozott (3 perc). Próbáld kisebb fájllal.';
    } else if (error.message?.includes('rate') || error.message?.includes('429')) {
      userMessage = 'Túl sok kérés. Várj egy percet és próbáld újra.';
    } else if (error.message?.includes('credit') || error.message?.includes('balance')) {
      userMessage = 'AI egyenleg probléma.';
    } else if (error.message) {
      userMessage = error.message;
    }

    const existingJob = improvementJobs.get(jobId);
    improvementJobs.set(jobId, {
      status: 'error',
      fileId: originalFile.id,
      startedAt: existingJob?.startedAt || Date.now(),
      error: userMessage,
    });
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

      // Generate job ID and respond IMMEDIATELY (within Vercel's 30s limit)
      const jobId = `imp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      improvementJobs.set(jobId, {
        status: 'processing',
        fileId: id,
        startedAt: Date.now(),
      });

      console.log(`[IMPROVE] Job ${jobId} started for: ${originalFile.title}`);

      // Return immediately
      res.json({ 
        success: true, 
        jobId, 
        status: 'processing',
        message: 'Javítás elindítva' 
      });

      // Process in background (fire-and-forget)
      processImprovementJob(jobId, originalFile, customPrompt, userId, anthropicKey);

    } catch (error: any) {
      console.error('[IMPROVE] Error:', error.message);
      return res.status(500).json({ message: error.message || 'Hiba' });
    }
  });

  // GET /api/admin/improve-material/status/:jobId - Poll job status
  adminRouter.get("/improve-material/status/:jobId", async (req: any, res) => {
    const { jobId } = req.params;
    const job = improvementJobs.get(jobId);

    if (!job) {
      return res.status(404).json({ status: 'not_found', message: 'Job nem található' });
    }

    const elapsed = Math.round((Date.now() - job.startedAt) / 1000);

    if (job.status === 'processing') {
      return res.json({ status: 'processing', elapsed });
    }

    if (job.status === 'completed') {
      improvementJobs.delete(jobId);
      return res.json({ status: 'completed', elapsed, ...job.result });
    }

    if (job.status === 'error') {
      improvementJobs.delete(jobId);
      return res.json({ status: 'error', elapsed, message: job.error });
    }

    res.json({ status: job.status, elapsed });
  });
}
