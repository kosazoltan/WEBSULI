import FingerprintJS from "@fingerprintjs/fingerprintjs";
import { logger } from "./logger";

// Singleton fingerprint cache to avoid multiple FingerprintJS loads
let fingerprintCache: string | null = null;
let fingerprintPromise: Promise<string> | null = null;

export async function getFingerprint(): Promise<string> {
  // Return cached fingerprint if available
  if (fingerprintCache) {
    return fingerprintCache;
  }

  // If already loading, wait for that promise
  if (fingerprintPromise) {
    return fingerprintPromise;
  }

  // Load fingerprint
  fingerprintPromise = (async () => {
    try {
      const fp = await FingerprintJS.load();
      const result = await fp.get();
      fingerprintCache = result.visitorId;
      return fingerprintCache;
    } catch (error) {
      logger.error("Failed to get fingerprint:", error);
      fingerprintCache = "anonymous";
      return fingerprintCache;
    } finally {
      fingerprintPromise = null;
    }
  })();

  return fingerprintPromise;
}

