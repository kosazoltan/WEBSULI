import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import express from "express";
import { csrfSync } from "csrf-sync";
import { storage } from "./storage";
import { insertHtmlFileSchema, insertEmailSubscriptionSchema, insertExtraEmailSchema, insertMaterialCommentSchema, insertImprovedHtmlFileSchema, type EmailSubscription, type User, type HtmlFile, type ImprovedHtmlFile, type MaterialImprovementBackup } from "@shared/schema";
import { fromError } from "zod-validation-error";
import { z } from "zod";
import { sendNewMaterialNotification, sendAdminNotification } from "./resend";
import { sendNewMaterialNotification as sendPushNewMaterial, sendMaterialViewNotification } from "./pushNotifications";
import { getAllAudioBase64 } from "google-tts-api";

import { eq, sql, and, or, ilike, desc, inArray } from "drizzle-orm";
import { htmlFiles, users, emailSubscriptions, extraEmailAddresses, materialComments } from "@shared/schema";
import { sanitizeText, sanitizeHtml, sanitizeEmail, sanitizeUserAgent, sanitizeUrl } from "./utils/sanitize";
// Admin authentication with hardcoded admin emails
import { setupAuth, isAuthenticated, isAuthenticatedAdmin } from "./auth";
// checkIsAdmin import removed

import { db } from "./db";
import { getMaterialPreviewUrl, getBaseUrl } from "./utils/config";
import { triggerEventBackup, listBackups, readBackup, createAutoBackup } from "./autoBackup";

// ========== AI Configuration Validation ==========
function validateAIConfig() {
  const requiredEnvVars = [
    'AI_INTEGRATIONS_OPENAI_API_KEY',
    'AI_INTEGRATIONS_OPENAI_BASE_URL',
    'AI_INTEGRATIONS_ANTHROPIC_API_KEY',
    'AI_INTEGRATIONS_ANTHROPIC_BASE_URL'
  ];

  const missing = requiredEnvVars.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing AI configuration:', missing.join(', '));
    throw new Error(
      `Hiányzó AI konfigurációs változók: ${missing.join(', ')}. ` +
      `Kérlek állítsd be az environment variable-öket.`
    );
  }

  console.log('✅ AI konfiguráció ellenőrizve');
}

// ========== Error Handler Types ==========
interface APIError extends Error {
  status?: number;
  code?: string;
}

// ========== Validation Schemas ==========

// File size validation constants
// 50MB in bytes = 52,428,800 bytes
// Base64 encoding increases size by ~33% (4/3 ratio)
// 100MB PDF → ~133MB base64 → ~140M characters (with safety margin)
const MAX_FILE_SIZE_MB = 100;
const MAX_FILE_SIZE_BYTES = 104_857_600; // 100MB in bytes
const MAX_PDF_BASE64_LENGTH = 140_000_000; // ~140 million characters for 100MB PDF (base64 encoded)

// Bulk operations validation schemas
const bulkDeleteSchema = z.object({
  materialIds: z.array(z.string().uuid()).min(1, "Legalább egy material ID kötelező"),
});

const bulkEmailSchema = z.object({
  materialIds: z.array(z.string().uuid()).min(1, "Legalább egy material ID kötelező"),
  email: z.string().email("Érvényes email cím szükséges"),
});

const bulkMoveSchema = z.object({
  materialIds: z.array(z.string().uuid()).min(1, "Legalább egy material ID kötelező"),
  classroom: z.number().int().min(0).max(12, "Osztály 0 (Programozási alapismeretek) és 12 között kell legyen"),
});

// HTML fix validation schemas
const htmlFixFileIdSchema = z.object({
  fileId: z.string().uuid("Érvényes file ID szükséges"),
  customPrompt: z.string().optional(),
});

const htmlFixApplySchema = z.object({
  fileId: z.string().uuid("Érvényes file ID szükséges"),
  fixedHtml: z.string().min(1, "A javított HTML nem lehet üres"),
});

// AI Enhanced Creator validation schemas
const analyzeFileSchema = z.object({
  fileBase64: z.string().min(1, "Fájl base64 tartalom kötelező"),
  fileName: z.string().min(1, "Fájlnév kötelező"),
  mimeType: z.string().min(1, "MIME type kötelező"),
});

const aiChatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })).min(1, "Legalább egy üzenet kötelező"),
  context: z.string().optional(),
});

// HTML Fix Chat validation schema
const htmlFixChatSchema = z.object({
  fileId: z.string().uuid("Érvényes file ID szükséges"),
  customPrompt: z.string().optional(),
  fixType: z.enum(["responsive", "errors", "theme"], {
    errorMap: () => ({ message: "Érvényes fix type szükséges (responsive, errors, theme)" })
  }),
});

// ========================================

// Utility function to extract classroom number from title
function extractClassroomFromTitle(title: string): number | null {
  // Special case: "Programozási alapismeretek" - return 0 as special identifier
  if (/programoz[aá]si?\s+alapismeretek/i.test(title) || /programoz[aá]s\s+alapok/i.test(title)) {
    return 0;
  }

  // Match classrooms 1-12
  const patterns = [
    /\b([1-9]|1[0-2])\.\s*oszt[aá]ly/i,  // "5. osztály" or "12. osztály"
    /\boszt[aá]ly\s*([1-9]|1[0-2])\b/i,   // "osztály 5" or "osztály 12"
    /\b([1-9]|1[0-2])\s*oszt[aá]ly/i,     // "5 osztály" or "12 osztály"
    /\boszt[aá]ly:\s*([1-9]|1[0-2])\b/i,  // "osztály: 5" or "osztály: 12"
  ];

  for (const pattern of patterns) {
    const match = title.match(pattern);
    if (match) {
      return parseInt(match[1], 10);
    }
  }

  return null;
}

// Utility function to wrap user HTML with responsive container
// Ensures all uploaded HTML materials work across all screen sizes (280px - 1920px+)
// Cross-browser compatible: Opera, Edge (Chromium), Safari (WebKit)
// IMPORTANT: Detects full HTML documents and only injects helper scripts without wrapper duplication
function wrapHtmlWithResponsiveContainer(userHtml: string): string {
  // Check if user HTML is already a complete HTML document
  // More robust detection: DOCTYPE OR (<html> AND <body> tags both present)
  const hasDoctype = /<!DOCTYPE\s+html/i.test(userHtml);
  const hasHtmlTag = /<html[\s>]/i.test(userHtml);
  const hasBodyTag = /<body[\s>]/i.test(userHtml);
  const isFullHtmlDocument = hasDoctype || (hasHtmlTag && hasBodyTag);

  // Sandbox localStorage fix - Prevents DOMException in sandboxed iframes without allow-same-origin
  // CRITICAL: User HTML materials use localStorage for themes, settings, quiz state
  // Without this fix, localStorage.getItem() throws DOMException and STOPS all script execution
  // including DOMContentLoaded listeners that initialize quizzes/exercises
  const sandboxLocalStorageFix = `
    <script>
    // SANDBOX LOCALSTORAGE FIX - Prevents DOMException from blocking quiz/exercise initialization
    // DEFENSIVE: Wrap ENTIRE script in try-catch because window.localStorage GETTER throws in sandboxed iframe
    (function() {
      try {
        var storageCache = {};
        var isLocalStorageBlocked = false;
        
        // Test if localStorage is accessible (property access may throw DOMException)
        try {
          var testAccess = window.localStorage;
          testAccess.getItem('__sandbox_test__');
          // If we get here, localStorage works - no fix needed
          console.log('[SANDBOX FIX] localStorage accessible - no fix needed');
          window.__sandboxLocalStorageFixApplied = false;
          return;
        } catch (e) {
          // Sandboxed iframe detected - localStorage property getter threw DOMException
          isLocalStorageBlocked = true;
          console.warn('[SANDBOX FIX] localStorage blocked - installing in-memory fallback');
        }
        
        if (isLocalStorageBlocked) {
          // Create safe in-memory localStorage shim
          var safeLocalStorage = {
            getItem: function(key) {
              return storageCache[key] || null;
            },
            setItem: function(key, value) {
              storageCache[key] = String(value);
            },
            removeItem: function(key) {
              delete storageCache[key];
            },
            clear: function() {
              storageCache = {};
            },
            get length() {
              return Object.keys(storageCache).length;
            },
            key: function(index) {
              var keys = Object.keys(storageCache);
              return keys[index] || null;
            }
          };
          
          // Override window.localStorage with safe shim (configurable for coexistence with other polyfills)
          try {
            Object.defineProperty(window, 'localStorage', {
              get: function() { return safeLocalStorage; },
              configurable: true
            });
            console.log('[SANDBOX FIX] localStorage override successful');
            window.__sandboxLocalStorageFixApplied = true;
          } catch (e) {
            // Fallback: direct assignment (less reliable but better than nothing)
            console.warn('[SANDBOX FIX] defineProperty failed, using direct assignment');
            window.localStorage = safeLocalStorage;
            window.__sandboxLocalStorageFixApplied = true;
          }
        }
      } catch (e) {
        console.error('[SANDBOX FIX] Critical error - localStorage fix failed:', e);
        window.__sandboxLocalStorageFixApplied = false;
      }
    })();
    </script>`;

  // Global sendResultEmail() function script to inject
  const globalEmailScript = `
    <script>
    /**
     * GLOBÁLIS EMAIL KÜLDŐ FÜGGVÉNY - Tananyagok használhatják!
     * 
     * Megnyitja a tanuló saját email programját (Gmail, Outlook, stb.)
     * a megadott tárggyal és üzenettel, címzettek: minden admin
     * 
     * Használat a tananyagban:
     *   <button onclick="sendResultEmail('Teszt eredmény', 'Pontszám: 95%')">
     *     Eredmény küldése
     *   </button>
     * 
     * @param {string} subject - Email tárgya (pl. "Teszt eredmény")
     * @param {string} body - Email törzse (pl. "Név: János\\nPontszám: 95%")
     */
    if (typeof window.sendResultEmail === 'undefined') {
      window.sendResultEmail = function(subject, body) {
        // Email címzettek (minden admin, vesszővel elválasztva)
        var recipients = 'kosa.zoltan.ebc@gmail.com,mszilva78@gmail.com';
        
        // URL encode a tárgy és üzenet (szóközök, ékezetes betűk, speciális karakterek kezelése)
        var encodedSubject = encodeURIComponent(subject || 'Tananyag eredmény');
        var encodedBody = encodeURIComponent(body || '');
        
        // Mailto link összeállítása (több címzett vesszővel elválasztva)
        var mailtoLink = 'mailto:' + recipients + 
                        '?subject=' + encodedSubject + 
                        '&body=' + encodedBody;
        
        // Email program megnyitása
        window.location.href = mailtoLink;
        
        // Visszajelzés a tanulónak (opcionális)
        console.log('📧 Email program megnyitva:', {
          címzettek: recipients,
          tárgy: subject,
          üzenet: body
        });
      };
      
      window.sendResultEmailTo = function(to, subject, body) {
        var recipient = to || 'kosa.zoltan.ebc@gmail.com,mszilva78@gmail.com';
        var encodedSubject = encodeURIComponent(subject || 'Tananyag eredmény');
        var encodedBody = encodeURIComponent(body || '');
        var mailtoLink = 'mailto:' + recipient + '?subject=' + encodedSubject + '&body=' + encodedBody;
        window.location.href = mailtoLink;
      };
    }
    </script>`;

  // If user uploaded a complete HTML document, inject scripts strategically
  // This prevents HTML structure duplication (no more double <html>, <body>, etc.)
  if (isFullHtmlDocument) {
    // CRITICAL: sandboxLocalStorageFix MUST run EARLY (before ANY user scripts)
    // Inject it RIGHT AFTER <head> opening tag to prevent DOMException
    const headOpenIndex = userHtml.toLowerCase().indexOf('<head>');
    let htmlWithFix = userHtml;

    if (headOpenIndex !== -1) {
      const insertPosition = headOpenIndex + '<head>'.length;
      htmlWithFix = userHtml.slice(0, insertPosition) + sandboxLocalStorageFix + userHtml.slice(insertPosition);
    } else {
      // No <head> found - create one and inject fix
      const htmlTagIndex = userHtml.toLowerCase().indexOf('<html');
      if (htmlTagIndex !== -1) {
        const htmlTagEnd = userHtml.indexOf('>', htmlTagIndex) + 1;
        htmlWithFix = userHtml.slice(0, htmlTagEnd) + '<head>' + sandboxLocalStorageFix + '</head>' + userHtml.slice(htmlTagEnd);
      }
    }

    // CSP meta tag to allow inline event handlers (onclick, oninput, etc.) in user HTML
    // CRITICAL: connect-src allows HTTPS APIs but blocks 'self' (no /api/* calls, prevents OAuth triggers)
    const cspMetaTag = `
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' data: 'unsafe-inline' 'unsafe-eval'; script-src-attr 'unsafe-inline'; style-src 'self' data: 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src https: data:; media-src 'self' data: blob:; object-src 'self';">`;

    // Inject CSP meta tag into <head> section (AFTER localStorage fix)
    const headCloseIndex = htmlWithFix.toLowerCase().indexOf('</head>');
    let htmlWithCSP = htmlWithFix;

    if (headCloseIndex !== -1) {
      // Insert CSP meta tag before </head>
      htmlWithCSP = htmlWithFix.slice(0, headCloseIndex) + cspMetaTag + htmlWithFix.slice(headCloseIndex);
    } else {
      // No </head> found - try to insert after localStorage fix
      const fixEndIndex = htmlWithFix.indexOf('</script>', htmlWithFix.indexOf('SANDBOX LOCALSTORAGE FIX'));
      if (fixEndIndex !== -1) {
        const insertPosition = fixEndIndex + '</script>'.length;
        htmlWithCSP = htmlWithFix.slice(0, insertPosition) + cspMetaTag + htmlWithFix.slice(insertPosition);
      }
    }

    // Inject globalEmailScript before </body> (load order: fix → CSP → user scripts → email script)
    const bodyCloseIndex = htmlWithCSP.toLowerCase().lastIndexOf('</body>');
    if (bodyCloseIndex !== -1) {
      return htmlWithCSP.slice(0, bodyCloseIndex) + globalEmailScript + htmlWithCSP.slice(bodyCloseIndex);
    }
    // Fallback: if no </body> found, append at the end
    return htmlWithCSP + globalEmailScript;
  }

  // If user HTML is just a fragment (no full HTML structure), wrap it
  return `<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="format-detection" content="telephone=no">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' data: 'unsafe-inline' 'unsafe-eval'; script-src-attr 'unsafe-inline'; style-src 'self' data: 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src https: data:; media-src 'self' data: blob:; object-src 'self';">
  <style>
    /* Global responsive reset for all uploaded HTML content */
    /* Cross-browser compatibility: Opera, Edge, Safari, Samsung Z Fold */
    * {
      box-sizing: border-box;
      -webkit-box-sizing: border-box; /* Safari */
    }
    
    html {
      font-size: 16px; /* Safari fallback for clamp() */
      -webkit-text-size-adjust: 100%;
      -moz-text-size-adjust: 100%;
      -ms-text-size-adjust: 100%;
      text-size-adjust: 100%;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      /* Support for foldable devices */
      height: 100%;
      width: 100%;
    }
    
    body {
      margin: 0;
      padding: 0;
      width: 100%;
      min-height: 100vh;
      overflow-x: hidden;
      line-height: 1.6;
      word-wrap: break-word;
      overflow-wrap: break-word;
      -webkit-overflow-scrolling: touch; /* Safari smooth scrolling */
      /* Support for foldable devices - use full viewport */
      min-height: -webkit-fill-available; /* iOS Safari */
    }
    
    /* Responsive images and media */
    img, video, iframe, embed, object {
      max-width: 100%;
      height: auto;
      display: block;
    }
    
    /* Responsive tables for Safari/WebKit/Opera/Edge */
    /* Preserves native table semantics for accessibility */
    table {
      max-width: 100%;
      border-collapse: collapse;
    }
    
    /* Table wrapper for horizontal scrolling (added by script) */
    .table-scroll-wrapper {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch; /* Safari smooth scrolling */
      margin: 1rem 0;
    }
    
    /* Prevent horizontal overflow */
    pre, code {
      max-width: 100%;
      overflow-x: auto;
      white-space: pre-wrap;
      word-break: break-word;
    }
    
    /* Responsive container - optimized for all screen sizes */
    .responsive-container {
      width: 100%;
      max-width: 100%;
      padding: 0.5rem; /* Minimal padding to prevent edge overflow */
      margin: 0 auto;
      min-height: 100%;
    }
    
    /* Mobile: minimal padding */
    @media (max-width: 640px) {
      .responsive-container {
        padding: 0.25rem;
      }
    }
    
    /* Tablet: optimized padding */
    @media (min-width: 641px) and (max-width: 1024px) {
      .responsive-container {
        padding: 0.75rem;
      }
    }
    
    /* Samsung Z Fold inner display and large tablets: optimal viewing */
    @media (min-width: 1025px) and (max-width: 1600px) {
      .responsive-container {
        padding: 1rem;
        max-width: 100%;
      }
    }
    
    /* Desktop and ultra-wide: centered with max-width for readability */
    @media (min-width: 1601px) {
      .responsive-container {
        padding: 1.5rem;
        max-width: 1600px; /* Optimal reading width */
        margin: 0 auto;
      }
    }
    
    /* Samsung Z Fold specific optimizations */
    @media (min-width: 1200px) and (max-width: 1800px) and (min-height: 2000px) {
      /* Z Fold inner display: 1768x2208px */
      .responsive-container {
        padding: 1.25rem;
        max-width: 100%;
      }
      
      /* Optimize font sizes for foldable */
      html {
        font-size: clamp(16px, 1.2vw, 18px);
      }
    }
  </style>
</head>
<body>
  <div class="responsive-container">
    ${userHtml}
  </div>
  
  <!-- Responsive enhancements (non-intrusive, only when user CSS doesn't override) -->
  <style>
    /* Minimal responsive fixes - only apply if user hasn't set custom styles */
    /* Removed !important to allow user HTML to work properly with quizzes/exercises */
    
    /* Only prevent horizontal overflow - critical for mobile */
    body {
      overflow-x: hidden;
    }
    
    /* Ensure images don't break layout - only if not already styled */
    img:not([style*="width"]):not([style*="max-width"]), 
    video:not([style*="width"]):not([style*="max-width"]) {
      max-width: 100%;
      height: auto;
    }
  </style>
  
  <!-- Cross-browser table wrapper script (Safari/Opera/Edge compatible) -->
  <script>
    (function() {
      // Wait for DOM to be ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wrapTables);
      } else {
        wrapTables();
      }
      
      function wrapTables() {
        // Find all tables in the responsive container
        var tables = document.querySelectorAll('.responsive-container table');
        
        tables.forEach(function(table) {
          // Skip if already wrapped
          if (table.parentElement.classList.contains('table-scroll-wrapper')) {
            return;
          }
          
          // Create wrapper div
          var wrapper = document.createElement('div');
          wrapper.className = 'table-scroll-wrapper';
          
          // Insert wrapper before table and move table into wrapper
          table.parentNode.insertBefore(wrapper, table);
          wrapper.appendChild(table);
        });
      }
    })();
  </script>
  ${sandboxLocalStorageFix}
  ${globalEmailScript}
</body>
</html>`;
}

// Helper function to apply admin guard to routes
const requireAdmin = (handler: (req: any, res: Response) => Promise<void>) => {
  return [isAuthenticatedAdmin, handler];
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth setup is now handled in index.ts to ensure correct order
  // await setupAuth(app);

  // SECURITY: CSRF Protection using modern csrf-sync library
  // Double Submit Cookie pattern with signed HMAC tokens
  // Double Submit Cookie pattern with signed HMAC tokens
  const { generateToken, csrfSynchronisedProtection } = csrfSync({
    // Use a strong secret for HMAC signing (falls back to SESSION_SECRET if not provided)
    getTokenFromRequest: (req) => {
      // Check for CSRF token in custom header (X-CSRF-Token)
      return req.headers['x-csrf-token'] as string;
    },
  });

  // Apply CSRF protection to ALL mutating requests (POST/PUT/PATCH/DELETE)
  // GET/HEAD/OPTIONS are safe (read-only) and don't need CSRF protection
  app.use((req, res, next) => {
    const method = req.method;
    const path = req.path;

    // Skip CSRF for safe methods (GET, HEAD, OPTIONS)
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return next();
    }

    // Skip CSRF for auth endpoints (OIDC callback needs to work)
    if (path.startsWith('/api/auth/')) {
      return next();
    }

    // Skip CSRF for login/logout endpoints (authentication)
    if (path === '/api/login' || path === '/api/logout') {
      return next();
    }

    // Skip CSRF for AI endpoints (Enhanced Material Creator uses direct API calls)
    // These endpoints have their own authentication checks
    if (path.startsWith('/api/ai/')) {
      return next();
    }

    // Apply CSRF protection to all other mutating requests
    csrfSynchronisedProtection(req, res, next);
  });

  // Validate AI configuration on startup
  try {
    validateAIConfig();
  } catch (error) {
    console.error('Failed to validate AI configuration:', error);
    // Continue anyway but log warning
  }

  // Create admin router with authentication middleware
  const adminRouter = express.Router();

  // Auth endpoint - Get current user session
  // PUBLIC endpoint - Returns user data if authenticated, null if not
  app.get('/api/auth/user', async (req: any, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.json(null);
      }

      // Try to find user by email (primary lookup) since upsertUser may update
      // existing users by email without changing their ID
      const userEmail = req.user.email;
      let user = await storage.getUserByEmail(userEmail);

      // Fallback to ID lookup if email lookup fails
      if (!user) {
        const userId = req.user.id;
        user = await storage.getUser(userId) || null;
      }

      if (!user) {
        console.warn('[AUTH] User not found after OIDC login:', userEmail);
        return res.json(null);
      }

      // Return user with admin status (convert undefined to null for type safety)
      res.json({
        ...user,
        isAdmin: !!user.isAdmin,
      });
    } catch (error) {
      console.error("[AUTH] Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // SECURITY: CSRF Token Endpoint
  // Frontend fetches this token and includes it in all mutating requests (POST/PUT/DELETE)
  app.get('/api/csrf-token', (req: any, res) => {
    const csrfToken = generateToken(req);
    res.json({ csrfToken });
  });

  // HEALTH CHECK endpoint - Fast response for Autoscale deployment health checks
  // No database or heavy operations - just confirms server is running
  app.get('/api/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: Date.now(),
      uptime: process.uptime()
    });
  });

  // Also respond to root health check (some load balancers use this)
  app.get('/health', (_req, res) => {
    res.status(200).send('OK');
  });

  // PUBLIC endpoint - Get base URL configuration
  // Frontend needs this to construct correct URLs
  app.get('/api/config', (_req, res) => {
    res.json({
      baseUrl: getBaseUrl(),
      environment: process.env.NODE_ENV || 'development',
    });
  });

  // PUBLIC endpoint - Get VAPID public key for push notifications
  app.get('/api/push/vapid-public-key', (req, res) => {
    const publicKey = process.env.PUBLIC_VAPID_KEY;
    if (!publicKey) {
      return res.status(503).json({
        message: 'Push notifications are not configured'
      });
    }
    res.json({ publicKey });
  });

  // HTML Fix Tools - Public access (no authentication required)
  // 1. Fix Responsive - Apply responsive wrapper to HTML
  adminRouter.post("/html-fix/responsive", async (req, res) => {
    try {
      const result = htmlFixFileIdSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          message: fromError(result.error).toString()
        });
      }

      const { fileId } = result.data;
      const file = await storage.getHtmlFile(fileId);
      if (!file) {
        return res.status(404).json({ message: "Fájl nem található" });
      }

      // Simply return success - the wrapHtmlWithResponsiveContainer is already applied in /dev/:id
      res.json({
        message: "A responsive wrapper már alkalmazva van az összes fájlra a rendereléskor",
        success: true
      });
    } catch (error: any) {
      console.error('Responsive fix error:', error);
      res.status(500).json({ message: 'Hiba történt', error: error.message });
    }
  });

  // 2. Fix Errors - Analyze and fix HTML errors with AI
  adminRouter.post("/html-fix/errors", async (req, res) => {
    try {
      const result = htmlFixFileIdSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          message: fromError(result.error).toString()
        });
      }

      const { fileId, customPrompt } = result.data;
      const file = await storage.getHtmlFile(fileId);
      if (!file) {
        return res.status(404).json({ message: "Fájl nem található" });
      }

      // Use Claude (Anthropic) to analyze and fix HTML errors
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const anthropic = new Anthropic({
        apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      });

      // Build system prompt with optional custom instructions
      let systemPrompt = `Te egy HTML hibakereső és javító szakértő vagy. Elemezd a megadott HTML kódot és javítsd ki a talált hibákat:
- Szintaxis hibák (nem bezárt tagek, rossz attribútumok)
- Szemantikai hibák (rossz elem használat)
- Hozzáférhetőségi hibák (hiányzó alt szövegek, ARIA attribútumok)
- Biztonsági hibák (XSS, injection vulnerabilities)`;

      if (customPrompt && customPrompt.trim()) {
        systemPrompt += `\n\nEGYEDI FELHASZNÁLÓI UTASÍTÁSOK:\n${customPrompt.trim()}`;
      }

      systemPrompt += `\n\nFONTOS: A választ KIZÁRÓLAG JSON formátumban add vissza, a következő struktúrával:
{
  "fixedHtml": "a javított HTML kód",
  "errors": [
    {
      "type": "hiba típusa",
      "description": "hiba leírása",
      "fixed": true
    }
  ]
}`;

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Javítsd ki ezt a HTML fájlt és add vissza JSON formátumban:\n\n${file.content}`
          }
        ]
      });

      let responseText = message.content[0].type === 'text' ? message.content[0].text : '{}';

      // Remove markdown code fences if Claude wrapped JSON in ```json ... ```
      responseText = responseText.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();

      const jsonResult = JSON.parse(responseText);

      res.json({
        originalHtml: file.content,
        fixedHtml: jsonResult.fixedHtml,
        errors: jsonResult.errors,
        success: true
      });
    } catch (error: any) {
      console.error('HTML fix error:', error);
      res.status(500).json({ message: 'Hiba történt az elemzés során', error: error.message });
    }
  });

  // 3. Fix Theme - Apply website color scheme to HTML
  adminRouter.post("/html-fix/theme", async (req, res) => {
    try {
      const result = htmlFixFileIdSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          message: fromError(result.error).toString()
        });
      }

      const { fileId, customPrompt } = result.data;
      const file = await storage.getHtmlFile(fileId);
      if (!file) {
        return res.status(404).json({ message: "Fájl nem található" });
      }

      // Use Claude (Anthropic) to apply theme colors
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const anthropic = new Anthropic({
        apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      });

      // Build system prompt with optional custom instructions
      let systemPrompt = `Te egy webdesign szakértő vagy. A megadott HTML fájlt át kell alakítanod, hogy illeszkedjen egy oktatási platform Android 16 Material You design színsémájához:

**Színpaletta:**
- Elsődleges szín: kék (#3B82F6, #2563EB)
- Háttér: fehér (#FFFFFF) vagy világos szürke (#F9FAFB)
- Szöveg: sötét szürke (#1F2937)
- Másodlagos szöveg: világosabb szürke (#6B7280)
- Hangsúlyos elemek: rózsaszín (#EC4899)
- Pasztell gradiens háttér: rózsaszín-kék átmenet

**Alkalmazandó elvek:**
- Modern, letisztult Material You stílus
- Pasztell színátmenetek használata háttéreknél
- Kerekített sarkok (border-radius: 12-16px)
- Finom árnyékok
- Tiszta tipográfia (Poppins, Inter)`;

      if (customPrompt && customPrompt.trim()) {
        systemPrompt += `\n\nEGYEDI FELHASZNÁLÓI UTASÍTÁSOK:\n${customPrompt.trim()}`;
      }

      systemPrompt += `\n\nFONTOS: A választ KIZÁRÓLAG JSON formátumban add vissza, a következő struktúrával:
{
  "themedHtml": "a módosított HTML kód",
  "changes": [
    {
      "element": "elem neve",
      "change": "változás leírása"
    }
  ]
}`;

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Alakítsd át ezt a HTML fájlt a megadott színsémára és add vissza JSON formátumban:\n\n${file.content}`
          }
        ]
      });

      let responseText = message.content[0].type === 'text' ? message.content[0].text : '{}';

      // Remove markdown code fences if Claude wrapped JSON in ```json ... ```
      responseText = responseText.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();

      const jsonResult = JSON.parse(responseText);

      res.json({
        originalHtml: file.content,
        themedHtml: jsonResult.themedHtml,
        changes: jsonResult.changes,
        success: true
      });
    } catch (error: any) {
      console.error('Theme fix error:', error);
      res.status(500).json({ message: 'Hiba történt a színséma alkalmazása során', error: error.message });
    }
  });

  // 4. HTML Fix Chat Stream - Interactive streaming endpoint (OpenAI-compatible)
  adminRouter.post("/html-fix/chat", async (req, res) => {
    try {
      const result = htmlFixChatSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          message: fromError(result.error).toString()
        });
      }

      const { fileId, customPrompt, fixType } = result.data;
      const file = await storage.getHtmlFile(fileId);
      if (!file) {
        return res.status(404).json({ message: "Fájl nem található" });
      }

      // Setup SSE (Server-Sent Events) for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Use OpenAI API for streaming chat
      const OpenAI = (await import('openai')).default;
      const {
        htmlErrorsResponseSchema,
        themeResponseSchema,
        responsiveResponseSchema
      } = await import('./aiSchemas');

      const openai = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
      });

      // ✨ Load system prompt from database
      const { systemPrompts } = await import('@shared/schema');
      const [customSystemPrompt] = await db
        .select()
        .from(systemPrompts)
        .where(and(
          eq(systemPrompts.id, 'html_fixer'),
          eq(systemPrompts.isActive, true)
        ))
        .limit(1);

      // Select appropriate schema based on fix type
      type FixResult = z.infer<typeof htmlErrorsResponseSchema> | z.infer<typeof themeResponseSchema> | z.infer<typeof responsiveResponseSchema>;
      let zodSchema: z.ZodType<FixResult> = htmlErrorsResponseSchema; // Default to errors schema
      let taskDescription = '';
      let systemPrompt = '';

      // Use custom system prompt from DB as base, or fallback to default
      const baseSystemPrompt = customSystemPrompt?.prompt || '';

      if (fixType === 'responsive') {
        zodSchema = responsiveResponseSchema;
        taskDescription = 'responsive wrapper ellenőrzését és javítását';
        systemPrompt = baseSystemPrompt || `Te egy HTML responsive design szakértő vagy. 

FELADAT: Ellenőrizd a HTML kódot és javítsd ki a responsive problémákat (280px - 1920px+ szélesség).

LÉPÉSEK:
1. Elemezd a HTML szerkezetét
2. Azonosítsd a responsive problémákat (layout, viewport, képek, betűk)
3. Magyarázd el, mit fogsz javítani
4. Alkalmazd a javításokat`;
      } else if (fixType === 'errors') {
        zodSchema = htmlErrorsResponseSchema;
        taskDescription = 'HTML hibák elemzését és javítását';
        systemPrompt = baseSystemPrompt || `Te egy HTML hibakereső és javító szakértő vagy.

FELADAT: Elemezd a HTML kódot és javítsd ki az összes hibát.

HIBA TÍPUSOK:
- syntax: Nem bezárt tagek, rossz attribútumok
- semantic: Rossz elem használat, strukturális hibák
- accessibility: Hiányzó alt szövegek, ARIA attribútumok
- security: XSS, injection sérülékenységek
- other: Egyéb problémák

LÉPÉSEK:
1. Sorolj fel minden hibát típus szerint
2. Magyarázd el, hogyan fogod javítani
3. Alkalmazd a javításokat`;
      } else if (fixType === 'theme') {
        zodSchema = themeResponseSchema;
        taskDescription = 'színséma alkalmazását';
        systemPrompt = baseSystemPrompt || `Te egy webdesign szakértő vagy.

FELADAT: Alakítsd át a HTML-t, hogy illeszkedjen az oktatási platform Material You design színsémájához.

SZÍNPALETTA:
- Elsődleges: kék (#3B82F6, #2563EB)
- Háttér: fehér (#FFFFFF) vagy világos szürke (#F9FAFB)
- Szöveg: sötét szürke (#1F2937)
- Másodlagos szöveg: világosabb szürke (#6B7280)
- Hangsúly: rózsaszín (#EC4899)
- Gradiens: rózsaszín-kék átmenet

LÉPÉSEK:
1. Elemezd a jelenlegi színeket és stílusokat
2. Tervezd meg az új színsémát
3. Magyarázd el a változtatásokat
4. Alkalmazd a Material You design-t`;
      }

      if (customPrompt && customPrompt.trim()) {
        systemPrompt += `\n\nEGYEDI UTASÍTÁSOK:\n${customPrompt.trim()}`;
      }

      systemPrompt += `\n\nFONTOS: A válaszod két részből áll:
1. MAGYARÁZAT (szabad szöveg): Részletezd lépésről lépésre, mit csinálsz
2. STRUKTURÁLT KIMENET (JSON): A végső eredmény automatikusan generálódik - NE próbáld manuálisan beágyazni!

Csak a magyarázatot írd, a JSON automatikusan a végére kerül.`;

      // Send initial message
      res.write(`data: ${JSON.stringify({
        type: 'start',
        message: `🤖 AI elindítja a ${taskDescription}...`
      })}\n\n`);

      // TWO-PHASE APPROACH with OpenAI:
      // Phase 1: Stream explanatory text for UX
      // Phase 2: Structured JSON call with response_format

      // PHASE 1: Streaming explanation
      const explanationPrompt = `${systemPrompt}\n\nElemezd ezt a HTML fájlt és magyarázd el, mit fogsz javítani (csak magyarázat, ne JSON):\n\n${file.content.substring(0, 3000)}...`;

      const explanationStream = await openai.chat.completions.create({
        model: "gpt-5", // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: explanationPrompt }],
        max_completion_tokens: 2048,
        stream: true,
      });

      let explanationText = '';

      for await (const chunk of explanationStream) {
        const content = chunk.choices[0]?.delta?.content;
        if (content) {
          explanationText += content;
          res.write(`data: ${JSON.stringify({
            type: 'content',
            text: content
          })}\n\n`);
        }
      }

      // Send intermediate message
      res.write(`data: ${JSON.stringify({
        type: 'content',
        text: '\n\n🔧 Javítások alkalmazása...\n\n'
      })}\n\n`);

      // PHASE 2: Structured JSON call with response_format
      const structuredPrompt = `${systemPrompt}\n\nJavítsd ki ezt a HTML fájlt és add vissza JSON formátumban:\n\n${file.content}`;

      const structuredResponse = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [{ role: "user", content: structuredPrompt }],
        max_completion_tokens: 4096,
        response_format: { type: "json_object" }
      });

      // Extract and validate JSON from response
      let validatedResult: FixResult | null = null;
      let rawJsonResponse = '';

      try {
        const responseText = structuredResponse.choices[0]?.message?.content || '{}';
        rawJsonResponse = responseText;

        // Try to extract JSON with multiple strategies
        let cleanedJson = responseText.trim();

        // Strategy 1: Remove markdown code fences
        cleanedJson = cleanedJson.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();

        // Strategy 2: Find JSON object between curly braces
        const jsonMatch = cleanedJson.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleanedJson = jsonMatch[0];
        }

        // Parse JSON
        const jsonResult = JSON.parse(cleanedJson);

        // Validate with Zod schema
        validatedResult = zodSchema.parse(jsonResult);

        console.log('[AI FIX] ✅ JSON successfully validated:', validatedResult ? Object.keys(validatedResult) : 'null');

        // Send completion with VALIDATED JSON
        res.write(`data: ${JSON.stringify({
          type: 'complete',
          message: '✅ Claude befejezte az elemzést!',
          fullResponse: explanationText,
          validatedJson: validatedResult
        })}\n\n`);

      } catch (parseError: any) {
        console.error('[AI FIX] ❌ JSON parsing/validation failed:', parseError.message);
        console.error('[AI FIX] Raw JSON response:', rawJsonResponse.substring(0, 500));

        // Fallback: send raw response with detailed error
        res.write(`data: ${JSON.stringify({
          type: 'complete',
          message: '⚠️ Claude befejezte, de a JSON validálás sikertelen',
          fullResponse: explanationText + '\n\n' + rawJsonResponse,
          parseError: parseError.message,
          validatedJson: null
        })}\n\n`);
      }

      res.end();
    } catch (error: any) {
      console.error('HTML fix chat error:', error);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: error.message || 'Hiba történt az elemzés során'
      })}\n\n`);
      res.end();
    }
  });

  // 5. Apply fix - Update file with fixed HTML
  adminRouter.post("/html-fix/apply", async (req, res) => {
    try {
      const result = htmlFixApplySchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          message: fromError(result.error).toString()
        });
      }

      const { fileId, fixedHtml } = result.data;
      const file = await storage.getHtmlFile(fileId);
      if (!file) {
        return res.status(404).json({ message: "Fájl nem található" });
      }

      // Update file content directly in database (bypass updateHtmlFile as it doesn't support content updates)

      await db
        .update(htmlFiles)
        .set({ content: fixedHtml })
        .where(eq(htmlFiles.id, fileId));

      res.json({
        message: "A javított HTML sikeresen alkalmazva",
        success: true
      });
    } catch (error: any) {
      console.error('Apply fix error:', error);
      res.status(500).json({ message: 'Hiba történt a javítás alkalmazása során', error: error.message });
    }
  });

  // 6. Material Creator Chat Stream - Claude-based conversational material creation
  adminRouter.post("/material-creator/chat", async (req, res) => {
    try {
      const { message, conversationHistory, title, description, classroom } = req.body;

      if (!message || !message.trim()) {
        return res.status(400).json({ message: "Üzenet megadása kötelező" });
      }

      // Setup SSE (Server-Sent Events) for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Using Claude (Anthropic) API
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const anthropic = new Anthropic({
        apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      });

      // Build conversation history for Claude
      const messages: Array<{ role: 'user' | 'assistant', content: string }> = conversationHistory && Array.isArray(conversationHistory)
        ? conversationHistory
          .filter((msg: any) => msg.role !== 'system')
          .map((msg: any) => ({
            role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: msg.content
          }))
        : [];

      // Add current user message
      messages.push({
        role: 'user' as const,
        content: message
      });

      // ✨ Load system prompt from database
      const { systemPrompts } = await import('@shared/schema');
      const [customPrompt] = await db
        .select()
        .from(systemPrompts)
        .where(and(
          eq(systemPrompts.id, 'material_creator'),
          eq(systemPrompts.isActive, true)
        ))
        .limit(1);

      // Default system prompt (fallback if not in DB)
      const defaultSystemPrompt = `Te Claude vagy, egy lelkes oktatási anyag készítő asszisztens, aki interaktív HTML tananyagokat készít gyerekeknek.

FELADATOD:
1. Beszélgess a felhasználóval és segíts neki tananyagot tervezni
2. Kérdezz rá a részletekre (téma, osztály, tartalom, interaktivitás)
3. Ha elég információd van, készíts el egy TELJES, MŰKÖDŐ HTML fájlt
4. Az elkészült HTML-t MINDIG kezdd a következő sorral: "<!-- HTML_START -->"

METADATA:
${title ? `- Cím: ${title}` : '- Cím: még nincs'}
${description ? `- Leírás: ${description}` : ''}
${classroom ? `- Osztály: ${classroom}. osztály` : '- Osztály: még nincs megadva'}

HTML KÖVETELMÉNYEK ha generálsz:
- Kezd: <!-- HTML_START -->
- Használj Material You design színeket (kék: #3B82F6, rózsaszín: #EC4899)
- Responsive design (280px - 1920px+)
- Interaktív elemek (kérdések, kvízek, animációk)
- Magyar nyelvű tartalom
- Gyerekbarát, színes, vonzó design
- Kompletten működő kód (CSS, JS beágyazva)

BESZÉLGETÉSI STÍLUS:
- Barátságos, támogató, lelkes
- Kérdezz rá minden részletre
- Ha készen van a HTML, jelezd!

PÉLDA INTERAKCIÓ:
Felhasználó: "Szeretnék egy matematika tananyagot készíteni"
Te: "Remek! 🎉 Milyen osztálynak szeretnéd? És mi lenne a konkrét téma? Például: összeadás, szorzótábla, geometria?"

Felhasználó: "2. osztály, összeadás 20-ig"
Te: "Szuper! Szeretnél interaktív feladatokat is? Például gyakorló kvízt, ahol a gyerekek kattintással válaszolhatnak?"

Felhasználó: "Igen, készíts kvízt!"
Te: "Rendben, elkészítem! 🚀 Lesz benne:
- Színes elmagyarázás
- Gyakorló feladatok
- Interaktív kvíz
- Jutalmazó rendszer

Készítem a HTML-t..."

<!-- HTML_START -->
<!DOCTYPE html>
...
`;

      // Use custom prompt from DB or fallback to default
      let systemPrompt = customPrompt?.prompt || defaultSystemPrompt;

      // Append metadata to system prompt
      systemPrompt += `\n\nMETADATA:
${title ? `- Cím: ${title}` : '- Cím: még nincs'}
${description ? `- Leírás: ${description}` : ''}
${classroom ? `- Osztály: ${classroom}. osztály` : '- Osztály: még nincs megadva'}`;

      // Send initial message
      res.write(`data: ${JSON.stringify({
        type: 'start',
        message: '🤖 Claude csatlakozott...'
      })}\n\n`);

      // Stream Claude's response
      const stream = anthropic.messages.stream({
        model: "claude-sonnet-4-5",
        max_tokens: 8192, // Larger for full HTML generation
        system: systemPrompt,
        messages: messages
      });

      let fullContent = '';
      let htmlContent = '';
      let isCollectingHtml = false;

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          const text = event.delta.text;
          fullContent += text;

          // Check if HTML generation started
          if (fullContent.includes('<!-- HTML_START -->')) {
            isCollectingHtml = true;
            // Extract HTML from the marker onwards
            const htmlStartIndex = fullContent.indexOf('<!-- HTML_START -->');
            htmlContent = fullContent.substring(htmlStartIndex);
          }

          // Stream content to frontend
          res.write(`data: ${JSON.stringify({
            type: 'content_delta',
            content: text
          })}\n\n`);
        }
      }

      // If HTML was generated, send it separately
      if (isCollectingHtml && htmlContent.length > 100) {
        // Clean HTML (remove the marker)
        const cleanHtml = htmlContent.replace('<!-- HTML_START -->', '').trim();

        res.write(`data: ${JSON.stringify({
          type: 'html_generated',
          html: cleanHtml
        })}\n\n`);

        console.log(`[MATERIAL CREATOR] ✅ HTML generated (${cleanHtml.length} chars)`);
      }

      // Send completion
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        message: '✅ Claude befejezte'
      })}\n\n`);

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error: any) {
      console.error('Material creator chat error:', error);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: error.message || 'Hiba történt a beszélgetés során'
      })}\n\n`);
      res.end();
    }
  });

  // ========== ENHANCED MATERIAL CREATOR ENDPOINTS (Public access - no authentication required) ==========

  // Phase 1: ChatGPT Multiple Files Analysis (PDF/JPG with Vision API)
  app.post("/api/ai/enhanced-creator/analyze-files", async (req, res) => {
    try {
      const { files } = req.body;

      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ message: "Legalább egy fájl megadása kötelező" });
      }

      // Validate file types
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'text/html', 'text/plain', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      for (const file of files) {
        if (!file.fileData || !file.fileType) {
          return res.status(400).json({ message: "Minden fájlnak tartalmaznia kell fileData és fileType mezőt" });
        }
        if (!allowedTypes.includes(file.fileType)) {
          return res.status(400).json({
            message: "Csak PDF, DOC, DOCX, TXT és JPG/PNG fájlok támogatottak"
          });
        }
      }

      const OpenAI = (await import('openai')).default;

      const openai = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        timeout: 180000 // 180 seconds (3 minutes) for multiple file processing
      });

      console.log(`[FILE ANALYSIS] Analyzing ${files.length} files`);

      // Build content array with all images
      const content: any[] = [
        {
          type: "text",
          text: `Elemezd ezeket a ${files.length} dokumentumot/képet és készíts belőlük egyetlen oktatási anyagot.
          
FELADATOD:
1. Olvasd ki MINDEN fájlból az összes szöveget és releváns információt
2. Kombináld őket egyetlen koherens tananyaggá
3. Azonosítsd a közös témákat és kapcsolódási pontokat
4. Javasolj egy átfogó címet, leírást és osztályt (1-8)

VÁLASZOLJ JSON formátumban a következő struktúrával:
- extractedText: Az összes fájlból kinyert összesített szöveg
- suggestedTitle: Átfogó cím az összes tartalom alapján
- suggestedDescription: Leírás, ami összefoglalja az összes fájl tartalmát
- suggestedClassroom: Javasolt osztály (1-8) a teljes anyag nehézsége alapján
- topics: Fő témák listája az összes dokumentumból`
        }
      ];

      // Add all files (images as image_url, DOCX HTML as text, TXT as text)
      for (const file of files) {
        if (file.fileType === 'text/html') {
          // DOCX converted to HTML - add as text content
          content.push({
            type: "text",
            text: `DOCX fájl tartalma (${file.fileName}):\n\n${file.fileData}`
          });
        } else if (file.fileType === 'text/plain') {
          // TXT file or direct text input - add as text content
          content.push({
            type: "text",
            text: `Szöveges tartalom (${file.fileName}):\n\n${file.fileData}`
          });
        } else {
          // Images (including PDF→PNG conversions) - add as image_url
          content.push({
            type: "image_url",
            image_url: {
              url: file.fileData, // Base64 data URL
              detail: "high" // High detail for better text recognition
            }
          });
        }
      }

      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: `Te egy oktatási anyag elemző szakértő vagy. Elemezd a dokumentumokat és adj vissza strukturált információt JSON formátumban.`
          },
          {
            role: "user",
            content
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "file_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                extractedText: {
                  type: "string",
                  description: "Az összes dokumentumból kinyert teljes szöveg tartalom"
                },
                suggestedTitle: {
                  type: "string",
                  description: "Javasolt tananyag cím az összes tartalom alapján"
                },
                suggestedDescription: {
                  type: "string",
                  description: "Javasolt leírás, ami összefoglalja az összes fájl tartalmát"
                },
                suggestedClassroom: {
                  type: "number",
                  description: "Javasolt osztály (1-8) az összesített tartalom nehézsége alapján"
                },
                topics: {
                  type: "array",
                  items: { type: "string" },
                  description: "Fő témák listája az összes dokumentumból"
                }
              },
              required: ["extractedText", "suggestedTitle", "suggestedDescription", "suggestedClassroom", "topics"],
              additionalProperties: false
            }
          }
        },
        max_completion_tokens: 8192 // Increased for multiple files
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      console.log(`[FILE ANALYSIS] ✅ Analysis complete: ${files.length} files processed, ${result.topics?.length || 0} topics found`);

      res.json({
        success: true,
        analysis: result
      });

    } catch (error: any) {
      console.error('[FILE ANALYSIS] Error:', error);
      res.status(500).json({
        message: error.message || 'Hiba történt a fájlok elemzése során'
      });
    }
  });

  // Phase 1: ChatGPT Single File Analysis (PDF/JPG with Vision API) - LEGACY, kept for backwards compatibility
  app.post("/api/ai/enhanced-creator/analyze-file", async (req, res) => {
    try {
      const { fileData, fileType, fileName } = req.body;

      if (!fileData || !fileType) {
        return res.status(400).json({ message: "Fájl adat és típus megadása kötelező" });
      }

      // Validate file type (PDF or images)
      // Note: PDFs are converted to PNG on frontend before sending
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
      if (!allowedTypes.includes(fileType)) {
        return res.status(400).json({
          message: "Csak PDF és JPG/PNG fájlok támogatottak"
        });
      }

      const OpenAI = (await import('openai')).default;
      const { chatGptFileAnalysisSchema } = await import('./aiSchemas');

      const openai = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
      });

      console.log(`[FILE ANALYSIS] Analyzing ${fileType} file: ${fileName || 'unknown'}`);

      // OpenAI Vision API: send image as base64 data URL
      // For PDFs: frontend converts first page to PNG before sending
      const content: any[] = [
        {
          type: "text",
          text: fileType === 'application/pdf'
            ? "Elemezd ezt a PDF első oldalát (PNG-ként konvertálva) és készíts belőle oktatási anyagot. Olvasd ki az összes szöveget, azonosítsd a témákat, és javasold a címet, leírást és osztályt (1-8)."
            : "Elemezd ezt a képet és készíts belőle oktatási anyagot. Olvasd ki az összes szöveget, azonosítsd a témákat, és javasold a címet, leírást és osztályt (1-8)."
        },
        {
          type: "image_url",
          image_url: {
            url: fileData, // Base64 data URL (PNG for PDFs, original for images)
            detail: "high" // High detail for better text recognition
          }
        }
      ];

      const response = await openai.chat.completions.create({
        model: "gpt-5",
        messages: [
          {
            role: "system",
            content: `Te egy oktatási anyag elemző szakértő vagy. Elemezd a dokumentumot és adj vissza strukturált információt JSON formátumban.`
          },
          {
            role: "user",
            content
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "file_analysis",
            strict: true,
            schema: {
              type: "object",
              properties: {
                extractedText: {
                  type: "string",
                  description: "A dokumentumból kinyert teljes szöveg tartalom"
                },
                suggestedTitle: {
                  type: "string",
                  description: "Javasolt tananyag cím a tartalom alapján"
                },
                suggestedDescription: {
                  type: "string",
                  description: "Javasolt leírás, ami összefoglalja a tartalmat"
                },
                suggestedClassroom: {
                  type: "number",
                  description: "Javasolt osztály (1-8) a tartalom nehézsége alapján"
                },
                topics: {
                  type: "array",
                  items: { type: "string" },
                  description: "Fő témák listája a dokumentumban"
                }
              },
              required: ["extractedText", "suggestedTitle", "suggestedDescription", "suggestedClassroom", "topics"],
              additionalProperties: false
            }
          }
        },
        max_completion_tokens: 4096
      });

      const result = JSON.parse(response.choices[0].message.content || '{}');

      console.log(`[FILE ANALYSIS] ✅ Analysis complete: ${result.topics?.length || 0} topics found`);

      res.json({
        success: true,
        analysis: result
      });

    } catch (error: any) {
      console.error('[FILE ANALYSIS] Error:', error);
      res.status(500).json({
        message: error.message || 'Hiba történt a fájl elemzése során'
      });
    }
  });

  // Phase 1: ChatGPT Text Generation Chat (streaming)
  app.post("/api/ai/enhanced-creator/chatgpt-chat", async (req, res) => {
    // AbortController for timeout handling
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      console.log('[CHATGPT] Request timeout (120s)');
    }, 120000); // 120 second timeout for longer content

    try {
      const { message, conversationHistory, context, systemPrompt } = req.body;

      if (!message || !message.trim()) {
        clearTimeout(timeout);
        return res.status(400).json({ message: "Üzenet megadása kötelező" });
      }

      // Setup SSE for streaming
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({
        baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
        apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY
      });

      // Default detailed system prompt
      const defaultPrompt = `Te ChatGPT vagy, egy szakértő oktatási tananyag szövegíró és dokumentum elemző.

🎯 ELSŐDLEGES FELADATOD:
- A feltöltött dokumentumok (PDF, DOCX, képek) PONTOS és HITELES elemzése
- Készíts strukturált, részletes tananyag szöveget KIZÁRÓLAG a dokumentum tartalma alapján
- TILOS hallucináció: csak azt írd le, ami ténylegesen szerepel a dokumentumban
- Ha valamit nem tudsz kiolvasni, jelezd egyértelműen

📚 TANANYAG KÉSZÍTÉSI IRÁNYELVEK:
- Helyezz el OK-OKOZATI ÖSSZEFÜGGÉSEKET minden témánál (pl. "Azért..., mert...", "Ennek következménye...")
- Adj TANÁRI MAGYARÁZATOKAT: úgy fejts ki mindent, mintha egy türelmes tanár lennél
- Használj VALÓS PÉLDÁKAT a fogalmak szemléltetésére
- Minden fogalmat RÉSZLETESEN fejtsd ki, ne feltételezd az előzetes tudást
- A tananyag ÖNMAGÁBAN is érthető legyen, külső források nélkül

✏️ STÍLUS IRÁNYELVEK (${context?.suggestedClassroom || '?'}. osztály):
- 1-3. osztály: Egyszerű, rövid mondatok, sok példa, játékos hangnem, "Tudtad, hogy...?"
- 4. osztály: Vidám, barátságos stílus, kérdések beépítése, érdekességek
- 5-7. osztály: Energikus, izgalmas témák, fiúkhoz szóló példák (autók, sport, technológia)
- 8. osztály+: Komolyabb, részletesebb, kamaszoknak szóló stílus

📋 FORMÁTUM:
- Használj címeket, alcímeket (hierarchikus struktúra)
- Bontsd bekezdésekre (max 3-4 mondat/bekezdés)
- Emelj ki KULCSFONTOSSÁGÚ információkat
- A válaszodban KIZÁRÓLAG a tananyag szövege jelenjen meg, semmi más

⚠️ FONTOS SZABÁLYOK:
- NE találj ki információkat, amik nincsenek a dokumentumban
- NE használj általános közhelyeket konkrét tények helyett
- MINDIG hivatkozz a forrásanyagra, ha bizonytalan vagy`;

      // Use custom prompt if provided, otherwise default
      const finalPrompt = systemPrompt || defaultPrompt;

      // Build conversation messages with document context
      const contextInfo = context?.extractedText 
        ? `\n\n📄 DOKUMENTUM TARTALMA (ezt kell feldolgoznod):\n${context.extractedText}\n\n📌 TÉMÁK: ${context.topics?.join(', ') || 'nincs megadva'}\n📖 JAVASOLT OSZTÁLY: ${context.suggestedClassroom || 'nincs megadva'}. osztály`
        : '';

      const messages: Array<any> = [
        {
          role: "system",
          content: finalPrompt + contextInfo
        }
      ];

      // Add conversation history
      if (conversationHistory && Array.isArray(conversationHistory)) {
        messages.push(...conversationHistory);
      }

      // Add current message
      messages.push({
        role: "user",
        content: message
      });

      console.log(`[CHATGPT CHAT] Streaming response...`);

      const stream = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        stream: true,
        max_completion_tokens: 4096
      }, {
        signal: controller.signal
      });

      // Handle abort on client disconnect
      req.on('close', () => {
        controller.abort();
        clearTimeout(timeout);
        console.log('[CHATGPT] Client disconnected, stream aborted');
      });

      let totalChunks = 0;
      for await (const chunk of stream) {
        // Validate chunk structure
        if (!chunk.choices || !Array.isArray(chunk.choices) || chunk.choices.length === 0) {
          console.warn('[CHATGPT] Invalid chunk structure:', chunk);
          continue;
        }

        const content = chunk.choices[0]?.delta?.content;

        if (content) {
          totalChunks++;
          res.write(`data: ${JSON.stringify({
            type: 'content_delta',
            content
          })}\n\n`);
        }
      }

      console.log(`[CHATGPT] ✅ Stream complete (${totalChunks} chunks)`);

      res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      clearTimeout(timeout);

    } catch (error: any) {
      clearTimeout(timeout);

      // Handle abort errors
      if (error.name === 'AbortError' || controller.signal.aborted) {
        console.error('[CHATGPT] Request aborted (timeout or disconnect)');
        if (!res.headersSent) {
          res.status(408).json({ message: 'Kérés időtúllépés' });
        } else {
          res.write(`data: ${JSON.stringify({
            type: 'error',
            message: 'Időtúllépés: A művelet túl sokáig tartott'
          })}\n\n`);
          res.end();
        }
        return;
      }

      console.error('[CHATGPT CHAT] Error:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'AI hiba történt' });
      } else {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          message: error.message || 'Ismeretlen hiba'
        })}\n\n`);
        res.end();
      }
    }
  });

  // Phase 2: Claude HTML Generation Chat (streaming)
  app.post("/api/ai/enhanced-creator/claude-chat", async (req, res) => {
    // AbortController for timeout handling
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      console.log('[CLAUDE] Request timeout (60s)');
    }, 60000); // 60 second timeout

    try {
      const { message, conversationHistory, textContent, metadata } = req.body;

      if (!message || !message.trim()) {
        clearTimeout(timeout);
        return res.status(400).json({ message: "Üzenet megadása kötelező" });
      }

      // Setup SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Using Claude (Anthropic) API
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const anthropic = new Anthropic({
        apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      });

      // Build conversation
      const messages: Array<{ role: 'user' | 'assistant', content: string }> = conversationHistory && Array.isArray(conversationHistory)
        ? conversationHistory
          .filter((msg: any) => msg.role !== 'system')
          .map((msg: any) => ({
            role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: msg.content
          }))
        : [];

      messages.push({
        role: 'user' as const,
        content: message
      });

      const systemPrompt = `Te Claude Opus vagy, a legfejlettebb HTML tananyag készítő szakértő.

🎯 ELSŐDLEGES FELADATOD:
1. A felhasználótól kapott SZÖVEGES TARTALMAT alakítsd LÁTVÁNYOS, INTERAKTÍV HTML tananyaggá
2. A tananyag vizuálisan FIGYELEMFELKELTŐ és MOTIVÁLÓ legyen a diákok számára
3. TELJES RESPONSIVITÁS: 280px mobiltól 1920px+ monitorig

${textContent ? `SZÖVEGES TARTALOM:\n${textContent}\n` : ''}

METADATA:
${metadata?.title ? `Cím: ${metadata.title}` : ''}
${metadata?.description ? `Leírás: ${metadata.description}` : ''}
${metadata?.classroom ? `Osztály: ${metadata.classroom}. osztály` : ''}

📝 KÖTELEZŐ FELADAT STRUKTÚRA:
1. SZÖVEGES FELADATOK: Generálj 45 db előre elkészített szöveges kérdést/feladatot
   - Ebből 15 db jelenjen meg véletlenszerűen a tanulónak
   - A feladatok végén ELLENŐRZÉS gomb:
     * Hibás válaszok PIROS háttérrel (#ef4444)
     * Helyes válaszok ZÖLD háttérrel (#22c55e)
     * Pontszám és ÉRDEMJEGY megjelenítése (1-5 skála)

2. KVÍZ KÉRDÉSEK: Generálj 75 db előre elkészített kvíz kérdést (A/B/C/D válaszok)
   - Ebből 25 db jelenjen meg véletlenszerűen
   - Kvíz végén ELLENŐRZÉS:
     * Hibás: PIROS jelölés
     * Helyes: ZÖLD jelölés
     * Összpontszám és OSZTÁLYZAT megjelenítése

💻 CSS KÖVETELMÉNYEK:
- Minden osztály "edu-" prefixszel kezdődjön
- TELJES RESPONSIVE DESIGN:
  * Mobil (280px-480px): Egyoszlopos, nagy gombok, érintésbarát
  * Tablet (481px-768px): Kétoszlopos ahol lehet
  * Desktop (769px-1920px+): TELJES SZÉLESSÉG kihasználása
- Smooth animációk és átmenetek
- Könnyen olvasható tipográfia (min 16px)
- Dark/Light mode támogatás

🎨 VIZUÁLIS STÍLUS (osztályonként):
- 4. osztály: Játékos, vidám, élénk színek (sárga, narancs, zöld)
- 5-7. osztály: Fiús, sportos, dinamikus (kék, piros, fekete)
- 8. osztály+: Melankolikus, minimalista (szürke, lila, kék árnyalatok)

🔧 INTERAKTIVITÁS:
- Kattintható elemek, hover effektek
- Összecsukható szekciók (accordion)
- Progress bar a haladáshoz
- JavaScript alapú kvíz és feladat logika beágyazva

⚠️ FONTOS:
- A HTML kód ÖNÁLLÓAN futtatható legyen
- Minden CSS és JavaScript beágyazva a HTML-be
- Ha HTML-t generálsz, MINDIG kezdd: <!-- HTML_START -->`;

      console.log(`[CLAUDE HTML] Streaming HTML generation with Opus...`);

      const stream = await anthropic.messages.stream({
        model: "claude-opus-4-1",
        max_tokens: 16384,
        system: systemPrompt,
        messages
      });

      // Handle abort on client disconnect
      req.on('close', () => {
        controller.abort();
        clearTimeout(timeout);
        console.log('[CLAUDE] Client disconnected, stream aborted');
      });

      let htmlContent = '';
      let isCollectingHtml = false;
      let totalEvents = 0;

      for await (const event of stream) {
        // Validate event structure
        if (!event || typeof event !== 'object') {
          console.warn('[CLAUDE] Invalid event structure:', event);
          continue;
        }

        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          const text = event.delta.text;

          if (!text || typeof text !== 'string') {
            console.warn('[CLAUDE] Invalid text delta:', event.delta);
            continue;
          }

          totalEvents++;

          // Check for HTML start marker
          if (text.includes('<!-- HTML_START -->')) {
            isCollectingHtml = true;
          }

          if (isCollectingHtml) {
            htmlContent += text;
          }

          res.write(`data: ${JSON.stringify({
            type: 'content_delta',
            content: text
          })}\n\n`);
        }
      }

      console.log(`[CLAUDE] ✅ Stream complete (${totalEvents} events, ${htmlContent.length} chars HTML)`);

      // Send HTML if generated
      if (htmlContent.length > 100) {
        const cleanHtml = htmlContent.replace('<!-- HTML_START -->', '').trim();
        res.write(`data: ${JSON.stringify({
          type: 'html_generated',
          html: cleanHtml
        })}\n\n`);
      }

      res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      clearTimeout(timeout);

    } catch (error: any) {
      clearTimeout(timeout);

      // Handle abort errors
      if (error.name === 'AbortError' || controller.signal.aborted) {
        console.error('[CLAUDE] Request aborted (timeout or disconnect)');
        if (!res.headersSent) {
          res.status(408).json({ message: 'Kérés időtúllépés' });
        } else {
          res.write(`data: ${JSON.stringify({
            type: 'error',
            message: 'Időtúllépés: A művelet túl sokáig tartott'
          })}\n\n`);
          res.end();
        }
        return;
      }

      console.error('[CLAUDE HTML] Error:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: 'AI hiba történt' });
      } else {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          message: error.message || 'Ismeretlen hiba'
        })}\n\n`);
        res.end();
      }
    }
  });

  // AI content generation endpoint (Admin only)
  app.post("/api/ai/generate-material", async (req, res) => {
    try {
      const { prompt, title, description, classroom } = req.body;

      if (!prompt || !prompt.trim()) {
        return res.status(400).json({ message: "A prompt megadása kötelező" });
      }

      // Generate HTML content based on the prompt
      // Note: This is a template-based generation. In production, you might want to integrate with a real AI service

      // XSS Protection: Sanitize all user inputs
      const safeTitle = sanitizeText(title);
      const safeDescription = description ? sanitizeHtml(description) : '';
      const safeClassroom = classroom ? sanitizeText(classroom.toString()) : '';
      const safePrompt = sanitizeText(prompt);

      const generatedContent = `<!DOCTYPE html>
<html lang="hu">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${safeTitle || "Tananyag"}</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.8;
            color: #2c3e50;
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .container {
            background: white;
            border-radius: 15px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.15);
        }
        h1 {
            color: #667eea;
            font-size: 2.5em;
            border-bottom: 3px solid #764ba2;
            padding-bottom: 15px;
            margin-bottom: 30px;
        }
        h2 {
            color: #34495e;
            margin-top: 35px;
            font-size: 1.8em;
        }
        h3 {
            color: #7f8c8d;
            margin-top: 25px;
            font-size: 1.4em;
        }
        p {
            margin: 20px 0;
            text-align: justify;
        }
        .intro {
            font-size: 1.2em;
            color: #555;
            background: linear-gradient(135deg, #667eea10 0%, #764ba210 100%);
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
        }
        .example {
            background: #ecf0f1;
            padding: 20px;
            border-left: 5px solid #3498db;
            margin: 25px 0;
            border-radius: 5px;
        }
        .important {
            background: #fff3cd;
            padding: 20px;
            border-left: 5px solid #ffc107;
            margin: 25px 0;
            border-radius: 5px;
        }
        .quiz {
            background: #e8f5e9;
            padding: 20px;
            border-radius: 10px;
            margin: 30px 0;
        }
        .quiz h3 {
            color: #4caf50;
        }
        .question {
            margin: 20px 0;
            padding: 15px;
            background: white;
            border-radius: 5px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        ul {
            margin: 20px 0;
            padding-left: 30px;
        }
        li {
            margin: 10px 0;
        }
        button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 12px 25px;
            border-radius: 25px;
            font-size: 1em;
            cursor: pointer;
            transition: transform 0.3s;
        }
        button:hover {
            transform: scale(1.05);
        }
        .interactive {
            background: #f0f3ff;
            padding: 20px;
            border-radius: 10px;
            margin: 25px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>${safeTitle || "Tananyag"} - ${safeClassroom ? safeClassroom + ". osztály" : ""}</h1>
        
        ${safeDescription ? `<div class="intro">${safeDescription}</div>` : ""}
        
        <section>
            <h2>Bevezető</h2>
            <p>${safePrompt}</p>
        </section>
        
        <section>
            <h2>Tanulási célok</h2>
            <ul>
                <li>Megérteni az alapfogalmakat</li>
                <li>Gyakorlati példákon keresztül tanulni</li>
                <li>Alkalmazni a megszerzett tudást</li>
                <li>Önálló feladatmegoldás fejlesztése</li>
            </ul>
        </section>
        
        <section>
            <h2>Főbb témakörök</h2>
            <div class="example">
                <h3>1. Alapfogalmak</h3>
                <p>Itt találhatók a témához kapcsolódó legfontosabb definíciók és magyarázatok.</p>
            </div>
            
            <div class="example">
                <h3>2. Gyakorlati alkalmazás</h3>
                <p>Valós példákon keresztül mutatjuk be a tananyag gyakorlati felhasználását.</p>
            </div>
            
            <div class="example">
                <h3>3. Összefoglalás</h3>
                <p>A legfontosabb pontok áttekintése és rendszerezése.</p>
            </div>
        </section>
        
        <div class="important">
            <h3>Fontos megjegyzés</h3>
            <p>Ez a tananyag az alapvető ismeretek elsajátítását segíti. További gyakorlás és elmélyülés szükséges a teljes megértéshez.</p>
        </div>
        
        <section class="quiz">
            <h2>Önellenőrző kérdések</h2>
            <div class="question">
                <strong>1. kérdés:</strong> Mi a témakör legfontosabb fogalma?
            </div>
            <div class="question">
                <strong>2. kérdés:</strong> Hogyan alkalmazható a gyakorlatban?
            </div>
            <div class="question">
                <strong>3. kérdés:</strong> Milyen kapcsolódó témákat érdemes még tanulmányozni?
            </div>
        </section>
        
        <section class="interactive">
            <h2>Interaktív feladat</h2>
            <p>Próbáld ki az alábbi interaktív feladatot a tanultak gyakorlására:</p>
            <button onclick="alert('Itt kezdődhet az interaktív gyakorlat!')">Feladat indítása</button>
        </section>
        
        <section>
            <h2>További források</h2>
            <ul>
                <li>Kapcsolódó tananyagok</li>
                <li>Ajánlott irodalom</li>
                <li>Online források és videók</li>
                <li>Gyakorló feladatok</li>
            </ul>
        </section>
    </div>
</body>
</html>`;

      res.json({
        content: generatedContent,
        message: "A tananyag sikeresen generálva lett"
      });
    } catch (error) {
      console.error("Error generating AI content:", error);
      res.status(500).json({ message: "Nem sikerült generálni a tartalmat" });
    }
  });

  // Admin extra email management routes (NO AUTH - user management removed)
  adminRouter.get("/extra-emails", async (_req, res) => {
    try {
      const extraEmails = await storage.getActiveExtraEmails();
      res.json(extraEmails);
    } catch (error: any) {
      console.error("Error fetching extra emails:", error);
      res.status(500).json({ message: "Nem sikerült lekérni az extra email címeket" });
    }
  });

  adminRouter.post("/extra-emails", async (req, res) => {
    try {
      // NO AUTH - Removed authentication
      const { email, classrooms } = req.body;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: "Email cím megadása kötelező" });
      }

      if (!Array.isArray(classrooms) || classrooms.length === 0) {
        return res.status(400).json({ message: "Legalább egy osztály kiválasztása kötelező" });
      }

      // Validate all classrooms are valid numbers 1-8
      if (!classrooms.every((c: any) => typeof c === 'number' && c >= 1 && c <= 8)) {
        return res.status(400).json({ message: "Minden osztálynak 1 és 8 között kell lennie" });
      }

      // Email validáció
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({ message: "Érvénytelen email cím formátum" });
      }

      // NO AUTH - No creator ID
      const extraEmail = await storage.addExtraEmail(email.trim(), classrooms, null);
      res.json(extraEmail);
    } catch (error: any) {
      console.error("Error adding extra email:", error);
      if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
        return res.status(400).json({ message: "Ez az email cím már hozzá van adva" });
      }
      res.status(500).json({ message: "Nem sikerült hozzáadni az email címet" });
    }
  });

  adminRouter.delete("/extra-emails/:id", async (req, res) => {
    try {
      const success = await storage.deleteExtraEmail(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Email cím nem található" });
      }
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting extra email:", error);
      res.status(500).json({ message: "Nem sikerült törölni az email címet" });
    }
  });

  // PUBLIC email subscription route (no authentication required)
  // Anyone can subscribe to email notifications
  app.post("/api/subscribe-email", async (req, res) => {
    try {
      const { email, classrooms } = req.body;

      if (!email || typeof email !== 'string') {
        return res.status(400).json({ message: "Email cím megadása kötelező" });
      }

      if (!Array.isArray(classrooms) || classrooms.length === 0) {
        return res.status(400).json({ message: "Legalább egy osztály kiválasztása kötelező" });
      }

      // Validate all classrooms are valid numbers 1-8
      if (!classrooms.every((c: any) => typeof c === 'number' && c >= 1 && c <= 8)) {
        return res.status(400).json({ message: "Minden osztálynak 1 és 8 között kell lennie" });
      }

      // Email validáció
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({ message: "Érvénytelen email cím formátum" });
      }

      // Add email without authentication (no addedBy user)
      const extraEmail = await storage.addExtraEmail(email.trim(), classrooms, null);

      console.log(`[EMAIL SUBSCRIBE] Public subscription: ${email.trim()}`);

      res.json({
        success: true,
        message: "Sikeresen feliratkoztál az email értesítésekre"
      });
    } catch (error: any) {
      console.error("Error subscribing email:", error);
      if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
        return res.status(400).json({ message: "Ez az email cím már fel van iratkozva" });
      }
      res.status(500).json({ message: "Nem sikerült feliratkozni. Próbáld újra később." });
    }
  });

  // PUBLIC HTML file routes (viewing)
  // Anyone can view materials without authentication
  app.get("/api/html-files", async (_req, res) => {
    try {
      const files = await storage.getAllHtmlFiles();
      res.json(files);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Phase 7: Advanced Search - SQLite LIKE search (PostgreSQL full-text disabled)
  app.get("/api/html-files/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.trim().length === 0) {
        return res.status(400).json({ message: "Search query is required" });
      }

      // SQLite LIKE search (simple but works)
      const searchPattern = `%${query}%`;

      const results = await db
        .select()
        .from(htmlFiles)
        .where(
          or(
            ilike(htmlFiles.title, searchPattern),
            ilike(htmlFiles.description, searchPattern)
          )
        )
        .orderBy(desc(htmlFiles.createdAt))
        .limit(50);

      res.json(results);
    } catch (error: any) {
      console.error("Search error:", { error: error.message });
      res.status(500).json({ message: error.message });
    }
  });

  app.get("/api/html-files/:id", async (req, res) => {
    try {
      const file = await storage.getHtmlFile(req.params.id);
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      res.json(file);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ADMIN-ONLY route - Create new material
  app.post("/api/html-files", isAuthenticatedAdmin, async (req: any, res) => {
    console.log('🔵 [UPLOAD] POST /api/html-files request received!');
    console.log('🔵 [UPLOAD] Headers:', JSON.stringify(req.headers, null, 2));
    console.log('🔵 [UPLOAD] Body keys:', Object.keys(req.body || {}));
    console.log('🔵 [UPLOAD] RAW Content length RECEIVED:', req.body?.content?.length || 0);
    console.log('🔵 [UPLOAD] Content preview (first 200 chars):', req.body?.content?.substring(0, 200));
    console.log('🔵 [UPLOAD] Content preview (last 200 chars):', req.body?.content?.substring(Math.max(0, (req.body?.content?.length || 0) - 200)));

    try {
      // Admin authentication required
      const userId = req.user.id;
      console.log('🔵 [UPLOAD] Admin user:', userId)

      console.log('🔵 [UPLOAD] Starting validation...');
      console.log('🔵 [UPLOAD] Content length BEFORE validation:', req.body?.content?.length);
      const result = insertHtmlFileSchema.safeParse(req.body);
      if (!result.success) {
        console.log('❌ [UPLOAD] Validation failed:', fromError(result.error).toString());
        return res.status(400).json({
          message: fromError(result.error).toString(),
        });
      }
      console.log('✅ [UPLOAD] Validation passed!');
      console.log('🔵 [UPLOAD] Content length AFTER validation:', result.data.content?.length);

      // Server-side validation: Check content size (plain text HTML, not base64)
      // Use Buffer.byteLength to get actual byte size, not character count
      if (result.data.content) {
        const contentSizeBytes = Buffer.byteLength(result.data.content, 'utf8');
        if (contentSizeBytes > MAX_FILE_SIZE_BYTES) {
          console.log(`[HTML UPLOAD] ❌ Rejected: Content too large (${(contentSizeBytes / 1_000_000).toFixed(2)}MB, max ${MAX_FILE_SIZE_MB}MB)`);
          return res.status(413).json({
            message: `A tartalom mérete túl nagy. Maximum ${MAX_FILE_SIZE_MB}MB megengedett. A feltöltött tartalom: ${(contentSizeBytes / 1_000_000).toFixed(2)}MB`
          });
        }
      }

      // Extract and validate classroom from title
      let classroomFromTitle = extractClassroomFromTitle(result.data.title);

      // Determine final classroom: title > validated body > default (1)
      let classroom: number;
      if (classroomFromTitle !== null) {
        classroom = classroomFromTitle;
        console.log(`[HTML UPLOAD] Using classroom from title: ${classroom}`);
      } else if (result.data.classroom !== undefined && result.data.classroom >= 0 && result.data.classroom <= 12) {
        // Use validated classroom from schema (already validated by insertHtmlFileSchema)
        classroom = result.data.classroom;
        console.log(`[HTML UPLOAD] Using classroom from body: ${classroom}`);
      } else {
        // Default to 1st grade if no classroom specified
        classroom = 1;
        console.warn(`[HTML UPLOAD] ⚠️ No classroom found in title or body. Defaulting to 1. osztály for: "${result.data.title}"`);
      }

      console.log('🔵 [UPLOAD] Creating file in database...');
      const file = await storage.createHtmlFile(result.data, userId, classroom);
      console.log('✅ [UPLOAD] File created in DB:', file.id);

      console.log('🔵 [UPLOAD] Sending response...');
      // Return response immediately before sending emails (non-blocking)
      res.status(201).json(file);
      console.log('✅ [UPLOAD] Response sent successfully!');

      // Trigger event-driven backup (debounced, non-blocking)
      triggerEventBackup();

      // Send email notifications in background (fire-and-forget)
      (async () => {
        try {
          console.log(`[EMAIL] Email címek összegyűjtése értesítésekhez (${classroom}. osztály anyaghoz)...`);

          // Get email subscriptions for this classroom
          const emailSubs = await storage.getActiveEmailSubscriptions();
          const classroomSubs = emailSubs.filter(sub => sub.classrooms.includes(classroom));
          console.log(`[EMAIL] ${classroomSubs.length} feliratkozott felhasználó található (${classroom}. osztály)`);

          // Get extra email addresses for this classroom
          const extraEmails = await storage.getActiveExtraEmails();
          const classroomExtraEmails = extraEmails.filter(extra => extra.classrooms.includes(classroom));
          console.log(`[EMAIL] ${classroomExtraEmails.length} extra email cím található (${classroom}. osztály)`);

          // Combine all email recipients for this classroom
          const allRecipients = [
            ...classroomSubs.map(sub => ({
              email: sub.email,
              name: sub.user ? `${sub.user.firstName || ''} ${sub.user.lastName || ''}`.trim() || 'Felhasználó' : 'Felhasználó'
            })),
            ...classroomExtraEmails.map(extra => ({
              email: extra.email,
              name: 'Kedves Felhasználó'
            }))
          ];

          // Remove duplicates by email
          const uniqueRecipients = Array.from(
            new Map(allRecipients.map(r => [r.email, r])).values()
          );

          console.log(`[EMAIL] Összesen ${uniqueRecipients.length} címzett található (${classroom}. osztály)`);

          if (uniqueRecipients.length === 0) {
            console.log('[EMAIL] Nincs címzett, email küldés kihagyva');
          } else {
            console.log(`[EMAIL] Email értesítések küldése ${uniqueRecipients.length} címre (háttérben, rate limit: 500ms/email)...`);

            // Send emails with rate limiting: 500ms delay between each to respect Resend's 2 req/sec limit
            let successful = 0;
            let failed = 0;

            for (let i = 0; i < uniqueRecipients.length; i++) {
              const recipient = uniqueRecipients[i];
              try {
                await sendNewMaterialNotification(
                  recipient.email,
                  recipient.name,
                  file.title,
                  file.description,
                  file.id
                );
                successful++;
                console.log(`[EMAIL] ✓ Email sikeresen elküldve (${i + 1}/${uniqueRecipients.length}): ${recipient.email}`);
              } catch (err: any) {
                failed++;
                console.error('[EMAIL] ✗ Hiba email küldéskor:', recipient.email, 'error:', err.message);
              }

              // Add 500ms delay between emails to respect rate limits (2 req/sec = 500ms minimum)
              if (i < uniqueRecipients.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
            }

            console.log(`[EMAIL] ✅ Email küldés befejezve: ${successful} sikeres, ${failed} sikertelen`);
          }
        } catch (emailError) {
          console.error('[EMAIL] ❌ Email értesítések küldési hiba:', emailError);
        }
      })().catch(err => {
        console.error('[EMAIL] ❌ Háttér email küldési hiba:', err);
      });

      // Send push notifications in background (fire-and-forget)
      setImmediate(() => {
        sendPushNewMaterial(file.title, file.id).catch((err) => {
          console.error('[PUSH] ❌ Push értesítés küldési hiba:', err);
        });
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ADMIN-ONLY route - Update material
  app.patch("/api/html-files/:id", isAuthenticatedAdmin, async (req: any, res) => {
    try {
      // Admin authentication required
      const userId = req.user.id;

      const updates: { title?: string; description?: string; classroom?: number; displayOrder?: number } = {};

      // Handle title update - allow any non-empty title when editing
      if (req.body.title !== undefined) {
        if (typeof req.body.title !== 'string' || req.body.title.trim().length === 0) {
          return res.status(400).json({ message: "A cím nem lehet üres" });
        }
        updates.title = req.body.title.trim();
      }

      // Handle classroom update - independent of title
      if (req.body.classroom !== undefined) {
        const classroom = parseInt(req.body.classroom, 10);
        if (isNaN(classroom) || classroom < 0 || classroom > 12) {
          return res.status(400).json({
            message: "Az osztály értékének 0 és 12 között kell lennie"
          });
        }
        updates.classroom = classroom;
      }

      // Handle description update
      if (req.body.description !== undefined) {
        updates.description = req.body.description === '' ? null : req.body.description;
      }

      // Handle displayOrder update
      if (req.body.displayOrder !== undefined) {
        const order = parseInt(req.body.displayOrder, 10);
        if (!isNaN(order)) {
          updates.displayOrder = order;
        }
      }

      // Ensure we have at least one update
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "Nincs módosítandó mező" });
      }

      const updatedFile = await storage.updateHtmlFile(req.params.id, userId, updates);
      if (!updatedFile) {
        return res.status(404).json({ message: "Fájl nem található vagy nem engedélyezett" });
      }

      res.json(updatedFile);

      // Trigger event-driven backup (debounced, non-blocking)
      triggerEventBackup();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ADMIN-ONLY route - Batch update display order
  app.post("/api/html-files/reorder", isAuthenticatedAdmin, async (req: any, res) => {
    try {
      // Admin authentication required
      const userId = req.user.id;

      // Validate request body: array of {id, displayOrder}
      const { items } = req.body;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Items array is required" });
      }

      // Validate each item
      for (const item of items) {
        if (!item.id || typeof item.displayOrder !== 'number') {
          return res.status(400).json({
            message: "Each item must have id and displayOrder"
          });
        }
      }

      console.log(`[REORDER] Updating display order for ${items.length} materials`);

      // Update each file's display order
      const results = await Promise.all(
        items.map(item =>
          storage.updateHtmlFile(item.id, userId, { displayOrder: item.displayOrder })
        )
      );

      const successCount = results.filter(r => r !== null).length;
      console.log(`[REORDER] ✅ Updated ${successCount}/${items.length} materials`);

      res.json({
        success: true,
        updated: successCount,
        total: items.length
      });
    } catch (error: any) {
      console.error('[REORDER] ❌ Error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // ADMIN-ONLY route - Delete material
  app.delete("/api/html-files/:id", isAuthenticatedAdmin, async (req: any, res) => {
    try {
      // Admin authentication required
      const userId = req.user.id;
      const deleted = await storage.deleteHtmlFile(req.params.id, userId);
      if (!deleted) {
        return res.status(404).json({ message: "File not found or unauthorized" });
      }
      res.status(204).send();

      // Trigger event-driven backup (debounced, non-blocking)
      triggerEventBackup();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ADMIN-ONLY route - Send email notification for a specific material
  app.post("/api/html-files/:id/send-email", isAuthenticatedAdmin, async (req: any, res) => {
    try {
      const userId = req.user.id;

      const { email } = req.body;
      if (!email || typeof email !== 'string' || !email.includes('@')) {
        return res.status(400).json({ message: "Érvényes email cím megadása kötelező" });
      }

      // Get the file
      const file = await storage.getHtmlFile(req.params.id);
      if (!file) {
        return res.status(404).json({ message: "Fájl nem található" });
      }

      // Add email to extra emails for future notifications (with file's classroom)
      try {
        await storage.addExtraEmail(email, [file.classroom], userId);
        console.log(`[EMAIL] Új email cím hozzáadva: ${email} (${file.classroom}. osztály)`);
      } catch (err: any) {
        console.log('[EMAIL] Email cím már létezik vagy hiba:', email, 'message:', err.message);
      }

      // Send email notification
      try {
        console.log(`[EMAIL] Email küldése ${email} címre a ${file.title} fájlhoz`);
        await sendNewMaterialNotification(
          email,
          'Kedves Felhasználó',
          file.title,
          file.description,
          file.id
        );
        console.log(`[EMAIL] Email sikeresen elküldve: ${email}`);
        res.json({ success: true, message: "Email értesítés elküldve" });
      } catch (emailError: any) {
        console.error(`[EMAIL] Hiba az email küldésekor:`, emailError);
        res.status(500).json({ message: "Email küldési hiba", error: emailError.message });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ADMIN-ONLY route - Get extra email addresses (PII data)
  app.get("/api/extra-emails", isAuthenticatedAdmin, async (req: any, res) => {
    try {
      const userId = req.user.id;

      const extraEmails = await storage.getActiveExtraEmails();
      res.json(extraEmails);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // REMOVED: Duplicate endpoint - the main one is earlier in the file (line ~1527)

  // ADMIN-ONLY route - Update extra email classrooms (PII data)
  app.patch("/api/extra-emails/:id/classrooms", isAuthenticatedAdmin, async (req: any, res) => {
    try {
      const userId = req.user.id;

      const { classrooms } = req.body;
      if (!Array.isArray(classrooms) || classrooms.length === 0) {
        return res.status(400).json({ message: "Legalább egy osztály kiválasztása kötelező" });
      }

      if (!classrooms.every((c: any) => typeof c === 'number' && c >= 1 && c <= 8)) {
        return res.status(400).json({ message: "Minden osztálynak 1 és 8 között kell lennie" });
      }

      const updated = await storage.updateExtraEmailClassrooms(req.params.id, classrooms);
      if (!updated) {
        return res.status(404).json({ message: "Email cím nem található" });
      }

      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // PUBLIC Google TTS API endpoint (FREE - No API key required!)
  // Uses unofficial Google Translate TTS service - may have rate limits/availability changes
  app.post("/api/tts", async (req, res) => {
    try {
      const { text, lang = 'hu' } = req.body;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({ message: "A 'text' mező kötelező és string típusú kell legyen" });
      }

      // Validate lang parameter (whitelist of supported languages)
      const supportedLangs = ['hu', 'en', 'en-US', 'en-GB', 'de', 'fr', 'es', 'it', 'pl', 'ro', 'sk', 'cs', 'pt', 'nl', 'sv', 'da', 'fi', 'no'];
      if (!supportedLangs.includes(lang)) {
        return res.status(400).json({
          message: `Nem támogatott nyelv: ${lang}. Támogatott nyelvek: ${supportedLangs.join(', ')}`
        });
      }

      // Get base64 audio directly from Google Translate TTS (FREE!)
      // Use getAllAudioBase64 for both short and long text (handles >200 chars automatically)
      // NOTE: splitPunct defaults to include ,.?!:; - using library default for better segmentation
      const audioSegments = await getAllAudioBase64(text, {
        lang: lang,
        slow: false,
        host: 'https://translate.google.com',
      });

      // getAllAudioBase64 returns an array of { shortText, base64 } objects
      // IMPORTANT: Cannot simply join base64 strings because padding characters (=) can invalidate concatenated result
      // Instead: Convert each base64 segment to Buffer, concatenate Buffers, then re-encode to base64
      const base64Audio = Buffer.concat(
        audioSegments.map(seg => Buffer.from(seg.base64, 'base64'))
      ).toString('base64');

      // Return the base64-encoded audio (same format as Google Cloud TTS)
      res.json({
        audioContent: base64Audio,
        lang: lang,
      });
    } catch (error: any) {
      console.error('TTS hiba:', error);
      res.status(500).json({ message: 'Szöveg felolvasása sikertelen', error: error.message });
    }
  });

  // ADMIN Backup operations
  // Create a new backup (max 3 kept automatically)
  adminRouter.post("/backups/create", async (req, res) => {
    try {
      const userId = 'anonymous';

      const { name } = req.body;
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ message: "A backup név kötelező" });
      }

      const backup = await storage.createBackup(name, userId);
      res.json(backup);
    } catch (error: any) {
      console.error('[BACKUP] Hiba a backup készítésekor:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Get all backups (max 3)
  adminRouter.get("/backups", async (req, res) => {
    try {
      const userId = 'anonymous';

      const backups = await storage.getAllBackups();
      res.json(backups);
    } catch (error: any) {
      console.error('[BACKUP] Hiba a backup-ok lekérdezésekor:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Restore from backup
  adminRouter.post("/backups/:id/restore", async (req, res) => {
    try {
      const userId = 'anonymous';

      const success = await storage.restoreBackup(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Backup nem található" });
      }

      res.json({ success: true, message: "Backup sikeresen visszaállítva" });
    } catch (error: any) {
      console.error('[BACKUP] Hiba a backup visszaállításakor:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Delete backup
  adminRouter.delete("/backups/:id", async (req, res) => {
    try {
      const userId = 'anonymous';

      const success = await storage.deleteBackup(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Backup nem található" });
      }

      res.json({ success: true, message: "Backup sikeresen törölve" });
    } catch (error: any) {
      console.error('[BACKUP] Hiba a backup törlésekor:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Export backup as downloadable JSON file
  adminRouter.get("/backups/export", async (req, res) => {
    try {
      // NO AUTH - Removed authentication
      const userEmail = "admin";
      const allFiles = await storage.getAllHtmlFiles();

      const backupData = {
        version: "1.0",
        exportedAt: new Date().toISOString(),
        exportedBy: userEmail,
        materialsCount: allFiles.length,
        materials: allFiles,
      };

      const fileName = `anyagok-backup-${new Date().toISOString().split('T')[0]}.json`;

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.json(backupData);
    } catch (error: any) {
      console.error('[BACKUP] Hiba az export során:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Import backup from uploaded JSON file
  adminRouter.post("/backups/import", async (req, res) => {
    try {
      const { backupData } = req.body;

      if (!backupData || !backupData.materials || !Array.isArray(backupData.materials)) {
        return res.status(400).json({ message: "Érvénytelen backup fájl formátum" });
      }

      const materials = backupData.materials;

      if (materials.length === 0) {
        return res.status(400).json({ message: "A backup fájl nem tartalmaz anyagokat" });
      }

      // IMPORTANT: Delete all related records first to avoid foreign key constraint violations
      // Import the necessary tables
      const { emailLogs, materialStats, materialTags, materialLikes, materialRatings, materialComments, materialViews } = await import("@shared/schema");

      await db.delete(emailLogs);
      await db.delete(materialStats);
      await db.delete(materialTags);
      await db.delete(materialLikes);
      await db.delete(materialRatings);
      await db.delete(materialComments);
      await db.delete(materialViews);

      // Now we can safely delete all html_files
      await db.delete(htmlFiles);

      await db.insert(htmlFiles).values(
        materials.map((file: HtmlFile) => ({
          id: file.id,
          userId: file.userId,
          title: file.title,
          content: file.content,
          description: file.description,
          classroom: file.classroom,
          createdAt: file.createdAt,
        }))
      );

      res.json({
        success: true,
        message: `${materials.length} anyag sikeresen visszaállítva`,
        materialsCount: materials.length,
      });
    } catch (error: any) {
      console.error('[BACKUP] Hiba az import során:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // ========== FILE-BASED BACKUP ENDPOINTS ==========
  // List all file-based backups
  adminRouter.get("/file-backups", async (req, res) => {
    try {
      const backupsList = await listBackups();
      res.json(backupsList);
    } catch (error: any) {
      console.error('[FILE-BACKUP] Error listing backups:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // Restore from file-based backup
  adminRouter.post("/file-backups/restore/:filename", async (req, res) => {
    try {
      const { filename } = req.params;

      console.log(`[FILE-BACKUP] Restore requested for: ${filename}`);

      // Read backup file
      const backupData = await readBackup(filename);
      if (!backupData) {
        return res.status(404).json({ message: "Backup fájl nem található" });
      }

      // Validate backup structure (check for 'data' field from autoBackup.ts format)
      const snapshotData = backupData.data || backupData.snapshot;
      if (!snapshotData || !snapshotData.htmlFiles || !snapshotData.users) {
        return res.status(400).json({ message: "Érvénytelen backup fájl formátum" });
      }

      // Create pre-restore backup automatically
      console.log('[FILE-BACKUP] Creating pre-restore backup...');
      await createAutoBackup('pre-restore');

      // Perform restore using transaction-safe import
      console.log('[FILE-BACKUP] Starting database restore...');
      await storage.importBackupSnapshot(snapshotData);

      res.json({
        success: true,
        message: `Backup sikeresen visszaállítva: ${filename}`,
        materialsRestored: snapshotData.htmlFiles.length,
      });
    } catch (error: any) {
      console.error('[FILE-BACKUP] Restore error:', error);
      res.status(500).json({
        message: `Backup visszaállítás sikertelen: ${error.message}`
      });
    }
  });

  // ========== PRODUCTION → DEV DATABASE SYNC ==========
  // Sync production database to dev database (ADMIN ONLY)
  adminRouter.post("/sync-from-production", async (req, res) => {
    try {
      // Validate required environment variables
      if (!process.env.DATABASE_URL) {
        return res.status(500).json({
          success: false,
          message: "DATABASE_URL nincs beállítva",
          details: "Production adatbázis URL hiányzik a környezeti változókból"
        });
      }
      if (!process.env.DEV_DATABASE_URL) {
        return res.status(500).json({
          success: false,
          message: "DEV_DATABASE_URL nincs beállítva",
          details: "Development adatbázis URL hiányzik. Kérlek add hozzá a DEV_DATABASE_URL secret-et a deployment environment variables-hoz!"
        });
      }

      console.log('[ADMIN] Starting production → dev database sync...');
      console.log('[ADMIN] Production DB:', process.env.DATABASE_URL?.substring(0, 30) + '...');
      console.log('[ADMIN] Dev DB:', process.env.DEV_DATABASE_URL?.substring(0, 30) + '...');

      // Import the sync function dynamically
      const { copyProductionToDev } = await import('./copyProductionToDev');

      // Execute sync (this includes clearing dev DB first)
      await copyProductionToDev();

      console.log('[ADMIN] Production → dev sync completed successfully');

      res.json({
        success: true,
        message: "Production adatbázis sikeresen szinkronizálva dev adatbázisba",
        timestamp: new Date().toISOString()
      });
    } catch (error: any) {
      console.error('[ADMIN] Sync error:', error);
      console.error('[ADMIN] Error stack:', error.stack);

      res.status(500).json({
        success: false,
        message: "Hiba történt a szinkronizálás során",
        error: error.message,
        details: error.stack ? error.stack.split('\n').slice(0, 5).join('\n') : undefined
      });
    }
  });

  // Download file-based backup (streaming response)
  adminRouter.get("/file-backups/download/:filename", async (req, res) => {
    try {
      const { filename } = req.params;

      // Security: Validate filename
      if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
        return res.status(400).json({ message: "Érvénytelen fájlnév" });
      }

      const backupData = await readBackup(filename);
      if (!backupData) {
        return res.status(404).json({ message: "Backup fájl nem található" });
      }

      // Set headers for download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache');

      // Send backup data
      res.json(backupData);
    } catch (error: any) {
      console.error('[FILE-BACKUP] Download error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // ADMIN Get recent material views
  adminRouter.get("/material-views", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const views = await storage.getRecentMaterialViews(limit);
      res.json(views);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // PUBLIC Push notification subscription endpoint
  app.post("/api/push/subscribe", async (req, res) => {
    try {
      const { endpoint, keys } = req.body;

      if (!endpoint || !keys) {
        return res.status(400).json({ message: "Hiányzó subscription adatok" });
      }

      // Create or update subscription (no authentication required)
      const subscription = await storage.createPushSubscription({
        userId: null, // No authentication
        email: null,
        endpoint,
        keys,
      });

      res.json({ success: true, subscription });
    } catch (error: any) {
      console.error('[PUSH] Subscription error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // PUBLIC Push notification unsubscribe endpoint
  app.post("/api/push/unsubscribe", async (req, res) => {
    try {
      const { endpoint } = req.body;

      if (!endpoint) {
        return res.status(400).json({ message: "Hiányzó endpoint" });
      }

      const success = await storage.deletePushSubscription(endpoint);
      res.json({ success });
    } catch (error: any) {
      console.error('[PUSH] Unsubscribe error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // ADMIN Test push notification endpoint
  adminRouter.post("/push/test", async (req, res) => {
    try {
      const webPush = require('web-push');
      const { title, body, url } = req.body;

      const vapidPublicKey = process.env.PUBLIC_VAPID_KEY;
      const vapidPrivateKey = process.env.PRIVATE_VAPID_KEY;

      if (!vapidPublicKey || !vapidPrivateKey) {
        return res.status(500).json({ message: "VAPID kulcsok nincsenek beállítva" });
      }

      webPush.setVapidDetails(
        'mailto:mszilva78@gmail.com',
        vapidPublicKey,
        vapidPrivateKey
      );

      // Get all subscriptions
      const subscriptions = await storage.getAllPushSubscriptions();

      if (subscriptions.length === 0) {
        return res.json({
          success: true,
          sent: 0,
          message: "Nincsenek aktív feliratkozások"
        });
      }

      const payload = JSON.stringify({
        title: title || 'Teszt értesítés',
        body: body || 'Ez egy teszt push értesítés az Anyagok Profiknak platformtól',
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'test-notification',
        data: {
          url: url || '/'
        }
      });

      let successCount = 0;
      let failCount = 0;

      for (const sub of subscriptions) {
        try {
          const pushSubscription = {
            endpoint: sub.endpoint,
            keys: sub.keys as any
          };

          await webPush.sendNotification(pushSubscription, payload);
          successCount++;
        } catch (error: any) {
          console.error('[PUSH] Failed to send to subscription:', error);
          failCount++;

          // Remove invalid subscriptions (410 = endpoint expired)
          if (error.statusCode === 410) {
            await storage.deletePushSubscription(sub.endpoint);
          }
        }
      }

      res.json({
        success: true,
        sent: successCount,
        failed: failCount,
        total: subscriptions.length
      });
    } catch (error: any) {
      console.error('[PUSH] Test notification error:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // PUBLIC dev endpoint for iframe HTML execution
  // This serves raw HTML outside of React/Vite environment
  app.get("/dev/:id", async (req, res) => {
    try {
      const file = await storage.getHtmlFile(req.params.id);
      if (!file) {
        return res.status(404).send("<html><body><h1>Fájl nem található</h1></body></html>");
      }

      // Track material view (no authentication required)
      // Note: Daily summary email will be sent at 20:00 with all views
      try {
        const userAgent = req.headers['user-agent'] || undefined;

        // Create material view record with NULL userId for anonymous
        await storage.createMaterialView({
          userId: null as any, // NULL for anonymous users (no foreign key violation)
          materialId: file.id,
          userAgent,
        });

        console.log(`[TRACKING] Material viewed: ${file.title} by anonymous user`);
      } catch (trackError: any) {
        console.error('[TRACKING] Material view rögzítési hiba:', trackError);
      }

      // Check if this is a PDF material
      if (file.contentType === 'pdf') {
        // PDF material: Use native browser PDF viewer for perfect font rendering
        // Embed PDF via separate endpoint to avoid data URI sandbox restrictions

        const pdfViewerHtml = `
<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover">
  <title>${sanitizeText(file.title)}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    html, body {
      width: 100%;
      height: 100%;
      min-height: 100vh;
      overflow: hidden;
      /* Support for foldable devices */
      min-height: -webkit-fill-available; /* iOS Safari */
    }
    embed {
      width: 100%;
      height: 100%;
      min-height: 100vh;
      min-height: -webkit-fill-available; /* iOS Safari */
      border: none;
      display: block;
    }
    /* Optimize for Samsung Z Fold and large tablets */
    @media (min-width: 1200px) and (max-width: 1800px) and (min-height: 2000px) {
      embed {
        width: 100%;
        height: 100vh;
      }
    }
  </style>
</head>
<body>
  <embed src="/api/pdf/${sanitizeText(req.params.id)}" type="application/pdf" width="100%" height="100%" />
</body>
</html>
        `;

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(pdfViewerHtml);
      } else {
        // HTML material: wrap with responsive container
        const wrappedHtml = wrapHtmlWithResponsiveContainer(file.content);

        // Send wrapped HTML for iframe rendering
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(wrappedHtml);
      }
    } catch (error: any) {
      res.status(500).send(`<html><body><h1>Hiba történt</h1><p>${error.message}</p></body></html>`);
    }
  });

  // PUBLIC PDF binary endpoint for native browser PDF viewer
  // This serves raw PDF data without data URI encoding
  app.get("/api/pdf/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const file = await storage.getHtmlFile(id);

      if (!file) {
        return res.status(404).send("PDF not found");
      }

      if (file.contentType !== 'pdf') {
        return res.status(400).send("Not a PDF file");
      }

      // Decode base64 PDF data
      const base64Data = file.content.includes(',')
        ? file.content.split(',')[1]
        : file.content;

      const pdfBuffer = Buffer.from(base64Data, 'base64');

      // Set headers for PDF display
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(file.title)}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length.toString());
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year

      // Send PDF binary data
      res.send(pdfBuffer);
    } catch (error: any) {
      res.status(500).send("Error loading PDF");
    }
  });

  // ========== STATISTICS ENDPOINTS (Phase 2) ==========

  // GET overall statistics - Admin only
  adminRouter.get("/stats/overall", async (req, res) => {
    try {
      const stats = await storage.getOverallStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET top materials - Admin only
  adminRouter.get("/stats/top-materials", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const topMaterials = await storage.getTopMaterials(limit);
      res.json(topMaterials);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET classroom distribution - Admin only
  adminRouter.get("/stats/classroom-distribution", async (req, res) => {
    try {
      const distribution = await storage.getClassroomDistribution();
      res.json(distribution);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET email delivery stats - Admin only
  adminRouter.get("/stats/email-delivery", async (req, res) => {
    try {
      const stats = await storage.getEmailDeliveryStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== TAG ENDPOINTS (Phase 3) ==========

  // GET all tags - Public
  app.get("/api/tags", async (req, res) => {
    try {
      const tags = await storage.getAllTags();
      res.json(tags);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // CREATE tag - Admin only
  adminRouter.post("/tags", async (req, res) => {
    try {
      const { name, description, color } = req.body;
      if (!name) {
        return res.status(400).json({ message: "A tag neve kötelező" });
      }
      const tag = await storage.createTag(name, description, color);
      res.json(tag);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // UPDATE tag - Admin only
  adminRouter.patch("/tags/:id", async (req, res) => {
    try {
      const { name, description, color } = req.body;
      const tag = await storage.updateTag(req.params.id, { name, description, color });
      if (!tag) {
        return res.status(404).json({ message: "Tag nem található" });
      }
      res.json(tag);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // DELETE tag - Admin only
  adminRouter.delete("/tags/:id", async (req, res) => {
    try {
      const deleted = await storage.deleteTag(req.params.id);
      if (!deleted) {
        return res.status(404).json({ message: "Tag nem található" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // GET material tags - Public
  app.get("/api/materials/:id/tags", async (req, res) => {
    try {
      const tags = await storage.getMaterialTags(req.params.id);
      res.json(tags);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ADD tag to material - Admin only
  adminRouter.post("/materials/:id/tags", async (req, res) => {
    try {
      const { tagId } = req.body;
      if (!tagId) {
        return res.status(400).json({ message: "Tag ID kötelező" });
      }
      const materialTag = await storage.addMaterialTag(req.params.id, tagId);
      res.json(materialTag);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // REMOVE tag from material - Admin only
  adminRouter.delete("/materials/:materialId/tags/:tagId", async (req, res) => {
    try {
      const removed = await storage.removeMaterialTag(req.params.materialId, req.params.tagId);
      if (!removed) {
        return res.status(404).json({ message: "Tag kapcsolat nem található" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== LIKE ENDPOINTS (Phase 5) ==========

  // GET material likes status - Public (requires fingerprint query param)
  app.get("/api/materials/:id/likes", async (req, res) => {
    try {
      const materialId = req.params.id;
      const fingerprint = req.query.fingerprint as string;

      // Get total likes count
      const totalLikes = await storage.getMaterialLikes(materialId);

      // Check if this user (fingerprint) has liked
      const liked = fingerprint ? await storage.hasUserLiked(materialId, fingerprint) : false;

      res.json({ liked, totalLikes });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // CHECK if user liked - Public
  app.post("/api/materials/:id/likes/check", async (req, res) => {
    try {
      const { fingerprint } = req.body;
      if (!fingerprint) {
        return res.status(400).json({ message: "Fingerprint kötelező" });
      }
      const hasLiked = await storage.hasUserLiked(req.params.id, fingerprint);
      res.json({ hasLiked });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // TOGGLE like - Public (idempotent: like if not liked, unlike if already liked)
  app.post("/api/materials/:id/likes", async (req, res) => {
    try {
      const { fingerprint } = req.body;
      if (!fingerprint) {
        return res.status(400).json({ message: "Fingerprint kötelező" });
      }

      const materialId = req.params.id;

      // Check if already liked
      const hasLiked = await storage.hasUserLiked(materialId, fingerprint);

      if (hasLiked) {
        // Already liked → Unlike (toggle off)
        await storage.removeMaterialLike(materialId, fingerprint);
        await storage.updateMaterialStats(materialId);

        // Return updated status
        const totalLikes = await storage.getMaterialLikes(materialId);
        res.json({ liked: false, totalLikes, message: "Kedvelés törölve" });
      } else {
        // Not liked yet → Like (toggle on)
        await storage.addMaterialLike(materialId, fingerprint, undefined);
        await storage.updateMaterialStats(materialId);

        // Return updated status
        const totalLikes = await storage.getMaterialLikes(materialId);
        res.json({ liked: true, totalLikes, message: "Kedvelve!" });
      }
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // REMOVE like - Public
  app.delete("/api/materials/:id/likes", async (req, res) => {
    try {
      const { fingerprint } = req.body;
      if (!fingerprint) {
        return res.status(400).json({ message: "Fingerprint kötelező" });
      }

      const removed = await storage.removeMaterialLike(req.params.id, fingerprint);
      if (!removed) {
        return res.status(404).json({ message: "Like nem található" });
      }

      // Update material stats
      await storage.updateMaterialStats(req.params.id);

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========== BULK OPERATIONS ENDPOINTS (Phase 4) ==========

  // BULK DELETE materials - Admin only
  adminRouter.post("/materials/bulk-delete", async (req, res) => {
    try {
      const result = bulkDeleteSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          message: fromError(result.error).toString()
        });
      }

      const { materialIds } = result.data;

      // IMPORTANT: Delete all related records first to avoid foreign key constraint violations
      // Import the necessary tables first
      const { emailLogs, materialStats, materialTags, materialLikes, materialRatings, materialComments, materialViews } = await import("@shared/schema");

      // Delete related records for all materials in bulk
      await db.delete(emailLogs).where(inArray(emailLogs.htmlFileId, materialIds));
      await db.delete(materialStats).where(inArray(materialStats.materialId, materialIds));
      await db.delete(materialTags).where(inArray(materialTags.materialId, materialIds));
      await db.delete(materialLikes).where(inArray(materialLikes.materialId, materialIds));
      await db.delete(materialRatings).where(inArray(materialRatings.materialId, materialIds));
      await db.delete(materialComments).where(inArray(materialComments.materialId, materialIds));
      await db.delete(materialViews).where(inArray(materialViews.materialId, materialIds));

      // Now we can safely delete the html_files
      const deleteResult = await db
        .delete(htmlFiles)
        .where(inArray(htmlFiles.id, materialIds));

      res.json({
        success: true,
        deletedCount: materialIds.length,
        message: `${materialIds.length} anyag sikeresen törölve`
      });
    } catch (error: any) {
      console.error('Bulk delete error:', error);
      res.status(500).json({ message: error.message });
    }
  });


  // BULK EMAIL send - Admin only
  adminRouter.post("/materials/bulk-email", async (req, res) => {
    try {
      const result = bulkEmailSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          message: fromError(result.error).toString()
        });
      }

      const { materialIds, email } = result.data;

      // TODO: Implement bulk email sending logic
      res.json({ success: true, message: "Bulk email sending not yet implemented" });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // BULK MOVE to classroom - Admin only
  adminRouter.post("/materials/bulk-move", async (req, res) => {
    try {
      const result = bulkMoveSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          message: fromError(result.error).toString()
        });
      }

      const { materialIds, classroom } = result.data;
      const userId = 'anonymous';
      let movedCount = 0;

      for (const id of materialIds) {
        const updated = await storage.updateHtmlFile(id, userId, { classroom });
        if (updated) movedCount++;
      }

      res.json({ success: true, movedCount });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });


  // ========================================
  // PHASE 9: COMMENT SYSTEM CRUD API
  // ========================================

  // Get comments for a material (public)
  app.get("/api/materials/:id/comments", async (req, res) => {
    try {
      const materialId = req.params.id;

      const comments = await db
        .select({
          id: materialComments.id,
          materialId: materialComments.materialId,
          userId: materialComments.userId,
          authorName: materialComments.authorName,
          authorEmail: materialComments.authorEmail,
          body: materialComments.body,
          isApproved: materialComments.isApproved,
          createdAt: materialComments.createdAt,
          email: users.email,
          firstName: users.firstName,
          lastName: users.lastName,
        })
        .from(materialComments)
        .leftJoin(users, eq(materialComments.userId, users.id))
        .where(
          and(
            eq(materialComments.materialId, materialId),
            eq(materialComments.isApproved, true)
          )
        )
        .orderBy(desc(materialComments.createdAt));

      res.json(comments);
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Post a comment (public - no authentication) - WITH XSS PROTECTION
  app.post("/api/materials/:id/comments", async (req, res) => {
    try {
      const materialId = req.params.id;
      const userId = null; // NO AUTH - Always null since authentication is disabled

      // Validate with Zod schema
      const validationResult = insertMaterialCommentSchema.extend({
        body: z.string().min(1, "Comment content is required").max(5000, "Comment is too long"),
        authorName: z.string().min(1, "Author name is required").max(100, "Name is too long"),
        authorEmail: z.string().email("Valid email is required"),
      }).safeParse({
        materialId,
        userId,
        body: req.body.body,
        authorName: req.body.authorName,
        authorEmail: req.body.authorEmail,
        isApproved: false,
      });

      if (!validationResult.success) {
        const errorMessage = fromError(validationResult.error).toString();
        return res.status(400).json({ message: errorMessage });
      }

      const { body: commentBody, authorName, authorEmail } = validationResult.data;

      // Sanitize inputs to prevent XSS attacks
      const sanitizedComment = {
        materialId,
        userId,
        authorName: sanitizeText(authorName),  // Strip all HTML
        authorEmail: sanitizeEmail(authorEmail),  // Clean email
        body: sanitizeText(commentBody),  // Strip all HTML - comments are plain text
        isApproved: false,
      };


      await db.insert(materialComments).values(sanitizedComment);

      console.log('[COMMENT] New comment submitted for moderation:', {
        materialId,
        authorEmail: sanitizedComment.authorEmail,
        bodyLength: sanitizedComment.body.length,
      });

      res.json({ success: true, message: "A hozzászólásod moderálásra vár. Jóváhagyás után látható lesz." });
    } catch (error: any) {
      console.error('[COMMENT] Error submitting comment:', error);
      res.status(500).json({ message: "Hiba történt a hozzászólás elküldésekor" });
    }
  });

  // ========================================
  // PHASE 10: EXPORT & QR CODE GENERATION
  // ========================================

  // Generate QR code for material (public)
  app.get("/api/materials/:id/qr", async (req, res) => {
    try {
      const materialId = req.params.id;
      const QRCode = (await import("qrcode")).default;

      // Generate QR code for material URL
      const materialUrl = getMaterialPreviewUrl(materialId);
      const qrDataUrl = await QRCode.toDataURL(materialUrl, {
        errorCorrectionLevel: "H",
        width: 512,
        margin: 2
      });

      res.json({ qrCode: qrDataUrl, url: materialUrl });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Database diagnostic endpoint (public access)
  adminRouter.get("/database/info", async (req, res) => {
    try {

      const materialsCount = await storage.getAllHtmlFiles();
      const usersCount = await db.select().from(users);

      // SQLite doesn't have information_schema
      // Skip table listing for SQLite

      res.json({
        materials: materialsCount.length,
        users: usersCount.length,
        tables: ['html_files', 'users', 'extra_emails', 'material_views', 'email_subscriptions', 'tags', 'system_prompts', 'email_logs'], // Static list for SQLite
        databaseType: 'SQLite',
      });
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // Export material as ZIP (public access)
  adminRouter.get("/materials/:id/export", async (req, res) => {
    try {
      const materialId = req.params.id;
      const file = await storage.getHtmlFile(materialId);

      if (!file) {
        return res.status(404).json({ message: "Material not found" });
      }

      const archiver = (await import("archiver")).default;
      const archive = archiver("zip", { zlib: { level: 9 } });

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${file.title.replace(/[^a-z0-9]/gi, '_')}.zip"`);

      archive.pipe(res);
      archive.append(file.content, { name: "index.html" });
      archive.append(JSON.stringify({
        title: file.title,
        description: file.description,
        classroom: file.classroom,
        createdAt: file.createdAt
      }, null, 2), { name: "metadata.json" });

      await archive.finalize();
    } catch (error: any) {
      res.status(500).json({ message: error.message });
    }
  });

  // ========================================
  // SEO: SITEMAP.XML ENDPOINT
  // ========================================

  app.get("/sitemap.xml", async (req, res) => {
    try {
      const baseUrl = process.env.CUSTOM_DOMAIN
        ? `https://${process.env.CUSTOM_DOMAIN}`
        : `https://${req.get('host')}`;

      // Get all published materials
      const materials = await storage.getAllHtmlFiles();
      const publishedMaterials = materials.filter((m: any) => !m.isDraft);

      // Build sitemap XML
      const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <!-- Homepage -->
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
    <lastmod>${new Date().toISOString()}</lastmod>
  </url>
  
  <!-- Materials (Published only) -->
${publishedMaterials.map((material: any) => `  <url>
    <loc>${baseUrl}/preview/${material.id}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <lastmod>${material.updatedAt ? new Date(material.updatedAt).toISOString() : new Date(material.createdAt).toISOString()}</lastmod>
  </url>`).join('\n')}
</urlset>`;

      res.header('Content-Type', 'application/xml');
      res.header('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      res.send(sitemap);

      console.log(`[SEO] Sitemap generated with ${publishedMaterials.length} materials`);
    } catch (error: any) {
      console.error('[SEO] Sitemap generation error:', error);
      res.status(500).send('Error generating sitemap');
    }
  });

  // ========================================
  // ADMIN: DOWNLOAD SOURCE CODE AS ZIP
  // ========================================

  adminRouter.get("/download-source", async (req, res) => {
    try {
      console.log('[ADMIN] Source code download requested');

      const archiver = (await import("archiver")).default;
      const fs = await import("fs/promises");
      const path = await import("path");

      const archive = archiver("zip", {
        zlib: { level: 6 } // Good compression but faster than 9
      });

      // Set response headers BEFORE piping
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="anyagok-profiknak-source-${timestamp}.zip"`);
      res.setHeader("Cache-Control", "no-cache");

      // Error handling
      archive.on('error', (err) => {
        console.error('[ADMIN] Archive error:', err);
        if (!res.headersSent) {
          res.status(500).json({ message: "Hiba a forráskód letöltése során: " + err.message });
        }
      });

      archive.on('warning', (err) => {
        console.warn('[ADMIN] Archive warning:', err);
      });

      // Pipe archive to response AFTER setting headers
      archive.pipe(res);

      // Get project root directory
      const projectRoot = process.cwd();
      console.log('[ADMIN] Project root:', projectRoot);

      // Key directories to include
      const directories = ['client', 'server', 'shared'];
      const rootFiles = ['package.json', 'tsconfig.json', 'vite.config.ts', 'drizzle.config.ts', 'tailwind.config.ts', 'postcss.config.js'];

      // Add directories
      for (const dir of directories) {
        const dirPath = path.join(projectRoot, dir);
        try {
          await fs.access(dirPath);
          archive.directory(dirPath, dir);
          console.log(`[ADMIN] Added directory: ${dir}`);
        } catch (err) {
          console.warn(`[ADMIN] Directory not found: ${dir}`);
        }
      }

      // Add root files
      for (const file of rootFiles) {
        const filePath = path.join(projectRoot, file);
        try {
          await fs.access(filePath);
          archive.file(filePath, { name: file });
          console.log(`[ADMIN] Added file: ${file}`);
        } catch (err) {
          console.warn(`[ADMIN] File not found: ${file}`);
        }
      }

      // Add a README for the downloaded source
      const readmeContent = `# Anyagok Profiknak - Forráskód

## Telepítés

1. Csomagold ki a ZIP fájlt
2. Telepítsd a függőségeket:
   \`\`\`bash
   npm install
   \`\`\`

3. Állítsd be a környezeti változókat (.env fájl):
   - DATABASE_URL
   - ADMIN_EMAIL
   - ANTHROPIC_API_KEY
   - OPENAI_API_KEY
   - VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY
   - RESEND_API_KEY, RESEND_FROM_EMAIL
   - További változók a projekt dokumentációjában

4. Indítsd el a fejlesztői szervert:
   \`\`\`bash
   npm run dev
   \`\`\`

## Dokumentáció

Részletes információk a README fájlokban.

## Letöltés dátuma
${new Date().toLocaleString('hu-HU')}
`;

      archive.append(readmeContent, { name: 'README-DOWNLOAD.md' });
      console.log('[ADMIN] Added README-DOWNLOAD.md');

      // Finalize the archive (this starts the streaming)
      console.log('[ADMIN] Finalizing archive...');
      await archive.finalize();

      console.log('[ADMIN] Source code archive created and sent successfully');
    } catch (error: any) {
      console.error('[ADMIN] Source download error:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Hiba a forráskód letöltése során: " + error.message });
      }
    }
  });

  // ========================================
  // STATIC SOURCE CODE DOWNLOAD
  // ========================================

  app.get("/download-source-static", async (req, res) => {
    try {
      const fs = await import("fs");
      const path = await import("path");

      const filePath = "/tmp/anyagok-profiknak-source.tar.gz";

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ message: "Forráskód fájl nem található" });
      }

      res.setHeader("Content-Type", "application/gzip");
      res.setHeader("Content-Disposition", "attachment; filename=anyagok-profiknak-source.tar.gz");

      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error: any) {
      console.error('[STATIC] Download error:', error);
      res.status(500).json({ message: "Hiba a letöltés során" });
    }
  });

  // ========================================
  // ROBOTS.TXT ENDPOINT
  // ========================================

  app.get("/robots.txt", (req, res) => {
    const baseUrl = process.env.CUSTOM_DOMAIN
      ? `https://${process.env.CUSTOM_DOMAIN}`
      : `https://${req.get('host')}`;

    const robotsTxt = `# Anyagok Profiknak - robots.txt
User-agent: *
Allow: /
Allow: /preview/
Disallow: /admin

# Sitemap
Sitemap: ${baseUrl}/sitemap.xml

# Crawl-delay
Crawl-delay: 1`;

    res.header('Content-Type', 'text/plain');
    res.send(robotsTxt);
  });

  // ========================================
  // ADMIN SYSTEM PROMPTS MANAGEMENT
  // ========================================

  // Get all system prompts (public access)
  adminRouter.get("/system-prompts", async (req, res) => {
    try {
      const prompts = await db
        .select()
        .from((await import('@shared/schema')).systemPrompts)
        .orderBy(desc((await import('@shared/schema')).systemPrompts.updatedAt));

      res.json(prompts);
    } catch (error: any) {
      console.error('[SystemPrompts] Error fetching prompts:', error);
      res.status(500).json({ message: 'Failed to fetch system prompts' });
    }
  });

  // Get single system prompt (public access)
  adminRouter.get("/system-prompts/:id", async (req, res) => {
    try {
      const { systemPrompts } = await import('@shared/schema');

      const [prompt] = await db
        .select()
        .from(systemPrompts)
        .where(eq(systemPrompts.id, req.params.id))
        .limit(1);

      if (!prompt) {
        return res.status(404).json({ message: 'System prompt not found' });
      }

      res.json(prompt);
    } catch (error: any) {
      console.error('[SystemPrompts] Error fetching prompt:', error);
      res.status(500).json({ message: 'Failed to fetch system prompt' });
    }
  });

  // Create new system prompt (public access)
  adminRouter.post("/system-prompts", async (req, res) => {
    try {
      const { systemPrompts, insertSystemPromptSchema } = await import('@shared/schema');

      // Validate request body
      const result = insertSystemPromptSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          message: fromError(result.error).toString()
        });
      }

      // Check if prompt with same name already exists
      const existing = await db
        .select()
        .from(systemPrompts)
        .where(eq(systemPrompts.name, result.data.name))
        .limit(1)
        .then(rows => rows[0]);

      if (existing) {
        return res.status(409).json({ message: 'System prompt with this ID already exists' });
      }

      // Create new prompt
      const [created] = await db
        .insert(systemPrompts)
        .values(result.data)
        .returning();

      console.log(`[SystemPrompts] Created new prompt: ${created.id}`);
      res.status(201).json(created);
    } catch (error: any) {
      console.error('[SystemPrompts] Error creating prompt:', error);
      res.status(500).json({ message: 'Failed to create system prompt' });
    }
  });

  // Update system prompt (public access)
  app.put("/api/admin/system-prompts/:id", async (req, res) => {
    try {
      const { systemPrompts, insertSystemPromptSchema } = await import('@shared/schema');

      // Validate request body
      const result = insertSystemPromptSchema.partial().safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          message: fromError(result.error).toString()
        });
      }

      // Update prompt
      const [updated] = await db
        .update(systemPrompts)
        .set({
          ...result.data,
          updatedAt: new Date(),
        })
        .where(eq(systemPrompts.id, req.params.id))
        .returning();

      if (!updated) {
        return res.status(404).json({ message: 'System prompt not found' });
      }

      console.log(`[SystemPrompts] Updated prompt: ${req.params.id}`);
      res.json(updated);
    } catch (error: any) {
      console.error('[SystemPrompts] Error updating prompt:', error);
      res.status(500).json({ message: 'Failed to update system prompt' });
    }
  });

  // ========================================
  // UNIFIED ERROR HANDLER MIDDLEWARE
  // ========================================

  // Central error handling middleware
  app.use((err: APIError, req: Request, res: Response, next: NextFunction) => {
    // Log error
    console.error('[API Error]', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
      timestamp: new Date().toISOString()
    });

    // Determine status code
    const statusCode = err.status || 500;

    // Determine error type
    let errorType = 'INTERNAL_ERROR';
    let userMessage = 'Váratlan hiba történt. Kérlek próbáld újra később.';

    if (statusCode === 400) {
      errorType = 'VALIDATION_ERROR';
      userMessage = err.message || 'Hibás kérés';
    } else if (statusCode === 401) {
      errorType = 'AUTH_ERROR';
      userMessage = 'Nincs jogosultságod ehhez a művelethez';
    } else if (statusCode === 404) {
      errorType = 'NOT_FOUND';
      userMessage = 'A keresett erőforrás nem található';
    } else if (statusCode === 429) {
      errorType = 'RATE_LIMIT';
      userMessage = 'Túl sok kérés. Kérlek várj egy kicsit.';
    } else if (err.message.includes('AI') || err.message.includes('API')) {
      errorType = 'AI_ERROR';
      userMessage = 'Az AI szolgáltatás átmenetileg nem elérhető. Próbáld újra.';
    }

    // Response format
    res.status(statusCode).json({
      error: {
        type: errorType,
        message: userMessage,
        code: err.code || `ERR_${statusCode}`,
        ...(process.env.NODE_ENV === 'development' && {
          details: err.message,
          stack: err.stack
        })
      }
    });
  });

  // NOTE: DO NOT add a catch-all 404 handler here!
  // The Vite middleware (in development) or static file server (in production)
  // will handle all non-API routes and serve the SPA.

  // ========================================
  // MATERIAL IMPROVEMENT ENDPOINTS
  // ========================================

  // POST /api/admin/improve-material/:id - Create improved version using Claude
  adminRouter.post("/improve-material/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      const { customPrompt } = req.body || {};
      const userId = req.user.id;

      // Get original file
      const originalFile = await storage.getHtmlFile(id);
      if (!originalFile) {
        return res.status(404).json({ message: "Fájl nem található" });
      }

      // Validate content size (max 5MB)
      const contentSizeMB = Buffer.byteLength(originalFile.content, 'utf8') / (1024 * 1024);
      if (contentSizeMB > 5) {
        return res.status(400).json({ message: "A fájl túl nagy (max 5MB)" });
      }

      // Load system prompt from database (tananyag-okosito)
      const { systemPrompts } = await import('@shared/schema');
      let [customSystemPrompt] = await db
        .select()
        .from(systemPrompts)
        .where(
          and(
            eq(systemPrompts.id, 'tananyag-okosito'),
            eq(systemPrompts.isActive, true)
          )
        )
        .limit(1);

      // If prompt doesn't exist, create it with the default professional prompt
      if (!customSystemPrompt) {
        const defaultPrompt = `name: tananyag-okosito
description: Professzionális oktatási tananyagok készítése 3 oldalas HTML artifact formátumban. KOGNITÍV AKTIVÁLÁS technikákkal - váratlan kérdések, előrejelzés, kapu-rendszer, drag&drop, döntési elágazások. Szöveges feladatok (45→15), Kvízek (75→25). Megerősítő kérdés, animált dizájn. UTF-8 ékezetes betűtípusok.
metadata:
  version: "6.0"
  author: "Zoltan"
  last_updated: "2025-12-14"
---

# Tananyag Készítő v6.0 – Tömör verzió

## MIKOR HASZNÁLD
- Interaktív magyar tananyag kvízekkel és feladatokkal (K-8)
- Animált, kognitív aktiválással

---

## KRITIKUS SZABÁLYOK

### CSS SZINTAXIS - KÖTELEZŐ SZABÁLYOK ÉS KONKRÉT KÓD PÉLDÁK

🚨 **KRITIKUSAN FONTOS: MINDIG helyesen írd a CSS-t! EZEK A LEGGYAKORIBB HIBÁK!**

#### CSS VÁLTOZÓK (CSS Variables) - KÖTELEZŐ SZABÁLY:

**✅ HELYES KÓD PÉLDA - ÍRD ÍGY MINDIG:**
\`\`\`css
:root {
  --primary: #4CAF50;
  --secondary: #FF9800;
  --tertiary: #9C27B0;
  --accent: #2196F3;
  --success: #00b894;
  --error: #e17055;
  --warning: #fdcb6e;
  --info: #74b9ff;
}
\`\`\`

**❌ HELYTELEN KÓD PÉLDÁK - SOHA NE ÍRD ÍGY:**
\`\`\`css
:root {
  primary: #4CAF50;  /* HIÁNYZIK A -- */
  secondary: #FF9800;  /* HIÁNYZIK A -- */
  tertiary: #9C27B0;  /* HIÁNYZIK A -- */
  accent: #2196F3;  /* HIÁNYZIK A -- */
}
\`\`\`

**FIGYELEM:** MINDEN változó nevet ellenőrizd, hogy -- prefix-szel kezdődik-e! Ha új változót adsz hozzá (pl. tertiary, accent, info), MINDIG -- prefix-szel kezd!

#### CSS VÁLTOZÓ HASZNÁLAT - KÖTELEZŐ SZABÁLY:

**✅ HELYES KÓD PÉLDÁK - ÍRD ÍGY MINDIG:**
\`\`\`css
.header {
  background: var(--primary);
  color: white;
}
.button {
  background: var(--secondary);
  border-color: var(--tertiary);
}
.success-box {
  background: var(--success);
  color: white;
}
.error-message {
  color: var(--error);
  border-left: 3px solid var(--error);
}
\`\`\`

**❌ HELYTELEN KÓD PÉLDÁK - SOHA NE ÍRD ÍGY:**
\`\`\`css
.header {
  background: primary;  /* HIÁNYZIK A var(--) */
  color: white;
}
.button {
  background: secondary;  /* HIÁNYZIK A var(--) */
  border-color: tertiary;  /* HIÁNYZIK A var(--) */
}
\`\`\`

**FIGYELEM:** MINDIG használj var(--variable-name) formátumot! SOHA ne írj közvetlenül változó nevet!

#### CSS RESET SZABÁLYOK - KÖTELEZŐ SZABÁLY:

**✅ HELYES KÓD PÉLDA - ÍRD ÍGY MINDIG:**
\`\`\`css
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
\`\`\`

VAGY

\`\`\`css
body {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  font-family: 'Segoe UI', 'Noto Sans', system-ui, sans-serif;
}
\`\`\`

**❌ HELYTELEN KÓD PÉLDÁK - SOHA NE ÍRD ÍGY:**
\`\`\`css
{
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
\`\`\`

VAGY

\`\`\`css
box-sizing: border-box;
margin: 0;
padding: 0;
\`\`\`

**FIGYELEM:** MINDIG kell selector (* vagy body vagy más)! SOHA ne írj üres CSS szabályt!

#### CSS OSZTÁLY NEVEK - KÖTELEZŐ SZABÁLY:

**✅ HELYES CSS OSZTÁLY PÉLDÁK - ÍRD ÍGY MINDIG:**
\`\`\`css
.edu-header {
  background: var(--primary);
  color: white;
  padding: 30px;
}
.edu-button {
  background: var(--secondary);
  color: white;
  border: 2px solid var(--tertiary);
  padding: 15px 30px;
  border-radius: 25px;
}
.edu-success-box {
  background: var(--success);
  color: white;
  padding: 20px;
}
.edu-error-text {
  color: var(--error);
}
.edu-prediction-box {
  background: linear-gradient(135deg, #fdcb6e, #ffeaa7);
  padding: 25px;
}
.edu-gate-question {
  background: linear-gradient(135deg, #ff7675, #fab1a0);
  padding: 25px;
}
\`\`\`

**❌ HELYTELEN CSS OSZTÁLY PÉLDÁK - SOHA NE ÍRD ÍGY:**
\`\`\`css
.header {  /* HIÁNYZIK AZ edu- PREFIX */
  background: var(--primary);
}
.button {  /* HIÁNYZIK AZ edu- PREFIX */
  background: var(--secondary);
}
\`\`\`

**FIGYELEM:** MINDEN CSS osztály nevet "edu-" prefix-szel kezdj! Ez biztosítja, hogy ne legyenek ütközések más CSS-sel!

#### TELJES HELYES CSS PÉLDA - ÍRD ÍGY MINDIG:

\`\`\`css
:root {
  --primary: #4CAF50;
  --secondary: #FF9800;
  --tertiary: #9C27B0;
  --accent: #2196F3;
  --success: #00b894;
  --error: #e17055;
  --warning: #fdcb6e;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Segoe UI', 'Noto Sans', system-ui, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.edu-header {
  background: var(--primary);
  color: white;
  padding: 30px;
}

.edu-button {
  background: var(--secondary);
  color: white;
  border: 2px solid var(--tertiary);
}
\`\`\`

### TARTALOM FORRÁS
- **CSAK** a felhasználó által megadott forrásból dolgozz
- **SOHA** ne használj saját példákat

### MENNYISÉGEK
| Típus | Generált | Megjelenített |
|-------|----------|---------------|
| Szöveges feladat | 45 | 15 |
| Kvíz kérdés | 75 | 25 |

### KOGNITÍV KOMPONENSEK (min. 8-10 db/tananyag)
| Komponens | Leírás | Hol |
|-----------|--------|-----|
| prediction-box | Előrejelzés | Szakasz elején |
| gate-question | Kapu kérdés (2-3 db) | Szekciók végén |
| myth-box | Tévhit leleplezés | Gyakori tévedéseknél |
| dragdrop-box | Drag & drop | Hiányzó szavak |
| conflict-box | Kognitív konfliktus | Meglepő tényeknél |
| self-check | Önértékelés slider | Tananyag végén |
| cause-effect | Ok-okozat doboz | Összefüggéseknél |
| popup | Váratlan kérdés | Bekezdések után |

### MEGERŐSÍTÉS
Beküldés előtt: "🤔 Biztos?" modal → Igen/Nem

### UTF-8
\`\`\`css
font-family: 'Segoe UI', 'Noto Sans', system-ui, sans-serif;
\`\`\`
\`\`\`html
<meta charset="UTF-8">
\`\`\`

---

## WORKFLOW

\`\`\`
1. ✅ [Téma] 📘 [Tantárgy] 👥 [Célcsoport] 🎨 [Szín/stílus]
2. HTML mentés: C:\\Tananyagok\\[tema]-[evfolyam].html
3. ✅ Kész
\`\`\`

---

## HTML VÁZLAT

\`\`\`html
<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <title>[CÍM]</title>
  <style>
    /* FONTOS: CSS változók MINDIG -- prefix-szel! MÁSOLD EZT PONTOSAN! */
    :root { 
      --primary: [SZÍN]; 
      --secondary: #FF9800;
      --tertiary: #9C27B0;
      --accent: #2196F3;
      --success: #00b894; 
      --error: #e17055; 
      --warning: #fdcb6e;
      --info: #74b9ff;
    }
    
    /* FONTOS: Reset szabályok MINDIG selectorral! MÁSOLD EZT PONTOSAN! */
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    /* FONTOS: Változók használata MINDIG var(--variable) formátumban! */
    body {
      font-family: 'Segoe UI', 'Noto Sans', system-ui, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    
    /* PÉLDA: Helyes változó használat és osztály prefix */
    .edu-header {
      background: var(--primary);
      color: white;
      padding: 30px;
    }
    
    .edu-button {
      background: var(--secondary);
      color: white;
      border: 2px solid var(--tertiary);
      padding: 15px 30px;
      border-radius: 25px;
    }
    
    .edu-success-box {
      background: var(--success);
      color: white;
      padding: 20px;
    }
    
    .edu-error-text {
      color: var(--error);
    }
    
    .edu-prediction-box {
      background: linear-gradient(135deg, #fdcb6e, #ffeaa7);
      padding: 25px;
      border-radius: 15px;
    }
    
    .edu-gate-question {
      background: linear-gradient(135deg, #ff7675, #fab1a0);
      padding: 25px;
      border-radius: 15px;
    }
    
    @keyframes fadeIn { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
    @keyframes popIn { 0%{opacity:0;transform:scale(0.5)} 100%{opacity:1;transform:scale(1)} }
    @keyframes shake { 0%,100%{transform:translateX(0)} 50%{transform:translateX(-8px)} }
    @keyframes pulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.05)} }
    .page { display:none; } .page.active { display:block; }
  </style>
</head>
<body>
  <!-- Megerősítő modal -->
  <div class="confirm-overlay" id="confirmOverlay">
    <div class="confirm-modal">
      <h3>🤔 Biztos?</h3>
      <button onclick="closeConfirm()">Átgondolom</button>
      <button onclick="proceedEvaluation()">Igen!</button>
    </div>
  </div>

  <!-- Navigáció -->
  <nav class="nav-tabs">
    <button onclick="showPage('content')">📚 Tananyag</button>
    <button onclick="showPage('exercises')">✍️ Feladatok</button>
    <button onclick="showPage('quiz')">❓ Kvíz</button>
  </nav>

  <!-- TANANYAG oldal: tartalom + kognitív komponensek -->
  <div class="page active" id="content">...</div>

  <!-- FELADATOK oldal -->
  <div class="page" id="exercises">
    <div id="exercises-container"></div>
    <button onclick="requestConfirm('exercises')">Ellenőrzés</button>
  </div>

  <!-- KVÍZ oldal -->
  <div class="page" id="quiz">
    <div id="quiz-container"></div>
    <button onclick="requestConfirm('quiz')">Ellenőrzés</button>
  </div>

  <script>
    const exerciseBank = [/* 45 db: {id, q, keywords:[], points} */];
    const quizBank = [/* 75 db: {id, q, options:[], correct:0-3} */];
    let currentExercises = shuffle(exerciseBank).slice(0,15);
    let currentQuiz = shuffle(quizBank).slice(0,25);
    // + navigáció, értékelés, osztályzat logika
  </script>
</body>
</html>
\`\`\`

---

## KOMPONENS MINTÁK

**Kapu kérdés:**
\`\`\`html
<div class="gate-question">
  <h4>🚧 KAPU</h4>
  <p>Kérdés?</p>
  <div onclick="checkGate(1,this,false)">A) Rossz</div>
  <div onclick="checkGate(1,this,true)">B) Helyes</div>
  <div class="gate-feedback" id="gate-fb-1"></div>
</div>
\`\`\`

**Előrejelzés:**
\`\`\`html
<div class="prediction-box">
  <h4>🔮 Tippelj!</h4>
  <textarea id="pred-1"></textarea>
  <button onclick="savePrediction(1)">Mentés</button>
</div>
\`\`\`

**Tévhit:**
\`\`\`html
<div class="myth-box">
  <p class="myth-statement">"Téves állítás"</p>
  <button onclick="voteMy(1,this,true)">Igaz</button>
  <button onclick="voteMy(1,this,false)">Hamis</button>
  <div class="truth-reveal" id="myth-truth-1">Valójában: ...</div>
</div>
\`\`\`

**Ok-okozat:**
\`\`\`html
<div class="cause-effect">
  <div class="cause">OK: Ha...</div>
  <div class="arrow">→</div>
  <div class="effect">OKOZAT: Akkor...</div>
</div>
\`\`\`

**Drag & drop:**
\`\`\`html
<div class="dragdrop-box">
  <p>Mondat <span class="drop-zone" data-answer="helyes"></span> folytatás.</p>
  <div class="drag-items">
    <div class="drag-item" draggable="true" data-value="helyes">helyes</div>
    <div class="drag-item" draggable="true" data-value="rossz">rossz</div>
  </div>
</div>
\`\`\`

---

## ÉRTÉKELÉS

\`\`\`javascript
function getGrade(p) {
  if (p >= 90) return {num:5, text:'Jeles'};
  if (p >= 75) return {num:4, text:'Jó'};
  if (p >= 60) return {num:3, text:'Közepes'};
  if (p >= 40) return {num:2, text:'Elégséges'};
  return {num:1, text:'Elégtelen'};
}
// 80%+ → confetti animáció
\`\`\`

---

## GYORS REFERENCIA

\`\`\`
FELADAT: 45→15 | KVÍZ: 75→25
KOGNITÍV: prediction, gate(2-3), myth, dragdrop, cause-effect, self-check
MODAL: requestConfirm() → "Biztos?" → proceedEvaluation()
OSZTÁLYZAT: 90=5, 75=4, 60=3, 40=2, <40=1
ANIMÁCIÓ: fadeIn, popIn, shake, pulse, float, confetti
OUTPUT: C:\\Tananyagok\\[tema]-[evfolyam].html
UTF-8: 'Segoe UI', 'Noto Sans', system-ui
\`\`\``;

        // Create the system prompt in database (with conflict handling)
        try {
          [customSystemPrompt] = await db
            .insert(systemPrompts)
            .values({
              id: 'tananyag-okosito',
              name: 'tananyag-okosito',
              prompt: defaultPrompt,
              description: 'Professzionális oktatási tananyagok készítése 3 oldalas HTML artifact formátumban. KOGNITÍV AKTIVÁLÁS technikákkal.',
              isActive: true,
            })
            .onConflictDoUpdate({
              target: systemPrompts.id,
              set: {
                prompt: defaultPrompt,
                description: 'Professzionális oktatási tananyagok készítése 3 oldalas HTML artifact formátumban. KOGNITÍV AKTIVÁLÁS technikákkal.',
                isActive: true,
                updatedAt: new Date(),
              },
            })
            .returning();
          
          console.log('[IMPROVE] Created/updated tananyag-okosito system prompt');
        } catch (error: any) {
          // If insert fails, try to fetch existing one
          console.warn('[IMPROVE] Failed to create system prompt, trying to fetch:', error.message);
          [customSystemPrompt] = await db
            .select()
            .from(systemPrompts)
            .where(eq(systemPrompts.id, 'tananyag-okosito'))
            .limit(1);
        }
      }

      // Use the system prompt from database (or fallback to default)
      // CRITICAL: Prepend explicit HTML-only instruction to ensure Claude understands
      const criticalInstruction = `🚨 KRITIKUS UTASÍTÁS - EZT OLVASD ELŐSZÖR! 🚨

A válaszodnak KIZÁRÓLAG HTML KÓDOT kell tartalmaznia, semmi mást!

❌ TILTOTT:
- Leírás vagy magyarázat
- Markdown formátum (code block-ok vagy backtick-ek)
- "Íme a javított HTML:" vagy hasonló szövegek
- "Átdolgoztam a tananyagot" vagy hasonló bevezető szövegek
- "Főbb változtatások:" vagy hasonló listák
- Bármilyen szöveg a HTML kód előtt vagy után

✅ KÖTELEZŐ:
- CSAK a teljes, működő HTML kódot add vissza
- A válaszodnak közvetlenül <!DOCTYPE html> vagy <html> tag-gel kell kezdődnie
- A kód azonnal használható legyen, másolás-kivágás nélkül
- Nincs markdown, nincs leírás, CSAK HTML

🎨 CSS KRITIKUS SZABÁLYOK (MINDIG ELLENŐRIZD MINDEN VÁLTOZÓT ÉS OSZTÁLYT!):
1. MINDEN CSS változó deklarációnak KÖTELEZŐEN -- prefix-szel kell kezdődnie!
   ✅ HELYES: --primary: #4CAF50; --secondary: #FF9800; --tertiary: #9C27B0;
   ❌ HELYTELEN: primary: #4CAF50; secondary: #FF9800; tertiary: #9C27B0;
   ⚠️ FIGYELEM: MINDEN változó nevet ellenőrizd, hogy -- prefix-szel kezdődik-e!
2. MINDIG használj var() függvényt változók használatakor!
   ✅ HELYES: color: var(--primary); background: var(--tertiary);
   ❌ HELYTELEN: color: primary; background: tertiary;
3. MINDEN CSS osztály nevet "edu-" prefix-szel kezdj!
   ✅ HELYES: .edu-header, .edu-button, .edu-success-box, .edu-prediction-box
   ❌ HELYTELEN: .header, .button, .success-box (HIÁNYZIK AZ edu- PREFIX!)
   ⚠️ FIGYELEM: MINDEN osztály nevet ellenőrizd, hogy "edu-" prefix-szel kezdődik-e!
4. SOHA ne írj üres CSS szabályt selector nélkül!
   ✅ HELYES: * { margin: 0; padding: 0; }
   ❌ HELYTELEN: { margin: 0; padding: 0; }

PÉLDA HELYES VÁLASZ (CSAK EZT ÍRD!):
<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <title>...</title>
  <style>
    :root {
      --primary: #4CAF50;
      --secondary: #FF9800;
      --tertiary: #9C27B0;
    }
    * {
      margin: 0;
      padding: 0;
    }
    .edu-header {
      background: var(--primary);
      color: white;
    }
    .edu-button {
      background: var(--secondary);
      border-color: var(--tertiary);
    }
  </style>
</head>
<body>
  ...
</body>
</html>

---
`;

      let systemPrompt = customSystemPrompt?.prompt || `Te egy HTML tananyag javító szakértő vagy. A feladatod, hogy régebbi, kevésbé fejlett HTML tananyagokat modern, responsive, interaktív tananyaggá alakíts.

FONTOS SZABÁLYOK:
1. Tartsd meg az eredeti tartalmat és struktúrát
2. Modernizáld a HTML/CSS-t (responsive design, modern CSS)
3. Javítsd a kódminőséget (semantic HTML, accessibility)
4. Ne változtass a tananyag tartalmán, csak a megjelenésen és technikai minőségen
5. Biztosítsd a mobil kompatibilitást
6. Használj modern CSS-t (Flexbox, Grid, CSS Variables)
7. Optimalizáld a teljesítményt
8. Tartsd meg az eredeti funkcionalitást (quiz, interaktív elemek)
9. Ne használj külső CDN-eket vagy külső scripteket (mindent inline)
10. Biztosítsd a biztonságot (XSS védelem, sanitizáció)

KRITIKUS VÁLASZ FORMATUM:
- CSAK HTML KÓDOT ADJ VISSZA, SEMMI MÁST
- NEM LEÍRÁST, NEM MAGYARÁZATOT, NEM MARKDOWN-T
- NEM "Íme a javított HTML:" vagy hasonló szövegeket
- CSAK A TELJES HTML KÓDOT, AZONNAL HASZNÁLHATÓ FORMÁTBAN
- A válaszodnak közvetlenül <!DOCTYPE html> vagy <html> tag-gel kell kezdődnie`;

      // Prepend critical instruction to the beginning of the prompt
      systemPrompt = criticalInstruction + systemPrompt;

      const userPrompt = `Javítsd az alábbi HTML tananyagot modern, responsive, interaktív tananyaggá a tananyag-okosito rendszer szabályai szerint.

KRITIKUS: A válaszodnak KIZÁRÓLAG HTML KÓDOT kell tartalmaznia, semmi mást! Ne írj leírást, magyarázatot vagy markdown formátumot. Csak a teljes HTML kódot add vissza, ami közvetlenül <!DOCTYPE html> vagy <html> tag-gel kezdődik.

🎨 CSS KRITIKUS SZABÁLYOK - MINDIG ELLENŐRIZD:
1. MINDEN CSS változó deklarációnak -- prefix-szel kell kezdődnie!
   ✅ HELYES: --primary: #4CAF50; --secondary: #FF9800; --tertiary: #9C27B0;
   ❌ HELYTELEN: primary: #4CAF50; secondary: #FF9800; tertiary: #9C27B0;
2. MINDIG használj var() függvényt változók használatakor!
   ✅ HELYES: color: var(--primary); background: var(--tertiary);
   ❌ HELYTELEN: color: primary; background: tertiary;
3. SOHA ne írj üres CSS szabályt selector nélkül!
   ✅ HELYES: * { margin: 0; padding: 0; }
   ❌ HELYTELEN: { margin: 0; padding: 0; }

CÍM: ${originalFile.title}
OSZTÁLY: ${originalFile.classroom}
LEÍRÁS: ${originalFile.description || 'Nincs leírás'}

HTML KÓD:
${originalFile.content}

${customPrompt ? `\n\nEgyedi instrukciók:\n${customPrompt}` : ''}`;

      // Call Claude API
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      const anthropic = new Anthropic({
        apiKey: process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
        baseURL: process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL,
      });

      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-5",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userPrompt,
        }],
      });

      const improvedContent = message.content[0];
      if (!improvedContent || improvedContent.type !== 'text') {
        throw new Error('Invalid response from Claude API');
      }

      // Validate improved HTML
      let improvedHtml = improvedContent.text.trim();
      
      console.log('[IMPROVE] Raw response length:', improvedHtml.length);
      console.log('[IMPROVE] Raw response preview:', improvedHtml.substring(0, 200));
      
      // Step 1: Extract HTML from markdown code blocks (try multiple patterns)
      const markdownPatterns = [
        /```html\s*([\s\S]*?)\s*```/i,           // ```html ... ```
        /```\s*([\s\S]*?)\s*```/s,                // ``` ... ``` (any language)
        /`([\s\S]*?)`/s,                          // ` ... ` (inline code)
      ];
      
      for (const pattern of markdownPatterns) {
        const match = improvedHtml.match(pattern);
        if (match && match[1]) {
          const extracted = match[1].trim();
          // Check if extracted content looks like HTML
          if (extracted.includes('<!DOCTYPE') || extracted.includes('<html') || extracted.includes('<head') || extracted.includes('<body')) {
            improvedHtml = extracted;
            console.log('[IMPROVE] Extracted HTML from markdown code block');
            break;
          }
        }
      }
      
      // Step 2: Find HTML start (look for DOCTYPE or html tag)
      const htmlStartMatch = improvedHtml.match(/(<!DOCTYPE[\s\S]*?<html[\s\S]*?>|<\s*html[\s\S]*?>)/i);
      if (htmlStartMatch) {
        const startIndex = improvedHtml.indexOf(htmlStartMatch[0]);
        improvedHtml = improvedHtml.substring(startIndex);
        console.log('[IMPROVE] Found HTML start at index:', startIndex);
      }
      
      // Step 3: Remove everything before HTML tags
      improvedHtml = improvedHtml.replace(/^[\s\S]*?(?=<!DOCTYPE|<html|<head|<body)/i, '');
      
      // Step 4: Remove markdown formatting characters if still present
      improvedHtml = improvedHtml.replace(/^[#*`\-\s]+/gm, ''); // Remove markdown headers, lists, code markers
      improvedHtml = improvedHtml.replace(/```html\s*/gi, '');
      improvedHtml = improvedHtml.replace(/```\s*/g, '');
      
      // Step 5: Remove common prefixes and explanations
      const prefixPatterns = [
        /^[^\<]*?(?=<!DOCTYPE|<html)/i,
        /^.*?Átdolgoztam.*?(?=<!DOCTYPE|<html)/i,
        /^.*?Az új verzió.*?(?=<!DOCTYPE|<html)/i,
        /^.*?Főbb változtatások.*?(?=<!DOCTYPE|<html)/i,
        /^.*?KOGNITÍV AKTIVÁLÁS.*?(?=<!DOCTYPE|<html)/i,
        /^.*?FELADATOK.*?(?=<!DOCTYPE|<html)/i,
        /^.*?MODERN DIZÁJN.*?(?=<!DOCTYPE|<html)/i,
        /^.*?UTF-8.*?(?=<!DOCTYPE|<html)/i,
        /^.*?LETÖLTÉS.*?(?=<!DOCTYPE|<html)/i,
      ];
      
      for (const pattern of prefixPatterns) {
        improvedHtml = improvedHtml.replace(pattern, '');
      }
      
      // Step 6: Clean up any remaining markdown at the start
      improvedHtml = improvedHtml.trim();
      if (!improvedHtml.startsWith('<!DOCTYPE') && !improvedHtml.startsWith('<html')) {
        // Try to find first HTML tag
        const firstHtmlTag = improvedHtml.match(/<[a-zA-Z]+/);
        if (firstHtmlTag) {
          const tagIndex = improvedHtml.indexOf(firstHtmlTag[0]);
          improvedHtml = improvedHtml.substring(tagIndex);
        }
      }
      
      console.log('[IMPROVE] Cleaned HTML length:', improvedHtml.length);
      console.log('[IMPROVE] Cleaned HTML preview:', improvedHtml.substring(0, 200));
      
      // Step 7: Fix common CSS and HTML syntax errors
      // Fix CSS variable declarations (missing -- prefix)
      // First, find all :root blocks and fix variables inside them
      improvedHtml = improvedHtml.replace(/:root\s*\{([\s\S]*?)\}/gi, (match, content) => {
        // Fix variable declarations inside :root block (e.g., primary: -> --primary:)
        const fixedContent = content.replace(/(\b)(primary|secondary|accent|success|error|warning|info)(\s*:)/gi, '$1--$2$3');
        return `:root {${fixedContent}}`;
      });
      
      // Fix CSS variable usage (missing -- prefix in var() or direct usage)
      improvedHtml = improvedHtml.replace(/var\((\w+)\)/gi, (match, varName) => {
        // If varName doesn't start with --, add it
        if (!varName.startsWith('--')) {
          return `var(--${varName})`;
        }
        return match;
      });
      
      // Fix direct CSS variable usage without var() (e.g., color: primary; -> color: var(--primary);)
      // Process within style tags to avoid false positives
      improvedHtml = improvedHtml.replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, (styleTag, cssContent) => {
        // Fix variable usage in CSS - only if not already in var() call
        // Use a more robust approach: find all matches first, then process them
        const variablePattern = /(:\s*)(primary|secondary|accent|success|error|warning|info)(\s*;)/gi;
        let fixedCss = cssContent;
        let match;
        const replacements: Array<{ index: number; length: number; replacement: string }> = [];
        
        // Find all matches and collect replacements
        while ((match = variablePattern.exec(cssContent)) !== null) {
          const matchIndex = match.index;
          const beforeMatch = cssContent.substring(0, matchIndex);
          const lastVarIndex = beforeMatch.lastIndexOf('var(');
          const lastSemicolonBefore = beforeMatch.lastIndexOf(';');
          const lastParenBefore = beforeMatch.lastIndexOf(')');
          
          // If there's a var( before this match and no closing ) after it (or ) comes after ;), it's inside var()
          const isInsideVar = lastVarIndex !== -1 && (lastParenBefore < lastVarIndex || lastParenBefore < lastSemicolonBefore);
          
          if (!isInsideVar) {
            replacements.push({
              index: matchIndex,
              length: match[0].length,
              replacement: `${match[1]}var(--${match[2]})${match[3]}`
            });
          }
        }
        
        // Apply replacements in reverse order to maintain indices
        replacements.reverse().forEach(({ index, length, replacement }) => {
          fixedCss = fixedCss.substring(0, index) + replacement + fixedCss.substring(index + length);
        });
        
        return styleTag.replace(cssContent, fixedCss);
      });
      
      // Fix empty CSS rules (selector missing) - find standalone { ... } blocks
      // Process style tags separately to avoid false positives
      const styleTagRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
      improvedHtml = improvedHtml.replace(styleTagRegex, (styleTag, cssContent) => {
        let fixedCss = cssContent;
        
        // Fix empty rules - match { ... } blocks that are not preceded by a selector
        // Pattern: { at start of line (or after whitespace), then content, then } at start of line (or before whitespace)
        // More robust: match { that is NOT preceded by a selector (word character before {)
        
        // First, handle multi-line empty rules - this is more common
        // Match: { at start of line, then content (can span multiple lines), then } at start of line
        fixedCss = fixedCss.replace(/(?:^|\n)(\s*)\{\s*((?:box-sizing|margin|padding|border)[\s\S]*?)\}\s*(?=\n|$)/gm, (match, indent, content) => {
          const cleanContent = content.trim();
          // Check if it's a reset rule and doesn't contain nested selectors or other CSS rules
          if (cleanContent.match(/(?:margin|padding|box-sizing)/i) && 
              !cleanContent.match(/[a-zA-Z][\w\-]*\s*\{/) && 
              !cleanContent.match(/@/)) {
            // Preserve indentation and newline structure
            return `${indent}* { ${cleanContent} }`;
          }
          return match;
        });
        
        // Also handle single-line empty rules (fallback)
        fixedCss = fixedCss.replace(/^\s*\{\s*((?:box-sizing|margin|padding|border)[^}]*)\}\s*$/gm, (match, content) => {
          // Check if this looks like a reset rule (contains margin, padding, or box-sizing)
          if (content.match(/(?:margin|padding|box-sizing)/i)) {
            return `* { ${content.trim()} }`;
          }
          return match;
        });
        
        return styleTag.replace(cssContent, fixedCss);
      });
      
      // Fix incomplete keyframes (if @keyframes slideIn is cut off)
      if (improvedHtml.includes('@keyframes slideIn') && !improvedHtml.includes('@keyframes slideIn') || improvedHtml.match(/@keyframes slideIn\s*\{[^}]*$/)) {
        // Try to complete the keyframe or remove it
        improvedHtml = improvedHtml.replace(/@keyframes slideIn\s*\{[^}]*$/m, '@keyframes slideIn {\n  from { transform: translateX(100%); opacity: 0; }\n  to { transform: translateX(0); opacity: 1; }\n}');
      }
      
      // Fix incomplete CSS (if style tag is not closed properly)
      const styleTagMatches = improvedHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
      if (styleTagMatches) {
        styleTagMatches.forEach((styleBlock) => {
          // Check if style block has unclosed braces
          const openBraces = (styleBlock.match(/\{/g) || []).length;
          const closeBraces = (styleBlock.match(/\}/g) || []).length;
          if (openBraces > closeBraces) {
            // Try to fix by adding missing closing braces
            const missingBraces = openBraces - closeBraces;
            const fixedStyleBlock = styleBlock + '\n' + '}'.repeat(missingBraces);
            improvedHtml = improvedHtml.replace(styleBlock, fixedStyleBlock);
          }
        });
      }
      
      console.log('[IMPROVE] Fixed CSS syntax errors');
      
      // Step 8: Basic HTML structure validation - wrap if needed
      if (!improvedHtml.includes('<html') && !improvedHtml.includes('<!DOCTYPE')) {
        console.warn('[IMPROVE] No HTML structure found, wrapping content');
        // If no full HTML structure, wrap it
        improvedHtml = wrapHtmlWithResponsiveContainer(improvedHtml);
      }

      // Content size validation
      const improvedSizeMB = Buffer.byteLength(improvedHtml, 'utf8') / (1024 * 1024);
      if (improvedSizeMB > 5) {
        return res.status(400).json({ message: "A javított fájl túl nagy (max 5MB)" });
      }

      // XSS and script injection checks
      // NOTE: onclick and onerror are allowed because:
      // 1. HTML is rendered in sandboxed iframe (MaterialImprover.tsx uses sandbox="allow-scripts allow-same-origin")
      // 2. Interactive materials (quizzes, exercises) require onclick handlers
      // 3. CSP headers prevent most XSS attacks
      const dangerousPatterns = [
        /eval\s*\(/i,                    // eval() is dangerous
        /Function\s*\(/i,                 // Function constructor is dangerous
        /setTimeout\s*\([^,]*['"]/i,     // setTimeout with string code is dangerous
        /setInterval\s*\([^,]*['"]/i,    // setInterval with string code is dangerous
        /javascript:\s*[^'"]/i,          // javascript: protocol (but allow in onclick="javascript:void(0)")
        // onclick and onerror are ALLOWED - they're safe in sandboxed iframe
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(improvedHtml)) {
          console.warn('[IMPROVE] Dangerous pattern detected:', pattern.toString());
          return res.status(400).json({ 
            message: "A javított HTML biztonsági problémákat tartalmaz",
            details: `Blokkolt mintázat: ${pattern.toString()}`
          });
        }
      }

      // Create improved file record
      const improvedFile = await storage.createImprovedHtmlFile({
        originalFileId: id,
        title: originalFile.title,
        content: improvedHtml,
        description: originalFile.description,
        classroom: originalFile.classroom,
        contentType: originalFile.contentType || 'html',
        improvementPrompt: customPrompt || 'Default improvement',
        status: 'pending',
        createdBy: userId,
      });

      res.status(201).json(improvedFile);
    } catch (error: any) {
      console.error('[IMPROVE] Error:', error);
      res.status(500).json({ 
        message: error.message || 'Hiba történt a javítás során' 
      });
    }
  });

  // GET /api/admin/improved-files - List all improved files
  adminRouter.get("/improved-files", async (req: any, res) => {
    try {
      const { status, originalFileId } = req.query;
      const files = await storage.getAllImprovedHtmlFiles(
        status as string | undefined,
        originalFileId as string | undefined
      );
      res.json(files);
    } catch (error: any) {
      console.error('[IMPROVED-FILES] Error:', error);
      res.status(500).json({ message: error.message || 'Hiba történt' });
    }
  });

  // GET /api/admin/improved-files/:id - Get single improved file with original
  adminRouter.get("/improved-files/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      const improved = await storage.getImprovedHtmlFile(id);
      if (!improved) {
        return res.status(404).json({ message: "Javított fájl nem található" });
      }

      const original = await storage.getHtmlFile(improved.originalFileId);
      res.json({
        ...improved,
        originalFile: original,
      });
    } catch (error: any) {
      console.error('[IMPROVED-FILE] Error:', error);
      res.status(500).json({ message: error.message || 'Hiba történt' });
    }
  });

  // POST /api/admin/improved-files/:id/apply - Apply improved file to original
  adminRouter.post("/improved-files/:id/apply", async (req: any, res) => {
    try {
      const { id } = req.params;
      const { createBackup = true, notes } = req.body || {};
      const userId = req.user.id;

      // Validate improved file exists and is approved
      const improved = await storage.getImprovedHtmlFile(id);
      if (!improved) {
        return res.status(404).json({ message: "Javított fájl nem található" });
      }

      if (improved.status !== 'approved') {
        return res.status(400).json({ 
          message: `Csak 'approved' státuszú fájlok alkalmazhatók. Jelenlegi státusz: ${improved.status}` 
        });
      }

      // Apply improved file (with transaction and backup)
      const result = await storage.applyImprovedFileToOriginal(id, userId, createBackup, notes);

      res.json({
        success: true,
        originalFile: result.originalFile,
        backupId: result.backupId,
        message: 'Javított fájl sikeresen alkalmazva',
      });
    } catch (error: any) {
      console.error('[APPLY-IMPROVED] Error:', error);
      res.status(500).json({ 
        message: error.message || 'Hiba történt az alkalmazás során' 
      });
    }
  });

  // PATCH /api/admin/improved-files/:id - Update improved file status/notes
  adminRouter.patch("/improved-files/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status, improvementNotes } = req.body || {};

      if (!status || !['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: "Érvénytelen státusz" });
      }

      const updated = await storage.updateImprovedHtmlFileStatus(id, status, undefined, improvementNotes);
      if (!updated) {
        return res.status(404).json({ message: "Javított fájl nem található" });
      }

      res.json(updated);
    } catch (error: any) {
      console.error('[UPDATE-IMPROVED] Error:', error);
      res.status(500).json({ message: error.message || 'Hiba történt' });
    }
  });

  // DELETE /api/admin/improved-files/:id - Delete improved file
  adminRouter.delete("/improved-files/:id", async (req: any, res) => {
    try {
      const { id } = req.params;

      // Validate status (only pending or rejected can be deleted)
      const improved = await storage.getImprovedHtmlFile(id);
      if (!improved) {
        return res.status(404).json({ message: "Javított fájl nem található" });
      }

      if (!['pending', 'rejected'].includes(improved.status)) {
        return res.status(400).json({ 
          message: `Csak 'pending' vagy 'rejected' státuszú fájlok törölhetők. Jelenlegi státusz: ${improved.status}` 
        });
      }

      const deleted = await storage.deleteImprovedHtmlFile(id);
      if (!deleted) {
        return res.status(404).json({ message: "Javított fájl nem található" });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error('[DELETE-IMPROVED] Error:', error);
      res.status(500).json({ message: error.message || 'Hiba történt' });
    }
  });

  // ========================================
  // MATERIAL IMPROVEMENT BACKUP ENDPOINTS
  // ========================================

  // GET /api/admin/improvement-backups - List all improvement backups
  adminRouter.get("/improvement-backups", async (req: any, res) => {
    try {
      const { originalFileId } = req.query;
      const backups = await storage.getAllMaterialImprovementBackups(
        originalFileId as string | undefined
      );
      res.json(backups);
    } catch (error: any) {
      console.error('[IMPROVEMENT-BACKUPS] Error:', error);
      res.status(500).json({ message: error.message || 'Hiba történt' });
    }
  });

  // GET /api/admin/improvement-backups/:id - Get single backup
  adminRouter.get("/improvement-backups/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      const backup = await storage.getMaterialImprovementBackup(id);
      if (!backup) {
        return res.status(404).json({ message: "Backup nem található" });
      }
      res.json(backup);
    } catch (error: any) {
      console.error('[IMPROVEMENT-BACKUP] Error:', error);
      res.status(500).json({ message: error.message || 'Hiba történt' });
    }
  });

  // POST /api/admin/improvement-backups/:id/restore - Restore from backup
  adminRouter.post("/improvement-backups/:id/restore", async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const result = await storage.restoreFromMaterialImprovementBackup(id, userId);
      res.json({
        success: true,
        restoredFile: result.restoredFile,
        message: 'Fájl sikeresen visszaállítva',
      });
    } catch (error: any) {
      console.error('[RESTORE-BACKUP] Error:', error);
      res.status(500).json({ 
        message: error.message || 'Hiba történt a visszaállítás során' 
      });
    }
  });

  // DELETE /api/admin/improvement-backups/:id - Delete backup
  adminRouter.delete("/improvement-backups/:id", async (req: any, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteMaterialImprovementBackup(id);
      if (!deleted) {
        return res.status(404).json({ message: "Backup nem található" });
      }
      res.json({ success: true });
    } catch (error: any) {
      console.error('[DELETE-BACKUP] Error:', error);
      res.status(500).json({ message: error.message || 'Hiba történt' });
    }
  });

  // Register admin router with authentication middleware
  // ALL /api/admin/* routes require admin authentication
  app.use('/api/admin', isAuthenticatedAdmin, adminRouter);

  const httpServer = createServer(app);

  return httpServer;
}
