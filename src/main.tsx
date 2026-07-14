import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import ThumbnailGenerator from './components/tools/ThumbnailGenerator';
import { syncModelLabFlagFromUrl } from './lib/modelLab';
import './index.css';

// Service worker updates. The app is an installable PWA, so a service worker
// serves the last cached build. Registering through virtual:pwa-register (in
// autoUpdate mode) makes the page reload itself the moment a new deploy's
// worker takes control — a plain refresh is enough to get the new version,
// no hard refresh or clearing site data. We also re-check for updates when
// the tab regains focus and hourly, so long-lived tabs pick up deploys too.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const check = () => registration.update().catch(() => {});
    setInterval(check, 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

// Apply the ?modellab= override (archived Model lab escape hatch) before render.
syncModelLabFlagFromUrl();

// Check for ?thumbnails query param to show generator
const params = new URLSearchParams(window.location.search);
const showThumbnails = params.has('thumbnails');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {showThumbnails ? <ThumbnailGenerator /> : <App />}
  </React.StrictMode>
);
