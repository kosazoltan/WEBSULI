import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Register Service Worker for PWA functionality + Push Notifications
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Register Service Worker (without cache-busting to prevent infinite reload loop)
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
      .then((registration) => {
        console.log('[PWA] Service Worker registered:', registration.scope);
        
        // Only reload if there's a waiting service worker (not on every registration)
        // This prevents infinite reload loops
        if (registration.waiting) {
          console.log('[PWA] Service Worker waiting - user should reload manually');
          return;
        }
        
        // Check for updates periodically, but don't auto-reload
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              // Only log, don't auto-reload to prevent infinite loops
              if (newWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  console.log('[PWA] New Service Worker installed - reload manually to activate');
                } else {
                  console.log('[PWA] Service Worker installed for the first time');
                }
              }
            });
          }
        });
        
        // Check for updates every hour (not on every page load)
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);
      })
      .catch((error) => {
        console.error('[PWA] Service Worker registration failed:', error);
      });
  });
}

createRoot(document.getElementById("root")!).render(<App />);
