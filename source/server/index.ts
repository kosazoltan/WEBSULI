import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import compression from "compression";
import helmet from "helmet";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { dbPool } from "./db";
import { setupScheduledPublishing } from "./scheduledPublishing";
import { setupDailyViewSummary } from "./dailyViewSummary";
// import { initializeDatabase } from "./initDb"; // Not needed for Neon PostgreSQL
import { startAutoBackupJob } from "./autoBackup";
import { setupCleanupImprovedFiles } from "./cleanupImprovedFiles";
import { setupAuth } from "./auth";

const app = express();

// SECURITY: Helmet middleware for security headers
const isDevelopment = process.env.NODE_ENV !== "production";

// CORS: Allow requests from trusted frontends
const ALLOWED_ORIGINS = [
  'https://websuli.org',
  'https://www.websuli.org',
  'https://websuli.vip',
  'https://www.websuli.vip',
  // NOTE: HTTP versions needed because Nginx doesn't force HTTPS redirect
  'http://websuli.org',
  'http://www.websuli.org',
  'http://websuli.vip',
  'http://www.websuli.vip',
  // SECURITY: localhost ONLY in development
  ...(isDevelopment ? ['http://localhost:5173', 'http://localhost:5000'] : []),
  process.env.CUSTOM_DOMAIN && `https://${process.env.CUSTOM_DOMAIN}`,
  process.env.CUSTOM_DOMAIN && `https://www.${process.env.CUSTOM_DOMAIN}`,
].filter(Boolean) as string[];

// CORS configuration object
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (mobile apps, curl, Postman, same-origin)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is in explicit allowed list
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    // SECURITY: Development ONLY - Allow localhost/127.0.0.1 with any port
    if (isDevelopment && (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:'))) {
      return callback(null, true);
    }

    // SECURITY: Production - NEVER use wildcards with credentials
    // Block ALL unauthorized origins to prevent CSRF attacks
    return callback(new Error(`CORS policy blocked: ${origin}`));
  },
  credentials: true, // Allow cookies and authentication headers
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Request-Id'],
  maxAge: 86400, // Preflight cache for 24 hours
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle OPTIONS preflight requests with SAME strict policy
// SECURITY: Use corsOptions to prevent preflight bypass
app.options('*', cors(corsOptions));

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
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
        "data:",
      ],
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
      frameSrc: [
        "'self'",
      ],
      frameAncestors: [
        "'self'",
        ...(process.env.CUSTOM_DOMAIN ? [`https://${process.env.CUSTOM_DOMAIN}`] : []),
      ],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
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
  frameguard: { action: 'sameorigin' },
  xssFilter: true, // X-XSS-Protection: 1; mode=block
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

// Apply Helmet security headers with conditional CSP for /dev/ routes
app.use((req, res, next) => {
  if (req.path.startsWith('/dev/')) {
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
            "https://cdnjs.cloudflare.com" // PDF.js CDN for PDF rendering
          ], // Permissive for user HTML
          scriptSrcAttr: ["'unsafe-inline'"], // CRITICAL: Allow inline event handlers
          styleSrc: ["'self'", "data:", "'unsafe-inline'"],
          fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"], // PDF.js fonts
          imgSrc: ["'self'", "data:", "blob:", "https:"], // Allow all HTTPS images
          connectSrc: ["'self'", "https://cdnjs.cloudflare.com", ...ALLOWED_ORIGINS], // PDF.js CMap/font files + trusted frontends
          frameSrc: [
            "'self'",
          ],
          frameAncestors: [
            "'self'",
            ...(process.env.CUSTOM_DOMAIN ? [`https://${process.env.CUSTOM_DOMAIN}`] : []),
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
      frameguard: { action: 'sameorigin' },
      xssFilter: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
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
app.use(compression({
  // Compression level (0-9): 6 is a good balance between speed and compression ratio
  level: 6,
  // Only compress responses larger than 1KB
  threshold: 1024,
  // Compress all MIME types by default
  filter: (req, res) => {
    // Don't compress if the client explicitly says no
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Use compression's default filter (compresses text/* and application/json)
    return compression.filter(req, res);
  }
}));

// CRITICAL: Trust proxy is required for secure cookies behind Nginx/Load Balancer
// This ensures req.protocol is 'https' when accessed via HTTPS
app.set("trust proxy", 1);

// Parse JSON bodies up to 150MB
// Removed rawBody buffer to improve performance and reduce memory usage
app.use(express.json({
  limit: '150mb', // Increased to support 100MB PDFs (base64 encoded ~133MB)
}));
app.use(express.urlencoded({ extended: false, limit: '150mb' }));

// Smart caching strategy: Cache static assets, allow conditional GET for API
app.use((req, res, next) => {
  const path = req.path;

  // CRITICAL: Service worker and manifest must always revalidate for updates
  if (path === '/service-worker.js' || path === '/manifest.json' || path === '/offline.html') {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  // CRITICAL: HTML files - NO CACHE for SVG background update
  else if (path === '/' || path.endsWith('.html')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  // Cache static assets (JS, CSS, images, fonts) with long expiry
  // Only if they have content hashes (Vite adds hashes to built assets)
  else if (path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
    res.set('Cache-Control', 'public, max-age=31536000, immutable'); // 1 year
  }
  // Don't cache API responses but allow conditional GET (ETags)
  else if (path.startsWith('/api/')) {
    res.set('Cache-Control', 'no-cache, must-revalidate'); // Allow ETags
  }
  // Don't cache other files but allow conditional GET
  else {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }

  next();
});

// Rate limiting ONLY for AI endpoints (expensive operations)
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 AI requests per window (less than general API)
  message: 'Túl sok AI kérés, próbáld újra később!',
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict rate limiter for public email subscriptions (spam protection)
const subscriptionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Maximum 5 subscription attempts per IP per 15 minutes
  message: 'Túl sok feliratkozási kísérlet. Próbáld újra 15 perc múlva!',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false, // Count all attempts, even successful ones
});

// Apply rate limiting only to specific endpoints
app.use('/api/ai/', aiLimiter); // All AI endpoints
app.use('/api/subscribe-email', subscriptionLimiter);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      // SECURITY: Don't log full response bodies to avoid leaking PII (emails, names, etc.)
      // Only log metadata for debugging
      if (capturedJsonResponse) {
        const safeMetadata: Record<string, any> = {};
        if ('id' in capturedJsonResponse) safeMetadata.id = capturedJsonResponse.id;
        if ('message' in capturedJsonResponse) safeMetadata.message = capturedJsonResponse.message;
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
    const isDev = process.env.NODE_ENV === 'development';
    log(`Starting server in ${app.get("env")} mode`);
    log(`Port: ${process.env.PORT || '5000'}`);
    log(`Database: Neon PostgreSQL (${isDev ? 'DEV' : 'PRODUCTION'})`);

    // Skip SQLite initialization - using Neon PostgreSQL with existing schema
    // initializeDatabase();

    // CRITICAL: Serve PDF.js files BEFORE Vite routing
    // This prevents Vite from intercepting /pdfjs/* requests and serving index.html
    app.use('/pdfjs', express.static('public/pdfjs', {
      maxAge: '1y', // Cache PDF.js files for 1 year (they're versioned)
      immutable: true
    }));

    // Setup Authentication (Passport, Sessions)
    setupAuth(app);

    const server = await registerRoutes(app);

    // Phase 8: Start scheduled publishing cron job
    setupScheduledPublishing();

    // Phase 9: Start daily view summary email (runs at 20:00 daily)
    setupDailyViewSummary();

    // Phase 10: Start automatic backup system (daily + event-driven)
    startAutoBackupJob();

    // Phase 11: Start cleanup job for old applied improved files (daily at midnight)
    setupCleanupImprovedFiles();

    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";

      // Log error details for debugging
      console.error('Error handler:', {
        status,
        message: err.message,
        stack: err.stack,
        url: _req.url,
        method: _req.method,
        timestamp: new Date().toISOString()
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
    const port = parseInt(process.env.PORT || '5000', 10);

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
        log('HTTP server closed');

        try {
          // Close database pool
          await dbPool.end();
          log('Database pool closed');

          log('Graceful shutdown completed');
          process.exit(0);
        } catch (err) {
          console.error('Error during shutdown:', err);
          process.exit(1);
        }
      });

      // Force close after 30 seconds
      setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 30000);
    };

    // Listen for shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    console.error('FATAL: Failed to start server');
    console.error('Error details:', error);
    if (error instanceof Error) {
      console.error('Stack trace:', error.stack);
    }

    // Log environment info for debugging
    console.error('Environment check:');
    console.error('- NODE_ENV:', process.env.NODE_ENV);
    console.error('- PORT:', process.env.PORT);
    console.error('- DATABASE_URL exists:', !!process.env.DATABASE_URL);
    console.error('- SESSION_SECRET exists:', !!process.env.SESSION_SECRET);
    console.error('- ADMIN_EMAIL exists:', !!process.env.ADMIN_EMAIL);

    process.exit(1);
  }
})();
