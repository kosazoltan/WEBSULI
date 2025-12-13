import { google } from 'googleapis';
import { storage } from './storage';
import { sanitizeText } from './utils/sanitize';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected');
  }
  return accessToken;
}

export async function getUncachableGmailClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

// Helper function to encode Subject line with UTF-8 (RFC 2047)
function encodeSubject(subject: string): string {
  // Check if subject contains non-ASCII characters (ékezetes betűk)
  if (/[^\x00-\x7F]/.test(subject)) {
    // Use RFC 2047 encoded-word format: =?UTF-8?B?base64?=
    const base64Subject = Buffer.from(subject, 'utf-8').toString('base64');
    return `=?UTF-8?B?${base64Subject}?=`;
  }
  return subject;
}

// Helper function to create email message in RFC 2822 format with proper UTF-8 encoding
function createEmailMessage(
  to: string,
  subject: string,
  htmlBody: string
): string {
  // Encode subject line for UTF-8 characters (ékezetes betűk)
  const encodedSubject = encodeSubject(subject);
  
  const emailLines = [
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    // Encode HTML body to base64 for UTF-8 compatibility
    Buffer.from(htmlBody, 'utf-8').toString('base64')
  ];
  
  const email = emailLines.join('\r\n');
  
  // Encode entire email to base64url (Gmail API requirement)
  const encodedEmail = Buffer.from(email, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  return encodedEmail;
}

export async function sendNewMaterialNotification(
  recipientEmail: string,
  recipientName: string,
  materialTitle: string,
  materialDescription: string | null,
  fileId: string
) {
  try {
    const gmail = await getUncachableGmailClient();
    
    // Always use websuli.vip for email notifications (PRODUCTION)
    const baseUrl = 'https://websuli.vip';
    
    // XSS Protection: Sanitize all user-generated content for email
    const safeRecipientName = sanitizeText(recipientName);
    const safeMaterialTitle = sanitizeText(materialTitle);
    const safeMaterialDescription = materialDescription ? sanitizeText(materialDescription) : '';
    const safeFileId = sanitizeText(fileId);
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9fafb; padding: 30px; }
            .material-title { font-size: 20px; font-weight: bold; color: #1e40af; margin: 15px 0; }
            .material-description { color: #6b7280; margin: 10px 0; }
            .footer { text-align: center; padding: 20px; color: #9ca3af; font-size: 12px; }
            .button { display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Új Tananyag Elérhető</h1>
            </div>
            <div class="content">
              <p>Kedves ${safeRecipientName}!</p>
              <p>Örömmel értesítünk, hogy egy új tananyag került feltöltésre az <strong>Anyagok Profiknak</strong> platformra.</p>
              
              <div class="material-title">${safeMaterialTitle}</div>
              ${safeMaterialDescription ? `<div class="material-description">${safeMaterialDescription}</div>` : ''}
              
              <p>Kattints az alábbi linkre a tananyag közvetlen megtekintéséhez:</p>
              <a href="${baseUrl}/preview/${safeFileId}" class="button">
                Tananyag Megtekintése
              </a>
              
              <p style="margin-top: 15px; font-size: 14px;">
                <strong>Közvetlen link:</strong> <a href="${baseUrl}/preview/${safeFileId}">${baseUrl}/preview/${safeFileId}</a><br>
                <strong>Új anyag:</strong> ${safeMaterialTitle}<br>
                ${safeMaterialDescription ? `<em style="color: #6b7280;">${safeMaterialDescription}</em>` : ''}
              </p>
            </div>
            <div class="footer">
              <p>Ez egy automatikus értesítés az Anyagok Profiknak platformról.</p>
              <p>Ha nem szeretnél több értesítést kapni, leiratkozhatsz a platformon belül.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    console.log(`[GMAIL] Email küldése: ${recipientEmail} részére (${materialTitle})`);
    
    const encodedMessage = createEmailMessage(
      recipientEmail,
      `Új Tananyag: ${safeMaterialTitle}`,
      htmlContent
    );
    
    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });

    console.log('[GMAIL] Email sikeresen elküldve:', recipientEmail, 'result:', result.data);
    
    // Log successful email to database
    await storage.createEmailLog({
      htmlFileId: fileId,
      recipientEmail,
      status: 'sent',
      resendId: result.data.id || undefined, // Gmail message ID
    });
    
    return result.data;
  } catch (error: any) {
    console.error('[GMAIL] Email küldési hiba:', error);
    
    // Log failed email to database
    try {
      await storage.createEmailLog({
        htmlFileId: fileId,
        recipientEmail,
        status: 'failed',
        error: error.message || 'Unknown error',
      });
    } catch (logError) {
      console.error('[GMAIL] Email log mentési hiba:', logError);
    }
    
    throw error;
  }
}

// Admin notification email - for material views, quiz submissions, etc.
export async function sendAdminNotification(
  subject: string,
  htmlBody: string,
  adminEmail?: string
) {
  try {
    const gmail = await getUncachableGmailClient();
    
    // Use the configured admin email or default
    const recipientEmail = adminEmail || process.env.ADMIN_EMAIL || 'kosa.zoltan.ebc@gmail.com';
    
    console.log(`[GMAIL] Admin értesítés küldése: ${recipientEmail} (${subject})`);
    
    const encodedMessage = createEmailMessage(
      recipientEmail,
      subject,
      htmlBody
    );
    
    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });

    console.log(`[GMAIL] Admin értesítés sikeresen elküldve:`, result.data);
    return result.data;
  } catch (error: any) {
    console.error('[GMAIL] Admin értesítés küldési hiba:', error);
    throw error;
  }
}
