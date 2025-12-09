import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Clear browser cache on every page load
// This ensures users always get the latest version of the app
if ('caches' in window) {
  caches.keys().then((cacheNames) => {
    cacheNames.forEach((cacheName) => {
      caches.delete(cacheName);
    });
  });
}

// Register Service Worker for PWA functionality + Push Notifications
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Clean up legacy /sw.js service worker registration if it exists
    navigator.serviceWorker.getRegistration('/sw.js').then((registration) => {
      if (registration) {
        console.log('[PWA] Unregistering legacy /sw.js service worker');
        registration.unregister();
      }
    });

    // Register the unified service worker
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
      .then((registration) => {
        console.log('[PWA] Service Worker registered:', registration.scope);
      })
      .catch((error) => {
        console.error('[PWA] Service Worker registration failed:', error);
      });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
