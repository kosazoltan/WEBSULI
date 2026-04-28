import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import express from "express";
import { csrfSync } from "csrf-sync";
import { storage } from "./storage";
import { insertHtmlFileSchema, insertEmailSubscriptionSchema, insertExtraEmailSchema, insertMaterialCommentSchema, insertImprovedHtmlFileSchema, type EmailSubscription, type User, type HtmlFile, type ImprovedHtmlFile, type MaterialImprovementBackup } from "@shared/schema";
import { fromError } from "zod-validation-error";
import { z } from "zod";
import { sendNewMaterialNotification, isResendConfigured } from "./resend";
import { sendNewMaterialNotification as sendPushNewMaterial, sendMaterialViewNotification } from "./pushNotifications";
import { getAllAudioBase64 } from "google-tts-api";

import { eq, sql, and, or, ilike, desc, inArray } from "drizzle-orm";
import { htmlFiles, users, emailSubscriptions, extraEmailAddresses, materialComments } from "@shared/schema";
import { sanitizeText, sanitizeHtml, sanitizeEmail, sanitizeUserAgent, sanitizeUrl } from "./utils/sanitize";
// Admin authentication with hardcoded admin emails
import { setupAuth, isAuthenticated, isAuthenticatedAdmin } from "./auth";
import * as gameScoreService from "./gameScoreService";
import * as gameQuizBankService from "./gameQuizBankService";
import { generateMaterialQuiz } from "./gameQuizGeneratorService";
// checkIsAdmin import removed

import { db } from "./db";
import { getMaterialPreviewUrl, getBaseUrl } from "./utils/config";
import { triggerEventBackup, listBackups, readBackup, createAutoBackup } from "./autoBackup";
import { getHtmlFilesCache } from "./cache/HtmlFilesCache";

// ========== AI Configuration Validation ==========
function validateAIConfig() {
  // Only API keys are required - BASE_URLs are optional (SDKs have defaults)
  const requiredEnvVars = [
    'AI_INTEGRATIONS_OPENAI_API_KEY',
    'AI_INTEGRATIONS_ANTHROPIC_API_KEY',
  ];
  const optionalEnvVars = [
    'AI_INTEGRATIONS_OPENAI_BASE_URL',
    'AI_INTEGRATIONS_ANTHROPIC_BASE_URL',
  ];

  const missing = requiredEnvVars.filter(key => !process.env[key]);
  const missingOptional = optionalEnvVars.filter(key => !process.env[key]);

  if (missing.length > 0) {
    console.error('❌ Missing required AI API keys:', missing.join(', '));
    throw new Error(
      `Hiányzó AI API kulcsok: ${missing.join(', ')}. ` +
      `Kérlek állítsd be az environment variable-öket.`
    );
  }

  if (missingOptional.length > 0) {
    console.warn('⚠️ Optional AI BASE_URLs not set (using SDK defaults):', missingOptional.join(', '));
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
        // Email címzettek (környezeti változóból, vesszővel elválasztva)
        var recipients = '${process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "admin@websuli.org"}';
        
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
        var recipient = to || '${process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "admin@websuli.org"}';
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
const requireAdmin = (handler: (req: Request, res: Response) => Promise<void>) => {
  return [isAuthenticatedAdmin, handler];
};

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth setup is now handled in index.ts to ensure correct order
  // await setupAuth(app);

  // SECURITY: CSRF Protection using modern csrf-sync library
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
    if (path.startsWith('/api/ai/') || path.startsWith('/api/admin/improve-material/') || path.startsWith('/api/admin/improved-files/')) {
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
  app.get('/api/auth/user', async (req: Request, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.json(null);
      }

      // Try to find user by email (primary lookup) since upsertUser may update
      // existing users by email without changing their ID
      const userEmail = req.user.email;
      let user = userEmail ? await storage.getUserByEmail(userEmail) : null;

      // Fallback to ID lookup if email lookup fails
      if (!user) {
        const userId = req.user!.id;
        user = await storage.getUser(userId) || null;
      }

      if (!user) {
        console.warn('[AUTH] User not found after OIDC login:', userEmail);
        return res.json(null);
      }

      // Return user with admin status (convert undefined to null for type safety)
      // SECURITY: Strip password hash before sending to client
      const { password: _, ...safeUser } = user;
      res.json({
        ...safeUser,
        isAdmin: !!user.isAdmin,
      });
    } catch (error) {
      console.error("[AUTH] Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // SECURITY: CSRF Token Endpoint
  // Frontend fetches this token and includes it in all mutating requests (POST/PUT/DELETE)
  app.get('/api/csrf-token', (req: Request, res) => {
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

  // Játékok — katalógus és ranglista (nyilvános olvasás)
  const gamesCatalogFallback = [
    {
      id: "tsunami-english",
      title: "Szökőár szökés — Angol",
      description:
        "3–5. osztályos angol: válassz nehézséget indulás előtt. Hosszabb menetek, a körön belül egyre nehezebb kérdések és gyorsuló hullám.",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
    },
    {
      id: "word-ladder-hu-en",
      title: "Szólétra (HU ↔ EN)",
      description:
        "3–5. osztályos szókincs és párosítás (HU ↔ EN). Minden jó válasz egy léc — a menet végére nehezebb feladatok.",
      sortOrder: 2,
      createdAt: new Date().toISOString(),
    },
    {
      id: "speed-quiz-math",
      title: "Gyors matek sprint",
      description: "Gyors matek kihívás: helyes válasz = pont + kombó szorzó.",
      sortOrder: 3,
      createdAt: new Date().toISOString(),
    },
    {
      id: "block-craft-quiz",
      title: "Kockavadász kvíz",
      description: "Minecraft hangulatú 2D világ: bányászat + angol kvíz.",
      sortOrder: 4,
      createdAt: new Date().toISOString(),
    },
  ];

  function isMissingGamesTableError(err: unknown): boolean {
    const code = (err as { code?: string })?.code;
    const msg = String((err as { message?: string })?.message ?? "");
    return code === "42P01" || /games_catalog|game_scores|relation .* does not exist/i.test(msg);
  }

  app.get("/api/games/catalog", async (_req, res) => {
    try {
      const rows = await gameScoreService.listGamesCatalog();
      res.json(rows);
    } catch (e) {
      if (isMissingGamesTableError(e)) {
        console.warn("[GAMES] catalog fallback because DB table missing");
        return res.json(gamesCatalogFallback);
      }
      console.error("[GAMES] catalog", e);
      res.status(500).json({ message: "Nem sikerült betölteni a játéklistát." });
    }
  });

  /** Nyilvános: játék kvíz-bank (Neon `game_quiz_items` + kliens statikus fallback) */
  app.get("/api/games/quiz-bank/:gameId", async (req, res) => {
    try {
      const gameId = typeof req.params.gameId === "string" ? req.params.gameId : "";
      const rows = await gameQuizBankService.listGameQuizBank(gameId);
      res.json({
        gameId,
        items: rows.map((r) => ({
          id: r.id,
          tier: r.tier,
          topic: r.topic,
          prompt: r.prompt,
          options: r.options,
          correctIndex: r.correctIndex,
          sourceMaterialId: r.sourceMaterialId,
        })),
      });
    } catch (e) {
      console.error("[GAMES] quiz-bank", e);
      res.json({ gameId: typeof req.params.gameId === "string" ? req.params.gameId : "", items: [] });
    }
  });

  /**
   * Admin: AI-vel generál `count` db (alap: 10) kvíz-tételt egy tananyaghoz.
   * Forrás: `htmlFiles[id]` HTML-tartalma → Claude → strukturált JSON →
   * insert `gameQuizItems`-be (gameId="space-asteroid-quiz" alibi).
   * A material-quizzes endpoint utána automatikusan visszaadja az adott
   * osztály összes játékához.
   */
  app.post("/api/admin/materials/:id/generate-quiz", isAuthenticatedAdmin, async (req: Request, res) => {
    try {
      const id = typeof req.params.id === "string" ? req.params.id : "";
      const countRaw = typeof req.body?.count === "number" ? req.body.count : 10;
      if (!id) return res.status(400).json({ message: "Hiányzó tananyag ID." });
      const result = await generateMaterialQuiz(id, countRaw);
      return res.json(result);
    } catch (e) {
      console.error("[GAMES] generate-quiz", e);
      const msg = e instanceof Error ? e.message : "Ismeretlen hiba.";
      return res.status(500).json({ message: msg });
    }
  });

  /**
   * Nyilvános: a megadott osztály legutóbbi N (alap: 3) tananyagához kapcsolt
   * kvíz-tételek. Játék-specifikus, "személyre szabott" kérdésekhez (Space
   * Asteroid Quiz, BlockCraft, Brain Rot, Tsunami stb.). Ha az osztálynak
   * nincs anyaga vagy nincs csatolt kvíz, `items: []` üres tömböt ad vissza,
   * és a kliens statikus fallbackre vált.
   *
   * NB: a lekérdezés gameId-tól FÜGGETLEN — minden játék közösen használja
   * ugyanazt a pool-t, és kliens-oldalon szűr `topic` alapján (pl. Speed
   * Quiz Math csak `topic === "math"`).
   */
  app.get("/api/games/material-quizzes", async (req, res) => {
    try {
      const classroomRaw =
        typeof req.query.classroom === "string" ? parseInt(req.query.classroom, 10) : NaN;
      const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 3;
      if (!Number.isFinite(classroomRaw) || classroomRaw < 0 || classroomRaw > 12) {
        return res.status(400).json({ message: "classroom 0–12 között legyen." });
      }
      const limit = Number.isFinite(limitRaw) ? limitRaw : 3;
      const result = await gameQuizBankService.listLatestMaterialQuizzes(classroomRaw, limit);
      res.json({
        classroom: result.classroom,
        materials: result.materials,
        items: result.items.map((r) => ({
          id: r.id,
          tier: r.tier,
          topic: r.topic,
          prompt: r.prompt,
          options: r.options,
          correctIndex: r.correctIndex,
          sourceMaterialId: r.sourceMaterialId,
        })),
      });
    } catch (e) {
      console.error("[GAMES] material-quizzes", e);
      res.json({ classroom: 0, materials: [], items: [] });
    }
  });

  app.get("/api/games/leaderboard", async (req, res) => {
    try {
      const gameId = typeof req.query.gameId === "string" ? req.query.gameId : "";
      const difficulty =
        typeof req.query.difficulty === "string" ? req.query.difficulty : "normal";
      const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 20;
      const limit = Number.isFinite(limitRaw) ? limitRaw : 20;
      if (!gameId || !["easy", "normal", "hard"].includes(difficulty)) {
        return res.status(400).json({ message: "Érvénytelen gameId vagy difficulty." });
      }
      const board = await gameScoreService.getLeaderboard(gameId, difficulty, limit);
      res.json(board);
    } catch (e) {
      if (isMissingGamesTableError(e)) {
        console.warn("[GAMES] leaderboard fallback because DB table missing");
        return res.json([]);
      }
      console.error("[GAMES] leaderboard", e);
      res.status(500).json({ message: "Ranglista hiba." });
    }
  });

  // Google + e-mail lista (feliratkozás vagy extra e-mail) — szinkron jogosultság
  app.get("/api/games/sync-eligibility", async (req: Request, res) => {
    try {
      if (!req.isAuthenticated() || !req.user) {
        return res.json({ eligible: false, reason: "not_logged_in" as const });
      }
      const sessionUser = req.user as User;
      const user = (await storage.getUser(sessionUser.id)) ?? sessionUser;
      const result = await gameScoreService.getGameSyncEligibility(user);
      res.json(result);
    } catch (e) {
      console.error("[GAMES] sync-eligibility", e);
      res.status(500).json({ message: "Hiba." });
    }
  });

  const submitGameScoreSchema = z.object({
    gameId: z.string().min(1).max(64),
    difficulty: z.enum(["easy", "normal", "hard"]),
    runXp: z.number().int().min(0).max(200000),
    runStreak: z.number().int().min(0).max(10000),
    runSeconds: z.number().int().min(0).max(86400),
  });

  app.post("/api/games/score", isAuthenticated, async (req: Request, res) => {
    try {
      const parsed = submitGameScoreSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: fromError(parsed.error).toString() });
      }
      const sessionUser = req.user as User;
      const user = (await storage.getUser(sessionUser.id)) ?? sessionUser;
      const el = await gameScoreService.getGameSyncEligibility(user);
      if (!el.eligible) {
        return res.status(403).json({
          message:
            "Csak Google bejelentkezéssel és értesítő e-mail listán szereplő címmel menthető a pont.",
          reason: el.reason,
        });
      }
      const row = await gameScoreService.submitGameScore({
        userId: user.id,
        ...parsed.data,
      });
      res.json(row);
    } catch (e: unknown) {
      if (e instanceof Error && e.message === "invalid_difficulty") {
        return res.status(400).json({ message: "Érvénytelen nehézség." });
      }
      const code = (e as { code?: string })?.code;
      if (code === "23503") {
        return res.status(400).json({ message: "Ismeretlen játék azonosító." });
      }
      console.error("[GAMES] score submit", e);
      res.status(500).json({ message: "Mentés sikertelen." });
    }
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('Responsive fix error:', error);
      res.status(500).json({ message: 'Hiba történt', error: err.message });
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
        model: "claude-3-5-sonnet-20241022",
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('HTML fix error:', error);
      res.status(500).json({ message: 'Hiba történt az elemzés során', error: err.message });
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
        model: "claude-3-5-sonnet-20241022",
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('Theme fix error:', error);
      res.status(500).json({ message: 'Hiba történt a színséma alkalmazása során', error: err.message });
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
        message: `🤖 AI elindítja a ${taskDescription}…`
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

      } catch (parseError: unknown) {
        const parseErrorTyped = parseError instanceof Error ? parseError : new Error(String(parseError));
        console.error('[AI FIX] ❌ JSON parsing/validation failed:', parseErrorTyped.message);
        console.error('[AI FIX] Raw JSON response:', rawJsonResponse.substring(0, 500));

        // Fallback: send raw response with detailed error
        res.write(`data: ${JSON.stringify({
          type: 'complete',
          message: '⚠️ Claude befejezte, de a JSON validálás sikertelen',
          fullResponse: explanationText + '\n\n' + rawJsonResponse,
          parseError: parseErrorTyped.message,
          validatedJson: null
        })}\n\n`);
      }

      res.end();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('HTML fix chat error:', error);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: err.message || 'Hiba történt az elemzés során'
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('Apply fix error:', error);
      res.status(500).json({ message: 'Hiba történt a javítás alkalmazása során', error: err.message });
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
          .filter((msg: { role: string; content: string }) => msg.role !== 'system')
          .map((msg: { role: string; content: string }) => ({
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

      // Default system prompt (fallback if not in DB) - KARCSULT DE EGYÉRTELMŰ VERZIÓ
      const defaultSystemPrompt = `Te egy interaktív HTML tananyag készítő asszisztens vagy (Tananyag Készítő v7.1).

FELADATOD:
1. Beszélgess a felhasználóval, kérdezz rá (téma, osztály, tartalom, stílus)
2. Ha elég információ van (téma + osztály + tartalom), készíts TELJES HTML-t
3. HTML generálásnál MINDIG kezd: <!-- HTML_START --> (ez kötelező!)
4. Ha az évfolyam nincs megadva, KÉRD EL mielőtt generálnál

MIKOR GENERÁLJ HTML-T:
- Ha a felhasználó kéri: "készítsd el", "generáld", "csináld meg", stb.
- Ha elég információ van: téma, osztály, tartalom

## 4 OLDALAS STRUKTÚRA (KÖTELEZŐ)
| Tab | Cím | Tartalom |
|-----|------|----------|
| 1 | 📖 Tananyag | Részletes lexikális tudás, fejezetek, info-boxok, vizuális kártyák |
| 2 | 🧠 Módszerek | Min. 10 kognitív aktivációs elem (MIND a 10 típus!) |
| 3 | ✏️ Feladatok | 45 feladat bankban, 15 véletlenszerűen – szinonima kiértékelés |
| 4 | 🎯 Kvíz | 75 kérdés bankban, 25 véletlenszerűen – 3 válasz (A/B/C) |

## 1. OLDAL – TANANYAG
- Teljes tankönyvi anyag fejezetekre bontva
- Korosztályhoz igazított szókincs:
  - 1-3. évf.: rövid mondatok, egyszerű szavak
  - 4-6. évf.: közepes mondatok, hétköznapi példák
  - 7-8. évf.: összetettebb gondolatok, ok-okozat
- Info-box-ok (érdekesség, figyelem, összefoglalás)
- Vizuális kártyák szöveges tartalommal (NEM emoji állatképek!)
- Fejezetek accordionban vagy kártyákon
- Minden fejezet végén mini-összefoglaló box

## 2. OLDAL – MÓDSZEREK (10 kognitív elem – MIND szerepeljen)
| Elem | Leírás |
|------|--------|
| prediction-box | "Szerinted mi fog történni ha...?" – beír, megmutatja a választ |
| gate-question | Kapukérdés (2-3 db): helyes válasz után mutatja a továbbit |
| myth-box | Igaz/hamis tévhit, kattintásra magyarázat |
| dragdrop-box | Húzd a helyére – touch events mobilon! |
| cause-effect | Ok→hatás lánc, kattintható lépésekkel |
| conflict-box | Meglepő tény vagy paradoxon |
| self-check | Önértékelő csúszka (1-100) visszajelzéssel |
| popup-trigger | Kattintásra/érintésre felugró kérdés |
| timeline | Folyamat vagy idősor interaktívan |
| analogy-box | Korosztályhoz illő hasonlat |

## 3. OLDAL – FELADATOK
- 45 feladatot generálj, 15 megjelenik véletlenszerűen
- KIZÁRÓLAG az 1. oldal tartalmából képzett kérdések!
- Nyílt végű kérdések, textarea inputtal
- Szinonima/kulcsszó-alapú kiértékelés (NEM szó szerinti!)
- 🔄 Újragenerálás gomb TETEJÉN, ✅ Kiértékelés ALJÁN
- Konfirmációs HTML modal kiértékelés előtt

## 4. OLDAL – KVÍZ
- 75 kérdés, 25 megjelenik véletlenszerűen
- 3 válasz (A/B/C) – NEM 4!
- { q: 'Kérdés?', opts: ['A', 'B', 'C'], correct: 0 }
- 🔄 Újragenerálás gomb TETEJÉN, ✅ Kiértékelés ALJÁN
- Konfirmációs HTML modal
- Eredmény az oldalon (NEM alert!)

## ÉRTÉKELÉS
90%=5 🏆 Jeles, 75%=4 😊 Jó, 60%=3 🙂 Közepes, 40%=2 😐 Elégséges, <40%=1 😞 Elégtelen

## TECHNIKAI KÖVETELMÉNYEK
- IIFE wrapper: (function(){ 'use strict'; ... })()
- Tab-váltókat window-ra: window.PREFIX_showTab = function(id){...};
- TILOS: alert()/confirm()/prompt() – csak HTML modal
- TILOS: inline JSON onclick – globális változó + addEventListener
- Touch events drag&drop-hoz (touchstart/touchmove/touchend, { passive: false })
- Min. 44px kattintható területek
- JSON mentés: globális változó + addEventListener + Blob download

## CSS SZABÁLYOK
- Egyedi CSS prefix (2-3 betűs, téma alapján, pl. fo-, tr-, mk-)
- :root { --primary: COLOR; --success: #00b894; --error: #e17055; }
- * { box-sizing: border-box; margin: 0; padding: 0; }
- Font: Segoe UI, Noto Sans, system-ui, sans-serif (SOHA @font-face vagy Google Fonts!)
- Sticky nav: position: sticky; top: 0; z-index: 100;
- Reszponzív 320px–2560px: clamp() font-size, @media 480px és 1400px
- Minden gomb: min-height: 44px;
- Animációk: fadeIn, popIn keyframes

## HTML PÉLDA KEZDÉS:
<!-- HTML_START -->
<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[CÍM]</title>
  <style>
    :root { --primary: #4CAF50; --success: #00b894; --error: #e17055; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Segoe UI, Noto Sans, system-ui, sans-serif; }
    .PREFIX-tab-content { display:none; } .PREFIX-tab-content.active { display:block; }
    .PREFIX-nav { display:flex; position:sticky; top:0; z-index:100; }
    .PREFIX-tab-btn { flex:1; min-height:44px; }
  </style>
</head>
<body>
  <nav class="PREFIX-nav">
    <button class="PREFIX-tab-btn active" onclick="PREFIX_showTab('p1')">📖 Tananyag</button>
    <button class="PREFIX-tab-btn" onclick="PREFIX_showTab('p2')">🧠 Módszerek</button>
    <button class="PREFIX-tab-btn" onclick="PREFIX_showTab('p3')">✏️ Feladatok</button>
    <button class="PREFIX-tab-btn" onclick="PREFIX_showTab('p4')">🎯 Kvíz</button>
  </nav>
  <!-- 4 oldal div-ek + script -->
</body>
</html>

BESZÉLGETÉS: Barátságos, támogató. Ha kész a HTML, jelezd!`;

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
        message: '🤖 Claude csatlakozott…'
      })}\n\n`);

      // Stream Claude's response
      const stream = anthropic.messages.stream({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 8192, // Larger for full HTML generation
        system: systemPrompt,
        messages: messages
      });

      let fullContent = '';
      let htmlContent = '';
      let isCollectingHtml = false;

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          const text = event.delta.text;
          if (!text) continue;

          fullContent += text;

          // Check if HTML generation started
          if (fullContent.includes('<!-- HTML_START -->')) {
            isCollectingHtml = true;
            // Extract HTML from the marker onwards
            const htmlStartIndex = fullContent.indexOf('<!-- HTML_START -->');
            htmlContent = fullContent.substring(htmlStartIndex);
          }

          // If already collecting HTML, add to htmlContent
          if (isCollectingHtml) {
            htmlContent += text;
          }

          // Stream content to frontend
          res.write(`data: ${JSON.stringify({
            type: 'content_delta',
            content: text
          })}\n\n`);
        }
      }

      console.log(`[MATERIAL CREATOR] Stream complete. Full content length: ${fullContent.length}, HTML content length: ${htmlContent.length}, isCollectingHtml: ${isCollectingHtml}`);

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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('Material creator chat error:', error);
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: err.message || 'Hiba történt a beszélgetés során'
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
      const content: Array<{type: "text"; text: string} | {type: "image_url"; image_url: {url: string; detail: "auto" | "low" | "high"}}> = [
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

    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[FILE ANALYSIS] Error:', error);
      res.status(500).json({
        message: err.message || 'Hiba történt a fájlok elemzése során'
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
      const content: Array<{type: "text"; text: string} | {type: "image_url"; image_url: {url: string; detail: "auto" | "low" | "high"}}> = [
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

    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[FILE ANALYSIS] Error:', error);
      res.status(500).json({
        message: err.message || 'Hiba történt a fájl elemzése során'
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

    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      clearTimeout(timeout);

      // Handle abort errors
      if (err.name === 'AbortError' || controller.signal.aborted) {
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
          message: err.message || 'Ismeretlen hiba'
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
          .filter((msg: { role: string; content: string }) => msg.role !== 'system')
          .map((msg: { role: string; content: string }) => ({
            role: (msg.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: msg.content
          }))
        : [];

      messages.push({
        role: 'user' as const,
        content: message
      });

      const systemPrompt = `Te egy interaktív HTML tananyag készítő szakértő vagy (Tananyag Készítő v7.1).

FELADATOD:
1. Beszélgess a felhasználóval a HTML struktúráról, stílusról
2. Ha a felhasználó kéri ("készítsd el", "generáld", "csináld meg"), készíts TELJES HTML-t
3. HTML generálásnál MINDIG kezd: <!-- HTML_START --> (ez kötelező!)

${textContent ? `SZÖVEGES TARTALOM (ezt alakítsd HTML-lé):\n${textContent}\n` : ''}

METADATA:
${metadata?.title ? `Cím: ${metadata.title}` : ''}
${metadata?.description ? `Leírás: ${metadata.description}` : ''}
${metadata?.classroom ? `Osztály: ${metadata.classroom}. osztály` : ''}

## 4 OLDALAS STRUKTÚRA (KÖTELEZŐ)
| Tab | Cím | Tartalom |
|-----|------|----------|
| 1 | 📖 Tananyag | Részletes lexikális tudás, fejezetek, info-boxok |
| 2 | 🧠 Módszerek | Min. 10 kognitív aktivációs elem (MIND a 10 típus!) |
| 3 | ✏️ Feladatok | 45 feladat bankban, 15 véletlenszerűen – szinonima kiértékelés |
| 4 | 🎯 Kvíz | 75 kérdés bankban, 25 véletlenszerűen – 3 válasz (A/B/C) |

## KOGNITÍV ELEMEK – 2. OLDAL (min. 10 db, MIND szerepeljen)
prediction-box, gate-question (2-3 db), myth-box, dragdrop-box (touch events!),
cause-effect, conflict-box, self-check, popup-trigger, timeline, analogy-box

## FELADATOK (3. oldal)
- KIZÁRÓLAG az 1. oldal tartalmából képzett kérdések
- Szinonima/kulcsszó-alapú kiértékelés (NEM szó szerinti!)
- 🔄 Újragenerálás gomb TETEJÉN, ✅ Kiértékelés ALJÁN

## KVÍZ (4. oldal)
- 3 válasz (A/B/C) – NEM 4!
- 🔄 Újragenerálás gomb TETEJÉN, ✅ Kiértékelés ALJÁN
- Eredmény az oldalon (NEM alert!)

## ÉRTÉKELÉS
90%=5 🏆, 75%=4 😊, 60%=3 🙂, 40%=2 😐, <40%=1 😞

## TECHNIKAI KÖVETELMÉNYEK
- IIFE wrapper: (function(){ 'use strict'; ... })()
- Tab-váltókat window-ra: window.PREFIX_showTab = function(id){...};
- TILOS: alert()/confirm()/prompt() – csak HTML modal
- TILOS: inline JSON onclick – globális változó + addEventListener
- Touch events drag&drop-hoz (touchstart/touchmove/touchend, { passive: false })
- Min. 44px kattintható területek
- Egyedi CSS prefix (2-3 betűs, téma alapján)
- Font: Segoe UI, Noto Sans, system-ui, sans-serif (SOHA @font-face vagy Google Fonts!)
- Reszponzív 320px–2560px: clamp() font-size, @media 480px és 1400px
- Sticky nav: position: sticky; top: 0; z-index: 100;
- Konfirmációs HTML modal kiértékelés előtt
- JSON mentés: globális változó + addEventListener + Blob download

HTML PÉLDA KEZDÉS:
<!-- HTML_START -->
<!DOCTYPE html>
<html lang="hu">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[CÍM]</title>
  <style>
    :root { --primary: #4CAF50; --success: #00b894; --error: #e17055; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Segoe UI, Noto Sans, system-ui, sans-serif; }
    .PREFIX-tab-content { display:none; } .PREFIX-tab-content.active { display:block; }
    .PREFIX-nav { display:flex; position:sticky; top:0; z-index:100; }
    .PREFIX-tab-btn { flex:1; min-height:44px; }
  </style>
</head>
<body>
  <nav class="PREFIX-nav">
    <button class="PREFIX-tab-btn active" onclick="PREFIX_showTab('p1')">📖 Tananyag</button>
    <button class="PREFIX-tab-btn" onclick="PREFIX_showTab('p2')">🧠 Módszerek</button>
    <button class="PREFIX-tab-btn" onclick="PREFIX_showTab('p3')">✏️ Feladatok</button>
    <button class="PREFIX-tab-btn" onclick="PREFIX_showTab('p4')">🎯 Kvíz</button>
  </nav>
  <!-- 4 oldal div-ek + script -->
</body>
</html>

BESZÉLGETÉS: Barátságos, támogató. Ha kész a HTML, jelezd!`;

      console.log(`[CLAUDE HTML] Streaming HTML generation...`);
      console.log(`[CLAUDE HTML] System prompt length: ${systemPrompt.length}`);
      console.log(`[CLAUDE HTML] Messages count: ${messages.length}`);

      const stream = await anthropic.messages.stream({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16384, // Increased for full v7.1 HTML generation
        system: systemPrompt,
        messages,
      }, {
        signal: controller.signal
      });

      // Handle abort on client disconnect
      req.on('close', () => {
        controller.abort();
        clearTimeout(timeout);
        console.log('[CLAUDE] Client disconnected, stream aborted');
      });

      let fullContent = '';
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
          fullContent += text;

          // Check if HTML generation started
          if (fullContent.includes('<!-- HTML_START -->')) {
            isCollectingHtml = true;
            // Extract HTML from the marker onwards
            const htmlStartIndex = fullContent.indexOf('<!-- HTML_START -->');
            htmlContent = fullContent.substring(htmlStartIndex);
          }

          // If already collecting HTML, add to htmlContent
          if (isCollectingHtml) {
            htmlContent += text;
          }

          res.write(`data: ${JSON.stringify({
            type: 'content_delta',
            content: text
          })}\n\n`);
        }
      }

      console.log(`[CLAUDE] ✅ Stream complete (${totalEvents} events, full: ${fullContent.length} chars, HTML: ${htmlContent.length} chars, isCollectingHtml: ${isCollectingHtml})`);

      // Send HTML if generated
      if (isCollectingHtml && htmlContent.length > 100) {
        const cleanHtml = htmlContent.replace('<!-- HTML_START -->', '').trim();
        res.write(`data: ${JSON.stringify({
          type: 'html_generated',
          html: cleanHtml
        })}\n\n`);
        console.log(`[CLAUDE] ✅ HTML generated and sent (${cleanHtml.length} chars)`);
      } else {
        console.warn(`[CLAUDE] ⚠️ No HTML generated (isCollectingHtml: ${isCollectingHtml}, htmlContent.length: ${htmlContent.length})`);
      }

      res.write(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      clearTimeout(timeout);

    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      clearTimeout(timeout);

      // Handle abort errors
      if (err.name === 'AbortError' || controller.signal.aborted) {
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
          message: err.message || 'Ismeretlen hiba'
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
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

      // Validate all classrooms are valid numbers 0-12 (0=Programming, 1-12=Grades)
      if (!classrooms.every((c: unknown) => typeof c === 'number' && c >= 0 && c <= 12)) {
        return res.status(400).json({ message: "Minden osztálynak 0 és 12 között kell lennie" });
      }

      // Email validáció
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        return res.status(400).json({ message: "Érvénytelen email cím formátum" });
      }

      // NO AUTH - No creator ID
      const extraEmail = await storage.addExtraEmail(email.trim(), classrooms, null);
      res.json(extraEmail);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("Error adding extra email:", error);
      if (err.message?.includes('duplicate') || err.message?.includes('unique')) {
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
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

      // Validate all classrooms are valid numbers 0-12 (0=Programming, 1-12=Grades)
      if (!classrooms.every((c: unknown) => typeof c === 'number' && c >= 0 && c <= 12)) {
        return res.status(400).json({ message: "Minden osztálynak 0 és 12 között kell lennie" });
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("Error subscribing email:", error);
      if (err.message?.includes('duplicate') || err.message?.includes('unique')) {
        return res.status(400).json({ message: "Ez az email cím már fel van iratkozva" });
      }
      res.status(500).json({ message: "Nem sikerült feliratkozni. Próbáld újra később." });
    }
  });

  // PUBLIC HTML file routes (viewing)
  // Anyone can view materials without authentication
  // Helper function to invalidate HTML files cache
  const invalidateHtmlFilesCache = async () => {
    try {
      const cache = getHtmlFilesCache();
      cache.invalidate();
    } catch (error) {
      // Cache module might not be available, ignore
      console.warn("[CACHE] Failed to invalidate cache:", error);
    }
  };

  app.get("/api/html-files", async (_req, res) => {
    try {
      // Try cache first
      const cache = getHtmlFilesCache();
      const cachedFiles = cache.get();
      
      if (cachedFiles) {
        // Set cache headers for client-side caching
        res.set('Cache-Control', 'public, max-age=60'); // 1 minute client cache
        return res.json(cachedFiles);
      }

      // Cache miss - fetch from database
      const files = await storage.getAllHtmlFiles();
      
      // Store in cache
      cache.set(files);
      
      // Set cache headers
      res.set('Cache-Control', 'public, max-age=60'); // 1 minute client cache
      res.json(files);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
    }
  });

  // Phase 7: Advanced Search - PostgreSQL ILIKE search (case-insensitive)
  app.get("/api/html-files/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.trim().length === 0) {
        return res.status(400).json({ message: "Search query is required" });
      }

      // Sanitize null bytes that cause PostgreSQL errors
      const sanitizedQuery = query.replace(/\0/g, '');

      // PostgreSQL ILIKE for case-insensitive pattern search
      const searchPattern = `%${sanitizedQuery}%`;

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
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error("Search error:", { error: errMsg });
      res.status(500).json({ message: errMsg });
    }
  });

  app.get("/api/html-files/:id", async (req, res) => {
    try {
      const file = await storage.getHtmlFile(req.params.id);
      if (!file) {
        return res.status(404).json({ message: "File not found" });
      }
      res.json(file);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
    }
  });

  // ADMIN-ONLY route - Create new material
  app.post("/api/html-files", isAuthenticatedAdmin, async (req: Request, res) => {
    console.log('[UPLOAD] POST /api/html-files request received, body keys:', Object.keys(req.body || {}), 'content length:', req.body?.content?.length || 0);

    try {
      // Admin authentication required
      const userId = req.user!.id;
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
      // Invalidate cache immediately to ensure new file appears in list
      await invalidateHtmlFilesCache();

      // Return response immediately before sending emails (non-blocking)
      res.status(201).json(file);
      console.log('✅ [UPLOAD] Response sent successfully!');

      // Trigger event-driven backup (debounced, non-blocking)
      triggerEventBackup();

      // Send email notifications in background (fire-and-forget)
      (async () => {
        try {
          const resendState = isResendConfigured();
          if (!resendState.ok) {
            console.error(`[EMAIL] Resend nincs megfelelően konfigurálva: ${resendState.reason}`);
            return;
          }

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
              } catch (err: unknown) {
                const errTyped = err instanceof Error ? err : new Error(String(err));
                failed++;
                console.error('[EMAIL] ✗ Hiba email küldéskor:', recipient.email, 'error:', errTyped.message);
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
    }
  });

  // ADMIN-ONLY route - Update material
  app.patch("/api/html-files/:id", isAuthenticatedAdmin, async (req: Request, res) => {
    try {
      // Admin authentication required
      const userId = req.user!.id;

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

      await invalidateHtmlFilesCache();
      res.json(updatedFile);

      // Trigger event-driven backup (debounced, non-blocking)
      triggerEventBackup();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
    }
  });

  // ADMIN-ONLY route - Batch update display order
  app.post("/api/html-files/reorder", isAuthenticatedAdmin, async (req: Request, res) => {
    try {
      // Admin authentication required
      const userId = req.user!.id;

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

      await invalidateHtmlFilesCache();

      res.json({
        success: true,
        updated: successCount,
        total: items.length
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[REORDER] ❌ Error:', error);
      res.status(500).json({ message: err.message });
    }
  });

  // ADMIN-ONLY route - Delete material
  app.delete("/api/html-files/:id", isAuthenticatedAdmin, async (req: Request, res) => {
    try {
      // Admin authentication required
      const userId = req.user!.id;
      const materialId = req.params.id;
      const deleted = await storage.deleteHtmlFile(materialId, userId);
      if (!deleted) {
        return res.status(404).json({ message: "File not found or unauthorized" });
      }

      // CRITICAL: Set cache-control headers to prevent browser caching of deletion
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
      
      // Invalidate cache after successful deletion (if function exists)
      try {
        if (typeof invalidateHtmlFilesCache === 'function') {
          await invalidateHtmlFilesCache();
        }
      } catch (cacheError: unknown) {
        const cacheErrorTyped = cacheError instanceof Error ? cacheError : new Error(String(cacheError));
        console.warn('[DELETE] Cache invalidation warning:', cacheErrorTyped.message);
      }

      res.status(204).send();

      // Trigger event-driven backup (debounced, non-blocking)
      triggerEventBackup();
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
    }
  });

  // ADMIN-ONLY route - Send email notification for a specific material
  app.post("/api/html-files/:id/send-email", isAuthenticatedAdmin, async (req: Request, res) => {
    try {
      const userId = req.user!.id;

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
      } catch (err: unknown) {
        const errTyped = err instanceof Error ? err : new Error(String(err));
        console.log('[EMAIL] Email cím már létezik vagy hiba:', email, 'message:', errTyped.message);
      }

      // Send email notification
      try {
        const resendState = isResendConfigured();
        if (!resendState.ok) {
          return res.status(503).json({
            message: "Email szolgáltatás nincs beállítva",
            error: resendState.reason,
          });
        }

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
      } catch (emailError: unknown) {
        const emailErrorTyped = emailError instanceof Error ? emailError : new Error(String(emailError));
        console.error(`[EMAIL] Hiba az email küldésekor:`, emailError);
        res.status(500).json({ message: "Email küldési hiba", error: emailErrorTyped.message });
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
    }
  });

  // ADMIN-ONLY route - Get extra email addresses (PII data)
  app.get("/api/extra-emails", isAuthenticatedAdmin, async (req: Request, res) => {
    try {
      const userId = req.user!.id;

      const extraEmails = await storage.getActiveExtraEmails();
      res.json(extraEmails);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
    }
  });

  // REMOVED: Duplicate endpoint - the main one is earlier in the file (line ~1527)

  // ADMIN-ONLY route - Update extra email classrooms (PII data)
  app.patch("/api/extra-emails/:id/classrooms", isAuthenticatedAdmin, async (req: Request, res) => {
    try {
      const userId = req.user!.id;

      const { classrooms } = req.body;
      if (!Array.isArray(classrooms) || classrooms.length === 0) {
        return res.status(400).json({ message: "Legalább egy osztály kiválasztása kötelező" });
      }

      if (!classrooms.every((c: unknown) => typeof c === 'number' && c >= 1 && c <= 8)) {
        return res.status(400).json({ message: "Minden osztálynak 1 és 8 között kell lennie" });
      }

      const updated = await storage.updateExtraEmailClassrooms(req.params.id, classrooms);
      if (!updated) {
        return res.status(404).json({ message: "Email cím nem található" });
      }

      res.json(updated);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
    }
  });

  // ADMIN-ONLY: Tömeges osztály-léptetés ("Új tanév" gomb).
  // Minden aktív extra-email rekord classrooms-ét egyel feljebb lépteti
  // (max 12). Visszaadja a frissített rekordok számát.
  app.post("/api/admin/extra-emails/promote-grade", isAuthenticatedAdmin, async (_req: Request, res) => {
    try {
      const updated = await storage.bulkPromoteExtraEmailClassrooms();
      console.log(`[EMAIL] Új tanév: ${updated} extra-email rekord osztályai egyel feljebb léptetve.`);
      res.json({ updated });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("[EMAIL] Új tanév léptetés hiba:", err);
      res.status(500).json({ message: err.message });
    }
  });

  // ADMIN-ONLY: Szülő-dashboard — minden aktív Google-bejelentkezett tanuló
  // játék-statisztikája az utolsó N nap alapján. Ide az `gameScores` táblát
  // queryeljük, és a `users` táblával join-oljuk a név + email-hez.
  app.get("/api/admin/parent-dashboard", isAuthenticatedAdmin, async (req: Request, res) => {
    try {
      const daysRaw = typeof req.query.days === "string" ? parseInt(req.query.days, 10) : 7;
      const days = Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 90 ? daysRaw : 7;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const { gameScores } = await import("@shared/schema");

      const rows = await db
        .select({
          userId: gameScores.userId,
          gameId: gameScores.gameId,
          totalXp: gameScores.totalXp,
          bestRunXp: gameScores.bestRunXp,
          bestStreak: gameScores.bestStreak,
          bestRunSeconds: gameScores.bestRunSeconds,
          gamesPlayed: gameScores.gamesPlayed,
          updatedAt: gameScores.updatedAt,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        })
        .from(gameScores)
        .leftJoin(users, eq(gameScores.userId, users.id))
        .where(sql`${gameScores.updatedAt} >= ${cutoff}`)
        .orderBy(desc(gameScores.updatedAt));

      // Per-user aggregáció: total XP, total games, best streak, last activity
      const byUser = new Map<string, {
        userId: string;
        name: string;
        email: string | null;
        totalXp: number;
        totalGames: number;
        bestStreak: number;
        lastActivity: string;
        games: Record<string, { totalXp: number; gamesPlayed: number; bestStreak: number; bestRunXp: number }>;
      }>();
      for (const r of rows) {
        const key = r.userId;
        const name = (r.firstName || r.lastName)
          ? `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim()
          : "Névtelen";
        const updatedAtIso = (r.updatedAt instanceof Date ? r.updatedAt : new Date(r.updatedAt as unknown as string)).toISOString();
        const existing = byUser.get(key);
        if (!existing) {
          byUser.set(key, {
            userId: r.userId,
            name,
            email: r.email,
            totalXp: r.totalXp ?? 0,
            totalGames: r.gamesPlayed ?? 0,
            bestStreak: r.bestStreak ?? 0,
            lastActivity: updatedAtIso,
            games: {
              [r.gameId]: {
                totalXp: r.totalXp ?? 0,
                gamesPlayed: r.gamesPlayed ?? 0,
                bestStreak: r.bestStreak ?? 0,
                bestRunXp: r.bestRunXp ?? 0,
              },
            },
          });
        } else {
          existing.totalXp += r.totalXp ?? 0;
          existing.totalGames += r.gamesPlayed ?? 0;
          existing.bestStreak = Math.max(existing.bestStreak, r.bestStreak ?? 0);
          if (updatedAtIso > existing.lastActivity) existing.lastActivity = updatedAtIso;
          existing.games[r.gameId] = {
            totalXp: r.totalXp ?? 0,
            gamesPlayed: r.gamesPlayed ?? 0,
            bestStreak: r.bestStreak ?? 0,
            bestRunXp: r.bestRunXp ?? 0,
          };
        }
      }

      const students = Array.from(byUser.values()).sort((a, b) => b.totalXp - a.totalXp);

      res.json({
        days,
        cutoff: cutoff.toISOString(),
        students,
        totalStudents: students.length,
        totalXp: students.reduce((s, x) => s + x.totalXp, 0),
        totalGames: students.reduce((s, x) => s + x.totalGames, 0),
      });
    } catch (e) {
      console.error("[PARENT-DASH] hiba:", e);
      const err = e instanceof Error ? e : new Error(String(e));
      res.status(500).json({ message: err.message });
    }
  });

  // ADMIN-ONLY: Heti összefoglaló email kiküldése a szülőknek (extra-emailek).
  // Lekérdezi a parent-dashboard adatait, generál minden extra-email cím-hez
  // egy HTML összefoglalót (osztály-szerinti tanulók statjával), majd kiküldi.
  app.post("/api/admin/parent-dashboard/send-weekly", isAuthenticatedAdmin, async (req: Request, res) => {
    try {
      const daysRaw = typeof req.body?.days === "number" ? req.body.days : 7;
      const days = Math.max(1, Math.min(90, Math.floor(daysRaw)));
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const { gameScores } = await import("@shared/schema");

      // 1. Aggregáljuk a per-user statot (mint a parent-dashboard endpoint).
      const rows = await db
        .select({
          userId: gameScores.userId,
          gameId: gameScores.gameId,
          totalXp: gameScores.totalXp,
          gamesPlayed: gameScores.gamesPlayed,
          bestStreak: gameScores.bestStreak,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
        })
        .from(gameScores)
        .leftJoin(users, eq(gameScores.userId, users.id))
        .where(sql`${gameScores.updatedAt} >= ${cutoff}`);

      const userStats = new Map<string, { name: string; email: string | null; totalXp: number; totalGames: number; bestStreak: number }>();
      for (const r of rows) {
        const key = r.userId;
        const name = (r.firstName || r.lastName) ? `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() : "Tanuló";
        const cur = userStats.get(key);
        if (!cur) {
          userStats.set(key, {
            name, email: r.email,
            totalXp: r.totalXp ?? 0,
            totalGames: r.gamesPlayed ?? 0,
            bestStreak: r.bestStreak ?? 0,
          });
        } else {
          cur.totalXp += r.totalXp ?? 0;
          cur.totalGames += r.gamesPlayed ?? 0;
          cur.bestStreak = Math.max(cur.bestStreak, r.bestStreak ?? 0);
        }
      }

      // 2. Az extra_email_addresses összes aktív cím-listája = értesítendő szülő.
      const extras = await storage.getActiveExtraEmails();
      // Minden extra-email kapja a tanulók listáját, akiknek email-je egyezik
      // (a tanulóknak Google-fiókja az email + extra-emails között megegyezhet),
      // VAGY ha nem, akkor egy globális összefoglalót (név + XP).
      // Egyszerűsítve: minden extra-email cím-hez kiküldjük az összes (név, XP)
      // adatot — a szülő látja az egész osztálya-statját.

      const studentsArr = Array.from(userStats.values()).sort((a, b) => b.totalXp - a.totalXp);

      const resendState = isResendConfigured();
      if (!resendState.ok) {
        return res.status(503).json({
          message: "Resend nincs konfigurálva",
          reason: resendState.reason,
          recipients: extras.length,
          sent: 0,
          failed: 0,
        });
      }

      const Resend = (await import("resend")).Resend;
      const apiKey = process.env.RESEND_API_KEY!;
      const fromEmail = (process.env.RESEND_FROM_EMAIL || "").trim();
      const client = new Resend(apiKey);

      // 3. HTML-template generálás
      const studentsHtml = studentsArr.length === 0
        ? `<p style="color:#888;font-style:italic;">Az elmúlt ${days} napban nem volt játékos-aktivitás.</p>`
        : `<table style="width:100%;border-collapse:collapse;margin:12px 0;">
            <thead><tr style="background:#f4f4f4;">
              <th style="text-align:left;padding:6px;border:1px solid #ddd;">Tanuló</th>
              <th style="text-align:right;padding:6px;border:1px solid #ddd;">Összes XP</th>
              <th style="text-align:right;padding:6px;border:1px solid #ddd;">Futások</th>
              <th style="text-align:right;padding:6px;border:1px solid #ddd;">Legjobb sorozat</th>
            </tr></thead>
            <tbody>${studentsArr.map((s) => `
              <tr>
                <td style="padding:6px;border:1px solid #ddd;">${s.name}</td>
                <td style="text-align:right;padding:6px;border:1px solid #ddd;font-weight:bold;color:#b45309;">${s.totalXp.toLocaleString("hu-HU")}</td>
                <td style="text-align:right;padding:6px;border:1px solid #ddd;">${s.totalGames}</td>
                <td style="text-align:right;padding:6px;border:1px solid #ddd;color:#dc2626;">🔥 ${s.bestStreak}</td>
              </tr>`).join("")}
            </tbody>
          </table>`;

      let sent = 0;
      let failed = 0;
      const errors: string[] = [];

      for (let i = 0; i < extras.length; i++) {
        const email = extras[i]!.email;
        const html = `
          <!DOCTYPE html>
          <html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:640px;margin:0 auto;padding:16px;">
            <h2 style="color:#7c3aed;margin:0 0 4px;">📊 WebSuli — heti összefoglaló</h2>
            <p style="color:#666;margin:0 0 12px;">Az elmúlt <strong>${days} nap</strong> tanulói teljesítményei.</p>
            ${studentsHtml}
            <p style="color:#888;font-size:12px;margin-top:18px;">
              Ez egy automatikus heti összefoglaló a WebSuli platformról. A tanuló saját böngészőjében tárolt
              adatok (achievement, daily streak) nincsenek itt — csak a szerver-oldali játékfutási statok.
            </p>
          </body></html>`;

        try {
          const result = await client.emails.send({
            from: fromEmail,
            to: [email],
            subject: `WebSuli — Heti összefoglaló (${days} nap, ${studentsArr.length} tanuló)`,
            html,
          });
          if (result && "error" in result && result.error) {
            failed++;
            errors.push(`${email}: ${result.error.message}`);
          } else {
            sent++;
          }
        } catch (e) {
          failed++;
          errors.push(`${email}: ${e instanceof Error ? e.message : String(e)}`);
        }
        // 500ms rate-limit (Resend 2req/s)
        if (i < extras.length - 1) await new Promise((r) => setTimeout(r, 500));
      }

      res.json({
        recipients: extras.length,
        sent,
        failed,
        errors: errors.slice(0, 10),
        studentsInReport: studentsArr.length,
      });
    } catch (e) {
      console.error("[PARENT-DASH] heti email hiba:", e);
      const err = e instanceof Error ? e : new Error(String(e));
      res.status(500).json({ message: err.message });
    }
  });

  // ADMIN-ONLY: Email-küldés diagnosztikai panel.
  // Visszaadja a Resend config állapotát, az osztályonkénti címzett-bontást,
  // az utolsó N email_logs bejegyzést és az utolsó N tananyag-feltöltést
  // (a hozzájuk tartozó email-statisztikákkal).
  app.get("/api/admin/email-diagnostics", isAuthenticatedAdmin, async (_req: Request, res) => {
    try {
      const { emailLogs, htmlFiles: htmlFilesTable } = await import("@shared/schema");

      const resendStatus = isResendConfigured();

      // Per-classroom breakdown (1-12)
      const subs = await storage.getActiveEmailSubscriptions();
      const extras = await storage.getActiveExtraEmails();
      const classroomBreakdown: Array<{ classroom: number; subscriptions: number; extras: number }> = [];
      for (let c = 1; c <= 12; c++) {
        classroomBreakdown.push({
          classroom: c,
          subscriptions: subs.filter((s) => Array.isArray(s.classrooms) && s.classrooms.includes(c)).length,
          extras: extras.filter((e) => Array.isArray(e.classrooms) && e.classrooms.includes(c)).length,
        });
      }

      // Recent email logs (max 30)
      const recentLogsRaw = await db
        .select({
          id: emailLogs.id,
          htmlFileId: emailLogs.htmlFileId,
          recipientEmail: emailLogs.recipientEmail,
          status: emailLogs.status,
          error: emailLogs.error,
          createdAt: emailLogs.createdAt,
        })
        .from(emailLogs)
        .orderBy(desc(emailLogs.createdAt))
        .limit(30);

      // Recent uploads with email-stats (max 10)
      const recentUploads = await db
        .select({
          id: htmlFilesTable.id,
          title: htmlFilesTable.title,
          classroom: htmlFilesTable.classroom,
          createdAt: htmlFilesTable.createdAt,
        })
        .from(htmlFilesTable)
        .orderBy(desc(htmlFilesTable.createdAt))
        .limit(10);

      // Per-upload email-stats (sent / failed count)
      const uploadIds = recentUploads.map((u) => u.id);
      const logsForUploads = uploadIds.length > 0
        ? await db
            .select({
              htmlFileId: emailLogs.htmlFileId,
              status: emailLogs.status,
            })
            .from(emailLogs)
            .where(inArray(emailLogs.htmlFileId, uploadIds))
        : [];

      const uploadStats = recentUploads.map((u) => {
        const logs = logsForUploads.filter((l) => l.htmlFileId === u.id);
        return {
          ...u,
          emailsSent: logs.filter((l) => l.status === "sent").length,
          emailsFailed: logs.filter((l) => l.status === "failed").length,
        };
      });

      res.json({
        resend: resendStatus,
        classroomBreakdown,
        totalActiveSubscriptions: subs.length,
        totalActiveExtras: extras.length,
        recentLogs: recentLogsRaw,
        recentUploads: uploadStats,
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error("[EMAIL] Diagnosztika hiba:", err);
      res.status(500).json({ message: err.message });
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

      // Validate text length to prevent abuse
      if (text.length > 5000) {
        return res.status(400).json({ message: "A szöveg maximum 5000 karakter lehet" });
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('TTS hiba:', error);
      res.status(500).json({ message: 'Szöveg felolvasása sikertelen' });
    }
  });

  // ADMIN Backup operations
  // Create a new backup (max 3 kept automatically)
  adminRouter.post("/backups/create", async (req: Request, res) => {
    try {
      const userId = req.user?.id || 'admin';

      const { name } = req.body;
      if (!name || typeof name !== 'string') {
        return res.status(400).json({ message: "A backup név kötelező" });
      }

      const backup = await storage.createBackup(name, userId);
      res.json(backup);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[BACKUP] Hiba a backup készítésekor:', error);
      res.status(500).json({ message: err.message });
    }
  });

  // Get all backups (max 3)
  adminRouter.get("/backups", async (_req, res) => {
    try {
      const backups = await storage.getAllBackups();
      res.json(backups);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[BACKUP] Hiba a backup-ok lekérdezésekor:', error);
      res.status(500).json({ message: err.message });
    }
  });

  // Restore from backup
  adminRouter.post("/backups/:id/restore", async (req, res) => {
    try {
      const success = await storage.restoreBackup(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Backup nem található" });
      }

      res.json({ success: true, message: "Backup sikeresen visszaállítva" });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[BACKUP] Hiba a backup visszaállításakor:', error);
      res.status(500).json({ message: err.message });
    }
  });

  // Delete backup
  adminRouter.delete("/backups/:id", async (req, res) => {
    try {
      const success = await storage.deleteBackup(req.params.id);
      if (!success) {
        return res.status(404).json({ message: "Backup nem található" });
      }

      res.json({ success: true, message: "Backup sikeresen törölve" });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[BACKUP] Hiba a backup törlésekor:', error);
      res.status(500).json({ message: err.message });
    }
  });

  // Export backup as downloadable JSON file (protected by adminRouter middleware)
  adminRouter.get("/backups/export", async (req: Request, res) => {
    try {
      const userEmail = req.user?.email || "admin";
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[BACKUP] Hiba az export során:', error);
      res.status(500).json({ message: err.message });
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

      // Basic validation: ensure each material has required fields
      for (const m of materials) {
        if (!m.id || !m.title || m.content === undefined) {
          return res.status(400).json({ message: "Érvénytelen backup: hiányzó kötelező mezők (id, title, content)" });
        }
      }

      // Run full import in a transaction to ensure data integrity
      const { emailLogs, materialStats, materialTags, materialLikes, materialRatings, materialComments, materialViews } = await import("@shared/schema");

      await db.transaction(async (tx) => {
        // Delete all related records first to avoid foreign key constraint violations
        await tx.delete(emailLogs);
        await tx.delete(materialStats);
        await tx.delete(materialTags);
        await tx.delete(materialLikes);
        await tx.delete(materialRatings);
        await tx.delete(materialComments);
        await tx.delete(materialViews);

        // Now we can safely delete all html_files
        await tx.delete(htmlFiles);

        await tx.insert(htmlFiles).values(
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
      });

      res.json({
        success: true,
        message: `${materials.length} anyag sikeresen visszaállítva`,
        materialsCount: materials.length,
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[BACKUP] Hiba az import során:', error);
      res.status(500).json({ message: err.message });
    }
  });

  // ========== FILE-BASED BACKUP ENDPOINTS ==========
  // List all file-based backups
  adminRouter.get("/file-backups", async (req, res) => {
    try {
      const backupsList = await listBackups();
      res.json(backupsList);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[FILE-BACKUP] Error listing backups:', error);
      res.status(500).json({ message: err.message });
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[FILE-BACKUP] Restore error:', error);
      res.status(500).json({
        message: `Backup visszaállítás sikertelen: ${err.message}`
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[ADMIN] Sync error:', error);
      console.error('[ADMIN] Error stack:', err.stack);

      res.status(500).json({
        success: false,
        message: "Hiba történt a szinkronizálás során",
        ...(process.env.NODE_ENV === 'development' && {
          error: err.message,
          details: err.stack ? err.stack.split('\n').slice(0, 5).join('\n') : undefined
        })
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[FILE-BACKUP] Download error:', error);
      res.status(500).json({ message: err.message });
    }
  });

  // ADMIN Get recent material views
  adminRouter.get("/material-views", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const views = await storage.getRecentMaterialViews(limit);
      res.json(views);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[PUSH] Subscription error:', error);
      res.status(500).json({ message: err.message });
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[PUSH] Unsubscribe error:', error);
      res.status(500).json({ message: err.message });
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
            keys: sub.keys as { p256dh: string; auth: string }
          };

          await webPush.sendNotification(pushSubscription, payload);
          successCount++;
        } catch (error: unknown) {
          console.error('[PUSH] Failed to send to subscription:', error);
          failCount++;

          // Remove invalid subscriptions (410 = endpoint expired)
          if (error instanceof Error && 'statusCode' in error && (error as { statusCode: number }).statusCode === 410) {
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
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error('[PUSH] Test notification error:', error);
      res.status(500).json({ message: errMsg });
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
          userId: null, // NULL for anonymous users (schema allows nullable)
          materialId: file.id,
          userAgent,
        });

        console.log(`[TRACKING] Material viewed: ${file.title} by anonymous user`);
      } catch (trackError: unknown) {
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

        // CRITICAL: No-cache headers for PDF viewer too (same as HTML)
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.send(pdfViewerHtml);
      } else {
        // HTML material: wrap with responsive container
        const wrappedHtml = wrapHtmlWithResponsiveContainer(file.content);

        // CRITICAL: No-cache headers to prevent Vercel/browser from serving stale content after Apply
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.send(wrappedHtml);
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      const safeErrorMsg = (err.message || 'Ismeretlen hiba').replace(/[<>&"']/g, (c: string) => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c] || c));
      res.status(500).send(`<html><body><h1>Hiba történt</h1><p>${safeErrorMsg}</p></body></html>`);
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).send("Error loading PDF");
    }
  });

  // ========== STATISTICS ENDPOINTS (Phase 2) ==========

  // GET overall statistics - Admin only
  adminRouter.get("/stats/overall", async (req, res) => {
    try {
      const stats = await storage.getOverallStats();
      res.json(stats);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
    }
  });

  // GET top materials - Admin only
  adminRouter.get("/stats/top-materials", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const topMaterials = await storage.getTopMaterials(limit);
      res.json(topMaterials);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
    }
  });

  // GET classroom distribution - Admin only
  adminRouter.get("/stats/classroom-distribution", async (req, res) => {
    try {
      const distribution = await storage.getClassroomDistribution();
      res.json(distribution);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
    }
  });

  // GET email delivery stats - Admin only
  adminRouter.get("/stats/email-delivery", async (req, res) => {
    try {
      const stats = await storage.getEmailDeliveryStats();
      res.json(stats);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
    }
  });

  // ========== TAG ENDPOINTS (Phase 3) ==========

  // GET all tags - Public
  app.get("/api/tags", async (req, res) => {
    try {
      const tags = await storage.getAllTags();
      res.json(tags);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
    }
  });

  // GET material tags - Public
  app.get("/api/materials/:id/tags", async (req, res) => {
    try {
      const tags = await storage.getMaterialTags(req.params.id);
      res.json(tags);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
    }
  });

  // CHECK if user liked - Public (returns LikeStatus: { liked, totalLikes })
  app.post("/api/materials/:id/likes/check", async (req, res) => {
    try {
      const { fingerprint } = req.body;
      if (!fingerprint) {
        return res.status(400).json({ message: "Fingerprint kötelező" });
      }
      const materialId = req.params.id;
      const liked = await storage.hasUserLiked(materialId, fingerprint);
      const totalLikes = await storage.getMaterialLikes(materialId);
      res.json({ liked, totalLikes });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
    }
  });

  // BATCH GET material likes status - Public (optimized for landing page)
  app.post("/api/materials/likes/batch", async (req, res) => {
    try {
      const { materialIds, fingerprint } = req.body;

      if (!Array.isArray(materialIds) || materialIds.length === 0) {
        return res.status(400).json({ message: "Material IDs array kötelező" });
      }

      if (!fingerprint || typeof fingerprint !== 'string') {
        return res.status(400).json({ message: "Fingerprint kötelező" });
      }

      // Limit batch size to prevent abuse
      const MAX_BATCH_SIZE = 100;
      const idsToQuery = materialIds.slice(0, MAX_BATCH_SIZE);

      const likesData = await storage.getBatchMaterialLikes(idsToQuery, fingerprint);
      res.json(likesData);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
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

      // IMPORTANT: Delete all related records in a transaction to ensure data integrity
      const { emailLogs, materialStats, materialTags, materialLikes, materialRatings, materialComments, materialViews } = await import("@shared/schema");

      await db.transaction(async (tx) => {
        // Delete related records for all materials in bulk
        await tx.delete(emailLogs).where(inArray(emailLogs.htmlFileId, materialIds));
        await tx.delete(materialStats).where(inArray(materialStats.materialId, materialIds));
        await tx.delete(materialTags).where(inArray(materialTags.materialId, materialIds));
        await tx.delete(materialLikes).where(inArray(materialLikes.materialId, materialIds));
        await tx.delete(materialRatings).where(inArray(materialRatings.materialId, materialIds));
        await tx.delete(materialComments).where(inArray(materialComments.materialId, materialIds));
        await tx.delete(materialViews).where(inArray(materialViews.materialId, materialIds));

        // Now we can safely delete the html_files
        await tx.delete(htmlFiles).where(inArray(htmlFiles.id, materialIds));
      });

      res.json({
        success: true,
        deletedCount: materialIds.length,
        message: `${materialIds.length} anyag sikeresen törölve`
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('Bulk delete error:', error);
      res.status(500).json({ message: err.message });
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
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
      const userId = req.user?.id || 'admin';
      let movedCount = 0;

      for (const id of materialIds) {
        const updated = await storage.updateHtmlFile(id, userId, { classroom });
        if (updated) movedCount++;
      }

      res.json({ success: true, movedCount });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
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

      // Get all materials (no isDraft field in schema - all are published)
      const materials = await storage.getAllHtmlFiles();

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
  
  <!-- Materials -->
${materials.map((material) => `  <url>
    <loc>${baseUrl}/preview/${material.id}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
    <lastmod>${new Date(material.createdAt).toISOString()}</lastmod>
  </url>`).join('\n')}
</urlset>`;

      res.header('Content-Type', 'application/xml');
      res.header('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      res.send(sitemap);

      console.log(`[SEO] Sitemap generated with ${materials.length} materials`);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[ADMIN] Source download error:', error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Hiba a forráskód letöltése során: " + err.message });
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[SystemPrompts] Error creating prompt:', error);
      res.status(500).json({ message: 'Failed to create system prompt' });
    }
  });

  // Update system prompt (admin only - protected via adminRouter middleware)
  adminRouter.put("/system-prompts/:id", async (req, res) => {
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
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
    } else if (err.message?.includes('AI') || err.message?.includes('API')) {
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

  // POST /api/admin/improve-material/:id - Async AI improvement (returns immediately, polls for result)
  // GET /api/admin/improve-material/status/:jobId - Poll job status
  const { registerImprovementRoutes } = await import('./improveAsync');
  registerImprovementRoutes(adminRouter);

  // GET /api/admin/improved-files - List all improved files
  adminRouter.get("/improved-files", async (req: Request, res) => {
    try {
      const { status, originalFileId } = req.query;
      const files = await storage.getAllImprovedHtmlFiles(
        status as string | undefined,
        originalFileId as string | undefined
      );
      res.json(files);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[IMPROVED-FILES] Error:', error);
      res.status(500).json({ message: err.message || 'Hiba történt' });
    }
  });

  // GET /api/admin/improved-files/:id - Get single improved file with original
  adminRouter.get("/improved-files/:id", async (req: Request, res) => {
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[IMPROVED-FILE] Error:', error);
      res.status(500).json({ message: err.message || 'Hiba történt' });
    }
  });

  // POST /api/admin/improved-files/:id/apply - Apply improved file to original
  adminRouter.post("/improved-files/:id/apply", async (req: Request, res) => {
    try {
      const { id } = req.params;
      const { createBackup = true, notes } = req.body || {};
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ message: 'Nincs bejelentkezve' });
      }

      console.log(`[APPLY-IMPROVED] Starting apply for improved file: ${id}, user: ${userId}`);

      // Quick diagnostic: check improved file content before apply
      const preCheck = await storage.getImprovedHtmlFile(id);
      if (preCheck) {
        console.log(`[APPLY-IMPROVED] Pre-check: status=${preCheck.status}, contentLength=${preCheck.content?.length || 0}, first100="${preCheck.content?.substring(0, 100)}"`);
      }

      // Delegate entirely to storage (single DB query inside transaction)
      const result = await storage.applyImprovedFileToOriginal(id, userId, createBackup, notes);
      
      console.log(`[APPLY-IMPROVED] ✅ Success! originalFileId: ${result.originalFile.id}, backupId: ${result.backupId || 'none'}`);

      res.json({
        success: true,
        originalFileId: result.originalFile.id,
        originalFileTitle: result.originalFile.title,
        backupId: result.backupId,
        message: 'Javított fájl sikeresen alkalmazva',
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[APPLY-IMPROVED] ❌ Error:', err.message);
      console.error('[APPLY-IMPROVED] Stack:', err.stack);
      res.status(500).json({
        message: err.message || 'Hiba történt az alkalmazás során'
      });
    }
  });


  // PATCH /api/admin/improved-files/:id - Update improved file status/notes
  adminRouter.patch("/improved-files/:id", async (req: Request, res) => {
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
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[UPDATE-IMPROVED] Error:', error);
      res.status(500).json({ message: err.message || 'Hiba történt' });
    }
  });

  // DELETE /api/admin/improved-files/:id - Delete improved file
  adminRouter.delete("/improved-files/:id", async (req: Request, res) => {
    try {
      const { id } = req.params;

      // Allow deletion of any status (no restriction)

      const deleted = await storage.deleteImprovedHtmlFile(id);
      if (!deleted) {
        return res.status(404).json({ message: "Javított fájl nem található" });
      }

      res.json({ success: true });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[DELETE-IMPROVED] Error:', error);
      res.status(500).json({ message: err.message || 'Hiba történt' });
    }
  });

  // GET /api/admin/improved-files/:id/debug - Diagnostic: show actual DB state
  adminRouter.get("/improved-files/:id/debug", async (req: Request, res) => {
    try {
      const improved = await storage.getImprovedHtmlFile(req.params.id);
      if (!improved) {
        return res.status(404).json({ message: "Improved file not found in DB" });
      }

      const original = await storage.getHtmlFile(improved.originalFileId);

      res.json({
        improved: {
          id: improved.id,
          status: improved.status,
          contentLength: improved.content?.length || 0,
          contentFirst200: improved.content?.substring(0, 200) || '(empty)',
          hasHtmlTag: improved.content?.includes('<html') || false,
          hasDoctype: improved.content?.includes('<!DOCTYPE') || false,
          isPlaceholder: improved.content?.includes('Feldolgozás alatt') || false,
          originalFileId: improved.originalFileId,
          createdAt: improved.createdAt,
        },
        original: original ? {
          id: original.id,
          title: original.title,
          contentLength: original.content?.length || 0,
          contentFirst200: original.content?.substring(0, 200) || '(empty)',
        } : null,
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/admin/improved-files/:id/force-apply - FORCE APPLY with RAW SQL (bypass ORM)
  // This endpoint bypasses Drizzle ORM and directly executes SQL to prove the DB update works
  adminRouter.post("/improved-files/:id/force-apply", async (req: Request, res) => {
    const { id } = req.params;
    const log: string[] = [];
    
    try {
      const { dbPool } = await import('./db');
      const client = await dbPool.connect();
      
      try {
        log.push(`[1] Connected to database with raw SQL client`);
        
        // Step 1: Read improved file
        const improvedResult = await client.query(
          'SELECT id, title, content, description, original_file_id, status FROM improved_html_files WHERE id = $1',
          [id]
        );
        
        if (improvedResult.rows.length === 0) {
          log.push(`[ERROR] Improved file ${id} NOT FOUND in improved_html_files`);
          return res.status(404).json({ log, error: 'Improved file not found' });
        }
        
        const improved = improvedResult.rows[0];
        log.push(`[2] Found improved file: status=${improved.status}, contentLength=${improved.content?.length || 0}, originalFileId=${improved.original_file_id}`);
        log.push(`[2b] First 150 chars: ${improved.content?.substring(0, 150)}`);
        
        // Step 2: Read original file BEFORE update
        const originalBefore = await client.query(
          'SELECT id, title, content FROM html_files WHERE id = $1',
          [improved.original_file_id]
        );
        
        if (originalBefore.rows.length === 0) {
          log.push(`[ERROR] Original file ${improved.original_file_id} NOT FOUND in html_files`);
          return res.status(404).json({ log, error: 'Original file not found' });
        }
        
        const origBefore = originalBefore.rows[0];
        log.push(`[3] Original file BEFORE update: contentLength=${origBefore.content?.length || 0}`);
        log.push(`[3b] First 150 chars: ${origBefore.content?.substring(0, 150)}`);
        
        // Step 3: Check if improved content is valid
        if (!improved.content || improved.content.length < 200 || improved.content.includes('Feldolgozás alatt')) {
          log.push(`[ERROR] Improved content is INVALID: length=${improved.content?.length}, placeholder=${improved.content?.includes('Feldolgozás alatt')}`);
          return res.status(400).json({ log, error: 'Improved content is empty or placeholder' });
        }
        
        // Step 4: FORCE UPDATE with raw SQL - DIRECT write
        log.push(`[4] Executing: UPDATE html_files SET content = $1, title = $2 WHERE id = $3`);
        log.push(`[4b] Params: content.length=${improved.content.length}, title=${improved.title}, id=${improved.original_file_id}`);
        
        const updateResult = await client.query(
          'UPDATE html_files SET content = $1, title = $2 WHERE id = $3 RETURNING id, title, length(content) as content_length',
          [improved.content, improved.title, improved.original_file_id]
        );
        
        log.push(`[5] UPDATE result: rowCount=${updateResult.rowCount}, returned=${JSON.stringify(updateResult.rows[0])}`);
        
        if (updateResult.rowCount === 0) {
          log.push(`[ERROR] UPDATE affected 0 rows! The WHERE clause did not match.`);
          return res.status(500).json({ log, error: 'UPDATE affected 0 rows' });
        }
        
        // Step 5: VERIFY - Read original file AFTER update
        const originalAfter = await client.query(
          'SELECT id, title, length(content) as content_length, substring(content from 1 for 150) as first_150 FROM html_files WHERE id = $1',
          [improved.original_file_id]
        );
        
        const origAfter = originalAfter.rows[0];
        log.push(`[6] Original file AFTER update: contentLength=${origAfter.content_length}, title=${origAfter.title}`);
        log.push(`[6b] First 150 chars: ${origAfter.first_150}`);
        
        // Step 6: Mark improved file as applied
        await client.query(
          "UPDATE improved_html_files SET status = 'applied', applied_at = NOW() WHERE id = $1",
          [id]
        );
        log.push(`[7] Improved file status → 'applied'`);
        
        log.push(`[8] ✅ FORCE APPLY COMPLETE!`);
        
        res.json({ 
          success: true, 
          log,
          before: { contentLength: origBefore.content?.length, title: origBefore.title },
          after: { contentLength: origAfter.content_length, title: origAfter.title },
        });
        
      } finally {
        client.release();
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.push(`[FATAL ERROR] ${err.message}`);
      log.push(`[STACK] ${err.stack}`);
      res.status(500).json({ log, error: err.message });
    }
  });

  // ========================================
  // MATERIAL IMPROVEMENT BACKUP ENDPOINTS
  // ========================================

  // GET /api/admin/improvement-backups - List all improvement backups
  adminRouter.get("/improvement-backups", async (req: Request, res) => {
    try {
      const { originalFileId } = req.query;
      const backups = await storage.getAllMaterialImprovementBackups(
        originalFileId as string | undefined
      );
      res.json(backups);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[IMPROVEMENT-BACKUPS] Error:', error);
      res.status(500).json({ message: err.message || 'Hiba történt' });
    }
  });

  // GET /api/admin/improvement-backups/:id - Get single backup
  adminRouter.get("/improvement-backups/:id", async (req: Request, res) => {
    try {
      const { id } = req.params;
      const backup = await storage.getMaterialImprovementBackup(id);
      if (!backup) {
        return res.status(404).json({ message: "Backup nem található" });
      }
      res.json(backup);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[IMPROVEMENT-BACKUP] Error:', error);
      res.status(500).json({ message: err.message || 'Hiba történt' });
    }
  });

  // POST /api/admin/improvement-backups/:id/restore - Restore from backup
  adminRouter.post("/improvement-backups/:id/restore", async (req: Request, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ message: 'Nincs bejelentkezve' });
      }

      const result = await storage.restoreFromMaterialImprovementBackup(id, userId);
      res.json({
        success: true,
        restoredFile: result.restoredFile,
        message: 'Fájl sikeresen visszaállítva',
      });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[RESTORE-BACKUP] Error:', error);
      res.status(500).json({
        message: err.message || 'Hiba történt a visszaállítás során'
      });
    }
  });

  // DELETE /api/admin/improvement-backups/:id - Delete backup
  adminRouter.delete("/improvement-backups/:id", async (req: Request, res) => {
    try {
      const { id } = req.params;
      const deleted = await storage.deleteMaterialImprovementBackup(id);
      if (!deleted) {
        return res.status(404).json({ message: "Backup nem található" });
      }
      res.json({ success: true });
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error('[DELETE-BACKUP] Error:', error);
      res.status(500).json({ message: err.message || 'Hiba történt' });
    }
  });

  // Register admin router with authentication middleware
  // ALL /api/admin/* routes require admin authentication
  app.use('/api/admin', isAuthenticatedAdmin, adminRouter);

  const httpServer = createServer(app);

  return httpServer;
}
