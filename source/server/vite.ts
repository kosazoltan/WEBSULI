import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { randomBytes } from "node:crypto";
import { createServer as createViteServer, createLogger } from "vite";
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";
import { logger } from "./lib/logger";
import { DEV_CSP_NONCE_PLACEHOLDER } from "./lib/csp-profiles";
import { homeMascotOn, withHomeMascotFlag } from "./lib/home-flags";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  logger.info(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    html: { ...viteConfig.html, cspNonce: DEV_CSP_NONCE_PLACEHOLDER },
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    // Skip routes that should be handled by Express route handlers (not SPA)
    if (url.startsWith("/dev/") || url.startsWith("/api/") || url.startsWith("/auth/")) {
      return next();
    }

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const transformed = await vite.transformIndexHtml(url, template);
      // Főoldali kabala (docs/specs/2026-11-18-kabala-fooldal.md 4.1): bekapcsolva a kapcsoló meta-sora az index.html-ben utazik.
      const page = homeMascotOn() ? withHomeMascotFlag(transformed) : transformed;
      const nonce = res.locals.lessonCspNonce ?? randomBytes(24).toString("base64");
      res.status(200).set({ "Content-Type": "text/html", "Cache-Control": "no-store" })
        .end(page.replaceAll(DEV_CSP_NONCE_PLACEHOLDER, nonce));
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // CRITICAL: Use dist/public (build output), not server/public
  // Always use process.cwd() to get the project root, then go to dist/public
  // This works in both source and build contexts
  const distPath = path.resolve(process.cwd(), "dist", "public");

  // API-only mode: When FRONTEND_URL is set (split deployment with Vercel),
  // the frontend is served by Vercel and dist/public may not exist on Render.
  if (!fs.existsSync(distPath)) {
    if (process.env.FRONTEND_URL) {
      logger.info(
        `[serveStatic] API-only mode - frontend served by ${process.env.FRONTEND_URL}`,
      );
      logger.info(
        `[serveStatic] Skipping static file serving (dist/public not found)`,
      );
      return;
    }
    throw new Error(
      `Could not find the build directory: ${distPath}. Make sure to run 'npm run build' first.`,
    );
  }

  logger.info(`[serveStatic] Serving from: ${distPath}`);
  logger.info(
    `[serveStatic] index.html exists: ${fs.existsSync(path.resolve(distPath, "index.html"))}`,
  );

  // Spec 2026-11-03-fooldal-sebesseg: a build által készített, tartalom-hash-es bélyegképek — immutable, egyéves gyorsítótár
  // (új kép = új fájlnév); a hiányzó fájl 404, nem a SPA index.html-je.
  app.use("/design-thumbs", express.static(path.resolve(distPath, "design-thumbs"), { immutable: true, maxAge: "1y", fallthrough: false }));
  // Főoldali kabala (docs/specs/2026-11-18-kabala-fooldal.md): a képkocka-lap tartalom-hash nevű → immutable, egyéves gyorsítótár.
  // A fejlécet itt kell kimondani: a globális gyorsítótár-szabály (server/index.ts) a .webp-re „no-store”-t tesz, és az
  // express.static a már beállított Cache-Control-t nem írja felül.
  app.use("/mascot", express.static(path.resolve(distPath, "mascot"), {
    fallthrough: false,
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.removeHeader("Pragma");
      res.removeHeader("Expires");
    },
  }));
  // A `HOME_MASCOT` kapcsoló (alapból KI) bekapcsolva az index.html-be egy meta-sort tesz — a kliens így ÚJ kérés nélkül tudja.
  // Kikapcsolva `flaggedIndex` null, és a kiszolgálás a régi úton megy (az index.html bájtra változatlan).
  const flaggedIndex = homeMascotOn() ? withHomeMascotFlag(fs.readFileSync(path.resolve(distPath, "index.html"), "utf-8")) : null;
  const sendFlaggedIndex = (res: express.Response) => res.status(200).type("html").send(flaggedIndex); // a gyorsítótár-fejléc a globális szabályé (server/index.ts), mint a fájlból kiszolgált index.html-nél
  if (flaggedIndex) app.get(["/", "/index.html"], (_req, res) => { sendFlaggedIndex(res); });
  app.use(express.static(distPath));

  // CRITICAL: SPA catch-all route - serve index.html for all non-API routes
  // This ensures /admin, /preview/:id, etc. all work correctly
  app.get("*", (req, res, next) => {
    // Skip API routes and static files
    if (
      req.path.startsWith("/api/") ||
      req.path.startsWith("/dev/") ||
      req.path.startsWith("/pdfjs/") ||
      req.path.startsWith("/auth/") ||
      req.path.match(
        /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|json)$/,
      )
    ) {
      return next();
    }

    // Serve index.html for all SPA routes
    if (flaggedIndex) {
      sendFlaggedIndex(res);
      return;
    }
    const indexPath = path.resolve(distPath, "index.html");
    res.sendFile(indexPath);
  });
}
