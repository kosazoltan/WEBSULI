// DEPRECATED: Gmail API via Replit Connectors was removed
// Use resend.ts for email notifications instead
// This file is kept for reference only and should not be used

import { storage } from './storage';
import { sanitizeText } from './utils/sanitize';

// All email functionality has been moved to resend.ts
// which uses the Resend API for sending emails

export async function sendNewMaterialNotification(
  recipientEmail: string,
  recipientName: string,
  materialTitle: string,
  materialDescription: string | null,
  fileId: string
) {
  console.warn('[GMAIL] DEPRECATED: This function is no longer available. Use resend.ts instead.');
  throw new Error('Gmail API is not available. Use Resend API instead. See resend.ts');
}

export async function sendAdminNotification(
  subject: string,
  htmlBody: string,
  adminEmail?: string
) {
  console.warn('[GMAIL] DEPRECATED: This function is no longer available. Use resend.ts instead.');
  throw new Error('Gmail API is not available. Use Resend API instead. See resend.ts');
}
