/**
 * JM7a (docs/specs/2026-11-16-jatekok-jatekelmeny.md 10.4, G11 / D12): a munkamenet és MINDEN útvonal felcsatolása
 * egyetlen helyen. A szerver (index.ts) és a jogosultsági őr-tesztek (admin-route-guard, admin-authz-matrix) ugyanezt
 * hívják — így a tesztben bejárt router-verem pontosan az élesben futó, és új végpont nem maradhat ki a mátrixból.
 */
import type { Express } from "express";
import type { Server } from "http";
import { setupAuth } from "./auth";
import { designAssetsRouter } from "./design-assets";
import { sourceImagesRouter } from "./source-images";
import errorReportRouter from "./routes/error-report";
import clientErrorRouter from "./routes/client-error";
import staticAuditRouter from "./routes/static-audit";
import { registerRoutes } from "./routes";

export async function mountAppRoutes(app: Express): Promise<Server> {
  // Setup Authentication (Passport, Sessions)
  setupAuth(app);

  // Universal Error Logger routes
  app.use("/api/error-report", errorReportRouter);
  // Böngészős hibák: titok nélkül, eredet + korlátok őrzik (kanban #127)
  app.use("/api/client-error", clientErrorRouter);
  app.use("/api/static-audit", staticAuditRouter);
  app.use("/api/design-assets", designAssetsRouter);
  // D1H-1: a forrás kivágott képei (docs/specs/2026-11-25-d1h-kivagott-kep.md).
  app.use("/api/source-images", sourceImagesRouter);

  return registerRoutes(app);
}
