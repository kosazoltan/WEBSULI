/**
 * Universal Error Logger — error-mailer.ts
 * Websuli Réteg 1+2 implementáció
 */
import crypto from "crypto";
import nodemailer from "nodemailer";
import { db } from "../db";
import { errorLogs } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import {
  escapeHtml,
  sanitizeForEmail,
  generateFingerprint,
  determineSeverity,
  buildErrorEmailHtml,
} from "./error-sanitize";

// Re-exported so existing import sites (and tests) can keep using error-mailer.
export { escapeHtml, sanitizeForEmail, generateFingerprint, determineSeverity };

// ============================================================
// CONSTANTS
// ============================================================
const APP_NAME = "Websuli";
const REPO_PATH = "D:\\repo\\WEBSULI";
const GITHUB_REPO = "kosazoltan/WEBSULI";
const FORBIDDEN_REPOS: string[] = [];
const HMAC_SECRET = process.env.ERRORLOG_HMAC_SECRET;
const SENDER_EMAIL = process.env.ERROR_REPORT_SENDER;
const RECIPIENT_EMAIL = process.env.ERROR_REPORT_RECIPIENT;

// ============================================================
// TYPES
// ============================================================
export interface ErrorReportPayload {
  errorType: string;
  message: string;
  stack?: string;
  url?: string;
  requestId?: string;
  requestMethod?: string;
  requestBody?: string;
  userId?: string;
  userEmail?: string;
  browser?: string;
  breadcrumbs?: unknown[];
  commitSha?: string;
  environment?: string;
}

// ============================================================
// signEmailPayload — HMAC-SHA256
// ============================================================
export function signEmailPayload(payload: string): string {
  if (!HMAC_SECRET) {
    throw new Error("ERRORLOG_HMAC_SECRET is not configured");
  }

  return crypto
    .createHmac("sha256", HMAC_SECRET)
    .update(payload)
    .digest("hex");
}

// ============================================================
// sendErrorReport — UPSERT to DB + Gmail notification
// ============================================================
export async function sendErrorReport(payload: ErrorReportPayload): Promise<void> {
  // Guard: forbidden repos should never call this
  if (FORBIDDEN_REPOS.some((r) => REPO_PATH.startsWith(r))) {
    console.warn("[ErrorLogger] Forbidden repo, skipping.");
    return;
  }

  const fingerprint = generateFingerprint(payload.errorType, payload.message);
  const severity = determineSeverity(payload.errorType, payload.message);
  const environment = payload.environment ?? process.env.NODE_ENV ?? "production";
  const commitSha =
    payload.commitSha ?? process.env.GIT_COMMIT_SHA ?? undefined;

  try {
    // UPSERT: insert or increment occurrence count
    const existing = await db
      .select()
      .from(errorLogs)
      .where(eq(errorLogs.fingerprint, fingerprint))
      .limit(1);

    let emailAlreadySent = false;

    if (existing.length > 0) {
      // Update occurrence count + lastSeenAt
      await db
        .update(errorLogs)
        .set({
          occurrenceCount: sql`${errorLogs.occurrenceCount} + 1`,
          lastSeenAt: new Date(),
          stack: payload.stack ?? existing[0].stack,
          url: payload.url ?? existing[0].url,
          requestId: payload.requestId ?? existing[0].requestId,
        })
        .where(eq(errorLogs.fingerprint, fingerprint));
      emailAlreadySent = existing[0].emailSent;
    } else {
      // Insert new error log
      await db.insert(errorLogs).values({
        fingerprint,
        errorType: payload.errorType,
        severity,
        message: payload.message.substring(0, 5000),
        stack: payload.stack ? payload.stack.substring(0, 10000) : undefined,
        commitSha,
        appName: APP_NAME,
        repoPath: REPO_PATH,
        environment,
        breadcrumbs: payload.breadcrumbs as object | undefined,
        url: payload.url?.substring(0, 500),
        requestId: payload.requestId?.substring(0, 100),
        requestMethod: payload.requestMethod?.substring(0, 10),
        requestBody: payload.requestBody
          ? sanitizeForEmail(payload.requestBody).substring(0, 2000)
          : undefined,
        userId: payload.userId?.substring(0, 100),
        userEmail: payload.userEmail?.substring(0, 200),
        browser: payload.browser?.substring(0, 300),
      });
    }

    // Only send email for new errors or CRITICAL re-occurrences
    if (
      !emailAlreadySent ||
      (severity === "CRITICAL" && existing.length > 0 && existing[0].occurrenceCount % 10 === 0)
    ) {
      const sent = await _sendEmail(fingerprint, severity, payload, commitSha);

      if (sent) {
        await db
          .update(errorLogs)
          .set({ emailSent: true, emailSentAt: new Date() })
          .where(eq(errorLogs.fingerprint, fingerprint));
      }
    }
  } catch (dbErr) {
    // Never throw from error logger — just log
    console.error("[ErrorLogger] DB error:", dbErr);
  }
}

// ============================================================
// Internal: send Gmail notification
// ============================================================
async function _sendEmail(
  fingerprint: string,
  severity: string,
  payload: ErrorReportPayload,
  commitSha?: string
): Promise<boolean> {
  // AUDIT 2026-09-01: boolean visszatérés — a hívó eddig sikertelen küldés után is
  // emailSent=true-t írt, így a hibáról soha többé nem ment értesítés.
  const password = process.env.JUNIOR_EMAIL_PASSWORD;
  if (!password) {
    console.warn("[ErrorLogger] JUNIOR_EMAIL_PASSWORD not set, skipping email.");
    return false;
  }
  if (!HMAC_SECRET) {
    console.warn("[ErrorLogger] ERRORLOG_HMAC_SECRET not set, skipping email.");
    return false;
  }
  if (!SENDER_EMAIL || !RECIPIENT_EMAIL) {
    console.warn("[ErrorLogger] ERROR_REPORT_SENDER or ERROR_REPORT_RECIPIENT not set, skipping email.");
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: SENDER_EMAIL,
      pass: password,
    },
  });

  const emailPayload = JSON.stringify({
    fingerprint,
    appName: APP_NAME,
    severity,
    errorType: payload.errorType,
    message: payload.message,
    timestamp: new Date().toISOString(),
  });
  const signature = signEmailPayload(emailPayload);

  const subject = `[${severity}] ${APP_NAME} — ${payload.errorType}: ${payload.message.substring(0, 80)}`;

  const htmlBody = buildErrorEmailHtml({
    appName: APP_NAME,
    repoPath: REPO_PATH,
    githubRepo: GITHUB_REPO,
    severity,
    fingerprint,
    signature,
    timestamp: new Date().toISOString(),
    errorType: payload.errorType,
    message: payload.message,
    commitSha,
    environment: payload.environment ?? process.env.NODE_ENV,
    url: payload.url,
    requestId: payload.requestId,
    user: payload.userEmail ?? payload.userId,
    browser: payload.browser,
    stack: payload.stack,
    breadcrumbs: payload.breadcrumbs,
  });

  try {
    await transporter.sendMail({
      from: SENDER_EMAIL,
      to: RECIPIENT_EMAIL,
      subject,
      html: htmlBody,
    });
    console.warn(`[ErrorLogger] Email sent for fingerprint ${fingerprint}`);
    return true;
  } catch (emailErr) {
    console.error("[ErrorLogger] Email send failed:", emailErr);
    return false;
  }
}
