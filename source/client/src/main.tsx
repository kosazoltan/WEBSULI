import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// #region agent log H5: CSS load timing
fetch('http://127.0.0.1:7243/ingest/9378b8f1-e7c8-473a-98f7-339360fc5519',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:3',message:'index.css imported - CSS load start',data:{bodyBg:document.body?.style?.backgroundColor,hasDarkClass:document.documentElement?.classList?.contains('dark')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H5'})}).catch(()=>{});
// #endregion

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

const rootElement = document.getElementById("root")!;

// #region agent log H1: React render start
const bodyBgBeforeRender = window.getComputedStyle(document.body).backgroundColor;
fetch('http://127.0.0.1:7243/ingest/9378b8f1-e7c8-473a-98f7-339360fc5519',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:24',message:'React render START - before createRoot',data:{bodyBgBeforeRender,hasDarkClass:document.documentElement.classList.contains('dark'),rootBg:window.getComputedStyle(rootElement).backgroundColor},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
// #endregion

createRoot(rootElement).render(<App />);

// #region agent log H1: React render after
setTimeout(() => {
  const bodyBgAfterRender = window.getComputedStyle(document.body).backgroundColor;
  fetch('http://127.0.0.1:7243/ingest/9378b8f1-e7c8-473a-98f7-339360fc5519',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'main.tsx:30',message:'React render AFTER - 100ms delay',data:{bodyBgAfterRender,hasDarkClass:document.documentElement.classList.contains('dark')},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'H1'})}).catch(()=>{});
}, 100);
// #endregion
