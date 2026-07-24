
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProviders } from './src/contexts/AppProviders';
import { ErrorBoundary } from './src/components/shared/ErrorBoundary';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MAPBOX_TOKEN } from './services/mapboxService';

mapboxgl.accessToken = MAPBOX_TOKEN;

// CSS imports - Vite will inject these into the page as style tags
import './src/index.css';
import './src/mobile-fixes.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppProviders>
        <App />
      </AppProviders>
    </ErrorBoundary>
  </React.StrictMode>
);

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
