import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ErrorReporter } from "./components/ErrorReporter";
import { captureLearnerTokenFromUrl } from "./lib/learnerProfile";

// Register Service Worker for PWA functionality + Push Notifications
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' })
      .then((registration) => {
        // Check for updates periodically
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000); // Every hour
      })
      .catch(() => {
        // Silent fail - service worker registration is optional
      });
  });
}

// Tanulói profil (docs/specs/2026-10-18-tanuloi-profil.md): a személyes link tokenje a router előtt kerül el a címsorból.
captureLearnerTokenFromUrl();

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <ErrorBoundary>
    <ErrorReporter />
    <App />
  </ErrorBoundary>
);
