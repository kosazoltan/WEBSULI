// Web Push Notifications Client Library
// Anyagok Profiknak Platform

const isDev = import.meta.env.DEV;
const log = (...args: unknown[]) => isDev && console.log('[Push]', ...args);
const logError = (...args: unknown[]) => console.error('[Push]', ...args);

/**
 * Convert VAPID public key from base64 to Uint8Array for browser API
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Check if push notifications are supported in this browser
 */
export function isPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'showNotification' in ServiceWorkerRegistration.prototype &&
    Notification.permission !== 'denied'
  );
}

/**
 * Get current notification permission status
 */
export function getNotificationPermission(): NotificationPermission {
  return Notification.permission;
}

/**
 * Register service worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service Workers are not supported in this browser');
  }

  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/'
    });
    
    log('Service Worker registered:', registration);
    
    // Listen for FORCE_RELOAD messages from service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'FORCE_RELOAD') {
          log('Received FORCE_RELOAD from service worker - clearing cache and reloading');
          
          // Clear browser cache and reload
          if ('caches' in window) {
            caches.keys().then(names => {
              names.forEach(name => caches.delete(name));
            });
          }
          
          // Hard reload bypassing cache
          window.location.reload();
        }
      });
    }
    
    // Wait for the service worker to be ready
    await navigator.serviceWorker.ready;
    
    return registration;
  } catch (error) {
    logError('Service Worker registration failed:', error);
    throw error;
  }
}

/**
 * Request notification permission from user
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    throw new Error('Notifications are not supported in this browser');
  }

  const permission = await Notification.requestPermission();
  log('Notification permission:', permission);
  
  return permission;
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscription> {
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported');
  }

  // Request permission if not already granted
  if (Notification.permission !== 'granted') {
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') {
      throw new Error('Notification permission denied');
    }
  }

  // Register service worker
  const registration = await registerServiceWorker();

  // Check for existing subscription
  let subscription = await registration.pushManager.getSubscription();
  
  if (subscription) {
    log('Already subscribed:', subscription);
    return subscription;
  }

  // Subscribe to push notifications
  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
  
  subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey
  });

  log('New subscription:', subscription);
  
  return subscription;
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (subscription) {
      const successful = await subscription.unsubscribe();
      log('Unsubscribed:', successful);
      return successful;
    }
    
    return false;
  } catch (error) {
    logError('Error unsubscribing:', error);
    return false;
  }
}

/**
 * Get current push subscription
 */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return subscription;
  } catch (error) {
    logError('Error getting subscription:', error);
    return null;
  }
}

/**
 * Send subscription to server
 */
export async function sendSubscriptionToServer(subscription: PushSubscription): Promise<void> {
  const response = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify(subscription)
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to save subscription');
  }
}

/**
 * Remove subscription from server
 */
export async function removeSubscriptionFromServer(subscription: PushSubscription): Promise<void> {
  const response = await fetch('/api/push/unsubscribe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include',
    body: JSON.stringify({ endpoint: subscription.endpoint })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to remove subscription');
  }
}

/**
 * Complete push notification setup (register + subscribe + send to server)
 */
export async function setupPushNotifications(vapidPublicKey: string): Promise<PushSubscription> {
  const subscription = await subscribeToPush(vapidPublicKey);
  await sendSubscriptionToServer(subscription);
  return subscription;
}

/**
 * Complete push notification teardown (unsubscribe + remove from server)
 */
export async function teardownPushNotifications(): Promise<void> {
  const subscription = await getCurrentSubscription();
  
  if (subscription) {
    await removeSubscriptionFromServer(subscription);
    await unsubscribeFromPush();
  }
}
