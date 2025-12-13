import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Force clear ALL caches and cookies on page load
// This ensures users always get the latest version
(async () => {
  // 1. Clear Service Worker caches
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
    console.log('[Cache] All caches cleared');
  }

  // 2. Unregister ALL service workers and force reload
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
      console.log('[SW] Unregistered:', registration.scope);
    }
  }

  // 3. Clear sessionStorage
  try {
    sessionStorage.clear();
    console.log('[Storage] sessionStorage cleared');
  } catch (e) {
    console.warn('[Storage] Could not clear sessionStorage');
  }
})();

// Register Service Worker for PWA functionality + Push Notifications
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Unregister all existing service workers first
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister();
      });
      
      // Wait a bit, then register new one with cache busting
      setTimeout(() => {
        navigator.serviceWorker.register('/service-worker.js?v=3.2.0-' + Date.now(), { scope: '/' })
          .then((registration) => {
            console.log('[PWA] Service Worker registered:', registration.scope);
            
            // Force update check
            registration.update();
            
            // Force reload if update available
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // New service worker available, reload page
                    window.location.reload();
                  }
                });
              }
            });
          })
          .catch((error) => {
            console.error('[PWA] Service Worker registration failed:', error);
          });
      }, 100);
    });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
