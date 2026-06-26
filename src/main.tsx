import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safely suppress benign development-only WebSocket errors caused by the iframe proxy
if ((import.meta as any).env?.DEV) {
  const isBenignViteError = (message: string) => {
    return (
      message.includes('WebSocket') ||
      message.includes('websocket') ||
      message.includes('vite') ||
      message.includes('HMR')
    );
  };

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason?.message || String(event.reason || '');
    if (isBenignViteError(reason)) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  window.addEventListener('error', (event) => {
    const msg = event.message || '';
    if (isBenignViteError(msg)) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
