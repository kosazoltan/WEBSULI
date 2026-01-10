// Service Worker for Web Push Notifications + PWA
// Anyagok Profiknak Platform
// Version: 3.3.0 - Never cache CSS/JS assets to prevent stale styles - Dark mode fix

const CACHE_VERSION = '3.3.0'; // Fixed version - change this when deploying new version
const CACHE_NAME = `anyagok-profiknak-v${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

// Minimal assets to cache
const STATIC_ASSETS = [
  '/offline.html',
  '/manifest.json',
  '/favicon.svg',
  '/favicon.png'
];

self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installing - clearing ALL caches...');
  event.waitUntil(
    // First, delete ALL existing caches
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            console.log('[SW] Deleting cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      })
      .then(() => {
        // Then create new cache with minimal assets
        return caches.open(CACHE_NAME);
      })
      .then((cache) => {
        console.log('[SW] Caching minimal static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activating - clearing old caches...');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Delete ANY cache that isn't the current version
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        // Claim all clients immediately (but don't force reload)
        return self.clients.claim();
      })
  );
});

// Fetch event - network-first strategy with offline fallback
// IMPORTANT: Explicit passthrough for non-GET requests (fixes mobile Chrome POST blocking bug)
self.addEventListener('fetch', (event) => {
  // CRITICAL FIX: Explicit passthrough for non-GET requests (POST, PUT, DELETE, etc.)
  // Mobile Chrome sometimes blocks requests when service worker returns early
  if (event.request.method !== 'GET') {
    event.respondWith(fetch(event.request)); // <-- EXPLICIT PASSTHROUGH
    return;
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!event.request.url.startsWith('http')) {
    return;
  }

  // CRITICAL: Skip ALL /api/* requests (no caching for API)
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request)); // <-- EXPLICIT PASSTHROUGH for API
    return;
  }

  // CRITICAL: Never cache CSS/JS files - they have hashes and should always be fresh
  // This prevents old CSS from being served after updates
  if (url.pathname.startsWith('/assets/') && (url.pathname.endsWith('.css') || url.pathname.endsWith('.js'))) {
    event.respondWith(fetch(event.request)); // <-- NO CACHING for CSS/JS assets
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone the response before caching
        const responseToCache = response.clone();
        
        // Cache successful responses (but NOT CSS/JS assets - handled above)
        if (response.status === 200) {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        
        return response;
      })
      .catch(() => {
        // Network failed, try cache
        return caches.match(event.request)
          .then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            
            // No cache hit, return offline page for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match(OFFLINE_URL);
            }
            
            // For other requests, return a simple offline response
            return new Response('Offline - Nincs internetkapcsolat', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'text/plain'
              })
            });
          });
      })
  );
});

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push notification received:', event);
  
  let notificationData = {
    title: 'Új értesítés',
    body: 'Anyagok Profiknak',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: {
      url: '/'
    }
  };
  
  if (event.data) {
    try {
      const payload = event.data.json();
      notificationData = {
        title: payload.title || notificationData.title,
        body: payload.body || notificationData.body,
        icon: payload.icon || notificationData.icon,
        badge: payload.badge || notificationData.badge,
        data: payload.data || notificationData.data,
        tag: payload.tag || 'anyagok-profiknak',
        requireInteraction: payload.requireInteraction || false,
        actions: payload.actions || []
      };
    } catch (error) {
      console.error('[SW] Error parsing push data:', error);
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      tag: notificationData.tag,
      data: notificationData.data,
      requireInteraction: notificationData.requireInteraction,
      actions: notificationData.actions,
      vibrate: [200, 100, 200],
      timestamp: Date.now()
    })
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event);
  
  event.notification.close();
  
  const urlToOpen = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Check if there's already a window open with the target URL
        for (let client of windowClients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        // Open new window if no matching window found
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Handle subscription changes (when subscription expires or is rotated)
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[SW] Push subscription changed - attempting to resubscribe');
  
  event.waitUntil(
    (async () => {
      try {
        // Try to get current subscription
        let subscription = await self.registration.pushManager.getSubscription();
        
        if (!subscription) {
          // Subscription expired - need to resubscribe
          // First, get the VAPID public key from server
          const keyResponse = await fetch('/api/push/vapid-public-key');
          if (!keyResponse.ok) {
            console.error('[SW] Failed to fetch VAPID public key');
            return;
          }
          
          const { publicKey } = await keyResponse.json();
          if (!publicKey) {
            console.error('[SW] No VAPID public key available');
            return;
          }
          
          // Convert VAPID key to Uint8Array
          const padding = '='.repeat((4 - publicKey.length % 4) % 4);
          const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
          const rawData = atob(base64);
          const applicationServerKey = new Uint8Array(rawData.length);
          for (let i = 0; i < rawData.length; ++i) {
            applicationServerKey[i] = rawData.charCodeAt(i);
          }
          
          // Resubscribe with the VAPID key
          subscription = await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
          });
          
          console.log('[SW] Successfully resubscribed with new endpoint');
        }
        
        // Send (possibly new) subscription to server
        const response = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription)
        });
        
        if (!response.ok) {
          console.error('[SW] Failed to update subscription on server');
          // If server update fails, unsubscribe locally to trigger manual resubscription
          await subscription.unsubscribe();
        } else {
          console.log('[SW] Subscription successfully updated on server');
        }
      } catch (error) {
        console.error('[SW] Error handling subscription change:', error);
        // Notify all clients that resubscription failed so they can show UI to retry
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({
            type: 'PUSH_SUBSCRIPTION_FAILED',
            error: error.message
          });
        });
      }
    })()
  );
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
