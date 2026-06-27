import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safely suppress benign development-only WebSocket errors caused by the iframe proxy
if ((import.meta as any).env?.DEV) {
  const isBenignViteError = (message: string) => {
    if (!message) return false;
    const lower = message.toLowerCase();
    return (
      lower.includes('websocket') ||
      lower.includes('vite') ||
      lower.includes('hmr') ||
      lower.includes('closed without opened')
    );
  };

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message || event.reason?.stack || String(event.reason || '');
    if (isBenignViteError(reason)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  window.addEventListener('error', (event) => {
    const msg = event.message || event.error?.message || event.error?.stack || '';
    if (isBenignViteError(msg)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
