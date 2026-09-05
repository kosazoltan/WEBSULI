import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import compression from "compression";
import helmet from "helmet";
import cors, { type CorsOptionsDelegate } from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { dbPool } from "./db";
import { setupScheduledPublishing } from "./scheduledPublishing";
import { setupDailyViewSummary } from "./dailyViewSummary";
// import { initializeDatabase } from "./initDb"; // Not needed for Neon PostgreSQL
import { startAutoBackupJob } from "./autoBackup";
import { setupCleanupImprovedFiles } from "./cleanupImprovedFiles";
import { setupAuth } from "./auth";
import { runMigrations } from "./migrate";
import { requestIdMiddleware } from "./middleware/request-id";
import errorReportRouter from "./routes/error-report";
import staticAuditRouter from "./routes/static-audit";
import { aiPayloadGuard } from "./lib/ai-payload-guard";
import { getAllowedOrigins, isOriginAllowed, isSameOriginRequest } from "./lib/allowed-origins";
import { logger } from "./lib/logger";
import { isLessonRoute, lessonCspDirectives } from "./lib/csp-profiles";

const app = express();

// SECURITY: Helmet middleware for security headers
const isDevelopment = process.env.NODE_ENV !== "production";

// CORS: Allow requests from trusted frontends.
// SECURITY: single source of truth — the same list backs the Origin/Referer allowlist
// that protects login/logout and the AI endpoints (see server/lib/allowed-origins.ts).
const ALLOWED_ORIGINS = getAllowedOrigins();

// CORS configuration object
const corsBaseOptions = {
  credentials: true, // Allow cookies and authentication headers
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-CSRF-Token"],
  exposedHeaders: ["Content-Length", "X-Request-Id"],
  maxAge: 86400, // Preflight cache for 24 hours
};

/**
 * Per-request CORS options. The delegate form is required because the same-origin check
 * needs the request itself (its protocol and Host), not just the Origin header.
 */
const corsOptions: CorsOptionsDelegate<Request> = (req, callback) => {
  callback(null, {
    ...corsBaseOptions,
    origin: (
      origin: string | undefined,
      originCallback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (mobile apps, curl, Postman, plain navigations)
      if (!origin) {
        return originCallback(null, true);
      }

      // A request from the very origin serving it is not cross-origin. Vite marks its
      // bundles `crossorigin`, so the browser sends an Origin header even for the app's
      // own assets; rejecting those bricks the whole page instead of protecting anything.
      if (isSameOriginRequest(origin, req.protocol, req.headers.host)) {
        return originCallback(null, true);
      }

      // Allowlist: production domains + deployment env vars; localhost in development only
      if (isOriginAllowed(origin)) {
        return originCallback(null, true);
      }

      // SECURITY: Production - NEVER use wildcards with credentials
      // Block ALL unauthorized origins to prevent CSRF attacks
      // AUDIT 2026-09-02: tiltás, nem szerverhiba — status 403, hogy MINDEN hibakezelő
      // (routes.ts egységes handler, index.ts fallback) 403-at adjon 500 helyett.
      const corsError = new Error(`CORS policy blocked: ${origin}`) as Error & { status: number };
      corsError.status = 403;
      return originCallback(corsError);
    },
  });
};

// X-Request-ID middleware — FIRST
app.use(requestIdMiddleware);

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle OPTIONS preflight requests with SAME strict policy
// SECURITY: Use corsOptions to prevent preflight bypass
app.options("*", cors(corsOptions));

// Helmet middleware with CSP configuration
const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "https://fonts.googleapis.com",
        "'unsafe-inline'",
        "'unsafe-eval'",
      ],
      // CRITICAL: Allow inline event handlers (onclick, oninput, etc.) for user-uploaded HTML
      // This is REQUIRED for interactive materials (quizzes, exercises, send buttons)
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Needed for styled components and Tailwind
        "https://fonts.googleapis.com",
      ],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "https:", // Allow all HTTPS images (for user-generated content)
      ],
      connectSrc: [
        "'self'",
        ...ALLOWED_ORIGINS, // Allow API calls from trusted frontends
        "https://fonts.googleapis.com", // Allow Google Fonts API
        "https://fonts.gstatic.com", // Allow Google Fonts static files
        // SECURITY: ws/wss for Vite HMR in dev + future WebSocket support
        ...(isDevelopment ? ["ws:", "wss:"] : ["wss:"]),
      ],
      frameSrc: ["'self'"],
      frameAncestors: [
        "'self'",
        ...(process.env.CUSTOM_DOMAIN
          ? [`https://${process.env.CUSTOM_DOMAIN}`]
          : []),
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests:
        process.env.NODE_ENV === "production" ? [] : null,
    },
  },
  // Additional security headers
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true, // X-Content-Type-Options: nosniff
  // PRODUCTION: Enable SAMEORIGIN for security
  frameguard: { action: "sameorigin" },
  xssFilter: true, // X-XSS-Protection: 1; mode=block
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
});

// Apply Helmet security headers with conditional CSP: strict for /lesson/*,
// relaxed for /dev/ (legacy uploaded HTML), standard everywhere else.
app.use((req, res, next) => {
  if (isLessonRoute(req.path)) {
    // LS-4: the lesson page is DATA rendered by our own audited bundle — the
    // strict profile (no inline script, no eval) enforces "a lesson is not a
    // program" at the response-header level.
    helmet({
      contentSecurityPolicy: {
        directives: lessonCspDirectives({
          allowedOrigins: ALLOWED_ORIGINS,
          isDevelopment,
          customDomain: process.env.CUSTOM_DOMAIN,
        }),
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      noSniff: true,
      frameguard: { action: "sameorigin" },
      xssFilter: true,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    })(req, res, next);
    return;
  }
  if (req.path.startsWith("/dev/")) {
    // For /dev/ routes: Apply Helmet with relaxed CSP but keep other security headers
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "data:",
            "'unsafe-inline'",
            "'unsafe-eval'",
            "https://cdnjs.cloudflare.com", // PDF.js CDN for PDF rendering
          ], // Permissive for user HTML
          scriptSrcAttr: ["'unsafe-inline'"], // CRITICAL: Allow inline event handlers
          styleSrc: ["'self'", "data:", "'unsafe-inline'"],
          fontSrc: [
            "'self'",
            "data:",
            "https://fonts.gstatic.com",
            "https://cdnjs.cloudflare.com",
          ], // PDF.js fonts
          imgSrc: ["'self'", "data:", "blob:", "https:"], // Allow all HTTPS images
          connectSrc: [
            "'self'",
            "https://cdnjs.cloudflare.com",
            ...ALLOWED_ORIGINS,
          ], // PDF.js CMap/font files + trusted frontends
          frameSrc: ["'self'"],
          // BACKLOG T4: a /dev/:id tananyag a Render saját originjéről töltődik az app
          // (websuli.vip) iframe-jébe → beágyazó originek: 'self' + CUSTOM_DOMAIN + allowlist
          // (ALLOWED_ORIGINS tartalmazza a prod domaineket akkor is, ha CUSTOM_DOMAIN nincs beállítva).
          frameAncestors: [
            "'self'",
            ...(process.env.CUSTOM_DOMAIN
              ? [`https://${process.env.CUSTOM_DOMAIN}`]
              : []),
            ...ALLOWED_ORIGINS,
          ],
          objectSrc: ["'self'", "data:"], // CRITICAL: Allow <embed> tag for native PDF viewer
          workerSrc: ["'self'", "blob:", "https://cdnjs.cloudflare.com"], // PDF.js worker
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
      noSniff: true,
      // BACKLOG T4: X-Frame-Options SAMEORIGIN blokkolná a cross-origin beágyazást; a
      // beágyazhatóságot a fenti CSP frame-ancestors irányítja (explicit allowlist).
      frameguard: false,
      xssFilter: true,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow iframe embedding
      crossOriginOpenerPolicy: false, // Disable for iframe compatibility
    })(req, res, next);
  } else {
    // Apply standard Helmet middleware for all other routes
    helmetMiddleware(req, res, next);
  }
});

// Performance: Enable gzip/brotli compression for all responses
// This reduces bandwidth usage by 70-90% for text-based responses
app.use(
  compression({
    // Compression level (0-9): 6 is a good balance between speed and compression ratio
    level: 6,
    // Only compress responses larger than 1KB
    threshold: 1024,
    // Compress all MIME types by default
    filter: (req, res) => {
      // Don't compress if the client explicitly says no
      if (req.headers["x-no-compression"]) {
        return false;
      }
      // AUDIT 2026-09-01: SSE stream (text/event-stream) NEM tömöríthető — a gzip-puffer
      // ~1 KB-ig visszatartotta a res.write() darabokat, a "streaming" válasz megállt.
      const contentType = String(res.getHeader("Content-Type") ?? "");
      if (contentType.includes("text/event-stream")) {
        return false;
      }
      // Use compression's default filter (compresses text/* and application/json)
      return compression.filter(req, res);
    },
  }),
);

// CRITICAL: Trust proxy is required for secure cookies behind Nginx/Load Balancer
// This ensures req.protocol is 'https' when accessed via HTTPS
app.set("trust proxy", 1);

// SECURITY: Body size limits are scoped by route.
// Only the admin upload / AI paths need the huge limit (100MB PDFs are sent base64-encoded,
// ~133MB). Applying 150MB to every endpoint let any anonymous client exhaust server memory
// by POSTing giant bodies to cheap public routes (likes, comments, push subscribe, ...).
const LARGE_BODY_PREFIXES = [
  "/api/html-files", // admin material create/update (base64 PDF payloads)
  "/api/ai/", // Enhanced Material Creator
  "/api/admin/", // backup import, improvement apply, ...
];
const LARGE_BODY_LIMIT = "150mb";
const STANDARD_BODY_LIMIT = "1mb";

const largeJsonParser = express.json({ limit: LARGE_BODY_LIMIT });
const standardJsonParser = express.json({ limit: STANDARD_BODY_LIMIT });
const largeUrlencodedParser = express.urlencoded({ extended: false, limit: LARGE_BODY_LIMIT });
const standardUrlencodedParser = express.urlencoded({ extended: false, limit: STANDARD_BODY_LIMIT });

// AUDIT 2026-09-01: a body-parser a session/auth és a rate-limiterek ELŐTT fut, ezért egy
// bejelentkezés nélküli kliens is 150 MB-os JSON-t parseoltathatott (memória-DoS), mielőtt a
// 401/403 megszületett volna. A session-middleware itt még nem elérhető, ezért olcsó
// előszűrő: nagy body csak akkor, ha a kérés egyáltalán hordoz session-sütit — anélkül a
// nagy-limitű útvonalak úgyis 401-et adnának.
const SESSION_COOKIE_NAME = "connect.sid";
const hasSessionCookie = (req: express.Request) =>
  typeof req.headers.cookie === "string" && req.headers.cookie.includes(`${SESSION_COOKIE_NAME}=`);

const needsLargeBody = (req: express.Request) =>
  LARGE_BODY_PREFIXES.some((prefix) => req.path.startsWith(prefix)) && hasSessionCookie(req);

app.use((req, res, next) =>
  needsLargeBody(req)
    ? largeJsonParser(req, res, next)
    : standardJsonParser(req, res, next),
);
app.use((req, res, next) =>
  needsLargeBody(req)
    ? largeUrlencodedParser(req, res, next)
    : standardUrlencodedParser(req, res, next),
);

// Smart caching strategy: Cache static assets, allow conditional GET for API
app.use((req, res, next) => {
  const path = req.path;

  // CRITICAL: Service worker and manifest must always revalidate for updates
  if (
    path === "/service-worker.js" ||
    path === "/manifest.json" ||
    path === "/offline.html"
  ) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
  // CRITICAL: HTML files - NO CACHE for SVG background update
  else if (path === "/" || path.endsWith(".html")) {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }
  // Cache static assets (JS, CSS, images, fonts) with long expiry
  // Only if they have content hashes (Vite adds hashes to built assets)
  else if (
    path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)
  ) {
    res.set("Cache-Control", "public, max-age=31536000, immutable"); // 1 year
  }
  // Don't cache API responses but allow conditional GET (ETags)
  else if (path.startsWith("/api/")) {
    res.set("Cache-Control", "no-cache, must-revalidate"); // Allow ETags
  }
  // Don't cache other files but allow conditional GET
  else {
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
    res.set("Pragma", "no-cache");
    res.set("Expires", "0");
  }

  next();
});

// Rate limiting ONLY for AI endpoints (expensive operations)
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 AI requests per window (less than general API)
  message: "Túl sok AI kérés, próbáld újra később!",
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for public email subscriptions (spam protection)
const subscriptionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Maximum 5 subscription attempts per IP per 15 minutes
  message: "Túl sok feliratkozási kísérlet. Próbáld újra 15 perc múlva!",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all attempts, even successful ones
});

// Rate limiter for login endpoint (brute force protection)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Maximum 10 login attempts per IP per 15 minutes
  message: "Túl sok bejelentkezési kísérlet. Próbáld újra 15 perc múlva!",
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Only count failed attempts
});

// Rate limiter for the public text-to-speech proxy.
// Without it anyone can use the server as a free, unthrottled Google TTS relay.
const ttsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60,
  message: "Túl sok felolvasási kérés. Próbáld újra később!",
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for public write endpoints (comments, likes, push subscriptions).
// These are unauthenticated and write to the database — throttle spam/flooding.
const publicWriteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: "Túl sok kérés. Próbáld újra később!",
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting only to specific endpoints
app.use("/api/ai/", aiLimiter); // All AI endpoints
app.use("/api/ai/", aiPayloadGuard()); // C1: payload size + history limits
app.use("/api/subscribe-email", subscriptionLimiter);
app.use("/api/login", loginLimiter); // Brute force protection
app.use("/api/tts", ttsLimiter); // Public TTS proxy abuse protection
app.use("/api/push/subscribe", publicWriteLimiter);
app.use("/api/push/unsubscribe", publicWriteLimiter);

// LS-3a: a Próba-beküldés és a kupon-műveletek publikus írások, és valódi jutalmat
// (képernyőidőt) osztanak — a szórásos újrapróbálkozást itt is fojtjuk. A GET
// /coupons/active minden HUD-frissítéskor lefut, ezért az kimarad.
app.use("/api/lessons", (req, res, next) => {
  const isSafeMethod =
    req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
  if (isSafeMethod) return next();
  return publicWriteLimiter(req, res, next);
});

// Public comment/like writes live under /api/materials/*. Only real writes are throttled:
// safe methods and the two read-only POST lookups (likes/check and likes/batch, used on
// every landing-page load) stay unthrottled so shared school IPs behind NAT aren't locked out.
const READ_ONLY_MATERIAL_POSTS = /^\/(likes\/batch|[^/]+\/likes\/check)$/;
app.use("/api/materials", (req, res, next) => {
  const isSafeMethod =
    req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
  if (isSafeMethod || READ_ONLY_MATERIAL_POSTS.test(req.path)) {
    return next();
  }
  return publicWriteLimiter(req, res, next);
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    // Sanitize 500 error messages in production to prevent SQL/internal detail leakage
    if (res.statusCode >= 500 && process.env.NODE_ENV !== 'development' && bodyJson?.message) {
      const msg = String(bodyJson.message);
      if (msg.includes('Failed query:') || msg.includes('does not exist') || msg.includes('violates')) {
        bodyJson = { ...bodyJson, message: 'Szerver hiba történt' };
      }
    }
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      // SECURITY: Don't log full response bodies to avoid leaking PII (emails, names, etc.)
      // Only log metadata for debugging
      if (capturedJsonResponse) {
        const safeMetadata: Record<string, unknown> = {};
        if ("id" in capturedJsonResponse)
          safeMetadata.id = capturedJsonResponse.id;
        if ("message" in capturedJsonResponse)
          safeMetadata.message = capturedJsonResponse.message;
        if (Array.isArray(capturedJsonResponse)) {
          safeMetadata.count = capturedJsonResponse.length;
        }
        if (Object.keys(safeMetadata).length > 0) {
          logLine += ` :: ${JSON.stringify(safeMetadata)}`;
        }
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  try {
    // Log startup environment
    const isDev = process.env.NODE_ENV === "development";
    log(`Starting server in ${app.get("env")} mode`);
    log(`Port: ${process.env.PORT || "5000"}`);
    log(`Database: Neon PostgreSQL (${isDev ? "DEV" : "PRODUCTION"})`);

    // Run pending database migrations before starting the server
    // This ensures all tables exist (e.g. improved_html_files, material_improvement_backups)
    // NOTE: Full file-based migration runs during build (npm run db:migrate)
    // At runtime we do a lightweight check to verify critical tables exist
    try {
      const testClient = await dbPool.connect();
      try {
        const tablesResult = await testClient.query(`
          SELECT tablename FROM pg_tables 
          WHERE schemaname = 'public' 
            AND tablename IN ('improved_html_files', 'material_improvement_backups')
        `);
        const tables = tablesResult.rows.map((r: { tablename: string }) => r.tablename);
        if (tables.length < 2) {
          log(`[MIGRATE] ⚠️ Missing tables detected: expected 2, found ${tables.length} (${tables.join(', ')})`);
          log(`[MIGRATE] Running emergency migration...`);
          await runMigrations();
        } else {
          log(`[MIGRATE] ✅ All critical tables present`);
        }
      } finally {
        testClient.release();
      }
    } catch (migrationError) {
      logger.error('[STARTUP] ⚠️ Migration check warning:', migrationError);
      // Don't crash - the server can still run if tables already exist
    }

    // CRITICAL: Serve PDF.js files BEFORE Vite routing
    // This prevents Vite from intercepting /pdfjs/* requests and serving index.html
    app.use(
      "/pdfjs",
      express.static("public/pdfjs", {
        maxAge: "1y", // Cache PDF.js files for 1 year (they're versioned)
        immutable: true,
      }),
    );

    // Setup Authentication (Passport, Sessions)
    setupAuth(app);

    // Universal Error Logger routes
    app.use("/api/error-report", errorReportRouter);
    app.use("/api/static-audit", staticAuditRouter);

    const server = await registerRoutes(app);

    // Phase 8: Start scheduled publishing cron job
    setupScheduledPublishing();

    // Phase 9: Start daily view summary email (runs at 20:00 daily)
    setupDailyViewSummary();

    // Phase 10: Start automatic backup system (daily + event-driven)
    startAutoBackupJob();

    // Phase 11: Start cleanup job for old applied improved files (daily at midnight)
    setupCleanupImprovedFiles();

    // Express error handler (4 params required for Express to identify it as error middleware)
    app.use((err: Error & { status?: number; statusCode?: number }, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      // Log error details for debugging
      logger.error("Error handler:", {
        status,
        message: err.message,
        stack: err.stack,
        url: _req.url,
        method: _req.method,
        timestamp: new Date().toISOString(),
      });

      // Send response but DO NOT throw error after responding
      res.status(status).json({ message });
    });

    // importantly only setup vite in development and after
    // setting up all the other routes so the catch-all route
    // doesn't interfere with the other routes
    if (app.get("env") === "development") {
      await setupVite(app, server);
    } else {
      serveStatic(app);
    }

    // ALWAYS serve the app on the port specified in the environment variable PORT
    // Other ports are firewalled. Default to 5000 if not specified.
    // this serves both the API and the client.
    // It is the only port that is not firewalled.
    const port = parseInt(process.env.PORT || "5000", 10);

    // Configure server options - bind to all interfaces for Autoscale
    // NOTE: Do NOT use reusePort - it's not compatible with Autoscale deployments
    server.listen(port, "0.0.0.0", () => {
      log(`serving on port ${port}`);
    });

    // Graceful shutdown handler
    const gracefulShutdown = async (signal: string) => {
      log(`${signal} received. Starting graceful shutdown...`);

      // Stop accepting new connections
      server.close(async () => {
        log("HTTP server closed");

        try {
          // Close database pool
          await dbPool.end();
          log("Database pool closed");

          log("Graceful shutdown completed");
          process.exit(0);
        } catch (err) {
          logger.error("Error during shutdown:", err);
          process.exit(1);
        }
      });

      // Force close after 30 seconds
      setTimeout(() => {
        logger.error(
          "Could not close connections in time, forcefully shutting down",
        );
        process.exit(1);
      }, 30000);
    };

    // Listen for shutdown signals
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  } catch (error) {
    logger.error("FATAL: Failed to start server");
    logger.error("Error details:", error);
    if (error instanceof Error) {
      logger.error("Stack trace:", error.stack);
    }

    // Log environment info for debugging
    logger.error("Environment check:");
    logger.error("- NODE_ENV:", process.env.NODE_ENV);
    logger.error("- PORT:", process.env.PORT);
    logger.error("- DATABASE_URL exists:", !!process.env.DATABASE_URL);
    logger.error("- SESSION_SECRET exists:", !!process.env.SESSION_SECRET);
    logger.error("- ADMIN_EMAIL exists:", !!process.env.ADMIN_EMAIL);

    process.exit(1);
  }
})();
