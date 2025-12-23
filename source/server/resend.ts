import { Resend } from 'resend';
import { storage } from './storage';
import { sanitizeText } from './utils/sanitize';

let resendClient: Resend | null = null;
let fromEmail: string = '';

function getResendClient() {
  if (resendClient) {
    return { client: resendClient, fromEmail };
  }

  const apiKey = process.env.RESEND_API_KEY;
  
  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }

  resendClient = new Resend(apiKey);
  
  // Use configured from email or default to Resend test email
  fromEmail = process.env.RESEND_FROM_EMAIL || 'Anyagok Profiknak <onboarding@resend.dev>';
  
  console.log('[RESEND] Client initialized, from:', fromEmail);
  
  return { client: resendClient, fromEmail };
}

export async function sendNewMaterialNotification(
  recipientEmail: string,
  recipientName: string,
  materialTitle: string,
  materialDescription: string | null,
  fileId: string
) {
  try {
    const { client, fromEmail } = getResendClient();
    
    // Always use websuli.vip for production
    const baseUrl = process.env.CUSTOM_DOMAIN 
      ? `https://${process.env.CUSTOM_DOMAIN}`
      : 'https://websuli.vip';
    
    // XSS Protection: Sanitize all user-generated content
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

    console.log(`[RESEND] Email küldése: ${recipientEmail} részére (${materialTitle})`);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject: `Új Tananyag: ${safeMaterialTitle}`,
      html: htmlContent
    });

    // Check if the result contains an error
    if (result && 'error' in result && result.error) {
      console.error('[RESEND] Email küldési hiba:', recipientEmail, 'error:', result.error);
      
      // Log failed email to database
      await storage.createEmailLog({
        htmlFileId: fileId,
        recipientEmail,
        status: 'failed',
        error: `Resend error: ${result.error.message || 'Unknown error'}`,
      });
      
      throw new Error(`Resend error: ${result.error.message || 'Unknown error'}`);
    }

    console.log('[RESEND] Email sikeresen elküldve:', recipientEmail, 'result:', result);
    
    // Log successful email to database
    await storage.createEmailLog({
      htmlFileId: fileId,
      recipientEmail,
      status: 'sent',
      resendId: result.data?.id,
    });
    
    return result;
  } catch (error: any) {
    console.error('[RESEND] Email küldési hiba:', error);
    
    // Log failed email to database
    try {
      await storage.createEmailLog({
        htmlFileId: fileId,
        recipientEmail,
        status: 'failed',
        error: error.message || 'Unknown error',
      });
    } catch (logError) {
      console.error('[RESEND] Email log mentési hiba:', logError);
    }
    
    throw error;
  }
}

// Admin notification email
export async function sendAdminNotification(
  subject: string,
  htmlBody: string,
  adminEmail?: string
) {
  try {
    const { client, fromEmail } = getResendClient();
    
    const recipientEmail = adminEmail || process.env.ADMIN_EMAIL || 'admin@websuli.org';
    
    console.log(`[RESEND] Admin értesítés küldése: ${recipientEmail} (${subject})`);
    
    const result = await client.emails.send({
      from: fromEmail,
      to: recipientEmail,
      subject: subject,
      html: htmlBody
    });

    if (result && 'error' in result && result.error) {
      throw new Error(`Resend error: ${result.error.message || 'Unknown error'}`);
    }

    console.log(`[RESEND] Admin értesítés sikeresen elküldve:`, result);
    return result;
  } catch (error: any) {
    console.error('[RESEND] Admin értesítés küldési hiba:', error);
    throw error;
  }
}
