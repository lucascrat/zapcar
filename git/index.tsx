
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Remove Splash Screen após o carregamento
const splashScreen = document.getElementById('splash-screen');
if (splashScreen) {
  // Pequeno delay para garantir que o App renderizou visualmente
  setTimeout(() => {
    splashScreen.style.opacity = '0';
    setTimeout(() => {
      splashScreen.remove();
    }, 500); // Espera a transição CSS terminar (0.5s)
  }, 1000);
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (registration) => {
        console.log('SW registered:', registration);
      },
      (err) => {
        console.log('SW registration failed:', err);
      }
    );
  });
}
