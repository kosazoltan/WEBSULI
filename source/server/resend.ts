import { Resend } from 'resend';
import { storage } from './storage';

let connectionSettings: any;

async function getCredentials() {
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
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=resend',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  if (!connectionSettings || (!connectionSettings.settings.api_key)) {
    throw new Error('Resend not connected');
  }
  return {apiKey: connectionSettings.settings.api_key, fromEmail: connectionSettings.settings.from_email};
}

export async function getUncachableResendClient() {
  try {
    const credentials = await getCredentials();
    // Always use onboarding@resend.dev for testing as it's a verified domain
    // Ignore the connector's from_email setting if it's a gmail.com address
    let fromEmail = connectionSettings.settings.from_email || 'Anyagok Profiknak <onboarding@resend.dev>';
    
    // Override gmail addresses as they require domain verification
    if (fromEmail.includes('gmail.com')) {
      fromEmail = 'Anyagok Profiknak <onboarding@resend.dev>';
      console.log('[RESEND] Gmail cím detektálva, használjuk a Resend teszt címet helyette');
    }
    
    console.log('[RESEND] Email küldés inicializálása, from:', fromEmail);
    return {
      client: new Resend(credentials.apiKey),
      fromEmail: fromEmail
    };
  } catch (error) {
    console.error('[RESEND] Hiba a Resend client létrehozásakor:', error);
    throw error;
  }
}

export async function sendNewMaterialNotification(
  recipientEmail: string,
  recipientName: string,
  materialTitle: string,
  materialDescription: string | null,
  fileId: string
) {
  try {
    const { client, fromEmail } = await getUncachableResendClient();
    
    const baseUrl = process.env.REPLIT_DOMAINS 
      ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
      : `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
    
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
              <p>Kedves ${recipientName}!</p>
              <p>Örömmel értesítünk, hogy egy új tananyag került feltöltésre az <strong>Anyagok Profiknak</strong> platformra.</p>
              
              <div class="material-title">${materialTitle}</div>
              ${materialDescription ? `<div class="material-description">${materialDescription}</div>` : ''}
              
              <p>Kattints az alábbi linkre a tananyag közvetlen megtekintéséhez:</p>
              <a href="${baseUrl}/preview/${fileId}" class="button">
                Tananyag Megtekintése
              </a>
              
              <p style="margin-top: 15px; font-size: 14px;">
                <strong>Közvetlen link:</strong> <a href="${baseUrl}/preview/${fileId}">${baseUrl}/preview/${fileId}</a><br>
                <strong>Új anyag:</strong> ${materialTitle}<br>
                ${materialDescription ? `<em style="color: #6b7280;">${materialDescription}</em>` : ''}
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
      subject: `Új Tananyag: ${materialTitle}`,
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
    console.error('Email küldési hiba:', error);
    
    // Log failed email to database
    try {
      await storage.createEmailLog({
        htmlFileId: fileId,
        recipientEmail,
        status: 'failed',
        error: error.message || 'Unknown error',
      });
    } catch (logError) {
      console.error('Email log mentési hiba:', logError);
    }
    
    throw error;
  }
}
