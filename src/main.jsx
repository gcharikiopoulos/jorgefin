import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/commissioner';
import '@fontsource-variable/jetbrains-mono';
import { App } from './App.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
    .then((reg) => document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); }))
    .catch((err) => console.error('Service worker registration failed', err));
  // A new deploy's worker took over a page that was already open: reload once onto it.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; window.location.reload(); }
  });
}
