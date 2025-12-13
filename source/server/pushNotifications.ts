// Web Push Notifications Server Utility
// Anyagok Profiknak Platform

import webPush from 'web-push';
import { storage } from './storage';

// Initialize VAPID configuration
const vapidPublicKey = process.env.PUBLIC_VAPID_KEY;
const vapidPrivateKey = process.env.PRIVATE_VAPID_KEY;
const vapidEmail = 'mailto:mszilva78@gmail.com';

let vapidConfigured = false;

if (vapidPublicKey && vapidPrivateKey) {
  try {
    webPush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
    vapidConfigured = true;
    console.log('[PUSH] VAPID configured successfully');
  } catch (error: any) {
    console.warn('[PUSH] VAPID configuration failed:', error.message);
    console.warn('[PUSH] Push notifications disabled - invalid VAPID keys');
  }
} else {
  console.warn('[PUSH] VAPID keys not found - push notifications disabled');
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  url?: string;
  requireInteraction?: boolean;
  actions?: Array<{
    action: string;
    title: string;
    icon?: string;
  }>;
}

/**
 * Send push notification to all subscribed users
 */
export async function sendPushToAll(payload: PushNotificationPayload): Promise<{
  sent: number;
  failed: number;
  total: number;
}> {
  if (!vapidConfigured) {
    console.warn('[PUSH] Cannot send notifications - VAPID not configured');
    return { sent: 0, failed: 0, total: 0 };
  }

  try {
    const subscriptions = await storage.getAllPushSubscriptions();
    
    if (subscriptions.length === 0) {
      console.log('[PUSH] No active subscriptions');
      return { sent: 0, failed: 0, total: 0 };
    }

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/favicon.ico',
      badge: payload.badge || '/favicon.ico',
      tag: payload.tag || 'anyagok-profiknak',
      requireInteraction: payload.requireInteraction || false,
      actions: payload.actions || [],
      data: {
        url: payload.url || '/',
        timestamp: Date.now(),
      }
    });

    let sentCount = 0;
    let failedCount = 0;

    const sendPromises = subscriptions.map(async (sub) => {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: sub.keys as any
        };

        await webPush.sendNotification(pushSubscription, notificationPayload);
        sentCount++;
        console.log(`[PUSH] Sent to ${sub.endpoint.substring(0, 50)}...`);
      } catch (error: any) {
        failedCount++;
        console.error('[PUSH] Failed to send to endpoint:', sub.endpoint.substring(0, 50), 'error:', error.message);
        
        // Remove invalid/expired subscriptions (410 = Gone, endpoint no longer valid)
        if (error.statusCode === 410 || error.statusCode === 404) {
          console.log(`[PUSH] Removing expired subscription: ${sub.endpoint.substring(0, 50)}...`);
          await storage.deletePushSubscription(sub.endpoint);
        }
      }
    });

    await Promise.all(sendPromises);

    console.log(`[PUSH] Notification sent: ${sentCount} success, ${failedCount} failed, ${subscriptions.length} total`);
    
    return {
      sent: sentCount,
      failed: failedCount,
      total: subscriptions.length
    };
  } catch (error: any) {
    console.error('[PUSH] Error sending notifications:', error);
    throw error;
  }
}

/**
 * Send push notification to specific user
 */
export async function sendPushToUser(userId: string, payload: PushNotificationPayload): Promise<{
  sent: number;
  failed: number;
  total: number;
}> {
  if (!vapidConfigured) {
    console.warn('[PUSH] Cannot send notifications - VAPID not configured');
    return { sent: 0, failed: 0, total: 0 };
  }

  try {
    const subscriptions = await storage.getUserPushSubscriptions(userId);
    
    if (subscriptions.length === 0) {
      console.log(`[PUSH] No subscriptions for user ${userId}`);
      return { sent: 0, failed: 0, total: 0 };
    }

    const notificationPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/favicon.ico',
      badge: payload.badge || '/favicon.ico',
      tag: payload.tag || 'anyagok-profiknak',
      requireInteraction: payload.requireInteraction || false,
      actions: payload.actions || [],
      data: {
        url: payload.url || '/',
        timestamp: Date.now(),
      }
    });

    let sentCount = 0;
    let failedCount = 0;

    for (const sub of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: sub.keys as any
        };

        await webPush.sendNotification(pushSubscription, notificationPayload);
        sentCount++;
      } catch (error: any) {
        failedCount++;
        console.error('[PUSH] Failed to send notification:', error);
        
        if (error.statusCode === 410 || error.statusCode === 404) {
          await storage.deletePushSubscription(sub.endpoint);
        }
      }
    }

    return {
      sent: sentCount,
      failed: failedCount,
      total: subscriptions.length
    };
  } catch (error: any) {
    console.error('[PUSH] Error sending user notification:', error);
    throw error;
  }
}

/**
 * Send notification about new material upload
 */
export async function sendNewMaterialNotification(materialTitle: string, materialId: string): Promise<void> {
  try {
    // Use CUSTOM_DOMAIN for production (websuli.vip)
    const baseUrl = process.env.CUSTOM_DOMAIN 
      ? `https://${process.env.CUSTOM_DOMAIN}`
      : (process.env.REPL_ID 
        ? `https://${process.env.REPL_ID}.replit.dev`
        : 'https://websuli.vip');
    
    const materialUrl = `${baseUrl}/preview/${materialId}`;
    
    await sendPushToAll({
      title: '📚 Új tananyag érkezett!',
      body: materialTitle,
      tag: `new-material-${materialId}`,
      url: materialUrl,
      requireInteraction: false,
    });
    
    console.log(`[PUSH] New material notification sent for: ${materialTitle}`);
  } catch (error: any) {
    console.error('[PUSH] Error sending new material notification:', error);
  }
}

/**
 * Send notification to admin about material view
 */
export async function sendMaterialViewNotification(
  adminUserId: string, 
  userName: string, 
  materialTitle: string,
  materialId: string
): Promise<void> {
  try {
    // Use CUSTOM_DOMAIN for production (websuli.vip)
    const baseUrl = process.env.CUSTOM_DOMAIN 
      ? `https://${process.env.CUSTOM_DOMAIN}`
      : (process.env.REPL_ID 
        ? `https://${process.env.REPL_ID}.replit.dev`
        : 'https://websuli.vip');
    
    const materialUrl = `${baseUrl}/preview/${materialId}`;
    
    await sendPushToUser(adminUserId, {
      title: '👀 Tananyag megtekintve',
      body: `${userName} megnyitotta: ${materialTitle}`,
      tag: `material-view-${materialId}`,
      url: materialUrl,
      requireInteraction: false,
    });
    
    console.log(`[PUSH] Material view notification sent to admin for: ${materialTitle}`);
  } catch (error: any) {
    console.error('[PUSH] Error sending material view notification:', error);
  }
}
